import { useCallback, useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import {
  createVpnClient,
  deleteVpnClient,
  fetchVpnClients,
  fetchVpnStatus,
} from '../api';
import { useApp } from '../App';
import { useDialogA11y } from '../hooks/useDialogA11y';
import ConfirmDialog from './ConfirmDialog';

function formatDate(timestamp) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(timestamp));
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const input = document.createElement('textarea');
  input.value = text;
  input.style.position = 'fixed';
  input.style.opacity = '0';
  document.body.appendChild(input);
  input.select();
  document.execCommand('copy');
  input.remove();
}

function QrDialog({ client, imageUrl, onClose, onCopy }) {
  const dialogRef = useDialogA11y(Boolean(client), onClose);
  if (!client) return null;

  return (
    <div className="dialog-backdrop" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <section
        ref={dialogRef}
        className="vpn-qr-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="vpn-qr-title"
        tabIndex={-1}
      >
        <div className="vpn-qr-heading">
          <div>
            <span className="vpn-eyebrow">QR-код</span>
            <h2 id="vpn-qr-title">{client.deviceName}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </div>
        {imageUrl ? (
          <img className="vpn-qr-image" src={imageUrl} alt={`QR-код для ${client.deviceName}`} />
        ) : (
          <div className="vpn-qr-loading" aria-live="polite">Создаём QR-код…</div>
        )}
        <p className="vpn-qr-note">Сканируйте код в приложении с поддержкой VLESS Reality.</p>
        <button className="button-primary vpn-qr-copy" type="button" onClick={onCopy}>
          📋 Скопировать ссылку
        </button>
      </section>
    </div>
  );
}

