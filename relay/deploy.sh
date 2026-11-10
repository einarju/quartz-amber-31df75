#!/bin/bash
# Install or update the HQ Live relay on the Hetzner box. Run as root from the folder
# holding server.mjs, hq-relay.service and Caddyfile.snippet. Safe to re-run:
# the token is created once and kept; the Caddy block is appended once.
set -euo pipefail
cd "$(dirname "$0")"

id hqrelay >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin hqrelay
install -d -m 755 /opt/hq-relay
install -d -m 750 -o hqrelay -g hqrelay /var/lib/hq-relay
install -d -m 750 -o root -g hqrelay /etc/hq-relay
install -m 644 server.mjs /opt/hq-relay/server.mjs

if [ ! -s /etc/hq-relay/token ]; then
  ( umask 027; openssl rand -hex 32 > /etc/hq-relay/token )
  chown root:hqrelay /etc/hq-relay/token
  echo "new token created"
fi

install -m 644 hq-relay.service /etc/systemd/system/hq-relay.service
systemctl daemon-reload
systemctl enable hq-relay >/dev/null 2>&1
systemctl restart hq-relay
sleep 1
systemctl is-active hq-relay
curl -fsS http://127.0.0.1:8095/v1/health; echo

if ! grep -q 'hq.167-233-29-228.sslip.io' /etc/caddy/Caddyfile; then
  cp /etc/caddy/Caddyfile "/etc/caddy/Caddyfile.bak-hqrelay-$(date +%Y%m%d%H%M)"
  { echo; cat Caddyfile.snippet; } >> /etc/caddy/Caddyfile
  if caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1; then
    systemctl reload caddy
    echo "caddy reloaded with the hq block"
  else
    echo "caddy validate FAILED, restoring the backup" >&2
    cp "$(ls -t /etc/caddy/Caddyfile.bak-hqrelay-* | head -1)" /etc/caddy/Caddyfile
    exit 1
  fi
fi
