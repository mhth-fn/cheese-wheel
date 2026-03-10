// ========== SOCKET.IO ==========
import { state } from './state.js';
import { renderWheel, renderMovieList } from './wheel.js';
import { loadWatchedMovies } from './watched.js';
import { loadStats } from './stats.js';
import { applyTheme } from './theme.js';
import { performSpin } from './spin.js';

const socket = io();

export function getSocket() {
  return socket;
}

socket.on('connect', () => {
  document.getElementById('connection-dot').classList.add('connected');
  document.getElementById('connection-text').textContent = 'Онлайн';
});

socket.on('disconnect', () => {
  document.getElementById('connection-dot').classList.remove('connected');
  document.getElementById('connection-text').textContent = 'Отключено';
});

export function setupSocketListeners() {
  socket.on('wheel-spinning', (data) => {
    if (!state.isSpinning) {
      performSpin(data.winnerIndex, data.spinDuration, data.randomOffset || 0.5);
    }
  });

  socket.on('movie-added', (movie) => {
    if (!state.wheelMovies.find(m => m.id === movie.id)) {
      state.wheelMovies.push(movie);
      renderWheel();
      renderMovieList();
    }
  });

  socket.on('movie-removed', (data) => {
    state.wheelMovies = state.wheelMovies.filter(m => m.id !== data.id);
    renderWheel();
    renderMovieList();
  });

  socket.on('movie-watched', (movie) => {
    state.wheelMovies = state.wheelMovies.filter(m => m.id !== movie.id);
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
    state.spinDuration = settings.spin_duration;
    document.getElementById('spin-duration-input').value = state.spinDuration;
  });

  socket.on('theme-changed', (data) => {
    applyTheme(data.theme);
  });
}
