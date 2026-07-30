'use strict';

const MAX_TITLE_LENGTH = 200;

function parseIntStrict(value) {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) return parseInt(value, 10);
  return NaN;
}

function sanitizeTitle(title) {
  if (typeof title !== 'string') return null;
  const trimmed = title.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_TITLE_LENGTH) return null;
  return trimmed;
}

function sanitizeOptionalMovieText(value, maxLength = MAX_TITLE_LENGTH) {
  if (value === null || value === '') return { valid: true, value: null };
  if (typeof value !== 'string') return { valid: false, value: null };
  const trimmed = value.trim();
  if (!trimmed) return { valid: true, value: null };
  if (trimmed.length > maxLength || /[\p{Cc}\p{Cf}]/u.test(trimmed)) {
    return { valid: false, value: null };
  }
  return { valid: true, value: trimmed };
}

function readMovieInput(body, existing = null) {
  const source = body && typeof body === 'object' ? body : {};
  const title = source.title === undefined && existing
    ? existing.title
    : sanitizeTitle(source.title);
  if (!title) {
    return { error: 'Введите название фильма (до 200 символов)' };
  }

  const alternativeResult = source.alternative_title === undefined
    ? { valid: true, value: existing?.alternative_title || null }
    : sanitizeOptionalMovieText(source.alternative_title);
  if (!alternativeResult.valid) {
    return { error: 'Альтернативное название — до 200 символов' };
  }

  const directorResult = source.director === undefined
    ? { valid: true, value: existing?.director || null }
    : sanitizeOptionalMovieText(source.director);
  if (!directorResult.valid) {
    return { error: 'Имя режиссёра — до 200 символов' };
  }

  let year = existing?.year ?? null;
  if (source.year !== undefined) {
    if (source.year === null || source.year === '') {
      year = null;
    } else {
      year = parseIntStrict(source.year);
      if (isNaN(year) || year < 1888 || year > 2100) {
        return { error: 'Год фильма — от 1888 до 2100' };
      }
    }
  }

  return {
    title,
    alternative_title: alternativeResult.value,
    director: directorResult.value,
    year,
  };
}


module.exports = {
  parseIntStrict,
  readMovieInput,
  sanitizeTitle,
};
