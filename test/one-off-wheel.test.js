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

function assertCartoonAnimation(spin) {
  const { animation } = spin;
  assert.equal(animation?.profile, 'cartoon');
  assert.equal(typeof animation.recoil, 'boolean');
  assert.equal(typeof animation.falseFinish, 'boolean');
  assert.equal(animation.recoil, animation.falseFinish);
  assert.ok(Number.isSafeInteger(animation.effectSeed));
  assert.ok(animation.effectSeed >= 0);
  if (animation.falseFinish) {
    assert.ok(spin.movies.length > 1);
    assert.ok(spin.randomOffset >= 0.08);
    assert.ok(spin.randomOffset <= 0.12);
    assert.ok(animation.falseFinishDepthRatio >= 0.12);
    assert.ok(animation.falseFinishDepthRatio <= 0.18);
    assert.equal(animation.recoilRatio, animation.falseFinishDepthRatio);
    const crossedDistance = spin.randomOffset + animation.falseFinishDepthRatio;
    assert.ok(crossedDistance >= 0.2);
    assert.ok(crossedDistance <= 0.3);
  } else {
    assert.equal(animation.recoilRatio, 0);
    assert.equal(animation.falseFinishDepthRatio, 0);
  }
}

function assertServerSelectedMovie(spin) {
  const selectedMovie = spin.movies[spin.winnerIndex];
  assert.ok(selectedMovie, 'winnerIndex must refer to the server movie snapshot');
  assert.equal(selectedMovie.id, spin.winnerMovieId);
  assert.equal(spin.outcome.movie.id, spin.winnerMovieId);
}

