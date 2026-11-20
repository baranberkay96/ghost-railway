#!/usr/bin/env node
// Start Ghost on Railway (written for this template, MIT).
//
// 1. Deploy-form values never fail the deploy (STANDARD 8.29): bad values fall
//    back to safe defaults with a warning; an unusable owner password fails
//    closed (random password nobody knows, explained in the log).
// 2. Wait for MySQL (services start in parallel on Railway).
// 3. Optional GHOST_RESET_OWNER_PASSWORD=true: set the owner's password again.
// 4. Start Ghost through the image's entrypoint (chown + seed content, drop to
//    the node user) and forward SIGTERM to it.
// 5. Fresh database: complete Ghost's setup (owner, site title) through the
//    local Admin API as soon as Ghost answers. The Caddy service also refuses
//    the setup call from the internet, so the setup page cannot be claimed.
// 6. Serve Railway's healthcheck on PORT: 200 only when Ghost answers and is set up.
'use strict';

const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');

const GHOST_INSTALL = process.env.GHOST_INSTALL || '/var/lib/ghost';
const CURRENT = path.join(GHOST_INSTALL, 'current');
const SETUP_PATH = '/ghost/api/admin/authentication/setup/';

const log = (msg) => console.log(`[railway-start] ${msg}`);
const warn = (msg) => console.error(`[railway-start] WARNING: ${msg}`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function port(name, value, fallback) {
  const n = Number(value);
  if (Number.isInteger(n) && n >= 1 && n <= 65535 && String(value).trim() !== '') return n;
  if (value !== undefined && value !== '') warn(`${name}='${value}' is not a port number; using ${fallback}`);
  return fallback;
}

// --- settings ------------------------------------------------------------------
const ghostPort = port('server__port', process.env.server__port, 2368);
let healthPort = port('PORT', process.env.PORT, 2369);
if (healthPort === ghostPort) {
  warn(`PORT equals server__port (${ghostPort}); the healthcheck uses ${ghostPort + 1}`);
  healthPort = ghostPort + 1;
}
process.env.server__port = String(ghostPort);
if (!process.env.server__host) process.env.server__host = '::';

let siteUrl;
try {
  const parsed = new URL(process.env.url || '');
  if (!/^https?:$/.test(parsed.protocol) || !parsed.hostname || parsed.hostname === 'undefined') throw new Error('bad url');
  siteUrl = parsed;
} catch {
  warn(`url='${process.env.url || ''}' is not a usable http(s) URL; using http://localhost:${ghostPort}. ` +
    'Set url on the Ghost service to your public address (https://{your-domain}).');
  siteUrl = new URL(`http://localhost:${ghostPort}`);
}
process.env.url = siteUrl.toString().replace(/\/$/, '');

const EMAIL_RE = /^[^\s@"'<>()\[\],;:\\]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;
let ownerEmail = (process.env.GHOST_ADMIN_EMAIL || '').trim();
if (!EMAIL_RE.test(ownerEmail) || ownerEmail.length > 191) {
  warn(`GHOST_ADMIN_EMAIL='${ownerEmail}' is not a valid e-mail address; using admin@example.com`);
  ownerEmail = 'admin@example.com';
}
let ownerName = (process.env.GHOST_ADMIN_NAME || '').trim();
if (!ownerName || ownerName.length > 191) {
  if (ownerName) warn('GHOST_ADMIN_NAME is longer than 191 characters; using "Admin"');
  ownerName = 'Admin';
}
let siteTitle = (process.env.GHOST_SITE_TITLE || '').trim();
if (!siteTitle || siteTitle.length > 150) {
  if (siteTitle) warn('GHOST_SITE_TITLE is longer than 150 characters; using "My Ghost Site"');
  siteTitle = 'My Ghost Site';
}

// Ghost's own rules (ghost/core/server/lib/validate-password.ts, v6.78.0).
function passwordProblem(pw) {
  if (pw.length < 10) return 'shorter than 10 characters';
  if (pw.length > 256) return 'longer than 256 characters';
  const lower = pw.toLowerCase();
  if (lower === ownerEmail.toLowerCase() || lower === siteTitle.toLowerCase()) return 'equal to the e-mail or site title';
  if (lower === siteUrl.host.toLowerCase()) return 'equal to the site address';
  if (['1234567890', 'qwertyuiop', 'qwertzuiop', 'asdfghjkl;', 'abcdefghij', '0987654321', '1q2w3e4r5t', '12345asdfg'].includes(pw)) return 'a well-known password';
  if (['password', 'ghost', 'passw0rd'].some((bad) => lower.includes(bad))) return 'containing "password" or "ghost"';
  const counts = new Map();
  for (const ch of pw) {
    const c = (counts.get(ch) || 0) + 1;
    if (c >= pw.length / 2) return 'made of mostly one character';
    counts.set(ch, c);
  }
  return null;
}

let ownerPassword = process.env.GHOST_ADMIN_PASSWORD || '';
const problem = passwordProblem(ownerPassword);
const passwordUsable = problem === null;
if (!passwordUsable) {
  warn(`GHOST_ADMIN_PASSWORD is ${problem}; Ghost would reject it.`);
  warn('Failing closed: a new site gets a random owner password nobody knows; an existing owner keeps');
  warn('the current password. Fix: set GHOST_ADMIN_PASSWORD (10+ characters, not containing "ghost" or');
  warn('"password") and GHOST_RESET_OWNER_PASSWORD=true on the Ghost service, redeploy, log in, then set');
  warn('GHOST_RESET_OWNER_PASSWORD=false.');
  ownerPassword = crypto.randomBytes(24).toString('base64url');
}
// The start script is the only consumer; keep the password out of Ghost's environment.
delete process.env.GHOST_ADMIN_PASSWORD;

// --- MySQL ------------------------------------------------------------------------
const db = {
  host: process.env.database__connection__host || '',
  port: port('database__connection__port', process.env.database__connection__port, 3306),
  user: process.env.database__connection__user || '',
  password: process.env.database__connection__password || '',
  database: process.env.database__connection__database || '',
};

function canConnect(host, p) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port: p, timeout: 4000 });
    const done = (ok) => { socket.destroy(); resolve(ok); };
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
  });
}

