// Most ambient and mechanical sounds are synthesised at runtime with WebAudio.
// Declared combat cues always use their custom samples once audio is enabled.
import { clamp, rand } from './math.js';
import { OPERATOR_VOICE_SAMPLE_URLS } from '../game/operator-voice.js';
import { STREAK_VOICE_SAMPLE_URLS } from '../game/streak-voice.js';

export const JUGGERNAUT_BREATH_LOOP_OFFSET_SECONDS = 1.5;
export const JUGGERNAUT_BREATH_LOOP_GAP_SECONDS = 0.4;

// Immutable per-calibre balance. Keeping this table outside `shot()` avoids
// allocating a profile object for every round of high-RPM automatic fire.
const FIREARM_REPORT_MIXES = Object.freeze({
  rifle: Object.freeze({
    crack: 0.86, muzzle: 0.92, pressure: 0.88, action: 0.18,
    reflection: 0.19, tail: 0.11, actionDelay: 0.032,
  }),
  smg: Object.freeze({
    crack: 0.68, muzzle: 0.84, pressure: 0.64, action: 0.18,
    reflection: 0.07, tail: 0, actionDelay: 0.026,
  }),
  machine_pistol: Object.freeze({
    crack: 0.78, muzzle: 0.52, pressure: 0.30, action: 0.36,
    reflection: 0, tail: 0, actionDelay: 0.014,
  }),
  magnum: Object.freeze({
    crack: 1.02, muzzle: 1.08, pressure: 1.18, action: 0.16,
    reflection: 0.28, tail: 0.19, actionDelay: 0.046,
  }),
  shotgun: Object.freeze({
    crack: 0.88, muzzle: 1.42, pressure: 1.62, action: 0.11,
    reflection: 0.38, tail: 0.18, actionDelay: 0.072,
  }),
  sniper: Object.freeze({
    crack: 1.36, muzzle: 0.96, pressure: 1.22, action: 0.10,
    reflection: 0.34, tail: 0.48, actionDelay: 0.052,
  }),
  minigun: Object.freeze({
    crack: 0.66, muzzle: 0.72, pressure: 0.47, action: 0.10,
    reflection: 0, tail: 0, actionDelay: 0.016,
  }),
  railgun: Object.freeze({
    crack: 1.45, muzzle: 0.82, pressure: 1.35, action: 0.30,
    reflection: 0.44, tail: 0.52, actionDelay: 0.06,
  }),
});

export const SAMPLE_URLS = Object.freeze({
  grenadePin: new URL('../../assets/audio/grenade-pin-pull.mp3', import.meta.url).href,
  hitmarker: new URL('../../assets/audio/hitmarker.mp3', import.meta.url).href,
  armorCrack: new URL('../../assets/audio/armor-crack.mp3', import.meta.url).href,
  killConfirm: new URL('../../assets/audio/kill-confirm.mp3', import.meta.url).href,
  uavSweep: new URL('../../assets/audio/uav-sweep.mp3', import.meta.url).href,
  missileLaunch: new URL('../../assets/audio/missile-launch.mp3', import.meta.url).href,
  missileIncoming: new URL('../../assets/audio/missile-incoming.mp3', import.meta.url).href,
  missileImpact: new URL('../../assets/audio/missile-impact.mp3', import.meta.url).href,
  sentryShot: new URL('../../assets/audio/sentry-shot.mp3', import.meta.url).href,
  desertEagleShot: new URL('../../audio/deagle-shot-sound.mp3', import.meta.url).href,
  matchAmbience: new URL('../../audio/bgs.mp3', import.meta.url).href,
  casFlyby: new URL('../../audio/a10flyover.mp3', import.meta.url).href,
  casCannon: new URL('../../audio/a10shoot.mp3', import.meta.url).href,
  bomberFlyby: new URL('../../audio/bomber.mp3', import.meta.url).href,
  helicopterLoop: new URL('../../audio/helicopter.mp3', import.meta.url).href,
  streakReady: new URL('../../audio/attack/killstreak-rewards-ready.mp3', import.meta.url).href,
  juggernautBreathing: new URL('../../audio/attack/fearless-breath.mp3', import.meta.url).href,
  ...OPERATOR_VOICE_SAMPLE_URLS,
  ...STREAK_VOICE_SAMPLE_URLS,
});

