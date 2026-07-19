import { useState, useEffect, useCallback, useRef } from 'react';
import { useApp } from '../App';
import {
  fetchWatched,
  postWatchedMovie,
  deleteWatched,
  postRating,
  deleteRating,
  updateMovie,
} from '../api';
import StatsPanel from './StatsPanel';
import ConfirmDialog from './ConfirmDialog';
import MovieDetailsDialog from './MovieDetailsDialog';

function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ru-RU').format(date);
}

function getAriaSort(sortColumn, sortDirection, column) {
  if (sortColumn !== column) return 'none';
  return sortDirection === 'asc' ? 'ascending' : 'descending';
}

export default function WatchedPage() {
  const { currentUser, isGuest, users, socket, showToast, page, connected } = useApp();
  const [movies, setMovies] = useState([]);
  const [searchQuery, setSearchQuery] = useState(() => sessionStorage.getItem('watchedSearch') || '');
  const [debouncedQuery, setDebouncedQuery] = useState(searchQuery);
  const [sortColumn, setSortColumn] = useState('avg_rating');
  const [sortDirection, setSortDirection] = useState('desc');
  const [movieInput, setMovieInput] = useState('');
  const [statsKey, setStatsKey] = useState(0);
  const [loadState, setLoadState] = useState('loading');
  const [loadError, setLoadError] = useState('');
  const [adding, setAdding] = useState(false);
  const [savingRating, setSavingRating] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [detailsMovie, setDetailsMovie] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editAddedAt, setEditAddedAt] = useState('');
  const searchRef = useRef(null);

  const loadMovies = useCallback(async () => {
    setLoadError('');
    setLoadState('loading');
    try {
      const data = await fetchWatched();
      if (!Array.isArray(data)) throw new Error();
      setMovies(data);
      setLoadState('ready');
      setDetailsMovie(current => current ? data.find(movie => movie.id === current.id) || null : null);
    } catch {
      setLoadError('Не удалось загрузить историю');
      setLoadState('error');
    }
  }, []);

  useEffect(() => {
    if (page === 'watched') {
      loadMovies();
      setStatsKey(key => key + 1);
    }
  }, [page, loadMovies]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(searchQuery), 180);
    sessionStorage.setItem('watchedSearch', searchQuery);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    const handleShortcut = event => {
      if (
        event.key === '/' &&
        !event.metaKey &&
        !event.ctrlKey &&
        !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)
      ) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handleShortcut);
    return () => document.removeEventListener('keydown', handleShortcut);
  }, []);

  useEffect(() => {
    if (!socket) return undefined;
    const reload = () => {
      loadMovies();
      setStatsKey(key => key + 1);
    };
    socket.on('rating-updated', reload);
    socket.on('watched-added', reload);
    socket.on('watched-deleted', reload);
    socket.on('movie-updated', reload);
    return () => {
      socket.off('rating-updated', reload);
      socket.off('watched-added', reload);
      socket.off('watched-deleted', reload);
      socket.off('movie-updated', reload);
    };
  }, [socket, loadMovies]);

  const handleSort = column => {
    if (sortColumn !== column) {
      setSortColumn(column);
      setSortDirection(column === 'title' ? 'asc' : 'desc');
      return;
    }
    if (sortDirection === 'desc') {
      setSortDirection('asc');
      return;
    }
    setSortColumn(null);
    setSortDirection(null);
  };

  const confirmDelete = async () => {
    if (!pendingDelete || isGuest) return;
    setDeleteBusy(true);
    try {
      const response = await deleteWatched(pendingDelete.id);
      if (!response.ok) throw new Error();
      setPendingDelete(null);
      showToast('Фильм и его оценки удалены', 'info');
      await loadMovies();
      setStatsKey(key => key + 1);
    } catch {
      showToast('Ошибка удаления', 'error');
    } finally {
      setDeleteBusy(false);
    }
  };

  const handleRating = async (movieId, value) => {
    if (isGuest || !currentUser) return;
    const savingKey = `${movieId}:${currentUser.id}`;
    setSavingRating(savingKey);
    try {
      const response = value
        ? await postRating(movieId, currentUser.id, Number(value))
        : await deleteRating(movieId);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Ошибка сохранения');
      }
      showToast(value ? `Оценка ${value} сохранена` : 'Оценка удалена', 'success');
      await loadMovies();
      setStatsKey(key => key + 1);
    } catch (error) {
      showToast(error.message || 'Ошибка сохранения оценки', 'error');
      await loadMovies();
    } finally {
      setSavingRating(null);
    }
  };

  const startEditing = movie => {
    if (isGuest) return;
    setEditingId(movie.id);
    setEditTitle(movie.title);
    setEditAddedAt(movie.added_at || '');
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditTitle('');
    setEditAddedAt('');
  };

  const saveEditing = async () => {
    if (!editTitle.trim()) {
      showToast('Название не может быть пустым', 'error');
      return;
    }
    try {
      const response = await updateMovie(editingId, {
        title: editTitle.trim(),
        added_at: editAddedAt || null,
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Ошибка обновления');
      }
      showToast('Фильм обновлён', 'success');
      cancelEditing();
      await loadMovies();
    } catch (error) {
      showToast(error.message || 'Ошибка соединения', 'error');
    }
  };

  const handleEditKeyDown = event => {
    if (event.key === 'Enter') saveEditing();
    if (event.key === 'Escape') cancelEditing();
  };

  const handleAddWatched = async event => {
    event.preventDefault();
    if (isGuest || !connected) return;
    const title = movieInput.trim();
    if (!title) return;
    setAdding(true);
    try {
      const response = await postWatchedMovie(title);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Ошибка добавления');
      }
      showToast(`«${title}» добавлен в просмотренные`, 'success');
      setMovieInput('');
    } catch (error) {
      showToast(error.message || 'Ошибка соединения', 'error');
    } finally {
      setAdding(false);
    }
  };

  const query = debouncedQuery.trim().toLocaleLowerCase('ru');
  const filtered = query
    ? movies.filter(movie => movie.title.toLocaleLowerCase('ru').includes(query))
    : movies;
  const sorted = sortColumn ? [...filtered].sort((a, b) => {
    let aValue = a[sortColumn];
    let bValue = b[sortColumn];
    if (sortColumn === 'title') {
      return sortDirection === 'asc'
        ? (aValue || '').localeCompare(bValue || '', 'ru')
        : (bValue || '').localeCompare(aValue || '', 'ru');
    }
    aValue = aValue ?? -1;
    bValue = bValue ?? -1;
    return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
  }) : filtered;

  const sortIcon = column => sortColumn === column
    ? <span className="sort-icon active" aria-hidden="true">{sortDirection === 'asc' ? '↑' : '↓'}</span>
    : null;

  const renderRatingCell = (movie, userId) => {
    const rating = movie[`rating_${userId}`];
    if (currentUser?.id === userId) {
      const saving = savingRating === `${movie.id}:${userId}`;
      return (
        <div className="rating-control">
          <select
            className="rating-select"
            value={rating ?? ''}
            onChange={event => handleRating(movie.id, event.target.value)}
            disabled={saving || !connected}
            aria-label={`Ваша оценка фильму ${movie.title}`}
          >
            <option value="">{rating == null ? '—' : 'Убрать'}</option>
            {[1,2,3,4,5,6,7,8,9,10].map(value => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
          {saving && <span className="rating-saving" aria-live="polite">сохраняем</span>}
        </div>
      );
    }
    return rating != null ? <span className="rating-display">{rating}</span> : <span className="rating-empty">—</span>;
  };

  const renderAvgRating = movie => {
    if (movie.avg_rating == null) return <span className="rating-empty">—</span>;
    const value = Number(movie.avg_rating);
    const className = value >= 9 ? 'rating-cheese' : value >= 7 ? 'rating-good' : value >= 4 ? 'rating-mid' : 'rating-bad';
    return (
      <span className={`rating-avg ${className}`} title={`${movie.ratings_count} из ${users.length} оценок`}>
        <strong>{value.toFixed(1)}</strong>
        <small>{movie.ratings_count}/{users.length}</small>
      </span>
    );
  };

  return (
    <>
      <StatsPanel refreshKey={statsKey} />

      <div className="watched-toolbar">
        <label className="search-bar">
          <span className="search-icon" aria-hidden="true">⌕</span>
          <span className="sr-only">Поиск фильма</span>
          <input
            ref={searchRef}
            type="search"
            placeholder="Поиск фильма…"
            value={searchQuery}
            onChange={event => setSearchQuery(event.target.value)}
            aria-label="Поиск по истории просмотренных"
          />
          {searchQuery && (
            <button className="search-clear icon-button" type="button" onClick={() => setSearchQuery('')} aria-label="Очистить поиск">✕</button>
          )}
        </label>
        <span className="search-shortcut" aria-hidden="true">/</span>
      </div>

      <p className="table-scroll-hint">На узком экране таблицу можно прокручивать по горизонтали.</p>

      <div className="watched-table-wrapper">
        {loadState === 'loading' && movies.length === 0 ? (
          <div className="watched-loading" aria-live="polite">
            <div className="skeleton" /><div className="skeleton" /><div className="skeleton" />
          </div>
        ) : loadState === 'error' && movies.length === 0 ? (
          <div className="empty-state" role="alert">
            <div className="empty-state-icon" aria-hidden="true">📡</div>
            <div className="empty-state-title">{loadError}</div>
            <button className="button-primary" type="button" onClick={loadMovies}>Повторить</button>
          </div>
        ) : movies.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon" aria-hidden="true">🎬</div>
            <div className="empty-state-title">Пока нет просмотренных фильмов</div>
            <p>Крутите колесо или добавьте фильм вручную.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon" aria-hidden="true">⌕</div>
            <div className="empty-state-title">Ничего не найдено</div>
            <p>По запросу «{debouncedQuery}» фильмов нет.</p>
          </div>
        ) : (
          <table className="watched-table" style={{ minWidth: `${400 + users.length * 88}px` }}>
            <colgroup>
              <col className="watched-action-col" />
              <col className="watched-title-col" />
              {users.map(user => <col key={user.id} className="watched-user-col" />)}
              <col className="watched-avg-col" />
            </colgroup>
            <thead>
              <tr>
                <th aria-label="Действия" />
                <th aria-sort={getAriaSort(sortColumn, sortDirection, 'title')}>
                  <button className="table-sort-button" type="button" onClick={() => handleSort('title')}>
                    Фильм {sortIcon('title')}
                  </button>
                </th>
                {users.map(user => {
                  const column = `rating_${user.id}`;
                  return (
                    <th key={user.id} aria-sort={getAriaSort(sortColumn, sortDirection, column)}>
                      <button className="table-sort-button" type="button" onClick={() => handleSort(column)}>
                        {user.name} {sortIcon(column)}
                      </button>
                    </th>
                  );
                })}
                <th aria-sort={getAriaSort(sortColumn, sortDirection, 'avg_rating')}>
                  <button className="table-sort-button" type="button" onClick={() => handleSort('avg_rating')}>
                    Средняя {sortIcon('avg_rating')}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(movie => (
                <tr key={movie.id}>
                  <td>
                    {!isGuest && (
                      <div className="row-actions">
                        <button className="row-action-button" type="button" onClick={() => startEditing(movie)} title="Редактировать" aria-label={`Редактировать ${movie.title}`}>✎</button>
                        <button className="row-action-button danger" type="button" onClick={() => setPendingDelete(movie)} title="Удалить" aria-label={`Удалить ${movie.title}`}>🗑</button>
                      </div>
                    )}
                  </td>
                  <td>
                    {editingId === movie.id ? (
                      <div className="edit-movie-cell">
                        <input className="edit-movie-title" value={editTitle} onChange={event => setEditTitle(event.target.value)} onKeyDown={handleEditKeyDown} autoFocus />
                        <div className="edit-movie-date-row">
                          <label htmlFor={`edit-date-${movie.id}`}>Дата:</label>
                          <input id={`edit-date-${movie.id}`} type="date" className="edit-movie-date" value={editAddedAt} onChange={event => setEditAddedAt(event.target.value)} onKeyDown={handleEditKeyDown} />
                        </div>
                        <div className="edit-movie-actions">
                          <button className="button-primary" type="button" onClick={saveEditing}>Сохранить</button>
                          <button className="button-ghost" type="button" onClick={cancelEditing}>Отмена</button>
                        </div>
                      </div>
                    ) : (
                      <button className="movie-title-cell" type="button" onClick={() => setDetailsMovie(movie)}>
                        <strong>{movie.title}</strong>
                        <span>
                          {movie.watched_at ? `просмотрен ${formatDate(movie.watched_at)}` : movie.added_at ? `добавлен ${formatDate(movie.added_at)}` : 'дата не указана'}
                        </span>
                      </button>
                    )}
                  </td>
                  {users.map(user => <td key={user.id}>{renderRatingCell(movie, user.id)}</td>)}
                  <td>{renderAvgRating(movie)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {!isGuest && (
        <section className="watched-add-movie surface">
          <div>
            <p className="watched-add-kicker">Без прокрутки</p>
            <h2>Добавить фильм в просмотренные</h2>
          </div>
          <form className="add-movie-form" onSubmit={handleAddWatched}>
            <label className="sr-only" htmlFor="watched-movie-title">Название фильма</label>
            <input
              id="watched-movie-title"
              type="text"
              className="add-movie-input"
              placeholder="Название фильма…"
              maxLength={100}
              value={movieInput}
              onChange={event => setMovieInput(event.target.value)}
              disabled={adding || !connected}
            />
            <button type="submit" className="add-movie-btn button-primary" disabled={!movieInput.trim() || adding || !connected}>
              {adding ? 'Добавляем…' : 'Добавить'}
            </button>
          </form>
        </section>
      )}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Удалить фильм?"
        message={pendingDelete ? `«${pendingDelete.title}» исчезнет из истории вместе со всеми оценками.` : ''}
        busy={deleteBusy}
        onConfirm={confirmDelete}
        onClose={() => !deleteBusy && setPendingDelete(null)}
      />
      <MovieDetailsDialog movie={detailsMovie} users={users} onClose={() => setDetailsMovie(null)} />
    </>
  );
}
