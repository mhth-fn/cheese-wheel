import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../app/AppContext';
import { resolveOneOffResult } from '../api';
import { useDialogA11y } from '../hooks/useDialogA11y';

async function readResponse(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Сервер отклонил запрос');
  return data;
}

export default function OneOffResultModal({ visible }) {
  const {
    isAdmin,
    oneOffState,
    setOneOffState,
    centerImage,
    showToast,
  } = useApp();
  const [dismissedMovieId, setDismissedMovieId] = useState(null);
  const [resolving, setResolving] = useState(false);
  const result = oneOffState.result;
  const movieId = result?.movie?.id ?? null;

  useEffect(() => {
    if (movieId !== dismissedMovieId) setDismissedMovieId(null);
  }, [dismissedMovieId, movieId]);

  const close = useCallback(() => {
    if (!isAdmin && movieId !== null) setDismissedMovieId(movieId);
  }, [isAdmin, movieId]);
  const dialogRef = useDialogA11y(
    Boolean(visible && result && dismissedMovieId !== movieId),
    close
  );

  if (!visible || !result || dismissedMovieId === movieId) return null;

  const handleResolve = async addToWatched => {
    setResolving(true);
    try {
      const data = await readResponse(await resolveOneOffResult(addToWatched));
      if (data.state) setOneOffState(data.state);
      showToast(
        addToWatched
          ? 'Фильм добавлен в просмотренные'
          : 'Выбор завершён без добавления в просмотренные',
        addToWatched ? 'success' : 'info'
      );
    } catch (error) {
      showToast(error.message || 'Не удалось завершить выбор', 'error');
    } finally {
      setResolving(false);
    }
  };

  return (
    <div
      className="dialog-backdrop result-backdrop"
      onMouseDown={event => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <section
        ref={dialogRef}
        className="result-card one-off-result-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="one-off-result-title"
        tabIndex={-1}
      >
        {!isAdmin && (
          <button
            className="result-close icon-button"
            type="button"
            onClick={close}
            aria-label="Закрыть результат"
          >
            ✕
          </button>
        )}
        <div className="result-card-header">
          <span className="result-card-label">Разовое колесо</span>
        </div>
        <div className="result-card-body">
          <div className="result-poster" aria-hidden="true">
            {centerImage ? <img src={centerImage} alt="" /> : '🎬'}
          </div>
          <div id="one-off-result-title" className="result-card-title">
            {result.movie.title}
          </div>
          <div className="result-card-suggested">
            {result.eliminated_movie
              ? `«${result.eliminated_movie.title}» выбыл последним`
              : result.movie.added_by_name
                ? `Предложил ${result.movie.added_by_name}`
                : 'Выбрано разовым колесом'}
          </div>
        </div>
        <div className="result-card-footer">
          {isAdmin ? (
            <>
              <button
                className="button-primary"
                type="button"
                onClick={() => handleResolve(true)}
                disabled={resolving}
              >
                Добавить в просмотренные
              </button>
              <button
                className="button-secondary"
                type="button"
                onClick={() => handleResolve(false)}
                disabled={resolving}
              >
                Не добавлять
              </button>
            </>
          ) : (
            <button className="button-primary" type="button" onClick={close}>
              Закрыть
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
