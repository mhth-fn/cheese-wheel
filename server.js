const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('node:path');
const { resolveFrontendBuild } = require('./lib/frontend-build');
const { createDatabase } = require('./server/database');
const { createAuthService } = require('./server/auth-service');
const { createBaldaService } = require('./server/balda-service');
const { createVpnService } = require('./server/vpn-service');
const { createRequestServices } = require('./server/request-services');
const { createSigameService } = require('./server/sigame-service');
const { createWheelService } = require('./server/wheel-service');
const {
  registerFrontendFallback,
  registerHttpMiddleware,
} = require('./server/http');
const { registerAuthRoutes } = require('./server/routes/auth');
const { registerVpnRoutes } = require('./server/routes/vpn');
const { registerWheelRoutes } = require('./server/routes/wheels');
const { registerStatsRoutes } = require('./server/routes/stats');
const { registerSettingsRoutes } = require('./server/routes/settings');
const { registerReviewRoutes } = require('./server/routes/reviews');
const { registerMusicReviewRoutes } = require('./server/routes/music-reviews');
const { registerSigameRoutes } = require('./server/routes/sigame');
const { registerFoodReviewRoutes } = require('./server/routes/food-reviews');
const { registerSocketHandlers } = require('./server/socket-handlers');

const testFrontendDistPath = (
  process.env.NODE_ENV === 'test'
  && process.env.TEST_FRONTEND_DIST_PATH
)
  ? path.resolve(process.env.TEST_FRONTEND_DIST_PATH)
  : undefined;
const frontendBuild = resolveFrontendBuild(
  __dirname,
  process.env.NODE_ENV,
  testFrontendDistPath
);
const app = express();
app.set('trust proxy', 'loopback');
const server = createServer(app);
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '127.0.0.1';
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const APP_ORIGIN = process.env.APP_ORIGIN || 'https://cheese-wheel.ru';
const BOOTSTRAP_ADMIN_USER_ID = Number.parseInt(
  process.env.BOOTSTRAP_ADMIN_USER_ID || '2',
  10
);
const SOCKET_ALLOWED_ORIGINS = new Set([
  APP_ORIGIN,
  'http://localhost:5173',
  'http://127.0.0.1:5173',
].map(value => new URL(value).origin));

function isSocketOriginAllowed(origin) {
  if (!origin) return true;
  try {
    return SOCKET_ALLOWED_ORIGINS.has(new URL(origin).origin);
  } catch {
    return false;
  }
}

const io = new Server(server, {
  maxHttpBufferSize: 100 * 1024,
  allowRequest: (req, callback) => {
    callback(null, isSocketOriginAllowed(req.headers.origin));
  },
});

const {
  VPN_MAX_CLIENTS_PER_SERVER,
  VPN_PROTOCOLS,
  VPN_SERVERS,
  buildVlessLink,
  createAwgClient,
  callXuiApi,
  canonicalizeVlessLink,
  checkVpnServer,
  deleteAwgClient,
  getVpnServer,
  getVpnServerProtocols,
  isVpnProtocolConfigured,
  isVpnServerConfigured,
  vpnMutations,
} = createVpnService();
// База данных, миграции и подготовленные SQL-выражения
const {
  CORE_STATS_USER_NAMES,
  DUMMY_PASSWORD_HASH,
  auditLog,
  authSecurityStmts,
  dataDir,
  db,
  getTotpEncryptionKey,
  hashPassword,
  normalizeReviewMovieTitle,
  persistentRateLimiter,
  sigamePacksPath,
  sigameStmts,
  stmts,
  verifyPassword,
  vpnStmts,
} = createDatabase({
  rootDir: __dirname,
  bootstrapAdminUserId: BOOTSTRAP_ADMIN_USER_ID,
});

const {
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
} = createAuthService({
  authSecurityStmts,
  db,
  getTotpEncryptionKey,
  stmts,
});
const baldaService = createBaldaService({ db, io });
const {
  parseIntStrict,
  readMovieInput,
  sanitizeTitle,
} = require('./server/validation');

const {
  consumeRateLimit,
  escapeDiscordMarkdown,
  getClientRateKey,
  notifyDiscord,
  rejectRateLimited,
} = createRequestServices({
  discordWebhookUrl: DISCORD_WEBHOOK_URL,
  persistentRateLimiter,
});

const {
  MAX_SIGAME_PACK_BYTES,
  MAX_SIGAME_TAGS,
  canManageSigamePack,
  getSigamePackFilePath,
  getSigamePackForViewer,
  parseSigamePlayedDate,
  parseSigameUploadTags,
  readSigamePackInput,
  receiveSigamePackFile,
  replaceSigamePackTags,
  sanitizeSigameOriginalFileName,
  serializeSigamePack,
} = createSigameService({
  sanitizeTitle,
  sigamePacksPath,
  sigameStmts,
});

