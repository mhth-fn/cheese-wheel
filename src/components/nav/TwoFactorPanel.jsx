import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  disableTwoFactor,
  enableTwoFactor,
  fetchTwoFactorStatus,
  regenerateRecoveryCodes,
  setupTwoFactor,
} from '../../api';
import { readResponse } from '../../utils/readResponse';

function getRecoveryCodes(data) {
  const codes = data?.recovery_codes || data?.recoveryCodes || [];
  return Array.isArray(codes) ? codes : [];
}

export default function TwoFactorPanel({ onBack, showToast }) {
  const [enabled, setEnabled] = useState(false);
  const [error, setError] = useState('');
  const [password, setPassword] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState([]);
  const [securityCode, setSecurityCode] = useState('');
  const [setupData, setSetupData] = useState(null);
  const [state, setState] = useState('loading');
  const [step, setStep] = useState('status');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await readResponse(await fetchTwoFactorStatus());
        if (!active) return;
        setEnabled(Boolean(
          data.enabled ?? data.two_factor_enabled ?? data.twoFactorEnabled
        ));
        setState('ready');
      } catch (requestError) {
        if (!active) return;
        setError(requestError.message || 'Не удалось загрузить настройки');
        setState('error');
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const resetInputs = () => {
    setPassword('');
    setSecurityCode('');
    setError('');
    setRecoveryCodes([]);
  };

  const startSetup = () => {
    resetInputs();
    setSetupData(null);
    setStep('setup-password');
  };

  const openSensitiveAction = nextStep => {
    resetInputs();
    setStep(nextStep);
  };

  const handleSetup = async event => {
    event.preventDefault();
    if (!password || state === 'saving') return;
    setState('saving');
    setError('');
    try {
      const data = await readResponse(await setupTwoFactor(password));
      const otpAuthUri = data.otpauth_uri || data.otpauth_url || data.otpauthUri;
      const qrDataUrl = otpAuthUri
        ? await QRCode.toDataURL(otpAuthUri, {
            errorCorrectionLevel: 'M',
            margin: 1,
            width: 240,
          })
        : null;
      setSetupData({ ...data, qr_data_url: qrDataUrl });
      setPassword('');
      setSecurityCode('');
      setStep('setup-code');
      setState('ready');
    } catch (requestError) {
      setError(requestError.message || 'Не удалось начать настройку');
      setState('ready');
    }
  };

  const handleEnable = async event => {
    event.preventDefault();
    if (!securityCode.trim() || state === 'saving') return;
    setState('saving');
    setError('');
    try {
      const data = await readResponse(await enableTwoFactor(securityCode.trim()));
      const codes = getRecoveryCodes(data);
      setRecoveryCodes(codes);
      setEnabled(true);
      setSecurityCode('');
      setSetupData(null);
      setStep(codes.length ? 'recovery-display' : 'status');
      setState('ready');
      showToast('Двухфакторная защита включена', 'success');
    } catch (requestError) {
      setError(requestError.message || 'Неверный код');
      setSecurityCode('');
      setState('ready');
    }
  };

  const handleDisable = async event => {
    event.preventDefault();
    if (!password || !securityCode.trim() || state === 'saving') return;
    setState('saving');
    setError('');
    try {
      await readResponse(await disableTwoFactor(password, securityCode.trim()));
      setEnabled(false);
      setStep('status');
      setPassword('');
      setSecurityCode('');
      setState('ready');
      showToast('Двухфакторная защита отключена', 'info');
    } catch (requestError) {
      setError(requestError.message || 'Не удалось отключить защиту');
      setSecurityCode('');
      setState('ready');
    }
  };

  const handleRegenerate = async event => {
    event.preventDefault();
    if (!password || !securityCode.trim() || state === 'saving') return;
    setState('saving');
    setError('');
    try {
      const data = await readResponse(
        await regenerateRecoveryCodes(password, securityCode.trim())
      );
      setRecoveryCodes(getRecoveryCodes(data));
      setPassword('');
      setSecurityCode('');
      setStep('recovery-display');
      setState('ready');
      showToast('Резервные коды обновлены', 'success');
    } catch (requestError) {
      setError(requestError.message || 'Не удалось обновить коды');
      setSecurityCode('');
      setState('ready');
    }
  };

  const setupQr = (
    setupData?.qr_data_url || setupData?.qrCode || setupData?.qr_code || null
  );
  const setupSecret = (
    setupData?.secret || setupData?.manual_key || setupData?.manualKey || ''
  );

  return (
    <div className="nav-security-panel">
      <button className="nav-submenu-back" type="button" onClick={onBack}>
        ← Назад
      </button>
      <div className="nav-security-heading">
        <strong>Двухфакторная защита</strong>
        {state !== 'loading' && (
          <span className={enabled ? 'is-enabled' : ''}>
            {enabled ? 'Включена' : 'Выключена'}
          </span>
        )}
      </div>

      {state === 'loading' && (
        <p className="nav-security-note">Проверяем настройки…</p>
      )}

      {step === 'status' && state !== 'loading' && (
        <>
          <p className="nav-security-note">
            Код из приложения защищает аккаунт, даже если пароль станет известен.
          </p>
          {!enabled ? (
            <button className="button-primary" type="button" onClick={startSetup}>
              Настроить
            </button>
          ) : (
            <div className="nav-security-actions">
              <button
                className="button-secondary"
                type="button"
                onClick={() => openSensitiveAction('regenerate')}
              >
                Новые резервные коды
              </button>
              <button
                className="button-ghost danger"
                type="button"
                onClick={() => openSensitiveAction('disable')}
              >
                Отключить
              </button>
            </div>
          )}
        </>
      )}

      {step === 'setup-password' && (
        <form className="nav-security-form" onSubmit={handleSetup}>
          <p className="nav-security-note">Подтвердите текущий пароль.</p>
          <input
            type="password"
            placeholder="Текущий пароль"
            value={password}
            onChange={event => setPassword(event.target.value)}
            autoComplete="current-password"
            aria-label="Текущий пароль"
            autoFocus
          />
          <button
            className="button-primary"
            type="submit"
            disabled={!password || state === 'saving'}
          >
            {state === 'saving' ? 'Проверяем…' : 'Продолжить'}
          </button>
        </form>
      )}

      {step === 'setup-code' && (
        <form className="nav-security-form" onSubmit={handleEnable}>
          <p className="nav-security-note">
            Добавьте аккаунт в приложение-аутентификатор.
          </p>
          {setupQr && (
            <img
              className="nav-two-factor-qr"
              src={setupQr}
              alt="QR-код для приложения-аутентификатора"
            />
          )}
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
          <button
            className="button-primary"
            type="submit"
            disabled={!securityCode.trim() || state === 'saving'}
          >
            {state === 'saving' ? 'Включаем…' : 'Проверить и включить'}
          </button>
        </form>
      )}

      {(step === 'disable' || step === 'regenerate') && (
        <form
          className="nav-security-form"
          onSubmit={step === 'disable' ? handleDisable : handleRegenerate}
        >
          <p className="nav-security-note">
            Для подтверждения нужны пароль и актуальный код из приложения.
          </p>
          <input
            type="password"
            placeholder="Текущий пароль"
            value={password}
            onChange={event => setPassword(event.target.value)}
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
            inputMode={step === 'disable' ? 'text' : 'numeric'}
            aria-label="Код подтверждения"
          />
          <button
            className={step === 'disable' ? 'button-danger' : 'button-primary'}
            type="submit"
            disabled={!password || !securityCode.trim() || state === 'saving'}
          >
            {state === 'saving'
              ? 'Подтверждаем…'
              : step === 'disable'
                ? 'Отключить защиту'
                : 'Создать новые коды'}
          </button>
        </form>
      )}

      {step === 'recovery-display' && (
        <div className="nav-recovery-codes">
          <p>
            <strong>Сохраните резервные коды сейчас.</strong>{' '}
            Каждый сработает только один раз.
          </p>
          {recoveryCodes.length > 0 ? (
            <div className="nav-recovery-grid">
              {recoveryCodes.map(code => <code key={code}>{code}</code>)}
            </div>
          ) : (
            <p className="nav-security-note">Сервер не вернул новые коды.</p>
          )}
          <button
            className="button-primary"
            type="button"
            onClick={() => setStep('status')}
          >
            Я сохранил коды
          </button>
        </div>
      )}

      {error && <p className="nav-pwd-error" role="alert">{error}</p>}
    </div>
  );
}
