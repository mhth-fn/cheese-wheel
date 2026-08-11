'use strict';

const crypto = require('node:crypto');

function registerVpnRoutes(context) {
  const {
    VPN_MAX_CLIENTS_PER_SERVER,
    VPN_PROTOCOLS,
    VPN_SERVERS,
    app,
    buildVlessLink,
    callXuiApi,
    canonicalizeVlessLink,
    checkVpnServer,
    consumeRateLimit,
    createAwgClient,
    deleteAwgClient,
    getVpnServer,
    getVpnServerProtocols,
    isVpnProtocolConfigured,
    parseIntStrict,
    rejectRateLimited,
    requireMember,
    vpnMutations,
    vpnStmts,
  } = context;

app.get('/api/vpn/clients', requireMember, (req, res) => {
  const userId = Number(req.tokenData.userId);
  const servers = VPN_SERVERS
    .filter(serverConfig => getVpnServerProtocols(serverConfig).length > 0)
    .map(serverConfig => ({
      id: serverConfig.id,
      label: serverConfig.label,
      address: serverConfig.address,
      limit: VPN_MAX_CLIENTS_PER_SERVER,
      protocols: getVpnServerProtocols(serverConfig),
    }));
  const clients = vpnStmts.listByUser.all(userId).map(client => ({
    id: client.id,
    serverId: client.server_id,
    protocol: client.protocol || VPN_PROTOCOLS.VLESS,
    deviceName: client.device_name,
    connectionLink: (client.protocol || VPN_PROTOCOLS.VLESS) === VPN_PROTOCOLS.VLESS
      ? canonicalizeVlessLink(client.connection_link, client.device_name, client.email)
      : client.connection_link,
    createdAt: client.created_at,
  }));
  res.json({ servers, clients });
});

app.get('/api/vpn/status', requireMember, async (req, res) => {
  const statusLimit = consumeRateLimit(
    'vpn-status',
    req.tokenData.userId,
    10,
    60 * 1000
  );
  if (!statusLimit.allowed) return rejectRateLimited(res, statusLimit);
  const statuses = await Promise.all(VPN_SERVERS.map(checkVpnServer));
  res.json({ statuses });
});

app.post('/api/vpn/clients', requireMember, async (req, res) => {
  const userId = Number(req.tokenData.userId);
  const serverId = typeof req.body.server_id === 'string' ? req.body.server_id : '';
  const protocol = typeof req.body.protocol === 'string'
    ? req.body.protocol
    : VPN_PROTOCOLS.VLESS;
  const serverConfig = getVpnServer(serverId);
  const deviceName = typeof req.body.device_name === 'string'
    ? req.body.device_name.normalize('NFKC').replace(/\s+/g, ' ').trim()
    : '';

  if (!Object.values(VPN_PROTOCOLS).includes(protocol)) {
    return res.status(400).json({ error: 'Неизвестный VPN-протокол' });
  }
  if (!isVpnProtocolConfigured(serverConfig, protocol)) {
    return res.status(400).json({ error: 'Этот протокол на выбранном сервере недоступен' });
  }
  if (
    deviceName.length < 1 ||
    deviceName.length > 40 ||
    /[\p{Cc}\p{Cf}]/u.test(deviceName)
  ) {
    return res.status(400).json({ error: 'Название устройства — от 1 до 40 символов' });
  }
  if (vpnStmts.getByUserServerProtocolAndDevice.get(
    userId,
    serverId,
    protocol,
    deviceName
  )) {
    return res.status(409).json({ error: 'Устройство с таким названием уже есть' });
  }

  const currentCount = vpnStmts.countByUserServerAndProtocol.get(
    userId,
    serverId,
    protocol
  )?.count || 0;
  if (currentCount >= VPN_MAX_CLIENTS_PER_SERVER) {
    return res.status(409).json({
      error: `На одном сервере можно создать не больше ${VPN_MAX_CLIENTS_PER_SERVER} конфигураций`,
    });
  }

  const mutationKey = `${userId}:${serverId}:${protocol}`;
  if (vpnMutations.has(mutationKey)) {
    return res.status(409).json({ error: 'Предыдущая операция ещё выполняется' });
  }

  const now = Date.now();
  const client = {
    id: crypto.randomUUID(),
    flow: 'xtls-rprx-vision',
    email: `cw-u${userId}-${crypto.randomBytes(4).toString('hex')}`,
    limitIp: 0,
    totalGB: 0,
    expiryTime: 0,
    enable: true,
    tgId: '',
    subId: crypto.randomBytes(8).toString('hex'),
    reset: 0,
    comment: deviceName,
    created_at: now,
    updated_at: now,
  };
  let provisionedClient = null;
  let vlessClientCreated = false;
  vpnMutations.add(mutationKey);

  try {
    if (protocol === VPN_PROTOCOLS.VLESS) {
      await callXuiApi(serverConfig, 'panel/api/inbounds/addClient', {
        method: 'POST',
        body: JSON.stringify({
          id: serverConfig.inboundId,
          settings: JSON.stringify({ clients: [client] }),
        }),
      });
      vlessClientCreated = true;
      const inbound = await callXuiApi(
        serverConfig,
        `panel/api/inbounds/get/${serverConfig.inboundId}`
      );
      provisionedClient = {
        clientId: client.id,
        email: client.email,
        inboundId: serverConfig.inboundId,
        connectionLink: buildVlessLink(serverConfig, inbound, client, deviceName),
      };
    } else {
      const peerId = `cw_${userId}_${crypto.randomBytes(8).toString('hex')}`;
      const awgClient = await createAwgClient(serverConfig, peerId);
      provisionedClient = {
        clientId: awgClient.clientId,
        email: awgClient.address,
        inboundId: 0,
        connectionLink: awgClient.connectionConfig,
      };
    }

    const result = vpnStmts.insert.run(
      userId,
      serverId,
      protocol,
      provisionedClient.inboundId,
      provisionedClient.clientId,
      provisionedClient.email,
      deviceName,
      provisionedClient.connectionLink,
      now
    );

    res.status(201).json({
      id: Number(result.lastInsertRowid),
      serverId,
      protocol,
      deviceName,
      connectionLink: provisionedClient.connectionLink,
      createdAt: now,
    });
  } catch (error) {
    if (provisionedClient || vlessClientCreated) {
      try {
        if (protocol === VPN_PROTOCOLS.VLESS) {
          await callXuiApi(
            serverConfig,
            `panel/api/inbounds/${serverConfig.inboundId}/delClient/${client.id}`,
            { method: 'POST', body: '{}' }
          );
        } else {
          await deleteAwgClient(serverConfig, provisionedClient.clientId);
        }
      } catch (rollbackError) {
        console.error('[cheese-wheel] VPN rollback failed:', rollbackError.message);
      }
    }
    console.error('[cheese-wheel] VPN client creation failed:', error.message);
    res.status(502).json({ error: 'Не удалось создать конфигурацию. Попробуйте ещё раз.' });
  } finally {
    vpnMutations.delete(mutationKey);
  }
});

app.delete('/api/vpn/clients/:id', requireMember, async (req, res) => {
  const userId = Number(req.tokenData.userId);
  const id = parseIntStrict(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'Неверный идентификатор конфигурации' });
  }

  const storedClient = vpnStmts.getByIdAndUser.get(id, userId);
  if (!storedClient) {
    return res.status(404).json({ error: 'Конфигурация не найдена' });
  }
  const serverConfig = getVpnServer(storedClient.server_id);
  const protocol = storedClient.protocol || VPN_PROTOCOLS.VLESS;
  if (!isVpnProtocolConfigured(serverConfig, protocol)) {
    return res.status(503).json({ error: 'VPN-сервер временно недоступен' });
  }

  const mutationKey = `${userId}:${storedClient.server_id}:${protocol}`;
  if (vpnMutations.has(mutationKey)) {
    return res.status(409).json({ error: 'Предыдущая операция ещё выполняется' });
  }
  vpnMutations.add(mutationKey);

  try {
    if (protocol === VPN_PROTOCOLS.VLESS) {
      await callXuiApi(
        serverConfig,
        `panel/api/inbounds/${storedClient.inbound_id}/delClient/${storedClient.client_id}`,
        { method: 'POST', body: '{}' }
      );
    } else {
      await deleteAwgClient(serverConfig, storedClient.client_id);
    }
    vpnStmts.deleteByIdAndUser.run(id, userId);
    res.json({ success: true });
  } catch (error) {
    console.error('[cheese-wheel] VPN client deletion failed:', error.message);
    res.status(502).json({ error: 'Не удалось удалить конфигурацию. Попробуйте ещё раз.' });
  } finally {
    vpnMutations.delete(mutationKey);
  }
});

}

module.exports = { registerVpnRoutes };
