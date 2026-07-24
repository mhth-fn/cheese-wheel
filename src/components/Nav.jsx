import { useState, useRef, useEffect, useCallback } from 'react';
import QRCode from 'qrcode';
import {
  changePassword,
  disableTwoFactor,
  enableTwoFactor,
  fetchTwoFactorStatus,
  regenerateRecoveryCodes,
  setupTwoFactor,
} from '../api';
import { useApp } from '../App';

async function readResponse(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Сервер отклонил запрос');
  return data;
}

function getRecoveryCodes(data) {
  const codes = data?.recovery_codes || data?.recoveryCodes || [];
  return Array.isArray(codes) ? codes : [];
}

export default function Nav({ activePage, onNavigate, onLogout, userName }) {
  const { currentUser, isGuest, isAdmin, showToast } = useApp();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [pwdError, setPwdError] = useState('');
  const [securityOpen, setSecurityOpen] = useState(false);
  const [twoFactorState, setTwoFactorState] = useState('idle');
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [twoFactorStep, setTwoFactorStep] = useState('status');
  const [securityPassword, setSecurityPassword] = useState('');
  const [securityCode, setSecurityCode] = useState('');
  const [securityError, setSecurityError] = useState('');
  const [setupData, setSetupData] = useState(null);
  const [recoveryCodes, setRecoveryCodes] = useState([]);
  const dropdownRef = useRef(null);

  const pages = [
    { key: 'wheel', icon: '🎡', label: 'Колесо' },
    { key: 'watched', icon: '📋', label: 'Просмотренные' },
    { key: 'games', icon: '🎮', label: 'Игры' },
    ...(!isGuest ? [{ key: 'vpn', icon: '🔐', label: 'VPN' }] : []),
  ];

  const resetSubmenus = useCallback(() => {
    setChangingPassword(false);
    setPwdError('');
    setSecurityOpen(false);
    setTwoFactorStep('status');
    setSecurityPassword('');
    setSecurityCode('');
    setSecurityError('');
    setSetupData(null);
    setRecoveryCodes([]);
  }, []);

  useEffect(() => {
    const handler = (event) => {
      if (event.key === 'Escape') {
        setDropdownOpen(false);
        resetSubmenus();
        return;
      }
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
        resetSubmenus();
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', handler);
    };
  }, [resetSubmenus]);

  const handlePasswordSubmit = async (event) => {
    event.preventDefault();
    setPwdError('');
    if (newPwd.length < 8) {
      setPwdError('Минимум 8 символов');
      return;
    }
    if (newPwd !== confirmPwd) {
      setPwdError('Пароли не совпадают');
      return;
    }
    try {
      await readResponse(await changePassword(currentUser.id, oldPwd, newPwd));
      showToast('Пароль изменён', 'success');
      setChangingPassword(false);
      setDropdownOpen(false);
      setOldPwd('');
      setNewPwd('');
      setConfirmPwd('');
    } catch (error) {
      setPwdError(error.message || 'Ошибка сети');
    }
  };

  const loadTwoFactorStatus = async () => {
    setSecurityOpen(true);
    setChangingPassword(false);
    setTwoFactorState('loading');
    setTwoFactorStep('status');
    setSecurityError('');
    try {
      const data = await readResponse(await fetchTwoFactorStatus());
      setTwoFactorEnabled(Boolean(data.enabled ?? data.two_factor_enabled ?? data.twoFactorEnabled));
      setTwoFactorState('ready');
    } catch (error) {
      setSecurityError(error.message || 'Не удалось загрузить настройки');
      setTwoFactorState('error');
    }
  };

  const startSetup = () => {
    setTwoFactorStep('setup-password');
    setSecurityPassword('');
    setSecurityCode('');
    setSecurityError('');
    setSetupData(null);
    setRecoveryCodes([]);
  };

  const handleSetup = async (event) => {
    event.preventDefault();
    if (!securityPassword || twoFactorState === 'saving') return;
    setTwoFactorState('saving');
    setSecurityError('');
    try {
      const data = await readResponse(await setupTwoFactor(securityPassword));
      const otpAuthUri = data.otpauth_uri || data.otpauth_url || data.otpauthUri;
      const qrDataUrl = otpAuthUri
        ? await QRCode.toDataURL(otpAuthUri, {
            errorCorrectionLevel: 'M',
            margin: 1,
            width: 240,
          })
        : null;
      setSetupData({ ...data, qr_data_url: qrDataUrl });
      setSecurityPassword('');
      setSecurityCode('');
      setTwoFactorStep('setup-code');
      setTwoFactorState('ready');
    } catch (error) {
      setSecurityError(error.message || 'Не удалось начать настройку');
      setTwoFactorState('ready');
    }
  };

  const handleEnable = async (event) => {
    event.preventDefault();
    if (!securityCode.trim() || twoFactorState === 'saving') return;
    setTwoFactorState('saving');
    setSecurityError('');
    try {
      const data = await readResponse(await enableTwoFactor(securityCode.trim()));
      const codes = getRecoveryCodes(data);
      setRecoveryCodes(codes);
      setTwoFactorEnabled(true);
      setSecurityCode('');
      setSetupData(null);
      setTwoFactorStep(codes.length ? 'recovery-display' : 'status');
      setTwoFactorState('ready');
      showToast('Двухфакторная защита включена', 'success');
    } catch (error) {
      setSecurityError(error.message || 'Неверный код');
      setSecurityCode('');
      setTwoFactorState('ready');
    }
  };

  const openSensitiveAction = (step) => {
    setTwoFactorStep(step);
    setSecurityPassword('');
    setSecurityCode('');
    setSecurityError('');
    setRecoveryCodes([]);
  };

  const handleDisable = async (event) => {
    event.preventDefault();
    if (!securityPassword || !securityCode.trim() || twoFactorState === 'saving') return;
    setTwoFactorState('saving');
    setSecurityError('');
    try {
      await readResponse(await disableTwoFactor(securityPassword, securityCode.trim()));
      setTwoFactorEnabled(false);
      setTwoFactorStep('status');
      setSecurityPassword('');
      setSecurityCode('');
      setTwoFactorState('ready');
      showToast('Двухфакторная защита отключена', 'info');
    } catch (error) {
      setSecurityError(error.message || 'Не удалось отключить защиту');
      setSecurityCode('');
      setTwoFactorState('ready');
    }
  };

  const handleRegenerate = async (event) => {
    event.preventDefault();
    if (!securityPassword || !securityCode.trim() || twoFactorState === 'saving') return;
    setTwoFactorState('saving');
    setSecurityError('');
    try {
      const data = await readResponse(
        await regenerateRecoveryCodes(securityPassword, securityCode.trim())
      );
      setRecoveryCodes(getRecoveryCodes(data));
      setSecurityPassword('');
      setSecurityCode('');
      setTwoFactorStep('recovery-display');
      setTwoFactorState('ready');
      showToast('Резервные коды обновлены', 'success');
    } catch (error) {
      setSecurityError(error.message || 'Не удалось обновить коды');
      setSecurityCode('');
      setTwoFactorState('ready');
    }
  };

  const setupQr = setupData?.qr_data_url || setupData?.qrCode || setupData?.qr_code || null;
  const setupSecret = setupData?.secret || setupData?.manual_key || setupData?.manualKey || '';

  return (
    <nav className="nav" aria-label="Основные разделы">
      <div className="nav-pages" style={{ '--nav-page-count': pages.length }}>
        {pages.map(page => (
          <button
            key={page.key}
            className={`nav-btn ${activePage === page.key ? 'active' : ''}`}
            onClick={() => onNavigate(page.key)}
            aria-current={activePage === page.key ? 'page' : undefined}
          >
            <span aria-hidden="true">{page.icon}</span>
            <span>{page.label}</span>
          </button>
        ))}
      </div>
      <div className="nav-user" ref={dropdownRef}>
        <button
          className="nav-user-btn"
          onClick={() => {
            setDropdownOpen(previous => !previous);
            if (dropdownOpen) resetSubmenus();
          }}
          aria-expanded={dropdownOpen}
          aria-haspopup="menu"
          aria-label={`Меню пользователя ${userName}`}
        >
          <span className="nav-user-avatar" aria-hidden="true">{userName?.slice(0, 1) || 'Г'}</span>
          <span className="nav-user-name">{userName}</span>
          {isAdmin && <span className="nav-role-badge">админ</span>}
          <span className="nav-user-caret" aria-hidden="true">⌄</span>
        </button>

        {dropdownOpen && (
          <div className={`nav-dropdown ${securityOpen ? 'nav-dropdown-wide' : ''}`} role="menu">
            {!isGuest && !changingPassword && !securityOpen && (
              <button
                className="nav-dropdown-item"
                type="button"
                onClick={() => setChangingPassword(true)}
                role="menuitem"
              >
                🔑 Поменять пароль
              </button>
            )}

            {changingPassword && (
              <form className="nav-password-form" onSubmit={handlePasswordSubmit}>
                <button className="nav-submenu-back" type="button" onClick={() => setChangingPassword(false)}>← Назад</button>
                <strong>Новый пароль</strong>
                <input
                  type="password"
                  placeholder="Текущий пароль"
                  value={oldPwd}
                  onChange={event => setOldPwd(event.target.value)}
                  autoComplete="current-password"
                  autoFocus
                />
                <input
                  type="password"
                  placeholder="Новый пароль"
                  value={newPwd}
                  onChange={event => setNewPwd(event.target.value)}
                  autoComplete="new-password"
                />
                <input
                  type="password"
                  placeholder="Подтвердите пароль"
                  value={confirmPwd}
                  onChange={event => setConfirmPwd(event.target.value)}
                  autoComplete="new-password"
                />
                {pwdError && <span className="nav-pwd-error">{pwdError}</span>}
                <button type="submit" className="nav-dropdown-item nav-pwd-submit">
                  Сохранить
                </button>
              </form>
            )}

            {!isGuest && !changingPassword && !securityOpen && (
              <button className="nav-dropdown-item" type="button" onClick={loadTwoFactorStatus} role="menuitem">
                🛡️ Двухфакторная защита
              </button>
            )}

            {securityOpen && (
              <div className="nav-security-panel">
                <button
                  className="nav-submenu-back"
                  type="button"
                  onClick={() => {
                    setSecurityOpen(false);
                    setTwoFactorStep('status');
                    setSecurityError('');
                  }}
                >
                  ← Назад
                </button>
                <div className="nav-security-heading">
                  <strong>Двухфакторная защита</strong>
                  {twoFactorState !== 'loading' && (
                    <span className={twoFactorEnabled ? 'is-enabled' : ''}>
                      {twoFactorEnabled ? 'Включена' : 'Выключена'}
                    </span>
                  )}
                </div>

                {twoFactorState === 'loading' && <p className="nav-security-note">Проверяем настройки…</p>}

                {twoFactorStep === 'status' && twoFactorState !== 'loading' && (
                  <>
                    <p className="nav-security-note">
                      Код из приложения защищает аккаунт, даже если пароль станет известен.
                    </p>
                    {!twoFactorEnabled ? (
                      <button className="button-primary" type="button" onClick={startSetup}>
                        Настроить
                      </button>
                    ) : (
                      <div className="nav-security-actions">
                        <button className="button-secondary" type="button" onClick={() => openSensitiveAction('regenerate')}>
                          Новые резервные коды
                        </button>
                        <button className="button-ghost danger" type="button" onClick={() => openSensitiveAction('disable')}>
                          Отключить
                        </button>
                      </div>
                    )}
                  </>
                )}

                {twoFactorStep === 'setup-password' && (
                  <form className="nav-security-form" onSubmit={handleSetup}>
                    <p className="nav-security-note">Подтвердите текущий пароль.</p>
                    <input
                      type="password"
                      placeholder="Текущий пароль"
                      value={securityPassword}
                      onChange={event => setSecurityPassword(event.target.value)}
                      autoComplete="current-password"
                      autoFocus
                    />
                    <button className="button-primary" type="submit" disabled={!securityPassword || twoFactorState === 'saving'}>
                      {twoFactorState === 'saving' ? 'Проверяем…' : 'Продолжить'}
                    </button>
                  </form>
                )}

                {twoFactorStep === 'setup-code' && (
                  <form className="nav-security-form" onSubmit={handleEnable}>
                    <p className="nav-security-note">Добавьте аккаунт в приложение-аутентификатор.</p>
                    {setupQr && <img className="nav-two-factor-qr" src={setupQr} alt="QR-код для приложения-аутентификатора" />}
                    {setupSecret && (
                      <div className="nav-two-factor-secret">
                        <span>Ключ для ручного ввода</span>
                        <code>{setupSecret}</code>
                      </div>
                    )}
                    <input
                      type="text"
                      placeholder="Код из приложения"
                      value={securityCode}
                      onChange={event => setSecurityCode(event.target.value)}
                      autoComplete="one-time-code"
                      inputMode="numeric"
                      autoFocus
                    />
                    <button className="button-primary" type="submit" disabled={!securityCode.trim() || twoFactorState === 'saving'}>
                      {twoFactorState === 'saving' ? 'Включаем…' : 'Проверить и включить'}
                    </button>
                  </form>
                )}

                {(twoFactorStep === 'disable' || twoFactorStep === 'regenerate') && (
                  <form
                    className="nav-security-form"
                    onSubmit={twoFactorStep === 'disable' ? handleDisable : handleRegenerate}
                  >
                    <p className="nav-security-note">
                      Для подтверждения нужны пароль и актуальный код из приложения.
                    </p>
                    <input
                      type="password"
                      placeholder="Текущий пароль"
                      value={securityPassword}
                      onChange={event => setSecurityPassword(event.target.value)}
                      autoComplete="current-password"
                      autoFocus
                    />
                    <input
                      type="text"
                      placeholder="Код подтверждения"
                      value={securityCode}
                      onChange={event => setSecurityCode(event.target.value)}
                      autoComplete="one-time-code"
                      inputMode={twoFactorStep === 'disable' ? 'text' : 'numeric'}
                    />
                    <button
                      className={twoFactorStep === 'disable' ? 'button-danger' : 'button-primary'}
                      type="submit"
                      disabled={!securityPassword || !securityCode.trim() || twoFactorState === 'saving'}
                    >
                      {twoFactorState === 'saving'
                        ? 'Подтверждаем…'
                        : twoFactorStep === 'disable'
                          ? 'Отключить защиту'
                          : 'Создать новые коды'}
                    </button>
                  </form>
                )}

                {twoFactorStep === 'recovery-display' && (
                  <div className="nav-recovery-codes">
                    <p><strong>Сохраните резервные коды сейчас.</strong> Каждый сработает только один раз.</p>
                    {recoveryCodes.length > 0 ? (
                      <div className="nav-recovery-grid">
                        {recoveryCodes.map(code => <code key={code}>{code}</code>)}
                      </div>
                    ) : (
                      <p className="nav-security-note">Сервер не вернул новые коды.</p>
                    )}
                    <button className="button-primary" type="button" onClick={() => setTwoFactorStep('status')}>
                      Я сохранил коды
                    </button>
                  </div>
                )}

                {securityError && <p className="nav-pwd-error" role="alert">{securityError}</p>}
              </div>
            )}

            {!isGuest && !changingPassword && !securityOpen && (
              <>
                <button
                  className="nav-dropdown-item"
                  type="button"
                  onClick={() => { onNavigate('wine-reviews'); setDropdownOpen(false); }}
                  role="menuitem"
                >
                  🍷 Обзоры на вино
                </button>
                <button
                  className="nav-dropdown-item"
                  type="button"
                  onClick={() => { onNavigate('movie-reviews'); setDropdownOpen(false); }}
                  role="menuitem"
                >
                  🎬 Обзоры на кино
                </button>
              </>
            )}

            {!changingPassword && !securityOpen && (
              <button className="nav-dropdown-item nav-dropdown-logout" type="button" onClick={onLogout} role="menuitem">
                🚪 Выход
              </button>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}
