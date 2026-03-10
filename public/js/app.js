// ========== TOAST ==========
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  toast.innerHTML = `<span class="toast-icon">${icons[type] || icons.info}</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// ========== НАВИГАЦИЯ ==========
function renderNav(activePage) {
  const pages = ['wheel', 'watched'];
  const labels = { wheel: '🎡 Колесо', watched: '📋 Просмотренные' };
  const userName = isGuest ? 'Гость' : (currentUser ? currentUser.name : '');

  pages.forEach(page => {
    const navEl = document.getElementById(`nav-${page}`);
    if (!navEl) return;
    navEl.innerHTML = `
      ${pages.map(p => `<button class="nav-btn ${activePage === p ? 'active' : ''}" data-page="${p}">${labels[p]}</button>`).join('')}
      <div class="nav-user">
        <span>👤</span>
        <span class="nav-user-name">${escapeHtml(userName)}</span>
        <button class="nav-logout" data-action="logout" title="Выйти">🚪</button>
      </div>
    `;
  });
}

// ========== ТЕМА И УКРАШЕНИЯ ==========
let currentTheme = 'cheese';

function createSnowflakes() {
  const container = document.getElementById('snowflakes');
  if (!container || container.children.length > 0) return;

  const snowflakes = ['❄', '❅', '❆', '✻', '✼', '❉', '∗'];

  for (let i = 0; i < 50; i++) {
    const snowflake = document.createElement('div');
    snowflake.className = 'snowflake';
    snowflake.textContent = snowflakes[Math.floor(Math.random() * snowflakes.length)];
    snowflake.style.left = Math.random() * 100 + '%';
    snowflake.style.fontSize = (Math.random() * 1 + 0.5) + 'rem';
    snowflake.style.animationDuration = (Math.random() * 5 + 5) + 's';
    snowflake.style.animationDelay = (Math.random() * 10) + 's';
    snowflake.style.opacity = Math.random() * 0.5 + 0.5;
    container.appendChild(snowflake);
  }
}

function createGarland() {
  const container = document.getElementById('garland-lights');
  if (!container || container.children.length > 0) return;

  for (let i = 0; i < 40; i++) {
    const light = document.createElement('div');
    light.className = 'light';
    light.style.left = Math.random() * 100 + '%';
    light.style.top = Math.random() * 100 + '%';
    light.style.animationDelay = (Math.random() * 2) + 's';
    container.appendChild(light);
  }
}

function createPetals() {
  const container = document.getElementById('petals');
  if (!container || container.children.length > 0) return;

  const petals = ['🌸', '🌺', '🌷', '🌼', '💮', '✿', '❀'];

  for (let i = 0; i < 40; i++) {
    const petal = document.createElement('div');
    petal.className = 'petal';
    petal.textContent = petals[Math.floor(Math.random() * petals.length)];
    petal.style.left = Math.random() * 100 + '%';
    petal.style.fontSize = (Math.random() * 0.8 + 0.8) + 'rem';
    petal.style.animationDuration = (Math.random() * 8 + 7) + 's';
    petal.style.animationDelay = (Math.random() * 12) + 's';
    petal.style.opacity = Math.random() * 0.4 + 0.4;
    container.appendChild(petal);
  }
}

async function loadTheme() {
  try {
    const res = await fetch('/api/theme');
    const data = await res.json();
    applyTheme(data.theme);
  } catch (err) {
    console.error('Ошибка загрузки темы:', err);
  }
}

function applyTheme(theme) {
  currentTheme = theme;
  document.body.classList.remove('theme-cheese', 'theme-newyear', 'theme-spring');

  if (theme === 'newyear') {
    document.body.classList.add('theme-newyear');
    createSnowflakes();
    createGarland();
  } else if (theme === 'spring') {
    document.body.classList.add('theme-spring');
    createPetals();
  }

  document.querySelectorAll('.theme-option').forEach(opt => {
    opt.classList.toggle('active', opt.dataset.theme === theme);
  });
}

async function setTheme(theme) {
  try {
    await fetch('/api/theme', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ theme })
    });
    applyTheme(theme);
  } catch (err) {
    console.error('Ошибка установки темы:', err);
  }
}

function showAdminModal() {
  document.getElementById('admin-modal').classList.add('active');
}

function hideAdminModal() {
  document.getElementById('admin-modal').classList.remove('active');
}

loadTheme();

// ========== SOCKET.IO ==========
const socket = io();

socket.on('connect', () => {
  document.getElementById('connection-dot').classList.add('connected');
  document.getElementById('connection-text').textContent = 'Онлайн';
});

socket.on('disconnect', () => {
  document.getElementById('connection-dot').classList.remove('connected');
  document.getElementById('connection-text').textContent = 'Отключено';
});

// ========== СОСТОЯНИЕ ==========
let currentUser = null;
let isGuest = false;
let selectedUserId = null;
let users = [];
let wheelMovies = [];
let watchedMovies = [];
let sortColumn = 'avg_rating';
let sortDirection = 'desc';
let pendingWinner = null;
let spinDuration = 5;
let isSpinning = false;
let searchQuery = '';

// ========== ИНИЦИАЛИЗАЦИЯ ==========
async function init() {
  try {
    await loadUsers();
  } catch (err) {
    console.error('Ошибка загрузки пользователей:', err);
  }
  try {
    await loadSettings();
  } catch (err) {
    console.error('Ошибка загрузки настроек:', err);
  }
  setupEventListeners();
  setupSocketListeners();

  const savedSession = localStorage.getItem('cheeseWheelSession');
  if (savedSession) {
    try {
      const session = JSON.parse(savedSession);
      if (session.isGuest) {
        isGuest = true;
        currentUser = null;
        completeLogin();
        return;
      } else if (session.userId) {
        currentUser = users.find(u => u.id === session.userId);
        if (currentUser) {
          isGuest = false;
          completeLogin();
          return;
        }
      }
    } catch (e) {
      localStorage.removeItem('cheeseWheelSession');
    }
  }

  renderAuthPage();
}

async function loadUsers() {
  const res = await fetch('/api/users');
  users = await res.json();
}

async function loadSettings() {
  const res = await fetch('/api/settings');
  const settings = await res.json();
  spinDuration = settings.spin_duration || 5;
  document.getElementById('spin-duration-input').value = spinDuration;
}

// ========== SOCKET LISTENERS ==========
function setupSocketListeners() {
  socket.on('wheel-spinning', (data) => {
    if (!isSpinning) {
      performSpin(data.winnerIndex, data.spinDuration, data.randomOffset || 0.5);
    }
  });

  socket.on('movie-added', (movie) => {
    if (!wheelMovies.find(m => m.id === movie.id)) {
      wheelMovies.push(movie);
      renderWheel();
      renderMovieList();
    }
  });

  socket.on('movie-removed', (data) => {
    wheelMovies = wheelMovies.filter(m => m.id !== data.id);
    renderWheel();
    renderMovieList();
  });

  socket.on('movie-watched', (movie) => {
    wheelMovies = wheelMovies.filter(m => m.id !== movie.id);
    renderWheel();
    renderMovieList();
  });

  socket.on('rating-updated', () => {
    loadWatchedMovies();
  });

  socket.on('watched-added', () => {
    loadWatchedMovies();
  });

  socket.on('watched-deleted', () => {
    loadWatchedMovies();
  });

  socket.on('settings-changed', (settings) => {
    spinDuration = settings.spin_duration;
    document.getElementById('spin-duration-input').value = spinDuration;
  });

  socket.on('theme-changed', (data) => {
    applyTheme(data.theme);
  });
}

// ========== АВТОРИЗАЦИЯ ==========
function renderAuthPage() {
  const container = document.getElementById('auth-users');
  container.innerHTML = users.map(user => `
    <button class="auth-btn" data-user-id="${user.id}">${user.name}</button>
  `).join('');

  selectedUserId = null;
  document.getElementById('auth-password-container').style.display = 'none';
  document.getElementById('auth-password').value = '';
  document.getElementById('auth-error').textContent = '';
  document.querySelectorAll('.auth-btn').forEach(btn => btn.classList.remove('selected'));
}

function selectUser(userId) {
  selectedUserId = userId;
  document.querySelectorAll('.auth-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.userId === userId.toString());
  });
  document.getElementById('auth-password-container').style.display = 'flex';
  document.getElementById('auth-password').focus();
  document.getElementById('auth-error').textContent = '';
}

async function attemptLogin() {
  const password = document.getElementById('auth-password').value;

  try {
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: parseInt(selectedUserId), password })
    });

    if (res.ok) {
      currentUser = users.find(u => u.id === parseInt(selectedUserId));
      isGuest = false;
      completeLogin();
    } else {
      document.getElementById('auth-error').textContent = 'Неверный пароль';
      document.getElementById('auth-password').value = '';
    }
  } catch (err) {
    document.getElementById('auth-error').textContent = 'Ошибка соединения';
  }
}

function loginAsGuest() {
  currentUser = null;
  isGuest = true;
  completeLogin();
}

function completeLogin() {
  const session = isGuest
    ? { isGuest: true }
    : { userId: currentUser.id };
  localStorage.setItem('cheeseWheelSession', JSON.stringify(session));

  const page = PATH_TO_PAGE[location.pathname] || 'wheel';
  renderNav(page);
  showPage(page, false);
  history.replaceState({ page }, '', PAGE_PATHS[page] || '/');
  if (page === 'wheel') loadWheelMovies();
  updateUIForRole();
}

function updateUIForRole() {
  document.querySelectorAll('.guest-hidden').forEach(el => {
    el.style.display = isGuest ? 'none' : '';
  });

  document.getElementById('spin-btn').disabled = isGuest;
  document.getElementById('spin-btn').title = isGuest ? 'Только для участников' : '';

  const adminBtn = document.getElementById('admin-btn');
  if (currentUser && currentUser.id === 2) {
    adminBtn.classList.add('visible');
  } else {
    adminBtn.classList.remove('visible');
  }
}

function logout() {
  localStorage.removeItem('cheeseWheelSession');
  currentUser = null;
  isGuest = false;
  selectedUserId = null;
  document.getElementById('admin-btn').classList.remove('visible');
  hideAdminModal();
  renderAuthPage();
  showPage('auth', false);
  history.replaceState(null, '', '/');
}

// ========== НАВИГАЦИЯ ==========
const PAGE_PATHS = { wheel: '/', watched: '/watched' };
const PATH_TO_PAGE = { '/': 'wheel', '/watched': 'watched' };

function showPage(page, pushState = true) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

  if (page === 'auth') {
    document.getElementById('auth-page').classList.add('active');
  } else if (page === 'wheel') {
    document.getElementById('wheel-page').classList.add('active');
    loadWheelMovies();
  } else if (page === 'watched') {
    document.getElementById('watched-page').classList.add('active');
    loadWatchedMovies();
    loadStats();
  }

  if (pushState && page !== 'auth' && PAGE_PATHS[page]) {
    history.pushState({ page }, '', PAGE_PATHS[page]);
  }

  renderNav(page);
}

window.addEventListener('popstate', (e) => {
  if (!currentUser && !isGuest) return;
  const page = e.state?.page || PATH_TO_PAGE[location.pathname] || 'wheel';
  showPage(page, false);
});

// ========== СТАТИСТИКА ==========
async function loadStats() {
  try {
    const res = await fetch('/api/stats');
    const stats = await res.json();
    renderStats(stats);
  } catch (err) {
    console.error('Ошибка загрузки статистики:', err);
  }
}

function renderStats(stats) {
  const panel = document.getElementById('stats-panel');
  if (!panel) return;

  const topTitle = stats.top_rated ? escapeHtml(stats.top_rated.title) : '—';
  const topRating = stats.top_rated ? stats.top_rated.avg_rating : '';
  const worstTitle = stats.lowest_rated ? escapeHtml(stats.lowest_rated.title) : '—';
  const worstRating = stats.lowest_rated ? stats.lowest_rated.avg_rating : '';

  panel.innerHTML = `
    <div class="stat-card">
      <div class="stat-card-value">${stats.total_watched}</div>
      <div class="stat-card-label">Просмотрено фильмов</div>
    </div>
    <div class="stat-card">
      <div class="stat-card-value">${topRating || '—'}</div>
      <div class="stat-card-label">Лучший фильм</div>
      <div class="stat-card-sub">${topTitle}</div>
    </div>
    <div class="stat-card">
      <div class="stat-card-value">${worstRating || '—'}</div>
      <div class="stat-card-label">Худший фильм</div>
      <div class="stat-card-sub">${worstTitle}</div>
    </div>
    <div class="stat-card">
      <div class="stats-users">
        ${stats.per_user_avg.map(u => `
          <div class="stats-user-item">
            <span class="stats-user-name">${escapeHtml(u.name)}</span>
            <span class="stats-user-avg">${u.avg_rating ?? '—'}</span>
          </div>
        `).join('')}
      </div>
      <div class="stat-card-label" style="margin-top:8px">Средние оценки</div>
    </div>
  `;
}

// ========== КОЛЕСО ==========
let wheelRotation = 0; // текущий угол поворота в градусах
let wheelAnimId = null;

async function loadWheelMovies() {
  const res = await fetch('/api/wheel');
  wheelMovies = await res.json();
  renderWheel();
  renderMovieList();
}

const WHEEL_COLORS = [
  ['#FFE566', '#FFF2A0'], ['#CD853F', '#DDA06B'], ['#FFC107', '#FFD54F'],
  ['#D2691E', '#E8945A'], ['#FFD700', '#FFEA70'], ['#A0522D', '#C47A55'],
  ['#F4C430', '#F8D86A'], ['#C4842D', '#DCA05A'], ['#FFCA28', '#FFDD6B'],
  ['#B8860B', '#D4A83B'], ['#FFB300', '#FFCB4D'], ['#8B6914', '#B09040']
];

function renderWheel() {
  const container = document.getElementById('wheel');
  const spinBtn = document.getElementById('spin-btn');

  if (wheelMovies.length === 0) {
    container.innerHTML = `
      <div class="wheel-empty">
        <div class="wheel-empty-icon">🎬</div>
        <div class="wheel-empty-text">Добавьте фильмы<br>для начала!</div>
      </div>
    `;
    spinBtn.disabled = true;
    return;
  }

  spinBtn.disabled = isSpinning || isGuest;

  const n = wheelMovies.length;

  // Генерируем пеги (шпеньки) — проценты для адаптивности
  const pegCount = Math.max(n, 12);
  let pegsHtml = '';
  for (let i = 0; i < pegCount; i++) {
    const angle = (i / pegCount) * 360 - 90;
    const rad = angle * Math.PI / 180;
    const pegR = 45.5; // % от центра
    const px = 50 + pegR * Math.cos(rad);
    const py = 50 + pegR * Math.sin(rad);
    pegsHtml += `<div class="wheel-peg" style="left:${px}%;top:${py}%;"></div>`;
  }

  container.innerHTML = `
    <div class="wheel-outer" id="wheel-outer">
      <div class="wheel-canvas-wrap" id="wheel-spinner">
        <canvas id="wheel-canvas" width="720" height="720"></canvas>
        <div class="wheel-pegs">${pegsHtml}</div>
        <div class="wheel-center">🧀</div>
      </div>
    </div>
  `;

  drawWheel();

  // Apply current rotation
  const spinner = document.getElementById('wheel-spinner');
  if (spinner) {
    spinner.style.transform = `rotate(${wheelRotation}deg)`;
  }
}

function drawWheel() {
  const canvas = document.getElementById('wheel-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const size = 720;
  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 4;
  const n = wheelMovies.length;
  const segAngle = (Math.PI * 2) / n;

  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.translate(cx, cy);

  wheelMovies.forEach((movie, i) => {
    const startA = i * segAngle - Math.PI / 2;
    const endA = (i + 1) * segAngle - Math.PI / 2;
    const [color1, color2] = WHEEL_COLORS[i % WHEEL_COLORS.length];

    // Градиент от центра к краю
    const midA = (startA + endA) / 2;
    const grad = ctx.createLinearGradient(
      Math.cos(midA) * radius * 0.1, Math.sin(midA) * radius * 0.1,
      Math.cos(midA) * radius, Math.sin(midA) * radius
    );
    grad.addColorStop(0, color2);
    grad.addColorStop(1, color1);

    // Сегмент
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, radius, startA, endA);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Разделительная линия (не рисуем при одном фильме)
    if (n > 1) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(startA) * radius, Math.sin(startA) * radius);
      ctx.strokeStyle = 'rgba(139, 69, 19, 0.5)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Текст
    const textAngle = startA + segAngle / 2;
    const maxChars = n <= 4 ? 22 : (n <= 8 ? 16 : 12);
    const fontSize = n <= 4 ? 22 : (n <= 8 ? 18 : (n <= 14 ? 14 : 12));
    let title = movie.title;
    if (title.length > maxChars) title = title.substring(0, maxChars - 1) + '…';

    ctx.save();
    ctx.rotate(textAngle);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${fontSize}px Comfortaa, sans-serif`;

    const textR = radius * (n <= 3 ? 0.5 : 0.6);

    // Тень текста для читаемости
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.fillText(title, textR, 1);
    ctx.fillStyle = '#3d2800';
    ctx.fillText(title, textR, 0);
    ctx.restore();
  });

  // Внутренний круг-тень для глубины
  const innerGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
  innerGrad.addColorStop(0, 'rgba(0,0,0,0.08)');
  innerGrad.addColorStop(0.15, 'rgba(0,0,0,0)');
  innerGrad.addColorStop(0.85, 'rgba(0,0,0,0)');
  innerGrad.addColorStop(1, 'rgba(0,0,0,0.12)');
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fillStyle = innerGrad;
  ctx.fill();

  ctx.restore();
}

