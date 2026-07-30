import { apiFetch } from './client';

export async function fetchWatched() {
  const response = await apiFetch('/api/watched');
  return response.json();
}

export function postWatchedMovie(movie) {
  return apiFetch('/api/watched', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(movie),
  });
}

export function deleteWatched(id) {
  return apiFetch(`/api/watched/${id}`, { method: 'DELETE' });
}

export function updateMovie(id, data) {
  return apiFetch(`/api/movies/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export function postRating(movieId, userId, rating) {
  return apiFetch('/api/ratings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ movie_id: movieId, user_id: userId, rating }),
  });
}

export function deleteRating(movieId, userId = null) {
  const query = userId === null || userId === undefined
    ? ''
    : `?user_id=${encodeURIComponent(userId)}`;
  return apiFetch(`/api/ratings/${movieId}${query}`, { method: 'DELETE' });
}

export async function fetchStats(
  scope = 'all',
  comparisonScope = 'all',
  selectedUserIds = [],
) {
  const query = scope === 'selected'
    ? `?scope=selected&user_ids=${selectedUserIds.map(id => encodeURIComponent(id)).join(',')}`
    : scope === 'personal'
      ? comparisonScope === 'selected'
        ? `?scope=personal&comparison_scope=selected&user_ids=${selectedUserIds.map(id => encodeURIComponent(id)).join(',')}`
        : `?scope=personal${comparisonScope === 'core' ? '&comparison_scope=core' : ''}`
      : scope === 'core'
        ? '?scope=core'
        : '';
  const response = await apiFetch(`/api/stats${query}`);
  if (!response.ok) throw new Error('Не удалось загрузить статистику');
  return response.json();
}
