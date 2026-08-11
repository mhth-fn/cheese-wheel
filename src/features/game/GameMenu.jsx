export default function GameMenu({ mode, onBalda, onModeChange, onPlay }) {
  return (
    <div className="games-container">
      <div className="game-card">
        <div className="game-card-icon">🐴</div>
        <div className="game-card-info">
          <h3>100 мини-лошадей</h3>
          <p>Сразись с армией из 100 лошадей размером с утку!</p>
          <div className="game-mode-select">
            {[
              ['topdown', '🎯 Вид сверху'],
              ['thirdperson', '🎮 3D от 1-го лица'],
            ].map(([value, label]) => (
              <label className="game-mode-option" key={value}>
                <input
                  type="radio"
                  name="game-mode"
                  value={value}
                  checked={mode === value}
                  onChange={() => onModeChange(value)}
                />
                <span className="mode-btn">{label}</span>
              </label>
            ))}
          </div>
        </div>
        <button className="game-btn" type="button" onClick={onPlay}>
          ▶️ Играть
        </button>
      </div>
      <div className="game-card">
        <div className="game-card-icon" aria-hidden="true">БД</div>
        <div className="game-card-info">
          <h3>Балда</h3>
          <p>Собирайте слова на поле 5×5 вдвоём, пока остальные смотрят.</p>
          <span className="game-card-tag">Онлайн · 2 игрока</span>
        </div>
        <button className="game-btn" type="button" onClick={onBalda}>
          Открыть игру
        </button>
      </div>
    </div>
  );
}
