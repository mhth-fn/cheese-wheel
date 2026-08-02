import { useState } from 'react';
import { postAuth, postAuthTwoFactor } from '../api';

export default function AuthPage({ users, onLogin, onGuest }) {
  const [selectedId, setSelectedId] = useState(null);
  const [password, setPassword] = useState('');
  const [challenge, setChallenge] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [error, setError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  const selectedUser = users.find(user => user.id === selectedId);
  const needsTwoFactor = Boolean(challenge);

  const handleSelect = (userId) => {
    setSelectedId(userId);
    setPassword('');
    setChallenge('');
    setTwoFactorCode('');
    setError('');
  };

  const finishLogin = async (data) => {
    const completed = await onLogin(data?.user || null);
    if (completed === false) {
      throw new Error('Не удалось проверить сессию');
    }
  };

  const handlePasswordLogin = async (event) => {
    event?.preventDefault();
    if (!selectedId || !password || loggingIn) return;
    setLoggingIn(true);
    setError('');
    try {
      const res = await postAuth(selectedId, password);
      const data = await res.json().catch(() => ({}));
      const nextChallenge = data.challenge || data.challenge_id;
      if (data.two_factor_required || data.twoFactorRequired) {
        if (!nextChallenge) throw new Error('Сервер не выдал запрос второго фактора');
        setChallenge(nextChallenge);
        setPassword('');
        setTwoFactorCode('');
        return;
      }
      if (!res.ok) {
        setError(data.error || 'Неверный пользователь или пароль');
        setPassword('');
        return;
      }
      await finishLogin(data);
    } catch (loginError) {
      setError(loginError.message || 'Ошибка соединения');
    } finally {
      setLoggingIn(false);
    }
  };

  const handleTwoFactorLogin = async (event) => {
    event?.preventDefault();
    const code = twoFactorCode.trim();
    if (!challenge || !code || loggingIn) return;
    setLoggingIn(true);
    setError('');
    try {
      const res = await postAuthTwoFactor(challenge, code);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Неверный или просроченный код');
        setTwoFactorCode('');
        return;
      }
      await finishLogin(data);
    } catch (loginError) {
      setError(loginError.message || 'Ошибка соединения');
    } finally {
      setLoggingIn(false);
    }
  };

  const resetTwoFactor = () => {
    setChallenge('');
    setTwoFactorCode('');
    setPassword('');
    setError('');
  };

  return (
    <div id="auth-page" className="page auth-page active">
      <div className="auth-logo" aria-hidden="true">СК</div>
      <h1 className="auth-title">Сырное Колесо</h1>
      <p className="auth-subtitle">
        {needsTwoFactor ? `Подтвердите вход: ${selectedUser?.name || 'участник'}` : 'Выбери себя'}
      </p>

      {!needsTwoFactor && (
        <div className="auth-users">
          {users.map((user, index) => (
            <button
              key={user.id}
              type="button"
              className={`auth-btn ${selectedId === user.id ? 'selected' : ''}${users.length % 2 !== 0 && index === users.length - 1 ? ' auth-btn-center' : ''}`}
              onClick={() => handleSelect(user.id)}
              aria-pressed={selectedId === user.id}
            >
              {user.name}
            </button>
          ))}
        </div>
      )}

      {selectedId !== null && !needsTwoFactor && (
        <form className="auth-password-container" onSubmit={handlePasswordLogin}>
          <input
            type="password"
            className="auth-password-input"
            placeholder="Введите пароль…"
            value={password}
            onChange={event => setPassword(event.target.value)}
            disabled={loggingIn}
            autoComplete="current-password"
            autoFocus
          />
          <button className="auth-password-btn" type="submit" disabled={loggingIn || !password}>
            {loggingIn ? 'Входим…' : 'Войти'}
          </button>
          {error && <p className="auth-error" role="alert">{error}</p>}
        </form>
      )}

      {needsTwoFactor && (
        <form className="auth-password-container auth-two-factor" onSubmit={handleTwoFactorLogin}>
          <p className="auth-two-factor-hint">
            Введите код из приложения-аутентификатора или один из резервных кодов.
          </p>
          <input
            type="text"
            className="auth-password-input auth-code-input"
            placeholder="Код подтверждения"
            value={twoFactorCode}
            onChange={event => setTwoFactorCode(event.target.value)}
            disabled={loggingIn}
            autoComplete="one-time-code"
            inputMode="text"
            autoFocus
          />
          <button className="auth-password-btn" type="submit" disabled={loggingIn || !twoFactorCode.trim()}>
            {loggingIn ? 'Проверяем…' : 'Подтвердить'}
          </button>
          <button className="auth-back-btn" type="button" onClick={resetTwoFactor} disabled={loggingIn}>
            Назад
          </button>
          {error && <p className="auth-error" role="alert">{error}</p>}
        </form>
      )}

      {!needsTwoFactor && (
        <button className="auth-guest-btn" type="button" onClick={onGuest} disabled={loggingIn}>
          Войти как гость
        </button>
      )}
    </div>
  );
}