function withoutResumeElapsed(spin) {
  const { resumeElapsedMs, ...stablePayload } = spin;
  return stablePayload;
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

test('one-off wheel is admin-published and elimination rounds start manually', async t => {
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
    body: { enabled: true, mode: 'selection', spin_duration: 6 },
  });
  assert.equal(published.status, 200, JSON.stringify(published.payload));
  assert.equal(published.payload.enabled, true);
  assert.equal(published.payload.spin_duration, 6);

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
  memberSocket.emit('spin-one-off');
  assert.match((await rejectedPromise).error, /администратор/);

  const selectionSpinPromise = waitForSocket(adminSocket, 'one-off-spinning');
  const memberSelectionSpinPromise = waitForSocket(memberSocket, 'one-off-spinning');
  adminSocket.emit('spin-one-off');
  const [selectionSpin, memberSelectionSpin] = await Promise.all([
    selectionSpinPromise,
    memberSelectionSpinPromise,
  ]);
  assert.equal(selectionSpin.mode, 'selection');
  assert.equal(selectionSpin.spinDuration, 6);
  assert.equal(selectionSpin.movies.length, 2);
  assert.equal(selectionSpin.outcome.type, 'winner');
  assertCartoonAnimation(selectionSpin);
  assertServerSelectedMovie(selectionSpin);
  assert.deepEqual(
    memberSelectionSpin,
    selectionSpin,
    'all connected viewers must receive the same winner and animation payload',
  );

  const selectedState = await request(instance, '/api/one-off-wheel', {
    cookie: admin.cookie,
  });
  assert.equal(selectedState.status, 200);
  assert.equal(selectedState.payload.enabled, false);
  assert.ok(selectedState.payload.result?.movie);
  const skipped = await request(instance, '/api/one-off-wheel/result', {
    method: 'POST',
    cookie: admin.cookie,
    body: { add_to_watched: false },
  });
  assert.equal(skipped.status, 200, JSON.stringify(skipped.payload));
  assert.equal(skipped.payload.state.result, null);
  assert.equal(skipped.payload.state.movies.length, 1);

  await delay(7_200);
  const eliminationSettings = await request(instance, '/api/one-off-wheel/settings', {
    method: 'PATCH',
    cookie: admin.cookie,
    body: { enabled: true, mode: 'elimination', spin_duration: 5 },
  });
  assert.equal(eliminationSettings.status, 200);
  for (const title of ['Elimination challenger A', 'Elimination challenger B']) {
    const challenger = await request(instance, '/api/one-off-wheel', {
      method: 'POST',
      cookie: peter.cookie,
      body: { title },
    });
    assert.equal(challenger.status, 200);
  }

  const eliminationSpinPromise = waitForSocket(adminSocket, 'one-off-spinning');
  adminSocket.emit('spin-one-off');
  const eliminationSpin = await eliminationSpinPromise;
  assert.equal(eliminationSpin.mode, 'elimination');
  assert.equal(eliminationSpin.spinDuration, 5);
  assert.equal(eliminationSpin.outcome.type, 'eliminated');
  assert.equal(eliminationSpin.resumeElapsedMs, 0);
  assert.equal(eliminationSpin.nextSpinAt - eliminationSpin.spinCompleteAt, 1_000);
  assertCartoonAnimation(eliminationSpin);
  assertServerSelectedMovie(eliminationSpin);
  const eliminationInProgress = await request(instance, '/api/one-off-wheel', {
    cookie: admin.cookie,
  });
  assert.equal(eliminationInProgress.payload.enabled, true);
  assert.equal(eliminationInProgress.payload.elimination_active, true);
  assert.equal(eliminationInProgress.payload.movies.length, 2);

  const replaySocket = createSocket(instance.baseUrl, {
    autoConnect: false,
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
    extraHeaders: {
      Cookie: peter.cookie,
      Origin: instance.baseUrl,
    },
  });
  sockets.push(replaySocket);
  const replayConnectPromise = waitForSocket(replaySocket, 'connect');
  const replaySpinPromise = waitForSocket(replaySocket, 'one-off-spinning');
  replaySocket.connect();
  await replayConnectPromise;
  const replaySpin = await replaySpinPromise;
  assert.deepEqual(
    withoutResumeElapsed(replaySpin),
    withoutResumeElapsed(eliminationSpin),
    'a reconnecting viewer must replay the same winner and animation payload',
  );
  assert.ok(replaySpin.resumeElapsedMs >= 0);
  assert.ok(replaySpin.resumeElapsedMs < replaySpin.spinDuration * 1000);

  let automaticSpin = null;
  const captureAutomaticSpin = payload => {
    automaticSpin = payload;
  };
  adminSocket.on('one-off-spinning', captureAutomaticSpin);
  await delay(5_200);
  adminSocket.off('one-off-spinning', captureAutomaticSpin);
  assert.equal(automaticSpin, null, 'next elimination round must not start automatically');

  const earlySpinRejectionPromise = waitForSocket(adminSocket, 'one-off-spin-rejected');
  adminSocket.emit('spin-one-off');
  assert.match((await earlySpinRejectionPromise).error, /вращается/);
  await delay(1_100);

  const waitingForManualSpin = await request(instance, '/api/one-off-wheel', {
    cookie: admin.cookie,
  });
  assert.equal(waitingForManualSpin.payload.enabled, true);
  assert.equal(waitingForManualSpin.payload.elimination_active, true);
  assert.equal(waitingForManualSpin.payload.movies.length, 2);

  const finalEliminationSpinPromise = waitForSocket(adminSocket, 'one-off-spinning');
  adminSocket.emit('spin-one-off');
  const finalEliminationSpin = await finalEliminationSpinPromise;
  assert.equal(finalEliminationSpin.mode, 'elimination');
  assert.equal(finalEliminationSpin.outcome.type, 'eliminated-and-winner');
  assertCartoonAnimation(finalEliminationSpin);
  assertServerSelectedMovie(finalEliminationSpin);
  assert.notEqual(
    finalEliminationSpin.outcome.movie.id,
    finalEliminationSpin.outcome.winner.id
  );
  const hiddenAfterElimination = await request(instance, '/api/one-off-wheel', {
    cookie: admin.cookie,
  });
  assert.equal(hiddenAfterElimination.payload.enabled, false);
  assert.equal(hiddenAfterElimination.payload.elimination_active, false);

  const saved = await request(instance, '/api/one-off-wheel/result', {
    method: 'POST',
    cookie: admin.cookie,
    body: { add_to_watched: true },
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.payload));
  assert.equal(saved.payload.watched_movie.title, finalEliminationSpin.outcome.winner.title);
  assert.equal(saved.payload.state.movies.length, 0);
  const watched = await request(instance, '/api/watched', { cookie: admin.cookie });
  assert.ok(watched.payload.some(
    movie => movie.title === finalEliminationSpin.outcome.winner.title
  ));
});
