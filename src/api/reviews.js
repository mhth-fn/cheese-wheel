import { apiFetch } from './client';

export async function fetchWineReviews() {
  const response = await apiFetch('/api/wine-reviews');
  return response.json();
}

export function postWineReview(title, content, recommend, wineType, grape, region, vintage, price) {
  return apiFetch('/api/wine-reviews', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title,
      content,
      recommend,
      wine_type: wineType,
      grape,
      region,
      vintage,
      price,
    }),
  });
}

export function patchWineReview(id, title, content, recommend, wineType, grape, region, vintage, price) {
  return apiFetch(`/api/wine-reviews/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title,
      content,
      recommend,
      wine_type: wineType,
      grape,
      region,
      vintage,
      price,
    }),
  });
}

export function deleteWineReview(id) {
  return apiFetch(`/api/wine-reviews/${id}`, { method: 'DELETE' });
}

export async function fetchMusicReviews() {
  const response = await apiFetch('/api/music-reviews');
  return response.json();
}

export function postMusicReview({ artist, content, musicType, recommend, sourceUrl, title }) {
  return apiFetch('/api/music-reviews', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      artist,
      content,
      music_type: musicType,
      recommend,
      source_url: sourceUrl,
      title,
    }),
  });
}

export function patchMusicReview(id, { artist, content, musicType, recommend, sourceUrl, title }) {
  return apiFetch(`/api/music-reviews/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      artist,
      content,
      music_type: musicType,
      recommend,
      source_url: sourceUrl,
      title,
    }),
  });
}

export function deleteMusicReview(id) {
  return apiFetch(`/api/music-reviews/${id}`, { method: 'DELETE' });
}

export async function fetchMovieReviews(movieId = null) {
  const query = movieId ? `?movie_id=${encodeURIComponent(movieId)}` : '';
  const response = await apiFetch(`/api/movie-reviews${query}`);
  return response.json();
}

export function postMovieReview({
  movieId,
  title,
  content,
  recommend,
  director,
  year,
  autoLink = true,
}) {
  return apiFetch('/api/movie-reviews', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      movie_id: movieId,
      title,
      content,
      recommend,
      director,
      year,
      link_by_title: autoLink,
    }),
  });
}

export function patchMovieReview(id, { movieId, title, content, recommend, director, year }) {
  return apiFetch(`/api/movie-reviews/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      movie_id: movieId,
      title,
      content,
      recommend,
      director,
      year,
    }),
  });
}

export function deleteMovieReview(id) {
  return apiFetch(`/api/movie-reviews/${id}`, { method: 'DELETE' });
}

export function postReviewReaction(reviewType, reviewId, reaction) {
  return apiFetch('/api/review-reactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ review_type: reviewType, review_id: reviewId, reaction }),
  });
}

export async function fetchFoodReviews() {
  const response = await apiFetch('/api/food-reviews');
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || 'Не удалось загрузить обзоры еды');
  return data;
}

export function postFoodReview(review) {
  return apiFetch('/api/food-reviews', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(review),
  });
}

export function patchFoodReview(id, review) {
  return apiFetch(`/api/food-reviews/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(review),
  });
}

export function deleteFoodReview(id) {
  return apiFetch(`/api/food-reviews/${id}`, { method: 'DELETE' });
}

export function uploadFoodReviewPhoto(reviewId, file) {
  const params = new URLSearchParams({ original_file_name: file.name });
  return apiFetch(`/api/food-reviews/${reviewId}/photos?${params.toString()}`, {
    method: 'POST',
    headers: { 'Content-Type': file.type },
    body: file,
  });
}

export function deleteFoodReviewPhoto(reviewId, photoId) {
  return apiFetch(`/api/food-reviews/${reviewId}/photos/${photoId}`, {
    method: 'DELETE',
  });
}
