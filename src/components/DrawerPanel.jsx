import { useCallback, useRef, useState } from 'react';
import { useApp } from '../App';
import { postSpinDuration, uploadCenterImage, deleteCenterImage } from '../api';
import { useDialogA11y } from '../hooks/useDialogA11y';

const TABS = [
  { key: 'participants', icon: '👥', label: 'Участники' },
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
  onUpdate,
  onForm,
  onFormNext,
  onAddNext,
  onRemoveNext,
}) {
  const {
    users,
    currentUser,
    isGuest,
    spinDuration,
    setSpinDuration,
    addEnabled,
    centerImage,
    setCenterImage,
    showToast,
    connected,
    wheelIsSpinning,
    wheelStatus,
  } = useApp();
  const [currentInput, setCurrentInput] = useState('');
  const [nextInput, setNextInput] = useState('');
  const [activeTab, setActiveTab] = useState('participants');
  const [deletingId, setDeletingId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [forming, setForming] = useState(false);
  const [formingNext, setFormingNext] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [confirmImageDelete, setConfirmImageDelete] = useState(false);
  const fileRef = useRef(null);
  const dialogRef = useDialogA11y(open, onClose);

  const displayedCurrentMovies = wheelStatus.formed ? wheelStatus.movies : movies;
  const primaryMovies = new Map();
  displayedCurrentMovies.forEach(movie => {
    if (movie.added_by && !primaryMovies.has(movie.added_by)) {
      primaryMovies.set(movie.added_by, movie);
    }
  });
  const readyUsers = users.filter(user => primaryMovies.has(user.id));
  const currentUserMovie = primaryMovies.get(currentUser?.id);
  const currentUserNextMovie = nextMovies.find(movie => movie.added_by === currentUser?.id);
  const extraMovies = displayedCurrentMovies.filter(movie => primaryMovies.get(movie.added_by)?.id !== movie.id);
  const canManageMovie = movie => !isGuest && Boolean(movie) && movie.added_by === currentUser?.id;
  const canManageCurrentMovie = movie => !wheelStatus.formed && canManageMovie(movie);

  const handleCurrentAdd = async event => {
    event.preventDefault();
    const title = currentInput.trim();
    if (!title || wheelIsSpinning) return;
    const success = await onAdd(title);
    if (success) setCurrentInput('');
  };

  const handleNextAdd = async event => {
    event.preventDefault();
    const title = nextInput.trim();
    if (!title || wheelIsSpinning) return;
    const success = await onAddNext(title);
    if (success) setNextInput('');
  };

  const handleDelete = async (id, next = false) => {
    if (wheelIsSpinning) return;
    setDeletingId(id);
    await (next ? onRemoveNext(id) : onRemove(id));
    setDeletingId(null);
  };

  const startEditing = movie => {
    setEditingId(movie.id);
    setEditTitle(movie.title);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditTitle('');
  };

  const saveEditing = async event => {
    event?.preventDefault();
    const title = editTitle.trim();
    if (!title) return;
    const success = await onUpdate(editingId, title);
    if (success) cancelEditing();
  };

  const handleForm = async () => {
    setForming(true);
    await onForm();
    setForming(false);
  };

  const handleFormNext = async () => {
    setFormingNext(true);
    await onFormNext();
    setFormingNext(false);
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
            <p className="wm-kicker">Управление колесом</p>
            <h2 id="wheel-settings-title">Состав вечера</h2>
          </div>
          <button className="wm-close icon-button" type="button" onClick={onClose} aria-label="Закрыть настройки">
            ✕
          </button>
        </header>

        <div className="wm-tabs" role="tablist" aria-label="Разделы настроек">
          {TABS.map(tab => {
            const count = tab.key === 'participants'
              ? `${readyUsers.length}/${users.length}`
              : tab.key === 'next'
                ? nextMovies.length
                : null;
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

        {activeTab === 'participants' && (
          <div className="wm-panel" role="tabpanel">
            {wheelIsSpinning && (
              <div className="wm-notice" role="status">Состав заблокирован до остановки колеса.</div>
            )}

            {!wheelStatus.formed && (
              <section className="wm-formation">
                <p>Проверьте выборы участников и сформируйте колесо для этого раунда.</p>
                <button
                  className="button-primary wm-form-wheel"
                  type="button"
                  onClick={handleForm}
                  disabled={isGuest || !connected || movies.length === 0 || wheelIsSpinning || forming}
                >
                  {forming ? 'Формируем…' : 'Сформировать колесо'}
                </button>
              </section>
            )}

            {!wheelStatus.formed && !isGuest && addEnabled && !currentUserMovie && (
              <form className="wm-add-row" onSubmit={handleCurrentAdd}>
                <label className="sr-only" htmlFor="movie-input-participants">Ваш фильм</label>
                <input
                  id="movie-input-participants"
                  className="wm-input"
                  type="text"
                  placeholder="Добавить свой фильм…"
                  value={currentInput}
                  maxLength={200}
                  onChange={event => setCurrentInput(event.target.value)}
                  disabled={wheelIsSpinning || !connected}
                />
                <button className="wm-add-btn button-primary" type="submit" disabled={!currentInput.trim() || wheelIsSpinning || !connected}>
                  Добавить
                </button>
              </form>
            )}

            {!wheelStatus.formed && !isGuest && !addEnabled && (
              <div className="wm-notice">Добавление фильмов сейчас отключено.</div>
            )}

            <div className="wm-participants">
              {users.map(user => {
                const movie = primaryMovies.get(user.id);
                const editing = !wheelStatus.formed && movie && editingId === movie.id;
                const manageable = canManageCurrentMovie(movie);
                return (
                  <article key={user.id} className={`wm-participant ${movie ? 'is-ready' : 'is-waiting'}${editing ? ' is-editing' : ''}${manageable ? ' has-actions' : ''}`}>
                    <span className="wm-avatar" aria-hidden="true">{user.name.slice(0, 1)}</span>
                    <div className="wm-participant-copy">
                      <strong>{user.name}{currentUser?.id === user.id ? ' · вы' : ''}</strong>
                      {editing ? (
                        <form className="wm-inline-edit" onSubmit={saveEditing}>
                          <input
                            value={editTitle}
                            maxLength={200}
                            onChange={event => setEditTitle(event.target.value)}
                            onKeyDown={event => event.key === 'Escape' && cancelEditing()}
                            aria-label={`Название фильма участника ${user.name}`}
                            autoFocus
                          />
                          <button className="icon-button" type="submit" disabled={!editTitle.trim()} aria-label="Сохранить название">✓</button>
                          <button className="icon-button" type="button" onClick={cancelEditing} aria-label="Отменить редактирование">✕</button>
                        </form>
                      ) : (
                        <span title={movie?.title}>{movie?.title || 'Ещё не добавил фильм'}</span>
                      )}
                    </div>
                    <span className="wm-participant-status" aria-label={movie ? 'Готово' : 'Ожидаем фильм'}>
                      {movie ? 'Готово' : 'Ожидаем'}
                    </span>
                    {movie && !editing && manageable && (
                      <div className="wm-participant-actions">
                        <button
                          className="icon-button"
                          type="button"
                          onClick={() => startEditing(movie)}
                          disabled={wheelIsSpinning}
                          aria-label={`Изменить фильм ${movie.title}`}
                          title="Изменить фильм"
                        >
                          ✎
                        </button>
                        <button
                          className="icon-button danger"
                          type="button"
                          onClick={() => handleDelete(movie.id)}
                          disabled={wheelIsSpinning || deletingId === movie.id}
                          aria-label={`Удалить фильм ${movie.title}`}
                          title="Удалить фильм"
                        >
                          {deletingId === movie.id ? '…' : '🗑'}
                        </button>
                      </div>
                    )}
                  </article>
                );
              })}

              {extraMovies.map(movie => {
                const editing = !wheelStatus.formed && editingId === movie.id;
                const manageable = canManageCurrentMovie(movie);
                return (
                <article key={movie.id} className={`wm-participant is-ready${editing ? ' is-editing' : ''}${manageable ? ' has-actions' : ''}`}>
                  <span className="wm-avatar" aria-hidden="true">?</span>
                  <div className="wm-participant-copy">
                    <strong>{movie.added_by_name || 'Дополнительный фильм'}</strong>
                    {editing ? (
                      <form className="wm-inline-edit" onSubmit={saveEditing}>
                        <input
                          value={editTitle}
                          maxLength={200}
                          onChange={event => setEditTitle(event.target.value)}
                          onKeyDown={event => event.key === 'Escape' && cancelEditing()}
                          aria-label="Название дополнительного фильма"
                          autoFocus
                        />
                        <button className="icon-button" type="submit" disabled={!editTitle.trim()} aria-label="Сохранить название">✓</button>
                        <button className="icon-button" type="button" onClick={cancelEditing} aria-label="Отменить редактирование">✕</button>
                      </form>
                    ) : (
                      <span>{movie.title}</span>
                    )}
                  </div>
                  <span className="wm-participant-status">Готово</span>
                  {!editing && manageable && (
                    <div className="wm-participant-actions">
                      <button className="icon-button" type="button" onClick={() => startEditing(movie)} aria-label={`Изменить фильм ${movie.title}`}>✎</button>
                      <button className="icon-button danger" type="button" onClick={() => handleDelete(movie.id)} aria-label={`Удалить фильм ${movie.title}`}>🗑</button>
                    </div>
                  )}
                </article>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'next' && (
          <div className="wm-panel" role="tabpanel">
            {!isGuest && (
              <>
                <form className="wm-add-row" onSubmit={handleNextAdd}>
                  <label className="sr-only" htmlFor="movie-input-next">
                    {currentUserNextMovie ? 'Заменить свой фильм для следующего раунда' : 'Выбрать фильм для следующего раунда'}
                  </label>
                  <input
                    id="movie-input-next"
                    className="wm-input"
                    type="text"
                    placeholder={currentUserNextMovie ? 'Новое название фильма…' : 'Ваш фильм для следующего раунда…'}
                    value={nextInput}
                    maxLength={200}
                    onChange={event => setNextInput(event.target.value)}
                    disabled={wheelIsSpinning || !connected}
                  />
                  <button className="wm-add-btn button-primary" type="submit" disabled={!nextInput.trim() || wheelIsSpinning || !connected}>
                    {currentUserNextMovie ? 'Заменить' : 'Добавить'}
                  </button>
                </form>
                {currentUserNextMovie && (
                  <p className="wm-own-choice-note">
                    Сейчас ваш выбор — «{currentUserNextMovie.title}». Новое название заменит его.
                  </p>
                )}
              </>
            )}
            <p className="wm-hint">Здесь каждый участник выбирает один фильм для следующего раунда.</p>

            {wheelStatus.formed && !isGuest && (
              <section className="wm-next-cycle">
                <p>Когда список будет готов, замените им текущее колесо.</p>
                <button
                  className="button-primary"
                  type="button"
                  onClick={handleFormNext}
                  disabled={!connected || nextMovies.length === 0 || wheelIsSpinning || formingNext}
                >
                  {formingNext ? 'Формируем…' : 'Сформировать следующее колесо'}
                </button>
              </section>
            )}

            <div className="wm-list">
              {nextMovies.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-icon" aria-hidden="true">🧀</div>
                  <div className="empty-state-title">Следующий список ещё не собран</div>
                </div>
              ) : nextMovies.map(movie => {
                const editing = editingId === movie.id;
                const manageable = canManageMovie(movie);
                const isOwn = movie.added_by === currentUser?.id;
                return (
                  <article key={movie.id} className={`wm-item ${deletingId === movie.id ? 'is-deleting' : ''}${editing ? ' is-editing' : ''}${manageable ? ' has-actions' : ''}`}>
                    <span className="wm-avatar" aria-hidden="true">{movie.added_by_name?.slice(0, 1) || '?'}</span>
                    <div className="wm-item-copy">
                      {editing ? (
                        <form className="wm-inline-edit" onSubmit={saveEditing}>
                          <input
                            value={editTitle}
                            maxLength={200}
                            onChange={event => setEditTitle(event.target.value)}
                            onKeyDown={event => event.key === 'Escape' && cancelEditing()}
                            aria-label={`Фильм участника ${movie.added_by_name || ''} для следующего раунда`}
                            autoFocus
                          />
                          <button className="icon-button" type="submit" disabled={!editTitle.trim()} aria-label="Сохранить название">✓</button>
                          <button className="icon-button" type="button" onClick={cancelEditing} aria-label="Отменить редактирование">✕</button>
                        </form>
                      ) : (
                        <strong title={movie.title}>{movie.title}</strong>
                      )}
                      <span>
                        Выбор на следующий раунд · {movie.added_by_name || 'Автор не указан'}{isOwn ? ' · вы' : ''}
                      </span>
                    </div>
                    <span className="wm-item-status">Следующий раунд</span>
                    {manageable && !editing && (
                      <div className="wm-item-actions">
                        <button
                          className="icon-button"
                          type="button"
                          onClick={() => startEditing(movie)}
                          disabled={wheelIsSpinning}
                          aria-label={`Изменить фильм ${movie.title}`}
                          title="Изменить фильм"
                        >
                          ✎
                        </button>
                        <button
                          className="icon-button danger"
                          type="button"
                          onClick={() => handleDelete(movie.id, true)}
                          disabled={wheelIsSpinning || deletingId === movie.id}
                          aria-label={`Удалить фильм ${movie.title}`}
                          title="Удалить фильм"
                        >
                          {deletingId === movie.id ? '…' : '🗑'}
                        </button>
                      </div>
                    )}
                  </article>
                );
              })}
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
                    disabled={isGuest || wheelIsSpinning}
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
                  <label className={`button-primary wm-upload-btn ${uploading || isGuest ? 'is-disabled' : ''}`}>
                    {uploading ? 'Загрузка…' : centerImage ? 'Заменить' : 'Загрузить'}
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/png,image/jpeg,image/gif,image/webp"
                      hidden
                      onChange={handleUpload}
                      disabled={uploading || isGuest}
                    />
                  </label>
                  {!isGuest && centerImage && !confirmImageDelete && (
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
