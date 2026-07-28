import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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

function useMediaQuery(query) {
  const getMatches = () => (
    typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia(query).matches
  );
  const [matches, setMatches] = useState(getMatches);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const mediaQuery = window.matchMedia(query);
    const onChange = event => setMatches(event.matches);
    setMatches(mediaQuery.matches);
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', onChange);
    } else {
      mediaQuery.addListener?.(onChange);
    }
    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', onChange);
      } else {
        mediaQuery.removeListener?.(onChange);
      }
    };
  }, [query]);

  return matches;
}

const CORE_USER_NAMES = ['Антон', 'Митя', 'Пётр', 'Сергей'];

function normalizeUserName(value) {
  return String(value || '').trim().toLocaleLowerCase('ru').replaceAll('ё', 'е');
}

function withScopedAverage(movie, scopedUsers) {
  const ratings = scopedUsers
    .map(user => movie[`rating_${user.id}`])
    .filter(rating => rating !== null && rating !== undefined && rating !== '');
  if (ratings.length === 0) return null;
  const average = ratings.reduce((sum, rating) => sum + Number(rating), 0) / ratings.length;
  return {
    ...movie,
    avg_rating: Math.round(average * 10) / 10,
    ratings_count: ratings.length,
  };
}

export default function WatchedPage() {
  const { currentUser, isGuest, isAdmin, users, socket, showToast, page, connected } = useApp();
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
  const [detailsView, setDetailsView] = useState('details');
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editWatchedAt, setEditWatchedAt] = useState('');
  const [baseScope, setBaseScope] = useState('all');
  const [personalModeEnabled, setPersonalModeEnabled] = useState(false);
  const searchRef = useRef(null);
  const isCompactLayout = useMediaQuery(
    '(max-width: 600px), (max-width: 960px) and (max-height: 560px)'
  );

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
    socket.on('movie-review-added', reload);
    socket.on('movie-review-updated', reload);
    socket.on('movie-review-deleted', reload);
    return () => {
      socket.off('rating-updated', reload);
      socket.off('watched-added', reload);
      socket.off('watched-deleted', reload);
      socket.off('movie-updated', reload);
      socket.off('movie-review-added', reload);
      socket.off('movie-review-updated', reload);
      socket.off('movie-review-deleted', reload);
    };
  }, [socket, loadMovies]);

  const coreUsers = useMemo(() => {
    const usersByName = new Map(users.map(user => [normalizeUserName(user.name), user]));
    return CORE_USER_NAMES
      .map(name => usersByName.get(normalizeUserName(name)))
      .filter(Boolean);
  }, [users]);
  const currentParticipant = useMemo(
    () => users.find(user => Number(user.id) === Number(currentUser?.id)) || null,
    [users, currentUser?.id]
  );
  const currentUserIsCore = CORE_USER_NAMES
    .some(name => normalizeUserName(name) === normalizeUserName(currentUser?.name));
  const canUseCoreFilter = currentUserIsCore && coreUsers.length === CORE_USER_NAMES.length;
  const canUsePersonalFilter = !isGuest && Boolean(currentParticipant);
  const coreFilterEnabled = canUseCoreFilter && baseScope === 'core';
  const personalMode = canUsePersonalFilter && personalModeEnabled;
  const coreMode = coreFilterEnabled && !personalMode;
  const activeScope = personalMode ? 'personal' : coreMode ? 'core' : 'all';
  const personalComparisonScope = personalMode && coreFilterEnabled ? 'core' : 'all';
  const visibleUsers = useMemo(() => {
    if (personalMode) return [currentParticipant];
    if (coreMode) return coreUsers;
    return users;
  }, [personalMode, currentParticipant, coreMode, coreUsers, users]);

  useEffect(() => {
    if (!currentUser?.id || isGuest) {
      setBaseScope('all');
      setPersonalModeEnabled(false);
      return;
    }

    const storageKey = `watchedStatsScope:${currentUser.id}`;
    const baseStorageKey = `watchedStatsBaseScope:${currentUser.id}`;
    const storedScope = localStorage.getItem(storageKey);
    const storedBaseScope = localStorage.getItem(baseStorageKey);
    const legacyCoreEnabled = localStorage.getItem(`watchedCoreOnly:${currentUser.id}`) === '1';
    const nextBaseScope = currentUserIsCore && (
      storedBaseScope === 'core'
      || (!storedBaseScope && storedScope === 'core')
      || (!storedBaseScope && storedScope === 'personal' && legacyCoreEnabled)
      || (!storedBaseScope && !storedScope && legacyCoreEnabled)
    )
      ? 'core'
      : 'all';
    const nextPersonalMode = storedScope === 'personal';

    setBaseScope(nextBaseScope);
    setPersonalModeEnabled(nextPersonalMode);
    localStorage.setItem(baseStorageKey, nextBaseScope);
    localStorage.setItem(storageKey, nextPersonalMode ? 'personal' : nextBaseScope);
  }, [currentUser?.id, currentUserIsCore, isGuest]);

  const scopedMovies = useMemo(() => {
    if (activeScope === 'all') return movies;
    return movies.flatMap(movie => {
      const scopedMovie = withScopedAverage(movie, visibleUsers);
      return scopedMovie ? [scopedMovie] : [];
    });
  }, [movies, activeScope, visibleUsers]);

  useEffect(() => {
    const personalRatingColumn = currentParticipant
      ? `rating_${currentParticipant.id}`
      : null;
    if (personalMode && sortColumn === 'avg_rating' && personalRatingColumn) {
      setSortColumn(personalRatingColumn);
      setSortDirection('desc');
      return;
    }
    if (activeScope === 'all' || !sortColumn?.startsWith('rating_')) return;
    const visibleColumns = new Set(visibleUsers.map(user => `rating_${user.id}`));
    if (!visibleColumns.has(sortColumn)) {
      setSortColumn(personalRatingColumn && personalMode ? personalRatingColumn : 'avg_rating');
      setSortDirection('desc');
    }
  }, [activeScope, personalMode, currentParticipant, visibleUsers, sortColumn]);

  const toggleCoreFilter = () => {
    if (!currentUser || !canUseCoreFilter) return;
    const nextBaseScope = coreFilterEnabled ? 'all' : 'core';
    setBaseScope(nextBaseScope);
    localStorage.setItem(`watchedStatsBaseScope:${currentUser.id}`, nextBaseScope);
    localStorage.setItem(`watchedCoreOnly:${currentUser.id}`, nextBaseScope === 'core' ? '1' : '0');
    localStorage.setItem(
      `watchedStatsScope:${currentUser.id}`,
      personalMode ? 'personal' : nextBaseScope
    );
    setDetailsMovie(null);
  };

  const togglePersonalFilter = () => {
    if (!currentUser || !canUsePersonalFilter) return;
    const nextPersonalMode = !personalMode;
    const fallbackScope = coreFilterEnabled ? 'core' : 'all';
    setPersonalModeEnabled(nextPersonalMode);
    localStorage.setItem(
      `watchedStatsScope:${currentUser.id}`,
      nextPersonalMode ? 'personal' : fallbackScope
    );
    setDetailsMovie(null);
  };

  const openMoviePanel = (movie, view = 'details') => {
    setDetailsView(view);
    setDetailsMovie(movie);
  };

  const closeMoviePanel = useCallback(() => {
    setDetailsMovie(null);
  }, []);

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
    if (!pendingDelete || !isAdmin) return;
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

  const handleRating = async (movieId, targetUserId, value) => {
    if (isGuest || !currentUser) return;
    if (!isAdmin && Number(targetUserId) !== Number(currentUser.id)) return;
    const savingKey = `${movieId}:${targetUserId}`;
    setSavingRating(savingKey);
    try {
      const response = value
        ? await postRating(movieId, targetUserId, Number(value))
        : await deleteRating(movieId, targetUserId);
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
    if (!isAdmin) return;
    setEditingId(movie.id);
    setEditTitle(movie.title);
    setEditWatchedAt(
      movie.watched_at
        ? String(movie.watched_at).slice(0, 10)
        : movie.added_at || ''
    );
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditTitle('');
    setEditWatchedAt('');
  };

  const saveEditing = async () => {
    if (!editTitle.trim()) {
      showToast('Название не может быть пустым', 'error');
      return;
    }
    try {
      const response = await updateMovie(editingId, {
        title: editTitle.trim(),
        watched_at: editWatchedAt || null,
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
    if (!isAdmin || !connected) return;
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
    ? scopedMovies.filter(movie => movie.title.toLocaleLowerCase('ru').includes(query))
    : scopedMovies;
  const sorted = sortColumn ? [...filtered].sort((a, b) => {
    let aValue = a[sortColumn];
    let bValue = b[sortColumn];
    if (sortColumn === 'title') {
      return sortDirection === 'asc'
        ? (aValue || '').localeCompare(bValue || '', 'ru')
        : (bValue || '').localeCompare(aValue || '', 'ru');
    }
    if (aValue == null && bValue == null) return (a.title || '').localeCompare(b.title || '', 'ru');
    if (aValue == null) return 1;
    if (bValue == null) return -1;
    return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
  }) : filtered;
  const detailsMovieForDisplay = detailsMovie
    ? scopedMovies.find(movie => movie.id === detailsMovie.id) || null
    : null;
  const showAverageColumn = !personalMode;

  const sortIcon = column => sortColumn === column
    ? <span className="sort-icon active" aria-hidden="true">{sortDirection === 'asc' ? '↑' : '↓'}</span>
    : null;

  const handleCompactSortChange = event => {
    const column = event.target.value || null;
    setSortColumn(column);
    setSortDirection(column ? (column === 'title' ? 'asc' : 'desc') : null);
  };

  const toggleCompactSortDirection = () => {
    if (!sortColumn) return;
    setSortDirection(direction => direction === 'asc' ? 'desc' : 'asc');
  };

  const renderRatingCell = (movie, userId) => {
    const rating = movie[`rating_${userId}`];
    if (currentUser?.id === userId || isAdmin) {
      const saving = savingRating === `${movie.id}:${userId}`;
      const targetUser = users.find(user => Number(user.id) === Number(userId));
      return (
        <div className="rating-control">
          <select
            className="rating-select"
            value={rating ?? ''}
            onChange={event => handleRating(movie.id, userId, event.target.value)}
            disabled={saving || !connected}
            aria-label={
              currentUser?.id === userId
                ? `Ваша оценка фильму ${movie.title}`
                : `Оценка пользователя ${targetUser?.name || userId} фильму ${movie.title}`
            }
            title={currentUser?.id === userId ? 'Ваша оценка' : 'Редактирование администратором'}
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
      <span className={`rating-avg ${className}`} title={`${movie.ratings_count} из ${visibleUsers.length} оценок`}>
        <strong>{value.toFixed(1)}</strong>
        <small>{movie.ratings_count}/{visibleUsers.length}</small>
      </span>
    );
  };

  const renderEditMovieForm = (movie, layout) => (
    <div className="edit-movie-cell">
      <label className="sr-only" htmlFor={`edit-title-${layout}-${movie.id}`}>
        Название фильма
      </label>
      <input
        id={`edit-title-${layout}-${movie.id}`}
        className="edit-movie-title"
        value={editTitle}
        onChange={event => setEditTitle(event.target.value)}
        onKeyDown={handleEditKeyDown}
        autoFocus
      />
      <div className="edit-movie-date-row">
        <label htmlFor={`edit-date-${layout}-${movie.id}`}>Дата просмотра:</label>
        <input
          id={`edit-date-${layout}-${movie.id}`}
          type="date"
          className="edit-movie-date"
          value={editWatchedAt}
          onChange={event => setEditWatchedAt(event.target.value)}
          onKeyDown={handleEditKeyDown}
        />
      </div>
      <div className="edit-movie-actions">
        <button className="button-primary" type="button" onClick={saveEditing}>
          Сохранить
        </button>
        <button className="button-ghost" type="button" onClick={cancelEditing}>
          Отмена
        </button>
      </div>
    </div>
  );

  const renderCompactMovieCard = movie => (
    <article className="watched-movie-card" key={movie.id} role="listitem">
      {editingId === movie.id ? (
        <>
          <p className="watched-card-edit-label">Редактирование фильма</p>
          {renderEditMovieForm(movie, 'card')}
        </>
      ) : (
        <>
          <header className="watched-card-header">
            <button
              className="watched-card-title"
              type="button"
              onClick={() => openMoviePanel(movie, 'details')}
              aria-haspopup="dialog"
            >
              <strong>{movie.title}</strong>
              <span>Открыть карточку фильма</span>
            </button>
            <div className="watched-card-average">
              <span>{personalMode ? 'Моя оценка' : 'Средняя'}</span>
              {renderAvgRating(movie)}
            </div>
          </header>
        </>
      )}
    </article>
  );

  return (
    <>
      {canUsePersonalFilter && (
        <div className="watched-scope-control">
          <span aria-live="polite">
            {personalMode
              ? `Только мои оценки: ${scopedMovies.length} фильмов${coreFilterEnabled ? ' · сравнение только с основной тройкой' : ''}`
              : coreMode
                ? 'Основной состав: 4 участника'
                : 'Сейчас показаны все участники'}
          </span>
          <div className="watched-scope-actions" role="group" aria-label="Фильтры статистики">
            {canUseCoreFilter && (
              <button
                className={`scope-filter-toggle${coreFilterEnabled ? ' active' : ''}`}
                type="button"
                aria-pressed={coreFilterEnabled}
                onClick={toggleCoreFilter}
              >
                {coreFilterEnabled ? 'Показать лишних' : 'Убрать лишних'}
              </button>
            )}
            <button
              className={`scope-filter-toggle${personalMode ? ' active' : ''}`}
              type="button"
              aria-pressed={personalMode}
              onClick={togglePersonalFilter}
            >
              {personalMode ? 'Закрыть личную' : 'Личная статистика'}
            </button>
          </div>
        </div>
      )}

      <StatsPanel
        key={`${activeScope}-${personalComparisonScope}-stats`}
        refreshKey={statsKey}
        scope={activeScope}
        comparisonScope={personalComparisonScope}
      />

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

      {!isCompactLayout && (
        <p className="table-scroll-hint">На узком экране таблицу можно прокручивать по горизонтали.</p>
      )}

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
        ) : personalMode && scopedMovies.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon" aria-hidden="true">🎟</div>
            <div className="empty-state-title">Вы ещё ничего не оценили</div>
            <p>Вернитесь к полному списку, чтобы поставить первую оценку.</p>
            <button className="button-ghost" type="button" onClick={togglePersonalFilter}>
              {coreFilterEnabled ? 'Вернуться к основной четвёрке' : 'Показать все фильмы'}
            </button>
          </div>
        ) : coreMode && scopedMovies.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon" aria-hidden="true">👥</div>
            <div className="empty-state-title">У основной четвёрки пока нет оценок</div>
            <p>Вернитесь к полному списку, чтобы поставить первую оценку.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon" aria-hidden="true">⌕</div>
            <div className="empty-state-title">Ничего не найдено</div>
            <p>По запросу «{debouncedQuery}» фильмов нет.</p>
          </div>
        ) : isCompactLayout ? (
          <>
            <div className="watched-card-sort" role="group" aria-label="Сортировка просмотренных фильмов">
              <label>
                <span>Сортировка</span>
                <select value={sortColumn || ''} onChange={handleCompactSortChange}>
                  <option value="">Сначала новые</option>
                  <option value="title">По названию</option>
                  {visibleUsers.map(user => (
                    <option key={user.id} value={`rating_${user.id}`}>
                      {personalMode ? 'По моей оценке' : `По оценке: ${user.name}`}
                    </option>
                  ))}
                  {showAverageColumn && <option value="avg_rating">По средней</option>}
                </select>
              </label>
              <button
                className="button-ghost"
                type="button"
                onClick={toggleCompactSortDirection}
                disabled={!sortColumn}
                aria-label={
                  sortColumn === 'title'
                    ? `Сейчас ${sortDirection === 'asc' ? 'от А до Я' : 'от Я до А'}. Изменить направление`
                    : `Сейчас сначала ${sortDirection === 'asc' ? 'низкие' : 'высокие'} оценки. Изменить направление`
                }
              >
                {sortColumn === 'title'
                  ? (sortDirection === 'asc' ? 'А → Я' : 'Я → А')
                  : (sortDirection === 'asc' ? 'Сначала ниже' : 'Сначала выше')}
              </button>
            </div>
            <div
              className="watched-mobile-list"
              role="list"
              aria-label={
                personalMode
                  ? 'Фильмы, которые я оценил'
                  : coreMode
                    ? 'Просмотренные фильмы основной четвёрки'
                    : 'Все просмотренные фильмы'
              }
            >
              {sorted.map(renderCompactMovieCard)}
            </div>
          </>
        ) : (
          <table
            className={`watched-table${isAdmin ? ' has-actions' : ''}`}
            style={{ minWidth: `${220 + (isAdmin ? 72 : 0) + visibleUsers.length * 88 + (showAverageColumn ? 108 : 0)}px` }}
            aria-label={
              personalMode
                ? 'Фильмы, которые я оценил'
                : coreMode
                  ? 'Просмотренные фильмы основной четвёрки'
                  : 'Все просмотренные фильмы'
            }
          >
            <colgroup>
              {isAdmin && <col className="watched-action-col" />}
              <col className="watched-title-col" />
              {visibleUsers.map(user => <col key={user.id} className="watched-user-col" />)}
              {showAverageColumn && <col className="watched-avg-col" />}
            </colgroup>
            <thead>
              <tr>
                {isAdmin && <th className="watched-actions-sticky" aria-label="Действия" />}
                <th className="watched-title-sticky" aria-sort={getAriaSort(sortColumn, sortDirection, 'title')}>
                  <button className="table-sort-button" type="button" onClick={() => handleSort('title')}>
                    <span className="watched-column-heading">
                      <span className="watched-column-avatar" aria-hidden="true">🎬</span>
                      <span>Фильм</span>
                    </span>
                    {sortIcon('title')}
                  </button>
                </th>
                {visibleUsers.map(user => {
                  const column = `rating_${user.id}`;
                  return (
                    <th key={user.id} aria-sort={getAriaSort(sortColumn, sortDirection, column)}>
                      <button className="table-sort-button" type="button" onClick={() => handleSort(column)}>
                        <span className="watched-column-heading">
                          <span className="watched-column-avatar" aria-hidden="true">
                            {user.name.slice(0, 1)}
                          </span>
                          <span>{personalMode ? 'Моя' : user.name}</span>
                        </span>
                        {sortIcon(column)}
                      </button>
                    </th>
                  );
                })}
                {showAverageColumn && (
                  <th aria-sort={getAriaSort(sortColumn, sortDirection, 'avg_rating')}>
                    <button className="table-sort-button" type="button" onClick={() => handleSort('avg_rating')}>
                      <span className="watched-column-heading">
                        <span className="watched-column-avatar" aria-hidden="true">★</span>
                        <span>Средняя</span>
                      </span>
                      {sortIcon('avg_rating')}
                    </button>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {sorted.map(movie => (
                <tr key={movie.id}>
                  {isAdmin && (
                    <td className="watched-actions-sticky">
                      <div className="row-actions">
                        <button className="row-action-button" type="button" onClick={() => startEditing(movie)} title="Редактировать" aria-label={`Редактировать ${movie.title}`}>✎</button>
                        <button className="row-action-button danger" type="button" onClick={() => setPendingDelete(movie)} title="Удалить" aria-label={`Удалить ${movie.title}`}>🗑</button>
                      </div>
                    </td>
                  )}
                  <td className="watched-title-sticky">
                    {editingId === movie.id ? (
                      renderEditMovieForm(movie, 'table')
                    ) : (
                      <div className="movie-title-stack">
                        <button
                          className="movie-title-cell"
                          type="button"
                          onClick={() => openMoviePanel(movie, 'details')}
                          aria-haspopup="dialog"
                        >
                          <strong>{movie.title}</strong>
                          <span>
                            {movie.watched_at ? `просмотрен ${formatDate(movie.watched_at)}` : movie.added_at ? `добавлен ${formatDate(movie.added_at)}` : 'дата не указана'}
                          </span>
                        </button>
                        <div className="movie-review-actions">
                          <button
                            className="movie-review-trigger"
                            type="button"
                            onClick={() => openMoviePanel(movie, 'reviews')}
                            aria-haspopup="dialog"
                            aria-label={`Открыть рецензии на ${movie.title}, ${Number(movie.review_count) || 0}`}
                          >
                            Рецензии · {Number(movie.review_count) || 0}
                          </button>
                          {!isGuest && (
                            <button
                              className="movie-review-write"
                              type="button"
                              onClick={() => openMoviePanel(movie, 'compose')}
                              aria-haspopup="dialog"
                              aria-label={`Написать рецензию на ${movie.title}`}
                            >
                              Написать
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </td>
                  {visibleUsers.map(user => <td key={user.id}>{renderRatingCell(movie, user.id)}</td>)}
                  {showAverageColumn && <td>{renderAvgRating(movie)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {!isGuest && !isAdmin && (
        <p className="watched-history-permission" role="note">
          Общую историю меняет администратор. Оценки и рецензии по-прежнему доступны всем участникам.
        </p>
      )}

      {isAdmin && (
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
      <MovieDetailsDialog
        key={detailsMovieForDisplay ? `${detailsMovieForDisplay.id}:${detailsView}` : 'closed'}
        movie={detailsMovieForDisplay}
        users={visibleUsers}
        initialView={detailsView}
        renderRating={renderRatingCell}
        onEdit={movie => {
          startEditing(movie);
          closeMoviePanel();
        }}
        onDelete={movie => {
          setPendingDelete(movie);
          closeMoviePanel();
        }}
        onClose={closeMoviePanel}
      />
    </>
  );
}
