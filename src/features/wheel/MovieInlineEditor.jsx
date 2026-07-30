import MovieFields from '../movies/MovieFields';

export default function MovieInlineEditor({
  movie,
  draft,
  onChange,
  onSubmit,
  onCancel,
  idPrefix,
}) {
  return (
    <form className="wm-inline-edit" onSubmit={onSubmit}>
      <MovieFields
        value={draft}
        onChange={onChange}
        idPrefix={idPrefix || `edit-movie-${movie.id}`}
        autoFocus
      />
      <div className="wm-inline-edit-actions">
        <button className="button-primary" type="submit" disabled={!draft.title.trim()}>
          Сохранить
        </button>
        <button className="button-ghost" type="button" onClick={onCancel}>
          Отмена
        </button>
      </div>
    </form>
  );
}
