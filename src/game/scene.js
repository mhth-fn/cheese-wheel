import { HORSE_COLORS, TOTAL_ENEMIES, PLAYER_3D, BOSS } from './constants.js';

export function initScene(gs, THREE, canvas, container) {
  const width = Math.max(container.clientWidth, 800);
  const height = Math.max(container.clientHeight - 90, 400);

  // Scene
  gs.scene = new THREE.Scene();
  gs.scene.background = new THREE.Color(0x87CEEB);
  gs.scene.fog = new THREE.FogExp2(0x87CEEB, 0.012);

  // Camera
  gs.camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);

  // Renderer
  gs.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  gs.renderer.setSize(width, height);
  gs.renderer.shadowMap.enabled = true;
  gs.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // Lighting
  gs.scene.add(new THREE.AmbientLight(0xffffff, 0.5));

  const dirLight = new THREE.DirectionalLight(0xfff5e0, 0.9);
  dirLight.position.set(30, 50, 30);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.width = 2048;
  dirLight.shadow.mapSize.height = 2048;
  dirLight.shadow.camera.near = 0.5;
  dirLight.shadow.camera.far = 200;
  dirLight.shadow.camera.left = -60;
  dirLight.shadow.camera.right = 60;
  dirLight.shadow.camera.top = 60;
  dirLight.shadow.camera.bottom = -60;
  gs.scene.add(dirLight);

  gs.scene.add(new THREE.HemisphereLight(0x87CEEB, 0x556B2F, 0.3));

  // Field
  const fieldGeometry = new THREE.PlaneGeometry(140, 100, 40, 40);
  const vertices = fieldGeometry.attributes.position.array;
  for (let i = 0; i < vertices.length; i += 3) {
    if (Math.abs(vertices[i]) < 56 && Math.abs(vertices[i + 1]) < 36) {
      vertices[i + 2] += (Math.random() - 0.5) * 0.08;
    }
  }
  fieldGeometry.computeVertexNormals();
  const field = new THREE.Mesh(fieldGeometry, new THREE.MeshLambertMaterial({ color: 0x3a7a30 }));
  field.rotation.x = -Math.PI / 2;
  field.receiveShadow = true;
  gs.scene.add(field);

  // Dirt surround
  const dirt = new THREE.Mesh(
    new THREE.PlaneGeometry(160, 120),
    new THREE.MeshLambertMaterial({ color: 0x5a4a2a })
  );
  dirt.rotation.x = -Math.PI / 2;
  dirt.position.y = -0.02;
  dirt.receiveShadow = true;
  gs.scene.add(dirt);

  // Field lines
  const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 2 });
  const borderPts = [
    new THREE.Vector3(-55, 0.05, -35), new THREE.Vector3(55, 0.05, -35),
    new THREE.Vector3(55, 0.05, 35), new THREE.Vector3(-55, 0.05, 35),
    new THREE.Vector3(-55, 0.05, -35)
  ];
  gs.scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(borderPts), lineMat));
  gs.scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0.05, -35), new THREE.Vector3(0, 0.05, 35)
  ]), lineMat));

  const circlePts = [];
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    circlePts.push(new THREE.Vector3(Math.cos(a) * 9.15, 0.05, Math.sin(a) * 9.15));
  }
  gs.scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(circlePts), lineMat));

  // Goal posts
  const goalPostMat = new THREE.MeshLambertMaterial({ color: 0xeeeeee });
  [[-55, 0], [55, 0]].forEach(([gx, gz]) => {
    const post1 = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.5, 8), goalPostMat);
    post1.position.set(gx, 1.25, gz - 4);
    gs.scene.add(post1);
    const post2 = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.5, 8), goalPostMat);
    post2.position.set(gx, 1.25, gz + 4);
    gs.scene.add(post2);
    const crossbar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 8, 8), goalPostMat);
    crossbar.rotation.x = Math.PI / 2;
    crossbar.position.set(gx, 2.5, gz);
    gs.scene.add(crossbar);
  });
}

export function createPlayerHand(gs, THREE) {
  const handGroup = new THREE.Group();

  // Forearm
  const arm = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.45, 0.14),
    new THREE.MeshLambertMaterial({ color: 0xFFDAB9 })
  );
  arm.position.set(0, -0.05, 0);
  handGroup.add(arm);

  // Fist (glove)
  const gloveMat = new THREE.MeshLambertMaterial({ color: 0x8B6914 });
  const fist = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), gloveMat);
  fist.position.set(0, -0.32, 0);
  handGroup.add(fist);

  // Knuckles
  for (let i = -1; i <= 1; i++) {
    const knuckle = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), gloveMat);
    knuckle.position.set(i * 0.04, -0.4, 0.05);
    handGroup.add(knuckle);
  }

  handGroup.position.set(0.4, -0.3, -0.6);
  handGroup.rotation.x = -0.3;
  gs.camera.add(handGroup);
  gs.scene.add(gs.camera);
  gs.handMesh = handGroup;

  // Crosshair
  const crosshairGroup = new THREE.Group();
  const chMat = new THREE.LineBasicMaterial({ color: 0xffffff });
  const size = 0.008;
  const gap = 0.003;
  [[gap, 0, size, 0], [-gap, 0, -size, 0], [0, gap, 0, size], [0, -gap, 0, -size]].forEach(([x1, y1, x2, y2]) => {
    const pts = [new THREE.Vector3(x1, y1, -0.5), new THREE.Vector3(x2, y2, -0.5)];
    crosshairGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), chMat));
  });
  gs.camera.add(crosshairGroup);
}

