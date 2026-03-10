// ========== ПРОСМОТРЕННЫЕ ==========
import { state } from './state.js';
import { fetchWatched, postWatchedMovie, deleteWatched } from './api.js';
import { showToast, escapeHtml, formatDate } from './utils.js';
import { renderRatingCell, renderAvgRating } from './ratings.js';
import { loadStats } from './stats.js';

export async function loadWatchedMovies() {
  const res = await fetchWatched();
  state.watchedMovies = res;
  renderWatchedTable();
}

export async function addWatchedMovie(title) {
  try {
    const res = await postWatchedMovie(title);
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

export async function deleteWatchedMovie(id) {
  if (confirm('Удалить этот фильм из просмотренных?')) {
    try {
      await deleteWatched(id);
      await loadWatchedMovies();
      loadStats();
      showToast('Фильм удалён', 'info');
    } catch (err) {
      showToast('Ошибка удаления', 'error');
    }
  }
}

export function renderWatchedTable() {
  const container = document.getElementById('watched-content');

  if (state.watchedMovies.length === 0) {
    container.innerHTML = `
      <div class="watched-empty">
        <div class="watched-empty-icon">🎬</div>
        <div class="watched-empty-text">Пока нет просмотренных фильмов.<br>Крутите колесо!</div>
      </div>
    `;
    return;
  }

  let filtered = state.watchedMovies;
  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase();
    filtered = state.watchedMovies.filter(m => m.title.toLowerCase().includes(q));
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="watched-empty">
        <div class="watched-empty-icon">🔍</div>
        <div class="watched-empty-text">Ничего не найдено по запросу «${escapeHtml(state.searchQuery)}»</div>
      </div>
    `;
    return;
  }

  const sorted = [...filtered].sort((a, b) => {
    let aVal = a[state.sortColumn];
    let bVal = b[state.sortColumn];

    if (state.sortColumn === 'title') {
      aVal = aVal || '';
      bVal = bVal || '';
      return state.sortDirection === 'asc'
        ? aVal.localeCompare(bVal, 'ru')
        : bVal.localeCompare(aVal, 'ru');
    }

    aVal = aVal ?? -1;
    bVal = bVal ?? -1;
    return state.sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
  });

  const sortIcon = (col) => {
    if (state.sortColumn !== col) return '<span class="sort-icon">⇅</span>';
    return `<span class="sort-icon active">${state.sortDirection === 'asc' ? '↑' : '↓'}</span>`;
  };

  container.innerHTML = `
    <table class="watched-table">
      <thead>
        <tr>
          <th></th>
          <th data-sort="title">Фильм ${sortIcon('title')}</th>
          <th data-sort="rating_1">${state.users[0]?.name || 'User 1'} ${sortIcon('rating_1')}</th>
          <th data-sort="rating_2">${state.users[1]?.name || 'User 2'} ${sortIcon('rating_2')}</th>
          <th data-sort="rating_3">${state.users[2]?.name || 'User 3'} ${sortIcon('rating_3')}</th>
          <th data-sort="rating_4">${state.users[3]?.name || 'User 4'} ${sortIcon('rating_4')}</th>
          <th data-sort="avg_rating">Средняя ${sortIcon('avg_rating')}</th>
        </tr>
      </thead>
      <tbody>
        ${sorted.map(movie => `
          <tr>
            <td>${!state.isGuest ? `<button class="delete-watched-btn" data-id="${movie.id}" title="Удалить">✕</button>` : ''}</td>
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
