function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function cleanYear(value) {
  const year = String(value ?? '').trim();
  return /^\d{4}$/.test(year) ? year : '';
}

export function movieSearchText(movie, { preferAlternative = false } = {}) {
  const title = cleanText(
    preferAlternative
      ? movie?.alternative_title || movie?.title
      : movie?.title || movie?.alternative_title,
  );
  const year = cleanYear(movie?.year);
  return [title, year].filter(Boolean).join(' ');
}

export function kinopoiskMovieUrl(movie) {
  const query = movieSearchText(movie);
  return `https://www.kinopoisk.ru/index.php?kp_query=${encodeURIComponent(query)}`;
}

export function imdbMovieUrl(movie) {
  const query = movieSearchText(movie, { preferAlternative: true });
  return `https://www.imdb.com/find/?q=${encodeURIComponent(query)}&s=tt`;
}
