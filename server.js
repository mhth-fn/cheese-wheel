//TODO: декомпозировать файл
const express = require('express');
const { createServer } = require('http');
const https = require('https');
const net = require('net');
const { Server } = require('socket.io');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const server = createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

const crypto = require('crypto');

const VPN_MAX_CLIENTS_PER_SERVER = Math.min(
  Math.max(Number.parseInt(process.env.VPN_MAX_CLIENTS_PER_SERVER || '10', 10) || 10, 1),
  20
);
const VPN_SERVERS = [
  {
    id: 'primary',
    label: 'Амстердам Timeweb',
    address: '31.130.128.212',
    baseUrl: process.env.XUI_PRIMARY_URL,
    username: process.env.XUI_PRIMARY_USERNAME,
    password: process.env.XUI_PRIMARY_PASSWORD,
    inboundId: Number.parseInt(process.env.XUI_PRIMARY_INBOUND_ID || '2', 10),
    tlsFingerprint: process.env.XUI_PRIMARY_TLS_FINGERPRINT,
  },
  {
    id: 'secondary',
    label: 'Франкфурт Cloudzy',
    address: '172.86.69.135',
    baseUrl: process.env.XUI_SECONDARY_URL,
    username: process.env.XUI_SECONDARY_USERNAME,
    password: process.env.XUI_SECONDARY_PASSWORD,
    inboundId: Number.parseInt(process.env.XUI_SECONDARY_INBOUND_ID || '2', 10),
    tlsFingerprint: process.env.XUI_SECONDARY_TLS_FINGERPRINT,
  },
];
const xuiSessions = new Map();
const vpnMutations = new Set();

function getVpnServer(serverId) {
  return VPN_SERVERS.find(server => server.id === serverId);
}

function isVpnServerConfigured(server) {
  return Boolean(
    server?.baseUrl &&
    server.username &&
    server.password &&
    server.tlsFingerprint &&
    Number.isInteger(server.inboundId)
  );
}

function normalizeFingerprint(value) {
  return String(value || '').replaceAll(':', '').trim().toUpperCase();
}

function parseXuiJson(value, fallback = {}) {
  if (value && typeof value === 'object') return value;
  if (typeof value !== 'string') return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function requestXui(serverConfig, pathname, options = {}) {
  const url = new URL(pathname, serverConfig.baseUrl);
  const body = options.body || '';

  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: options.method || 'GET',
      agent: false,
      rejectUnauthorized: false,
      headers: {
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
        ...options.headers,
      },
      timeout: 10000,
    }, response => {
      const expectedFingerprint = normalizeFingerprint(serverConfig.tlsFingerprint);
      const actualFingerprint = normalizeFingerprint(
        response.socket.getPeerCertificate()?.fingerprint256
      );
      if (!actualFingerprint || actualFingerprint !== expectedFingerprint) {
        response.resume();
        reject(new Error(`TLS fingerprint mismatch for ${serverConfig.id}`));
        return;
      }

      let responseBody = '';
      response.setEncoding('utf8');
      response.on('data', chunk => {
        responseBody += chunk;
        if (responseBody.length > 1024 * 1024) {
          req.destroy(new Error('x-ui response is too large'));
        }
      });
      response.on('end', () => {
        resolve({
          status: response.statusCode || 0,
          headers: response.headers,
          body: responseBody,
        });
      });
    });

    req.on('timeout', () => req.destroy(new Error('x-ui request timed out')));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function loginXui(serverConfig) {
  const body = new URLSearchParams({
    username: serverConfig.username,
    password: serverConfig.password,
  }).toString();
  const response = await requestXui(serverConfig, 'login', {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  const payload = parseXuiJson(response.body, null);
  if (response.status < 200 || response.status >= 300 || !payload?.success) {
    throw new Error(`x-ui login failed for ${serverConfig.id}`);
  }

  const cookies = response.headers['set-cookie'] || [];
  const cookie = cookies.map(value => value.split(';')[0]).join('; ');
  if (!cookie) throw new Error(`x-ui did not return a session for ${serverConfig.id}`);
  xuiSessions.set(serverConfig.id, cookie);
  return cookie;
}

async function callXuiApi(serverConfig, pathname, options = {}, retry = true) {
  let cookie = xuiSessions.get(serverConfig.id);
  if (!cookie) cookie = await loginXui(serverConfig);

  const response = await requestXui(serverConfig, pathname, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      Cookie: cookie,
      ...options.headers,
    },
  });

  if (response.status === 401 && retry) {
    xuiSessions.delete(serverConfig.id);
    return callXuiApi(serverConfig, pathname, options, false);
  }

  const payload = parseXuiJson(response.body, null);
  if (
    response.status < 200 ||
    response.status >= 300 ||
    !payload ||
    payload.success === false
  ) {
    throw new Error(`x-ui API request failed for ${serverConfig.id}`);
  }
  return payload.obj ?? payload;
}

function buildVlessLink(serverConfig, inbound, client, deviceName) {
  const streamSettings = parseXuiJson(inbound.streamSettings);
  const reality = streamSettings.realitySettings || {};
  const realityClient = reality.settings || {};
  const serverName = reality.serverNames?.[0] || realityClient.serverName;
  const shortId = reality.shortIds?.[0];
  const publicKey = realityClient.publicKey;

  if (
    inbound.protocol !== 'vless' ||
    streamSettings.security !== 'reality' ||
    !serverName ||
    !shortId ||
    !publicKey
  ) {
    throw new Error(`Unsupported inbound configuration for ${serverConfig.id}`);
  }

  const params = new URLSearchParams({
    encryption: 'none',
    flow: client.flow,
    security: 'reality',
    sni: serverName,
    fp: realityClient.fingerprint || 'chrome',
    pbk: publicKey,
    sid: shortId,
    spx: realityClient.spiderX || '/',
    type: streamSettings.network || 'tcp',
  });
  const label = encodeURIComponent(`${deviceName} · ${serverConfig.label}`);
  return `vless://${client.id}@${serverConfig.address}:${inbound.port}?${params.toString()}#${label}`;
}

function requireMember(req, res, next) {
  if (!isMemberToken(req.tokenData)) {
    return res.status(403).json({ error: 'VPN доступен только участникам' });
  }
  next();
}

