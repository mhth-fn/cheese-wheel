const icons = { success: '✅', error: '❌', info: 'ℹ️' };

export default function Toast({ toasts }) {
  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          <span className="toast-icon">{icons[t.type] || icons.info}</span>
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}
