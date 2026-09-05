'use strict';

const https = require('node:https');
const path = require('node:path');
const net = require('node:net');
const tls = require('node:tls');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

const VPN_PROTOCOLS = Object.freeze({
  VLESS: 'vless',
  AMNEZIAWG: 'amneziawg',
});

function createVpnService() {

const VPN_MAX_CLIENTS_PER_SERVER = Math.min(
  Math.max(Number.parseInt(process.env.VPN_MAX_CLIENTS_PER_SERVER || '10', 10) || 10, 1),
  20
);
const VPN_SERVERS = [
  {
    id: 'primary',
    label: 'Амстердам Timeweb',
    address: '31.130.128.212',
    baseUrl: process.env.XUI_PRIMARY_URL,
    username: process.env.XUI_PRIMARY_USERNAME,
    password: process.env.XUI_PRIMARY_PASSWORD,
    inboundId: Number.parseInt(process.env.XUI_PRIMARY_INBOUND_ID || '2', 10),
    tlsFingerprint: process.env.XUI_PRIMARY_TLS_FINGERPRINT,
    awgHelper: process.env.AWG_PRIMARY_HELPER,
  },
  {
    id: 'secondary',
    label: 'Франкфурт Cloudzy',
    address: '172.86.69.135',
    baseUrl: process.env.XUI_SECONDARY_URL,
    username: process.env.XUI_SECONDARY_USERNAME,
    password: process.env.XUI_SECONDARY_PASSWORD,
    inboundId: Number.parseInt(process.env.XUI_SECONDARY_INBOUND_ID || '2', 10),
    tlsFingerprint: process.env.XUI_SECONDARY_TLS_FINGERPRINT,
    awgHelper: process.env.AWG_SECONDARY_HELPER,
  },
  {
    id: 'bern',
    label: 'Берн Cloudzy',
    address: '45.59.122.129',
    baseUrl: process.env.XUI_BERN_URL,
    username: process.env.XUI_BERN_USERNAME,
    password: process.env.XUI_BERN_PASSWORD,
    apiToken: process.env.XUI_BERN_API_TOKEN,
    apiVersion: 3,
    inboundId: Number.parseInt(process.env.XUI_BERN_INBOUND_ID || '1', 10),
    tlsFingerprint: process.env.XUI_BERN_TLS_FINGERPRINT,
  },
];
const xuiSessions = new Map();
const vpnMutations = new Set();

function getVpnServer(serverId) {
  return VPN_SERVERS.find(server => server.id === serverId);
}

function isVpnServerConfigured(server) {
  return Boolean(
    server?.baseUrl &&
    (server.apiToken || (server.username && server.password)) &&
    server.tlsFingerprint &&
    Number.isInteger(server.inboundId)
  );
}

function isAwgServerConfigured(server) {
  return Boolean(
    server?.awgHelper
    && path.isAbsolute(server.awgHelper)
    && !server.awgHelper.includes('\0')
  );
}

function isVpnProtocolConfigured(server, protocol) {
  if (protocol === VPN_PROTOCOLS.VLESS) return isVpnServerConfigured(server);
  if (protocol === VPN_PROTOCOLS.AMNEZIAWG) return isAwgServerConfigured(server);
  return false;
}

function getVpnServerProtocols(server) {
  return [
    isVpnServerConfigured(server) ? VPN_PROTOCOLS.VLESS : null,
    isAwgServerConfigured(server) ? VPN_PROTOCOLS.AMNEZIAWG : null,
  ].filter(Boolean);
}

function parseAwgHelperPayload(stdout, serverId) {
  const source = String(stdout || '').trim();
  if (!source || Buffer.byteLength(source, 'utf8') > 64 * 1024) {
    throw new Error(`Invalid AmneziaWG helper response for ${serverId}`);
  }
  try {
    const payload = JSON.parse(source);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new Error('not an object');
    }
    return payload;
  } catch {
    throw new Error(`Invalid AmneziaWG helper JSON for ${serverId}`);
  }
}

async function callAwgHelper(serverConfig, action, peerId = '') {
  if (!isAwgServerConfigured(serverConfig)) {
    throw new Error(`AmneziaWG helper is not configured for ${serverConfig?.id || 'unknown'}`);
  }
  if (!['status', 'create', 'delete'].includes(action)) {
    throw new Error('Unsupported AmneziaWG helper action');
  }
  if (
    action !== 'status'
    && !/^cw_[1-9][0-9]*_[a-f0-9]{16}$/.test(peerId)
  ) {
    throw new Error('Invalid AmneziaWG peer id');
  }

  const args = action === 'status' ? [action] : [action, peerId];
  const { stdout } = await execFileAsync(serverConfig.awgHelper, args, {
    encoding: 'utf8',
    timeout: 20_000,
    maxBuffer: 64 * 1024,
    windowsHide: true,
    env: {
      LANG: 'C.UTF-8',
      PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
    },
  });
  return parseAwgHelperPayload(stdout, serverConfig.id);
}

