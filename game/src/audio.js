// Sound, synthesised live with WebAudio: an engine drone tied to RPM, wind tied
// to speed, and chimes for rings, landings and crashes. No audio files.
export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineOsc2 = null;
  let engineGain = null;
  let engineFilter = null;
  let windSrc = null;
  let windGain = null;
  let windFilter = null;
  let muted = false;
  let started = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      // Engine: two detuned saws through a lowpass.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      engineOsc2 = ctx.createOscillator();
      engineOsc2.type = 'sawtooth';
      engineOsc2.frequency.value = 55 * 1.007;
      engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 320;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineFilter);
      engineOsc2.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      engineOsc2.start();
      // Wind: looped noise through a bandpass.
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
      windSrc = ctx.createBufferSource();
      windSrc.buffer = buf;
      windSrc.loop = true;
      windFilter = ctx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 500;
      windFilter.Q.value = 0.6;
      windGain = ctx.createGain();
      windGain.gain.value = 0;
      windSrc.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(master);
      windSrc.start();
      started = true;
      return true;
    } catch {
      return false;
    }
  }

  function blip(freq, dur, type, gain, when = 0) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  function noiseBurst(dur, gain, freq) {
    if (!ctx || muted) return;
    const t = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start(t);
  }

  return {
    /** Call on the first user gesture; browsers block audio before it. */
    unlock() {
      if (ensure() && ctx.state === 'suspended') ctx.resume();
    },
    /** Continuous engine + wind, from flight state. Call every frame. */
    update(flight) {
      if (!started || muted) {
        if (engineGain) engineGain.gain.value = 0;
        if (windGain) windGain.gain.value = 0;
        return;
      }
      if (ctx.state === 'suspended') return;
      const rpm = flight.onGround ? 0.25 + flight.throttle * 0.5 : 0.45 + flight.throttle * 0.55;
      const freq = 52 + rpm * 105;
      engineOsc.frequency.setTargetAtTime(freq, ctx.currentTime, 0.08);
      engineOsc2.frequency.setTargetAtTime(freq * 1.007, ctx.currentTime, 0.08);
      engineFilter.frequency.setTargetAtTime(240 + rpm * 900, ctx.currentTime, 0.1);
      engineGain.gain.setTargetAtTime(flight.onGround ? 0.05 + flight.throttle * 0.06 : 0.05 + flight.throttle * 0.075, ctx.currentTime, 0.1);
      const wind = Math.min(1, flight.speed / 90);
      windGain.gain.setTargetAtTime(wind * wind * 0.16, ctx.currentTime, 0.15);
      windFilter.frequency.setTargetAtTime(320 + flight.speed * 9, ctx.currentTime, 0.15);
    },
    ring() {
      blip(880, 0.14, 'sine', 0.22);
      blip(1318, 0.22, 'sine', 0.18, 0.09);
    },
    land() {
      noiseBurst(0.25, 0.3, 300);
      blip(220, 0.18, 'sine', 0.2);
    },
    crash() {
      noiseBurst(0.7, 0.5, 900);
      blip(70, 0.5, 'sine', 0.35);
    },
    click() {
      blip(660, 0.07, 'square', 0.08);
    },
    stall() {
      blip(440, 0.12, 'square', 0.1);
      blip(440, 0.12, 'square', 0.1, 0.16);
    },
    setMuted(m) {
      muted = m;
      if (master) master.gain.value = m ? 0 : 0.5;
    },
    isMuted() {
      return muted;
    },
  };
}
