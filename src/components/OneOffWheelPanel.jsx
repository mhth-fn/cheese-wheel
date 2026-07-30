import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../App';
import {
  deleteCenterImage,
  deleteOneOffMovie,
  patchOneOffWheelSettings,
  postOneOffMovie,
  uploadCenterImage,
} from '../api';
import CheeseWheel from './CheeseWheel';

async function readResponse(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Сервер отклонил запрос');
  return data;
}

export default function OneOffWheelPanel() {
  const {
    currentUser,
    isGuest,
    isAdmin,
    connected,
    socket,
    theme,
    centerImage,
    setCenterImage,
    oneOffState,
    setOneOffState,
    oneOffIsSpinning,
    setOneOffIsSpinning,
    remoteOneOffSpin,
    setRemoteOneOffSpin,
    showToast,
  } = useApp();
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [spinPending, setSpinPending] = useState(false);
  const [activeSpin, setActiveSpin] = useState(null);
  const [settingBusy, setSettingBusy] = useState('');
  const [durationDraft, setDurationDraft] = useState(
    Number(oneOffState.spin_duration) || 5
  );
  const [uploading, setUploading] = useState(false);
  const wheelRef = useRef(null);
  const fileRef = useRef(null);
  const startedSpinIdRef = useRef(null);

  const movies = Array.isArray(oneOffState.movies) ? oneOffState.movies : [];
  const spinSnapshot = activeSpin || remoteOneOffSpin;
  const displayMovies = spinSnapshot?.movies?.length ? spinSnapshot.movies : movies;
  const result = oneOffState.result;
  const eliminationActive = Boolean(oneOffState.elimination_active);
  const modeLabel = oneOffState.mode === 'elimination'
    ? 'На выбывание'
    : 'На выпадение';

  useEffect(() => {
    setDurationDraft(Number(oneOffState.spin_duration) || 5);
  }, [oneOffState.spin_duration]);

  useEffect(() => {
    if (!socket) return undefined;
    const reject = ({ error }) => {
      setSpinPending(false);
      setOneOffIsSpinning(false);
      showToast(error || 'Не удалось прокрутить разовое колесо', 'error');
    };
    socket.on('one-off-spin-rejected', reject);
    return () => socket.off('one-off-spin-rejected', reject);
  }, [setOneOffIsSpinning, showToast, socket]);

  useEffect(() => {
    if (!remoteOneOffSpin) return;
    setSpinPending(false);
    setActiveSpin(remoteOneOffSpin);
    setOneOffIsSpinning(true);
    setRemoteOneOffSpin(null);
  }, [remoteOneOffSpin, setOneOffIsSpinning, setRemoteOneOffSpin]);

  useEffect(() => {
    if (!activeSpin || startedSpinIdRef.current === activeSpin.spinId) return;
    const selectedIndex = activeSpin.movies.findIndex(
      movie => Number(movie.id) === Number(activeSpin.winnerMovieId)
    );
    if (selectedIndex < 0) {
      setActiveSpin(null);
      setOneOffIsSpinning(false);
      showToast('Состав разового колеса изменился', 'error');
      return;
    }
    startedSpinIdRef.current = activeSpin.spinId;
    wheelRef.current?.spin(
      selectedIndex,
      activeSpin.spinDuration,
      activeSpin.randomOffset,
      activeSpin.turns
    );
  }, [activeSpin, setOneOffIsSpinning, showToast]);

  useEffect(() => () => setOneOffIsSpinning(false), [setOneOffIsSpinning]);

  const handleSpinComplete = useCallback(() => {
    if (!activeSpin) return;
    if (activeSpin.outcome?.type === 'eliminated') {
      showToast(`«${activeSpin.outcome.movie.title}» выбывает`, 'info');
    }
    setActiveSpin(null);
    setOneOffIsSpinning(false);
  }, [activeSpin, setOneOffIsSpinning, showToast]);

  const updateSettings = async (changes, busyKey) => {
    const previous = oneOffState;
    setSettingBusy(busyKey);
    setOneOffState(current => ({ ...current, ...changes }));
    try {
      const nextState = await readResponse(await patchOneOffWheelSettings(changes));
      setOneOffState(nextState);
    } catch (error) {
      setOneOffState(previous);
      if (busyKey === 'duration') {
        setDurationDraft(Number(previous.spin_duration) || 5);
      }
      showToast(error.message || 'Не удалось изменить настройки', 'error');
    } finally {
      setSettingBusy('');
    }
  };

  useEffect(() => {
    const duration = Math.max(5, Math.min(30, Math.round(Number(durationDraft))));
    if (
      !isAdmin
      || oneOffIsSpinning
      || eliminationActive
      || duration === Number(oneOffState.spin_duration)
    ) {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      void updateSettings({ spin_duration: duration }, 'duration');
    }, 350);
    return () => window.clearTimeout(timer);
  }, [
    durationDraft,
    eliminationActive,
    isAdmin,
    oneOffIsSpinning,
    oneOffState.spin_duration,
  ]);

  const handleAdd = async event => {
    event.preventDefault();
    const nextTitle = title.trim();
    if (!nextTitle || saving) return;
    setSaving(true);
    try {
      await readResponse(await postOneOffMovie(nextTitle));
      setTitle('');
      showToast(`«${nextTitle}» добавлен в разовое колесо`, 'success');
    } catch (error) {
      showToast(error.message || 'Не удалось добавить фильм', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async movie => {
    setDeletingId(movie.id);
    try {
      await readResponse(await deleteOneOffMovie(movie.id));
      showToast('Фильм убран из разового колеса', 'info');
    } catch (error) {
      showToast(error.message || 'Не удалось удалить фильм', 'error');
    } finally {
      setDeletingId(null);
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
      const data = await readResponse(await uploadCenterImage(file));
      setCenterImage(data.url);
      showToast('Центр колеса обновлён', 'success');
    } catch (error) {
      showToast(error.message || 'Ошибка загрузки', 'error');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleImageDelete = async () => {
    setUploading(true);
    try {
      await readResponse(await deleteCenterImage());
      setCenterImage(null);
      showToast('Изображение центра удалено', 'info');
    } catch (error) {
      showToast(error.message || 'Ошибка удаления изображения', 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleSpin = () => {
    if (!isAdmin) {
      showToast('Разовое колесо прокручивает администратор', 'info');
      return;
    }
    if (!socket || !connected) {
      showToast('Нет соединения с сервером', 'error');
      return;
    }
    if (
      movies.length === 0
      || result
      || oneOffIsSpinning
      || eliminationActive
      || spinPending
    ) return;
    setSpinPending(true);
    socket.emit('spin-one-off');
  };

  const spinDisabled = (
    !isAdmin
    || !connected
    || movies.length === 0
    || Boolean(result)
    || oneOffIsSpinning
    || eliminationActive
    || spinPending
  );
  const canMutate = (
    connected
    && !isGuest
    && !oneOffIsSpinning
    && !eliminationActive
    && !result
  );
  const settingsDisabled = (
    !isAdmin
    || oneOffIsSpinning
    || eliminationActive
    || Boolean(settingBusy)
  );

  return (
    <section className="one-off-replacement" aria-labelledby="one-off-title">
      <div className="one-off-main">
        <div className="one-off-banner" id="one-off-title">Разовое колесо</div>
        {displayMovies.length > 0 ? (
          <div className="wheel-container">
            <div className="wheel-wrapper one-off-wheel-wrapper">
              <CheeseWheel
                ref={wheelRef}
                movies={displayMovies}
                onSpinComplete={handleSpinComplete}
                theme={theme}
                respectReducedMotion={false}
              />
              <button
                type="button"
                className={`wheel-center-btn${spinPending ? ' is-pending' : ''}${oneOffIsSpinning ? ' is-spinning' : ''}`}
                onClick={handleSpin}
                disabled={spinDisabled}
                aria-label="Крутить разовое колесо"
                aria-busy={spinPending || oneOffIsSpinning}
                title={isAdmin ? 'Крутить разовое колесо' : 'Прокручивает администратор'}
              >
                {centerImage
                  ? <img src={centerImage} alt="" className="wheel-center-img" />
                  : <span className="wheel-center-fallback" aria-hidden="true">🧀</span>}
              </button>
            </div>
          </div>
        ) : (
          <div className="wheel-not-ready one-off-not-ready" aria-live="polite">
            <span className="wheel-not-ready-icon" aria-hidden="true">🧀</span>
            <strong>Добавьте фильмы</strong>
            <span>Список для разовой прокрутки находится в меню справа.</span>
          </div>
        )}
      </div>

      <aside className="one-off-panel" aria-label="Меню разового колеса">
        <header className="one-off-header">
          <div>
            <p>
              {oneOffState.mode === 'elimination'
                ? 'Крутится до выбора одного фильма'
                : 'Одна публикация — одна прокрутка'}
            </p>
            <h2>Меню колеса</h2>
          </div>
          <span className={`one-off-mode is-${oneOffState.mode}`}>{modeLabel}</span>
        </header>

        <section className="one-off-settings">
          <h3>Параметры</h3>
          <label>
            <span>Режим</span>
            <select
              value={oneOffState.mode}
              disabled={settingsDisabled || Boolean(result)}
              onChange={event => updateSettings(
                { mode: event.target.value },
                'mode'
              )}
            >
              <option value="selection">На выпадение</option>
              <option value="elimination">На выбывание</option>
            </select>
          </label>
          <label>
            <span>Время прокрутки: <strong>{durationDraft} сек</strong></span>
            <input
              type="range"
              min="5"
              max="30"
              step="1"
              value={durationDraft}
              disabled={settingsDisabled}
              onChange={event => setDurationDraft(Number(event.target.value))}
              aria-label="Время прокрутки разового колеса"
            />
            {settingBusy === 'duration' && (
              <small className="one-off-setting-status" aria-live="polite">
                Сохраняем время…
              </small>
            )}
          </label>
          <div className="one-off-center-setting">
            <span>Центр колеса</span>
            <div>
              <span className="one-off-center-preview" aria-hidden="true">
                {centerImage ? <img src={centerImage} alt="" /> : '🧀'}
              </span>
              {isAdmin && (
                <div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/gif,image/webp"
                    onChange={handleUpload}
                    disabled={uploading || oneOffIsSpinning}
                    aria-label="Загрузить изображение центра"
                  />
                  <button
                    className="button-secondary"
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading || oneOffIsSpinning}
                  >
                    {uploading ? 'Загрузка…' : 'Выбрать'}
                  </button>
                  {centerImage && (
                    <button
                      className="button-ghost danger"
                      type="button"
                      onClick={handleImageDelete}
                      disabled={uploading || oneOffIsSpinning}
                    >
                      Удалить
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>

        <form className="one-off-add" onSubmit={handleAdd}>
          <label htmlFor="one-off-movie-input">Добавить фильм</label>
          <div>
            <input
              id="one-off-movie-input"
              type="text"
              value={title}
              maxLength={200}
              placeholder={isGuest ? 'Гостям доступен только просмотр' : 'Название фильма…'}
              onChange={event => setTitle(event.target.value)}
              disabled={!canMutate || saving}
            />
            <button
              className="button-primary"
              type="submit"
              disabled={!canMutate || saving || !title.trim()}
            >
              Добавить
            </button>
          </div>
        </form>

        <div className="one-off-table-wrap">
          <table className="one-off-table">
            <caption>Фильмы: {movies.length}</caption>
            <thead>
              <tr>
                <th>Фильм</th>
                <th>Добавил</th>
                <th><span className="sr-only">Действия</span></th>
              </tr>
            </thead>
            <tbody>
              {movies.map(movie => {
                const manageable = (
                  !isGuest
                  && (isAdmin || Number(movie.added_by) === Number(currentUser?.id))
                );
                return (
                  <tr key={movie.id}>
                    <td title={movie.title}>{movie.title}</td>
                    <td>{movie.added_by_name}</td>
                    <td>
                      {manageable && (
                        <button
                          className="one-off-delete"
                          type="button"
                          onClick={() => handleDelete(movie)}
                          disabled={!canMutate || deletingId === movie.id}
                          aria-label={`Удалить фильм ${movie.title}`}
                          title="Удалить"
                        >
                          ✕
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {movies.length === 0 && (
                <tr>
                  <td colSpan="3" className="one-off-empty-row">
                    Здесь появятся предложения участников
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </aside>
    </section>
  );
}
