import { apiFetch } from './client';

export function fetchAdminUsers() {
  return apiFetch('/api/admin/users');
}

export function updateAdminUserRole(userId, role) {
  return apiFetch(`/api/admin/users/${userId}/role`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role }),
  });
}

export function createInvitation(name) {
  return apiFetch('/api/admin/invitations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
}

export function fetchAdminAudit({ cursor, limit = 30 } = {}) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor !== undefined && cursor !== null && cursor !== '') {
    params.set('cursor', String(cursor));
  }
  return apiFetch(`/api/admin/audit?${params.toString()}`);
}
