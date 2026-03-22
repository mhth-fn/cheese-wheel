module.exports = {
  apps: [{
    name: 'cheese-wheel',
    script: 'server.js',
    cwd: '/opt/cheese-wheel',
    env: {
      PORT: 3000,
      DEFAULT_PASSWORD: 'Cheese$Wheel#2024!'
    }
  }]
};
