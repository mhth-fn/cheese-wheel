const fs = require('fs');

function loadLocalEnv(file) {
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(
    fs.readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .filter(line => line && !line.trimStart().startsWith('#') && line.includes('='))
      .map(line => {
        const idx = line.indexOf('=');
        return [line.slice(0, idx).trim(), line.slice(idx + 1).trim()];
      })
  );
}

const localEnv = loadLocalEnv('/opt/cheese-wheel/.env');

module.exports = {
  apps: [{
    name: 'cheese-wheel',
    script: 'server.js',
    cwd: '/opt/cheese-wheel',
    env: {
      PORT: 3000,
      DEFAULT_PASSWORD: 'Cheese$Wheel#2024!',
      DISCORD_WEBHOOK_URL: process.env.DISCORD_WEBHOOK_URL || localEnv.DISCORD_WEBHOOK_URL || ''
    }
  }]
};
