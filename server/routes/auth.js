'use strict';

const {
  base32Encode,
  encryptTotpSecret,
  generateTotpSecret,
  hashLoginChallenge,
  hashSessionToken,
} = require('../../lib/security');

function registerAuthRoutes(context) {
  const {
    DUMMY_PASSWORD_HASH,
    app,
    auditLog,
    authSecurityStmts,
    clearSessionCookie,
    completeTwoFactorLogin,
    consumeRateLimit,
    createToken,
    db,
    disableTwoFactor,
    enablePendingTotp,
    getClientRateKey,
    getRequestToken,
    getTokenData,
    getTotpEncryptionKey,
    hashPassword,
    io,
    isMemberToken,
    issueLoginChallenge,
    parseIntStrict,
    regenerateRecoveryCodeSet,
    rejectRateLimited,
    requireAdmin,
    requireAuth,
    requireMember,
    serializeAuthUser,
    setSessionCookie,
    stmts,
    verifyPassword,
  } = context;

app.get('/healthz', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ status: 'ok' });
});

app.get('/readyz', (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    db.prepare('SELECT 1').get();
    res.json({ status: 'ready' });
  } catch {
    res.status(503).json({ status: 'not_ready' });
  }
});

// Публичные маршруты: вход, выход, гостевой вход и GET /api/users
// Всё остальное — через requireAuth
app.use('/api', (req, res, next) => {
  if (req.path === '/auth' && req.method === 'POST') return next();
  if (req.path === '/auth/2fa' && req.method === 'POST') return next();
  if (req.path === '/auth/guest' && req.method === 'POST') return next();
  if (req.path === '/auth/logout' && req.method === 'POST') return next();
  if (req.path === '/users' && req.method === 'GET') return next();
  requireAuth(req, res, () => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const writeLimit = consumeRateLimit(
        'api-write',
        req.authTokenHash,
        180,
        60 * 1000
      );
      if (!writeLimit.allowed) return rejectRateLimited(res, writeLimit);
    }
    next();
  });
});

app.post('/api/auth', (req, res) => {
  const { user_id, password } = req.body || {};
  const userId = parseIntStrict(user_id);
  if (isNaN(userId) || typeof password !== 'string') {
    return res.status(400).json({ error: 'Неверный формат' });
  }

  const ipLimit = consumeRateLimit('auth-ip', getClientRateKey(req), 30, 60 * 1000);
  if (!ipLimit.allowed) return rejectRateLimited(res, ipLimit);
  const accountLimit = consumeRateLimit('auth-account', userId, 10, 60 * 1000);
  if (!accountLimit.allowed) return rejectRateLimited(res, accountLimit);
  const globalLimit = consumeRateLimit('auth-global', 'all', 120, 60 * 1000);
  if (!globalLimit.allowed) return rejectRateLimited(res, globalLimit);

  const user = stmts.getUserWithPassword.get(userId);
  const passwordValid = verifyPassword(password, user?.password_hash || DUMMY_PASSWORD_HASH);
  if (user && passwordValid) {
    req.auditActor = { userId: user.id, role: user.role };
    const totp = authSecurityStmts.getTotp.get(user.id);
    if (totp?.enabled === 1) {
      const challenge = issueLoginChallenge(user.id);
      return res.status(202).json({
        success: false,
        two_factor_required: true,
        challenge,
        challenge_id: challenge,
        expires_in: 5 * 60,
      });
    }

    const token = createToken(user.id);
    setSessionCookie(res, token);
    res.json({
      success: true,
      user: serializeAuthUser(stmts.getAuthUser.get(user.id)),
    });
  } else {
    res.status(401).json({ error: 'Неверный пользователь или пароль' });
  }
});

