// audio.js — all sound is synthesized live with WebAudio. No audio files.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.musicOn = true;
    this.musicTimer = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenOn = false;
    this.muted = false;
  }

  // Must be called from a user gesture (the Start button).
  init() {
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
    this._startEngineLoop();
    this._startMusic();
  }

  _startEngineLoop() {
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 420;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0.0;
    this.engineOsc.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
  }

  // speedRatio 0..1, onFoot true when the player is walking.
  setEngine(speedRatio, onFoot) {
    if (!this.ctx || !this.engineOsc) return;
    const t = this.ctx.currentTime;
    const target = onFoot ? 0.0 : 0.05 + speedRatio * 0.11;
    this.engineGain.gain.setTargetAtTime(target, t, 0.1);
    this.engineOsc.frequency.setTargetAtTime(52 + speedRatio * 145, t, 0.08);
    this.engineFilter.frequency.setTargetAtTime(380 + speedRatio * 900, t, 0.1);
  }

  _noiseBuffer(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  _blip(freq, dur, type, vol, slideTo) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  _noiseHit(dur, vol, filterFreq) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer(dur + 0.05);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = filterFreq || 800;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol || 0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  click() { this._blip(660, 0.07, 'square', 0.08); }
  punch() { this._noiseHit(0.12, 0.35, 500); this._blip(140, 0.1, 'sine', 0.3, 60); }
  crash(intensity) {
    const v = Math.min(0.6, 0.2 + (intensity || 0.3) * 0.5);
    this._noiseHit(0.3, v, 600);
    this._blip(90, 0.25, 'sine', 0.35, 40);
  }
  pickup() { this._blip(880, 0.09, 'sine', 0.18); this._blip(1320, 0.14, 'sine', 0.15); }
  cash() {
    if (!this.ctx) return;
    [523, 659, 784, 1047].forEach((f, i) => {
      setTimeout(() => this._blip(f, 0.16, 'triangle', 0.18), i * 85);
    });
  }
  fail() { this._blip(220, 0.35, 'sawtooth', 0.15, 110); }
  horn() { this._blip(370, 0.22, 'square', 0.1); this._blip(466, 0.22, 'square', 0.08); }
  door() { this._noiseHit(0.08, 0.15, 1200); this._blip(180, 0.08, 'sine', 0.15, 90); }

  setSiren(on) {
    if (!this.ctx) return;
    if (on === this.sirenOn) return;
    this.sirenOn = on;
    if (on) {
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'triangle';
      this.sirenOsc.frequency.value = 720;
      const lfo = this.ctx.createOscillator();
      lfo.type = 'square';
      lfo.frequency.value = 1.4;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 180;
      lfo.connect(lfoGain);
      lfoGain.connect(this.sirenOsc.frequency);
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0.045;
      this.sirenOsc.connect(this.sirenGain);
      this.sirenGain.connect(this.master);
      this.sirenOsc.start();
      lfo.start();
      this._sirenLfo = lfo;
    } else if (this.sirenOsc) {
      try { this.sirenOsc.stop(); this._sirenLfo.stop(); } catch (e) { /* already stopped */ }
      this.sirenOsc.disconnect();
      this.sirenOsc = null;
    }
  }

  // A lazy sunset groove: soft pad chords + a walking bassline, scheduled ahead.
  _startMusic() {
    if (!this.ctx || this.musicTimer) return;
    // Am9 – Fmaj7 – Cmaj7 – G6, one bar each, 100 BPM feel.
    const chords = [
      [220.0, 261.63, 329.63, 392.0],
      [174.61, 220.0, 261.63, 329.63],
      [196.0, 246.94, 293.66, 329.63],
      [196.0, 246.94, 293.66, 392.0],
    ];
    const bass = [110.0, 87.31, 130.81, 98.0];
    let bar = 0;
    const barLen = 2400;
    this.musicTimer = setInterval(() => {
      if (!this.ctx || this.muted || !this.musicOn) return;
      const chord = chords[bar % 4];
      const t = this.ctx.currentTime;
      chord.forEach((f) => {
        const osc = this.ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = f / 2;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.035, t + 0.6);
        g.gain.setValueAtTime(0.035, t + barLen / 1000 - 0.7);
        g.gain.linearRampToValueAtTime(0.0001, t + barLen / 1000);
        osc.connect(g);
        g.connect(this.master);
        osc.start(t);
        osc.stop(t + barLen / 1000 + 0.05);
      });
      [0, 1, 2, 3].forEach((beat) => {
        const bt = t + beat * (barLen / 4000);
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = bass[bar % 4] * (beat === 3 ? 1.5 : 1);
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.0001, bt);
        g.gain.linearRampToValueAtTime(0.07, bt + 0.05);
        g.gain.exponentialRampToValueAtTime(0.001, bt + 0.5);
        osc.connect(g);
        g.connect(this.master);
        osc.start(bt);
        osc.stop(bt + 0.55);
      });
      bar++;
    }, barLen);
  }

  toggleMusic() {
    this.musicOn = !this.musicOn;
    return this.musicOn;
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }
}
