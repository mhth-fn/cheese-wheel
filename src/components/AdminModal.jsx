import { postTheme, postSpinEnabled, postAddEnabled, postDecorationsEnabled } from '../api';
import { useApp } from '../App';

const themes = [
  { key: 'cheese', icon: '🧀', name: 'Сырная тема', desc: 'Жёлто-оранжевый дизайн' },
  { key: 'newyear', icon: '🎄', name: 'Новогодняя тема', desc: 'Снег, гирлянды, красно-зелёный' },
  { key: 'spring', icon: '🌸', name: 'Весенняя тема', desc: 'Лепестки, зелёно-розовый дизайн' },
];

export default function AdminModal({ theme, onClose }) {
  const { setThemeState, spinEnabled, setSpinEnabled, addEnabled, setAddEnabled, decorationsEnabled, setDecorationsEnabled } = useApp();

  const handleSetTheme = async (t) => {
    try {
      await postTheme(t);
      setThemeState(t);
    } catch (e) {
      console.error(e);
    }
  };

  const toggleSpin = async () => {
    const val = !spinEnabled;
    setSpinEnabled(val);
    await postSpinEnabled(val);
  };

  const toggleAdd = async () => {
    const val = !addEnabled;
    setAddEnabled(val);
    await postAddEnabled(val);
  };

  const toggleDecorations = async () => {
    const val = !decorationsEnabled;
    setDecorationsEnabled(val);
    await postDecorationsEnabled(val);
  };

  return (
    <div className="admin-modal active" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="admin-modal-content">
        <h2 className="admin-modal-title">⚙️ Админ-панель</h2>
        <div className="theme-selector">
          {themes.map(t => (
            <div
              key={t.key}
              className={`theme-option ${theme === t.key ? 'active' : ''}`}
              onClick={() => handleSetTheme(t.key)}
            >
              <span className="theme-option-icon">{t.icon}</span>
              <div className="theme-option-info">
                <div className="theme-option-name">{t.name}</div>
                <div className="theme-option-desc">{t.desc}</div>
              </div>
              <span className="theme-option-check">✓</span>
            </div>
          ))}
        </div>

        <div className="admin-section">
          <div className="admin-section-title">Управление</div>
          <label className="admin-toggle">
            <input type="checkbox" checked={spinEnabled} onChange={toggleSpin} />
            <span className="admin-toggle-slider"></span>
            <span className="admin-toggle-label">Прокрутка колеса</span>
          </label>
          <label className="admin-toggle">
            <input type="checkbox" checked={addEnabled} onChange={toggleAdd} />
            <span className="admin-toggle-slider"></span>
            <span className="admin-toggle-label">Добавление фильмов</span>
          </label>
          <label className="admin-toggle">
            <input type="checkbox" checked={decorationsEnabled} onChange={toggleDecorations} />
            <span className="admin-toggle-slider"></span>
            <span className="admin-toggle-label">Декорации (снег / лепестки)</span>
          </label>
        </div>
      </div>
    </div>
  );
}