export class AudioEngine {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.ready = false;
    this.samples = new Map();
    this.sampleState = 'idle';
    this._samplePromise = null;
    this.pendingSamples = [];
    this.pendingManagedLoops = new Map();
    this.managedLoops = new Map();
    this.failedSamples = new Set();
    this.dialogueBusy = false;
    this.dialogueToken = 0;
    this.dialogueSource = null;
    this.juggernautBreathingActive = false;
    this.juggernautBreathingToken = 0;
    this.juggernautBreathingSource = null;
    this.railgunCharge = null;
    this.listener = { x: 0, y: 0, z: 0, rx: 1, ry: 0, rz: 0, fx: 0, fy: 0, fz: -1 };
  }

  /** Must be called from a user gesture. */
  resume() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.settings.volume;
      this.comp = this.ctx.createDynamicsCompressor();
      this.comp.threshold.value = -14;
      this.comp.knee.value = 22;
      this.comp.ratio.value = 8;
      this.comp.attack.value = 0.003;
      this.comp.release.value = 0.22;
      this.master.connect(this.comp);
      this.comp.connect(this.ctx.destination);
      this._noise = this._makeNoise(2);
      this.ready = true;
      this._loadSamples();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.master.gain.value = this.settings.volume;
  }

  /** Decode the custom combat samples once and release any queued first-use cues. */
  _loadSamples() {
    if (this._samplePromise) return this._samplePromise;
    this.sampleState = 'loading';
    this._samplePromise = Promise.all(Object.entries(SAMPLE_URLS).map(async ([name, url]) => {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const buffer = await this.ctx.decodeAudioData(await response.arrayBuffer());
        this.samples.set(name, buffer);
        this._flushPendingSamples(name);
        this._flushPendingManagedLoops(name);
        return true;
      } catch {
        this.failedSamples.add(name);
        this._flushPendingSamples(name);
        this._flushPendingManagedLoops(name, true);
        return false;
      }
    })).then((loaded) => {
      this.sampleState = loaded.every(Boolean) ? 'ready' : this.samples.size ? 'partial' : 'fallback';
      this._flushPendingSamples();
      this._flushPendingManagedLoops();
      return this.sampleState;
    });
    return this._samplePromise;
  }

  _makeNoise(seconds) {
    const sr = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, sr * seconds, sr);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + w * 0.6) * 0.65; // slightly brown-ish, less hissy
      d[i] = clamp(w * 0.7 + last * 0.6, -1, 1);
    }
    return buf;
  }

  setListener(pos, right, forward) {
    this.listener.x = pos.x; this.listener.y = pos.y; this.listener.z = pos.z;
    this.listener.rx = right.x; this.listener.ry = right.y; this.listener.rz = right.z;
    this.listener.fx = forward.x; this.listener.fy = forward.y; this.listener.fz = forward.z;
  }

  /** Distance gain, stereo pan and air-absorption cutoff for a world point. */
  _spatial(pos) {
    if (!pos) return { gain: 1, pan: 0, cutoff: 20000 };
    const L = this.listener;
    const dx = pos.x - L.x, dy = pos.y - L.y, dz = pos.z - L.z;
    const dist = Math.hypot(dx, dy, dz);
    const ref = 6;
    const gain = clamp(ref / (ref + dist * dist * 0.06), 0, 1);
    const inv = dist > 0.001 ? 1 / dist : 0;
    const pan = clamp((dx * L.rx + dy * L.ry + dz * L.rz) * inv, -1, 1) * 0.85;
    const cutoff = clamp(20000 - dist * 320, 700, 20000);
    return { gain, pan, cutoff, dist };
  }

  _chain(pos, gainValue, distanceAttenuation = true) {
    const ctx = this.ctx;
    const sp = this._spatial(pos);
    const g = ctx.createGain();
    g.gain.value = gainValue * (distanceAttenuation ? sp.gain : 1);
    let node = g;
    if (sp.cutoff < 19000) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = sp.cutoff;
      g.connect(lp);
      node = lp;
    }
    const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (panner) {
      panner.pan.value = sp.pan;
      node.connect(panner);
      panner.connect(this.master);
    } else {
      node.connect(this.master);
    }
    return { input: g, sp };
  }

  _noiseSource(dur, playbackRate = 1, delay = 0) {
    const s = this.ctx.createBufferSource();
    s.buffer = this._noise;
    s.playbackRate.value = playbackRate;
    s.loop = true;
    const off = Math.random() * (this._noise.duration - dur - 0.01);
    const startAt = this.ctx.currentTime + Math.max(0, delay);
    s.start(startAt, Math.max(0, off));
    s.stop(startAt + dur + 0.02);
    return s;
  }

  _playSample(name, {
    gain = 1,
    rate = 1,
    pos = null,
    delay = 0,
    distanceAttenuation = true,
    loop = false,
    loopStart = 0,
    loopEnd = 0,
    offset = 0,
    onStart = null,
    onEnded = null,
  } = {}) {
    const buffer = this.samples.get(name);
    if (!buffer) return false;
    const ctx = this.ctx;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    source.loop = !!loop;
    if (source.loop) {
      source.loopStart = clamp(Number(loopStart) || 0, 0, buffer.duration);
      source.loopEnd = clamp(
        Number(loopEnd) || buffer.duration,
        source.loopStart,
        buffer.duration
      );
    }
    const { input } = this._chain(pos, gain, distanceAttenuation);
    source.connect(input);
    if (typeof onStart === 'function') onStart(source);
    if (typeof onEnded === 'function') {
      source.addEventListener('ended', onEnded, { once: true });
    }
    source.start(
      ctx.currentTime + delay,
      clamp(Number(offset) || 0, 0, buffer.duration)
    );
    return true;
  }

  /**
   * Play a custom cue, or reserve it while the first user gesture is decoding
   * samples. Returning true for every declared sample suppresses the procedural
   * fallback, so entering an early PVP room cannot sound different from a later
   * room after the browser cache is warm.
   */
  _sample(name, options = {}) {
    if (!this.ready) return false;
    if (this._playSample(name, options)) return true;
    if (!SAMPLE_URLS[name]) return false;
    if (this.sampleState === 'loading') {
      const pos = options.pos
        ? { x: options.pos.x, y: options.pos.y, z: options.pos.z }
        : null;
      if (this.pendingSamples.length >= 48) {
        const discarded = this.pendingSamples.shift();
        discarded?.options?.onEnded?.();
      }
      this.pendingSamples.push({
        name,
        options: { ...options, pos },
        requestedAt: this.ctx.currentTime,
      });
    }
    // A declared custom cue never falls back to a synthesized replacement.
    return true;
  }

  _flushPendingSamples(onlyName = null) {
    if (!this.ready || this.pendingSamples.length === 0) return;
    const selected = [];
    const retained = [];
    for (const pending of this.pendingSamples) {
      if (onlyName && pending.name !== onlyName) retained.push(pending);
      else selected.push(pending);
    }
    this.pendingSamples = retained;
    const playable = selected.filter((pending) => this.samples.has(pending.name));
    for (const pending of selected) {
      if (!this.samples.has(pending.name)) pending.options?.onEnded?.();
    }
    if (playable.length === 0) return;
    const firstAt = playable[0].requestedAt;
    for (const pending of playable) {
      const queueDelay = Math.max(0, pending.requestedAt - firstAt);
      this._playSample(pending.name, {
        ...pending.options,
        delay: Math.max(0, pending.options.delay || 0) + queueDelay,
      });
    }
  }

  _copyWorldPoint(pos) {
    return pos
      ? { x: Number(pos.x) || 0, y: Number(pos.y) || 0, z: Number(pos.z) || 0 }
      : null;
  }

  /**
   * Long aircraft and ambience recordings need a persistent source whose
   * position and gain can follow the visible entity. One-shot `_sample()` calls
   * cannot do that: their pan/attenuation is frozen at creation time.
   */
  startManagedLoop(id, sample, {
    gain = 1,
    pos = null,
    maxDistance = 240,
    fadeIn = 0.8,
    rate = 1,
    loop = true,
    offset = 0,
  } = {}) {
    if (!this.ready || !id || !SAMPLE_URLS[sample] || this.failedSamples.has(sample)) {
      return false;
    }
    const active = this.managedLoops.get(id);
    if (active) {
      this.updateManagedLoop(id, { gain, pos, maxDistance });
      return true;
    }
    if (this.pendingManagedLoops.has(id)) {
      this.updateManagedLoop(id, { gain, pos, maxDistance });
      return true;
    }
    const pending = {
      id,
      sample,
      gain: Math.max(0, Number(gain) || 0),
      pos: this._copyWorldPoint(pos),
      maxDistance: Math.max(1, Number(maxDistance) || 240),
      fadeIn: Math.max(0, Number(fadeIn) || 0),
      rate: Math.max(0.05, Number(rate) || 1),
      loop: loop !== false,
      offset: Math.max(0, Number(offset) || 0),
      requestedAt: this.ctx.currentTime,
    };
    this.pendingManagedLoops.set(id, pending);
    if (this.samples.has(sample)) this._launchManagedLoop(pending);
    return true;
  }

  _launchManagedLoop(spec) {
    const buffer = this.samples.get(spec.sample);
    if (!buffer || this.managedLoops.has(spec.id)) return false;
    const ctx = this.ctx;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = spec.rate;
    source.loop = spec.loop;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 20000;
    const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    const gainNode = ctx.createGain();
    gainNode.gain.value = 0.0001;
    source.connect(filter);
    if (panner) {
      filter.connect(panner);
      panner.connect(gainNode);
    } else {
      filter.connect(gainNode);
    }
    gainNode.connect(this.master);

    const active = {
      ...spec,
      source,
      filter,
      panner,
      gainNode,
    };
    this.pendingManagedLoops.delete(spec.id);
    this.managedLoops.set(spec.id, active);
    source.addEventListener('ended', () => {
      if (this.managedLoops.get(spec.id) === active) {
        this.managedLoops.delete(spec.id);
      }
    }, { once: true });
    const elapsedWhileLoading = Math.max(
      0,
      ctx.currentTime - (Number(spec.requestedAt) || ctx.currentTime)
    );
    const playbackOffset = spec.offset + elapsedWhileLoading;
    const safeOffset = spec.loop
      ? playbackOffset % Math.max(0.001, buffer.duration)
      : Math.min(playbackOffset, Math.max(0, buffer.duration - 0.01));
    source.start(ctx.currentTime, safeOffset);
    this._applyManagedLoop(active, Math.max(0.035, spec.fadeIn / 3));
    return true;
  }

  _flushPendingManagedLoops(onlyName = null, failed = false) {
    for (const [id, pending] of [...this.pendingManagedLoops]) {
      if (onlyName && pending.sample !== onlyName) continue;
      if (failed || this.failedSamples.has(pending.sample)) {
        this.pendingManagedLoops.delete(id);
        continue;
      }
      if (this.samples.has(pending.sample)) this._launchManagedLoop(pending);
    }
  }

  _applyManagedLoop(active, smoothing = 0.055) {
    const sp = this._spatial(active.pos);
    const proximity = active.pos
      ? clamp(1 - (sp.dist || 0) / active.maxDistance, 0, 1)
      : 1;
    // A shallow power curve preserves the distant airframe rumble while still
    // making a close pass substantially louder.
    const targetGain = active.gain * Math.pow(proximity, 0.68);
    const cutoff = active.pos
      ? 850 + (20000 - 850) * Math.pow(proximity, 0.55)
      : 20000;
    const now = this.ctx.currentTime;
    const setSmooth = (param, value) => {
      if (!param) return;
      if (typeof param.cancelScheduledValues === 'function') {
        param.cancelScheduledValues(now);
      }
      if (typeof param.setTargetAtTime === 'function') {
        param.setTargetAtTime(value, now, Math.max(0.01, smoothing));
      } else {
        param.value = value;
      }
    };
    setSmooth(active.gainNode.gain, Math.max(0.0001, targetGain));
    setSmooth(active.filter.frequency, cutoff);
    if (active.panner) setSmooth(active.panner.pan, sp.pan || 0);
  }

  updateManagedLoop(id, {
    gain,
    pos,
    maxDistance,
  } = {}) {
    const pending = this.pendingManagedLoops.get(id);
    if (pending) {
      if (gain !== undefined) pending.gain = Math.max(0, Number(gain) || 0);
      if (pos !== undefined) pending.pos = this._copyWorldPoint(pos);
      if (maxDistance !== undefined) {
        pending.maxDistance = Math.max(1, Number(maxDistance) || pending.maxDistance);
      }
      return true;
    }
    const active = this.managedLoops.get(id);
    if (!active) return false;
    if (gain !== undefined) active.gain = Math.max(0, Number(gain) || 0);
    if (pos !== undefined) active.pos = this._copyWorldPoint(pos);
    if (maxDistance !== undefined) {
      active.maxDistance = Math.max(1, Number(maxDistance) || active.maxDistance);
    }
    this._applyManagedLoop(active);
    return true;
  }

  stopManagedLoop(id, fadeOut = 0.8) {
    const hadPending = this.pendingManagedLoops.delete(id);
    const active = this.managedLoops.get(id);
    if (!active) return hadPending;
    this.managedLoops.delete(id);
    const now = this.ctx.currentTime;
    const fade = Math.max(0, Number(fadeOut) || 0);
    const param = active.gainNode.gain;
    if (typeof param.cancelScheduledValues === 'function') param.cancelScheduledValues(now);
    if (fade > 0 && typeof param.setTargetAtTime === 'function') {
      param.setTargetAtTime(0.0001, now, Math.max(0.015, fade / 3));
    } else {
      param.value = 0.0001;
    }
    try {
      active.source.stop(now + fade + 0.04);
    } catch {
      // It may have reached the natural end of a non-looping flyby.
    }
    return true;
  }

  stopAllManagedLoops(fadeOut = 0.35) {
    this.pendingManagedLoops.clear();
    for (const id of [...this.managedLoops.keys()]) {
      this.stopManagedLoop(id, fadeOut);
    }
    this.stopRailgunCharge(Math.min(0.08, Math.max(0, fadeOut)));
  }

  /**
   * Drive the local ARC-7 capacitor sound from the same normalized progress as
   * the one-second HUD charge bar. A restrained electrical hum, a rising coil
   * whine and filtered arcing noise share one envelope, so it reads as heavy
   * machinery charging rather than a clean arcade oscillator.
   */
  updateRailgunCharge(progress = 0) {
    const amount = clamp(Number(progress) || 0, 0, 1);
    if (amount <= 0) return this.stopRailgunCharge(0.045);
    if (!this.ready || !this.ctx || !this.master || !this._noise) return false;

    const ctx = this.ctx;
    const now = ctx.currentTime;
    if (!this.railgunCharge) {
      const output = ctx.createGain();
      output.gain.value = 0.0001;
      output.connect(this.master);

      const hum = ctx.createOscillator();
      hum.type = 'sawtooth';
      hum.frequency.value = 52;
      const humFilter = ctx.createBiquadFilter();
      humFilter.type = 'lowpass';
      humFilter.frequency.value = 240;
      humFilter.Q.value = 0.72;
      const humGain = ctx.createGain();
      humGain.gain.value = 0.075;
      hum.connect(humFilter);
      humFilter.connect(humGain);
      humGain.connect(output);

      const whine = ctx.createOscillator();
      whine.type = 'triangle';
      whine.frequency.value = 185;
      const whineGain = ctx.createGain();
      whineGain.gain.value = 0.012;
      whine.connect(whineGain);
      whineGain.connect(output);

      const arc = ctx.createBufferSource();
      arc.buffer = this._noise;
      arc.loop = true;
      arc.playbackRate.value = 0.72;
      const arcFilter = ctx.createBiquadFilter();
      arcFilter.type = 'bandpass';
      arcFilter.frequency.value = 650;
      arcFilter.Q.value = 3.1;
      const arcGain = ctx.createGain();
      arcGain.gain.value = 0.025;
      arc.connect(arcFilter);
      arcFilter.connect(arcGain);
      arcGain.connect(output);

      hum.start(now);
      whine.start(now);
      arc.start(now);
      this.railgunCharge = {
        output,
        hum,
        humFilter,
        humGain,
        whine,
        whineGain,
        arc,
        arcFilter,
        arcGain,
      };
    }

    const active = this.railgunCharge;
    const eased = amount * amount * (3 - 2 * amount);
    const smooth = (param, value, timeConstant = 0.025) => {
      if (typeof param.cancelScheduledValues === 'function') {
        param.cancelScheduledValues(now);
      }
      if (typeof param.setTargetAtTime === 'function') {
        param.setTargetAtTime(value, now, timeConstant);
      } else {
        param.value = value;
      }
    };
    smooth(active.output.gain, 0.38 + eased * 0.62, 0.018);
    smooth(active.hum.frequency, 52 + eased * 48);
    smooth(active.humFilter.frequency, 220 + eased * 260);
    smooth(active.humGain.gain, 0.075 + eased * 0.055);
    smooth(active.whine.frequency, 185 + Math.pow(amount, 1.65) * 2180, 0.018);
    smooth(active.whineGain.gain, 0.012 + eased * 0.078);
    smooth(active.arc.playbackRate, 0.72 + eased * 0.74);
    smooth(active.arcFilter.frequency, 650 + Math.pow(amount, 1.4) * 5700, 0.018);
    smooth(active.arcFilter.Q, 3.1 + eased * 2.4);
    smooth(active.arcGain.gain, 0.025 + eased * 0.17);
    return true;
  }

  stopRailgunCharge(fadeOut = 0.045) {
    const active = this.railgunCharge;
    if (!active) return false;
    this.railgunCharge = null;
    const now = this.ctx?.currentTime || 0;
    const fade = Math.max(0, Number(fadeOut) || 0);
    const gain = active.output.gain;
    if (typeof gain.cancelScheduledValues === 'function') gain.cancelScheduledValues(now);
    if (fade > 0 && typeof gain.setTargetAtTime === 'function') {
      gain.setTargetAtTime(0.0001, now, Math.max(0.008, fade / 3));
    } else {
      gain.value = 0.0001;
    }
    for (const source of [active.hum, active.whine, active.arc]) {
      try {
        source.stop(now + fade + 0.025);
      } catch {
        // The source can already be stopped by a completed discharge.
      }
    }
    return true;
  }

  /** Massive electromagnetic discharge shared by local and spatial PVP fire. */
  railgunDischarge(pos = null) {
    if (!this.ready) return;
    this.stopRailgunCharge(0.015);
    // Armature crack: an almost instantaneous supersonic front.
    this.burst({
      dur: 0.022, type: 'highpass', freq: 8200, q: 0.66,
      sweepTo: 2300, gain: 1.22, rate: 1.9, attack: 0.0002, pos,
    });
    // The rail/armature collision and the main low-frequency pressure wave.
    this.burst({
      dur: 0.105, type: 'bandpass', freq: 2850, q: 0.86,
      sweepTo: 410, gain: 0.96, rate: 1.08, delay: 0.003, pos,
    });
    this.burst({
      dur: 0.54, type: 'lowpass', freq: 780, q: 0.68,
      sweepTo: 58, gain: 1.72, rate: 0.42, delay: 0.006, pos,
    });
    // Electrical flash-over follows the projectile instead of forming a
    // pitched laser note.
    this.burst({
      dur: 0.23, type: 'bandpass', freq: 6200, q: 2.7,
      sweepTo: 920, gain: 0.52, rate: 1.66, delay: 0.025, pos,
    });
    this.burst({
      dur: 0.17, type: 'highpass', freq: 4600, q: 1.5,
      sweepTo: 1250, gain: 0.28, rate: 1.48, delay: 0.066, pos,
    });
    // Heavy receiver slap and a late terrain return give the cannon scale.
    this.burst({
      dur: 0.34, type: 'lowpass', freq: 340, q: 0.56,
      sweepTo: 64, gain: 1.02, rate: 0.34, delay: 0.048, pos,
    });
    this.burst({
      dur: 0.82, type: 'bandpass', freq: 690, q: 0.48,
      sweepTo: 92, gain: 0.58, rate: 0.38, delay: 0.17, pos,
    });
  }

  /** Filtered noise burst with an exponential decay - the workhorse. */
  burst({
    dur = 0.12,
    type = 'lowpass',
    freq = 1200,
    q = 1,
    gain = 0.5,
    rate = 1,
    pos = null,
    attack = 0.001,
    sweepTo = null,
    delay = 0,
  }) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const cueDelay = Math.max(0, delay);
    const t = ctx.currentTime + cueDelay;
    const { input } = this._chain(pos, 1);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const filt = ctx.createBiquadFilter();
    filt.type = type;
    filt.frequency.setValueAtTime(freq, t);
    filt.Q.value = q;
    if (sweepTo) filt.frequency.exponentialRampToValueAtTime(Math.max(60, sweepTo), t + dur);
    const src = this._noiseSource(dur, rate, cueDelay);
    src.connect(filt);
    filt.connect(env);
    env.connect(input);
  }

  /** Simple oscillator blip with optional pitch sweep. */
  tone({ freq = 440, to = null, dur = 0.1, type = 'square', gain = 0.2, pos = null, delay = 0, attack = 0.004 }) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const { input } = this._chain(pos, 1);
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(env);
    env.connect(input);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /* ------------------------------------------------------------ game sounds */

  shot(profile, pos = null) {
    if (!this.ready) return;
    const p = profile || {};
    const kind = p.kind || 'rifle';
    // The supplied Desert Eagle recording owns the complete report and tail.
    // Returning here prevents the old procedural magnum layers from playing
    // underneath it or making different rooms sound different while samples
    // are still decoding.
    if (kind === 'magnum' && this._sample('desertEagleShot', {
      gain: 0.90,
      pos,
    })) return;
    if (kind === 'railgun') {
      this.railgunDischarge(pos);
      return;
    }
    const mix = FIREARM_REPORT_MIXES[kind] || FIREARM_REPORT_MIXES.rifle;
    const body = p.body || 150;
    const bright = p.bright || 3400;
    const dur = p.dur || 0.16;
    const gain = p.gain || 0.55;
    const variation = rand(0.96, 1.04);
    const shotgun = kind === 'shotgun';
    const sniper = kind === 'sniper';
    const machinePistol = kind === 'machine_pistol';

    // Supersonic projectile crack. A hard, very short noise transient reads as
    // a shock wave without the synthetic whistle of an oscillator.
    this.burst({
      dur: machinePistol
        ? 0.010
        : sniper
          ? 0.024
          : Math.min(0.028, 0.012 + dur * 0.05),
      type: 'highpass',
      freq: bright * (machinePistol ? 1.52 : sniper ? 1.28 : 1.18) * variation,
      q: 0.68,
      gain: gain * mix.crack,
      rate: machinePistol ? 1.92 : 1.62,
      pos,
    });
    // Hot propellant at the muzzle: broad mid-frequency energy followed by a
    // much lower pressure wave. Keeping both noise-based avoids a pitched
    // "laser gun" body while still giving headphones a convincing punch.
    this.burst({
      dur: machinePistol
        ? 0.048
        : Math.max(0.055, dur * (shotgun ? 0.88 : sniper ? 0.52 : 0.62)),
      type: 'bandpass',
      freq: bright * (machinePistol ? 0.58 : shotgun ? 0.27 : 0.34) * variation,
      q: machinePistol ? 0.88 : 0.52,
      sweepTo: Math.max(machinePistol ? 520 : 260, body * (shotgun ? 2.1 : 2.8)),
      gain: gain * mix.muzzle,
      rate: machinePistol ? 1.38 : shotgun ? 0.92 : 1.08,
      pos,
    });
    this.burst({
      dur: machinePistol
        ? 0.064
        : dur * (shotgun ? 1.24 : sniper ? 1.42 : 1.08),
      type: 'lowpass',
      freq: Math.max(machinePistol ? 650 : 390, body * (shotgun ? 6.4 : 5.2)) * variation,
      q: 0.72,
      sweepTo: Math.max(machinePistol ? 210 : 90, body * (shotgun ? 0.82 : 1.05)),
      gain: gain * mix.pressure,
      rate: machinePistol ? 1.05 : shotgun ? 0.62 : 0.78,
      pos,
    });
    if (shotgun) {
      // A shotgun is dominated by one broad, violent pressure front rather
      // than the rifle-like supersonic crack used by the SVD.
      this.burst({
        dur: 0.13,
        type: 'bandpass',
        freq: 610 * variation,
        q: 0.42,
        sweepTo: 155,
        gain: gain * 0.56,
        rate: 0.68,
        delay: 0.006,
        pos,
      });
    }
    // The weapon action must arrive after the muzzle blast, not on the same
    // sample, or automatic fire turns into an undifferentiated noise wall.
    this.burst({
      dur: shotgun ? 0.075 : machinePistol ? 0.026 : 0.042,
      type: 'bandpass',
      freq: shotgun ? 1550 : machinePistol ? 4050 : 2850,
      q: machinePistol ? 5.2 : 3.4,
      gain: gain * mix.action,
      rate: machinePistol ? 1.65 : 1.24,
      delay: mix.actionDelay,
      pos,
    });
    if (mix.reflection > 0) {
      // Early wall/ground reflection gives the report outdoor scale without a
      // continuous artificial reverb bed.
      this.burst({
        dur: Math.max(0.07, dur * (shotgun ? 0.48 : sniper ? 0.72 : 0.54)),
        type: 'bandpass',
        freq: Math.max(620, bright * 0.23),
        q: 0.78,
        sweepTo: Math.max(180, body * 1.5),
        gain: gain * mix.reflection,
        rate: 0.92,
        delay: (shotgun ? 0.046 : sniper ? 0.072 : 0.038) + dur * 0.08,
        pos,
      });
    }
    if (p.tail && mix.tail > 0) {
      // Heavy calibres retain one quieter, delayed terrain reflection. Slow
      // weapons can afford this extra layer; high-RPM profiles disable it.
      this.burst({
        dur: sniper
          ? Math.max(0.54, dur * 1.75)
          : Math.max(0.16, dur * (shotgun ? 0.92 : 1.25)),
        type: 'lowpass',
        freq: Math.max(520, bright * 0.19),
        q: 0.62,
        sweepTo: Math.max(110, body),
        gain: gain * mix.tail,
        rate: sniper ? 0.58 : 0.72,
        delay: (sniper ? 0.19 : 0.095) + dur * 0.12,
        pos,
      });
      if (sniper) {
        // The SVD report leaves a second, much later terrain return. This is
        // the heavy after-effect the shotgun deliberately does not have.
        this.burst({
          dur: 0.72,
          type: 'bandpass',
          freq: 470,
          q: 0.46,
          sweepTo: 92,
          gain: gain * 0.11,
          rate: 0.46,
          delay: 0.39,
          pos,
        });
      }
    }
  }

  dryFire(pos = null) {
    this.burst({ dur: 0.05, type: 'bandpass', freq: 2200, q: 4, gain: 0.25, pos });
  }

  meleeSwing(pos = null) {
    if (!this.ready) return;
    // A short descending air-cut with a muted grip movement underneath. It is
    // intentionally dry and compact so repeated knife swings never resemble
    // gunfire or mask the custom hit/kill confirmations.
    this.burst({
      dur: 0.16,
      type: 'bandpass',
      freq: 2350,
      q: 1.1,
      gain: 0.34,
      rate: 1.6,
      pos,
      sweepTo: 520,
    });
    this.burst({
      dur: 0.07,
      type: 'lowpass',
      freq: 620,
      gain: 0.13,
      rate: 0.85,
      pos,
    });
  }

  impact(kind, pos) {
    switch (kind) {
      case 'flesh':
        this.burst({ dur: 0.1, type: 'lowpass', freq: 900, sweepTo: 200, gain: 0.5, pos });
        this.burst({ dur: 0.08, type: 'lowpass', freq: 310, sweepTo: 95, gain: 0.22, rate: 0.58, pos });
        break;
      case 'metal':
        this.burst({ dur: 0.09, type: 'bandpass', freq: 3200, q: 2.5, gain: 0.4, pos });
        this.burst({
          dur: 0.11, type: 'bandpass', freq: rand(1800, 2350), q: 6.2,
          sweepTo: 680, gain: 0.11, rate: 1.7, delay: 0.012, pos,
        });
        break;
      case 'wood':
        this.burst({ dur: 0.1, type: 'bandpass', freq: 1100, q: 1.5, gain: 0.4, pos });
        break;
      default:
        this.burst({ dur: 0.12, type: 'lowpass', freq: 2200, sweepTo: 400, gain: 0.4, pos });
        break;
    }
  }

  ricochet(pos) {
    this.burst({
      dur: 0.075, type: 'highpass', freq: rand(4200, 6700), q: 1.2,
      gain: 0.12, rate: 1.9, pos,
    });
    this.burst({
      dur: 0.15, type: 'bandpass', freq: rand(1800, 2800), q: 7,
      sweepTo: rand(520, 900), gain: 0.06, rate: 1.45, delay: 0.015, pos,
    });
  }

  whizz(pos) {
    this.burst({ dur: 0.14, type: 'bandpass', freq: rand(1600, 2600), q: 6, gain: 0.28, pos, sweepTo: 600 });
  }

  hitmarker(headshot = false) {
    if (this._sample('hitmarker', { gain: 0.72 })) return;
    this.burst({
      dur: headshot ? 0.055 : 0.04,
      type: 'highpass',
      freq: headshot ? 4300 : 3200,
      gain: headshot ? 0.17 : 0.13,
      rate: 1.8,
    });
  }

  /** Armor depleted: a distinct crack takes priority over the normal hit cue. */
  armorCrack() {
    if (this._sample('armorCrack', { gain: 0.86 })) return;
    this.burst({ dur: 0.12, type: 'highpass', freq: 2600, gain: 0.28 });
    this.burst({ dur: 0.18, type: 'bandpass', freq: 1180, sweepTo: 260, gain: 0.14, rate: 1.55 });
  }

  /**
   * Valorant-style kill confirm: a soft body knock under a glassy two-note
   * bell, each note carrying a quiet octave partial so it rings instead of
   * beeping. Kills inside the multi-kill window step the bell up a whole
   * tone, so a triple sounds like an ascending run.
   */
  killConfirm(headshot = false, streak = 1) {
    if (this._sample('killConfirm', { gain: 0.82 })) return;
    const m = Math.pow(1.1225, clamp(streak - 1, 0, 5)); // whole tone per kill
    this.burst({ dur: 0.09, type: 'lowpass', freq: 420 * m, sweepTo: 95, gain: 0.24, rate: 0.72 });
    this.burst({ dur: 0.035, type: 'highpass', freq: headshot ? 7600 : 5900, gain: 0.15, rate: 1.9 });
  }

  reload(stage, pos = null) {
    switch (stage) {
      case 'magOut':
        this.burst({ dur: 0.07, type: 'bandpass', freq: 1700, q: 3, gain: 0.3, pos });
        break;
      case 'magIn':
        this.burst({ dur: 0.09, type: 'bandpass', freq: 900, q: 2, gain: 0.4, pos });
        this.burst({ dur: 0.08, type: 'lowpass', freq: 410, sweepTo: 130, gain: 0.18, rate: 0.68, pos });
        break;
      case 'bolt':
        this.burst({ dur: 0.06, type: 'bandpass', freq: 2600, q: 4, gain: 0.35, pos });
        this.burst({ dur: 0.05, type: 'bandpass', freq: 1500, q: 4, gain: 0.3, pos, });
        break;
      case 'pump':
        this.burst({ dur: 0.08, type: 'bandpass', freq: 1900, q: 3, gain: 0.4, pos });
        this.burst({ dur: 0.07, type: 'bandpass', freq: 1200, q: 3, gain: 0.35, pos });
        break;
      default:
        break;
    }
  }

  /**
   * Operator dialogue uses its own exact linear distance gain. Keep the world
   * position for stereo pan and air absorption, but bypass the generic
   * inverse-square combat attenuation so it is not applied a second time.
   */
  operatorVoice(sample, { pos = null, gain = 1 } = {}) {
    const voiceGain = clamp(Number(gain) || 0, 0, 1.5);
    if (voiceGain <= 0) return false;
    return this._playDialogue(sample, {
      gain: 0.86 * voiceGain,
      pos,
      distanceAttenuation: false,
    });
  }

  /**
   * Killstreak radio files are mastered quieter than the weapon mix. A modest
   * +2.6 dB lift keeps them intelligible while the master compressor catches
   * the few already-hot peaks.
   */
  streakVoice(sample) {
    return this._playDialogue(sample, {
      gain: 1.35,
      pos: null,
      distanceAttenuation: false,
    });
  }

  /**
   * Character and killstreak dialogue share one non-queuing channel. If one
   * line is still playing, a new request is rejected and therefore receives no
   * subtitle either.
   */
  _playDialogue(sample, options) {
    if (!this.ready || this.dialogueBusy) return false;
    const token = ++this.dialogueToken;
    const release = () => {
      if (token !== this.dialogueToken) return;
      this.dialogueBusy = false;
      this.dialogueSource = null;
    };
    this.dialogueBusy = true;
    const accepted = this._sample(sample, {
      ...options,
      dialogue: true,
      onStart: (source) => {
        if (token === this.dialogueToken) this.dialogueSource = source;
      },
      onEnded: release,
    });
    if (!accepted) release();
    return accepted;
  }

  stopDialogue() {
    const source = this.dialogueSource;
    ++this.dialogueToken;
    this.dialogueBusy = false;
    this.dialogueSource = null;
    this.pendingSamples = this.pendingSamples.filter((pending) =>
      pending?.options?.dialogue !== true);
    if (source) {
      try {
        source.stop();
      } catch {
        // A source that ended between the read and stop is already released.
      }
    }
  }

  /**
   * The first pass plays the complete respirator recording. Later passes start
   * at 1.5 seconds and are scheduled 0.4 seconds after the previous source
   * ends, leaving the requested audible gap instead of a seamless buffer loop.
   */
  startJuggernautBreathing() {
    if (!this.ready || this.juggernautBreathingActive) return false;
    const token = ++this.juggernautBreathingToken;
    this.juggernautBreathingActive = true;
    const accepted = this._playJuggernautBreathPass(token, true);
    if (!accepted) this.juggernautBreathingActive = false;
    return accepted;
  }

  _playJuggernautBreathPass(token, firstPass) {
    if (token !== this.juggernautBreathingToken
      || !this.juggernautBreathingActive) return false;
    const accepted = this._sample('juggernautBreathing', {
      gain: 0.52,
      pos: null,
      distanceAttenuation: false,
      delay: firstPass ? 0 : JUGGERNAUT_BREATH_LOOP_GAP_SECONDS,
      offset: firstPass ? 0 : JUGGERNAUT_BREATH_LOOP_OFFSET_SECONDS,
      juggernautBreathing: true,
      onStart: (source) => {
        if (token !== this.juggernautBreathingToken
          || !this.juggernautBreathingActive) {
          try {
            source.stop();
          } catch {
            // A decoded cue can finish between the state check and stop.
          }
          return;
        }
        this.juggernautBreathingSource = source;
      },
      onEnded: () => {
        if (token !== this.juggernautBreathingToken
          || !this.juggernautBreathingActive) return;
        this.juggernautBreathingSource = null;
        this._playJuggernautBreathPass(token, false);
      },
    });
    return accepted;
  }

  stopJuggernautBreathing() {
    const hasPending = this.pendingSamples.some((pending) =>
      pending?.options?.juggernautBreathing === true);
    if (!this.juggernautBreathingActive
      && !this.juggernautBreathingSource
      && !hasPending) return false;
    const source = this.juggernautBreathingSource;
    ++this.juggernautBreathingToken;
    this.juggernautBreathingActive = false;
    this.juggernautBreathingSource = null;
    this.pendingSamples = this.pendingSamples.filter((pending) =>
      pending?.options?.juggernautBreathing !== true);
    if (!source) return true;
    try {
      source.stop();
    } catch {
      // The loop may have been stopped by the browser during a context reset.
    }
    return true;
  }

  shell(pos) {
    this.burst({
      dur: 0.055, type: 'bandpass', freq: rand(2700, 4100), q: 7.5,
      sweepTo: rand(850, 1450), gain: 0.052, rate: 1.85, pos,
    });
  }

  footstep(pos, running = false) {
    this.burst({
      dur: running ? 0.09 : 0.07,
      type: 'lowpass',
      freq: rand(700, 1200),
      gain: running ? 0.16 : 0.1,
      rate: rand(0.8, 1.2),
      pos,
    });
  }

  jump(pos) { this.burst({ dur: 0.08, type: 'lowpass', freq: 600, gain: 0.12, pos }); }

  /** Boot leather scraping along concrete: a long, falling noise sweep. */
  slide(pos) {
    this.burst({ dur: 0.55, type: 'bandpass', freq: 2000, q: 1.2, sweepTo: 420, gain: 0.26, rate: 0.75, pos, attack: 0.02 });
    this.burst({ dur: 0.40, type: 'lowpass', freq: 390, sweepTo: 90, gain: 0.14, rate: 0.54, pos, attack: 0.02 });
  }
  land(pos, hard = false) {
    this.burst({ dur: hard ? 0.16 : 0.1, type: 'lowpass', freq: 500, sweepTo: 160, gain: hard ? 0.3 : 0.16, pos });
    if (hard) this.burst({ dur: 0.16, type: 'lowpass', freq: 235, sweepTo: 58, gain: 0.20, rate: 0.46, pos });
  }

  hurt() {
    this.burst({ dur: 0.18, type: 'lowpass', freq: 700, sweepTo: 180, gain: 0.35 });
    this.burst({ dur: 0.22, type: 'lowpass', freq: 340, sweepTo: 82, gain: 0.22, rate: 0.58 });
  }

  playerDeath() {
    this.burst({ dur: 0.24, type: 'bandpass', freq: 760, sweepTo: 190, gain: 0.22, rate: 0.62 });
    this.burst({ dur: 0.7, type: 'lowpass', freq: 900, sweepTo: 95, gain: 0.28, rate: 0.54 });
  }

  bodyFall(pos) {
    this.burst({ dur: 0.22, type: 'lowpass', freq: 420, sweepTo: 120, gain: 0.34, pos });
  }

  uiClick() {
    this.burst({ dur: 0.026, type: 'highpass', freq: 4100, q: 2.8, gain: 0.075, rate: 2.0 });
  }
  uiMove() {
    this.burst({ dur: 0.018, type: 'bandpass', freq: 2850, q: 4.2, gain: 0.035, rate: 1.8 });
  }

  grenadePin() {
    this._sample('grenadePin', { gain: 0.82 });
  }

  grenadeThrow(pos = null, kind = 'frag') {
    this.burst({
      dur: 0.12, type: 'bandpass', freq: 720, sweepTo: 260,
      gain: 0.12, attack: 0.01, pos,
    });
    if (kind === 'molotov') {
      // A tiny bottle-neck clink distinguishes the glass projectile in flight.
      this.burst({
        dur: 0.045, type: 'bandpass', freq: 4600, q: 7,
        sweepTo: 1250, gain: 0.05, rate: 1.9, delay: 0.025, pos,
      });
    } else if (kind === 'incendiary') {
      // Loose metal hardware on the incendiary canister.
      this.burst({
        dur: 0.06, type: 'bandpass', freq: 1350, q: 5.5,
        sweepTo: 310, gain: 0.045, rate: 1.45, delay: 0.02, pos,
      });
    }
  }

  /**
   * Compact fragmentation-grenade report. This deliberately avoids the
   * long, map-wide missile-impact sample used by killstreaks.
   */
  fragGrenade(pos = null) {
    if (!this.ready) return;
    // Use the recorded blast at a shorter, faster pitch for the actual
    // detonation body; procedural noise only supplies nearby shell/debris.
    this._sample('missileImpact', {
      gain: 0.72,
      rate: 1.48,
      pos,
      distanceAttenuation: true,
    });
    this.burst({
      dur: 0.038, type: 'highpass', freq: 3300, q: 0.78,
      gain: 0.34, rate: 1.48, pos,
    });
    this.burst({
      dur: 0.42, type: 'lowpass', freq: 1320, sweepTo: 105,
      gain: 0.50, rate: 0.78, pos,
    });
    this.burst({
      dur: 0.17, type: 'bandpass', freq: 2650, q: 2.6,
      gain: 0.13, rate: 1.38, delay: 0.035, pos,
    });
  }

  /** Shared fuel ignition: airy flare-up and irregular flame crackle, no boom. */
  _fireIgnition(pos = null, gainScale = 1, delay = 0) {
    this.burst({
      dur: 0.18, type: 'highpass', freq: 5200, q: 0.65,
      sweepTo: 2750, gain: 0.24 * gainScale, rate: 1.7,
      attack: 0.006, delay, pos,
    });
    this.burst({
      dur: 0.86, type: 'bandpass', freq: 1650, q: 0.58,
      sweepTo: 310, gain: 0.38 * gainScale, rate: 0.76,
      attack: 0.035, delay, pos,
    });
    this.burst({
      dur: 0.62, type: 'lowpass', freq: 560, q: 0.75,
      sweepTo: 145, gain: 0.22 * gainScale, rate: 0.56,
      attack: 0.055, delay: delay + 0.045, pos,
    });
    // Staggered sparks stop the ignition from sounding like a single noise hit.
    this.burst({
      dur: 0.045, type: 'highpass', freq: 6100, q: 1.3,
      gain: 0.09 * gainScale, rate: 1.9, delay: delay + 0.12, pos,
    });
    this.burst({
      dur: 0.035, type: 'highpass', freq: 4700, q: 1.5,
      gain: 0.07 * gainScale, rate: 1.55, delay: delay + 0.28, pos,
    });
  }

  /** Incendiary canister opening and spraying burning compound. */
  incendiaryIgnite(pos = null) {
    if (!this.ready) return;
    // Dry canister pop: audible, but intentionally without explosive sub-bass.
    this.burst({
      dur: 0.13, type: 'bandpass', freq: 780, q: 3.8,
      sweepTo: 145, gain: 0.14, rate: 1.22, pos,
    });
    this.burst({
      dur: 0.07, type: 'bandpass', freq: 2800, q: 2.2,
      gain: 0.17, rate: 1.35, pos,
    });
    this._fireIgnition(pos, 1, 0.035);
  }

  /** Molotov impact: bottle break first, then the fuel catches and spreads. */
  molotovBreak(pos = null) {
    if (!this.ready) return;
    // A short bright neck snap followed by several hard glass transients.
    // There is deliberately no low thud: the fuel flare supplies the body.
    this.burst({
      dur: 0.028, type: 'highpass', freq: 8400, q: 1.15,
      gain: 0.34, rate: 2.1, pos,
    });
    this.burst({
      dur: 0.038, type: 'bandpass', freq: 6900, q: 4.0,
      gain: 0.18, rate: 1.92, delay: 0.018, pos,
    });
    this.burst({
      dur: 0.055, type: 'bandpass', freq: 5200, q: 7.5,
      sweepTo: 1580, gain: 0.09, rate: 2.05, delay: 0.026, pos,
    });
    this.burst({
      dur: 0.030, type: 'highpass', freq: 7600, q: 2.1,
      gain: 0.14, rate: 2.0, delay: 0.056, pos,
    });
    this.burst({
      dur: 0.026, type: 'highpass', freq: 5900, q: 2.5,
      gain: 0.10, rate: 1.78, delay: 0.092, pos,
    });
    this._fireIgnition(pos, 1.08, 0.045);
  }

  /* ------------------------------------------------------- killstreaks */

  /** Reward earned: the dedicated announcer cue, with synth as a hard fallback. */
  streakReady() {
    if (this._sample('streakReady', { gain: 0.92 })) return;
    this.burst({ dur: 0.08, type: 'bandpass', freq: 1500, q: 5, gain: 0.14 });
    this.burst({ dur: 0.12, type: 'bandpass', freq: 2200, q: 5, gain: 0.12, delay: 0.09 });
  }

  /** UAV sweep: a sonar blip with a soft echo. */
  uavPing() {
    if (this._sample('uavSweep', { gain: 0.46 })) return;
    this.burst({ dur: 0.08, type: 'bandpass', freq: 1900, q: 7, gain: 0.11 });
    this.burst({ dur: 0.06, type: 'bandpass', freq: 1450, q: 7, gain: 0.04, delay: 0.15 });
  }

  /** Fire mission confirmed: launch whoosh from somewhere far away. */
  strikeLaunch() {
    if (this._sample('missileLaunch', { gain: 0.78 })) return;
    this.burst({ dur: 0.55, type: 'lowpass', freq: 2400, sweepTo: 280, gain: 0.28, attack: 0.06 });
    this.burst({ dur: 0.62, type: 'lowpass', freq: 310, sweepTo: 52, gain: 0.12, rate: 0.42, attack: 0.05 });
  }

  /** The falling shriek just before impact. */
  missileIncoming() {
    if (this._sample('missileIncoming', { gain: 0.74 })) return;
    this.burst({ dur: 0.95, type: 'bandpass', freq: 3200, q: 6, sweepTo: 640, gain: 0.10, rate: 1.55 });
  }

  /** Sentry gun unfolding: servo whine and a bolt slamming home. */
  sentryDeploy() {
    this.burst({ dur: 0.10, type: 'bandpass', freq: 1400, q: 3, gain: 0.30 });
    this.burst({ dur: 0.18, type: 'bandpass', freq: 780, q: 5.8, sweepTo: 430, gain: 0.13, rate: 1.32, delay: 0.08 });
    this.burst({ dur: 0.065, type: 'highpass', freq: 3100, q: 2.3, gain: 0.12, rate: 1.9, delay: 0.26 });
  }

  /** Dedicated, mechanical sentry report instead of the infantry-rifle cue. */
  sentryShot(pos) {
    if (this._sample('sentryShot', { gain: 0.28, rate: rand(0.97, 1.035), pos })) return;
    this.shot({ body: 118, bright: 2900, dur: 0.11, gain: 0.48 }, pos);
  }

  /** Sentry gun giving up the ghost. */
  sentryDown(pos) {
    this.burst({ dur: 0.4, type: 'lowpass', freq: 700, sweepTo: 120, gain: 0.5, pos });
    this.burst({ dur: 0.43, type: 'bandpass', freq: 680, q: 3.8, sweepTo: 90, gain: 0.2, rate: 0.66, pos });
  }

  /** Heavy five-blade transport approaching, crossing overhead and receding. */
  helicopterFlyby(pos) {
    this.burst({
      dur: 5.6, type: 'lowpass', freq: 780, sweepTo: 210,
      gain: 0.28, rate: 0.42, pos, attack: 0.55,
    });
    this.burst({
      dur: 5.3, type: 'lowpass', freq: 285, sweepTo: 58,
      gain: 0.13, rate: 0.32, pos, attack: 0.45,
    });
  }

  /** Reinforced crate slamming into the ground without a parachute. */
  airdropImpact(pos) {
    this.burst({
      dur: 0.42, type: 'lowpass', freq: 920, sweepTo: 72,
      gain: 0.58, pos, attack: 0.002,
    });
    this.burst({ dur: 0.72, type: 'lowpass', freq: 195, sweepTo: 35, gain: 0.42, rate: 0.34, pos });
    this.burst({
      dur: 0.9, type: 'bandpass', freq: 1650, sweepTo: 180,
      gain: 0.20, pos, attack: 0.008,
    });
  }

  /** A-10 turbofans arriving fast, followed by a Doppler-like low pass. */
  casFlyby(pos) {
    this.burst({
      dur: 2.4, type: 'bandpass', freq: 1250, q: 0.7,
      sweepTo: 260, gain: 0.34, rate: 0.72, pos, attack: 0.35,
    });
    this.burst({ dur: 2.6, type: 'lowpass', freq: 360, sweepTo: 65, gain: 0.16, rate: 0.38, pos, attack: 0.3 });
  }

  /** One sustained GAU-8 report; individual shells provide the impact rhythm. */
  casCannon(pos) {
    // Play the supplied GAU-8 recording in full. A broad pressure tail adds
    // arena scale without turning the cannon back into a synthetic buzz.
    this._sample('casCannon', {
      gain: 1.18,
      pos: null,
      distanceAttenuation: false,
    });
    this.burst({
      dur: 1.65, type: 'lowpass', freq: 510, sweepTo: 72,
      gain: 0.30, pos, rate: 0.48, attack: 0.10,
    });
  }

  /** Small delayed thump under selected cannon impacts. */
  casImpact(pos) {
    this.burst({ dur: 0.20, type: 'lowpass', freq: 1050, sweepTo: 150, gain: 0.32, pos });
    this.burst({ dur: 0.24, type: 'lowpass', freq: 255, sweepTo: 48, gain: 0.16, rate: 0.42, pos });
  }

  /**
   * Strike impact. Distance is folded in by hand: a strike should be felt
   * everywhere on the map, so the body of the boom never fully attenuates -
   * only the sharp crack is local.
   */
  explosion(pos) {
    const L = this.listener;
    const d = pos ? Math.hypot(pos.x - L.x, pos.y - L.y, pos.z - L.z) : 0;
    const near = clamp(1 - d / 120, 0, 1);
    const sampled = this._sample('missileImpact', { gain: 0.52 + near * 0.22 });
    if (sampled) {
      // Keep a restrained sub-body under the recorded blast so distant strikes
      // still carry across the whole arena.
      this.burst({ dur: 1.1, type: 'lowpass', freq: 210, sweepTo: 38, gain: 0.24 + near * 0.18, rate: 0.34 });
      this.burst({ dur: 1.6, type: 'lowpass', freq: 230, sweepTo: 50, gain: 0.14, rate: 0.36, attack: 0.12 });
      return;
    }
    this.burst({ dur: 1.2, type: 'lowpass', freq: 220, sweepTo: 36, gain: 0.45 + near * 0.4, rate: 0.34 });
    this.burst({ dur: 0.9, type: 'lowpass', freq: 480 + near * 800, sweepTo: 80, gain: 0.32 + near * 0.5 });
    if (near > 0.3) this.burst({ dur: 0.16, type: 'highpass', freq: 2800, gain: 0.3 * near });
    this.burst({ dur: 1.8, type: 'lowpass', freq: 260, sweepTo: 50, gain: 0.26, attack: 0.12 });
  }

  /**
   * A twelve-bomb pass is mixed as one rolling salvo instead of twelve full
   * missile sound graphs. The accented impacts retain weight while the long
   * first-bomb rumble bridges the quieter gaps.
   */
  firebombImpact(pos, sequence = 0, total = 12) {
    const index = Math.max(0, Math.floor(Number(sequence) || 0));
    const count = Math.max(1, Math.floor(Number(total) || 12));
    const accented = index % 3 === 0 || index === count - 1;
    if (accented) {
      this.explosion(pos);
      if (index === 0) {
        this.burst({
          dur: 2.8,
          type: 'lowpass',
          freq: 360,
          sweepTo: 58,
          gain: 0.20,
          attack: 0.08,
          pos,
        });
      }
      return;
    }
    if (index % 2 === 1) this.casImpact(pos);
  }

  spawn() {
    this.burst({ dur: 0.16, type: 'bandpass', freq: 920, sweepTo: 280, gain: 0.11, rate: 0.82 });
    this.burst({ dur: 0.12, type: 'lowpass', freq: 420, sweepTo: 110, gain: 0.10, rate: 0.62, delay: 0.05 });
  }
}
