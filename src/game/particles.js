export function spawnParticles(gs, THREE, x, y, z, color, count, spread) {
  if (!THREE || !gs.scene) return;

  for (let i = 0; i < count; i++) {
    const geom = new THREE.SphereGeometry(0.03 + Math.random() * 0.04, 4, 4);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set(x, y, z);
    gs.scene.add(mesh);
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
      gs.scene.remove(p.mesh);
      p.mesh.geometry.dispose();
      p.mesh.material.dispose();
      gs.particles.splice(i, 1);
    }
  }
}
