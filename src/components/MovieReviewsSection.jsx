import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../App';
import {
  deleteMovieReview,
  fetchMovieReviews,
  fetchWatched,
  patchMovieReview,
  postMovieReview,
  postReviewReaction,
} from '../api';

const RECOMMEND_OPTIONS = [
  { value: 1, label: '✅ Рекомендую', cls: 'yes' },
  { value: 0, label: '😐 Сойдёт', cls: 'meh' },
  { value: -1, label: '❌ Не рекомендую', cls: 'no' },
];

function getRecommendInfo(value) {
  if (value === 1) return { cls: 'yes', label: '✅ Рекомендую' };
  if (value === -1) return { cls: 'no', label: '❌ Не рекомендую' };
  return { cls: 'meh', label: '😐 Сойдёт' };
}

function normalizeTitle(value) {
  return String(value || '').trim().toLocaleLowerCase('ru');
}

function formatDate(value) {
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

export default function MovieReviewsSection({ movie = null, focusComposer = false }) {
  const { currentUser, isGuest, isAdmin, showToast, socket, connected } = useApp();
  const [reviews, setReviews] = useState([]);
  const [reviewsState, setReviewsState] = useState('loading');
  const [watchedMovies, setWatchedMovies] = useState([]);
  const [watchedState, setWatchedState] = useState(movie ? 'ready' : 'loading');
  const [formTitle, setFormTitle] = useState(movie?.title || '');
  const [formMovieId, setFormMovieId] = useState('');
  const [linkToWatched, setLinkToWatched] = useState(true);
  const [formContent, setFormContent] = useState('');
  const [recommend, setRecommend] = useState(1);
  const [director, setDirector] = useState('');
  const [year, setYear] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editFields, setEditFields] = useState({});
  const composerRef = useRef(null);

  const movieId = movie ? Number(movie.id) : null;

  const reviewBelongsToMovie = useCallback((review) => {
    if (!movieId) return true;
    return Number(review.movie_id) === movieId;
  }, [movieId]);

  const loadReviews = useCallback(async () => {
    setReviewsState('loading');
    try {
      const data = await fetchMovieReviews(movieId);
      if (!Array.isArray(data)) throw new Error();
      setReviews(movieId ? data.filter(reviewBelongsToMovie) : data);
      setReviewsState('ready');
    } catch {
      setReviewsState('error');
    }
  }, [movieId, reviewBelongsToMovie]);

  const loadWatchedMovies = useCallback(async () => {
    if (movie) return;
    setWatchedState('loading');
    try {
      const data = await fetchWatched();
      if (!Array.isArray(data)) throw new Error();
      setWatchedMovies(data);
      setWatchedState('ready');
    } catch {
      setWatchedState('error');
    }
  }, [movie]);

  useEffect(() => {
    loadReviews();
  }, [loadReviews]);

  useEffect(() => {
    loadWatchedMovies();
  }, [loadWatchedMovies]);

  useEffect(() => {
    if (!socket) return undefined;

    const onAdd = review => {
      if (!reviewBelongsToMovie(review)) return;
      setReviews(previous => [review, ...previous.filter(item => item.id !== review.id)]);
    };
    const onUpdate = review => {
      setReviews(previous => {
        const withoutReview = previous.filter(item => item.id !== review.id);
        return reviewBelongsToMovie(review) ? [review, ...withoutReview] : withoutReview;
      });
    };
    const onDelete = ({ id }) => {
      setReviews(previous => previous.filter(review => review.id !== id));
    };
    const onReaction = ({ review_type, review_id, likes, dislikes, reactions }) => {
      if (review_type !== 'movie') return;
      setReviews(previous => previous.map(review => review.id === review_id
        ? { ...review, likes, dislikes, reactions }
        : review));
    };
    const onWatchedAdded = () => {
      if (!movie) loadWatchedMovies();
    };
    const onWatchedChange = () => {
      if (!movie) loadWatchedMovies();
      loadReviews();
    };

    socket.on('movie-review-added', onAdd);
    socket.on('movie-review-updated', onUpdate);
    socket.on('movie-review-deleted', onDelete);
    socket.on('review-reaction-updated', onReaction);
    socket.on('watched-added', onWatchedAdded);
    socket.on('watched-deleted', onWatchedChange);
    socket.on('movie-updated', onWatchedChange);
    return () => {
      socket.off('movie-review-added', onAdd);
      socket.off('movie-review-updated', onUpdate);
      socket.off('movie-review-deleted', onDelete);
      socket.off('review-reaction-updated', onReaction);
      socket.off('watched-added', onWatchedAdded);
      socket.off('watched-deleted', onWatchedChange);
      socket.off('movie-updated', onWatchedChange);
    };
  }, [socket, movie, reviewBelongsToMovie, loadWatchedMovies, loadReviews]);

  useEffect(() => {
    if (!focusComposer || !currentUser) return;
    const frame = window.requestAnimationFrame(() => composerRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [focusComposer, currentUser, movieId]);

  const matchingWatchedMovies = useMemo(() => watchedMovies.filter(
    item => normalizeTitle(item.title) === normalizeTitle(formTitle)
  ), [watchedMovies, formTitle]);

  const selectedMovie = useMemo(() => {
    if (movie) return movie;
    if (formMovieId) {
      const explicitMatch = matchingWatchedMovies.find(
        item => String(item.id) === formMovieId
      );
      if (explicitMatch) return explicitMatch;
    }
    if (!linkToWatched) return null;
    return matchingWatchedMovies.length === 1 ? matchingWatchedMovies[0] : null;
  }, [movie, matchingWatchedMovies, formMovieId, linkToWatched]);

  const startEdit = review => {
    setEditingId(review.id);
    setEditFields({
      title: review.title,
      content: review.content,
      recommend: review.recommend,
      director: review.director || '',
      year: review.year || '',
      movieId: review.movie_id || null,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditFields({});
  };

  const handleEditSave = async id => {
    if (!editFields.title?.trim() || !editFields.content?.trim()) return;
    try {
      const response = await patchMovieReview(id, {
        title: editFields.title.trim(),
        content: editFields.content.trim(),
        recommend: editFields.recommend,
        director: editFields.director.trim() || null,
        year: editFields.year ? Number.parseInt(editFields.year, 10) : null,
        movieId: editFields.movieId,
      });
      const data = await response.json();
      if (!response.ok) {
        showToast(data.error || 'Ошибка сохранения', 'error');
        return;
      }
      setReviews(previous => previous.map(review => review.id === id ? data : review));
      cancelEdit();
      showToast('Рецензия обновлена', 'success');
    } catch {
      showToast('Ошибка соединения', 'error');
    }
  };

  const editField = field => event => {
    setEditFields(previous => ({ ...previous, [field]: event.target.value }));
  };

  const editMovieLink = event => {
    const nextMovie = watchedMovies.find(item => String(item.id) === event.target.value);
    setEditFields(previous => ({
      ...previous,
      movieId: nextMovie?.id || null,
      title: nextMovie?.title || previous.title,
    }));
  };

  const handleSubmit = async event => {
    event.preventDefault();
    const title = movie?.title || formTitle.trim();
    if (!title || !formContent.trim() || !currentUser || isGuest || !connected) return;
    setSubmitting(true);
    try {
      const response = await postMovieReview({
        movieId: selectedMovie?.id || null,
        title,
        autoLink: movie ? true : linkToWatched,
        content: formContent.trim(),
        recommend,
        director: director.trim() || null,
        year: year ? Number.parseInt(year, 10) : null,
      });
      const data = await response.json();
      if (!response.ok) {
        showToast(data.error || 'Ошибка сохранения', 'error');
        return;
      }
      setReviews(previous => [data, ...previous.filter(review => review.id !== data.id)]);
      setFormContent('');
      if (!movie) {
        setFormTitle('');
        setFormMovieId('');
        setLinkToWatched(true);
      }
      setRecommend(1);
      setDirector('');
      setYear('');
      showToast('Рецензия опубликована', 'success');
    } catch {
      showToast('Ошибка соединения', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReaction = async (id, reaction) => {
    try {
      const response = await postReviewReaction('movie', id, reaction);
      const data = await response.json();
      if (!response.ok) {
        showToast(data.error || 'Не удалось сохранить реакцию', 'error');
        return;
      }
      setReviews(previous => previous.map(review => review.id === id
        ? {
            ...review,
            likes: data.likes,
            dislikes: data.dislikes,
            reactions: data.reactions,
          }
        : review));
    } catch {
      showToast('Ошибка соединения', 'error');
    }
  };

  const handleDelete = async id => {
    try {
      const response = await deleteMovieReview(id);
      const data = await response.json();
      if (!response.ok) {
        showToast(data.error || 'Ошибка удаления', 'error');
        return;
      }
      setReviews(previous => previous.filter(review => review.id !== id));
      showToast('Рецензия удалена', 'info');
    } catch {
      showToast('Ошибка соединения', 'error');
    }
  };

  return (
    <div className={`movie-reviews-section${movie ? ' is-contextual' : ''}`}>
      {!isGuest && currentUser && (
        <form className="review-form" onSubmit={handleSubmit}>
          {movie ? (
            <div className="review-form-movie-lock">
              <span aria-hidden="true">🎬</span>
              <div>
                <small>Рецензия на фильм</small>
                <strong>{movie.title}</strong>
              </div>
            </div>
          ) : (
            <div className="review-form-field">
              <label className="review-field-label" htmlFor="movie-review-title">
                Название фильма *
              </label>
              <input
                id="movie-review-title"
                className="review-form-input"
                type="text"
                list="watched-movie-review-options"
                value={formTitle}
                onChange={event => {
                  setFormTitle(event.target.value);
                  setFormMovieId('');
                }}
                placeholder="Выберите из просмотренных или введите другое"
                maxLength={200}
                required
              />
              <datalist id="watched-movie-review-options">
                {watchedMovies.map(item => (
                  <option key={item.id} value={item.title} />
                ))}
              </datalist>
              {matchingWatchedMovies.length <= 1 && (
                <label className="review-link-choice">
                  <input
                    type="checkbox"
                    checked={linkToWatched}
                    onChange={event => setLinkToWatched(event.target.checked)}
                  />
                  <span>
                    {matchingWatchedMovies.length === 1
                      ? 'Связать с найденным фильмом в «Просмотренных»'
                      : 'Связать автоматически при точном совпадении'}
                  </span>
                </label>
              )}
              {watchedState === 'loading' ? (
                <small className="review-field-hint">Загружаем подсказки из просмотренного…</small>
              ) : watchedState === 'error' ? (
                <small className="review-field-hint is-error">
                  Подсказки не загрузились.
                  <button type="button" onClick={loadWatchedMovies}>Повторить</button>
                </small>
              ) : matchingWatchedMovies.length > 1 ? (
                <label className="review-form-field review-match-choice">
                  <span>В истории несколько фильмов с таким названием</span>
                  <select
                    className="review-form-input"
                    value={formMovieId}
                    onChange={event => setFormMovieId(event.target.value)}
                  >
                    <option value="">Оставить рецензию без связи</option>
                    {matchingWatchedMovies.map(item => (
                      <option key={item.id} value={item.id}>
                        {item.title} · {formatDate(item.watched_at || item.added_at)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : matchingWatchedMovies.length === 0 ? (
                <small className="review-field-hint">
                  Можно написать рецензию и на фильм не из общей истории.
                </small>
              ) : null}
            </div>
          )}

          <label className="review-form-field">
            <span>Текст рецензии *</span>
            <textarea
              ref={composerRef}
              className="review-form-textarea"
              placeholder="Что запомнилось, что сработало, а что — нет?"
              value={formContent}
              onChange={event => setFormContent(event.target.value)}
              maxLength={5000}
              rows={5}
              required
            />
          </label>

          <details className="review-extra-fields">
            <summary>Добавить режиссёра и год</summary>
            <div className="wine-fields-row">
              <label className="review-form-field wine-field">
                <span>Режиссёр</span>
                <input
                  className="review-form-input"
                  type="text"
                  value={director}
                  onChange={event => setDirector(event.target.value)}
                  maxLength={100}
                />
              </label>
              <label className="review-form-field wine-field wine-field-short">
                <span>Год</span>
                <input
                  className="review-form-input"
                  type="number"
                  value={year}
                  onChange={event => setYear(event.target.value)}
                  min={1888}
                  max={2100}
                />
              </label>
            </div>
          </details>

          <div className="review-form-footer">
            <div className="recommend-toggle-group" aria-label="Рекомендация">
              {RECOMMEND_OPTIONS.map(option => (
                <button
                  key={option.value}
                  type="button"
                  className={`review-recommend-toggle ${option.cls}${recommend === option.value ? ' active' : ''}`}
                  onClick={() => setRecommend(option.value)}
                  aria-pressed={recommend === option.value}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <button
              type="submit"
              className="review-submit-btn"
              disabled={submitting || !(movie?.title || formTitle.trim()) || !formContent.trim() || !connected}
            >
              {submitting ? 'Публикуем…' : 'Опубликовать'}
            </button>
          </div>
          {!connected && <p className="review-form-status">Публикация недоступна, пока нет соединения.</p>}
        </form>
      )}

      {isGuest && (
        <div className="review-readonly-note">
          В гостевом режиме рецензии можно читать. Чтобы написать свою, войдите как участник.
        </div>
      )}

      <div className="reviews-section-heading">
        <h3>{movie ? 'Рецензии участников' : 'Все рецензии'}</h3>
        {reviewsState === 'ready' && <span>{reviews.length}</span>}
      </div>

      {reviewsState === 'loading' ? (
        <div className="reviews-loading" aria-live="polite">
          <div className="skeleton" />
          <div className="skeleton" />
        </div>
      ) : reviewsState === 'error' ? (
        <div className="reviews-empty" role="alert">
          Не удалось загрузить рецензии.
          <button className="button-ghost" type="button" onClick={loadReviews}>Повторить</button>
        </div>
      ) : reviews.length === 0 ? (
        <p className="reviews-empty">Пока нет рецензий — ваша может стать первой.</p>
      ) : (
        <div className="reviews-list">
          {reviews.map(review => (
            <article key={review.id} className="review-card">
              {editingId === review.id ? (
                <div className="review-edit-form">
                  {review.movie_id ? (
                    <div className="review-form-movie-lock compact">
                      <span aria-hidden="true">🎬</span>
                      <strong>{review.title}</strong>
                    </div>
                  ) : (
                    <>
                      <label className="review-form-field">
                        <span>Название фильма</span>
                        <input
                          className="review-form-input"
                          value={editFields.title}
                          onChange={editField('title')}
                          maxLength={200}
                        />
                      </label>
                      {!movie && watchedMovies.length > 0 && (
                        <label className="review-form-field">
                          <span>Связать со строкой в «Просмотренных»</span>
                          <select
                            className="review-form-input"
                            value={editFields.movieId || ''}
                            onChange={editMovieLink}
                          >
                            <option value="">Оставить без связи</option>
                            {watchedMovies.map(item => (
                              <option key={item.id} value={item.id}>{item.title}</option>
                            ))}
                          </select>
                        </label>
                      )}
                    </>
                  )}
                  <label className="review-form-field">
                    <span>Текст рецензии</span>
                    <textarea
                      className="review-form-textarea"
                      value={editFields.content}
                      onChange={editField('content')}
                      maxLength={5000}
                      rows={4}
                    />
                  </label>
                  <div className="wine-fields-row">
                    <input
                      className="review-form-input wine-field"
                      value={editFields.director}
                      onChange={editField('director')}
                      maxLength={100}
                      placeholder="Режиссёр"
                      aria-label="Режиссёр"
                    />
                    <input
                      className="review-form-input wine-field wine-field-short"
                      type="number"
                      value={editFields.year}
                      onChange={editField('year')}
                      min={1888}
                      max={2100}
                      placeholder="Год"
                      aria-label="Год"
                    />
                  </div>
                  <div className="review-form-footer">
                    <div className="recommend-toggle-group" aria-label="Рекомендация">
                      {RECOMMEND_OPTIONS.map(option => (
                        <button
                          key={option.value}
                          type="button"
                          className={`review-recommend-toggle ${option.cls}${editFields.recommend === option.value ? ' active' : ''}`}
                          onClick={() => setEditFields(previous => ({ ...previous, recommend: option.value }))}
                          aria-pressed={editFields.recommend === option.value}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                    <button type="button" className="review-edit-cancel" onClick={cancelEdit}>Отмена</button>
                    <button
                      type="button"
                      className="review-submit-btn"
                      onClick={() => handleEditSave(review.id)}
                      disabled={!editFields.title?.trim() || !editFields.content?.trim()}
                    >
                      Сохранить
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <header className="review-card-header">
                    {!movie && <span className="review-card-title">{review.title}</span>}
                    <span className={`review-badge ${getRecommendInfo(review.recommend).cls}`}>
                      {getRecommendInfo(review.recommend).label}
                    </span>
                    {!isGuest && (currentUser?.id === review.user_id || isAdmin) && (
                      <div className="review-card-actions">
                        <button
                          className="review-edit-btn"
                          type="button"
                          onClick={() => startEdit(review)}
                          aria-label={`Редактировать рецензию на ${review.title}`}
                          title="Редактировать"
                        >
                          ✏️
                        </button>
                        <button
                          className="review-delete-btn"
                          type="button"
                          onClick={() => handleDelete(review.id)}
                          aria-label={`Удалить рецензию на ${review.title}`}
                          title="Удалить"
                        >
                          🗑️
                        </button>
                      </div>
                    )}
                  </header>
                  {(review.director || review.year) && (
                    <div className="wine-card-details">
                      {review.director && <span>🎥 {review.director}</span>}
                      {review.year && <span>📅 {review.year}</span>}
                    </div>
                  )}
                  <div className="review-card-meta">
                    <span className="review-author">{review.user_name}</span>
                    <span className="review-date">{formatDate(review.created_at)}</span>
                  </div>
                  <p className="review-content">{review.content}</p>
                  {!isGuest && currentUser && (
                    <div className="review-reactions">
                      <button
                        className={`reaction-btn like ${(review.reactions || []).find(item => item.user_id === currentUser.id)?.reaction === 1 ? 'active' : ''}`}
                        type="button"
                        onClick={() => handleReaction(review.id, 1)}
                        disabled={currentUser.id === review.user_id}
                        aria-label={`Нравится, ${review.likes || 0}`}
                        aria-pressed={(review.reactions || []).find(item => item.user_id === currentUser.id)?.reaction === 1}
                      >
                        👍 {review.likes || 0}
                      </button>
                      <button
                        className={`reaction-btn dislike ${(review.reactions || []).find(item => item.user_id === currentUser.id)?.reaction === -1 ? 'active' : ''}`}
                        type="button"
                        onClick={() => handleReaction(review.id, -1)}
                        disabled={currentUser.id === review.user_id}
                        aria-label={`Не нравится, ${review.dislikes || 0}`}
                        aria-pressed={(review.reactions || []).find(item => item.user_id === currentUser.id)?.reaction === -1}
                      >
                        👎 {review.dislikes || 0}
                      </button>
                    </div>
                  )}
                </>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
