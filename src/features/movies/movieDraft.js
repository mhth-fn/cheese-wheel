export const EMPTY_MOVIE_DRAFT = {
  alternative_title: '',
  director: '',
  title: '',
  year: '',
};

export function movieToDraft(movie = {}) {
  return {
    alternative_title: movie.alternative_title || '',
    director: movie.director || '',
    title: movie.title || '',
    year: movie.year == null ? '' : String(movie.year),
  };
}

export function movieDraftPayload(draft) {
  return {
    alternative_title: draft.alternative_title.trim() || null,
    director: draft.director.trim() || null,
    title: draft.title.trim(),
    year: draft.year === '' ? null : Number(draft.year),
  };
}

export function movieMetaText(movie) {
  return [
    movie.alternative_title,
    movie.year,
    movie.director,
  ].filter(Boolean).join(' · ');
}