async function waitForMysql() {
  if (!db.host) {
    warn('database__connection__host is empty; Ghost will fail to connect.');
    return false;
  }
  const started = Date.now();
  for (let i = 0; ; i++) {
    if (await canConnect(db.host, db.port)) {
      log(`MySQL at ${db.host}:${db.port} is reachable.`);
      return true;
    }
    if (Date.now() - started > 15 * 60 * 1000) {
      warn(`MySQL at ${db.host}:${db.port} is not reachable after 15 minutes; starting Ghost anyway.`);
      return false;
    }
    if (i % 6 === 0) log(`waiting for MySQL at ${db.host}:${db.port} ...`);
    await sleep(5000);
  }
}

async function resetOwnerPassword() {
  const flag = String(process.env.GHOST_RESET_OWNER_PASSWORD || 'false').toLowerCase();
  if (!['true', '1', 'yes'].includes(flag)) return;
  if (!passwordUsable) {
    warn('GHOST_RESET_OWNER_PASSWORD ignored: GHOST_ADMIN_PASSWORD is not usable (see above).');
    return;
  }
  let conn;
  try {
    const mysql = require(require.resolve('mysql2/promise', { paths: [CURRENT] }));
    const security = require(require.resolve('@tryghost/security', { paths: [CURRENT] }));
    conn = await mysql.createConnection({ ...db, connectTimeout: 10000 });
    const [tables] = await conn.query("SHOW TABLES LIKE 'users'");
    if (!tables.length) {
      log('GHOST_RESET_OWNER_PASSWORD: no users table yet (new site); setup will use GHOST_ADMIN_PASSWORD.');
      return;
    }
    const hash = await security.password.hash(ownerPassword);
    const [result] = await conn.execute(
      "UPDATE users SET password = ?, status = 'active', updated_at = UTC_TIMESTAMP() WHERE email = ? AND status <> 'inactive'",
      [hash, ownerEmail],
    );
    if (result.affectedRows) {
      log(`GHOST_RESET_OWNER_PASSWORD: password of ${ownerEmail} set from GHOST_ADMIN_PASSWORD. Set GHOST_RESET_OWNER_PASSWORD=false now.`);
    } else {
      warn(`GHOST_RESET_OWNER_PASSWORD: no active staff user with e-mail ${ownerEmail}; nothing changed.`);
    }
  } catch (err) {
    warn(`GHOST_RESET_OWNER_PASSWORD failed: ${err.message}`);
  } finally {
    if (conn) await conn.end().catch(() => {});
  }
}

