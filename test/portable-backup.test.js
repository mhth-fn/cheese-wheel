'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const test = require('node:test');
const Database = require('better-sqlite3');
const { createPortableBackup } = require('../server/portable-backup');
const { verifyManifest } = require('../scripts/backup');
const {
  delay,
  login,
  request,
  startServer,
  stopServer,
  testPassword,
} = require('./helpers/server-fixture');

const execFileAsync = promisify(execFile);
const fsp = fs.promises;
const tarPath = fs.realpathSync('/usr/bin/tar');

test('portable backup is runnable, verified and stripped of live authentication secrets', async t => {
  const fixtureRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'cheese-wheel-portable-test-'));
  t.after(() => fsp.rm(fixtureRoot, { recursive: true, force: true }));
  const appRoot = path.join(fixtureRoot, 'app-source');
  const dataDir = path.join(fixtureRoot, 'data');
  const uploadsPath = path.join(dataDir, 'uploads');
  const sigamePacksPath = path.join(dataDir, 'sigame-packs');
  const extractedRoot = path.join(fixtureRoot, 'extracted');
  await Promise.all([
    fsp.mkdir(appRoot, { recursive: true }),
    fsp.mkdir(uploadsPath, { recursive: true }),
    fsp.mkdir(sigamePacksPath, { recursive: true }),
    fsp.mkdir(extractedRoot, { recursive: true }),
  ]);
  await Promise.all([
    fsp.writeFile(path.join(appRoot, 'package.json'), '{"scripts":{"start":"node server.js"}}\n'),
    fsp.writeFile(path.join(appRoot, '.env'), 'MUST_NOT_LEAK=1\n'),
    fsp.writeFile(path.join(uploadsPath, 'photo.jpg'), 'photo fixture'),
    fsp.writeFile(path.join(sigamePacksPath, 'pack.siq'), 'pack fixture'),
  ]);

  const databasePath = path.join(dataDir, 'cheese_wheel.db');
  const db = new Database(databasePath);
  db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      password_hash TEXT,
      role TEXT NOT NULL
    );
    CREATE TABLE movies (id INTEGER PRIMARY KEY, title TEXT NOT NULL);
    CREATE TABLE tokens (token TEXT PRIMARY KEY, user_id INTEGER, expires INTEGER);
    CREATE TABLE login_challenges (challenge_hash TEXT PRIMARY KEY);
    CREATE TABLE user_invitations (token_hash TEXT PRIMARY KEY);
    CREATE TABLE two_factor_recovery_codes (id INTEGER PRIMARY KEY, code_hash TEXT);
    CREATE TABLE user_totp (user_id INTEGER PRIMARY KEY, secret_enc TEXT);
    CREATE TABLE rate_limit_buckets (scope TEXT, bucket_key TEXT);
    CREATE TABLE vpn_clients (id INTEGER PRIMARY KEY, connection_link TEXT);
    INSERT INTO users VALUES (2, 'Сергей', 'kept-password-hash', 'admin');
    INSERT INTO movies VALUES (1, 'Perfect Blue');
    INSERT INTO tokens VALUES ('session-hash', 2, 9999999999999);
    INSERT INTO login_challenges VALUES ('challenge-hash');
    INSERT INTO user_invitations VALUES ('invitation-hash');
    INSERT INTO two_factor_recovery_codes VALUES (1, 'recovery-hash');
    INSERT INTO user_totp VALUES (2, 'encrypted-totp-secret');
    INSERT INTO rate_limit_buckets VALUES ('login', 'account-hash');
    INSERT INTO vpn_clients VALUES (1, 'vless://portable-config');
  `);
  db.close();

  const expectedTables = [
    'users',
    'movies',
    'tokens',
    'login_challenges',
    'user_invitations',
    'two_factor_recovery_codes',
    'user_totp',
    'rate_limit_buckets',
    'vpn_clients',
  ];
  const portable = await createPortableBackup({
    appEntries: ['package.json'],
    currentDate: new Date('2026-08-22T12:34:56Z'),
    dataDir,
    expectedTables,
    rootDir: appRoot,
    sigamePacksPath,
    tarPath,
    uploadsPath,
  });
  t.after(() => portable.cleanup());

  assert.equal(portable.fileName, 'cheese-wheel-portable-20260822T123456Z.tar.gz');
  const listing = (await execFileAsync(tarPath, [
    '--list',
    '--gzip',
    '--file',
    portable.archivePath,
  ])).stdout;
  assert.match(listing, /cheese-wheel-portable\/README-RU\.md/);
  assert.match(listing, /cheese-wheel-portable\/start-local\.sh/);
  assert.match(listing, /cheese-wheel-portable\/start-local\.ps1/);
  assert.match(listing, /cheese-wheel-portable\/app\/package\.json/);
  assert.doesNotMatch(listing, /\.env/);

  await execFileAsync(tarPath, [
    '--extract',
    '--gzip',
    '--file',
    portable.archivePath,
    '--directory',
    extractedRoot,
  ]);
  const bundleRoot = path.join(extractedRoot, 'cheese-wheel-portable');
  const snapshotRoot = path.join(bundleRoot, 'snapshot');
  await verifyManifest(snapshotRoot, [
    'cheese_wheel.db',
    'sigame-packs.index.json',
    'sigame-packs.tar',
    'uploads.tar',
  ]);

  const portableDb = new Database(path.join(snapshotRoot, 'cheese_wheel.db'), {
    readonly: true,
  });
  assert.deepEqual(portableDb.prepare(
    'SELECT name, password_hash, role FROM users WHERE id = 2'
  ).get(), {
    name: 'Сергей',
    password_hash: 'kept-password-hash',
    role: 'admin',
  });
  assert.equal(portableDb.prepare('SELECT title FROM movies').get().title, 'Perfect Blue');
  assert.equal(
    portableDb.prepare('SELECT connection_link FROM vpn_clients').get().connection_link,
    'vless://portable-config'
  );
  for (const table of [
    'tokens',
    'login_challenges',
    'user_invitations',
    'two_factor_recovery_codes',
    'user_totp',
    'rate_limit_buckets',
  ]) {
    assert.equal(portableDb.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count, 0);
  }
  portableDb.close();

  const readme = await fsp.readFile(path.join(bundleRoot, 'README-RU.md'), 'utf8');
  assert.match(readme, /Node\.js LTS \(20\.19\+, 22\.12\+\)/);
  assert.match(readme, /2FA/);
  assert.match(readme, /VPN-конфигурации/);
  const startScript = path.join(bundleRoot, 'start-local.sh');
  assert.match(await fsp.readFile(startScript, 'utf8'), /npm run build/);
  await execFileAsync('/bin/bash', ['-n', startScript]);

  const restoredData = path.join(fixtureRoot, 'restored-data');
  await fsp.mkdir(restoredData);
  await Promise.all([
    fsp.copyFile(
      path.join(snapshotRoot, 'cheese_wheel.db'),
      path.join(restoredData, 'cheese_wheel.db')
    ),
    execFileAsync(tarPath, [
      '--extract',
      '--file',
      path.join(snapshotRoot, 'uploads.tar'),
      '--directory',
      restoredData,
    ]),
    execFileAsync(tarPath, [
      '--extract',
      '--file',
      path.join(snapshotRoot, 'sigame-packs.tar'),
      '--directory',
      restoredData,
    ]),
  ]);
  assert.equal(await fsp.readFile(path.join(restoredData, 'uploads/photo.jpg'), 'utf8'), 'photo fixture');
  assert.equal(await fsp.readFile(path.join(restoredData, 'sigame-packs/pack.siq'), 'utf8'), 'pack fixture');

  const workDirectory = path.dirname(portable.archivePath);
  await portable.cleanup();
  await assert.rejects(fsp.access(workDirectory));
});

test('portable backup rejects symlinks from the application allowlist', async t => {
  const fixtureRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'cheese-wheel-portable-link-'));
  t.after(() => fsp.rm(fixtureRoot, { recursive: true, force: true }));
  const dataDir = path.join(fixtureRoot, 'data');
  const uploadsPath = path.join(dataDir, 'uploads');
  const sigamePacksPath = path.join(dataDir, 'sigame-packs');
  await Promise.all([
    fsp.mkdir(uploadsPath, { recursive: true }),
    fsp.mkdir(sigamePacksPath, { recursive: true }),
  ]);
  await fsp.writeFile(path.join(fixtureRoot, 'real-package.json'), '{}\n');
  await fsp.symlink('real-package.json', path.join(fixtureRoot, 'package.json'));
  const db = new Database(path.join(dataDir, 'cheese_wheel.db'));
  db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY)');
  db.close();

  await assert.rejects(
    createPortableBackup({
      appEntries: ['package.json'],
      dataDir,
      expectedTables: ['users'],
      rootDir: fixtureRoot,
      sigamePacksPath,
      tarPath,
      uploadsPath,
    }),
    /Refusing symbolic link/
  );
});

test('admin backup controls are present in the frontend', () => {
  const modal = fs.readFileSync(
    path.join(__dirname, '../src/components/AdminModal.jsx'),
    'utf8'
  );
  const api = fs.readFileSync(path.join(__dirname, '../src/api/admin.js'), 'utf8');
  assert.match(modal, /Скачать переносимый бэкап/);
  assert.match(modal, /autoComplete="current-password"/);
  assert.match(modal, /Активные сессии, 2FA-секреты/);
  assert.match(api, /\/api\/admin\/portable-backup/);
});

test('portable backup download requires an admin password and returns a valid archive', async t => {
  const dataDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'cheese-wheel-portable-route-'));
  const instance = await startServer(dataDir);
  t.after(async () => {
    await stopServer(instance);
    await fsp.rm(dataDir, { recursive: true, force: true });
  });
  const member = await login(instance, 1);
  const admin = await login(instance, 2);

  assert.equal((await request(instance, '/api/admin/portable-backup', {
    method: 'POST',
    cookie: member.cookie,
    body: { password: testPassword },
  })).status, 403);
  assert.equal((await request(instance, '/api/admin/portable-backup', {
    method: 'POST',
    cookie: admin.cookie,
    body: { password: 'not-the-admin-password' },
  })).status, 401);

  const response = await fetch(`${instance.baseUrl}/api/admin/portable-backup`, {
    method: 'POST',
    headers: {
      Cookie: admin.cookie,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ password: testPassword }),
  });
  assert.equal(
    response.status,
    200,
    response.ok ? '' : `${await response.clone().text()}\n${instance.getOutput()}`
  );
  assert.equal(response.headers.get('content-type'), 'application/gzip');
  assert.match(
    response.headers.get('content-disposition') || '',
    /cheese-wheel-portable-\d{8}T\d{6}Z\.tar\.gz/
  );
  const archivePath = path.join(dataDir, 'downloaded-portable.tar.gz');
  await fsp.writeFile(archivePath, Buffer.from(await response.arrayBuffer()));
  const listing = (await execFileAsync(tarPath, [
    '--list',
    '--gzip',
    '--file',
    archivePath,
  ])).stdout;
  assert.match(listing, /cheese-wheel-portable\/app\/server\.js/);
  assert.match(listing, /cheese-wheel-portable\/snapshot\/cheese_wheel\.db/);
  assert.doesNotMatch(listing, /cheese-wheel-portable\/app\/\.env/);

  const extractedRoot = path.join(dataDir, 'downloaded-extracted');
  await fsp.mkdir(extractedRoot);
  await execFileAsync(tarPath, [
    '--extract',
    '--gzip',
    '--file',
    archivePath,
    '--directory',
    extractedRoot,
  ]);
  const exportedDb = new Database(path.join(
    extractedRoot,
    'cheese-wheel-portable',
    'snapshot',
    'cheese_wheel.db'
  ), { readonly: true });
  assert.equal(exportedDb.prepare('SELECT COUNT(*) AS count FROM users').get().count >= 3, true);
  assert.equal(exportedDb.prepare('SELECT COUNT(*) AS count FROM tokens').get().count, 0);
  assert.equal(exportedDb.prepare('SELECT COUNT(*) AS count FROM user_totp').get().count, 0);
  exportedDb.close();

  await delay(50);
  const audit = await request(instance, '/api/admin/audit?limit=20', { cookie: admin.cookie });
  assert.equal(audit.status, 200);
  assert.ok(audit.payload.entries.some(entry => entry.action === 'backup.downloaded'));
});
