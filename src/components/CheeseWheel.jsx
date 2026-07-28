import { useState, useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import { initAudio, playClick, playWinSound } from '../audio';

const WHEEL_THEMES = {
  cheese: {
    edge: ["#FFD966", "#F5B636", "#E89A1D"],
    wedges: ["#FFE98A", "#FBE071", "#FFD966", "#F6D158", "#FFE580"],
  },
  newyear: {
    edge: ["#FFDB72", "#F1B63C", "#DC911E"],
    wedges: ["#FFF0A0", "#F9E17A", "#FFDD68", "#F4D15D"],
  },
  spring: {
    edge: ["#FFDE75", "#F3B943", "#DF9525"],
    wedges: ["#FFF09C", "#FCE27D", "#FFDE6F", "#F5D667"],
  },
};

function getLabelLayout(title, sectorCount, radius, sliceAngle) {
  const label = title.length > 24 ? `${title.slice(0, 22)}\u2026` : title;
  const textR = radius * (sectorCount <= 4 ? 0.6 : 0.67);
  const sectorWidth = Math.max(
    54,
    2 * textR * Math.sin(Math.min(sliceAngle * 0.38, Math.PI / 3))
  );
  const fontSize = Math.max(
    10,
    Math.min(16, 190 / Math.max(sectorCount, 7), 230 / Math.max(label.length, 8))
  );
  return { label, textR, sectorWidth, fontSize };
}

function traceWheelContour(ctx, cx, cy, radius, rotation, yOffset = 0) {
  const pointCount = 120;
  ctx.beginPath();
  for (let index = 0; index <= pointCount; index += 1) {
    const angle = (index / pointCount) * Math.PI * 2;
    const localAngle = angle - rotation;
    const wobble = (
      Math.sin(localAngle * 5 + 0.7) * 1.05
      + Math.sin(localAngle * 11 + 1.9) * 0.62
      + Math.sin(localAngle * 17 + 0.3) * 0.28
    );
    const x = cx + (radius + wobble) * Math.cos(angle);
    const y = cy + yOffset + (radius + wobble) * Math.sin(angle);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

const CheeseWheel = forwardRef(function CheeseWheel({ movies, onSpinComplete, theme = 'cheese' }, ref) {
  const canvasRef = useRef(null);
  const [spinning, setSpinning] = useState(false);
  const [pointerTick, setPointerTick] = useState(0);
  const rotRef = useRef(0);
  const spinningRef = useRef(false);
  const hoveredSectorRef = useRef(-1);

  const seeded = (s) => { let v = s; return () => { v = (v * 16807) % 2147483647; return (v - 1) / 2147483646; }; };

  /* pre-generate holes — regenerate when movie count changes */
  const holesRef = useRef(null);
  const holeSignatureRef = useRef('');

  const ensureHoles = useCallback((n, radius) => {
    const signature = movies.map(movie => `${movie.id}:${movie.title}`).join('|');
    if (holesRef.current && holeSignatureRef.current === signature) return;
    const rng = seeded(42 + n * 97);
    const holes = [];
    const sliceAngle = (2 * Math.PI) / n;
    for (let s = 0; s < n; s++) {
      const targetCount = 5 + Math.floor(rng() * 3);
      const layout = getLabelLayout(movies[s].title, n, radius, sliceAngle);
      const labelAngle = s * sliceAngle + sliceAngle / 2;
      const labelX = layout.textR * Math.cos(labelAngle);
      const labelY = layout.textR * Math.sin(labelAngle);
      let created = 0;
      let attempts = 0;

      while (created < targetCount && attempts < 90) {
        attempts += 1;
        const angleOff = sliceAngle * (0.09 + rng() * 0.82);
        const distFrac = 0.31 + rng() * 0.51;
        const hr = 4 + rng() * 10;
        const absoluteAngle = s * sliceAngle + angleOff;
        const x = radius * distFrac * Math.cos(absoluteAngle);
        const y = radius * distFrac * Math.sin(absoluteAngle);
        const dx = x - labelX;
        const dy = y - labelY;
        const radialOffset = dx * Math.cos(labelAngle) + dy * Math.sin(labelAngle);
        const tangentOffset = dx * Math.cos(labelAngle + Math.PI / 2)
          + dy * Math.sin(labelAngle + Math.PI / 2);
        const overlapsLabel = (
          Math.abs(tangentOffset) < layout.sectorWidth / 2 + hr + 7
          && Math.abs(radialOffset) < layout.fontSize * 0.8 + hr + 5
        );
        const overlapsHole = holes.some(hole => {
          const holeAngle = hole.sector * sliceAngle + hole.angleOff;
          const holeX = radius * hole.distFrac * Math.cos(holeAngle);
          const holeY = radius * hole.distFrac * Math.sin(holeAngle);
          return Math.hypot(x - holeX, y - holeY) < hr + hole.hr + 5;
        });

        if (overlapsLabel || overlapsHole) continue;
        holes.push({ sector: s, angleOff, distFrac, hr });
        created += 1;
      }
    }
    holesRef.current = holes;
    holeSignatureRef.current = signature;
  }, [movies]);

  const draw = useCallback((ctx, w, h, rot) => {
    const cx = w / 2;
    const cy = h / 2;
    const edgeOuter = Math.min(cx, cy) - 16;
    const edgeWidth = 13;
    const r = edgeOuter - edgeWidth;
    ctx.clearRect(0, 0, w, h);

    const n = movies.length;
    if (n === 0) return;
    const sliceAngle = (2 * Math.PI) / n;

    ensureHoles(n, r);

    const wheelTheme = WHEEL_THEMES[theme] || WHEEL_THEMES.cheese;

    /* A small downward shadow grounds the wheel without forming a second rim. */
    traceWheelContour(ctx, cx, cy, edgeOuter, rot, 5);
    ctx.fillStyle = "rgba(132, 77, 5, 0.18)";
    ctx.fill();

    /* One softly irregular orange-yellow cheese edge. */
    traceWheelContour(ctx, cx, cy, edgeOuter, rot);
    const edgeGradient = ctx.createLinearGradient(
      cx - edgeOuter,
      cy - edgeOuter,
      cx + edgeOuter,
      cy + edgeOuter
    );
    edgeGradient.addColorStop(0, wheelTheme.edge[0]);
    edgeGradient.addColorStop(0.52, wheelTheme.edge[1]);
    edgeGradient.addColorStop(1, wheelTheme.edge[2]);
    ctx.fillStyle = edgeGradient;
    ctx.fill();
    ctx.strokeStyle = "rgba(151, 87, 5, 0.22)";
    ctx.lineWidth = 1.2;
    ctx.stroke();

    /* cheese sectors */
    movies.forEach((m, i) => {
      const startAngle = rot + i * sliceAngle;
      const endAngle = startAngle + sliceAngle;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = wheelTheme.wedges[i % wheelTheme.wedges.length];
      ctx.fill();
      if (hoveredSectorRef.current === i && !spinningRef.current) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
        ctx.fill();
      }
    });

    ctx.beginPath();
    ctx.arc(cx, cy, r - 0.5, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255, 248, 190, 0.38)";
    ctx.lineWidth = 1.1;
    ctx.stroke();

    /* divider lines */
    if (n > 1) {
      movies.forEach((m, i) => {
        const angle = rot + i * sliceAngle;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
        ctx.strokeStyle = "rgba(139, 88, 13, 0.28)";
        ctx.lineWidth = 1.2;
        ctx.stroke();
      });
    }

    /* cheese holes */
    holesRef.current.forEach(({ sector, angleOff, distFrac, hr }) => {
      const angle = rot + sector * sliceAngle + angleOff;
      const dist = distFrac * r;
      const hx = cx + dist * Math.cos(angle);
      const hy = cy + dist * Math.sin(angle);

      const holeGradient = ctx.createLinearGradient(
        hx - hr * 0.7,
        hy - hr * 0.7,
        hx + hr * 0.7,
        hy + hr * 0.7
      );
      holeGradient.addColorStop(0, "#F6D366");
      holeGradient.addColorStop(0.35, "#DEA62D");
      holeGradient.addColorStop(1, "#B87513");

      ctx.beginPath();
      ctx.arc(hx, hy, hr, 0, 2 * Math.PI);
      ctx.fillStyle = holeGradient;
      ctx.fill();

      /* Every hole follows the same top-left light direction. */
      ctx.beginPath();
      ctx.arc(hx, hy, Math.max(1, hr - 0.8), Math.PI, Math.PI * 1.5);
      ctx.strokeStyle = "rgba(255, 244, 164, 0.62)";
      ctx.lineWidth = Math.max(1, hr * 0.13);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(hx, hy, Math.max(1, hr - 0.8), 0, Math.PI * 0.5);
      ctx.strokeStyle = "rgba(91, 50, 3, 0.24)";
      ctx.lineWidth = Math.max(1, hr * 0.16);
      ctx.stroke();
    });

    /* Labels stay upright and shrink to fit their sector. */
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    movies.forEach((m, i) => {
      const midAngle = rot + i * sliceAngle + sliceAngle / 2;
      const { label, textR, sectorWidth, fontSize } = getLabelLayout(
        m.title,
        n,
        r,
        sliceAngle
      );
      const x = cx + textR * Math.cos(midAngle);
      const y = cy + textR * Math.sin(midAngle);
      let rotation = midAngle + Math.PI / 2;
      const normalizedRotation = ((rotation % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      if (normalizedRotation > Math.PI / 2 && normalizedRotation < Math.PI * 1.5) rotation += Math.PI;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rotation);
      ctx.font = `800 ${fontSize}px 'Nunito', 'Comfortaa', sans-serif`;
      ctx.lineJoin = "round";
      ctx.strokeStyle = wheelTheme.wedges[i % wheelTheme.wedges.length];
      ctx.lineWidth = 4.5;
      ctx.strokeText(label, 0, 0, sectorWidth);
      ctx.fillStyle = "#5B3D08";
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
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
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
        requestAnimationFrame(animate);
      } else {
        const finalRot = currentRot % (2 * Math.PI);
        rotRef.current = finalRot;

        spinningRef.current = false;
        setSpinning(false);

        playWinSound();
        if (onSpinComplete) {
          setTimeout(() => onSpinComplete(movies[winnerIndex]), reducedMotion ? 80 : 400);
        }
      }
    };
    requestAnimationFrame(animate);
  }, [movies, draw, onSpinComplete]);

  const updateHoveredSector = (event) => {
    if (spinningRef.current || movies.length === 0) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) * (canvas.width / rect.width);
    const y = (event.clientY - rect.top) * (canvas.height / rect.height);
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const radius = Math.min(cx, cy) - 29;
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
