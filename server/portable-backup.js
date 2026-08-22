'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const Database = require('better-sqlite3');
const {
  formatTimestamp,
  runBackup,
  verifyDatabase,
  verifyManifest,
  writeAndVerifyManifest,
} = require('../scripts/backup');

const execFileAsync = promisify(execFile);
const fsp = fs.promises;
const DEFAULT_TAR_PATH = '/usr/bin/tar';
const EXPORT_DIRECTORY_NAME = '.portable-exports';
const EXPORT_DIRECTORY_PREFIX = 'export-';
const STALE_EXPORT_AGE_MS = 12 * 60 * 60 * 1000;
const SNAPSHOT_FILES = Object.freeze([
  'cheese_wheel.db',
  'sigame-packs.index.json',
  'sigame-packs.tar',
  'uploads.tar',
]);
const DEFAULT_APP_ENTRIES = Object.freeze([
  'index.html',
  'lib',
  'package-lock.json',
  'package.json',
  'public',
  'README.md',
  'scripts',
  'server',
  'server.js',
  'src',
  'vite.config.js',
]);
const SENSITIVE_RUNTIME_TABLES = Object.freeze([
  'tokens',
  'login_challenges',
  'user_invitations',
  'two_factor_recovery_codes',
  'user_totp',
  'rate_limit_buckets',
]);

function portableReadme() {
  return `# Переносимая копия «Сырного колеса»

Этот архив содержит код сайта, базу данных, загруженные изображения и пакеты SIGame.
Храните его в закрытом месте: в базе остаются пользовательские данные, хэши паролей
и созданные VPN-конфигурации.

Для безопасности из копии удалены активные сессии, незавершённые приглашения,
ограничители запросов и все данные двухфакторной аутентификации. После запуска
пользователи входят со своими прежними паролями, а 2FA при необходимости включают заново.
Файл .env и серверные секреты в архив не входят.

## Что потребуется

- актуальный Node.js LTS (20.19+, 22.12+): https://nodejs.org/
- интернет при первом запуске, чтобы npm установил зависимости

## macOS / Linux

Откройте терминал в этой папке и выполните:

    ./start-local.sh

Если система не разрешила запуск:

    chmod +x start-local.sh
    ./start-local.sh

## Windows

Откройте PowerShell в этой папке и выполните:

    powershell -ExecutionPolicy Bypass -File .\\start-local.ps1

После запуска откройте http://127.0.0.1:3000. При первом запуске рядом появится
папка runtime-data. Все дальнейшие изменения сохраняются в ней; исходный снимок
в папке snapshot остаётся нетронутым и позволяет начать восстановление заново.
`;
}

function posixStartScript() {
  return `#!/usr/bin/env bash
set -euo pipefail

BUNDLE_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
RUNTIME_DIR="$BUNDLE_DIR/runtime-data"
SNAPSHOT_DIR="$BUNDLE_DIR/snapshot"

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "Нужен актуальный Node.js LTS: https://nodejs.org/" >&2
  exit 1
fi

if ! node -e "const [major, minor] = process.versions.node.split('.').map(Number); process.exit((major === 20 && minor >= 19) || (major === 22 && minor >= 12) || major > 22 ? 0 : 1)"; then
  echo "Нужен Node.js 20.19+, 22.12+ или новее. Сейчас установлен: $(node --version)" >&2
  exit 1
fi
NODE_VERSION="$(node -p "process.versions.node")"

if [ ! -f "$RUNTIME_DIR/cheese_wheel.db" ]; then
  mkdir -p "$RUNTIME_DIR"
  cp "$SNAPSHOT_DIR/cheese_wheel.db" "$RUNTIME_DIR/cheese_wheel.db"
  tar -xf "$SNAPSHOT_DIR/uploads.tar" -C "$RUNTIME_DIR"
  tar -xf "$SNAPSHOT_DIR/sigame-packs.tar" -C "$RUNTIME_DIR"
fi

cd "$BUNDLE_DIR/app"
DEPENDENCY_MARKER="$BUNDLE_DIR/app/node_modules/.cheese-wheel-node-version"
if [ ! -f "$DEPENDENCY_MARKER" ] || [ "$(cat "$DEPENDENCY_MARKER")" != "$NODE_VERSION" ]; then
  npm ci
  printf '%s' "$NODE_VERSION" > "$DEPENDENCY_MARKER"
fi
npm run build

NODE_ENV=development \\
HOST=127.0.0.1 \\
PORT=3000 \\
APP_ORIGIN=http://127.0.0.1:3000 \\
DATA_DIR="$RUNTIME_DIR" \\
UPLOADS_PATH="$RUNTIME_DIR/uploads" \\
npm start
`;
}

