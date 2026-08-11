'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const Database = require('better-sqlite3');
const { io: createSocket } = require('socket.io-client');
const {
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
      timeout,
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
    extraHeaders: { Cookie: cookie, Origin: instance.baseUrl },
  });
  await Promise.race([
    waitForSocket(socket, 'connect'),
    waitForSocket(socket, 'connect_error').then(error => { throw error; }),
  ]);
  return socket;
}

function emitAck(socket, event, payload, timeout = 5_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timed out waiting for acknowledgement: ${event}`)),
      timeout,
    );
    const acknowledge = result => {
      clearTimeout(timer);
      resolve(result);
    };
    if (payload === undefined) socket.emit(event, acknowledge);
    else socket.emit(event, payload, acknowledge);
  });
}

async function readState(socket) {
  const result = await emitAck(socket, 'balda:watch');
  assert.equal(result.ok, true, JSON.stringify(result));
  return result.state;
}

test('Балда supports two players, spectators, shared-word approval and persistence', async t => {
  const dataDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'cheese-balda-test-'));
  let instance = await startServer(dataDir);
  const sockets = [];
  t.after(async () => {
    sockets.forEach(socket => socket.disconnect());
    await stopServer(instance);
    await fsp.rm(dataDir, { recursive: true, force: true });
  });

  const firstLogin = await login(instance, 1);
  const secondLogin = await login(instance, 2);
  const spectatorLogin = await login(instance, 3);
  const guestLogin = await request(instance, '/api/auth/guest', {
    method: 'POST',
    body: {},
  });
  assert.equal(guestLogin.status, 200);
  const guestCookie = guestLogin.response.headers.get('set-cookie').split(';', 1)[0];

  const first = await connect(instance, firstLogin.cookie);
  const second = await connect(instance, secondLogin.cookie);
  const spectator = await connect(instance, spectatorLogin.cookie);
  const guest = await connect(instance, guestCookie);
  sockets.push(first, second, spectator, guest);
  await Promise.all([first, second, spectator, guest].map(socket => readState(socket)));

  const guestSeat = await emitAck(guest, 'balda:join');
  assert.equal(guestSeat.ok, false);
  assert.match(guestSeat.error, /пользователям/);
  assert.equal((await emitAck(first, 'balda:join')).ok, true);
  assert.equal((await emitAck(second, 'balda:join')).ok, true);

  let state = await readState(spectator);
  assert.equal(state.status, 'playing');
  assert.equal(state.boardSize, 5);
  assert.equal(state.board.slice(10, 15).join(''), 'СЫРОК');
  assert.deepEqual(state.players.map(player => player.user?.id), [1, 2]);
  assert.equal(state.currentPlayerId, 1);
  assert.equal(state.spectatorCount, 2);
  assert.ok(state.dictionarySize > 25_000);

  const spectatorMove = await emitAck(spectator, 'balda:submit-move', {
    row: 1,
    column: 2,
    letter: 'А',
    path: [{ row: 2, column: 4 }, { row: 2, column: 3 }, { row: 2, column: 2 }, { row: 1, column: 2 }],
  });
  assert.equal(spectatorMove.ok, false);
  assert.match(spectatorMove.error, /другого игрока/);

  const knownMove = await emitAck(first, 'balda:submit-move', {
    row: 1,
    column: 2,
    letter: 'А',
    path: [
      { row: 2, column: 4 },
      { row: 2, column: 3 },
      { row: 2, column: 2 },
      { row: 1, column: 2 },
    ],
  });
  assert.deepEqual(knownMove, { ok: true, pending: false, word: 'КОРА' });
  state = await readState(spectator);
  assert.equal(state.board[7], 'А');
  assert.equal(state.players[0].score, 4);
  assert.equal(state.currentPlayerId, 2);

  const proposedMove = await emitAck(second, 'balda:submit-move', {
    row: 1,
    column: 3,
    letter: 'Ф',
    path: [{ row: 1, column: 2 }, { row: 1, column: 3 }],
  });
  assert.deepEqual(proposedMove, { ok: true, pending: true, word: 'АФ' });
  state = await readState(spectator);
  assert.equal(state.pendingWord.word, 'АФ');
  assert.equal(state.board[8], '');

  const spectatorVote = await emitAck(spectator, 'balda:resolve-word', { accepted: true });
  assert.equal(spectatorVote.ok, false);
  assert.match(spectatorVote.error, /второй игрок/);
  const accepted = await emitAck(first, 'balda:resolve-word', { accepted: true });
  assert.deepEqual(accepted, { ok: true, accepted: true, word: 'АФ' });
  state = await readState(spectator);
  assert.equal(state.board[8], 'Ф');
  assert.equal(state.players[1].score, 2);
  assert.equal(state.currentPlayerId, 1);

  const rejectedProposal = await emitAck(first, 'balda:submit-move', {
    row: 0,
    column: 2,
    letter: 'Ц',
    path: [{ row: 1, column: 2 }, { row: 0, column: 2 }],
  });
  assert.deepEqual(rejectedProposal, { ok: true, pending: true, word: 'АЦ' });
  assert.deepEqual(
    await emitAck(second, 'balda:resolve-word', { accepted: false }),
    { ok: true, accepted: false },
  );
  state = await readState(spectator);
  assert.equal(state.board[2], '');
  assert.equal(state.currentPlayerId, 1);

  assert.equal((await emitAck(first, 'balda:pass')).ok, true);
  assert.equal((await emitAck(second, 'balda:pass')).ok, true);
  state = await readState(spectator);
  assert.equal(state.status, 'finished');
  assert.equal(state.winner.id, 1);
  assert.equal((await emitAck(first, 'balda:new-game')).ok, true);
  state = await readState(first);
  assert.equal(state.status, 'playing');
  assert.equal(state.moves.length, 0);

  const dictionaryDb = new Database(path.join(dataDir, 'cheese_wheel.db'));
  const learnedWord = dictionaryDb.prepare(
    'SELECT source, added_by, approved_by FROM balda_dictionary WHERE word = ?'
  ).get('АФ');
  dictionaryDb.close();
  assert.deepEqual(learnedWord, { source: 'players', added_by: 2, approved_by: 1 });

  sockets.forEach(socket => socket.disconnect());
  await stopServer(instance);
  instance = await startServer(dataDir);
  const relogin = await login(instance, 1);
  const reconnected = await connect(instance, relogin.cookie);
  sockets.push(reconnected);
  const restored = await readState(reconnected);
  assert.equal(restored.status, 'playing');
  assert.deepEqual(restored.players.map(player => player.user?.id), [1, 2]);
  assert.equal(restored.board.slice(10, 15).join(''), 'СЫРОК');
  assert.ok(restored.dictionarySize > 25_000);
});
