import { useCallback, useEffect, useState } from 'react';
import {
  fetchAdminAudit,
  fetchAdminUsers,
  postTheme,
  postSpinEnabled,
  postAddEnabled,
  postDecorationsEnabled,
  patchOneOffWheelSettings,
  updateAdminUserRole,
} from '../api';
import { useApp } from '../app/AppContext';
import { useDialogA11y } from '../hooks/useDialogA11y';

const themes = [
  { key: 'cheese', icon: '🧀', name: 'Сырная тема', desc: 'Жёлто-оранжевый дизайн' },
  { key: 'newyear', icon: '🎄', name: 'Новогодняя тема', desc: 'Снег, гирлянды, красно-зелёный' },
  { key: 'spring', icon: '🌸', name: 'Весенняя тема', desc: 'Лепестки, зелёно-розовый дизайн' },
  { key: 'samurai', icon: '⚔️', name: 'Самурайская тема', desc: 'Тушь, киноварь, рисовая бумага и катаны' },
];

const actionLabels = {
  'auth.login_succeeded': 'Успешный вход',
  'auth.login_failed': 'Неудачный вход',
  'auth.second_factor_required': 'Пароль подтверждён, запрошен 2FA',
  'auth.two_factor_login_succeeded': 'Подтверждён вход с 2FA',
  'auth.two_factor_login_failed': 'Неудачная проверка 2FA',
  'auth.logout': 'Выход',
  'password.changed': 'Изменён пароль',
  'two_factor.enabled': 'Включена двухфакторная защита',
  'two_factor.disabled': 'Отключена двухфакторная защита',
  'two_factor.recovery_used': 'Использован резервный код',
  'two_factor.recovery_codes_regenerated': 'Обновлены резервные коды',
  'user.role_changed': 'Изменена роль',
  'wheel.choice_created': 'Добавлен фильм в колесо',
  'wheel.choice_updated': 'Изменён фильм в колесе',
  'wheel.choice_deleted': 'Удалён фильм из колеса',
  'wheel.formed': 'Сформировано колесо',
  'wheel.next_promoted': 'Сформировано следующее колесо',
  'wheel.spin_completed': 'Завершено вращение',
  'one_off.setting_changed': 'Изменено разовое колесо',
  'one_off.result_resolved': 'Завершён выбор разового колеса',
  'movie.marked_watched': 'Фильм отмечен просмотренным',
  'watched.created': 'Фильм добавлен в историю',
  'watched.updated': 'Фильм изменён в истории',
  'watched.deleted': 'Фильм удалён из истории',
  'rating.set': 'Поставлена оценка',
  'rating.deleted': 'Удалена оценка',
  'movie_review.created': 'Добавлена рецензия на фильм',
  'movie_review.updated': 'Изменена рецензия на фильм',
  'movie_review.deleted': 'Удалена рецензия на фильм',
  'wine_review.created': 'Добавлен обзор вина',
  'wine_review.updated': 'Изменён обзор вина',
  'wine_review.deleted': 'Удалён обзор вина',
  'theme.changed': 'Изменена тема',
  'setting.changed': 'Изменена настройка',
  'center_image.uploaded': 'Обновлено изображение колеса',
  'center_image.deleted': 'Удалено изображение колеса',
  'vpn_client.created': 'Создана VPN-конфигурация',
  'vpn_client.deleted': 'Удалена VPN-конфигурация',
  'authorization.denied': 'Отказано в доступе',
  'backup.completed': 'Создана резервная копия',
  'backup.failed': 'Ошибка резервного копирования',
};

function readResponse(response) {
  return response.json().catch(() => ({})).then(data => {
    if (!response.ok) throw new Error(data.error || 'Сервер отклонил запрос');
    return data;
  });
}

function normalizeAdminUsers(data) {
  const rows = Array.isArray(data) ? data : data.users;
  if (!Array.isArray(rows)) return [];
  return rows.map(user => ({
    ...user,
    id: Number(user.id),
    role: user.role === 'admin' || user.is_admin ? 'admin' : 'member',
  }));
}

