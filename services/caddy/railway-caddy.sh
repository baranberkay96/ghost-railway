#!/bin/sh
# Caddy start for Ghost on Railway: validates the variables, then runs Caddy.
# No variable value stops the deploy; bad values fall back with a warning.
set -u
warn() { echo "[railway-caddy] WARNING: $*" >&2; }

case "${PORT:-}" in
'' | *[!0-9]*) warn "PORT='${PORT:-}' is not a port number; using 8080"; PORT=8080 ;;
esac
if [ "$PORT" -lt 1 ] || [ "$PORT" -gt 65535 ]; then warn "PORT=$PORT out of range; using 8080"; PORT=8080; fi

case "${GHOST_UPSTREAM:-}" in
'' | *[!A-Za-z0-9.:_\[\]-]*)
	warn "GHOST_UPSTREAM='${GHOST_UPSTREAM:-}' is empty or invalid; using ghost.railway.internal:2368"
	GHOST_UPSTREAM=ghost.railway.internal:2368 ;;
esac

case "${ACTIVITYPUB_TARGET:-}" in
https://* | http://*) ;;
*)
	warn "ACTIVITYPUB_TARGET='${ACTIVITYPUB_TARGET:-}' is not an http(s) URL; using https://ap.ghost.org"
	ACTIVITYPUB_TARGET=https://ap.ghost.org ;;
esac
case "$ACTIVITYPUB_TARGET" in
*[!A-Za-z0-9.:/_-]*) warn "ACTIVITYPUB_TARGET has unexpected characters; using https://ap.ghost.org"; ACTIVITYPUB_TARGET=https://ap.ghost.org ;;
esac

export PORT GHOST_UPSTREAM ACTIVITYPUB_TARGET
echo "[railway-caddy] :$PORT -> Ghost at $GHOST_UPSTREAM, ActivityPub at $ACTIVITYPUB_TARGET"
exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
