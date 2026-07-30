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

function generateSamuraiPetals() {
  return Array.from({ length: 32 }, (_, id) => {
    const direction = Math.random() > 0.5 ? 1 : -1;
    return {
      id,
      left: `${Math.random() * 100}%`,
      size: `${Math.random() * 7 + 7}px`,
      duration: `${Math.random() * 9 + 10}s`,
      delay: `-${Math.random() * 18}s`,
      sway: `${direction * (Math.random() * 35 + 16)}px`,
      drift: `${direction * (Math.random() * 48 + 22)}px`,
      returnDrift: `${direction * -(Math.random() * 24 + 10)}px`,
      rotation: `${Math.random() * 180 - 90}deg`,
      opacity: Math.random() * 0.36 + 0.42,
      blur: `${Math.random() > 0.78 ? 0.7 : 0}px`,
    };
  });
}

export default function ThemeDecorations({ theme }) {
  const snowflakes = useMemo(generateSnowflakes, []);
  const lights = useMemo(generateLights, []);
  const petals = useMemo(generatePetals, []);
  const samuraiMarks = useMemo(generateSamuraiMarks, []);
  const samuraiPetals = useMemo(generateSamuraiPetals, []);

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
          <div className="samurai-petals">
            {samuraiPetals.map(petal => (
              <i
                key={petal.id}
                className="samurai-petal"
                style={{
                  '--petal-left': petal.left,
                  '--petal-size': petal.size,
                  '--petal-duration': petal.duration,
                  '--petal-delay': petal.delay,
                  '--petal-sway': petal.sway,
                  '--petal-drift': petal.drift,
                  '--petal-return': petal.returnDrift,
                  '--petal-rotation': petal.rotation,
                  '--petal-opacity': petal.opacity,
                  '--petal-blur': petal.blur,
                }}
              />
            ))}
          </div>
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