const {
  ALLOWED_THEMES,
  MAX_ONE_OFF_MOVIES,
  MAX_SPIN_DURATION,
  MIN_SPIN_DURATION,
  ONE_OFF_MAX_SPIN_DURATION,
  ONE_OFF_MIN_SPIN_DURATION,
  ONE_OFF_MODES,
  broadcastOneOffState,
  broadcastWheelStatus,
  canManageMovie,
  claimPendingSpin,
  getOneOffState,
  getWheelStatus,
  isMovieInFormedWheel,
  readFormedWheel,
  readOneOffResult,
  rejectFormedCurrentWheelMutation,
  rejectOneOffMutation,
  rejectWheelMutationDuringSpin,
  schedulePendingSpin,
  serializeOneOffMovie,
  setOneOffResult,
  setOneOffSetting,
  spinState,
  stopOneOffElimination,
  toWheelSnapshotMovie,
  updateFormedWheelSnapshot,
} = createWheelService({
  auditLog,
  db,
  escapeDiscordMarkdown,
  io,
  notifyDiscord,
  parseIntStrict,
  stmts,
});
const uploadsPath = registerHttpMiddleware({
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
  rootDir: __dirname,
});

const routeContext = {
  ALLOWED_THEMES,
  CORE_STATS_USER_NAMES,
  DUMMY_PASSWORD_HASH,
  MAX_ONE_OFF_MOVIES,
  MAX_SIGAME_PACK_BYTES,
  MAX_SIGAME_TAGS,
  MAX_SPIN_DURATION,
  MIN_SPIN_DURATION,
  ONE_OFF_MAX_SPIN_DURATION,
  ONE_OFF_MIN_SPIN_DURATION,
  ONE_OFF_MODES,
  VPN_MAX_CLIENTS_PER_SERVER,
  VPN_PROTOCOLS,
  VPN_SERVERS,
  app,
  auditLog,
  authSecurityStmts,
  baldaService,
  broadcastOneOffState,
  broadcastWheelStatus,
  buildVlessLink,
  createAwgClient,
  callXuiApi,
  canManageMovie,
  canManageSigamePack,
  canonicalizeVlessLink,
  checkVpnServer,
  deleteAwgClient,
  claimPendingSpin,
  clearSessionCookie,
  completeTwoFactorLogin,
  consumeRateLimit,
  createToken,
  db,
  disableTwoFactor,
  enablePendingTotp,
  escapeDiscordMarkdown,
  getClientRateKey,
  getCookieToken,
  getOneOffState,
  getRequestToken,
  getSigamePackFilePath,
  getSigamePackForViewer,
  getTokenData,
  getTotpEncryptionKey,
  getVpnServer,
  getVpnServerProtocols,
  getWheelStatus,
  hashPassword,
  io,
  isMemberToken,
  isMovieInFormedWheel,
  isVpnServerConfigured,
  isVpnProtocolConfigured,
  issueLoginChallenge,
  normalizeReviewMovieTitle,
  notifyDiscord,
  parseIntStrict,
  parseSigamePlayedDate,
  parseSigameUploadTags,
  readFormedWheel,
  readMovieInput,
  readOneOffResult,
  readSigamePackInput,
  receiveSigamePackFile,
  regenerateRecoveryCodeSet,
  rejectFormedCurrentWheelMutation,
  rejectOneOffMutation,
  rejectRateLimited,
  rejectWheelMutationDuringSpin,
  replaceSigamePackTags,
  requireAdmin,
  requireAuth,
  requireMember,
  sanitizeSigameOriginalFileName,
  sanitizeTitle,
  schedulePendingSpin,
  serializeAuthUser,
  serializeOneOffMovie,
  serializeSigamePack,
  setOneOffResult,
  setOneOffSetting,
  setSessionCookie,
  sigamePacksPath,
  sigameStmts,
  spinState,
  stmts,
  stopOneOffElimination,
  toWheelSnapshotMovie,
  updateFormedWheelSnapshot,
  uploadsPath,
  verifyPassword,
  vpnMutations,
  vpnStmts,
};

registerAuthRoutes(routeContext);
registerVpnRoutes(routeContext);
registerWheelRoutes(routeContext);
registerStatsRoutes(routeContext);
registerSettingsRoutes(routeContext);
registerMusicReviewRoutes(routeContext);
registerReviewRoutes(routeContext);
registerSigameRoutes(routeContext);
registerFoodReviewRoutes(routeContext);

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Маршрут не найден' });
});

// ============ SOCKET.IO ============

registerSocketHandlers(routeContext);

registerFrontendFallback({ app, frontendBuild });

server.listen(PORT, HOST, () => {
  console.log(`Сырный сервер: http://${HOST}:${PORT}`);
});
