import {
  formatReviewDate,
  RECOMMEND_OPTIONS,
} from './reviewUtils';

export default function MovieReviewComposer({
  composerRef,
  connected,
  director,
  existingOwnReview,
  existingReviewActionRef,
  formContent,
  formMovieId,
  formTitle,
  linkToWatched,
  loadWatchedMovies,
  matchingWatchedMovies,
  movie,
  onStartEdit,
  onSubmit,
  recommend,
  setDirector,
  setFormContent,
  setFormMovieId,
  setFormTitle,
  setLinkToWatched,
  setRecommend,
  setYear,
  submitting,
  watchedMovies,
  watchedState,
  year,
}) {
  return (
    <form className="review-form" onSubmit={onSubmit}>
      {movie ? (
        <div className="review-form-movie-lock">
          <span aria-hidden="true">🎬</span>
          <div>
            <small>Рецензия на фильм</small>
            <strong>{movie.title}</strong>
          </div>
        </div>
      ) : (
        <div className="review-form-field">
          <label className="review-field-label" htmlFor="movie-review-title">
            Название фильма *
          </label>
          <input
            id="movie-review-title"
            className="review-form-input"
            type="text"
            list="watched-movie-review-options"
            value={formTitle}
            onChange={event => {
              setFormTitle(event.target.value);
              setFormMovieId('');
            }}
            placeholder="Выберите из просмотренных или введите другое"
            maxLength={200}
            required
          />
          <datalist id="watched-movie-review-options">
            {watchedMovies.map(item => (
              <option key={item.id} value={item.title} />
            ))}
          </datalist>
          {matchingWatchedMovies.length <= 1 && (
            <label className="review-link-choice">
              <input
                type="checkbox"
                checked={linkToWatched}
                onChange={event => setLinkToWatched(event.target.checked)}
              />
              <span>
                {matchingWatchedMovies.length === 1
                  ? 'Связать с найденным фильмом в «Просмотренных»'
                  : 'Связать автоматически при точном совпадении'}
              </span>
            </label>
          )}
          {watchedState === 'loading' ? (
            <small className="review-field-hint">
              Загружаем подсказки из просмотренного…
            </small>
          ) : watchedState === 'error' ? (
            <small className="review-field-hint is-error">
              Подсказки не загрузились.
              <button type="button" onClick={loadWatchedMovies}>Повторить</button>
            </small>
          ) : matchingWatchedMovies.length > 1 ? (
            <label className="review-form-field review-match-choice">
              <span>В истории несколько фильмов с таким названием</span>
              <select
                className="review-form-input"
                value={formMovieId}
                onChange={event => setFormMovieId(event.target.value)}
              >
                <option value="">Оставить рецензию без связи</option>
                {matchingWatchedMovies.map(item => (
                  <option key={item.id} value={item.id}>
                    {item.title} · {formatReviewDate(item.watched_at || item.added_at)}
                  </option>
                ))}
              </select>
            </label>
          ) : matchingWatchedMovies.length === 0 ? (
            <small className="review-field-hint">
              Можно написать рецензию и на фильм не из общей истории.
            </small>
          ) : null}
          {existingOwnReview && (
            <div className="review-existing-note" role="status">
              <strong>Вы уже написали обзор на этот фильм.</strong>
              <button
                ref={existingReviewActionRef}
                className="button-ghost"
                type="button"
                onClick={() => onStartEdit(existingOwnReview)}
              >
                Изменить мой обзор
              </button>
            </div>
          )}
        </div>
      )}

      <label className="review-form-field">
        <span>Текст рецензии *</span>
        <textarea
          ref={composerRef}
          className="review-form-textarea"
          placeholder="Что запомнилось, что сработало, а что — нет?"
          value={formContent}
          onChange={event => setFormContent(event.target.value)}
          maxLength={5000}
          rows={5}
          required
        />
      </label>

      <details className="review-extra-fields">
        <summary>Добавить режиссёра и год</summary>
        <div className="wine-fields-row">
          <label className="review-form-field wine-field">
            <span>Режиссёр</span>
            <input
              className="review-form-input"
              type="text"
              value={director}
              onChange={event => setDirector(event.target.value)}
              maxLength={100}
            />
          </label>
          <label className="review-form-field wine-field wine-field-short">
            <span>Год</span>
            <input
              className="review-form-input"
              type="number"
              value={year}
              onChange={event => setYear(event.target.value)}
              min={1888}
              max={2100}
            />
          </label>
        </div>
      </details>

      <div className="review-form-footer">
        <div className="recommend-toggle-group" aria-label="Рекомендация">
          {RECOMMEND_OPTIONS.map(option => (
            <button
              key={option.value}
              type="button"
              className={[
                'review-recommend-toggle',
                option.cls,
                recommend === option.value ? 'active' : '',
              ].filter(Boolean).join(' ')}
              onClick={() => setRecommend(option.value)}
              aria-pressed={recommend === option.value}
            >
              {option.label}
            </button>
          ))}
        </div>
        <button
          type="submit"
          className="review-submit-btn"
          disabled={
            submitting
            || Boolean(existingOwnReview)
            || !(movie?.title || formTitle.trim())
            || !formContent.trim()
            || !connected
          }
        >
          {submitting ? 'Публикуем…' : 'Опубликовать'}
        </button>
      </div>
      {!connected && (
        <p className="review-form-status">
          Публикация недоступна, пока нет соединения.
        </p>
      )}
    </form>
  );
}
