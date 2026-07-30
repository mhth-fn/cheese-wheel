export default function WatchedAddForm({
  adding,
  connected,
  draft,
  onChange,
  onSubmit,
}) {
  const setField = field => event => onChange(current => ({
    ...current,
    [field]: event.target.value,
  }));
  const disabled = adding || !connected;

  return (
    <section className="watched-add-movie surface">
      <div>
        <p className="watched-add-kicker">Без прокрутки</p>
        <h2>Добавить фильм в просмотренные</h2>
      </div>
      <form className="add-movie-form" onSubmit={onSubmit}>
        <div className="add-movie-fields">
          <label className="sr-only" htmlFor="watched-movie-title">
            Название фильма
          </label>
          <input
            id="watched-movie-title"
            type="text"
            className="add-movie-input"
            placeholder="Название на русском…"
            maxLength={200}
            value={draft.title}
            onChange={setField('title')}
            disabled={disabled}
          />
          <label className="sr-only" htmlFor="watched-movie-alternative">
            Альтернативное название
          </label>
          <input
            id="watched-movie-alternative"
            type="text"
            className="add-movie-input"
            placeholder="Альтернативное название…"
            maxLength={200}
            value={draft.alternative_title}
            onChange={setField('alternative_title')}
            disabled={disabled}
          />
          <label className="sr-only" htmlFor="watched-movie-director">
            Режиссёр
          </label>
          <input
            id="watched-movie-director"
            type="text"
            className="add-movie-input"
            placeholder="Режиссёр…"
            maxLength={200}
            value={draft.director}
            onChange={setField('director')}
            disabled={disabled}
          />
          <label className="sr-only" htmlFor="watched-movie-year">Год</label>
          <input
            id="watched-movie-year"
            type="number"
            className="add-movie-input add-movie-year"
            min="1888"
            max="2100"
            inputMode="numeric"
            placeholder="Год"
            value={draft.year}
            onChange={setField('year')}
            disabled={disabled}
          />
        </div>
        <button
          type="submit"
          className="add-movie-btn button-primary"
          disabled={!draft.title.trim() || disabled}
        >
          {adding ? 'Добавляем…' : 'Добавить'}
        </button>
      </form>
    </section>
  );
}