async function createAwgClient(serverConfig, peerId) {
  const payload = await callAwgHelper(serverConfig, 'create', peerId);
  if (
    payload.success !== true
    || payload.clientId !== peerId
    || typeof payload.address !== 'string'
    || typeof payload.configBase64 !== 'string'
  ) {
    throw new Error(`Incomplete AmneziaWG create response for ${serverConfig.id}`);
  }
  const configBuffer = Buffer.from(payload.configBase64, 'base64');
  const config = configBuffer.toString('utf8');
  if (
    configBuffer.length < 100
    || configBuffer.length > 16 * 1024
    || !config.startsWith('[Interface]\n')
    || !config.includes('\n[Peer]\n')
    || !config.includes(`Endpoint = ${serverConfig.address}:`)
  ) {
    throw new Error(`Invalid AmneziaWG client configuration for ${serverConfig.id}`);
  }
  return {
    clientId: peerId,
    address: payload.address.slice(0, 120),
    connectionConfig: config,
  };
}

async function deleteAwgClient(serverConfig, peerId) {
  const payload = await callAwgHelper(serverConfig, 'delete', peerId);
  if (payload.success !== true || payload.clientId !== peerId) {
    throw new Error(`Incomplete AmneziaWG delete response for ${serverConfig.id}`);
  }
}

function normalizeFingerprint(value) {
  return String(value || '').replaceAll(':', '').trim().toUpperCase();
}

function parseXuiJson(value, fallback = {}) {
  if (value && typeof value === 'object') return value;
  if (typeof value !== 'string') return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function openPinnedTlsSocket(serverConfig, url, timeout = 10000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const socket = tls.connect({
      host: url.hostname,
      port: Number(url.port) || 443,
      servername: net.isIP(url.hostname) ? undefined : url.hostname,
      rejectUnauthorized: false,
    });

    const fail = error => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(error);
    };

    socket.setTimeout(timeout, () => fail(new Error('x-ui TLS handshake timed out')));
    socket.once('error', fail);
    socket.once('secureConnect', () => {
      const expectedFingerprint = normalizeFingerprint(serverConfig.tlsFingerprint);
      const actualFingerprint = normalizeFingerprint(
        socket.getPeerCertificate()?.fingerprint256
      );
      if (!actualFingerprint || actualFingerprint !== expectedFingerprint) {
        fail(new Error(`TLS fingerprint mismatch for ${serverConfig.id}`));
        return;
      }

      settled = true;
      socket.setTimeout(0);
      socket.removeListener('error', fail);
      resolve(socket);
    });
  });
}

async function requestXui(serverConfig, pathname, options = {}) {
  const url = new URL(pathname, serverConfig.baseUrl);
  if (url.protocol !== 'https:') {
    throw new Error(`x-ui URL must use HTTPS for ${serverConfig.id}`);
  }
  const body = options.body || '';
  const socket = await openPinnedTlsSocket(serverConfig, url);
  const agent = new https.Agent({ keepAlive: false });
  agent.createConnection = () => socket;

  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: options.method || 'GET',
      agent,
      rejectUnauthorized: false,
      headers: {
        Accept: 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
        ...options.headers,
      },
      timeout: 10000,
    }, response => {
      let responseBody = '';
      response.setEncoding('utf8');
      response.on('data', chunk => {
        responseBody += chunk;
        if (responseBody.length > 1024 * 1024) {
          req.destroy(new Error('x-ui response is too large'));
        }
      });
      response.on('end', () => {
        resolve({
          status: response.statusCode || 0,
          headers: response.headers,
          body: responseBody,
        });
      });
    });

    req.on('timeout', () => req.destroy(new Error('x-ui request timed out')));
    req.on('error', reject);
    req.once('close', () => agent.destroy());
    if (body) req.write(body);
    req.end();
  });
}

