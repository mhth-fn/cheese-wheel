'use strict';

const crypto = require('node:crypto');
const { loadBaldaInitialWords, loadBuiltInBaldaWords } = require('./balda-dictionary');

const BOARD_SIZE = 5;
const INITIAL_WORD = 'СЫРОК';
const BALDA_ROOM_IDS = Object.freeze([1, 2]);
const TURN_DURATIONS = new Set([30, 60, 120, 180, 240, 300]);
const BOT_ID = -1;
const BOT_NAME = 'Борхес';
const BOT_MOVE_DELAY_MS = 900;
const BOT_MAX_WORD_LENGTH = 6;

function createBoard(initialWord = INITIAL_WORD) {
  const board = Array(BOARD_SIZE * BOARD_SIZE).fill('');
  [...initialWord].forEach((letter, column) => {
    board[(Math.floor(BOARD_SIZE / 2) * BOARD_SIZE) + column] = letter;
  });
  return board;
}

function normalizeWord(value) {
  return typeof value === 'string'
    ? value.trim().toLocaleUpperCase('ru-RU')
    : '';
}

function parseJson(value, fallback) {
  try {
    const parsed = JSON.parse(value);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function chooseStartingPlayer(playerOneId, playerTwoId, randomInt = crypto.randomInt) {
  return randomInt(2) === 0 ? playerOneId : playerTwoId;
}

function normalizeTurnDuration(value) {
  const duration = Number(value);
  return TURN_DURATIONS.has(duration) ? duration : 60;
}

function chooseInitialWord(words, randomInt = crypto.randomInt, previousWord = null) {
  const fiveLetterWords = words.filter(word => (
    /^[А-ЯЁ]{5}$/u.test(word) && word !== previousWord
  ));
  if (fiveLetterWords.length === 0) return previousWord || INITIAL_WORD;
  return fiveLetterWords[randomInt(fiveLetterWords.length)];
}

function createDictionaryTrie(words) {
  const root = { children: new Map(), word: null };
  for (const word of words) {
    let node = root;
    for (const letter of word) {
      if (!node.children.has(letter)) {
        node.children.set(letter, { children: new Map(), word: null });
      }
      node = node.children.get(letter);
    }
    node.word = word;
  }
  return root;
}

function createBaldaResources() {
  const builtInWords = loadBuiltInBaldaWords();
  const builtInWordSet = new Set(builtInWords);
  const initialWords = loadBaldaInitialWords().filter(word => (
    /^[А-ЯЁ]{5}$/u.test(word) && builtInWordSet.has(word)
  ));
  if (initialWords.length < 100) {
    throw new Error('[cheese-wheel] Слишком мало стартовых слов для Балды');
  }
  return {
    builtInWords,
    dictionaryTrie: createDictionaryTrie(builtInWords),
    initialWords,
  };
}

function findBotMove(board, usedWords, trie, randomInt = crypto.randomInt) {
  const used = new Set(usedWords);
  const candidatesByLength = new Map();
  const candidateKeys = new Set();

  function remember(node, path, placement) {
    if (!node.word || !placement || used.has(node.word)) return;
    const candidateKey = `${node.word}:${placement.row}:${placement.column}:${placement.letter}`;
    if (candidateKeys.has(candidateKey)) return;
    candidateKeys.add(candidateKey);
    const move = { ...placement, path: path.map(cell => ({ ...cell })), word: node.word };
    const candidates = candidatesByLength.get(node.word.length) || [];
    if (candidates.length < 128) candidates.push(move);
    candidatesByLength.set(node.word.length, candidates);
  }

  function visit(row, column, node, path, seen, placement) {
    const nextPath = [...path, { row, column }];
    const key = `${row}:${column}`;
    const nextSeen = new Set(seen);
    nextSeen.add(key);
    remember(node, nextPath, placement);

    for (const [rowDelta, columnDelta] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nextRow = row + rowDelta;
      const nextColumn = column + columnDelta;
      if (nextRow < 0 || nextRow >= BOARD_SIZE || nextColumn < 0 || nextColumn >= BOARD_SIZE) continue;
      if (nextSeen.has(`${nextRow}:${nextColumn}`)) continue;
      const nextIndex = (nextRow * BOARD_SIZE) + nextColumn;
      const boardLetter = board[nextIndex];
      if (boardLetter) {
        const child = node.children.get(boardLetter);
        if (child) visit(nextRow, nextColumn, child, nextPath, nextSeen, placement);
      } else if (!placement) {
        for (const [letter, child] of node.children) {
          visit(nextRow, nextColumn, child, nextPath, nextSeen, {
            row: nextRow,
            column: nextColumn,
            letter,
          });
        }
      }
    }
  }

  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let column = 0; column < BOARD_SIZE; column += 1) {
      const boardLetter = board[(row * BOARD_SIZE) + column];
      if (boardLetter) {
        const child = trie.children.get(boardLetter);
        if (child) visit(row, column, child, [], new Set(), null);
      } else {
        for (const [letter, child] of trie.children) {
          visit(row, column, child, [], new Set(), { row, column, letter });
        }
      }
    }
  }

  const availableLengths = [...candidatesByLength.keys()].sort((first, second) => second - first);
  if (availableLengths.length === 0) return null;
  const balancedLengths = availableLengths.filter(length => length <= BOT_MAX_WORD_LENGTH);
  const strongestBalancedLength = balancedLengths[0] || availableLengths.at(-1);
  const playableLengths = availableLengths.filter(length => (
    length <= strongestBalancedLength && length >= Math.max(2, strongestBalancedLength - 2)
  ));
  const candidates = playableLengths.flatMap(length => candidatesByLength.get(length));
  return candidates[randomInt(candidates.length)];
}

