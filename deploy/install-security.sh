#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

APP_DIR=/opt/cheese-wheel
ENV_FILE="$APP_DIR/.env"
BACKUP_DIR=/var/backups/cheese-wheel

if [[ ${EUID:-$(id -u)} -ne 0 ]]; then
  echo 'Run this installer as root.' >&2
  exit 1
fi

if [[ ! -f "$APP_DIR/server.js" || ! -f "$APP_DIR/scripts/backup.js" ]]; then
  echo "Application files are missing in $APP_DIR." >&2
  exit 1
fi

touch "$ENV_FILE"
chown root:root "$ENV_FILE"
chmod 0600 "$ENV_FILE"

ensure_secret() {
  local name=$1
  if grep -qE "^${name}=" "$ENV_FILE"; then
    local configured
    configured=$(sed -n "s/^${name}=//p" "$ENV_FILE" | tail -n 1)
    if [[ ! $configured =~ ^[A-Fa-f0-9]{64}$ ]]; then
      echo "$name exists but is not a 32-byte hexadecimal secret." >&2
      exit 1
    fi
  else
    printf '%s=%s\n' "$name" "$(openssl rand -hex 32)" >> "$ENV_FILE"
  fi
}

ensure_secret TOTP_ENCRYPTION_KEY
ensure_secret RATE_LIMIT_PEPPER
ensure_secret AUDIT_LOG_PEPPER

install -d -o root -g root -m 0700 "$BACKUP_DIR"
install -o root -g root -m 0644 \
  "$APP_DIR/deploy/cheese-wheel-backup.service" \
  /etc/systemd/system/cheese-wheel-backup.service
install -o root -g root -m 0644 \
  "$APP_DIR/deploy/cheese-wheel-backup.timer" \
  /etc/systemd/system/cheese-wheel-backup.timer

install -o root -g root -m 0644 \
  "$APP_DIR/deploy/nginx/cloudflare-realip.conf" \
  /etc/nginx/conf.d/cloudflare-realip.conf
install -o root -g root -m 0644 \
  "$APP_DIR/deploy/nginx/cheese-wheel.conf" \
  /etc/nginx/sites-enabled/cheese-wheel.conf

nginx -t
systemctl reload nginx
systemctl daemon-reload
systemctl start cheese-wheel-backup.service
systemctl enable --now cheese-wheel-backup.timer

echo 'Security support files installed and the initial verified backup completed.'
