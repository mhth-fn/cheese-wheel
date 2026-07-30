import { useState, useEffect, useRef, useCallback } from 'react';
import { useApp } from '../app/AppContext';
import CheeseWheel from './CheeseWheel';
import OneOffWheelPanel from './OneOffWheelPanel';
import OneOffResultModal from './OneOffResultModal';
import WheelThemeIcon from './WheelThemeIcon';

export default function WheelPage() {
  const {
    isGuest,
    socket,
    connected,
    showToast,
    spinDuration,
    spinEnabled,
    remoteSpin,
    setRemoteSpin,
    setWinner,
    theme,
    wheelStatus,
    wheelStatusLoadState,
    refreshWheelData,
    centerImage,
    setWheelIsSpinning,
    oneOffState,
    oneOffIsSpinning,
    remoteOneOffSpin,
  } = useApp();
  const [isSpinning, setIsSpinning] = useState(false);
  const [spinPending, setSpinPending] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const isRemoteSpinRef = useRef(false);
  const wheelRef = useRef(null);

  const movies = wheelStatus.movies || [];
  const wheelReady = wheelStatus.formed;
  const serverSpinPending = Number(wheelStatus.pending_spin?.complete_at) > Date.now();
  const spinIsDisabled = spinEnabled === false;

  useEffect(() => {
    if (!socket) return undefined;
    const onSpinRejected = ({ error }) => {
      setSpinPending(false);
      setIsSpinning(false);
      setWheelIsSpinning(false);
      setSecondsLeft(0);
      showToast(error || 'Не удалось запустить колесо', 'error');
    };

    socket.on('spin-rejected', onSpinRejected);
    return () => socket.off('spin-rejected', onSpinRejected);
  }, [setWheelIsSpinning, showToast, socket]);

  useEffect(() => {
    if (!remoteSpin || !wheelRef.current) return;
    const resolvedWinnerIndex = remoteSpin.winnerMovieId !== undefined
      ? movies.findIndex(movie => Number(movie.id) === Number(remoteSpin.winnerMovieId))
      : remoteSpin.winnerIndex;
    if (!Number.isInteger(resolvedWinnerIndex) || resolvedWinnerIndex < 0) {
      setSpinPending(false);
      setIsSpinning(false);
      setWheelIsSpinning(false);
      showToast('Состав колеса изменился — обновляем данные', 'info');
      void refreshWheelData();
      setRemoteSpin(null);
      return;
    }
    if (!wheelRef.current.isSpinning) {
      setSpinPending(false);
      isRemoteSpinRef.current = !remoteSpin.initiatedByThisClient;
      wheelRef.current.spin(resolvedWinnerIndex, remoteSpin.spinDuration, remoteSpin.randomOffset, remoteSpin.turns);
      setIsSpinning(true);
      setWheelIsSpinning(true);
      setSecondsLeft(remoteSpin.spinDuration);
    }
    setRemoteSpin(null);
  }, [movies, refreshWheelData, remoteSpin, setRemoteSpin, setWheelIsSpinning, showToast]);

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
    if (!wheelReady) {
      showToast('Сначала сформируйте колесо', 'info');
      return;
    }
    if (movies.length === 0 || isSpinning || !spinEnabled || !socket) return;

    const duration = Math.max(5, Math.min(30, spinDuration));
    setSpinPending(true);
    socket.emit('spin-wheel', { spinDuration: duration });
  };

  const handleSpinComplete = useCallback((winner) => {
    setIsSpinning(false);
    setWheelIsSpinning(false);
    setSecondsLeft(0);
    isRemoteSpinRef.current = false;
    if (!winner) return;

    // The server owns the spin result and writes it to watched history.
    // Clients only render the shared result, so an arbitrary movie id cannot
    // be marked as watched from the browser.
    setWinner(winner);
  }, [setWheelIsSpinning, setWinner]);

  const spinDisabled = (
    isGuest ||
    !connected ||
    !wheelReady ||
    isSpinning ||
    spinPending ||
    serverSpinPending ||
    movies.length === 0 ||
    !spinEnabled
  );

  const readinessText = isSpinning
    ? `Колесо крутится${secondsLeft ? ` · ${secondsLeft} сек` : ''}`
    : serverSpinPending
      ? 'Результат вращения сохраняется'
      : spinIsDisabled
        ? 'Прокрутка основного колеса отключена'
        : !wheelStatus.formed
          ? 'Колесо не готово'
          : '';

  const oneOffVisible = Boolean(
    oneOffState.enabled || oneOffIsSpinning || remoteOneOffSpin
  );
  if (oneOffVisible) {
    return <OneOffWheelPanel />;
  }

  return (
    <>
      <section className="wheel-page-layout">
        <div className="wheel-primary">
        {readinessText && (
          <div
            className={`wheel-readiness${isSpinning ? ' is-spinning' : spinIsDisabled ? ' is-disabled' : ' is-warning'}`}
            aria-live="polite"
          >
            <span aria-hidden="true" />
            {readinessText}
          </div>
        )}

        {movies.length > 0 ? (
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
                title={
                  spinIsDisabled
                    ? 'Прокрутка основного колеса отключена'
                    : wheelReady ? 'Крутить колесо' : 'Сначала сформируйте колесо'
                }
              >
                {centerImage
                  ? <img src={centerImage} alt="" className="wheel-center-img" />
                  : <WheelThemeIcon className="wheel-center-fallback" theme={theme} />}
              </button>
            </div>
          </div>
        ) : (
          <div className="wheel-not-ready" aria-live="polite">
            <WheelThemeIcon className="wheel-not-ready-icon" theme={theme} />
            <strong>
              {wheelStatusLoadState === 'loading'
                ? 'Загружаем колесо'
                : wheelStatus.formed
                  ? 'Все фильмы просмотрены'
                  : 'Колесо не готово'}
            </strong>
            <span>
              {wheelStatusLoadState === 'error'
                ? 'Не удалось получить состав колеса.'
                : wheelStatus.formed
                  ? 'Для нового выбора сформируйте следующий раунд.'
                : isGuest
                  ? 'Ждём, когда участники сформируют состав.'
                  : 'Откройте панель слева и сформируйте состав.'}
            </span>
            {wheelStatusLoadState === 'error' && (
              <button className="button-secondary" type="button" onClick={refreshWheelData}>Повторить</button>
            )}
          </div>
        )}
        </div>
      </section>
      <OneOffResultModal visible />
    </>
  );
}
