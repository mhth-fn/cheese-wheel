function apiFetch(url, options = {}) {
  const token = localStorage.getItem('cheeseWheelToken');
  const headers = { ...(options.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(url, { ...options, headers });
}

export async function fetchUsers() {
  const res = await fetch('/api/users');
  return res.json();
}

export async function fetchSettings() {
  const res = await apiFetch('/api/settings');
  return res.json();
}

export async function fetchTheme() {
  const res = await apiFetch('/api/theme');
  return res.json();
}

export async function postTheme(theme) {
  return apiFetch('/api/theme', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ theme })
  });
}

export async function fetchWheelMovies() {
  const res = await apiFetch('/api/wheel');
  return res.json();
}

export async function postMovie(title, userId) {
  return apiFetch('/api/wheel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, user_id: userId })
  });
}

export async function deleteMovie(id) {
  return apiFetch(`/api/wheel/${id}`, { method: 'DELETE' });
}

export async function markWatched(id) {
  return apiFetch(`/api/wheel/${id}/watched`, { method: 'POST' });
}

export async function fetchNextWheelMovies() {
  const res = await apiFetch('/api/next-wheel');
  return res.json();
}

export async function postNextMovie(title, userId) {
  return apiFetch('/api/next-wheel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, user_id: userId })
  });
}

export async function deleteNextMovie(id) {
  return apiFetch(`/api/next-wheel/${id}`, { method: 'DELETE' });
}

export async function fetchWatched() {
  const res = await apiFetch('/api/watched');
  return res.json();
}

export async function postWatchedMovie(title) {
  return apiFetch('/api/watched', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title })
  });
}

export async function deleteWatched(id) {
  return apiFetch(`/api/watched/${id}`, { method: 'DELETE' });
}

export async function updateMovie(id, data) {
  return apiFetch(`/api/movies/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
}

export async function postRating(movieId, userId, rating) {
  return apiFetch('/api/ratings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ movie_id: movieId, user_id: userId, rating })
  });
}

export async function deleteRating(movieId) {
  return apiFetch(`/api/ratings/${movieId}`, { method: 'DELETE' });
}

export async function fetchStats() {
  const res = await apiFetch('/api/stats');
  return res.json();
}

export async function postAuth(userId, password) {
  return fetch('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, password })
  });
}

export async function postGuestAuth() {
  return fetch('/api/auth/guest', { method: 'POST' });
}

export async function changePassword(userId, oldPassword, newPassword) {
  return apiFetch(`/api/users/${userId}/password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ old_password: oldPassword, new_password: newPassword })
  });
}

export async function postSpinDuration(duration) {
  return apiFetch('/api/settings/spin-duration', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ duration })
  });
}

export async function postSpinEnabled(enabled) {
  return apiFetch('/api/settings/spin-enabled', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled })
  });
}

export async function postAddEnabled(enabled) {
  return apiFetch('/api/settings/add-enabled', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled })
  });
}

export async function postDecorationsEnabled(enabled) {
  return apiFetch('/api/settings/decorations-enabled', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled })
  });
}

export async function fetchCenterImage() {
  const res = await apiFetch('/api/center-image');
  return res.json();
}

export async function uploadCenterImage(file) {
  const form = new FormData();
  form.append('file', file);
  return apiFetch('/api/center-image', { method: 'POST', body: form });
}

export async function deleteCenterImage() {
  return apiFetch('/api/center-image', { method: 'DELETE' });
}

export async function fetchWineReviews() {
  const res = await apiFetch('/api/wine-reviews');
  return res.json();
}

export async function postWineReview(userId, title, content, recommend, wine_type, grape, region, vintage, price) {
  return apiFetch('/api/wine-reviews', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, title, content, recommend, wine_type, grape, region, vintage, price })
  });
}

export async function patchWineReview(id, userId, title, content, recommend, wine_type, grape, region, vintage, price) {
  return apiFetch(`/api/wine-reviews/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, title, content, recommend, wine_type, grape, region, vintage, price })
  });
}

export async function deleteWineReview(id, userId) {
  return apiFetch(`/api/wine-reviews/${id}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId })
  });
}

export async function fetchMovieReviews() {
  const res = await apiFetch('/api/movie-reviews');
  return res.json();
}

export async function postMovieReview(userId, title, content, recommend, director, year) {
  return apiFetch('/api/movie-reviews', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, title, content, recommend, director, year })
  });
}

export async function patchMovieReview(id, userId, title, content, recommend, director, year) {
  return apiFetch(`/api/movie-reviews/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, title, content, recommend, director, year })
  });
}

export async function deleteMovieReview(id, userId) {
  return apiFetch(`/api/movie-reviews/${id}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId })
  });
}

export async function postReviewReaction(reviewType, reviewId, reaction) {
  return apiFetch('/api/review-reactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ review_type: reviewType, review_id: reviewId, reaction })
  });
}
