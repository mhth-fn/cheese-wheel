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
app.use(express.static(path.join(__dirname, 'public')));

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

// Подготовленные выражения (кешируем для производительности)
const stmts = {
  getTheme: db.prepare("SELECT value FROM settings WHERE key = 'theme'"),
  setTheme: db.prepare("UPDATE settings SET value = ? WHERE key = 'theme'"),
  getUsers: db.prepare('SELECT id, name FROM users ORDER BY id'),
  getUserById: db.prepare('SELECT id FROM users WHERE id = ?'),
  getUserWithPassword: db.prepare('SELECT id, name, password_hash FROM users WHERE id = ?'),
  setUserPassword: db.prepare('UPDATE users SET password_hash = ? WHERE id = ?'),
  getUnwatched: db.prepare('SELECT * FROM movies WHERE is_watched = 0 ORDER BY id'),
  insertMovie: db.prepare('INSERT INTO movies (title) VALUES (?)'),
  getMovieById: db.prepare('SELECT * FROM movies WHERE id = ?'),
  deleteUnwatched: db.prepare('DELETE FROM movies WHERE id = ? AND is_watched = 0'),
  markWatched: db.prepare("UPDATE movies SET is_watched = 1, watched_at = datetime('now') WHERE id = ?"),
  insertWatched: db.prepare("INSERT INTO movies (title, is_watched) VALUES (?, 1)"),
  getWatched: db.prepare(`
    SELECT
      m.id, m.title, m.watched_at,
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
  const title = sanitizeTitle(req.body.title);
  if (!title) {
    return res.status(400).json({ error: 'Введите название фильма (до 200 символов)' });
  }
  try {
    const result = stmts.insertMovie.run(title);
    const movie = { id: Number(result.lastInsertRowid), title };
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
  res.json({ spin_duration: parseInt(spinDuration?.value || '5') });
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

// ============ SOCKET.IO ============

io.on('connection', (socket) => {
  console.log('Пользователь подключился');

  socket.on('spin-wheel', (data) => {
    // Валидация данных от клиента
    const winnerIndex = parseIntStrict(data?.winnerIndex);
    const spinDuration = parseIntStrict(data?.spinDuration);
    const randomOffset = parseFloat(data?.randomOffset);

    if (isNaN(winnerIndex) || winnerIndex < 0) return;
    if (isNaN(spinDuration) || spinDuration < MIN_SPIN_DURATION || spinDuration > MAX_SPIN_DURATION) return;
    if (isNaN(randomOffset) || randomOffset < 0 || randomOffset > 1) return;

    io.emit('wheel-spinning', { winnerIndex, spinDuration, randomOffset });
  });

  socket.on('disconnect', () => {
    console.log('Пользователь отключился');
  });
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Сырный сервер: http://localhost:${PORT}`);
});
