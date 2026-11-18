// 100% synthesized WebAudio: engine, sirens, gunfire, UI, bassline music. No files.
import { mulberry32 } from './random.js';

// v5: all SFX stay 100% synthesised WebAudio (no samples, no network) — the graphics pass only changed what the player sees, never what they hear.
export function createAudio() {
  let ctx = null, master, musicBus, sfxBus, engineOsc, engineGain, sirenOsc, sirenGain, sirenLfo;
  let muted = false;
  try { muted = localStorage.getItem('solmar-muted') === '1'; } catch { /* private mode */ }
  const rng = mulberry32(99);
  const A = {
    get muted() { return muted; },
    unlock() {
      if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        master = ctx.createGain(); master.gain.value = muted ? 0 : 0.8; master.connect(ctx.destination);
        musicBus = ctx.createGain(); musicBus.gain.value = 0.35; musicBus.connect(master);
        sfxBus = ctx.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);
      } catch { ctx = null; }
    },
    setMuted(m) {
      muted = m;
      try { localStorage.setItem('solmar-muted', m ? '1' : '0'); } catch { /* ignore */ }
      if (master) master.gain.value = m ? 0 : 0.8;
    },
    blip(freq, dur, type = 'sine', vol = 0.2, slide = 0) {
      if (!ctx) return;
      const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + dur + 0.02);
    },
    noise(dur, vol = 0.3, low = 400, high = 4000) {
      if (!ctx) return;
      const t = ctx.currentTime, len = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (rng() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource(); src.buffer = buf;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass';
      f.frequency.value = (low + high) / 2; f.Q.value = 0.7;
      const g = ctx.createGain(); g.gain.value = vol;
      src.connect(f); f.connect(g); g.connect(sfxBus); src.start(t);
    },
    gunshot() { this.noise(0.12, 0.5, 800, 5000); this.blip(160 + rng() * 40, 0.09, 'square', 0.15, -100); },
    explosion() { this.noise(0.7, 0.8, 60, 500); this.blip(70, 0.5, 'sine', 0.5, -40); },
    horn() { this.blip(370, 0.25, 'sawtooth', 0.12); this.blip(466, 0.25, 'sawtooth', 0.1); },
    pickup() { this.blip(880, 0.08, 'sine', 0.2); setTimeout(() => this.blip(1320, 0.12, 'sine', 0.2), 70); },
    uiClick() { this.blip(660, 0.05, 'square', 0.08); },
    missionOk() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.blip(f, 0.16, 'triangle', 0.22), i * 110)); },
    missionFail() { [400, 300, 200].forEach((f, i) => setTimeout(() => this.blip(f, 0.2, 'sawtooth', 0.12), i * 140)); },
    bark(pitch = 1) { this.blip(220 * pitch * (0.9 + rng() * 0.2), 0.12, 'sine', 0.08, 40); },
    cash() { this.blip(1568, 0.1, 'sine', 0.15); setTimeout(() => this.blip(2093, 0.14, 'sine', 0.15), 80); },
    engine(on, speed01) {
      if (!ctx) return;
      if (on && !engineOsc) {
        engineOsc = ctx.createOscillator(); engineOsc.type = 'sawtooth';
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
        engineGain = ctx.createGain(); engineGain.gain.value = 0.06;
        engineOsc.connect(f); f.connect(engineGain); engineGain.connect(sfxBus);
        engineOsc.start();
      }
      if (!on && engineOsc) { try { engineOsc.stop(); } catch { /* already stopped */ } engineOsc = null; return; }
      if (engineOsc) engineOsc.frequency.value = 55 + speed01 * 130;
    },
    siren(on) {
      if (!ctx) return;
      if (on && !sirenOsc) {
        sirenOsc = ctx.createOscillator(); sirenOsc.type = 'triangle'; sirenOsc.frequency.value = 750;
        sirenLfo = ctx.createOscillator(); sirenLfo.frequency.value = 0.7;
        const lg = ctx.createGain(); lg.gain.value = 180;
        sirenLfo.connect(lg); lg.connect(sirenOsc.frequency);
        sirenGain = ctx.createGain(); sirenGain.gain.value = 0.05;
        sirenOsc.connect(sirenGain); sirenGain.connect(sfxBus);
        sirenOsc.start(); sirenLfo.start();
      }
      if (!on && sirenOsc) {
        try { sirenOsc.stop(); sirenLfo.stop(); } catch { /* already stopped */ }
        sirenOsc = null;
      }
    },
    startMusic() {
      if (!ctx || A._musicTimer) return;
      const bass = [55, 55, 65.4, 49, 55, 55, 73.4, 65.4]; // A1 A1 C2 G1 A1 A1 D2 C2
      let step = 0;
      const beat = 60 / 96 / 2; // 96 BPM eighth notes
      const tick = () => {
        if (!ctx) return;
        const t = ctx.currentTime;
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'square'; o.frequency.value = bass[step % bass.length];
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, t + beat * 0.9);
        o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + beat);
        step++;
      };
      tick();
      A._musicTimer = setInterval(tick, beat * 1000);
    },
    stopMusic() { if (A._musicTimer) { clearInterval(A._musicTimer); A._musicTimer = null; } },
  };
  return A;
}