export default function VpnPage() {
  const { showToast } = useApp();
  const [servers, setServers] = useState([]);
  const [clients, setClients] = useState([]);
  const [loadState, setLoadState] = useState('loading');
  const [statusByServer, setStatusByServer] = useState({});
  const [statusState, setStatusState] = useState('loading');
  const [selectedServerId, setSelectedServerId] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [creating, setCreating] = useState(false);
  const [deletingClient, setDeletingClient] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [qrClient, setQrClient] = useState(null);
  const [qrImageUrl, setQrImageUrl] = useState('');

  const loadStatus = useCallback(async (showError = false) => {
    setStatusState('loading');
    try {
      const data = await fetchVpnStatus();
      setStatusByServer(Object.fromEntries(
        (data.statuses || []).map(status => [status.id, status])
      ));
      setStatusState('ready');
    } catch (error) {
      setStatusState('error');
      if (showError) showToast(error.message, 'error');
    }
  }, [showToast]);

  const loadClients = useCallback(async () => {
    setLoadState('loading');
    try {
      const data = await fetchVpnClients();
      setServers(data.servers || []);
      setClients(data.clients || []);
      setSelectedServerId(current => (
        data.servers?.some(server => server.id === current)
          ? current
          : data.servers?.[0]?.id || ''
      ));
      setLoadState('ready');
    } catch (error) {
      setLoadState('error');
      showToast(error.message, 'error');
    }
  }, [showToast]);

  useEffect(() => {
    loadClients();
    loadStatus();
    const timer = window.setInterval(() => loadStatus(), 30000);
    return () => window.clearInterval(timer);
  }, [loadClients, loadStatus]);

  const serverById = useMemo(
    () => Object.fromEntries(servers.map(server => [server.id, server])),
    [servers]
  );

  const countsByServer = useMemo(() => {
    const counts = {};
    clients.forEach(client => {
      counts[client.serverId] = (counts[client.serverId] || 0) + 1;
    });
    return counts;
  }, [clients]);

  const selectedStatus = statusByServer[selectedServerId];

  const handleCreate = async event => {
    event.preventDefault();
    if (!selectedServerId || !deviceName.trim() || creating) return;

    setCreating(true);
    try {
      const response = await createVpnClient(selectedServerId, deviceName.trim());
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Не удалось создать конфигурацию');
      setClients(current => [data, ...current]);
      setDeviceName('');
      showToast('Конфигурация создана в x-ui', 'success');
      loadStatus();
      try {
        await copyText(data.connectionLink);
        showToast('Ссылка скопирована', 'success');
      } catch {
        showToast('Создано, но Safari не разрешил автокопирование', 'info');
      }
    } catch (error) {
      showToast(error.message || 'Ошибка соединения', 'error');
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = async client => {
    try {
      await copyText(client.connectionLink);
      showToast('Ссылка скопирована', 'success');
    } catch {
      showToast('Не удалось скопировать ссылку', 'error');
    }
  };

  const openQr = async client => {
    setQrClient(client);
    setQrImageUrl('');
    try {
      const imageUrl = await QRCode.toDataURL(client.connectionLink, {
        width: 360,
        margin: 2,
        color: {
          dark: '#2f2409',
          light: '#fffdf3',
        },
        errorCorrectionLevel: 'M',
      });
      setQrImageUrl(imageUrl);
    } catch {
      setQrClient(null);
      showToast('Не удалось создать QR-код', 'error');
    }
  };

  const handleDelete = async () => {
    if (!deletingClient || deleteBusy) return;
    setDeleteBusy(true);
    try {
      const response = await deleteVpnClient(deletingClient.id);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Не удалось удалить конфигурацию');
      setClients(current => current.filter(client => client.id !== deletingClient.id));
      setDeletingClient(null);
      showToast('VPN-конфигурация удалена', 'success');
      loadStatus();
    } catch (error) {
      showToast(error.message || 'Ошибка соединения', 'error');
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <main className="vpn-page">
      <header className="vpn-header">
        <div>
          <span className="vpn-eyebrow">Личный доступ</span>
          <h1>VPN</h1>
          <p>Создайте отдельную конфигурацию для каждого устройства.</p>
        </div>
        <div className="vpn-protocol" aria-label="Протокол">
          <span className="vpn-status-dot" aria-hidden="true" />
          VLESS Reality
        </div>
      </header>

      <form className="vpn-create surface" onSubmit={handleCreate}>
        <div className="vpn-create-heading">
          <div>
            <h2>Новая конфигурация</h2>
            <p>Ссылка автоматически скопируется после создания.</p>
          </div>
          <span className="vpn-step" aria-hidden="true">+</span>
        </div>

        <fieldset className="vpn-server-picker" disabled={creating || loadState !== 'ready'}>
          <legend>Сервер</legend>
          <div className="vpn-server-options">
            {servers.map(server => {
              const count = countsByServer[server.id] || 0;
              const status = statusByServer[server.id];
              const healthLabel = status?.online
                ? `Работает · ${status.port}`
                : statusState === 'loading' && !status
                  ? 'Проверяем…'
                  : 'Недоступен';
              return (
                <label
                  key={server.id}
                  className={`vpn-server-option ${selectedServerId === server.id ? 'selected' : ''}`}
                >
                  <input
                    type="radio"
                    name="vpn-server"
                    value={server.id}
                    checked={selectedServerId === server.id}
                    onChange={() => setSelectedServerId(server.id)}
                  />
                  <span className="vpn-server-meta">
                    <strong>{server.label}</strong>
                    <small>{server.address}</small>
                    <span className={`vpn-health ${status?.online ? 'online' : status ? 'offline' : 'checking'}`}>
                      <i aria-hidden="true" />
                      {healthLabel}
                    </span>
                  </span>
                  <span className="vpn-server-counts">
                    <b>{count}/{server.limit}</b>
                    <small>{status?.clientCount ?? '—'} в x-ui</small>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <label className="vpn-device-field">
          <span>Название устройства</span>
          <input
            type="text"
            value={deviceName}
            onChange={event => setDeviceName(event.target.value)}
            maxLength={40}
            placeholder="Например, iPhone или Ноутбук"
            autoComplete="off"
            disabled={creating || loadState !== 'ready'}
          />
        </label>

        <button
          className="button-primary vpn-create-button"
          type="submit"
          disabled={
            creating ||
            !selectedServerId ||
            !deviceName.trim() ||
            selectedStatus?.online === false
          }
        >
          {creating ? 'Создаём…' : '＋ Создать и скопировать'}
        </button>
        {selectedStatus?.online === false && (
          <p className="vpn-server-warning" role="status">
            Сервер или выбранный inbound сейчас недоступен. Создание временно отключено.
          </p>
        )}
      </form>

      <section className="vpn-list" aria-labelledby="vpn-list-title">
        <div className="vpn-list-heading">
          <div>
            <span className="vpn-eyebrow">Ваши устройства</span>
            <h2 id="vpn-list-title">Конфигурации</h2>
          </div>
          <span className="vpn-total">{clients.length}</span>
        </div>

        {loadState === 'loading' && (
          <div className="vpn-loading" aria-live="polite">Загружаем конфигурации…</div>
        )}

        {loadState === 'error' && (
          <div className="vpn-empty surface">
            <span aria-hidden="true">📡</span>
            <strong>Не удалось загрузить VPN</strong>
            <button className="button-secondary" type="button" onClick={loadClients}>Повторить</button>
          </div>
        )}

        {loadState === 'ready' && servers.length === 0 && (
          <div className="vpn-empty surface">
            <span aria-hidden="true">🔧</span>
            <strong>VPN-серверы ещё не подключены</strong>
          </div>
        )}

        {loadState === 'ready' && servers.length > 0 && clients.length === 0 && (
          <div className="vpn-empty surface">
            <span aria-hidden="true">🔐</span>
            <strong>Пока нет конфигураций</strong>
            <p>Создайте первую для телефона или компьютера.</p>
          </div>
        )}

        {clients.length > 0 && (
          <div className="vpn-client-grid">
            {clients.map(client => {
              const server = serverById[client.serverId];
              return (
                <article className="vpn-client-card surface" key={client.id}>
                  <div className="vpn-client-icon" aria-hidden="true">🔐</div>
                  <div className="vpn-client-content">
                    <div className="vpn-client-title">
                      <h3>{client.deviceName}</h3>
                      <span>{server?.label || 'VPN'}</span>
                    </div>
                    <p>{server?.address} · создано {formatDate(client.createdAt)}</p>
                    <div className="vpn-client-actions">
                      <button type="button" className="button-primary" onClick={() => handleCopy(client)}>
                        📋 Скопировать
                      </button>
                      <button type="button" className="button-secondary" onClick={() => openQr(client)}>
                        ▦ QR-код
                      </button>
                      <button
                        type="button"
                        className="icon-button vpn-delete-button"
                        onClick={() => setDeletingClient(client)}
                        aria-label={`Удалить конфигурацию ${client.deviceName}`}
                        title="Удалить"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <QrDialog
        client={qrClient}
        imageUrl={qrImageUrl}
        onClose={() => setQrClient(null)}
        onCopy={() => handleCopy(qrClient)}
      />
      <ConfirmDialog
        open={Boolean(deletingClient)}
        title="Удалить VPN-конфигурацию?"
        message={deletingClient ? `${deletingClient.deviceName} перестанет подключаться к VPN.` : ''}
        busy={deleteBusy}
        onConfirm={handleDelete}
        onClose={() => !deleteBusy && setDeletingClient(null)}
      />
    </main>
  );
}
