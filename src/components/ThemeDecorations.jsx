import { useMemo } from 'react';

const snowflakeChars = ['❄', '❅', '❆', '✻', '✼', '❉', '∗'];
const petalChars = ['🌸', '🌺', '🌷', '🌼', '💮', '✿', '❀'];

function generateSnowflakes() {
  return Array.from({ length: 50 }, (_, i) => ({
    id: i,
    char: snowflakeChars[Math.floor(Math.random() * snowflakeChars.length)],
    left: Math.random() * 100 + '%',
    fontSize: (Math.random() * 1 + 0.5) + 'rem',
    duration: (Math.random() * 5 + 5) + 's',
    delay: (Math.random() * 10) + 's',
    opacity: Math.random() * 0.5 + 0.5,
  }));
}

function generateLights() {
  return Array.from({ length: 40 }, (_, i) => ({
    id: i,
    left: Math.random() * 100 + '%',
    top: Math.random() * 100 + '%',
    delay: (Math.random() * 2) + 's',
  }));
}

function generatePetals() {
  return Array.from({ length: 40 }, (_, i) => ({
    id: i,
    char: petalChars[Math.floor(Math.random() * petalChars.length)],
    left: Math.random() * 100 + '%',
    fontSize: (Math.random() * 0.8 + 0.8) + 'rem',
    duration: (Math.random() * 8 + 7) + 's',
    delay: (Math.random() * 12) + 's',
    opacity: Math.random() * 0.4 + 0.4,
  }));
}

function generateSamuraiMarks() {
  const positions = [
    ['5%', '18%', '-28deg', 0.82],
    ['76%', '8%', '17deg', 1.08],
    ['84%', '68%', '-18deg', 0.9],
    ['8%', '76%', '24deg', 1],
    ['43%', '88%', '-9deg', 0.74],
  ];
  return positions.map(([left, top, rotation, scale], id) => ({
    id,
    left,
    top,
    rotation,
    scale,
  }));
}

export default function ThemeDecorations({ theme }) {
  const snowflakes = useMemo(generateSnowflakes, []);
  const lights = useMemo(generateLights, []);
  const petals = useMemo(generatePetals, []);
  const samuraiMarks = useMemo(generateSamuraiMarks, []);

  return (
    <>
      {theme === 'newyear' && (
        <>
          <div className="snowflakes">
            {snowflakes.map(s => (
              <div
                key={s.id}
                className="snowflake"
                style={{
                  left: s.left,
                  fontSize: s.fontSize,
                  animationDuration: s.duration,
                  animationDelay: s.delay,
                  opacity: s.opacity,
                }}
              >
                {s.char}
              </div>
            ))}
          </div>
          <div className="garland">
            <div className="garland-lights">
              {lights.map(l => (
                <div
                  key={l.id}
                  className="light"
                  style={{ left: l.left, top: l.top, animationDelay: l.delay }}
                />
              ))}
            </div>
          </div>
        </>
      )}
      {theme === 'spring' && (
        <div className="petals">
          {petals.map(p => (
            <div
              key={p.id}
              className="petal"
              style={{
                left: p.left,
                fontSize: p.fontSize,
                animationDuration: p.duration,
                animationDelay: p.delay,
                opacity: p.opacity,
              }}
            >
              {p.char}
            </div>
          ))}
        </div>
      )}
      {theme === 'samurai' && (
        <div className="samurai-atmosphere" aria-hidden="true">
          <div className="samurai-sun" />
          <div className="samurai-brush-mark mark-one" />
          <div className="samurai-brush-mark mark-two" />
          {samuraiMarks.map(mark => (
            <div
              key={mark.id}
              className="samurai-katana"
              style={{
                '--katana-left': mark.left,
                '--katana-top': mark.top,
                '--katana-rotation': mark.rotation,
                '--katana-scale': mark.scale,
              }}
            >
              <span className="samurai-katana-guard" />
            </div>
          ))}
          <div className="samurai-seal">侍</div>
        </div>
      )}
    </>
  );
}
