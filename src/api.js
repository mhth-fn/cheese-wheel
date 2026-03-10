export async function fetchUsers() {
  const res = await fetch('/api/users');
  return res.json();
}

export async function fetchSettings() {
  const res = await fetch('/api/settings');
  return res.json();
}

export async function fetchTheme() {
  const res = await fetch('/api/theme');
  return res.json();
}

export async function postTheme(theme) {
  return fetch('/api/theme', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ theme })
  });
}

export async function fetchWheelMovies() {
  const res = await fetch('/api/wheel');
  return res.json();
}

export async function postMovie(title) {
  return fetch('/api/wheel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title })
  });
}

export async function deleteMovie(id) {
  return fetch(`/api/wheel/${id}`, { method: 'DELETE' });
}

export async function markWatched(id) {
  return fetch(`/api/wheel/${id}/watched`, { method: 'POST' });
}

export async function fetchWatched() {
  const res = await fetch('/api/watched');
  return res.json();
}

export async function postWatchedMovie(title) {
  return fetch('/api/watched', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title })
  });
}

export async function deleteWatched(id) {
  return fetch(`/api/watched/${id}`, { method: 'DELETE' });
}

export async function postRating(movieId, userId, rating) {
  return fetch('/api/ratings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ movie_id: movieId, user_id: userId, rating })
  });
}

export async function fetchStats() {
  const res = await fetch('/api/stats');
  return res.json();
}

export async function postAuth(userId, password) {
  return fetch('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, password })
  });
}

export async function postSpinDuration(duration) {
  return fetch('/api/settings/spin-duration', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ duration })
  });
}
