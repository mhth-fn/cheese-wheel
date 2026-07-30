'use strict';

const express = require('express');
const fs = require('node:fs');
const path = require('node:path');

function registerHttpMiddleware({
  app,
  auditLog,
  consumeRateLimit,
  frontendBuild,
  getClientRateKey,
  getCookieToken,
  getTokenData,
  isMemberToken,
  isSocketOriginAllowed,
  rejectRateLimited,
  rootDir,
}) {
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.set({
    'Content-Security-Policy': [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "img-src 'self' data: blob:",
      "media-src 'self' data: blob:",
      "font-src 'self' data: https://fonts.gstatic.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://static.cloudflareinsights.com",
      "script-src-attr 'none'",
      "connect-src 'self' https://cloudflareinsights.com wss://cheese-wheel.ru",
      "frame-src https://www.youtube.com https://www.youtube-nocookie.com",
      "worker-src 'self' blob:",
      "manifest-src 'self'",
      'upgrade-insecure-requests',
    ].join('; '),
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-site',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '0',
  });
  next();
});
app.use((req, res, next) => {
  if (
    /^\/(?:\.env(?:\.|$)|server\.js$|package(?:-lock)?\.json$|cheese_wheel\.db(?:-wal|-shm)?$|backups(?:\/|$))/i.test(req.path)
  ) {
    return res.status(404).type('text/plain').send('Not Found');
  }
  next();
});
app.use('/api', (req, res, next) => {
  if (!auditLog) return next();
  return auditLog.middleware(req, res, next);
});
app.use('/api', (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const ipLimit = consumeRateLimit(
    'api-ingress-ip',
    getClientRateKey(req),
    120,
    60 * 1000
  );
  if (!ipLimit.allowed) return rejectRateLimited(res, ipLimit);
  const globalLimit = consumeRateLimit('api-ingress-global', 'all', 600, 60 * 1000);
  if (!globalLimit.allowed) return rejectRateLimited(res, globalLimit);
  next();
});
app.use(express.json({ limit: '16kb' }));
app.use('/api', (req, res, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const origin = req.headers.origin;
    const fetchSite = req.headers['sec-fetch-site'];
    if ((origin && !isSocketOriginAllowed(origin)) || fetchSite === 'cross-site') {
      return res.status(403).json({ error: 'Недоверенный источник запроса' });
    }
  }
  res.set('Cache-Control', 'private, no-store');
  res.vary('Authorization');
  res.vary('Cookie');
  next();
});
// Serve only the current React build. The retired vanilla SPA in public/ must
// never become an implicit authentication UI when a deployment misses dist/.
const uploadsPath = process.env.UPLOADS_PATH
  ? path.resolve(process.env.UPLOADS_PATH)
  : path.join(rootDir, 'uploads');
if (!fs.existsSync(uploadsPath)) fs.mkdirSync(uploadsPath, { recursive: true, mode: 0o750 });
app.use('/uploads', express.static(uploadsPath, {
  dotfiles: 'deny',
  setHeaders: (res) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Cache-Control', 'public, max-age=86400');
  },
}));
app.get('/vpn', (req, res, next) => {
  const data = getTokenData(getCookieToken(req));
  if (!isMemberToken(data)) {
    res.set('Cache-Control', 'no-store');
    return res.redirect(302, '/');
  }
  next();
});
if (frontendBuild.available) {
  app.use(express.static(frontendBuild.distPath, {
    dotfiles: 'deny',
  }));
}


  return uploadsPath;
}

function registerFrontendFallback({ app, frontendBuild }) {
app.get('*', (req, res) => {
  if (!frontendBuild.available) {
    res.set('Cache-Control', 'no-store');
    return res.status(503).type('text/plain').send(
      'Frontend build is unavailable. Run `npm run build` or use the Vite development server.'
    );
  }
  return res.sendFile(frontendBuild.indexPath);
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Некорректный JSON' });
  }
  if (error?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Запрос слишком большой' });
  }
  console.error('[cheese-wheel] Request failed:', error?.message || 'unknown error');
  res.status(Number(error?.status) >= 400 && Number(error?.status) < 500 ? error.status : 500)
    .json({ error: 'Ошибка запроса' });
});
}

module.exports = {
  registerFrontendFallback,
  registerHttpMiddleware,
};
