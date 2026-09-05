# VPN servers

The VPN page receives its server list and supported protocols from
`server/vpn-service.js`. A server is shown only when its credentials are configured.

| ID | Label | Address | Authentication |
| --- | --- | --- | --- |
| `primary` | Амстердам Timeweb | `31.130.128.212` | Panel session |
| `secondary` | Франкфурт Cloudzy | `172.86.69.135` | Panel session |
| `bern` | Берн Cloudzy | `45.59.122.129` | API bearer token |

## Bern Cloudzy

Installed on 2026-09-05 with 3x-ui v3.7.0 and Xray v26.7.28. Inbound 1 uses VLESS
over TCP, Reality, Vision and port 443. Its Reality target/SNI is `www.google.com`.
Reality keys and the short ID are unique to this server.

Reality must explicitly set `minClientVer: "0.0.0"` on the server. Leaving it
empty lets the current Xray configuration builder impose a version floor that
rejects sing-box (including Throne/Hiddify) and older Xray clients. This setting
keeps the current server core and authenticated Reality encryption; it only
removes the client version restriction. Preserve it when editing the inbound.

The complete create/connect/delete flow was verified with Xray v26.7.28,
Xray v26.1.18 and sing-box v1.13.16 clients after applying the compatibility setting.

The site's root-owned `/opt/cheese-wheel/.env` needs these values:

```dotenv
XUI_BERN_URL=https://45.59.122.129:54321/<private-panel-path>/
XUI_BERN_API_TOKEN=<private-api-token>
XUI_BERN_INBOUND_ID=1
XUI_BERN_TLS_FINGERPRINT=<SHA-256-of-panel-certificate>
```

The base URL must retain its trailing slash. Keep this file at mode 0600;
credentials must never be committed. 3x-ui v3 uses CSRF protection for browser
sessions; the site's server-to-server requests use its supported bearer-token
authentication. Existing session-based servers continue to use their login flow.

The Bern panel uses a dedicated self-signed HTTPS certificate, pinned by SHA-256
in the application. If replacing the certificate, update the fingerprint in the
site environment as part of the same operation. Private installation settings
are stored in `/root/cheese-wheel-vpn/credentials.json` on Bern (mode 0600).

The firewall admits SSH on port 22 and VLESS on port 443. Panel port 54321 is
reachable from the application server `31.130.128.212`; administrators can access
it with SSH forwarding. The unused subscription listener is disabled.

After changing the site environment or server registry, restart the application:

```sh
cd /opt/cheese-wheel
pm2 startOrRestart ecosystem.config.js --only cheese-wheel --update-env
pm2 save
```

Verify the authenticated `/api/vpn/clients` and `/api/vpn/status` responses, then
create a temporary profile, check a real VLESS connection and delete the profile.
Never log returned connection links or API tokens during these checks.
