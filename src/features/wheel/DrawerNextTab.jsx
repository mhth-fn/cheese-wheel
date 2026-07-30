import { useState } from 'react';
import {
  EMPTY_MOVIE_DRAFT,
  movieDraftPayload,
  movieMetaText,
  movieToDraft,
} from '../movies/movieDraft';
import MovieFields from '../movies/MovieFields';
import MovieInlineEditor from './MovieInlineEditor';

export default function DrawerNextTab({
  movies,
  currentUser,
  isGuest,
  isAdmin,
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
  const currentUserMovie = movies.find(movie => movie.added_by === currentUser?.id);

  const canManageMovie = movie => (
    !isGuest
    && Boolean(movie)
    && (movie.added_by === currentUser?.id || isAdmin)
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

  return (
    <div className="wm-panel" role="tabpanel">
      {!isGuest && (
        <>
          <form className="wm-add-row wm-movie-entry" onSubmit={handleAdd}>
            <MovieFields value={draft} onChange={setDraft} idPrefix="movie-input-next" />
            <button
              className="wm-add-btn button-primary"
              type="submit"
              disabled={!draft.title.trim() || wheelIsSpinning || !connected}
            >
              {currentUserMovie ? 'Заменить' : 'Добавить'}
            </button>
          </form>
          {currentUserMovie && (
            <p className="wm-own-choice-note">
              Сейчас ваш выбор — «{currentUserMovie.title}». Новое название заменит его.
            </p>
          )}
        </>
      )}
      <p className="wm-hint">Здесь каждый участник выбирает один фильм для следующего раунда.</p>

      {wheelStatus.formed && isAdmin && (
        <section className="wm-next-cycle">
          <p>Когда список будет готов, замените им текущее колесо.</p>
          <button
            className="button-primary"
            type="button"
            onClick={handleForm}
            disabled={!connected || movies.length === 0 || wheelIsSpinning || forming}
          >
            {forming ? 'Формируем…' : 'Сформировать следующее колесо'}
          </button>
        </section>
      )}

      <div className="wm-list">
        {movies.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon" aria-hidden="true">🧀</div>
            <div className="empty-state-title">Следующий список ещё не собран</div>
          </div>
        ) : movies.map(movie => {
          const editing = editingId === movie.id;
          const manageable = canManageMovie(movie);
          const isOwn = movie.added_by === currentUser?.id;
          return (
            <article
              key={movie.id}
              className={`wm-item ${deletingId === movie.id ? 'is-deleting' : ''}${editing ? ' is-editing' : ''}${manageable ? ' has-actions' : ''}`}
            >
              <span className="wm-avatar" aria-hidden="true">{movie.added_by_name?.slice(0, 1) || '?'}</span>
              <div className="wm-item-copy">
                {editing ? (
                  <MovieInlineEditor
                    movie={movie}
                    draft={editDraft}
                    onChange={setEditDraft}
                    onSubmit={saveEditing}
                    onCancel={cancelEditing}
                    idPrefix={`edit-next-${movie.id}`}
                  />
                ) : (
                  <strong title={movie.title}>{movie.title}</strong>
                )}
                <span>
                  {movieMetaText(movie) ? `${movieMetaText(movie)} · ` : ''}
                  Выбор на следующий раунд · {movie.added_by_name || 'Автор не указан'}{isOwn ? ' · вы' : ''}
                </span>
              </div>
              <span className="wm-item-status">Следующий раунд</span>
              {manageable && !editing && (
                <div className="wm-item-actions">
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
      </div>
    </div>
  );
}
