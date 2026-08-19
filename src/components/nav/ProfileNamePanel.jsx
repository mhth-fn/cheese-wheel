import { useState } from 'react';
import { changeUserName } from '../../api';
import { readResponse } from '../../utils/readResponse';

export default function ProfileNamePanel({
  currentName,
  onCancel,
  onComplete,
  showToast,
  userId,
}) {
  const [error, setError] = useState('');
  const [name, setName] = useState(currentName || '');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async event => {
    event.preventDefault();
    const trimmedName = name.trim();
    if (saving || trimmedName === currentName) return;
    setSaving(true);
    setError('');
    try {
      const data = await readResponse(await changeUserName(userId, trimmedName));
      showToast('Имя изменено', 'success');
      await onComplete(data.user);
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
      <strong>Новое имя</strong>
      <input
        type="text"
        value={name}
        onChange={event => setName(event.target.value)}
        autoComplete="username"
        aria-label="Новое имя"
        minLength={2}
        maxLength={32}
        autoFocus
      />
      <span className="nav-form-hint">От 2 до 32 символов. Это же имя будет логином.</span>
      {error && <span className="nav-pwd-error" role="alert">{error}</span>}
      <button
        type="submit"
        className="nav-dropdown-item nav-pwd-submit"
        disabled={saving || name.trim().length < 2 || name.trim() === currentName}
      >
        {saving ? 'Сохраняем…' : 'Сохранить'}
      </button>
    </form>
  );
}
