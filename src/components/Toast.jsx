const icons = { success: '✅', error: '❌', info: 'ℹ️' };

export default function Toast({ toasts }) {
  return (
    <div
      className="toast-container"
      aria-label="Уведомления"
    >
      {toasts.map(t => (
        <div
          key={t.id}
          className={`toast toast-${t.type}`}
          role={t.type === 'error' ? 'alert' : 'status'}
          aria-live={t.type === 'error' ? 'assertive' : 'polite'}
          aria-atomic="true"
        >
          <span className="toast-icon" aria-hidden="true">{icons[t.type] || icons.info}</span>
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}
