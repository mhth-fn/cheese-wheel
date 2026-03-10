import { PLAYER_2D, TOTAL_ENEMIES } from './constants.js';

export function initTopDownMode(gs, canvas2dRef, canvas3dRef, pointerLockMsgRef, gameScreenRef) {
  const canvas = canvas2dRef.current;
  if (!canvas) return;

  canvas.style.display = 'block';
  if (canvas3dRef.current) canvas3dRef.current.style.display = 'none';
  if (pointerLockMsgRef.current) pointerLockMsgRef.current.style.display = 'none';

  const container = gameScreenRef.current;
  canvas.width = container.clientWidth;
  canvas.height = container.clientHeight - 90;

  gs.canvas = canvas;
  gs.ctx = canvas.getContext('2d');

  gs.player = {
    x: 100,
    y: canvas.height / 2,
    hp: PLAYER_2D.hp,
    maxHp: PLAYER_2D.maxHp,
    speed: PLAYER_2D.speed,
    attacking: false,
    attackCooldown: 0,
    dashCooldown: 0,
    facing: 1,
    invincible: 0
  };

  for (let i = 0; i < TOTAL_ENEMIES; i++) {
    gs.enemies.push({
      x: canvas.width - 200 + Math.random() * 150,
      y: 50 + Math.random() * (canvas.height - 100),
      hp: 1,
      speed: 1.5 + Math.random() * 1.5,
      attackCooldown: 0
    });
  }
}

export function updateTopDown(gs, callbacks) {
  const p = gs.player;
  const canvas = gs.canvas;

  if (gs.keys['ArrowUp'] || gs.keys['KeyW']) p.y -= p.speed;
  if (gs.keys['ArrowDown'] || gs.keys['KeyS']) p.y += p.speed;
  if (gs.keys['ArrowLeft'] || gs.keys['KeyA']) { p.x -= p.speed; p.facing = -1; }
  if (gs.keys['ArrowRight'] || gs.keys['KeyD']) { p.x += p.speed; p.facing = 1; }

  if (gs.keys['ShiftLeft'] && p.dashCooldown <= 0) {
    p.x += p.facing * 100;
    p.dashCooldown = 60;
    p.invincible = 15;
  }

  p.x = Math.max(30, Math.min(canvas.width - 30, p.x));
  p.y = Math.max(30, Math.min(canvas.height - 30, p.y));

  if (gs.keys['Space'] && p.attackCooldown <= 0) {
    p.attacking = true;
    p.attackCooldown = 20;

    gs.enemies.forEach(e => {
      if (e.hp <= 0) return;
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 60) {
        e.hp = 0;
        gs.kills++;
        callbacks.updateGameUI();
      }
    });
  } else {
    p.attacking = false;
  }

  if (p.attackCooldown > 0) p.attackCooldown--;
  if (p.dashCooldown > 0) p.dashCooldown--;
  if (p.invincible > 0) p.invincible--;

  gs.enemies.forEach(e => {
    if (e.hp <= 0) return;

    const dx = p.x - e.x;
    const dy = p.y - e.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > 0) {
      e.x += (dx / dist) * e.speed;
      e.y += (dy / dist) * e.speed;
    }

    if (dist < 35 && e.attackCooldown <= 0 && p.invincible <= 0) {
      p.hp -= 2;
      e.attackCooldown = 30;
      callbacks.updateGameUI();
      if (p.hp <= 0) callbacks.endGame(false);
    }

    if (dist < 20) {
      e.hp = 0;
      gs.kills++;
      callbacks.updateGameUI();
    }

    if (e.attackCooldown > 0) e.attackCooldown--;
  });

  if (gs.kills >= TOTAL_ENEMIES) callbacks.endGame(true);
}

export function renderTopDown(gs) {
  const ctx = gs.ctx;
  const canvas = gs.canvas;
  const p = gs.player;

  ctx.fillStyle = '#2d5a27';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 3;
  ctx.strokeRect(30, 30, canvas.width - 60, canvas.height - 60);
  ctx.beginPath();
  ctx.moveTo(canvas.width / 2, 30);
  ctx.lineTo(canvas.width / 2, canvas.height - 30);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(canvas.width / 2, canvas.height / 2, 80, 0, Math.PI * 2);
  ctx.stroke();

  ctx.font = '20px Arial';
  gs.enemies.forEach(e => {
    if (e.hp > 0) ctx.fillText('\u{1F434}', e.x - 10, e.y + 7);
  });

  ctx.save();
  ctx.translate(p.x, p.y);
  if (p.facing < 0) ctx.scale(-1, 1);

  ctx.fillStyle = p.invincible > 0 ? 'rgba(255,255,100,0.8)' : '#FFD93D';
  ctx.fillRect(-15, -25, 30, 40);
  ctx.fillStyle = '#FFDAB9';
  ctx.beginPath();
  ctx.arc(0, -35, 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#4A4A4A';
  ctx.fillRect(-12, 15, 10, 20);
  ctx.fillRect(2, 15, 10, 20);

  if (p.attacking) {
    ctx.fillStyle = '#FFDAB9';
    ctx.beginPath();
    ctx.arc(30, -10, 12, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