function renderMovieList() {
  const container = document.getElementById('movie-list');
  container.innerHTML = wheelMovies.map(movie => `
    <div class="movie-tag">
      <span>${escapeHtml(movie.title)}</span>
      <button class="movie-tag-remove" data-id="${movie.id}" ${isSpinning ? 'disabled' : ''}>✕</button>
    </div>
  `).join('');

  // Блокируем форму добавления во время кручения
  const movieInput = document.getElementById('movie-input');
  const addBtn = document.querySelector('#add-movie-form .add-movie-btn');
  if (movieInput) movieInput.disabled = isSpinning;
  if (addBtn) addBtn.disabled = isSpinning;
}

async function addMovie(title) {
  try {
    const res = await fetch('/api/wheel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title })
    });
    if (res.ok) {
      showToast(`«${title}» добавлен в колесо`, 'success');
    } else {
      const data = await res.json();
      showToast(data.error || 'Ошибка добавления', 'error');
    }
  } catch (err) {
    showToast('Ошибка соединения', 'error');
  }
}

async function removeMovie(id) {
  try {
    await fetch(`/api/wheel/${id}`, { method: 'DELETE' });
    showToast('Фильм удалён из колеса', 'info');
  } catch (err) {
    showToast('Ошибка удаления', 'error');
  }
}

