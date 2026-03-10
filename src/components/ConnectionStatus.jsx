import { useState } from 'react';

export default function ConnectionStatus({ connected, onlineUsers = [] }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`connection-status ${expanded ? 'expanded' : ''}`} onClick={() => setExpanded(prev => !prev)}>
      {expanded && onlineUsers.length > 0 && (
        <div className="connection-users-list">
          {onlineUsers.map(u => (
            <div key={u.id} className="connection-user-item">
              <div className="connection-dot connected"></div>
              <span>{u.name}</span>
            </div>
          ))}
        </div>
      )}
      {expanded && onlineUsers.length === 0 && (
        <div className="connection-users-list">
          <div className="connection-user-item" style={{ opacity: 0.6 }}>
            Нет участников онлайн
          </div>
        </div>
      )}
      <div className="connection-status-main">
        <div className={`connection-dot ${connected ? 'connected' : ''}`}></div>
        <span>{connected ? `Онлайн (${onlineUsers.length})` : 'Отключено'}</span>
        <span className={`connection-arrow ${expanded ? 'up' : ''}`}>▲</span>
      </div>
    </div>
  );
}
