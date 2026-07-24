'use strict';

const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');
const { once } = require('node:events');

const projectRoot = path.resolve(__dirname, '../..');
const testPassword = 'integration-password-42';

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function allocatePort() {
  const listener = net.createServer();
  listener.unref();
  await new Promise((resolve, reject) => {
    listener.once('error', reject);
    listener.listen(0, '127.0.0.1', resolve);
  });
  const { port } = listener.address();
  await new Promise((resolve, reject) => {
    listener.close(error => error ? reject(error) : resolve());
  });
  return port;
}

async function startServer(dataDir, { frontend = 'disabled' } = {}) {
  if (!['disabled', 'built'].includes(frontend)) {
    throw new Error(`Unsupported test frontend mode: ${frontend}`);
  }
  const port = await allocatePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server.js'], {
    cwd: projectRoot,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      HOST: '127.0.0.1',
      PORT: String(port),
      APP_ORIGIN: baseUrl,
      DATA_DIR: dataDir,
      UPLOADS_PATH: path.join(dataDir, 'uploads'),
      DEFAULT_PASSWORD: testPassword,
      AUDIT_LOG_PEPPER: 'integration-audit-pepper-with-at-least-32-bytes',
      RATE_LIMIT_PEPPER: 'integration-rate-pepper-with-at-least-32-bytes',
      DISCORD_WEBHOOK_URL: '',
      TEST_ALLOW_HTTP_COOKIE: '1',
      TEST_FRONTEND_DIST_PATH: frontend === 'disabled'
        ? path.join(dataDir, 'frontend-disabled')
        : '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let output = '';
  child.stdout.on('data', chunk => {
    output += chunk;
  });
  child.stderr.on('data', chunk => {
    output += chunk;
  });

  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Server exited during startup (${child.exitCode}):\n${output}`);
    }
    try {
      const response = await fetch(`${baseUrl}/healthz`);
      if (response.ok) return { baseUrl, child, getOutput: () => output };
    } catch {
      // The port is not listening yet.
    }
    await delay(50);
  }

  child.kill('SIGKILL');
  throw new Error(`Server did not become healthy:\n${output}`);
}

async function stopServer(instance, signal = 'SIGTERM') {
  if (!instance || instance.child.exitCode !== null) return;
  const exited = once(instance.child, 'exit');
  instance.child.kill(signal);
  await Promise.race([
    exited,
    delay(5_000).then(() => {
      if (instance.child.exitCode === null) instance.child.kill('SIGKILL');
    }),
  ]);
}

async function request(instance, pathname, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.cookie) headers.Cookie = options.cookie;
  let body;
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }

  const response = await fetch(`${instance.baseUrl}${pathname}`, {
    method: options.method || 'GET',
    headers,
    body,
  });
  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }
  return { response, status: response.status, payload };
}

async function login(instance, userId) {
  const result = await request(instance, '/api/auth', {
    method: 'POST',
    body: { user_id: userId, password: testPassword },
  });
  assert.equal(result.status, 200, JSON.stringify(result.payload));
  const setCookie = result.response.headers.get('set-cookie');
  assert.ok(setCookie, 'login must set the session cookie');
  return {
    cookie: setCookie.split(';', 1)[0],
    user: result.payload.user,
  };
}

module.exports = {
  delay,
  login,
  request,
  startServer,
  stopServer,
  testPassword,
};
