import { apiFetch } from './client';

export async function fetchUsers() {
  const response = await fetch('/api/users');
  return response.json();
}

export function fetchAuthSession() {
  return apiFetch('/api/auth/session');
}

export function postAuth(login, password) {
  return fetch('/api/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login, password }),
  });
}

export function fetchInvitation(token) {
  return fetch(`/api/invitations/${encodeURIComponent(token)}`);
}

export function acceptInvitation(token, password) {
  return fetch(`/api/invitations/${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
}

export function postAuthTwoFactor(challenge, code) {
  return fetch('/api/auth/2fa', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ challenge, code }),
  });
}

export function postGuestAuth() {
  return fetch('/api/auth/guest', { method: 'POST' });
}

export function postLogout() {
  return apiFetch('/api/auth/logout', { method: 'POST' });
}

export function changePassword(userId, oldPassword, newPassword) {
  return apiFetch(`/api/users/${userId}/password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
  });
}

export function changeUserName(userId, name) {
  return apiFetch(`/api/users/${userId}/name`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
}

export function fetchTwoFactorStatus() {
  return apiFetch('/api/2fa/status');
}

export function setupTwoFactor(password) {
  return apiFetch('/api/2fa/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
}

export function enableTwoFactor(code) {
  return apiFetch('/api/2fa/enable', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
}

export function disableTwoFactor(password, code) {
  return apiFetch('/api/2fa/disable', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password, code }),
  });
}

export function regenerateRecoveryCodes(password, code) {
  return apiFetch('/api/2fa/recovery-codes/regenerate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password, code }),
  });
}