export function createHorseMesh(THREE, color) {
  const horseGroup = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x2a1a0a });

  // Body
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.3, 0.3), bodyMat);
  body.position.y = 0.35;
  body.castShadow = true;
  horseGroup.add(body);

  // Neck
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.25, 0.12), bodyMat);
  neck.position.set(0.35, 0.5, 0);
  neck.rotation.z = -0.4;
  horseGroup.add(neck);

  // Head
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.18, 0.17), bodyMat);
  head.position.set(0.48, 0.55, 0);
  horseGroup.add(head);

  // Nose
  const nose = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.1, 0.13),
    new THREE.MeshLambertMaterial({ color: 0xDEB887 })
  );
  nose.position.set(0.6, 0.5, 0);
  horseGroup.add(nose);

  // Eyes
  const eyeMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const eye1 = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 6), eyeMat);
  eye1.position.set(0.52, 0.59, 0.08);
  horseGroup.add(eye1);
  const eye2 = eye1.clone();
  eye2.position.z = -0.08;
  horseGroup.add(eye2);

  // Ears
  const earGeom = new THREE.CylinderGeometry(0.01, 0.03, 0.1, 4);
  const ear1 = new THREE.Mesh(earGeom, bodyMat);
  ear1.position.set(0.45, 0.67, 0.05);
  ear1.rotation.z = 0.3;
  horseGroup.add(ear1);
  const ear2 = ear1.clone();
  ear2.position.z = -0.05;
  horseGroup.add(ear2);

  // Legs
  const legGeom = new THREE.CylinderGeometry(0.035, 0.03, 0.3, 6);
  const legs = [];
  const legPositions = [[-0.22, 0.15, 0.1], [-0.22, 0.15, -0.1], [0.22, 0.15, 0.1], [0.22, 0.15, -0.1]];
  legPositions.forEach(pos => {
    const leg = new THREE.Mesh(legGeom, bodyMat);
    leg.position.set(...pos);
    horseGroup.add(leg);
    legs.push(leg);
  });

  // Hooves
  const hoofMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
  legPositions.forEach(pos => {
    const hoof = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.04, 6), hoofMat);
    hoof.position.set(pos[0], 0.02, pos[2]);
    horseGroup.add(hoof);
  });

  // Tail
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.025, 0.2, 4), darkMat);
  tail.position.set(-0.4, 0.4, 0);
  tail.rotation.z = 0.8;
  horseGroup.add(tail);

  // Mane
  const mane = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.04), darkMat);
  mane.position.set(0.3, 0.58, 0);
  horseGroup.add(mane);

  return { mesh: horseGroup, legs, tail, head, neck };
}

export function spawnHorses(gs, THREE) {
  gs.enemyMeshes = [];

  for (let i = 0; i < TOTAL_ENEMIES; i++) {
    const color = HORSE_COLORS[Math.floor(Math.random() * HORSE_COLORS.length)];
    const { mesh: horseGroup, legs, tail, head, neck } = createHorseMesh(THREE, color);

    // Starting position - spread across right half of field
    const angle = (i / TOTAL_ENEMIES) * Math.PI * 2;
    const radius = 25 + Math.random() * 25;
    const startX = 20 + Math.cos(angle) * radius * 0.5;
    const startZ = Math.sin(angle) * radius * 0.6;

    horseGroup.position.set(
      Math.max(-52, Math.min(52, startX)),
      0,
      Math.max(-32, Math.min(32, startZ))
    );
    gs.scene.add(horseGroup);
    gs.enemyMeshes.push(horseGroup);

    const bravery = 0.6 + Math.random() * 0.4;

    gs.enemies.push({
      x: horseGroup.position.x,
      z: horseGroup.position.z,
      hp: 1,
      speed: 0.07 + Math.random() * 0.05,
      sprintSpeed: 0.18 + Math.random() * 0.08,
      attackCooldown: 0,
      mesh: horseGroup,
      legs, tail, head, neck,
      state: 'IDLE',
      stateTimer: Math.random() * 30,
      bravery,
      courage: bravery,
      targetAngle: Math.random() * Math.PI * 2,
      chargeTarget: null,
      retreatDir: null,
      circleRadius: 3 + Math.random() * 4,
      circleSpeed: 0.003 + Math.random() * 0.004,
      animPhase: Math.random() * Math.PI * 2,
      idleWanderTarget: null,
      panicTimer: 0,
      lastSeenDeathX: 0,
      lastSeenDeathZ: 0,
      groupId: Math.floor(i / 10),
      vx: 0, vz: 0
    });
  }
}

