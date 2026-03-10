import { FIELD, BOSS } from './constants.js';

export function updateBossAI(gs, dt) {
  const b = gs.boss;
  const p = gs.player;
  if (!b || b.hp <= 0) return;

  const dx = p.x - b.x;
  const dz = p.z - b.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  const dirX = dist > 0 ? dx / dist : 0;
  const dirZ = dist > 0 ? dz / dist : 0;

  b.stateTimer -= dt;
  if (b.attackCooldown > 0) b.attackCooldown -= dt;

  let targetVX = 0, targetVZ = 0;

  switch (b.state) {
    case 'ROAR': {
      // Stand still, bob head aggressively
      if (b.head) {
        b.head.rotation.x = Math.sin(Date.now() * 0.01) * 0.4;
      }
      // Flap wings menacingly
      if (b.wings) {
        b.wings.forEach((w, i) => {
          w.rotation.x = Math.sin(Date.now() * 0.015 + i * Math.PI) * 0.6;
        });
      }
      if (b.stateTimer <= 0) {
        b.state = 'CHARGE';
        b.stateTimer = 80;
      }
      break;
    }

    case 'CHARGE': {
      const speed = BOSS.sprintSpeed;
      targetVX = dirX * speed;
      targetVZ = dirZ * speed;

      if (dist < 2.5) {
        b.state = 'ATTACK';
        b.stateTimer = 30;
      }
      break;
    }

    case 'ATTACK': {
      // Stay close and peck
      targetVX = dirX * BOSS.speed * 0.5;
      targetVZ = dirZ * BOSS.speed * 0.5;

      if (dist < 2.5 && b.attackCooldown <= 0 && p.invincible <= 0) {
        p.hp -= BOSS.damage;
        b.attackCooldown = BOSS.attackCooldown;
        p.damageFlash = 8;
        gs.cameraShake = 3.0;
        if (gs._callbacks) gs._callbacks.onPlayerDamage();
        if (p.hp <= 0 && gs._callbacks) gs._callbacks.endGame(false);
      }

      if (dist > 4) {
        b.state = 'CHARGE';
        b.stateTimer = 60;
      }
      if (b.stateTimer <= 0) {
        b.state = 'CHARGE';
        b.stateTimer = 60;
      }
      break;
    }

    case 'STUNNED': {
      // Pushed back, not moving
      targetVX = -dirX * 0.05;
      targetVZ = -dirZ * 0.05;
      if (b.stateTimer <= 0) {
        b.state = 'CHARGE';
        b.stateTimer = 60;
      }
      break;
    }
  }

  // Apply velocity
  b.vx = b.vx * 0.85 + targetVX * 0.15;
  b.vz = b.vz * 0.85 + targetVZ * 0.15;

  b.x += b.vx * dt;
  b.z += b.vz * dt;

  // Field bounds
  b.x = Math.max(-FIELD.x, Math.min(FIELD.x, b.x));
  b.z = Math.max(-FIELD.z, Math.min(FIELD.z, b.z));

  // Collision with player
  if (dist < 1.5 && dist > 0) {
    const push = (1.5 - dist) * 0.3;
    p.vx -= dirX * push;
    p.vz -= dirZ * push;
  }

  // Update mesh
  b.mesh.position.x = b.x;
  b.mesh.position.z = b.z;

  const moveSpeed = Math.sqrt(b.vx * b.vx + b.vz * b.vz);
  if (moveSpeed > 0.01) {
    const targetRot = Math.atan2(-b.vx, -b.vz);
    let diff = targetRot - b.mesh.rotation.y;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    b.mesh.rotation.y += diff * 0.08;
  }

  // Leg animation — waddle
  if (moveSpeed > 0.02 && b.legs) {
    b.animPhase += moveSpeed * 6 * dt;
    b.legs[0].rotation.x = Math.sin(b.animPhase) * 0.5;
    b.legs[1].rotation.x = Math.sin(b.animPhase + Math.PI) * 0.5;
    b.mesh.position.y = Math.abs(Math.sin(b.animPhase * 2)) * 0.08;
    // Body waddle
    b.mesh.rotation.z = Math.sin(b.animPhase) * 0.05;
  }

  // Wing flap during charge
  if (b.wings && b.state === 'CHARGE') {
    b.wings.forEach((w, i) => {
      w.rotation.x = Math.sin(Date.now() * 0.01 + i * Math.PI) * 0.4;
    });
  }

  // Head tracking
  if (b.head) {
    const lookAngle = Math.atan2(dx, dz) - b.mesh.rotation.y;
    b.head.rotation.y = Math.max(-0.6, Math.min(0.6, lookAngle * 0.3));
  }
}

export function triggerBossDamage(gs, THREE) {
  const b = gs.boss;
  const p = gs.player;
  if (!b || b.hp <= 0) return;

  b.hp--;

  // Knockback
  const dx = b.x - p.x;
  const dz = b.z - p.z;
  const dist = Math.sqrt(dx * dx + dz * dz) || 1;
  b.vx = (dx / dist) * 0.4;
  b.vz = (dz / dist) * 0.4;
  b.x += b.vx * 3;
  b.z += b.vz * 3;

  // Stun
  b.state = 'STUNNED';
  b.stateTimer = BOSS.stunTime;

  // Camera shake
  gs.cameraShake = 5.0;

  if (b.hp <= 0) {
    // Boss death — ragdoll
    b.dead = true;
    b.deathVX = (dx / dist) * 0.4 + (Math.random() - 0.5) * 0.1;
    b.deathVY = 0.2 + Math.random() * 0.1;
    b.deathVZ = (dz / dist) * 0.4 + (Math.random() - 0.5) * 0.1;
    b.deathSpin = (Math.random() - 0.5) * 0.2;
    b.deathFrame = 0;
    b.deathMaxFrames = 120;
    gs.cameraShake = 10.0;
  }
}

export function updateBossRagdoll(gs) {
  const b = gs.boss;
  if (!b || !b.dead) return false;

  b.deathFrame++;
  b.deathVY -= 0.004;
  b.mesh.position.x += b.deathVX;
  b.mesh.position.y += b.deathVY;
  b.mesh.position.z += b.deathVZ;
  b.mesh.rotation.x += b.deathSpin;
  b.mesh.rotation.z += b.deathSpin * 0.7;

  if (b.mesh.position.y < 0) {
    b.mesh.position.y = 0;
    b.deathVY = Math.abs(b.deathVY) * 0.3;
    b.deathVX *= 0.5;
    b.deathVZ *= 0.5;
    b.deathSpin *= 0.5;
  }

  const fade = 1.0 - (b.deathFrame / b.deathMaxFrames);
  b.mesh.traverse(child => {
    if (child.material) {
      child.material.transparent = true;
      child.material.opacity = Math.max(0, fade);
    }
  });

  if (b.deathFrame >= b.deathMaxFrames) {
    b.mesh.visible = false;
    return true; // done
  }
  return false;
}
