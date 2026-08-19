'use strict';

const MIN_USER_NAME_LENGTH = 2;
const MAX_USER_NAME_LENGTH = 32;

function normalizeUserName(value) {
  if (typeof value !== 'string') return '';
  return value
    .normalize('NFKC')
    .replace(/\s+/gu, ' ')
    .trim();
}

function normalizeLoginIdentifier(value) {
  return normalizeUserName(value).toLocaleLowerCase('ru-RU');
}

function validateUserName(value) {
  const name = normalizeUserName(value);
  const length = [...name].length;
  if (length < MIN_USER_NAME_LENGTH || length > MAX_USER_NAME_LENGTH) {
    return {
      error: `Имя от ${MIN_USER_NAME_LENGTH} до ${MAX_USER_NAME_LENGTH} символов`,
      name,
    };
  }
  if (/\p{C}/u.test(name) || /[\\/]/u.test(name)) {
    return { error: 'Имя содержит недопустимые символы', name };
  }
  return { error: null, name };
}

module.exports = {
  MAX_USER_NAME_LENGTH,
  MIN_USER_NAME_LENGTH,
  normalizeLoginIdentifier,
  normalizeUserName,
  validateUserName,
};
