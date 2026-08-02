function movieCountLabel(value) {
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 === 1 && mod100 !== 11) return `${value} фильм`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${value} фильма`;
  }
  return `${value} фильмов`;
}

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
    <section className="watched-scope-control" aria-labelledby="watched-stats-filter-title">
      <span className="sr-only" aria-live="polite">
        {personalMode
          ? `Показана личная статистика: ${movieCountLabel(movieCount)}`
          : userFilterEnabled
            ? `Выбрано участников: ${groupVisibleUsers.length} из ${users.length}`
            : 'Показаны все участники'}
      </span>
      <div className="watched-scope-heading">
        <div>
          <strong id="watched-stats-filter-title">Статистика</strong>
          <span>
            {personalMode
              ? `Ваши оценки · ${movieCountLabel(movieCount)}`
              : userFilterEnabled
                ? `${groupVisibleUsers.length} участников · ${movieCountLabel(movieCount)}`
                : `Все участники · ${movieCountLabel(movieCount)}`}
          </span>
        </div>
        {canUsePersonalFilter && (
          <div className="watched-scope-tabs" role="group" aria-label="Режим статистики">
            <button
              className={`watched-scope-tab${!personalMode ? ' active' : ''}`}
              type="button"
              aria-pressed={!personalMode}
              onClick={() => personalMode && onTogglePersonal()}
            >
              Общая
            </button>
            <button
              className={`watched-scope-tab${personalMode ? ' active' : ''}`}
              type="button"
              aria-pressed={personalMode}
              onClick={() => !personalMode && onTogglePersonal()}
            >
              Моя
            </button>
          </div>
        )}
      </div>
      <div
        className="watched-user-filters"
        role="group"
        aria-label={personalMode ? 'Сравнить мои оценки с участниками' : 'Участники общей статистики'}
      >
        <span className="watched-filter-label">
          {personalMode ? 'Сравнить с' : 'Участники'}
        </span>
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
          Все
        </button>
      </div>
      <p className="watched-scope-note">
        Эти настройки меняют только карточки статистики. Таблица ниже всегда остаётся полной.
      </p>
    </section>
  );
}
