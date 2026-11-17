// Sound: every effect and the music are synthesised with WebAudio, so the
// game ships no audio files and makes no network request. The context stays
// unbuilt until the first gesture calls ensure(), which is the only moment a
// browser lets audio start. One-shots are short oscillator and noise
// envelopes; the engine, the tyre screech and the siren are loops whose
// gains follow the game; the music is a small step sequencer playing a
// sunset bassline over a kick and hats.
//
// Mute is a master-gain switch, persisted so it survives a reload, and every
// method is a safe no-op before ensure() runs.
const MUTE_KEY = 'solmar-city-muted-v1';

// A-minor bassline, one entry per sixteenth step, 0 for a rest. The kick
// lands on the quarter notes and the hats answer on the off eighths.
const BASS_STEPS = [
  55.00, 0, 55.00, 0, 65.41, 0, 55.00, 0,
  82.41, 0, 82.41, 0, 98.00, 0, 73.42, 0,
];
const BPM = 112;

export function createAudio() {
  let ctx = null;
  let master = null;
  let sfxBus = null;
  let musicBus = null;
  let noiseBuf = null;
  let engineNodes = null;
  let skidNodes = null;
  let sirenNodes = null;
  let musicTimer = null;
  let nextStepAt = 0;
  let stepIndex = 0;
  let isMuted = false;
  try {
    isMuted = window.localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    isMuted = false;
  }

  // A one-second buffer of white noise, shared by every noise-based sound.
  function buildNoiseBuffer() {
    const length = ctx.sampleRate;
    const buf = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  // A single tone with a pitch glide and an exponential fade. `at` lets a
  // caller schedule a note slightly ahead, which the sequencer uses.
  function tone({ type, from, to, dur, vol, at }) {
    if (!ctx) return;
    const t0 = at === undefined ? ctx.currentTime : at;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(from, t0);
    if (to !== undefined && to !== from) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(sfxBus);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  // A burst of filtered noise with an exponential fade. `sweepTo` glides
  // the filter cutoff across the burst, which is what makes a whoosh.
  function noise({ dur, vol, freq, q, filterType, sweepTo, at }) {
    if (!ctx) return;
    const t0 = at === undefined ? ctx.currentTime : at;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType || 'lowpass';
    filter.frequency.setValueAtTime(freq || 1000, t0);
    if (sweepTo !== undefined) filter.frequency.exponentialRampToValueAtTime(Math.max(20, sweepTo), t0 + dur);
    filter.Q.value = q || 0.8;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(sfxBus);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  // A tone routed to the music bus instead of the effects bus.
  function musicTone({ type, from, to, dur, vol, at }) {
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || 'triangle';
    osc.frequency.setValueAtTime(from, at);
    if (to !== undefined && to !== from) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), at + dur);
    gain.gain.setValueAtTime(vol, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(gain);
    gain.connect(musicBus);
    osc.start(at);
    osc.stop(at + dur + 0.02);
  }

  function musicNoise({ dur, vol, freq, at }) {
    if (!ctx) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = freq || 6000;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, at);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(musicBus);
    src.start(at);
    src.stop(at + dur + 0.02);
  }

  // The engine is two detuned saws through a lowpass: the pitch and the
  // loudness both climb with speed, and it idles when the car is parked.
  function buildEngine() {
    const oscA = ctx.createOscillator();
    oscA.type = 'sawtooth';
    const oscB = ctx.createOscillator();
    oscB.type = 'square';
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    oscA.connect(filter);
    oscB.connect(filter);
    filter.connect(gain);
    gain.connect(sfxBus);
    oscA.start();
    oscB.start();
    return { oscA, oscB, gain };
  }

  function buildSkid() {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 950;
    filter.Q.value = 2.5;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(sfxBus);
    src.start();
    return { gain };
  }

  // A two-tone siren: one oscillator whose pitch a slow LFO swings up and
  // down, so it wails instead of sitting on one note.
  function buildSiren() {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 740;
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.8;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 260;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    osc.connect(gain);
    gain.connect(sfxBus);
    osc.start();
    lfo.start();
    return { gain };
  }

  function scheduleStep(step, at) {
    const bass = BASS_STEPS[step % BASS_STEPS.length];
    if (bass) musicTone({ type: 'triangle', from: bass, dur: 0.22, vol: 0.16, at });
    if (step % 4 === 0) musicTone({ type: 'sine', from: 130, to: 42, dur: 0.15, vol: 0.5, at });
    if (step % 4 === 2) musicNoise({ dur: 0.04, vol: 0.05, freq: 7000, at });
  }

  function tickMusic() {
    if (!ctx) return;
    const stepDur = 60 / BPM / 4;
    while (nextStepAt < ctx.currentTime + 0.25) {
      scheduleStep(stepIndex, nextStepAt);
      stepIndex += 1;
      nextStepAt += stepDur;
    }
  }

  const api = {
    get muted() {
      return isMuted;
    },

    // Build (or resume) the context. Call it from any real gesture; before
    // the first call every other method is silent by design.
    ensure() {
      try {
        if (!ctx) {
          const AC = window.AudioContext || window.webkitAudioContext;
          if (!AC) return;
          ctx = new AC();
          master = ctx.createGain();
          master.gain.value = isMuted ? 0 : 0.9;
          master.connect(ctx.destination);
          sfxBus = ctx.createGain();
          sfxBus.gain.value = 1;
          sfxBus.connect(master);
          musicBus = ctx.createGain();
          musicBus.gain.value = 0.45;
          musicBus.connect(master);
          noiseBuf = buildNoiseBuffer();
          engineNodes = buildEngine();
          skidNodes = buildSkid();
          sirenNodes = buildSiren();
        }
        if (ctx.state === 'suspended') ctx.resume();
      } catch {
        // Audio is decoration: a failure here never breaks the game.
      }
    },

    setMuted(m) {
      isMuted = !!m;
      try {
        window.localStorage.setItem(MUTE_KEY, isMuted ? '1' : '0');
      } catch {
        // Private mode: the choice lasts this visit only.
      }
      if (ctx && master) master.gain.setTargetAtTime(isMuted ? 0 : 0.9, ctx.currentTime, 0.02);
    },

    startMusic() {
      if (!ctx || musicTimer) return;
      stepIndex = 0;
      nextStepAt = ctx.currentTime + 0.05;
      musicTimer = window.setInterval(tickMusic, 90);
    },

    stopMusic() {
      if (musicTimer) {
        window.clearInterval(musicTimer);
        musicTimer = null;
      }
    },

    // The engine hum. Speed is 0 to 1; on false silences it outright.
    engine(speed01, on) {
      if (!ctx || !engineNodes) return;
      const t = ctx.currentTime;
      const speed = Math.max(0, Math.min(1, speed01 || 0));
      const freq = 52 + speed * 118;
      engineNodes.oscA.frequency.setTargetAtTime(freq, t, 0.08);
      engineNodes.oscB.frequency.setTargetAtTime(freq * 0.5 + 1.5, t, 0.08);
      engineNodes.gain.gain.setTargetAtTime(on ? 0.035 + speed * 0.05 : 0, t, 0.09);
    },

    // Tyre screech while drifting. Amount is 0 to 1.
    skid(amount) {
      if (!ctx || !skidNodes) return;
      const a = Math.max(0, Math.min(1, amount || 0));
      skidNodes.gain.gain.setTargetAtTime(a * 0.13, ctx.currentTime, 0.05);
    },

    siren(on) {
      if (!ctx || !sirenNodes) return;
      sirenNodes.gain.gain.setTargetAtTime(on ? 0.04 : 0, ctx.currentTime, 0.15);
    },

    click() {
      tone({ type: 'square', from: 880, to: 660, dur: 0.06, vol: 0.12 });
    },

    shot() {
      const detune = 0.95 + Math.random() * 0.1;
      noise({ dur: 0.09, vol: 0.3, freq: 2400 * detune, filterType: 'highpass' });
      tone({ type: 'square', from: 220 * detune, to: 90, dur: 0.08, vol: 0.16 });
    },

    hit() {
      tone({ type: 'triangle', from: 320, to: 190, dur: 0.08, vol: 0.2 });
    },

    crash() {
      noise({ dur: 0.28, vol: 0.4, freq: 700 });
      tone({ type: 'sine', from: 110, to: 45, dur: 0.25, vol: 0.35 });
    },

    explosion() {
      noise({ dur: 0.7, vol: 0.55, freq: 900, sweepTo: 120 });
      tone({ type: 'sine', from: 120, to: 30, dur: 0.55, vol: 0.5 });
    },

    cash() {
      const t = ctx ? ctx.currentTime : 0;
      tone({ type: 'sine', from: 1320, dur: 0.09, vol: 0.18, at: t });
      tone({ type: 'sine', from: 1760, dur: 0.14, vol: 0.18, at: t + 0.09 });
    },

    pickup() {
      tone({ type: 'sine', from: 660, to: 990, dur: 0.13, vol: 0.2 });
    },

    star() {
      const t = ctx ? ctx.currentTime : 0;
      tone({ type: 'square', from: 740, dur: 0.1, vol: 0.14, at: t });
      tone({ type: 'square', from: 560, dur: 0.14, vol: 0.14, at: t + 0.11 });
    },

    whoosh() {
      noise({ dur: 0.3, vol: 0.16, freq: 420, sweepTo: 2400, filterType: 'bandpass', q: 1.4 });
    },

    horn() {
      const t = ctx ? ctx.currentTime : 0;
      tone({ type: 'square', from: 370, dur: 0.32, vol: 0.14, at: t });
      tone({ type: 'square', from: 466, dur: 0.32, vol: 0.12, at: t });
    },

    missionStart() {
      const t = ctx ? ctx.currentTime : 0;
      [523, 659, 784].forEach((f, i) => {
        tone({ type: 'triangle', from: f, dur: 0.13, vol: 0.18, at: t + i * 0.1 });
      });
    },

    missionDone() {
      const t = ctx ? ctx.currentTime : 0;
      [523, 659, 784, 1047].forEach((f, i) => {
        tone({ type: 'triangle', from: f, dur: 0.16, vol: 0.2, at: t + i * 0.11 });
      });
    },

    missionFail() {
      const t = ctx ? ctx.currentTime : 0;
      [392, 330, 262].forEach((f, i) => {
        tone({ type: 'triangle', from: f, dur: 0.2, vol: 0.18, at: t + i * 0.14 });
      });
    },

    busted() {
      const t = ctx ? ctx.currentTime : 0;
      [740, 560, 740, 560].forEach((f, i) => {
        tone({ type: 'square', from: f, dur: 0.14, vol: 0.13, at: t + i * 0.15 });
      });
    },

    wasted() {
      tone({ type: 'sawtooth', from: 220, to: 55, dur: 0.8, vol: 0.16 });
      noise({ dur: 0.5, vol: 0.12, freq: 300 });
    },
  };

  return api;
}
