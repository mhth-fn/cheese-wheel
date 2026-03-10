export default function ResultModal({ title, addedByName, onClose }) {
  return (
    <div className="modal active" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="result-card">
        <div className="result-card-header">
          <span className="result-card-label">Сегодня смотрим</span>
        </div>
        <div className="result-card-body">
          <div className="result-card-title">{title}</div>
          {addedByName && (
            <div className="result-card-suggested">фильм предложил {addedByName}</div>
          )}
        </div>
        <div className="result-card-footer">
          <button className="result-card-btn" onClick={onClose}>Отлично!</button>
        </div>
      </div>
    </div>
  );
}
