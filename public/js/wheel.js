// ========== КОЛЕСО ==========
import { state } from './state.js';
import { fetchWheelMovies, postMovie, deleteMovie as apiDeleteMovie } from './api.js';
import { showToast, escapeHtml } from './utils.js';

export const WHEEL_COLORS = [
  ['#FFE566', '#FFF2A0'], ['#CD853F', '#DDA06B'], ['#FFC107', '#FFD54F'],
  ['#D2691E', '#E8945A'], ['#FFD700', '#FFEA70'], ['#A0522D', '#C47A55'],
  ['#F4C430', '#F8D86A'], ['#C4842D', '#DCA05A'], ['#FFCA28', '#FFDD6B'],
  ['#B8860B', '#D4A83B'], ['#FFB300', '#FFCB4D'], ['#8B6914', '#B09040']
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

  const n = state.wheelMovies.length;

  const pegCount = Math.max(n, 12);
  let pegsHtml = '';
  for (let i = 0; i < pegCount; i++) {
    const angle = (i / pegCount) * 360 - 90;
    const rad = angle * Math.PI / 180;
    const pegR = 45.5;
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

  const spinner = document.getElementById('wheel-spinner');
  if (spinner) {
    spinner.style.transform = `rotate(${state.wheelRotation}deg)`;
  }
}

export function drawWheel() {
  const canvas = document.getElementById('wheel-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const size = 720;
  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 4;
  const n = state.wheelMovies.length;
  const segAngle = (Math.PI * 2) / n;

  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.translate(cx, cy);

  state.wheelMovies.forEach((movie, i) => {
    const startA = i * segAngle - Math.PI / 2;
    const endA = (i + 1) * segAngle - Math.PI / 2;
    const [color1, color2] = WHEEL_COLORS[i % WHEEL_COLORS.length];

    const midA = (startA + endA) / 2;
    const grad = ctx.createLinearGradient(
      Math.cos(midA) * radius * 0.1, Math.sin(midA) * radius * 0.1,
      Math.cos(midA) * radius, Math.sin(midA) * radius
    );
    grad.addColorStop(0, color2);
    grad.addColorStop(1, color1);

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, radius, startA, endA);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    if (n > 1) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(startA) * radius, Math.sin(startA) * radius);
      ctx.strokeStyle = 'rgba(139, 69, 19, 0.5)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

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

    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.fillText(title, textR, 1);
    ctx.fillStyle = '#3d2800';
    ctx.fillText(title, textR, 0);
    ctx.restore();
  });

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
