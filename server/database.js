'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { createAuditLog } = require('../lib/audit-log');
const { createPersistentRateLimiter } = require('../lib/persistent-rate-limit');
const { createStatements } = require('./database-statements');
const {
  decryptTotpSecret,
  hashSessionToken,
  parseTotpEncryptionKey,
} = require('../lib/security');

function createDatabase({ rootDir, bootstrapAdminUserId }) {
  const BOOTSTRAP_ADMIN_USER_ID = bootstrapAdminUserId;
  let persistentRateLimiter = null;
  let auditLog = null;

// База данных
const dataDir = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : rootDir;
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
const sigamePacksPath = path.join(dataDir, 'sigame-packs');
if (!fs.existsSync(sigamePacksPath)) {
  fs.mkdirSync(sigamePacksPath, { recursive: true, mode: 0o750 });
}
for (const fileName of fs.readdirSync(sigamePacksPath)) {
  if (/^\.[a-f0-9-]{36}\.siq\.upload$/i.test(fileName)) {
    try {
      fs.unlinkSync(path.join(sigamePacksPath, fileName));
    } catch (error) {
      console.warn('[cheese-wheel] Could not remove interrupted SIGame upload:', error.message);
    }
  }
}
const db = new Database(path.join(dataDir, 'cheese_wheel.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

// Создание таблиц
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    password_hash TEXT,
    role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('member', 'admin'))
  );

  CREATE TABLE IF NOT EXISTS movies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    is_watched INTEGER DEFAULT 0,
    watched_at DATETIME
  );

  CREATE TABLE IF NOT EXISTS one_off_movies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    added_by INTEGER NOT NULL,
    added_at INTEGER NOT NULL,
    FOREIGN KEY (added_by) REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_one_off_movies_added_at
    ON one_off_movies(added_at, id);

  CREATE TABLE IF NOT EXISTS ratings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    movie_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 10),
    FOREIGN KEY (movie_id) REFERENCES movies(id),
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(movie_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS tokens (
    token TEXT PRIMARY KEY,
    user_id INTEGER,
    is_guest INTEGER DEFAULT 0,
    expires INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS user_totp (
    user_id INTEGER PRIMARY KEY,
    secret_enc TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0, 1)),
    pending_expires INTEGER,
    last_used_step INTEGER,
    enabled_at INTEGER,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS two_factor_recovery_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    code_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    used_at INTEGER,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, code_hash)
  );

  CREATE TABLE IF NOT EXISTS login_challenges (
    challenge_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires INTEGER NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_login_challenges_expires
    ON login_challenges(expires);

  CREATE INDEX IF NOT EXISTS idx_recovery_codes_user_unused
    ON two_factor_recovery_codes(user_id, used_at);

  CREATE TABLE IF NOT EXISTS vpn_clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    server_id TEXT NOT NULL,
    protocol TEXT NOT NULL DEFAULT 'vless'
      CHECK(protocol IN ('vless', 'amneziawg')),
    inbound_id INTEGER NOT NULL,
    client_id TEXT UNIQUE NOT NULL,
    email TEXT NOT NULL,
    device_name TEXT COLLATE NOCASE NOT NULL,
    connection_link TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(user_id, server_id, protocol, device_name)
  );

  CREATE TABLE IF NOT EXISTS review_reactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    review_type TEXT NOT NULL CHECK(review_type IN ('movie', 'wine', 'music', 'food')),
    review_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    reaction INTEGER NOT NULL CHECK(reaction IN (-1, 1)),
    UNIQUE(review_type, review_id, user_id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS wine_reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    recommend INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS music_reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    artist TEXT,
    music_type TEXT NOT NULL DEFAULT 'track'
      CHECK(music_type IN ('track', 'album', 'artist', 'playlist', 'live')),
    source_url TEXT,
    content TEXT NOT NULL,
    recommend INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS movie_reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    movie_id INTEGER,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    recommend INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT (datetime('now')),
    FOREIGN KEY (movie_id) REFERENCES movies(id) ON DELETE SET NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS sigame_packs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    pack_author TEXT,
    description TEXT,
    source_url TEXT,
    status TEXT NOT NULL DEFAULT 'planned'
      CHECK(status IN ('planned', 'played')),
    added_by INTEGER NOT NULL,
    added_at INTEGER NOT NULL,
    played_by INTEGER,
    played_at INTEGER,
    original_file_name TEXT,
    storage_key TEXT,
    file_size INTEGER,
    FOREIGN KEY (added_by) REFERENCES users(id),
    FOREIGN KEY (played_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS sigame_pack_tags (
    pack_id INTEGER NOT NULL,
    tag TEXT COLLATE NOCASE NOT NULL,
    PRIMARY KEY (pack_id, tag),
    FOREIGN KEY (pack_id) REFERENCES sigame_packs(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS sigame_pack_ratings (
    pack_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 10),
    rated_at INTEGER NOT NULL,
    PRIMARY KEY (pack_id, user_id),
    FOREIGN KEY (pack_id) REFERENCES sigame_packs(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS sigame_pack_reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pack_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    recommend INTEGER NOT NULL DEFAULT 1 CHECK(recommend IN (-1, 0, 1)),
    created_at DATETIME DEFAULT (datetime('now')),
    FOREIGN KEY (pack_id) REFERENCES sigame_packs(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(pack_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS food_reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    recommend INTEGER NOT NULL DEFAULT 1 CHECK(recommend IN (-1, 0, 1)),
    created_at DATETIME DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS food_review_photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    review_id INTEGER NOT NULL,
    storage_key TEXT NOT NULL UNIQUE,
    original_file_name TEXT,
    mime_type TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    added_at INTEGER NOT NULL,
    FOREIGN KEY (review_id) REFERENCES food_reviews(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS balda_games (
    id INTEGER PRIMARY KEY CHECK(id = 1),
    player_one_id INTEGER,
    player_two_id INTEGER,
    board_json TEXT NOT NULL,
    used_words_json TEXT NOT NULL,
    scores_json TEXT NOT NULL,
    moves_json TEXT NOT NULL,
    current_player_id INTEGER,
    status TEXT NOT NULL DEFAULT 'waiting'
      CHECK(status IN ('waiting', 'playing', 'finished')),
    winner_id INTEGER,
    pending_word_json TEXT,
    consecutive_passes INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (player_one_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (player_two_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (current_player_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (winner_id) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS balda_dictionary (
    word TEXT PRIMARY KEY,
    source TEXT NOT NULL DEFAULT 'players'
      CHECK(source IN ('built-in', 'players')),
    added_by INTEGER,
    approved_by INTEGER,
    added_at INTEGER NOT NULL,
    FOREIGN KEY (added_by) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_sigame_pack_reviews_pack
    ON sigame_pack_reviews(pack_id, created_at DESC);

  CREATE INDEX IF NOT EXISTS idx_food_review_photos_review
    ON food_review_photos(review_id, id);

  CREATE INDEX IF NOT EXISTS idx_sigame_packs_status_added
    ON sigame_packs(status, added_at DESC);

  CREATE INDEX IF NOT EXISTS idx_sigame_pack_tags_tag
    ON sigame_pack_tags(tag);
`);

// VPN v2: один и тот же аппарат может иметь отдельные VLESS и AmneziaWG
// конфигурации на одном сервере. Старые записи однозначно являются VLESS.
const vpnClientsSchema = db.prepare(`
  SELECT sql FROM sqlite_master
  WHERE type = 'table' AND name = 'vpn_clients'
`).get()?.sql || '';
if (!/\bprotocol\b/i.test(vpnClientsSchema)) {
  const migrateVpnProtocols = db.transaction(() => {
    db.exec(`
      ALTER TABLE vpn_clients RENAME TO vpn_clients_before_protocols;

      CREATE TABLE vpn_clients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        server_id TEXT NOT NULL,
        protocol TEXT NOT NULL DEFAULT 'vless'
          CHECK(protocol IN ('vless', 'amneziawg')),
        inbound_id INTEGER NOT NULL,
        client_id TEXT UNIQUE NOT NULL,
        email TEXT NOT NULL,
        device_name TEXT COLLATE NOCASE NOT NULL,
        connection_link TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id),
        UNIQUE(user_id, server_id, protocol, device_name)
      );

      INSERT INTO vpn_clients (
        id, user_id, server_id, protocol, inbound_id, client_id, email,
        device_name, connection_link, created_at
      )
      SELECT
        id, user_id, server_id, 'vless', inbound_id, client_id, email,
        device_name, connection_link, created_at
      FROM vpn_clients_before_protocols;

      DROP TABLE vpn_clients_before_protocols;
    `);
  });
  migrateVpnProtocols();
}

// Миграция SIGame v2: старые метаданные сохраняются, а новые записи получают
// закрытый .siq-файл. planned остаётся внутренним именем статуса unplayed.
[
  'original_file_name TEXT',
  'storage_key TEXT',
  'file_size INTEGER',
].forEach(column => {
  try {
    db.exec(`ALTER TABLE sigame_packs ADD COLUMN ${column}`);
  } catch (error) {
    // колонка уже существует
  }
});
db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_sigame_packs_storage_key
    ON sigame_packs(storage_key)
    WHERE storage_key IS NOT NULL;

  DELETE FROM sigame_pack_ratings
  WHERE pack_id IN (
    SELECT id FROM sigame_packs WHERE status = 'planned'
  );
`);

// Старое ограничение review_reactions не знало часть типов обзоров. SQLite
// не умеет расширять CHECK через ALTER COLUMN, поэтому атомарно пересобираем
// таблицу, сохраняя все существующие реакции.
const reviewReactionsSchema = db.prepare(`
  SELECT sql FROM sqlite_master
  WHERE type = 'table' AND name = 'review_reactions'
`).get()?.sql || '';
if (!reviewReactionsSchema.includes("'food'")) {
  const migrateReviewReactionTypes = db.transaction(() => {
    db.exec(`
      ALTER TABLE review_reactions RENAME TO review_reactions_before_food;

      CREATE TABLE review_reactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        review_type TEXT NOT NULL CHECK(review_type IN ('movie', 'wine', 'music', 'food')),
        review_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        reaction INTEGER NOT NULL CHECK(reaction IN (-1, 1)),
        UNIQUE(review_type, review_id, user_id),
        FOREIGN KEY (user_id) REFERENCES users(id)
      );

      INSERT INTO review_reactions (id, review_type, review_id, user_id, reaction)
      SELECT id, review_type, review_id, user_id, reaction
      FROM review_reactions_before_food;

      DROP TABLE review_reactions_before_food;
    `);
  });
  migrateReviewReactionTypes();
}

// Миграция: добавляем колонку password_hash если её нет
try {
  db.exec('ALTER TABLE users ADD COLUMN password_hash TEXT');
} catch (e) {
  // колонка уже существует
}

// Миграция: роли заменяют привязку административных прав к конкретному ID.
try {
  db.exec(`
    ALTER TABLE users
    ADD COLUMN role TEXT NOT NULL DEFAULT 'member'
      CHECK(role IN ('member', 'admin'))
  `);
} catch (e) {
  // колонка уже существует
}
db.exec("UPDATE users SET role = 'member' WHERE role IS NULL OR role NOT IN ('member', 'admin')");

// Старые cookies продолжают работать, но в БД вместо bearer-токенов
// остаются только их SHA-256 отпечатки. Маркер и замена атомарны.
const migrateSessionTokenHashes = db.transaction(() => {
  const marker = db.prepare(
    "SELECT value FROM settings WHERE key = 'migration_session_token_hash_v1'"
  ).get();
  if (marker) return;

  const legacyTokens = db.prepare('SELECT token FROM tokens').all();
  const updateToken = db.prepare('UPDATE tokens SET token = ? WHERE token = ?');
  legacyTokens.forEach(({ token }) => {
    const tokenHash = hashSessionToken(token);
    if (!tokenHash) {
      throw new Error('Cannot migrate an invalid legacy session token');
    }
    updateToken.run(tokenHash, token);
  });
  db.prepare(`
    INSERT INTO settings (key, value)
    VALUES ('migration_session_token_hash_v1', '1')
  `).run();
});

// Миграция: добавляем колонку added_by для фильмов
try {
  db.exec('ALTER TABLE movies ADD COLUMN added_by INTEGER REFERENCES users(id)');
} catch (e) {
  // колонка уже существует
}

// Миграция: добавляем колонку added_at для фильмов
try {
  db.exec('ALTER TABLE movies ADD COLUMN added_at DATE');
} catch (e) {
  // колонка уже существует
}

// Миграция: следующее колесо
try {
  db.exec('ALTER TABLE movies ADD COLUMN is_next_wheel INTEGER DEFAULT 0');
} catch (e) {
  // колонка уже существует
}

db.exec('UPDATE movies SET is_next_wheel = 0 WHERE is_next_wheel IS NULL');

// Миграция: дополнительные сведения о фильме
[
  'alternative_title TEXT',
  'director TEXT',
  'year INTEGER',
].forEach(column => {
  try {
    db.exec(`ALTER TABLE movies ADD COLUMN ${column}`);
  } catch (e) {
    // колонка уже существует
  }
});

// Старые дубликаты оставляли одному участнику несколько активных выборов.
// Сохраняем самый свежий выбор перед добавлением ограничений на уровне БД.
const removeDuplicateActiveChoices = db.transaction(() => {
  const duplicateIds = db.prepare(`
    SELECT older.id
    FROM movies older
    JOIN movies newer
      ON newer.added_by = older.added_by
      AND newer.is_watched = 0
      AND newer.is_next_wheel = older.is_next_wheel
      AND newer.id > older.id
    WHERE older.added_by IS NOT NULL
      AND older.is_watched = 0
    GROUP BY older.id
  `).all();

  const deleteRatings = db.prepare('DELETE FROM ratings WHERE movie_id = ?');
  const deleteMovie = db.prepare('DELETE FROM movies WHERE id = ?');
  duplicateIds.forEach(({ id }) => {
    deleteRatings.run(id);
    deleteMovie.run(id);
  });
});
removeDuplicateActiveChoices();

db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_movies_current_user
    ON movies (added_by)
    WHERE added_by IS NOT NULL AND is_watched = 0 AND is_next_wheel = 0;

  CREATE UNIQUE INDEX IF NOT EXISTS idx_movies_next_user
    ON movies (added_by)
    WHERE added_by IS NOT NULL AND is_watched = 0 AND is_next_wheel = 1;
`);

// Миграции: новые поля для обзоров на вино
['wine_type TEXT', 'grape TEXT', 'region TEXT', 'vintage INTEGER', 'price TEXT'].forEach(col => {
  try { db.exec(`ALTER TABLE wine_reviews ADD COLUMN ${col}`); } catch (e) {}
});

// Миграции: новые поля для обзоров на кино
['director TEXT', 'year INTEGER'].forEach(col => {
  try { db.exec(`ALTER TABLE movie_reviews ADD COLUMN ${col}`); } catch (e) {}
});
try {
  db.exec('ALTER TABLE movie_reviews ADD COLUMN movie_id INTEGER REFERENCES movies(id) ON DELETE SET NULL');
} catch (e) {
  // колонка уже существует
}
// Связываем старые рецензии только с единственным фильмом с тем же названием.
// Сравнение делаем в JS, потому что SQLite NOCASE не учитывает регистр кириллицы.
const normalizeReviewMovieTitle = value => String(value || '').trim().toLocaleLowerCase('ru-RU');
const movieReviewLinksMigrated = db.prepare(
  "SELECT value FROM settings WHERE key = 'migration_movie_review_links_v1'"
).get();
if (!movieReviewLinksMigrated) {
  const watchedMoviesForReviewLink = db.prepare(
    'SELECT id, title FROM movies WHERE is_watched = 1'
  ).all();
  const unlinkedMovieReviews = db.prepare(
    'SELECT id, title FROM movie_reviews WHERE movie_id IS NULL'
  ).all();
  const linkMovieReview = db.prepare('UPDATE movie_reviews SET movie_id = ? WHERE id = ?');
  const markMovieReviewLinksMigrated = db.prepare(
    "INSERT INTO settings (key, value) VALUES ('migration_movie_review_links_v1', '1')"
  );
  const linkLegacyMovieReviews = db.transaction(() => {
    unlinkedMovieReviews.forEach(review => {
      const normalizedTitle = normalizeReviewMovieTitle(review.title);
      const matches = watchedMoviesForReviewLink.filter(
        movie => normalizeReviewMovieTitle(movie.title) === normalizedTitle
      );
      if (matches.length === 1) linkMovieReview.run(matches[0].id, review.id);
    });
    markMovieReviewLinksMigrated.run();
  });
  linkLegacyMovieReviews();
}

// Один участник может занимать только одно место рецензии у конкретного
// просмотренного фильма. Старые дубли не удаляем: сохраняем последний связанным,
// а остальные оставляем в общем дневнике как несвязанные рецензии.
const migrateDuplicateLinkedMovieReviews = db.transaction(() => {
  const linkedReviews = db.prepare(`
    SELECT id, movie_id, user_id
    FROM movie_reviews
    WHERE movie_id IS NOT NULL
    ORDER BY created_at DESC, id DESC
  `).all();
  const seen = new Set();
  const unlinkReview = db.prepare('UPDATE movie_reviews SET movie_id = NULL WHERE id = ?');
  linkedReviews.forEach(review => {
    const key = `${review.movie_id}:${review.user_id}`;
    if (seen.has(key)) {
      unlinkReview.run(review.id);
      return;
    }
    seen.add(key);
  });
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_movie_reviews_user_movie
      ON movie_reviews(movie_id, user_id)
      WHERE movie_id IS NOT NULL;
  `);
});
migrateDuplicateLinkedMovieReviews();

db.exec('CREATE INDEX IF NOT EXISTS idx_movie_reviews_movie_id ON movie_reviews(movie_id)');

// Разовая миграция: перевод старого recommend=0 (Не рекомендую) в recommend=-1,
// чтобы освободить 0 для нового состояния "Сойдёт"
const migrationDone = db.prepare("SELECT value FROM settings WHERE key='migration_recommend_three_way'").get();
if (!migrationDone) {
  db.exec('UPDATE wine_reviews SET recommend = -1 WHERE recommend = 0');
  db.exec('UPDATE movie_reviews SET recommend = -1 WHERE recommend = 0');
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('migration_recommend_three_way', '1')").run();
}

// Хеширование пароля
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored) return false;
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  try {
    const expected = Buffer.from(hash, 'hex');
    const check = crypto.scryptSync(password, salt, 64);
    return expected.length === check.length && crypto.timingSafeEqual(expected, check);
  } catch {
    return false;
  }
}

// Добавляем пользователей
let DEFAULT_PASSWORD = process.env.DEFAULT_PASSWORD;
if (!DEFAULT_PASSWORD) {
  throw new Error('[cheese-wheel] DEFAULT_PASSWORD должен быть задан в окружении');
}
const DUMMY_PASSWORD_HASH = hashPassword(crypto.randomBytes(32).toString('hex'));
const seedUsers = [
  { id: 1, name: 'Антон' },
  { id: 2, name: 'Сергей' },
  { id: 3, name: 'Пётр' },
  { id: 4, name: 'Митя' },
  { id: 5, name: 'Егор' },
  { id: 6, name: 'Женя' },
  { id: 7, name: 'Юлий' },
];
const CORE_STATS_USER_NAMES = Object.freeze(['Антон', 'Митя', 'Пётр', 'Сергей', 'Егор']);
const insertUser = db.prepare('INSERT OR IGNORE INTO users (id, name, password_hash) VALUES (?, ?, ?)');
seedUsers.forEach(u => insertUser.run(u.id, u.name, hashPassword(DEFAULT_PASSWORD)));

// Прежний ID используется только в атомарной одноразовой миграции. После неё
// отсутствие администратора является ошибкой конфигурации, а не поводом снова
// неявно выдать права пользователю с фиксированным ID.
const bootstrapRoles = db.transaction(() => {
  const marker = db.prepare(
    "SELECT value FROM settings WHERE key = 'migration_roles_v1'"
  ).get();
  const countAdmins = () => db.prepare(
    "SELECT COUNT(*) AS count FROM users WHERE role = 'admin'"
  ).get().count;

  if (marker) {
    if (countAdmins() === 0) {
      throw new Error('[cheese-wheel] В системе не осталось ни одного администратора');
    }
    return;
  }

  if (countAdmins() === 0) {
    if (!Number.isInteger(BOOTSTRAP_ADMIN_USER_ID) || BOOTSTRAP_ADMIN_USER_ID < 1) {
      throw new Error('[cheese-wheel] BOOTSTRAP_ADMIN_USER_ID должен быть корректным ID');
    }
    const result = db.prepare(
      "UPDATE users SET role = 'admin' WHERE id = ?"
    ).run(BOOTSTRAP_ADMIN_USER_ID);
    if (result.changes !== 1) {
      throw new Error('[cheese-wheel] Не удалось назначить первоначального администратора');
    }
  }

  db.prepare(`
    INSERT INTO settings (key, value)
    VALUES ('migration_roles_v1', '1')
  `).run();
});
bootstrapRoles();
migrateSessionTokenHashes();

// Устанавливаем пароль тем, у кого его нет (после миграции)
const usersWithoutPassword = db.prepare('SELECT id FROM users WHERE password_hash IS NULL').all();
const setPassword = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?');
usersWithoutPassword.forEach(u => setPassword.run(hashPassword(DEFAULT_PASSWORD), u.id));

function getSecurityPepper(name) {
  const value = process.env[name];
  if (typeof value === 'string' && Buffer.byteLength(value, 'utf8') >= 32) {
    return value;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`[cheese-wheel] ${name} должен содержать минимум 32 случайных байта`);
  }
  return `${name}:development-only-do-not-use-in-production`;
}

persistentRateLimiter = createPersistentRateLimiter({
  db,
  pepper: getSecurityPepper('RATE_LIMIT_PEPPER'),
});
auditLog = createAuditLog(db, {
  pepper: getSecurityPepper('AUDIT_LOG_PEPPER'),
});

const auditCleanup = setInterval(() => {
  try {
    auditLog.cleanupExpired();
  } catch (error) {
    console.error('[cheese-wheel] Audit cleanup failed:', error.message);
  }
}, 24 * 60 * 60 * 1000);
auditCleanup.unref();

function getTotpEncryptionKey(required = false) {
  const configured = process.env.TOTP_ENCRYPTION_KEY;
  if (!configured) {
    if (required) {
      throw new Error(
        '[cheese-wheel] TOTP_ENCRYPTION_KEY должен быть задан для двухфакторной защиты'
      );
    }
    return null;
  }
  try {
    return parseTotpEncryptionKey(configured);
  } catch {
    if (required) {
      throw new Error(
        '[cheese-wheel] TOTP_ENCRYPTION_KEY должен содержать ровно 64 шестнадцатеричных символа'
      );
    }
    return null;
  }
}

// Просроченную незавершённую настройку можно безопасно забыть. Любое оставшееся
// состояние проверяем при старте, чтобы неверный ключ не заблокировал вход позже.
db.prepare(`
  DELETE FROM user_totp
  WHERE enabled = 0 AND pending_expires IS NOT NULL AND pending_expires < ?
`).run(Date.now());
const storedTotpRows = db.prepare('SELECT user_id, secret_enc FROM user_totp').all();
if (storedTotpRows.length > 0) {
  const totpKey = getTotpEncryptionKey(true);
  storedTotpRows.forEach(row => {
    try {
      decryptTotpSecret(row.secret_enc, totpKey, row.user_id);
    } catch {
      throw new Error(
        `[cheese-wheel] Не удалось расшифровать TOTP-секрет пользователя ${row.user_id}`
      );
    }
  });
}

// Дефолтные настройки
db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('spin_duration', '5')").run();
db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('theme', 'cheese')").run();
db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('spin_enabled', '1')").run();
db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('add_enabled', '1')").run();
db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('decorations_enabled', '1')").run();
db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('one_off_enabled', '0')").run();
db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('one_off_mode', 'selection')").run();
db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('one_off_spin_duration', '5')").run();

const {
  authSecurityStmts,
  sigameStmts,
  stmts,
  vpnStmts,
} = createStatements(db);

  return {
    CORE_STATS_USER_NAMES,
    DUMMY_PASSWORD_HASH,
    auditLog,
    authSecurityStmts,
    dataDir,
    db,
    getTotpEncryptionKey,
    hashPassword,
    normalizeReviewMovieTitle,
    persistentRateLimiter,
    sigamePacksPath,
    sigameStmts,
    stmts,
    verifyPassword,
    vpnStmts,
  };
}

module.exports = { createDatabase };
