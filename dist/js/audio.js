// ========== ЗВУК КОЛЕСА ==========
let audioContext = null;

export function initAudio() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
}

export function playClick(volume) {
  if (!audioContext) return;

  const t = audioContext.currentTime;

  const bufferSize = Math.floor(audioContext.sampleRate * 0.015);
  const noiseBuffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 8);
  }

  const noise = audioContext.createBufferSource();
  noise.buffer = noiseBuffer;

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
