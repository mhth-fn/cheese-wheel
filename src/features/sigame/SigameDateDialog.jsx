export default function SigameDateDialog({
  busy,
  date,
  onChange,
  onClose,
  onSave,
  pack,
}) {
  return (
    <div
      className="sigame-modal-backdrop"
      onMouseDown={event => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <form
        className="sigame-pack-form sigame-date-form"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sigame-date-form-title"
        onSubmit={event => {
          event.preventDefault();
          if (date) onSave(date);
        }}
      >
        <div className="sigame-form-heading">
          <h2 id="sigame-date-form-title">Дата игры</h2>
          <button
            type="button"
            className="sigame-form-close"
            onClick={onClose}
            disabled={busy}
            aria-label="Закрыть форму"
          >
            ×
          </button>
        </div>

        <p className="sigame-date-pack-name">{pack.title}</p>
        <label className="sigame-field">
          <span>Когда сыграли</span>
          <input
            type="date"
            value={date}
            onChange={event => onChange(event.target.value)}
            required
            autoFocus
          />
        </label>

        <div className="sigame-date-actions">
          <button
            className="button-ghost sigame-unknown-date-button"
            type="button"
            onClick={() => onSave(null)}
            disabled={busy}
          >
            Дата неизвестна
          </button>
          <div>
            <button className="button-ghost" type="button" onClick={onClose} disabled={busy}>
              Отмена
            </button>
            <button className="button-primary" type="submit" disabled={busy || !date}>
              {busy ? 'Сохраняем…' : 'Сохранить'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