app.post('/api/auth/2fa', (req, res) => {
  const { code } = req.body || {};
  const challenge = req.body?.challenge ?? req.body?.challenge_id;
  if (
    typeof challenge !== 'string' ||
    typeof code !== 'string' ||
    !hashLoginChallenge(challenge)
  ) {
    return res.status(400).json({ error: 'Неверный формат' });
  }

  const ipLimit = consumeRateLimit(
    'auth-2fa-ip',
    getClientRateKey(req),
    30,
    5 * 60 * 1000
  );
  if (!ipLimit.allowed) return rejectRateLimited(res, ipLimit);
  const challengeLimit = consumeRateLimit(
    'auth-2fa-challenge',
    hashLoginChallenge(challenge),
    8,
    5 * 60 * 1000
  );
  if (!challengeLimit.allowed) return rejectRateLimited(res, challengeLimit);

  try {
    const result = completeTwoFactorLogin(challenge, code);
    if (result.status !== 'ok') {
      return res.status(401).json({ error: 'Неверный или просроченный код' });
    }
    req.auditActor = { userId: result.user.id, role: result.user.role };
    if (result.usedRecoveryCode) {
      auditLog.record({
        actorUserId: result.user.id,
        actorRole: result.user.role,
        action: 'two_factor.recovery_used',
        targetType: 'user',
        targetId: result.user.id,
        result: 'success',
        requestId: req.auditRequestId,
        ip: getClientRateKey(req),
        userAgent: req.headers['user-agent'],
      });
    }
    setSessionCookie(res, result.token);
    return res.json({
      success: true,
      user: result.user,
      used_recovery_code: result.usedRecoveryCode,
    });
  } catch (error) {
    console.error('[cheese-wheel] 2FA login failed:', error.message);
    return res.status(500).json({ error: 'Не удалось проверить код' });
  }
});

app.post('/api/auth/guest', (req, res) => {
  const existingToken = getRequestToken(req);
  const existingSession = getTokenData(existingToken);
  if (existingSession?.isGuest) {
    setSessionCookie(res, existingToken);
    return res.json({ success: true, is_guest: true });
  }

  const ipLimit = consumeRateLimit('guest-ip', getClientRateKey(req), 20, 60 * 1000);
  if (!ipLimit.allowed) return rejectRateLimited(res, ipLimit);
  const globalLimit = consumeRateLimit('guest-global', 'all', 120, 60 * 1000);
  if (!globalLimit.allowed) return rejectRateLimited(res, globalLimit);

  const token = createToken(null, true);
  setSessionCookie(res, token);
  res.json({ success: true, is_guest: true });
});

app.post('/api/auth/logout', (req, res) => {
  const token = getRequestToken(req);
  const tokenData = getTokenData(token);
  if (tokenData?.userId) {
    req.auditActor = { userId: tokenData.userId, role: tokenData.role };
  }
  const tokenHash = hashSessionToken(token);
  if (tokenHash) db.prepare('DELETE FROM tokens WHERE token=?').run(tokenHash);
  clearSessionCookie(res);
  res.json({ success: true });
});

app.get('/api/auth/session', (req, res) => {
  if (req.tokenData.isGuest) {
    return res.json({ authenticated: true, is_guest: true, user: null });
  }
  const user = stmts.getAuthUser.get(req.tokenData.userId);
  if (!user) return res.status(401).json({ error: 'Сессия недействительна' });
  res.json({
    authenticated: true,
    is_guest: false,
    user: serializeAuthUser(user),
  });
});

// Смена пароля
app.post('/api/users/:id/password', (req, res) => {
  const id = parseIntStrict(req.params.id);
  const { old_password, new_password } = req.body || {};
  if (isNaN(id) || typeof old_password !== 'string' || typeof new_password !== 'string') {
    return res.status(400).json({ error: 'Неверный формат' });
  }
  if (!isMemberToken(req.tokenData) || Number(req.tokenData.userId) !== id) {
    return res.status(403).json({ error: 'Можно изменить только свой пароль' });
  }
  const passwordLimit = consumeRateLimit('password-change', id, 5, 5 * 60 * 1000);
  if (!passwordLimit.allowed) return rejectRateLimited(res, passwordLimit);
  if (new_password.length < 8 || new_password.length > 100) {
    return res.status(400).json({ error: 'Пароль от 8 до 100 символов' });
  }
  const user = stmts.getUserWithPassword.get(id);
  if (!user) {
    return res.status(403).json({ error: 'Нет доступа' });
  }
  if (!verifyPassword(old_password, user.password_hash)) {
    return res.status(401).json({ error: 'Неверный текущий пароль' });
  }
  stmts.setUserPassword.run(hashPassword(new_password), id);
  db.prepare('DELETE FROM tokens WHERE user_id = ? AND token <> ?')
    .run(id, req.authTokenHash);
  res.json({ success: true });
});

