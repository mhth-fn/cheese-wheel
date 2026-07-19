import { useState, useEffect } from 'react';
import { useApp } from '../App';
import { fetchMovieReviews, postMovieReview, patchMovieReview, deleteMovieReview, postReviewReaction } from '../api';

const RECOMMEND_OPTIONS = [
  { value: 1,  label: '✅ Рекомендую',    cls: 'yes' },
  { value: 0,  label: '😐 Сойдёт',        cls: 'meh' },
  { value: -1, label: '❌ Не рекомендую', cls: 'no'  },
];

function getRecommendInfo(val) {
  if (val === 1)  return { cls: 'yes', label: '✅ Рекомендую' };
  if (val === -1) return { cls: 'no',  label: '❌ Не рекомендую' };
  return { cls: 'meh', label: '😐 Сойдёт' };
}

export default function MovieReviewsPage() {
  const { currentUser, isGuest, showToast, socket } = useApp();
  const [reviews, setReviews] = useState([]);
  const [formTitle, setFormTitle]     = useState('');
  const [formContent, setFormContent] = useState('');
  const [recommend, setRecommend]     = useState(1);
  const [director, setDirector]       = useState('');
  const [year, setYear]               = useState('');
  const [submitting, setSubmitting]   = useState(false);
  const [editingId, setEditingId]     = useState(null);
  const [editFields, setEditFields]   = useState({});

  useEffect(() => {
    fetchMovieReviews().then(setReviews).catch(() => {});
  }, []);

  useEffect(() => {
    if (!socket) return;
    const onAdd    = (r) => setReviews(prev => [r, ...prev.filter(x => x.id !== r.id)]);
    const onDelete = ({ id }) => setReviews(prev => prev.filter(r => r.id !== id));
    const onUpdate = (r) => setReviews(prev => prev.map(x => x.id === r.id ? r : x));
    const onReaction = ({ review_type, review_id, likes, dislikes, reactions }) => {
      if (review_type !== 'movie') return;
      setReviews(prev => prev.map(r => r.id === review_id ? { ...r, likes, dislikes, reactions } : r));
    };
    socket.on('movie-review-added', onAdd);
    socket.on('movie-review-deleted', onDelete);
    socket.on('movie-review-updated', onUpdate);
    socket.on('review-reaction-updated', onReaction);
    return () => {
      socket.off('movie-review-added', onAdd);
      socket.off('movie-review-deleted', onDelete);
      socket.off('movie-review-updated', onUpdate);
      socket.off('review-reaction-updated', onReaction);
    };
  }, [socket]);

  const startEdit = (r) => {
    setEditingId(r.id);
    setEditFields({ title: r.title, content: r.content, recommend: r.recommend, director: r.director || '', year: r.year || '' });
  };

  const handleEditSave = async (id) => {
    const f = editFields;
    if (!f.title.trim() || !f.content.trim()) return;
    try {
      const res = await patchMovieReview(
        id, currentUser.id, f.title.trim(), f.content.trim(), f.recommend,
        f.director.trim() || null, f.year ? parseInt(f.year, 10) : null
      );
      const data = await res.json();
      if (!res.ok) { showToast(data.error || 'Ошибка', 'error'); return; }
      setEditingId(null);
    } catch {
      showToast('Ошибка соединения', 'error');
    }
  };

  const ef = (field) => (e) => setEditFields(prev => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formTitle.trim() || !formContent.trim()) return;
    setSubmitting(true);
    try {
      const res = await postMovieReview(
        currentUser.id, formTitle.trim(), formContent.trim(), recommend,
        director.trim() || null, year ? parseInt(year, 10) : null
      );
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'Ошибка', 'error');
      } else {
        setFormTitle(''); setFormContent(''); setRecommend(1);
        setDirector(''); setYear('');
        showToast('Обзор добавлен', 'success');
      }
    } catch {
      showToast('Ошибка соединения', 'error');
    }
    setSubmitting(false);
  };

  const handleReaction = async (id, reaction) => {
    try {
      await postReviewReaction('movie', id, reaction);
    } catch {
      showToast('Ошибка соединения', 'error');
    }
  };

  const handleDelete = async (id) => {
    try {
      const res = await deleteMovieReview(id, currentUser.id);
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
      <h2 className="reviews-title">🎬 Обзоры на кино</h2>

      {!isGuest && currentUser && (
        <form className="review-form" onSubmit={handleSubmit}>
          <input
            className="review-form-input"
            type="text"
            placeholder="Название фильма *"
            value={formTitle}
            onChange={e => setFormTitle(e.target.value)}
            maxLength={200}
          />
          <div className="wine-fields-row">
            <input
              className="review-form-input wine-field"
              type="text"
              placeholder="Режиссёр"
              value={director}
              onChange={e => setDirector(e.target.value)}
              maxLength={100}
            />
            <input
              className="review-form-input wine-field wine-field-short"
              type="number"
              placeholder="Год"
              value={year}
              onChange={e => setYear(e.target.value)}
              min={1888}
              max={2100}
            />
          </div>
          <textarea
            className="review-form-textarea"
            placeholder="Ваш обзор... *"
            value={formContent}
            onChange={e => setFormContent(e.target.value)}
            maxLength={5000}
            rows={4}
          />
          <div className="review-form-footer">
            <div className="recommend-toggle-group">
              {RECOMMEND_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  className={`review-recommend-toggle ${opt.cls}${recommend === opt.value ? ' active' : ''}`}
                  onClick={() => setRecommend(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
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
            {editingId === r.id ? (
              <div className="review-edit-form">
                <input className="review-form-input" value={editFields.title} onChange={ef('title')} maxLength={200} placeholder="Название фильма" />
                <div className="wine-fields-row">
                  <input className="review-form-input wine-field" value={editFields.director} onChange={ef('director')} maxLength={100} placeholder="Режиссёр" />
                  <input className="review-form-input wine-field wine-field-short" type="number" value={editFields.year} onChange={ef('year')} min={1888} max={2100} placeholder="Год" />
                </div>
                <textarea className="review-form-textarea" value={editFields.content} onChange={ef('content')} maxLength={5000} rows={4} />
                <div className="review-form-footer">
                  <div className="recommend-toggle-group">
                    {RECOMMEND_OPTIONS.map(opt => (
                      <button key={opt.value} type="button"
                        className={`review-recommend-toggle ${opt.cls}${editFields.recommend === opt.value ? ' active' : ''}`}
                        onClick={() => setEditFields(prev => ({ ...prev, recommend: opt.value }))}
                      >{opt.label}</button>
                    ))}
                  </div>
                  <button type="button" className="review-edit-cancel" onClick={() => setEditingId(null)}>Отмена</button>
                  <button type="button" className="review-submit-btn" onClick={() => handleEditSave(r.id)}>Сохранить</button>
                </div>
              </div>
            ) : (
              <>
                <div className="review-card-header">
                  <span className="review-card-title">{r.title}</span>
                  <span className={`review-badge ${getRecommendInfo(r.recommend).cls}`}>
                    {getRecommendInfo(r.recommend).label}
                  </span>
                  {!isGuest && currentUser?.id === r.user_id && (
                    <>
                      <button className="review-edit-btn" onClick={() => startEdit(r)} title="Редактировать">✏️</button>
                      <button className="review-delete-btn" onClick={() => handleDelete(r.id)} title="Удалить">🗑️</button>
                    </>
                  )}
                </div>
                {(r.director || r.year) && (
                  <div className="wine-card-details">
                    {r.director && <span>🎥 {r.director}</span>}
                    {r.year     && <span>📅 {r.year}</span>}
                  </div>
                )}
                <div className="review-card-meta">
                  <span className="review-author">{r.user_name}</span>
                  <span className="review-date">{formatDate(r.created_at)}</span>
                </div>
                <p className="review-content">{r.content}</p>
                {!isGuest && currentUser && (
                  <div className="review-reactions">
                    <button
                      className={`reaction-btn like ${(r.reactions || []).find(x => x.user_id === currentUser.id)?.reaction === 1 ? 'active' : ''}`}
                      onClick={() => handleReaction(r.id, 1)}
                      title="Нравится"
                      disabled={currentUser.id === r.user_id}
                    >👍 {r.likes || 0}</button>
                    <button
                      className={`reaction-btn dislike ${(r.reactions || []).find(x => x.user_id === currentUser.id)?.reaction === -1 ? 'active' : ''}`}
                      onClick={() => handleReaction(r.id, -1)}
                      title="Не нравится"
                      disabled={currentUser.id === r.user_id}
                    >👎 {r.dislikes || 0}</button>
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
