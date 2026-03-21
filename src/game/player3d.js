import { FIELD, PLAYER_3D, BOSS } from './constants.js';

export function updatePlayer3D(gs, THREE, dt) {
  const p = gs.player;

  // Camera rotation
  gs.camera.rotation.order = 'YXZ';
  gs.camera.rotation.y = p.yaw;
  gs.camera.rotation.x = p.pitch;

  // Camera shake
  if (gs.cameraShake > 0.01) {
    gs.camera.rotation.x += (Math.random() - 0.5) * gs.cameraShake * 0.05;
    gs.camera.rotation.y += (Math.random() - 0.5) * gs.cameraShake * 0.05;
    gs.cameraShake *= gs.cameraShakeDecay;
  }

  // Forward/right vectors
  const cameraDir = new THREE.Vector3();
  gs.camera.getWorldDirection(cameraDir);
  const forward = new THREE.Vector3(cameraDir.x, 0, cameraDir.z).normalize();
  const right = new THREE.Vector3();
  right.crossVectors(new THREE.Vector3(0, 1, 0), forward).normalize().negate();

  // Nearby enemies count (surround slowdown)
  let nearCount = 0;
  gs.enemies.forEach(e => {
    if (e.hp <= 0) return;
    const dx = e.x - p.x;
    const dz = e.z - p.z;
    if (Math.sqrt(dx * dx + dz * dz) < 3) nearCount++;
  });
  p.nearbyEnemies = nearCount;

  if (nearCount > 5) {
    p.surroundSlowdown = Math.max(0.25, 1.0 - (nearCount - 5) * 0.06);
  } else {
    p.surroundSlowdown = Math.min(1.0, p.surroundSlowdown + 0.02);
  }

  // WASD movement with inertia
  let inputX = 0, inputZ = 0;
  if (gs.keys['KeyW'] || gs.keys['ArrowUp']) { inputX += forward.x; inputZ += forward.z; }
  if (gs.keys['KeyS'] || gs.keys['ArrowDown']) { inputX -= forward.x; inputZ -= forward.z; }
  if (gs.keys['KeyA'] || gs.keys['ArrowLeft']) { inputX -= right.x; inputZ -= right.z; }
  if (gs.keys['KeyD'] || gs.keys['ArrowRight']) { inputX += right.x; inputZ += right.z; }

  p.isMoving = (inputX !== 0 || inputZ !== 0);

  if (p.isMoving) {
    const len = Math.sqrt(inputX * inputX + inputZ * inputZ);
    const accel = p.speed * p.surroundSlowdown * dt * 0.15;
    p.vx += (inputX / len) * accel;
    p.vz += (inputZ / len) * accel;
  }

  // Friction
  const frictionFactor = p.onGround ? p.friction : 0.96;
  p.vx *= frictionFactor;
  p.vz *= frictionFactor;

  // Clamp velocity
  const maxSpd = p.speed * p.surroundSlowdown;
  const curSpd = Math.sqrt(p.vx * p.vx + p.vz * p.vz);
  if (curSpd > maxSpd) {
    p.vx = (p.vx / curSpd) * maxSpd;
    p.vz = (p.vz / curSpd) * maxSpd;
  }

  // Collision with live enemies
  let newX = p.x + p.vx * dt;
  let newZ = p.z + p.vz * dt;
  let pushbackX = 0, pushbackZ = 0;

  gs.enemies.forEach(e => {
    if (e.hp <= 0) return;
    const dx = e.x - newX;
    const dz = e.z - newZ;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 0.6 && dist > 0) {
      const push = (0.6 - dist) * 0.5;
      pushbackX -= (dx / dist) * push;
      pushbackZ -= (dz / dist) * push;
      e.x += (dx / dist) * push * 0.3;
      e.z += (dz / dist) * push * 0.3;
      e.vx += (dx / dist) * 0.02;
      e.vz += (dz / dist) * 0.02;
    }
  });

  newX += pushbackX;
  newZ += pushbackZ;

  // Field bounds
  p.x = Math.max(-FIELD.x, Math.min(FIELD.x, newX));
  p.z = Math.max(-FIELD.z, Math.min(FIELD.z, newZ));

  // Jump
  if (gs.keys['Space'] && p.onGround) {
    p.vy = p.jumpForce;
    p.onGround = false;
  }

  // Gravity
  if (!p.onGround) {
    p.vy -= p.gravity * dt;
    p.y += p.vy * dt;
    if (p.y <= 0) {
      p.y = 0;
      p.vy = 0;
      p.onGround = true;
    }
  }

  // Camera position with head bob
  let bobY = 0, bobX = 0;
  if (p.isMoving && p.onGround) {
    p.walkCycle += curSpd * 5 * dt;
    bobY = Math.sin(p.walkCycle) * 0.04;
    bobX = Math.cos(p.walkCycle * 0.5) * 0.02;
  }
  gs.camera.position.x = p.x + bobX;
  gs.camera.position.y = 1.7 + p.y + bobY;
  gs.camera.position.z = p.z;

  // Cooldowns
  if (p.attackCooldown > 0) p.attackCooldown -= dt;
  if (p.invincible > 0) p.invincible -= dt;
  if (p.damageFlash > 0) p.damageFlash -= dt;

  // Damage flash
  if (p.damageFlash > 0) {
    gs.scene.background = new THREE.Color(0xAA4444);
    gs.scene.fog.color = new THREE.Color(0xAA4444);
  } else {
    gs.scene.background = new THREE.Color(0x87CEEB);
    gs.scene.fog.color = new THREE.Color(0x87CEEB);
  }

  return { forward, curSpd };
}

