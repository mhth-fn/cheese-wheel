import { useState, useRef } from 'react';
import { useApp } from '../App';
import { postSpinDuration, uploadCenterImage, deleteCenterImage } from '../api';

export default function DrawerPanel({ movies, open, onClose, onAdd, onRemove }) {
  const { spinDuration, setSpinDuration, addEnabled, isGuest, currentUser, centerImage, setCenterImage, showToast } = useApp();
  const [input, setInput] = useState('');
  const [duration, setDuration] = useState(spinDuration);
  const fileRef = useRef(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const title = input.trim();
    if (!title) return;
    const ok = await onAdd(title);
    if (ok) setInput('');
  };

  const handleDurationChange = async (e) => {
    let val = parseInt(e.target.value);
    if (isNaN(val) || val < 5) val = 5;
    if (val > 15) val = 15;
    setDuration(val);
    setSpinDuration(val);
    await postSpinDuration(val);
  };

  return (
    <div className={`drawer ${open ? 'open' : ''}`}>
      <div className="drawer-header">
        <h3>🎬 Фильмы в колесе</h3>
        <button className="drawer-close" onClick={onClose}>✕</button>
      </div>
      {addEnabled && (
        <form className="drawer-add-form" onSubmit={handleSubmit}>
          <input
            type="text"
            className="drawer-add-input"
            placeholder="Название фильма..."
            maxLength={100}
            value={input}
            onChange={e => setInput(e.target.value)}
          />
          <button type="submit" className="drawer-add-btn">
            Добавить
          </button>
        </form>
      )}
      {!addEnabled && (
        <div className="drawer-disabled-msg">Добавление фильмов отключено</div>
      )}
      <div className="drawer-movie-list">
        {movies.length === 0 && (
          <div className="drawer-empty">Добавьте фильмы для колеса</div>
        )}
        {movies.map(movie => (
          <div key={movie.id} className="drawer-movie-item">
            <div className="drawer-movie-info">
              <span className="drawer-movie-title">{movie.title}</span>
              {movie.added_by_name && (
                <span className="drawer-movie-author">{movie.added_by_name}</span>
              )}
            </div>
            <button
              className="drawer-movie-remove"
              onClick={() => onRemove(movie.id)}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      {!isGuest && (
        <div className="drawer-footer">
          <div className="spin-duration">
            <label>⏱️ Время:</label>
            <input
              type="number"
              min={5}
              max={15}
              value={duration}
              onChange={handleDurationChange}
            />
            <span>сек</span>
          </div>
          <div className="drawer-center-section">
              <div className="drawer-center-label">Центр колеса</div>
              {centerImage && (
                <div className="drawer-center-preview">
                  <img src={centerImage} alt="Центр" className="drawer-center-img" />
                  <button className="drawer-center-delete" onClick={async () => {
                    try { await deleteCenterImage(); setCenterImage(null); showToast('Картинка удалена', 'info'); }
                    catch { showToast('Ошибка удаления', 'error'); }
                  }}>✕</button>
                </div>
              )}
              <label className="drawer-upload-btn">
                {centerImage ? 'Заменить' : 'Загрузить'}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      const res = await uploadCenterImage(file);
                      if (res.ok) { const data = await res.json(); setCenterImage(data.url); showToast('Картинка загружена', 'success'); }
                      else { const data = await res.json(); showToast(data.error || 'Ошибка', 'error'); }
                    } catch { showToast('Ошибка соединения', 'error'); }
                    if (fileRef.current) fileRef.current.value = '';
                  }}
                  hidden
                />
              </label>
            </div>
        </div>
      )}
    </div>
  );
}
