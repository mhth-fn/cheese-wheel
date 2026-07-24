#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const { execFile } = require('child_process');
const Database = require('better-sqlite3');

const execFileAsync = promisify(execFile);
const fsp = fs.promises;

const DEFAULT_DB_PATH = '/var/lib/cheese-wheel/cheese_wheel.db';
const DEFAULT_UPLOADS_PATH = '/var/lib/cheese-wheel/uploads';
const DEFAULT_BACKUP_ROOT = '/var/backups/cheese-wheel';
const DEFAULT_TAR_PATH = '/usr/bin/tar';
const DEFAULT_RETENTION_DAYS = 30;
const SNAPSHOT_NAME_RE = /^snapshot-(\d{8})T(\d{6})Z$/;
const LEGACY_EXPECTED_TABLES = Object.freeze([
  'users',
  'movies',
  'ratings',
  'settings',
  'tokens',
  'vpn_clients',
  'review_reactions',
  'wine_reviews',
  'movie_reviews',
]);
const SECURITY_TABLES = Object.freeze([
  'user_totp',
  'two_factor_recovery_codes',
  'login_challenges',
  'rate_limit_buckets',
  'audit_log',
]);
const EXPECTED_TABLES = Object.freeze([
  ...LEGACY_EXPECTED_TABLES,
  ...SECURITY_TABLES,
]);

function parsePositiveInteger(value, fallback, label) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return parsed;
}

function formatTimestamp(date) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
    throw new TypeError('A valid Date is required');
  }
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function timestampFromSnapshotName(name) {
  const match = SNAPSHOT_NAME_RE.exec(name);
  if (!match) return null;

  const date = match[1];
  const time = match[2];
  const iso = `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`
    + `T${time.slice(0, 2)}:${time.slice(2, 4)}:${time.slice(4, 6)}Z`;
  const timestamp = Date.parse(iso);
  if (!Number.isFinite(timestamp) || formatTimestamp(new Date(timestamp)) !== `${date}T${time}Z`) {
    return null;
  }
  return timestamp;
}

async function ensureSecureDirectory(directory) {
  const resolved = path.resolve(directory);
  await fsp.mkdir(resolved, { recursive: true, mode: 0o700 });
  const info = await fsp.lstat(resolved);
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new Error(`Backup path is not a real directory: ${resolved}`);
  }
  if (typeof process.getuid === 'function' && process.getuid() === 0 && info.uid !== 0) {
    throw new Error(`Backup directory must be owned by root: ${resolved}`);
  }
  await fsp.chmod(resolved, 0o700);
  return fsp.realpath(resolved);
}

async function assertRegularFile(file, label) {
  const info = await fsp.lstat(file);
  if (!info.isFile() || info.isSymbolicLink()) {
    throw new Error(`${label} must be a regular file: ${file}`);
  }
}

async function assertRealDirectory(directory, label) {
  const info = await fsp.lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new Error(`${label} must be a real directory: ${directory}`);
  }
}

function pragmaValues(rows) {
  return rows.map(row => Object.values(row)[0]);
}

function verifyDatabase(databasePath, expectedTables = EXPECTED_TABLES) {
  const verificationDb = new Database(databasePath, {
    readonly: true,
    fileMustExist: true,
  });

  try {
    const integrityResults = pragmaValues(verificationDb.pragma('integrity_check'));
    if (integrityResults.length !== 1 || integrityResults[0] !== 'ok') {
      throw new Error(`SQLite integrity_check failed: ${integrityResults.join('; ')}`);
    }

    const foreignKeyFailures = verificationDb.pragma('foreign_key_check');
    if (foreignKeyFailures.length > 0) {
      throw new Error(`SQLite foreign_key_check found ${foreignKeyFailures.length} violation(s)`);
    }

    const tableStatement = verificationDb.prepare(
      "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?"
    );
    const missingTables = expectedTables.filter(table => !tableStatement.get(table));
    if (missingTables.length > 0) {
      throw new Error(`Backup is missing required table(s): ${missingTables.join(', ')}`);
    }
  } finally {
    verificationDb.close();
  }
}

