'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const Database = require('better-sqlite3');
const { io: createSocket } = require('socket.io-client');
const {
  BOT_ID,
  chooseInitialWord,
  chooseStartingPlayer,
  createBoard,
  createDictionaryTrie,
  findBotMove,
  normalizeTurnDuration,
} = require('../server/balda-service');
const { loadBuiltInBaldaWords } = require('../server/balda-dictionary');
const {
  delay,
  login,
  request,
  startServer,
  stopServer,
} = require('./helpers/server-fixture');

const fsp = fs.promises;
const builtInWords = loadBuiltInBaldaWords();
const builtInWordSet = new Set(builtInWords);
const builtInTrie = createDictionaryTrie(builtInWords);

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

async function waitForState(socket, predicate, timeout = 5_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const state = await readState(socket);
    if (predicate(state)) return state;
    await delay(25);
  }
  throw new Error('Timed out waiting for Balda state');
}

function assertInitialWordHidden(state) {
  assert.equal(state.status, 'waiting');
  assert.equal(state.initialWord, null);
  assert.deepEqual(state.usedWords, []);
  assert.deepEqual(state.moves, []);
  assert.equal(state.board.length, 25);
  assert.ok(state.board.every(cell => cell === ''));
}

function statsFor(state, userId) {
  const entry = state.leaderboard.find(item => Number(item.user.id) === Number(userId));
  assert.ok(entry, `missing statistics for user ${userId}`);
  return { wins: entry.wins, draws: entry.draws, losses: entry.losses };
}

function findUnknownMove(board, usedWords, additionalKnownWords = []) {
  const used = new Set([...usedWords, ...additionalKnownWords]);
  const letters = [...'АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ'];
  for (let row = 0; row < 5; row += 1) {
    for (let column = 0; column < 5; column += 1) {
      const existingLetter = board[(row * 5) + column];
      if (!existingLetter) continue;
      for (const [rowDelta, columnDelta] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const emptyRow = row + rowDelta;
        const emptyColumn = column + columnDelta;
        if (emptyRow < 0 || emptyRow >= 5 || emptyColumn < 0 || emptyColumn >= 5) continue;
        if (board[(emptyRow * 5) + emptyColumn]) continue;
        for (const letter of letters) {
          const word = `${existingLetter}${letter}`;
          if (builtInWordSet.has(word) || used.has(word)) continue;
          return {
            row: emptyRow,
            column: emptyColumn,
            letter,
            path: [{ row, column }, { row: emptyRow, column: emptyColumn }],
            word,
          };
        }
      }
    }
  }
  throw new Error('Could not construct an unknown Balda word');
}

test('Balda starter selection and turn-duration validation cover every option', () => {
  assert.equal(chooseStartingPlayer(10, 20, () => 0), 10);
  assert.equal(chooseStartingPlayer(10, 20, () => 1), 20);
  assert.equal(normalizeTurnDuration(30), 30);
  assert.equal(normalizeTurnDuration('60'), 60);
  assert.equal(normalizeTurnDuration(120), 120);
  assert.equal(normalizeTurnDuration(180), 180);
  assert.equal(normalizeTurnDuration(240), 240);
  assert.equal(normalizeTurnDuration(300), 300);
  assert.equal(normalizeTurnDuration(45), 60);
  assert.equal(chooseInitialWord(['ДОМ', 'АРБУЗ', 'СЫРОК'], () => 0), 'АРБУЗ');
  assert.equal(chooseInitialWord(['АРБУЗ', 'СЫРОК'], () => 0, 'АРБУЗ'), 'СЫРОК');
  assert.ok(builtInWords.filter(word => /^[А-ЯЁ]{5}$/u.test(word)).length > 1_000);
  assert.equal(createBoard('АРБУЗ').slice(10, 15).join(''), 'АРБУЗ');

  const board = Array(25).fill('');
  board[12] = 'А';
  const botMove = findBotMove(board, [], createDictionaryTrie(['АР']), () => 0);
  assert.equal(botMove.word, 'АР');
  assert.equal(botMove.letter, 'Р');
  assert.ok(botMove.path.some(cell => cell.row === 2 && cell.column === 2));
});

