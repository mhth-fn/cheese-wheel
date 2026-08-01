import MusicReviewForm from './MusicReviewForm';
import { getMusicSourceLabel, getMusicType } from './musicReviewOptions';
import { formatReviewDate, getRecommendInfo } from './reviewUtils';

export default function MusicReviewCard({
  currentUser,
  editFields,
  editing,
  isAdmin,
  isGuest,
  onCancelEdit,
  onDelete,
  onEditChange,
  onEditSave,
  onReaction,
  onShare,
  onStartEdit,
  review,
  saving,
}) {
  const recommendation = getRecommendInfo(review.recommend);
  const musicType = getMusicType(review.music_type);
  const ownReaction = (review.reactions || []).find(
    reaction => reaction.user_id === currentUser?.id
  )?.reaction;

  return (
    <article id={`music-review-${review.id}`} className="review-card music-review-card">
      {editing ? (
        <MusicReviewForm
          compact
          fields={editFields}
          onCancel={onCancelEdit}
          onChange={onEditChange}
          onSubmit={event => {
            event.preventDefault();
            onEditSave(review.id);
          }}
          submitting={saving}
          submitLabel="Сохранить"
        />
      ) : (
        <>
          <header className="review-card-header music-review-card-header">
            <span className="music-type-badge">
              <span aria-hidden="true">{musicType.icon}</span>
              {musicType.label}
            </span>
            <span className={`review-badge ${recommendation.cls}`}>
              {recommendation.label}
            </span>
            {!isGuest && (currentUser?.id === review.user_id || isAdmin) && (
              <div className="review-card-actions">
                <button
                  className="review-edit-btn"
                  type="button"
                  onClick={() => onStartEdit(review)}
                  title="Редактировать"
                  aria-label={`Редактировать обзор на ${review.title}`}
                >
                  ✏️
                </button>
                <button
                  className="review-delete-btn"
                  type="button"
                  onClick={() => onDelete(review.id)}
                  title="Удалить"
                  aria-label={`Удалить обзор на ${review.title}`}
                >
                  🗑️
                </button>
              </div>
            )}
          </header>

          <div className="music-review-heading">
            <h2>{review.title}</h2>
            {review.artist && <p>{review.artist}</p>}
          </div>
          <div className="review-card-meta">
            <span className="review-author">{review.user_name}</span>
            <span className="review-date">{formatReviewDate(review.created_at)}</span>
          </div>
          <p className="review-content">{review.content}</p>

          <div className="music-review-footer">
            <div className="music-review-links">
              {review.source_url && (
                <a
                  className="music-source-link"
                  href={review.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <span aria-hidden="true">▶</span>
                  {getMusicSourceLabel(review.source_url)}
                </a>
              )}
              <button
                className="music-share-btn"
                type="button"
                onClick={() => onShare(review)}
              >
                <span aria-hidden="true">↗</span>
                Поделиться обзором
              </button>
            </div>

            {!isGuest && currentUser && (
              <div className="review-reactions">
                <button
                  className={`reaction-btn like${ownReaction === 1 ? ' active' : ''}`}
                  type="button"
                  onClick={() => onReaction(review.id, 1)}
                  disabled={currentUser.id === review.user_id}
                  aria-label={`Нравится обзор на ${review.title}, ${review.likes || 0}`}
                  aria-pressed={ownReaction === 1}
                >
                  👍 {review.likes || 0}
                </button>
                <button
                  className={`reaction-btn dislike${ownReaction === -1 ? ' active' : ''}`}
                  type="button"
                  onClick={() => onReaction(review.id, -1)}
                  disabled={currentUser.id === review.user_id}
                  aria-label={`Не нравится обзор на ${review.title}, ${review.dislikes || 0}`}
                  aria-pressed={ownReaction === -1}
                >
                  👎 {review.dislikes || 0}
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </article>
  );
}
