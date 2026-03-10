import { postTheme } from '../api';
import { useApp } from '../App';

const themes = [
  { key: 'cheese', icon: '🧀', name: 'Сырная тема', desc: 'Жёлто-оранжевый дизайн' },
  { key: 'newyear', icon: '🎄', name: 'Новогодняя тема', desc: 'Снег, гирлянды, красно-зелёный' },
  { key: 'spring', icon: '🌸', name: 'Весенняя тема', desc: 'Лепестки, зелёно-розовый дизайн' },
];

export default function AdminModal({ theme, onClose }) {
  const { setThemeState } = useApp();

  const handleSetTheme = async (t) => {
    try {
      await postTheme(t);
      setThemeState(t);
    } catch (e) {
      console.error(e);
    }
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
      </div>
    </div>
  );
}