test('старая схема партии безопасно получает новые поля при запуске', async t => {
  const dataDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'cheese-balda-migration-test-'));
  const databasePath = path.join(dataDir, 'cheese_wheel.db');
  const legacyDb = new Database(databasePath);
  legacyDb.exec(`
    CREATE TABLE balda_games (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      player_one_id INTEGER,
      player_two_id INTEGER,
      board_json TEXT NOT NULL,
      used_words_json TEXT NOT NULL,
      scores_json TEXT NOT NULL,
      moves_json TEXT NOT NULL,
      current_player_id INTEGER,
      status TEXT NOT NULL,
      winner_id INTEGER,
      pending_word_json TEXT,
      consecutive_passes INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    );
  `);
  const legacyBoard = Array(25).fill('');
  [...'СЫРОК'].forEach((letter, column) => { legacyBoard[10 + column] = letter; });
  legacyDb.prepare(`
    INSERT INTO balda_games (
      id, board_json, used_words_json, scores_json, moves_json,
      status, consecutive_passes, updated_at
    ) VALUES (1, ?, ?, '{}', '[]', 'waiting', 0, ?)
  `).run(JSON.stringify(legacyBoard), JSON.stringify(['СЫРОК']), Date.now());
  legacyDb.close();

  const instance = await startServer(dataDir);
  const socketLogin = await login(instance, 1);
  const socket = await connect(instance, socketLogin.cookie);
  t.after(async () => {
    socket.disconnect();
    await stopServer(instance);
    await fsp.rm(dataDir, { recursive: true, force: true });
  });

  assertInitialWordHidden(await readState(socket));
  const migratedDb = new Database(databasePath);
  const columns = new Set(
    migratedDb.prepare('PRAGMA table_info(balda_games)').all().map(column => column.name)
  );
  migratedDb.close();
  for (const column of [
    'round_id',
    'initial_word',
    'bot_slot',
    'winner_is_bot',
    'turn_duration_seconds',
    'turn_started_at',
  ]) {
    assert.ok(columns.has(column), `missing migrated column ${column}`);
  }
});

