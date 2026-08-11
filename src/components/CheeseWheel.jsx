import { useState, useRef, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import {
  initAudio,
  playBrakeSound,
  playClick,
  playEliminationSound,
  playRecoilSound,
  playSpinLaunch,
  playWinSound,
} from '../audio';
import { createSpinPlan, sampleSpinPlan } from '../features/wheel/spinMotion.mjs';

const RIND_THEMES = {
  cheese: {
    outer: "#8B5E20",
    mid: "#E8A020",
    inner: "#D49418",
    marker: "#D43030",
    markerStroke: "#A82020",
  },
  seraphim: {
    outer: "#4b2c09",
    mid: "#a9690d",
    inner: "#e0a128",
    marker: "#e8b739",
    markerStroke: "#76500a",
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
    mid: "#c9ab6c",
    inner: "#641812",
    marker: "#f4dfb3",
    markerStroke: "#6d1a14",
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
  seraphim: {
    wedges: ["#efb63a", "#dd951f", "#f4c54d", "#e8a72c"],
    divider: "rgba(103, 57, 7, 0.78)",
    hole: "#70400a",
    holeShadow: "#2b1704",
    holeHighlight: "#f0c35c",
    label: "#3b2308",
    labelStroke: "rgba(249, 207, 105, 0.68)",
  },
  samurai: {
    wedges: ["#a92920", "#b73329", "#98231c", "#c13b2f"],
    divider: "rgba(255, 237, 211, 0.32)",
    label: "#fff4df",
    labelStroke: "rgba(77, 13, 10, 0.78)",
  },
};

function drawSamuraiSunTexture(ctx, cx, cy, radius, rotation, movieCount) {
  let seed = 9173 + movieCount * 97;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
  ctx.clip();

  const shade = ctx.createRadialGradient(
    cx - radius * 0.24,
    cy - radius * 0.28,
    radius * 0.04,
    cx,
    cy,
    radius
  );
  shade.addColorStop(0, "rgba(255, 233, 207, 0.11)");
  shade.addColorStop(0.52, "rgba(118, 15, 11, 0.02)");
  shade.addColorStop(1, "rgba(48, 6, 5, 0.22)");
  ctx.fillStyle = shade;
  ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);

  ctx.translate(cx, cy);
  ctx.rotate(rotation);
  for (let index = 0; index < 68; index++) {
    const angle = random() * Math.PI * 2;
    const distance = Math.sqrt(random()) * radius * 0.94;
    const x = Math.cos(angle) * distance;
    const y = Math.sin(angle) * distance;
    const length = 8 + random() * 34;
    const bend = (random() - 0.5) * 7;
    ctx.beginPath();
    ctx.moveTo(x - length / 2, y);
    ctx.quadraticCurveTo(x, y + bend, x + length / 2, y + bend * 0.25);
    ctx.strokeStyle = index % 4 === 0
      ? `rgba(255, 230, 205, ${0.025 + random() * 0.055})`
      : `rgba(55, 8, 7, ${0.018 + random() * 0.04})`;
    ctx.lineWidth = 0.5 + random() * 1.2;
    ctx.lineCap = "round";
    ctx.stroke();
  }
  ctx.restore();
}

function drawSeraphimCheeseTexture(ctx, cx, cy, radius, rotation, movieCount) {
  let seed = 6143 + movieCount * 131;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
  ctx.clip();

  const cheeseLight = ctx.createRadialGradient(
    cx - radius * 0.3,
    cy - radius * 0.34,
    radius * 0.04,
    cx,
    cy,
    radius
  );
  cheeseLight.addColorStop(0, "rgba(255, 238, 147, 0.46)");
  cheeseLight.addColorStop(0.42, "rgba(255, 202, 65, 0.08)");
  cheeseLight.addColorStop(0.78, "rgba(110, 54, 4, 0.06)");
  cheeseLight.addColorStop(1, "rgba(73, 32, 2, 0.3)");
  ctx.fillStyle = cheeseLight;
  ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);

  ctx.translate(cx, cy);
  ctx.rotate(rotation);
  for (let index = 0; index < 110; index++) {
    const angle = random() * Math.PI * 2;
    const distance = Math.sqrt(random()) * radius * 0.93;
    const x = Math.cos(angle) * distance;
    const y = Math.sin(angle) * distance;
    const length = 3 + random() * 19;
    ctx.beginPath();
    ctx.moveTo(x - length / 2, y);
    ctx.quadraticCurveTo(
      x,
      y + (random() - 0.5) * 3,
      x + length / 2,
      y + (random() - 0.5) * 2
    );
    ctx.strokeStyle = index % 4 === 0
      ? `rgba(255, 229, 128, ${0.045 + random() * 0.08})`
      : `rgba(100, 49, 4, ${0.03 + random() * 0.075})`;
    ctx.lineWidth = 0.45 + random() * 0.9;
    ctx.lineCap = "round";
    ctx.stroke();
  }
  ctx.restore();
}