// ========== ЗВУК КОЛЕСА ==========
let audioContext = null;

function initAudio() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
}

// Реалистичный клик колеса — короткий деревянный щелчок
function playClick(volume) {
  if (!audioContext) return;

  const t = audioContext.currentTime;

  // Шумовой буфер для щелчка
  const bufferSize = Math.floor(audioContext.sampleRate * 0.015);
  const noiseBuffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 8);
  }

  const noise = audioContext.createBufferSource();
  noise.buffer = noiseBuffer;

  // Фильтр для деревянного звука
  const bandpass = audioContext.createBiquadFilter();
  bandpass.type = 'bandpass';
  bandpass.frequency.value = 2800 + Math.random() * 600;
  bandpass.Q.value = 3;

  const highpass = audioContext.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = 400;

  // Громкость
  const gain = audioContext.createGain();
  gain.gain.setValueAtTime(Math.min(volume, 0.35), t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.02);

  noise.connect(bandpass);
  bandpass.connect(highpass);
  highpass.connect(gain);
  gain.connect(audioContext.destination);

  noise.start(t);
  noise.stop(t + 0.02);
}

function spinWheel() {
  if (isGuest || wheelMovies.length === 0 || isSpinning) return;

  const winnerIndex = Math.floor(Math.random() * wheelMovies.length);
  const raw = parseInt(document.getElementById('spin-duration-input').value) || 5;
  const duration = Math.max(5, Math.min(15, raw));
  const randomOffset = 0.002 + Math.random() * 0.996;

  socket.emit('spin-wheel', {
    winnerIndex,
    spinDuration: duration,
    randomOffset
  });

  performSpin(winnerIndex, duration, randomOffset);
}

