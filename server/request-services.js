'use strict';

const net = require('node:net');

function createRequestServices({ discordWebhookUrl, persistentRateLimiter }) {
  const DISCORD_WEBHOOK_URL = discordWebhookUrl;

function isLoopbackAddress(value) {
  const address = String(value || '').replace(/^::ffff:/, '');
  return address === '127.0.0.1' || address === '::1';
}

function getClientRateKey(req) {
  if (net.isIP(req.ip)) return req.ip;

  const remoteAddress = req.socket?.remoteAddress || req.connection?.remoteAddress;
  if (isLoopbackAddress(remoteAddress)) {
    // Socket.IO receives a raw IncomingMessage rather than an Express request.
    // Nginx replaces X-Forwarded-For with one trusted, normalized client IP.
    const forwarded = String(req.headers?.['x-forwarded-for'] || '').trim();
    if (net.isIP(forwarded)) return forwarded;
  }
  return net.isIP(remoteAddress) ? remoteAddress : 'unknown';
}

function consumeRateLimit(scope, key, max, windowMs) {
  if (!persistentRateLimiter) {
    return { allowed: false, retryAfter: 30, unavailable: true };
  }
  try {
    return persistentRateLimiter.consume(scope, key, max, windowMs);
  } catch (error) {
    console.error('[cheese-wheel] Persistent rate limiter failed:', error.message);
    return { allowed: false, retryAfter: 30, unavailable: true };
  }
}

function rejectRateLimited(res, result) {
  res.set('Retry-After', String(result.retryAfter));
  if (result.unavailable) {
    return res.status(503).json({ error: 'Защита запросов временно недоступна' });
  }
  if (result.alreadyLimited) {
    // The first rejection is audited. Repeated requests in the same saturated
    // bucket stay read-only and are deliberately coalesced to avoid turning
    // the limiter and audit trail into a write-amplification vector.
    res.locals.skipRepeatedRateLimitAudit = true;
  }
  return res.status(429).json({ error: 'Слишком много запросов. Попробуйте позже.' });
}

function escapeDiscordMarkdown(text) {
  return String(text).replace(/([\\_*~`>|])/g, '\\$1');
}

async function notifyDiscord(content) {
  if (!DISCORD_WEBHOOK_URL) return;
  try {
    const res = await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: String(content).slice(0, 2000),
        allowed_mentions: { parse: [] },
      })
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn('[cheese-wheel] Discord webhook failed: ' + res.status + ' ' + body.slice(0, 200));
    }
  } catch (err) {
    console.warn('[cheese-wheel] Discord webhook failed:', err.message);
  }
}

// ============ ТОКЕНЫ ============

  return {
    consumeRateLimit,
    escapeDiscordMarkdown,
    getClientRateKey,
    notifyDiscord,
    rejectRateLimited,
  };
}

module.exports = { createRequestServices };