async function loginXui(serverConfig) {
  const body = new URLSearchParams({
    username: serverConfig.username,
    password: serverConfig.password,
  }).toString();
  const response = await requestXui(serverConfig, 'login', {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  const payload = parseXuiJson(response.body, null);
  if (response.status < 200 || response.status >= 300 || !payload?.success) {
    throw new Error(`x-ui login failed for ${serverConfig.id}`);
  }

  const cookies = response.headers['set-cookie'] || [];
  const cookie = cookies.map(value => value.split(';')[0]).join('; ');
  if (!cookie) throw new Error(`x-ui did not return a session for ${serverConfig.id}`);
  xuiSessions.set(serverConfig.id, cookie);
  return cookie;
}

async function callXuiApi(serverConfig, pathname, options = {}, retry = true) {
  let cookie;
  if (!serverConfig.apiToken) {
    cookie = xuiSessions.get(serverConfig.id);
    if (!cookie) cookie = await loginXui(serverConfig);
  }

  const response = await requestXui(serverConfig, pathname, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(serverConfig.apiToken
        ? { Authorization: `Bearer ${serverConfig.apiToken}` }
        : { Cookie: cookie }),
      ...options.headers,
    },
  });

  if (response.status === 401 && retry && !serverConfig.apiToken) {
    xuiSessions.delete(serverConfig.id);
    return callXuiApi(serverConfig, pathname, options, false);
  }

  const payload = parseXuiJson(response.body, null);
  if (
    response.status < 200 ||
    response.status >= 300 ||
    !payload ||
    payload.success === false
  ) {
    throw new Error(`x-ui API request failed for ${serverConfig.id}`);
  }
  return payload.obj ?? payload;
}

function createVlessClient(serverConfig, client) {
  if (serverConfig.apiVersion === 3) {
    return callXuiApi(serverConfig, 'panel/api/clients/add', {
      method: 'POST',
      body: JSON.stringify({
        client: { ...client, tgId: Number(client.tgId) || 0 },
        inboundIds: [serverConfig.inboundId],
      }),
    });
  }
  return callXuiApi(serverConfig, 'panel/api/inbounds/addClient', {
    method: 'POST',
    body: JSON.stringify({
      id: serverConfig.inboundId,
      settings: JSON.stringify({ clients: [client] }),
    }),
  });
}

function deleteVlessClient(serverConfig, inboundId, clientId, email) {
  const pathname = serverConfig.apiVersion === 3
    ? `panel/api/clients/del/${encodeURIComponent(email)}`
    : `panel/api/inbounds/${inboundId}/delClient/${encodeURIComponent(clientId)}`;
  return callXuiApi(serverConfig, pathname, { method: 'POST', body: '{}' });
}

const VLESS_SHARE_PARAM_ORDER = [
  'type',
  'encryption',
  'security',
  'pbk',
  'fp',
  'sni',
  'sid',
  'spx',
  'flow',
];

function buildVlessLabel(deviceName, fallback) {
  const asciiName = String(deviceName || '')
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, ' ')
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return asciiName || String(fallback || 'vpn').replace(/[^A-Za-z0-9._-]+/g, '-');
}

function canonicalizeVlessLink(connectionLink, deviceName, fallbackLabel) {
  try {
    const source = new URL(String(connectionLink || '').trim());
    if (
      source.protocol !== 'vless:'
      || !source.username
      || !source.hostname
      || !source.port
    ) {
      return connectionLink;
    }
    const params = new URLSearchParams();
    VLESS_SHARE_PARAM_ORDER.forEach(key => {
      const value = source.searchParams.get(key);
      if (value !== null && value !== '') params.set(key, value);
    });
    source.searchParams.forEach((value, key) => {
      if (!params.has(key)) params.append(key, value);
    });
    const plainHostname = source.hostname.replace(/^\[|\]$/g, '');
    const hostname = plainHostname.includes(':')
      ? `[${plainHostname}]`
      : plainHostname;
    const label = encodeURIComponent(buildVlessLabel(deviceName, fallbackLabel));
    return `vless://${source.username}@${hostname}:${source.port}/?${params.toString()}#${label}`;
  } catch {
    return connectionLink;
  }
}