app.get('/api/admin/users', requireAdmin, (req, res) => {
  res.json(stmts.getAdminUsers.all().map(serializeAuthUser));
});

app.get('/api/admin/audit', requireAdmin, (req, res) => {
  const limit = parseIntStrict(req.query.limit ?? '50');
  const cursor = req.query.cursor === undefined
    ? null
    : parseIntStrict(req.query.cursor);
  if (
    isNaN(limit) ||
    limit < 1 ||
    limit > 100 ||
    (req.query.cursor !== undefined && isNaN(cursor))
  ) {
    return res.status(400).json({ error: 'Неверные параметры журнала' });
  }
  const entries = auditLog.getEntries({ before: cursor, limit });
  res.json({
    entries,
    next_cursor: entries.length === limit ? entries.at(-1).id : null,
  });
});

const changeUserRole = db.transaction((userId, role) => {
  const target = db.prepare('SELECT id, role FROM users WHERE id = ?').get(userId);
  if (!target) return { status: 'not-found' };
  if (target.role === role) return { status: 'ok' };

  if (target.role === 'admin' && role === 'member') {
    const count = db.prepare(
      "SELECT COUNT(*) AS count FROM users WHERE role = 'admin'"
    ).get().count;
    if (count <= 1) return { status: 'last-admin' };
  }

  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, userId);
  return { status: 'ok' };
});

app.patch('/api/admin/users/:id/role', requireAdmin, (req, res) => {
  const userId = parseIntStrict(req.params.id);
  const role = req.body?.role;
  if (isNaN(userId) || !['member', 'admin'].includes(role)) {
    return res.status(400).json({ error: 'Неверная роль или ID пользователя' });
  }

  const result = changeUserRole(userId, role);
  if (result.status === 'not-found') {
    return res.status(404).json({ error: 'Пользователь не найден' });
  }
  if (result.status === 'last-admin') {
    return res.status(409).json({ error: 'Нельзя убрать роль у последнего администратора' });
  }

  const user = stmts.getAuthUser.get(userId);
  io.emit('user-role-changed', { user_id: userId, role: user.role });
  res.json({ success: true, user: serializeAuthUser(user) });
});

app.get('/api/2fa/status', requireMember, (req, res) => {
  const userId = Number(req.tokenData.userId);
  const row = authSecurityStmts.getTotp.get(userId);
  const enabled = row?.enabled === 1;
  const remaining = enabled
    ? authSecurityStmts.countRecoveryCodes.get(userId).count
    : 0;
  res.json({
    enabled,
    recovery_codes_remaining: remaining,
    setup_pending: Boolean(
      row &&
      row.enabled === 0 &&
      row.pending_expires &&
      row.pending_expires >= Date.now()
    ),
  });
});

app.post('/api/2fa/setup', requireMember, (req, res) => {
  const userId = Number(req.tokenData.userId);
  const currentPassword = req.body?.current_password ?? req.body?.password;
  if (typeof currentPassword !== 'string') {
    return res.status(400).json({ error: 'Введите текущий пароль' });
  }

  const limit = consumeRateLimit('2fa-setup', userId, 5, 10 * 60 * 1000);
  if (!limit.allowed) return rejectRateLimited(res, limit);
  const user = stmts.getUserWithPassword.get(userId);
  if (!user || !verifyPassword(currentPassword, user.password_hash)) {
    return res.status(401).json({ error: 'Неверный текущий пароль' });
  }

  const existing = authSecurityStmts.getTotp.get(userId);
  if (existing?.enabled === 1) {
    return res.status(409).json({ error: 'Двухфакторная защита уже включена' });
  }

  try {
    const key = getTotpEncryptionKey(true);
    const secret = generateTotpSecret();
    const secretBase32 = base32Encode(secret);
    const pendingExpires = Date.now() + 10 * 60 * 1000;
    const result = authSecurityStmts.upsertPendingTotp.run(
      userId,
      encryptTotpSecret(secret, key, userId),
      pendingExpires
    );
    if (result.changes !== 1) {
      return res.status(409).json({ error: 'Двухфакторная защита уже включена' });
    }
    authSecurityStmts.deleteRecoveryCodes.run(userId);

    const issuer = 'Сырное колесо';
    const params = new URLSearchParams({
      secret: secretBase32,
      issuer,
      algorithm: 'SHA1',
      digits: '6',
      period: '30',
    });
    const label = encodeURIComponent(`${issuer}:${user.name}`);
    return res.json({
      secret: secretBase32,
      otpauth_uri: `otpauth://totp/${label}?${params.toString()}`,
      expires_in: 10 * 60,
    });
  } catch (error) {
    console.error('[cheese-wheel] 2FA setup failed:', error.message);
    return res.status(503).json({ error: 'Двухфакторная защита пока не настроена на сервере' });
  }
});

