import { useState } from 'react';
import { postAuth } from '../api';

export default function AuthPage({ users, onLogin, onGuest }) {
  const [selectedId, setSelectedId] = useState(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSelect = (userId) => {
    setSelectedId(userId);
    setPassword('');
    setError('');
  };

  const handleLogin = async () => {
    if (!selectedId) return;
    try {
      const res = await postAuth(selectedId, password);
      const data = await res.json();
      if (res.ok) {
        const user = users.find(u => u.id === selectedId);
        onLogin(user, data.token);
      } else {
        setError(data.error || 'Неверный пароль');
        setPassword('');
      }
    } catch {
      setError('Ошибка соединения');
    }
  };

  return (
    <div id="auth-page" className="page auth-page active">
      <div className="auth-logo">🧀</div>
      <h1 className="auth-title">Сырное Колесо</h1>
      <p className="auth-subtitle">Выбери себя</p>
      <div className="auth-users">
        {users.map(user => (
          <button
            key={user.id}
            className={`auth-btn ${selectedId === user.id ? 'selected' : ''}`}
            onClick={() => handleSelect(user.id)}
          >
            {user.name}
          </button>
        ))}
      </div>
      {selectedId !== null && (
        <div className="auth-password-container" style={{ display: 'flex' }}>
          <input
            type="password"
            className="auth-password-input"
            placeholder="Введите пароль..."
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyPress={e => e.key === 'Enter' && handleLogin()}
            autoFocus
          />
          <button className="auth-password-btn" onClick={handleLogin}>Войти</button>
          {error && <p className="auth-error">{error}</p>}
        </div>
      )}
      <button className="auth-guest-btn" onClick={onGuest}>
        👀 Войти как гость
      </button>
    </div>
  );
}