// --- talking to the local Ghost --------------------------------------------------------
function ghostRequest(method, urlPath, body) {
  return new Promise((resolve) => {
    const data = body ? Buffer.from(JSON.stringify(body)) : null;
    const req = http.request({
      host: '127.0.0.1',
      port: ghostPort,
      method,
      path: urlPath,
      timeout: 60000,
      headers: {
        // Ghost redirects requests whose host/protocol differ from `url`.
        Host: siteUrl.host,
        'X-Forwarded-Proto': siteUrl.protocol.replace(':', ''),
        Accept: 'application/json',
        ...(data ? { 'Content-Type': 'application/json', 'Content-Length': data.length } : {}),
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(Buffer.concat(chunks).toString()); } catch { /* not JSON */ }
        resolve({ status: res.statusCode, json });
      });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', (err) => resolve({ status: 0, error: err.message }));
    if (data) req.write(data);
    req.end();
  });
}

const state = { ghostUp: false, setupDone: false };

async function ensureSetup() {
  // Poll every second: the setup must happen before anyone else can reach it.
  for (;;) {
    const res = await ghostRequest('GET', SETUP_PATH);
    if (res.status === 200 && res.json && Array.isArray(res.json.setup)) {
      state.ghostUp = true;
      if (res.json.setup[0].status) {
        state.setupDone = true;
        log('Ghost is up and set up.');
        return;
      }
      break;
    }
    await sleep(1000);
  }
  for (let attempt = 1; attempt <= 10; attempt++) {
    log(`fresh site: creating the owner ${ownerEmail} (attempt ${attempt})`);
    const res = await ghostRequest('POST', SETUP_PATH, {
      setup: [{ name: ownerName, email: ownerEmail, password: ownerPassword, blogTitle: siteTitle }],
    });
    if (res.status === 201) {
      state.setupDone = true;
      log(`setup complete: log in at ${process.env.url}/ghost/ with GHOST_ADMIN_EMAIL and GHOST_ADMIN_PASSWORD.`);
      return;
    }
    const check = await ghostRequest('GET', SETUP_PATH);
    if (check.json && check.json.setup && check.json.setup[0].status) {
      state.setupDone = true;
      warn('setup was already completed by another request; the owner may differ from GHOST_ADMIN_EMAIL.');
      return;
    }
    const message = res.json && res.json.errors ? res.json.errors.map((e) => e.message).join('; ') : (res.error || `HTTP ${res.status}`);
    warn(`setup failed: ${message}`);
    await sleep(5000);
  }
  warn('setup did not complete; the healthcheck stays unhealthy. Check the values of GHOST_ADMIN_EMAIL/GHOST_SITE_TITLE.');
}

function serveHealth() {
  const server = http.createServer((req, res) => {
    const ok = state.ghostUp && state.setupDone;
    res.writeHead(ok ? 200 : 503, { 'Content-Type': 'text/plain' });
    res.end(ok ? 'ok\n' : 'starting\n');
  });
  server.on('error', (err) => warn(`healthcheck server: ${err.message}`));
  server.listen(healthPort, '::', () => log(`healthcheck on [::]:${healthPort}`));
}

async function main() {
  serveHealth();
  await waitForMysql();
  await resetOwnerPassword();

  log(`starting Ghost on [${process.env.server__host}]:${ghostPort} for ${process.env.url}`);
  const child = spawn('docker-entrypoint.sh', ['node', 'current/index.js'], { cwd: GHOST_INSTALL, stdio: 'inherit', env: process.env });
  for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => child.kill(sig));
  child.on('exit', (code, signal) => {
    log(`Ghost exited (${signal || code})`);
    process.exit(code === null ? 1 : code);
  });

  ensureSetup().catch((err) => warn(`setup check failed: ${err.message}`));
}

main().catch((err) => {
  warn(`start script error: ${err.stack || err.message}`);
  process.exit(1);
});
