import { apiFetch } from './client';

export async function fetchSettings() {
  const response = await apiFetch('/api/settings');
  return response.json();
}

export async function fetchTheme() {
  const response = await apiFetch('/api/theme');
  return response.json();
}

export function postTheme(theme) {
  return apiFetch('/api/theme', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ theme }),
  });
}

export function postSpinDuration(duration) {
  return apiFetch('/api/settings/spin-duration', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ duration }),
  });
}

export function postSpinEnabled(enabled) {
  return apiFetch('/api/settings/spin-enabled', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  });
}

export function postAddEnabled(enabled) {
  return apiFetch('/api/settings/add-enabled', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  });
}

export function postDecorationsEnabled(enabled) {
  return apiFetch('/api/settings/decorations-enabled', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  });
}

export async function fetchCenterImage() {
  const response = await apiFetch('/api/center-image');
  return response.json();
}

export function uploadCenterImage(file) {
  const form = new FormData();
  form.append('file', file);
  return apiFetch('/api/center-image', { method: 'POST', body: form });
}

export function deleteCenterImage() {
  return apiFetch('/api/center-image', { method: 'DELETE' });
}
