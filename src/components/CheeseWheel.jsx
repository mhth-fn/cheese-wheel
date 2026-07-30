import { useState, useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import { initAudio, playClick, playWinSound } from '../audio';

const RIND_THEMES = {
  cheese: {
    outer: "#8B5E20",
    mid: "#E8A020",
    inner: "#D49418",
    marker: "#D43030",
    markerStroke: "#A82020",
  },
  newyear: {
    outer: "#8b0000",
    mid: "#c41e3a",
    inner: "#a01030",
    marker: "#ffd700",
    markerStroke: "#daa520",
  },
  spring: {
    outer: "#2e7d32",
    mid: "#66bb6a",
    inner: "#43a047",
    marker: "#ec407a",
    markerStroke: "#d81b60",
  },
  samurai: {
    outer: "#181714",
    mid: "#9e281c",
    inner: "#34312b",
    marker: "#d9bd73",
    markerStroke: "#6f551e",
  },
};

const WHEEL_PALETTES = {
  cheese: {
    wedges: ["#FFE56A", "#F7D94C", "#F2C94C", "#FFEA7A"],
    divider: "#C89428",
    hole: "#DBA428",
    holeShadow: "#C48E18",
    holeHighlight: "#E8B840",
    label: "#5B3D08",
  },
  samurai: {
    wedges: ["#f2ead8", "#e1d4ba", "#eadfc9", "#d7c8aa"],
    divider: "#675e50",
    hole: "#8f8170",
    holeShadow: "#625b50",
    holeHighlight: "#b7a98e",
    label: "#1c1b18",
  },
};

const CheeseWheel = forwardRef(function CheeseWheel({
  movies,
  onSpinComplete,
  theme = 'cheese',
  respectReducedMotion = true,
}, ref) {
  const canvasRef = useRef(null);
  const [spinning, setSpinning] = useState(false);
  const [pointerTick, setPointerTick] = useState(0);
  const rotRef = useRef(0);
  const spinningRef = useRef(false);
  const hoveredSectorRef = useRef(-1);
  const animationFrameRef = useRef(null);
  const completionTimerRef = useRef(null);

  const seeded = (s) => { let v = s; return () => { v = (v * 16807) % 2147483647; return (v - 1) / 2147483646; }; };

  /* pre-generate holes — regenerate when movie count changes */
  const holesRef = useRef(null);
  const holeCountRef = useRef(0);

  const ensureHoles = useCallback((n) => {
    if (holesRef.current && holeCountRef.current === n) return;
    const rng = seeded(42);
    const holes = [];
    const sliceAngle = (2 * Math.PI) / n;
    for (let s = 0; s < n; s++) {
      const count = 5 + Math.floor(rng() * 3);
      for (let h = 0; h < count; h++) {
        const t = (h + 0.2 + rng() * 0.6) / count;
        const angleOff = t * sliceAngle;
        const distFrac = 0.22 + rng() * 0.62;
        const hr = 4 + rng() * 9;
        holes.push({ sector: s, angleOff, distFrac, hr });
      }
    }
    holesRef.current = holes;
    holeCountRef.current = n;
  }, []);

  const draw = useCallback((ctx, w, h, rot) => {
    const cx = w / 2, cy = h / 2, r = Math.min(cx, cy) - 44;
    ctx.clearRect(0, 0, w, h);

    const n = movies.length;
    if (n === 0) return;
    const sliceAngle = (2 * Math.PI) / n;

    ensureHoles(n);

    const rind = RIND_THEMES[theme] || RIND_THEMES.cheese;
    const palette = WHEEL_PALETTES[theme] || WHEEL_PALETTES.cheese;
    const rindOuter = r + 28;
    const rindMid = r + 16;
    const rindInner = r + 4;

    /* outer dark border */
    ctx.beginPath();
    ctx.arc(cx, cy, rindOuter, 0, 2 * Math.PI);
    ctx.fillStyle = rind.outer;
    ctx.fill();

    /* mid rind */
    ctx.beginPath();
    ctx.arc(cx, cy, rindMid, 0, 2 * Math.PI);
    ctx.fillStyle = rind.mid;
    ctx.fill();

    /* inner rind edge */
    ctx.beginPath();
    ctx.arc(cx, cy, rindInner, 0, 2 * Math.PI);
    ctx.fillStyle = rind.inner;
    ctx.fill();

    /* cheese sectors */
    const wedgeColors = palette.wedges;
    movies.forEach((m, i) => {
      const startAngle = rot + i * sliceAngle;
      const endAngle = startAngle + sliceAngle;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = wedgeColors[i % wedgeColors.length];
      ctx.fill();
      if (hoveredSectorRef.current === i && !spinningRef.current) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.18)";
        ctx.fill();
      }
    });

    /* divider lines */
    if (n > 1) {
      movies.forEach((m, i) => {
        const angle = rot + i * sliceAngle;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
        ctx.strokeStyle = palette.divider;
        ctx.lineWidth = 2.5;
        ctx.stroke();
      });
    }

    /* cheese holes */
    holesRef.current.forEach(({ sector, angleOff, distFrac, hr }) => {
      const angle = rot + sector * sliceAngle + angleOff;
      const dist = distFrac * r;
      const hx = cx + dist * Math.cos(angle);
      const hy = cy + dist * Math.sin(angle);

      ctx.beginPath();
      ctx.arc(hx, hy, hr, 0, 2 * Math.PI);
      ctx.fillStyle = palette.hole;
      ctx.fill();

      /* top shadow crescent */
      ctx.save();
      ctx.beginPath();
      ctx.arc(hx, hy, hr, 0, 2 * Math.PI);
      ctx.clip();
      ctx.beginPath();
      ctx.arc(hx, hy - hr * 0.35, hr * 0.95, 0, 2 * Math.PI);
      ctx.fillStyle = palette.holeShadow;
      ctx.fill();
      ctx.restore();

      /* bottom highlight crescent */
      ctx.save();
      ctx.beginPath();
      ctx.arc(hx, hy, hr, 0, 2 * Math.PI);
      ctx.clip();
      ctx.beginPath();
      ctx.arc(hx, hy + hr * 0.45, hr * 0.85, 0, 2 * Math.PI);
      ctx.fillStyle = palette.holeHighlight;
      ctx.fill();
      ctx.restore();
    });

    /* red triangle markers on rind */
    const markerR = (rindMid + rindOuter) / 2 - 1;
    movies.forEach((m, i) => {
      const angle = rot + i * sliceAngle;
      const mx = cx + markerR * Math.cos(angle);
      const my = cy + markerR * Math.sin(angle);
      const sz = 7;
      ctx.save();
      ctx.translate(mx, my);
      ctx.rotate(angle + Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(0, -sz);
      ctx.lineTo(-sz * 0.7, sz * 0.5);
      ctx.lineTo(sz * 0.7, sz * 0.5);
      ctx.closePath();
      ctx.fillStyle = rind.marker;
      ctx.fill();
      ctx.strokeStyle = rind.markerStroke;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    });

    /* Labels stay upright and shrink to fit their sector. */
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    movies.forEach((m, i) => {
      const midAngle = rot + i * sliceAngle + sliceAngle / 2;
      const label = m.title.length > 24 ? m.title.slice(0, 22) + "\u2026" : m.title;
      const textR = r * (n <= 4 ? 0.6 : 0.67);
      const x = cx + textR * Math.cos(midAngle);
      const y = cy + textR * Math.sin(midAngle);
      const sectorWidth = Math.max(54, 2 * textR * Math.sin(Math.min(sliceAngle * 0.38, Math.PI / 3)));
      const fontSize = Math.max(10, Math.min(16, 190 / Math.max(n, 7), 230 / Math.max(label.length, 8)));
      let rotation = midAngle + Math.PI / 2;
      const normalizedRotation = ((rotation % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      if (normalizedRotation > Math.PI / 2 && normalizedRotation < Math.PI * 1.5) rotation += Math.PI;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rotation);
      ctx.font = `800 ${fontSize}px 'Nunito', 'Comfortaa', sans-serif`;
      ctx.lineJoin = "round";
      ctx.strokeStyle = wedgeColors[i % wedgeColors.length];
      ctx.lineWidth = 4;
      ctx.strokeText(label, 0, 0, sectorWidth);
      ctx.fillStyle = palette.label;
      ctx.fillText(label, 0, 0, sectorWidth);
      ctx.restore();
    });
  }, [movies, theme, ensureHoles]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    draw(ctx, canvas.width, canvas.height, rotRef.current);
  }, [movies, draw]);

  useEffect(() => () => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (completionTimerRef.current !== null) {
      window.clearTimeout(completionTimerRef.current);
      completionTimerRef.current = null;
    }
    spinningRef.current = false;
  }, []);

  useImperativeHandle(ref, () => ({
    spin: (winnerIndex, duration, randomOffset, turns) => {
      doSpin(winnerIndex, duration, randomOffset, turns);
    },
    get isSpinning() { return spinningRef.current; }
  }));

  const doSpin = useCallback((winnerIndex, duration, randomOffset, turns = 16) => {
    if (spinningRef.current || movies.length === 0) return;
    spinningRef.current = true;
    setSpinning(true);

    initAudio();

    const n = movies.length;
    const sliceAngle = (2 * Math.PI) / n;
    const targetSlice = winnerIndex * sliceAngle + sliceAngle * randomOffset;
    const extraSpins = Math.max(10, Math.min(22, turns));
    const startRot = rotRef.current;
    const desiredRotation = -Math.PI / 2 - targetSlice;
    const alignment = ((desiredRotation - (startRot % (2 * Math.PI))) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
    const totalRotation = startRot + Math.PI * 2 * extraSpins + alignment;
    const startTime = performance.now();
    const reducedMotion = (
      respectReducedMotion
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    );
    const dur = reducedMotion ? Math.min(duration * 1000, 900) : duration * 1000;

    const pegCount = Math.max(n * 2, 24);
    const pegAngle = (2 * Math.PI) / pegCount;
    let lastPegIndex = Math.floor(((startRot % (2 * Math.PI)) + 4 * Math.PI) % (2 * Math.PI) / pegAngle);

    const animate = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / dur, 1);
      const windupDuration = reducedMotion ? 0 : Math.min(360, dur * 0.08);
      let currentRot;
      if (windupDuration > 0 && elapsed < windupDuration) {
        const windupProgress = elapsed / windupDuration;
        const windupAngle = Math.min(0.13, sliceAngle * 0.16);
        currentRot = startRot - Math.sin(windupProgress * Math.PI) * windupAngle;
      } else {
        const travelDuration = Math.max(1, dur - windupDuration);
        const travelProgress = Math.min(Math.max((elapsed - windupDuration) / travelDuration, 0), 1);
        const ease = 1 - Math.pow(1 - travelProgress, 3.15);
        currentRot = startRot + (totalRotation - startRot) * ease;
      }

      const canvas = canvasRef.current;
      if (canvas) draw(canvas.getContext("2d"), canvas.width, canvas.height, currentRot);

      const normRot = ((currentRot % (2 * Math.PI)) + 4 * Math.PI) % (2 * Math.PI);
      const currentPeg = Math.floor(normRot / pegAngle);
      if (currentPeg !== lastPegIndex) {
        lastPegIndex = currentPeg;
        setPointerTick(value => value + 1);
        const vol = 0.1 + 0.25 * (1 - progress);
        playClick(vol);
      }

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(animate);
      } else {
        animationFrameRef.current = null;
        const finalRot = currentRot % (2 * Math.PI);
        rotRef.current = finalRot;

        spinningRef.current = false;
        setSpinning(false);

        playWinSound();
        if (onSpinComplete) {
          completionTimerRef.current = window.setTimeout(() => {
            completionTimerRef.current = null;
            onSpinComplete(movies[winnerIndex]);
          }, reducedMotion ? 80 : 400);
        }
      }
    };
    animationFrameRef.current = requestAnimationFrame(animate);
  }, [movies, draw, onSpinComplete, respectReducedMotion]);

  const updateHoveredSector = (event) => {
    if (spinningRef.current || movies.length === 0) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) * (canvas.width / rect.width);
    const y = (event.clientY - rect.top) * (canvas.height / rect.height);
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const radius = Math.min(cx, cy) - 44;
    if (Math.hypot(x - cx, y - cy) > radius) {
      hoveredSectorRef.current = -1;
    } else {
      const angle = Math.atan2(y - cy, x - cx);
      const sliceAngle = (2 * Math.PI) / movies.length;
      const relative = ((angle - rotRef.current) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
      hoveredSectorRef.current = Math.floor(relative / sliceAngle);
    }
    draw(canvas.getContext('2d'), canvas.width, canvas.height, rotRef.current);
  };

  const clearHoveredSector = () => {
    hoveredSectorRef.current = -1;
    const canvas = canvasRef.current;
    if (canvas) draw(canvas.getContext('2d'), canvas.width, canvas.height, rotRef.current);
  };

  return (
    <div className={`cheese-wheel-stage ${spinning ? 'is-spinning' : ''}`}>
      <canvas
        ref={canvasRef}
        width={500}
        height={500}
        onMouseMove={updateHoveredSector}
        onMouseLeave={clearHoveredSector}
        aria-label={`Сырное колесо. Фильмы: ${movies.map(movie => movie.title).join(', ')}`}
      />
      <div key={pointerTick} className="wheel-pointer bounce" aria-hidden="true" />
    </div>
  );
});

export default CheeseWheel;
