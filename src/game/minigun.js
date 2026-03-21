import { FIELD } from './constants.js';
import { triggerHorseDeath } from './horseAI.js';
import { spawnParticles } from './particles.js';

const MINIGUN = {
  fireRate: 3,        // frames between shots
  range: 30,          // max range
  spread: 0.08,       // bullet spread angle
  bulletSpeed: 2.0,   // units per frame
  bulletLife: 20,      // frames
  damage: 1,
  recoilShake: 0.3,
};

export function createMinigunHand(gs, THREE) {
  if (gs.minigunHand) {
    gs.camera.remove(gs.minigunHand);
  }

  const group = new THREE.Group();

  // Forearm
  const arm = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.45, 0.14),
    new THREE.MeshLambertMaterial({ color: 0xFFDAB9 })
  );
  arm.position.set(0, -0.05, 0);
  group.add(arm);

  // Grip hand
  const grip = new THREE.Mesh(
    new THREE.SphereGeometry(0.07, 8, 8),
    new THREE.MeshLambertMaterial({ color: 0xFFDAB9 })
  );
  grip.position.set(0, -0.3, 0);
  group.add(grip);

  // Gun body
  const gunMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.12, 0.5), gunMat);
  body.position.set(0, -0.32, -0.4);
  group.add(body);

  // Barrel cluster (6 barrels in a circle)
  const barrelMat = new THREE.MeshLambertMaterial({ color: 0x555555 });
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015, 0.015, 0.6, 4),
      barrelMat
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(
      Math.cos(angle) * 0.04,
      -0.32 + Math.sin(angle) * 0.04,
      -0.9
    );
    group.add(barrel);
  }

  // Barrel shroud
  const shroud = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.07, 0.55, 8),
    new THREE.MeshLambertMaterial({ color: 0x444444, transparent: true, opacity: 0.6 })
  );
  shroud.rotation.x = Math.PI / 2;
  shroud.position.set(0, -0.32, -0.85);
  group.add(shroud);

  // Muzzle flash placeholder (hidden by default)
  const flashMat = new THREE.MeshBasicMaterial({ color: 0xFFFF00, transparent: true, opacity: 0 });
  const flash = new THREE.Mesh(new THREE.SphereGeometry(0.06, 4, 4), flashMat);
  flash.position.set(0, -0.32, -1.2);
  group.add(flash);

  group.position.set(0.35, -0.25, -0.5);
  group.rotation.x = -0.15;

  gs.camera.add(group);
  gs.minigunHand = group;
  gs.minigunFlash = flash;
  gs.minigunBarrelAngle = 0;

  return group;
}

export function removeMinigunHand(gs) {
  if (gs.minigunHand) {
    gs.camera.remove(gs.minigunHand);
    gs.minigunHand = null;
    gs.minigunFlash = null;
  }
}

// Shared bullet geometry
let bulletGeom = null;

export function updateMinigun(gs, THREE, forward, dt) {
  if (!gs.minigunActive || gs.bossPhase) return;

  if (!gs.minigunBullets) gs.minigunBullets = [];
  if (!gs.minigunCooldown) gs.minigunCooldown = 0;

  const p = gs.player;

  // Barrel spin animation
  if (gs.minigunHand) {
    gs.minigunBarrelAngle = (gs.minigunBarrelAngle || 0) + 0.3 * dt;
    // Rotate all barrel meshes visually (the group children 3-8 are barrels)
    const children = gs.minigunHand.children;
    for (let i = 3; i < 9 && i < children.length; i++) {
      // Spin each barrel around the z-axis cluster
      const angle = gs.minigunBarrelAngle + ((i - 3) / 6) * Math.PI * 2;
      children[i].position.x = Math.cos(angle) * 0.04;
      children[i].position.y = -0.32 + Math.sin(angle) * 0.04;
    }
  }

  // Fire
  gs.minigunCooldown -= dt;
  if (gs.minigunCooldown <= 0) {
    gs.minigunCooldown = MINIGUN.fireRate;

    // Spawn bullet
    if (!bulletGeom) {
      bulletGeom = new THREE.SphereGeometry(0.03, 3, 3);
    }

    const spreadX = (Math.random() - 0.5) * MINIGUN.spread;
    const spreadY = (Math.random() - 0.5) * MINIGUN.spread;

    const dir = forward.clone();
    dir.x += spreadX;
    dir.z += spreadY;
    dir.normalize();

    const mat = new THREE.MeshBasicMaterial({ color: 0xFFFF00 });
    const bullet = new THREE.Mesh(bulletGeom, mat);
    bullet.position.set(p.x + dir.x * 0.5, 1.5 + p.y, p.z + dir.z * 0.5);
    gs.scene.add(bullet);

    gs.minigunBullets.push({
      mesh: bullet,
      dx: dir.x * MINIGUN.bulletSpeed,
      dz: dir.z * MINIGUN.bulletSpeed,
      life: MINIGUN.bulletLife
    });

    // Muzzle flash
    if (gs.minigunFlash) {
      gs.minigunFlash.material.opacity = 0.8;
    }

    // Recoil shake
    gs.cameraShake = Math.max(gs.cameraShake, MINIGUN.recoilShake);

    // Gun sway
    if (gs.minigunHand) {
      gs.minigunHand.position.z = -0.5 + (Math.random() - 0.5) * 0.02;
      gs.minigunHand.position.y = -0.25 + (Math.random() - 0.5) * 0.01;
    }
  }

  // Fade muzzle flash
  if (gs.minigunFlash && gs.minigunFlash.material.opacity > 0) {
    gs.minigunFlash.material.opacity *= 0.7;
  }

  // Update bullets
  for (let i = gs.minigunBullets.length - 1; i >= 0; i--) {
    const b = gs.minigunBullets[i];
    b.mesh.position.x += b.dx * dt;
    b.mesh.position.z += b.dz * dt;
    b.life -= dt;

    // Check hit against enemies
    let hit = false;
    for (let ei = 0; ei < gs.enemies.length; ei++) {
      const e = gs.enemies[ei];
      if (e.hp <= 0) continue;
      const ex = e.x - b.mesh.position.x;
      const ez = e.z - b.mesh.position.z;
      const dist = Math.sqrt(ex * ex + ez * ez);
      if (dist < 0.6) {
        // Kill the horse
        triggerHorseDeath(gs, THREE, e, p);
        spawnParticles(gs, THREE, e.x, 0.4, e.z, 0xCC0000, 8, 0.2);
        spawnParticles(gs, THREE, e.x, 0.3, e.z, 0xFF0000, 5, 0.15);
        gs._callbacks && gs._callbacks.onMinigunKill && gs._callbacks.onMinigunKill();
        hit = true;
        break;
      }
    }

    if (hit || b.life <= 0) {
      gs.scene.remove(b.mesh);
      b.mesh.material.dispose();
      gs.minigunBullets.splice(i, 1);
    }
  }
}

export function cleanupMinigun(gs) {
  if (gs.minigunBullets) {
    gs.minigunBullets.forEach(b => {
      gs.scene.remove(b.mesh);
      b.mesh.material.dispose();
    });
    gs.minigunBullets = [];
  }
  removeMinigunHand(gs);
  gs.minigunActive = false;
}
