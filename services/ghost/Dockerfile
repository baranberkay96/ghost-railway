# syntax=docker/dockerfile:1
#
# Ghost for Railway: the official Docker image (docker-library "ghost",
# Alpine variant), unmodified, plus a start script written for this template
# (railway-start.cjs) that
#   - replaces invalid deploy-form values with safe defaults (never fails the deploy),
#   - waits for MySQL on a cold start,
#   - can reset the owner's password from a variable,
#   - starts Ghost through the image's own entrypoint and, on a fresh database,
#     completes Ghost's setup with the owner from the template variables
#     within a second of Ghost answering, so the setup page cannot be claimed,
#   - answers Railway's healthcheck only once Ghost is up and set up.
#
# Upstream: https://github.com/TryGhost/Ghost (MIT), image ghost:6.78.0-alpine
# (released 2026-11-17), pinned by multi-arch index digest (checked 2026-11-20).
FROM ghost:6.78.0-alpine@sha256:baa6dbff91a28ba36c526d1f6e761deb2efe3c238c630c3f318b62f258c2d76e

COPY --chmod=0755 railway-start.cjs /usr/local/bin/railway-start.cjs

# Syntax check, and make sure the libraries the reset uses are present.
RUN node --check /usr/local/bin/railway-start.cjs \
 && cd "$GHOST_INSTALL/current" \
 && node -e "require('@tryghost/security').password.hash; require('mysql2/promise'); console.log('@tryghost/security + mysql2 found')"

# PORT = healthcheck port of the start script; Ghost itself listens on
# server__port (2368), which the Caddy service proxies to.
ENV PORT=2369 \
    server__host=:: \
    server__port=2368
EXPOSE 2368 2369

# Railway's init is PID 1. The start script forwards SIGTERM to Ghost.
ENTRYPOINT []
CMD ["node", "/usr/local/bin/railway-start.cjs"]
