import { useCallback } from 'react';
import { useDialogA11y } from '../hooks/useDialogA11y';

export default function ResultModal({ title, addedByName, centerImage, onClose, onViewHistory }) {
  const close = useCallback(() => onClose(), [onClose]);
  const dialogRef = useDialogA11y(true, close);

  return (
    <div className="dialog-backdrop result-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <section
        ref={dialogRef}
        className="result-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="result-title"
        tabIndex={-1}
      >
        <div className="result-confetti" aria-hidden="true">◆ · ◆ · ◆</div>
        <button className="result-close icon-button" type="button" onClick={onClose} aria-label="Закрыть результат">
          ✕
        </button>
        <div className="result-card-header">
          <span className="result-card-label">Сегодня смотрим</span>
        </div>
        <div className="result-card-body">
          <div className="result-poster" aria-hidden="true">
            {centerImage ? <img src={centerImage} alt="" /> : '🎬'}
          </div>
          <div id="result-title" className="result-card-title">{title}</div>
          <div className="result-card-suggested">
            {addedByName ? `Предложил ${addedByName}` : 'Выбрано сырным колесом'}
          </div>
        </div>
        <div className="result-card-footer">
          <button className="button-primary" type="button" onClick={onClose}>Смотрим этот фильм</button>
          <button className="button-secondary" type="button" onClick={onViewHistory}>Открыть историю</button>
        </div>
      </section>
    </div>
  );
}
