import { useState } from 'react';
import { changePassword } from '../../api';
import { readResponse } from '../../utils/readResponse';

export default function PasswordPanel({
  onCancel,
  onComplete,
  showToast,
  userId,
}) {
  const [confirmPassword, setConfirmPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [error, setError] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async event => {
    event.preventDefault();
    setError('');
    if (newPassword.length < 8) {
      setError('Минимум 8 символов');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Пароли не совпадают');
      return;
    }

    setSaving(true);
    try {
      await readResponse(
        await changePassword(userId, currentPassword, newPassword)
      );
      showToast('Пароль изменён', 'success');
      onComplete();
    } catch (requestError) {
      setError(requestError.message || 'Ошибка сети');
      setSaving(false);
    }
  };

  return (
    <form className="nav-password-form" onSubmit={handleSubmit}>
      <button className="nav-submenu-back" type="button" onClick={onCancel}>
        ← Назад
      </button>
      <strong>Новый пароль</strong>
      <input
        type="password"
        placeholder="Текущий пароль"
        value={currentPassword}
        onChange={event => setCurrentPassword(event.target.value)}
        autoComplete="current-password"
        aria-label="Текущий пароль"
        autoFocus
      />
      <input
        type="password"
        placeholder="Новый пароль"
        value={newPassword}
        onChange={event => setNewPassword(event.target.value)}
        autoComplete="new-password"
        aria-label="Новый пароль"
      />
      <input
        type="password"
        placeholder="Подтвердите пароль"
        value={confirmPassword}
        onChange={event => setConfirmPassword(event.target.value)}
        autoComplete="new-password"
        aria-label="Подтверждение нового пароля"
      />
      {error && <span className="nav-pwd-error">{error}</span>}
      <button
        type="submit"
        className="nav-dropdown-item nav-pwd-submit"
        disabled={saving}
      >
        {saving ? 'Сохраняем…' : 'Сохранить'}
      </button>
    </form>
  );
}
