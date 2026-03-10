import { useState, useEffect, useRef, useCallback } from 'react';
import { useApp } from '../App';
import { fetchWheelMovies, postMovie, deleteMovie, postSpinDuration, markWatched } from '../api';
import CheeseWheel from './CheeseWheel';

export default function WheelPage() {
  const { isGuest, socket, showToast, spinDuration, setSpinDuration,
          remoteSpin, setRemoteSpin, setWinner, theme } = useApp();
  const [movies, setMovies] = useState([]);
  const [movieInput, setMovieInput] = useState('');
  const [duration, setDuration] = useState(spinDuration);
  const [isSpinning, setIsSpinning] = useState(false);
  const wheelRef = useRef(null);

  const { page } = useApp();

  const loadMovies = useCallback(async () => {
    try {
      const data = await fetchWheelMovies();
      setMovies(data);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => { if (page === 'wheel') loadMovies(); }, [page, loadMovies]);
  useEffect(() => { setDuration(spinDuration); }, [spinDuration]);

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
  }, [socket]);

  // Handle remote spin (from socket)
  useEffect(() => {
    if (!remoteSpin || !wheelRef.current) return;
    if (!wheelRef.current.isSpinning) {
      wheelRef.current.spin(remoteSpin.winnerIndex, remoteSpin.spinDuration, remoteSpin.randomOffset || 0.5);
      setIsSpinning(true);
    }
    setRemoteSpin(null);
  }, [remoteSpin, setRemoteSpin]);

  const handleSpin = () => {
    if (isGuest || movies.length === 0 || isSpinning) return;
    if (!wheelRef.current || wheelRef.current.isSpinning) return;

    const winnerIndex = Math.floor(Math.random() * movies.length);
    const dur = Math.max(5, Math.min(15, duration));
    const randomOffset = 0.002 + Math.random() * 0.996;

    socket?.emit('spin-wheel', { winnerIndex, spinDuration: dur, randomOffset });
    wheelRef.current.spin(winnerIndex, dur, randomOffset);
    setIsSpinning(true);
  };

  const handleSpinComplete = useCallback(async (winner) => {
    setIsSpinning(false);
    if (winner) {
      setWinner(winner);
      await markWatched(winner.id);
    }
  }, [setWinner]);

  const handleAddMovie = async (e) => {
    e.preventDefault();
    if (isGuest || isSpinning) return;
    const title = movieInput.trim();
    if (!title) return;
    try {
      const res = await postMovie(title);
      if (res.ok) {
        showToast(`\u00AB${title}\u00BB добавлен в колесо`, 'success');
        setMovieInput('');
      } else {
        const data = await res.json();
        showToast(data.error || 'Ошибка добавления', 'error');
      }
    } catch {
      showToast('Ошибка соединения', 'error');
    }
  };

  const handleRemoveMovie = async (id) => {
    if (isGuest || isSpinning) return;
    try {
      await deleteMovie(id);
      showToast('Фильм удалён из колеса', 'info');
    } catch {
      showToast('Ошибка удаления', 'error');
    }
  };

  const handleDurationChange = async (e) => {
    let val = parseInt(e.target.value);
    if (isNaN(val) || val < 5) val = 5;
    if (val > 15) val = 15;
    setDuration(val);
    await postSpinDuration(val);
  };

  return (
    <>
      <div className="wheel-container">
        <div className="wheel-wrapper">
          <CheeseWheel
            ref={wheelRef}
            movies={movies}
            onSpinComplete={handleSpinComplete}
            theme={theme}
          />
        </div>
        <div className="spin-controls">
          <button
            className="spin-btn"
            disabled={isGuest || isSpinning || movies.length === 0}
            onClick={handleSpin}
            title={isGuest ? 'Только для участников' : ''}
          >
            🧀 {isSpinning ? 'Крутится\u2026' : 'Крутить!'}
          </button>
          {!isGuest && (
            <div className="spin-duration">
              <label>⏱️ Время:</label>
              <input
                type="number"
                min={5}
                max={15}
                value={duration}
                onChange={handleDurationChange}
              />
              <span>сек</span>
            </div>
          )}
        </div>
      </div>

      {!isGuest && (
        <div className="add-movie">
          <h3>🎬 Фильмы в колесе</h3>
          <form className="add-movie-form" onSubmit={handleAddMovie}>
            <input
              type="text"
              className="add-movie-input"
              placeholder="Название фильма..."
              maxLength={100}
              value={movieInput}
              onChange={e => setMovieInput(e.target.value)}
              disabled={isSpinning}
            />
            <button type="submit" className="add-movie-btn" disabled={isSpinning}>
              Добавить
            </button>
          </form>
          <div className="movie-list">
            {movies.map(movie => (
              <div key={movie.id} className="movie-tag">
                <span>{movie.title}</span>
                <button
                  className="movie-tag-remove"
                  onClick={() => handleRemoveMovie(movie.id)}
                  disabled={isSpinning}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
