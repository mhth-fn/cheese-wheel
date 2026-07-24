'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const Database = require('better-sqlite3');
const { EXPECTED_TABLES, runBackup } = require('../scripts/backup');
const { findLatestSnapshot, runOffsiteBackup } = require('../scripts/offsite-backup');

const fsp = fs.promises;

async function createVerifiedSnapshot(root, currentDate) {
  const dataRoot = path.join(root, 'data');
  const uploadsPath = path.join(dataRoot, 'uploads');
  const backupRoot = path.join(root, 'backups');
  const databasePath = path.join(dataRoot, 'cheese_wheel.db');
  await fsp.mkdir(uploadsPath, { recursive: true });
  await fsp.writeFile(path.join(uploadsPath, 'center.jpg'), 'image fixture');

  const db = new Database(databasePath);
  for (const table of EXPECTED_TABLES) {
    db.exec(`CREATE TABLE IF NOT EXISTS "${table}" (id INTEGER PRIMARY KEY)`);
  }
  db.close();

  const result = await runBackup({
    databasePath,
    uploadsPath,
    backupRoot,
    tarPath: '/usr/bin/tar',
    retentionDays: 30,
    currentDate,
  });
  return { backupRoot, snapshot: result.snapshot };
}

test('encrypted off-site flow re-verifies and uploads only the latest snapshot', async t => {
  const fixtureRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'cheese-wheel-offsite-'));
  t.after(() => fsp.rm(fixtureRoot, { recursive: true, force: true }));

  const first = await createVerifiedSnapshot(fixtureRoot, new Date('2026-07-25T00:00:00Z'));
  await createVerifiedSnapshot(fixtureRoot, new Date('2026-07-25T01:00:00Z'));
  const latest = await findLatestSnapshot(first.backupRoot);
  assert.equal(path.basename(latest), 'snapshot-20260725T010000Z');

  const calls = [];
  const execute = async (binary, args) => {
    calls.push({ binary, args });
    if (args[0] === 'snapshots') return { stdout: '[{"id":"encrypted-copy"}]' };
    return { stdout: '' };
  };

  const result = await runOffsiteBackup({
    backupRoot: first.backupRoot,
    resticBin: '/usr/bin/true',
    tarBin: '/usr/bin/tar',
    execute,
    env: {
      RESTIC_REPOSITORY: 's3:https://storage.example.test/cheese-wheel',
      RESTIC_PASSWORD: 'test-only-password',
      RESTIC_HOST: 'test-host',
    },
  });

  assert.equal(result.snapshot, latest);
  assert.deepEqual(
    calls.map(call => call.args[0]),
    ['--list', 'backup', 'snapshots', 'forget', 'check']
  );
  const backupCall = calls.find(call => call.args[0] === 'backup');
  assert.ok(backupCall.args.includes(latest));
  assert.ok(backupCall.args.includes('test-host'));
});

test('off-site flow rejects a snapshot changed after local verification', async t => {
  const fixtureRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'cheese-wheel-offsite-tamper-'));
  t.after(() => fsp.rm(fixtureRoot, { recursive: true, force: true }));

  const fixture = await createVerifiedSnapshot(
    fixtureRoot,
    new Date('2026-07-25T00:00:00Z')
  );
  await fsp.appendFile(path.join(fixture.snapshot, 'uploads.tar'), 'tampered');

  await assert.rejects(
    runOffsiteBackup({
      backupRoot: fixture.backupRoot,
      resticBin: '/usr/bin/true',
      tarBin: '/usr/bin/tar',
      execute: async () => ({ stdout: '' }),
      env: {
        RESTIC_REPOSITORY: 's3:https://storage.example.test/cheese-wheel',
        RESTIC_PASSWORD: 'test-only-password',
      },
    }),
    /checksum verification failed/
  );
});

test('off-site flow refuses a repository on the same local filesystem', async () => {
  await assert.rejects(
    runOffsiteBackup({
      resticBin: '/usr/bin/true',
      tarBin: '/usr/bin/tar',
      env: {
        RESTIC_REPOSITORY: '/var/backups/not-off-site',
        RESTIC_PASSWORD: 'test-only-password',
      },
    }),
    /external backend/
  );
});
