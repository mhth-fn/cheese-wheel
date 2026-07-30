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
  const [mobileNavHidden, setMobileNavHidden] = useState(false);
  const dropdownRef = useRef(null);
  const triggerRef = useRef(null);
  const dropdownWasOpenRef = useRef(false);
  const lastScrollYRef = useRef(0);
  const scrollTravelRef = useRef(0);
  const scrollFrameRef = useRef(null);
  const navHideTimerRef = useRef(null);

  const pages = [
    { key: 'wheel', icon: '🎡', label: 'Колесо' },
    { key: 'watched', icon: '📋', label: 'Просмотренные', shortLabel: 'История' },
    {
      key: 'reviews',
      target: 'movie-reviews',
      icon: '✍️',
      label: 'Обзоры',
      active: activePage === 'movie-reviews' || activePage === 'wine-reviews',
    },
    { key: 'games', icon: '🎮', label: 'Игры' },
    { key: 'sigame', icon: '🧠', label: 'Паки SIGame', shortLabel: 'Паки' },
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

  const cancelScheduledNavHide = useCallback(() => {
    if (navHideTimerRef.current !== null) {
      window.clearTimeout(navHideTimerRef.current);
      navHideTimerRef.current = null;
    }
  }, []);

  const revealMobileNavigation = useCallback(() => {
    cancelScheduledNavHide();
    scrollTravelRef.current = 0;
    setMobileNavHidden(false);
  }, [cancelScheduledNavHide]);

  useEffect(() => {
    document.body.classList.toggle('mobile-nav-hidden', mobileNavHidden);
    return () => document.body.classList.remove('mobile-nav-hidden');
  }, [mobileNavHidden]);

  useEffect(() => {
    const mobileLayout = window.matchMedia(
      '(max-width: 720px), (max-width: 960px) and (max-height: 560px)'
    );

    const resetNavigation = () => {
      cancelScheduledNavHide();
      lastScrollYRef.current = Math.max(0, window.scrollY);
      scrollTravelRef.current = 0;
      setMobileNavHidden(false);
    };

    const scheduleNavigationHide = () => {
      cancelScheduledNavHide();
      navHideTimerRef.current = window.setTimeout(() => {
        navHideTimerRef.current = null;
        const scrollY = Math.max(0, window.scrollY);
        const scrollHeight = document.scrollingElement?.scrollHeight || document.body.scrollHeight;
        const maxScrollY = Math.max(0, scrollHeight - window.innerHeight);
        const focusedControl = document.activeElement?.closest?.(
          '.nav-pages, .admin-btn, .drawer-toggle'
        );

        if (
          mobileLayout.matches
          && !dropdownOpen
          && !focusedControl
          && scrollY > 72
          && maxScrollY - scrollY > 32
        ) {
          setMobileNavHidden(true);
        }
      }, 1600);
    };

    const updateNavigation = () => {
      scrollFrameRef.current = null;
      const scrollY = Math.max(0, window.scrollY);
      const delta = scrollY - lastScrollYRef.current;
      const scrollHeight = document.scrollingElement?.scrollHeight || document.body.scrollHeight;
      const maxScrollY = Math.max(0, scrollHeight - window.innerHeight);
      lastScrollYRef.current = scrollY;

      if (!mobileLayout.matches || dropdownOpen || scrollY <= 72 || maxScrollY - scrollY <= 32) {
        resetNavigation();
        return;
      }

      if (Math.abs(delta) < 2) return;

      const changedDirection = (
        (scrollTravelRef.current > 0 && delta < 0)
        || (scrollTravelRef.current < 0 && delta > 0)
      );
      scrollTravelRef.current = changedDirection ? delta : scrollTravelRef.current + delta;

      if (scrollTravelRef.current > 28 && scrollY > 120) {
        cancelScheduledNavHide();
        scrollTravelRef.current = 0;
        setMobileNavHidden(true);
      } else if (scrollTravelRef.current < -14) {
        scrollTravelRef.current = 0;
        setMobileNavHidden(false);
        scheduleNavigationHide();
      }
    };

    const scheduleNavigationUpdate = () => {
      if (scrollFrameRef.current !== null) return;
      scrollFrameRef.current = window.requestAnimationFrame(updateNavigation);
    };

    const handleLayoutChange = () => {
      if (mobileLayout.matches) {
        lastScrollYRef.current = Math.max(0, window.scrollY);
      } else {
        resetNavigation();
      }
    };

    resetNavigation();
    window.addEventListener('scroll', scheduleNavigationUpdate, { passive: true });
    window.addEventListener('resize', handleLayoutChange);
    mobileLayout.addEventListener?.('change', handleLayoutChange);

    return () => {
      cancelScheduledNavHide();
      window.removeEventListener('scroll', scheduleNavigationUpdate);
      window.removeEventListener('resize', handleLayoutChange);
      mobileLayout.removeEventListener?.('change', handleLayoutChange);
      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current);
        scrollFrameRef.current = null;
      }
    };
  }, [activePage, cancelScheduledNavHide, dropdownOpen]);

  const handleNavigate = (target) => {
    revealMobileNavigation();
    onNavigate(target);
    window.requestAnimationFrame(() => {
      window.scrollTo({
        top: 0,
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      });
    });
  };

  useEffect(() => {
    const handler = (event) => {
      if (event.key === 'Escape') {
        if (!dropdownOpen) return;
        event.preventDefault();
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
  }, [dropdownOpen, resetSubmenus]);

  useEffect(() => {
    if (dropdownOpen) {
      dropdownWasOpenRef.current = true;
      const frame = window.requestAnimationFrame(() => {
        const popover = dropdownRef.current?.querySelector('.nav-dropdown');
        if (popover?.contains(document.activeElement)) return;
        popover
          ?.querySelector('button:not(:disabled), input:not(:disabled)')
          ?.focus();
      });
      return () => window.cancelAnimationFrame(frame);
    }

    if (dropdownWasOpenRef.current) {
      dropdownWasOpenRef.current = false;
      triggerRef.current?.focus();
    }
    return undefined;
  }, [changingPassword, dropdownOpen, securityOpen, twoFactorStep]);

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
      <div
        className={`nav-pages${mobileNavHidden ? ' is-hidden' : ''}`}
        style={{ '--nav-page-count': pages.length }}
        onFocusCapture={revealMobileNavigation}
      >
        {pages.map(page => (
          <button
            key={page.key}
            className={`nav-btn ${(page.active ?? (activePage === page.key)) ? 'active' : ''}`}
            onClick={() => handleNavigate(page.target || page.key)}
            aria-current={(page.active ?? (activePage === page.key)) ? 'page' : undefined}
            aria-label={page.label}
          >
            <span aria-hidden="true">{page.icon}</span>
            <span className={page.shortLabel ? 'nav-label-full' : undefined}>{page.label}</span>
            {page.shortLabel && (
              <span className="nav-label-short" aria-hidden="true">{page.shortLabel}</span>
            )}
          </button>
        ))}
      </div>
      <div className="nav-user" ref={dropdownRef}>
        <button
          ref={triggerRef}
          className="nav-user-btn"
          onClick={() => {
            setDropdownOpen(previous => !previous);
            if (dropdownOpen) resetSubmenus();
          }}
          aria-expanded={dropdownOpen}
          aria-haspopup="dialog"
          aria-controls="nav-profile-popover"
          aria-label={`Меню пользователя ${userName}`}
        >
          <span className="nav-user-avatar" aria-hidden="true">{userName?.slice(0, 1) || 'Г'}</span>
          <span className="nav-user-name">{userName}</span>
          {isAdmin && <span className="nav-role-badge">админ</span>}
          <span className="nav-user-caret" aria-hidden="true">⌄</span>
        </button>

        {dropdownOpen && (
          <div
            id="nav-profile-popover"
            className={`nav-dropdown ${securityOpen ? 'nav-dropdown-wide' : ''}`}
            role="dialog"
            aria-modal="false"
            aria-label={`Настройки пользователя ${userName}`}
          >
            {!isGuest && !changingPassword && !securityOpen && (
              <button
                className="nav-dropdown-item"
                type="button"
                onClick={() => setChangingPassword(true)}
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
                  aria-label="Текущий пароль"
                  autoFocus
                />
                <input
                  type="password"
                  placeholder="Новый пароль"
                  value={newPwd}
                  onChange={event => setNewPwd(event.target.value)}
                  autoComplete="new-password"
                  aria-label="Новый пароль"
                />
                <input
                  type="password"
                  placeholder="Подтвердите пароль"
                  value={confirmPwd}
                  onChange={event => setConfirmPwd(event.target.value)}
                  autoComplete="new-password"
                  aria-label="Подтверждение нового пароля"
                />
                {pwdError && <span className="nav-pwd-error">{pwdError}</span>}
                <button type="submit" className="nav-dropdown-item nav-pwd-submit">
                  Сохранить
                </button>
              </form>
            )}

            {!isGuest && !changingPassword && !securityOpen && (
              <button className="nav-dropdown-item" type="button" onClick={loadTwoFactorStatus}>
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
                      aria-label="Текущий пароль"
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
                      aria-label="Код из приложения-аутентификатора"
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
                      aria-label="Текущий пароль"
                      autoFocus
                    />
                    <input
                      type="text"
                      placeholder="Код подтверждения"
                      value={securityCode}
                      onChange={event => setSecurityCode(event.target.value)}
                      autoComplete="one-time-code"
                      inputMode={twoFactorStep === 'disable' ? 'text' : 'numeric'}
                      aria-label="Код подтверждения"
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

            {!changingPassword && !securityOpen && (
              <button className="nav-dropdown-item nav-dropdown-logout" type="button" onClick={onLogout}>
                🚪 Выход
              </button>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}
