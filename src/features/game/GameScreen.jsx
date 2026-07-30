export default function GameScreen({
  bossBarRef,
  bossHp,
  bossPhase,
  canvas2dRef,
  canvas3dRef,
  gameScreenRef,
  hp,
  hpPercent,
  kills,
  mode,
  musicBoxRef,
  nearbyEnemies,
  onClose,
  pointerLockMsgRef,
  time,
}) {
  const nearbyLevel = nearbyEnemies > 10
    ? 'danger'
    : nearbyEnemies > 5
      ? 'warning'
      : 'normal';

  return (
    <div className="game-screen" ref={gameScreenRef} style={{ display: 'flex' }}>
      <div className="game-header">
        <div className="game-stats">
          <div className="stat-item">
            ❤️
            <div className="hp-bar">
              <div className="hp-fill" style={{ width: `${hpPercent}%` }} />
            </div>
            <span>{hp}</span>
          </div>
          <div className="stat-item">
            🗡️ Убито: <span>{kills}</span>/100
          </div>
          <div className="stat-item">
            ⏱️ <span>{time}</span>
          </div>
          {mode === 'thirdperson' && !bossPhase && (
            <div className="stat-item">
              🐴 Рядом:{' '}
              <span className={`nearby-enemies ${nearbyLevel}`}>{nearbyEnemies}</span>
            </div>
          )}
        </div>
        <button className="game-close-btn" type="button" onClick={onClose}>
          ✕
        </button>
      </div>

      {bossHp !== null && (
        <div className="boss-health">
          <div className="boss-health-title">🦆 УТКА-БОСС</div>
          <div className="boss-health-track">
            <div ref={bossBarRef} className="boss-health-fill" />
          </div>
        </div>
      )}

      <canvas
        ref={canvas2dRef}
        className="game-canvas-2d"
        style={{ display: mode === 'topdown' ? 'block' : 'none' }}
      />
      <canvas
        ref={canvas3dRef}
        className="game-canvas-3d"
        style={{ display: mode === 'thirdperson' ? 'block' : 'none' }}
      />

      {mode === 'thirdperson' && (
        <div
          className="pointer-lock-msg"
          ref={pointerLockMsgRef}
          style={{ display: 'block' }}
        >
          🖱️ Нажмите на экран для захвата мыши
        </div>
      )}

      <div className="game-controls-info">
        {mode === 'topdown' ? (
          <>
            <span>⬆️⬇️⬅️➡️ движение</span>
            <span>ПРОБЕЛ удар</span>
            <span>SHIFT рывок</span>
          </>
        ) : (
          <>
            <span>WASD движение</span>
            <span>🖱️ камера</span>
            <span>ЛКМ{bossPhase ? '/SHIFT копьё' : ' удар'}</span>
            <span>ПРОБЕЛ прыжок</span>
            {!bossPhase && <span>З пулемёт</span>}
          </>
        )}
      </div>

      <div ref={musicBoxRef} className="game-music-box" aria-hidden="true" />
    </div>
  );
}
