import { useState, useRef, useEffect, useCallback } from 'react';
import { TOTAL_ENEMIES, BOSS } from '../game/constants.js';
import { initTopDownMode, updateTopDown, renderTopDown } from '../game/topdown.js';
import { initScene, createPlayerHand, spawnHorses, initPlayer3D, setupInputHandlers, createDuckMesh, createSpearHand } from '../game/scene.js';
import { updatePlayer3D, updatePunchAnimation } from '../game/player3d.js';
import { updateHorseAI, updateRagdolls, triggerHorseDeath } from '../game/horseAI.js';
import { updateBossAI, triggerBossDamage, updateBossRagdoll, updateDucklings, triggerDucklingDeath } from '../game/bossAI.js';
import { spawnParticles, updateParticles } from '../game/particles.js';
import { createMinigunHand, removeMinigunHand, updateMinigun, cleanupMinigun } from '../game/minigun.js';
import GameMenu from '../features/game/GameMenu';
import GameOver from '../features/game/GameOver';
import GameScreen from '../features/game/GameScreen';

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
  const musicBoxRef = useRef(null);
  const timerIntervalRef = useRef(null);
  const pointerLockMsgRef = useRef(null);
  const bossBarRef = useRef(null);
  const THREERef = useRef(null);
  const startTimeoutRef = useRef(null);
  const threeScriptRef = useRef(null);

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

  const audioRef = useRef(null);

  function playMusic(src) {
    stopMusic();
    if (src.startsWith('file:')) {
      // Local audio file
      const audio = new Audio(src.slice(5));
      audio.loop = true;
      audio.volume = 0.5;
      audio.play().catch(() => {});
      audioRef.current = audio;
    } else if (musicBoxRef.current && /^[A-Za-z0-9_-]{11}$/.test(src)) {
      // YouTube embed
      const iframe = document.createElement('iframe');
      iframe.src = `https://www.youtube.com/embed/${src}?autoplay=1&loop=1&playlist=${src}`;
      iframe.allow = 'autoplay; encrypted-media';
      iframe.sandbox = 'allow-scripts allow-same-origin allow-presentation';
      iframe.referrerPolicy = 'no-referrer';
      iframe.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;border:none;';
      musicBoxRef.current.appendChild(iframe);
    }
  }

  function stopMusic() {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (musicBoxRef.current) {
      musicBoxRef.current.innerHTML = '';
    }
  }

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
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft'].includes(e.code)) {
        e.preventDefault();
      }

      // Left Shift — attack (spear) during boss phase
      if (e.code === 'ShiftLeft' && gs.current.mode === 'thirdperson' && gs.current.bossPhase && gs.current.pointerLocked) {
        const g = gs.current;
        if (g.player.attackCooldown <= 0) {
          g.player.attacking = true;
          g.player.attackCooldown = BOSS.spearCooldown;
          g.player.attackAnim = BOSS.spearAnimFrames;
        }
      }

      // "З" key (KeyZ) — toggle minigun, only in 3D horse phase (not boss)
      if (e.code === 'KeyZ' && gs.current.mode === 'thirdperson' && !gs.current.bossPhase) {
        const g = gs.current;
        const THREE = THREERef.current;
        if (!THREE) return;
        if (g.minigunActive) {
          // Deactivate minigun — restore fist
          removeMinigunHand(g);
          g.minigunActive = false;
          createPlayerHand(g, THREE);
        } else {
          // Activate minigun — swap hand model
          if (g.handMesh) g.camera.remove(g.handMesh);
          g.minigunActive = true;
          createMinigunHand(g, THREE);
        }
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
    if (startTimeoutRef.current !== null) {
      window.clearTimeout(startTimeoutRef.current);
      startTimeoutRef.current = null;
    }
    if (threeScriptRef.current) {
      threeScriptRef.current.onload = null;
      threeScriptRef.current.onerror = null;
      threeScriptRef.current.remove();
      threeScriptRef.current = null;
    }
    g.running = false;
    g.bossPhase = false;
    g.boss = null;
    if (g.animationId) { cancelAnimationFrame(g.animationId); g.animationId = null; }
    stopMusic();
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
    g.ducklings = [];
    g._THREE = null;
    g.minigunActive = false;
    if (g.minigunBullets) {
      g.minigunBullets.forEach(b => { if (g.scene) g.scene.remove(b.mesh); });
      g.minigunBullets = [];
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
    stopMusic();
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

    // Deactivate minigun for boss phase
    if (g.minigunActive) {
      cleanupMinigun(g);
    }

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

    // Change music to boss track
    playMusic('file:/audio/boss-music.mp3');
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

    // Minigun update (only in horse phase, auto-fires while active)
    if (g.minigunActive && !g.bossPhase && g.pointerLocked) {
      updateMinigun(g, THREE, forward, dt);
    }

    updatePunchAnimation(g, THREE, forward, {
      onHit: (enemy) => {
        triggerHorseDeath(g, THREE, enemy, g.player);
        spawnParticles(g, THREE, enemy.x, 0.4, enemy.z, 0xCC0000, 15, 0.25);
        spawnParticles(g, THREE, enemy.x, 0.3, enemy.z, 0xFF0000, 10, 0.2);
        spawnParticles(g, THREE, enemy.x, 0.2, enemy.z, 0x880000, 8, 0.3);
        g.cameraShake = 4.0;
        updateGameUI();
      },
      onDucklingHit: (duckling) => {
        triggerDucklingDeath(g, THREE, duckling, g.player);
        spawnParticles(g, THREE, duckling.x, 0.3, duckling.z, 0xFFE44D, 10, 0.2);
        spawnParticles(g, THREE, duckling.x, 0.2, duckling.z, 0xFFFF00, 6, 0.15);
        g.cameraShake = 2.0;
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
      // Update ducklings
      updateDucklings(g, dt);
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
        g._THREE = THREE;
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
          onMinigunKill: () => {
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

    playMusic('JAk4TDW4kf8');

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
      script.integrity = 'sha384-CI3ELBVUz9XQO+97x6nwMDPosPR5XvsxW2ua7N1Xeygeh1IxtgqtCkGfQY9WWdHu';
      script.crossOrigin = 'anonymous';
      script.referrerPolicy = 'no-referrer';
      script.onload = () => {
        THREERef.current = window.THREE;
        threeScriptRef.current = null;
        startTimeoutRef.current = window.setTimeout(() => {
          startTimeoutRef.current = null;
          initGame(mode);
        }, 100);
      };
      script.onerror = () => {
        threeScriptRef.current = null;
        alert('Не удалось загрузить Three.js');
        setPlaying(false);
      };
      threeScriptRef.current = script;
      document.head.appendChild(script);
    } else {
      startTimeoutRef.current = window.setTimeout(() => {
        startTimeoutRef.current = null;
        initGame(mode);
      }, 100);
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
      <GameMenu mode={mode} onModeChange={setMode} onPlay={handlePlay} />
    );
  }

  const hpPercent = maxHp > 0 ? (hp / maxHp * 100) : 0;

  return (
    <>
      <GameScreen
        bossBarRef={bossBarRef}
        bossHp={bossHp}
        bossPhase={gs.current.bossPhase}
        canvas2dRef={canvas2dRef}
        canvas3dRef={canvas3dRef}
        gameScreenRef={gameScreenRef}
        hp={hp}
        hpPercent={hpPercent}
        kills={kills}
        mode={gs.current.mode}
        musicBoxRef={musicBoxRef}
        nearbyEnemies={nearbyEnemies}
        pointerLockMsgRef={pointerLockMsgRef}
        time={time}
        onClose={closeGame}
      />
      {gameOver && (
        <GameOver
          data={gameOverData}
          onClose={closeGame}
          onRestart={handleRestart}
        />
      )}
    </>
  );
}
