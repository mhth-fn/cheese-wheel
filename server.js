const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const server = createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

// Пароль для пользователей
const USER_PASSWORD = 'Cheese$Wheel#2024!';

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// База данных
const db = new Database('cheese_wheel.db');

// Создание таблиц
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL
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

// Добавляем пользователей
const users = ['Антон', 'Сергей', 'Пётр', 'Митя'];
const insertUser = db.prepare('INSERT OR IGNORE INTO users (name) VALUES (?)');
users.forEach(name => insertUser.run(name));

// Дефолтное время вращения
db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('spin_duration', '5')").run();

// Дефолтная тема
db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('theme', 'cheese')").run();

// ============ API ============

// Проверка пароля
app.post('/api/auth', (req, res) => {
  const { password } = req.body;
  if (password === USER_PASSWORD) {
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Неверный пароль' });
  }
});

// Получить тему
app.get('/api/theme', (req, res) => {
  const theme = db.prepare("SELECT value FROM settings WHERE key = 'theme'").get();
  res.json({ theme: theme?.value || 'cheese' });
});

// Установить тему (только для админа - проверка на клиенте)
app.post('/api/theme', (req, res) => {
  const { theme } = req.body;
  if (!['cheese', 'newyear'].includes(theme)) {
    return res.status(400).json({ error: 'Неверная тема' });
  }
  
  db.prepare("UPDATE settings SET value = ? WHERE key = 'theme'").run(theme);
  
  // Уведомляем всех о смене темы
  io.emit('theme-changed', { theme });
  
  res.json({ success: true });
});

// Получить пользователей
app.get('/api/users', (req, res) => {
  const users = db.prepare('SELECT * FROM users ORDER BY id').all();
  res.json(users);
});

// Получить фильмы для колеса (не просмотренные)
app.get('/api/wheel', (req, res) => {
  const movies = db.prepare('SELECT * FROM movies WHERE is_watched = 0 ORDER BY id').all();
  res.json(movies);
});

// Добавить фильм в колесо
app.post('/api/wheel', (req, res) => {
  const { title } = req.body;
  if (!title?.trim()) {
    return res.status(400).json({ error: 'Введите название фильма' });
  }
  try {
    const result = db.prepare('INSERT INTO movies (title) VALUES (?)').run(title.trim());
    const movie = { id: result.lastInsertRowid, title: title.trim() };
    
    // Уведомляем всех о новом фильме
    io.emit('movie-added', movie);
    
    res.json(movie);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Удалить фильм из колеса
app.delete('/api/wheel/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM movies WHERE id = ? AND is_watched = 0').run(req.params.id);
    
    // Уведомляем всех об удалении
    io.emit('movie-removed', { id: parseInt(req.params.id) });
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Пометить фильм как просмотренный (выпал на колесе)
app.post('/api/wheel/:id/watched', (req, res) => {
  try {
    db.prepare("UPDATE movies SET is_watched = 1, watched_at = datetime('now') WHERE id = ?").run(req.params.id);
    const movie = db.prepare('SELECT * FROM movies WHERE id = ?').get(req.params.id);
    
    // Уведомляем всех
    io.emit('movie-watched', movie);
    
    res.json(movie);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Добавить фильм сразу в просмотренные
app.post('/api/watched', (req, res) => {
  const { title } = req.body;
  if (!title?.trim()) {
    return res.status(400).json({ error: 'Введите название фильма' });
  }
  try {
    const result = db.prepare("INSERT INTO movies (title, is_watched, watched_at) VALUES (?, 1, datetime('now'))").run(title.trim());
    const movie = db.prepare('SELECT * FROM movies WHERE id = ?').get(result.lastInsertRowid);
    
    // Уведомляем всех о новом просмотренном фильме
    io.emit('watched-added', movie);
    
    res.json(movie);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Получить просмотренные фильмы с оценками
app.get('/api/watched', (req, res) => {
  const movies = db.prepare(`
    SELECT 
      m.id,
      m.title,
      m.watched_at,
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
  `).all();
  res.json(movies);
});

// Удалить просмотренный фильм
app.delete('/api/watched/:id', (req, res) => {
  try {
    // Сначала удаляем оценки
    db.prepare('DELETE FROM ratings WHERE movie_id = ?').run(req.params.id);
    // Затем удаляем фильм
    db.prepare('DELETE FROM movies WHERE id = ?').run(req.params.id);
    
    // Уведомляем всех
    io.emit('watched-deleted', { id: parseInt(req.params.id) });
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Поставить оценку
app.post('/api/ratings', (req, res) => {
  const { movie_id, user_id, rating } = req.body;
  
  if (!movie_id || !user_id || !rating) {
    return res.status(400).json({ error: 'Заполните все поля' });
  }
  
  if (rating < 1 || rating > 10) {
    return res.status(400).json({ error: 'Оценка от 1 до 10' });
  }
  
  try {
    db.prepare(`
      INSERT INTO ratings (movie_id, user_id, rating) VALUES (?, ?, ?)
      ON CONFLICT(movie_id, user_id) DO UPDATE SET rating = excluded.rating
    `).run(movie_id, user_id, rating);
    
    // Уведомляем всех об обновлении оценки
    io.emit('rating-updated', { movie_id, user_id, rating });
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Получить настройки
app.get('/api/settings', (req, res) => {
  const spinDuration = db.prepare("SELECT value FROM settings WHERE key = 'spin_duration'").get();
  res.json({ spin_duration: parseInt(spinDuration?.value || '5') });
});

// Обновить время вращения
app.post('/api/settings/spin-duration', (req, res) => {
  const { duration } = req.body;
  if (!duration || duration < 1 || duration > 30) {
    return res.status(400).json({ error: 'Время от 1 до 30 секунд' });
  }
  
  db.prepare("UPDATE settings SET value = ? WHERE key = 'spin_duration'").run(duration.toString());
  
  // Уведомляем всех о смене настроек
  io.emit('settings-changed', { spin_duration: duration });
  
  res.json({ success: true });
});

// ============ SOCKET.IO ============

io.on('connection', (socket) => {
  console.log('🧀 Пользователь подключился');
  
  // Кто-то крутит колесо — рассылаем всем
  socket.on('spin-wheel', (data) => {
    // data: { winnerIndex, spinDuration, oddsMultiplier }
    io.emit('wheel-spinning', data);
  });
  
  socket.on('disconnect', () => {
    console.log('🧀 Пользователь отключился');
  });
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🧀 Сырный сервер: http://localhost:${PORT}`);
});
