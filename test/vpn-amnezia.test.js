'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const Database = require('better-sqlite3');
const {
  login,
  request,
  startServer,
  stopServer,
} = require('./helpers/server-fixture');

const fsp = fs.promises;

test('members can create, list and delete AmneziaWG peers independently of VLESS', async t => {
  const dataDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'cheese-wheel-awg-test-'));
  const helperPath = path.join(dataDir, 'fake-awg-helper.sh');
  const helperLog = path.join(dataDir, 'fake-awg-helper.log');
  const clientConfig = [
    '[Interface]',
    'PrivateKey = test-client-private-key',
    'Address = 10.66.66.22/32',
    'DNS = 1.1.1.1,1.0.0.1',
    'Jc = 6',
    'Jmin = 50',
    'Jmax = 1000',
    'S1 = 103',
    'S2 = 41',
    'H1 = 902314561',
    'H2 = 1712048033',
    'H3 = 642109877',
    'H4 = 134557829',
    '',
    '[Peer]',
    'PublicKey = test-server-public-key',
    'PresharedKey = test-preshared-key',
    'Endpoint = 31.130.128.212:51820',
    'AllowedIPs = 0.0.0.0/0,::/0',
    'PersistentKeepalive = 25',
    '',
  ].join('\n');
  const configBase64 = Buffer.from(clientConfig).toString('base64');
  await fsp.writeFile(helperPath, `#!/bin/sh
set -eu
printf '%s %s\\n' "$1" "\${2:-}" >> ${JSON.stringify(helperLog)}
case "$1" in
  status)
    printf '%s\\n' '{"success":true,"online":true,"port":51820,"clientCount":3}'
    ;;
  create)
    printf '%s\\n' '{"success":true,"clientId":"'"$2"'","address":"10.66.66.22/32","configBase64":"${configBase64}"}'
    ;;
  delete)
    printf '%s\\n' '{"success":true,"clientId":"'"$2"'","removed":true}'
    ;;
  *) exit 1 ;;
esac
`, { mode: 0o700 });

  const instance = await startServer(dataDir, {
    extraEnv: { AWG_PRIMARY_HELPER: helperPath },
  });
  t.after(async () => {
    await stopServer(instance);
    await fsp.rm(dataDir, { recursive: true, force: true });
  });
  const anton = await login(instance, 1);

  const databasePath = path.join(dataDir, 'cheese_wheel.db');
  const db = new Database(databasePath);
  db.prepare(`
    INSERT INTO vpn_clients (
      user_id, server_id, protocol, inbound_id, client_id, email,
      device_name, connection_link, created_at
    ) VALUES (?, ?, 'vless', ?, ?, ?, ?, ?, ?)
  `).run(
    anton.user.id,
    'primary',
    2,
    '11111111-1111-4111-8111-111111111111',
    'legacy-vless@example.invalid',
    'Телефон',
    'vless://11111111-1111-4111-8111-111111111111@example.test:443?security=reality',
    Date.now() - 1000
  );
  db.close();

  const servers = await request(instance, '/api/vpn/clients', { cookie: anton.cookie });
  assert.equal(servers.status, 200, JSON.stringify(servers.payload));
  const primary = servers.payload.servers.find(server => server.id === 'primary');
  assert.ok(primary);
  assert.ok(primary.protocols.includes('amneziawg'));

  const status = await request(instance, '/api/vpn/status', { cookie: anton.cookie });
  assert.equal(status.status, 200, JSON.stringify(status.payload));
  const awgStatus = status.payload.statuses.find(
    server => server.id === 'primary'
  ).protocols.amneziawg;
  assert.equal(awgStatus.available, true);
  assert.equal(awgStatus.online, true);
  assert.equal(awgStatus.port, 51820);
  assert.equal(awgStatus.clientCount, 3);

  const created = await request(instance, '/api/vpn/clients', {
    method: 'POST',
    cookie: anton.cookie,
    body: {
      server_id: 'primary',
      protocol: 'amneziawg',
      device_name: 'Телефон',
    },
  });
  assert.equal(created.status, 201, JSON.stringify(created.payload));
  assert.equal(created.payload.protocol, 'amneziawg');
  assert.equal(created.payload.connectionLink, clientConfig);

  const listed = await request(instance, '/api/vpn/clients', { cookie: anton.cookie });
  assert.equal(listed.status, 200, JSON.stringify(listed.payload));
  assert.equal(listed.payload.clients.length, 2);
  assert.equal(listed.payload.clients[0].protocol, 'amneziawg');

  const deleted = await request(instance, `/api/vpn/clients/${created.payload.id}`, {
    method: 'DELETE',
    cookie: anton.cookie,
    body: {},
  });
  assert.equal(deleted.status, 200, JSON.stringify(deleted.payload));

  const helperCalls = await fsp.readFile(helperLog, 'utf8');
  assert.match(helperCalls, /^status\s*$/m);
  assert.match(helperCalls, /^create cw_1_[a-f0-9]{16}$/m);
  assert.match(helperCalls, /^delete cw_1_[a-f0-9]{16}$/m);
});

test('legacy VPN rows migrate to VLESS while allowing a parallel AmneziaWG device', async t => {
  const dataDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'cheese-wheel-vpn-migration-'));
  const databasePath = path.join(dataDir, 'cheese_wheel.db');
  const legacyDb = new Database(databasePath);
  legacyDb.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      password_hash TEXT,
      role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('member', 'admin'))
    );
    INSERT INTO users (id, name, password_hash, role)
    VALUES (1, 'Антон', NULL, 'member');

    CREATE TABLE vpn_clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      server_id TEXT NOT NULL,
      inbound_id INTEGER NOT NULL,
      client_id TEXT UNIQUE NOT NULL,
      email TEXT NOT NULL,
      device_name TEXT COLLATE NOCASE NOT NULL,
      connection_link TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE(user_id, server_id, device_name)
    );
  `);
  legacyDb.prepare(`
    INSERT INTO vpn_clients (
      user_id, server_id, inbound_id, client_id, email,
      device_name, connection_link, created_at
    ) VALUES (1, 'primary', 2, 'legacy-client', 'legacy@example.invalid',
      'Один телефон', 'vless://legacy', 1)
  `).run();
  legacyDb.close();

  const instance = await startServer(dataDir);
  t.after(async () => {
    await stopServer(instance);
    await fsp.rm(dataDir, { recursive: true, force: true });
  });

  const migratedDb = new Database(databasePath);
  const columns = migratedDb.prepare('PRAGMA table_info(vpn_clients)').all();
  assert.ok(columns.some(column => column.name === 'protocol'));
  assert.equal(
    migratedDb.prepare('SELECT protocol FROM vpn_clients WHERE client_id = ?').get(
      'legacy-client'
    ).protocol,
    'vless'
  );
  assert.doesNotThrow(() => migratedDb.prepare(`
    INSERT INTO vpn_clients (
      user_id, server_id, protocol, inbound_id, client_id, email,
      device_name, connection_link, created_at
    ) VALUES (1, 'primary', 'amneziawg', 0, 'cw_1_0123456789abcdef',
      '10.66.66.22/32', 'Один телефон', '[Interface]', 2)
  `).run());
  migratedDb.close();
});
