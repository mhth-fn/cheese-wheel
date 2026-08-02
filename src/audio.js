let audioContext = null;

export function initAudio() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioContext.state === 'suspended') {
    void audioContext.resume().catch(() => {});
  }
}

function createNoiseBuffer(duration) {
  const bufferSize = Math.max(1, Math.floor(audioContext.sampleRate * duration));
  const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < bufferSize; index++) {
    const fade = Math.pow(1 - index / bufferSize, 1.8);
    data[index] = (Math.random() * 2 - 1) * fade;
  }
  return buffer;
}

export function playClick(volume) {
  if (!audioContext) return;

  const t = audioContext.currentTime;

  const noise = audioContext.createBufferSource();
  noise.buffer = createNoiseBuffer(0.015);

  const bandpass = audioContext.createBiquadFilter();
  bandpass.type = 'bandpass';
  bandpass.frequency.value = 2800 + Math.random() * 600;
  bandpass.Q.value = 3;

  const highpass = audioContext.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = 400;

  const gain = audioContext.createGain();
  gain.gain.setValueAtTime(Math.min(volume, 0.35), t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.02);

  noise.connect(bandpass);
  bandpass.connect(highpass);
  highpass.connect(gain);
  gain.connect(audioContext.destination);

  noise.start(t);
  noise.stop(t + 0.02);
}

export function playSpinLaunch() {
  if (!audioContext) initAudio();
  if (!audioContext) return;

  const t = audioContext.currentTime;
  const noise = audioContext.createBufferSource();
  const filter = audioContext.createBiquadFilter();
  const gain = audioContext.createGain();
  noise.buffer = createNoiseBuffer(0.42);
  filter.type = 'bandpass';
  filter.Q.value = 0.8;
  filter.frequency.setValueAtTime(380, t);
  filter.frequency.exponentialRampToValueAtTime(2600, t + 0.34);
  gain.gain.setValueAtTime(0.001, t);
  gain.gain.exponentialRampToValueAtTime(0.11, t + 0.08);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(audioContext.destination);
  noise.start(t);
  noise.stop(t + 0.43);

  const spring = audioContext.createOscillator();
  const springGain = audioContext.createGain();
  spring.type = 'triangle';
  spring.frequency.setValueAtTime(120, t);
  spring.frequency.exponentialRampToValueAtTime(260, t + 0.16);
  springGain.gain.setValueAtTime(0.001, t);
  springGain.gain.linearRampToValueAtTime(0.06, t + 0.025);
  springGain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
  spring.connect(springGain);
  springGain.connect(audioContext.destination);
  spring.start(t);
  spring.stop(t + 0.21);
}

export function playBrakeSound() {
  if (!audioContext) return;
  const t = audioContext.currentTime;
  const noise = audioContext.createBufferSource();
  const filter = audioContext.createBiquadFilter();
  const gain = audioContext.createGain();
  noise.buffer = createNoiseBuffer(0.32);
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(2100, t);
  filter.frequency.exponentialRampToValueAtTime(260, t + 0.3);
  gain.gain.setValueAtTime(0.045, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.31);
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(audioContext.destination);
  noise.start(t);
  noise.stop(t + 0.32);
}

export function playRecoilSound() {
  if (!audioContext) return;
  const t = audioContext.currentTime;
  [0, 0.075].forEach((delay, index) => {
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = index === 0 ? 'square' : 'triangle';
    osc.frequency.setValueAtTime(index === 0 ? 180 : 245, t + delay);
    osc.frequency.exponentialRampToValueAtTime(index === 0 ? 115 : 190, t + delay + 0.12);
    gain.gain.setValueAtTime(index === 0 ? 0.045 : 0.035, t + delay);
    gain.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.14);
    osc.connect(gain);
    gain.connect(audioContext.destination);
    osc.start(t + delay);
    osc.stop(t + delay + 0.15);
  });
}

export function playEliminationSound() {
  if (!audioContext) initAudio();
  if (!audioContext) return;
  const t = audioContext.currentTime;
  [392, 294, 196].forEach((frequency, index) => {
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const start = t + index * 0.085;
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(frequency, start);
    osc.frequency.exponentialRampToValueAtTime(frequency * 0.82, start + 0.16);
    gain.gain.setValueAtTime(0.001, start);
    gain.gain.linearRampToValueAtTime(0.075, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.19);
    osc.connect(gain);
    gain.connect(audioContext.destination);
    osc.start(start);
    osc.stop(start + 0.2);
  });
}

export function playWinSound() {
  if (!audioContext) initAudio();
  if (!audioContext) return;

  const t = audioContext.currentTime;

  const notes = [
    { freq: 523.25, time: 0, dur: 0.25 },
    { freq: 659.25, time: 0.12, dur: 0.25 },
    { freq: 783.99, time: 0.24, dur: 0.35 },
    { freq: 1046.5, time: 0.4, dur: 0.5 },
  ];

  notes.forEach(({ freq, time, dur }) => {
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();

    osc.type = 'triangle';
    osc.frequency.value = freq;

    gain.gain.setValueAtTime(0, t + time);
    gain.gain.linearRampToValueAtTime(0.15, t + time + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + time + dur);

    osc.connect(gain);
    gain.connect(audioContext.destination);
    osc.start(t + time);
    osc.stop(t + time + dur);
  });
}
