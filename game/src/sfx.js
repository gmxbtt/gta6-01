// sfx.js — every sound in Solmar Bay is synthesized live with WebAudio.
// No audio files, no network: oscillators, noise buffers and a step sequencer.

export class SoundBank {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.musicMode = 'cruise'; // cruise | chase | night
    this._engine = null;       // { osc, osc2, gain }
    this._siren = null;        // { osc, gain, lfo }
    this._seqTimer = 0;
    this._step = 0;
    this._nextNote = 0;
    this._noiseBuf = null;
  }

  boot() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 1;
    this._noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this._noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this._nextNote = this.ctx.currentTime + 0.1;
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  _tone(freq, dur, type, vol, when = 0, slideTo = 0) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo > 0) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  _noise(dur, vol, filterFreq, when = 0) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + when;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  ui() { this._tone(660, 0.08, 'square', 0.12); }
  coin() {
    this._tone(988, 0.09, 'sine', 0.22);
    this._tone(1319, 0.16, 'sine', 0.22, 0.08);
  }
  punch() { this._noise(0.12, 0.5, 900); this._tone(140, 0.1, 'sine', 0.3, 0, 60); }
  crash(strength = 1) {
    this._noise(0.35, 0.5 * strength, 500);
    this._tone(90, 0.25, 'sine', 0.4 * strength, 0, 40);
  }
  shot() {
    this._noise(0.09, 0.4, 2400);
    this._tone(220, 0.08, 'square', 0.2, 0, 70);
  }
  pickup() { this._tone(523, 0.1, 'triangle', 0.25); this._tone(784, 0.14, 'triangle', 0.25, 0.07); }
  missionDone() {
    [523, 659, 784, 1047].forEach((f, i) => this._tone(f, 0.22, 'triangle', 0.25, i * 0.11));
  }
  busted() {
    [392, 330, 262].forEach((f, i) => this._tone(f, 0.3, 'sawtooth', 0.18, i * 0.22));
  }

  engineSet(running, speed01) {
    if (!this.ctx) return;
    if (running && !this._engine) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = 70;
      const osc2 = this.ctx.createOscillator();
      osc2.type = 'square';
      osc2.frequency.value = 35;
      const g = this.ctx.createGain();
      g.gain.value = 0.0;
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 700;
      osc.connect(f); osc2.connect(f); f.connect(g).connect(this.master);
      osc.start(); osc2.start();
      this._engine = { osc, osc2, gain: g };
    }
    if (!this._engine) return;
    const t = this.ctx.currentTime;
    const target = running ? 0.05 + speed01 * 0.09 : 0;
    this._engine.gain.gain.setTargetAtTime(target, t, 0.1);
    this._engine.osc.frequency.setTargetAtTime(60 + speed01 * 190, t, 0.08);
    this._engine.osc2.frequency.setTargetAtTime(30 + speed01 * 95, t, 0.08);
  }

  sirenSet(on) {
    if (!this.ctx) return;
    if (on && !this._siren) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 750;
      const lfo = this.ctx.createOscillator();
      lfo.type = 'square';
      lfo.frequency.value = 0.55;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 220;
      lfo.connect(lfoGain).connect(osc.frequency);
      const g = this.ctx.createGain();
      g.gain.value = 0.035;
      osc.connect(g).connect(this.master);
      osc.start(); lfo.start();
      this._siren = { osc, lfo, gain: g };
    } else if (!on && this._siren) {
      try { this._siren.osc.stop(); this._siren.lfo.stop(); } catch (e) { /* already stopped */ }
      this._siren = null;
    }
  }

  setMusic(mode) {
    if (mode !== this.musicMode) {
      this.musicMode = mode;
      this._step = 0;
    }
  }

  // Called every frame; schedules sequencer notes a little ahead of time.
  tick() {
    if (!this.ctx || this.muted) return;
    const bpm = this.musicMode === 'chase' ? 132 : this.musicMode === 'night' ? 96 : 84;
    const stepDur = 60 / bpm / 2; // eighth notes
    while (this._nextNote < this.ctx.currentTime + 0.18) {
      this._scheduleStep(this._step, this._nextNote, stepDur);
      this._step = (this._step + 1) % 32;
      this._nextNote += stepDur;
    }
  }

  _scheduleStep(step, t, stepDur) {
    if (!this.ctx) return;
    const when = Math.max(0, t - this.ctx.currentTime);
    const mode = this.musicMode;
    // Bass line: root notes per bar, different per mood.
    const bassRoots = mode === 'chase'
      ? [55, 55, 65.4, 49]
      : mode === 'night'
        ? [55, 43.65, 49, 58.27]
        : [65.4, 49, 55, 49];
    const bar = Math.floor(step / 8) % 4;
    const root = bassRoots[bar];
    if (step % 2 === 0) {
      const f = root * (step % 8 === 6 ? 1.5 : 1);
      this._toneAt(f, stepDur * 0.9, 'triangle', 0.16, when);
    }
    // Hat tick on off-beats for chase, sparse for cruise.
    if ((mode === 'chase' && step % 2 === 1) || (mode !== 'chase' && step % 4 === 2)) {
      this._noiseAt(0.03, 0.05, 6000, when);
    }
    // Chord stab at the top of each bar.
    if (step % 8 === 0) {
      const chord = mode === 'night'
        ? [220, 261.6, 329.6]
        : mode === 'chase'
          ? [110, 130.8, 164.8]
          : [196, 246.9, 293.7];
      chord.forEach((f) => this._toneAt(f, stepDur * 3, 'sawtooth', 0.045, when));
    }
    // Night mode adds a little arpeggio sparkle.
    if (mode === 'night' && step % 2 === 0) {
      const arp = [440, 523.25, 659.25, 523.25];
      this._toneAt(arp[(step / 2) % 4], stepDur * 0.8, 'sine', 0.07, when);
    }
  }

  _toneAt(freq, dur, type, vol, when) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  _noiseAt(dur, vol, filterFreq, when) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + when;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }
}
