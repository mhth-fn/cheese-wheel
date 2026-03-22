import { useState, useEffect } from 'react';
import { useApp } from '../App';

export default function ReviewsPage({ title, icon, fetchReviews, postReview, deleteReview, addEvent, deleteEvent }) {
  const { currentUser, isGuest, showToast, socket } = useApp();
  const [reviews, setReviews] = useState([]);
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [recommend, setRecommend] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchReviews().then(setReviews).catch(() => {});
  }, [fetchReviews]);

  useEffect(() => {
    if (!socket) return;
    const onAdd = (review) => setReviews(prev => [review, ...prev.filter(r => r.id !== review.id)]);
    const onDelete = ({ id }) => setReviews(prev => prev.filter(r => r.id !== id));
    socket.on(addEvent, onAdd);
    socket.on(deleteEvent, onDelete);
    return () => {
      socket.off(addEvent, onAdd);
      socket.off(deleteEvent, onDelete);
    };
  }, [socket, addEvent, deleteEvent]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formTitle.trim() || !formContent.trim()) return;
    setSubmitting(true);
    try {
      const res = await postReview(currentUser.id, formTitle.trim(), formContent.trim(), recommend);
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'Ошибка', 'error');
      } else {
        setFormTitle('');
        setFormContent('');
        setRecommend(true);
        showToast('Обзор добавлен', 'success');
      }
    } catch {
      showToast('Ошибка соединения', 'error');
    }
    setSubmitting(false);
  };

  const handleDelete = async (id) => {
    try {
      const res = await deleteReview(id, currentUser.id);
      if (!res.ok) {
        const data = await res.json();
        showToast(data.error || 'Ошибка', 'error');
      }
    } catch {
      showToast('Ошибка соединения', 'error');
    }
  };

  const formatDate = (dt) => {
    if (!dt) return '';
    const d = new Date(dt.includes('Z') || dt.includes('+') ? dt : dt + 'Z');
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  return (
    <div className="reviews-page">
      <h2 className="reviews-title">{icon} {title}</h2>

      {!isGuest && currentUser && (
        <form className="review-form" onSubmit={handleSubmit}>
          <input
            className="review-form-input"
            type="text"
            placeholder="Название"
            value={formTitle}
            onChange={e => setFormTitle(e.target.value)}
            maxLength={200}
          />
          <textarea
            className="review-form-textarea"
            placeholder="Ваш обзор..."
            value={formContent}
            onChange={e => setFormContent(e.target.value)}
            maxLength={5000}
            rows={4}
          />
          <div className="review-form-footer">
            <button
              type="button"
              className={`review-recommend-toggle ${recommend ? 'yes' : 'no'}`}
              onClick={() => setRecommend(prev => !prev)}
            >
              {recommend ? '✅ Рекомендую' : '❌ Не рекомендую'}
            </button>
            <button
              type="submit"
              className="review-submit-btn"
              disabled={submitting || !formTitle.trim() || !formContent.trim()}
            >
              Опубликовать
            </button>
          </div>
        </form>
      )}

      {reviews.length === 0 && (
        <p className="reviews-empty">Обзоров пока нет. Будьте первым!</p>
      )}

      <div className="reviews-list">
        {reviews.map(r => (
          <div key={r.id} className="review-card">
            <div className="review-card-header">
              <span className="review-card-title">{r.title}</span>
              <span className={`review-badge ${r.recommend ? 'yes' : 'no'}`}>
                {r.recommend ? '✅ Рекомендую' : '❌ Не рекомендую'}
              </span>
              {!isGuest && currentUser?.id === r.user_id && (
                <button className="review-delete-btn" onClick={() => handleDelete(r.id)} title="Удалить">🗑️</button>
              )}
            </div>
            <div className="review-card-meta">
              <span className="review-author">{r.user_name}</span>
              <span className="review-date">{formatDate(r.created_at)}</span>
            </div>
            <p className="review-content">{r.content}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
