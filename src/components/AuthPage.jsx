import { useEffect, useState } from 'react';
import MiniCheeseWheel from './MiniCheeseWheel';
import {
  acceptInvitation,
  fetchInvitation,
  postAuth,
  postAuthTwoFactor,
} from '../api';

function invitationTokenFromLocation() {
  const match = window.location.pathname.match(/^\/invite\/([A-Za-z0-9_-]{32,128})\/?$/u);
  return match?.[1] || '';
}

export default function AuthPage({ onLogin, onGuest }) {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [challenge, setChallenge] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [error, setError] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const [inviteToken] = useState(invitationTokenFromLocation);
  const [inviteState, setInviteState] = useState(inviteToken ? 'loading' : 'none');
  const [inviteName, setInviteName] = useState('');
  const [invitePassword, setInvitePassword] = useState('');
  const [invitePasswordConfirm, setInvitePasswordConfirm] = useState('');

  const needsTwoFactor = Boolean(challenge);

  useEffect(() => {
    if (!inviteToken) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const response = await fetchInvitation(inviteToken);
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Приглашение недействительно');
        if (cancelled) return;
        setInviteName(data.name);
        setInviteState('ready');
      } catch (requestError) {
        if (cancelled) return;
        setError(requestError.message || 'Не удалось проверить приглашение');
        setInviteState('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [inviteToken]);

  const finishLogin = async data => {
    const completed = await onLogin(data?.user || null);
    if (completed === false) throw new Error('Не удалось проверить сессию');
  };

  const handlePasswordLogin = async event => {
    event.preventDefault();
    const normalizedLogin = login.trim();
    if (!normalizedLogin || !password || loggingIn) return;
    setLoggingIn(true);
    setError('');
    try {
      const response = await postAuth(normalizedLogin, password);
      const data = await response.json().catch(() => ({}));
      const nextChallenge = data.challenge || data.challenge_id;
      if (data.two_factor_required || data.twoFactorRequired) {
        if (!nextChallenge) throw new Error('Сервер не выдал запрос второго фактора');
        setChallenge(nextChallenge);
        setPassword('');
        setTwoFactorCode('');
        return;
      }
      if (!response.ok) {
        setError(data.error || 'Неверный логин или пароль');
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

  const handleTwoFactorLogin = async event => {
    event.preventDefault();
    const code = twoFactorCode.trim();
    if (!challenge || !code || loggingIn) return;
    setLoggingIn(true);
    setError('');
    try {
      const response = await postAuthTwoFactor(challenge, code);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
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

  const handleInvitation = async event => {
    event.preventDefault();
    setError('');
    if (invitePassword.length < 8) {
      setError('Пароль должен содержать минимум 8 символов');
      return;
    }
    if (invitePassword !== invitePasswordConfirm) {
      setError('Пароли не совпадают');
      return;
    }
    setLoggingIn(true);
    try {
      const response = await acceptInvitation(inviteToken, invitePassword);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Не удалось принять приглашение');
      await finishLogin(data);
    } catch (requestError) {
      setError(requestError.message || 'Ошибка соединения');
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

  if (inviteToken) {
    return (
      <div id="auth-page" className="page auth-page active">
        <MiniCheeseWheel />
        <h1 className="auth-title">Сырное Колесо</h1>
        <p className="auth-subtitle">
          {inviteState === 'ready' ? `Добро пожаловать, ${inviteName}` : 'Проверяем приглашение…'}
        </p>
        {inviteState === 'ready' && (
          <form className="auth-password-container auth-login-form" onSubmit={handleInvitation}>
            <label className="auth-field">
              <span>Придумайте пароль</span>
              <input
                type="password"
                className="auth-password-input"
                value={invitePassword}
                onChange={event => setInvitePassword(event.target.value)}
                autoComplete="new-password"
                minLength={8}
                autoFocus
              />
            </label>
            <label className="auth-field">
              <span>Повторите пароль</span>
              <input
                type="password"
                className="auth-password-input"
                value={invitePasswordConfirm}
                onChange={event => setInvitePasswordConfirm(event.target.value)}
                autoComplete="new-password"
                minLength={8}
              />
            </label>
            <button className="auth-password-btn" type="submit" disabled={loggingIn}>
              {loggingIn ? 'Создаём аккаунт…' : 'Войти'}
            </button>
            {error && <p className="auth-error" role="alert">{error}</p>}
          </form>
        )}
        {inviteState === 'error' && (
          <div className="auth-invite-error">
            <p className="auth-error" role="alert">{error}</p>
            <a className="auth-back-link" href="/">Перейти ко входу</a>
          </div>
        )}
      </div>
    );
  }

  return (
    <div id="auth-page" className="page auth-page active">
      <MiniCheeseWheel />
      <h1 className="auth-title">Сырное Колесо</h1>
      <p className="auth-subtitle">
        {needsTwoFactor ? `Подтвердите вход: ${login.trim()}` : 'Войдите в свой аккаунт'}
      </p>

      {!needsTwoFactor && (
        <form className="auth-password-container auth-login-form" onSubmit={handlePasswordLogin}>
          <label className="auth-field">
            <span>Логин</span>
            <input
              type="text"
              className="auth-password-input"
              placeholder="Ваше имя"
              value={login}
              onChange={event => setLogin(event.target.value)}
              disabled={loggingIn}
              autoComplete="username"
              autoCapitalize="none"
              autoFocus
            />
          </label>
          <label className="auth-field">
            <span>Пароль</span>
            <input
              type="password"
              className="auth-password-input"
              placeholder="Ваш пароль"
              value={password}
              onChange={event => setPassword(event.target.value)}
              disabled={loggingIn}
              autoComplete="current-password"
            />
          </label>
          <button
            className="auth-password-btn"
            type="submit"
            disabled={loggingIn || !login.trim() || !password}
          >
            {loggingIn ? 'Входим…' : 'Войти'}
          </button>
          {error && <p className="auth-error" role="alert">{error}</p>}
        </form>
      )}

      {needsTwoFactor && (
        <form className="auth-password-container auth-two-factor auth-login-form" onSubmit={handleTwoFactorLogin}>
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
