import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../app/AppContext';
import {
  deleteMovieReview,
  fetchMovieReviews,
  fetchWatched,
  patchMovieReview,
  postMovieReview,
  postReviewReaction,
} from '../api';
import MovieReviewCard from '../features/reviews/MovieReviewCard';
import MovieReviewComposer from '../features/reviews/MovieReviewComposer';
import { normalizeMovieTitle } from '../features/reviews/reviewUtils';

export default function MovieReviewsSection({
  movie = null,
  focusComposer = false,
  focusReviews = false,
}) {
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
  const reviewsHeadingRef = useRef(null);
  const existingReviewActionRef = useRef(null);
  const editFormRef = useRef(null);

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

  const matchingWatchedMovies = useMemo(() => watchedMovies.filter(
    item => normalizeMovieTitle(item.title) === normalizeMovieTitle(formTitle)
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

  const existingOwnReview = useMemo(() => {
    if (!currentUser || !selectedMovie) return null;
    return reviews.find(review => (
      Number(review.user_id) === Number(currentUser.id)
      && Number(review.movie_id) === Number(selectedMovie.id)
    )) || null;
  }, [currentUser, reviews, selectedMovie]);

  useEffect(() => {
    if (reviewsState !== 'ready') return undefined;
    const target = focusComposer
      ? (existingOwnReview ? existingReviewActionRef.current : composerRef.current)
      : focusReviews
        ? reviewsHeadingRef.current
        : null;
    if (!target) return undefined;
    const frame = window.requestAnimationFrame(() => {
      target.focus({ preventScroll: true });
      target.scrollIntoView({ block: 'start' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusComposer, focusReviews, reviewsState, movieId]);

  useEffect(() => {
    if (!editingId) return undefined;
    const frame = window.requestAnimationFrame(() => {
      const editForm = editFormRef.current;
      const textarea = editForm?.querySelector('textarea');
      textarea?.focus({ preventScroll: true });
      editForm?.scrollIntoView({ block: 'nearest' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [editingId]);

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
    if (existingOwnReview) {
      showToast('У вас уже есть обзор на этот фильм. Измените существующий.', 'info');
      return;
    }
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
        if (data.code === 'MOVIE_REVIEW_ALREADY_EXISTS') await loadReviews();
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
      <div className="reviews-section-heading">
        <h3 ref={reviewsHeadingRef} tabIndex={-1}>
          {movie ? 'Обзоры участников' : 'Все обзоры'}
        </h3>
        {reviewsState === 'ready' && <span>{reviews.length}</span>}
      </div>

      {!isGuest && currentUser && (!movie || (reviewsState === 'ready' && !existingOwnReview)) && (
        <MovieReviewComposer
          composerRef={composerRef}
          connected={connected}
          director={director}
          existingOwnReview={existingOwnReview}
          existingReviewActionRef={existingReviewActionRef}
          formContent={formContent}
          formMovieId={formMovieId}
          formTitle={formTitle}
          linkToWatched={linkToWatched}
          loadWatchedMovies={loadWatchedMovies}
          matchingWatchedMovies={matchingWatchedMovies}
          movie={movie}
          recommend={recommend}
          setDirector={setDirector}
          setFormContent={setFormContent}
          setFormMovieId={setFormMovieId}
          setFormTitle={setFormTitle}
          setLinkToWatched={setLinkToWatched}
          setRecommend={setRecommend}
          setYear={setYear}
          submitting={submitting}
          watchedMovies={watchedMovies}
          watchedState={watchedState}
          year={year}
          onStartEdit={startEdit}
          onSubmit={handleSubmit}
        />
      )}

      {!isGuest && currentUser && movie && reviewsState === 'ready' && existingOwnReview && (
        <div className="review-existing-note" role="status">
          <div>
            <strong>Вы уже написали обзор на этот фильм.</strong>
            <span>Можно отредактировать его ниже.</span>
          </div>
          <button
            ref={existingReviewActionRef}
            className="button-ghost"
            type="button"
            onClick={() => startEdit(existingOwnReview)}
          >
            Изменить мой обзор
          </button>
        </div>
      )}

      {isGuest && (
        <div className="review-readonly-note">
          В гостевом режиме рецензии можно читать. Чтобы написать свою, войдите как участник.
        </div>
      )}

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
            <MovieReviewCard
              key={review.id}
              currentUser={currentUser}
              editFields={editFields}
              editFormRef={editFormRef}
              editing={editingId === review.id}
              isAdmin={isAdmin}
              isGuest={isGuest}
              movie={movie}
              review={review}
              setEditFields={setEditFields}
              watchedMovies={watchedMovies}
              onCancelEdit={cancelEdit}
              onDelete={handleDelete}
              onEditMovieLink={editMovieLink}
              onReaction={handleReaction}
              onSave={handleEditSave}
              onStartEdit={startEdit}
            />
          ))}
        </div>
      )}
    </div>
  );
}
