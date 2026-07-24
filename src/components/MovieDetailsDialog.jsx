import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../App';
import { useDialogA11y } from '../hooks/useDialogA11y';
import MovieReviewsSection from './MovieReviewsSection';

function formatDate(value) {
  if (!value) return 'Не указана';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Не указана';
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

export default function MovieDetailsDialog({
  movie,
  users,
  onClose,
  initialView = 'details',
}) {
  const { currentUser } = useApp();
  const [activeTab, setActiveTab] = useState(
    initialView === 'details' ? 'details' : 'reviews'
  );
  const close = useCallback(() => onClose(), [onClose]);
  const dialogRef = useDialogA11y(Boolean(movie), close);

  useEffect(() => {
    setActiveTab(initialView === 'details' ? 'details' : 'reviews');
  }, [movie?.id, initialView]);

  if (!movie) return null;

  const reviewCount = Number(movie.review_count) || 0;
  const ownRating = currentUser ? movie[`rating_${currentUser.id}`] : null;
  const handleTabKeyDown = event => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const nextTab = activeTab === 'details' ? 'reviews' : 'details';
    setActiveTab(nextTab);
    window.requestAnimationFrame(() => {
      document.getElementById(`movie-${nextTab}-tab`)?.focus();
    });
  };

  return (
    <div
      className="dialog-backdrop movie-details-backdrop"
      onMouseDown={event => event.target === event.currentTarget && onClose()}
    >
      <section
        ref={dialogRef}
        className="movie-details-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="movie-details-title"
        tabIndex={-1}
      >
        <header className="movie-details-header">
          <div>
            <p>Просмотренный фильм</p>
            <h2 id="movie-details-title">{movie.title}</h2>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={onClose}
            aria-label="Закрыть панель фильма"
          >
            ✕
          </button>
        </header>

        <div className="movie-details-meta">
          <div>
            <span>Просмотрен</span>
            <strong>{formatDate(movie.watched_at || movie.added_at)}</strong>
          </div>
          <div>
            <span>Предложил</span>
            <strong>{movie.added_by_name || 'Не указано'}</strong>
          </div>
          <div>
            <span>Моя оценка</span>
            <strong>{ownRating ?? '—'}</strong>
          </div>
          <div>
            <span>Средняя</span>
            <strong>{movie.avg_rating ? Number(movie.avg_rating).toFixed(1) : '—'}</strong>
          </div>
        </div>

        <div className="movie-details-tabs" role="tablist" aria-label="Информация о фильме">
          <button
            id="movie-details-tab"
            type="button"
            role="tab"
            aria-selected={activeTab === 'details'}
            aria-controls="movie-details-panel"
            className={activeTab === 'details' ? 'active' : ''}
            tabIndex={activeTab === 'details' ? 0 : -1}
            onClick={() => setActiveTab('details')}
            onKeyDown={handleTabKeyDown}
          >
            О фильме
          </button>
          <button
            id="movie-reviews-tab"
            type="button"
            role="tab"
            aria-selected={activeTab === 'reviews'}
            aria-controls="movie-reviews-panel"
            className={activeTab === 'reviews' ? 'active' : ''}
            tabIndex={activeTab === 'reviews' ? 0 : -1}
            onClick={() => setActiveTab('reviews')}
            onKeyDown={handleTabKeyDown}
          >
            Рецензии <span>{reviewCount}</span>
          </button>
        </div>

        <div className="movie-details-body">
          <div
            id="movie-details-panel"
            role="tabpanel"
            aria-labelledby="movie-details-tab"
            className="movie-details-ratings"
            hidden={activeTab !== 'details'}
          >
            <h3>Оценки участников</h3>
            {users.map(user => {
              const rating = movie[`rating_${user.id}`];
              return (
                <div key={user.id} className="movie-detail-rating">
                  <span className="movie-detail-avatar" aria-hidden="true">
                    {user.name.slice(0, 1)}
                  </span>
                  <span>{user.name}</span>
                  <strong>{rating ?? '—'}</strong>
                </div>
              );
            })}
          </div>
          <div
            id="movie-reviews-panel"
            role="tabpanel"
            aria-labelledby="movie-reviews-tab"
            hidden={activeTab !== 'reviews'}
          >
            <MovieReviewsSection
              movie={movie}
              focusComposer={initialView === 'compose' && activeTab === 'reviews'}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