function powershellStartScript() {
  return `$ErrorActionPreference = "Stop"
$BundleDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RuntimeDir = Join-Path $BundleDir "runtime-data"
$SnapshotDir = Join-Path $BundleDir "snapshot"

if (-not (Get-Command node -ErrorAction SilentlyContinue) -or -not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw "Нужен актуальный Node.js LTS: https://nodejs.org/"
}

$NodeVersion = (node -p "process.versions.node").Trim()
$NodeParts = $NodeVersion.Split('.')
$NodeMajor = [int]$NodeParts[0]
$NodeMinor = [int]$NodeParts[1]
$SupportedNode = (($NodeMajor -eq 20 -and $NodeMinor -ge 19) -or ($NodeMajor -eq 22 -and $NodeMinor -ge 12) -or $NodeMajor -gt 22)
if (-not $SupportedNode) {
  throw "Нужен Node.js 20.19+, 22.12+ или новее. Сейчас установлен: $(node --version)"
}

$RuntimeDatabase = Join-Path $RuntimeDir "cheese_wheel.db"
if (-not (Test-Path $RuntimeDatabase)) {
  New-Item -ItemType Directory -Path $RuntimeDir -Force | Out-Null
  Copy-Item (Join-Path $SnapshotDir "cheese_wheel.db") $RuntimeDatabase
  tar -xf (Join-Path $SnapshotDir "uploads.tar") -C $RuntimeDir
  if ($LASTEXITCODE -ne 0) { throw "Не удалось распаковать uploads.tar" }
  tar -xf (Join-Path $SnapshotDir "sigame-packs.tar") -C $RuntimeDir
  if ($LASTEXITCODE -ne 0) { throw "Не удалось распаковать sigame-packs.tar" }
}

Set-Location (Join-Path $BundleDir "app")
$DependencyMarker = Join-Path $BundleDir "app/node_modules/.cheese-wheel-node-version"
$InstalledVersion = if (Test-Path $DependencyMarker) { (Get-Content $DependencyMarker -Raw).Trim() } else { "" }
if ($InstalledVersion -ne $NodeVersion) {
  npm ci
  if ($LASTEXITCODE -ne 0) { throw "npm ci завершился с ошибкой" }
  Set-Content -Path $DependencyMarker -Value $NodeVersion -NoNewline
}
npm run build
if ($LASTEXITCODE -ne 0) { throw "Сборка сайта завершилась с ошибкой" }

$env:NODE_ENV = "development"
$env:HOST = "127.0.0.1"
$env:PORT = "3000"
$env:APP_ORIGIN = "http://127.0.0.1:3000"
$env:DATA_DIR = $RuntimeDir
$env:UPLOADS_PATH = Join-Path $RuntimeDir "uploads"
npm start
`;
}

function assertSafeEntryName(entry) {
  if (
    typeof entry !== 'string'
    || !entry
    || path.isAbsolute(entry)
    || entry.includes('..')
    || entry.includes('/')
    || entry.includes('\\')
  ) {
    throw new Error(`Unsafe portable backup app entry: ${entry}`);
  }
}

async function copyRegularTree(source, destination) {
  const info = await fsp.lstat(source);
  if (info.isSymbolicLink()) {
    throw new Error(`Refusing symbolic link in portable backup source: ${source}`);
  }
  if (info.isFile()) {
    await fsp.copyFile(source, destination, fs.constants.COPYFILE_EXCL);
    await fsp.chmod(destination, 0o600);
    return;
  }
  if (!info.isDirectory()) {
    throw new Error(`Unsupported portable backup source entry: ${source}`);
  }

  await fsp.mkdir(destination, { mode: 0o700 });
  const children = await fsp.readdir(source);
  children.sort((left, right) => left.localeCompare(right));
  for (const child of children) {
    await copyRegularTree(path.join(source, child), path.join(destination, child));
  }
}

