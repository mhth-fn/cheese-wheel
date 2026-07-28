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

export async function fetchAuthSession() {
  return apiFetch('/api/auth/session');
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

export async function fetchWheelStatus() {
  const res = await apiFetch('/api/wheel/status');
  return res.json();
}

export async function formWheel() {
  return apiFetch('/api/wheel/form', { method: 'POST' });
}

export async function formNextWheel() {
  return apiFetch('/api/wheel/form-next', { method: 'POST' });
}

export async function postMovie(title) {
  return apiFetch('/api/wheel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title })
  });
}

export async function deleteMovie(id) {
  return apiFetch(`/api/wheel/${id}`, { method: 'DELETE' });
}

export async function fetchNextWheelMovies() {
  const res = await apiFetch('/api/next-wheel');
  return res.json();
}

export async function postNextMovie(title) {
  return apiFetch('/api/next-wheel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title })
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

export async function deleteRating(movieId, userId = null) {
  const query = userId === null || userId === undefined
    ? ''
    : `?user_id=${encodeURIComponent(userId)}`;
  return apiFetch(`/api/ratings/${movieId}${query}`, { method: 'DELETE' });
}

export async function fetchStats(scope = 'all', comparisonScope = 'all') {
  const query = scope === 'personal'
    ? `?scope=personal${comparisonScope === 'core' ? '&comparison_scope=core' : ''}`
    : scope === 'core'
      ? '?scope=core'
      : '';
  const res = await apiFetch(`/api/stats${query}`);
  if (!res.ok) throw new Error('Не удалось загрузить статистику');
  return res.json();
}

export async function postAuth(userId, password) {
  return fetch('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, password })
  });
}

export async function postAuthTwoFactor(challenge, code) {
  return fetch('/api/auth/2fa', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ challenge, code })
  });
}

export async function postGuestAuth() {
  return fetch('/api/auth/guest', { method: 'POST' });
}

export async function postLogout() {
  return apiFetch('/api/auth/logout', { method: 'POST' });
}

export async function changePassword(userId, oldPassword, newPassword) {
  return apiFetch(`/api/users/${userId}/password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ old_password: oldPassword, new_password: newPassword })
  });
}

export async function fetchTwoFactorStatus() {
  return apiFetch('/api/2fa/status');
}

export async function setupTwoFactor(password) {
  return apiFetch('/api/2fa/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password })
  });
}

export async function enableTwoFactor(code) {
  return apiFetch('/api/2fa/enable', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code })
  });
}

export async function disableTwoFactor(password, code) {
  return apiFetch('/api/2fa/disable', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password, code })
  });
}

export async function regenerateRecoveryCodes(password, code) {
  return apiFetch('/api/2fa/recovery-codes/regenerate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password, code })
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

export async function fetchAdminUsers() {
  return apiFetch('/api/admin/users');
}

export async function updateAdminUserRole(userId, role) {
  return apiFetch(`/api/admin/users/${userId}/role`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role })
  });
}

export async function fetchAdminAudit({ cursor, limit = 30 } = {}) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor !== undefined && cursor !== null && cursor !== '') {
    params.set('cursor', String(cursor));
  }
  return apiFetch(`/api/admin/audit?${params.toString()}`);
}

export async function fetchWineReviews() {
  const res = await apiFetch('/api/wine-reviews');
  return res.json();
}

export async function postWineReview(title, content, recommend, wine_type, grape, region, vintage, price) {
  return apiFetch('/api/wine-reviews', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, content, recommend, wine_type, grape, region, vintage, price })
  });
}

export async function patchWineReview(id, title, content, recommend, wine_type, grape, region, vintage, price) {
  return apiFetch(`/api/wine-reviews/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, content, recommend, wine_type, grape, region, vintage, price })
  });
}

export async function deleteWineReview(id) {
  return apiFetch(`/api/wine-reviews/${id}`, {
    method: 'DELETE'
  });
}

export async function fetchMovieReviews(movieId = null) {
  const query = movieId ? `?movie_id=${encodeURIComponent(movieId)}` : '';
  const res = await apiFetch(`/api/movie-reviews${query}`);
  return res.json();
}

export async function postMovieReview({ movieId, title, content, recommend, director, year, autoLink = true }) {
  return apiFetch('/api/movie-reviews', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ movie_id: movieId, title, content, recommend, director, year, link_by_title: autoLink })
  });
}

export async function patchMovieReview(id, { movieId, title, content, recommend, director, year }) {
  return apiFetch(`/api/movie-reviews/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ movie_id: movieId, title, content, recommend, director, year })
  });
}

export async function deleteMovieReview(id) {
  return apiFetch(`/api/movie-reviews/${id}`, {
    method: 'DELETE'
  });
}

export async function postReviewReaction(reviewType, reviewId, reaction) {
  return apiFetch('/api/review-reactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ review_type: reviewType, review_id: reviewId, reaction })
  });
}

export async function fetchVpnClients() {
  const res = await apiFetch('/api/vpn/clients');
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Не удалось загрузить VPN-конфигурации');
  return data;
}

export async function fetchVpnStatus() {
  const res = await apiFetch('/api/vpn/status');
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Не удалось проверить VPN-серверы');
  return data;
}

export async function createVpnClient(serverId, deviceName) {
  return apiFetch('/api/vpn/clients', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ server_id: serverId, device_name: deviceName })
  });
}

export async function deleteVpnClient(id) {
  return apiFetch(`/api/vpn/clients/${id}`, { method: 'DELETE' });
}

export async function fetchSigamePacks() {
  const res = await apiFetch('/api/sigame-packs');
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || 'Не удалось загрузить паки SIGame');
  return data;
}

export async function createSigamePack(pack, file) {
  const params = new URLSearchParams({
    title: pack.title,
    tags: JSON.stringify(pack.tags || []),
    original_file_name: file.name,
  });
  return apiFetch(`/api/sigame-packs?${params.toString()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: file,
  });
}

export async function updateSigamePack(id, pack) {
  return apiFetch(`/api/sigame-packs/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(pack),
  });
}

export async function setSigamePackStatus(id, status) {
  return apiFetch(`/api/sigame-packs/${id}/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
}

export async function updateSigamePackPlayedDate(id, playedDate) {
  return apiFetch(`/api/sigame-packs/${id}/played-date`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ played_date: playedDate }),
  });
}

export async function rateSigamePack(id, rating) {
  return apiFetch(`/api/sigame-packs/${id}/rating`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rating }),
  });
}

export async function deleteSigamePackRating(id) {
  return apiFetch(`/api/sigame-packs/${id}/rating`, { method: 'DELETE' });
}

export async function deleteSigamePack(id) {
  return apiFetch(`/api/sigame-packs/${id}`, { method: 'DELETE' });
}

export function getSigamePackDownloadUrl(id) {
  return `/api/sigame-packs/${encodeURIComponent(id)}/download`;
}
