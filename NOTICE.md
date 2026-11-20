# NOTICE: Ghost template

## Software deployed

| Component | Licence | Source |
|---|---|---|
| Ghost 6.78.0 | MIT (© Ghost Foundation) | https://github.com/TryGhost/Ghost, Docker Official Image `ghost:6.78.0-alpine` (docker-library/ghost), used unmodified |
| MySQL 8.0.46 | GPL-2.0 with FOSS exception (Oracle) | Docker Official Image `mysql:8.0.46`, unmodified |
| Caddy 2.11.9 | Apache-2.0 | Docker Official Image `caddy:2.11.9-alpine`, unmodified |
| ActivityPub routes | MIT | Route layout taken from `TryGhost/ghost-docker` `caddy/snippets/ActivityPub` (MIT, © Ghost Foundation) and rewritten into our Caddyfile |

## Written for this template

- `services/ghost/Dockerfile`, `services/ghost/railway-start.cjs`, `services/caddy/Dockerfile`, `services/caddy/Caddyfile`, `services/caddy/railway-caddy.sh`, `template.json`, `README.md`, `TEMPLATE.md`, this file. MIT, © 2026 the template author.
- The start script calls Ghost's own Admin API setup endpoint locally and, only for the optional password reset, hashes with Ghost's own `@tryghost/security` module and updates the `users` table through Ghost's `mysql2` dependency.
- The password checks mirror `ghost/core/server/lib/validate-password.ts` (v6.78.0).

## Upstream sources checked (2026-11-20, read only; nothing was executed locally)

- `TryGhost/ghost-docker` (main): `compose.yml` (Ghost 6 alpine, MySQL 8.0.46, Caddy, ActivityPub target `https://ap.ghost.org`, optional Tinybird analytics and self-hosted ActivityPub profiles), `caddy/Caddyfile.example`, `caddy/snippets/*`.
- `docker-library/ghost`: `6/alpine3.23/Dockerfile` and `docker-entrypoint.sh` (content seeding, `gosu node`, `server.host ::`, port 2368).
- `TryGhost/Ghost` at `v6.78.0`: `ghost/core/shared/config/defaults.json` (`security.staffDeviceVerification`), `ghost/core/server/api/endpoints/authentication.js` (setup flow), `ghost/core/server/lib/validate-password.ts`, `ghost/core/server/web/shared/middleware/url-redirects.js` (https/host redirects), `ghost/core/server/models/user.js`, `ghost/package.json`.
- Docker Hub digests: `ghost:6.78.0-alpine`, `mysql:8.0.46`, `caddy:2.11.9-alpine`.
- Railway docs: outbound networking (SMTP only on Pro).

## Market templates reviewed

`tcsVLc` (Ghost + MySQL), `ghost` (repo `railwayapp-starters/ghost`), `AGPkfv` (Ghost): read for topology and variables only. Nothing was copied.

## Names and affiliation

Ghost is a trademark of the Ghost Foundation. This is a community template, not affiliated with or endorsed by the Ghost Foundation. `ap.ghost.org` is a service run by Ghost with its own terms.
