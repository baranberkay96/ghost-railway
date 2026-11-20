# syntax=docker/dockerfile:1
# Public reverse proxy for Ghost on Railway: the official Caddy image, pinned
# by tag and digest, with a Caddyfile written for this template.
FROM caddy:2.11.9-alpine@sha256:003a97808e781aa9f7e75cc2f43d34d461099031faf5e20faefb9f61126836f0

# /etc/caddy and /usr/local/bin exist in the base image.
COPY Caddyfile /etc/caddy/Caddyfile
COPY --chmod=0755 railway-caddy.sh /usr/local/bin/railway-caddy.sh

# Fail the build rather than the deploy on a script or Caddyfile error.
RUN sh -n /usr/local/bin/railway-caddy.sh \
 && PORT=8080 GHOST_UPSTREAM=ghost.railway.internal:2368 ACTIVITYPUB_TARGET=https://ap.ghost.org \
    caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile

ENV PORT=8080
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/railway-caddy.sh"]
CMD []