function performSpin(winnerIndex, duration, randomOffset = 0.5) {
  if (isSpinning || wheelMovies.length === 0) return;

  isSpinning = true;
  const spinBtn = document.getElementById('spin-btn');
  spinBtn.disabled = true;
  renderMovieList();

  const outerEl = document.getElementById('wheel-outer');
  if (outerEl) outerEl.classList.add('spinning');

  initAudio();

  const n = wheelMovies.length;
  const segmentAngle = 360 / n;
  // Целевой угол: 5 полных оборотов + позиция победителя
  const offsetInSegment = segmentAngle * randomOffset;
  const winnerAngle = 360 - (winnerIndex * segmentAngle + offsetInSegment);
  const totalRotation = 360 * (4 + Math.random() * 2) + winnerAngle;

  const startAngle = wheelRotation;
  const endAngle = startAngle + totalRotation;
  const startTime = performance.now();
  const durationMs = duration * 1000;

  // Считаем пеги для клика
  const pegCount = Math.max(n, 12);
  const pegAngle = 360 / pegCount;
  let lastPegIndex = Math.floor(((startAngle % 360) + 360) % 360 / pegAngle);

  // Easing: плавное торможение без рывков в конце
  function easeOutQuint(t) {
    if (t >= 1) return 1;
    return 1 - Math.pow(1 - t, 5);
  }

  function animate(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / durationMs, 1);
    const eased = easeOutQuint(progress);

    const currentAngle = startAngle + totalRotation * eased;
    wheelRotation = currentAngle;

    // Вращаем весь контейнер (canvas + пеги + центр)
    const spinner = document.getElementById('wheel-spinner');
    if (spinner) {
      spinner.style.transform = `rotate(${currentAngle}deg)`;
    }

    // Клик на каждом пеге
    const normAngle = ((currentAngle % 360) + 360) % 360;
    const currentPeg = Math.floor(normAngle / pegAngle);
    if (currentPeg !== lastPegIndex) {
      lastPegIndex = currentPeg;
      const vol = 0.1 + 0.25 * (1 - progress);
      playClick(vol);

      // Анимация указателя
      const pointer = document.querySelector('.wheel-pointer');
      if (pointer) {
        pointer.classList.remove('bounce');
        void pointer.offsetWidth;
        pointer.classList.add('bounce');
      }
    }

    if (progress < 1) {
      wheelAnimId = requestAnimationFrame(animate);
    } else {
      // Завершение
      wheelRotation = endAngle % 360;
      if (outerEl) outerEl.classList.remove('spinning');

      setTimeout(() => {
        const winner = wheelMovies[winnerIndex];
        if (winner) {
          pendingWinner = winner;
          showResultModal(winner.title);
        }
        isSpinning = false;
        spinBtn.disabled = isGuest;
        renderMovieList();
      }, 400);
    }
  }

  wheelAnimId = requestAnimationFrame(animate);
}

