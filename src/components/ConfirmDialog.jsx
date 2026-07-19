import { useDialogA11y } from '../hooks/useDialogA11y';

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Удалить',
  cancelLabel = 'Отмена',
  danger = true,
  busy = false,
  onConfirm,
  onClose,
}) {
  const dialogRef = useDialogA11y(open, onClose);
  if (!open) return null;

  return (
    <div className="dialog-backdrop" onMouseDown={event => event.target === event.currentTarget && !busy && onClose()}>
      <section
        ref={dialogRef}
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        tabIndex={-1}
      >
        <div className="confirm-dialog-icon" aria-hidden="true">{danger ? '🗑️' : '🧀'}</div>
        <h2 id="confirm-dialog-title">{title}</h2>
        <p id="confirm-dialog-message">{message}</p>
        <div className="confirm-dialog-actions">
          <button className="button-secondary" type="button" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </button>
          <button className={danger ? 'button-danger' : 'button-primary'} type="button" onClick={onConfirm} disabled={busy}>
            {busy ? 'Подождите…' : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