function buildVlessLink(serverConfig, inbound, client, deviceName) {
  const streamSettings = parseXuiJson(inbound.streamSettings);
  const reality = streamSettings.realitySettings || {};
  const realityClient = reality.settings || {};
  const serverName = reality.serverNames?.[0] || realityClient.serverName;
  const shortId = reality.shortIds?.[0];
  const publicKey = realityClient.publicKey;

  if (
    inbound.protocol !== 'vless' ||
    streamSettings.security !== 'reality' ||
    !serverName ||
    !shortId ||
    !publicKey
  ) {
    throw new Error(`Unsupported inbound configuration for ${serverConfig.id}`);
  }

  const params = new URLSearchParams([
    ['type', streamSettings.network || 'tcp'],
    ['encryption', 'none'],
    ['security', 'reality'],
    ['pbk', publicKey],
    ['fp', realityClient.fingerprint || 'chrome'],
    ['sni', serverName],
    ['sid', shortId],
    ['spx', realityClient.spiderX || '/'],
    ['flow', client.flow],
  ]);
  const label = encodeURIComponent(buildVlessLabel(deviceName, client.email));
  return `vless://${client.id}@${serverConfig.address}:${inbound.port}/?${params.toString()}#${label}`;
}

function checkTcpPort(address, port, timeout = 3500) {
  return new Promise(resolve => {
    const socket = net.createConnection({ host: address, port });
    let settled = false;

    const finish = result => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeout);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

async function checkVlessServer(serverConfig) {
  const checkedAt = Date.now();
  if (!isVpnServerConfigured(serverConfig)) {
    return {
      available: false,
      online: false,
      panelOnline: false,
      inboundEnabled: false,
      portOpen: false,
      port: null,
      clientCount: null,
      checkedAt,
    };
  }

  try {
    const inbound = await callXuiApi(
      serverConfig,
      `panel/api/inbounds/get/${serverConfig.inboundId}`
    );
    const inboundEnabled = inbound.enable === true || Number(inbound.enable) === 1;
    const port = Number(inbound.port);
    const portOpen = inboundEnabled && Number.isInteger(port)
      ? await checkTcpPort(serverConfig.address, port)
      : false;
    const inboundSettings = parseXuiJson(inbound.settings);

    return {
      available: true,
      online: inboundEnabled && portOpen,
      panelOnline: true,
      inboundEnabled,
      portOpen,
      port: Number.isInteger(port) ? port : null,
      protocol: inbound.protocol || null,
      clientCount: Array.isArray(inboundSettings.clients)
        ? inboundSettings.clients.length
        : null,
      checkedAt,
    };
  } catch (error) {
    console.warn(`[cheese-wheel] VPN health check failed for ${serverConfig.id}:`, error.message);
    return {
      available: true,
      online: false,
      panelOnline: false,
      inboundEnabled: false,
      portOpen: false,
      port: null,
      protocol: null,
      clientCount: null,
      checkedAt,
    };
  }
}

async function checkAwgServer(serverConfig) {
  const checkedAt = Date.now();
  if (!isAwgServerConfigured(serverConfig)) {
    return {
      available: false,
      online: false,
      port: null,
      clientCount: null,
      checkedAt,
    };
  }
  try {
    const payload = await callAwgHelper(serverConfig, 'status');
    const port = Number(payload.port);
    const clientCount = Number(payload.clientCount);
    return {
      available: true,
      online: payload.online === true,
      port: Number.isInteger(port) && port > 0 && port <= 65535 ? port : null,
      clientCount: Number.isInteger(clientCount) && clientCount >= 0 ? clientCount : null,
      checkedAt,
    };
  } catch (error) {
    console.warn(
      `[cheese-wheel] AmneziaWG health check failed for ${serverConfig.id}:`,
      error.message
    );
    return {
      available: true,
      online: false,
      port: null,
      clientCount: null,
      checkedAt,
    };
  }
}

async function checkVpnServer(serverConfig) {
  const checkedAt = Date.now();
  const [vless, amneziawg] = await Promise.all([
    checkVlessServer(serverConfig),
    checkAwgServer(serverConfig),
  ]);
  return {
    id: serverConfig.id,
    online: vless.online || amneziawg.online,
    checkedAt,
    protocols: {
      [VPN_PROTOCOLS.VLESS]: vless,
      [VPN_PROTOCOLS.AMNEZIAWG]: amneziawg,
    },
  };
}

// ============ RATE LIMITING ============


  return {
    VPN_MAX_CLIENTS_PER_SERVER,
    VPN_PROTOCOLS,
    VPN_SERVERS,
    buildVlessLink,
    createAwgClient,
    createVlessClient,
    callXuiApi,
    canonicalizeVlessLink,
    checkVpnServer,
    deleteAwgClient,
    deleteVlessClient,
    getVpnServer,
    getVpnServerProtocols,
    isAwgServerConfigured,
    isVpnProtocolConfigured,
    isVpnServerConfigured,
    vpnMutations,
  };
}

module.exports = { createVpnService };
