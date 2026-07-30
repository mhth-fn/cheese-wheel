export default function WheelThemeIcon({ className, theme }) {
  const isSamurai = theme === 'samurai';
  return (
    <span
      className={`${className}${isSamurai ? ' is-samurai-sun' : ''}`}
      aria-hidden="true"
    >
      {isSamurai ? null : '🧀'}
    </span>
  );
}
