# Security deployment notes

Production requires three independent random secrets in `/opt/cheese-wheel/.env`:

```dotenv
TOTP_ENCRYPTION_KEY=<64 hexadecimal characters>
RATE_LIMIT_PEPPER=<at least 32 random bytes, encoded as hexadecimal>
AUDIT_LOG_PEPPER=<at least 32 random bytes, encoded as hexadecimal>
```

Generate them on the destination host and keep `.env` owned by `root` with mode
`0600`. Never print, commit, reuse, or copy the values into a browser.

The first phase-2 startup performs two one-time migrations:

- existing bearer session values are replaced atomically by SHA-256 digests;
- the legacy bootstrap administrator is converted to the database role
  `admin`.

Take and verify a database backup before that first startup. Old application
code must not be started against the migrated database.

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
