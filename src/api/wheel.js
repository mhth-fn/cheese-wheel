import { apiFetch } from './client';

export async function fetchWheelMovies() {
  const response = await apiFetch('/api/wheel');
  return response.json();
}

export async function fetchWheelStatus() {
  const response = await apiFetch('/api/wheel/status');
  return response.json();
}

export function formWheel() {
  return apiFetch('/api/wheel/form', { method: 'POST' });
}

export function formNextWheel() {
  return apiFetch('/api/wheel/form-next', { method: 'POST' });
}

export function postMovie(movie) {
  return apiFetch('/api/wheel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(movie),
  });
}

export function deleteMovie(id) {
  return apiFetch(`/api/wheel/${id}`, { method: 'DELETE' });
}

export async function fetchNextWheelMovies() {
  const response = await apiFetch('/api/next-wheel');
  return response.json();
}

export function postNextMovie(movie) {
  return apiFetch('/api/next-wheel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(movie),
  });
}

export function deleteNextMovie(id) {
  return apiFetch(`/api/next-wheel/${id}`, { method: 'DELETE' });
}

export async function fetchOneOffWheel() {
  const response = await apiFetch('/api/one-off-wheel');
  if (!response.ok) throw new Error('Не удалось загрузить разовое колесо');
  return response.json();
}

export function patchOneOffWheelSettings(settings) {
  return apiFetch('/api/one-off-wheel/settings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  });
}

export function postOneOffMovie(title) {
  return apiFetch('/api/one-off-wheel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
}

export function deleteOneOffMovie(id) {
  return apiFetch(`/api/one-off-wheel/${id}`, { method: 'DELETE' });
}

export function resolveOneOffResult(addToWatched) {
  return apiFetch('/api/one-off-wheel/result', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ add_to_watched: addToWatched }),
  });
}
