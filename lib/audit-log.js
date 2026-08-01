'use strict';

const crypto = require('crypto');

const MAX_DETAILS_LENGTH = 4000;
const MAX_USER_AGENT_LENGTH = 300;
const DEFAULT_RETENTION_MS = 180 * 24 * 60 * 60 * 1000;

function sha256Hmac(key, value) {
  return crypto
    .createHmac('sha256', key)
    .update(String(value || 'unknown'))
    .digest('hex');
}

function sanitizeDetails(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const blocked = /password|secret|token|cookie|authorization|code|connection.?link|content/i;
  const clean = {};
  for (const [key, item] of Object.entries(value)) {
    if (blocked.test(key)) continue;
    if (['string', 'number', 'boolean'].includes(typeof item) || item === null) {
      clean[key] = typeof item === 'string' ? item.slice(0, 300) : item;
    }
  }
  return clean;
}

function routeToAction(method, requestPath) {
  const normalizedPath = String(requestPath || '')
    .replace(/\?.*$/, '')
    .replace(/\/\d+(?=\/|$)/g, '/:id');
  const key = `${method.toUpperCase()} ${normalizedPath}`;
  const exact = {
    'POST /api/auth': 'auth.login',
    'POST /api/auth/2fa': 'auth.two_factor_login',
    'POST /api/auth/guest': 'auth.guest_login',
    'POST /api/auth/logout': 'auth.logout',
    'POST /api/wheel/form': 'wheel.formed',
    'POST /api/wheel/form-next': 'wheel.next_promoted',
    'POST /api/wheel': 'wheel.choice_saved',
    'POST /api/next-wheel': 'wheel.next_choice_saved',
    'POST /api/watched': 'watched.created',
    'POST /api/ratings': 'rating.set',
    'POST /api/wine-reviews': 'wine_review.created',
    'POST /api/movie-reviews': 'movie_review.created',
    'POST /api/music-reviews': 'music_review.created',
    'POST /api/review-reactions': 'review_reaction.set',
    'POST /api/sigame-packs': 'sigame_pack.created',
    'POST /api/theme': 'theme.changed',
    'POST /api/center-image': 'center_image.uploaded',
    'DELETE /api/center-image': 'center_image.deleted',
    'POST /api/2fa/setup': 'two_factor.setup_started',
    'POST /api/2fa/enable': 'two_factor.enabled',
    'POST /api/2fa/disable': 'two_factor.disabled',
    'POST /api/2fa/recovery-codes/regenerate': 'two_factor.recovery_codes_regenerated',
  };
  if (exact[key]) return exact[key];

  if (key === 'PATCH /api/admin/users/:id/role') return 'user.role_changed';
  if (key === 'POST /api/users/:id/password') return 'password.changed';
  if (key === 'POST /api/wheel/:id/watched') return 'movie.marked_watched';
  if (key === 'DELETE /api/wheel/:id') return 'wheel.choice_deleted';
  if (key === 'DELETE /api/next-wheel/:id') return 'wheel.next_choice_deleted';
  if (key === 'PATCH /api/movies/:id') return 'movie.updated';
  if (key === 'DELETE /api/watched/:id') return 'watched.deleted';
  if (key === 'DELETE /api/ratings/:id') return 'rating.deleted';
  if (key === 'POST /api/vpn/clients') return 'vpn_client.created';
  if (key === 'DELETE /api/vpn/clients/:id') return 'vpn_client.deleted';
  if (key === 'PATCH /api/wine-reviews/:id') return 'wine_review.updated';
  if (key === 'DELETE /api/wine-reviews/:id') return 'wine_review.deleted';
  if (key === 'PATCH /api/movie-reviews/:id') return 'movie_review.updated';
  if (key === 'DELETE /api/movie-reviews/:id') return 'movie_review.deleted';
  if (key === 'PATCH /api/music-reviews/:id') return 'music_review.updated';
  if (key === 'DELETE /api/music-reviews/:id') return 'music_review.deleted';
  if (key === 'PATCH /api/sigame-packs/:id') return 'sigame_pack.updated';
  if (key === 'DELETE /api/sigame-packs/:id') return 'sigame_pack.deleted';
  if (key === 'POST /api/sigame-packs/:id/status') return 'sigame_pack.status_changed';
  if (key === 'PUT /api/sigame-packs/:id/rating') return 'sigame_pack.rating_set';
  if (key === 'DELETE /api/sigame-packs/:id/rating') return 'sigame_pack.rating_deleted';
  if (normalizedPath.startsWith('/api/settings/')) return 'setting.changed';
  return `api.${method.toLowerCase()}`;
}

function routeToTarget(requestPath) {
  const path = String(requestPath || '').replace(/\?.*$/, '');
  const parts = path.split('/').filter(Boolean);
  const rawType = parts[1] || 'api';
  const targetType = rawType.replace(/[^a-z0-9_-]/gi, '').slice(0, 60) || 'api';
  const targetId = parts.find((part, index) => index > 1 && /^\d+$/.test(part));
  return { targetType, targetId: targetId || null };
}