function normalizeAudit(data) {
  const entries = Array.isArray(data)
    ? data
    : data.entries || data.events || data.audit || data.items || [];
  return {
    entries: Array.isArray(entries) ? entries : [],
    nextCursor: data?.next_cursor ?? data?.nextCursor ?? null,
  };
}

function formatAuditDate(value) {
  if (!value) return 'без даты';
  const numericValue = Number(value);
  const date = Number.isFinite(numericValue)
    ? new Date(numericValue < 1e12 ? numericValue * 1000 : numericValue)
    : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatAuditDetails(entry) {
  const source = entry.details ?? entry.details_json ?? entry.metadata ?? entry.metadata_json;
  if (!source) return '';
  let details = source;
  if (typeof source === 'string') {
    try {
      details = JSON.parse(source);
    } catch {
      return source.slice(0, 180);
    }
  }
  if (!details || typeof details !== 'object') return String(details).slice(0, 180);
  const secretFragments = ['token', 'password', 'secret', 'recovery', 'connection_link', 'vless', 'cookie'];
  return Object.entries(details)
    .filter(([key, value]) => (
      !secretFragments.some(fragment => key.toLocaleLowerCase('en').includes(fragment))
      && value !== null
      && value !== undefined
      && value !== ''
    ))
    .slice(0, 5)
    .map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`)
    .join(' · ')
    .slice(0, 220);
}

export default function AdminModal({ theme, onClose }) {
  const {
    currentUser,
    setThemeState,
    spinEnabled,
    setSpinEnabled,
    addEnabled,
    setAddEnabled,
    decorationsEnabled,
    setDecorationsEnabled,
    oneOffState,
    setOneOffState,
    oneOffIsSpinning,
    showToast,
    refreshSession,
  } = useApp();
  const dialogRef = useDialogA11y(true, onClose);
  const [activeTab, setActiveTab] = useState('settings');
  const [busySetting, setBusySetting] = useState('');
  const [adminUsers, setAdminUsers] = useState([]);
  const [usersState, setUsersState] = useState('loading');
  const [roleBusyId, setRoleBusyId] = useState(null);
  const [auditEntries, setAuditEntries] = useState([]);
  const [auditState, setAuditState] = useState('loading');
  const [auditCursor, setAuditCursor] = useState(null);

  const loadUsers = useCallback(async () => {
    setUsersState('loading');
    try {
      const data = await readResponse(await fetchAdminUsers());
      setAdminUsers(normalizeAdminUsers(data));
      setUsersState('ready');
    } catch (error) {
      setUsersState('error');
      showToast(error.message || 'Не удалось загрузить пользователей', 'error');
    }
  }, [showToast]);

  const loadAudit = useCallback(async (cursor = null, append = false) => {
    setAuditState(append ? 'loading-more' : 'loading');
    try {
      const data = await readResponse(await fetchAdminAudit({ cursor, limit: 30 }));
      const normalized = normalizeAudit(data);
      setAuditEntries(previous => append ? [...previous, ...normalized.entries] : normalized.entries);
      setAuditCursor(normalized.nextCursor);
      setAuditState('ready');
    } catch (error) {
      setAuditState('error');
      showToast(error.message || 'Не удалось загрузить журнал', 'error');
    }
  }, [showToast]);

  useEffect(() => {
    loadUsers();
    loadAudit();
  }, [loadAudit, loadUsers]);

  const handleSetTheme = async (nextTheme) => {
    const previous = theme;
    setBusySetting('theme');
    setThemeState(nextTheme);
    try {
      await readResponse(await postTheme(nextTheme));
      showToast('Тема обновлена', 'success');
    } catch (error) {
      setThemeState(previous);
      showToast(error.message || 'Не удалось изменить тему', 'error');
    } finally {
      setBusySetting('');
    }
  };

  const updateToggle = async (key, currentValue, setValue, request) => {
    const nextValue = !currentValue;
    setBusySetting(key);
    setValue(nextValue);
    try {
      await readResponse(await request(nextValue));
    } catch (error) {
      setValue(currentValue);
      showToast(error.message || 'Не удалось изменить настройку', 'error');
    } finally {
      setBusySetting('');
    }
  };

  const updateOneOffSettings = async (changes, busyKey) => {
    const previous = oneOffState;
    setBusySetting(busyKey);
    setOneOffState(current => ({ ...current, ...changes }));
    try {
      const nextState = await readResponse(await patchOneOffWheelSettings(changes));
      setOneOffState(nextState);
      showToast(
        changes.enabled === true
          ? 'Разовое колесо опубликовано'
          : changes.enabled === false
            ? 'Разовое колесо скрыто'
            : 'Режим разового колеса обновлён',
        'success'
      );
    } catch (error) {
      setOneOffState(previous);
      showToast(error.message || 'Не удалось изменить разовое колесо', 'error');
    } finally {
      setBusySetting('');
    }
  };

  const handleRoleChange = async (user, role) => {
    if (user.role === role || roleBusyId !== null) return;
    setRoleBusyId(user.id);
    try {
      const data = await readResponse(await updateAdminUserRole(user.id, role));
      const updated = data.user || { ...user, role };
      setAdminUsers(previous => previous.map(item => (
        item.id === user.id ? { ...item, ...updated, role } : item
      )));
      showToast(`${user.name}: ${role === 'admin' ? 'администратор' : 'участник'}`, 'success');
      if (user.id === currentUser?.id) {
        await refreshSession();
      }
      loadAudit();
    } catch (error) {
      showToast(error.message || 'Не удалось изменить роль', 'error');
      await loadUsers();
    } finally {
      setRoleBusyId(null);
    }
  };

  return (
    <div className="admin-modal active" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <section ref={dialogRef} className="admin-modal-content" role="dialog" aria-modal="true" aria-labelledby="admin-modal-title" tabIndex={-1}>
        <button className="admin-modal-close icon-button" type="button" onClick={onClose} aria-label="Закрыть админ-панель">✕</button>
        <h2 id="admin-modal-title" className="admin-modal-title">⚙️ Админ-панель</h2>

        <div className="admin-tabs" role="tablist" aria-label="Разделы админ-панели">
          {[
            ['settings', 'Оформление'],
            ['users', 'Роли'],
            ['audit', 'Журнал'],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={activeTab === key}
              className={activeTab === key ? 'active' : ''}
              onClick={() => setActiveTab(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {activeTab === 'settings' && (
          <div role="tabpanel">
            <div className="theme-selector">
              {themes.map(option => (
                <button
                  type="button"
                  key={option.key}
                  className={`theme-option ${theme === option.key ? 'active' : ''}`}
                  onClick={() => handleSetTheme(option.key)}
                  aria-pressed={theme === option.key}
                  disabled={Boolean(busySetting)}
                >
                  <span className="theme-option-icon">{option.icon}</span>
                  <div className="theme-option-info">
                    <div className="theme-option-name">{option.name}</div>
                    <div className="theme-option-desc">{option.desc}</div>
                  </div>
                  <span className="theme-option-check">✓</span>
                </button>
              ))}
            </div>

            <div className="admin-section">
              <div className="admin-section-title">Управление</div>
              <label className="admin-toggle">
                <input
                  type="checkbox"
                  checked={Boolean(spinEnabled)}
                  disabled={Boolean(busySetting)}
                  onChange={() => updateToggle('spin', spinEnabled, setSpinEnabled, postSpinEnabled)}
                />
                <span className="admin-toggle-slider"></span>
                <span className="admin-toggle-label">Прокрутка колеса</span>
              </label>
              <label className="admin-toggle">
                <input
                  type="checkbox"
                  checked={Boolean(addEnabled)}
                  disabled={Boolean(busySetting)}
                  onChange={() => updateToggle('add', addEnabled, setAddEnabled, postAddEnabled)}
                />
                <span className="admin-toggle-slider"></span>
                <span className="admin-toggle-label">Добавление фильмов</span>
              </label>
              <label className="admin-toggle">
                <input
                  type="checkbox"
                  checked={Boolean(decorationsEnabled)}
                  disabled={Boolean(busySetting)}
                  onChange={() => updateToggle('decorations', decorationsEnabled, setDecorationsEnabled, postDecorationsEnabled)}
                />
                <span className="admin-toggle-slider"></span>
                <span className="admin-toggle-label">Декорации темы</span>
              </label>
              <label className="admin-toggle">
                <input
                  type="checkbox"
                  checked={Boolean(oneOffState.enabled)}
                  disabled={Boolean(busySetting) || oneOffIsSpinning}
                  onChange={() => updateOneOffSettings(
                    { enabled: !oneOffState.enabled },
                    'one-off-enabled'
                  )}
                />
                <span className="admin-toggle-slider"></span>
                <span className="admin-toggle-label">Показать разовое колесо на одну прокрутку</span>
              </label>
            </div>
          </div>
        )}

        {activeTab === 'users' && (
          <div className="admin-users" role="tabpanel">
            <p className="admin-help">Администраторы управляют общей историей, колесом и настройками.</p>
            {usersState === 'loading' && <p className="admin-empty">Загружаем пользователей…</p>}
            {usersState === 'error' && (
              <button className="button-secondary" type="button" onClick={loadUsers}>Повторить</button>
            )}
            {usersState === 'ready' && adminUsers.map(user => (
              <div className="admin-user-row" key={user.id}>
                <div>
                  <strong>{user.name}</strong>
                  <span>{user.id === currentUser?.id ? 'Это вы' : user.role === 'admin' ? 'Администратор' : 'Участник'}</span>
                </div>
                <select
                  value={user.role}
                  disabled={roleBusyId !== null}
                  onChange={event => handleRoleChange(user, event.target.value)}
                  aria-label={`Роль пользователя ${user.name}`}
                >
                  <option value="member">Участник</option>
                  <option value="admin">Администратор</option>
                </select>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'audit' && (
          <div className="admin-audit" role="tabpanel">
            <div className="admin-audit-heading">
              <p className="admin-help">Важные изменения и события безопасности без паролей и секретов.</p>
              <button className="button-ghost" type="button" onClick={() => loadAudit()} disabled={auditState === 'loading'}>
                Обновить
              </button>
            </div>
            {auditState === 'loading' && <p className="admin-empty">Загружаем журнал…</p>}
            {auditState === 'error' && (
              <button className="button-secondary" type="button" onClick={() => loadAudit()}>Повторить</button>
            )}
            {auditState !== 'loading' && auditEntries.length === 0 && (
              <p className="admin-empty">Записей пока нет.</p>
            )}
            <div className="admin-audit-list">
              {auditEntries.map((entry, index) => {
                const action = entry.action || entry.event || 'event';
                const actor = entry.actor_name || entry.user_name || entry.actor?.name || (entry.actor_user_id ? `Пользователь #${entry.actor_user_id}` : 'Система');
                const details = formatAuditDetails(entry);
                return (
                  <article className={`admin-audit-entry ${entry.result === 'failed' || entry.success === false ? 'is-failed' : ''}`} key={entry.id || `${action}-${index}`}>
                    <div>
                      <strong>{actionLabels[action] || action}</strong>
                      <time>{formatAuditDate(entry.created_at || entry.timestamp)}</time>
                    </div>
                    <span>{actor}</span>
                    {details && <small>{details}</small>}
                  </article>
                );
              })}
            </div>
            {auditCursor !== null && auditCursor !== undefined && auditCursor !== '' && (
              <button
                className="button-secondary admin-load-more"
                type="button"
                onClick={() => loadAudit(auditCursor, true)}
                disabled={auditState === 'loading-more'}
              >
                {auditState === 'loading-more' ? 'Загружаем…' : 'Показать ещё'}
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
