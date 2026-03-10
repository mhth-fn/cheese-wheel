import React, { useState, useRef, useEffect, useCallback } from 'react';
import { TOTAL_ENEMIES, BOSS } from '../game/constants.js';
import { initTopDownMode, updateTopDown, renderTopDown } from '../game/topdown.js';
import { initScene, createPlayerHand, spawnHorses, initPlayer3D, setupInputHandlers, createDuckMesh, createSpearHand } from '../game/scene.js';
import { updatePlayer3D, updatePunchAnimation } from '../game/player3d.js';
import { updateHorseAI, updateRagdolls, triggerHorseDeath } from '../game/horseAI.js';
import { updateBossAI, triggerBossDamage, updateBossRagdoll } from '../game/bossAI.js';
import { spawnParticles, updateParticles } from '../game/particles.js';

export default function GamesPage() {
  const [mode, setMode] = useState('topdown');
  const [playing, setPlaying] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [gameOverData, setGameOverData] = useState(null);
  const [kills, setKills] = useState(0);
  const [hp, setHp] = useState(100);
  const [maxHp, setMaxHp] = useState(100);
  const [time, setTime] = useState('0:00');
  const [nearbyEnemies, setNearbyEnemies] = useState(0);
  const [bossHp, setBossHp] = useState(null);

  const canvas2dRef = useRef(null);
  const canvas3dRef = useRef(null);
  const gameScreenRef = useRef(null);
  const musicRef = useRef(null);
  const timerIntervalRef = useRef(null);
  const pointerLockMsgRef = useRef(null);
  const bossBarRef = useRef(null);
  const THREERef = useRef(null);

  const gs = useRef({
    mode: 'topdown',
    canvas: null, ctx: null,
    player: null, enemies: [], keys: {},
    kills: 0, startTime: 0, animationId: null,
    scene: null, camera: null, renderer: null,
    playerMesh: null, enemyMeshes: [], clock: null,
    lastTime: 0, particles: [],
    cameraShake: 0, cameraShakeDecay: 0.9,
    running: false, pointerLocked: false, handMesh: null,
    _callbacks: null,
    bossPhase: false, boss: null
  });

  // Cleanup on unmount
  useEffect(() => {
    return () => cleanupGame();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Key handlers
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!gs.current.running) return;
      gs.current.keys[e.code] = true;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
      // P — kill all horses (debug/cheat)
      if (e.code === 'KeyP' && !gs.current.bossPhase) {
        gs.current.enemies.forEach(en => {
          if (en.hp > 0) {
            en.hp = 0;
            en.dead = true;
            en.deathVX = (Math.random() - 0.5) * 0.3;
            en.deathVY = 0.15 + Math.random() * 0.1;
            en.deathVZ = (Math.random() - 0.5) * 0.3;
            en.deathSpin = (Math.random() - 0.5) * 0.3;
            en.deathFrame = 0;
            en.deathMaxFrames = 60;
            gs.current.kills++;
          }
        });
      }
    };
    const handleKeyUp = (e) => { gs.current.keys[e.code] = false; };
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const updateGameUI = useCallback(() => {
    const p = gs.current.player;
    if (!p) return;
    setKills(gs.current.kills);
    setHp(Math.max(0, Math.round(p.hp)));
    setMaxHp(p.maxHp);
    if (p.nearbyEnemies !== undefined) setNearbyEnemies(p.nearbyEnemies);
  }, []);

  // Timer
  useEffect(() => {
    if (playing && !gameOver) {
      timerIntervalRef.current = setInterval(() => {
        if (!gs.current.running) return;
        const elapsed = Math.floor((Date.now() - gs.current.startTime) / 1000);
        setTime(`${Math.floor(elapsed / 60)}:${(elapsed % 60).toString().padStart(2, '0')}`);
      }, 1000);
    }
    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    };
  }, [playing, gameOver]);

  function cleanupGame() {
    const g = gs.current;
    g.running = false;
    g.bossPhase = false;
    g.boss = null;
    if (g.animationId) { cancelAnimationFrame(g.animationId); g.animationId = null; }
    if (musicRef.current) musicRef.current.src = '';
    if (document.pointerLockElement) document.exitPointerLock();
    if (g.renderer) { g.renderer.dispose(); g.renderer = null; }
    if (g.scene) {
      while (g.scene.children.length > 0) g.scene.remove(g.scene.children[0]);
      g.scene = null;
    }
    if (g._handlePointerLockChange) {
      document.removeEventListener('pointerlockchange', g._handlePointerLockChange);
      g._handlePointerLockChange = null;
    }
    if (g._handleMouseMove) {
      document.removeEventListener('mousemove', g._handleMouseMove);
      g._handleMouseMove = null;
    }
    g.enemyMeshes = [];
    g.playerMesh = null;
    g.particles = [];
    g.enemies = [];
    g.keys = {};
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  }

  function endGame(victory, bossKilled = false) {
    const g = gs.current;
    g.running = false;
    if (g.animationId) { cancelAnimationFrame(g.animationId); g.animationId = null; }
    if (musicRef.current) musicRef.current.src = '';
    if (g.renderer) g.renderer.dispose();

    const elapsed = Math.floor((Date.now() - g.startTime) / 1000);
    setGameOverData({
      victory,
      bossKilled,
      kills: g.kills,
      time: `${Math.floor(elapsed / 60)}:${(elapsed % 60).toString().padStart(2, '0')}`
    });
    setGameOver(true);
  }

  function closeGame() {
    cleanupGame();
    setPlaying(false);
    setGameOver(false);
    setGameOverData(null);
    setBossHp(null);
  }

  // === BOSS PHASE ===
  function startBossPhase() {
    const g = gs.current;
    const THREE = THREERef.current;
    if (!THREE) return;

    g.bossPhase = true;

    // Clean up dead horse meshes
    g.enemies.forEach(e => {
      if (e.mesh) {
        g.scene.remove(e.mesh);
        e.mesh.traverse(child => {
          if (child.geometry) child.geometry.dispose();
          if (child.material) child.material.dispose();
        });
      }
    });
    g.enemies = [];
    g.enemyMeshes = [];

    // Heal player
    g.player.hp = g.player.maxHp;
    g.player.stamina = g.player.maxStamina;
    updateGameUI();

    // Spawn duck boss
    const { mesh: duckMesh, legs, head, tail, wings, neck } = createDuckMesh(THREE);
    duckMesh.position.set(40, 0, 0);
    g.scene.add(duckMesh);

    g.boss = {
      x: 40, z: 0,
      vx: 0, vz: 0,
      hp: BOSS.hp,
      maxHp: BOSS.hp,
      mesh: duckMesh,
      legs, head, tail, wings, neck,
      state: 'ROAR',
      stateTimer: BOSS.roarTime,
      attackCooldown: 0,
      animPhase: 0,
      dead: false,
      deathVX: 0, deathVY: 0, deathVZ: 0,
      deathSpin: 0, deathFrame: 0, deathMaxFrames: 120
    };

    setBossHp(BOSS.hp);

    // Swap weapon to spear
    createSpearHand(g, THREE);

    // Change music
    if (musicRef.current) {
      musicRef.current.src = BOSS.musicUrl;
    }
  }

  // === 3D UPDATE ORCHESTRATOR ===
  function update3DFrame() {
    const g = gs.current;
    const THREE = THREERef.current;
    if (!g.player || !g.camera || !THREE) return;

    const now = performance.now();
    const dt = Math.min((now - g.lastTime) / 16.67, 3);
    g.lastTime = now;

    const { forward } = updatePlayer3D(g, THREE, dt);

    updatePunchAnimation(g, THREE, forward, {
      onHit: (enemy) => {
        triggerHorseDeath(g, THREE, enemy, g.player);
        spawnParticles(g, THREE, enemy.x, 0.4, enemy.z, 0xCC0000, 15, 0.25);
        spawnParticles(g, THREE, enemy.x, 0.3, enemy.z, 0xFF0000, 10, 0.2);
        spawnParticles(g, THREE, enemy.x, 0.2, enemy.z, 0x880000, 8, 0.3);
        g.cameraShake = 4.0;
        updateGameUI();
      },
      onBossHit: () => {
        if (!g.boss || g.boss.hp <= 0) return;
        triggerBossDamage(g, THREE);
        // Feather particles — yellow, white, orange
        spawnParticles(g, THREE, g.boss.x, 1.5, g.boss.z, 0xF5DEB3, 20, 0.4);
        spawnParticles(g, THREE, g.boss.x, 1.2, g.boss.z, 0xFFFFFF, 15, 0.3);
        spawnParticles(g, THREE, g.boss.x, 1.0, g.boss.z, 0xFF8C00, 10, 0.35);
        setBossHp(g.boss.hp);
        if (bossBarRef.current) {
          bossBarRef.current.style.width = `${(g.boss.hp / g.boss.maxHp) * 100}%`;
        }
        updateGameUI();
      },
      onMiss: (x, z) => {
        spawnParticles(g, THREE, x, 1.2, z, 0xcccccc, 3, 0.05);
      }
    });

    if (g.bossPhase) {
      // Boss phase
      if (g.boss && g.boss.hp > 0 && !g.boss.dead) {
        updateBossAI(g, dt);
      }
      if (g.boss && g.boss.dead) {
        const done = updateBossRagdoll(g);
        if (done) {
          endGame(true, true);
          return;
        }
      }
      // Update boss HP bar directly
      if (bossBarRef.current && g.boss) {
        bossBarRef.current.style.width = `${(g.boss.hp / g.boss.maxHp) * 100}%`;
      }
    } else {
      // Normal phase
      updateHorseAI(g, dt);
      updateRagdolls(g);

      // Check for boss trigger
      if (g.kills >= TOTAL_ENEMIES) {
        startBossPhase();
      }
    }

    updateParticles(g);

    setNearbyEnemies(g.player.nearbyEnemies);
  }

  function gameLoop() {
    const g = gs.current;
    if (!g.running) return;

    if (g.mode === 'topdown') {
      updateTopDown(g, { updateGameUI, endGame });
      renderTopDown(g);
    } else {
      update3DFrame();
      if (g.renderer && g.scene && g.camera) {
        g.renderer.render(g.scene, g.camera);
      }
    }

    g.animationId = requestAnimationFrame(gameLoop);
  }

  function initGame(selectedMode) {
    const g = gs.current;
    g.mode = selectedMode;
    g.bossPhase = false;
    g.boss = null;

    // Clean up previous state
    if (g.scene) {
      while (g.scene.children.length > 0) g.scene.remove(g.scene.children[0]);
      g.scene = null;
    }
    if (g.renderer) { g.renderer.dispose(); g.renderer = null; }
    if (g._handlePointerLockChange) {
      document.removeEventListener('pointerlockchange', g._handlePointerLockChange);
      g._handlePointerLockChange = null;
    }
    if (g._handleMouseMove) {
      document.removeEventListener('mousemove', g._handleMouseMove);
      g._handleMouseMove = null;
    }
    g.enemyMeshes = [];
    g.playerMesh = null;
    g.particles = [];
    g.kills = 0;
    g.startTime = Date.now();
    g.enemies = [];
    g.lastTime = performance.now();
    g.keys = {};

    if (g.mode === 'topdown') {
      initTopDownMode(g, canvas2dRef, canvas3dRef, pointerLockMsgRef, gameScreenRef);
    } else {
      const THREE = THREERef.current;
      if (!THREE) { alert('Three.js не загружен!'); return; }

      if (canvas2dRef.current) canvas2dRef.current.style.display = 'none';
      const canvas = canvas3dRef.current;
      if (!canvas) return;
      canvas.style.display = 'block';

      try {
        initScene(g, THREE, canvas, gameScreenRef.current);
        createPlayerHand(g, THREE);
        initPlayer3D(g);
        spawnHorses(g, THREE);
        setupInputHandlers(g, canvas, pointerLockMsgRef);

        // Callbacks for AI to call back into React
        g._callbacks = {
          onPlayerDamage: () => {
            spawnParticles(g, THREE, g.player.x, 1.2, g.player.z, 0xFF0000, 8, 0.15);
            spawnParticles(g, THREE, g.player.x, 1.5, g.player.z, 0xCC0000, 5, 0.1);
            updateGameUI();
          },
          endGame
        };
      } catch (e) {
        console.error('Three.js error:', e);
        alert('Ошибка 3D: ' + e.message);
        return;
      }
    }

    updateGameUI();
    setBossHp(null);
    g.running = true;

    if (musicRef.current) {
      musicRef.current.src = 'https://www.youtube.com/embed/JAk4TDW4kf8?autoplay=1&loop=1&playlist=JAk4TDW4kf8';
    }

    gameLoop();
  }

  function handlePlay() {
    setPlaying(true);
    setGameOver(false);
    setGameOverData(null);
    setKills(0);
    setHp(100);
    setMaxHp(100);
    setTime('0:00');
    setNearbyEnemies(0);
    setBossHp(null);

    if (mode === 'thirdperson' && !THREERef.current) {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
      script.onload = () => {
        THREERef.current = window.THREE;
        setTimeout(() => initGame(mode), 100);
      };
      script.onerror = () => {
        alert('Не удалось загрузить Three.js');
        setPlaying(false);
      };
      document.head.appendChild(script);
    } else {
      setTimeout(() => initGame(mode), 100);
    }
  }

  function handleRestart() {
    setGameOver(false);
    setGameOverData(null);
    setKills(0);
    setHp(100);
    setMaxHp(100);
    setTime('0:00');
    setNearbyEnemies(0);
    setBossHp(null);
    initGame(gs.current.mode);
  }

  // === RENDER ===
  if (!playing) {
    return (
      <div className="games-container">
        <h2 className="games-title">🎮 Мини-игры</h2>
        <div className="game-card">
          <div className="game-card-icon">🐴</div>
          <div className="game-card-info">
            <h3>100 мини-лошадей</h3>
            <p>Сразись с армией из 100 лошадей размером с утку!</p>
            <div className="game-mode-select">
              <label className="game-mode-option">
                <input
                  type="radio"
                  name="game-mode"
                  value="topdown"
                  checked={mode === 'topdown'}
                  onChange={() => setMode('topdown')}
                />
                <span className="mode-btn">🎯 Вид сверху</span>
              </label>
              <label className="game-mode-option">
                <input
                  type="radio"
                  name="game-mode"
                  value="thirdperson"
                  checked={mode === 'thirdperson'}
                  onChange={() => setMode('thirdperson')}
                />
                <span className="mode-btn">🎮 3D от 1-го лица</span>
              </label>
            </div>
          </div>
          <button className="game-btn" onClick={handlePlay}>
            ▶️ Играть
          </button>
        </div>
      </div>
    );
  }

  const hpPercent = maxHp > 0 ? (hp / maxHp * 100) : 0;

  return (
    <>
      <div className="game-screen" ref={gameScreenRef} style={{ display: 'flex' }}>
        <div className="game-header">
          <div className="game-stats">
            <div className="stat-item">
              ❤️ <div className="hp-bar">
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
            {gs.current.mode === 'thirdperson' && !gs.current.bossPhase && (
              <div className="stat-item">
                🐴 Рядом: <span style={{
                  color: nearbyEnemies > 10 ? '#ff4444' : nearbyEnemies > 5 ? '#ffaa00' : '#ffffff'
                }}>{nearbyEnemies}</span>
              </div>
            )}
          </div>
          <button className="game-close-btn" onClick={closeGame}>✕</button>
        </div>

        {/* Boss HP bar */}
        {bossHp !== null && (
          <div style={{
            position: 'absolute',
            top: '60px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '60%',
            maxWidth: '400px',
            zIndex: 20,
            textAlign: 'center'
          }}>
            <div style={{
              fontFamily: "'Caveat', cursive",
              fontSize: '1.4rem',
              color: '#fff',
              textShadow: '2px 2px 4px rgba(0,0,0,0.8)',
              marginBottom: '4px'
            }}>
              🦆 УТКА-БОСС
            </div>
            <div style={{
              background: 'rgba(0,0,0,0.6)',
              borderRadius: '8px',
              height: '16px',
              border: '2px solid #FF6600',
              overflow: 'hidden'
            }}>
              <div ref={bossBarRef} style={{
                width: '100%',
                height: '100%',
                background: 'linear-gradient(90deg, #FF4444, #FF6600)',
                borderRadius: 'inherit',
                transition: 'width 0.15s'
              }} />
            </div>
          </div>
        )}

        <canvas
          ref={canvas2dRef}
          className="game-canvas-2d"
          style={{ display: gs.current.mode === 'topdown' ? 'block' : 'none' }}
        />
        <canvas
          ref={canvas3dRef}
          className="game-canvas-3d"
          style={{ display: gs.current.mode === 'thirdperson' ? 'block' : 'none' }}
        />

        {gs.current.mode === 'thirdperson' && (
          <div className="pointer-lock-msg" ref={pointerLockMsgRef} style={{ display: 'block' }}>
            🖱️ Нажмите на экран для захвата мыши
          </div>
        )}

        <div className="game-controls-info">
          {gs.current.mode === 'topdown' ? (
            <>
              <span>⬆️⬇️⬅️➡️ движение</span>
              <span>ПРОБЕЛ удар</span>
              <span>SHIFT рывок</span>
            </>
          ) : (
            <>
              <span>WASD движение</span>
              <span>🖱️ камера</span>
              <span>ЛКМ {gs.current.bossPhase ? 'копьё' : 'удар'}</span>
              <span>ПРОБЕЛ прыжок</span>
            </>
          )}
        </div>

        <iframe ref={musicRef} title="game-music" allow="autoplay; encrypted-media" style={{
          position: 'absolute', width: '1px', height: '1px', opacity: 0, pointerEvents: 'none'
        }} />
      </div>

      {gameOver && gameOverData && (
        <div className="game-over-screen" style={{ display: 'flex' }}>
          <div className="game-over-content">
            <div className="game-over-icon">{gameOverData.victory ? (gameOverData.bossKilled ? '🦆' : '🏆') : '💀'}</div>
            <div className="game-over-title">
              {gameOverData.victory
                ? (gameOverData.bossKilled ? 'УТКА-БОСС ПОВЕРЖЕНА!' : 'Победа!')
                : 'Поражение'}
            </div>
            <div className="game-over-stats">
              Убито лошадей: {gameOverData.kills}/100
              {gameOverData.bossKilled && ' + БОСС'} | Время: {gameOverData.time}
            </div>
            <div className="game-over-buttons">
              <button className="game-btn" onClick={handleRestart}>🔄 Заново</button>
              <button className="game-btn" onClick={closeGame}>🚪 Выход</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
