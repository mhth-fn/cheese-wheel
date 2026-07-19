import { useCallback } from 'react';
import { useDialogA11y } from '../hooks/useDialogA11y';

function formatDate(value) {
  if (!value) return 'Не указана';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Не указана';
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' }).format(date);
}

export default function MovieDetailsDialog({ movie, users, onClose }) {
  const close = useCallback(() => onClose(), [onClose]);
  const dialogRef = useDialogA11y(Boolean(movie), close);
  if (!movie) return null;

  return (
    <div className="dialog-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
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
            <p>История просмотра</p>
            <h2 id="movie-details-title">{movie.title}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Закрыть подробности">✕</button>
        </header>

        <div className="movie-details-meta">
          <div>
            <span>Предложил</span>
            <strong>{movie.added_by_name || 'Не указано'}</strong>
          </div>
          <div>
            <span>Просмотрен</span>
            <strong>{formatDate(movie.watched_at || movie.added_at)}</strong>
          </div>
          <div>
            <span>Средняя</span>
            <strong>{movie.avg_rating ? Number(movie.avg_rating).toFixed(1) : '—'}</strong>
          </div>
        </div>

        <div className="movie-details-ratings">
          <h3>Оценки участников</h3>
          {users.map(user => {
            const rating = movie[`rating_${user.id}`];
            return (
              <div key={user.id} className="movie-detail-rating">
                <span className="movie-detail-avatar" aria-hidden="true">{user.name.slice(0, 1)}</span>
                <span>{user.name}</span>
                <strong>{rating ?? '—'}</strong>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
