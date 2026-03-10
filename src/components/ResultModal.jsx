export default function ResultModal({ title, onClose }) {
  return (
    <div className="modal active" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-content">
        <div className="modal-icon">🎉</div>
        <h3 className="modal-title">Выпал фильм!</h3>
        <div className="modal-movie">{title}</div>
        <button className="modal-btn" onClick={onClose}>Отлично! 👤</button>
      </div>
    </div>
  );
}
