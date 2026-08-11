import { apiFetch } from './client';

export async function fetchVpnClients() {
  const response = await apiFetch('/api/vpn/clients');
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Не удалось загрузить VPN-конфигурации');
  return data;
}

export async function fetchVpnStatus() {
  const response = await apiFetch('/api/vpn/status');
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Не удалось проверить VPN-серверы');
  return data;
}

export function createVpnClient(serverId, protocol, deviceName) {
  return apiFetch('/api/vpn/clients', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      server_id: serverId,
      protocol,
      device_name: deviceName,
    }),
  });
}

export function deleteVpnClient(id) {
  return apiFetch(`/api/vpn/clients/${id}`, { method: 'DELETE' });
}
