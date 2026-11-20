# Deploy and Host Ghost with Railway

Ghost is an open-source publishing platform for blogs, newsletters and paid memberships. This community template runs Ghost 6 with MySQL 8 behind a Caddy proxy on Railway, creates the site owner for you, keeps images and themes on a volume and enables Ghost 6's social web (ActivityPub) routes.

## About Hosting Ghost

Ghost needs a Node.js app server, a MySQL database and a persistent content folder for images, themes and files. This template follows the layout of Ghost's official Docker setup: a public Caddy proxy forwards the site to Ghost on Railway's private network and routes the ActivityPub endpoints to Ghost's hosted ActivityPub service. On the first start the Ghost service completes Ghost's setup with the owner account from the template variables, and Caddy refuses the setup call from the internet, so nobody can claim your site. Ghost sends staff and member e-mails through SMTP, which Railway only allows on the Pro plan.

## Common Use Cases

- Personal or company blogs with a fast, SEO-friendly theme
- E-mail newsletters with free and paid subscriber tiers
- Membership sites and paywalled content with Stripe
- Publications that want to reach followers on Mastodon, Threads and other ActivityPub apps

## Dependencies for Ghost Hosting

- MySQL 8 (included, with a volume)
- A volume for `/var/lib/ghost/content` (included)
- For e-mail: an SMTP provider (Railway Pro plan) and, for newsletters, a Mailgun account
- Optional: Stripe for paid memberships

### Deployment Dependencies

- Ghost: https://ghost.org
- Source and releases: https://github.com/TryGhost/Ghost
- Official Docker setup: https://github.com/TryGhost/ghost-docker
- Configuration reference: https://ghost.org/docs/config/
- Railway outbound networking (SMTP): https://docs.railway.com/networking/outbound-networking

### Implementation Details

| Service | Image / source | Purpose | Public | Volume |
|---|---|---|---|---|
| Caddy | `caddy:2.11.9-alpine` + Caddyfile | Public entry, security headers, ActivityPub routes, blocks the setup call | yes | none |
| Ghost | `ghost:6.78.0-alpine` (digest-pinned) + start script | Ghost app (site, Admin, APIs) | private | `/var/lib/ghost/content` |
| MySQL | `mysql:8.0.46` (as in Ghost's official Docker setup) | Ghost database | private | `/var/lib/mysql` |

**First login**

1. Open the Caddy service's public URL and go to `/ghost/`.
2. Log in with `GHOST_ADMIN_EMAIL` (default `admin@example.com`) and `GHOST_ADMIN_PASSWORD` from the Ghost service's Variables tab.
3. Change the e-mail to your own under your profile, and the site title in Settings.

**Custom domain.** Add the domain to the Caddy service, then set `url` on the Ghost service to `https://{your-domain}` and redeploy Ghost. Ghost builds every link from `url`.

**E-mail.** Ghost sends transactional mail (staff invites, password resets, member sign-in links) over SMTP only. Railway allows outbound SMTP on the Pro plan; on Trial and Hobby member sign-ups cannot receive their sign-in link. With Pro, add these variables to the Ghost service: `mail__transport=SMTP`, `mail__from`, `mail__options__host`, `mail__options__port`, `mail__options__secure`, `mail__options__auth__user`, `mail__options__auth__pass`. Bulk newsletters use Mailgun's HTTP API (Settings > Newsletters > Mailgun), which works on every plan. Ghost's new-device e-mail verification for staff is off by default (`security__staffDeviceVerification=false`) because it needs mail; turn it on once SMTP works.

**Owner password reset.** Set `GHOST_ADMIN_PASSWORD` to a new value (10+ characters, not containing "ghost" or "password") and `GHOST_RESET_OWNER_PASSWORD=true` on the Ghost service, redeploy, log in, then set it back to `false`. A password Ghost would reject never fails the deploy: a new site then gets a random password nobody knows and the log explains this reset.

**Social web (ActivityPub).** Caddy forwards `/.ghost/activitypub/*`, `/.well-known/webfinger` and `/.well-known/nodeinfo` to `ACTIVITYPUB_TARGET` (default `https://ap.ghost.org`, Ghost's hosted service, as in the official setup; usage limits are set by Ghost). Ghost's Tinybird web analytics is not included; it needs a Tinybird account.

**Storage.** Images, themes and files stay on the Ghost volume. Railway Buckets are private and Ghost serves images by public URL, so a bucket adapter is not used.

**Scaling.** Ghost runs as a single instance (the content volume is attached to one service). Give the Ghost service more CPU and memory for large newsletters; MySQL grows with members and posts.

**Versions and upgrades.** Images are pinned by tag and digest in `services/*/Dockerfile` and `template.json`. To upgrade Ghost, change the tag and digest in your fork and redeploy; Ghost migrates its database on start. Back up MySQL and the content volume first.

**Licence.** Ghost is MIT licensed. This is a community template, not affiliated with or endorsed by the Ghost Foundation.

### Why Deploy Ghost on Railway?

Railway runs Ghost, MySQL and the proxy privately connected with volumes, generated credentials and HTTPS, so you go from template to a logged-in Ghost Admin in a few minutes and scale resources per service as your publication grows.
