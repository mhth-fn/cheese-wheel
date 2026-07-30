export default function WatchedScopeControls({
  canUsePersonalFilter,
  filterUsers,
  groupVisibleUsers,
  movieCount,
  onShowAll,
  onTogglePersonal,
  onToggleUser,
  personalMode,
  selectedUserIdSet,
  userFilterEnabled,
  users,
}) {
  if (users.length === 0) return null;
  return (
    <div className="watched-scope-control">
      <span className="sr-only" aria-live="polite">
        {personalMode
          ? `Показана личная статистика: ${movieCount} фильмов`
          : userFilterEnabled
            ? `Выбрано участников: ${groupVisibleUsers.length} из ${users.length}`
            : 'Показаны все участники'}
      </span>
      <div
        className="watched-user-filters"
        role="group"
        aria-label="Выбор участников статистики"
      >
        {filterUsers.map(user => {
          const selected = selectedUserIdSet.has(Number(user.id));
          return (
            <button
              key={user.id}
              className={`scope-filter-toggle${selected ? ' active' : ''}`}
              type="button"
              aria-pressed={selected}
              onClick={() => onToggleUser(user.id)}
            >
              {user.name}
            </button>
          );
        })}
        <button
          className="scope-filter-toggle show-all"
          type="button"
          onClick={onShowAll}
          disabled={!userFilterEnabled}
        >
          Показать всех
        </button>
        {canUsePersonalFilter && (
          <button
            className={`scope-filter-toggle personal${personalMode ? ' active' : ''}`}
            type="button"
            aria-pressed={personalMode}
            onClick={onTogglePersonal}
          >
            МОЯ СТАТИСТИКА
          </button>
        )}
      </div>
    </div>
  );
}