test('Балда полностью ведёт партию, онлайн, таймер, словарь и статистику', async t => {
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
  const firstDuplicate = await connect(instance, firstLogin.cookie);
  sockets.push(first, second, spectator, guest, firstDuplicate);

  assert.equal((await emitAck(first, 'balda:get-presence')).onlineCount, 0);
  assertInitialWordHidden(await readState(first));
  assert.equal((await readState(second)).presenceCount, 2);
  assert.equal((await readState(spectator)).presenceCount, 3);
  assert.equal((await readState(guest)).presenceCount, 4);
  assert.equal((await readState(firstDuplicate)).presenceCount, 4, 'same user counts once');
  assert.equal((await emitAck(first, 'balda:get-presence')).onlineCount, 4);
  assert.equal((await emitAck(guest, 'balda:unwatch')).ok, true);
  assert.equal((await emitAck(first, 'balda:get-presence')).onlineCount, 3);
  assert.equal((await readState(guest)).presenceCount, 4);

  const guestSeat = await emitAck(guest, 'balda:join');
  assert.equal(guestSeat.ok, false);
  assert.match(guestSeat.error, /пользователям/);
  const spectatorDuration = await emitAck(spectator, 'balda:set-turn-duration', { seconds: 30 });
  assert.equal(spectatorDuration.ok, false);
  assert.match(spectatorDuration.error, /игроков/);

  assert.equal((await emitAck(first, 'balda:join')).ok, true);
  assertInitialWordHidden(await readState(spectator));
  assert.deepEqual(
    await emitAck(first, 'balda:set-turn-duration', { seconds: 30 }),
    { ok: true, turnDurationSeconds: 30 },
  );
  assert.equal((await emitAck(first, 'balda:set-turn-duration', { seconds: 45 })).ok, false);
  assert.equal((await emitAck(second, 'balda:join')).ok, true);

  let state = await readState(spectator);
  assert.equal(state.status, 'playing');
  assert.equal(state.boardSize, 5);
  assert.match(state.initialWord, /^[А-ЯЁ]{5}$/u);
  assert.ok(builtInWordSet.has(state.initialWord));
  assert.equal(state.board.slice(10, 15).join(''), state.initialWord);
  const firstInitialWord = state.initialWord;
  assert.deepEqual(state.players.map(player => player.user?.id), [1, 2]);
  assert.ok([1, 2].includes(state.currentPlayerId));
  assert.equal(state.turnDurationSeconds, 30);
  assert.ok(state.turnDeadline > Date.now());
  assert.equal(state.presenceCount, 4);
  assert.equal(state.spectatorCount, 2);
  assert.ok(state.dictionarySize > 25_000);
  assert.deepEqual(
    await emitAck(guest, 'balda:check-word', { word: state.initialWord.toLocaleLowerCase('ru-RU') }),
    { ok: true, word: state.initialWord, exists: true },
  );
  assert.equal((await emitAck(guest, 'balda:check-word', { word: '1' })).ok, false);

  const socketById = new Map([[1, first], [2, second]]);
  const starterId = state.currentPlayerId;
  const otherId = starterId === 1 ? 2 : 1;
  const starter = socketById.get(starterId);
  const other = socketById.get(otherId);
  const knownMovePayload = findBotMove(state.board, state.usedWords, builtInTrie, () => 0);
  assert.ok(knownMovePayload, `no known move found for ${state.initialWord}`);

  const spectatorMove = await emitAck(spectator, 'balda:submit-move', knownMovePayload);
  assert.equal(spectatorMove.ok, false);
  assert.match(spectatorMove.error, /другого игрока/);

  const diagonalMove = await emitAck(starter, 'balda:submit-move', {
    row: 1,
    column: 0,
    letter: 'А',
    path: [{ row: 2, column: 1 }, { row: 1, column: 0 }],
  });
  assert.equal(diagonalMove.ok, false);
  assert.match(diagonalMove.error, /по стороне/);
  const missingLetterMove = await emitAck(starter, 'balda:submit-move', {
    row: 1,
    column: 0,
    letter: 'А',
    path: [{ row: 2, column: 0 }, { row: 2, column: 1 }],
  });
  assert.equal(missingLetterMove.ok, false);
  assert.match(missingLetterMove.error, /новую букву/);

  const knownMove = await emitAck(starter, 'balda:submit-move', knownMovePayload);
  assert.deepEqual(knownMove, {
    ok: true,
    unknown: false,
    word: knownMovePayload.word,
  });
  state = await readState(spectator);
  assert.equal(
    state.board[(knownMovePayload.row * 5) + knownMovePayload.column],
    knownMovePayload.letter,
  );
  assert.equal(
    state.players.find(player => player.user?.id === starterId).score,
    knownMovePayload.word.length,
  );
  assert.equal(state.currentPlayerId, otherId);
  const lockedDuration = await emitAck(starter, 'balda:set-turn-duration', { seconds: 120 });
  assert.equal(lockedDuration.ok, false);
  assert.match(lockedDuration.error, /до первого хода/);

  const acceptedUnknownMove = findUnknownMove(state.board, state.usedWords);
  assert.deepEqual(
    await emitAck(guest, 'balda:check-word', { word: acceptedUnknownMove.word }),
    { ok: true, word: acceptedUnknownMove.word, exists: false },
  );
  const deadlineBeforeUnknownWord = state.turnDeadline;
  const proposedMove = await emitAck(other, 'balda:submit-move', acceptedUnknownMove);
  assert.deepEqual(proposedMove, {
    ok: true,
    unknown: true,
    word: acceptedUnknownMove.word,
  });
  state = await readState(spectator);
  assert.equal(state.pendingWord, null, 'unknown word is not proposed automatically');
  assert.equal(state.turnDeadline, deadlineBeforeUnknownWord);
  assert.deepEqual(
    await emitAck(other, 'balda:propose-word', acceptedUnknownMove),
    { ok: true, word: acceptedUnknownMove.word },
  );
  state = await readState(spectator);
  assert.equal(state.pendingWord.word, acceptedUnknownMove.word);
  assert.equal(
    state.turnDeadline,
    deadlineBeforeUnknownWord,
    'unknown word must keep the original turn deadline',
  );
  assert.equal(state.board[(acceptedUnknownMove.row * 5) + acceptedUnknownMove.column], '');

  const spectatorVote = await emitAck(spectator, 'balda:resolve-word', { accepted: true });
  assert.equal(spectatorVote.ok, false);
  assert.match(spectatorVote.error, /второй игрок/);
  assert.deepEqual(
    await emitAck(starter, 'balda:resolve-word', { accepted: true }),
    { ok: true, accepted: true, word: acceptedUnknownMove.word },
  );
  state = await readState(spectator);
  assert.equal(
    state.board[(acceptedUnknownMove.row * 5) + acceptedUnknownMove.column],
    acceptedUnknownMove.letter,
  );
  assert.equal(state.players.find(player => player.user?.id === otherId).score, 2);
  assert.equal(state.currentPlayerId, starterId);
  assert.ok(state.turnDeadline > Date.now());
  assert.deepEqual(
    await emitAck(guest, 'balda:check-word', { word: acceptedUnknownMove.word }),
    { ok: true, word: acceptedUnknownMove.word, exists: true },
  );

  const rejectedUnknownMove = findUnknownMove(state.board, state.usedWords);
  const deadlineBeforeRejectedWord = state.turnDeadline;
  const rejectedProposal = await emitAck(starter, 'balda:submit-move', rejectedUnknownMove);
  assert.deepEqual(rejectedProposal, {
    ok: true,
    unknown: true,
    word: rejectedUnknownMove.word,
  });
  assert.equal((await readState(spectator)).pendingWord, null);
  assert.deepEqual(
    await emitAck(starter, 'balda:propose-word', rejectedUnknownMove),
    { ok: true, word: rejectedUnknownMove.word },
  );
  assert.equal((await readState(spectator)).turnDeadline, deadlineBeforeRejectedWord);
  await delay(50);
  assert.deepEqual(
    await emitAck(other, 'balda:resolve-word', { accepted: false }),
    { ok: true, accepted: false },
  );
  state = await readState(spectator);
  assert.equal(state.board[(rejectedUnknownMove.row * 5) + rejectedUnknownMove.column], '');
  assert.equal(state.currentPlayerId, starterId);
  assert.equal(
    state.turnDeadline,
    deadlineBeforeRejectedWord,
    'rejecting an unknown word must not restore a full clock',
  );

  assert.equal((await emitAck(starter, 'balda:pass')).ok, true);
  assert.equal((await emitAck(other, 'balda:pass')).ok, true);
  state = await readState(spectator);
  assert.equal(state.status, 'finished');
  const expectedStats = {
    1: { wins: 0, draws: 0, losses: 0 },
    2: { wins: 0, draws: 0, losses: 0 },
  };
  if (knownMovePayload.word.length === acceptedUnknownMove.word.length) {
    assert.equal(state.winner, null);
    expectedStats[1].draws += 1;
    expectedStats[2].draws += 1;
  } else {
    assert.equal(state.winner.id, starterId);
    expectedStats[starterId].wins += 1;
    expectedStats[otherId].losses += 1;
  }
  assert.deepEqual(statsFor(state, 1), expectedStats[1]);
  assert.deepEqual(statsFor(state, 2), expectedStats[2]);
  assert.equal((await emitAck(starter, 'balda:pass')).ok, false);
  assert.deepEqual(statsFor(await readState(spectator), starterId), expectedStats[starterId]);
  assert.deepEqual(
    await emitAck(starter, 'balda:set-turn-duration', { seconds: 120 }),
    { ok: true, turnDurationSeconds: 120 },
  );
  assert.equal((await emitAck(starter, 'balda:new-game')).ok, true);
  state = await readState(spectator);
  assert.equal(state.status, 'playing');
  assert.equal(state.turnDurationSeconds, 120);
  assert.notEqual(state.initialWord, firstInitialWord);
  assert.equal(state.board.slice(10, 15).join(''), state.initialWord);
  assert.ok([1, 2].includes(state.currentPlayerId));

  const resigningId = state.currentPlayerId;
  const resignationWinnerId = resigningId === 1 ? 2 : 1;
  assert.equal((await emitAck(socketById.get(resigningId), 'balda:leave')).ok, true);
  expectedStats[resignationWinnerId].wins += 1;
  expectedStats[resigningId].losses += 1;
  state = await readState(spectator);
  assert.equal(state.status, 'finished');
  assert.equal(state.winner.id, resignationWinnerId);
  assert.deepEqual(statsFor(state, 1), expectedStats[1]);
  assert.deepEqual(statsFor(state, 2), expectedStats[2]);

  assert.equal((await emitAck(socketById.get(resigningId), 'balda:join')).ok, true);
  state = await readState(spectator);
  assert.equal(state.status, 'playing');
  assert.ok([1, 2].includes(state.currentPlayerId));
  assert.deepEqual(
    await emitAck(first, 'balda:set-turn-duration', { seconds: 30 }),
    { ok: true, turnDurationSeconds: 30 },
  );

  state = await readState(spectator);
  const timedOutId = state.currentPlayerId;
  const timeoutUnknownMove = findUnknownMove(
    state.board,
    state.usedWords,
    [acceptedUnknownMove.word],
  );
  assert.equal(
    (await emitAck(socketById.get(timedOutId), 'balda:submit-move', timeoutUnknownMove)).unknown,
    true,
  );
  assert.equal(
    (await emitAck(socketById.get(timedOutId), 'balda:propose-word', timeoutUnknownMove)).ok,
    true,
  );
  sockets.forEach(socket => socket.disconnect());
  await stopServer(instance);
  const timerDb = new Database(path.join(dataDir, 'cheese_wheel.db'));
  timerDb.prepare(
    'UPDATE balda_games SET turn_duration_seconds = 30, turn_started_at = ? WHERE id = 1'
  ).run(Date.now() - 31_000);
  timerDb.close();

  instance = await startServer(dataDir);
  const firstRelogin = await login(instance, 1);
  const secondRelogin = await login(instance, 2);
  const firstReconnected = await connect(instance, firstRelogin.cookie);
  const secondReconnected = await connect(instance, secondRelogin.cookie);
  sockets.push(firstReconnected, secondReconnected);
  state = await waitForState(firstReconnected, candidate => candidate.moves.some(move => move.timedOut));
  assert.equal(state.status, 'playing');
  assert.equal(state.moves.at(-1).userId, timedOutId);
  assert.equal(state.moves.at(-1).timedOut, true);
  assert.equal(state.consecutivePasses, 1);
  assert.equal(state.pendingWord, null, 'timeout cancels an unresolved word proposal');
  const currentAfterTimeout = state.currentPlayerId;
  const reconnectedById = new Map([[1, firstReconnected], [2, secondReconnected]]);
  assert.equal((await emitAck(reconnectedById.get(currentAfterTimeout), 'balda:pass')).ok, true);
  state = await readState(firstReconnected);
  assert.equal(state.status, 'finished');
  assert.equal(state.winner, null);
  expectedStats[1].draws += 1;
  expectedStats[2].draws += 1;
  assert.deepEqual(statsFor(state, 1), expectedStats[1]);
  assert.deepEqual(statsFor(state, 2), expectedStats[2]);

  const persistedDb = new Database(path.join(dataDir, 'cheese_wheel.db'));
  const learnedWord = persistedDb.prepare(
    'SELECT source, added_by, approved_by FROM balda_dictionary WHERE word = ?'
  ).get(acceptedUnknownMove.word);
  const results = persistedDb.prepare(
    'SELECT round_id, finish_reason FROM balda_results ORDER BY id'
  ).all();
  persistedDb.close();
  assert.deepEqual(learnedWord, {
    source: 'players',
    added_by: otherId,
    approved_by: starterId,
  });
  assert.equal(results.length, 3);
  assert.equal(new Set(results.map(result => result.round_id)).size, 3);
  assert.deepEqual(
    results.map(result => result.finish_reason),
    ['two_passes', 'resignation', 'two_passes'],
  );

  assert.equal((await emitAck(firstReconnected, 'balda:leave')).ok, true);
  assert.equal((await emitAck(secondReconnected, 'balda:leave')).ok, true);
  state = await readState(firstReconnected);
  assertInitialWordHidden(state);
  assert.deepEqual(statsFor(state, 1), expectedStats[1]);
  assert.deepEqual(statsFor(state, 2), expectedStats[2]);
  state = await readState(secondReconnected);
  assert.equal(state.presenceCount, 2);
  assert.equal((await emitAck(secondReconnected, 'balda:unwatch')).ok, true);
  assert.equal((await emitAck(firstReconnected, 'balda:get-presence')).onlineCount, 1);
});

