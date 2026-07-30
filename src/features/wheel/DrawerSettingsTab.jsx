import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../../app/AppContext';
import { deleteCenterImage, postSpinDuration, uploadCenterImage } from '../../api';

export default function DrawerSettingsTab() {
  const {
    spinDuration,
    setSpinDuration,
    centerImage,
    setCenterImage,
    showToast,
    isGuest,
    wheelIsSpinning,
  } = useApp();
  const [uploading, setUploading] = useState(false);
  const [confirmImageDelete, setConfirmImageDelete] = useState(false);
  const [durationDraft, setDurationDraft] = useState(String(spinDuration));
  const [durationSaving, setDurationSaving] = useState(false);
  const fileRef = useRef(null);
  const durationSavingRef = useRef(false);
  const parsedDuration = Number.parseInt(durationDraft, 10);
  const durationValue = Number.isInteger(parsedDuration)
    ? Math.max(5, Math.min(30, parsedDuration))
    : spinDuration;
  const durationProgress = ((durationValue - 5) / 25) * 100;

  useEffect(() => {
    setDurationDraft(String(spinDuration));
  }, [spinDuration]);

  const setDuration = async value => {
    const parsedValue = Number(value);
    if (!Number.isFinite(parsedValue) || durationSavingRef.current) {
      setDurationDraft(String(spinDuration));
      return;
    }
    const nextValue = Math.round(Math.max(5, Math.min(30, parsedValue)));
    const previous = spinDuration;
    setDurationDraft(String(nextValue));
    if (nextValue === previous) return;
    durationSavingRef.current = true;
    setDurationSaving(true);
    setSpinDuration(nextValue);
    try {
      const response = await postSpinDuration(nextValue);
      if (!response.ok) throw new Error();
      showToast(`Время прокрутки: ${nextValue} сек`, 'success');
    } catch {
      setSpinDuration(previous);
      setDurationDraft(String(previous));
      showToast('Не удалось изменить время', 'error');
    } finally {
      durationSavingRef.current = false;
      setDurationSaving(false);
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

  return (
    <div className="wm-settings" role="tabpanel">
      <section className="wm-settings-block">
        <div className="wm-settings-heading">
          <div>
            <h3>Время вращения</h3>
            <p>Сколько секунд колесо будет выбирать фильм.</p>
          </div>
          <strong>{durationValue} сек</strong>
        </div>
        <div className="wm-duration-control">
          <input
            className="wm-duration-slider"
            type="range"
            min="5"
            max="30"
            step="1"
            value={durationValue}
            style={{ '--duration-progress': `${durationProgress}%` }}
            onChange={event => setDurationDraft(event.target.value)}
            onPointerUp={event => setDuration(event.currentTarget.value)}
            onKeyUp={event => {
              if (['ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) {
                setDuration(event.currentTarget.value);
              }
            }}
            onBlur={event => setDuration(event.currentTarget.value)}
            disabled={isGuest || wheelIsSpinning || durationSaving}
            aria-label="Время вращения от 5 до 30 секунд"
          />
          <label className="wm-duration-number">
            <span className="sr-only">Точное время вращения</span>
            <input
              type="number"
              min="5"
              max="30"
              step="1"
              inputMode="numeric"
              value={durationDraft}
              onChange={event => setDurationDraft(event.target.value)}
              onBlur={event => setDuration(event.currentTarget.value)}
              onKeyDown={event => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  event.currentTarget.blur();
                } else if (event.key === 'Escape') {
                  setDurationDraft(String(spinDuration));
                  event.currentTarget.blur();
                }
              }}
              disabled={isGuest || wheelIsSpinning || durationSaving}
            />
            <span>сек</span>
          </label>
        </div>
        <div className="wm-duration-scale" aria-hidden="true"><span>5</span><span>30</span></div>
        <p className="wm-duration-saving" role="status" aria-live="polite">
          {durationSaving ? 'Сохраняем…' : 'Выберите любое целое значение.'}
        </p>
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
  );
}
