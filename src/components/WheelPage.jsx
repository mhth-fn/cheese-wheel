import { useState, useEffect, useRef, useCallback } from 'react';
import { useApp } from '../App';
import { fetchWheelMovies, markWatched } from '../api';
import CheeseWheel from './CheeseWheel';

export default function WheelPage() {
  const {
    currentUser,
    isGuest,
    users,
    socket,
    connected,
    showToast,
    spinDuration,
    spinEnabled,
    remoteSpin,
    setRemoteSpin,
    setWinner,
    theme,
    wheelMovies: movies,
    setWheelMovies: setMovies,
    centerImage,
    page,
    setDrawerOpen,
    setWheelIsSpinning,
  } = useApp();
  const [isSpinning, setIsSpinning] = useState(false);
  const [spinPending, setSpinPending] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [loadState, setLoadState] = useState('loading');
  const [loadError, setLoadError] = useState('');
  const isRemoteSpinRef = useRef(false);
  const wheelRef = useRef(null);

  const loadMovies = useCallback(async () => {
    setLoadState('loading');
    setLoadError('');
    try {
      const data = await fetchWheelMovies();
      if (!Array.isArray(data)) throw new Error('Некорректный ответ сервера');
      setMovies(data);
      setLoadState('ready');
    } catch (error) {
      console.error(error);
      setLoadError('Не удалось загрузить фильмы');
      setLoadState('error');
    }
  }, [setMovies]);

  useEffect(() => {
    if (page === 'wheel') loadMovies();
  }, [page, loadMovies]);

  useEffect(() => {
    if (!socket) return undefined;

    const onAdded = movie => setMovies(prev => prev.find(item => item.id === movie.id) ? prev : [...prev, movie]);
    const onRemoved = ({ id }) => setMovies(prev => prev.filter(movie => movie.id !== id));
    const onWatched = movie => setMovies(prev => prev.filter(item => item.id !== movie.id));
    const onSpinRejected = ({ error }) => {
      setSpinPending(false);
      setIsSpinning(false);
      setWheelIsSpinning(false);
      setSecondsLeft(0);
      showToast(error || 'Не удалось запустить колесо', 'error');
    };

    socket.on('movie-added', onAdded);
    socket.on('movie-removed', onRemoved);
    socket.on('movie-watched', onWatched);
    socket.on('spin-rejected', onSpinRejected);

    return () => {
      socket.off('movie-added', onAdded);
      socket.off('movie-removed', onRemoved);
      socket.off('movie-watched', onWatched);
      socket.off('spin-rejected', onSpinRejected);
    };
  }, [setMovies, setWheelIsSpinning, showToast, socket]);

  useEffect(() => {
    if (!remoteSpin || !wheelRef.current) return;
    if (!wheelRef.current.isSpinning) {
      setSpinPending(false);
      isRemoteSpinRef.current = !remoteSpin.initiatedByThisClient;
      wheelRef.current.spin(remoteSpin.winnerIndex, remoteSpin.spinDuration, remoteSpin.randomOffset, remoteSpin.turns);
      setIsSpinning(true);
      setWheelIsSpinning(true);
      setSecondsLeft(remoteSpin.spinDuration);
    }
    setRemoteSpin(null);
  }, [remoteSpin, setRemoteSpin, setWheelIsSpinning]);

  useEffect(() => {
    if (!isSpinning || secondsLeft <= 0) return undefined;
    const timer = window.setInterval(() => {
      setSecondsLeft(value => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isSpinning, secondsLeft]);

  useEffect(() => {
    if (!spinPending) return undefined;
    const timeout = window.setTimeout(() => {
      setSpinPending(false);
      showToast('Сервер не подтвердил прокрутку', 'error');
    }, 4000);
    return () => window.clearTimeout(timeout);
  }, [showToast, spinPending]);

  useEffect(() => () => setWheelIsSpinning(false), [setWheelIsSpinning]);

  const handleSpin = () => {
    if (isGuest) {
      showToast('Гости могут смотреть, но не крутить колесо', 'info');
      return;
    }
    if (!connected) {
      showToast('Нет соединения с сервером', 'error');
      return;
    }
    if (movies.length === 0 || isSpinning || !spinEnabled || !socket) return;

    const duration = Math.max(5, Math.min(15, spinDuration));
    setSpinPending(true);
    socket.emit('spin-wheel', { spinDuration: duration });
  };

  const handleSpinComplete = useCallback(async (winner) => {
    setIsSpinning(false);
    setWheelIsSpinning(false);
    setSecondsLeft(0);
    const wasRemote = isRemoteSpinRef.current;
    isRemoteSpinRef.current = false;
    if (!winner) return;

    setWinner(winner);
    if (!wasRemote) {
      try {
        const response = await markWatched(winner.id);
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Не удалось сохранить результат');
        }
      } catch (error) {
        showToast(error.message || 'Ошибка сохранения результата', 'error');
        await loadMovies();
      }
    }
  }, [loadMovies, setWheelIsSpinning, setWinner, showToast]);

  const usersWithMovies = new Set(movies.map(movie => movie.added_by).filter(Boolean));
  const pendingUsers = users.filter(user => !usersWithMovies.has(user.id));
  const spinDisabled = isGuest || !connected || isSpinning || spinPending || movies.length === 0 || !spinEnabled;

  if (loadState === 'loading' && movies.length === 0) {
    return (
      <section className="wheel-state-panel surface" aria-live="polite">
        <div className="wheel-state-cheese">🧀</div>
        <div className="wheel-state-title">Собираем колесо…</div>
        <div className="wheel-state-copy">Проверяем фильмы и подключение участников.</div>
      </section>
    );
  }

  if (loadState === 'error' && movies.length === 0) {
    return (
      <section className="wheel-state-panel surface" role="alert">
        <div className="wheel-state-cheese">📡</div>
        <div className="wheel-state-title">{loadError}</div>
        <button className="button-primary" type="button" onClick={loadMovies}>Повторить</button>
      </section>
    );
  }

  return (
    <section className="wheel-page-layout">
      <header className="wheel-page-header">
        <div>
          <p className="wheel-eyebrow">Вечерний выбор</p>
          <h1>Сырное колесо</h1>
        </div>
        <div className={`spin-state ${isSpinning ? 'is-active' : ''}`} aria-live="polite">
          <span className="spin-state-dot" aria-hidden="true" />
          {isSpinning ? `Колесо крутится${secondsLeft ? ` · ${secondsLeft} сек` : ''}` : `${movies.length} в колесе`}
        </div>
      </header>

      {movies.length === 0 ? (
        <div className="wheel-state-panel surface">
          <div className="wheel-state-cheese">🧀</div>
          <div className="wheel-state-title">Колесо пока пустое</div>
          <div className="wheel-state-copy">Добавьте первый фильм, и сыр снова начнёт вращаться.</div>
          {!isGuest && (
            <button className="button-primary" type="button" onClick={() => setDrawerOpen(true)}>
              Добавить фильм
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="wheel-container">
            <div className="wheel-wrapper">
              <CheeseWheel
                ref={wheelRef}
                movies={movies}
                onSpinComplete={handleSpinComplete}
                theme={theme}
              />
              <button
                type="button"
                className={`wheel-center-btn${spinPending ? ' is-pending' : ''}${isSpinning ? ' is-spinning' : ''}`}
                onClick={handleSpin}
                disabled={spinDisabled}
                aria-label="Крутить колесо"
                aria-disabled={spinDisabled}
                aria-busy={spinPending || isSpinning}
                title="Крутить колесо"
              >
                {centerImage
                  ? <img src={centerImage} alt="" className="wheel-center-img" />
                  : <span className="wheel-center-fallback" aria-hidden="true">🧀</span>}
                <span className="wheel-center-icon" aria-hidden="true">↻</span>
              </button>
            </div>

            {movies.length === 1 && (
              <p className="wheel-single-note">В колесе один фильм, результат уже почти решён.</p>
            )}
          </div>

          <section className="wheel-roster surface" aria-label="Участники и фильмы">
            <div className="wheel-roster-heading">
              <div>
                <h2>Кто уже в игре</h2>
                <p>{pendingUsers.length ? `Ждём ещё ${pendingUsers.length}` : 'Все участники добавили фильмы'}</p>
              </div>
              {!isGuest && (
                <button className="button-secondary" type="button" onClick={() => setDrawerOpen(true)} disabled={isSpinning}>
                  Фильмы и настройки
                </button>
              )}
            </div>
            <div className="wheel-roster-list">
              {users.map(user => {
                const movie = movies.find(item => item.added_by === user.id);
                return (
                  <div key={user.id} className={`roster-person ${movie ? 'is-ready' : 'is-waiting'}`}>
                    <span className="roster-avatar" aria-hidden="true">{user.name.slice(0, 1)}</span>
                    <span className="roster-copy">
                      <strong>{user.name}{currentUser?.id === user.id ? ' · вы' : ''}</strong>
                      <small title={movie?.title}>{movie ? movie.title : 'ещё выбирает'}</small>
                    </span>
                    <span className="roster-status" aria-label={movie ? 'Фильм добавлен' : 'Фильм ожидается'}>
                      {movie ? '✓' : '…'}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}
    </section>
  );
}
