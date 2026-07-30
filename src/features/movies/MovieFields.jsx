export default function MovieFields({
  autoFocus = false,
  idPrefix,
  onChange,
  value,
}) {
  const setField = field => event => onChange({
    ...value,
    [field]: event.target.value,
  });

  return (
    <div className="wm-movie-fields">
      <label className="sr-only" htmlFor={`${idPrefix}-title`}>
        Название фильма
      </label>
      <input
        id={`${idPrefix}-title`}
        className="wm-input"
        type="text"
        placeholder="Название на русском…"
        value={value.title}
        maxLength={200}
        onChange={setField('title')}
        autoFocus={autoFocus}
        required
      />
      <label className="sr-only" htmlFor={`${idPrefix}-alternative`}>
        Альтернативное название
      </label>
      <input
        id={`${idPrefix}-alternative`}
        className="wm-input"
        type="text"
        placeholder="Альтернативное название…"
        value={value.alternative_title}
        maxLength={200}
        onChange={setField('alternative_title')}
      />
      <div className="wm-movie-meta-fields">
        <label className="sr-only" htmlFor={`${idPrefix}-director`}>Режиссёр</label>
        <input
          id={`${idPrefix}-director`}
          className="wm-input"
          type="text"
          placeholder="Режиссёр…"
          value={value.director}
          maxLength={200}
          onChange={setField('director')}
        />
        <label className="sr-only" htmlFor={`${idPrefix}-year`}>Год</label>
        <input
          id={`${idPrefix}-year`}
          className="wm-input wm-year-input"
          type="number"
          min="1888"
          max="2100"
          inputMode="numeric"
          placeholder="Год"
          value={value.year}
          onChange={setField('year')}
        />
      </div>
    </div>
  );
}
