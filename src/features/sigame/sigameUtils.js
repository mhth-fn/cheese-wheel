export const EMPTY_SIGAME_FORM = { title: '', tags: '' };
export const MAX_SIGAME_FILE_SIZE = 200 * 1024 * 1024;
export const MAX_SIGAME_TAGS = 9;

export const SIGAME_SORT_OPTIONS = {
  unplayed: [
    { value: 'created-desc', label: 'Сначала новые' },
    { value: 'created-asc', label: 'Сначала старые' },
    { value: 'title-asc', label: 'По названию А–Я' },
    { value: 'title-desc', label: 'По названию Я–А' },
  ],
  played: [
    { value: 'played-desc', label: 'Недавно сыгранные' },
    { value: 'played-asc', label: 'Давно сыгранные' },
    { value: 'rating-desc', label: 'С высокой оценкой' },
    { value: 'rating-asc', label: 'С низкой оценкой' },
    { value: 'title-asc', label: 'По названию А–Я' },
    { value: 'title-desc', label: 'По названию Я–А' },
  ],
};

export const DEFAULT_SIGAME_SORT = {
  unplayed: 'created-desc',
  played: 'played-desc',
};

const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

export function formatSigameDate(timestamp) {
  return timestamp ? dateFormatter.format(new Date(timestamp)) : '';
}

export function formatSigameDateInput(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatFileSize(bytes) {
  if (bytes == null || !Number.isFinite(Number(bytes))) return 'Размер неизвестен';
  const value = Number(bytes);
  if (value < 1024) return `${value} Б`;
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(value < 10 * 1024 ? 1 : 0)} КБ`;
  }
  return `${(value / (1024 * 1024)).toFixed(
    value < 10 * 1024 * 1024 ? 1 : 0
  )} МБ`;
}

export function normalizeSigameTags(rawTags) {
  const tags = [];
  const seen = new Set();
  String(rawTags || '')
    .split(',')
    .map(tag => tag.trim())
    .filter(Boolean)
    .forEach(tag => {
      const key = tag.toLocaleLowerCase('ru-RU');
      if (seen.has(key)) return;
      seen.add(key);
      tags.push(tag);
    });
  return tags;
}

export function validateSiqFile(file) {
  if (!file || !file.name.toLocaleLowerCase('ru-RU').endsWith('.siq')) {
    return 'Выберите файл пакета SIGame в формате .siq';
  }
  if (file.size < 1) return 'Выбранный файл пуст';
  if (file.size > MAX_SIGAME_FILE_SIZE) {
    return 'Размер файла не должен превышать 200 МБ';
  }
  return '';
}

export function sortSigamePacks(packs, sort) {
  return packs
    .map((pack, index) => ({ pack, index }))
    .sort((firstEntry, secondEntry) => {
      const first = firstEntry.pack;
      const second = secondEntry.pack;
      let result = 0;

      if (sort === 'created-desc') result = second.added_at - first.added_at;
      if (sort === 'created-asc') result = first.added_at - second.added_at;
      if (sort === 'played-desc' || sort === 'played-asc') {
        const firstMissing = first.played_at == null;
        const secondMissing = second.played_at == null;
        if (firstMissing !== secondMissing) result = firstMissing ? 1 : -1;
        else if (!firstMissing) {
          result = sort === 'played-desc'
            ? second.played_at - first.played_at
            : first.played_at - second.played_at;
        }
      }
      if (sort === 'title-asc') result = first.title.localeCompare(second.title, 'ru');
      if (sort === 'title-desc') result = second.title.localeCompare(first.title, 'ru');
      if (sort === 'rating-desc' || sort === 'rating-asc') {
        const firstMissing = first.average_rating == null;
        const secondMissing = second.average_rating == null;
        if (firstMissing !== secondMissing) result = firstMissing ? 1 : -1;
        else if (!firstMissing) {
          result = sort === 'rating-desc'
            ? second.average_rating - first.average_rating
            : first.average_rating - second.average_rating;
        }
      }
      return result || firstEntry.index - secondEntry.index;
    })
    .map(entry => entry.pack);
}