function createAuditLog(db, options = {}) {
  const pepper = String(options.pepper || '');
  if (pepper.length < 32) {
    throw new Error('[cheese-wheel] AUDIT_LOG_PEPPER должен содержать минимум 32 символа');
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at INTEGER NOT NULL,
      actor_user_id INTEGER,
      actor_role TEXT,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT,
      result TEXT NOT NULL CHECK(result IN ('success', 'denied', 'failed')),
      request_id TEXT,
      ip_hash TEXT,
      user_agent TEXT,
      details_json TEXT NOT NULL DEFAULT '{}',
      FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_log_action ON audit_log(action, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON audit_log(actor_user_id, created_at DESC);
  `);

  const insert = db.prepare(`
    INSERT INTO audit_log (
      created_at, actor_user_id, actor_role, action, target_type, target_id,
      result, request_id, ip_hash, user_agent, details_json
    ) VALUES (
      @createdAt, @actorUserId, @actorRole, @action, @targetType, @targetId,
      @result, @requestId, @ipHash, @userAgent, @detailsJson
    )
  `);
  const list = db.prepare(`
    SELECT
      log.id,
      log.created_at,
      log.actor_user_id,
      user.name AS actor_name,
      log.actor_role,
      log.action,
      log.target_type,
      log.target_id,
      log.result,
      log.request_id,
      log.details_json
    FROM audit_log log
    LEFT JOIN users user ON user.id = log.actor_user_id
    WHERE (@before IS NULL OR log.id < @before)
    ORDER BY log.id DESC
    LIMIT @limit
  `);
  const cleanup = db.prepare('DELETE FROM audit_log WHERE created_at < ?');
  const trimToNewest = db.prepare(`
    DELETE FROM audit_log
    WHERE id < COALESCE((
      SELECT id
      FROM audit_log
      ORDER BY id DESC
      LIMIT 1 OFFSET 99999
    ), 0)
  `);
  let recordsUntilTrim = 100;
  trimToNewest.run();

  function record(event) {
    const detailsJson = JSON.stringify(sanitizeDetails(event.details || {}));
    const actorUserId = Number(event.actorUserId);
    const row = {
      createdAt: Number.isFinite(event.createdAt) ? event.createdAt : Date.now(),
      actorUserId: Number.isInteger(actorUserId) && actorUserId > 0 ? actorUserId : null,
      actorRole: typeof event.actorRole === 'string' ? event.actorRole.slice(0, 30) : null,
      action: String(event.action || 'unknown').slice(0, 100),
      targetType: String(event.targetType || 'system').slice(0, 60),
      targetId: event.targetId === undefined || event.targetId === null
        ? null
        : String(event.targetId).slice(0, 120),
      result: ['success', 'denied', 'failed'].includes(event.result) ? event.result : 'failed',
      requestId: typeof event.requestId === 'string' ? event.requestId.slice(0, 80) : null,
      ipHash: event.ip ? sha256Hmac(pepper, event.ip) : null,
      userAgent: typeof event.userAgent === 'string'
        ? event.userAgent.slice(0, MAX_USER_AGENT_LENGTH)
        : null,
      detailsJson: detailsJson.length <= MAX_DETAILS_LENGTH ? detailsJson : '{}',
    };
    insert.run(row);
    recordsUntilTrim -= 1;
    if (recordsUntilTrim <= 0) {
      trimToNewest.run();
      recordsUntilTrim = 100;
    }
    console.info(JSON.stringify({
      type: 'audit',
      at: new Date(row.createdAt).toISOString(),
      actorUserId: row.actorUserId,
      actorRole: row.actorRole,
      action: row.action,
      targetType: row.targetType,
      targetId: row.targetId,
      result: row.result,
      requestId: row.requestId,
    }));
  }

  function middleware(req, res, next) {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const requestId = crypto.randomUUID();
    req.auditRequestId = requestId;
    res.set('X-Request-ID', requestId);
    res.once('finish', () => {
      if (res.locals?.skipRepeatedRateLimitAudit) return;
      try {
        const target = routeToTarget(req.originalUrl || req.url);
        let { targetType, targetId } = target;
        let action = routeToAction(req.method, req.originalUrl || req.url);
        if (action === 'auth.login') {
          action = res.statusCode === 202
            ? 'auth.second_factor_required'
            : res.statusCode < 400 ? 'auth.login_succeeded' : 'auth.login_failed';
        } else if (action === 'auth.two_factor_login') {
          action = res.statusCode < 400
            ? 'auth.two_factor_login_succeeded'
            : 'auth.two_factor_login_failed';
        }
        const details = { status: res.statusCode };
        if (
          action.startsWith('auth.') &&
          Number.isInteger(Number(req.body?.user_id)) &&
          Number(req.body.user_id) > 0
        ) {
          targetType = 'user';
          targetId = String(Number(req.body.user_id));
          details.attempted_user_id = Number(req.body.user_id);
        }
        record({
          actorUserId: req.auditActor?.userId ?? req.tokenData?.userId,
          actorRole: req.auditActor?.role ?? req.tokenData?.role,
          action,
          targetType,
          targetId,
          result: res.statusCode < 400
            ? 'success'
            : [401, 403, 429].includes(res.statusCode) ? 'denied' : 'failed',
          requestId,
          ip: req.ip || req.socket?.remoteAddress,
          userAgent: req.headers['user-agent'],
          details,
        });
      } catch (error) {
        console.error('[cheese-wheel] Audit write failed:', error.message);
      }
    });
    next();
  }

  function getEntries({ before = null, limit = 50 } = {}) {
    const safeBefore = Number(before);
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
    return list.all({
      before: Number.isInteger(safeBefore) && safeBefore > 0 ? safeBefore : null,
      limit: safeLimit,
    }).map(row => {
      let details = {};
      try {
        details = JSON.parse(row.details_json);
      } catch {
        details = {};
      }
      return { ...row, details, details_json: undefined };
    });
  }

  function cleanupExpired(retentionMs = DEFAULT_RETENTION_MS) {
    return cleanup.run(Date.now() - retentionMs).changes;
  }

  return { record, middleware, getEntries, cleanupExpired };
}

module.exports = {
  createAuditLog,
  routeToAction,
  sanitizeDetails,
};
