import { useState, useEffect, useRef, useCallback } from 'react';
import { useApp } from '../App';
import { fetchWheelMovies, markWatched } from '../api';
import CheeseWheel from './CheeseWheel';

export default function WheelPage() {
  const { isGuest, socket, showToast, spinDuration, spinEnabled,
          remoteSpin, setRemoteSpin, setWinner, theme,
          wheelMovies: movies, setWheelMovies: setMovies, centerImage } = useApp();
  const [isSpinning, setIsSpinning] = useState(false);
  const isRemoteSpinRef = useRef(false);
  const wheelRef = useRef(null);

  const { page } = useApp();

  const loadMovies = useCallback(async () => {
    try {
      const data = await fetchWheelMovies();
      setMovies(data);
    } catch (e) {
      console.error(e);
    }
  }, [setMovies]);

  useEffect(() => { if (page === 'wheel') loadMovies(); }, [page, loadMovies]);

  // Socket listeners
  useEffect(() => {
    if (!socket) return;

    const onAdded = (movie) => {
      setMovies(prev => prev.find(m => m.id === movie.id) ? prev : [...prev, movie]);
    };
    const onRemoved = (data) => {
      setMovies(prev => prev.filter(m => m.id !== data.id));
    };
    const onWatched = (movie) => {
      setMovies(prev => prev.filter(m => m.id !== movie.id));
    };

    socket.on('movie-added', onAdded);
    socket.on('movie-removed', onRemoved);
    socket.on('movie-watched', onWatched);

    return () => {
      socket.off('movie-added', onAdded);
      socket.off('movie-removed', onRemoved);
      socket.off('movie-watched', onWatched);
    };
  }, [socket, setMovies]);

  // Handle remote spin (from socket)
  useEffect(() => {
    if (!remoteSpin || !wheelRef.current) return;
    if (!wheelRef.current.isSpinning) {
      isRemoteSpinRef.current = true;
      wheelRef.current.spin(remoteSpin.winnerIndex, remoteSpin.spinDuration, remoteSpin.randomOffset || 0.5);
      setIsSpinning(true);
    }
    setRemoteSpin(null);
  }, [remoteSpin, setRemoteSpin]);

  const handleSpin = () => {
    if (isGuest || movies.length === 0 || isSpinning || !spinEnabled) return;
    if (!wheelRef.current || wheelRef.current.isSpinning) return;

    const winnerIndex = Math.floor(Math.random() * movies.length);
    const dur = Math.max(5, Math.min(15, spinDuration));
    const randomOffset = 0.002 + Math.random() * 0.996;

    socket?.emit('spin-wheel', { winnerIndex, spinDuration: dur, randomOffset });
    wheelRef.current.spin(winnerIndex, dur, randomOffset);
    setIsSpinning(true);
  };

  const handleSpinComplete = useCallback(async (winner) => {
    setIsSpinning(false);
    const wasRemote = isRemoteSpinRef.current;
    isRemoteSpinRef.current = false;
    if (winner) {
      setWinner(winner);
      if (!wasRemote) {
        await markWatched(winner.id);
      }
    }
  }, [setWinner]);

  return (
    <div className="wheel-container">
      <div className="wheel-wrapper">
        <CheeseWheel
          ref={wheelRef}
          movies={movies}
          onSpinComplete={handleSpinComplete}
          theme={theme}
        />
        {centerImage && (
          <button
            className="wheel-center-btn"
            onClick={handleSpin}
            disabled={isGuest || isSpinning || movies.length === 0 || !spinEnabled}
            title={!spinEnabled ? 'Прокрутка отключена' : isGuest ? 'Только для участников' : 'Крутить!'}
          >
            <img src={centerImage} alt="" className="wheel-center-img" />
          </button>
        )}
      </div>
    </div>
  );
}
