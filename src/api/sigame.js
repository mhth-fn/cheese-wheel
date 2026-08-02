import { apiFetch } from './client';

export async function fetchSigamePacks() {
  const response = await apiFetch('/api/sigame-packs');
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || 'Не удалось загрузить паки SIGame');
  return data;
}

export function createSigamePack(pack, file) {
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

export function updateSigamePack(id, pack) {
  return apiFetch(`/api/sigame-packs/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(pack),
  });
}

export function setSigamePackStatus(id, status) {
  return apiFetch(`/api/sigame-packs/${id}/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
}

export function updateSigamePackPlayedDate(id, playedDate) {
  return apiFetch(`/api/sigame-packs/${id}/played-date`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ played_date: playedDate }),
  });
}

export function rateSigamePack(id, rating) {
  return apiFetch(`/api/sigame-packs/${id}/rating`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rating }),
  });
}

export function deleteSigamePackRating(id) {
  return apiFetch(`/api/sigame-packs/${id}/rating`, { method: 'DELETE' });
}

export function deleteSigamePack(id) {
  return apiFetch(`/api/sigame-packs/${id}`, { method: 'DELETE' });
}

export function createSigamePackReview(packId, review) {
  return apiFetch(`/api/sigame-packs/${packId}/reviews`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(review),
  });
}

export function updateSigamePackReview(packId, reviewId, review) {
  return apiFetch(`/api/sigame-packs/${packId}/reviews/${reviewId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(review),
  });
}

export function deleteSigamePackReview(packId, reviewId) {
  return apiFetch(`/api/sigame-packs/${packId}/reviews/${reviewId}`, {
    method: 'DELETE',
  });
}

export function getSigamePackDownloadUrl(id) {
  return `/api/sigame-packs/${encodeURIComponent(id)}/download`;
}
