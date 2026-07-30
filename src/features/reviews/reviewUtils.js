export const RECOMMEND_OPTIONS = [
  { value: 1, label: '✅ Рекомендую', cls: 'yes' },
  { value: 0, label: '😐 Сойдёт', cls: 'meh' },
  { value: -1, label: '❌ Не рекомендую', cls: 'no' },
];

export function getRecommendInfo(value) {
  if (value === 1) return { cls: 'yes', label: '✅ Рекомендую' };
  if (value === -1) return { cls: 'no', label: '❌ Не рекомендую' };
  return { cls: 'meh', label: '😐 Сойдёт' };
}

export function normalizeMovieTitle(value) {
  return String(value || '').trim().toLocaleLowerCase('ru');
}

export function formatReviewDate(value) {
  if (!value) return '';
  const normalized = value.includes('Z') || value.includes('+') ? value : `${value}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
