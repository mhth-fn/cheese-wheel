// ========== СОБЫТИЯ ==========
import { state } from './state.js';
import { selectUser, attemptLogin, loginAsGuest, logout } from './auth.js';
import { addMovie, removeMovie } from './wheel.js';
import { spinWheel, hideResultModal, saveSpinDuration } from './spin.js';
import { addWatchedMovie, deleteWatchedMovie, renderWatchedTable } from './watched.js';
import { setRating, setSort } from './ratings.js';
import { setTheme, showAdminModal, hideAdminModal } from './theme.js';
import { showPage } from './router.js';

export function setupEventListeners() {
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
    if (state.isGuest || state.isSpinning) return;
    const input = document.getElementById('movie-input');
    const title = input.value.trim();
    if (title) {
      await addMovie(title);
      input.value = '';
    }
  });

  document.getElementById('watched-add-movie-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (state.isGuest) return;
    const input = document.getElementById('watched-movie-input');
    const title = input.value.trim();
    if (title) {
      await addWatchedMovie(title);
      input.value = '';
    }
  });

  document.getElementById('movie-list').addEventListener('click', (e) => {
    if (state.isGuest || state.isSpinning) return;
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
    if (th) {
      setSort(th.dataset.sort);
      renderWatchedTable();
    }

    if (e.target.classList.contains('delete-watched-btn')) {
      if (state.isGuest) return;
      deleteWatchedMovie(e.target.dataset.id);
    }
  });

  document.getElementById('watched-content').addEventListener('change', (e) => {
    if (state.isGuest) return;
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
      state.searchQuery = searchInput.value.trim();
      searchClear.classList.toggle('visible', state.searchQuery.length > 0);
      renderWatchedTable();
    });
  }
  if (searchClear) {
    searchClear.addEventListener('click', () => {
      searchInput.value = '';
      state.searchQuery = '';
      searchClear.classList.remove('visible');
      renderWatchedTable();
    });
  }
}
