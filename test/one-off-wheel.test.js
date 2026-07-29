'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { io: createSocket } = require('socket.io-client');
const {
  delay,
  login,
  request,
  startServer,
  stopServer,
} = require('./helpers/server-fixture');

const fsp = fs.promises;

function waitForSocket(socket, event, timeout = 5_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timed out waiting for Socket.IO event: ${event}`)),
      timeout
    );
    socket.once(event, payload => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

async function connect(instance, cookie) {
  const socket = createSocket(instance.baseUrl, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
    extraHeaders: {
      Cookie: cookie,
      Origin: instance.baseUrl,
    },
  });
  await Promise.race([
    waitForSocket(socket, 'connect'),
    waitForSocket(socket, 'connect_error').then(error => {
      throw error;
    }),
  ]);
  return socket;
}

test('one-off wheel is admin-published and supports selection and elimination', async t => {
  const dataDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'cheese-one-off-test-'));
  const instance = await startServer(dataDir);
  const sockets = [];
  t.after(async () => {
    sockets.forEach(socket => socket.disconnect());
    await stopServer(instance);
    await fsp.rm(dataDir, { recursive: true, force: true });
  });

  const anton = await login(instance, 1);
  const admin = await login(instance, 2);
  const peter = await login(instance, 3);

  const initial = await request(instance, '/api/one-off-wheel', {
    cookie: anton.cookie,
  });
  assert.equal(initial.status, 200);
  assert.equal(initial.payload.enabled, false);
  assert.equal(initial.payload.mode, 'selection');

  assert.equal((await request(instance, '/api/one-off-wheel', {
    method: 'POST',
    cookie: anton.cookie,
    body: { title: 'Hidden film' },
  })).status, 409);
  assert.equal((await request(instance, '/api/one-off-wheel/settings', {
    method: 'PATCH',
    cookie: anton.cookie,
    body: { enabled: true },
  })).status, 403);

  const published = await request(instance, '/api/one-off-wheel/settings', {
    method: 'PATCH',
    cookie: admin.cookie,
    body: { enabled: true, mode: 'selection' },
  });
  assert.equal(published.status, 200, JSON.stringify(published.payload));
  assert.equal(published.payload.enabled, true);

  const first = await request(instance, '/api/one-off-wheel', {
    method: 'POST',
    cookie: anton.cookie,
    body: { title: 'Selection A' },
  });
  const second = await request(instance, '/api/one-off-wheel', {
    method: 'POST',
    cookie: anton.cookie,
    body: { title: 'Selection B' },
  });
  const removable = await request(instance, '/api/one-off-wheel', {
    method: 'POST',
    cookie: peter.cookie,
    body: { title: 'Peter choice' },
  });
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(removable.status, 200);
  assert.equal((await request(instance, `/api/one-off-wheel/${removable.payload.id}`, {
    method: 'DELETE',
    cookie: anton.cookie,
  })).status, 403);
  assert.equal((await request(instance, `/api/one-off-wheel/${removable.payload.id}`, {
    method: 'DELETE',
    cookie: peter.cookie,
  })).status, 200);

  const memberSocket = await connect(instance, anton.cookie);
  const adminSocket = await connect(instance, admin.cookie);
  sockets.push(memberSocket, adminSocket);

  const rejectedPromise = waitForSocket(memberSocket, 'one-off-spin-rejected');
  memberSocket.emit('spin-one-off', { spinDuration: 2 });
  assert.match((await rejectedPromise).error, /администратор/);

  const selectionSpinPromise = waitForSocket(adminSocket, 'one-off-spinning');
  adminSocket.emit('spin-one-off', { spinDuration: 2 });
  const selectionSpin = await selectionSpinPromise;
  assert.equal(selectionSpin.mode, 'selection');
  assert.equal(selectionSpin.movies.length, 2);
  assert.equal(selectionSpin.outcome.type, 'winner');

  const selectedState = await request(instance, '/api/one-off-wheel', {
    cookie: admin.cookie,
  });
  assert.equal(selectedState.status, 200);
  assert.ok(selectedState.payload.result?.movie);
  await delay(2_600);
  const skipped = await request(instance, '/api/one-off-wheel/result', {
    method: 'POST',
    cookie: admin.cookie,
    body: { add_to_watched: false },
  });
  assert.equal(skipped.status, 200, JSON.stringify(skipped.payload));
  assert.equal(skipped.payload.state.result, null);
  assert.equal(skipped.payload.state.movies.length, 1);

  const eliminationSettings = await request(instance, '/api/one-off-wheel/settings', {
    method: 'PATCH',
    cookie: admin.cookie,
    body: { mode: 'elimination' },
  });
  assert.equal(eliminationSettings.status, 200);
  const challenger = await request(instance, '/api/one-off-wheel', {
    method: 'POST',
    cookie: peter.cookie,
    body: { title: 'Elimination challenger' },
  });
  assert.equal(challenger.status, 200);

  const eliminationSpinPromise = waitForSocket(adminSocket, 'one-off-spinning');
  adminSocket.emit('spin-one-off', { spinDuration: 2 });
  const eliminationSpin = await eliminationSpinPromise;
  assert.equal(eliminationSpin.mode, 'elimination');
  assert.equal(eliminationSpin.outcome.type, 'eliminated-and-winner');
  assert.notEqual(
    eliminationSpin.outcome.movie.id,
    eliminationSpin.outcome.winner.id
  );

  await delay(2_600);
  const saved = await request(instance, '/api/one-off-wheel/result', {
    method: 'POST',
    cookie: admin.cookie,
    body: { add_to_watched: true },
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.payload));
  assert.equal(saved.payload.watched_movie.title, eliminationSpin.outcome.winner.title);
  assert.equal(saved.payload.state.movies.length, 0);
  const watched = await request(instance, '/api/watched', { cookie: admin.cookie });
  assert.ok(watched.payload.some(movie => movie.title === eliminationSpin.outcome.winner.title));
});