function playWinSound() {
  if (!audioContext) initAudio();
  if (!audioContext) return;

  const t = audioContext.currentTime;

  // Мягкая победная мелодия — колокольчики (triangle wave + лёгкое затухание)
  const notes = [
    { freq: 523.25, time: 0, dur: 0.25 },    // C5
    { freq: 659.25, time: 0.12, dur: 0.25 },  // E5
    { freq: 783.99, time: 0.24, dur: 0.35 },  // G5
    { freq: 1046.5, time: 0.4, dur: 0.5 },    // C6 — финальная нота длиннее
  ];

  notes.forEach(({ freq, time, dur }) => {
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();

    osc.type = 'triangle';
    osc.frequency.value = freq;

    gain.gain.setValueAtTime(0, t + time);
    gain.gain.linearRampToValueAtTime(0.15, t + time + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + time + dur);

    osc.connect(gain);
    gain.connect(audioContext.destination);
    osc.start(t + time);
    osc.stop(t + time + dur);
  });
}

function showResultModal(title) {
  playWinSound();
  document.getElementById('modal-movie-title').textContent = title;
  document.getElementById('result-modal').classList.add('active');
}

async function hideResultModal() {
  document.getElementById('result-modal').classList.remove('active');

  if (pendingWinner) {
    await fetch(`/api/wheel/${pendingWinner.id}/watched`, { method: 'POST' });
    pendingWinner = null;
  }
}

