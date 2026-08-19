'use strict';

const crypto = require('node:crypto');

const CARTOON_EFFECT_SEED_LIMIT = 0x1_0000_0000;
const ONE_OFF_POST_SPIN_LOCK_MS = 1000;
const NATURAL_RECOIL_CHANCE_PERCENT = 28;
const NATURAL_RECOIL_MIN_DEGREES = 2;
const NATURAL_RECOIL_STEPS = 201;

function createNaturalRecoilGeometry(movieCount, randomOffset, recoilDegrees) {
  const sliceDegrees = 360 / movieCount;
  const recoilRatio = recoilDegrees / sliceDegrees;
  const boundaryDistanceDegrees = randomOffset * sliceDegrees;
  const crossesBoundary = movieCount > 1 && recoilDegrees > boundaryDistanceDegrees;

  return {
    recoilRatio,
    recoilDegrees,
    crossesBoundary,
    boundaryOvershootDegrees: crossesBoundary
      ? recoilDegrees - boundaryDistanceDegrees
      : 0,
  };
}

function createCartoonMotion(movieCount) {
  const effectSeed = crypto.randomInt(CARTOON_EFFECT_SEED_LIMIT);
  // Choose the landing point first. Recoil must never drag the result towards
  // a boundary just to manufacture a false finish.
  const randomOffset = 0.02 + crypto.randomInt(9601) / 10000;
  const recoil = crypto.randomInt(100) < NATURAL_RECOIL_CHANCE_PERCENT;
  const recoilDegrees = recoil
    ? NATURAL_RECOIL_MIN_DEGREES + crypto.randomInt(NATURAL_RECOIL_STEPS) / 100
    : 0;
  const geometry = createNaturalRecoilGeometry(
    movieCount,
    randomOffset,
    recoilDegrees,
  );

  return {
    randomOffset,
    animation: {
      profile: 'cartoon',
      recoil,
      ...geometry,
      effectSeed,
    },
  };
}