function makeDatabaseStandalone(databasePath) {
  const snapshotDb = new Database(databasePath, {
    fileMustExist: true,
  });

  try {
    snapshotDb.pragma('busy_timeout = 10000');
    const journalMode = snapshotDb.pragma('journal_mode = DELETE', { simple: true });
    if (String(journalMode).toLowerCase() !== 'delete') {
      throw new Error(`Could not convert backup to standalone journal mode: ${journalMode}`);
    }
  } finally {
    snapshotDb.close();
  }
}

async function sha256File(file) {
  const hash = crypto.createHash('sha256');
  const stream = fs.createReadStream(file);
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest('hex');
}

async function writeAndVerifyManifest(snapshotDirectory, files) {
  const expected = new Map();
  for (const filename of files) {
    if (path.basename(filename) !== filename) {
      throw new Error(`Manifest filename must not contain a path: ${filename}`);
    }
    expected.set(filename, await sha256File(path.join(snapshotDirectory, filename)));
  }

  const manifestPath = path.join(snapshotDirectory, 'SHA256SUMS');
  const manifest = [...expected.entries()]
    .map(([filename, digest]) => `${digest}  ${filename}`)
    .join('\n') + '\n';
  await fsp.writeFile(manifestPath, manifest, { encoding: 'utf8', mode: 0o600 });
  await fsp.chmod(manifestPath, 0o600);

  const writtenManifest = await fsp.readFile(manifestPath, 'utf8');
  const entries = writtenManifest.trimEnd().split('\n');
  if (entries.length !== expected.size) {
    throw new Error('Backup checksum manifest has an unexpected number of entries');
  }

  for (const line of entries) {
    const match = /^([a-f0-9]{64})  ([A-Za-z0-9_.-]+)$/.exec(line);
    if (!match || !expected.has(match[2])) {
      throw new Error('Backup checksum manifest contains an invalid entry');
    }
    const actual = await sha256File(path.join(snapshotDirectory, match[2]));
    const expectedDigest = Buffer.from(match[1], 'hex');
    const actualDigest = Buffer.from(actual, 'hex');
    if (!crypto.timingSafeEqual(expectedDigest, actualDigest)) {
      throw new Error(`Backup checksum verification failed for ${match[2]}`);
    }
  }
}

async function verifyManifest(snapshotDirectory, files) {
  const expectedFiles = new Set(files);
  const manifestPath = path.join(snapshotDirectory, 'SHA256SUMS');
  await assertRegularFile(manifestPath, 'Backup checksum manifest');

  const manifest = await fsp.readFile(manifestPath, 'utf8');
  const entries = manifest.trimEnd().split('\n');
  if (entries.length !== expectedFiles.size) {
    throw new Error('Backup checksum manifest has an unexpected number of entries');
  }

  const seen = new Set();
  for (const line of entries) {
    const match = /^([a-f0-9]{64})  ([A-Za-z0-9_.-]+)$/.exec(line);
    if (!match || !expectedFiles.has(match[2]) || seen.has(match[2])) {
      throw new Error('Backup checksum manifest contains an invalid entry');
    }
    seen.add(match[2]);

    const backupFile = path.join(snapshotDirectory, match[2]);
    await assertRegularFile(backupFile, `Backup file ${match[2]}`);
    const actual = await sha256File(backupFile);
    const expectedDigest = Buffer.from(match[1], 'hex');
    const actualDigest = Buffer.from(actual, 'hex');
    if (!crypto.timingSafeEqual(expectedDigest, actualDigest)) {
      throw new Error(`Backup checksum verification failed for ${match[2]}`);
    }
  }

  if (seen.size !== expectedFiles.size) {
    throw new Error('Backup checksum manifest is missing an expected entry');
  }
}

