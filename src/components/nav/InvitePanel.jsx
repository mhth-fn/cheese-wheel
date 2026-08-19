import { useState } from 'react';
import { createInvitation } from '../../api';
import { readResponse } from '../../utils/readResponse';

export default function InvitePanel({ onCancel, showToast }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [invitation, setInvitation] = useState(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async event => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setCopied(false);
    try {
      const data = await readResponse(await createInvitation(name.trim()));
      setInvitation(data.invitation);
      showToast('Ссылка-приглашение создана', 'success');
    } catch (requestError) {
      setError(requestError.message || 'Ошибка сети');
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(invitation.url);
      setCopied(true);
      showToast('Ссылка скопирована', 'success');
    } catch {
      setError('Не удалось скопировать. Выделите ссылку вручную.');
    }
  };

  return (
    <form className="nav-password-form nav-invite-form" onSubmit={handleSubmit}>
      <button className="nav-submenu-back" type="button" onClick={onCancel}>
        ← Назад
      </button>
      <strong>Пригласить участника</strong>
      {!invitation ? (
        <>
          <input
            type="text"
            value={name}
            onChange={event => setName(event.target.value)}
            placeholder="Уникальное имя"
            autoComplete="off"
            minLength={2}
            maxLength={32}
            autoFocus
          />
          <span className="nav-form-hint">Ссылка действует 7 дней и только один раз.</span>
          {error && <span className="nav-pwd-error" role="alert">{error}</span>}
          <button
            type="submit"
            className="nav-dropdown-item nav-pwd-submit"
            disabled={saving || name.trim().length < 2}
          >
            {saving ? 'Создаём…' : 'Создать ссылку'}
          </button>
        </>
      ) : (
        <>
          <span className="nav-form-hint">Отправьте ссылку для {invitation.name}:</span>
          <input
            className="nav-invite-link"
            value={invitation.url}
            readOnly
            aria-label="Ссылка-приглашение"
            onFocus={event => event.target.select()}
          />
          {error && <span className="nav-pwd-error" role="alert">{error}</span>}
          <button
            type="button"
            className="nav-dropdown-item nav-pwd-submit"
            onClick={handleCopy}
          >
            {copied ? 'Скопировано' : 'Скопировать ссылку'}
          </button>
          <button
            type="button"
            className="nav-dropdown-item"
            onClick={() => {
              setInvitation(null);
              setName('');
              setError('');
            }}
          >
            Новое приглашение
          </button>
        </>
      )}
    </form>
  );
}
