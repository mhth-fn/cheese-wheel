import { FIELD } from './constants.js';

export function updateHorseAI(gs, dt) {
  const p = gs.player;
  const currentChargeGroup = Math.floor(Date.now() / 5000) % 10;

  gs.enemies.forEach((e, idx) => {
    if (e.hp <= 0) return;

    const dx = p.x - e.x;
    const dz = p.z - e.z;
    const distToPlayer = Math.sqrt(dx * dx + dz * dz);
    const dirToPlayerX = distToPlayer > 0 ? dx / distToPlayer : 0;
    const dirToPlayerZ = distToPlayer > 0 ? dz / distToPlayer : 0;

    // Timers
    e.stateTimer -= dt;
    if (e.panicTimer > 0) e.panicTimer -= dt;
    if (e.attackCooldown > 0) e.attackCooldown -= dt;

    // Courage recovery
    if (e.panicTimer <= 0) {
      e.courage = Math.min(e.bravery, e.courage + 0.003 * dt);
    }

    let targetVX = 0, targetVZ = 0;
    let currentSpeed = e.speed;

    switch (e.state) {
      case 'IDLE': {
        currentSpeed = e.sprintSpeed * 0.8;
        targetVX = dirToPlayerX * currentSpeed;
        targetVZ = dirToPlayerZ * currentSpeed;

        if (distToPlayer < 12) {
          if (Math.random() < 0.4) {
            e.state = 'CHARGE';
            e.stateTimer = 60;
            e.chargeTarget = { x: p.x, z: p.z };
          } else {
            e.state = 'CIRCLE';
            e.stateTimer = 15 + Math.random() * 20;
            e.targetAngle = Math.atan2(e.z - p.z, e.x - p.x);
            e.circleRadius = 1.5 + Math.random() * 2.5;
          }
        }
        break;
      }

      case 'CIRCLE': {
        e.targetAngle += e.circleSpeed * 2.0 * dt * (idx % 2 === 0 ? 1 : -1);
        const circTargetX = p.x + Math.cos(e.targetAngle) * e.circleRadius;
        const circTargetZ = p.z + Math.sin(e.targetAngle) * e.circleRadius;

        const cdx = circTargetX - e.x;
        const cdz = circTargetZ - e.z;
        const cdist = Math.sqrt(cdx * cdx + cdz * cdz);
        if (cdist > 0.3) {
          targetVX = (cdx / cdist) * e.speed * 1.5;
          targetVZ = (cdz / cdist) * e.speed * 1.5;
        }

        const activeGroups = 6;
        const isMyGroupTurn = ((e.groupId % 10) >= currentChargeGroup && (e.groupId % 10) < currentChargeGroup + activeGroups) ||
                              ((e.groupId % 10) + 10 >= currentChargeGroup && (e.groupId % 10) + 10 < currentChargeGroup + activeGroups);
        const chargeChance = isMyGroupTurn ? 0.04 : 0.02;

        if (e.stateTimer <= 0 || Math.random() < chargeChance * dt) {
          e.state = 'CHARGE';
          e.stateTimer = 70;
          e.chargeTarget = { x: p.x, z: p.z };
        }

        if (distToPlayer > 14) {
          e.state = 'IDLE';
          e.stateTimer = 10;
        }
        break;
      }

      case 'CHARGE': {
        currentSpeed = e.sprintSpeed * 1.2;
        targetVX = dirToPlayerX * currentSpeed;
        targetVZ = dirToPlayerZ * currentSpeed;

        if (distToPlayer < 1.5) {
          e.state = 'ATTACK';
          e.stateTimer = 25 + Math.random() * 15;
        }

        if (e.stateTimer <= 0) {
          e.state = 'CIRCLE';
          e.stateTimer = 15 + Math.random() * 15;
          e.circleRadius = 2 + Math.random() * 2;
        }
        break;
      }

      case 'ATTACK': {
        targetVX = dirToPlayerX * e.speed * 0.8;
        targetVZ = dirToPlayerZ * e.speed * 0.8;

        if (distToPlayer < 1.5 && e.attackCooldown <= 0 && p.invincible <= 0) {
          const dmg = 3 + Math.random() * 3;
          p.hp -= dmg;
          e.attackCooldown = 25 + Math.random() * 15;
          p.damageFlash = 5;
          gs.cameraShake = 1.5;
          gs._callbacks.onPlayerDamage(dmg);

          if (p.hp <= 0) gs._callbacks.endGame(false);
        }

        if (distToPlayer > 3) {
          e.state = 'CHARGE';
          e.stateTimer = 50;
        }

        if (e.stateTimer <= 0) {
          e.state = 'CIRCLE';
          e.stateTimer = 10 + Math.random() * 15;
          e.circleRadius = 1.5 + Math.random() * 2;
        }
        break;
      }

      case 'RETREAT': {
        if (e.retreatDir) {
          currentSpeed = e.sprintSpeed * 0.9;
          targetVX = e.retreatDir.x * currentSpeed;
          targetVZ = e.retreatDir.z * currentSpeed;
        }

        if (e.stateTimer <= 0 || distToPlayer > 5) {
          e.state = 'CHARGE';
          e.stateTimer = 50;
          e.chargeTarget = { x: p.x, z: p.z };
        }
        break;
      }

      case 'FLEE': {
        currentSpeed = e.sprintSpeed * 1.1;
        let fleeX = -dirToPlayerX;
        let fleeZ = -dirToPlayerZ;
        if (e.lastSeenDeathX) {
          const fdx = e.x - e.lastSeenDeathX;
          const fdz = e.z - e.lastSeenDeathZ;
          const fdist = Math.sqrt(fdx * fdx + fdz * fdz);
          if (fdist > 0) {
            fleeX = fleeX * 0.5 + (fdx / fdist) * 0.5;
            fleeZ = fleeZ * 0.5 + (fdz / fdist) * 0.5;
          }
        }
        targetVX = fleeX * currentSpeed;
        targetVZ = fleeZ * currentSpeed;

        if (e.stateTimer <= 0) {
          e.courage = Math.min(e.bravery, e.courage + 0.3);
          e.state = 'CHARGE';
          e.stateTimer = 40 + Math.random() * 20;
          e.chargeTarget = { x: p.x, z: p.z };
        }
        break;
      }

      case 'STUNNED': {
        if (e.stateTimer <= 0) {
          e.state = 'RETREAT';
          e.stateTimer = 60;
          e.retreatDir = { x: -dirToPlayerX, z: -dirToPlayerZ };
        }
        break;
      }

      default:
        break;
    }

    // Apply velocity with smoothing
    e.vx = e.vx * 0.8 + targetVX * 0.2;
    e.vz = e.vz * 0.8 + targetVZ * 0.2;

    let newEX = e.x + e.vx * dt;
    let newEZ = e.z + e.vz * dt;

    // Inter-horse collision
    gs.enemies.forEach((other, otherIdx) => {
      if (other.hp <= 0 || idx === otherIdx) return;
      const odx = other.x - newEX;
      const odz = other.z - newEZ;
      const odist = Math.sqrt(odx * odx + odz * odz);
      if (odist < 0.7 && odist > 0) {
        const repel = (0.7 - odist) * 0.3;
        newEX -= (odx / odist) * repel;
        newEZ -= (odz / odist) * repel;
      }
    });

    // Field bounds
    e.x = Math.max(-FIELD.x, Math.min(FIELD.x, newEX));
    e.z = Math.max(-FIELD.z, Math.min(FIELD.z, newEZ));

    // Mesh position & rotation
    e.mesh.position.x = e.x;
    e.mesh.position.z = e.z;

    const moveSpeed = Math.sqrt(e.vx * e.vx + e.vz * e.vz);
    if (moveSpeed > 0.01) {
      const targetRot = Math.atan2(-e.vx, -e.vz);
      let diff = targetRot - e.mesh.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      e.mesh.rotation.y += diff * 0.1;
    }

    // Leg animation (gallop)
    if (moveSpeed > 0.02) {
      e.animPhase += moveSpeed * 8 * dt;
      const legSwing = 0.5;
      if (e.legs && e.legs.length === 4) {
        e.legs[0].rotation.x = Math.sin(e.animPhase) * legSwing;
        e.legs[1].rotation.x = Math.sin(e.animPhase + Math.PI) * legSwing;
        e.legs[2].rotation.x = Math.sin(e.animPhase + Math.PI) * legSwing;
        e.legs[3].rotation.x = Math.sin(e.animPhase) * legSwing;
        e.mesh.position.y = Math.abs(Math.sin(e.animPhase * 2)) * 0.04;
      }
    } else {
      if (e.legs) {
        e.legs.forEach(leg => { leg.rotation.x *= 0.9; });
      }
    }

    // Tail animation
    if (e.tail) {
      e.tail.rotation.x = Math.sin(Date.now() * 0.005 + idx) * 0.3;
    }

    // Head looks at player when close
    if (e.head && distToPlayer < 8) {
      const lookAngle = Math.atan2(dx, dz) - e.mesh.rotation.y;
      e.head.rotation.y = Math.max(-0.5, Math.min(0.5, lookAngle * 0.3));
    }
  });
}