function checkTcpPort(address, port, timeout = 3500) {
  return new Promise(resolve => {
    const socket = net.createConnection({ host: address, port });
    let settled = false;

    const finish = result => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeout);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

async function checkVpnServer(serverConfig) {
  const checkedAt = Date.now();
  if (!isVpnServerConfigured(serverConfig)) {
    return {
      id: serverConfig.id,
      online: false,
      panelOnline: false,
      inboundEnabled: false,
      portOpen: false,
      port: null,
      clientCount: null,
      checkedAt,
    };
  }

  try {
    const inbound = await callXuiApi(
      serverConfig,
      `panel/api/inbounds/get/${serverConfig.inboundId}`
    );
    const inboundEnabled = inbound.enable === true || Number(inbound.enable) === 1;
    const port = Number(inbound.port);
    const portOpen = inboundEnabled && Number.isInteger(port)
      ? await checkTcpPort(serverConfig.address, port)
      : false;
    const inboundSettings = parseXuiJson(inbound.settings);

    return {
      id: serverConfig.id,
      online: inboundEnabled && portOpen,
      panelOnline: true,
      inboundEnabled,
      portOpen,
      port: Number.isInteger(port) ? port : null,
      protocol: inbound.protocol || null,
      clientCount: Array.isArray(inboundSettings.clients)
        ? inboundSettings.clients.length
        : null,
      checkedAt,
    };
  } catch (error) {
    console.warn(`[cheese-wheel] VPN health check failed for ${serverConfig.id}:`, error.message);
    return {
      id: serverConfig.id,
      online: false,
      panelOnline: false,
      inboundEnabled: false,
      portOpen: false,
      port: null,
      protocol: null,
      clientCount: null,
      checkedAt,
    };
  }
}

// ============ RATE LIMITING ============
const authAttempts = new Map(); // ip -> { count, resetAt }
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 минута

//TODO: нужно чистить мапу от старых айпишников
function checkRateLimit(ip) {
  const now = Date.now();
  const entry = authAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    authAttempts.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

function escapeDiscordMarkdown(text) {
  return String(text).replace(/([\\_*~`>|])/g, '\\$1');
}

async function notifyDiscord(content) {
  if (!DISCORD_WEBHOOK_URL) return;
  try {
    const res = await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn('[cheese-wheel] Discord webhook failed: ' + res.status + ' ' + body.slice(0, 200));
    }
  } catch (err) {
    console.warn('[cheese-wheel] Discord webhook failed:', err.message);
  }
}

// ============ ТОКЕНЫ ============
const TOKEN_EXPIRY = 30 * 24 * 60 * 60 * 1000; // 30 дней
const SESSION_COOKIE = 'cheese_session';

function createToken(userId, isGuest = false) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = Date.now() + TOKEN_EXPIRY;
  db.prepare('INSERT OR REPLACE INTO tokens (token, user_id, is_guest, expires) VALUES (?,?,?,?)').run(token, userId ?? null, isGuest ? 1 : 0, expires);
  return token;
}

function getTokenData(token) {
  if (!token) return null;
  const row = db.prepare('SELECT user_id, is_guest, expires FROM tokens WHERE token=?').get(token);
  if (!row) return null;
  if (Date.now() > row.expires) { db.prepare('DELETE FROM tokens WHERE token=?').run(token); return null; }
  return { userId: row.user_id, isGuest: !!row.is_guest, expires: row.expires };
}

function isMemberToken(data) {
  if (!data || data.isGuest) return false;
  const userId = Number(data.userId);
  if (!Number.isInteger(userId) || userId < 1) return false;
  return Boolean(db.prepare('SELECT 1 FROM users WHERE id=?').get(userId));
}

function getCookieToken(req) {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;
  const cookie = cookieHeader
    .split(';')
    .map(value => value.trim())
    .find(value => value.startsWith(`${SESSION_COOKIE}=`));
  return cookie ? cookie.slice(SESSION_COOKIE.length + 1) : null;
}

function getRequestToken(req) {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return getCookieToken(req);
}

function setSessionCookie(res, token) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    maxAge: TOKEN_EXPIRY,
    path: '/',
  });
}

function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
  });
}

// Чистим просроченные токены раз в час
setInterval(() => {
  db.prepare('DELETE FROM tokens WHERE expires < ?').run(Date.now());
}, 60 * 60 * 1000);

// ============ AUTH MIDDLEWARE ============
function requireAuth(req, res, next) {
  const token = getRequestToken(req);
  const data = getTokenData(token);
  if (!data) return res.status(401).json({ error: 'Требуется авторизация' });
  if (data.isGuest && req.method !== 'GET') {
    return res.status(403).json({ error: 'Гостевой доступ только для чтения' });
  }
  if (!getCookieToken(req)) setSessionCookie(res, token);
  req.authToken = token;
  req.tokenData = data;
  next();
}

const MIN_SPIN_DURATION = 5;
const MAX_SPIN_DURATION = 15;
const MAX_TITLE_LENGTH = 200;
let activeSpinUntil = 0;

function rejectWheelMutationDuringSpin(req, res, next) {
  if (Date.now() < activeSpinUntil) {
    return res.status(409).json({ error: 'Дождитесь окончания прокрутки' });
  }
  next();
}

// Middleware
app.use(express.json({ limit: '16kb' }));
// Serve React build output (run `npm run build` first)
const fs = require('fs');
const distPath = path.join(__dirname, 'dist');
const publicPath = path.join(__dirname, 'public');
const uploadsPath = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsPath)) fs.mkdirSync(uploadsPath);
app.use('/uploads', express.static(uploadsPath));
app.get('/vpn', (req, res, next) => {
  const data = getTokenData(getCookieToken(req));
  if (!isMemberToken(data)) {
    res.set('Cache-Control', 'no-store');
    return res.redirect(302, '/');
  }
  next();
});
app.use(express.static(fs.existsSync(distPath) ? distPath : publicPath));

// База данных
const db = new Database('cheese_wheel.db');
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Создание таблиц
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    password_hash TEXT
  );

  CREATE TABLE IF NOT EXISTS movies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    is_watched INTEGER DEFAULT 0,
    watched_at DATETIME
  );

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

  CREATE TABLE IF NOT EXISTS vpn_clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    server_id TEXT NOT NULL,
    inbound_id INTEGER NOT NULL,
    client_id TEXT UNIQUE NOT NULL,
    email TEXT NOT NULL,
    device_name TEXT COLLATE NOCASE NOT NULL,
    connection_link TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(user_id, server_id, device_name)
  );

  CREATE TABLE IF NOT EXISTS review_reactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    review_type TEXT NOT NULL CHECK(review_type IN ('movie', 'wine')),
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

  CREATE TABLE IF NOT EXISTS movie_reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    recommend INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

// Миграция: добавляем колонку password_hash если её нет
try {
  db.exec('ALTER TABLE users ADD COLUMN password_hash TEXT');
} catch (e) {
  // колонка уже существует
}

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
  const check = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(check, 'hex'));
}

// Добавляем пользователей
let DEFAULT_PASSWORD = process.env.DEFAULT_PASSWORD;
if (!DEFAULT_PASSWORD) {
  DEFAULT_PASSWORD = crypto.randomBytes(12).toString('base64');
  console.warn(`[cheese-wheel] DEFAULT_PASSWORD не задан. Сгенерирован временный пароль для новых пользователей: ${DEFAULT_PASSWORD}`);
}
const seedUsers = [
  { id: 1, name: 'Антон' },
  { id: 2, name: 'Сергей' },
  { id: 3, name: 'Пётр' },
  { id: 4, name: 'Митя' },
  { id: 5, name: 'Егор' },
  { id: 6, name: 'Женя' },
  { id: 7, name: 'Юлий' },
];
const insertUser = db.prepare('INSERT OR IGNORE INTO users (id, name, password_hash) VALUES (?, ?, ?)');
seedUsers.forEach(u => insertUser.run(u.id, u.name, hashPassword(DEFAULT_PASSWORD)));

// Устанавливаем пароль тем, у кого его нет (после миграции)
const usersWithoutPassword = db.prepare('SELECT id FROM users WHERE password_hash IS NULL').all();
const setPassword = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?');
usersWithoutPassword.forEach(u => setPassword.run(hashPassword(DEFAULT_PASSWORD), u.id));

// Дефолтные настройки
db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('spin_duration', '5')").run();
db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('theme', 'cheese')").run();
db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('spin_enabled', '1')").run();
db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('add_enabled', '1')").run();
db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('decorations_enabled', '1')").run();

// Подготовленные выражения (кешируем для производительности)
const stmts = {
  getTheme: db.prepare("SELECT value FROM settings WHERE key = 'theme'"),
  setTheme: db.prepare("UPDATE settings SET value = ? WHERE key = 'theme'"),
  getUsers: db.prepare('SELECT id, name FROM users ORDER BY id'),
  getUserById: db.prepare('SELECT id FROM users WHERE id = ?'),
  getUserWithPassword: db.prepare('SELECT id, name, password_hash FROM users WHERE id = ?'),
  setUserPassword: db.prepare('UPDATE users SET password_hash = ? WHERE id = ?'),
  getUnwatched: db.prepare(`
    SELECT m.*, u.name as added_by_name
    FROM movies m LEFT JOIN users u ON m.added_by = u.id
    WHERE m.is_watched = 0 AND m.is_next_wheel = 0 ORDER BY m.id
  `),
  getNextWheel: db.prepare(`
    SELECT m.*, u.name as added_by_name
    FROM movies m LEFT JOIN users u ON m.added_by = u.id
    WHERE m.is_watched = 0 AND m.is_next_wheel = 1 ORDER BY m.id
  `),
  promoteNextWheel: db.prepare('UPDATE movies SET is_next_wheel = 0 WHERE is_watched = 0 AND is_next_wheel = 1'),
  deleteCurrentWheelRatings: db.prepare(`
    DELETE FROM ratings
    WHERE movie_id IN (
      SELECT id FROM movies WHERE is_watched = 0 AND is_next_wheel = 0
    )
  `),
  clearCurrentWheel: db.prepare('DELETE FROM movies WHERE is_watched = 0 AND is_next_wheel = 0'),
  insertMovie: db.prepare('INSERT INTO movies (title, added_by, is_next_wheel) VALUES (?, ?, 0)'),
  insertNextMovie: db.prepare('INSERT INTO movies (title, added_by, is_next_wheel) VALUES (?, ?, 1)'),
  getMovieById: db.prepare('SELECT * FROM movies WHERE id = ?'),
  getMovieWithAuthorById: db.prepare(`
    SELECT m.*, u.name as added_by_name
    FROM movies m LEFT JOIN users u ON m.added_by = u.id
    WHERE m.id = ?
  `),
  getCurrentMovieByUser: db.prepare(`
    SELECT * FROM movies
    WHERE added_by = ? AND is_watched = 0 AND is_next_wheel = 0
  `),
  getNextMovieByUser: db.prepare(`
    SELECT * FROM movies
    WHERE added_by = ? AND is_watched = 0 AND is_next_wheel = 1
  `),
  deleteUnwatched: db.prepare('DELETE FROM movies WHERE id = ? AND is_watched = 0 AND is_next_wheel = 0'),
  deleteNextMovie: db.prepare('DELETE FROM movies WHERE id = ? AND is_watched = 0 AND is_next_wheel = 1'),
  markWatched: db.prepare("UPDATE movies SET is_watched = 1, watched_at = datetime('now') WHERE id = ?"),
  insertWatched: db.prepare("INSERT INTO movies (title, is_watched, added_by, watched_at) VALUES (?, 1, ?, datetime('now'))"),
  getWatched: null, // инициализируется ниже динамически
  updateMovie: db.prepare('UPDATE movies SET title = ?, added_at = ? WHERE id = ?'),
  deleteRatings: db.prepare('DELETE FROM ratings WHERE movie_id = ?'),
  deleteMovie: db.prepare('DELETE FROM movies WHERE id = ?'),
  upsertRating: db.prepare(`
    INSERT INTO ratings (movie_id, user_id, rating) VALUES (?, ?, ?)
    ON CONFLICT(movie_id, user_id) DO UPDATE SET rating = excluded.rating
  `),
  deleteRating: db.prepare('DELETE FROM ratings WHERE movie_id = ? AND user_id = ?'),
  getSpinDuration: db.prepare("SELECT value FROM settings WHERE key = 'spin_duration'"),
  setSpinDuration: db.prepare("UPDATE settings SET value = ? WHERE key = 'spin_duration'"),
  getFormedWheel: db.prepare("SELECT value FROM settings WHERE key = 'formed_wheel_snapshot'"),
  setFormedWheel: db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('formed_wheel_snapshot', ?)"),
  totalWatched: db.prepare('SELECT COUNT(*) as count FROM movies WHERE is_watched = 1'),
  topRated: db.prepare(`
    SELECT m.title, ROUND(AVG(r.rating), 1) as avg_rating
    FROM movies m JOIN ratings r ON m.id = r.movie_id
    WHERE m.is_watched = 1 GROUP BY m.id ORDER BY avg_rating DESC LIMIT 1
  `),
  lowestRated: db.prepare(`
    SELECT m.title, ROUND(AVG(r.rating), 1) as avg_rating
    FROM movies m JOIN ratings r ON m.id = r.movie_id
    WHERE m.is_watched = 1 GROUP BY m.id ORDER BY avg_rating ASC LIMIT 1
  `),
  perUserAvg: db.prepare(`
    SELECT u.name, ROUND(AVG(r.rating), 1) as avg_rating
    FROM users u LEFT JOIN ratings r ON u.id = r.user_id
    GROUP BY u.id ORDER BY u.id
  `),
  getWineReviews: db.prepare(`
    SELECT wr.*, u.name as user_name,
      COALESCE((SELECT COUNT(*) FROM review_reactions WHERE review_type='wine' AND review_id=wr.id AND reaction=1), 0) as likes,
      COALESCE((SELECT COUNT(*) FROM review_reactions WHERE review_type='wine' AND review_id=wr.id AND reaction=-1), 0) as dislikes,
      COALESCE((SELECT json_group_array(json_object('user_id', user_id, 'reaction', reaction)) FROM review_reactions WHERE review_type='wine' AND review_id=wr.id), '[]') as reactions_json
    FROM wine_reviews wr JOIN users u ON wr.user_id = u.id
    ORDER BY wr.created_at DESC
  `),
  insertWineReview: db.prepare('INSERT INTO wine_reviews (user_id, title, content, recommend, wine_type, grape, region, vintage, price) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'),
  getWineReviewById: db.prepare('SELECT * FROM wine_reviews WHERE id = ?'),
  deleteWineReview: db.prepare('DELETE FROM wine_reviews WHERE id = ? AND user_id = ?'),
  updateWineReview: db.prepare('UPDATE wine_reviews SET title=?, content=?, recommend=?, wine_type=?, grape=?, region=?, vintage=?, price=? WHERE id=? AND user_id=?'),
  getMovieReviews: db.prepare(`
    SELECT mr.*, u.name as user_name,
      COALESCE((SELECT COUNT(*) FROM review_reactions WHERE review_type='movie' AND review_id=mr.id AND reaction=1), 0) as likes,
      COALESCE((SELECT COUNT(*) FROM review_reactions WHERE review_type='movie' AND review_id=mr.id AND reaction=-1), 0) as dislikes,
      COALESCE((SELECT json_group_array(json_object('user_id', user_id, 'reaction', reaction)) FROM review_reactions WHERE review_type='movie' AND review_id=mr.id), '[]') as reactions_json
    FROM movie_reviews mr JOIN users u ON mr.user_id = u.id
    ORDER BY mr.created_at DESC
  `),
  insertMovieReview: db.prepare('INSERT INTO movie_reviews (user_id, title, content, recommend, director, year) VALUES (?, ?, ?, ?, ?, ?)'),
  getMovieReviewById: db.prepare('SELECT * FROM movie_reviews WHERE id = ?'),
  deleteMovieReview: db.prepare('DELETE FROM movie_reviews WHERE id = ? AND user_id = ?'),
  updateMovieReview: db.prepare('UPDATE movie_reviews SET title=?, content=?, recommend=?, director=?, year=? WHERE id=? AND user_id=?'),
  getReviewReactions: db.prepare('SELECT user_id, reaction FROM review_reactions WHERE review_type = ? AND review_id = ?'),
  deleteReviewReactions: db.prepare('DELETE FROM review_reactions WHERE review_type = ? AND review_id = ?'),
};

const vpnStmts = {
  listByUser: db.prepare(`
    SELECT id, server_id, device_name, connection_link, created_at
    FROM vpn_clients
    WHERE user_id = ?
    ORDER BY created_at DESC
  `),
  countByUserAndServer: db.prepare(`
    SELECT COUNT(*) AS count
    FROM vpn_clients
    WHERE user_id = ? AND server_id = ?
  `),
  getByIdAndUser: db.prepare(`
    SELECT *
    FROM vpn_clients
    WHERE id = ? AND user_id = ?
  `),
  getByUserServerAndDevice: db.prepare(`
    SELECT id
    FROM vpn_clients
    WHERE user_id = ? AND server_id = ? AND device_name = ? COLLATE NOCASE
  `),
  insert: db.prepare(`
    INSERT INTO vpn_clients (
      user_id, server_id, inbound_id, client_id, email,
      device_name, connection_link, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `),
  deleteByIdAndUser: db.prepare('DELETE FROM vpn_clients WHERE id = ? AND user_id = ?'),
};

// Динамический запрос getWatched — строится по реальным user_id из БД
{
  const allUsers = db.prepare('SELECT id FROM users ORDER BY id').all();
  const ratingCols = allUsers.map(u => `MAX(CASE WHEN r.user_id = ${u.id} THEN r.rating END) as rating_${u.id}`).join(',\n      ');
  stmts.getWatched = db.prepare(`
    SELECT
      m.id, m.title, m.watched_at, m.added_at, m.added_by,
      proposer.name as added_by_name,
      ${ratingCols},
      ROUND(AVG(r.rating), 1) as avg_rating,
      COUNT(r.rating) as ratings_count
    FROM movies m
    LEFT JOIN ratings r ON m.id = r.movie_id
    LEFT JOIN users proposer ON m.added_by = proposer.id
    WHERE m.is_watched = 1
    GROUP BY m.id
    ORDER BY m.watched_at DESC
  `);
}

// Хелперы валидации
function parseIntStrict(value) {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) return parseInt(value, 10);
  return NaN;
}

function sanitizeTitle(title) {
  if (typeof title !== 'string') return null;
  const trimmed = title.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_TITLE_LENGTH) return null;
  return trimmed;
}

function toWheelSnapshotMovie(movie) {
  return {
    id: Number(movie.id),
    title: movie.title,
    added_by: movie.added_by ?? null,
    added_by_name: movie.added_by_name ?? null,
  };
}

function readFormedWheel() {
  const row = stmts.getFormedWheel.get();
  if (!row?.value) return [];
  try {
    const parsed = JSON.parse(row.value);
    return Array.isArray(parsed)
      ? parsed.filter(movie => movie && Number.isInteger(Number(movie.id)) && typeof movie.title === 'string')
      : [];
  } catch {
    return [];
  }
}

function getWheelStatus() {
  const currentMovies = stmts.getUnwatched.all().map(toWheelSnapshotMovie);
  const formedMovies = readFormedWheel().map(toWheelSnapshotMovie);
  return {
    formed: formedMovies.length > 0,
    movies: formedMovies,
    current_count: currentMovies.length,
  };
}

function broadcastWheelStatus() {
  io.emit('wheel-status-changed', getWheelStatus());
}

// Сохраняем уже существующее колесо как сформированное при первом запуске новой версии.
if (!stmts.getFormedWheel.get()) {
  const initialMovies = stmts.getUnwatched.all().map(toWheelSnapshotMovie);
  stmts.setFormedWheel.run(JSON.stringify(initialMovies));
}

const ALLOWED_THEMES = ['cheese', 'newyear', 'spring'];

function canManageMovie(req, movie) {
  const userId = Number(req.tokenData?.userId);
  return Number.isInteger(userId) && Number(movie.added_by) === userId;
}

function isMovieInFormedWheel(movieId) {
  return readFormedWheel().some(movie => Number(movie.id) === Number(movieId));
}

function rejectFormedCurrentWheelMutation(req, res, next) {
  if (readFormedWheel().length > 0) {
    return res.status(409).json({ error: 'Текущее колесо уже сформировано' });
  }
  next();
}

// ============ API ============

// Публичные маршруты: вход, выход, гостевой вход и GET /api/users
// Всё остальное — через requireAuth
app.use('/api', (req, res, next) => {
  if (req.path === '/auth' && req.method === 'POST') return next();
  if (req.path === '/auth/guest' && req.method === 'POST') return next();
  if (req.path === '/auth/logout' && req.method === 'POST') return next();
  if (req.path === '/users' && req.method === 'GET') return next();
  requireAuth(req, res, next);
});

app.post('/api/auth', (req, res) => {
  const ip = req.ip || req.socket.remoteAddress;
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'Слишком много попыток. Подождите минуту.' });
  }
  const { user_id, password } = req.body;
  const userId = parseIntStrict(user_id);
  if (isNaN(userId) || typeof password !== 'string') {
    return res.status(400).json({ error: 'Неверный формат' });
  }
  const user = stmts.getUserWithPassword.get(userId);
  if (!user) {
    return res.status(400).json({ error: 'Пользователь не найден' });
  }
  if (verifyPassword(password, user.password_hash)) {
    const token = createToken(user.id);
    setSessionCookie(res, token);
    res.json({ success: true, token });
  } else {
    res.status(401).json({ error: 'Неверный пароль' });
  }
});

app.post('/api/auth/guest', (req, res) => {
  const token = createToken(null, true);
  setSessionCookie(res, token);
  res.json({ success: true, token });
});

app.post('/api/auth/logout', (req, res) => {
  const token = getRequestToken(req);
  if (token) db.prepare('DELETE FROM tokens WHERE token=?').run(token);
  clearSessionCookie(res);
  res.json({ success: true });
});

// Смена пароля
app.post('/api/users/:id/password', (req, res) => {
  const id = parseIntStrict(req.params.id);
  const { old_password, new_password } = req.body;
  if (isNaN(id) || typeof old_password !== 'string' || typeof new_password !== 'string') {
    return res.status(400).json({ error: 'Неверный формат' });
  }
  if (new_password.length < 4 || new_password.length > 100) {
    return res.status(400).json({ error: 'Пароль от 4 до 100 символов' });
  }
  const user = stmts.getUserWithPassword.get(id);
  if (!user) {
    return res.status(400).json({ error: 'Пользователь не найден' });
  }
  if (!verifyPassword(old_password, user.password_hash)) {
    return res.status(401).json({ error: 'Неверный текущий пароль' });
  }
  stmts.setUserPassword.run(hashPassword(new_password), id);
  res.json({ success: true });
});

app.get('/api/vpn/clients', requireMember, (req, res) => {
  const userId = Number(req.tokenData.userId);
  const servers = VPN_SERVERS
    .filter(isVpnServerConfigured)
    .map(serverConfig => ({
      id: serverConfig.id,
      label: serverConfig.label,
      address: serverConfig.address,
      limit: VPN_MAX_CLIENTS_PER_SERVER,
    }));
  const clients = vpnStmts.listByUser.all(userId).map(client => ({
    id: client.id,
    serverId: client.server_id,
    deviceName: client.device_name,
    connectionLink: client.connection_link,
    createdAt: client.created_at,
  }));
  res.json({ servers, clients });
});

app.get('/api/vpn/status', requireMember, async (req, res) => {
  const statuses = await Promise.all(VPN_SERVERS.map(checkVpnServer));
  res.json({ statuses });
});

app.post('/api/vpn/clients', requireMember, async (req, res) => {
  const userId = Number(req.tokenData.userId);
  const serverId = typeof req.body.server_id === 'string' ? req.body.server_id : '';
  const serverConfig = getVpnServer(serverId);
  const deviceName = typeof req.body.device_name === 'string'
    ? req.body.device_name.normalize('NFKC').replace(/\s+/g, ' ').trim()
    : '';

  if (!isVpnServerConfigured(serverConfig)) {
    return res.status(400).json({ error: 'Этот VPN-сервер пока недоступен' });
  }
  if (
    deviceName.length < 1 ||
    deviceName.length > 40 ||
    /[\p{Cc}\p{Cf}]/u.test(deviceName)
  ) {
    return res.status(400).json({ error: 'Название устройства — от 1 до 40 символов' });
  }
  if (vpnStmts.getByUserServerAndDevice.get(userId, serverId, deviceName)) {
    return res.status(409).json({ error: 'Устройство с таким названием уже есть' });
  }

  const currentCount = vpnStmts.countByUserAndServer.get(userId, serverId)?.count || 0;
  if (currentCount >= VPN_MAX_CLIENTS_PER_SERVER) {
    return res.status(409).json({
      error: `На одном сервере можно создать не больше ${VPN_MAX_CLIENTS_PER_SERVER} конфигураций`,
    });
  }

  const mutationKey = `${userId}:${serverId}`;
  if (vpnMutations.has(mutationKey)) {
    return res.status(409).json({ error: 'Предыдущая операция ещё выполняется' });
  }

  const now = Date.now();
  const client = {
    id: crypto.randomUUID(),
    flow: 'xtls-rprx-vision',
    email: `cw-u${userId}-${crypto.randomBytes(4).toString('hex')}`,
    limitIp: 0,
    totalGB: 0,
    expiryTime: 0,
    enable: true,
    tgId: '',
    subId: crypto.randomBytes(8).toString('hex'),
    reset: 0,
    comment: deviceName,
    created_at: now,
    updated_at: now,
  };
  let createdOnXui = false;
  vpnMutations.add(mutationKey);

  try {
    await callXuiApi(serverConfig, 'panel/api/inbounds/addClient', {
      method: 'POST',
      body: JSON.stringify({
        id: serverConfig.inboundId,
        settings: JSON.stringify({ clients: [client] }),
      }),
    });
    createdOnXui = true;

    const inbound = await callXuiApi(
      serverConfig,
      `panel/api/inbounds/get/${serverConfig.inboundId}`
    );
    const connectionLink = buildVlessLink(serverConfig, inbound, client, deviceName);
    const result = vpnStmts.insert.run(
      userId,
      serverId,
      serverConfig.inboundId,
      client.id,
      client.email,
      deviceName,
      connectionLink,
      now
    );

    res.status(201).json({
      id: Number(result.lastInsertRowid),
      serverId,
      deviceName,
      connectionLink,
      createdAt: now,
    });
  } catch (error) {
    if (createdOnXui) {
      try {
        await callXuiApi(
          serverConfig,
          `panel/api/inbounds/${serverConfig.inboundId}/delClient/${client.id}`,
          { method: 'POST', body: '{}' }
        );
      } catch (rollbackError) {
        console.error('[cheese-wheel] VPN rollback failed:', rollbackError.message);
      }
    }
    console.error('[cheese-wheel] VPN client creation failed:', error.message);
    res.status(502).json({ error: 'Не удалось создать конфигурацию. Попробуйте ещё раз.' });
  } finally {
    vpnMutations.delete(mutationKey);
  }
});

app.delete('/api/vpn/clients/:id', requireMember, async (req, res) => {
  const userId = Number(req.tokenData.userId);
  const id = parseIntStrict(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'Неверный идентификатор конфигурации' });
  }

  const storedClient = vpnStmts.getByIdAndUser.get(id, userId);
  if (!storedClient) {
    return res.status(404).json({ error: 'Конфигурация не найдена' });
  }
  const serverConfig = getVpnServer(storedClient.server_id);
  if (!isVpnServerConfigured(serverConfig)) {
    return res.status(503).json({ error: 'VPN-сервер временно недоступен' });
  }

  const mutationKey = `${userId}:${storedClient.server_id}`;
  if (vpnMutations.has(mutationKey)) {
    return res.status(409).json({ error: 'Предыдущая операция ещё выполняется' });
  }
  vpnMutations.add(mutationKey);

  try {
    await callXuiApi(
      serverConfig,
      `panel/api/inbounds/${storedClient.inbound_id}/delClient/${storedClient.client_id}`,
      { method: 'POST', body: '{}' }
    );
    vpnStmts.deleteByIdAndUser.run(id, userId);
    res.json({ success: true });
  } catch (error) {
    console.error('[cheese-wheel] VPN client deletion failed:', error.message);
    res.status(502).json({ error: 'Не удалось удалить конфигурацию. Попробуйте ещё раз.' });
  } finally {
    vpnMutations.delete(mutationKey);
  }
});

app.get('/api/theme', (req, res) => {
  const theme = stmts.getTheme.get();
  res.json({ theme: theme?.value || 'cheese' });
});

app.post('/api/theme', (req, res) => {
  const { theme } = req.body;
  if (!ALLOWED_THEMES.includes(theme)) {
    return res.status(400).json({ error: 'Неверная тема' });
  }
  stmts.setTheme.run(theme);
  io.emit('theme-changed', { theme });
  res.json({ success: true });
});

app.get('/api/users', (req, res) => {
  res.json(stmts.getUsers.all());
});

app.get('/api/wheel', (req, res) => {
  res.json(stmts.getUnwatched.all());
});

app.get('/api/wheel/status', (req, res) => {
  res.json(getWheelStatus());
});

app.post('/api/wheel/form', rejectWheelMutationDuringSpin, rejectFormedCurrentWheelMutation, (req, res) => {
  const movies = stmts.getUnwatched.all().map(toWheelSnapshotMovie);
  if (movies.length === 0) {
    return res.status(400).json({ error: 'Добавьте хотя бы один фильм' });
  }

  stmts.setFormedWheel.run(JSON.stringify(movies));
  const status = getWheelStatus();
  io.emit('wheel-status-changed', status);
  res.json(status);
});

app.post('/api/wheel/form-next', rejectWheelMutationDuringSpin, (req, res) => {
  if (readFormedWheel().length === 0) {
    return res.status(409).json({ error: 'Сначала сформируйте текущее колесо' });
  }
  const nextMovies = stmts.getNextWheel.all();
  if (nextMovies.length === 0) {
    return res.status(400).json({ error: 'Добавьте хотя бы один фильм в следующий раунд' });
  }

  try {
    const promoted = db.transaction(() => {
      stmts.deleteCurrentWheelRatings.run();
      stmts.clearCurrentWheel.run();
      stmts.promoteNextWheel.run();
      const movies = stmts.getUnwatched.all();
      stmts.setFormedWheel.run(JSON.stringify(movies.map(toWheelSnapshotMovie)));
      return movies;
    })();

    const status = getWheelStatus();
    io.emit('next-wheel-promoted', promoted);
    io.emit('wheel-status-changed', status);
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: 'Не удалось сформировать следующее колесо' });
  }
});

app.post('/api/wheel', rejectWheelMutationDuringSpin, rejectFormedCurrentWheelMutation, (req, res) => {
  const addEnabledRow = db.prepare("SELECT value FROM settings WHERE key = 'add_enabled'").get();
  if (addEnabledRow?.value === '0') {
    return res.status(403).json({ error: 'Добавление фильмов отключено' });
  }
  const title = sanitizeTitle(req.body.title);
  if (!title) {
    return res.status(400).json({ error: 'Введите название фильма (до 200 символов)' });
  }
  const userId = Number(req.tokenData.userId);
  if (!Number.isInteger(userId) || !stmts.getUserById.get(userId)) {
    return res.status(403).json({ error: 'Войдите как участник, чтобы выбрать фильм' });
  }

  try {
    const existing = stmts.getCurrentMovieByUser.get(userId);
    let movie;
    if (existing) {
      stmts.updateMovie.run(title, existing.added_at || null, existing.id);
      movie = stmts.getMovieWithAuthorById.get(existing.id);
      io.emit('movie-updated', movie);
    } else {
      const result = stmts.insertMovie.run(title, userId);
      movie = stmts.getMovieWithAuthorById.get(result.lastInsertRowid);
      io.emit('movie-added', movie);
    }
    broadcastWheelStatus();
    res.json({ ...movie, replaced: Boolean(existing) });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'У вас уже есть фильм в текущем колесе' });
    }
    res.status(500).json({ error: 'Не удалось сохранить выбор' });
  }
});

app.delete('/api/wheel/:id', rejectWheelMutationDuringSpin, rejectFormedCurrentWheelMutation, (req, res) => {
  const id = parseIntStrict(req.params.id);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'Неверный ID' });
  }
  const movie = stmts.getMovieById.get(id);
  if (!movie || movie.is_watched !== 0 || movie.is_next_wheel !== 0) {
    return res.status(404).json({ error: 'Фильм не найден в текущем колесе' });
  }
  if (!canManageMovie(req, movie)) {
    return res.status(403).json({ error: 'Можно удалить только свой фильм' });
  }

  try {
    stmts.deleteUnwatched.run(id);
    io.emit('movie-removed', { id });
    broadcastWheelStatus();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка удаления' });
  }
});

app.post('/api/wheel/:id/watched', (req, res) => {
  const id = parseIntStrict(req.params.id);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'Неверный ID' });
  }
  try {
    const currentMovie = stmts.getMovieById.get(id);
    if (!currentMovie) {
      return res.status(404).json({ error: 'Фильм не найден' });
    }
    const wheelStatus = getWheelStatus();
    if (!wheelStatus.formed || !wheelStatus.movies.some(movie => movie.id === id)) {
      return res.status(409).json({ error: 'Сначала сформируйте колесо' });
    }
    const wasWatched = currentMovie.is_watched === 1;
    stmts.markWatched.run(id);
    const movie = stmts.getMovieById.get(id);
    io.emit('movie-watched', movie);
    if (!wasWatched) {
      void notifyDiscord('Сегодня смотрим *' + escapeDiscordMarkdown(movie.title) + '*');
    }

    broadcastWheelStatus();
    res.json(movie);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка обновления' });
  }
});

app.get('/api/next-wheel', (req, res) => {
  res.json(stmts.getNextWheel.all());
});

app.post('/api/next-wheel', rejectWheelMutationDuringSpin, (req, res) => {
  const title = sanitizeTitle(req.body.title);
  if (!title) {
    return res.status(400).json({ error: 'Введите название фильма (до 200 символов)' });
  }
  const userId = Number(req.tokenData.userId);
  if (!Number.isInteger(userId) || !stmts.getUserById.get(userId)) {
    return res.status(403).json({ error: 'Войдите как участник, чтобы выбрать фильм' });
  }

  try {
    const existing = stmts.getNextMovieByUser.get(userId);
    let movie;
    if (existing) {
      stmts.updateMovie.run(title, existing.added_at || null, existing.id);
      movie = stmts.getMovieWithAuthorById.get(existing.id);
      io.emit('next-movie-updated', movie);
    } else {
      const result = stmts.insertNextMovie.run(title, userId);
      movie = stmts.getMovieWithAuthorById.get(result.lastInsertRowid);
      io.emit('next-movie-added', movie);
    }
    res.json({ ...movie, replaced: Boolean(existing) });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'У вас уже есть фильм для следующего раунда' });
    }
    res.status(500).json({ error: 'Не удалось сохранить выбор' });
  }
});

app.delete('/api/next-wheel/:id', rejectWheelMutationDuringSpin, (req, res) => {
  const id = parseIntStrict(req.params.id);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'Неверный ID' });
  }
  const movie = stmts.getMovieById.get(id);
  if (!movie || movie.is_watched !== 0 || movie.is_next_wheel !== 1) {
    return res.status(404).json({ error: 'Фильм не найден в следующем раунде' });
  }
  if (!canManageMovie(req, movie)) {
    return res.status(403).json({ error: 'Можно удалить только свой фильм' });
  }

  try {
    stmts.deleteNextMovie.run(id);
    io.emit('next-movie-removed', { id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка удаления' });
  }
});

app.post('/api/watched', (req, res) => {
  const title = sanitizeTitle(req.body.title);
  if (!title) {
    return res.status(400).json({ error: 'Введите название фильма (до 200 символов)' });
  }
  try {
    const result = stmts.insertWatched.run(title, req.tokenData.userId);
    const movie = stmts.getMovieById.get(result.lastInsertRowid);
    const user = stmts.getUsers.all().find(u => u.id === req.tokenData.userId);
    io.emit('watched-added', movie);
    void notifyDiscord(
      '*' + escapeDiscordMarkdown(user?.name || 'Пользователь') + '* добавил *' + escapeDiscordMarkdown(movie.title) + '* в историю просмотренных'
    );
    res.json(movie);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка добавления' });
  }
});

app.get('/api/watched', (req, res) => {
  res.json(stmts.getWatched.all());
});

app.delete('/api/watched/:id', (req, res) => {
  const id = parseIntStrict(req.params.id);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'Неверный ID' });
  }
  if (isMovieInFormedWheel(id)) {
    return res.status(409).json({ error: 'Фильм входит в текущее сформированное колесо' });
  }
  try {
    const deleteAll = db.transaction((movieId) => {
      stmts.deleteRatings.run(movieId);
      stmts.deleteMovie.run(movieId);
    });
    deleteAll(id);
    io.emit('watched-deleted', { id });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка удаления' });
  }
});

app.patch('/api/movies/:id', rejectWheelMutationDuringSpin, (req, res) => {
  const id = parseIntStrict(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Неверный ID' });

  const movie = stmts.getMovieById.get(id);
  if (!movie) return res.status(404).json({ error: 'Фильм не найден' });
  if (isMovieInFormedWheel(id)) {
    return res.status(409).json({ error: 'Текущее колесо уже сформировано' });
  }
  if (movie.is_watched === 0 && !canManageMovie(req, movie)) {
    return res.status(403).json({ error: 'Можно изменить только свой фильм' });
  }

  const title = req.body.title !== undefined ? sanitizeTitle(req.body.title) : movie.title;
  if (!title) return res.status(400).json({ error: 'Название не может быть пустым' });

  let addedAt = movie.added_at || null;
  if (req.body.added_at !== undefined) {
    if (req.body.added_at && !/^\d{4}-\d{2}-\d{2}$/.test(req.body.added_at)) {
      return res.status(400).json({ error: 'Неверный формат даты (YYYY-MM-DD)' });
    }
    addedAt = req.body.added_at || null;
  }

  try {
    stmts.updateMovie.run(title, addedAt, id);
    const updated = stmts.getMovieWithAuthorById.get(id);
    io.emit(movie.is_watched === 0 && movie.is_next_wheel === 1 ? 'next-movie-updated' : 'movie-updated', updated);
    if (movie.is_watched === 0 && movie.is_next_wheel === 0) {
      broadcastWheelStatus();
    }
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка обновления' });
  }
});

app.post('/api/ratings', (req, res) => {
  const movieId = parseIntStrict(req.body.movie_id);
  const requestedUserId = parseIntStrict(req.body.user_id);
  const userId = req.tokenData.userId;
  const rating = parseIntStrict(req.body.rating);

  if (isNaN(movieId) || isNaN(requestedUserId) || isNaN(rating)) {
    return res.status(400).json({ error: 'Неверный формат данных' });
  }
  if (!userId || requestedUserId !== userId) {
    return res.status(403).json({ error: 'Можно изменять только свою оценку' });
  }

  if (rating < 1 || rating > 10) {
    return res.status(400).json({ error: 'Оценка от 1 до 10' });
  }

  // Проверяем что пользователь существует
  if (!stmts.getUserById.get(userId)) {
    return res.status(400).json({ error: 'Пользователь не найден' });
  }

  // Проверяем что фильм существует
  if (!stmts.getMovieById.get(movieId)) {
    return res.status(400).json({ error: 'Фильм не найден' });
  }

  try {
    stmts.upsertRating.run(movieId, userId, rating);
    io.emit('rating-updated', { movie_id: movieId, user_id: userId, rating });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сохранения оценки' });
  }
});

app.delete('/api/ratings/:movieId', (req, res) => {
  const movieId = parseIntStrict(req.params.movieId);
  const userId = req.tokenData.userId;
  if (isNaN(movieId) || !userId) {
    return res.status(400).json({ error: 'Неверный формат данных' });
  }

  stmts.deleteRating.run(movieId, userId);
  io.emit('rating-updated', { movie_id: movieId, user_id: userId, rating: null });
  res.json({ success: true });
});

app.get('/api/stats', (req, res) => {
  res.json({
    total_watched: stmts.totalWatched.get().count,
    top_rated: stmts.topRated.get() || null,
    lowest_rated: stmts.lowestRated.get() || null,
    per_user_avg: stmts.perUserAvg.all()
  });
});

app.get('/api/settings', (req, res) => {
  const spinDuration = stmts.getSpinDuration.get();
  const spinEnabled = db.prepare("SELECT value FROM settings WHERE key = 'spin_enabled'").get();
  const addEnabled = db.prepare("SELECT value FROM settings WHERE key = 'add_enabled'").get();
  const decorationsEnabled = db.prepare("SELECT value FROM settings WHERE key = 'decorations_enabled'").get();
  res.json({
    spin_duration: parseInt(spinDuration?.value || '5'),
    spin_enabled: spinEnabled?.value !== '0',
    add_enabled: addEnabled?.value !== '0',
    decorations_enabled: decorationsEnabled?.value !== '0',
  });
});

app.post('/api/settings/spin-duration', (req, res) => {
  const duration = parseIntStrict(req.body.duration);
  if (isNaN(duration) || duration < MIN_SPIN_DURATION || duration > MAX_SPIN_DURATION) {
    return res.status(400).json({ error: `Время от ${MIN_SPIN_DURATION} до ${MAX_SPIN_DURATION} секунд` });
  }

  stmts.setSpinDuration.run(duration.toString());
  io.emit('settings-changed', { spin_duration: duration });
  res.json({ success: true });
});

app.post('/api/settings/spin-enabled', (req, res) => {
  const val = req.body.enabled ? '1' : '0';
  db.prepare("UPDATE settings SET value = ? WHERE key = 'spin_enabled'").run(val);
  io.emit('settings-changed', { spin_enabled: val === '1' });
  res.json({ success: true });
});

app.post('/api/settings/add-enabled', (req, res) => {
  const val = req.body.enabled ? '1' : '0';
  db.prepare("UPDATE settings SET value = ? WHERE key = 'add_enabled'").run(val);
  io.emit('settings-changed', { add_enabled: val === '1' });
  res.json({ success: true });
});

app.post('/api/settings/decorations-enabled', (req, res) => {
  const val = req.body.enabled ? '1' : '0';
  db.prepare("UPDATE settings SET value = ? WHERE key = 'decorations_enabled'").run(val);
  io.emit('settings-changed', { decorations_enabled: val === '1' });
  res.json({ success: true });
});

// Center image
app.get('/api/center-image', (req, res) => {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'center_image'").get();
  res.json({ url: row?.value || null });
});

app.post('/api/center-image', (req, res) => {
  const contentType = req.headers['content-type'] || '';
  if (!contentType.startsWith('multipart/form-data') && !contentType.startsWith('application/octet-stream')) {
    return res.status(400).json({ error: 'Нужен файл' });
  }

  const chunks = [];
  let size = 0;
  const MAX_SIZE = 5 * 1024 * 1024; // 5MB

  req.on('data', (chunk) => {
    size += chunk.length;
    if (size > MAX_SIZE) {
      res.status(413).json({ error: 'Файл слишком большой (макс 5МБ)' });
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });

  req.on('end', () => {
    if (res.writableEnded) return;
    const buf = Buffer.concat(chunks);

    // Parse multipart boundary
    const boundary = contentType.split('boundary=')[1];
    if (!boundary) {
      return res.status(400).json({ error: 'Неверный формат' });
    }

    const parts = buf.toString('binary').split('--' + boundary);
    let fileData = null;
    let fileName = null;

    for (const part of parts) {
      const headerEnd = part.indexOf('\r\n\r\n');
      if (headerEnd === -1) continue;
      const headers = part.slice(0, headerEnd);
      const fnMatch = headers.match(/filename="([^"]+)"/);
      if (fnMatch) {
        fileName = fnMatch[1];
        // Get raw binary data after headers, remove trailing \r\n
        const bodyStart = headerEnd + 4;
        const bodyEnd = part.lastIndexOf('\r\n');
        fileData = Buffer.from(part.slice(bodyStart, bodyEnd), 'binary');
        break;
      }
    }

    if (!fileData || !fileName) {
      return res.status(400).json({ error: 'Файл не найден в запросе' });
    }

    const ext = path.extname(fileName).toLowerCase();
    const allowed = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
    if (!allowed.includes(ext)) {
      return res.status(400).json({ error: 'Допустимые форматы: png, jpg, gif, webp, svg' });
    }

    const newName = 'center' + ext;
    // Remove old center images
    for (const f of fs.readdirSync(uploadsPath)) {
      if (f.startsWith('center.')) {
        fs.unlinkSync(path.join(uploadsPath, f));
      }
    }
    fs.writeFileSync(path.join(uploadsPath, newName), fileData);
    const url = '/uploads/' + newName + '?t=' + Date.now();
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('center_image', ?)").run(url);
    io.emit('center-image-changed', { url });
    res.json({ url });
  });
});

app.delete('/api/center-image', (req, res) => {
  for (const f of fs.readdirSync(uploadsPath)) {
    if (f.startsWith('center.')) {
      fs.unlinkSync(path.join(uploadsPath, f));
    }
  }
  db.prepare("DELETE FROM settings WHERE key = 'center_image'").run();
  io.emit('center-image-changed', { url: null });
  res.json({ success: true });
});

// ============ REVIEWS ============

const MAX_REVIEW_CONTENT_LENGTH = 5000;

function validateReview(body) {
  const title = sanitizeTitle(body.title);
  if (!title) return { error: 'Введите название (до 200 символов)' };
  const content = typeof body.content === 'string' ? body.content.trim() : '';
  if (!content || content.length > MAX_REVIEW_CONTENT_LENGTH) return { error: 'Введите текст обзора (до 5000 символов)' };
  const recommendRaw = parseInt(body.recommend, 10);
  const recommend = [-1, 0, 1].includes(recommendRaw) ? recommendRaw : 1;
  return { title, content, recommend };
}

app.get('/api/wine-reviews', (req, res) => {
  const reviews = stmts.getWineReviews.all().map(({ reactions_json, ...r }) => ({
    ...r, reactions: JSON.parse(reactions_json || '[]')
  }));
  res.json(reviews);
});

app.post('/api/wine-reviews', (req, res) => {
  const userId = parseIntStrict(req.body.user_id);
  if (isNaN(userId) || !stmts.getUserById.get(userId)) {
    return res.status(400).json({ error: 'Неверный пользователь' });
  }
  const validated = validateReview(req.body);
  if (validated.error) return res.status(400).json({ error: validated.error });
  const ALLOWED_WINE_TYPES = ['red', 'white', 'rose'];
  const wine_type = ALLOWED_WINE_TYPES.includes(req.body.wine_type) ? req.body.wine_type : null;
  const grape = typeof req.body.grape === 'string' ? req.body.grape.trim().slice(0, 100) || null : null;
  const region = typeof req.body.region === 'string' ? req.body.region.trim().slice(0, 100) || null : null;
  const vintage = parseIntStrict(req.body.vintage);
  const vintageVal = !isNaN(vintage) && vintage >= 1900 && vintage <= 2100 ? vintage : null;
  const price = typeof req.body.price === 'string' ? req.body.price.trim().slice(0, 50) || null : null;
  try {
    const result = stmts.insertWineReview.run(userId, validated.title, validated.content, validated.recommend, wine_type, grape, region, vintageVal, price);
    const review = stmts.getWineReviewById.get(result.lastInsertRowid);
    const user = stmts.getUsers.all().find(u => u.id === userId);
    const reviewOut = { ...review, user_name: user?.name, likes: 0, dislikes: 0, reactions: [] };
    io.emit('wine-review-added', reviewOut);
    res.json(reviewOut);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сохранения' });
  }
});

app.delete('/api/wine-reviews/:id', (req, res) => {
  const id = parseIntStrict(req.params.id);
  const userId = parseIntStrict(req.body.user_id);
  if (isNaN(id) || isNaN(userId)) return res.status(400).json({ error: 'Неверный ID' });
  const result = stmts.deleteWineReview.run(id, userId);
  if (result.changes === 0) return res.status(403).json({ error: 'Нет доступа или обзор не найден' });
  stmts.deleteReviewReactions.run('wine', id);
  io.emit('wine-review-deleted', { id });
  res.json({ success: true });
});

app.patch('/api/wine-reviews/:id', (req, res) => {
  const id = parseIntStrict(req.params.id);
  const userId = parseIntStrict(req.body.user_id);
  if (isNaN(id) || isNaN(userId)) return res.status(400).json({ error: 'Неверный ID' });
  const validated = validateReview(req.body);
  if (validated.error) return res.status(400).json({ error: validated.error });
  const ALLOWED_WINE_TYPES = ['red', 'white', 'rose'];
  const wine_type = ALLOWED_WINE_TYPES.includes(req.body.wine_type) ? req.body.wine_type : null;
  const grape = typeof req.body.grape === 'string' ? req.body.grape.trim().slice(0, 100) || null : null;
  const region = typeof req.body.region === 'string' ? req.body.region.trim().slice(0, 100) || null : null;
  const vintage = parseIntStrict(req.body.vintage);
  const vintageVal = !isNaN(vintage) && vintage >= 1900 && vintage <= 2100 ? vintage : null;
  const price = typeof req.body.price === 'string' ? req.body.price.trim().slice(0, 50) || null : null;
  const result = stmts.updateWineReview.run(validated.title, validated.content, validated.recommend, wine_type, grape, region, vintageVal, price, id, userId);
  if (result.changes === 0) return res.status(403).json({ error: 'Нет доступа или обзор не найден' });
  const review = stmts.getWineReviewById.get(id);
  const user = stmts.getUsers.all().find(u => u.id === userId);
  const reactions = stmts.getReviewReactions.all('wine', id);
  const updated = {
    ...review, user_name: user?.name, reactions,
    likes: reactions.filter(r => r.reaction === 1).length,
    dislikes: reactions.filter(r => r.reaction === -1).length
  };
  io.emit('wine-review-updated', updated);
  res.json(updated);
});

app.get('/api/movie-reviews', (req, res) => {
  const reviews = stmts.getMovieReviews.all().map(({ reactions_json, ...r }) => ({
    ...r, reactions: JSON.parse(reactions_json || '[]')
  }));
  res.json(reviews);
});

app.post('/api/movie-reviews', (req, res) => {
  const userId = parseIntStrict(req.body.user_id);
  if (isNaN(userId) || !stmts.getUserById.get(userId)) {
    return res.status(400).json({ error: 'Неверный пользователь' });
  }
  const validated = validateReview(req.body);
  if (validated.error) return res.status(400).json({ error: validated.error });
  const director = typeof req.body.director === 'string' ? req.body.director.trim().slice(0, 100) || null : null;
  const year = parseIntStrict(req.body.year);
  const yearVal = !isNaN(year) && year >= 1888 && year <= 2100 ? year : null;
  try {
    const result = stmts.insertMovieReview.run(userId, validated.title, validated.content, validated.recommend, director, yearVal);
    const review = stmts.getMovieReviewById.get(result.lastInsertRowid);
    const user = stmts.getUsers.all().find(u => u.id === userId);
    const reviewOut = { ...review, user_name: user?.name, likes: 0, dislikes: 0, reactions: [] };
    io.emit('movie-review-added', reviewOut);
    res.json(reviewOut);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сохранения' });
  }
});

app.patch('/api/movie-reviews/:id', (req, res) => {
  const id = parseIntStrict(req.params.id);
  const userId = parseIntStrict(req.body.user_id);
  if (isNaN(id) || isNaN(userId)) return res.status(400).json({ error: 'Неверный ID' });
  const validated = validateReview(req.body);
  if (validated.error) return res.status(400).json({ error: validated.error });
  const director = typeof req.body.director === 'string' ? req.body.director.trim().slice(0, 100) || null : null;
  const year = parseIntStrict(req.body.year);
  const yearVal = !isNaN(year) && year >= 1888 && year <= 2100 ? year : null;
  const result = stmts.updateMovieReview.run(validated.title, validated.content, validated.recommend, director, yearVal, id, userId);
  if (result.changes === 0) return res.status(403).json({ error: 'Нет доступа или обзор не найден' });
  const review = stmts.getMovieReviewById.get(id);
  const user = stmts.getUsers.all().find(u => u.id === userId);
  const reactions = stmts.getReviewReactions.all('movie', id);
  const updated = {
    ...review, user_name: user?.name, reactions,
    likes: reactions.filter(r => r.reaction === 1).length,
    dislikes: reactions.filter(r => r.reaction === -1).length
  };
  io.emit('movie-review-updated', updated);
  res.json(updated);
});

app.delete('/api/movie-reviews/:id', (req, res) => {
  const id = parseIntStrict(req.params.id);
  const userId = parseIntStrict(req.body.user_id);
  if (isNaN(id) || isNaN(userId)) return res.status(400).json({ error: 'Неверный ID' });
  const result = stmts.deleteMovieReview.run(id, userId);
  if (result.changes === 0) return res.status(403).json({ error: 'Нет доступа или обзор не найден' });
  stmts.deleteReviewReactions.run('movie', id);
  io.emit('movie-review-deleted', { id });
  res.json({ success: true });
});

// ============ REVIEW REACTIONS ============

app.post('/api/review-reactions', (req, res) => {
  const userId = req.tokenData.userId;
  if (!userId) return res.status(403).json({ error: 'Требуется авторизация' });
  const { review_type, review_id, reaction } = req.body;
  if (!['movie', 'wine'].includes(review_type)) return res.status(400).json({ error: 'Неверный тип обзора' });
  const reviewId = parseIntStrict(review_id);
  if (isNaN(reviewId)) return res.status(400).json({ error: 'Неверный ID обзора' });
  if (reaction !== 1 && reaction !== -1) return res.status(400).json({ error: 'Неверная реакция' });
  const review = review_type === 'movie'
    ? stmts.getMovieReviewById.get(reviewId)
    : stmts.getWineReviewById.get(reviewId);
  if (!review) return res.status(404).json({ error: 'Обзор не найден' });
  if (review.user_id === userId) return res.status(403).json({ error: 'Нельзя оценивать свой обзор' });

  const existing = stmts.getReviewReactions.all(review_type, reviewId).find(r => r.user_id === userId);
  if (existing && existing.reaction === reaction) {
    db.prepare('DELETE FROM review_reactions WHERE review_type=? AND review_id=? AND user_id=?').run(review_type, reviewId, userId);
  } else {
    db.prepare('INSERT INTO review_reactions (review_type, review_id, user_id, reaction) VALUES (?,?,?,?) ON CONFLICT(review_type, review_id, user_id) DO UPDATE SET reaction=excluded.reaction').run(review_type, reviewId, userId, reaction);
  }

  const reactions = stmts.getReviewReactions.all(review_type, reviewId);
  const likes = reactions.filter(r => r.reaction === 1).length;
  const dislikes = reactions.filter(r => r.reaction === -1).length;

  const payload = { review_type, review_id: reviewId, likes, dislikes, reactions };
  io.emit('review-reaction-updated', payload);
  res.json(payload);
});

// ============ SOCKET.IO ============

const onlineUsers = new Map(); // socketId -> { userId, userName }

function broadcastOnlineUsers() {
  const users = [];
  const seen = new Set();
  for (const [, info] of onlineUsers) {
    if (info.userId && !seen.has(info.userId)) {
      seen.add(info.userId);
      users.push({ id: info.userId, name: info.userName });
    }
  }
  io.emit('online-users', users);
}

io.on('connection', (socket) => {
  console.log('Пользователь подключился');

  // Send current online list to newly connected socket
  const currentUsers = [];
  const currentSeen = new Set();
  for (const [, info] of onlineUsers) {
    if (info.userId && !currentSeen.has(info.userId)) {
      currentSeen.add(info.userId);
      currentUsers.push({ id: info.userId, name: info.userName });
    }
  }
  socket.emit('online-users', currentUsers);

  socket.on('set-user', (data) => {
    const userId = parseIntStrict(data?.userId);
    const userName = typeof data?.userName === 'string' ? data.userName.slice(0, 50) : null;
    if (!isNaN(userId) && userName) {
      onlineUsers.set(socket.id, { userId, userName });
      broadcastOnlineUsers();
    }
  });

  socket.on('spin-wheel', (data) => {
    const spinEnabledRow = db.prepare("SELECT value FROM settings WHERE key = 'spin_enabled'").get();
    if (spinEnabledRow?.value === '0') {
      socket.emit('spin-rejected', { error: 'Прокрутка отключена' });
      return;
    }
    if (Date.now() < activeSpinUntil) {
      socket.emit('spin-rejected', { error: 'Колесо уже вращается' });
      return;
    }

    const spinDuration = parseIntStrict(data?.spinDuration);
    if (isNaN(spinDuration) || spinDuration < MIN_SPIN_DURATION || spinDuration > MAX_SPIN_DURATION) {
      socket.emit('spin-rejected', { error: 'Неверное время прокрутки' });
      return;
    }

    const wheelStatus = getWheelStatus();
    if (!wheelStatus.formed) {
      socket.emit('spin-rejected', { error: 'Сначала сформируйте колесо' });
      return;
    }
    const movies = wheelStatus.movies;

    const winnerIndex = crypto.randomInt(movies.length);
    const randomOffset = 0.08 + (crypto.randomInt(8401) / 10000);
    const turns = 8 + crypto.randomInt(5);
    const spinId = crypto.randomUUID();
    activeSpinUntil = Date.now() + spinDuration * 1000 + 1200;
    io.emit('wheel-spinning', {
      spinId,
      winnerIndex,
      spinDuration,
      randomOffset,
      turns,
      initiatorSocketId: socket.id,
    });
  });

  socket.on('disconnect', () => {
    onlineUsers.delete(socket.id);
    broadcastOnlineUsers();
    console.log('Пользователь отключился');
  });
});

// SPA fallback
app.get('*', (req, res) => {
  const dir = fs.existsSync(distPath) ? distPath : publicPath;
  res.sendFile(path.join(dir, 'index.html'));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Сырный сервер: http://localhost:${PORT}`);
});
