import { useState } from 'react';
import { formatFileSize, MAX_SIGAME_TAGS } from './sigameUtils';

export default function SigamePackForm({
  busy,
  editingId,
  fileError,
  form,
  onChooseFile,
  onClose,
  onRemoveFile,
  onSubmit,
  selectedFile,
  setForm,
  tagError,
}) {
  const [dragging, setDragging] = useState(false);

  return (
    <div
      className="sigame-modal-backdrop"
      onMouseDown={event => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <form
        className="sigame-pack-form"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sigame-form-title"
        onSubmit={onSubmit}
      >
        <div className="sigame-form-heading">
          <h2 id="sigame-form-title">
            {editingId ? 'Изменить пак' : 'Добавить пак'}
          </h2>
          <button
            type="button"
            className="sigame-form-close"
            onClick={onClose}
            disabled={busy}
            aria-label="Закрыть форму"
          >
            ×
          </button>
        </div>

        {!editingId && (
          <div className="sigame-file-field">
            <span className="sigame-field-label">Файл пака *</span>
            {!selectedFile ? (
              <label
                className={[
                  'sigame-dropzone',
                  dragging ? 'dragging' : '',
                  fileError ? 'invalid' : '',
                ].filter(Boolean).join(' ')}
                onDragEnter={event => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragOver={event => event.preventDefault()}
                onDragLeave={event => {
                  event.preventDefault();
                  setDragging(false);
                }}
                onDrop={event => {
                  event.preventDefault();
                  setDragging(false);
                  onChooseFile(event.dataTransfer.files?.[0]);
                }}
              >
                <input
                  type="file"
                  accept=".siq"
                  onChange={event => onChooseFile(event.target.files?.[0])}
                />
                <span className="sigame-dropzone-icon" aria-hidden="true">⇧</span>
                <strong>Перетащите .siq-файл сюда</strong>
                <span>или выберите файл</span>
              </label>
            ) : (
              <div className="sigame-selected-file">
                <span aria-hidden="true">📦</span>
                <div>
                  <strong>{selectedFile.name}</strong>
                  <small>{formatFileSize(selectedFile.size)}</small>
                </div>
                <button
                  type="button"
                  onClick={onRemoveFile}
                  disabled={busy}
                  aria-label="Удалить выбранный файл"
                >
                  ×
                </button>
              </div>
            )}
            {fileError && (
              <span className="sigame-file-error" role="alert">{fileError}</span>
            )}
          </div>
        )}

        <label className="sigame-field">
          <span>Название *</span>
          <input
            value={form.title}
            onChange={event => setForm(previous => ({
              ...previous,
              title: event.target.value,
            }))}
            maxLength={200}
            placeholder="Например, История Древней Греции"
            required
            autoFocus={Boolean(editingId)}
          />
        </label>

        <label className="sigame-field">
          <span>
            Теги <small>через запятую, до {MAX_SIGAME_TAGS}</small>
          </span>
          <input
            value={form.tags}
            onChange={event => setForm(previous => ({
              ...previous,
              tags: event.target.value,
            }))}
            placeholder="история, кино, сложный, 18+"
          />
          {tagError && (
            <span className="sigame-file-error" role="alert">{tagError}</span>
          )}
        </label>

        <div className="sigame-form-actions">
          <button className="button-ghost" type="button" onClick={onClose} disabled={busy}>
            Отмена
          </button>
          <button
            className="button-primary"
            type="submit"
            disabled={
              busy
              || !form.title.trim()
              || Boolean(tagError)
              || (!editingId && (!selectedFile || Boolean(fileError)))
            }
          >
            {busy
              ? (editingId ? 'Сохраняем…' : 'Загружаем…')
              : (editingId ? 'Сохранить' : 'Добавить в библиотеку')}
          </button>
        </div>
      </form>
    </div>
  );
}
