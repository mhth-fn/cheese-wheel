import { SIGAME_SORT_OPTIONS } from './sigameUtils';

export default function SigameFilters({
  activeTab,
  activeTag,
  counts,
  onSearchChange,
  onSelectTab,
  onSelectTag,
  onSortChange,
  search,
  sort,
  tags,
}) {
  return (
    <section className="sigame-controls" aria-label="Фильтры библиотеки">
      <div className="sigame-tabs" role="tablist" aria-label="Статус паков">
        {[
          ['unplayed', 'Не сыграны'],
          ['played', 'Сыгранные'],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={activeTab === key}
            className={activeTab === key ? 'active' : ''}
            onClick={() => onSelectTab(key)}
          >
            {label} <span>{counts[key]}</span>
          </button>
        ))}
      </div>

      <div className="sigame-search-row">
        <label className="sigame-search">
          <span aria-hidden="true">⌕</span>
          <span className="sr-only">Поиск паков</span>
          <input
            type="search"
            value={search}
            onChange={event => onSearchChange(event.target.value)}
            placeholder="Название или тег…"
          />
          {search && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              aria-label="Очистить поиск"
            >
              ×
            </button>
          )}
        </label>
        <label className="sigame-sort">
          <span className="sr-only">Сортировка</span>
          <select value={sort} onChange={event => onSortChange(event.target.value)}>
            {SIGAME_SORT_OPTIONS[activeTab].map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {tags.length > 0 && (
        <div className="sigame-tags-filter" aria-label="Фильтр по тегам">
          <button
            type="button"
            className={!activeTag ? 'active' : ''}
            onClick={() => onSelectTag('')}
          >
            Все
          </button>
          {tags.map(tag => {
            const key = tag.label.toLocaleLowerCase('ru-RU');
            return (
              <button
                key={key}
                type="button"
                className={activeTag === key ? 'active' : ''}
                onClick={() => onSelectTag(activeTag === key ? '' : key)}
              >
                {tag.label} <span>{tag.count}</span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
