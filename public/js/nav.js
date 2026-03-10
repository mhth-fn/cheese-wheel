// ========== НАВИГАЦИЯ (рендеринг) ==========
import { state } from './state.js';
import { escapeHtml } from './utils.js';

export function renderNav(activePage) {
  const pages = ['wheel', 'watched'];
  const labels = { wheel: '🎡 Колесо', watched: '📋 Просмотренные' };
  const userName = state.isGuest ? 'Гость' : (state.currentUser ? state.currentUser.name : '');

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
