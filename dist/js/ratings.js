// ========== РЕЙТИНГИ ==========
import { state } from './state.js';
import { postRating } from './api.js';
import { showToast } from './utils.js';
import { loadStats } from './stats.js';

export function renderRatingCell(movie, userId) {
  const ratingKey = `rating_${userId}`;
  const rating = movie[ratingKey];

  if (state.currentUser && state.currentUser.id === userId) {
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

export function renderAvgRating(avg) {
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

export async function setRating(movieId, userId, rating) {
  try {
    await postRating(movieId, userId, parseInt(rating));
    showToast(`Оценка ${rating} сохранена`, 'success');
    loadStats();
  } catch (err) {
    showToast('Ошибка сохранения оценки', 'error');
  }
}

export function setSort(column) {
  if (state.sortColumn === column) {
    state.sortDirection = state.sortDirection === 'asc' ? 'desc' : 'asc';
  } else {
    state.sortColumn = column;
    state.sortDirection = column === 'title' ? 'asc' : 'desc';
  }
}