export function initPlayer3D(gs) {
  gs.player = {
    x: -45, z: 0,
    vx: 0, vz: 0,
    hp: PLAYER_3D.hp,
    maxHp: PLAYER_3D.maxHp,
    speed: PLAYER_3D.speed,
    friction: PLAYER_3D.friction,
    yaw: 0, pitch: 0,
    attacking: false,
    attackCooldown: 0,
    attackAnim: 0,
    invincible: 0,
    y: 0, vy: 0,
    onGround: true,
    jumpForce: PLAYER_3D.jumpForce,
    gravity: PLAYER_3D.gravity,
    walkCycle: 0,
    isMoving: false,
    surroundSlowdown: 1.0,
    nearbyEnemies: 0,
    damageFlash: 0
  };
  gs.camera.position.set(-45, 1.7, 0);
}

export function setupInputHandlers(gs, canvas, pointerLockMsgRef) {
  const handleCanvasClick = () => {
    if (gs.running) canvas.requestPointerLock();
  };
  canvas.addEventListener('click', handleCanvasClick);
  gs._handleCanvasClick = handleCanvasClick;

  const handlePointerLockChange = () => {
    gs.pointerLocked = document.pointerLockElement === canvas;
    if (pointerLockMsgRef.current) {
      pointerLockMsgRef.current.style.display = gs.pointerLocked ? 'none' : 'block';
    }
  };
  document.addEventListener('pointerlockchange', handlePointerLockChange);
  gs._handlePointerLockChange = handlePointerLockChange;

  const handleMouseMove = (e) => {
    if (gs.pointerLocked && gs.running && gs.mode === 'thirdperson') {
      const sensitivity = 0.002;
      gs.player.yaw -= e.movementX * sensitivity;
      gs.player.pitch -= e.movementY * sensitivity;
      gs.player.pitch = Math.max(-1.2, Math.min(1.0, gs.player.pitch));
    }
  };
  document.addEventListener('mousemove', handleMouseMove);
  gs._handleMouseMove = handleMouseMove;

  const handleMouseDown = (e) => {
    if (e.button === 0 && gs.running && gs.mode === 'thirdperson' && gs.pointerLocked) {
      const cooldown = gs.bossPhase ? BOSS.spearCooldown : PLAYER_3D.punchCooldown;
      const frames = gs.bossPhase ? BOSS.spearAnimFrames : PLAYER_3D.punchAnimFrames;
      if (gs.player.attackCooldown <= 0) {
        gs.player.attacking = true;
        gs.player.attackCooldown = cooldown;
        gs.player.attackAnim = frames;
      }
    }
  };
  canvas.addEventListener('mousedown', handleMouseDown);
  gs._handleMouseDown = handleMouseDown;

  if (pointerLockMsgRef.current) pointerLockMsgRef.current.style.display = 'block';
  gs.pointerLocked = false;
}

