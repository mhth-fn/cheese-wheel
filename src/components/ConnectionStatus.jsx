import { useEffect, useRef, useState } from 'react';

const LABELS = {
  connecting: 'Подключение…',
  online: 'Онлайн',
  reconnecting: 'Переподключение…',
  offline: 'Нет соединения',
  error: 'Ошибка синхронизации',
};

function formatSyncTime(value) {
  if (!value) return 'ещё не выполнялась';
  return new Intl.DateTimeFormat('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(value);
}

function participantLabel(value) {
  if (value % 10 === 1 && value % 100 !== 11) return 'участник';
  if (value % 10 >= 2 && value % 10 <= 4 && (value % 100 < 12 || value % 100 > 14)) return 'участника';
  return 'участников';
}

export default function ConnectionStatus({
  state = 'connecting',
  onlineUsers = [],
  currentUser,
  lastSyncedAt,
  onReconnect,
}) {
  const [expanded, setExpanded] = useState(false);
  const rootRef = useRef(null);
  const onlineLabel = state === 'online'
    ? `${LABELS.online} · ${onlineUsers.length} ${participantLabel(onlineUsers.length)}`
    : LABELS[state] || LABELS.error;

  useEffect(() => {
    const onPointerDown = event => {
      if (!rootRef.current?.contains(event.target)) setExpanded(false);
    };
    const onKeyDown = event => {
      if (event.key === 'Escape') setExpanded(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  return (
    <div className={`connection-status state-${state}`} ref={rootRef}>
      {expanded && (
        <div className="connection-popover" role="status">
          <div className="connection-popover-header">
            <strong>Совместный режим</strong>
            <span>{state === 'online' ? 'Сервер отвечает' : onlineLabel}</span>
          </div>

          <div className="connection-meta">
            <span>Последняя синхронизация</span>
            <strong>{formatSyncTime(lastSyncedAt)}</strong>
          </div>

          <div className="connection-users-list">
            {onlineUsers.length > 0 ? onlineUsers.map(user => (
              <div key={user.id} className="connection-user-item">
                <span className="connection-avatar" aria-hidden="true">{user.name.slice(0, 1)}</span>
                <span>{user.name}{currentUser?.id === user.id ? ' · вы' : ''}</span>
                <span className="connection-user-online">онлайн</span>
              </div>
            )) : (
              <div className="connection-empty">Подключённых участников пока нет</div>
            )}
          </div>

          {state !== 'online' && (
            <button className="button-secondary connection-retry" type="button" onClick={onReconnect}>
              Подключиться снова
            </button>
          )}
        </div>
      )}

      <button
        className="connection-status-main"
        type="button"
        onClick={() => setExpanded(value => !value)}
        aria-expanded={expanded}
        aria-label={`${onlineLabel}. Открыть состояние синхронизации`}
        title="Состояние совместной работы"
      >
        <span className="connection-dot" aria-hidden="true" />
        <span>{onlineLabel}</span>
        <span className="connection-arrow" aria-hidden="true">{expanded ? '⌄' : '⌃'}</span>
      </button>
    </div>
  );
}
