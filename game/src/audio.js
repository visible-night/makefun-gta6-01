// Every sound is synthesised with WebAudio: engine hum, sirens, gunshots, pickups and
// a small bassline loop. No audio files, no network. Nothing plays until a gesture
// calls ensure(), as browsers require.
export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = null;
  let musicTimer = null;
  let musicStep = 0;
  let muted = false;
  let engineOn = false;
  let sirenOn = false;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      return true;
    } catch {
      return false;
    }
  }

  function setMuted(value) {
    muted = value;
    if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : 0.5, ctx.currentTime, 0.05);
  }

  function tone(freq, dur, type, vol, slideTo, when = 0) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noise(dur, vol, filterFreq, when = 0) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + when;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t0);
  }

  // A looped engine note whose pitch follows speed (0..1).
  function engine(speed01, on) {
    if (!ctx) return;
    if (!on) {
      if (engineGain) engineGain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
      engineOn = false;
      return;
    }
    if (!engineOsc) {
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 500;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(filter);
      filter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
    }
    engineOsc.frequency.setTargetAtTime(55 + speed01 * 130, ctx.currentTime, 0.08);
    engineGain.gain.setTargetAtTime(0.05 + speed01 * 0.05, ctx.currentTime, 0.1);
    engineOn = true;
  }

  function siren(on) {
    if (!ctx) return;
    if (on === sirenOn) return;
    sirenOn = on;
    if (!on) {
      if (sirenTimer) clearInterval(sirenTimer);
      sirenTimer = null;
      if (sirenGain) sirenGain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
      return;
    }
    if (!sirenOsc) {
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'triangle';
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
    }
    sirenGain.gain.setTargetAtTime(0.045, ctx.currentTime, 0.1);
    let high = false;
    sirenTimer = setInterval(() => {
      if (!sirenOsc || !ctx) return;
      high = !high;
      sirenOsc.frequency.setTargetAtTime(high ? 880 : 660, ctx.currentTime, 0.05);
    }, 420);
  }

  // A slow sunset groove: a bassline in A minor with a hat on the off-beats.
  const BASS = [55, 0, 55, 65.4, 55, 0, 49, 58.3, 55, 0, 55, 65.4, 82.4, 73.4, 65.4, 49];
  function startMusic() {
    if (!ctx || musicTimer) return;
    musicStep = 0;
    musicTimer = setInterval(() => {
      if (!ctx || muted) return;
      const note = BASS[musicStep % BASS.length];
      if (note) tone(note, 0.22, 'triangle', 0.12);
      if (musicStep % 2 === 1) noise(0.04, 0.05, 6000);
      if (musicStep % 8 === 4) tone(220, 0.3, 'sine', 0.04, 180);
      musicStep += 1;
    }, 210);
  }

  function stopMusic() {
    if (musicTimer) clearInterval(musicTimer);
    musicTimer = null;
  }

  return {
    ensure, setMuted, engine, siren, startMusic, stopMusic,
    get muted() { return muted; },
    get engineOn() { return engineOn; },
    shot() { noise(0.09, 0.25, 3000); tone(180, 0.08, 'square', 0.12, 60); },
    hit() { noise(0.06, 0.18, 1800); },
    crash() { noise(0.25, 0.3, 900); tone(90, 0.2, 'sawtooth', 0.15, 40); },
    explosion() { noise(0.7, 0.5, 500); tone(60, 0.6, 'sine', 0.4, 30); },
    pickup() { tone(660, 0.09, 'sine', 0.2); tone(990, 0.14, 'sine', 0.2, null, 0.08); },
    cash() { tone(880, 0.08, 'sine', 0.18); tone(1320, 0.16, 'sine', 0.18, null, 0.07); },
    click() { tone(440, 0.05, 'square', 0.08); },
    horn() { tone(370, 0.25, 'square', 0.1); tone(466, 0.25, 'square', 0.08); },
    missionStart() { tone(392, 0.12, 'triangle', 0.2); tone(523, 0.2, 'triangle', 0.2, null, 0.12); },
    missionDone() {
      [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', 0.22, null, i * 0.13));
    },
    missionFail() { tone(330, 0.25, 'sawtooth', 0.15, 220); tone(220, 0.4, 'sawtooth', 0.15, 160, 0.22); },
    busted() { tone(440, 0.3, 'square', 0.15, 330); tone(330, 0.5, 'square', 0.15, 220, 0.28); },
    wasted() { tone(196, 0.5, 'sawtooth', 0.2, 98); tone(147, 0.8, 'sawtooth', 0.2, 73, 0.4); },
    star() { tone(700, 0.1, 'square', 0.12); tone(700, 0.1, 'square', 0.12, null, 0.14); },
  };
}
