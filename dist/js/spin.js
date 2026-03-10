// ========== ВРАЩЕНИЕ КОЛЕСА ==========
import { state } from './state.js';
import { initAudio, playClick, playWinSound } from './audio.js';
import { renderWheel, renderMovieList } from './wheel.js';
import { markWatched, postSpinDuration } from './api.js';
import { getSocket } from './socket.js';

export function spinWheel() {
  if (state.isGuest || state.wheelMovies.length === 0 || state.isSpinning) return;

  const winnerIndex = Math.floor(Math.random() * state.wheelMovies.length);
  const raw = parseInt(document.getElementById('spin-duration-input').value) || 5;
  const duration = Math.max(5, Math.min(15, raw));
  const randomOffset = 0.002 + Math.random() * 0.996;

  const socket = getSocket();
  socket.emit('spin-wheel', {
    winnerIndex,
    spinDuration: duration,
    randomOffset
  });

  performSpin(winnerIndex, duration, randomOffset);
}

export function performSpin(winnerIndex, duration, randomOffset = 0.5) {
  if (state.isSpinning || state.wheelMovies.length === 0) return;

  state.isSpinning = true;
  const spinBtn = document.getElementById('spin-btn');
  spinBtn.disabled = true;
  renderMovieList();

  const outerEl = document.getElementById('wheel-outer');
  if (outerEl) outerEl.classList.add('spinning');

  initAudio();

  const n = state.wheelMovies.length;
  const segmentAngle = 360 / n;
  const offsetInSegment = segmentAngle * randomOffset;
  const winnerAngle = 360 - (winnerIndex * segmentAngle + offsetInSegment);
  const totalRotation = 360 * (4 + Math.random() * 2) + winnerAngle;

  const startAngle = state.wheelRotation;
  const endAngle = startAngle + totalRotation;
  const startTime = performance.now();
  const durationMs = duration * 1000;

  const pegCount = Math.max(n, 12);
  const pegAngle = 360 / pegCount;
  let lastPegIndex = Math.floor(((startAngle % 360) + 360) % 360 / pegAngle);

  function easeOutQuint(t) {
    if (t >= 1) return 1;
    return 1 - Math.pow(1 - t, 5);
  }

  function animate(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / durationMs, 1);
    const eased = easeOutQuint(progress);

    const currentAngle = startAngle + totalRotation * eased;
    state.wheelRotation = currentAngle;

    const spinner = document.getElementById('wheel-spinner');
    if (spinner) {
      spinner.style.transform = `rotate(${currentAngle}deg)`;
    }

    const normAngle = ((currentAngle % 360) + 360) % 360;
    const currentPeg = Math.floor(normAngle / pegAngle);
    if (currentPeg !== lastPegIndex) {
      lastPegIndex = currentPeg;
      const vol = 0.1 + 0.25 * (1 - progress);
      playClick(vol);

      const pointer = document.querySelector('.wheel-pointer');
      if (pointer) {
        pointer.classList.remove('bounce');
        void pointer.offsetWidth;
        pointer.classList.add('bounce');
      }
    }

    if (progress < 1) {
      state.wheelAnimId = requestAnimationFrame(animate);
    } else {
      state.wheelRotation = endAngle % 360;
      if (outerEl) outerEl.classList.remove('spinning');

      setTimeout(() => {
        const winner = state.wheelMovies[winnerIndex];
        if (winner) {
          state.pendingWinner = winner;
          showResultModal(winner.title);
        }
        state.isSpinning = false;
        spinBtn.disabled = state.isGuest;
        renderMovieList();
      }, 400);
    }
  }

  state.wheelAnimId = requestAnimationFrame(animate);
}

function showResultModal(title) {
  playWinSound();
  document.getElementById('modal-movie-title').textContent = title;
  document.getElementById('result-modal').classList.add('active');
}

export async function hideResultModal() {
  document.getElementById('result-modal').classList.remove('active');

  if (state.pendingWinner) {
    await markWatched(state.pendingWinner.id);
    state.pendingWinner = null;
  }
}

export async function saveSpinDuration() {
  const input = document.getElementById('spin-duration-input');
  let duration = parseInt(input.value);
  if (isNaN(duration) || duration < 5) duration = 5;
  if (duration > 15) duration = 15;
  input.value = duration;
  await postSpinDuration(duration);
}
