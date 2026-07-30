import { movieMetaText } from '../movies/movieDraft';

function formatDate(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('ru-RU').format(date);
}

function ariaSort(sortColumn, sortDirection, column) {
  if (sortColumn !== column) return 'none';
  return sortDirection === 'asc' ? 'ascending' : 'descending';
}

export default function WatchedHistory({
  debouncedQuery,
  editingId,
  filtered,
  isAdmin,
  isCompactLayout,
  isGuest,
  loadError,
  loadMovies,
  loadState,
  movies,
  onCompactSortChange,
  onOpenMovie,
  onSetPendingDelete,
  onShowAllUsers,
  onSort,
  onStartEditing,
  onToggleCompactSortDirection,
  onTogglePersonalFilter,
  personalMode,
  renderAverage,
  renderCompactCard,
  renderEditForm,
  renderRating,
  scopedMovies,
  showAverageColumn,
  sortColumn,
  sortDirection,
  sorted,
  sortIcon,
  userFilterEnabled,
  visibleUsers,
}) {
  const listLabel = personalMode
    ? 'Фильмы с моими оценками'
    : userFilterEnabled
      ? 'Просмотренные фильмы выбранных участников'
      : 'Все просмотренные фильмы';

  return (
    <div className="watched-table-wrapper">
      {loadState === 'loading' && movies.length === 0 ? (
        <div className="watched-loading" aria-live="polite">
          <div className="skeleton" />
          <div className="skeleton" />
          <div className="skeleton" />
        </div>
      ) : loadState === 'error' && movies.length === 0 ? (
        <div className="empty-state" role="alert">
          <div className="empty-state-icon" aria-hidden="true">📡</div>
          <div className="empty-state-title">{loadError}</div>
          <button className="button-primary" type="button" onClick={loadMovies}>
            Повторить
          </button>
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
          <p>Поставьте оценку фильму или вернитесь к общей статистике.</p>
          <button className="button-ghost" type="button" onClick={onTogglePersonalFilter}>
            Показать общую
          </button>
        </div>
      ) : userFilterEnabled && scopedMovies.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon" aria-hidden="true">👥</div>
          <div className="empty-state-title">
            У выбранных участников пока нет оценок
          </div>
          <p>Выберите других участников или вернитесь к полной таблице.</p>
          <button className="button-ghost" type="button" onClick={onShowAllUsers}>
            Показать всех
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon" aria-hidden="true">⌕</div>
          <div className="empty-state-title">Ничего не найдено</div>
          <p>По запросу «{debouncedQuery}» фильмов нет.</p>
        </div>
      ) : isCompactLayout ? (
        <>
          <div
            className="watched-card-sort"
            role="group"
            aria-label="Сортировка просмотренных фильмов"
          >
            <label>
              <span>Сортировка</span>
              <select value={sortColumn || ''} onChange={onCompactSortChange}>
                <option value="">Сначала новые</option>
                <option value="title">По названию</option>
                {visibleUsers.map(user => (
                  <option key={user.id} value={`rating_${user.id}`}>
                    По оценке: {user.name}
                  </option>
                ))}
                {showAverageColumn && <option value="avg_rating">По средней</option>}
              </select>
            </label>
            <button
              className="button-ghost"
              type="button"
              onClick={onToggleCompactSortDirection}
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
          <div className="watched-mobile-list" role="list" aria-label={listLabel}>
            {sorted.map(renderCompactCard)}
          </div>
        </>
      ) : (
        <table
          className={`watched-table${isAdmin ? ' has-actions' : ''}`}
          style={{
            minWidth: `${
              220
              + (isAdmin ? 72 : 0)
              + visibleUsers.length * 88
              + (showAverageColumn ? 108 : 0)
            }px`,
          }}
          aria-label={listLabel}
        >
          <colgroup>
            {isAdmin && <col className="watched-action-col" />}
            <col className="watched-title-col" />
            {visibleUsers.map(user => (
              <col key={user.id} className="watched-user-col" />
            ))}
            {showAverageColumn && <col className="watched-avg-col" />}
          </colgroup>
          <thead>
            <tr>
              {isAdmin && (
                <th className="watched-actions-sticky" aria-label="Действия" />
              )}
              <th
                className="watched-title-sticky"
                aria-sort={ariaSort(sortColumn, sortDirection, 'title')}
              >
                <button
                  className="table-sort-button"
                  type="button"
                  onClick={() => onSort('title')}
                >
                  Фильм {sortIcon('title')}
                </button>
              </th>
              {visibleUsers.map(user => {
                const column = `rating_${user.id}`;
                return (
                  <th
                    key={user.id}
                    aria-sort={ariaSort(sortColumn, sortDirection, column)}
                  >
                    <button
                      className="table-sort-button"
                      type="button"
                      onClick={() => onSort(column)}
                    >
                      {user.name} {sortIcon(column)}
                    </button>
                  </th>
                );
              })}
              {showAverageColumn && (
                <th aria-sort={ariaSort(sortColumn, sortDirection, 'avg_rating')}>
                  <button
                    className="table-sort-button"
                    type="button"
                    onClick={() => onSort('avg_rating')}
                  >
                    Средняя {sortIcon('avg_rating')}
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
                      <button
                        className="row-action-button"
                        type="button"
                        onClick={() => onStartEditing(movie)}
                        title="Редактировать"
                        aria-label={`Редактировать ${movie.title}`}
                      >
                        ✎
                      </button>
                      <button
                        className="row-action-button danger"
                        type="button"
                        onClick={() => onSetPendingDelete(movie)}
                        title="Удалить"
                        aria-label={`Удалить ${movie.title}`}
                      >
                        🗑
                      </button>
                    </div>
                  </td>
                )}
                <td className="watched-title-sticky">
                  {editingId === movie.id ? (
                    renderEditForm(movie, 'table')
                  ) : (
                    <div className="movie-title-stack">
                      <button
                        className="movie-title-cell"
                        type="button"
                        onClick={() => onOpenMovie(movie, 'details')}
                        aria-haspopup="dialog"
                      >
                        <strong>{movie.title}</strong>
                        {movieMetaText(movie) && (
                          <span className="movie-title-meta">
                            {movieMetaText(movie)}
                          </span>
                        )}
                        <span>
                          {movie.watched_at
                            ? `просмотрен ${formatDate(movie.watched_at)}`
                            : movie.added_at
                              ? `добавлен ${formatDate(movie.added_at)}`
                              : 'дата не указана'}
                        </span>
                      </button>
                      <div className="movie-review-actions">
                        <button
                          className="movie-review-trigger"
                          type="button"
                          onClick={() => onOpenMovie(movie, 'reviews')}
                          aria-haspopup="dialog"
                          aria-label={`Открыть рецензии на ${movie.title}, ${Number(movie.review_count) || 0}`}
                        >
                          Рецензии · {Number(movie.review_count) || 0}
                        </button>
                        {!isGuest && (
                          <button
                            className="movie-review-write"
                            type="button"
                            onClick={() => onOpenMovie(movie, 'compose')}
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
                {visibleUsers.map(user => (
                  <td key={user.id}>{renderRating(movie, user.id)}</td>
                ))}
                {showAverageColumn && <td>{renderAverage(movie)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
