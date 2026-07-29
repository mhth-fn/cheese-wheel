import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../App';
import {
  deleteOneOffMovie,
  postOneOffMovie,
  resolveOneOffResult,
} from '../api';
import CheeseWheel from './CheeseWheel';

async function readResponse(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Сервер отклонил запрос');
  return data;
}

export default function OneOffWheelPanel() {
  const {
    currentUser,
    isGuest,
    isAdmin,
    connected,
    socket,
    spinDuration,
    theme,
    oneOffState,
    setOneOffState,
    oneOffIsSpinning,
    setOneOffIsSpinning,
    remoteOneOffSpin,
    setRemoteOneOffSpin,
    showToast,
  } = useApp();
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [spinPending, setSpinPending] = useState(false);
  const [activeSpin, setActiveSpin] = useState(null);
  const [lastOutcome, setLastOutcome] = useState(null);
  const [resolving, setResolving] = useState(false);
  const wheelRef = useRef(null);
  const startedSpinIdRef = useRef(null);

  const movies = Array.isArray(oneOffState.movies) ? oneOffState.movies : [];
  const displayMovies = activeSpin?.movies?.length ? activeSpin.movies : movies;
  const result = oneOffState.result;
  const modeLabel = oneOffState.mode === 'elimination'
    ? 'На выбывание'
    : 'Сразу выбрать';

  useEffect(() => {
    if (!socket) return undefined;
    const reject = ({ error }) => {
      setSpinPending(false);
      setOneOffIsSpinning(false);
      showToast(error || 'Не удалось прокрутить разовое колесо', 'error');
    };
    socket.on('one-off-spin-rejected', reject);
    return () => socket.off('one-off-spin-rejected', reject);
  }, [setOneOffIsSpinning, showToast, socket]);

  useEffect(() => {
    if (!remoteOneOffSpin) return;
    setSpinPending(false);
    setLastOutcome(null);
    setActiveSpin(remoteOneOffSpin);
    setOneOffIsSpinning(true);
    setRemoteOneOffSpin(null);
  }, [remoteOneOffSpin, setOneOffIsSpinning, setRemoteOneOffSpin]);

  useEffect(() => {
    if (!activeSpin || startedSpinIdRef.current === activeSpin.spinId) return;
    const winnerIndex = activeSpin.movies.findIndex(
      movie => Number(movie.id) === Number(activeSpin.winnerMovieId)
    );
    if (winnerIndex < 0) {
      setActiveSpin(null);
      setOneOffIsSpinning(false);
      showToast('Состав разового колеса изменился', 'error');
      return;
    }
    startedSpinIdRef.current = activeSpin.spinId;
    wheelRef.current?.spin(
      winnerIndex,
      activeSpin.spinDuration,
      activeSpin.randomOffset,
      activeSpin.turns
    );
  }, [activeSpin, setOneOffIsSpinning, showToast]);

  useEffect(() => () => setOneOffIsSpinning(false), [setOneOffIsSpinning]);

  const handleSpinComplete = useCallback(() => {
    if (!activeSpin) return;
    setLastOutcome(activeSpin.outcome || null);
    setActiveSpin(null);
    setOneOffIsSpinning(false);
  }, [activeSpin, setOneOffIsSpinning]);

  const handleAdd = async event => {
    event.preventDefault();
    const nextTitle = title.trim();
    if (!nextTitle || saving) return;
    setSaving(true);
    try {
      await readResponse(await postOneOffMovie(nextTitle));
      setTitle('');
      showToast(`«${nextTitle}» добавлен в разовое колесо`, 'success');
    } catch (error) {
      showToast(error.message || 'Не удалось добавить фильм', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async movie => {
    setDeletingId(movie.id);
    try {
      await readResponse(await deleteOneOffMovie(movie.id));
      showToast('Фильм убран из разового колеса', 'info');
    } catch (error) {
      showToast(error.message || 'Не удалось удалить фильм', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  const handleSpin = () => {
    if (!isAdmin) {
      showToast('Разовое колесо прокручивает администратор', 'info');
      return;
    }
    if (!socket || !connected) {
      showToast('Нет соединения с сервером', 'error');
      return;
    }
    if (movies.length === 0 || result || oneOffIsSpinning || spinPending) return;
    setSpinPending(true);
    socket.emit('spin-one-off', {
      spinDuration: Math.max(2, Math.min(12, Math.round(spinDuration))),
    });
  };

  const handleResolve = async addToWatched => {
    setResolving(true);
    try {
      const data = await readResponse(await resolveOneOffResult(addToWatched));
      if (data.state) setOneOffState(data.state);
      setLastOutcome(null);
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

  const spinDisabled = (
    !isAdmin
    || !connected
    || movies.length === 0
    || Boolean(result)
    || oneOffIsSpinning
    || spinPending
  );
  const canMutate = connected && !isGuest && !oneOffIsSpinning && !result;

  return (
    <aside className="one-off-panel" aria-labelledby="one-off-title">
      <header className="one-off-header">
        <div>
          <p>Разовый сеанс</p>
          <h2 id="one-off-title">Гостевое колесо</h2>
        </div>
        <span className={`one-off-mode is-${oneOffState.mode}`}>{modeLabel}</span>
      </header>

      <div className="one-off-wheel-visual">
        {displayMovies.length > 0 ? (
          <>
            <CheeseWheel
              ref={wheelRef}
              movies={displayMovies}
              onSpinComplete={handleSpinComplete}
              theme={theme}
            />
            <button
              type="button"
              className={`wheel-center-btn one-off-spin-btn${spinPending ? ' is-pending' : ''}`}
              onClick={handleSpin}
              disabled={spinDisabled}
              aria-label="Крутить разовое колесо"
              aria-busy={spinPending || oneOffIsSpinning}
              title={isAdmin ? 'Крутить разовое колесо' : 'Прокручивает администратор'}
            >
              <span aria-hidden="true">{oneOffIsSpinning || spinPending ? '…' : '🎟️'}</span>
            </button>
          </>
        ) : (
          <div className="one-off-empty-wheel">
            <span aria-hidden="true">🎟️</span>
            <strong>Пока пусто</strong>
            <small>Добавьте фильмы ниже</small>
          </div>
        )}
      </div>

      {lastOutcome?.type === 'eliminated' && !oneOffIsSpinning && (
        <div className="one-off-outcome is-eliminated" role="status">
          <span aria-hidden="true">✕</span>
          <div>
            <strong>Выбывает «{lastOutcome.movie.title}»</strong>
            <small>В колесе осталось: {movies.length}</small>
          </div>
        </div>
      )}

      {result && !oneOffIsSpinning && !remoteOneOffSpin && (
        <section className="one-off-result" aria-live="polite">
          <span className="one-off-result-label">Выпал фильм</span>
          <strong>{result.movie.title}</strong>
          {result.eliminated_movie && (
            <small>«{result.eliminated_movie.title}» выбыл последним</small>
          )}
          {isAdmin ? (
            <div className="one-off-result-actions">
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
            </div>
          ) : (
            <small>Администратор решит, добавлять ли фильм в просмотренные.</small>
          )}
        </section>
      )}

      <form className="one-off-add" onSubmit={handleAdd}>
        <label htmlFor="one-off-movie-input">Добавить разовый фильм</label>
        <div>
          <input
            id="one-off-movie-input"
            type="text"
            value={title}
            maxLength={200}
            placeholder={isGuest ? 'Гостям доступен только просмотр' : 'Название фильма…'}
            onChange={event => setTitle(event.target.value)}
            disabled={!canMutate || saving}
          />
          <button
            className="button-primary"
            type="submit"
            disabled={!canMutate || saving || !title.trim()}
          >
            Добавить
          </button>
        </div>
      </form>

      <div className="one-off-table-wrap">
        <table className="one-off-table">
          <caption>Фильмы разового колеса: {movies.length}</caption>
          <thead>
            <tr>
              <th>Фильм</th>
              <th>Добавил</th>
              <th><span className="sr-only">Действия</span></th>
            </tr>
          </thead>
          <tbody>
            {movies.map(movie => {
              const manageable = (
                !isGuest
                && (isAdmin || Number(movie.added_by) === Number(currentUser?.id))
              );
              return (
                <tr key={movie.id}>
                  <td title={movie.title}>{movie.title}</td>
                  <td>{movie.added_by_name}</td>
                  <td>
                    {manageable && (
                      <button
                        className="one-off-delete"
                        type="button"
                        onClick={() => handleDelete(movie)}
                        disabled={!canMutate || deletingId === movie.id}
                        aria-label={`Удалить фильм ${movie.title}`}
                        title="Удалить"
                      >
                        ✕
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {movies.length === 0 && (
              <tr>
                <td colSpan="3" className="one-off-empty-row">Здесь появятся предложения участников</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </aside>
  );
}
