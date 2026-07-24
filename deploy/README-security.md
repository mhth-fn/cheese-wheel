# Security deployment notes

Production requires three independent random secrets in `/opt/cheese-wheel/.env`:

```dotenv
TOTP_ENCRYPTION_KEY=<64 hexadecimal characters>
RATE_LIMIT_PEPPER=<at least 32 random bytes, encoded as hexadecimal>
AUDIT_LOG_PEPPER=<at least 32 random bytes, encoded as hexadecimal>
```

Generate them on the destination host and keep `.env` owned by `root` with mode
`0600`. Never print, commit, reuse, or copy the values into a browser.

Store an encrypted off-host copy of the exact `.env` in a password manager or
secrets vault. The database backup deliberately does not contain these keys.
Without the original `TOTP_ENCRYPTION_KEY`, enrolled TOTP secrets cannot be
decrypted after a restore; replacing the key is not a recovery procedure.

The first phase-2 startup performs two one-time migrations:

- existing bearer session values are replaced atomically by SHA-256 digests;
- the legacy bootstrap administrator is converted to the database role
  `admin`.

The migration is intentionally stop-the-world: old and new processes must never
write the same database at the same time, and old application code must not be
started against the migrated database.

## First production deployment

Run every command in this section as `root`, using the existing root-owned PM2
daemon. Record the deployed commit, then stop the old process before changing
any file in `/opt/cheese-wheel`:

```bash
cd /opt/cheese-wheel
git rev-parse HEAD
pm2 stop cheese-wheel
git pull --ff-only origin main
npm ci
npm run build
./deploy/install-security.sh
```

Stopping first is mandatory: PM2 must not restart old code from a directory
whose `server.js` or `dist` has already been replaced, and the authoritative
rollback snapshot must be taken after all application writes have stopped. The
installer generates missing secrets, creates and verifies that pre-migration
snapshot, installs the backup timer, and replaces the two Nginx files only after
keeping rollback copies. A failed validation, reload, termination signal or
interrupt restores the previous Nginx files. If restoration itself fails, the
installer preserves its recovery copies and prints their path.

Only after the installer succeeds, start the new release:

```bash
pm2 startOrRestart ecosystem.config.js --only cheese-wheel --update-env
pm2 save
```

Do not use PM2 cluster mode or a rolling reload for this migration. Verify the
site, Socket.IO, role controls and `/api/admin/audit`, then run the strict
post-migration backup and inspect its status:

```bash
systemctl start cheese-wheel-backup.service
systemctl status cheese-wheel-backup.service --no-pager
systemctl list-timers cheese-wheel-backup.timer --no-pager
```

If the new process cannot pass verification, stop it and restore the complete
pre-migration database snapshot before starting old code. Do not point old code
at the migrated database.

## Trusted client addresses

Install `deploy/nginx/cloudflare-realip.conf` in `/etc/nginx/conf.d/` and use
`deploy/nginx/cheese-wheel.conf` for this virtual host. The former contains only
Cloudflare's published address ranges; refresh it whenever Cloudflare changes
<https://www.cloudflare.com/ips/>.

Always run `nginx -t` before reloading. Express trusts only the loopback reverse
proxy and rate-limits `req.ip`; it never trusts a client-supplied
`CF-Connecting-IP` header directly.

## Verification checklist

1. Start the new version against a copy of the production database.
2. Verify a pre-migration cookie still authenticates.
3. Verify the raw cookie no longer appears anywhere in the copied database.
4. Restart the test process and verify rate-limit counters remain.
5. Exercise TOTP enrollment, a replayed TOTP, one-time recovery codes, role
   changes, and the last-admin guard.
6. Run the backup service and open the resulting database in a restore drill.
7. Deploy, then verify the app, Socket.IO, admin controls, and the systemd timer.
