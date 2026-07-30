'use strict';

const crypto = require('node:crypto');
const {
  createLoginChallenge,
  decryptTotpSecret,
  generateRecoveryCodes,
  hashLoginChallenge,
  hashRecoveryCode,
  hashSessionToken,
  normalizeRecoveryCode,
  normalizeTotpCode,
  verifyTotpCode,
} = require('../lib/security');

function createAuthService({ authSecurityStmts, db, getTotpEncryptionKey, stmts }) {

const TOKEN_EXPIRY = 30 * 24 * 60 * 60 * 1000; // 30 дней
const SESSION_COOKIE = 'cheese_session';
const ALLOW_INSECURE_TEST_COOKIE = (
  process.env.NODE_ENV === 'test'
  && process.env.TEST_ALLOW_HTTP_COOKIE === '1'
);

function createToken(userId, isGuest = false) {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashSessionToken(token);
  const expires = Date.now() + TOKEN_EXPIRY;
  db.prepare('INSERT INTO tokens (token, user_id, is_guest, expires) VALUES (?,?,?,?)')
    .run(tokenHash, userId ?? null, isGuest ? 1 : 0, expires);
  return token;
}

function getTokenData(token) {
  const tokenHash = hashSessionToken(token);
  if (!tokenHash) return null;
  const row = db.prepare(`
    SELECT t.user_id, t.is_guest, t.expires, u.role
    FROM tokens t
    LEFT JOIN users u ON u.id = t.user_id
    WHERE t.token = ?
  `).get(tokenHash);
  if (!row) return null;
  if (Date.now() > row.expires) {
    db.prepare('DELETE FROM tokens WHERE token=?').run(tokenHash);
    return null;
  }
  return {
    userId: row.user_id,
    isGuest: !!row.is_guest,
    expires: row.expires,
    role: row.role || null,
  };
}

function isMemberToken(data) {
  if (!data || data.isGuest) return false;
  const userId = Number(data.userId);
  if (!Number.isInteger(userId) || userId < 1) return false;
  return Boolean(db.prepare('SELECT 1 FROM users WHERE id=?').get(userId));
}

function getCookieToken(req) {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;
  const cookie = cookieHeader
    .split(';')
    .map(value => value.trim())
    .find(value => value.startsWith(`${SESSION_COOKIE}=`));
  return cookie ? cookie.slice(SESSION_COOKIE.length + 1) : null;
}

function getRequestToken(req) {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return getCookieToken(req);
}

function setSessionCookie(res, token) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: !ALLOW_INSECURE_TEST_COOKIE,
    sameSite: 'strict',
    maxAge: TOKEN_EXPIRY,
    path: '/',
  });
}

function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure: !ALLOW_INSECURE_TEST_COOKIE,
    sameSite: 'strict',
    path: '/',
  });
}

// Чистим просроченные токены раз в час
setInterval(() => {
  db.prepare('DELETE FROM tokens WHERE expires < ?').run(Date.now());
  db.prepare('DELETE FROM login_challenges WHERE expires < ?').run(Date.now());
  db.prepare(`
    DELETE FROM user_totp
    WHERE enabled = 0 AND pending_expires IS NOT NULL AND pending_expires < ?
  `).run(Date.now());
}, 60 * 60 * 1000);

// ============ AUTH MIDDLEWARE ============
function requireAuth(req, res, next) {
  const token = getRequestToken(req);
  const data = getTokenData(token);
  if (!data) return res.status(401).json({ error: 'Требуется авторизация' });
  if (data.isGuest && req.method !== 'GET') {
    return res.status(403).json({ error: 'Гостевой доступ только для чтения' });
  }
  if (!getCookieToken(req)) setSessionCookie(res, token);
  req.authToken = token;
  req.authTokenHash = hashSessionToken(token);
  req.tokenData = data;
  next();
}