function sanitizePortableDatabase(databasePath) {
  const portableDb = new Database(databasePath, { fileMustExist: true });
  try {
    portableDb.pragma('busy_timeout = 10000');
    portableDb.pragma('foreign_keys = ON');
    portableDb.pragma('secure_delete = ON');
    const tableExists = portableDb.prepare(
      "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?"
    );
    const presentTables = portableDb.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `).all().map(row => row.name);
    const clearSensitiveData = portableDb.transaction(() => {
      for (const table of SENSITIVE_RUNTIME_TABLES) {
        if (tableExists.get(table)) portableDb.prepare(`DELETE FROM ${table}`).run();
      }
    });
    clearSensitiveData();
    portableDb.exec('VACUUM');
    return presentTables;
  } finally {
    portableDb.close();
  }
}

async function cleanStaleExports(exportsRoot, currentDate) {
  const entries = await fsp.readdir(exportsRoot, { withFileTypes: true });
  const cutoff = currentDate.getTime() - STALE_EXPORT_AGE_MS;
  for (const entry of entries) {
    if (
      !entry.isDirectory()
      || entry.isSymbolicLink()
      || !/^export-[A-Za-z0-9_-]{6,64}$/u.test(entry.name)
    ) continue;
    const candidate = path.join(exportsRoot, entry.name);
    const info = await fsp.lstat(candidate);
    if (info.mtimeMs < cutoff) {
      await fsp.rm(candidate, { recursive: true, force: true });
    }
  }
}

async function createPortableBackup(options) {
  const {
    dataDir,
    rootDir,
    uploadsPath,
    sigamePacksPath,
  } = options;
  const currentDate = options.currentDate || new Date();
  const tarPath = await fsp.realpath(options.tarPath || DEFAULT_TAR_PATH);
  const appEntries = options.appEntries || DEFAULT_APP_ENTRIES;
  const resolvedDataDir = path.resolve(dataDir);
  const resolvedRootDir = path.resolve(rootDir);
  const exportsRoot = path.join(resolvedDataDir, EXPORT_DIRECTORY_NAME);
  let workDirectory;

  await fsp.mkdir(exportsRoot, { recursive: true, mode: 0o700 });
  const exportsInfo = await fsp.lstat(exportsRoot);
  if (!exportsInfo.isDirectory() || exportsInfo.isSymbolicLink()) {
    throw new Error('Portable export path is not a real directory');
  }
  await fsp.chmod(exportsRoot, 0o700);
  await cleanStaleExports(exportsRoot, currentDate);

  try {
    workDirectory = await fsp.mkdtemp(path.join(exportsRoot, EXPORT_DIRECTORY_PREFIX));
    await fsp.chmod(workDirectory, 0o700);
    const backupRoot = path.join(workDirectory, 'snapshots');
    const bundleParent = path.join(workDirectory, 'bundle');
    const bundleDirectory = path.join(bundleParent, 'cheese-wheel-portable');
    const appDirectory = path.join(bundleDirectory, 'app');
    const snapshotDirectory = path.join(bundleDirectory, 'snapshot');

    const backup = await runBackup({
      databasePath: path.join(resolvedDataDir, 'cheese_wheel.db'),
      uploadsPath,
      sigamePacksPath,
      backupRoot,
      tarPath,
      retentionDays: 1,
      currentDate,
      expectedTables: options.expectedTables,
    });
    const databasePath = path.join(backup.snapshot, 'cheese_wheel.db');
    const snapshotTables = sanitizePortableDatabase(databasePath);
    verifyDatabase(databasePath, snapshotTables);
    await writeAndVerifyManifest(backup.snapshot, SNAPSHOT_FILES);
    await verifyManifest(backup.snapshot, SNAPSHOT_FILES);

    await fsp.mkdir(appDirectory, { recursive: true, mode: 0o700 });
    for (const entry of appEntries) {
      assertSafeEntryName(entry);
      await copyRegularTree(
        path.join(resolvedRootDir, entry),
        path.join(appDirectory, entry)
      );
    }
    await fsp.mkdir(bundleParent, { recursive: true, mode: 0o700 });
    await fsp.rename(backup.snapshot, snapshotDirectory);
    await fsp.writeFile(path.join(bundleDirectory, 'README-RU.md'), portableReadme(), {
      encoding: 'utf8',
      mode: 0o600,
    });
    await fsp.writeFile(path.join(bundleDirectory, 'start-local.sh'), posixStartScript(), {
      encoding: 'utf8',
      mode: 0o700,
    });
    await fsp.writeFile(path.join(bundleDirectory, 'start-local.ps1'), powershellStartScript(), {
      encoding: 'utf8',
      mode: 0o600,
    });

    const timestamp = formatTimestamp(currentDate);
    const fileName = `cheese-wheel-portable-${timestamp}.tar.gz`;
    const archivePath = path.join(workDirectory, fileName);
    await execFileAsync(tarPath, [
      '--create',
      '--gzip',
      '--file',
      archivePath,
      '--directory',
      bundleParent,
      '--',
      path.basename(bundleDirectory),
    ], {
      maxBuffer: 32 * 1024 * 1024,
      timeout: 10 * 60 * 1000,
    });
    await fsp.chmod(archivePath, 0o600);
    const listing = await execFileAsync(tarPath, [
      '--list',
      '--gzip',
      '--file',
      archivePath,
    ], {
      maxBuffer: 32 * 1024 * 1024,
      timeout: 10 * 60 * 1000,
    });
    if (!listing.stdout.includes('cheese-wheel-portable/snapshot/cheese_wheel.db')) {
      throw new Error('Portable archive verification did not find the database');
    }

    let cleaned = false;
    return {
      archivePath,
      fileName,
      cleanup: async () => {
        if (cleaned) return;
        cleaned = true;
        await fsp.rm(workDirectory, { recursive: true, force: true });
      },
    };
  } catch (error) {
    if (workDirectory) {
      await fsp.rm(workDirectory, { recursive: true, force: true }).catch(() => {});
    }
    throw error;
  }
}

module.exports = {
  DEFAULT_APP_ENTRIES,
  SENSITIVE_RUNTIME_TABLES,
  createPortableBackup,
  sanitizePortableDatabase,
};
