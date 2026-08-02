import { useCallback, useEffect, useRef, useState } from 'react';
import { useApp } from '../app/AppContext';
import PasswordPanel from './nav/PasswordPanel';
import TwoFactorPanel from './nav/TwoFactorPanel';
import { useMobileNavVisibility } from './nav/useMobileNavVisibility';

const PRIMARY_PAGES = [
  { key: 'wheel', label: 'Колесо' },
  {
    key: 'watched',
    label: 'Просмотренные',
    shortLabel: 'История',
  },
  {
    key: 'reviews',
    target: 'movie-reviews',
    label: 'Обзоры',
    matches: page => [
      'movie-reviews',
      'music-reviews',
      'wine-reviews',
      'food-reviews',
    ].includes(page),
  },
  { key: 'games', label: 'Игры' },
  {
    key: 'sigame',
    label: 'Паки SIGame',
    shortLabel: 'Паки',
  },
];

export default function Nav({ activePage, onNavigate, onLogout, userName }) {
  const { currentUser, isAdmin, isGuest, showToast } = useApp();
  const [changingPassword, setChangingPassword] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [securityOpen, setSecurityOpen] = useState(false);
  const dropdownRef = useRef(null);
  const dropdownWasOpenRef = useRef(false);
  const triggerRef = useRef(null);
  const mobileNavigation = useMobileNavVisibility({
    activePage,
    dropdownOpen,
  });

  const pages = isGuest
    ? PRIMARY_PAGES
    : [...PRIMARY_PAGES, { key: 'vpn', label: 'VPN' }];

  const resetSubmenus = useCallback(() => {
    setChangingPassword(false);
    setSecurityOpen(false);
  }, []);

  const closeDropdown = useCallback(() => {
    setDropdownOpen(false);
    resetSubmenus();
  }, [resetSubmenus]);

  const handleNavigate = target => {
    mobileNavigation.reveal();
    onNavigate(target);
    window.requestAnimationFrame(() => {
      window.scrollTo({
        top: 0,
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'auto'
          : 'smooth',
      });
    });
  };

  useEffect(() => {
    const handleDismiss = event => {
      if (event.key === 'Escape') {
        if (!dropdownOpen) return;
        event.preventDefault();
        closeDropdown();
        return;
      }
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        closeDropdown();
      }
    };
    document.addEventListener('mousedown', handleDismiss);
    document.addEventListener('keydown', handleDismiss);
    return () => {
      document.removeEventListener('mousedown', handleDismiss);
      document.removeEventListener('keydown', handleDismiss);
    };
  }, [closeDropdown, dropdownOpen]);

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
  }, [changingPassword, dropdownOpen, securityOpen]);

  return (
    <nav className="nav" aria-label="Основные разделы">
      <div className="nav-pages-layer">
        <div
          className={`nav-pages${mobileNavigation.hidden ? ' is-hidden' : ''}`}
          style={{ '--nav-page-count': pages.length }}
          onFocusCapture={mobileNavigation.reveal}
        >
          {pages.map(page => {
            const active = page.matches
              ? page.matches(activePage)
              : activePage === page.key;
            return (
              <button
                key={page.key}
                className={`nav-btn ${active ? 'active' : ''}`}
                type="button"
                onClick={() => handleNavigate(page.target || page.key)}
                aria-current={active ? 'page' : undefined}
                aria-label={page.label}
              >
                <span className={page.shortLabel ? 'nav-label-full' : undefined}>
                  {page.label}
                </span>
                {page.shortLabel && (
                  <span className="nav-label-short" aria-hidden="true">
                    {page.shortLabel}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="nav-user" ref={dropdownRef}>
        <button
          ref={triggerRef}
          className="nav-user-btn"
          type="button"
          onClick={() => {
            setDropdownOpen(previous => !previous);
            if (dropdownOpen) resetSubmenus();
          }}
          aria-expanded={dropdownOpen}
          aria-haspopup="dialog"
          aria-controls="nav-profile-popover"
          aria-label={`Меню пользователя ${userName}`}
        >
          <span className="nav-user-avatar" aria-hidden="true">
            {userName?.slice(0, 1) || 'Г'}
          </span>
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
                Поменять пароль
              </button>
            )}

            {changingPassword && (
              <PasswordPanel
                userId={currentUser.id}
                showToast={showToast}
                onCancel={() => setChangingPassword(false)}
                onComplete={closeDropdown}
              />
            )}

            {!isGuest && !changingPassword && !securityOpen && (
              <button
                className="nav-dropdown-item"
                type="button"
                onClick={() => setSecurityOpen(true)}
              >
                Двухфакторная защита
              </button>
            )}

            {securityOpen && (
              <TwoFactorPanel
                showToast={showToast}
                onBack={() => setSecurityOpen(false)}
              />
            )}

            {!changingPassword && !securityOpen && (
              <button
                className="nav-dropdown-item nav-dropdown-logout"
                type="button"
                onClick={onLogout}
              >
                Выход
              </button>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}