export function updateRagdolls(gs) {
  gs.enemies.forEach(e => {
    if (!e.dead) return;
    e.deathFrame++;
    e.deathVY -= 0.005;
    e.mesh.position.x += e.deathVX;
    e.mesh.position.y += e.deathVY;
    e.mesh.position.z += e.deathVZ;
    e.mesh.rotation.x += e.deathSpin;
    e.mesh.rotation.z += e.deathSpin * 0.7;
    if (e.mesh.position.y < 0) {
      e.mesh.position.y = 0;
      e.deathVY = Math.abs(e.deathVY) * 0.3;
      e.deathVX *= 0.5;
      e.deathVZ *= 0.5;
      e.deathSpin *= 0.5;
    }
    const fade = 1.0 - (e.deathFrame / e.deathMaxFrames);
    e.mesh.traverse(child => {
      if (child.material) {
        child.material.transparent = true;
        child.material.opacity = Math.max(0, fade);
      }
    });
    if (e.deathFrame >= e.deathMaxFrames) {
      e.mesh.visible = false;
      e.dead = false;
    }
  });
}

export function triggerHorseDeath(gs, THREE, enemy, player) {
  enemy.hp = 0;
  gs.kills++;

  // Ragdoll launch
  const knockDirX = enemy.x - player.x;
  const knockDirZ = enemy.z - player.z;
  const knockDist = Math.sqrt(knockDirX * knockDirX + knockDirZ * knockDirZ) || 1;
  enemy.dead = true;
  enemy.deathVX = (knockDirX / knockDist) * 0.3 + (Math.random() - 0.5) * 0.1;
  enemy.deathVY = 0.15 + Math.random() * 0.1;
  enemy.deathVZ = (knockDirZ / knockDist) * 0.3 + (Math.random() - 0.5) * 0.1;
  enemy.deathSpin = (Math.random() - 0.5) * 0.3;
  enemy.deathFrame = 0;
  enemy.deathMaxFrames = 60;

  // Gore floor mark
  const goreGeom = new THREE.CircleGeometry(0.4 + Math.random() * 0.3, 12);
  const goreMat = new THREE.MeshBasicMaterial({ color: 0x880000, transparent: true, opacity: 0.7 });
  const goreMark = new THREE.Mesh(goreGeom, goreMat);
  goreMark.rotation.x = -Math.PI / 2;
  goreMark.position.set(enemy.x, 0.01, enemy.z);
  gs.scene.add(goreMark);

  // Nearby horses react
  const deathX = enemy.x;
  const deathZ = enemy.z;
  gs.enemies.forEach(other => {
    if (other.hp <= 0 || other === enemy) return;
    const ddx = other.x - deathX;
    const ddz = other.z - deathZ;
    const ddist = Math.sqrt(ddx * ddx + ddz * ddz);
    if (ddist < 2.0) {
      other.panicTimer = 10 + Math.random() * 10;
      other.courage = Math.max(0.3, other.courage - 0.05);
      other.lastSeenDeathX = deathX;
      other.lastSeenDeathZ = deathZ;
      other.state = 'FLEE';
      other.stateTimer = 20 + Math.random() * 15;
    } else if (ddist < 4) {
      other.state = 'CHARGE';
      other.stateTimer = 40;
      other.chargeTarget = { x: player.x, z: player.z };
    }
  });
}
