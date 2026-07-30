export function apiFetch(url, options = {}) {
  const token = localStorage.getItem('cheeseWheelToken');
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(url, { ...options, headers });
}