async function saveSpinDuration() {
  const input = document.getElementById('spin-duration-input');
  let duration = parseInt(input.value);
  if (isNaN(duration) || duration < 5) duration = 5;
  if (duration > 15) duration = 15;
  input.value = duration;
  await fetch('/api/settings/spin-duration', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ duration })
  });
}

// ========== ПРОСМОТРЕННЫЕ ==========
async function loadWatchedMovies() {
  const res = await fetch('/api/watched');
  watchedMovies = await res.json();
  renderWatchedTable();
}

async function addWatchedMovie(title) {
  try {
    const res = await fetch('/api/watched', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title })
    });
    if (res.ok) {
      showToast(`«${title}» добавлен в просмотренные`, 'success');
    } else {
      const data = await res.json();
      showToast(data.error || 'Ошибка добавления', 'error');
    }
  } catch (err) {
    showToast('Ошибка соединения', 'error');
  }
}

async function deleteWatchedMovie(id) {
  if (confirm('Удалить этот фильм из просмотренных?')) {
    try {
      await fetch(`/api/watched/${id}`, { method: 'DELETE' });
      await loadWatchedMovies();
      loadStats();
      showToast('Фильм удалён', 'info');
    } catch (err) {
      showToast('Ошибка удаления', 'error');
    }
  }
}

