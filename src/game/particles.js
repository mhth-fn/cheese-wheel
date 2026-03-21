// Shared geometry for all particles — one allocation, reused everywhere
let PARTICLE_GEOM = null;

// Pool of inactive particle meshes ready for reuse
const particlePool = [];
const MAX_POOL = 200;

function getParticleMesh(THREE, gs, color) {
  if (!PARTICLE_GEOM) {
    PARTICLE_GEOM = new THREE.SphereGeometry(0.04, 4, 4);
  }

  let mesh;
  if (particlePool.length > 0) {
    mesh = particlePool.pop();
    mesh.material.color.set(color);
    mesh.material.opacity = 1;
    mesh.visible = true;
  } else {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 });
    mesh = new THREE.Mesh(PARTICLE_GEOM, mat);
  }
  gs.scene.add(mesh);
  return mesh;
}

function releaseParticleMesh(gs, mesh) {
  gs.scene.remove(mesh);
  if (particlePool.length < MAX_POOL) {
    mesh.visible = false;
    particlePool.push(mesh);
  } else {
    mesh.material.dispose();
  }
}

export function spawnParticles(gs, THREE, x, y, z, color, count, spread) {
  if (!THREE || !gs.scene) return;

  for (let i = 0; i < count; i++) {
    const mesh = getParticleMesh(THREE, gs, color);
    mesh.position.set(x, y, z);
    gs.particles.push({
      mesh,
      vx: (Math.random() - 0.5) * spread,
      vy: Math.random() * spread * 0.8,
      vz: (Math.random() - 0.5) * spread,
      life: 30 + Math.random() * 20,
      maxLife: 50
    });
  }
}

export function updateParticles(gs) {
  for (let i = gs.particles.length - 1; i >= 0; i--) {
    const p = gs.particles[i];
    p.mesh.position.x += p.vx;
    p.mesh.position.y += p.vy;
    p.mesh.position.z += p.vz;
    p.vy -= 0.004;
    p.life--;
    p.mesh.material.opacity = p.life / p.maxLife;
    if (p.life <= 0) {
      releaseParticleMesh(gs, p.mesh);
      gs.particles.splice(i, 1);
    }
  }
}
