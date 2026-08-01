import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../app/AppContext';
import {
  deleteMusicReview,
  fetchMusicReviews,
  patchMusicReview,
  postMusicReview,
  postReviewReaction,
} from '../api';
import MusicReviewCard from '../features/reviews/MusicReviewCard';
import MusicReviewForm from '../features/reviews/MusicReviewForm';
import { EMPTY_MUSIC_REVIEW } from '../features/reviews/musicReviewOptions';

function fieldsFromReview(review) {
  return {
    artist: review.artist || '',
    content: review.content || '',
    musicType: review.music_type || 'track',
    recommend: review.recommend,
    sourceUrl: review.source_url || '',
    title: review.title || '',
  };
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  textarea.remove();
  if (!copied) throw new Error('Copy failed');
}

export default function MusicReviewsPage({ embedded = false }) {
  const { currentUser, isAdmin, isGuest, showToast, socket } = useApp();
  const [reviews, setReviews] = useState([]);
  const [fields, setFields] = useState({ ...EMPTY_MUSIC_REVIEW });
  const [editingId, setEditingId] = useState(null);
  const [editFields, setEditFields] = useState({ ...EMPTY_MUSIC_REVIEW });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadReviews = useCallback(async () => {
    setLoading(true);
    try {
      setReviews(await fetchMusicReviews());
    } catch {
      showToast('Не удалось загрузить музыкальные обзоры', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadReviews();
  }, [loadReviews]);

  useEffect(() => {
    if (!socket) return undefined;
    const onAdd = review => setReviews(previous => [
      review,
      ...previous.filter(item => item.id !== review.id),
    ]);
    const onUpdate = review => setReviews(previous => previous.map(
      item => item.id === review.id ? review : item
    ));
    const onDelete = ({ id }) => setReviews(previous => previous.filter(
      item => item.id !== id
    ));
    const onReaction = ({ dislikes, likes, reactions, review_id, review_type }) => {
      if (review_type !== 'music') return;
      setReviews(previous => previous.map(item => item.id === review_id
        ? { ...item, dislikes, likes, reactions }
        : item));
    };
    socket.on('music-review-added', onAdd);
    socket.on('music-review-updated', onUpdate);
    socket.on('music-review-deleted', onDelete);
    socket.on('review-reaction-updated', onReaction);
    return () => {
      socket.off('music-review-added', onAdd);
      socket.off('music-review-updated', onUpdate);
      socket.off('music-review-deleted', onDelete);
      socket.off('review-reaction-updated', onReaction);
    };
  }, [socket]);

  useEffect(() => {
    if (loading || !window.location.hash.startsWith('#music-review-')) return;
    const target = document.getElementById(window.location.hash.slice(1));
    target?.scrollIntoView({ block: 'center' });
  }, [loading, reviews.length]);

  const submitReview = async event => {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await postMusicReview(fields);
      const data = await response.json();
      if (!response.ok) {
        showToast(data.error || 'Не удалось сохранить обзор', 'error');
      } else {
        setFields({ ...EMPTY_MUSIC_REVIEW });
        showToast('Музыкальная находка опубликована', 'success');
      }
    } catch {
      showToast('Ошибка соединения', 'error');
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async id => {
    setSaving(true);
    try {
      const response = await patchMusicReview(id, editFields);
      const data = await response.json();
      if (!response.ok) {
        showToast(data.error || 'Не удалось сохранить изменения', 'error');
      } else {
        setEditingId(null);
        showToast('Обзор обновлён', 'success');
      }
    } catch {
      showToast('Ошибка соединения', 'error');
    } finally {
      setSaving(false);
    }
  };

  const deleteReview = async id => {
    try {
      const response = await deleteMusicReview(id);
      if (!response.ok) {
        const data = await response.json();
        showToast(data.error || 'Не удалось удалить обзор', 'error');
      }
    } catch {
      showToast('Ошибка соединения', 'error');
    }
  };

  const reactToReview = async (id, reaction) => {
    try {
      const response = await postReviewReaction('music', id, reaction);
      if (!response.ok) {
        const data = await response.json();
        showToast(data.error || 'Не удалось поставить реакцию', 'error');
      }
    } catch {
      showToast('Ошибка соединения', 'error');
    }
  };

  const shareReview = async review => {
    const url = new URL(`/reviews/music#music-review-${review.id}`, window.location.origin).href;
    const shareData = {
      title: `${review.title}${review.artist ? ` — ${review.artist}` : ''}`,
      text: `Музыкальная находка от ${review.user_name}`,
      url,
    };
    try {
      if (navigator.share) {
        try {
          await navigator.share(shareData);
          return;
        } catch (error) {
          if (error?.name === 'AbortError') return;
        }
      }
      await copyText(url);
      showToast('Ссылка на обзор скопирована', 'success');
    } catch {
      showToast('Не удалось поделиться ссылкой', 'error');
    }
  };

  return (
    <div className="reviews-page music-reviews-page">
      {!embedded && <h2 className="reviews-title">🎵 Музыкальные находки</h2>}

      {!isGuest && currentUser && (
        <MusicReviewForm
          fields={fields}
          onChange={setFields}
          onSubmit={submitReview}
          submitting={saving}
        />
      )}

      {isGuest && (
        <div className="review-readonly-note">
          В гостевом режиме находки можно читать и пересылать друзьям. Чтобы написать обзор, войдите как участник.
        </div>
      )}

      {loading && (
        <div className="reviews-loading" aria-label="Загружаем музыкальные обзоры">
          <span className="skeleton" aria-hidden="true" />
          <span className="skeleton" aria-hidden="true" />
        </div>
      )}

      {!loading && reviews.length === 0 && (
        <div className="reviews-empty music-reviews-empty">
          <span aria-hidden="true">🎶</span>
          <strong>Музыкальных находок пока нет</strong>
          <p>Принесите сюда трек или альбом, который не хочется оставлять только себе.</p>
        </div>
      )}

      <div className="reviews-list">
        {reviews.map(review => (
          <MusicReviewCard
            key={review.id}
            currentUser={currentUser}
            editFields={editFields}
            editing={editingId === review.id}
            isAdmin={isAdmin}
            isGuest={isGuest}
            onCancelEdit={() => setEditingId(null)}
            onDelete={deleteReview}
            onEditChange={setEditFields}
            onEditSave={saveEdit}
            onReaction={reactToReview}
            onShare={shareReview}
            onStartEdit={item => {
              setEditingId(item.id);
              setEditFields(fieldsFromReview(item));
            }}
            review={review}
            saving={saving && editingId === review.id}
          />
        ))}
      </div>
    </div>
  );
}
