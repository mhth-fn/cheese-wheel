'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const Database = require('better-sqlite3');
const {
  pruneSnapshots,
  runBackup,
  verifyDatabase,
} = require('../scripts/backup');

const fsp = fs.promises;

test('backup creates and verifies an atomic database and file-storage snapshot', async t => {
  const fixtureRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'cheese-wheel-backup-test-'));
  t.after(() => fsp.rm(fixtureRoot, { recursive: true, force: true }));

  const dataRoot = path.join(fixtureRoot, 'data');
  const uploadsPath = path.join(dataRoot, 'uploads');
  const sigamePacksPath = path.join(dataRoot, 'sigame-packs');
  const backupRoot = path.join(fixtureRoot, 'backups');
  const databasePath = path.join(dataRoot, 'cheese_wheel.db');
  await Promise.all([
    fsp.mkdir(uploadsPath, { recursive: true }),
    fsp.mkdir(sigamePacksPath, { recursive: true }),
  ]);
  await fsp.writeFile(path.join(uploadsPath, 'center.jpg'), 'image fixture');
  await fsp.writeFile(path.join(sigamePacksPath, 'safe-id.siq'), 'pack fixture');

  const db = new Database(databasePath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE movies (id INTEGER PRIMARY KEY, title TEXT NOT NULL);
    INSERT INTO users (name) VALUES ('Сергей');
    INSERT INTO movies (title) VALUES ('Perfect Blue');
  `);
  db.close();

  const result = await runBackup({
    databasePath,
    uploadsPath,
    sigamePacksPath,
    backupRoot,
    tarPath: '/usr/bin/tar',
    retentionDays: 30,
    currentDate: new Date('2026-07-25T00:00:00Z'),
    expectedTables: ['users', 'movies'],
  });

  assert.equal(path.basename(result.snapshot), 'snapshot-20260725T000000Z');
  const snapshotFiles = (await fsp.readdir(result.snapshot)).sort();
  assert.deepEqual(snapshotFiles, [
    'SHA256SUMS',
    'cheese_wheel.db',
    'sigame-packs.tar',
    'uploads.tar',
  ]);
  verifyDatabase(path.join(result.snapshot, 'cheese_wheel.db'), ['users', 'movies']);

  const restored = new Database(path.join(result.snapshot, 'cheese_wheel.db'), {
    readonly: true,
  });
  assert.equal(restored.prepare('SELECT name FROM users').get().name, 'Сергей');
  restored.close();

  await assert.rejects(
    runBackup({
      databasePath,
      uploadsPath,
      sigamePacksPath,
      backupRoot,
      tarPath: '/usr/bin/tar',
      retentionDays: 30,
      currentDate: new Date('2026-07-25T00:00:01Z'),
    }),
    /missing required table/
  );
});

test('retention removes only strictly named expired snapshot directories', async t => {
  const backupRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'cheese-wheel-prune-test-'));
  t.after(() => fsp.rm(backupRoot, { recursive: true, force: true }));

  const expired = path.join(backupRoot, 'snapshot-20260101T000000Z');
  const current = path.join(backupRoot, 'snapshot-20260724T000000Z');
  const unrelated = path.join(backupRoot, 'snapshot-old');
  await Promise.all([
    fsp.mkdir(expired),
    fsp.mkdir(current),
    fsp.mkdir(unrelated),
  ]);
  await fsp.writeFile(path.join(expired, 'cheese_wheel.db'), 'old');

  const removed = await pruneSnapshots(
    backupRoot,
    30,
    new Date('2026-07-25T00:00:00Z')
  );

  assert.deepEqual(removed, [expired]);
  await assert.rejects(fsp.access(expired));
  await fsp.access(current);
  await fsp.access(unrelated);
});