const CheeseWheel = forwardRef(function CheeseWheel({
  movies,
  onSpinComplete,
  theme = 'cheese',
  respectReducedMotion = true,
  animationProfile = 'classic',
}, ref) {
  const canvasRef = useRef(null);
  const stageRef = useRef(null);
  const [spinning, setSpinning] = useState(false);
  const [spinPhase, setSpinPhase] = useState('idle');
  const [pointerTick, setPointerTick] = useState(0);
  const [seraphimTextureReady, setSeraphimTextureReady] = useState(false);
  const rotRef = useRef(0);
  const seraphimTextureRef = useRef(null);
  const spinningRef = useRef(false);
  const spinPhaseRef = useRef('idle');
  const hoveredSectorRef = useRef(-1);
  const animationFrameRef = useRef(null);
  const completionTimerRef = useRef(null);
  const celebrationTimerRef = useRef(null);

  useEffect(() => {
    if (theme !== 'seraphim') {
      seraphimTextureRef.current = null;
      setSeraphimTextureReady(false);
      return undefined;
    }

    let cancelled = false;
    const texture = new Image();
    texture.decoding = 'async';
    texture.onload = () => {
      if (cancelled) return;
      seraphimTextureRef.current = texture;
      setSeraphimTextureReady(true);
    };
    texture.onerror = () => {
      if (cancelled) return;
      seraphimTextureRef.current = null;
      setSeraphimTextureReady(false);
    };
    texture.src = '/assets/seraphim/cheese-wheel-reference-v11.webp';
    return () => {
      cancelled = true;
    };
  }, [theme]);

  const seeded = (s) => { let v = s; return () => { v = (v * 16807) % 2147483647; return (v - 1) / 2147483646; }; };

  /* pre-generate holes — regenerate when movie count changes */
  const holesRef = useRef(null);
  const holeCountRef = useRef('');

  const ensureHoles = useCallback((n, dense = false) => {
    const holeKey = `${n}:${dense ? 'dense' : 'classic'}`;
    if (holesRef.current && holeCountRef.current === holeKey) return;
    const rng = seeded(dense ? 117 : 42);
    const holes = [];
    const sliceAngle = (2 * Math.PI) / n;
    for (let s = 0; s < n; s++) {
      const count = dense
        ? 4 + Math.floor(rng() * 4)
        : 5 + Math.floor(rng() * 3);
      for (let h = 0; h < count; h++) {
        const t = (h + 0.2 + rng() * 0.6) / count;
        const angleOff = t * sliceAngle;
        const distFrac = dense
          ? 0.18 + rng() * 0.7
          : 0.22 + rng() * 0.62;
        const hr = dense ? 5 + rng() * 13 : 4 + rng() * 9;
        holes.push({
          sector: s,
          angleOff,
          distFrac,
          hr,
          squash: 0.68 + rng() * 0.24,
          tilt: (rng() - 0.5) * 0.75,
        });
      }
    }
    holesRef.current = holes;
    holeCountRef.current = holeKey;
  }, []);

  const draw = useCallback((ctx, w, h, rot) => {
    const isSeraphim = theme === 'seraphim';
    const cx = w / 2;
    const cy = h / 2;
    const r = Math.min(cx, cy) - (isSeraphim ? 14 : 44);
    ctx.clearRect(0, 0, w, h);

    const n = movies.length;
    if (n === 0) return;
    const sliceAngle = (2 * Math.PI) / n;

    const isSamurai = theme === 'samurai';
    if (!isSamurai) ensureHoles(n, isSeraphim);

    const rind = RIND_THEMES[theme] || RIND_THEMES.cheese;
    const palette = WHEEL_PALETTES[theme] || WHEEL_PALETTES.cheese;
    const rindOuter = r + (isSeraphim ? 7 : 28);
    const rindMid = r + (isSeraphim ? 4 : 16);
    const rindInner = r + (isSeraphim ? 1 : 4);

    /* outer dark border */
    ctx.beginPath();
    ctx.arc(cx, cy, rindOuter, 0, 2 * Math.PI);
    if (isSeraphim) {
      const outerRind = ctx.createRadialGradient(
        cx - rindOuter * 0.26,
        cy - rindOuter * 0.3,
        rindOuter * 0.12,
        cx,
        cy,
        rindOuter
      );
      outerRind.addColorStop(0, '#a56a15');
      outerRind.addColorStop(0.72, rind.outer);
      outerRind.addColorStop(1, '#241304');
      ctx.fillStyle = outerRind;
    } else {
      ctx.fillStyle = rind.outer;
    }
    ctx.fill();

    /* mid rind */
    ctx.beginPath();
    ctx.arc(cx, cy, rindMid, 0, 2 * Math.PI);
    if (isSeraphim) {
      const midRind = ctx.createRadialGradient(
        cx - rindMid * 0.25,
        cy - rindMid * 0.28,
        rindMid * 0.08,
        cx,
        cy,
        rindMid
      );
      midRind.addColorStop(0, '#f1bc49');
      midRind.addColorStop(0.64, rind.mid);
      midRind.addColorStop(1, '#704008');
      ctx.fillStyle = midRind;
    } else {
      ctx.fillStyle = rind.mid;
    }
    ctx.fill();

    /* inner rind edge */
    ctx.beginPath();
    ctx.arc(cx, cy, rindInner, 0, 2 * Math.PI);
    ctx.fillStyle = rind.inner;
    ctx.fill();

    /* themed sectors */
    const wedgeColors = palette.wedges;
    movies.forEach((m, i) => {
      const startAngle = rot + i * sliceAngle;
      const endAngle = startAngle + sliceAngle;
      const seamAngle = isSeraphim && n > 1
        ? Math.min(0.017, sliceAngle * 0.055)
        : 0;
      const pieceStart = startAngle + seamAngle;
      const pieceEnd = endAngle - seamAngle;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, pieceStart, pieceEnd);
      ctx.closePath();
      if (isSeraphim && seraphimTextureReady && seraphimTextureRef.current) {
        const texture = seraphimTextureRef.current;
        const crop = Math.round(Math.min(texture.naturalWidth, texture.naturalHeight) * 0.008);
        ctx.save();
        ctx.clip();
        ctx.translate(cx, cy);
        ctx.rotate(rot);
        ctx.drawImage(
          texture,
          crop,
          crop,
          texture.naturalWidth - crop * 2,
          texture.naturalHeight - crop * 2,
          -r,
          -r,
          r * 2,
          r * 2
        );
        ctx.restore();

        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, r, pieceStart, pieceEnd);
        ctx.closePath();
        ctx.fillStyle = [
          'rgba(255, 226, 126, 0.025)',
          'rgba(87, 40, 2, 0.045)',
          'rgba(255, 236, 153, 0.035)',
          'rgba(104, 47, 2, 0.038)',
        ][i % 4];
        ctx.fill();
      } else {
        ctx.fillStyle = wedgeColors[i % wedgeColors.length];
        ctx.fill();
      }
      if (isSeraphim) {
        ctx.strokeStyle = 'rgba(45, 20, 1, 0.96)';
        ctx.lineWidth = 4.6;
        ctx.lineJoin = 'round';
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255, 226, 137, 0.46)';
        ctx.lineWidth = 1.15;
        ctx.stroke();
      }
      if (hoveredSectorRef.current === i && !spinningRef.current) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.18)";
        ctx.fill();
      }
    });

    if (isSamurai) {
      drawSamuraiSunTexture(ctx, cx, cy, r, rot, n);
    }
    if (isSeraphim && !seraphimTextureReady) {
      drawSeraphimCheeseTexture(ctx, cx, cy, r, rot, n);
    }

    /* Deep seams between the physical cheese pieces. */
    if (n > 1 && !isSeraphim) {
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

    if (!isSamurai && (!isSeraphim || !seraphimTextureReady)) {
      /* cheese holes */
      holesRef.current.forEach(({ sector, angleOff, distFrac, hr, squash, tilt }) => {
        const angle = rot + sector * sliceAngle + angleOff;
        const dist = distFrac * r;
        const hx = cx + dist * Math.cos(angle);
        const hy = cy + dist * Math.sin(angle);

        if (isSeraphim) {
          ctx.save();
          ctx.translate(hx, hy);
          ctx.rotate(tilt + angle * 0.08);
          ctx.beginPath();
          ctx.ellipse(0, 0, hr * 1.14, hr * squash, 0, 0, 2 * Math.PI);
          const holeGradient = ctx.createRadialGradient(
            0,
            0,
            hr * 0.04,
            0,
            0,
            hr * 1.22
          );
          holeGradient.addColorStop(0, '#180b01');
          holeGradient.addColorStop(0.54, palette.holeShadow);
          holeGradient.addColorStop(0.8, palette.hole);
          holeGradient.addColorStop(1, palette.holeHighlight);
          ctx.fillStyle = holeGradient;
          ctx.shadowColor = 'rgba(42, 18, 1, 0.68)';
          ctx.shadowBlur = 4;
          ctx.shadowOffsetY = 2;
          ctx.fill();
          ctx.shadowColor = 'transparent';
          ctx.strokeStyle = 'rgba(96, 48, 4, 0.62)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.restore();
          return;
        }

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
    }

    /* red triangle markers on rind */
    const markerR = (rindMid + rindOuter) / 2 - 1;
    if (!isSeraphim) movies.forEach((m, i) => {
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

    if (isSeraphim) {
      ctx.beginPath();
      ctx.arc(cx, cy, r + 0.5, 0, 2 * Math.PI);
      ctx.strokeStyle = 'rgba(44, 21, 2, 0.96)';
      ctx.lineWidth = 5.5;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, r - 2, 0, 2 * Math.PI);
      ctx.strokeStyle = 'rgba(255, 219, 117, 0.48)';
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }

    /* Labels stay upright and shrink to fit their sector. */
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    movies.forEach((m, i) => {
      const midAngle = rot + i * sliceAngle + sliceAngle / 2;
      const label = m.title.length > 24 ? m.title.slice(0, 22) + "\u2026" : m.title;
      const textR = r * (n <= 4 ? (isSeraphim ? 0.64 : 0.6) : 0.67);
      const x = cx + textR * Math.cos(midAngle);
      const y = cy + textR * Math.sin(midAngle);
      const sectorWidth = Math.max(54, 2 * textR * Math.sin(Math.min(sliceAngle * 0.38, Math.PI / 3)));
      const fontSize = isSeraphim
        ? Math.max(13, Math.min(20, 235 / Math.max(n, 6), 285 / Math.max(label.length, 8)))
        : Math.max(10, Math.min(16, 190 / Math.max(n, 7), 230 / Math.max(label.length, 8)));
      let rotation = midAngle + Math.PI / 2;
      const normalizedRotation = ((rotation % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      if (normalizedRotation > Math.PI / 2 && normalizedRotation < Math.PI * 1.5) rotation += Math.PI;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rotation);
      ctx.font = `800 ${fontSize}px 'Nunito', 'Comfortaa', sans-serif`;
      ctx.lineJoin = "round";
      ctx.strokeStyle = palette.labelStroke || wedgeColors[i % wedgeColors.length];
      ctx.lineWidth = isSeraphim ? 3.2 : 4;
      ctx.strokeText(label, 0, 0, sectorWidth);
      ctx.fillStyle = palette.label;
      ctx.fillText(label, 0, 0, sectorWidth);
      ctx.restore();
    });
  }, [movies, theme, ensureHoles, seraphimTextureReady]);

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
    if (celebrationTimerRef.current !== null) {
      window.clearTimeout(celebrationTimerRef.current);
      celebrationTimerRef.current = null;
    }
    spinningRef.current = false;
  }, []);

  useImperativeHandle(ref, () => ({
    spin: (winnerIndex, duration, randomOffset, turns, animationOptions) => {
      return doSpin(winnerIndex, duration, randomOffset, turns, animationOptions);
    },
    get isSpinning() { return spinningRef.current; }
  }));

  const doSpin = useCallback((
    winnerIndex,
    duration,
    randomOffset,
    turns = 16,
    animationOptions = {},
  ) => {
    if (movies.length === 0) return false;
    if (spinningRef.current) {
      if (!animationOptions.replaceActive) return false;
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      spinningRef.current = false;
    }
    spinningRef.current = true;
    setSpinning(true);

    if (completionTimerRef.current !== null) {
      window.clearTimeout(completionTimerRef.current);
      completionTimerRef.current = null;
    }
    if (celebrationTimerRef.current !== null) {
      window.clearTimeout(celebrationTimerRef.current);
      celebrationTimerRef.current = null;
    }

    initAudio();

    const isCartoon = animationProfile === 'cartoon';
    const n = movies.length;
    const sliceAngle = (2 * Math.PI) / n;
    const targetSlice = winnerIndex * sliceAngle + sliceAngle * randomOffset;
    const requestedSpins = Math.max(10, Math.min(22, turns));
    const startRot = rotRef.current;
    const desiredRotation = -Math.PI / 2 - targetSlice;
    const alignment = (
      ((desiredRotation - (startRot % (2 * Math.PI))) % (2 * Math.PI) + 2 * Math.PI)
      % (2 * Math.PI)
    );
    const reducedMotion = Boolean(
      respectReducedMotion
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    );
    const extraSpins = isCartoon && reducedMotion ? 0 : requestedSpins;
    const totalRotation = startRot + Math.PI * 2 * extraSpins + alignment;
    const durationMs = isCartoon
      ? duration * 1000
      : reducedMotion ? Math.min(duration * 1000, 900) : duration * 1000;
    const spinPlan = isCartoon
      ? createSpinPlan({
        startRotation: startRot,
        finalRotation: totalRotation,
        durationMs,
        sliceAngle,
        randomOffset,
        recoil: Boolean(animationOptions.recoil),
        recoilRatio: Number(animationOptions.recoilRatio) || 0,
        reducedMotion,
      })
      : null;
    const resumeElapsedMs = isCartoon
      ? Math.min(
        durationMs,
        Math.max(0, Number(animationOptions.resumeElapsedMs) || 0),
      )
      : 0;
    const startTime = performance.now() - resumeElapsedMs;

    spinPhaseRef.current = spinPlan
      ? sampleSpinPlan(spinPlan, resumeElapsedMs).phase
      : 'classic';
    setSpinPhase(spinPhaseRef.current);
    const stage = stageRef.current;
    if (stage) {
      stage.style.setProperty('--spin-energy', '0');
      if (spinPlan?.recoil) {
        stage.style.setProperty(
          '--recoil-settle-duration',
          `${spinPlan.rollbackDurationMs}ms`,
        );
      } else {
        stage.style.removeProperty('--recoil-settle-duration');
      }
    }

    const pegCount = Math.max(n * 2, 24);
    const pegAngle = (2 * Math.PI) / pegCount;
    const resumedRotation = spinPlan
      ? sampleSpinPlan(spinPlan, resumeElapsedMs).rotation
      : startRot;
    let lastPegIndex = Math.floor(
      (((resumedRotation % (2 * Math.PI)) + 4 * Math.PI) % (2 * Math.PI)) / pegAngle
    );
    let lastPointerSoundAt = -Infinity;

    const setCartoonPhase = phase => {
      if (!isCartoon || phase === spinPhaseRef.current) return;
      spinPhaseRef.current = phase;
      setSpinPhase(phase);
      if (phase === 'launch') playSpinLaunch();
      if (phase === 'brake') playBrakeSound();
      if (phase === 'settle' && spinPlan.recoil) playRecoilSound();
    };

    const finishSpin = () => {
      animationFrameRef.current = null;
      const normalizedFinalRotation = totalRotation % (2 * Math.PI);
      rotRef.current = normalizedFinalRotation;
      const canvas = canvasRef.current;
      if (canvas) {
        draw(canvas.getContext('2d'), canvas.width, canvas.height, normalizedFinalRotation);
      }
      if (stageRef.current) stageRef.current.style.setProperty('--spin-energy', '0');

      spinningRef.current = false;
      setSpinning(false);
      if (isCartoon && !reducedMotion) {
        spinPhaseRef.current = 'celebrate';
        setSpinPhase('celebrate');
        celebrationTimerRef.current = window.setTimeout(() => {
          celebrationTimerRef.current = null;
          spinPhaseRef.current = 'idle';
          setSpinPhase('idle');
        }, 900);
      } else {
        spinPhaseRef.current = 'idle';
        setSpinPhase('idle');
      }

      if (animationOptions.outcomeType === 'eliminated') {
        playEliminationSound();
      } else {
        playWinSound();
      }
      if (onSpinComplete) {
        completionTimerRef.current = window.setTimeout(() => {
          completionTimerRef.current = null;
          onSpinComplete(movies[winnerIndex]);
        }, isCartoon ? 300 : (reducedMotion ? 80 : 400));
      }
    };

    const animate = now => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / durationMs, 1);
      let currentRot;
      let angularSpeed;

      if (spinPlan) {
        const sample = sampleSpinPlan(spinPlan, elapsed);
        currentRot = sample.rotation;
        angularSpeed = Math.abs(sample.speed);
        setCartoonPhase(sample.phase);
        if (stageRef.current) {
          const energy = Math.min(0.76, angularSpeed * 32);
          stageRef.current.style.setProperty('--spin-energy', energy.toFixed(3));
        }
      } else {
        const windupDuration = reducedMotion ? 0 : Math.min(360, durationMs * 0.08);
        if (windupDuration > 0 && elapsed < windupDuration) {
          const windupProgress = elapsed / windupDuration;
          const windupAngle = Math.min(0.13, sliceAngle * 0.16);
          currentRot = startRot - Math.sin(windupProgress * Math.PI) * windupAngle;
        } else {
          const travelDuration = Math.max(1, durationMs - windupDuration);
          const travelProgress = Math.min(
            Math.max((elapsed - windupDuration) / travelDuration, 0),
            1,
          );
          const ease = 1 - Math.pow(1 - travelProgress, 3.15);
          currentRot = startRot + (totalRotation - startRot) * ease;
        }
        angularSpeed = Math.max(0, 1 - progress);
      }

      const canvas = canvasRef.current;
      if (canvas) draw(canvas.getContext('2d'), canvas.width, canvas.height, currentRot);

      const normRot = ((currentRot % (2 * Math.PI)) + 4 * Math.PI) % (2 * Math.PI);
      const currentPeg = Math.floor(normRot / pegAngle);
      if (currentPeg !== lastPegIndex) {
        lastPegIndex = currentPeg;
        const shouldTick = !isCartoon || now - lastPointerSoundAt >= 42;
        if (shouldTick) {
          lastPointerSoundAt = now;
          setPointerTick(value => value + 1);
          const energy = isCartoon ? Math.min(1, angularSpeed * 38) : 1 - progress;
          playClick(0.08 + 0.24 * energy);
        }
      }

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(animate);
      } else {
        finishSpin();
      }
    };
    animationFrameRef.current = requestAnimationFrame(animate);
    return true;
  }, [animationProfile, movies, draw, onSpinComplete, respectReducedMotion]);

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

  const stageClasses = [
    'cheese-wheel-stage',
    spinning ? 'is-spinning' : '',
    animationProfile === 'cartoon' ? 'is-cartoon' : '',
    spinPhase !== 'idle' ? `spin-phase-${spinPhase}` : '',
  ].filter(Boolean).join(' ');

  return (
    <div ref={stageRef} className={stageClasses} data-theme={theme}>
      <canvas
        ref={canvasRef}
        width={500}
        height={500}
        onMouseMove={updateHoveredSector}
        onMouseLeave={clearHoveredSector}
        aria-label={`${theme === 'samurai' ? 'Самурайское' : 'Сырное'} колесо. Фильмы: ${movies.map(movie => movie.title).join(', ')}`}
      />
      {animationProfile === 'cartoon' && (
        <div className="wheel-cartoon-effects" aria-hidden="true">
          <div className="wheel-speed-lines" />
          <div className="wheel-runner-orbit">
            <div className="wheel-cheese-runner">
              <span className="wheel-runner-body" />
              <i className="wheel-runner-arm is-left" />
              <i className="wheel-runner-arm is-right" />
              <i className="wheel-runner-leg is-left" />
              <i className="wheel-runner-leg is-right" />
            </div>
            <i className="wheel-runner-dust" />
            <i className="wheel-crumb is-one" />
            <i className="wheel-crumb is-two" />
            <i className="wheel-crumb is-three" />
          </div>
          <div className="wheel-finish-pop" />
        </div>
      )}
      <div key={pointerTick} className="wheel-pointer bounce" aria-hidden="true" />
    </div>
  );
});

export default CheeseWheel;
