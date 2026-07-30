import { useState } from 'react';
import {
  EMPTY_MOVIE_DRAFT,
  movieDraftPayload,
  movieMetaText,
  movieToDraft,
} from '../movies/movieDraft';
import MovieFields from '../movies/MovieFields';
import MovieInlineEditor from './MovieInlineEditor';

function selectDisplayedMovies(movies, wheelStatus) {
  return wheelStatus.formed
    ? (wheelStatus.round_movies || wheelStatus.movies)
    : movies;
}

function mapPrimaryMovies(movies) {
  const primaryMovies = new Map();
  movies.forEach(movie => {
    if (movie.added_by && !primaryMovies.has(movie.added_by)) {
      primaryMovies.set(movie.added_by, movie);
    }
  });
  return primaryMovies;
}

export function countReadyParticipants(users, movies, wheelStatus) {
  const primaryMovies = mapPrimaryMovies(selectDisplayedMovies(movies, wheelStatus));
  return users.filter(user => primaryMovies.has(user.id)).length;
}

export default function DrawerParticipantsTab({
  movies,
  users,
  currentUser,
  isGuest,
  isAdmin,
  addEnabled,
  connected,
  wheelIsSpinning,
  wheelStatus,
  onAdd,
  onRemove,
  onUpdate,
  onForm,
}) {
  const [draft, setDraft] = useState(EMPTY_MOVIE_DRAFT);
  const [deletingId, setDeletingId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState(EMPTY_MOVIE_DRAFT);
  const [forming, setForming] = useState(false);

  const displayedMovies = selectDisplayedMovies(movies, wheelStatus);
  const primaryMovies = mapPrimaryMovies(displayedMovies);
  const currentUserMovie = primaryMovies.get(currentUser?.id);
  const extraMovies = displayedMovies.filter(
    movie => primaryMovies.get(movie.added_by)?.id !== movie.id,
  );

  const canManageMovie = movie => (
    !isGuest
    && Boolean(movie)
    && (movie.added_by === currentUser?.id || isAdmin)
  );
  const canManageCurrentMovie = movie => (
    !movie?.is_watched
    && canManageMovie(movie)
    && (!wheelStatus.formed || isAdmin)
  );

  const handleAdd = async event => {
    event.preventDefault();
    const movie = movieDraftPayload(draft);
    if (!movie.title || wheelIsSpinning) return;
    if (await onAdd(movie)) setDraft(EMPTY_MOVIE_DRAFT);
  };

  const handleDelete = async id => {
    if (wheelIsSpinning) return;
    setDeletingId(id);
    await onRemove(id);
    setDeletingId(null);
  };

  const startEditing = movie => {
    setEditingId(movie.id);
    setEditDraft(movieToDraft(movie));
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditDraft(EMPTY_MOVIE_DRAFT);
  };

  const saveEditing = async event => {
    event.preventDefault();
    const movie = movieDraftPayload(editDraft);
    if (!movie.title) return;
    if (await onUpdate(editingId, movie)) cancelEditing();
  };

  const handleForm = async () => {
    setForming(true);
    await onForm();
    setForming(false);
  };

  const renderMovieCopy = (movie, editing, idPrefix) => {
    if (editing) {
      return (
        <MovieInlineEditor
          movie={movie}
          draft={editDraft}
          onChange={setEditDraft}
          onSubmit={saveEditing}
          onCancel={cancelEditing}
          idPrefix={idPrefix}
        />
      );
    }
    return (
      <>
        <span title={movie?.title}>
          {movie?.title || (wheelStatus.formed ? 'Не участвовал в этом колесе' : 'Ещё не добавил фильм')}
        </span>
        {movie && movieMetaText(movie) && (
          <small className="wm-movie-meta">{movieMetaText(movie)}</small>
        )}
      </>
    );
  };

  return (
    <div className="wm-panel" role="tabpanel">
      {wheelIsSpinning && (
        <div className="wm-notice" role="status">Состав заблокирован до остановки колеса.</div>
      )}

      {!wheelStatus.formed && isAdmin && (
        <section className="wm-formation">
          <p>Проверьте выборы участников и сформируйте колесо для этого раунда.</p>
          <button
            className="button-primary wm-form-wheel"
            type="button"
            onClick={handleForm}
            disabled={isGuest || !connected || movies.length === 0 || wheelIsSpinning || forming}
          >
            {forming ? 'Формируем…' : 'Сформировать колесо'}
          </button>
        </section>
      )}
      {!wheelStatus.formed && !isAdmin && (
        <div className="wm-notice" role="status">
          Когда все выберут фильмы, администратор сформирует колесо.
        </div>
      )}

      {!wheelStatus.formed && !isGuest && addEnabled && !currentUserMovie && (
        <form className="wm-add-row wm-movie-entry" onSubmit={handleAdd}>
          <MovieFields value={draft} onChange={setDraft} idPrefix="movie-input-participants" />
          <button
            className="wm-add-btn button-primary"
            type="submit"
            disabled={!draft.title.trim() || wheelIsSpinning || !connected}
          >
            Добавить
          </button>
        </form>
      )}

      {!wheelStatus.formed && !isGuest && !addEnabled && (
        <div className="wm-notice">Добавление фильмов сейчас отключено.</div>
      )}

      <div className="wm-participants">
        {users.map(user => {
          const movie = primaryMovies.get(user.id);
          const watched = Boolean(movie?.is_watched);
          const unselected = wheelStatus.formed && !movie;
          const manageable = canManageCurrentMovie(movie);
          const editing = manageable && editingId === movie.id;
          const participantState = watched
            ? 'is-watched'
            : movie
              ? 'is-ready'
              : unselected
                ? 'is-unselected'
                : 'is-waiting';
          return (
            <article
              key={user.id}
              className={`wm-participant ${participantState}${editing ? ' is-editing' : ''}${manageable ? ' has-actions' : ''}`}
            >
              <span className="wm-avatar" aria-hidden="true">{user.name.slice(0, 1)}</span>
              <div className="wm-participant-copy">
                <strong>{user.name}{currentUser?.id === user.id ? ' · вы' : ''}</strong>
                {renderMovieCopy(movie, editing, `edit-current-${movie?.id}`)}
              </div>
              <span
                className="wm-participant-status"
                aria-label={watched ? 'Просмотрено' : movie ? 'В колесе' : unselected ? 'Не выбран' : 'Ожидаем фильм'}
              >
                {watched ? 'Просмотрено' : movie ? 'В колесе' : unselected ? 'Не выбран' : 'Ожидаем'}
              </span>
              {movie && !editing && manageable && (
                <div className="wm-participant-actions">
                  <button
                    className="icon-button"
                    type="button"
                    onClick={() => startEditing(movie)}
                    disabled={wheelIsSpinning}
                    aria-label={`Изменить фильм ${movie.title}`}
                    title="Изменить фильм"
                  >
                    ✎
                  </button>
                  <button
                    className="icon-button danger"
                    type="button"
                    onClick={() => handleDelete(movie.id)}
                    disabled={wheelIsSpinning || deletingId === movie.id}
                    aria-label={`Удалить фильм ${movie.title}`}
                    title="Удалить фильм"
                  >
                    {deletingId === movie.id ? '…' : '🗑'}
                  </button>
                </div>
              )}
            </article>
          );
        })}

        {extraMovies.map(movie => {
          const manageable = canManageCurrentMovie(movie);
          const editing = manageable && editingId === movie.id;
          return (
            <article
              key={movie.id}
              className={`wm-participant is-ready${editing ? ' is-editing' : ''}${manageable ? ' has-actions' : ''}`}
            >
              <span className="wm-avatar" aria-hidden="true">?</span>
              <div className="wm-participant-copy">
                <strong>{movie.added_by_name || 'Дополнительный фильм'}</strong>
                {editing ? (
                  <MovieInlineEditor
                    movie={movie}
                    draft={editDraft}
                    onChange={setEditDraft}
                    onSubmit={saveEditing}
                    onCancel={cancelEditing}
                    idPrefix={`edit-extra-${movie.id}`}
                  />
                ) : (
                  <>
                    <span>{movie.title}</span>
                    {movieMetaText(movie) && <small className="wm-movie-meta">{movieMetaText(movie)}</small>}
                  </>
                )}
              </div>
              <span className="wm-participant-status">Готово</span>
              {!editing && manageable && (
                <div className="wm-participant-actions">
                  <button className="icon-button" type="button" onClick={() => startEditing(movie)} aria-label={`Изменить фильм ${movie.title}`}>✎</button>
                  <button className="icon-button danger" type="button" onClick={() => handleDelete(movie.id)} aria-label={`Удалить фильм ${movie.title}`}>🗑</button>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
