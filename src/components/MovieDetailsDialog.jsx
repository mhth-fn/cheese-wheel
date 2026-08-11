import { useCallback } from 'react';
import { useApp } from '../app/AppContext';
import { useDialogA11y } from '../hooks/useDialogA11y';
import MovieReviewsSection from './MovieReviewsSection';
import MovieExternalLinks from '../features/movies/MovieExternalLinks';

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
  renderRating,
  onEdit,
  onDelete,
}) {
  const { currentUser, isAdmin } = useApp();
  const close = useCallback(() => onClose(), [onClose]);
  const dialogRef = useDialogA11y(Boolean(movie), close);

  if (!movie) return null;

  const ownRating = currentUser ? movie[`rating_${currentUser.id}`] : null;

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
            {movie.alternative_title && (
              <span className="movie-details-alternative">{movie.alternative_title}</span>
            )}
            <MovieExternalLinks movie={movie} className="movie-details-external-links" />
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
            <span>Год</span>
            <strong>{movie.year || 'Не указан'}</strong>
          </div>
          <div>
            <span>Режиссёр</span>
            <strong>{movie.director || 'Не указан'}</strong>
          </div>
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

        <div className="movie-details-body">
          <section className="movie-details-ratings" aria-labelledby="movie-ratings-heading">
            <h3 id="movie-ratings-heading">Оценки участников</h3>
            {users.map(user => {
              const rating = movie[`rating_${user.id}`];
              return (
                <div key={user.id} className="movie-detail-rating">
                  <span className="movie-detail-avatar" aria-hidden="true">
                    {user.name.slice(0, 1)}
                  </span>
                  <span>{user.name}</span>
                  {renderRating ? renderRating(movie, user.id) : <strong>{rating ?? '—'}</strong>}
                </div>
              );
            })}
            {isAdmin && (
              <div className="movie-details-admin-actions" role="group" aria-label={`Действия с фильмом ${movie.title}`}>
                <button className="button-ghost" type="button" onClick={() => onEdit?.(movie)}>
                  ✎ Изменить
                </button>
                <button className="button-danger" type="button" onClick={() => onDelete?.(movie)}>
                  🗑 Удалить
                </button>
              </div>
            )}
          </section>
          <section
            className="movie-details-reviews"
            aria-label="Обзоры фильма"
          >
            <MovieReviewsSection
              movie={movie}
              focusComposer={initialView === 'compose'}
              focusReviews={initialView === 'reviews'}
            />
          </section>
        </div>
      </section>
    </div>
  );
}
