export const FIELD = { x: 54, z: 34 };
export const TOTAL_ENEMIES = 100;

export const PLAYER_2D = {
  speed: 5,
  hp: 100,
  maxHp: 100
};

export const PLAYER_3D = {
  hp: 100,
  maxHp: 100,
  stamina: 100,
  maxStamina: 100,
  speed: 0.45,
  friction: 0.82,
  jumpForce: 0.13,
  gravity: 0.018,
  staminaRegen: 0.06,
  staminaCostPunch: 12,
  staminaCostJump: 10,
  punchCooldown: 12,
  punchAnimFrames: 12
};

export const HORSE_COLORS = [
  0x8B4513, 0x6B3410, 0xA0522D, 0x704020,
  0x5C3317, 0xD2691E, 0x964B00, 0x3D2B1F
];

export const BOSS = {
  hp: 15,
  speed: 0.12,
  sprintSpeed: 0.25,
  damage: 15,
  attackCooldown: 40,
  roarTime: 90,
  stunTime: 20,
  spearReach: 5.5,
  spearCooldown: 18,
  spearAnimFrames: 16,
  staminaCostSpear: 8,
  musicUrl: 'https://www.youtube.com/embed/5qRHrA4wUQQ?autoplay=1&loop=1&playlist=5qRHrA4wUQQ'
};
