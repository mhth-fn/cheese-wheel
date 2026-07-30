'use strict';

const crypto = require('node:crypto');

function registerSocketHandlers(context) {
  const {
    MAX_SPIN_DURATION,
    MIN_SPIN_DURATION,
    broadcastOneOffState,
    claimPendingSpin,
    consumeRateLimit,
    db,
    getClientRateKey,
    getCookieToken,
    getOneOffState,
    getTokenData,
    getWheelStatus,
    io,
    isMemberToken,
    parseIntStrict,
    schedulePendingSpin,
    serializeOneOffMovie,
    setOneOffResult,
    setOneOffSetting,
    spinState,
    stmts,
    stopOneOffElimination,
  } = context;

const onlineUsers = new Map(); // socketId -> { userId, userName }

function broadcastOnlineUsers() {
  const users = [];
  const seen = new Set();
  for (const [, info] of onlineUsers) {
    if (info.userId && !seen.has(info.userId)) {
      seen.add(info.userId);
      users.push({ id: info.userId, name: info.userName });
    }
  }
  io.emit('online-users', users);
}

function getSocketToken(socket) {
  const authToken = socket.handshake.auth?.token;
  if (typeof authToken === 'string' && authToken) return authToken;
  return getCookieToken(socket.request);
}

io.use((socket, next) => {
  const connectionLimit = consumeRateLimit(
    'socket-connect',
    getClientRateKey(socket.request),
    60,
    60 * 1000
  );
  if (!connectionLimit.allowed) return next(new Error('Слишком много подключений'));

  const token = getSocketToken(socket);
  const tokenData = getTokenData(token);
  if (!tokenData) return next(new Error('Требуется авторизация'));

  socket.data.authToken = token;
  socket.data.tokenData = tokenData;
  next();
});

function performOneOffSpin(initiatorSocketId) {
  const now = Date.now();
  if (spinState.activeOneOffSpinUntil > now) {
    return { ok: false, error: 'Разовое колесо уже вращается' };
  }

  const state = getOneOffState();
  if (!state.enabled) {
    stopOneOffElimination();
    return { ok: false, error: 'Разовое колесо не опубликовано' };
  }
  if (state.result) {
    stopOneOffElimination();
    return { ok: false, error: 'Сначала завершите текущий выбор' };
  }
  if (state.movies.length === 0) {
    stopOneOffElimination();
    return { ok: false, error: 'Добавьте хотя бы один фильм' };
  }
  if (spinState.oneOffEliminationActive && state.mode !== 'elimination') {
    stopOneOffElimination();
    return { ok: false, error: 'Режим на выбывание остановлен' };
  }

  const spinDuration = state.spin_duration;
  const selectedIndex = crypto.randomInt(state.movies.length);
  const selectedMovie = state.movies[selectedIndex];
  const randomOffset = 0.08 + (crypto.randomInt(8401) / 10000);
  const turns = 12 + crypto.randomInt(7);
  const spinId = crypto.randomUUID();
  let outcome;

  try {
    outcome = db.transaction(() => {
      if (state.mode === 'selection' || state.movies.length === 1) {
        setOneOffSetting('one_off_enabled', '0');
        const winnerResult = {
          movie: selectedMovie,
          mode: state.mode,
          created_at: Date.now(),
        };
        setOneOffResult(winnerResult);
        return { type: 'winner', movie: selectedMovie, winner: selectedMovie };
      }

      stmts.deleteOneOffMovie.run(selectedMovie.id);
      const remaining = stmts.getOneOffMovies.all().map(serializeOneOffMovie);
      if (remaining.length === 1) {
        setOneOffSetting('one_off_enabled', '0');
        const winnerResult = {
          movie: remaining[0],
          eliminated_movie: selectedMovie,
          mode: state.mode,
          created_at: Date.now(),
        };
        setOneOffResult(winnerResult);
        return {
          type: 'eliminated-and-winner',
          movie: selectedMovie,
          winner: remaining[0],
        };
      }
      return { type: 'eliminated', movie: selectedMovie, winner: null };
    })();
  } catch (error) {
    stopOneOffElimination();
    console.error('[cheese-wheel] Could not spin one-off wheel:', error.message);
    return { ok: false, error: 'Не удалось сохранить результат' };
  }

  spinState.activeOneOffSpinUntil = Date.now() + spinDuration * 1000;
  const shouldContinue = outcome.type === 'eliminated';
  spinState.oneOffEliminationActive = shouldContinue;

  io.emit('one-off-spinning', {
    spinId,
    movies: state.movies,
    winnerIndex: selectedIndex,
    winnerMovieId: selectedMovie.id,
    spinDuration,
    randomOffset,
    turns,
    mode: state.mode,
    outcome,
    initiatorSocketId,
  });
  broadcastOneOffState();

  if (!shouldContinue) {
    stopOneOffElimination();
  }

  return { ok: true, outcome };
}

io.on('connection', (socket) => {
  const memberData = getTokenData(socket.data.authToken);
  if (isMemberToken(memberData)) {
    const user = stmts.getUsers.all().find(item => Number(item.id) === Number(memberData.userId));
    if (user) onlineUsers.set(socket.id, { userId: user.id, userName: user.name });
  }

  // Send current online list to newly connected socket
  const currentUsers = [];
  const currentSeen = new Set();
  for (const [, info] of onlineUsers) {
    if (info.userId && !currentSeen.has(info.userId)) {
      currentSeen.add(info.userId);
      currentUsers.push({ id: info.userId, name: info.userName });
    }
  }
  socket.emit('online-users', currentUsers);
  if (onlineUsers.has(socket.id)) broadcastOnlineUsers();

  socket.on('spin-wheel', (data) => {
    const tokenData = getTokenData(socket.data.authToken);
    if (!isMemberToken(tokenData)) {
      socket.emit('spin-rejected', { error: 'Прокрутка доступна только участникам' });
      return;
    }

    const now = Date.now();
    if (now - (socket.data.lastSpinAttemptAt || 0) < 1000) {
      socket.emit('spin-rejected', { error: 'Слишком много запросов' });
      return;
    }
    socket.data.lastSpinAttemptAt = now;
    const userSpinLimit = consumeRateLimit(
      'socket-spin-user',
      tokenData.userId,
      12,
      60 * 1000
    );
    if (!userSpinLimit.allowed) {
      socket.emit('spin-rejected', { error: 'Слишком много прокруток' });
      return;
    }
    const globalSpinLimit = consumeRateLimit(
      'socket-spin-global',
      'all',
      60,
      60 * 1000
    );
    if (!globalSpinLimit.allowed) {
      socket.emit('spin-rejected', { error: 'Слишком много прокруток' });
      return;
    }

    const spinEnabledRow = db.prepare("SELECT value FROM settings WHERE key = 'spin_enabled'").get();
    if (spinEnabledRow?.value === '0') {
      socket.emit('spin-rejected', { error: 'Прокрутка основного колеса отключена' });
      return;
    }
    if (Date.now() < spinState.activeSpinUntil) {
      socket.emit('spin-rejected', { error: 'Колесо уже вращается' });
      return;
    }

    const spinDuration = parseIntStrict(data?.spinDuration);
    if (isNaN(spinDuration) || spinDuration < MIN_SPIN_DURATION || spinDuration > MAX_SPIN_DURATION) {
      socket.emit('spin-rejected', { error: 'Неверное время прокрутки' });
      return;
    }

    const wheelStatus = getWheelStatus();
    if (!wheelStatus.formed) {
      socket.emit('spin-rejected', { error: 'Сначала сформируйте колесо' });
      return;
    }
    const movies = wheelStatus.movies;
    if (movies.length === 0) {
      socket.emit('spin-rejected', { error: 'Все фильмы текущего раунда уже просмотрены' });
      return;
    }

    const winnerIndex = crypto.randomInt(movies.length);
    const randomOffset = 0.08 + (crypto.randomInt(8401) / 10000);
    const turns = 14 + crypto.randomInt(7);
    const spinId = crypto.randomUUID();
    const winner = movies[winnerIndex];
    const pendingSpin = {
      spinId,
      movieId: Number(winner.id),
      actorUserId: Number(tokenData.userId),
      completeAt: Date.now() + spinDuration * 1000 + 250,
    };
    try {
      const claimed = claimPendingSpin(pendingSpin, {
        actorRole: tokenData.role,
        ip: getClientRateKey(socket.request),
        userAgent: socket.request.headers['user-agent'],
      });
      if (!claimed) {
        socket.emit('spin-rejected', { error: 'Колесо уже вращается' });
        return;
      }
      spinState.activeSpinUntil = pendingSpin.completeAt + 950;
      schedulePendingSpin(pendingSpin);
    } catch (error) {
      console.error('[cheese-wheel] Failed to persist spin:', error.message);
      socket.emit('spin-rejected', { error: 'Не удалось сохранить результат вращения' });
      return;
    }

    io.emit('wheel-spinning', {
      spinId,
      winnerIndex,
      winnerMovieId: winner.id,
      winnerTitle: winner.title,
      spinDuration,
      randomOffset,
      turns,
      initiatorSocketId: socket.id,
    });
  });

  socket.on('spin-one-off', () => {
    const tokenData = getTokenData(socket.data.authToken);
    if (!isMemberToken(tokenData) || tokenData.role !== 'admin') {
      socket.emit('one-off-spin-rejected', {
        error: 'Разовое колесо прокручивает администратор',
      });
      return;
    }

    const now = Date.now();
    if (now - (socket.data.lastOneOffSpinAttemptAt || 0) < 1000) {
      socket.emit('one-off-spin-rejected', { error: 'Слишком много запросов' });
      return;
    }
    socket.data.lastOneOffSpinAttemptAt = now;
    const spinLimit = consumeRateLimit(
      'socket-one-off-spin-user',
      tokenData.userId,
      20,
      60 * 1000
    );
    if (!spinLimit.allowed) {
      socket.emit('one-off-spin-rejected', { error: 'Слишком много прокруток' });
      return;
    }
    const result = performOneOffSpin(socket.id);
    if (!result.ok) {
      socket.emit('one-off-spin-rejected', { error: result.error });
    }
  });

  socket.on('disconnect', () => {
    onlineUsers.delete(socket.id);
    broadcastOnlineUsers();
  });
});

// SPA fallback
}

module.exports = { registerSocketHandlers };
