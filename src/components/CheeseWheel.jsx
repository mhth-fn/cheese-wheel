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
};

const CheeseWheel = forwardRef(function CheeseWheel({ movies, onSpinComplete, theme = 'cheese' }, ref) {
  const canvasRef = useRef(null);
  const [spinning, setSpinning] = useState(false);
  const rotRef = useRef(0);
  const spinningRef = useRef(false);

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
      const count = 3 + Math.floor(rng() * 2);
      for (let h = 0; h < count; h++) {
        const t = (h + 0.2 + rng() * 0.6) / count;
        const angleOff = t * sliceAngle;
        const distFrac = 0.25 + rng() * 0.55;
        const hr = 6 + rng() * 12;
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
    const wedgeColors = ["#FFE552", "#F5D838"];
    movies.forEach((m, i) => {
      const startAngle = rot + i * sliceAngle;
      const endAngle = startAngle + sliceAngle;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = wedgeColors[i % 2];
      ctx.fill();
    });

    /* divider lines */
    movies.forEach((m, i) => {
      const angle = rot + i * sliceAngle;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
      ctx.strokeStyle = "#C89428";
      ctx.lineWidth = 2.5;
      ctx.stroke();
    });

    /* cheese holes */
    holesRef.current.forEach(({ sector, angleOff, distFrac, hr }) => {
      const angle = rot + sector * sliceAngle + angleOff;
      const dist = distFrac * r;
      const hx = cx + dist * Math.cos(angle);
      const hy = cy + dist * Math.sin(angle);

      ctx.beginPath();
      ctx.arc(hx, hy, hr, 0, 2 * Math.PI);
      ctx.fillStyle = "#DBA428";
      ctx.fill();

      /* top shadow crescent */
      ctx.save();
      ctx.beginPath();
      ctx.arc(hx, hy, hr, 0, 2 * Math.PI);
      ctx.clip();
      ctx.beginPath();
      ctx.arc(hx, hy - hr * 0.35, hr * 0.95, 0, 2 * Math.PI);
      ctx.fillStyle = "#C48E18";
      ctx.fill();
      ctx.restore();

      /* bottom highlight crescent */
      ctx.save();
      ctx.beginPath();
      ctx.arc(hx, hy, hr, 0, 2 * Math.PI);
      ctx.clip();
      ctx.beginPath();
      ctx.arc(hx, hy + hr * 0.45, hr * 0.85, 0, 2 * Math.PI);
      ctx.fillStyle = "#E8B840";
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

    /* labels — curved along arc */
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    const fontSize = Math.min(14, 150 / n);
    ctx.font = `bold ${fontSize}px 'Nunito', sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    movies.forEach((m, i) => {
      const midAngle = rot + i * sliceAngle + sliceAngle / 2;
      const label = m.title.length > 18 ? m.title.slice(0, 16) + "\u2026" : m.title;
      const textR = r * 0.68;

      /* measure char widths to compute angular span */
      const chars = [...label];
      const widths = chars.map(c => ctx.measureText(c).width);
      const totalW = widths.reduce((a, b) => a + b, 0);
      const totalArc = totalW / textR;

      /* clamp text to sector (leave 10% margin each side) */
      const maxArc = sliceAngle * 0.8;
      const scale = totalArc > maxArc ? maxArc / totalArc : 1;

      /* starting angle — center the text in the sector, always same direction */
      let angle = midAngle - (totalArc * scale) / 2;

      chars.forEach((ch, ci) => {
        const halfArc = ((widths[ci] * scale) / 2) / textR;
        angle += halfArc;

        const x = cx + textR * Math.cos(angle);
        const y = cy + textR * Math.sin(angle);

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle + Math.PI / 2);

        ctx.strokeStyle = i % 2 === 0 ? "#FFE552" : "#F5D838";
        ctx.lineWidth = 4;
        ctx.lineJoin = "round";
        ctx.strokeText(ch, 0, 0);
        ctx.fillStyle = "#6B4400";
        ctx.fillText(ch, 0, 0);
        ctx.restore();

        angle += halfArc;
      });
    });

    /* pointer at top */
    const py = cy - rindOuter - 6;
    ctx.beginPath();
    ctx.moveTo(cx, py + 26);
    ctx.lineTo(cx - 12, py);
    ctx.lineTo(cx + 12, py);
    ctx.closePath();
    ctx.fillStyle = "#D43030";
    ctx.fill();
    ctx.strokeStyle = "#A82020";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }, [movies, theme, ensureHoles]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    draw(ctx, canvas.width, canvas.height, rotRef.current);
  }, [movies, draw]);

  useImperativeHandle(ref, () => ({
    spin: (winnerIndex, duration, randomOffset) => {
      doSpin(winnerIndex, duration, randomOffset);
    },
    get isSpinning() { return spinningRef.current; }
  }));

  const doSpin = useCallback((winnerIndex, duration, randomOffset) => {
    if (spinningRef.current || movies.length === 0) return;
    spinningRef.current = true;
    setSpinning(true);

    initAudio();

    const n = movies.length;
    const sliceAngle = (2 * Math.PI) / n;
    const targetSlice = winnerIndex * sliceAngle + sliceAngle * randomOffset;
    const extraSpins = 8 + Math.floor(Math.random() * 5);
    const totalRotation = rotRef.current + Math.PI * 2 * extraSpins +
      (2 * Math.PI - targetSlice - (rotRef.current % (2 * Math.PI)));

    const startRot = rotRef.current;
    const startTime = performance.now();
    const dur = duration * 1000;

    const pegCount = Math.max(n, 12);
    const pegAngle = (2 * Math.PI) / pegCount;
    let lastPegIndex = Math.floor(((startRot % (2 * Math.PI)) + 4 * Math.PI) % (2 * Math.PI) / pegAngle);

    const animate = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / dur, 1);
      const ease = 1 - Math.pow(1 - progress, 4);
      const currentRot = startRot + (totalRotation - startRot) * ease;

      const canvas = canvasRef.current;
      if (canvas) draw(canvas.getContext("2d"), canvas.width, canvas.height, currentRot);

      const normRot = ((currentRot % (2 * Math.PI)) + 4 * Math.PI) % (2 * Math.PI);
      const currentPeg = Math.floor(normRot / pegAngle);
      if (currentPeg !== lastPegIndex) {
        lastPegIndex = currentPeg;
        const vol = 0.1 + 0.25 * (1 - progress);
        playClick(vol);
      }

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        const finalRot = currentRot % (2 * Math.PI);
        rotRef.current = finalRot;

        const norm = ((-(currentRot % (2 * Math.PI)) - Math.PI / 2) % (2 * Math.PI) + 4 * Math.PI) % (2 * Math.PI);
        const idx = Math.floor(norm / sliceAngle) % n;

        spinningRef.current = false;
        setSpinning(false);

        playWinSound();
        if (onSpinComplete) {
          setTimeout(() => onSpinComplete(movies[idx]), 400);
        }
      }
    };
    requestAnimationFrame(animate);
  }, [movies, draw, onSpinComplete]);

  return (
    <canvas
      ref={canvasRef}
      width={500}
      height={500}
      style={{ maxWidth: "100%", filter: "drop-shadow(0 8px 28px rgba(100,60,0,0.25))" }}
    />
  );
});

export default CheeseWheel;
