// ========== НАВИГАЦИЯ (роутинг) ==========
import { state } from './state.js';
import { renderNav } from './nav.js';
import { loadWheelMovies } from './wheel.js';
import { loadWatchedMovies } from './watched.js';
import { loadStats } from './stats.js';

export const PAGE_PATHS = { wheel: '/', watched: '/watched' };
export const PATH_TO_PAGE = { '/': 'wheel', '/watched': 'watched' };

export function showPage(page, pushState = true) {
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
  if (!state.currentUser && !state.isGuest) return;
  const page = e.state?.page || PATH_TO_PAGE[location.pathname] || 'wheel';
  showPage(page, false);
});