app.post('/api/2fa/enable', requireMember, (req, res) => {
  const userId = Number(req.tokenData.userId);
  const code = req.body?.code;
  if (typeof code !== 'string') {
    return res.status(400).json({ error: 'Введите шестизначный код' });
  }
  const limit = consumeRateLimit('2fa-enable', userId, 8, 10 * 60 * 1000);
  if (!limit.allowed) return rejectRateLimited(res, limit);

  try {
    const result = enablePendingTotp(userId, code, req.authTokenHash);
    if (result.status === 'not-pending') {
      return res.status(409).json({ error: 'Сначала начните настройку двухфакторной защиты' });
    }
    if (result.status === 'expired') {
      return res.status(410).json({ error: 'Время настройки истекло. Начните заново.' });
    }
    if (result.status !== 'ok') {
      return res.status(401).json({ error: 'Неверный код' });
    }
    return res.json({
      success: true,
      recovery_codes: result.recoveryCodes,
    });
  } catch (error) {
    console.error('[cheese-wheel] 2FA enable failed:', error.message);
    return res.status(500).json({ error: 'Не удалось включить двухфакторную защиту' });
  }
});

app.post('/api/2fa/disable', requireMember, (req, res) => {
  const userId = Number(req.tokenData.userId);
  const currentPassword = req.body?.current_password ?? req.body?.password;
  const code = req.body?.code;
  if (typeof currentPassword !== 'string' || typeof code !== 'string') {
    return res.status(400).json({ error: 'Введите пароль и код' });
  }

  const limit = consumeRateLimit('2fa-disable', userId, 5, 10 * 60 * 1000);
  if (!limit.allowed) return rejectRateLimited(res, limit);
  const user = stmts.getUserWithPassword.get(userId);
  if (!user || !verifyPassword(currentPassword, user.password_hash)) {
    return res.status(401).json({ error: 'Неверный пароль или код' });
  }

  try {
    if (!disableTwoFactor(userId, code, req.authTokenHash)) {
      return res.status(401).json({ error: 'Неверный пароль или код' });
    }
    return res.json({ success: true });
  } catch (error) {
    console.error('[cheese-wheel] 2FA disable failed:', error.message);
    return res.status(500).json({ error: 'Не удалось отключить двухфакторную защиту' });
  }
});

app.post('/api/2fa/recovery-codes/regenerate', requireMember, (req, res) => {
  const userId = Number(req.tokenData.userId);
  const currentPassword = req.body?.current_password ?? req.body?.password;
  const code = req.body?.code;
  if (typeof currentPassword !== 'string' || typeof code !== 'string') {
    return res.status(400).json({ error: 'Введите пароль и код приложения' });
  }

  const limit = consumeRateLimit('2fa-recovery-regenerate', userId, 5, 10 * 60 * 1000);
  if (!limit.allowed) return rejectRateLimited(res, limit);
  const user = stmts.getUserWithPassword.get(userId);
  if (!user || !verifyPassword(currentPassword, user.password_hash)) {
    return res.status(401).json({ error: 'Неверный пароль или код' });
  }

  try {
    const recoveryCodes = regenerateRecoveryCodeSet(userId, code);
    if (!recoveryCodes) {
      return res.status(401).json({ error: 'Неверный пароль или код' });
    }
    return res.json({ success: true, recovery_codes: recoveryCodes });
  } catch (error) {
    console.error('[cheese-wheel] recovery code regeneration failed:', error.message);
    return res.status(500).json({ error: 'Не удалось создать новые резервные коды' });
  }
});

}

module.exports = { registerAuthRoutes };
