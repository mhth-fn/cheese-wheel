import { useCallback, useEffect, useRef, useState } from 'react';
import {
  deleteFoodReview,
  fetchFoodReviews,
  postFoodReview,
  uploadFoodReviewPhoto,
} from '../api';
import { useApp } from '../app/AppContext';
import { formatReviewDate } from '../features/reviews/reviewUtils';
import {
  FOOD_PHOTO_ACCEPT,
  MAX_FOOD_PHOTOS,
  prepareFoodPhoto,
  validateFoodPhoto,
} from '../utils/foodPhotos';
import { readResponse } from '../utils/readResponse';

const IMPRESSIONS = [
  { value: 1, label: 'Рекомендую', className: 'yes' },
  { value: 0, label: 'Нормально', className: 'meh' },
  { value: -1, label: 'Не рекомендую', className: 'no' },
];
function impression(value) {
  return IMPRESSIONS.find(item => item.value === Number(value)) || IMPRESSIONS[1];
}

export default function FoodReviewsPage() {
  const { currentUser, isAdmin, isGuest, showToast, socket } = useApp();
  const [reviews, setReviews] = useState([]);
  const [loadState, setLoadState] = useState('loading');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [recommend, setRecommend] = useState(1);
  const [photos, setPhotos] = useState([]);
  const [busy, setBusy] = useState(false);
  const photoInputRef = useRef(null);

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoadState('loading');
    try {
      setReviews(await fetchFoodReviews());
      setLoadState('ready');
    } catch (error) {
      if (!quiet) setLoadState('error');
      else showToast(error.message || 'Не удалось обновить обзоры', 'error');
    }
  }, [showToast]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!socket) return undefined;
    const refresh = () => load({ quiet: true });
    socket.on('food-reviews-changed', refresh);
    return () => socket.off('food-reviews-changed', refresh);
  }, [load, socket]);

  const choosePhotos = event => {
    const selected = [...(event.target.files || [])];
    if (selected.length > MAX_FOOD_PHOTOS) {
      showToast(`Можно выбрать не больше ${MAX_FOOD_PHOTOS} фотографий`, 'error');
      event.target.value = '';
      setPhotos([]);
      return;
    }
    const invalid = selected.find(file => validateFoodPhoto(file));
    if (invalid) {
      showToast(`«${invalid.name}»: ${validateFoodPhoto(invalid)}`, 'error');
      event.target.value = '';
      setPhotos([]);
      return;
    }
    setPhotos(selected);
  };

  const submit = async event => {
    event.preventDefault();
    if (!title.trim() || !content.trim() || busy) return;
    setBusy(true);
    try {
      const preparedPhotos = [];
      for (const photo of photos) {
        preparedPhotos.push(await prepareFoodPhoto(photo));
      }
      const created = await readResponse(await postFoodReview({
        title: title.trim(),
        content: content.trim(),
        recommend,
      }));
      let uploaded = 0;
      const uploadErrors = [];
      for (const photo of preparedPhotos) {
        try {
          await readResponse(await uploadFoodReviewPhoto(created.id, photo));
          uploaded += 1;
        } catch (error) {
          uploadErrors.push(`«${photo.name}»: ${error.message || 'ошибка загрузки'}`);
        }
      }
      setTitle('');
      setContent('');
      setRecommend(1);
      setPhotos([]);
      if (photoInputRef.current) photoInputRef.current.value = '';
      await load({ quiet: true });
      if (uploadErrors.length > 0) {
        showToast(`Обзор опубликован, но фото не загрузилось: ${uploadErrors[0]}`, 'error');
      } else {
        showToast(
          uploaded > 0 ? `Обзор и фото (${uploaded}) опубликованы` : 'Обзор опубликован',
          'success'
        );
      }
    } catch (error) {
      showToast(error.message || 'Не удалось опубликовать обзор', 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = async review => {
    if (busy) return;
    setBusy(true);
    try {
      await readResponse(await deleteFoodReview(review.id));
      showToast('Обзор удалён', 'info');
    } catch (error) {
      showToast(error.message || 'Не удалось удалить обзор', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="reviews-page food-reviews-page">
      {!isGuest && currentUser && (
        <form className="review-form food-review-form" onSubmit={submit}>
          <div className="food-review-form-heading">
            <div>
              <strong>Новый обзор еды</strong>
              <span>Блюдо, ресторан, доставка или домашний эксперимент</span>
            </div>
          </div>
          <label className="review-form-field">
            <span>Что пробовали</span>
            <input
              className="review-form-input"
              value={title}
              onChange={event => setTitle(event.target.value)}
              maxLength={200}
              placeholder="Название блюда или места"
              required
            />
          </label>
          <label className="review-form-field">
            <span>Впечатления</span>
            <textarea
              className="review-form-textarea"
              value={content}
              onChange={event => setContent(event.target.value)}
              maxLength={5000}
              rows={4}
              placeholder="Вкус, подача, цена и всё, что важно"
              required
            />
          </label>
          <div className="food-review-options">
            <fieldset className="review-choice-fieldset">
              <legend>Итог</legend>
              <div className="review-choice-row">
                {IMPRESSIONS.map(item => (
                  <button
                    key={item.value}
                    type="button"
                    className={`review-recommend-toggle ${item.className}${recommend === item.value ? ' active' : ''}`}
                    aria-pressed={recommend === item.value}
                    onClick={() => setRecommend(item.value)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </fieldset>
            <label className="food-photo-picker">
              <span>Фотографии</span>
              <input
                className="food-photo-input sr-only"
                type="file"
                ref={photoInputRef}
                accept={FOOD_PHOTO_ACCEPT}
                multiple
                onChange={choosePhotos}
              />
              <span className="food-photo-button">Выбрать фото</span>
              <small>До 4 фото, каждое не больше 10 МБ; HEIC с iPhone поддерживается</small>
            </label>
          </div>
          {photos.length > 0 && (
            <div className="food-selected-photos" aria-live="polite">
              {photos.map(photo => <span key={`${photo.name}:${photo.size}`}>{photo.name}</span>)}
            </div>
          )}
          <div className="review-form-footer">
            <span>{content.length}/5000</span>
            <button
              className="review-submit-btn"
              type="submit"
              disabled={busy || !title.trim() || !content.trim()}
            >
              {busy ? 'Публикуем…' : 'Опубликовать'}
            </button>
          </div>
        </form>
      )}

      {loadState === 'loading' && <p className="reviews-journal-loading">Загружаем обзоры…</p>}
      {loadState === 'error' && (
        <div className="reviews-empty" role="alert">
          Не удалось загрузить обзоры.{' '}
          <button className="button-ghost" type="button" onClick={() => load()}>Повторить</button>
        </div>
      )}
      {loadState === 'ready' && reviews.length === 0 && (
        <p className="reviews-empty">Обзоров еды пока нет.</p>
      )}

      <div className="reviews-list food-reviews-list">
        {reviews.map(review => {
          const result = impression(review.recommend);
          const canManage = !isGuest && (
            Number(review.user_id) === Number(currentUser?.id) || isAdmin
          );
          return (
            <article className="review-card food-review-card" key={review.id}>
              {review.photos?.length > 0 && (
                <div className={`food-photo-grid count-${Math.min(review.photos.length, 4)}`}>
                  {review.photos.map(photo => (
                    <a href={photo.url} target="_blank" rel="noreferrer" key={photo.id}>
                      <img src={photo.url} alt={`${review.title}: фото`} loading="lazy" />
                    </a>
                  ))}
                </div>
              )}
              <div className="food-review-card-body">
                <header className="review-card-header">
                  <span className="review-card-title">{review.title}</span>
                  <span className={`review-badge ${result.className}`}>{result.label}</span>
                </header>
                <div className="review-card-meta">
                  <span className="review-author">{review.user_name}</span>
                  <span className="review-date">{formatReviewDate(review.created_at)}</span>
                </div>
                <p className="review-content">{review.content}</p>
                {canManage && (
                  <div className="review-card-actions">
                    <button
                      className="review-delete-btn"
                      type="button"
                      onClick={() => remove(review)}
                      disabled={busy}
                    >
                      Удалить
                    </button>
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
