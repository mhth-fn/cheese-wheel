import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  deleteFoodReview,
  deleteFoodReviewPhoto,
  fetchFoodReviews,
  patchFoodReview,
  postFoodReview,
  postReviewReaction,
  uploadFoodReviewPhoto,
} from '../api';
import { useApp } from '../app/AppContext';
import { formatReviewDate } from '../features/reviews/reviewUtils';
import { useDialogA11y } from '../hooks/useDialogA11y';
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

function FoodPhotoLightbox({ photo, onClose }) {
  const dialogRef = useDialogA11y(Boolean(photo), onClose);
  if (!photo) return null;

  return createPortal(
    <div
      className="food-photo-lightbox"
      onClick={event => event.target === event.currentTarget && onClose()}
    >
      <section
        ref={dialogRef}
        className="food-photo-lightbox-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`Фотография к обзору «${photo.reviewTitle}»`}
        tabIndex={-1}
      >
        <button
          className="food-photo-lightbox-close"
          type="button"
          onClick={onClose}
          aria-label="Закрыть фотографию"
        >
          Закрыть
        </button>
        <img
          className="food-photo-lightbox-image"
          src={photo.url}
          alt={`${photo.reviewTitle}: фото`}
        />
      </section>
    </div>,
    document.body
  );
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
  const [editingId, setEditingId] = useState(null);
  const [editFields, setEditFields] = useState({
    title: '',
    content: '',
    recommend: 1,
  });
  const [activePhoto, setActivePhoto] = useState(null);
  const photoInputRef = useRef(null);
  const editPhotoInputRef = useRef(null);
  const closePhoto = useCallback(() => setActivePhoto(null), []);

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
    const updateReaction = ({ dislikes, likes, reactions, review_id, review_type }) => {
      if (review_type !== 'food') return;
      setReviews(previous => previous.map(review => (
        Number(review.id) === Number(review_id)
          ? { ...review, dislikes, likes, reactions }
          : review
      )));
    };
    socket.on('food-reviews-changed', refresh);
    socket.on('review-reaction-updated', updateReaction);
    return () => {
      socket.off('food-reviews-changed', refresh);
      socket.off('review-reaction-updated', updateReaction);
    };
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
      setReviews(previous => previous.filter(item => item.id !== review.id));
      if (editingId === review.id) setEditingId(null);
      showToast('Обзор удалён', 'info');
    } catch (error) {
      showToast(error.message || 'Не удалось удалить обзор', 'error');
    } finally {
      setBusy(false);
    }
  };

  const startEdit = review => {
    setEditingId(review.id);
    if (editPhotoInputRef.current) editPhotoInputRef.current.value = '';
    setEditFields({
      title: review.title || '',
      content: review.content || '',
      recommend: Number(review.recommend),
    });
  };

  const addEditPhotos = async (event, review) => {
    const selected = [...(event.target.files || [])];
    event.target.value = '';
    if (selected.length === 0 || busy) return;
    const existingCount = review.photos?.length || 0;
    if (existingCount + selected.length > MAX_FOOD_PHOTOS) {
      showToast(`В обзоре может быть не больше ${MAX_FOOD_PHOTOS} фотографий`, 'error');
      return;
    }
    const invalid = selected.find(file => validateFoodPhoto(file));
    if (invalid) {
      showToast(`«${invalid.name}»: ${validateFoodPhoto(invalid)}`, 'error');
      return;
    }

    setBusy(true);
    let uploaded = 0;
    let compressed = 0;
    try {
      for (const file of selected) {
        const prepared = await prepareFoodPhoto(file);
        const saved = await readResponse(await uploadFoodReviewPhoto(review.id, prepared));
        uploaded += 1;
        if (saved.compressed) compressed += 1;
      }
      await load({ quiet: true });
      showToast(
        compressed > 0
          ? `Добавлено фото: ${uploaded}; сжато на сервере: ${compressed}`
          : `Добавлено фото: ${uploaded}`,
        'success'
      );
    } catch (error) {
      await load({ quiet: true });
      showToast(
        uploaded > 0
          ? `Добавлено фото: ${uploaded}. Следующее не загрузилось: ${error.message}`
          : (error.message || 'Не удалось добавить фотографию'),
        'error'
      );
    } finally {
      setBusy(false);
    }
  };

  const removeEditPhoto = async (review, photo) => {
    if (busy) return;
    setBusy(true);
    try {
      await readResponse(await deleteFoodReviewPhoto(review.id, photo.id));
      setReviews(previous => previous.map(item => (
        Number(item.id) === Number(review.id)
          ? {
              ...item,
              photos: (item.photos || []).filter(
                itemPhoto => Number(itemPhoto.id) !== Number(photo.id)
              ),
            }
          : item
      )));
      if (activePhoto?.url === photo.url) closePhoto();
      showToast('Фотография удалена', 'info');
    } catch (error) {
      showToast(error.message || 'Не удалось удалить фотографию', 'error');
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async event => {
    event.preventDefault();
    if (!editingId || !editFields.title.trim() || !editFields.content.trim() || busy) return;
    setBusy(true);
    try {
      const updated = await readResponse(await patchFoodReview(editingId, {
        title: editFields.title.trim(),
        content: editFields.content.trim(),
        recommend: editFields.recommend,
      }));
      setReviews(previous => previous.map(review => (
        review.id === editingId ? updated : review
      )));
      setEditingId(null);
      showToast('Обзор обновлён', 'success');
    } catch (error) {
      showToast(error.message || 'Не удалось сохранить изменения', 'error');
    } finally {
      setBusy(false);
    }
  };

  const reactToReview = async (reviewId, reaction) => {
    try {
      const updated = await readResponse(
        await postReviewReaction('food', reviewId, reaction)
      );
      setReviews(previous => previous.map(review => (
        Number(review.id) === Number(reviewId)
          ? {
              ...review,
              likes: updated.likes,
              dislikes: updated.dislikes,
              reactions: updated.reactions,
            }
          : review
      )));
    } catch (error) {
      showToast(error.message || 'Не удалось сохранить реакцию', 'error');
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
              <small>До 4 фото, каждое до 100 МБ; файлы больше 10 МБ сжимаются</small>
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
          const ownReaction = (review.reactions || []).find(
            item => Number(item.user_id) === Number(currentUser?.id)
          )?.reaction;
          return (
            <article className="review-card food-review-card" key={review.id}>
              {editingId !== review.id && review.photos?.length > 0 && (
                <div className={`food-photo-grid count-${Math.min(review.photos.length, 4)}`}>
                  {review.photos.map((photo, index) => (
                    <button
                      className="food-photo-trigger"
                      type="button"
                      key={photo.id}
                      onClick={event => {
                        event.currentTarget.focus({ preventScroll: true });
                        setActivePhoto({
                          reviewTitle: review.title,
                          url: photo.url,
                        });
                      }}
                      aria-label={`Открыть фото ${index + 1} к обзору «${review.title}»`}
                    >
                      <img
                        src={photo.thumbnail_url || photo.url}
                        alt={`${review.title}: фото`}
                      />
                    </button>
                  ))}
                </div>
              )}
              <div className="food-review-card-body">
                {editingId === review.id ? (
                  <form className="review-edit-form food-review-edit-form" onSubmit={saveEdit}>
                    <label className="review-form-field">
                      <span>Что пробовали</span>
                      <input
                        className="review-form-input"
                        value={editFields.title}
                        onChange={event => setEditFields(previous => ({
                          ...previous,
                          title: event.target.value,
                        }))}
                        maxLength={200}
                        required
                        autoFocus
                      />
                    </label>
                    <label className="review-form-field">
                      <span>Впечатления</span>
                      <textarea
                        className="review-form-textarea"
                        value={editFields.content}
                        onChange={event => setEditFields(previous => ({
                          ...previous,
                          content: event.target.value,
                        }))}
                        maxLength={5000}
                        rows={4}
                        required
                      />
                    </label>
                    <fieldset className="review-choice-fieldset">
                      <legend>Итог</legend>
                      <div className="review-choice-row">
                        {IMPRESSIONS.map(item => (
                          <button
                            key={item.value}
                            type="button"
                            className={`review-recommend-toggle ${item.className}${editFields.recommend === item.value ? ' active' : ''}`}
                            aria-pressed={editFields.recommend === item.value}
                            onClick={() => setEditFields(previous => ({
                              ...previous,
                              recommend: item.value,
                            }))}
                          >
                            {item.label}
                          </button>
                        ))}
                      </div>
                    </fieldset>
                    <section
                      className="food-review-edit-photos"
                      aria-label={`Фотографии обзора «${review.title}»`}
                    >
                      <div className="food-review-edit-photos-heading">
                        <strong>Фотографии</strong>
                        <span>{review.photos?.length || 0}/{MAX_FOOD_PHOTOS} · изменения применяются сразу</span>
                      </div>
                      {review.photos?.length > 0 ? (
                        <div className="food-review-edit-photo-grid">
                          {review.photos.map((photo, index) => (
                            <div className="food-review-edit-photo" key={photo.id}>
                              <img
                                src={photo.thumbnail_url || photo.url}
                                alt={`${review.title}: фото ${index + 1}`}
                              />
                              <button
                                type="button"
                                onClick={() => removeEditPhoto(review, photo)}
                                disabled={busy}
                                aria-label={`Удалить фото ${index + 1} из обзора «${review.title}»`}
                              >
                                Удалить
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="food-review-edit-photos-empty">Фотографий пока нет</span>
                      )}
                      {(review.photos?.length || 0) < MAX_FOOD_PHOTOS && (
                        <label className="food-review-edit-photo-picker">
                          <input
                            className="sr-only"
                            type="file"
                            ref={editPhotoInputRef}
                            accept={FOOD_PHOTO_ACCEPT}
                            multiple
                            disabled={busy}
                            onChange={event => addEditPhotos(event, review)}
                          />
                          <span>Добавить фото</span>
                          <small>До 100 МБ; крупные файлы сервер уменьшит до 10 МБ</small>
                        </label>
                      )}
                    </section>
                    <div className="review-form-footer food-review-edit-actions">
                      <button
                        className="review-edit-cancel"
                        type="button"
                        onClick={() => setEditingId(null)}
                        disabled={busy}
                      >
                        Отмена
                      </button>
                      <button
                        className="review-submit-btn"
                        type="submit"
                        disabled={busy || !editFields.title.trim() || !editFields.content.trim()}
                      >
                        {busy ? 'Сохраняем…' : 'Сохранить'}
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <header className="review-card-header">
                      <span className="review-card-title">{review.title}</span>
                      <span className={`review-badge ${result.className}`}>{result.label}</span>
                      {canManage && (
                        <div className="review-card-actions">
                          <button
                            className="review-edit-btn"
                            type="button"
                            onClick={() => startEdit(review)}
                            disabled={busy}
                          >
                            Редактировать
                          </button>
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
                    </header>
                    <div className="review-card-meta">
                      <span className="review-author">{review.user_name}</span>
                      <span className="review-date">{formatReviewDate(review.created_at)}</span>
                    </div>
                    <p className="review-content">{review.content}</p>
                    {!isGuest && currentUser && (
                      <div className="review-reactions">
                        <button
                          className={`reaction-btn like${ownReaction === 1 ? ' active' : ''}`}
                          type="button"
                          onClick={() => reactToReview(review.id, 1)}
                          disabled={Number(currentUser.id) === Number(review.user_id)}
                          aria-label={`Нравится обзор «${review.title}», ${review.likes || 0}`}
                          aria-pressed={ownReaction === 1}
                        >
                          👍 {review.likes || 0}
                        </button>
                        <button
                          className={`reaction-btn dislike${ownReaction === -1 ? ' active' : ''}`}
                          type="button"
                          onClick={() => reactToReview(review.id, -1)}
                          disabled={Number(currentUser.id) === Number(review.user_id)}
                          aria-label={`Не нравится обзор «${review.title}», ${review.dislikes || 0}`}
                          aria-pressed={ownReaction === -1}
                        >
                          👎 {review.dislikes || 0}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </article>
          );
        })}
      </div>
      <FoodPhotoLightbox photo={activePhoto} onClose={closePhoto} />
    </div>
  );
}
