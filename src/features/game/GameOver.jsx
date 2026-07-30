export default function GameOver({ data, onClose, onRestart }) {
  if (!data) return null;
  return (
    <div className="game-over-screen" style={{ display: 'flex' }}>
      <div className="game-over-content">
        <div className="game-over-icon">
          {data.victory ? (data.bossKilled ? '🦆' : '🏆') : '💀'}
        </div>
        <div className="game-over-title">
          {data.victory
            ? (data.bossKilled ? 'УТКА-БОСС ПОВЕРЖЕНА!' : 'Победа!')
            : 'Поражение'}
        </div>
        <div className="game-over-stats">
          Убито лошадей: {data.kills}/100
          {data.bossKilled && ' + БОСС'} | Время: {data.time}
        </div>
        <div className="game-over-buttons">
          <button className="game-btn" type="button" onClick={onRestart}>
            🔄 Заново
          </button>
          <button className="game-btn" type="button" onClick={onClose}>
            🚪 Выход
          </button>
        </div>
      </div>
    </div>
  );
}
