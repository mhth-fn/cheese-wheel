export default function Nav({ activePage, onNavigate, onLogout, userName }) {
  const pages = [
    { key: 'wheel', label: '🎡 Колесо' },
    { key: 'watched', label: '📋 Просмотренные' },
  ];

  return (
    <nav className="nav">
      {pages.map(p => (
        <button
          key={p.key}
          className={`nav-btn ${activePage === p.key ? 'active' : ''}`}
          onClick={() => onNavigate(p.key)}
        >
          {p.label}
        </button>
      ))}
      <div className="nav-user">
        <span>👤</span>
        <span className="nav-user-name">{userName}</span>
        <button className="nav-logout" onClick={onLogout} title="Выйти">🚪</button>
      </div>
    </nav>
  );
}
