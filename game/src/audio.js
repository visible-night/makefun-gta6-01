// Synthesized audio for Solmar City. No audio files: every sound is a
// WebAudio oscillator or filtered noise built at runtime, on one bus graph
// (master -> music / sfx). The context unlocks on the first user gesture.
import { BARKS } from './text.js';

export function createAudio() {
  let ctx = null;
  let master = null, musicBus = null, sfxBus = null;
  let muted = false;
  let engineOsc = null, engineGain = null, engineFilter = null;
  let sirenOsc = null, sirenGain = null, sirenTimer = 0, sirenHigh = false;
  let radioOn = false, radioTimer = null, radioStep = 0;
  let noiseBuf = null;

  function ensure() {
    if (ctx) return true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      return false;
    }
    master = ctx.createGain(); master.gain.value = 0.6; master.connect(ctx.destination);
    musicBus = ctx.createGain(); musicBus.gain.value = 0.32; musicBus.connect(master);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return true;
  }

  function blip(freq, dur, type = 'sine', vol = 0.2, when = 0) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(sfxBus);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noiseBurst(dur, vol, filterFreq, type = 'lowpass') {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(sfxBus);
    src.start(t); src.stop(t + dur + 0.02);
  }

  return {
    unlock() { if (ensure() && ctx.state === 'suspended') ctx.resume(); },
    get muted() { return muted; },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.6;
      return muted;
    },
    click() { blip(660, 0.07, 'square', 0.12); },
    pickup() { blip(880, 0.1, 'sine', 0.2); blip(1320, 0.14, 'sine', 0.16, 0.08); },
    cash() { blip(1046, 0.09, 'triangle', 0.2); blip(1568, 0.16, 'triangle', 0.18, 0.07); },
    shot() { noiseBurst(0.12, 0.5, 1800, 'highpass'); blip(140, 0.1, 'square', 0.25); },
    crash() { noiseBurst(0.3, 0.5, 500); blip(70, 0.25, 'sawtooth', 0.3); },
    horn() { blip(370, 0.22, 'sawtooth', 0.16); blip(466, 0.22, 'sawtooth', 0.14); },
    bark() { blip(300 + Math.random() * 200, 0.12, 'triangle', 0.1); },
    missionDone() {
      [523, 659, 784, 1046].forEach((f, i) => blip(f, 0.18, 'triangle', 0.2, i * 0.09));
    },
    // Engine hum: one sawtooth through a low-pass, pitch and gain follow
    // speed. Called every frame while driving; silent on foot.
    engine(speedNorm, on) {
      if (!ensure()) return;
      if (!on) {
        if (engineGain) engineGain.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
        return;
      }
      if (!engineOsc) {
        engineOsc = ctx.createOscillator(); engineOsc.type = 'sawtooth';
        engineFilter = ctx.createBiquadFilter(); engineFilter.type = 'lowpass'; engineFilter.frequency.value = 600;
        engineGain = ctx.createGain(); engineGain.gain.value = 0;
        engineOsc.connect(engineFilter); engineFilter.connect(engineGain); engineGain.connect(sfxBus);
        engineOsc.start();
      }
      const t = ctx.currentTime;
      engineOsc.frequency.setTargetAtTime(55 + speedNorm * 160, t, 0.05);
      engineFilter.frequency.setTargetAtTime(400 + speedNorm * 1400, t, 0.05);
      engineGain.gain.setTargetAtTime(muted ? 0 : 0.05 + speedNorm * 0.07, t, 0.05);
    },
    // Two-tone police siren, toggled by wanted level.
    siren(on, dt) {
      if (!ensure()) return;
      if (!on) {
        if (sirenGain) sirenGain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
        return;
      }
      if (!sirenOsc) {
        sirenOsc = ctx.createOscillator(); sirenOsc.type = 'sine';
        sirenGain = ctx.createGain(); sirenGain.gain.value = 0;
        sirenOsc.connect(sirenGain); sirenGain.connect(sfxBus);
        sirenOsc.start();
      }
      sirenTimer += dt;
      if (sirenTimer > 0.45) { sirenTimer = 0; sirenHigh = !sirenHigh; }
      sirenOsc.frequency.setTargetAtTime(sirenHigh ? 880 : 660, ctx.currentTime, 0.02);
      sirenGain.gain.setTargetAtTime(muted ? 0 : 0.045, ctx.currentTime, 0.1);
    },
    // Tiny synth radio: a looping bassline + hats, toggled with R.
    toggleRadio() {
      if (!ensure()) return radioOn;
      radioOn = !radioOn;
      if (radioOn) {
        const bass = [55, 55, 65.4, 49, 55, 55, 73.4, 65.4];
        radioTimer = setInterval(() => {
          if (muted || !ctx) return;
          const f = bass[radioStep % bass.length];
          blip(f, 0.22, 'triangle', 0.22);
          if (radioStep % 2 === 0) noiseBurst(0.03, 0.05, 6000, 'highpass');
          radioStep++;
        }, 240);
      } else if (radioTimer) {
        clearInterval(radioTimer); radioTimer = null;
      }
      return radioOn;
    },
    radioLine() { return BARKS.radio[(Math.random() * BARKS.radio.length) | 0]; },
  };
}
