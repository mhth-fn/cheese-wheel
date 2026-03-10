// ========== СТАТИСТИКА ==========
import { fetchStats } from './api.js';
import { escapeHtml } from './utils.js';

export async function loadStats() {
  try {
    const stats = await fetchStats();
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
