export default function ConnectionStatus({ connected }) {
  return (
    <div className="connection-status">
      <div className={`connection-dot ${connected ? 'connected' : ''}`}></div>
      <span>{connected ? 'Онлайн' : 'Отключено'}</span>
    </div>
  );
}
