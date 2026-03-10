import { useState, useEffect, useCallback } from 'react';
import { useApp } from '../App';
import { fetchWatched, postWatchedMovie, deleteWatched, postRating } from '../api';
import StatsPanel from './StatsPanel';

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}.${month}.${d.getFullYear()}`;
}

export default function WatchedPage() {
  const { currentUser, isGuest, users, socket, showToast, page } = useApp();
  const [movies, setMovies] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortColumn, setSortColumn] = useState('avg_rating');
  const [sortDirection, setSortDirection] = useState('desc');
  const [movieInput, setMovieInput] = useState('');
  const [statsKey, setStatsKey] = useState(0);

  const loadMovies = useCallback(async () => {
    try {
      const data = await fetchWatched();
      setMovies(data);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { if (page === 'watched') { loadMovies(); setStatsKey(k => k + 1); } }, [page, loadMovies]);

  useEffect(() => {
    if (!socket) return;
    const reload = () => { loadMovies(); setStatsKey(k => k + 1); };
    socket.on('rating-updated', reload);
    socket.on('watched-added', reload);
    socket.on('watched-deleted', reload);
    return () => {
      socket.off('rating-updated', reload);
      socket.off('watched-added', reload);
      socket.off('watched-deleted', reload);
    };
  }, [socket, loadMovies]);

  const handleSort = (col) => {
    if (sortColumn === col) {
      setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(col);
      setSortDirection(col === 'title' ? 'asc' : 'desc');
    }
  };

  const handleDelete = async (id) => {
    if (isGuest) return;
    if (!confirm('Удалить этот фильм из просмотренных?')) return;
    try {
      await deleteWatched(id);
      await loadMovies();
      setStatsKey(k => k + 1);
      showToast('Фильм удалён', 'info');
    } catch {
      showToast('Ошибка удаления', 'error');
    }
  };

  const handleRating = async (movieId, userId, rating) => {
    if (isGuest) return;
    try {
      await postRating(movieId, userId, parseInt(rating));
      showToast(`Оценка ${rating} сохранена`, 'success');
      await loadMovies();
      setStatsKey(k => k + 1);
    } catch {
      showToast('Ошибка сохранения оценки', 'error');
    }
  };

  const handleAddWatched = async (e) => {
    e.preventDefault();
    if (isGuest) return;
    const title = movieInput.trim();
    if (!title) return;
    try {
      const res = await postWatchedMovie(title);
      if (res.ok) {
        showToast(`\u00AB${title}\u00BB добавлен в просмотренные`, 'success');
        setMovieInput('');
      } else {
        const data = await res.json();
        showToast(data.error || 'Ошибка добавления', 'error');
      }
    } catch {
      showToast('Ошибка соединения', 'error');
    }
  };

  let filtered = movies;
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filtered = movies.filter(m => m.title.toLowerCase().includes(q));
  }

  const sorted = [...filtered].sort((a, b) => {
    let aVal = a[sortColumn];
    let bVal = b[sortColumn];
    if (sortColumn === 'title') {
      aVal = aVal || '';
      bVal = bVal || '';
      return sortDirection === 'asc' ? aVal.localeCompare(bVal, 'ru') : bVal.localeCompare(aVal, 'ru');
    }
    aVal = aVal ?? -1;
    bVal = bVal ?? -1;
    return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
  });

  const sortIcon = (col) => {
    if (sortColumn !== col) return <span className="sort-icon">⇅</span>;
    return <span className="sort-icon active">{sortDirection === 'asc' ? '↑' : '↓'}</span>;
  };

  const renderRatingCell = (movie, userId) => {
    const rating = movie[`rating_${userId}`];
    if (currentUser && currentUser.id === userId) {
      return (
        <select
          className="rating-select"
          value={rating || ''}
          onChange={e => e.target.value && handleRating(movie.id, userId, e.target.value)}
        >
          {(rating === null || rating === undefined) && <option value="" disabled>—</option>}
          {[1,2,3,4,5,6,7,8,9,10].map(n => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      );
    }
    return rating ? <span className="rating-display">{rating}</span> : '—';
  };

  const renderAvgRating = (avg) => {
    if (!avg) return '—';
    const value = parseFloat(avg);
    let colorClass = '';
    let emoji = '';
    if (value >= 10) { colorClass = 'rating-cheese'; emoji = ' 🧀'; }
    else if (value >= 7) colorClass = 'rating-good';
    else if (value >= 4) colorClass = 'rating-mid';
    else colorClass = 'rating-bad';
    return <span className={`rating-avg ${colorClass}`}>{value.toFixed(1)}{emoji}</span>;
  };

  return (
    <>
      <StatsPanel refreshKey={statsKey} />

      <div className="search-bar">
        <span className="search-icon">🔍</span>
        <input
          type="text"
          placeholder="Поиск фильма..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
        {searchQuery && (
          <button className="search-clear visible" onClick={() => setSearchQuery('')}>✕</button>
        )}
      </div>

      <div className="watched-table-wrapper">
        {movies.length === 0 ? (
          <div className="watched-empty">
            <div className="watched-empty-icon">🎬</div>
            <div className="watched-empty-text">Пока нет просмотренных фильмов.<br/>Крутите колесо!</div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="watched-empty">
            <div className="watched-empty-icon">🔍</div>
            <div className="watched-empty-text">Ничего не найдено по запросу &laquo;{searchQuery}&raquo;</div>
          </div>
        ) : (
          <table className="watched-table">
            <thead>
              <tr>
                <th></th>
                <th onClick={() => handleSort('title')} data-sort="title" style={{cursor:'pointer'}}>
                  Фильм {sortIcon('title')}
                </th>
                {[1,2,3,4].map(i => (
                  <th key={i} onClick={() => handleSort(`rating_${i}`)} style={{cursor:'pointer'}}>
                    {users[i-1]?.name || `User ${i}`} {sortIcon(`rating_${i}`)}
                  </th>
                ))}
                <th onClick={() => handleSort('avg_rating')} style={{cursor:'pointer'}}>
                  Средняя {sortIcon('avg_rating')}
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(movie => (
                <tr key={movie.id}>
                  <td>
                    {!isGuest && (
                      <button className="delete-watched-btn" onClick={() => handleDelete(movie.id)} title="Удалить">✕</button>
                    )}
                  </td>
                  <td>
                    {movie.title}
                    {movie.watched_at && <div className="watched-date">{formatDate(movie.watched_at)}</div>}
                  </td>
                  {[1,2,3,4].map(i => (
                    <td key={i}>{renderRatingCell(movie, i)}</td>
                  ))}
                  <td>{renderAvgRating(movie.avg_rating)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {!isGuest && (
        <div className="watched-add-movie">
          <h3>🎬 Добавить фильм в просмотренные</h3>
          <form className="add-movie-form" onSubmit={handleAddWatched}>
            <input
              type="text"
              className="add-movie-input"
              placeholder="Название фильма..."
              maxLength={100}
              value={movieInput}
              onChange={e => setMovieInput(e.target.value)}
            />
            <button type="submit" className="add-movie-btn">Добавить</button>
          </form>
        </div>
      )}
    </>
  );
}