function registerSocketHandlers(context) {
  const {
    MAX_SPIN_DURATION,
    MIN_SPIN_DURATION,
    baldaServices,
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

let activeOneOffSpinTimer = null;

function rememberActiveOneOffSpin(payload) {
  spinState.activeOneOffSpin = payload;
  spinState.activeOneOffSpinUntil = payload.nextSpinAt;
  if (activeOneOffSpinTimer) clearTimeout(activeOneOffSpinTimer);
  activeOneOffSpinTimer = setTimeout(() => {
    activeOneOffSpinTimer = null;
    if (spinState.activeOneOffSpin?.spinId === payload.spinId) {
      spinState.activeOneOffSpin = null;
    }
  }, Math.max(0, payload.nextSpinAt - Date.now()));
  activeOneOffSpinTimer.unref();
}

const onlineUsers = new Map(); // socketId -> { userId, userName }
const baldaDisconnectTimers = new Map(); // userId -> timeout
const configuredBaldaGrace = Number(process.env.BALDA_DISCONNECT_GRACE_MS);
const baldaDisconnectGraceMs = process.env.NODE_ENV === 'test'
  && Number.isFinite(configuredBaldaGrace)
  ? Math.max(50, configuredBaldaGrace)
  : 30_000;

function getBaldaService(roomId) {
  return baldaServices.get(Number(roomId)) || null;
}

function getBaldaPresence() {
  const rooms = [...baldaServices.values()].map(service => service.getSummary());
  return {
    ok: true,
    onlineCount: rooms.reduce((total, room) => total + room.onlineCount, 0),
    rooms,
  };
}

function isUserWatchingBalda(userId) {
  for (const [socketId, info] of onlineUsers) {
    if (Number(info.userId) !== Number(userId)) continue;
    const activeSocket = io.sockets.sockets.get(socketId);
    const service = getBaldaService(activeSocket?.data?.baldaRoomId);
    if (service && activeSocket.rooms.has(service.roomName)) return true;
  }
  return false;
}

function cancelBaldaDisconnect(userId) {
  const timer = baldaDisconnectTimers.get(Number(userId));
  if (timer) clearTimeout(timer);
  baldaDisconnectTimers.delete(Number(userId));
}

function scheduleBaldaDisconnect(userId) {
  const normalizedUserId = Number(userId);
  if (!Number.isInteger(normalizedUserId) || isUserWatchingBalda(normalizedUserId)) return;
  cancelBaldaDisconnect(normalizedUserId);
  const timer = setTimeout(() => {
    baldaDisconnectTimers.delete(normalizedUserId);
    if (isUserWatchingBalda(normalizedUserId)) return;
    for (const service of baldaServices.values()) {
      if (service.getSeatedUserIds().includes(normalizedUserId)) service.leave(normalizedUserId);
    }
  }, baldaDisconnectGraceMs);
  timer.unref();
  baldaDisconnectTimers.set(normalizedUserId, timer);
}

for (const service of baldaServices.values()) {
  for (const userId of service.getSeatedUserIds()) scheduleBaldaDisconnect(userId);
}

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
  const { animation, randomOffset } = createCartoonMotion(state.movies.length);
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

  const spinStartedAt = Date.now();
  const spinCompleteAt = spinStartedAt + spinDuration * 1000;
  const nextSpinAt = spinCompleteAt + ONE_OFF_POST_SPIN_LOCK_MS;
  const shouldContinue = outcome.type === 'eliminated';
  spinState.oneOffEliminationActive = shouldContinue;
  const spinPayload = {
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
    animation,
    spinStartedAt,
    spinCompleteAt,
    nextSpinAt,
  };
  rememberActiveOneOffSpin(spinPayload);
  io.emit('one-off-spinning', { ...spinPayload, resumeElapsedMs: 0 });
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
    if (user) {
      onlineUsers.set(socket.id, { userId: user.id, userName: user.name });
    }
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
  for (const room of getBaldaPresence().rooms) socket.emit('balda:presence', room);
  if (onlineUsers.has(socket.id)) broadcastOnlineUsers();
  const activeOneOffSpin = spinState.activeOneOffSpin;
  if (activeOneOffSpin?.spinCompleteAt > Date.now()) {
    socket.emit('one-off-spinning', {
      ...activeOneOffSpin,
      resumeElapsedMs: Math.min(
        Math.max(0, Date.now() - activeOneOffSpin.spinStartedAt),
        activeOneOffSpin.spinDuration * 1000,
      ),
    });
  }

  const replyToBaldaAction = (ack, result) => {
    if (typeof ack === 'function') ack(result);
  };

  const normalizeBaldaArgs = (data, ack) => (
    typeof data === 'function'
      ? [{ roomId: socket.data.baldaRoomId || 1 }, data]
      : [data || {}, ack]
  );

  const runBaldaMutation = (scope, data, ack, mutation) => {
    const [payload, callback] = normalizeBaldaArgs(data, ack);
    const tokenData = getTokenData(socket.data.authToken);
    if (!isMemberToken(tokenData)) {
      replyToBaldaAction(callback, {
        ok: false,
        error: 'Игровые места доступны только пользователям',
      });
      return;
    }
    const service = getBaldaService(payload.roomId || socket.data.baldaRoomId || 1);
    if (!service) {
      replyToBaldaAction(callback, { ok: false, error: 'Комната не найдена' });
      return;
    }
    const limit = consumeRateLimit(
      `socket-balda-${scope}`,
      tokenData.userId,
      60,
      60 * 1000,
    );
    if (!limit.allowed) {
      replyToBaldaAction(callback, { ok: false, error: 'Слишком много запросов' });
      return;
    }
    try {
      replyToBaldaAction(
        callback,
        mutation(Number(tokenData.userId), service, payload),
      );
    } catch (error) {
      console.error('[cheese-wheel] Balda action failed:', error.message);
      replyToBaldaAction(callback, { ok: false, error: 'Не удалось изменить партию' });
    }
  };

  socket.on('balda:watch', (data, ack) => {
    const [payload, callback] = normalizeBaldaArgs(data, ack);
    const service = getBaldaService(payload.roomId || 1);
    if (!service) {
      replyToBaldaAction(callback, { ok: false, error: 'Комната не найдена' });
      return;
    }
    const previousService = getBaldaService(socket.data.baldaRoomId);
    if (previousService && previousService.roomId !== service.roomId) {
      socket.leave(previousService.roomName);
      previousService.broadcast();
    }
    socket.data.baldaRoomId = service.roomId;
    if (!socket.rooms.has(service.roomName)) socket.join(service.roomName);
    const tokenData = getTokenData(socket.data.authToken);
    if (isMemberToken(tokenData)) cancelBaldaDisconnect(tokenData.userId);
    const state = service.broadcast();
    replyToBaldaAction(callback, { ok: true, state });
  });

  socket.on('balda:get-presence', (ack) => {
    replyToBaldaAction(ack, getBaldaPresence());
  });

  socket.on('balda:unwatch', (data, ack) => {
    const [payload, callback] = normalizeBaldaArgs(data, ack);
    const service = getBaldaService(payload.roomId || socket.data.baldaRoomId || 1);
    const wasWatching = Boolean(service && socket.rooms.has(service.roomName));
    if (service) socket.leave(service.roomName);
    if (service?.roomId === socket.data.baldaRoomId) socket.data.baldaRoomId = null;
    const tokenData = getTokenData(socket.data.authToken);
    if (isMemberToken(tokenData) && !isUserWatchingBalda(tokenData.userId)) {
      scheduleBaldaDisconnect(tokenData.userId);
    }
    replyToBaldaAction(callback, { ok: true });
    if (wasWatching) service.broadcast();
  });

  socket.on('balda:join', (data, ack) => {
    runBaldaMutation('seat', data, ack, (userId, service) => {
      const otherRoom = [...baldaServices.values()].find(candidate => (
        candidate.roomId !== service.roomId && candidate.getSeatedUserIds().includes(userId)
      ));
      if (otherRoom) {
        return { ok: false, error: `Вы уже играете в комнате ${otherRoom.roomId}` };
      }
      return service.join(userId);
    });
  });

  socket.on('balda:add-bot', (data, ack) => {
    runBaldaMutation('seat', data, ack, (userId, service) => service.addBot(userId));
  });

  socket.on('balda:remove-bot', (data, ack) => {
    runBaldaMutation('seat', data, ack, (userId, service) => service.removeBot(userId));
  });

  socket.on('balda:leave', (data, ack) => {
    runBaldaMutation('seat', data, ack, (userId, service) => service.leave(userId));
  });

  socket.on('balda:submit-move', (data, ack) => {
    runBaldaMutation('move', data, ack, (userId, service, payload) => (
      service.submitMove(userId, payload)
    ));
  });

  socket.on('balda:propose-word', (data, ack) => {
    runBaldaMutation('move', data, ack, (userId, service, payload) => (
      service.proposeWord(userId, payload)
    ));
  });

  socket.on('balda:check-word', (data, ack) => {
    const tokenData = getTokenData(socket.data.authToken);
    const limit = consumeRateLimit(
      'socket-balda-dictionary',
      tokenData?.userId || socket.id,
      120,
      60 * 1000,
    );
    if (!limit.allowed) {
      replyToBaldaAction(ack, { ok: false, error: 'Слишком много запросов' });
      return;
    }
    const service = getBaldaService(data?.roomId || 1);
    replyToBaldaAction(
      ack,
      service ? service.checkWord(data?.word) : { ok: false, error: 'Комната не найдена' },
    );
  });

  socket.on('balda:resolve-word', (data, ack) => {
    runBaldaMutation(
      'word',
      data,
      ack,
      (userId, service, payload) => service.resolveWord(userId, payload.accepted),
    );
  });

  socket.on('balda:pass', (data, ack) => {
    runBaldaMutation('move', data, ack, (userId, service) => service.pass(userId));
  });

  socket.on('balda:new-game', (data, ack) => {
    runBaldaMutation('game', data, ack, (userId, service) => service.newGame(userId));
  });

  socket.on('balda:set-turn-duration', (data, ack) => {
    runBaldaMutation(
      'game',
      data,
      ack,
      (userId, service, payload) => service.setTurnDuration(userId, payload.seconds),
    );
  });

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
      animation: createCartoonMotion(movies.length).animation,
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
    const disconnectedUserId = onlineUsers.get(socket.id)?.userId;
    onlineUsers.delete(socket.id);
    broadcastOnlineUsers();
    if (disconnectedUserId && !isUserWatchingBalda(disconnectedUserId)) {
      scheduleBaldaDisconnect(disconnectedUserId);
    }
    setImmediate(() => {
      for (const service of baldaServices.values()) service.broadcastPresence();
    });
  });
});

// SPA fallback
}

module.exports = { createNaturalRecoilGeometry, registerSocketHandlers };