function renderWatchedTable() {
  const container = document.getElementById('watched-content');

  if (watchedMovies.length === 0) {
    container.innerHTML = `
      <div class="watched-empty">
        <div class="watched-empty-icon">🎬</div>
        <div class="watched-empty-text">Пока нет просмотренных фильмов.<br>Крутите колесо!</div>
      </div>
    `;
    return;
  }

  let filtered = watchedMovies;
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filtered = watchedMovies.filter(m => m.title.toLowerCase().includes(q));
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="watched-empty">
        <div class="watched-empty-icon">🔍</div>
        <div class="watched-empty-text">Ничего не найдено по запросу «${escapeHtml(searchQuery)}»</div>
      </div>
    `;
    return;
  }

  const sorted = [...filtered].sort((a, b) => {
    let aVal = a[sortColumn];
    let bVal = b[sortColumn];

    if (sortColumn === 'title') {
      aVal = aVal || '';
      bVal = bVal || '';
      return sortDirection === 'asc'
        ? aVal.localeCompare(bVal, 'ru')
        : bVal.localeCompare(aVal, 'ru');
    }

    aVal = aVal ?? -1;
    bVal = bVal ?? -1;
    return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
  });

  const sortIcon = (col) => {
    if (sortColumn !== col) return '<span class="sort-icon">⇅</span>';
    return `<span class="sort-icon active">${sortDirection === 'asc' ? '↑' : '↓'}</span>`;
  };

  container.innerHTML = `
    <table class="watched-table">
      <thead>
        <tr>
          <th></th>
          <th data-sort="title">Фильм ${sortIcon('title')}</th>
          <th data-sort="rating_1">${users[0]?.name || 'User 1'} ${sortIcon('rating_1')}</th>
          <th data-sort="rating_2">${users[1]?.name || 'User 2'} ${sortIcon('rating_2')}</th>
          <th data-sort="rating_3">${users[2]?.name || 'User 3'} ${sortIcon('rating_3')}</th>
          <th data-sort="rating_4">${users[3]?.name || 'User 4'} ${sortIcon('rating_4')}</th>
          <th data-sort="avg_rating">Средняя ${sortIcon('avg_rating')}</th>
        </tr>
      </thead>
      <tbody>
        ${sorted.map(movie => `
          <tr>
            <td>${!isGuest ? `<button class="delete-watched-btn" data-id="${movie.id}" title="Удалить">✕</button>` : ''}</td>
            <td>
              ${escapeHtml(movie.title)}
              ${movie.watched_at ? `<div class="watched-date">${formatDate(movie.watched_at)}</div>` : ''}
            </td>
            <td>${renderRatingCell(movie, 1)}</td>
            <td>${renderRatingCell(movie, 2)}</td>
            <td>${renderRatingCell(movie, 3)}</td>
            <td>${renderRatingCell(movie, 4)}</td>
            <td>${renderAvgRating(movie.avg_rating)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderRatingCell(movie, userId) {
  const ratingKey = `rating_${userId}`;
  const rating = movie[ratingKey];

  if (currentUser && currentUser.id === userId) {
    const hasRating = rating !== null && rating !== undefined;
    return `
      <select class="rating-select" data-movie-id="${movie.id}" data-user-id="${userId}">
        ${!hasRating ? '<option value="" disabled selected>—</option>' : ''}
        ${[1,2,3,4,5,6,7,8,9,10].map(n =>
          `<option value="${n}" ${rating === n ? 'selected' : ''}>${n}</option>`
        ).join('')}
      </select>
    `;
  }

  return rating ? `<span class="rating-display">${rating}</span>` : '—';
}

function renderAvgRating(avg) {
  if (!avg) return '—';

  const value = parseFloat(avg);
  let colorClass = '';
  let emoji = '';

  if (value >= 10) {
    colorClass = 'rating-cheese';
    emoji = ' 🧀';
  } else if (value >= 7) {
    colorClass = 'rating-good';
  } else if (value >= 4) {
    colorClass = 'rating-mid';
  } else {
    colorClass = 'rating-bad';
  }

  return `<span class="rating-avg ${colorClass}">${value.toFixed(1)}${emoji}</span>`;
}

async function setRating(movieId, userId, rating) {
  try {
    await fetch('/api/ratings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ movie_id: movieId, user_id: userId, rating: parseInt(rating) })
    });
    showToast(`Оценка ${rating} сохранена`, 'success');
    loadStats();
  } catch (err) {
    showToast('Ошибка сохранения оценки', 'error');
  }
}

function setSort(column) {
  if (sortColumn === column) {
    sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
  } else {
    sortColumn = column;
    sortDirection = column === 'title' ? 'asc' : 'desc';
  }
  renderWatchedTable();
}

// ========== УТИЛИТЫ ==========
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}.${month}.${year}`;
}

// ========== СОБЫТИЯ ==========
function setupEventListeners() {
  document.getElementById('auth-users').addEventListener('click', (e) => {
    if (e.target.classList.contains('auth-btn')) {
      selectUser(e.target.dataset.userId);
    }
  });

  document.getElementById('auth-password-btn').addEventListener('click', attemptLogin);

  document.getElementById('auth-password').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') attemptLogin();
  });

  document.getElementById('auth-guest-btn').addEventListener('click', loginAsGuest);

  document.addEventListener('click', (e) => {
    const navBtn = e.target.closest('.nav-btn[data-page]');
    if (navBtn) showPage(navBtn.dataset.page);

    const logoutBtn = e.target.closest('[data-action="logout"]');
    if (logoutBtn) logout();
  });

  document.getElementById('add-movie-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (isGuest || isSpinning) return;
    const input = document.getElementById('movie-input');
    const title = input.value.trim();
    if (title) {
      await addMovie(title);
      input.value = '';
    }
  });

  document.getElementById('watched-add-movie-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (isGuest) return;
    const input = document.getElementById('watched-movie-input');
    const title = input.value.trim();
    if (title) {
      await addWatchedMovie(title);
      input.value = '';
    }
  });

  document.getElementById('movie-list').addEventListener('click', (e) => {
    if (isGuest || isSpinning) return;
    if (e.target.classList.contains('movie-tag-remove')) {
      removeMovie(e.target.dataset.id);
    }
  });

  document.getElementById('spin-btn').addEventListener('click', spinWheel);
  document.getElementById('spin-duration-input').addEventListener('change', saveSpinDuration);

  document.getElementById('modal-close-btn').addEventListener('click', hideResultModal);
  document.getElementById('result-modal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) hideResultModal();
  });

  document.getElementById('watched-content').addEventListener('click', (e) => {
    const th = e.target.closest('th[data-sort]');
    if (th) setSort(th.dataset.sort);

    if (e.target.classList.contains('delete-watched-btn')) {
      if (isGuest) return;
      deleteWatchedMovie(e.target.dataset.id);
    }
  });

  document.getElementById('watched-content').addEventListener('change', (e) => {
    if (isGuest) return;
    if (e.target.classList.contains('rating-select')) {
      const movieId = e.target.dataset.movieId;
      const userId = e.target.dataset.userId;
      const rating = e.target.value;
      if (rating) {
        setRating(movieId, userId, rating);
      }
    }
  });

  document.getElementById('admin-btn').addEventListener('click', showAdminModal);

  document.getElementById('admin-modal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) hideAdminModal();
  });

  document.querySelectorAll('.theme-option').forEach(opt => {
    opt.addEventListener('click', () => {
      setTheme(opt.dataset.theme);
    });
  });

  const searchInput = document.getElementById('search-input');
  const searchClear = document.getElementById('search-clear');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      searchQuery = searchInput.value.trim();
      searchClear.classList.toggle('visible', searchQuery.length > 0);
      renderWatchedTable();
    });
  }
  if (searchClear) {
    searchClear.addEventListener('click', () => {
      searchInput.value = '';
      searchQuery = '';
      searchClear.classList.remove('visible');
      renderWatchedTable();
    });
  }
}

init();
