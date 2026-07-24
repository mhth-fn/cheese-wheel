import { useState, useRef, useEffect } from 'react';
import { changePassword } from '../api';
import { useApp } from '../App';

export default function Nav({ activePage, onNavigate, onLogout, userName }) {
  const { currentUser, isGuest, showToast } = useApp();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [pwdError, setPwdError] = useState('');
  const dropdownRef = useRef(null);

  const pages = [
    { key: 'wheel', icon: '🎡', label: 'Колесо' },
    { key: 'watched', icon: '📋', label: 'Просмотренные' },
    { key: 'games', icon: '🎮', label: 'Игры' },
    ...(!isGuest ? [{ key: 'vpn', icon: '🔐', label: 'VPN' }] : []),
  ];

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') {
        setDropdownOpen(false);
        setChangingPassword(false);
        setPwdError('');
        return;
      }
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
        setChangingPassword(false);
        setPwdError('');
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', handler);
    };
  }, []);

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setPwdError('');
    if (newPwd.length < 4) {
      setPwdError('Минимум 4 символа');
      return;
    }
    if (newPwd !== confirmPwd) {
      setPwdError('Пароли не совпадают');
      return;
    }
    try {
      const res = await changePassword(currentUser.id, oldPwd, newPwd);
      const data = await res.json();
      if (!res.ok) {
        setPwdError(data.error || 'Ошибка');
        return;
      }
      showToast('Пароль изменён', 'success');
      setChangingPassword(false);
      setDropdownOpen(false);
      setOldPwd('');
      setNewPwd('');
      setConfirmPwd('');
    } catch {
      setPwdError('Ошибка сети');
    }
  };

  return (
    <nav className="nav" aria-label="Основные разделы">
      <div className="nav-pages" style={{ '--nav-page-count': pages.length }}>
        {pages.map(p => (
          <button
            key={p.key}
            className={`nav-btn ${activePage === p.key ? 'active' : ''}`}
            onClick={() => onNavigate(p.key)}
            aria-current={activePage === p.key ? 'page' : undefined}
          >
            <span aria-hidden="true">{p.icon}</span>
            <span>{p.label}</span>
          </button>
        ))}
      </div>
      <div className="nav-user" ref={dropdownRef}>
        <button
          className="nav-user-btn"
          onClick={() => {
            setDropdownOpen(prev => !prev);
            if (dropdownOpen) {
              setChangingPassword(false);
              setPwdError('');
            }
          }}
          aria-expanded={dropdownOpen}
          aria-haspopup="menu"
          aria-label={`Меню пользователя ${userName}`}
        >
          <span className="nav-user-avatar" aria-hidden="true">{userName?.slice(0, 1) || 'Г'}</span>
          <span className="nav-user-name">{userName}</span>
          <span className="nav-user-caret" aria-hidden="true">⌄</span>
        </button>
        {dropdownOpen && (
          <div className="nav-dropdown" role="menu">
            {!isGuest && !changingPassword && (
              <button
                className="nav-dropdown-item"
                onClick={() => setChangingPassword(true)}
                role="menuitem"
              >
                🔑 Поменять пароль
              </button>
            )}
            {changingPassword && (
              <form className="nav-password-form" onSubmit={handlePasswordSubmit}>
                <input
                  type="password"
                  placeholder="Текущий пароль"
                  value={oldPwd}
                  onChange={e => setOldPwd(e.target.value)}
                  autoFocus
                />
                <input
                  type="password"
                  placeholder="Новый пароль"
                  value={newPwd}
                  onChange={e => setNewPwd(e.target.value)}
                />
                <input
                  type="password"
                  placeholder="Подтвердите пароль"
                  value={confirmPwd}
                  onChange={e => setConfirmPwd(e.target.value)}
                />
                {pwdError && <span className="nav-pwd-error">{pwdError}</span>}
                <button type="submit" className="nav-dropdown-item nav-pwd-submit">
                  Сохранить
                </button>
              </form>
            )}
            {!isGuest && !changingPassword && (
              <>
                <button
                  className="nav-dropdown-item"
                  onClick={() => { onNavigate('wine-reviews'); setDropdownOpen(false); }}
                  role="menuitem"
                >
                  🍷 Обзоры на вино
                </button>
                <button
                  className="nav-dropdown-item"
                  onClick={() => { onNavigate('movie-reviews'); setDropdownOpen(false); }}
                  role="menuitem"
                >
                  🎬 Обзоры на кино
                </button>
              </>
            )}
            {!changingPassword && (
              <button className="nav-dropdown-item nav-dropdown-logout" onClick={onLogout} role="menuitem">
                🚪 Выход
              </button>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}