export function createDuckMesh(THREE) {
  const duck = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0xF5DEB3 });
  const whiteMat = new THREE.MeshLambertMaterial({ color: 0xFFFFF0 });
  const beakMat = new THREE.MeshLambertMaterial({ color: 0xFF8C00 });
  const eyeMat = new THREE.MeshLambertMaterial({ color: 0x880000 });
  const legMat = new THREE.MeshLambertMaterial({ color: 0xFF6600 });

  // Body — large oval
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), bodyMat);
  body.scale.set(1.3, 0.9, 1.0);
  body.position.y = 1.2;
  body.castShadow = true;
  duck.add(body);

  // Belly — white
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.85, 10, 8), whiteMat);
  belly.scale.set(1.1, 0.8, 0.9);
  belly.position.set(0, 0.95, 0.15);
  duck.add(belly);

  // Neck
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 0.7, 8), bodyMat);
  neck.position.set(0.7, 1.8, 0);
  neck.rotation.z = -0.5;
  duck.add(neck);

  // Head
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), bodyMat);
  head.position.set(1.0, 2.3, 0);
  duck.add(head);

  // Beak — flat wide
  const beak = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.35), beakMat);
  beak.position.set(1.45, 2.2, 0);
  duck.add(beak);

  // Eyes — angry red
  const eye1 = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), eyeMat);
  eye1.position.set(1.2, 2.45, 0.25);
  duck.add(eye1);
  const eye2 = eye1.clone();
  eye2.position.z = -0.25;
  duck.add(eye2);

  // Eyebrows — angry
  const browMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
  const brow1 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 0.06), browMat);
  brow1.position.set(1.22, 2.55, 0.25);
  brow1.rotation.z = 0.3;
  duck.add(brow1);
  const brow2 = brow1.clone();
  brow2.position.z = -0.25;
  brow2.rotation.z = -0.3;
  duck.add(brow2);

  // Legs
  const legs = [];
  const legGeom = new THREE.CylinderGeometry(0.1, 0.08, 0.8, 6);
  [0.3, -0.3].forEach(zOff => {
    const leg = new THREE.Mesh(legGeom, legMat);
    leg.position.set(0, 0.4, zOff);
    duck.add(leg);
    legs.push(leg);

    // Webbed foot
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, 0.3), legMat);
    foot.position.set(0.1, 0.05, zOff);
    duck.add(foot);
  });

  // Wings
  const wings = [];
  const wingMat = new THREE.MeshLambertMaterial({ color: 0xE8D5A0 });
  [-1, 1].forEach(side => {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.6, 0.8), wingMat);
    wing.position.set(-0.1, 1.3, side * 0.9);
    duck.add(wing);
    wings.push(wing);
  });

  // Tail feathers
  const tailMat = new THREE.MeshLambertMaterial({ color: 0xD4C490 });
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.5, 6), tailMat);
  tail.position.set(-1.2, 1.5, 0);
  tail.rotation.z = 1.2;
  duck.add(tail);

  return { mesh: duck, legs, head, tail, wings, neck };
}

export function createDucklingMesh(THREE) {
  const duck = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0xFFE44D });
  const beakMat = new THREE.MeshLambertMaterial({ color: 0xFF8C00 });
  const eyeMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const legMat = new THREE.MeshLambertMaterial({ color: 0xFF6600 });

  // Body — fluffy round
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), bodyMat);
  body.scale.set(1.1, 0.9, 1.0);
  body.position.y = 0.3;
  body.castShadow = true;
  duck.add(body);

  // Head
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), bodyMat);
  head.position.set(0.22, 0.5, 0);
  duck.add(head);

  // Beak
  const beak = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.1), beakMat);
  beak.position.set(0.36, 0.47, 0);
  duck.add(beak);

  // Eyes
  const eye1 = new THREE.Mesh(new THREE.SphereGeometry(0.025, 4, 4), eyeMat);
  eye1.position.set(0.3, 0.54, 0.08);
  duck.add(eye1);
  const eye2 = eye1.clone();
  eye2.position.z = -0.08;
  duck.add(eye2);

  // Legs
  const legs = [];
  const legGeom = new THREE.CylinderGeometry(0.025, 0.02, 0.15, 4);
  [0.08, -0.08].forEach(zOff => {
    const leg = new THREE.Mesh(legGeom, legMat);
    leg.position.set(0, 0.08, zOff);
    duck.add(leg);
    legs.push(leg);
  });

  // Tiny wings
  const wingMat = new THREE.MeshLambertMaterial({ color: 0xFFD700 });
  [-1, 1].forEach(side => {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.12, 0.18), wingMat);
    wing.position.set(-0.02, 0.32, side * 0.22);
    duck.add(wing);
  });

  return { mesh: duck, legs, head };
}

export function createSpearHand(gs, THREE) {
  // Remove old hand
  if (gs.handMesh) {
    gs.camera.remove(gs.handMesh);
  }

  const handGroup = new THREE.Group();

  // Forearm
  const arm = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.45, 0.14),
    new THREE.MeshLambertMaterial({ color: 0xFFDAB9 })
  );
  arm.position.set(0, -0.05, 0);
  handGroup.add(arm);

  // Grip hand
  const gripMat = new THREE.MeshLambertMaterial({ color: 0xFFDAB9 });
  const grip = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), gripMat);
  grip.position.set(0, -0.3, 0);
  handGroup.add(grip);

  // Spear shaft
  const shaftMat = new THREE.MeshLambertMaterial({ color: 0x8B4513 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.0, 6), shaftMat);
  shaft.rotation.x = Math.PI / 2;
  shaft.position.set(0, -0.3, -0.7);
  handGroup.add(shaft);

  // Spear head
  const headMat = new THREE.MeshLambertMaterial({ color: 0xC0C0C0 });
  const spearHead = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.25, 6), headMat);
  spearHead.rotation.x = -Math.PI / 2;
  spearHead.position.set(0, -0.3, -1.7);
  handGroup.add(spearHead);

  handGroup.position.set(0.3, -0.2, -0.6);
  handGroup.rotation.x = -0.2;
  gs.camera.add(handGroup);
  gs.handMesh = handGroup;
}
