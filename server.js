const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const server = createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

const crypto = require('crypto');

const MIN_SPIN_DURATION = 5;
const MAX_SPIN_DURATION = 15;
const MAX_TITLE_LENGTH = 200;

// Middleware
app.use(express.json({ limit: '16kb' }));
// Serve React build output (run `npm run build` first)
const fs = require('fs');
const distPath = path.join(__dirname, 'dist');
const publicPath = path.join(__dirname, 'public');
const uploadsPath = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsPath)) fs.mkdirSync(uploadsPath);
app.use('/uploads', express.static(uploadsPath));
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
const DEFAULT_PASSWORD = 'Cheese$Wheel#2024!';
const userNames = ['Антон', 'Сергей', 'Пётр', 'Митя'];
const insertUser = db.prepare('INSERT OR IGNORE INTO users (name, password_hash) VALUES (?, ?)');
userNames.forEach(name => insertUser.run(name, hashPassword(DEFAULT_PASSWORD)));

// Устанавливаем пароль тем, у кого его нет (после миграции)
const usersWithoutPassword = db.prepare('SELECT id FROM users WHERE password_hash IS NULL').all();
const setPassword = db.prepare('UPDATE users SET password_hash = ? WHERE id = ?');
usersWithoutPassword.forEach(u => setPassword.run(hashPassword(DEFAULT_PASSWORD), u.id));

// Дефолтные настройки
db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('spin_duration', '5')").run();
db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('theme', 'cheese')").run();
db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('spin_enabled', '1')").run();
db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('add_enabled', '1')").run();

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
    WHERE m.is_watched = 0 ORDER BY m.id
  `),
  insertMovie: db.prepare('INSERT INTO movies (title, added_by) VALUES (?, ?)'),
  getMovieById: db.prepare('SELECT * FROM movies WHERE id = ?'),
  deleteUnwatched: db.prepare('DELETE FROM movies WHERE id = ? AND is_watched = 0'),
  markWatched: db.prepare("UPDATE movies SET is_watched = 1, watched_at = datetime('now') WHERE id = ?"),
  insertWatched: db.prepare("INSERT INTO movies (title, is_watched) VALUES (?, 1)"),
  getWatched: db.prepare(`
    SELECT
      m.id, m.title, m.watched_at, m.added_at,
      MAX(CASE WHEN r.user_id = 1 THEN r.rating END) as rating_1,
      MAX(CASE WHEN r.user_id = 2 THEN r.rating END) as rating_2,
      MAX(CASE WHEN r.user_id = 3 THEN r.rating END) as rating_3,
      MAX(CASE WHEN r.user_id = 4 THEN r.rating END) as rating_4,
      ROUND(AVG(r.rating), 1) as avg_rating
    FROM movies m
    LEFT JOIN ratings r ON m.id = r.movie_id
    WHERE m.is_watched = 1
    GROUP BY m.id
    ORDER BY m.watched_at DESC
  `),
  updateMovie: db.prepare('UPDATE movies SET title = ?, added_at = ? WHERE id = ?'),
  deleteRatings: db.prepare('DELETE FROM ratings WHERE movie_id = ?'),
  deleteMovie: db.prepare('DELETE FROM movies WHERE id = ?'),
  upsertRating: db.prepare(`
    INSERT INTO ratings (movie_id, user_id, rating) VALUES (?, ?, ?)
    ON CONFLICT(movie_id, user_id) DO UPDATE SET rating = excluded.rating
  `),
  getSpinDuration: db.prepare("SELECT value FROM settings WHERE key = 'spin_duration'"),
  setSpinDuration: db.prepare("UPDATE settings SET value = ? WHERE key = 'spin_duration'"),
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
};

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

const ALLOWED_THEMES = ['cheese', 'newyear', 'spring'];

// ============ API ============

app.post('/api/auth', (req, res) => {
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
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Неверный пароль' });
  }
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

app.post('/api/wheel', (req, res) => {
  const addEnabledRow = db.prepare("SELECT value FROM settings WHERE key = 'add_enabled'").get();
  if (addEnabledRow?.value === '0') {
    return res.status(403).json({ error: 'Добавление фильмов отключено' });
  }
  const title = sanitizeTitle(req.body.title);
  if (!title) {
    return res.status(400).json({ error: 'Введите название фильма (до 200 символов)' });
  }
  const userId = parseIntStrict(req.body.user_id);
  const addedBy = isNaN(userId) ? null : userId;
  try {
    const result = stmts.insertMovie.run(title, addedBy);
    const user = addedBy ? stmts.getUserById.get(addedBy) : null;
    const addedByName = user ? stmts.getUsers.all().find(u => u.id === addedBy)?.name : null;
    const movie = { id: Number(result.lastInsertRowid), title, added_by: addedBy, added_by_name: addedByName };
    io.emit('movie-added', movie);
    res.json(movie);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка добавления фильма' });
  }
});

app.delete('/api/wheel/:id', (req, res) => {
  const id = parseIntStrict(req.params.id);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'Неверный ID' });
  }
  try {
    stmts.deleteUnwatched.run(id);
    io.emit('movie-removed', { id });
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
    stmts.markWatched.run(id);
    const movie = stmts.getMovieById.get(id);
    if (!movie) {
      return res.status(404).json({ error: 'Фильм не найден' });
    }
    io.emit('movie-watched', movie);
    res.json(movie);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка обновления' });
  }
});

app.post('/api/watched', (req, res) => {
  const title = sanitizeTitle(req.body.title);
  if (!title) {
    return res.status(400).json({ error: 'Введите название фильма (до 200 символов)' });
  }
  try {
    const result = stmts.insertWatched.run(title);
    const movie = stmts.getMovieById.get(result.lastInsertRowid);
    io.emit('watched-added', movie);
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

app.patch('/api/movies/:id', (req, res) => {
  const id = parseIntStrict(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'Неверный ID' });

  const movie = stmts.getMovieById.get(id);
  if (!movie) return res.status(404).json({ error: 'Фильм не найден' });

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
    const updated = stmts.getMovieById.get(id);
    io.emit('movie-updated', updated);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка обновления' });
  }
});

app.post('/api/ratings', (req, res) => {
  const movieId = parseIntStrict(req.body.movie_id);
  const userId = parseIntStrict(req.body.user_id);
  const rating = parseIntStrict(req.body.rating);

  if (isNaN(movieId) || isNaN(userId) || isNaN(rating)) {
    return res.status(400).json({ error: 'Неверный формат данных' });
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
  res.json({
    spin_duration: parseInt(spinDuration?.value || '5'),
    spin_enabled: spinEnabled?.value !== '0',
    add_enabled: addEnabled?.value !== '0',
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
    if (spinEnabledRow?.value === '0') return;
    // Валидация данных от клиента
    const winnerIndex = parseIntStrict(data?.winnerIndex);
    const spinDuration = parseIntStrict(data?.spinDuration);
    const randomOffset = parseFloat(data?.randomOffset);

    if (isNaN(winnerIndex) || winnerIndex < 0) return;
    if (isNaN(spinDuration) || spinDuration < MIN_SPIN_DURATION || spinDuration > MAX_SPIN_DURATION) return;
    if (isNaN(randomOffset) || randomOffset < 0 || randomOffset > 1) return;

    socket.broadcast.emit('wheel-spinning', { winnerIndex, spinDuration, randomOffset });
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
