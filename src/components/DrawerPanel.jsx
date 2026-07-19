import { useRef, useState } from 'react';
import { useApp } from '../App';
import { postSpinDuration, uploadCenterImage, deleteCenterImage } from '../api';

export default function DrawerPanel({ movies, nextMovies, open, onClose, onAdd, onRemove, onAddNext, onRemoveNext }) {
  const { spinDuration, setSpinDuration, addEnabled, isGuest, centerImage, setCenterImage, showToast } = useApp();
  const [curInput, setCurInput]   = useState('');
  const [nextInput, setNextInput] = useState('');
  const [activeTab, setActiveTab] = useState('current');
  const [hoveredId, setHoveredId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const fileRef = useRef(null);

  const isCurrentTab = activeTab === 'current';
  const movieList  = isCurrentTab ? movies : (nextMovies || []);
  const inputVal   = isCurrentTab ? curInput : nextInput;
  const setInput   = isCurrentTab ? setCurInput : setNextInput;
  const onAddFn    = isCurrentTab ? onAdd : onAddNext;
  const onRemoveFn = isCurrentTab ? onRemove : onRemoveNext;

  const handleAdd = async () => {
    if (!inputVal.trim()) return;
    const ok = await onAddFn(inputVal.trim());
    if (ok) setInput('');
  };

  const handleDelete = (id) => {
    setDeletingId(id);
    setTimeout(() => { onRemoveFn(id); setDeletingId(null); }, 300);
  };

  const changeDuration = async (delta) => {
    const val = Math.max(5, Math.min(60, spinDuration + delta));
    setSpinDuration(val);
    await postSpinDuration(val);
  };

  const tabs = [
    { key: 'current',  label: '🎡 Текущее',   count: movies.length },
    { key: 'next',     label: '⏭ Следующее',  count: (nextMovies || []).length },
    { key: 'settings', label: '⚙️ Настройки', count: null },
  ];

  return (
    <>
      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .wheel-modal-overlay {
          position: fixed; inset: 0; z-index: 1000;
          display: flex; align-items: center; justify-content: center; padding: 20px;
          background: rgba(92, 72, 19, 0.5);
          backdrop-filter: blur(4px);
          opacity: 0; pointer-events: none;
          transition: opacity 0.25s ease;
        }
        .wheel-modal-overlay.open { opacity: 1; pointer-events: auto; }
        .wheel-modal-card {
          width: 100%; max-width: 420px; max-height: 90vh; overflow-y: auto;
          border-radius: 24px;
          background: var(--cheese-cream);
          box-shadow: 0 16px 48px rgba(92, 72, 19, 0.35);
          border: 3px solid var(--cheese-dark);
        }
        .wm-header {
          background: var(--theme-btn);
          padding: 18px 20px 14px;
          display: flex; align-items: center; justify-content: space-between;
        }
        .wm-header-title {
          display: flex; align-items: center; gap: 10px;
          font-size: 18px; font-weight: 700; color: #fff;
          text-shadow: 0 1px 3px rgba(0,0,0,0.2);
        }
        .wm-close {
          width: 34px; height: 34px; border-radius: 10px; border: none;
          background: rgba(255,255,255,0.2); color: #fff; font-size: 16px; font-weight: 700;
          cursor: pointer; display: flex; align-items: center; justify-content: center;
          transition: background 0.2s;
        }
        .wm-close:hover { background: rgba(255,255,255,0.35); }
        .wm-tabs {
          display: flex; gap: 8px; padding: 14px 16px 10px;
          background: rgba(244, 196, 48, 0.2);
          border-bottom: 2px solid var(--cheese-dark);
        }
        .wm-tab {
          flex: 1; padding: 10px 6px; border: none; border-radius: 14px;
          font-size: 13px; font-weight: 700; font-family: 'Comfortaa', sans-serif;
          cursor: pointer; transition: all 0.2s;
        }
        .wm-tab.inactive {
          background: rgba(255,255,255,0.7); color: var(--text-light);
          box-shadow: 0 1px 3px rgba(0,0,0,0.06);
        }
        .wm-tab.inactive:hover { background: rgba(255,255,255,0.95); }
        .wm-tab.active {
          background: var(--theme-btn); color: #fff;
          box-shadow: 0 3px 10px var(--shadow);
          text-shadow: 0 1px 2px rgba(0,0,0,0.15);
        }
        .wm-tab-count {
          display: inline-block; margin-left: 5px;
          font-size: 11px; font-weight: 700;
          border-radius: 6px; padding: 1px 6px;
        }
        .wm-tab.active .wm-tab-count { background: rgba(255,255,255,0.25); }
        .wm-tab.inactive .wm-tab-count { background: rgba(212,160,23,0.2); }
        .wm-add-row {
          display: flex; gap: 8px; padding: 14px 16px 8px;
        }
        .wm-input {
          flex: 1; padding: 12px 14px;
          border: 2px solid var(--cheese-dark); border-radius: 14px;
          font-size: 14px; font-family: 'Comfortaa', sans-serif; font-weight: 600;
          background: #fff; color: var(--text); outline: none;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .wm-input:focus {
          border-color: var(--crust);
          box-shadow: 0 0 0 3px rgba(196, 132, 45, 0.15);
        }
        .wm-add-btn {
          padding: 12px 20px; border-radius: 14px; border: 2px solid var(--theme-btn-border);
          background: var(--theme-btn); color: #fff;
          font-size: 14px; font-weight: 700; font-family: 'Comfortaa', sans-serif;
          cursor: pointer; white-space: nowrap;
          box-shadow: 0 3px 10px var(--shadow);
          text-shadow: 0 1px 2px rgba(0,0,0,0.15);
          transition: all 0.2s;
        }
        .wm-add-btn:hover { background: var(--theme-btn-hover); transform: translateY(-1px); }
        .wm-add-btn:active { background: var(--theme-btn-active); transform: translateY(0); }
        .wm-hint {
          padding: 0 16px 6px; font-size: 11px; color: var(--text-light); font-style: italic;
        }
        .wm-list { padding: 4px 12px 16px; }
        .wm-empty {
          text-align: center; padding: 36px 20px;
          color: var(--text-light); font-size: 14px; font-weight: 600;
        }
        .wm-item {
          display: flex; align-items: center;
          padding: 12px 14px; margin-bottom: 4px; border-radius: 14px;
          border: 1.5px solid rgba(212,160,23,0.3);
          background: rgba(255,255,255,0.5);
          transition: all 0.25s; animation: fadeSlideIn 0.3s ease-out;
        }
        .wm-item:hover { background: rgba(244,196,48,0.12); border-color: var(--cheese-dark); }
        .wm-item-title { font-size: 15px; font-weight: 700; color: var(--text); }
        .wm-item-author { font-size: 12px; font-weight: 500; color: var(--text-light); margin-top: 2px; }
        .wm-item-del {
          width: 28px; height: 28px; border-radius: 8px; border: none; background: none;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; color: var(--text-light); font-size: 14px;
          flex-shrink: 0; transition: all 0.2s; opacity: 0.4;
        }
        .wm-item:hover .wm-item-del { opacity: 1; color: #c0392b; }
        .wm-settings { padding: 16px; }
        .wm-settings-block {
          background: rgba(255,255,255,0.6); border-radius: 16px;
          padding: 16px 18px; margin-bottom: 12px;
          border: 1.5px solid rgba(212,160,23,0.3);
        }
        .wm-settings-label {
          font-size: 12px; font-weight: 700; color: var(--text-light);
          margin-bottom: 12px; letter-spacing: 0.5px; text-transform: uppercase;
        }
        .wm-step-row { display: flex; align-items: center; justify-content: center; gap: 16px; }
        .wm-step-btn {
          width: 38px; height: 38px; border-radius: 12px;
          border: 2px solid var(--cheese-dark); background: #fff;
          color: var(--text); font-size: 20px; font-weight: 700;
          cursor: pointer; display: flex; align-items: center; justify-content: center;
          transition: all 0.15s;
        }
        .wm-step-btn:hover { border-color: var(--crust); background: var(--cheese-cream); }
        .wm-step-val { min-width: 80px; text-align: center; }
        .wm-step-val span:first-child { font-size: 32px; font-weight: 700; color: var(--text); }
        .wm-step-val span:last-child { font-size: 14px; font-weight: 600; color: var(--text-light); margin-left: 4px; }
        .wm-center-row { display: flex; align-items: center; gap: 14px; }
        .wm-center-preview {
          width: 60px; height: 60px; border-radius: 50%; flex-shrink: 0; overflow: hidden;
          border: 3px solid var(--crust); background: var(--cheese-light);
          display: flex; align-items: center; justify-content: center;
          font-size: 28px; box-shadow: 0 2px 8px var(--shadow);
        }
        .wm-center-preview img { width: 100%; height: 100%; object-fit: cover; }
        .wm-upload-btn {
          padding: 10px 22px; border-radius: 14px; border: 2px solid var(--theme-btn-border);
          background: var(--theme-btn); color: #fff;
          font-size: 13px; font-weight: 700; font-family: 'Comfortaa', sans-serif;
          cursor: pointer; display: inline-block;
          text-shadow: 0 1px 2px rgba(0,0,0,0.15);
          transition: all 0.2s;
        }
        .wm-upload-btn:hover { background: var(--theme-btn-hover); }
        .wm-del-img-btn {
          padding: 6px 14px; border-radius: 10px;
          border: 1.5px solid var(--cheese-dark); background: #fff;
          color: #c0392b; font-size: 12px; font-weight: 700;
          font-family: 'Comfortaa', sans-serif; cursor: pointer;
          transition: all 0.2s; margin-top: 6px; display: block;
        }
        .wm-del-img-btn:hover { background: #fff0f0; border-color: #c0392b; }
      `}</style>

      <div className={`wheel-modal-overlay ${open ? 'open' : ''}`} onClick={onClose}>
        <div className="wheel-modal-card" onClick={e => e.stopPropagation()}>

          {/* Header */}
          <div className="wm-header">
            <div className="wm-header-title">
              <span>🎬</span> Фильмы в колесе
            </div>
            <button className="wm-close" onClick={onClose}>✕</button>
          </div>

          {/* Tabs */}
          <div className="wm-tabs">
            {tabs.map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                className={`wm-tab ${activeTab === tab.key ? 'active' : 'inactive'}`}>
                {tab.label}
                {tab.count !== null && <span className="wm-tab-count">{tab.count}</span>}
              </button>
            ))}
          </div>

          {/* Movie list */}
          {activeTab !== 'settings' && (
            <>
              {addEnabled && (
                <div className="wm-add-row">
                  <input className="wm-input" type="text" placeholder="Название фильма..."
                    value={inputVal} maxLength={100}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAdd()}
                  />
                  <button className="wm-add-btn" onClick={handleAdd}>Добавить</button>
                </div>
              )}
              {activeTab === 'next' && (
                <div className="wm-hint">Загрузится, когда закончится текущее колесо</div>
              )}
              <div className="wm-list">
                {movieList.length === 0 ? (
                  <div className="wm-empty">
                    <div style={{ fontSize: 36, marginBottom: 8 }}>🧀</div>
                    Пока пусто. Добавьте фильм!
                  </div>
                ) : movieList.map(movie => (
                  <div key={movie.id} className="wm-item" style={{
                    opacity: deletingId === movie.id ? 0 : 1,
                    transform: deletingId === movie.id ? 'translateX(-20px) scale(0.95)' : 'none',
                  }}>
                    <div style={{ flex: 1 }}>
                      <div className="wm-item-title">{movie.title}</div>
                      {movie.added_by_name && <div className="wm-item-author">{movie.added_by_name}</div>}
                    </div>
                    <button className="wm-item-del" onClick={() => handleDelete(movie.id)}>✕</button>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Settings */}
          {activeTab === 'settings' && !isGuest && (
            <div className="wm-settings">
              <div className="wm-settings-block">
                <div className="wm-settings-label">⏱ Время вращения</div>
                <div className="wm-step-row">
                  <button className="wm-step-btn" onClick={() => changeDuration(-1)}>−</button>
                  <div className="wm-step-val">
                    <span>{spinDuration}</span><span>сек</span>
                  </div>
                  <button className="wm-step-btn" onClick={() => changeDuration(+1)}>+</button>
                </div>
              </div>
              <div className="wm-settings-block" style={{ marginBottom: 0 }}>
                <div className="wm-settings-label">🧀 Центр колеса</div>
                <div className="wm-center-row">
                  <div className="wm-center-preview">
                    {centerImage
                      ? <img src={centerImage} alt="Центр" />
                      : '👤'}
                  </div>
                  <div>
                    <label className="wm-upload-btn">
                      {centerImage ? 'Заменить' : 'Загрузить'}
                      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          try {
                            const res = await uploadCenterImage(file);
                            if (res.ok) { const d = await res.json(); setCenterImage(d.url); showToast('Картинка загружена', 'success'); }
                            else { const d = await res.json(); showToast(d.error || 'Ошибка', 'error'); }
                          } catch { showToast('Ошибка соединения', 'error'); }
                          if (fileRef.current) fileRef.current.value = '';
                        }}
                      />
                    </label>
                    {centerImage && (
                      <button className="wm-del-img-btn" onClick={async () => {
                        try { await deleteCenterImage(); setCenterImage(null); showToast('Картинка удалена', 'info'); }
                        catch { showToast('Ошибка удаления', 'error'); }
                      }}>Удалить</button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  );
}
