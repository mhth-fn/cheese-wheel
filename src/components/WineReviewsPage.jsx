import { useState, useEffect } from 'react';
import { useApp } from '../App';
import { fetchWineReviews, postWineReview, patchWineReview, deleteWineReview, postReviewReaction } from '../api';

const WINE_TYPES = [
  { value: 'red',   label: '🔴 Красное' },
  { value: 'white', label: '🟡 Белое' },
  { value: 'rose',  label: '🌸 Розовое' },
];

const WINE_TYPE_LABELS = { red: '🔴 Красное', white: '🟡 Белое', rose: '🌸 Розовое' };

const RECOMMEND_OPTIONS = [
  { value: 1,  label: '✅ Рекомендую',     cls: 'yes' },
  { value: 0,  label: '😐 Сойдёт',         cls: 'meh' },
  { value: -1, label: '❌ Не рекомендую',  cls: 'no'  },
];

function getRecommendInfo(val) {
  if (val === 1)  return { cls: 'yes', label: '✅ Рекомендую' };
  if (val === -1) return { cls: 'no',  label: '❌ Не рекомендую' };
  return { cls: 'meh', label: '😐 Сойдёт' };
}

export default function WineReviewsPage() {
  const { currentUser, isGuest, showToast, socket } = useApp();
  const [reviews, setReviews] = useState([]);
  const [formTitle, setFormTitle]   = useState('');
  const [formContent, setFormContent] = useState('');
  const [recommend, setRecommend]   = useState(1);
  const [wineType, setWineType]     = useState('');
  const [grape, setGrape]           = useState('');
  const [region, setRegion]         = useState('');
  const [vintage, setVintage]       = useState('');
  const [price, setPrice]           = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [editingId, setEditingId]   = useState(null);
  const [editFields, setEditFields] = useState({});

  useEffect(() => {
    fetchWineReviews().then(setReviews).catch(() => {});
  }, []);

  useEffect(() => {
    if (!socket) return;
    const onAdd    = (r) => setReviews(prev => [r, ...prev.filter(x => x.id !== r.id)]);
    const onDelete = ({ id }) => setReviews(prev => prev.filter(r => r.id !== id));
    const onUpdate = (r) => setReviews(prev => prev.map(x => x.id === r.id ? r : x));
    const onReaction = ({ review_type, review_id, likes, dislikes, reactions }) => {
      if (review_type !== 'wine') return;
      setReviews(prev => prev.map(r => r.id === review_id ? { ...r, likes, dislikes, reactions } : r));
    };
    socket.on('wine-review-added', onAdd);
    socket.on('wine-review-deleted', onDelete);
    socket.on('wine-review-updated', onUpdate);
    socket.on('review-reaction-updated', onReaction);
    return () => {
      socket.off('wine-review-added', onAdd);
      socket.off('wine-review-deleted', onDelete);
      socket.off('wine-review-updated', onUpdate);
    };
  }, [socket]);

  const startEdit = (r) => {
    setEditingId(r.id);
    setEditFields({
      title: r.title, content: r.content, recommend: r.recommend,
      wineType: r.wine_type || '', grape: r.grape || '',
      region: r.region || '', vintage: r.vintage || '', price: r.price || '',
    });
  };

  const handleEditSave = async (id) => {
    const f = editFields;
    if (!f.title.trim() || !f.content.trim()) return;
    try {
      const res = await patchWineReview(
        id, f.title.trim(), f.content.trim(), f.recommend,
        f.wineType || null, f.grape.trim() || null, f.region.trim() || null,
        f.vintage ? parseInt(f.vintage, 10) : null, f.price.trim() || null
      );
      const data = await res.json();
      if (!res.ok) { showToast(data.error || 'Ошибка', 'error'); return; }
      setEditingId(null);
    } catch {
      showToast('Ошибка соединения', 'error');
    }
  };

  const ef = (field) => (e) => setEditFields(prev => ({ ...prev, [field]: e.target.value }));

  const resetForm = () => {
    setFormTitle(''); setFormContent(''); setRecommend(1);
    setWineType(''); setGrape(''); setRegion(''); setVintage(''); setPrice('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formTitle.trim() || !formContent.trim()) return;
    setSubmitting(true);
    try {
      const res = await postWineReview(
        formTitle.trim(), formContent.trim(), recommend,
        wineType || null, grape.trim() || null, region.trim() || null,
        vintage ? parseInt(vintage, 10) : null, price.trim() || null
      );
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'Ошибка', 'error');
      } else {
        resetForm();
        showToast('Обзор добавлен', 'success');
      }
    } catch {
      showToast('Ошибка соединения', 'error');
    }
    setSubmitting(false);
  };

  const handleReaction = async (id, reaction) => {
    try {
      await postReviewReaction('wine', id, reaction);
    } catch {
      showToast('Ошибка соединения', 'error');
    }
  };

  const handleDelete = async (id) => {
    try {
      const res = await deleteWineReview(id);
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
      <h2 className="reviews-title">🍷 Обзоры на вино</h2>

      {!isGuest && currentUser && (
        <form className="review-form" onSubmit={handleSubmit}>
          <input
            className="review-form-input"
            type="text"
            placeholder="Название вина *"
            value={formTitle}
            onChange={e => setFormTitle(e.target.value)}
            maxLength={200}
          />

          <div className="wine-meta-row">
            <div className="wine-type-toggle">
              {WINE_TYPES.map(t => (
                <button
                  key={t.value}
                  type="button"
                  className={`wine-type-btn ${wineType === t.value ? 'active' : ''}`}
                  onClick={() => setWineType(prev => prev === t.value ? '' : t.value)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="wine-fields-row">
            <input
              className="review-form-input wine-field"
              type="text"
              placeholder="Сорт винограда"
              value={grape}
              onChange={e => setGrape(e.target.value)}
              maxLength={100}
            />
            <input
              className="review-form-input wine-field"
              type="text"
              placeholder="Страна / регион"
              value={region}
              onChange={e => setRegion(e.target.value)}
              maxLength={100}
            />
            <input
              className="review-form-input wine-field wine-field-short"
              type="number"
              placeholder="Год урожая"
              value={vintage}
              onChange={e => setVintage(e.target.value)}
              min={1900}
              max={2100}
            />
            <input
              className="review-form-input wine-field wine-field-short"
              type="text"
              placeholder="Цена"
              value={price}
              onChange={e => setPrice(e.target.value)}
              maxLength={50}
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
                <input className="review-form-input" value={editFields.title} onChange={ef('title')} maxLength={200} placeholder="Название" />
                <div className="wine-meta-row">
                  <div className="wine-type-toggle">
                    {WINE_TYPES.map(t => (
                      <button key={t.value} type="button"
                        className={`wine-type-btn ${editFields.wineType === t.value ? 'active' : ''}`}
                        onClick={() => setEditFields(prev => ({ ...prev, wineType: prev.wineType === t.value ? '' : t.value }))}
                      >{t.label}</button>
                    ))}
                  </div>
                </div>
                <div className="wine-fields-row">
                  <input className="review-form-input wine-field" value={editFields.grape} onChange={ef('grape')} maxLength={100} placeholder="Сорт винограда" />
                  <input className="review-form-input wine-field" value={editFields.region} onChange={ef('region')} maxLength={100} placeholder="Страна / регион" />
                  <input className="review-form-input wine-field wine-field-short" type="number" value={editFields.vintage} onChange={ef('vintage')} min={1900} max={2100} placeholder="Год урожая" />
                  <input className="review-form-input wine-field wine-field-short" value={editFields.price} onChange={ef('price')} maxLength={50} placeholder="Цена" />
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
                  {r.wine_type && <span className="wine-type-badge">{WINE_TYPE_LABELS[r.wine_type]}</span>}
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
                {(r.grape || r.region || r.vintage || r.price) && (
                  <div className="wine-card-details">
                    {r.grape   && <span>🍇 {r.grape}</span>}
                    {r.region  && <span>🌍 {r.region}</span>}
                    {r.vintage && <span>📅 {r.vintage}</span>}
                    {r.price   && <span>💰 {r.price}</span>}
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