export function updatePunchAnimation(gs, THREE, forward, callbacks) {
  const p = gs.player;
  const isSpear = gs.bossPhase;
  const animFrames = isSpear ? BOSS.spearAnimFrames : PLAYER_3D.punchAnimFrames;

  if (p.attackAnim > 0) {
    const t = (animFrames - p.attackAnim) / animFrames;

    if (isSpear) {
      // Spear thrust animation — forward jab
      const thrust = Math.sin(t * Math.PI) * 1.0;
      const lift = Math.sin(t * Math.PI) * 0.05;
      gs.handMesh.position.z = -0.6 - thrust;
      gs.handMesh.position.y = -0.2 + lift;
      gs.handMesh.rotation.x = -0.2 - Math.sin(t * Math.PI) * 0.15;
    } else {
      // Punch animation
      const punchForward = Math.sin(t * Math.PI) * 0.6;
      const punchUp = Math.sin(t * Math.PI) * 0.15;
      gs.handMesh.position.z = -0.6 - punchForward;
      gs.handMesh.position.y = -0.3 + punchUp;
      gs.handMesh.rotation.x = -0.3 - Math.sin(t * Math.PI) * 0.5;
    }
    p.attackAnim--;

    // Damage at mid-animation
    if (p.attackAnim === Math.floor(animFrames / 2)) {
      if (isSpear) {
        let hitSomething = false;

        // Boss hit check
        if (gs.boss && gs.boss.hp > 0) {
          const dx = gs.boss.x - p.x;
          const dz = gs.boss.z - p.z;
          const dist = Math.sqrt(dx * dx + dz * dz);
          const toEnemy = new THREE.Vector3(dx, 0, dz).normalize();
          const dot = forward.dot(toEnemy);
          if (dist < BOSS.spearReach && dot > 0.2) {
            callbacks.onBossHit();
            hitSomething = true;
          }
        }

        // Duckling hit check
        if (!hitSomething && gs.ducklings) {
          let closestDuckling = null;
          let closestDist = Infinity;
          gs.ducklings.forEach(d => {
            if (d.hp <= 0) return;
            const ddx = d.x - p.x;
            const ddz = d.z - p.z;
            const ddist = Math.sqrt(ddx * ddx + ddz * ddz);
            const toD = new THREE.Vector3(ddx, 0, ddz).normalize();
            const dot = forward.dot(toD);
            if (ddist < BOSS.spearReach && dot > 0.2 && ddist < closestDist) {
              closestDist = ddist;
              closestDuckling = d;
            }
          });
          if (closestDuckling) {
            callbacks.onDucklingHit(closestDuckling);
            hitSomething = true;
          }
        }

        if (!hitSomething) {
          callbacks.onMiss(p.x + forward.x * 2.0, p.z + forward.z * 2.0);
        }
      } else if (!isSpear) {
        // Horse hit check
        let closestEnemy = null;
        let closestDist = Infinity;

        gs.enemies.forEach(e => {
          if (e.hp <= 0) return;
          const dx = e.x - p.x;
          const dz = e.z - p.z;
          const dist = Math.sqrt(dx * dx + dz * dz);
          const toEnemy = new THREE.Vector3(dx, 0, dz).normalize();
          const dot = forward.dot(toEnemy);
          const verticalOk = p.y < 2.0;

          if (dist < 3.5 && dot > 0.2 && verticalOk && dist < closestDist) {
            closestDist = dist;
            closestEnemy = e;
          }
        });

        if (closestEnemy) {
          callbacks.onHit(closestEnemy);
        } else {
          callbacks.onMiss(p.x + forward.x * 1.5, p.z + forward.z * 1.5);
        }
      }
    }
  } else {
    // Idle sway
    const sway = Math.sin(Date.now() * 0.002) * 0.01;
    if (isSpear) {
      gs.handMesh.position.set(0.3, -0.2 + sway, -0.6);
      gs.handMesh.rotation.x = -0.2;
    } else {
      gs.handMesh.position.set(0.4, -0.3 + sway, -0.6);
      gs.handMesh.rotation.x = -0.3;
    }
  }
}