function createBaldaService({
  db,
  io,
  resources = createBaldaResources(),
  roomId = 1,
  seedBuiltInDictionary = true,
  randomInt = crypto.randomInt,
  randomUUID = crypto.randomUUID,
}) {
  const normalizedRoomId = Number(roomId);
  if (!BALDA_ROOM_IDS.includes(normalizedRoomId)) {
    throw new Error(`Некорректная комната Балды: ${roomId}`);
  }
  const roomName = `balda:${normalizedRoomId}`;
  let turnTimer = null;
  let botTimer = null;
  const { builtInWords, dictionaryTrie, initialWords } = resources;
  const getGameStmt = db.prepare('SELECT * FROM balda_games WHERE id = ?');
  const getUserStmt = db.prepare('SELECT id, name FROM users WHERE id = ?');
  const findWordStmt = db.prepare('SELECT word FROM balda_dictionary WHERE word = ?');
  const countWordsStmt = db.prepare('SELECT COUNT(*) AS count FROM balda_dictionary');
  const insertWordStmt = db.prepare(`
    INSERT OR IGNORE INTO balda_dictionary (
      word, source, added_by, approved_by, added_at
    ) VALUES (?, ?, ?, ?, ?)
  `);
  const getUserStatsStmt = db.prepare(`
    SELECT
      COALESCE(SUM(CASE
        WHEN (result.player_one_id = user.id AND result.winner_slot = 1)
          OR (result.player_two_id = user.id AND result.winner_slot = 2)
        THEN 1 ELSE 0 END), 0) AS wins,
      COALESCE(SUM(CASE WHEN result.id IS NOT NULL AND result.winner_slot IS NULL THEN 1 ELSE 0 END), 0) AS draws,
      COALESCE(SUM(CASE
        WHEN result.id IS NOT NULL AND result.winner_slot IS NOT NULL
          AND (
            (result.player_one_id = user.id AND result.winner_slot != 1)
            OR (result.player_two_id = user.id AND result.winner_slot != 2)
          ) THEN 1 ELSE 0 END), 0) AS losses
    FROM users AS user
    LEFT JOIN balda_results AS result
      ON result.player_one_id = user.id OR result.player_two_id = user.id
    WHERE user.id = ?
    GROUP BY user.id
  `);
  const listLeaderboardStmt = db.prepare(`
    SELECT
      user.id,
      user.name,
      COALESCE(SUM(CASE
        WHEN (result.player_one_id = user.id AND result.winner_slot = 1)
          OR (result.player_two_id = user.id AND result.winner_slot = 2)
        THEN 1 ELSE 0 END), 0) AS wins,
      COALESCE(SUM(CASE WHEN result.id IS NOT NULL AND result.winner_slot IS NULL THEN 1 ELSE 0 END), 0) AS draws,
      COALESCE(SUM(CASE
        WHEN result.id IS NOT NULL AND result.winner_slot IS NOT NULL
          AND (
            (result.player_one_id = user.id AND result.winner_slot != 1)
            OR (result.player_two_id = user.id AND result.winner_slot != 2)
          ) THEN 1 ELSE 0 END), 0) AS losses
    FROM users AS user
    LEFT JOIN balda_results AS result
      ON result.player_one_id = user.id OR result.player_two_id = user.id
    GROUP BY user.id
    ORDER BY wins DESC, draws DESC, losses ASC, user.name COLLATE NOCASE
  `);
  const getBotStatsStmt = db.prepare(`
    SELECT
      COALESCE(SUM(CASE
        WHEN (player_one_is_bot = 1 AND winner_slot = 1)
          OR (player_two_is_bot = 1 AND winner_slot = 2)
        THEN 1 ELSE 0 END), 0) AS wins,
      COALESCE(SUM(CASE WHEN winner_slot IS NULL THEN 1 ELSE 0 END), 0) AS draws,
      COALESCE(SUM(CASE
        WHEN winner_slot IS NOT NULL AND (
          (player_one_is_bot = 1 AND winner_slot != 1)
          OR (player_two_is_bot = 1 AND winner_slot != 2)
        ) THEN 1 ELSE 0 END), 0) AS losses
    FROM balda_results
    WHERE player_one_is_bot = 1 OR player_two_is_bot = 1
  `);
  const insertResultStmt = db.prepare(`
    INSERT OR IGNORE INTO balda_results (
      round_id, player_one_id, player_two_id, player_one_is_bot, player_two_is_bot,
      player_one_score, player_two_score,
      winner_slot, finish_reason, finished_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const updateGameStmt = db.prepare(`
    UPDATE balda_games SET
      round_id = @round_id,
      initial_word = @initial_word,
      bot_slot = @bot_slot,
      player_one_id = @player_one_id,
      player_two_id = @player_two_id,
      board_json = @board_json,
      used_words_json = @used_words_json,
      scores_json = @scores_json,
      moves_json = @moves_json,
      current_player_id = @current_player_id,
      status = @status,
      winner_id = @winner_id,
      winner_is_bot = @winner_is_bot,
      pending_word_json = @pending_word_json,
      consecutive_passes = @consecutive_passes,
      turn_duration_seconds = @turn_duration_seconds,
      turn_started_at = @turn_started_at,
      updated_at = @updated_at
    WHERE id = @id
  `);

  const seededInitialWord = chooseInitialWord(initialWords, randomInt);
  db.prepare(`
    INSERT OR IGNORE INTO balda_games (
      id, round_id, initial_word, board_json, used_words_json, scores_json, moves_json,
      status, consecutive_passes, updated_at
    ) VALUES (?, ?, ?, ?, ?, '{}', '[]', 'waiting', 0, ?)
  `).run(
    normalizedRoomId,
    randomUUID(),
    seededInitialWord,
    JSON.stringify(createBoard(seededInitialWord)),
    JSON.stringify([seededInitialWord]),
    Date.now(),
  );

  if (seedBuiltInDictionary) {
    const seedDictionary = db.transaction(() => {
      for (const word of builtInWords) {
        insertWordStmt.run(word, 'built-in', null, null, 0);
      }
    });
    seedDictionary();
  }

  function readGame() {
    const row = getGameStmt.get(normalizedRoomId);
    const initialWord = /^[А-ЯЁ]{5}$/u.test(row.initial_word || '')
      ? row.initial_word
      : INITIAL_WORD;
    const board = parseJson(row.board_json, createBoard(initialWord));
    return {
      ...row,
      initialWord,
      board: Array.isArray(board) && board.length === BOARD_SIZE * BOARD_SIZE
        ? board.map(cell => normalizeWord(cell).slice(0, 1))
        : createBoard(initialWord),
      usedWords: parseJson(row.used_words_json, [initialWord]),
      scores: parseJson(row.scores_json, {}),
      moves: parseJson(row.moves_json, []),
      pendingWord: parseJson(row.pending_word_json, null),
      turn_duration_seconds: normalizeTurnDuration(row.turn_duration_seconds),
      turn_started_at: row.turn_started_at ? Number(row.turn_started_at) : null,
    };
  }

  function writeGame(game) {
    const row = {
      id: normalizedRoomId,
      round_id: game.round_id || randomUUID(),
      initial_word: game.initialWord || INITIAL_WORD,
      bot_slot: game.bot_slot || null,
      player_one_id: game.player_one_id ?? null,
      player_two_id: game.player_two_id ?? null,
      board_json: JSON.stringify(game.board),
      used_words_json: JSON.stringify(game.usedWords),
      scores_json: JSON.stringify(game.scores),
      moves_json: JSON.stringify(game.moves),
      current_player_id: game.current_player_id ?? null,
      status: game.status,
      winner_id: game.winner_id ?? null,
      winner_is_bot: game.winner_is_bot ? 1 : 0,
      pending_word_json: game.pendingWord ? JSON.stringify(game.pendingWord) : null,
      consecutive_passes: game.consecutive_passes || 0,
      turn_duration_seconds: normalizeTurnDuration(game.turn_duration_seconds),
      turn_started_at: game.turn_started_at || null,
      updated_at: Date.now(),
    };
    updateGameStmt.run(row);
    return readGame();
  }

  function getPlayerIds(game) {
    return [1, 2].map(slot => (
      Number(game.bot_slot) === slot
        ? BOT_ID
        : slot === 1 ? game.player_one_id : game.player_two_id
    ));
  }

  function hasTwoPlayers(game) {
    return getPlayerIds(game).every(playerId => playerId !== null && playerId !== undefined);
  }

  function getCurrentPlayerId(game) {
    if (game.status !== 'playing') return null;
    if (game.current_player_id) return Number(game.current_player_id);
    return getPlayerIds(game).includes(BOT_ID) ? BOT_ID : null;
  }

  function setCurrentPlayerId(game, playerId) {
    game.current_player_id = Number(playerId) === BOT_ID ? null : playerId;
  }

  function getPlayerName(userId) {
    if (Number(userId) === BOT_ID) return BOT_NAME;
    return getUserStmt.get(userId)?.name || 'Игрок';
  }

  function getRoomVisitors() {
    const socketIds = io.sockets.adapter.rooms.get(roomName) || new Set();
    const visitors = new Set();
    for (const socketId of socketIds) {
      const socket = io.sockets.sockets.get(socketId);
      const userId = Number(socket?.data?.tokenData?.userId);
      if (Number.isInteger(userId)) visitors.add(`user:${userId}`);
      else visitors.add(`guest:${socketId}`);
    }
    return visitors;
  }

  function getPresenceCount() {
    return getRoomVisitors().size;
  }

  function getViewerCount(game) {
    const playerIds = new Set(
      [game.player_one_id, game.player_two_id].filter(Boolean).map(Number)
    );
    const visitors = getRoomVisitors();
    for (const playerId of playerIds) {
      visitors.delete(`user:${playerId}`);
    }
    return visitors.size;
  }

  function serializeStats(row = {}) {
    return {
      wins: Number(row.wins || 0),
      draws: Number(row.draws || 0),
      losses: Number(row.losses || 0),
    };
  }

  function serializeGame(game = readGame()) {
    const players = getPlayerIds(game).map((userId, index) => {
      if (!userId) {
        return { slot: index + 1, user: null, score: 0, stats: serializeStats() };
      }
      const isBot = Number(userId) === BOT_ID;
      const user = isBot ? { id: BOT_ID, name: BOT_NAME } : getUserStmt.get(userId);
      return {
        slot: index + 1,
        user: user ? { id: Number(user.id), name: user.name, isBot } : null,
        score: Number(game.scores[String(userId)] || 0),
        stats: serializeStats(isBot ? getBotStatsStmt.get() : getUserStatsStmt.get(userId)),
      };
    });
    const winner = game.winner_is_bot
      ? { id: BOT_ID, name: BOT_NAME, isBot: true }
      : game.winner_id ? getUserStmt.get(game.winner_id) : null;
    const hasStarted = game.status !== 'waiting';
    return {
      roomId: normalizedRoomId,
      board: hasStarted ? game.board : Array(BOARD_SIZE * BOARD_SIZE).fill(''),
      boardSize: BOARD_SIZE,
      consecutivePasses: game.consecutive_passes || 0,
      currentPlayerId: getCurrentPlayerId(game),
      dictionarySize: Number(countWordsStmt.get().count),
      initialWord: hasStarted ? game.initialWord : null,
      leaderboard: listLeaderboardStmt.all().map(row => ({
        user: { id: Number(row.id), name: row.name },
        ...serializeStats(row),
      })),
      moves: hasStarted ? game.moves : [],
      pendingWord: hasStarted ? game.pendingWord : null,
      players,
      presenceCount: getPresenceCount(),
      spectatorCount: getViewerCount(game),
      status: game.status,
      turnDeadline: game.turn_started_at
        ? Number(game.turn_started_at) + (normalizeTurnDuration(game.turn_duration_seconds) * 1000)
        : null,
      turnDurationSeconds: normalizeTurnDuration(game.turn_duration_seconds),
      updatedAt: Number(game.updated_at),
      usedWords: hasStarted ? game.usedWords : [],
      winner: winner ? {
        id: Number(winner.id),
        name: winner.name,
        isBot: Boolean(winner.isBot),
      } : null,
    };
  }

  function getSummary() {
    const game = readGame();
    return {
      roomId: normalizedRoomId,
      onlineCount: getPresenceCount(),
      playerCount: getPlayerIds(game).filter(playerId => playerId !== null).length,
      status: game.status,
    };
  }

  function broadcastPresence() {
    const presence = getSummary();
    io.emit('balda:presence', presence);
    return presence;
  }

  function broadcast() {
    const state = serializeGame();
    io.to(roomName).emit('balda:state', state);
    broadcastPresence();
    scheduleTurnTimer();
    scheduleBotTurn();
    return state;
  }

  function resetGame(game) {
    const playerIds = getPlayerIds(game);
    const initialWord = chooseInitialWord(initialWords, randomInt, game.initialWord);
    const scores = {};
    for (const playerId of playerIds.filter(playerId => playerId !== null)) {
      scores[String(playerId)] = 0;
    }
    const bothPlayersReady = hasTwoPlayers(game);
    const reset = {
      ...game,
      initialWord,
      board: createBoard(initialWord),
      usedWords: [initialWord],
      scores,
      moves: [],
      round_id: randomUUID(),
      status: bothPlayersReady ? 'playing' : 'waiting',
      winner_id: null,
      winner_is_bot: 0,
      pendingWord: null,
      consecutive_passes: 0,
      turn_duration_seconds: normalizeTurnDuration(game.turn_duration_seconds),
      turn_started_at: bothPlayersReady ? Date.now() : null,
    };
    setCurrentPlayerId(
      reset,
      bothPlayersReady ? chooseStartingPlayer(playerIds[0], playerIds[1], randomInt) : null,
    );
    return reset;
  }

  function otherPlayerId(game, userId) {
    const playerIds = getPlayerIds(game);
    if (Number(playerIds[0]) === Number(userId)) return playerIds[1];
    if (Number(playerIds[1]) === Number(userId)) return playerIds[0];
    return null;
  }

  function isSeated(game, userId) {
    return getPlayerIds(game).some(playerId => Number(playerId) === Number(userId));
  }

  function getSeatedUserIds() {
    return getPlayerIds(readGame())
      .filter(playerId => playerId !== null && Number(playerId) !== BOT_ID)
      .map(Number);
  }

  function finishGame(game, finishReason, forcedWinnerId = undefined) {
    if (game.status !== 'playing') return;
    const playerIds = getPlayerIds(game);
    const firstScore = Number(game.scores[String(playerIds[0])] || 0);
    const secondScore = Number(game.scores[String(playerIds[1])] || 0);
    const winnerId = forcedWinnerId === undefined
      ? firstScore === secondScore
        ? null
        : firstScore > secondScore ? playerIds[0] : playerIds[1]
      : forcedWinnerId;
    const winnerSlot = winnerId === null
      ? null
      : playerIds.findIndex(playerId => Number(playerId) === Number(winnerId)) + 1;
    game.status = 'finished';
    game.current_player_id = null;
    game.pendingWord = null;
    game.turn_started_at = null;
    game.winner_id = Number(winnerId) === BOT_ID ? null : winnerId;
    game.winner_is_bot = Number(winnerId) === BOT_ID ? 1 : 0;
    insertResultStmt.run(
      game.round_id,
      Number(playerIds[0]) === BOT_ID ? null : playerIds[0],
      Number(playerIds[1]) === BOT_ID ? null : playerIds[1],
      Number(playerIds[0]) === BOT_ID ? 1 : 0,
      Number(playerIds[1]) === BOT_ID ? 1 : 0,
      firstScore,
      secondScore,
      winnerSlot || null,
      finishReason,
      Date.now(),
    );
  }

  function join(userId) {
    const transaction = db.transaction(() => {
      let game = readGame();
      if (isSeated(game, userId)) return { ok: true };
      if (game.player_one_id && game.player_two_id) {
        return { ok: false, error: 'Оба места игроков уже заняты' };
      }
      if (hasTwoPlayers(game)) return { ok: false, error: 'Оба места игроков уже заняты' };
      if (!game.player_one_id && Number(game.bot_slot) !== 1) game.player_one_id = userId;
      else if (!game.player_two_id && Number(game.bot_slot) !== 2) game.player_two_id = userId;
      if (hasTwoPlayers(game)) game = resetGame(game);
      else {
        game.status = 'waiting';
        game.current_player_id = null;
        game.pendingWord = null;
        game.turn_started_at = null;
      }
      writeGame(game);
      return { ok: true };
    });
    const result = transaction();
    if (result.ok) broadcast();
    return result;
  }

  function leave(userId) {
    const transaction = db.transaction(() => {
      const game = readGame();
      if (!isSeated(game, userId)) {
        return { ok: false, error: 'Вы не занимаете место игрока' };
      }
      const opponentId = otherPlayerId(game, userId);
      if (game.status === 'playing' && opponentId) {
        finishGame(game, 'resignation', opponentId);
      }
      if (Number(game.player_one_id) === Number(userId)) game.player_one_id = null;
      if (Number(game.player_two_id) === Number(userId)) game.player_two_id = null;
      if (Number(opponentId) === BOT_ID) game.bot_slot = null;
      game.current_player_id = null;
      game.pendingWord = null;
      if (!getPlayerIds(game).some(Boolean)) {
        Object.assign(game, resetGame(game), { status: 'waiting' });
      }
      writeGame(game);
      return { ok: true };
    });
    const result = transaction();
    if (result.ok) broadcast();
    return result;
  }

  function validateMove(game, userId, payload) {
    if (game.status !== 'playing') return { error: 'Партия ещё не началась' };
    if (Number(getCurrentPlayerId(game)) !== Number(userId)) return { error: 'Сейчас ход другого игрока' };
    if (game.pendingWord) return { error: 'Сначала нужно решить спор о слове' };

    const row = Number(payload?.row);
    const column = Number(payload?.column);
    const letter = normalizeWord(payload?.letter);
    const path = payload?.path;
    if (!Number.isInteger(row) || !Number.isInteger(column)
      || row < 0 || row >= BOARD_SIZE || column < 0 || column >= BOARD_SIZE) {
      return { error: 'Выберите свободную клетку' };
    }
    if (!/^[А-ЯЁ]$/u.test(letter)) return { error: 'Введите одну русскую букву' };
    const placedIndex = row * BOARD_SIZE + column;
    if (game.board[placedIndex]) return { error: 'Выбранная клетка уже занята' };
    if (!Array.isArray(path) || path.length < 2 || path.length > BOARD_SIZE * BOARD_SIZE) {
      return { error: 'Слово должно состоять минимум из двух букв' };
    }

    const seen = new Set();
    let placedUses = 0;
    let word = '';
    for (let index = 0; index < path.length; index += 1) {
      const cell = path[index];
      const cellRow = Number(cell?.row);
      const cellColumn = Number(cell?.column);
      if (!Number.isInteger(cellRow) || !Number.isInteger(cellColumn)
        || cellRow < 0 || cellRow >= BOARD_SIZE
        || cellColumn < 0 || cellColumn >= BOARD_SIZE) {
        return { error: 'Путь слова выходит за поле' };
      }
      const key = `${cellRow}:${cellColumn}`;
      if (seen.has(key)) return { error: 'Одну клетку нельзя использовать дважды' };
      seen.add(key);
      if (index > 0) {
        const previous = path[index - 1];
        const distance = Math.abs(cellRow - Number(previous.row))
          + Math.abs(cellColumn - Number(previous.column));
        if (distance !== 1) return { error: 'Буквы слова должны соседствовать по стороне' };
      }
      const boardIndex = cellRow * BOARD_SIZE + cellColumn;
      if (boardIndex === placedIndex) {
        placedUses += 1;
        word += letter;
      } else if (game.board[boardIndex]) {
        word += game.board[boardIndex];
      } else {
        return { error: 'В слове можно добавить только одну новую букву' };
      }
    }
    if (placedUses !== 1) return { error: 'Путь слова должен включать новую букву' };
    word = normalizeWord(word);
    if (!/^[А-ЯЁ]{2,25}$/u.test(word)) return { error: 'Некорректное слово' };
    if (game.usedWords.includes(word)) return { error: 'Это слово уже было сыграно' };
    return { row, column, letter, path, word };
  }

  function applyMove(game, userId, move) {
    game.board[(move.row * BOARD_SIZE) + move.column] = move.letter;
    game.usedWords.push(move.word);
    game.scores[String(userId)] = Number(game.scores[String(userId)] || 0) + move.word.length;
    game.moves.push({
      userId: Number(userId),
      userName: getPlayerName(userId),
      word: move.word,
      score: move.word.length,
      row: move.row,
      column: move.column,
      letter: move.letter,
      path: move.path,
      createdAt: Date.now(),
    });
    game.pendingWord = null;
    game.consecutive_passes = 0;
    if (game.board.every(Boolean)) finishGame(game, 'board_full');
    else {
      setCurrentPlayerId(game, otherPlayerId(game, userId));
      game.turn_started_at = Date.now();
    }
  }

  function submitMove(userId, payload) {
    const transaction = db.transaction(() => {
      const game = readGame();
      const move = validateMove(game, userId, payload);
      if (move.error) return { ok: false, error: move.error };
      if (!findWordStmt.get(move.word)) {
        return { ok: true, unknown: true, word: move.word };
      }
      applyMove(game, userId, move);
      writeGame(game);
      return { ok: true, unknown: false, word: move.word };
    });
    const result = transaction();
    if (result.ok && !result.unknown) broadcast();
    return result;
  }

  function proposeWord(userId, payload) {
    const transaction = db.transaction(() => {
      const game = readGame();
      const move = validateMove(game, userId, payload);
      if (move.error) return { ok: false, error: move.error };
      if (findWordStmt.get(move.word)) {
        return { ok: false, error: 'Слово уже есть в словаре — сыграйте его обычной кнопкой' };
      }
      game.pendingWord = {
        ...move,
        proposerId: Number(userId),
        responderId: Number(otherPlayerId(game, userId)),
        createdAt: Date.now(),
      };
      writeGame(game);
      return { ok: true, word: move.word };
    });
    const result = transaction();
    if (result.ok) broadcast();
    return result;
  }

  function checkWord(value) {
    const word = normalizeWord(value);
    if (!/^[А-ЯЁ]{2,25}$/u.test(word)) {
      return { ok: false, error: 'Введите русское слово от 2 до 25 букв' };
    }
    return { ok: true, word, exists: Boolean(findWordStmt.get(word)) };
  }

  function resolveWord(userId, accepted) {
    const transaction = db.transaction(() => {
      const game = readGame();
      const pending = game.pendingWord;
      if (!pending) return { ok: false, error: 'Нет слова, которое нужно подтвердить' };
      if (Number(pending.responderId) !== Number(userId)) {
        return { ok: false, error: 'Решение принимает второй игрок' };
      }
      if (accepted !== true && accepted !== false) {
        return { ok: false, error: 'Некорректное решение' };
      }
      if (!accepted) {
        game.pendingWord = null;
        writeGame(game);
        return { ok: true, accepted: false };
      }
      const revalidated = validateMove(
        { ...game, pendingWord: null },
        pending.proposerId,
        pending,
      );
      if (revalidated.error) return { ok: false, error: 'Состояние партии изменилось; повторите ход' };
      insertWordStmt.run(
        revalidated.word,
        'players',
        pending.proposerId,
        userId,
        Date.now(),
      );
      let trieNode = dictionaryTrie;
      for (const letter of revalidated.word) {
        if (!trieNode.children.has(letter)) {
          trieNode.children.set(letter, { children: new Map(), word: null });
        }
        trieNode = trieNode.children.get(letter);
      }
      trieNode.word = revalidated.word;
      applyMove(game, pending.proposerId, revalidated);
      writeGame(game);
      return { ok: true, accepted: true, word: revalidated.word };
    });
    const result = transaction();
    if (result.ok) broadcast();
    return result;
  }

  function applyPass(game, userId, timedOut = false) {
    game.consecutive_passes += 1;
    game.moves.push({
      userId: Number(userId),
      userName: getPlayerName(userId),
      pass: true,
      timedOut,
      createdAt: Date.now(),
    });
    if (game.consecutive_passes >= 2) finishGame(game, 'two_passes');
    else {
      setCurrentPlayerId(game, otherPlayerId(game, userId));
      game.turn_started_at = Date.now();
    }
  }

  function pass(userId) {
    const transaction = db.transaction(() => {
      const game = readGame();
      if (game.status !== 'playing' || Number(getCurrentPlayerId(game)) !== Number(userId)) {
        return { ok: false, error: 'Сейчас нельзя пропустить ход' };
      }
      if (game.pendingWord) return { ok: false, error: 'Сначала решите спор о слове' };
      applyPass(game, userId);
      writeGame(game);
      return { ok: true };
    });
    const result = transaction();
    if (result.ok) broadcast();
    return result;
  }

  function handleTurnTimeout() {
    const transaction = db.transaction(() => {
      const game = readGame();
      if (game.status !== 'playing' || getCurrentPlayerId(game) === null
        || !game.turn_started_at) return false;
      const deadline = game.turn_started_at
        + (normalizeTurnDuration(game.turn_duration_seconds) * 1000);
      if (Date.now() < deadline) return false;
      game.pendingWord = null;
      applyPass(game, getCurrentPlayerId(game), true);
      writeGame(game);
      return true;
    });
    if (transaction()) broadcast();
    else scheduleTurnTimer();
  }

  function scheduleTurnTimer() {
    if (turnTimer) {
      clearTimeout(turnTimer);
      turnTimer = null;
    }
    const game = readGame();
    if (game.status !== 'playing' || getCurrentPlayerId(game) === null
      || !game.turn_started_at) return;
    const deadline = game.turn_started_at
      + (normalizeTurnDuration(game.turn_duration_seconds) * 1000);
    turnTimer = setTimeout(handleTurnTimeout, Math.max(0, deadline - Date.now()) + 10);
    turnTimer.unref();
  }

  function setTurnDuration(userId, duration) {
    const transaction = db.transaction(() => {
      const game = readGame();
      if (!isSeated(game, userId)) {
        return { ok: false, error: 'Время хода выбирает один из игроков' };
      }
      const nextDuration = Number(duration);
      if (!TURN_DURATIONS.has(nextDuration)) {
        return { ok: false, error: 'Выберите время от 30 секунд до 5 минут' };
      }
      if (game.status === 'playing' && (game.moves.length > 0 || game.pendingWord)) {
        return { ok: false, error: 'Время можно изменить до первого хода или между партиями' };
      }
      game.turn_duration_seconds = nextDuration;
      if (game.status === 'playing') game.turn_started_at = Date.now();
      writeGame(game);
      return { ok: true, turnDurationSeconds: nextDuration };
    });
    const result = transaction();
    if (result.ok) broadcast();
    return result;
  }

  function handleBotAction() {
    const game = readGame();
    if (game.status !== 'playing') return;
    if (Number(game.pendingWord?.responderId) === BOT_ID) {
      resolveWord(BOT_ID, false);
      return;
    }
    if (getCurrentPlayerId(game) !== BOT_ID || game.pendingWord) return;

    const transaction = db.transaction(() => {
      const current = readGame();
      if (current.status !== 'playing' || getCurrentPlayerId(current) !== BOT_ID
        || current.pendingWord) return false;
      const move = findBotMove(current.board, current.usedWords, dictionaryTrie, randomInt);
      if (move) applyMove(current, BOT_ID, move);
      else applyPass(current, BOT_ID);
      writeGame(current);
      return true;
    });
    if (transaction()) broadcast();
  }

  function scheduleBotTurn() {
    const game = readGame();
    const botMustAnswer = Number(game.pendingWord?.responderId) === BOT_ID;
    if (game.status !== 'playing' || (!botMustAnswer && getCurrentPlayerId(game) !== BOT_ID)) {
      if (botTimer) clearTimeout(botTimer);
      botTimer = null;
      return;
    }
    if (botTimer) return;
    botTimer = setTimeout(() => {
      botTimer = null;
      handleBotAction();
    }, BOT_MOVE_DELAY_MS);
    botTimer.unref();
  }

  function addBot(userId) {
    const transaction = db.transaction(() => {
      let game = readGame();
      if (!isSeated(game, userId)) {
        return { ok: false, error: 'Борхеса добавляет игрок за столом' };
      }
      if (game.bot_slot) return { ok: false, error: 'Борхес уже в игре' };
      if (hasTwoPlayers(game)) return { ok: false, error: 'Свободных мест нет' };
      if (!game.player_one_id) game.bot_slot = 1;
      else if (!game.player_two_id) game.bot_slot = 2;
      else return { ok: false, error: 'Свободных мест нет' };
      game = resetGame(game);
      writeGame(game);
      return { ok: true };
    });
    const result = transaction();
    if (result.ok) broadcast();
    return result;
  }

  function removeBot(userId) {
    const transaction = db.transaction(() => {
      const game = readGame();
      if (!isSeated(game, userId) || Number(userId) === BOT_ID) {
        return { ok: false, error: 'Борхеса убирает второй игрок' };
      }
      if (!game.bot_slot) return { ok: false, error: 'Борхеса нет в игре' };
      game.bot_slot = null;
      writeGame(resetGame(game));
      return { ok: true };
    });
    const result = transaction();
    if (result.ok) broadcast();
    return result;
  }

  function newGame(userId) {
    const transaction = db.transaction(() => {
      const game = readGame();
      if (!isSeated(game, userId)) return { ok: false, error: 'Новую партию запускает один из игроков' };
      if (!hasTwoPlayers(game)) return { ok: false, error: 'Для игры нужны два игрока' };
      if (game.status === 'playing') return { ok: false, error: 'Текущая партия ещё не завершена' };
      writeGame(resetGame(game));
      return { ok: true };
    });
    const result = transaction();
    if (result.ok) broadcast();
    return result;
  }

  scheduleTurnTimer();
  scheduleBotTurn();

  return {
    addBot,
    broadcast,
    broadcastPresence,
    checkWord,
    getPresenceCount,
    getSeatedUserIds,
    getSummary,
    getState: () => serializeGame(),
    join,
    leave,
    newGame,
    pass,
    proposeWord,
    removeBot,
    resolveWord,
    roomId: normalizedRoomId,
    roomName,
    setTurnDuration,
    submitMove,
  };
}

module.exports = {
  BALDA_ROOM_IDS,
  BOARD_SIZE,
  BOT_ID,
  BOT_NAME,
  INITIAL_WORD,
  chooseStartingPlayer,
  chooseInitialWord,
  createBoard,
  createDictionaryTrie,
  createBaldaResources,
  createBaldaService,
  findBotMove,
  normalizeWord,
  normalizeTurnDuration,
};
