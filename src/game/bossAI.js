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

  // Trigger leap at 50% HP (once)
  if (!b.leapTriggered && b.hp <= Math.floor(BOSS.hp / 2)) {
    b.leapTriggered = true;
    b.state = 'LEAP_WINDUP';
    b.stateTimer = 60;
    // Remember player position at start of leap
    b.leapTargetX = p.x;
    b.leapTargetZ = p.z;
    // Save player pos to check if they moved
    b.leapPlayerStartX = p.x;
    b.leapPlayerStartZ = p.z;
  }

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

    case 'LEAP_WINDUP': {
      // Duck crouches and flaps wings before jumping
      targetVX = 0;
      targetVZ = 0;
      b.mesh.position.y = -0.2 + Math.sin(Date.now() * 0.02) * 0.05;
      if (b.wings) {
        b.wings.forEach((w, i) => {
          w.rotation.x = Math.sin(Date.now() * 0.03 + i * Math.PI) * 0.8;
        });
      }
      if (b.head) {
        b.head.rotation.x = 0.3; // Looking down, ready to pounce
      }
      if (b.stateTimer <= 0) {
        b.state = 'LEAP';
        b.stateTimer = 40;
        // Lock onto current player position
        b.leapTargetX = p.x;
        b.leapTargetZ = p.z;
        b.leapStartX = b.x;
        b.leapStartZ = b.z;
        b.leapStartY = 0;
        b.leapFrame = 0;
        b.leapTotalFrames = 40;
      }
      break;
    }

    case 'LEAP': {
      // Fly through the air toward player's position
      b.leapFrame += dt;
      const t = Math.min(b.leapFrame / b.leapTotalFrames, 1.0);

      // Lerp XZ toward target
      b.x = b.leapStartX + (b.leapTargetX - b.leapStartX) * t;
      b.z = b.leapStartZ + (b.leapTargetZ - b.leapStartZ) * t;

      // Arc through air
      const jumpHeight = 6.0;
      b.mesh.position.y = Math.sin(t * Math.PI) * jumpHeight;

      // Spin in air
      b.mesh.rotation.x = t * Math.PI * 2;

      // Wings spread
      if (b.wings) {
        b.wings.forEach((w, i) => {
          w.rotation.x = Math.sin(Date.now() * 0.02 + i * Math.PI) * 1.0;
        });
      }

      // Landing
      if (t >= 1.0) {
        b.mesh.position.y = 0;
        b.mesh.rotation.x = 0;
        gs.cameraShake = 8.0;

        // Check if player stayed still — instant kill
        const movedX = Math.abs(p.x - b.leapPlayerStartX);
        const movedZ = Math.abs(p.z - b.leapPlayerStartZ);
        const playerMoved = Math.sqrt(movedX * movedX + movedZ * movedZ) > 2.0;

        const landDx = p.x - b.x;
        const landDz = p.z - b.z;
        const landDist = Math.sqrt(landDx * landDx + landDz * landDz);

        if (!playerMoved && landDist < 3.5) {
          // Player didn't move — instant death
          p.hp = 0;
          p.damageFlash = 15;
          gs.cameraShake = 15.0;
          if (gs._callbacks) gs._callbacks.onPlayerDamage();
          if (gs._callbacks) gs._callbacks.endGame(false);
        } else if (landDist < 2.5) {
          // Player moved but still close — big damage
          p.hp -= BOSS.damage * 2;
          p.damageFlash = 10;
          gs.cameraShake = 6.0;
          if (gs._callbacks) gs._callbacks.onPlayerDamage();
          if (p.hp <= 0 && gs._callbacks) gs._callbacks.endGame(false);
        }

        b.state = 'STUNNED';
        b.stateTimer = BOSS.stunTime * 1.5;
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

  // Apply velocity (skip during leap — position set directly)
  if (b.state !== 'LEAP') {
    b.vx = b.vx * 0.85 + targetVX * 0.15;
    b.vz = b.vz * 0.85 + targetVZ * 0.15;

    b.x += b.vx * dt;
    b.z += b.vz * dt;
  }

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
  if (b.state !== 'LEAP') {
    // Always face toward the player
    const faceRot = Math.atan2(dx, dz);
    let diff = faceRot - b.mesh.rotation.y;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    b.mesh.rotation.y += diff * 0.12;
  }

  // Leg animation — waddle (skip during leap)
  if (moveSpeed > 0.02 && b.legs && b.state !== 'LEAP' && b.state !== 'LEAP_WINDUP') {
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
