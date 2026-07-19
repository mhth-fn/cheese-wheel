import { useCallback, useRef, useState } from 'react';
import { useApp } from '../App';
import { postSpinDuration, uploadCenterImage, deleteCenterImage } from '../api';
import { useDialogA11y } from '../hooks/useDialogA11y';

const TABS = [
  { key: 'current', icon: '🎡', label: 'Текущие' },
  { key: 'next', icon: '⏭', label: 'Следующие' },
  { key: 'settings', icon: '⚙️', label: 'Настройки' },
];

export default function DrawerPanel({
  movies,
  nextMovies,
  open,
  onClose,
  onAdd,
  onRemove,
  onAddNext,
  onRemoveNext,
}) {
  const {
    spinDuration,
    setSpinDuration,
    addEnabled,
    centerImage,
    setCenterImage,
    showToast,
    wheelIsSpinning,
  } = useApp();
  const [currentInput, setCurrentInput] = useState('');
  const [nextInput, setNextInput] = useState('');
  const [activeTab, setActiveTab] = useState('current');
  const [deletingId, setDeletingId] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [confirmImageDelete, setConfirmImageDelete] = useState(false);
  const fileRef = useRef(null);
  const dialogRef = useDialogA11y(open, onClose);

  const isCurrentTab = activeTab === 'current';
  const movieList = isCurrentTab ? movies : nextMovies;
  const input = isCurrentTab ? currentInput : nextInput;
  const setInput = isCurrentTab ? setCurrentInput : setNextInput;
  const addMovie = isCurrentTab ? onAdd : onAddNext;
  const removeMovie = isCurrentTab ? onRemove : onRemoveNext;

  const handleAdd = async event => {
    event.preventDefault();
    const title = input.trim();
    if (!title || wheelIsSpinning) return;
    const success = await addMovie(title);
    if (success) setInput('');
  };

  const handleDelete = async id => {
    if (wheelIsSpinning) return;
    setDeletingId(id);
    await removeMovie(id);
    setDeletingId(null);
  };

  const setDuration = async value => {
    const nextValue = Math.max(5, Math.min(15, value));
    const previous = spinDuration;
    setSpinDuration(nextValue);
    try {
      const response = await postSpinDuration(nextValue);
      if (!response.ok) throw new Error();
      showToast(`Время прокрутки: ${nextValue} сек`, 'success');
    } catch {
      setSpinDuration(previous);
      showToast('Не удалось изменить время', 'error');
    }
  };

  const handleUpload = async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(file.type)) {
      showToast('Выберите PNG, JPG, GIF или WebP', 'error');
      event.target.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast('Файл больше 5 МБ', 'error');
      event.target.value = '';
      return;
    }

    setUploading(true);
    try {
      const response = await uploadCenterImage(file);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Ошибка загрузки');
      setCenterImage(data.url);
      showToast('Центр колеса обновлён', 'success');
    } catch (error) {
      showToast(error.message || 'Ошибка загрузки', 'error');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleImageDelete = useCallback(async () => {
    setUploading(true);
    try {
      const response = await deleteCenterImage();
      if (!response.ok) throw new Error();
      setCenterImage(null);
      setConfirmImageDelete(false);
      showToast('Изображение удалено', 'info');
    } catch {
      showToast('Ошибка удаления изображения', 'error');
    } finally {
      setUploading(false);
    }
  }, [setCenterImage, showToast]);

  if (!open) return null;

  return (
    <div className="wheel-modal-overlay" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <section
        ref={dialogRef}
        className="wheel-modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wheel-settings-title"
        tabIndex={-1}
      >
        <header className="wm-header">
          <div>
            <p className="wm-kicker">Состав вечера</p>
            <h2 id="wheel-settings-title">Фильмы и колесо</h2>
          </div>
          <button className="wm-close icon-button" type="button" onClick={onClose} aria-label="Закрыть настройки">
            ✕
          </button>
        </header>

        <div className="wm-tabs" role="tablist" aria-label="Разделы настроек">
          {TABS.map(tab => {
            const count = tab.key === 'current' ? movies.length : tab.key === 'next' ? nextMovies.length : null;
            return (
              <button
                key={tab.key}
                className={`wm-tab ${activeTab === tab.key ? 'active' : ''}`}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.key}
                onClick={() => setActiveTab(tab.key)}
              >
                <span aria-hidden="true">{tab.icon}</span>
                <span>{tab.label}</span>
                {count !== null && <span className="wm-tab-count">{count}</span>}
              </button>
            );
          })}
        </div>

        {activeTab !== 'settings' && (
          <div className="wm-panel" role="tabpanel">
            {wheelIsSpinning && (
              <div className="wm-notice" role="status">Состав заблокирован до остановки колеса.</div>
            )}
            {addEnabled ? (
              <form className="wm-add-row" onSubmit={handleAdd}>
                <label className="sr-only" htmlFor={`movie-input-${activeTab}`}>Название фильма</label>
                <input
                  id={`movie-input-${activeTab}`}
                  className="wm-input"
                  type="text"
                  placeholder="Название фильма…"
                  value={input}
                  maxLength={100}
                  onChange={event => setInput(event.target.value)}
                  disabled={wheelIsSpinning}
                />
                <button className="wm-add-btn button-primary" type="submit" disabled={!input.trim() || wheelIsSpinning}>
                  Добавить
                </button>
              </form>
            ) : (
              <div className="wm-notice">Добавление фильмов сейчас отключено.</div>
            )}

            {activeTab === 'next' && (
              <p className="wm-hint">Эти фильмы перейдут в колесо, когда закончится текущий список.</p>
            )}

            <div className="wm-list">
              {movieList.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-icon" aria-hidden="true">🧀</div>
                  <div className="empty-state-title">
                    {isCurrentTab ? 'Текущее колесо пустое' : 'Следующий список ещё не собран'}
                  </div>
                  <p>Добавьте название выше, чтобы начать список.</p>
                </div>
              ) : movieList.map(movie => (
                <article key={movie.id} className={`wm-item ${deletingId === movie.id ? 'is-deleting' : ''}`}>
                  <span className="wm-avatar" aria-hidden="true">{movie.added_by_name?.slice(0, 1) || 'С'}</span>
                  <div className="wm-item-copy">
                    <strong title={movie.title}>{movie.title}</strong>
                    <span>{movie.added_by_name || 'Автор не указан'}</span>
                  </div>
                  <span className="wm-item-status">{isCurrentTab ? 'в колесе' : 'следующий'}</span>
                  <button
                    className="wm-item-delete icon-button"
                    type="button"
                    onClick={() => handleDelete(movie.id)}
                    disabled={wheelIsSpinning || deletingId === movie.id}
                    aria-label={`Удалить фильм ${movie.title}`}
                    title="Удалить фильм"
                  >
                    {deletingId === movie.id ? '…' : '🗑'}
                  </button>
                </article>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="wm-settings" role="tabpanel">
            <section className="wm-settings-block">
              <div className="wm-settings-heading">
                <div>
                  <h3>Время вращения</h3>
                  <p>Сколько секунд колесо будет выбирать фильм.</p>
                </div>
                <strong>{spinDuration} сек</strong>
              </div>
              <div className="wm-duration-presets" aria-label="Время вращения">
                {[5, 10, 15].map(value => (
                  <button
                    key={value}
                    className={spinDuration === value ? 'active' : ''}
                    type="button"
                    onClick={() => setDuration(value)}
                    disabled={wheelIsSpinning}
                    aria-pressed={spinDuration === value}
                  >
                    {value} сек
                  </button>
                ))}
              </div>
            </section>

            <section className="wm-settings-block">
              <div className="wm-settings-heading">
                <div>
                  <h3>Центр колеса</h3>
                  <p>Квадратное изображение обрежется по кругу.</p>
                </div>
              </div>
              <div className="wm-center-row">
                <div className="wm-center-preview">
                  {centerImage ? <img src={centerImage} alt="Текущий центр колеса" /> : <span aria-hidden="true">🧀</span>}
                </div>
                <div className="wm-center-actions">
                  <label className={`button-primary wm-upload-btn ${uploading ? 'is-disabled' : ''}`}>
                    {uploading ? 'Загрузка…' : centerImage ? 'Заменить' : 'Загрузить'}
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/png,image/jpeg,image/gif,image/webp"
                      hidden
                      onChange={handleUpload}
                      disabled={uploading}
                    />
                  </label>
                  {centerImage && !confirmImageDelete && (
                    <button className="button-ghost danger" type="button" onClick={() => setConfirmImageDelete(true)} disabled={uploading}>
                      Удалить
                    </button>
                  )}
                </div>
              </div>
              {confirmImageDelete && (
                <div className="wm-inline-confirm" role="alert">
                  <span>Удалить изображение из центра?</span>
                  <button className="button-ghost" type="button" onClick={() => setConfirmImageDelete(false)} disabled={uploading}>Отмена</button>
                  <button className="button-danger" type="button" onClick={handleImageDelete} disabled={uploading}>Удалить</button>
                </div>
              )}
            </section>
          </div>
        )}
      </section>
    </div>
  );
}
