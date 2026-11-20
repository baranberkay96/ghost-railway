# Ghost 6 Publishing Platform (MySQL, Caddy): Railway template spec

## Listing

| Field | Value |
|---|---|
| Name | **Ghost 6 Publishing Platform (MySQL, Caddy)** |
| Description | Blogs, newsletters and paid memberships with Ghost 6, MySQL 8 and Caddy. (72 chars) |
| Category | CMS |
| Tags | ghost, blog, newsletter, publishing, membership, cms, mysql, activitypub |
| Icon | `https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/png/ghost.png` (200, image/png; the svg variant is 404) |
| Repo | `baranberkay96/ghost-railway`, service roots `/services/ghost`, `/services/caddy` |

## Base market templates (checked 2026-11-20)

| Code | Name | Active / total | Stack | Problems |
|---|---|---|---|---|
| `tcsVLc` | Ghost + MySQL | 576 / 1462 | `ghost:alpine` (unpinned), `mysql:8` | Unpinned; Ghost reaches MySQL over the public TCP proxy (egress, exposure); empty SMTP variables; setup page open to the first visitor |
| `ghost` | Ghost | 309 / 1333 | repo `railwayapp-starters/ghost`, `mysql:9` | MySQL 9 (Ghost supports MySQL 8); old starter; Mailgun SMTP variables |
| `AGPkfv` | Ghost | 85 / 132 | `ghost:latest`, `mysql:8.0` | Hard-coded root password `MyStrongPassword`; unpinned |

Kept: Ghost + MySQL + content volume at `/var/lib/ghost/content`, `database__*` env configuration.

## Improvements over market templates

1. **Setup cannot be claimed.** All market templates leave Ghost's `/ghost/#/setup` to whoever opens the site first. Here the Ghost service completes the setup through the local Admin API one second after Ghost answers, with the owner from `GHOST_ADMIN_EMAIL`/`GHOST_ADMIN_PASSWORD`, and Caddy answers 403 to any non-GET setup request from the internet (case-insensitive, version prefixes included). Verified: public `POST .../authentication/setup/` → 403.
2. **Official Ghost 6 layout:** Caddy in front (as in `TryGhost/ghost-docker`), ActivityPub routes to Ghost's hosted service, security headers; MySQL 8.0.46 as pinned by Ghost's own compose file.
3. **Pinned by digest:** Ghost 6.78.0 (alpine), MySQL 8.0.46, Caddy 2.11.9.
4. **Private database:** no TCP proxy, Ghost on `::`, dedicated `ghost` MySQL user (root password separate); InnoDB buffer pool 256 MB so MySQL fits Trial.
5. **Login works without SMTP:** Ghost 6 e-mails a device-verification code to staff by default; with Railway's SMTP restriction that would lock the owner out. It is off by default with a clear variable to turn it on.
6. **Deploy-form values never fail the deploy** (STANDARD 8.29): invalid e-mail/title/name/URL/ports fall back; a password Ghost would reject fails closed (random password on a new site, existing password kept) with instructions in the log.
7. **Owner password reset from variables** (`GHOST_RESET_OWNER_PASSWORD`), using Ghost's own hashing module.
8. **Healthcheck that means something:** the start script answers 200 only after Ghost responds and setup is complete; it waits up to 15 minutes for MySQL.
9. **Logs to stdout only** (no log files filling the volume).

## Pinned versions

| Service | Source | Version | Released | Checked |
|---|---|---|---|---|
| Ghost | `ghost:6.78.0-alpine@sha256:baa6dbff…2d76e` | 6.78.0 | 2026-11-17 | 2026-11-20 |
| MySQL | `mysql:8.0.46@sha256:7dcddc01…ae2b` | 8.0.46 | 2026-05 (pinned by Ghost's compose) | 2026-11-20 |
| Caddy | `caddy:2.11.9-alpine@sha256:003a9780…36f0` | 2.11.9 | 2026-11 | 2026-11-20 |

## Services

### Caddy (public)

Repo build `/services/caddy`. `PORT=8080`, healthcheck `/caddy-health` (300 s). Variables: `GHOST_UPSTREAM` (`${{Ghost.RAILWAY_PRIVATE_DOMAIN}}:2368`), `ACTIVITYPUB_TARGET` (`https://ap.ghost.org`). Trusts Railway's proxy headers, sends `X-Forwarded-Proto: https` to Ghost.

### Ghost (private)

Repo build `/services/ghost`. Ghost listens on `[::]:2368`; the start script serves the healthcheck on `PORT=2369` (`/health`, 900 s). Volume `/var/lib/ghost/content`. Variables: `url` (`https://${{Caddy.RAILWAY_PUBLIC_DOMAIN}}`), `GHOST_ADMIN_EMAIL`, `GHOST_ADMIN_PASSWORD` (secret 24), `GHOST_ADMIN_NAME`, `GHOST_SITE_TITLE`, `GHOST_RESET_OWNER_PASSWORD`, `database__*` (references), `security__staffDeviceVerification=false`, `logging__transports=["stdout"]`.

### MySQL (private)

`mysql:8.0.46`, start command adds `--innodb-use-native-aio=0 --disable-log-bin --performance_schema=0 --innodb-buffer-pool-size=256M`. Volume `/var/lib/mysql`. `MYSQL_DATABASE=ghost`, `MYSQL_USER=ghost`, generated passwords; `MYSQL*` aliases for Railway's Data tab.

## Resource estimate

Measured on the test deploy (2026-11-20, idle after login, one post and one image): Caddy 36 MiB, Ghost 145 MiB, MySQL 223-268 MiB; CPU < 0.01 vCPU each.

| Service | Idle RAM | Typical RAM | CPU |
|---|---|---|---|
| Caddy | 36 MB | 40-60 MB | < 0.01 |
| Ghost | 145 MB | 250-500 MB | 0.01 idle, 0.3-1 on newsletter sends |
| MySQL | 225-270 MB | 300-500 MB | 0.01-0.1 |

Estimated cost: idle ≈ $4-5/month (≈0.42 GB RAM + ~1.5 GB volumes); typical small publication ≈ $9-12/month. Minimum plan: Trial runs it (every service below 1 GB); member e-mail and staff invites need SMTP → **Pro**, or newsletters only via Mailgun's API.

## Verification checklist

- [x] All three services SUCCESS; Caddy `/caddy-health` 200; Ghost health 200 after setup.
- [x] Public setup POST → 403 (also with a case-variant path).
- [x] Admin session login with the generated owner credentials (201), no device-verification code needed.
- [x] Create and publish a post through the Admin API; the post page renders through Caddy.
- [x] Upload an image; served from `/content/images/...` (volume).
- [x] ActivityPub: `/.well-known/webfinger` answered by ap.ghost.org through Caddy.
- [x] Owner password `abc` in the deploy form: deploy SUCCESS, warning logged.
- [x] `GHOST_RESET_OWNER_PASSWORD=true` with a new password: login works with it, old one rejected.
- [ ] SMTP mail (needs Railway Pro) and Mailgun newsletters (needs an account).

## Open questions

- MySQL 8.0 reached Oracle's end of life in April 2026; Ghost's own Docker setup still pins 8.0.46. Switch to 8.4 when Ghost does.
- ap.ghost.org usage limits for self-hosted sites are set by Ghost and may change.
