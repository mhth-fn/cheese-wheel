import {
  formatReviewDate,
  getRecommendInfo,
  RECOMMEND_OPTIONS,
} from './reviewUtils';

export default function MovieReviewCard({
  currentUser,
  editFields,
  editFormRef,
  editing,
  isAdmin,
  isGuest,
  movie,
  onCancelEdit,
  onDelete,
  onEditMovieLink,
  onReaction,
  onSave,
  onStartEdit,
  review,
  setEditFields,
  watchedMovies,
}) {
  const setEditField = field => event => {
    setEditFields(previous => ({ ...previous, [field]: event.target.value }));
  };
  const recommendation = getRecommendInfo(review.recommend);
  const ownReaction = (review.reactions || []).find(
    item => item.user_id === currentUser?.id
  )?.reaction;

  return (
    <article className="review-card">
      {editing ? (
        <div ref={editFormRef} className="review-edit-form">
          {review.movie_id ? (
            <div className="review-form-movie-lock compact">
              <span aria-hidden="true">🎬</span>
              <strong>{review.title}</strong>
            </div>
          ) : (
            <>
              <label className="review-form-field">
                <span>Название фильма</span>
                <input
                  className="review-form-input"
                  value={editFields.title}
                  onChange={setEditField('title')}
                  maxLength={200}
                />
              </label>
              {!movie && watchedMovies.length > 0 && (
                <label className="review-form-field">
                  <span>Связать со строкой в «Просмотренных»</span>
                  <select
                    className="review-form-input"
                    value={editFields.movieId || ''}
                    onChange={onEditMovieLink}
                  >
                    <option value="">Оставить без связи</option>
                    {watchedMovies.map(item => (
                      <option key={item.id} value={item.id}>{item.title}</option>
                    ))}
                  </select>
                </label>
              )}
            </>
          )}
          <label className="review-form-field">
            <span>Текст рецензии</span>
            <textarea
              className="review-form-textarea"
              value={editFields.content}
              onChange={setEditField('content')}
              maxLength={5000}
              rows={4}
              autoFocus
            />
          </label>
          <div className="wine-fields-row">
            <input
              className="review-form-input wine-field"
              value={editFields.director}
              onChange={setEditField('director')}
              maxLength={100}
              placeholder="Режиссёр"
              aria-label="Режиссёр"
            />
            <input
              className="review-form-input wine-field wine-field-short"
              type="number"
              value={editFields.year}
              onChange={setEditField('year')}
              min={1888}
              max={2100}
              placeholder="Год"
              aria-label="Год"
            />
          </div>
          <div className="review-form-footer">
            <div className="recommend-toggle-group" aria-label="Рекомендация">
              {RECOMMEND_OPTIONS.map(option => (
                <button
                  key={option.value}
                  type="button"
                  className={[
                    'review-recommend-toggle',
                    option.cls,
                    editFields.recommend === option.value ? 'active' : '',
                  ].filter(Boolean).join(' ')}
                  onClick={() => setEditFields(previous => ({
                    ...previous,
                    recommend: option.value,
                  }))}
                  aria-pressed={editFields.recommend === option.value}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="review-edit-cancel"
              onClick={onCancelEdit}
            >
              Отмена
            </button>
            <button
              type="button"
              className="review-submit-btn"
              onClick={() => onSave(review.id)}
              disabled={!editFields.title?.trim() || !editFields.content?.trim()}
            >
              Сохранить
            </button>
          </div>
        </div>
      ) : (
        <>
          <header className="review-card-header">
            {!movie && <span className="review-card-title">{review.title}</span>}
            <span className={`review-badge ${recommendation.cls}`}>
              {recommendation.label}
            </span>
            {!isGuest && (currentUser?.id === review.user_id || isAdmin) && (
              <div className="review-card-actions">
                <button
                  className="review-edit-btn"
                  type="button"
                  onClick={() => onStartEdit(review)}
                  aria-label={`Редактировать рецензию на ${review.title}`}
                  title="Редактировать"
                >
                  ✏️
                </button>
                <button
                  className="review-delete-btn"
                  type="button"
                  onClick={() => onDelete(review.id)}
                  aria-label={`Удалить рецензию на ${review.title}`}
                  title="Удалить"
                >
                  🗑️
                </button>
              </div>
            )}
          </header>
          {(review.director || review.year) && (
            <div className="wine-card-details">
              {review.director && <span>🎥 {review.director}</span>}
              {review.year && <span>📅 {review.year}</span>}
            </div>
          )}
          <div className="review-card-meta">
            <span className="review-author">{review.user_name}</span>
            <span className="review-date">
              {formatReviewDate(review.created_at)}
            </span>
          </div>
          <p className="review-content">{review.content}</p>
          {!isGuest && currentUser && (
            <div className="review-reactions">
              <button
                className={`reaction-btn like ${ownReaction === 1 ? 'active' : ''}`}
                type="button"
                onClick={() => onReaction(review.id, 1)}
                disabled={currentUser.id === review.user_id}
                aria-label={`Нравится, ${review.likes || 0}`}
                aria-pressed={ownReaction === 1}
              >
                👍 {review.likes || 0}
              </button>
              <button
                className={`reaction-btn dislike ${ownReaction === -1 ? 'active' : ''}`}
                type="button"
                onClick={() => onReaction(review.id, -1)}
                disabled={currentUser.id === review.user_id}
                aria-label={`Не нравится, ${review.dislikes || 0}`}
                aria-pressed={ownReaction === -1}
              >
                👎 {review.dislikes || 0}
              </button>
            </div>
          )}
        </>
      )}
    </article>
  );
}
