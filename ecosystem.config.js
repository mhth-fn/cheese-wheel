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
    uid: 'cheese-wheel',
    gid: 'cheese-wheel',
    env: {
      ...localEnv,
      NODE_ENV: 'production',
      HOST: '127.0.0.1',
      APP_ORIGIN: 'https://cheese-wheel.ru',
      DATA_DIR: '/var/lib/cheese-wheel',
      UPLOADS_PATH: '/var/lib/cheese-wheel/uploads',
      PORT: 3000,
      DEFAULT_PASSWORD: process.env.DEFAULT_PASSWORD || localEnv.DEFAULT_PASSWORD || '',
      DISCORD_WEBHOOK_URL: process.env.DISCORD_WEBHOOK_URL || localEnv.DISCORD_WEBHOOK_URL || ''
    }
  }]
};
