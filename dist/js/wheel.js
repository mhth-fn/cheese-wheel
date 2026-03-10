// ========== КОЛЕСО ==========
import { state } from './state.js';
import { fetchWheelMovies, postMovie, deleteMovie as apiDeleteMovie } from './api.js';
import { showToast, escapeHtml } from './utils.js';

export const WHEEL_COLORS = [
  '#f5d45a', '#e8c33a', '#f0d86e', '#dbb830',
  '#f2cc44', '#e6bf28', '#f7dc6f', '#d4a820',
  '#f0c940', '#e0b425',
];

export async function loadWheelMovies() {
  const res = await fetchWheelMovies();
  state.wheelMovies = res;
  renderWheel();
  renderMovieList();
}

export function renderWheel() {
  const container = document.getElementById('wheel');
  const spinBtn = document.getElementById('spin-btn');

  if (state.wheelMovies.length === 0) {
    container.innerHTML = `
      <div class="wheel-empty">
        <div class="wheel-empty-icon">🎬</div>
        <div class="wheel-empty-text">Добавьте фильмы<br>для начала!</div>
      </div>
    `;
    spinBtn.disabled = true;
    return;
  }

  spinBtn.disabled = state.isSpinning || state.isGuest;

  container.innerHTML = `
    <div class="wheel-outer" id="wheel-outer">
      <div class="wheel-canvas-wrap" id="wheel-spinner">
        <canvas id="wheel-canvas" width="480" height="480"></canvas>
      </div>
    </div>
  `;

  drawWheel();

  const spinner = document.getElementById('wheel-spinner');
  if (spinner) {
    spinner.style.transform = `rotate(${state.wheelRotation}deg)`;
  }
}

// Exact copy of React draw() function, adapted for vanilla JS.
// Only difference: reads movies from state.wheelMovies, rot=0 (CSS handles rotation).
export function drawWheel() {
  const canvas = document.getElementById('wheel-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  const movies = state.wheelMovies;

  const cx = w / 2, cy = h / 2, r = Math.min(cx, cy) - 40;
  ctx.clearRect(0, 0, w, h);

  const n = movies.length;
  if (n === 0) return;
  const sliceAngle = (2 * Math.PI) / n;

  /* outer rind */
  ctx.beginPath();
  ctx.arc(cx, cy, r + 14, 0, 2 * Math.PI);
  ctx.fillStyle = "#6aaa5a";
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, r + 8, 0, 2 * Math.PI);
  ctx.fillStyle = "#7dbd6d";
  ctx.fill();

  /* sectors */
  movies.forEach((m, i) => {
    const startAngle = i * sliceAngle;
    const endAngle = startAngle + sliceAngle;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, startAngle, endAngle);
    ctx.closePath();
    ctx.fillStyle = WHEEL_COLORS[i % WHEEL_COLORS.length];
    ctx.fill();
    ctx.strokeStyle = "rgba(180, 140, 20, 0.3)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });

  /* cheese holes */
  const holePositions = [
    [0.3, 0.7], [0.55, 0.35], [0.75, 0.6], [0.4, 0.45],
    [0.65, 0.78], [0.25, 0.35], [0.8, 0.4], [0.5, 0.65],
  ];
  holePositions.forEach(([rx, ry]) => {
    const hx = cx + (rx - 0.5) * r * 1.4;
    const hy = cy + (ry - 0.5) * r * 1.4;
    const dist = Math.sqrt((hx - cx) ** 2 + (hy - cy) ** 2);
    if (dist < r - 12) {
      const holeR = 5 + Math.random() * 6;
      ctx.beginPath();
      ctx.arc(hx, hy, holeR, 0, 2 * Math.PI);
      ctx.fillStyle = "rgba(180, 140, 20, 0.2)";
      ctx.fill();
    }
  });

  /* labels */
  movies.forEach((m, i) => {
    const midAngle = i * sliceAngle + sliceAngle / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(midAngle);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#5a4010";
    ctx.font = `bold ${Math.min(14, 140 / n)}px 'Nunito', sans-serif`;
    ctx.shadowColor = "rgba(255,255,200,0.6)";
    ctx.shadowBlur = 2;
    const label = m.title.length > 14 ? m.title.slice(0, 12) + "…" : m.title;
    ctx.fillText(label, r * 0.58, 0);
    ctx.shadowBlur = 0;
    ctx.restore();
  });

  /* center hub */
  ctx.beginPath();
  ctx.arc(cx, cy, 26, 0, 2 * Math.PI);
  ctx.fillStyle = "#fff8dc";
  ctx.fill();
  ctx.strokeStyle = "#d4a820";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.font = "24px serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("🧀", cx, cy + 1);

  // Pointer is CSS-based (stays fixed while canvas rotates via CSS transform)
}

export function renderMovieList() {
  const container = document.getElementById('movie-list');
  container.innerHTML = state.wheelMovies.map(movie => `
    <div class="movie-tag">
      <span>${escapeHtml(movie.title)}</span>
      <button class="movie-tag-remove" data-id="${movie.id}" ${state.isSpinning ? 'disabled' : ''}>✕</button>
    </div>
  `).join('');

  const movieInput = document.getElementById('movie-input');
  const addBtn = document.querySelector('#add-movie-form .add-movie-btn');
  if (movieInput) movieInput.disabled = state.isSpinning;
  if (addBtn) addBtn.disabled = state.isSpinning;
}

export async function addMovie(title) {
  try {
    const res = await postMovie(title);
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

export async function removeMovie(id) {
  try {
    await apiDeleteMovie(id);
    showToast('Фильм удалён из колеса', 'info');
  } catch (err) {
    showToast('Ошибка удаления', 'error');
  }
}