function requireMember(req, res, next) {
  if (!isMemberToken(req.tokenData)) {
    return res.status(403).json({ error: 'VPN доступен только участникам' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!isMemberToken(req.tokenData) || req.tokenData.role !== 'admin') {
    return res.status(403).json({ error: 'Доступно только администратору' });
  }
  next();
}


function serializeAuthUser(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    name: row.name,
    role: row.role === 'admin' ? 'admin' : 'member',
    two_factor_enabled: Boolean(row.two_factor_enabled),
  };
}

function createRecoveryCodeSet(userId, now = Date.now()) {
  const codes = generateRecoveryCodes(10);
  authSecurityStmts.deleteRecoveryCodes.run(userId);
  codes.forEach(code => {
    authSecurityStmts.insertRecoveryCode.run(userId, hashRecoveryCode(code), now);
  });
  return codes;
}

function issueLoginChallenge(userId) {
  const challenge = createLoginChallenge();
  const now = Date.now();
  authSecurityStmts.deleteUserChallenges.run(userId);
  authSecurityStmts.insertLoginChallenge.run(
    hashLoginChallenge(challenge),
    userId,
    now + 5 * 60 * 1000,
    now
  );
  return challenge;
}

function consumeSecondFactor(userId, submittedCode, allowRecovery = true) {
  const row = authSecurityStmts.getTotp.get(userId);
  if (!row || row.enabled !== 1) return null;

  const totpCode = normalizeTotpCode(submittedCode);
  if (totpCode) {
    const secret = decryptTotpSecret(
      row.secret_enc,
      getTotpEncryptionKey(true),
      userId
    );
    const matchedStep = verifyTotpCode(secret, totpCode, {
      window: 1,
      lastUsedStep: row.last_used_step,
    });
    if (matchedStep == null) return null;
    const result = authSecurityStmts.advanceTotpStep.run(
      matchedStep,
      userId,
      matchedStep
    );
    return result.changes === 1 ? { type: 'totp', step: matchedStep } : null;
  }

  if (!allowRecovery) return null;
  const recoveryCode = normalizeRecoveryCode(submittedCode);
  const recoveryHash = recoveryCode ? hashRecoveryCode(recoveryCode) : null;
  if (!recoveryHash) return null;
  const result = authSecurityStmts.consumeRecoveryCode.run(
    Date.now(),
    userId,
    recoveryHash
  );
  return result.changes === 1 ? { type: 'recovery' } : null;
}

const completeTwoFactorLogin = db.transaction((rawChallenge, submittedCode) => {
  const challengeHash = hashLoginChallenge(rawChallenge);
  if (!challengeHash) return { status: 'invalid' };

  const now = Date.now();
  const challenge = authSecurityStmts.getLoginChallenge.get(challengeHash);
  if (!challenge || challenge.expires < now || challenge.attempts >= 5) {
    if (challenge) authSecurityStmts.deleteChallenge.run(challengeHash);
    return { status: 'invalid' };
  }

  const attemptResult = authSecurityStmts.incrementChallengeAttempts.run(
    challengeHash,
    now
  );
  if (attemptResult.changes !== 1) return { status: 'invalid' };

  const factor = consumeSecondFactor(challenge.user_id, submittedCode, true);
  if (!factor) {
    if (challenge.attempts + 1 >= 5) {
      authSecurityStmts.deleteChallenge.run(challengeHash);
    }
    return { status: 'invalid' };
  }

  const user = stmts.getAuthUser.get(challenge.user_id);
  if (!user) {
    authSecurityStmts.deleteChallenge.run(challengeHash);
    return { status: 'invalid' };
  }

  authSecurityStmts.deleteUserChallenges.run(challenge.user_id);
  return {
    status: 'ok',
    token: createToken(challenge.user_id),
    user: serializeAuthUser(user),
    usedRecoveryCode: factor.type === 'recovery',
  };
});

const enablePendingTotp = db.transaction((userId, submittedCode, currentTokenHash) => {
  const row = authSecurityStmts.getTotp.get(userId);
  const now = Date.now();
  if (!row || row.enabled === 1) return { status: 'not-pending' };
  if (!row.pending_expires || row.pending_expires < now) {
    authSecurityStmts.deleteTotp.run(userId);
    return { status: 'expired' };
  }

  const code = normalizeTotpCode(submittedCode);
  if (!code) return { status: 'invalid' };
  const secret = decryptTotpSecret(
    row.secret_enc,
    getTotpEncryptionKey(true),
    userId
  );
  const matchedStep = verifyTotpCode(secret, code, { window: 1, now });
  if (matchedStep == null) return { status: 'invalid' };

  const enabled = authSecurityStmts.enableTotp.run(
    matchedStep,
    now,
    userId,
    now
  );
  if (enabled.changes !== 1) return { status: 'expired' };

  const recoveryCodes = createRecoveryCodeSet(userId, now);
  db.prepare('DELETE FROM tokens WHERE user_id = ? AND token <> ?')
    .run(userId, currentTokenHash);
  authSecurityStmts.deleteUserChallenges.run(userId);
  return { status: 'ok', recoveryCodes };
});

const disableTwoFactor = db.transaction((userId, submittedCode, currentTokenHash) => {
  const factor = consumeSecondFactor(userId, submittedCode, true);
  if (!factor) return false;
  authSecurityStmts.deleteTotp.run(userId);
  authSecurityStmts.deleteRecoveryCodes.run(userId);
  authSecurityStmts.deleteUserChallenges.run(userId);
  db.prepare('DELETE FROM tokens WHERE user_id = ? AND token <> ?')
    .run(userId, currentTokenHash);
  return true;
});

const regenerateRecoveryCodeSet = db.transaction((userId, submittedCode) => {
  const factor = consumeSecondFactor(userId, submittedCode, false);
  if (!factor) return null;
  return createRecoveryCodeSet(userId);
});

// Динамический запрос getWatched — строится по реальным user_id из БД
{
  const allUsers = db.prepare('SELECT id FROM users ORDER BY id').all();
  const ratingCols = allUsers.map(u => `MAX(CASE WHEN r.user_id = ${u.id} THEN r.rating END) as rating_${u.id}`).join(',\n      ');
  stmts.getWatched = db.prepare(`
    SELECT
      m.id, m.title, m.alternative_title, m.director, m.year,
      m.watched_at, m.added_at, m.added_by,
      proposer.name as added_by_name,
      ${ratingCols},
      ROUND(AVG(r.rating), 1) as avg_rating,
      COUNT(r.rating) as ratings_count,
      (
        SELECT COUNT(*)
        FROM movie_reviews mr
        WHERE mr.movie_id = m.id
      ) as review_count
    FROM movies m
    LEFT JOIN ratings r ON m.id = r.movie_id
    LEFT JOIN users proposer ON m.added_by = proposer.id
    WHERE m.is_watched = 1
    GROUP BY m.id
    ORDER BY m.watched_at DESC
  `);
}

// Хелперы валидации

  return {
    clearSessionCookie,
    completeTwoFactorLogin,
    createToken,
    disableTwoFactor,
    enablePendingTotp,
    getCookieToken,
    getRequestToken,
    getTokenData,
    isMemberToken,
    issueLoginChallenge,
    regenerateRecoveryCodeSet,
    requireAdmin,
    requireAuth,
    requireMember,
    serializeAuthUser,
    setSessionCookie,
  };
}

module.exports = { createAuthService };