async function archiveAndVerifyUploads(uploadsPath, archivePath, tarPath) {
  const resolvedUploads = path.resolve(uploadsPath);
  await assertRealDirectory(resolvedUploads, 'Uploads path');

  const parent = path.dirname(resolvedUploads);
  const basename = path.basename(resolvedUploads);
  await execFileAsync(tarPath, [
    '--create',
    '--file',
    archivePath,
    '--directory',
    parent,
    '--one-file-system',
    '--',
    basename,
  ], {
    maxBuffer: 16 * 1024 * 1024,
    timeout: 5 * 60 * 1000,
  });
  await fsp.chmod(archivePath, 0o600);

  await execFileAsync(tarPath, [
    '--list',
    '--file',
    archivePath,
  ], {
    maxBuffer: 16 * 1024 * 1024,
    timeout: 5 * 60 * 1000,
  });
}

function assertSafeSnapshotPath(backupRoot, candidate) {
  const resolvedRoot = path.resolve(backupRoot);
  const resolvedCandidate = path.resolve(candidate);
  const basename = path.basename(resolvedCandidate);

  if (
    path.dirname(resolvedCandidate) !== resolvedRoot
    || !SNAPSHOT_NAME_RE.test(basename)
    || timestampFromSnapshotName(basename) === null
  ) {
    throw new Error(`Refusing unsafe backup retention path: ${resolvedCandidate}`);
  }
  return resolvedCandidate;
}

async function pruneSnapshots(backupRoot, retentionDays, currentDate = new Date()) {
  const cutoff = currentDate.getTime() - retentionDays * 24 * 60 * 60 * 1000;
  const entries = await fsp.readdir(backupRoot, { withFileTypes: true });
  const removed = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const snapshotTime = timestampFromSnapshotName(entry.name);
    if (snapshotTime === null || snapshotTime >= cutoff) continue;

    const candidate = assertSafeSnapshotPath(backupRoot, path.join(backupRoot, entry.name));
    const info = await fsp.lstat(candidate);
    if (!info.isDirectory() || info.isSymbolicLink()) {
      throw new Error(`Refusing to remove non-directory backup path: ${candidate}`);
    }
    await fsp.rm(candidate, { recursive: true, force: false });
    removed.push(candidate);
  }

  return removed;
}

