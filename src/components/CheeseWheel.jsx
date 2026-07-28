import { useState, useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import { initAudio, playClick, playWinSound } from '../audio';

const WHEEL_PALETTE = {
  edge: "#D99A25",
  wedges: ["#F6D365", "#F9DA73"],
  divider: "rgba(151, 101, 22, 0.35)",
  text: "#5F4214",
};

function getLabelLayout(title, sectorCount, radius, sliceAngle) {
  const label = title.length > 24 ? `${title.slice(0, 22)}\u2026` : title;
  const textR = radius * (sectorCount <= 4 ? 0.6 : 0.67);
  const sectorWidth = Math.max(
    54,
    2 * textR * Math.sin(Math.min(sliceAngle * 0.38, Math.PI / 3))
  );
  const baseFontSize = sectorCount >= 9 ? 12 : sectorCount >= 7 ? 13 : 15;
  const estimatedWidth = Math.max(1, label.length * baseFontSize * 0.6);
  const fittedFontSize = baseFontSize * Math.min(1, sectorWidth / estimatedWidth);
  const fontSize = Math.max(baseFontSize - 2, fittedFontSize);
  return { label, textR, sectorWidth, fontSize };
}

function traceWheelContour(ctx, cx, cy, radius, rotation, yOffset = 0) {
  const pointCount = 120;
  ctx.beginPath();
  for (let index = 0; index <= pointCount; index += 1) {
    const angle = (index / pointCount) * Math.PI * 2;
    const localAngle = angle - rotation;
    const wobble = (
      Math.sin(localAngle * 5 + 0.7) * 0.55
      + Math.sin(localAngle * 11 + 1.9) * 0.25
      + Math.sin(localAngle * 17 + 0.3) * 0.12
    );
    const x = cx + (radius + wobble) * Math.cos(angle);
    const y = cy + yOffset + (radius + wobble) * Math.sin(angle);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function distanceToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(px - x1, py - y1);
  const amount = Math.max(
    0,
    Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSquared)
  );
  return Math.hypot(px - (x1 + amount * dx), py - (y1 + amount * dy));
}

const CheeseWheel = forwardRef(function CheeseWheel({ movies, onSpinComplete }, ref) {
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
      const targetCount = 2 + Math.floor(rng() * 2);
      const layout = getLabelLayout(movies[s].title, n, radius, sliceAngle);
      const labelAngle = s * sliceAngle + sliceAngle / 2;
      const labelX = layout.textR * Math.cos(labelAngle);
      const labelY = layout.textR * Math.sin(labelAngle);
      let created = 0;
      let attempts = 0;

      while (created < targetCount && attempts < 90) {
        attempts += 1;
        const angleOff = sliceAngle * (0.09 + rng() * 0.82);
        const distFrac = 0.33 + rng() * 0.47;
        const hr = 4 + rng() * 7;
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
        const overlapsDivider = n > 1 && [s * sliceAngle, (s + 1) * sliceAngle].some(
          dividerAngle => distanceToSegment(
            x,
            y,
            0,
            0,
            radius * Math.cos(dividerAngle),
            radius * Math.sin(dividerAngle)
          ) < hr + 5
        );

        if (overlapsLabel || overlapsHole || overlapsDivider) continue;
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

    /* A small downward shadow grounds the wheel without forming a second rim. */
    traceWheelContour(ctx, cx, cy, edgeOuter, rot, 3);
    ctx.fillStyle = "rgba(112, 72, 12, 0.14)";
    ctx.fill();

    /* A single restrained caramel edge keeps the wheel interface-like. */
    traceWheelContour(ctx, cx, cy, edgeOuter, rot);
    ctx.fillStyle = WHEEL_PALETTE.edge;
    ctx.fill();
    ctx.strokeStyle = "rgba(119, 78, 13, 0.18)";
    ctx.lineWidth = 1;
    ctx.stroke();

    /* cheese sectors */
    movies.forEach((m, i) => {
      const startAngle = rot + i * sliceAngle;
      const endAngle = startAngle + sliceAngle;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = WHEEL_PALETTE.wedges[i % WHEEL_PALETTE.wedges.length];
      ctx.fill();
      if (hoveredSectorRef.current === i && !spinningRef.current) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
        ctx.fill();
      }
    });

    ctx.beginPath();
    ctx.arc(cx, cy, r - 0.5, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255, 246, 194, 0.24)";
    ctx.lineWidth = 0.8;
    ctx.stroke();

    /* divider lines */
    if (n > 1) {
      movies.forEach((m, i) => {
        const angle = rot + i * sliceAngle;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
        ctx.strokeStyle = WHEEL_PALETTE.divider;
        ctx.lineWidth = 1;
        ctx.stroke();
      });
    }

    /* cheese holes */
    holesRef.current.forEach(({ sector, angleOff, distFrac, hr }) => {
      const angle = rot + sector * sliceAngle + angleOff;
      const dist = distFrac * r;
      const hx = cx + dist * Math.cos(angle);
      const hy = cy + dist * Math.sin(angle);

      const holeGradient = ctx.createRadialGradient(
        hx - hr * 0.18,
        hy - hr * 0.2,
        hr * 0.08,
        hx,
        hy,
        hr
      );
      holeGradient.addColorStop(0, "rgba(151, 101, 22, 0.2)");
      holeGradient.addColorStop(0.72, "rgba(151, 101, 22, 0.14)");
      holeGradient.addColorStop(1, "rgba(151, 101, 22, 0.06)");

      ctx.beginPath();
      ctx.arc(hx, hy, hr, 0, 2 * Math.PI);
      ctx.fillStyle = holeGradient;
      ctx.fill();
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
      ctx.font = `700 ${fontSize}px 'Nunito', 'Comfortaa', sans-serif`;
      ctx.lineJoin = "round";
      ctx.strokeStyle = WHEEL_PALETTE.wedges[i % WHEEL_PALETTE.wedges.length];
      ctx.lineWidth = 3.5;
      ctx.strokeText(label, 0, 0, sectorWidth);
      ctx.fillStyle = WHEEL_PALETTE.text;
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
