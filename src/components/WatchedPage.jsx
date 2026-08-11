import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useApp } from '../app/AppContext';
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
import {
  EMPTY_MOVIE_DRAFT,
  movieDraftPayload,
  movieMetaText,
  movieToDraft,
} from '../features/movies/movieDraft';
import MovieExternalLinks from '../features/movies/MovieExternalLinks';
import WatchedAddForm from '../features/watched/WatchedAddForm';
import WatchedHistory from '../features/watched/WatchedHistory';
import WatchedScopeControls from '../features/watched/WatchedScopeControls';
import { useWatchedScope } from '../features/watched/useWatchedScope';
import { useMediaQuery } from '../hooks/useMediaQuery';

export default function WatchedPage() {
  const {
    connected,
    currentUser,
    interfaceTheme,
    isAdmin,
    isGuest,
    page,
    showToast,
    socket,
    users,
  } = useApp();
  const [movies, setMovies] = useState([]);
  const [searchQuery, setSearchQuery] = useState(() => sessionStorage.getItem('watchedSearch') || '');
  const [debouncedQuery, setDebouncedQuery] = useState(searchQuery);
  const [sortColumn, setSortColumn] = useState('avg_rating');
  const [sortDirection, setSortDirection] = useState('desc');
  const [addDraft, setAddDraft] = useState(EMPTY_MOVIE_DRAFT);
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
  const [editDraft, setEditDraft] = useState(EMPTY_MOVIE_DRAFT);
  const [editWatchedAt, setEditWatchedAt] = useState('');
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

  const watchedScope = useWatchedScope({
    currentUser,
    isGuest,
    movies,
    onScopeChange: () => setDetailsMovie(null),
    showToast,
    users,
  });
  const {
    activeScope,
    canUsePersonalFilter,
    filterUsers,
    groupVisibleUsers,
    personalComparisonScope,
    personalMode,
    scopedMovies: statsScopedMovies,
    selectedComparisonUserIds,
    selectedStatsUserIds,
    selectedUserIdSet,
    showAllUsers,
    togglePersonalFilter,
    toggleUserFilter,
    userFilterEnabled,
  } = watchedScope;

  useEffect(() => {
    if (!sortColumn?.startsWith('rating_')) return;
    const visibleColumns = new Set(users.map(user => `rating_${user.id}`));
    if (!visibleColumns.has(sortColumn)) {
      setSortColumn('avg_rating');
      setSortDirection('desc');
    }
  }, [users, sortColumn]);

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
    setEditDraft(movieToDraft(movie));
    setEditWatchedAt(
      movie.watched_at
        ? String(movie.watched_at).slice(0, 10)
        : movie.added_at || ''
    );
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditDraft(EMPTY_MOVIE_DRAFT);
    setEditWatchedAt('');
  };

  const saveEditing = async () => {
    const movie = movieDraftPayload(editDraft);
    if (!movie.title) {
      showToast('Название не может быть пустым', 'error');
      return;
    }
    try {
      const response = await updateMovie(editingId, {
        ...movie,
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
    const movie = movieDraftPayload(addDraft);
    if (!movie.title) return;
    setAdding(true);
    try {
      const response = await postWatchedMovie(movie);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Ошибка добавления');
      }
      showToast(`«${movie.title}» добавлен в просмотренные`, 'success');
      setAddDraft(EMPTY_MOVIE_DRAFT);
    } catch (error) {
      showToast(error.message || 'Ошибка соединения', 'error');
    } finally {
      setAdding(false);
    }
  };

  const query = debouncedQuery.trim().toLocaleLowerCase('ru');
  const filtered = query
    ? movies.filter(movie => [
      movie.title,
      movie.alternative_title,
      movie.director,
      movie.year,
    ].some(value => String(value || '').toLocaleLowerCase('ru').includes(query)))
    : movies;
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
    ? movies.find(movie => movie.id === detailsMovie.id) || null
    : null;
  const showAverageColumn = true;

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
      <span className={`rating-avg ${className}`} title={`${movie.ratings_count} из ${users.length} оценок`}>
        <strong>{value.toFixed(1)}</strong>
        <small>{movie.ratings_count}/{users.length}</small>
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
        placeholder="Название на русском"
        value={editDraft.title}
        onChange={event => setEditDraft(current => ({ ...current, title: event.target.value }))}
        onKeyDown={handleEditKeyDown}
        autoFocus
      />
      <label className="sr-only" htmlFor={`edit-alternative-${layout}-${movie.id}`}>
        Альтернативное название
      </label>
      <input
        id={`edit-alternative-${layout}-${movie.id}`}
        className="edit-movie-title"
        placeholder="Альтернативное название"
        value={editDraft.alternative_title}
        onChange={event => setEditDraft(current => ({ ...current, alternative_title: event.target.value }))}
        onKeyDown={handleEditKeyDown}
      />
      <div className="edit-movie-meta-row">
        <label className="sr-only" htmlFor={`edit-director-${layout}-${movie.id}`}>Режиссёр</label>
        <input
          id={`edit-director-${layout}-${movie.id}`}
          className="edit-movie-title"
          placeholder="Режиссёр"
          value={editDraft.director}
          onChange={event => setEditDraft(current => ({ ...current, director: event.target.value }))}
          onKeyDown={handleEditKeyDown}
        />
        <label className="sr-only" htmlFor={`edit-year-${layout}-${movie.id}`}>Год</label>
        <input
          id={`edit-year-${layout}-${movie.id}`}
          className="edit-movie-title edit-movie-year"
          type="number"
          min="1888"
          max="2100"
          inputMode="numeric"
          placeholder="Год"
          value={editDraft.year}
          onChange={event => setEditDraft(current => ({ ...current, year: event.target.value }))}
          onKeyDown={handleEditKeyDown}
        />
      </div>
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
              <span>{movieMetaText(movie) || 'Открыть карточку фильма'}</span>
            </button>
            <div className="watched-card-average">
              <span>Средняя</span>
              {renderAvgRating(movie)}
            </div>
          </header>
          <MovieExternalLinks movie={movie} />
        </>
      )}
    </article>
  );

  return (
    <>
      {interfaceTheme === 'seraphim' && (
        <header className="seraphim-page-heading">
          <p>Летопись выбранного</p>
          <h1>Просмотренное</h1>
          <span>Фильтры статистики, оценки и общая история наших просмотров.</span>
        </header>
      )}
      <StatsPanel
        key={`${activeScope}-${selectedStatsUserIds.join(',')}-stats`}
        refreshKey={statsKey}
        scope={activeScope}
        comparisonScope={personalComparisonScope}
        selectedUserIds={selectedStatsUserIds}
        comparisonUserCount={selectedComparisonUserIds.length}
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

      <WatchedScopeControls
        canUsePersonalFilter={canUsePersonalFilter}
        filterUsers={filterUsers}
        groupVisibleUsers={groupVisibleUsers}
        movieCount={statsScopedMovies.length}
        personalMode={personalMode}
        selectedUserIdSet={selectedUserIdSet}
        userFilterEnabled={userFilterEnabled}
        users={users}
        onShowAll={showAllUsers}
        onTogglePersonal={togglePersonalFilter}
        onToggleUser={toggleUserFilter}
      />

      {!isCompactLayout && (
        <p className="table-scroll-hint">На узком экране таблицу можно прокручивать по горизонтали.</p>
      )}

      <WatchedHistory
        debouncedQuery={debouncedQuery}
        editingId={editingId}
        filtered={filtered}
        isAdmin={isAdmin}
        isCompactLayout={isCompactLayout}
        isGuest={isGuest}
        loadError={loadError}
        loadMovies={loadMovies}
        loadState={loadState}
        movies={movies}
        personalMode={false}
        scopedMovies={movies}
        showAverageColumn={showAverageColumn}
        sortColumn={sortColumn}
        sortDirection={sortDirection}
        sorted={sorted}
        userFilterEnabled={false}
        visibleUsers={users}
        onCompactSortChange={handleCompactSortChange}
        onOpenMovie={openMoviePanel}
        onSetPendingDelete={setPendingDelete}
        onShowAllUsers={showAllUsers}
        onSort={handleSort}
        onStartEditing={startEditing}
        onToggleCompactSortDirection={toggleCompactSortDirection}
        onTogglePersonalFilter={togglePersonalFilter}
        renderAverage={renderAvgRating}
        renderCompactCard={renderCompactMovieCard}
        renderEditForm={renderEditMovieForm}
        renderRating={renderRatingCell}
        sortIcon={sortIcon}
      />

      {!isGuest && !isAdmin && (
        <p className="watched-history-permission" role="note">
          Общую историю меняет администратор. Оценки и рецензии по-прежнему доступны всем участникам.
        </p>
      )}

      {isAdmin && (
        <WatchedAddForm
          adding={adding}
          connected={connected}
          draft={addDraft}
          onChange={setAddDraft}
          onSubmit={handleAddWatched}
        />
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
        users={users}
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