test('Борхес занимает свободное место, играет сам и участвует в статистике', async t => {
  const dataDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'cheese-balda-bot-test-'));
  const instance = await startServer(dataDir);
  const socketLogin = await login(instance, 1);
  const socket = await connect(instance, socketLogin.cookie);
  t.after(async () => {
    socket.disconnect();
    await stopServer(instance);
    await fsp.rm(dataDir, { recursive: true, force: true });
  });

  assertInitialWordHidden(await readState(socket));
  assert.equal((await emitAck(socket, 'balda:join')).ok, true);
  assertInitialWordHidden(await readState(socket));
  assert.equal((await emitAck(socket, 'balda:add-bot')).ok, true);

  let state = await readState(socket);
  const botPlayer = state.players.find(player => player.user?.isBot);
  assert.ok(botPlayer);
  assert.equal(botPlayer.user.id, BOT_ID);
  assert.equal(botPlayer.user.name, 'Борхес');
  assert.equal(state.status, 'playing');
  assert.equal(state.presenceCount, 1, 'bot is not counted as an online person');

  if (state.currentPlayerId !== BOT_ID) {
    assert.equal((await emitAck(socket, 'balda:pass')).ok, true);
  }
  state = await waitForState(
    socket,
    candidate => candidate.moves.some(move => move.userId === BOT_ID && move.word),
    8_000,
  );
  const botMove = state.moves.find(move => move.userId === BOT_ID && move.word);
  assert.equal(botMove.userName, 'Борхес');
  assert.ok(botMove.score >= 2);
  assert.ok(botMove.word.length <= 6, `Борхес сыграл слишком длинное слово: ${botMove.word}`);
  assert.equal(state.currentPlayerId, 1);

  assert.equal((await emitAck(socket, 'balda:remove-bot')).ok, true);
  state = await readState(socket);
  assertInitialWordHidden(state);
  assert.deepEqual(statsFor(state, 1), { wins: 0, draws: 0, losses: 0 });
  assert.equal(state.players.some(player => player.user?.isBot), false);

  assert.equal((await emitAck(socket, 'balda:add-bot')).ok, true);
  assert.equal((await emitAck(socket, 'balda:leave')).ok, true);
  state = await readState(socket);
  assertInitialWordHidden(state);
  assert.deepEqual(statsFor(state, 1), { wins: 0, draws: 0, losses: 1 });

  const resultDb = new Database(path.join(dataDir, 'cheese_wheel.db'));
  const botResults = resultDb.prepare(`
    SELECT player_one_is_bot, player_two_is_bot, winner_slot
    FROM balda_results ORDER BY id
  `).all();
  resultDb.close();
  assert.equal(botResults.length, 1);
  assert.ok(botResults.every(result => result.player_one_is_bot || result.player_two_is_bot));
});
