'use strict';

const https = require('node:https');
const net = require('node:net');
const tls = require('node:tls');

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
    server.username &&
    server.password &&
    server.tlsFingerprint &&
    Number.isInteger(server.inboundId)
  );
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

  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: options.method || 'GET',
      agent: false,
      createConnection: () => socket,
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
  let cookie = xuiSessions.get(serverConfig.id);
  if (!cookie) cookie = await loginXui(serverConfig);

  const response = await requestXui(serverConfig, pathname, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      Cookie: cookie,
      ...options.headers,
    },
  });

  if (response.status === 401 && retry) {
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

async function checkVpnServer(serverConfig) {
  const checkedAt = Date.now();
  if (!isVpnServerConfigured(serverConfig)) {
    return {
      id: serverConfig.id,
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
      id: serverConfig.id,
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
      id: serverConfig.id,
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

// ============ RATE LIMITING ============


  return {
    VPN_MAX_CLIENTS_PER_SERVER,
    VPN_SERVERS,
    buildVlessLink,
    callXuiApi,
    canonicalizeVlessLink,
    checkVpnServer,
    getVpnServer,
    isVpnServerConfigured,
    vpnMutations,
  };
}

module.exports = { createVpnService };
