import { useMemo, useState } from 'react';
import {
  createSigamePackReview,
  deleteSigamePackReview,
  updateSigamePackReview,
} from '../../api';
import { useApp } from '../../app/AppContext';
import { formatReviewDate } from '../reviews/reviewUtils';
import { readResponse } from '../../utils/readResponse';

const IMPRESSIONS = [
  { value: 1, label: 'Рекомендую' },
  { value: 0, label: 'Нормально' },
  { value: -1, label: 'Не рекомендую' },
];

function impressionLabel(value) {
  return IMPRESSIONS.find(item => item.value === Number(value))?.label || 'Без итога';
}

export default function SigamePackReviews({ pack }) {
  const { currentUser, isAdmin, isGuest, showToast } = useApp();
  const reviews = Array.isArray(pack.reviews) ? pack.reviews : [];
  const ownReview = useMemo(
    () => reviews.find(review => Number(review.user_id) === Number(currentUser?.id)) || null,
    [currentUser?.id, reviews]
  );
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState('');
  const [recommend, setRecommend] = useState(1);
  const [busy, setBusy] = useState(false);

  const startWriting = () => {
    setContent(ownReview?.content || '');
    setRecommend(Number(ownReview?.recommend ?? 1));
    setEditing(true);
    setExpanded(true);
  };

  const save = async event => {
    event.preventDefault();
    if (!content.trim() || busy) return;
    setBusy(true);
    try {
      const request = ownReview
        ? updateSigamePackReview(pack.id, ownReview.id, {
          content: content.trim(),
          recommend,
        })
        : createSigamePackReview(pack.id, {
          content: content.trim(),
          recommend,
        });
      await readResponse(await request);
      setEditing(false);
      showToast(ownReview ? 'Обзор обновлён' : 'Обзор опубликован', 'success');
    } catch (error) {
      showToast(error.message || 'Не удалось сохранить обзор', 'error');
    } finally {
      setBusy(false);
    }
  };

  const remove = async review => {
    if (busy) return;
    setBusy(true);
    try {
      await readResponse(await deleteSigamePackReview(pack.id, review.id));
      if (Number(review.id) === Number(ownReview?.id)) setEditing(false);
      showToast('Обзор удалён', 'info');
    } catch (error) {
      showToast(error.message || 'Не удалось удалить обзор', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="sigame-reviews">
      <div className="sigame-reviews-heading">
        <button
          type="button"
          className="sigame-reviews-toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded(value => !value)}
        >
          Обзоры <span>{reviews.length}</span>
        </button>
        {!isGuest && !ownReview && !editing && (
          <button type="button" className="button-ghost" onClick={startWriting}>
            Написать
          </button>
        )}
      </div>

      {expanded && (
        <div className="sigame-reviews-body">
          {reviews.length === 0 && !editing && (
            <p className="sigame-reviews-empty">На этот пак ещё нет обзоров.</p>
          )}
          {reviews.map(review => (
            <article className="sigame-review" key={review.id}>
              <header>
                <div>
                  <strong>{review.user_name}</strong>
                  <span>{formatReviewDate(review.created_at)}</span>
                </div>
                <span className={`review-badge impression-${review.recommend}`}>
                  {impressionLabel(review.recommend)}
                </span>
              </header>
              <p>{review.content}</p>
              {!isGuest && (
                <div className="sigame-review-actions">
                  {Number(review.user_id) === Number(currentUser?.id) && (
                    <button type="button" className="button-ghost" onClick={startWriting}>
                      Изменить
                    </button>
                  )}
                  {(Number(review.user_id) === Number(currentUser?.id) || isAdmin) && (
                    <button
                      type="button"
                      className="button-ghost danger"
                      onClick={() => remove(review)}
                      disabled={busy}
                    >
                      Удалить
                    </button>
                  )}
                </div>
              )}
            </article>
          ))}

          {editing && (
            <form className="sigame-review-form" onSubmit={save}>
              <label>
                <span>Ваш обзор</span>
                <textarea
                  value={content}
                  onChange={event => setContent(event.target.value)}
                  maxLength={5000}
                  rows={4}
                  autoFocus
                  required
                />
              </label>
              <label>
                <span>Итог</span>
                <select
                  value={recommend}
                  onChange={event => setRecommend(Number(event.target.value))}
                >
                  {IMPRESSIONS.map(item => (
                    <option key={item.value} value={item.value}>{item.label}</option>
                  ))}
                </select>
              </label>
              <div>
                <button className="button-primary" type="submit" disabled={busy || !content.trim()}>
                  {busy ? 'Сохраняем…' : ownReview ? 'Сохранить' : 'Опубликовать'}
                </button>
                <button className="button-ghost" type="button" onClick={() => setEditing(false)} disabled={busy}>
                  Отмена
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </section>
  );
}
