#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

APP_DIR=/opt/cheese-wheel
ENV_FILE="$APP_DIR/.env"
BACKUP_DIR=/var/backups/cheese-wheel
BACKUP_CONFIG_DIR=/etc/cheese-wheel
BACKUP_ALERT_ENV="$BACKUP_CONFIG_DIR/backup-alert.env"
RESTIC_CACHE_DIR=/var/cache/cheese-wheel-restic
NGINX_REALIP_TARGET=/etc/nginx/conf.d/cloudflare-realip.conf
NGINX_SITE_TARGET=/etc/nginx/sites-enabled/cheese-wheel.conf

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
install -d -o root -g root -m 0700 "$BACKUP_CONFIG_DIR"
install -d -o root -g root -m 0700 "$RESTIC_CACHE_DIR"
install -o root -g root -m 0644 \
  "$APP_DIR/deploy/cheese-wheel-backup.service" \
  /etc/systemd/system/cheese-wheel-backup.service
install -o root -g root -m 0644 \
  "$APP_DIR/deploy/cheese-wheel-backup.timer" \
  /etc/systemd/system/cheese-wheel-backup.timer
install -o root -g root -m 0644 \
  "$APP_DIR/deploy/cheese-wheel-offsite-backup.service" \
  /etc/systemd/system/cheese-wheel-offsite-backup.service
install -o root -g root -m 0644 \
  "$APP_DIR/deploy/cheese-wheel-backup-alert@.service" \
  /etc/systemd/system/cheese-wheel-backup-alert@.service

if [[ ! -f "$BACKUP_ALERT_ENV" ]]; then
  DISCORD_WEBHOOK=$(sed -n 's/^DISCORD_WEBHOOK_URL=//p' "$ENV_FILE" | tail -n 1)
  if [[ -n "$DISCORD_WEBHOOK" ]]; then
    printf 'BACKUP_ALERT_WEBHOOK_URL=%s\n' "$DISCORD_WEBHOOK" > "$BACKUP_ALERT_ENV"
    chown root:root "$BACKUP_ALERT_ENV"
    chmod 0600 "$BACKUP_ALERT_ENV"
  fi
fi

# This explicit mode is only for the stop-the-world phase-2 bootstrap. It
# accepts the complete legacy schema, but rejects a partially-created security
# schema. The recurring systemd service always requires the full current schema.
CHEESE_WHEEL_DB=/var/lib/cheese-wheel/cheese_wheel.db \
CHEESE_WHEEL_UPLOADS=/var/lib/cheese-wheel/uploads \
CHEESE_WHEEL_BACKUP_DIR="$BACKUP_DIR" \
  /usr/bin/node "$APP_DIR/scripts/backup.js" --legacy-bootstrap

NGINX_ROLLBACK_DIR=$(mktemp -d /etc/nginx/cheese-wheel-security.XXXXXX)
REALIP_EXISTED=0
SITE_EXISTED=0

if [[ -e "$NGINX_REALIP_TARGET" || -L "$NGINX_REALIP_TARGET" ]]; then
  cp -a -- "$NGINX_REALIP_TARGET" "$NGINX_ROLLBACK_DIR/cloudflare-realip.conf"
  REALIP_EXISTED=1
fi
if [[ -e "$NGINX_SITE_TARGET" || -L "$NGINX_SITE_TARGET" ]]; then
  cp -a -- "$NGINX_SITE_TARGET" "$NGINX_ROLLBACK_DIR/cheese-wheel.conf"
  SITE_EXISTED=1
fi

cleanup_nginx_rollback() {
  rm -f -- \
    "$NGINX_ROLLBACK_DIR/cloudflare-realip.conf" \
    "$NGINX_ROLLBACK_DIR/cheese-wheel.conf"
  rmdir -- "$NGINX_ROLLBACK_DIR"
}

rollback_nginx() {
  local exit_status=${1:-1}
  local restore_ok=1
  if [[ $exit_status -eq 0 ]]; then exit_status=1; fi
  trap - EXIT ERR HUP INT TERM
  set +e
  if [[ $REALIP_EXISTED -eq 1 ]]; then
    rm -f -- "$NGINX_REALIP_TARGET" || restore_ok=0
    cp -a -- \
      "$NGINX_ROLLBACK_DIR/cloudflare-realip.conf" \
      "$NGINX_REALIP_TARGET" || restore_ok=0
  else
    rm -f -- "$NGINX_REALIP_TARGET" || restore_ok=0
  fi
  if [[ $SITE_EXISTED -eq 1 ]]; then
    rm -f -- "$NGINX_SITE_TARGET" || restore_ok=0
    cp -a -- \
      "$NGINX_ROLLBACK_DIR/cheese-wheel.conf" \
      "$NGINX_SITE_TARGET" || restore_ok=0
  else
    rm -f -- "$NGINX_SITE_TARGET" || restore_ok=0
  fi

  if [[ $restore_ok -eq 1 ]]; then
    nginx -t || restore_ok=0
  fi
  if [[ $restore_ok -eq 1 ]]; then
    systemctl reload nginx || restore_ok=0
  fi

  if [[ $restore_ok -eq 1 ]]; then
    cleanup_nginx_rollback
  else
    echo "Nginx rollback was incomplete; recovery copies remain in $NGINX_ROLLBACK_DIR." >&2
  fi
  exit "$exit_status"
}

trap 'rollback_nginx $?' EXIT
trap 'rollback_nginx 129' HUP
trap 'rollback_nginx 130' INT
trap 'rollback_nginx 143' TERM
install -o root -g root -m 0644 \
  "$APP_DIR/deploy/nginx/cloudflare-realip.conf" \
  "$NGINX_REALIP_TARGET"
install -o root -g root -m 0644 \
  "$APP_DIR/deploy/nginx/cheese-wheel.conf" \
  "$NGINX_SITE_TARGET"

nginx -t
systemctl reload nginx
trap - EXIT ERR HUP INT TERM
cleanup_nginx_rollback

systemctl daemon-reload
systemctl enable --now cheese-wheel-backup.timer

echo 'Security support files installed and the initial verified backup completed.'
