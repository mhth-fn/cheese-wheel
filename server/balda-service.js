'use strict';

const { loadBuiltInBaldaWords } = require('./balda-dictionary');

const BOARD_SIZE = 5;
const INITIAL_WORD = 'СЫРОК';
const ROOM_NAME = 'balda';

function emptyBoard() {
  const board = Array(BOARD_SIZE * BOARD_SIZE).fill('');
  [...INITIAL_WORD].forEach((letter, column) => {
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

function createBaldaService({ db, io }) {
  const getGameStmt = db.prepare('SELECT * FROM balda_games WHERE id = 1');
  const getUserStmt = db.prepare('SELECT id, name FROM users WHERE id = ?');
  const findWordStmt = db.prepare('SELECT word FROM balda_dictionary WHERE word = ?');
  const countWordsStmt = db.prepare('SELECT COUNT(*) AS count FROM balda_dictionary');
  const insertWordStmt = db.prepare(`
    INSERT OR IGNORE INTO balda_dictionary (
      word, source, added_by, approved_by, added_at
    ) VALUES (?, ?, ?, ?, ?)
  `);
  const updateGameStmt = db.prepare(`
    UPDATE balda_games SET
      player_one_id = @player_one_id,
      player_two_id = @player_two_id,
      board_json = @board_json,
      used_words_json = @used_words_json,
      scores_json = @scores_json,
      moves_json = @moves_json,
      current_player_id = @current_player_id,
      status = @status,
      winner_id = @winner_id,
      pending_word_json = @pending_word_json,
      consecutive_passes = @consecutive_passes,
      updated_at = @updated_at
    WHERE id = 1
  `);

  db.prepare(`
    INSERT OR IGNORE INTO balda_games (
      id, board_json, used_words_json, scores_json, moves_json,
      status, consecutive_passes, updated_at
    ) VALUES (1, ?, ?, '{}', '[]', 'waiting', 0, ?)
  `).run(JSON.stringify(emptyBoard()), JSON.stringify([INITIAL_WORD]), Date.now());

  const seedDictionary = db.transaction(() => {
    for (const word of loadBuiltInBaldaWords()) {
      insertWordStmt.run(word, 'built-in', null, null, 0);
    }
  });
  seedDictionary();

  function readGame() {
    const row = getGameStmt.get();
    const board = parseJson(row.board_json, emptyBoard());
    return {
      ...row,
      board: Array.isArray(board) && board.length === BOARD_SIZE * BOARD_SIZE
        ? board.map(cell => normalizeWord(cell).slice(0, 1))
        : emptyBoard(),
      usedWords: parseJson(row.used_words_json, [INITIAL_WORD]),
      scores: parseJson(row.scores_json, {}),
      moves: parseJson(row.moves_json, []),
      pendingWord: parseJson(row.pending_word_json, null),
    };
  }

  function writeGame(game) {
    const row = {
      player_one_id: game.player_one_id ?? null,
      player_two_id: game.player_two_id ?? null,
      board_json: JSON.stringify(game.board),
      used_words_json: JSON.stringify(game.usedWords),
      scores_json: JSON.stringify(game.scores),
      moves_json: JSON.stringify(game.moves),
      current_player_id: game.current_player_id ?? null,
      status: game.status,
      winner_id: game.winner_id ?? null,
      pending_word_json: game.pendingWord ? JSON.stringify(game.pendingWord) : null,
      consecutive_passes: game.consecutive_passes || 0,
      updated_at: Date.now(),
    };
    updateGameStmt.run(row);
    return readGame();
  }

  function getViewerCount(game) {
    const socketIds = io.sockets.adapter.rooms.get(ROOM_NAME) || new Set();
    const playerIds = new Set(
      [game.player_one_id, game.player_two_id].filter(Boolean).map(Number)
    );
    const viewers = new Set();
    for (const socketId of socketIds) {
      const socket = io.sockets.sockets.get(socketId);
      const userId = Number(socket?.data?.tokenData?.userId);
      if (Number.isInteger(userId)) {
        if (!playerIds.has(userId)) viewers.add(`user:${userId}`);
      } else {
        viewers.add(`guest:${socketId}`);
      }
    }
    return viewers.size;
  }

  function serializeGame(game = readGame()) {
    const players = [game.player_one_id, game.player_two_id].map((userId, index) => {
      if (!userId) return { slot: index + 1, user: null, score: 0 };
      const user = getUserStmt.get(userId);
      return {
        slot: index + 1,
        user: user ? { id: Number(user.id), name: user.name } : null,
        score: Number(game.scores[String(userId)] || 0),
      };
    });
    const winner = game.winner_id ? getUserStmt.get(game.winner_id) : null;
    return {
      board: game.board,
      boardSize: BOARD_SIZE,
      consecutivePasses: game.consecutive_passes || 0,
      currentPlayerId: game.current_player_id ? Number(game.current_player_id) : null,
      dictionarySize: Number(countWordsStmt.get().count),
      initialWord: INITIAL_WORD,
      moves: game.moves,
      pendingWord: game.pendingWord,
      players,
      spectatorCount: getViewerCount(game),
      status: game.status,
      updatedAt: Number(game.updated_at),
      usedWords: game.usedWords,
      winner: winner ? { id: Number(winner.id), name: winner.name } : null,
    };
  }

  function broadcast() {
    const state = serializeGame();
    io.to(ROOM_NAME).emit('balda:state', state);
    return state;
  }

  function resetGame(game) {
    const scores = {};
    if (game.player_one_id) scores[String(game.player_one_id)] = 0;
    if (game.player_two_id) scores[String(game.player_two_id)] = 0;
    return {
      ...game,
      board: emptyBoard(),
      usedWords: [INITIAL_WORD],
      scores,
      moves: [],
      current_player_id: game.player_one_id || null,
      status: game.player_one_id && game.player_two_id ? 'playing' : 'waiting',
      winner_id: null,
      pendingWord: null,
      consecutive_passes: 0,
    };
  }

  function otherPlayerId(game, userId) {
    if (Number(game.player_one_id) === Number(userId)) return game.player_two_id;
    if (Number(game.player_two_id) === Number(userId)) return game.player_one_id;
    return null;
  }

  function isSeated(game, userId) {
    return Number(game.player_one_id) === Number(userId)
      || Number(game.player_two_id) === Number(userId);
  }

  function finishGame(game) {
    const firstScore = Number(game.scores[String(game.player_one_id)] || 0);
    const secondScore = Number(game.scores[String(game.player_two_id)] || 0);
    game.status = 'finished';
    game.current_player_id = null;
    game.pendingWord = null;
    game.winner_id = firstScore === secondScore
      ? null
      : firstScore > secondScore ? game.player_one_id : game.player_two_id;
  }

  function join(userId) {
    const transaction = db.transaction(() => {
      let game = readGame();
      if (isSeated(game, userId)) return { ok: true };
      if (game.player_one_id && game.player_two_id) {
        return { ok: false, error: 'Оба места игроков уже заняты' };
      }
      if (!game.player_one_id) game.player_one_id = userId;
      else game.player_two_id = userId;
      if (game.player_one_id && game.player_two_id) game = resetGame(game);
      else {
        game.status = 'waiting';
        game.current_player_id = null;
        game.pendingWord = null;
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
        game.status = 'finished';
        game.winner_id = opponentId;
      }
      if (Number(game.player_one_id) === Number(userId)) game.player_one_id = null;
      if (Number(game.player_two_id) === Number(userId)) game.player_two_id = null;
      game.current_player_id = null;
      game.pendingWord = null;
      if (!game.player_one_id && !game.player_two_id) {
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
    if (Number(game.current_player_id) !== Number(userId)) return { error: 'Сейчас ход другого игрока' };
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
    const user = getUserStmt.get(userId);
    game.board[(move.row * BOARD_SIZE) + move.column] = move.letter;
    game.usedWords.push(move.word);
    game.scores[String(userId)] = Number(game.scores[String(userId)] || 0) + move.word.length;
    game.moves.push({
      userId: Number(userId),
      userName: user?.name || 'Игрок',
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
    if (game.board.every(Boolean)) finishGame(game);
    else game.current_player_id = otherPlayerId(game, userId);
  }

  function submitMove(userId, payload) {
    const transaction = db.transaction(() => {
      const game = readGame();
      const move = validateMove(game, userId, payload);
      if (move.error) return { ok: false, error: move.error };
      if (!findWordStmt.get(move.word)) {
        game.pendingWord = {
          ...move,
          proposerId: Number(userId),
          responderId: Number(otherPlayerId(game, userId)),
          createdAt: Date.now(),
        };
        writeGame(game);
        return { ok: true, pending: true, word: move.word };
      }
      applyMove(game, userId, move);
      writeGame(game);
      return { ok: true, pending: false, word: move.word };
    });
    const result = transaction();
    if (result.ok) broadcast();
    return result;
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
      applyMove(game, pending.proposerId, revalidated);
      writeGame(game);
      return { ok: true, accepted: true, word: revalidated.word };
    });
    const result = transaction();
    if (result.ok) broadcast();
    return result;
  }

  function pass(userId) {
    const transaction = db.transaction(() => {
      const game = readGame();
      if (game.status !== 'playing' || Number(game.current_player_id) !== Number(userId)) {
        return { ok: false, error: 'Сейчас нельзя пропустить ход' };
      }
      if (game.pendingWord) return { ok: false, error: 'Сначала решите спор о слове' };
      game.consecutive_passes += 1;
      game.moves.push({
        userId: Number(userId),
        userName: getUserStmt.get(userId)?.name || 'Игрок',
        pass: true,
        createdAt: Date.now(),
      });
      if (game.consecutive_passes >= 2) finishGame(game);
      else game.current_player_id = otherPlayerId(game, userId);
      writeGame(game);
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
      if (!game.player_one_id || !game.player_two_id) return { ok: false, error: 'Для игры нужны два игрока' };
      if (game.status === 'playing') return { ok: false, error: 'Текущая партия ещё не завершена' };
      writeGame(resetGame(game));
      return { ok: true };
    });
    const result = transaction();
    if (result.ok) broadcast();
    return result;
  }

  return {
    broadcast,
    getState: () => serializeGame(),
    join,
    leave,
    newGame,
    pass,
    resolveWord,
    roomName: ROOM_NAME,
    submitMove,
  };
}

module.exports = {
  BOARD_SIZE,
  INITIAL_WORD,
  createBaldaService,
  normalizeWord,
};
