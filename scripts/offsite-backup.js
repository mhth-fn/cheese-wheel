#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const {
  assertSafeSnapshotPath,
  timestampFromSnapshotName,
  verifyDatabase,
  verifyManifest,
} = require('./backup');

const fsp = fs.promises;
const execFileAsync = promisify(execFile);

const DEFAULT_BACKUP_ROOT = '/var/backups/cheese-wheel';
const DEFAULT_RESTIC_BIN = '/usr/bin/restic';
const DEFAULT_TAR_BIN = '/usr/bin/tar';
const DEFAULT_TAG = 'cheese-wheel';
const EXTERNAL_REPOSITORY_RE = /^(?:s3|sftp|rest|azure|gs|b2|rclone|swift|https):/i;

function positiveInteger(value, fallback, label) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return parsed;
}

async function assertRegularFile(file, label) {
  const info = await fsp.lstat(file);
  if (!info.isFile() || info.isSymbolicLink()) {
    throw new Error(`${label} must be a regular file: ${file}`);
  }
}

async function findLatestSnapshot(backupRoot) {
  const resolvedRoot = path.resolve(backupRoot);
  const rootInfo = await fsp.lstat(resolvedRoot);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) {
    throw new Error(`Backup root must be a real directory: ${resolvedRoot}`);
  }

  const entries = await fsp.readdir(resolvedRoot, { withFileTypes: true });
  const candidates = entries
    .filter(entry => entry.isDirectory() && !entry.isSymbolicLink())
    .map(entry => ({
      name: entry.name,
      timestamp: timestampFromSnapshotName(entry.name),
    }))
    .filter(entry => entry.timestamp !== null)
    .sort((left, right) => right.timestamp - left.timestamp);

  if (candidates.length === 0) {
    throw new Error(`No verified snapshot directory found in ${resolvedRoot}`);
  }

  const snapshot = assertSafeSnapshotPath(
    resolvedRoot,
    path.join(resolvedRoot, candidates[0].name)
  );
  const snapshotInfo = await fsp.lstat(snapshot);
  if (!snapshotInfo.isDirectory() || snapshotInfo.isSymbolicLink()) {
    throw new Error(`Latest snapshot must be a real directory: ${snapshot}`);
  }
  return snapshot;
}

async function verifySnapshot(snapshot, tarBin, execute = execFileAsync) {
  await verifyManifest(snapshot, ['cheese_wheel.db', 'uploads.tar']);
  verifyDatabase(path.join(snapshot, 'cheese_wheel.db'));
  await execute(tarBin, ['--list', '--file', path.join(snapshot, 'uploads.tar')], {
    maxBuffer: 16 * 1024 * 1024,
    timeout: 5 * 60 * 1000,
  });
}

async function runOffsiteBackup(options = {}) {
  const environment = options.env || process.env;
  const repository = environment.RESTIC_REPOSITORY;
  if (!repository) {
    throw new Error('RESTIC_REPOSITORY is required for encrypted off-site backups');
  }
  if (!EXTERNAL_REPOSITORY_RE.test(repository)) {
    throw new Error('RESTIC_REPOSITORY must point to an external backend');
  }
  if (!environment.RESTIC_PASSWORD && !environment.RESTIC_PASSWORD_FILE) {
    throw new Error('RESTIC_PASSWORD_FILE or RESTIC_PASSWORD is required');
  }

  const backupRoot = path.resolve(
    options.backupRoot || environment.CHEESE_WHEEL_BACKUP_DIR || DEFAULT_BACKUP_ROOT
  );
  const resticBin = path.resolve(
    options.resticBin || environment.RESTIC_BIN || DEFAULT_RESTIC_BIN
  );
  const tarBin = path.resolve(options.tarBin || environment.TAR_BIN || DEFAULT_TAR_BIN);
  const execute = options.execute || execFileAsync;
  const resticEnvironment = { ...environment };
  const tag = environment.RESTIC_BACKUP_TAG || DEFAULT_TAG;
  const keepDaily = positiveInteger(environment.RESTIC_KEEP_DAILY, 14, 'RESTIC_KEEP_DAILY');
  const keepWeekly = positiveInteger(environment.RESTIC_KEEP_WEEKLY, 8, 'RESTIC_KEEP_WEEKLY');
  const keepMonthly = positiveInteger(
    environment.RESTIC_KEEP_MONTHLY,
    12,
    'RESTIC_KEEP_MONTHLY'
  );

  await assertRegularFile(resticBin, 'restic executable');
  await assertRegularFile(tarBin, 'tar executable');
  if (environment.RESTIC_PASSWORD_FILE) {
    resticEnvironment.RESTIC_PASSWORD_FILE = path.resolve(environment.RESTIC_PASSWORD_FILE);
    await assertRegularFile(resticEnvironment.RESTIC_PASSWORD_FILE, 'restic password file');
  }

  const snapshot = await findLatestSnapshot(backupRoot);
  await verifySnapshot(snapshot, tarBin, execute);

  const resticOptions = {
    env: resticEnvironment,
    maxBuffer: 8 * 1024 * 1024,
    timeout: 30 * 60 * 1000,
  };
  await execute(resticBin, [
    'backup',
    snapshot,
    '--host',
    environment.RESTIC_HOST || os.hostname(),
    '--tag',
    tag,
  ], resticOptions);

  const snapshotsResult = await execute(resticBin, [
    'snapshots',
    '--tag',
    tag,
    '--latest',
    '1',
    '--json',
  ], resticOptions);
  let snapshots;
  try {
    snapshots = JSON.parse(snapshotsResult.stdout || '[]');
  } catch {
    throw new Error('restic returned invalid snapshot verification output');
  }
  if (!Array.isArray(snapshots) || snapshots.length !== 1) {
    throw new Error('restic did not confirm the uploaded snapshot');
  }

  await execute(resticBin, [
    'forget',
    '--tag',
    tag,
    '--keep-daily',
    String(keepDaily),
    '--keep-weekly',
    String(keepWeekly),
    '--keep-monthly',
    String(keepMonthly),
    '--prune',
  ], resticOptions);

  if (environment.RESTIC_SKIP_CHECK !== '1') {
    await execute(resticBin, ['check'], resticOptions);
  }

  return {
    snapshot,
    repositoryConfigured: true,
  };
}

if (require.main === module) {
  runOffsiteBackup()
    .then(result => {
      console.log(
        `[cheese-wheel] Encrypted off-site backup verified: ${path.basename(result.snapshot)}`
      );
    })
    .catch(error => {
      console.error(`[cheese-wheel] Off-site backup failed: ${error.message}`);
      process.exitCode = 1;
    });
}

module.exports = {
  findLatestSnapshot,
  runOffsiteBackup,
  verifySnapshot,
};