async function runBackup(options = {}) {
  const originalUmask = process.umask(0o077);
  let sourceDb;
  let temporaryDirectory;

  try {
    const databasePath = path.resolve(options.databasePath || process.env.CHEESE_WHEEL_DB || DEFAULT_DB_PATH);
    const uploadsPath = path.resolve(options.uploadsPath || process.env.CHEESE_WHEEL_UPLOADS || DEFAULT_UPLOADS_PATH);
    const backupRoot = await ensureSecureDirectory(
      options.backupRoot || process.env.CHEESE_WHEEL_BACKUP_DIR || DEFAULT_BACKUP_ROOT
    );
    const tarPath = options.tarPath || process.env.TAR_BIN || DEFAULT_TAR_PATH;
    const retentionDays = parsePositiveInteger(
      options.retentionDays ?? process.env.CHEESE_WHEEL_BACKUP_RETENTION_DAYS,
      DEFAULT_RETENTION_DAYS,
      'Backup retention days'
    );
    const currentDate = options.currentDate || new Date();
    const timestamp = formatTimestamp(currentDate);
    const finalDirectory = assertSafeSnapshotPath(
      backupRoot,
      path.join(backupRoot, `snapshot-${timestamp}`)
    );

    await assertRegularFile(databasePath, 'SQLite database');
    await assertRegularFile(tarPath, 'tar executable');
    await assertRealDirectory(uploadsPath, 'Uploads path');

    try {
      await fsp.lstat(finalDirectory);
      throw new Error(`Backup snapshot already exists: ${finalDirectory}`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }

    temporaryDirectory = await fsp.mkdtemp(path.join(backupRoot, `.snapshot-${timestamp}.`));
    await fsp.chmod(temporaryDirectory, 0o700);

    const backupDatabasePath = path.join(temporaryDirectory, 'cheese_wheel.db');
    const uploadsArchivePath = path.join(temporaryDirectory, 'uploads.tar');

    sourceDb = new Database(databasePath, {
      readonly: true,
      fileMustExist: true,
    });
    sourceDb.pragma('busy_timeout = 10000');
    const sourceTables = sourceDb.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `).all().map(row => row.name);
    if (sourceTables.length === 0) {
      throw new Error('Source SQLite database does not contain application tables');
    }

    let requiredTables = options.expectedTables;
    if (!requiredTables) {
      if (options.allowLegacySchema) {
        const presentSecurityTables = SECURITY_TABLES.filter(table => sourceTables.includes(table));
        if (
          presentSecurityTables.length !== 0
          && presentSecurityTables.length !== SECURITY_TABLES.length
        ) {
          throw new Error(
            'Source SQLite database has a partial security schema; refusing bootstrap backup'
          );
        }
        requiredTables = presentSecurityTables.length === 0
          ? LEGACY_EXPECTED_TABLES
          : EXPECTED_TABLES;
      } else {
        requiredTables = EXPECTED_TABLES;
      }
    }
    const missingSourceTables = requiredTables.filter(table => !sourceTables.includes(table));
    if (missingSourceTables.length > 0) {
      throw new Error(
        `Source SQLite database is missing required table(s): ${missingSourceTables.join(', ')}`
      );
    }
    const snapshotTables = [...new Set([...requiredTables, ...sourceTables])];

    await sourceDb.backup(backupDatabasePath);
    sourceDb.close();
    sourceDb = null;
    makeDatabaseStandalone(backupDatabasePath);
    await fsp.chmod(backupDatabasePath, 0o600);

    verifyDatabase(backupDatabasePath, snapshotTables);
    await archiveAndVerifyUploads(uploadsPath, uploadsArchivePath, tarPath);
    await writeAndVerifyManifest(temporaryDirectory, [
      'cheese_wheel.db',
      'uploads.tar',
    ]);

    await fsp.rename(temporaryDirectory, finalDirectory);
    temporaryDirectory = null;

    const removed = await pruneSnapshots(backupRoot, retentionDays, currentDate);
    return {
      snapshot: finalDirectory,
      removed,
    };
  } finally {
    if (sourceDb?.open) sourceDb.close();
    if (temporaryDirectory) {
      await fsp.rm(temporaryDirectory, { recursive: true, force: true });
    }
    process.umask(originalUmask);
  }
}

if (require.main === module) {
  const commandArguments = process.argv.slice(2);
  const allowedArguments = new Set(['--legacy-bootstrap']);
  const unknownArgument = commandArguments.find(argument => !allowedArguments.has(argument));
  if (unknownArgument) {
    console.error(`[cheese-wheel] Unknown backup option: ${unknownArgument}`);
    process.exitCode = 1;
  }

  const backupPromise = unknownArgument
    ? Promise.reject(new Error('Invalid backup command line'))
    : runBackup({ allowLegacySchema: commandArguments.includes('--legacy-bootstrap') });
  backupPromise
    .then(result => {
      console.log(`[cheese-wheel] Verified backup created: ${result.snapshot}`);
      if (result.removed.length > 0) {
        console.log(`[cheese-wheel] Expired snapshots removed: ${result.removed.length}`);
      }
    })
    .catch(error => {
      console.error('[cheese-wheel] Backup failed:', error);
      process.exitCode = 1;
    });
}

module.exports = {
  EXPECTED_TABLES,
  LEGACY_EXPECTED_TABLES,
  SECURITY_TABLES,
  assertSafeSnapshotPath,
  formatTimestamp,
  makeDatabaseStandalone,
  pruneSnapshots,
  runBackup,
  timestampFromSnapshotName,
  verifyDatabase,
  verifyManifest,
  writeAndVerifyManifest,
};
