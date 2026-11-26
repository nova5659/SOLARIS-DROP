// Module: src/audio/SoundEngine.js
__define("src/audio/SoundEngine.js", (__exports, __require) => {
const { EVENTS } = __require("src/config/constants.js");

// D minor cyberpunk synth bass & tension arp frequencies (Hz)
const BASS_PATTERN_HZ = [
  73.42, 73.42, 73.42, 87.31,
  73.42, 73.42, 65.41, 73.42,
  58.27, 58.27, 58.27, 65.41,
  55.00, 55.00, 65.41, 82.41,
];

const ARP_PATTERN_HZ = [
  293.66, 440.00, 349.23, 523.25,
  293.66, 440.00, 587.33, 440.00,
  233.08, 349.23, 440.00, 349.23,
  220.00, 329.63, 440.00, 523.25,
];

const STEP_DURATION_SEC = 60 / 124 / 4; // 124 BPM 16th notes (~0.121s)
const PANNER_POOL_SIZE = 12;

/**
 * NEON PROTOCOL — Studio-Grade Procedural Web Audio API Synthesizer & 3D Spatial Sound Engine
 * Zero external audio assets. Features layered weapon synthesis per firearm, tactile mechanical
 * foley, golden crystalline headshot chimes, combo-scaled kill confirms, 3D HRTF/equalpower
 * PannerNode spatialization for explosions & enemy fire, and a sample-accurate adaptive
 * cyberpunk synth combat pulse.
 */
class SoundEngine {
  /**
   * @param {import('../core/EventBus.js').EventBus} eventBus
   * @param {THREE.Camera|null} [camera=null]
   */
  constructor(eventBus, camera = null) {
    this.eventBus = eventBus || null;
    this.camera = camera || null;

    /** @type {AudioContext|null} */
    this.ctx = null;
    this._masterGain = null;
    this._sfxGain = null;
    this._musicGain = null;
    this._compressor = null;
    this._whiteNoiseBuffer = null;
    this._pinkNoiseBuffer = null;
    this._pannerPool = [];
    this._pannerCursor = 0;

    this._masterVolume = 0.78;
    this._muted = false;
    this._musicEnabled = true;
    this._inGameplay = true;
    this._disposed = false;

    // Adaptive cyberpunk synth pulse state
    this._targetIntensity = 0.0;
    this._currentIntensity = 0.0;
    this._nextStepTime = 0;
    this._stepIndex = 0;

    // Anti-stacking rate-limit timestamps (seconds)
    this._lastHitmarkerTime = -1;
    this._lastHeadshotTime = -1;
    this._lastKillSoundTime = -1;
    this._lastHealTime = -1;
    this._lastEnemyShotTime = -1;
    this._lastFootstepTime = -1;

    this._unsubs = [];
    this._bindEvents();
  }

  /**
   * Subscribe cleanly to all NEON PROTOCOL combat, movement, and wave events.
   * @private
   */
  _bindEvents() {
    if (!this.eventBus) return;
    const on = (evt, fn) => {
      this._unsubs.push(this.eventBus.on(evt, fn));
    };

    on(EVENTS.WEAPON_FIRED, (p) => this._onWeaponFired(p));
    on(EVENTS.WEAPON_RELOAD_START, () => this._playReloadStart());
    on(EVENTS.WEAPON_RELOADED, () => this._playReloadFinish());
    on(EVENTS.WEAPON_SWITCHED, () => this._playWeaponSwitch());
    on(EVENTS.WEAPON_MELEE, () => this._playMeleeSlash());
    on(EVENTS.DAMAGE_DEALT, (p) => this._onDamageDealt(p));
    on(EVENTS.ENEMY_KILLED, (p) => this._onEnemyKilled(p));
    on(EVENTS.PLAYER_DASH, () => this._playDash());
    on(EVENTS.PLAYER_SLIDE, () => this._playSlide());
    on(EVENTS.PLAYER_JUMP, (p) => this._playJump(p));
    on(EVENTS.PLAYER_JUMPPAD, () => this._playJumpPad());
    on(EVENTS.PLAYER_FOOTSTEP, (p) => this._playFootstep(p));
    on(EVENTS.PLAYER_DAMAGED, (p) => this._playPlayerDamaged(p));
    on(EVENTS.PLAYER_HEALED, () => this._playHeal());
    on(EVENTS.PICKUP_COLLECTED, (p) => this._playPickup(p));
    on(EVENTS.BARREL_EXPLODED, (p) => this._playBarrelExplosion(p));
    on(EVENTS.ZONE_PROGRESS, (p) => this._playZoneProgress(p));
    on(EVENTS.MAP_TRANSITION, () => this._playMapTransition());
    on(EVENTS.WAVE_STARTED, (p) => this._playWaveStarted(p));
    on(EVENTS.WAVE_CLEARED, (p) => this._playWaveCleared(p));
    on(EVENTS.BOSS_PHASE, (p) => this._playBossPhase(p));
    on(EVENTS.GOLD_COLLECTED, () => this._playGoldPickup());
    on(EVENTS.WEAPON_DROPPED, (p) => this._playWeaponDropPickup(p));
    on(EVENTS.UPGRADE_SELECTED, () => this._playUpgradeSelected());
    on(EVENTS.GUARD_BLOCKED, (p) => this._playGuardBlocked(p));
    on(EVENTS.ULTIMATE_USED, (p) => this._playUltimateActivated(p));
    on('SFX_GUARD_TOGGLE', (p) => this._playGuardToggle(p));
    on(EVENTS.GAME_STATE, (p) => this._onGameState(p));
    on('SFX_SNIPER_LOCK', () => this._playSniperLock());
    on('SFX_BOSS_TELEGRAPH', (p) => this._playBossTelegraph(p));
    on('SFX_WEAPON_DRY', (p) => this._playDryOrOverheat(p));
    on('SFX_DASH_READY', () => this._playDashReady());
    on('SFX_RANK_UP', (p) => this._playRankUp(p));
    on('SFX_SYNERGY', () => this._playSynergy());
  }

  /**
   * Gracefully unlock or create Web Audio context on first user gesture.
   * Never throws if AudioContext is unsupported or blocked by autoplay policy.
   */
  unlock() {
    if (this._disposed) return;
    try {
      if (!this.ctx) {
        const AudioCtx =
          typeof window !== 'undefined'
            ? window.AudioContext || window.webkitAudioContext
            : null;
        if (!AudioCtx) return;

        this.ctx = new AudioCtx();
        this._buildAudioGraph();
        this._generateNoiseBuffers();
        this._initPannerPool();
        this._nextStepTime = this.ctx.currentTime + 0.08;
      }

      if (this.ctx && this.ctx.state === 'suspended') {
        const p = this.ctx.resume();
        if (p && typeof p.catch === 'function') {
          p.catch(() => {});
        }
      }
    } catch {
      // Gracefully ignore restricted environments
    }
  }

  /** @private */
  _buildAudioGraph() {
    const ctx = this.ctx;
    this._compressor = ctx.createDynamicsCompressor();
    this._compressor.threshold.setValueAtTime(-14, ctx.currentTime);
    this._compressor.knee.setValueAtTime(12, ctx.currentTime);
    this._compressor.ratio.setValueAtTime(4.0, ctx.currentTime);
    this._compressor.attack.setValueAtTime(0.003, ctx.currentTime);
    this._compressor.release.setValueAtTime(0.14, ctx.currentTime);

    this._masterGain = ctx.createGain();
    this._masterGain.gain.setValueAtTime(
      this._muted ? 0 : this._masterVolume,
      ctx.currentTime
    );

    this._sfxGain = ctx.createGain();
    this._sfxGain.gain.setValueAtTime(1.0, ctx.currentTime);

    this._musicGain = ctx.createGain();
    this._musicGain.gain.setValueAtTime(this._musicEnabled ? 0.24 : 0.0, ctx.currentTime);

    this._sfxGain.connect(this._masterGain);
    this._musicGain.connect(this._masterGain);
    this._masterGain.connect(this._compressor);
    this._compressor.connect(ctx.destination);
  }

  /**
   * Pre-generate stereo white & Paul Kellet pink noise AudioBuffers once on unlock.
   * @private
   */
  _generateNoiseBuffers() {
    const ctx = this.ctx;
    const sampleRate = ctx.sampleRate || 44100;
    const length = Math.floor(sampleRate * 2.0);

    // White noise
    const white = ctx.createBuffer(2, length, sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = white.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        data[i] = Math.random() * 2 - 1;
      }
    }
    this._whiteNoiseBuffer = white;

    // Warm 1/f Pink noise (Paul Kellet's filter)
    const pink = ctx.createBuffer(2, length, sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = pink.getChannelData(ch);
      let b0 = 0;
      let b1 = 0;
      let b2 = 0;
      let b3 = 0;
      let b4 = 0;
      let b5 = 0;
      let b6 = 0;
      for (let i = 0; i < length; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.96900 * b2 + w * 0.1538520;
        b3 = 0.86650 * b3 + w * 0.3104856;
        b4 = 0.55000 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.0168980;
        data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      }
    }
    this._pinkNoiseBuffer = pink;
  }

  /** @private */
  _isReady() {
    return Boolean(
      !this._disposed &&
        this.ctx &&
        !this._muted &&
        this._sfxGain &&
        this.ctx.state === 'running'
    );
  }

  /**
   * Set master output volume (0..1).
   * @param {number} vol
   */
  setMasterVolume(vol) {
    this._masterVolume = Math.max(0, Math.min(1, Number(vol) || 0));
    if (this.ctx && this._masterGain) {
      const target = this._muted ? 0 : this._masterVolume;
      try {
        this._masterGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.02);
      } catch {
        this._masterGain.gain.value = target;
      }
    }
  }

  /**
   * Toggle mute state cleanly.
   * @param {boolean} muted
   */
  setMuted(muted) {
    this._muted = Boolean(muted);
    if (this.ctx && this._masterGain) {
      const target = this._muted ? 0 : this._masterVolume;
      try {
        this._masterGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.02);
      } catch {
        this._masterGain.gain.value = target;
      }
    }
  }

  /**
   * Set target adaptive combat intensity (0..1) driving the cyberpunk synth combat pulse.
   * @param {number} level
   */
  setCombatIntensity(level) {
    this._targetIntensity = Math.max(0, Math.min(1, Number(level) || 0));
  }

  /**
   * Enable or disable the adaptive cyberpunk synth combat pulse.
   * @param {boolean} enabled
   */
  setMusicEnabled(enabled) {
    this._musicEnabled = Boolean(enabled);
    if (this.ctx && this._musicGain) {
      const target = this._musicEnabled && this._inGameplay ? 0.24 : 0.0;
      try {
        this._musicGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.08);
      } catch {
        this._musicGain.gain.value = target;
      }
    }
  }

  /** @private */
  _onGameState(payload) {
    const state = typeof payload === 'string' ? payload : payload && payload.state;
    this._inGameplay = state === 'playing';
    if (this.ctx && this._musicGain) {
      const target = this._musicEnabled && this._inGameplay ? 0.24 : 0.0;
      try {
        this._musicGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.12);
      } catch {
        this._musicGain.gain.value = target;
      }
    }
  }

  /**
   * Pre-allocate a fixed ring-buffer pool of 12 reusable 'equalpower' PannerNodes
   * connected once to _sfxGain (zero per-shot node leaks, mobile-friendly CPU cost).
   * @private
   */
  _initPannerPool() {
    const ctx = this.ctx;
    this._pannerPool.length = 0;
    this._pannerCursor = 0;
    if (!ctx || !this._sfxGain || typeof ctx.createPanner !== 'function') return;

    for (let i = 0; i < PANNER_POOL_SIZE; i++) {
      const panner = ctx.createPanner();
      panner.panningModel = 'equalpower';
      panner.distanceModel = 'inverse';
      panner.refDistance = 5.5;
      panner.maxDistance = 75;
      panner.rolloffFactor = 1.15;
      panner.connect(this._sfxGain);
      this._pannerPool.push(panner);
    }
  }

  /**
   * Acquire and reposition a pooled 3D PannerNode from the ring buffer.
   * @private
   */
  _getSpatialPanner(worldPos, refDistance = 5.5, maxDistance = 75, rolloff = 1.15) {
    if (!this._pannerPool.length) {
      return this._sfxGain;
    }

    const panner = this._pannerPool[this._pannerCursor];
    this._pannerCursor = (this._pannerCursor + 1) % this._pannerPool.length;

    panner.refDistance = refDistance;
    panner.maxDistance = maxDistance;
    panner.rolloffFactor = rolloff;

    const x = worldPos ? Number(worldPos.x) || 0 : 0;
    const y = worldPos ? Number(worldPos.y) || 0 : 0;
    const z = worldPos ? Number(worldPos.z) || 0 : 0;
    const now = this.ctx.currentTime;

    if (panner.positionX) {
      panner.positionX.setValueAtTime(x, now);
      panner.positionY.setValueAtTime(y, now);
      panner.positionZ.setValueAtTime(z, now);
    } else if (typeof panner.setPosition === 'function') {
      panner.setPosition(x, y, z);
    }

    return panner;
  }

  /**
   * Helper to play a filtered noise burst cleanly with leak-free leaf node teardown.
   * @private
   */
  _playNoiseBurst(
    dest,
    startTime,
    duration,
    gainPeak,
    filterType,
    freqStart,
    freqEnd,
    Q = 1.0,
    usePink = false
  ) {
    const ctx = this.ctx;
    const buf = usePink ? this._pinkNoiseBuffer : this._whiteNoiseBuffer;
    if (!buf) return;

    const safePeak = Math.max(0.0005, Number(gainPeak) || 0.0005);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const offset = Math.random() * Math.max(0.05, buf.duration - duration - 0.05);

    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.Q.setValueAtTime(Q, startTime);
    filter.frequency.setValueAtTime(Math.max(20, freqStart), startTime);
    if (freqEnd && freqEnd !== freqStart) {
      filter.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), startTime + duration);
    }

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(safePeak, startTime + Math.min(0.008, duration * 0.2));
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(dest);

    src.onended = () => {
      try {
        src.disconnect();
        filter.disconnect();
        gain.disconnect();
      } catch {}
    };

    src.start(startTime, offset, duration + 0.02);
    src.stop(startTime + duration + 0.03);
  }

  /**
   * Helper to play a pitched oscillator envelope with leak-free leaf node teardown.
   * @private
   */
  _playTone(
    dest,
    type,
    startTime,
    duration,
    freqStart,
    freqEnd,
    gainPeak,
    attack = 0.004,
    filterFreq = 0
  ) {
    const ctx = this.ctx;
    const safePeak = Math.max(0.0005, Number(gainPeak) || 0.0005);
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, freqStart), startTime);
    if (freqEnd && freqEnd !== freqStart) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), startTime + duration);
    }

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(safePeak, startTime + Math.min(attack, duration * 0.4));
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    let lp = null;
    if (filterFreq > 0) {
      lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(filterFreq, startTime);
      osc.connect(lp);
      lp.connect(gain);
    } else {
      osc.connect(gain);
    }
    gain.connect(dest);

    osc.onended = () => {
      try {
        osc.disconnect();
        if (lp) lp.disconnect();
        gain.disconnect();
      } catch {}
    };

    osc.start(startTime);
    osc.stop(startTime + duration + 0.025);
  }

  // ===========================================================================
  // WEAPON SYNTHESIS (4 Distinct Layered Sci-Fi Firearms)
  // ===========================================================================

  /** @private */
  /**
   * Warm analog saturation curve for heavy, gritty real-firearm transient punch (zero neon synth).
   * @private
   */
  _getDriveCurve() {
    if (this._driveCurve) return this._driveCurve;
    const n = 256;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i * 2) / n - 1;
      curve[i] = Math.tanh(x * 3.8);
    }
    this._driveCurve = curve;
    return curve;
  }

  /**
   * Synthesize a heavy saturated sub-bass firearm kick / mechanical thump (zero pitch-laser sweep).
   * @private
   */
  _playHeavyPunch(dest, startTime, duration, startHz, endHz, gainVal) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const shaper = ctx.createWaveShaper();
    const lp = ctx.createBiquadFilter();
    const g = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(Math.max(24, startHz), startTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(18, endHz), startTime + Math.min(duration, 0.055));

    shaper.curve = this._getDriveCurve();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(420, startTime);

    g.gain.setValueAtTime(0.0001, startTime);
    g.gain.linearRampToValueAtTime(gainVal, startTime + 0.0015);
    g.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc.connect(shaper);
    shaper.connect(lp);
    lp.connect(g);
    g.connect(dest);

    osc.start(startTime);
    osc.stop(startTime + duration + 0.02);
  }

  /** @private */
  _onWeaponFired(payload) {
    if (!this._isReady()) return;
    try {
      const id =
        (typeof payload === 'string' && payload) ||
        (payload && (payload.weaponId || (payload.weapon && payload.weapon.id) || payload.id)) ||
        'pulse_rifle';

      const now = this.ctx.currentTime;
      const dest = this._sfxGain;
      const pj = 0.94 + Math.random() * 0.12;

      // Grounded Heavy Real-Firearm Gunpowder & Steel Bolt Foley (Zero Neon / Laser Synth)
      switch (id) {
        case 'scattergun':
          // BR-12 12-GAUGE BREACHER: Thunderous chest kick + sharp muzzle crack + booming gunpowder tail + steel pump
          this._playHeavyPunch(dest, now, 0.22, 82 * pj, 24, 0.95);
          this._playNoiseBurst(dest, now, 0.018, 0.85, 'highpass', 1100 * pj, 600, 0.9, false);
          this._playNoiseBurst(dest, now, 0.30, 0.88, 'lowpass', 1500, 110, 0.7, true);
          this._playNoiseBurst(dest, now + 0.015, 0.22, 0.45, 'lowpass', 480, 85, 0.7, true);
          // Heavy steel pump-action rack (chk-clack)
          this._playNoiseBurst(dest, now + 0.18, 0.036, 0.28, 'bandpass', 1400, 900, 3.8, false);
          this._playNoiseBurst(dest, now + 0.28, 0.042, 0.32, 'bandpass', 2000, 1200, 4.2, false);
          break;

        case 'railgun':
          // HV-7 ANTI-MATERIEL CANNON: Massive .50-cal supersonic crack + earth-shaking low boom + steel breech slam
          this._playHeavyPunch(dest, now, 0.38, 92 * pj, 19, 0.98);
          this._playNoiseBurst(dest, now, 0.022, 0.88, 'bandpass', 1950 * pj, 700, 0.9, false);
          this._playNoiseBurst(dest, now + 0.006, 0.34, 0.84, 'lowpass', 1350, 95, 0.75, true);
          this._playNoiseBurst(dest, now + 0.06, 0.075, 0.32, 'bandpass', 850, 380, 3.0, false);
          break;

        case 'plasma_smg':
          // K-9 SCRAPPER PDW: Snappy 9mm/PDW dry tactical bark + rapid steel bolt rattle
          this._playHeavyPunch(dest, now, 0.055, 96 * pj, 34, 0.58);
          this._playNoiseBurst(dest, now, 0.014, 0.62, 'bandpass', 1800 * pj, 800, 1.1, false);
          this._playNoiseBurst(dest, now, 0.065, 0.44, 'lowpass', 1750, 220, 0.8, true);
          this._playNoiseBurst(dest, now + 0.018, 0.016, 0.20, 'bandpass', 2600, 1800, 3.6, false);
          break;

        case 'weld_pistol':
          // W-01 HEAVY SIDEARM: Crisp compact pistol crack + compressed gas punch
          this._playHeavyPunch(dest, now, 0.075, 102 * pj, 36, 0.52);
          this._playNoiseBurst(dest, now, 0.020, 0.55, 'bandpass', 1550 * pj, 650, 1.2, false);
          this._playNoiseBurst(dest, now, 0.085, 0.46, 'lowpass', 1200, 200, 0.9, true);
          break;

        case 'arc_rivet':
          // T-4 HEAVY NAIL/RIVET DRIVER: Hard pneumatic piston slam + solid steel anvil thud
          this._playHeavyPunch(dest, now, 0.11, 110 * pj, 30, 0.68);
          this._playNoiseBurst(dest, now, 0.020, 0.64, 'bandpass', 1650 * pj, 720, 2.2, false);
          this._playNoiseBurst(dest, now + 0.010, 0.09, 0.42, 'lowpass', 1100, 190, 0.9, true);
          break;

        case 'repulsor':
          // K-0 CONCUSSIVE AIR-CANNON: Deep sub-pressure thump + heavy compressed exhaust blast
          this._playHeavyPunch(dest, now, 0.26, 86 * pj, 20, 0.94);
          this._playNoiseBurst(dest, now, 0.24, 0.76, 'lowpass', 980, 95, 0.75, true);
          this._playNoiseBurst(dest, now + 0.06, 0.14, 0.30, 'bandpass', 1700, 820, 1.6, false);
          break;

        case 'pulse_rifle':
        default:
          // M41-A 7.62 ASSAULT RIFLE: Heavy punchy gunpowder snap + warm low-end thump + steel bolt clack
          this._playHeavyPunch(dest, now, 0.09, 88 * pj, 28, 0.74);
          this._playNoiseBurst(dest, now, 0.018, 0.72, 'bandpass', 1650 * pj, 680, 1.1, false);
          this._playNoiseBurst(dest, now, 0.11, 0.62, 'lowpass', 1850 * pj, 210, 0.8, true);
          this._playNoiseBurst(dest, now + 0.026, 0.020, 0.22, 'bandpass', 2700, 1850, 4.2, false);
          break;
      }

      // Subtle realistic brass/steel shell casing bounce on floor for ballistic guns
      if (id === 'pulse_rifle' || id === 'scattergun' || id === 'plasma_smg' || id === 'railgun') {
        const delay = 0.28 + Math.random() * 0.14;
        const j = 0.92 + Math.random() * 0.16;
        this._playNoiseBurst(dest, now + delay, 0.016, 0.055, 'bandpass', 4600 * j, 3900 * j, 11.0, false);
        this._playNoiseBurst(dest, now + delay + 0.065, 0.014, 0.038, 'bandpass', 5400 * j, 4700 * j, 12.0, false);
      }

      // Low-Ammo Dry Metallic Chamber Click (last 25% of magazine)
      if (
        payload &&
        Number.isFinite(payload.ammo) &&
        Number.isFinite(payload.magSize) &&
        payload.magSize > 0 &&
        payload.ammo <= Math.ceil(payload.magSize * 0.25)
      ) {
        this._playNoiseBurst(dest, now + 0.028, 0.016, 0.22, 'bandpass', 3200, 2400, 6.0, false);
      }
    } catch {}
  }

  // ===========================================================================
  // RELOAD, SWITCH & MELEE FOLEY (Pure Mechanical Steel — Zero Synth)
  // ===========================================================================

  /** @private */
  _playReloadStart() {
    if (!this._isReady()) return;
    try {
      const now = this.ctx.currentTime;
      const dest = this._sfxGain;
      this._playNoiseBurst(dest, now, 0.026, 0.28, 'bandpass', 2400, 1450, 4.2, false);
      this._playHeavyPunch(dest, now + 0.025, 0.055, 110, 48, 0.24);
      this._playNoiseBurst(dest, now + 0.045, 0.075, 0.18, 'bandpass', 950, 460, 2.2, true);
    } catch {}
  }

  /** @private */
  _playReloadFinish() {
    if (!this._isReady()) return;
    try {
      const now = this.ctx.currentTime;
      const dest = this._sfxGain;
      this._playHeavyPunch(dest, now, 0.065, 118, 42, 0.42);
      this._playNoiseBurst(dest, now, 0.032, 0.32, 'bandpass', 1650, 780, 3.6, false);
      this._playNoiseBurst(dest, now + 0.10, 0.030, 0.28, 'bandpass', 2100, 1250, 4.4, false);
      this._playNoiseBurst(dest, now + 0.145, 0.038, 0.34, 'bandpass', 2800, 1600, 4.8, false);
    } catch {}
  }

  /** @private */
  _playWeaponSwitch() {
    if (!this._isReady()) return;
    try {
      const now = this.ctx.currentTime;
      const dest = this._sfxGain;
      this._playNoiseBurst(dest, now, 0.060, 0.20, 'bandpass', 1050, 580, 2.2, true);
      this._playNoiseBurst(dest, now + 0.038, 0.022, 0.24, 'bandpass', 2400, 1600, 4.8, false);
    } catch {}
  }

  /** @private */
  _playMeleeSlash() {
    if (!this._isReady()) return;
    try {
      const now = this.ctx.currentTime;
      const dest = this._sfxGain;
      this._playNoiseBurst(dest, now, 0.15, 0.48, 'bandpass', 420, 1900, 1.3, true);
      this._playNoiseBurst(dest, now + 0.055, 0.13, 0.32, 'lowpass', 1500, 280, 1.0, true);
      this._playHeavyPunch(dest, now, 0.10, 105, 36, 0.42);
    } catch {}
  }

  // ===========================================================================
  // COMBAT FEEDBACK (Dry Ballistic Hit, Steel Helmet Headshot Crack, Heavy Kill Thud)
  // ===========================================================================

  /** @private */
  _onDamageDealt(payload) {
    if (!this._isReady()) return;
    try {
      const now = this.ctx.currentTime;
      const dest = this._sfxGain;
      const isHeadshot = Boolean(payload && payload.isHeadshot);
      const blockedByShield = Boolean(payload && payload.blockedByShield);

      if (isHeadshot) {
        if (now - this._lastHeadshotTime < 0.032) return;
        this._lastHeadshotTime = now;
        this._lastHitmarkerTime = now;

        // Visceral Steel Helmet Shatter + Short Mechanical Servo-Screech Groan
        this._playHeavyPunch(dest, now, 0.09, 118, 32, 0.62);
        this._playNoiseBurst(dest, now, 0.022, 0.58, 'bandpass', 2900, 1450, 3.2, false);
        this._playNoiseBurst(dest, now + 0.012, 0.052, 0.46, 'bandpass', 1800, 720, 5.2, false);
        this._playNoiseBurst(dest, now + 0.022, 0.085, 0.24, 'bandpass', 920, 380, 4.5, true);
        return;
      }

      if (now - this._lastHitmarkerTime < 0.022) return;
      this._lastHitmarkerTime = now;

      if (blockedByShield) {
        // Heavy Riot-Shield Dull Steel Ricochet
        this._playHeavyPunch(dest, now, 0.065, 110, 46, 0.34);
        this._playNoiseBurst(dest, now, 0.040, 0.32, 'bandpass', 1350, 620, 3.8, false);
        return;
      }

      // Grounded Heavy Ballistic Armor Crunch + Subtle Mechanical Servo Groan
      this._playHeavyPunch(dest, now, 0.055, 108, 36, 0.44);
      this._playNoiseBurst(dest, now, 0.018, 0.38, 'bandpass', 2150, 1050, 2.6, false);
      this._playNoiseBurst(dest, now + 0.015, 0.065, 0.20, 'bandpass', 740, 340, 4.2, true);
    } catch {}
  }

  /** @private */
  _playGuardBlocked(payload) {
    if (!this._isReady()) return;
    try {
      const now = this.ctx.currentTime;
      const dest = this._sfxGain;
      const broken = Boolean(payload && payload.guardBroken);
      if (broken) {
        // Realistic Ballistic Glass Shatter + Heavy Pressure Thud (Zero Sawtooth Sweep!)
        this._playHeavyPunch(dest, now, 0.22, 95, 24, 0.65);
        this._playNoiseBurst(dest, now, 0.09, 0.54, 'highpass', 3400, 1800, 1.4, false);
        this._playNoiseBurst(dest, now + 0.045, 0.14, 0.44, 'bandpass', 4200, 2200, 2.2, false);
        this._playNoiseBurst(dest, now + 0.095, 0.16, 0.32, 'bandpass', 2800, 1200, 1.8, false);
      } else {
        // Heavy Composite Riot-Shield Bullet Deflection Thud + Crisp Glass Tap
        this._playHeavyPunch(dest, now, 0.075, 108, 38, 0.48);
        this._playNoiseBurst(dest, now, 0.026, 0.38, 'bandpass', 2400, 1300, 3.6, false);
        this._playNoiseBurst(dest, now + 0.014, 0.032, 0.22, 'highpass', 3600, 2400, 2.4, false);
      }
    } catch {}
  }

  /** @private */
  _onEnemyKilled(payload) {
    if (!this._isReady()) return;
    try {
      const now = this.ctx.currentTime;
      const isBoss = Boolean(payload && payload.isBoss);
      if (!isBoss && now - this._lastKillSoundTime < 0.055) return;
      this._lastKillSoundTime = now;

      const dest = this._sfxGain;
      const combo = Math.max(1, Math.min(5, Number(payload && payload.combo) || 1));
      const pitchMult = 1 + (combo - 1) * 0.05;

      // Grounded Heavy Mechanical Kill-Confirm: Deep Sub-Thump + Armor Crunch + Crisp Steel Click (Zero Synth Chime!)
      this._playHeavyPunch(dest, now, 0.16, 98, 28, 0.68);
      this._playNoiseBurst(dest, now, 0.10, 0.48, 'bandpass', 980 * pitchMult, 220, 1.3, true);
      this._playNoiseBurst(dest, now + 0.028, 0.026, 0.34, 'bandpass', 2250 * pitchMult, 1450, 4.6, false);
      this._playNoiseBurst(dest, now + 0.060, 0.024, 0.26, 'bandpass', 3000 * pitchMult, 1950, 5.0, false);

      // Robotic dying power-down groan + scattered steel debris clatter
      this._playNoiseBurst(dest, now + 0.045, 0.16, 0.24, 'bandpass', 620, 210, 3.8, true);
      this._playNoiseBurst(dest, now + 0.085, 0.022, 0.16, 'bandpass', 3200, 2400, 8.0, false);
      this._playNoiseBurst(dest, now + 0.145, 0.026, 0.12, 'bandpass', 2600, 1800, 7.5, false);

      if (isBoss) {
        this._playHeavyPunch(dest, now, 1.10, 78, 18, 0.96);
        this._playNoiseBurst(dest, now, 1.35, 0.84, 'lowpass', 1650, 85, 0.75, true);
        this._playNoiseBurst(dest, now + 0.08, 0.55, 0.48, 'bandpass', 720, 160, 1.4, true);
      }
    } catch {}
  }

  // ===========================================================================
  // PLAYER MOVEMENT & VITALITY AUDIO (Zero Arcade Sweeps)
  // ===========================================================================

  /** @private */
  _playDash() {
    if (!this._isReady()) return;
    try {
      const now = this.ctx.currentTime;
      const dest = this._sfxGain;
      this._playHeavyPunch(dest, now, 0.14, 102, 32, 0.54);
      this._playNoiseBurst(dest, now, 0.18, 0.46, 'bandpass', 880, 240, 1.2, true);
      this._playNoiseBurst(dest, now, 0.075, 0.28, 'highpass', 2100, 1050, 1.4, false);
    } catch {}
  }

  /** @private */
  _playSlide() {
    if (!this._isReady()) return;
    try {
      const now = this.ctx.currentTime;
      const dest = this._sfxGain;
      this._playNoiseBurst(dest, now, 0.40, 0.32, 'bandpass', 980, 340, 1.8, true);
      this._playNoiseBurst(dest, now, 0.16, 0.18, 'highpass', 2400, 1400, 1.3, false);
      this._playHeavyPunch(dest, now, 0.10, 92, 36, 0.30);
    } catch {}
  }

  /** @private */
  _playJump(payload) {
    if (!this._isReady()) return;
    try {
      const now = this.ctx.currentTime;
      const dest = this._sfxGain;
      const isDouble = Boolean(payload && payload.isDoubleJump);
      if (isDouble) {
        this._playHeavyPunch(dest, now, 0.11, 108, 42, 0.40);
        this._playNoiseBurst(dest, now, 0.14, 0.36, 'bandpass', 1100, 380, 1.3, true);
      } else {
        this._playHeavyPunch(dest, now, 0.075, 96, 40, 0.28);
        this._playNoiseBurst(dest, now, 0.065, 0.18, 'bandpass', 780, 400, 1.6, true);
      }
    } catch {}
  }

  /** @private */
  _playJumpPad() {
    if (!this._isReady()) return;
    try {
      const now = this.ctx.currentTime;
      const dest = this._sfxGain;
      this._playHeavyPunch(dest, now, 0.26, 98, 28, 0.62);
      this._playNoiseBurst(dest, now, 0.32, 0.48, 'bandpass', 680, 1850, 1.3, true);
      this._playNoiseBurst(dest, now + 0.04, 0.20, 0.26, 'highpass', 2200, 1100, 1.5, false);
    } catch {}
  }

  /** @private */
  _playFootstep(payload) {
    if (!this._isReady()) return;
    try {
      const now = this.ctx.currentTime;
      if (now - this._lastFootstepTime < 0.11) return;
      this._lastFootstepTime = now;

      const dest = this._sfxGain;
      const isLanding = Boolean(payload && payload.isLanding);
      const sprinting = Boolean(payload && payload.sprinting);
      const jitter = 0.9 + Math.random() * 0.2;

      if (isLanding) {
        this._playHeavyPunch(dest, now, 0.10, 96 * jitter, 32, 0.38);
        this._playNoiseBurst(dest, now, 0.08, 0.22, 'lowpass', 720, 200, 1.0, true);
      } else {
        const vol = sprinting ? 0.12 : 0.08;
        this._playHeavyPunch(dest, now, 0.042, 86 * jitter, 38, vol);
        this._playNoiseBurst(dest, now, 0.030, vol * 0.9, 'bandpass', 1150 * jitter, 480, 2.2, true);
      }
    } catch {}
  }

  /** @private */
  _playPlayerDamaged(payload) {
    if (!this._isReady()) return;
    try {
      const now = this.ctx.currentTime;
      const dest = this._sfxGain;
      const shieldDmg = Number(payload && payload.shieldDamage) || 0;
      const healthDmg = Number(payload && payload.healthDamage) || 0;
      const shieldBroken = Boolean(payload && payload.shieldBroken);
      const isFatal = Boolean(payload && payload.isFatal);

      // Heavy dull armor impact thud (Zero sawtooth/triangle synth sweeps!)
      this._playHeavyPunch(dest, now, 0.18, 96, 26, 0.64);

      if (shieldBroken) {
        this._playNoiseBurst(dest, now, 0.14, 0.56, 'highpass', 2800, 1100, 1.4, false);
        this._playNoiseBurst(dest, now + 0.05, 0.22, 0.44, 'bandpass', 1900, 600, 1.8, false);
        this._playHeavyPunch(dest, now, 0.30, 88, 22, 0.60);
      } else if (shieldDmg > 0) {
        this._playNoiseBurst(dest, now, 0.10, 0.30, 'bandpass', 1800, 560, 2.2, false);
      }
      if (healthDmg > 0) {
        this._playNoiseBurst(dest, now, 0.20, 0.46, 'lowpass', 880, 140, 1.0, true);
        // Helmeted Pilot Pain Grunt ("Ugh!") via dual vocal formant filters (cooldown 0.38s)
        if (now - (this._lastGruntTime || 0) >= 0.38) {
          this._lastGruntTime = now;
          this._playPilotPainGrunt(dest, now, healthDmg >= 20);
        }
        // Low-HP Heartbeat Thump when below 35% health
        if (payload && Number.isFinite(payload.health) && payload.health > 0 && payload.health <= 35) {
          this._playHeavyPunch(dest, now + 0.14, 0.11, 68, 30, 0.42);
          this._playHeavyPunch(dest, now + 0.30, 0.09, 58, 28, 0.30);
        }
      }
      if (isFatal) {
        this._playHeavyPunch(dest, now + 0.04, 0.65, 72, 18, 0.72);
        this._playNoiseBurst(dest, now + 0.04, 0.60, 0.42, 'lowpass', 640, 90, 1.0, true);
      }
    } catch {}
  }

  /** @private */
  /**
   * Formant-filtered vocal grunt for grounded helmeted pilot pain feedback.
   * @private
   */
  _playPilotPainGrunt(dest, startTime, isHeavy) {
    const ctx = this.ctx;
    const dur = isHeavy ? 0.21 : 0.14;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    const basePitch = (isHeavy ? 96 : 112) * (0.94 + Math.random() * 0.12);
    osc.frequency.setValueAtTime(basePitch, startTime);
    osc.frequency.exponentialRampToValueAtTime(basePitch * 0.68, startTime + dur);

    // Dual vocal tract formants (F1 ~520Hz, F2 ~1180Hz -> gritty muffled "Ugh!")
    const f1 = ctx.createBiquadFilter();
    f1.type = 'bandpass';
    f1.frequency.setValueAtTime(520, startTime);
    f1.Q.value = 3.2;

    const f2 = ctx.createBiquadFilter();
    f2.type = 'bandpass';
    f2.frequency.setValueAtTime(1180, startTime);
    f2.Q.value = 4.0;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, startTime);
    g.gain.linearRampToValueAtTime(isHeavy ? 0.36 : 0.26, startTime + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, startTime + dur);

    osc.connect(f1);
    osc.connect(f2);
    f1.connect(g);
    f2.connect(g);
    g.connect(dest);

    osc.start(startTime);
    osc.stop(startTime + dur + 0.02);
    // Breathy helmet exhalation layer
    this._playNoiseBurst(dest, startTime + 0.01, dur * 0.9, isHeavy ? 0.18 : 0.12, 'bandpass', 1350, 620, 2.2, true);
  }

  /** @private */
  _playGuardToggle(payload) {
    if (!this._isReady()) return;
    try {
      const now = this.ctx.currentTime;
      const dest = this._sfxGain;
      const raised = Boolean(payload && payload.raised);
      if (raised) {
        // Mechanical shield frame lock-in + pressurized deployment hiss
        this._playHeavyPunch(dest, now, 0.08, 108, 42, 0.36);
        this._playNoiseBurst(dest, now, 0.028, 0.26, 'bandpass', 2200, 1300, 4.2, false);
        this._playNoiseBurst(dest, now + 0.02, 0.14, 0.22, 'bandpass', 1800, 920, 1.8, false);
      } else {
        // Crisp retract latch click
        this._playNoiseBurst(dest, now, 0.024, 0.20, 'bandpass', 1900, 1100, 4.5, false);
        this._playHeavyPunch(dest, now + 0.02, 0.055, 88, 38, 0.22);
      }
    } catch {}
  }

  /** @private */
  _playUltimateActivated(payload) {
    if (!this._isReady()) return;
    try {
      const now = this.ctx.currentTime;
      const dest = this._sfxGain;
      const fid = (payload && payload.frameId) || 'vanguard';
      if (fid === 'vanguard') {
        // Orbital Barrage: descending sky-roar + 3 staggered colossal ground impacts
        this._playNoiseBurst(dest, now, 0.45, 0.48, 'bandpass', 1600, 260, 1.2, true);
        for (let i = 0; i < 3; i++) {
          const t = now + 0.08 + i * 0.18;
          this._playHeavyPunch(dest, t, 0.45, 88, 20, 0.85);
          this._playNoiseBurst(dest, t, 0.55, 0.68, 'lowpass', 1500, 95, 0.8, true);
        }
      } else if (fid === 'strider') {
        // Time Dilation: heavy deep sub-bass drop + vacuum air-rush
        this._playHeavyPunch(dest, now, 0.85, 112, 22, 0.88);
        this._playNoiseBurst(dest, now, 0.65, 0.52, 'lowpass', 2400, 140, 1.1, true);
      } else if (fid === 'bastion') {
        // Aegis Fortress: monumental armored bulkhead slam + deep protective hum
        this._playHeavyPunch(dest, now, 0.55, 84, 24, 0.92);
        this._playNoiseBurst(dest, now, 0.08, 0.46, 'bandpass', 1400, 620, 3.0, false);
        this._playTone(dest, 'sawtooth', now + 0.04, 0.85, 65.41, 65.41, 0.22, 0.05, 380);
      } else {
        // Apex Apocalypse Nova: earth-shaking supernova blast
        this._playHeavyPunch(dest, now, 1.15, 96, 18, 0.98);
        this._playNoiseBurst(dest, now, 1.25, 0.86, 'lowpass', 2200, 85, 0.75, true);
        this._playNoiseBurst(dest, now + 0.03, 0.45, 0.50, 'bandpass', 1600, 320, 1.4, false);
      }
    } catch {}
  }

  _playHeal() {
    if (!this._isReady()) return;
    try {
      const now = this.ctx.currentTime;
      if (now - this._lastHealTime < 0.22) return;
      this._lastHealTime = now;
      const dest = this._sfxGain;
      // Pure pressurized med-injector hiss + dry mechanical latch click
      this._playNoiseBurst(dest, now, 0.15, 0.28, 'bandpass', 2400, 1250, 1.9, false);
      this._playNoiseBurst(dest, now + 0.09, 0.028, 0.22, 'bandpass', 1850, 1200, 4.5, false);
      this._playHeavyPunch(dest, now + 0.09, 0.05, 92, 42, 0.22);
    } catch {}
  }

  /** @private */
  _playGoldPickup() {
    if (!this._isReady()) return;
    try {
      const now = this.ctx.currentTime;
      const dest = this._sfxGain;
      const jitter = 0.94 + Math.random() * 0.12;
      this._playNoiseBurst(dest, now, 0.028, 0.24, 'bandpass', 3800 * jitter, 3200 * jitter, 9.0, false);
      this._playNoiseBurst(dest, now + 0.036, 0.036, 0.20, 'bandpass', 4800 * jitter, 4200 * jitter, 10.0, false);
    } catch {}
  }

  /** @private */
  _playWeaponDropPickup(payload) {
    if (!this._isReady()) return;
    try {
      const now = this.ctx.currentTime;
      const dest = this._sfxGain;
      const isOverclock = Boolean(payload && !payload.unlocked);
      this._playHeavyPunch(dest, now, 0.10, 110, 42, 0.48);
      this._playNoiseBurst(dest, now, 0.042, 0.34, 'bandpass', 1750, 880, 3.8, false);
      this._playNoiseBurst(dest, now + 0.075, 0.038, 0.34, 'bandpass', 2600, 1550, 4.6, false);
      if (isOverclock) {
        this._playHeavyPunch(dest, now + 0.09, 0.18, 95, 34, 0.52);
        this._playNoiseBurst(dest, now + 0.11, 0.12, 0.26, 'bandpass', 1500, 2200, 2.4, true);
      }
    } catch {}
  }

  /** @private */
  _playUpgradeSelected() {
    if (!this._isReady()) return;
    try {
      const now = this.ctx.currentTime;
      const dest = this._sfxGain;
      this._playHeavyPunch(dest, now, 0.18, 105, 36, 0.52);
      this._playNoiseBurst(dest, now, 0.050, 0.32, 'bandpass', 1450, 680, 3.2, false);
      this._playNoiseBurst(dest, now + 0.085, 0.060, 0.26, 'bandpass', 2300, 1500, 4.5, false);
    } catch {}
  }

  /** @private */
  _playPickup(payload) {
    if (!this._isReady()) return;
    try {
      const now = this.ctx.currentTime;
      const dest = this._sfxGain;
      const type = payload && payload.type;
      if (type === 'health') {
        this._playHeal();
      } else if (type === 'ammo') {
        this._playHeavyPunch(dest, now, 0.07, 115, 48, 0.34);
        this._playNoiseBurst(dest, now, 0.038, 0.28, 'bandpass', 2100, 1300, 4.2, false);
        this._playNoiseBurst(dest, now + 0.048, 0.032, 0.24, 'bandpass', 2900, 1850, 4.8, false);
      } else {
        this._playHeavyPunch(dest, now, 0.12, 102, 40, 0.36);
        this._playNoiseBurst(dest, now, 0.048, 0.28, 'bandpass', 1800, 900, 3.8, false);
      }
    } catch {}
  }

  /** @private */
  _playZoneProgress(payload) {
    if (!this._isReady() || !payload) return;
    try {
      const now = this.ctx.currentTime;
      const dest = this._sfxGain;
      if (payload.captured && !this._lastZoneCaptured) {
        this._lastZoneCaptured = true;
        this._playHeavyPunch(dest, now, 0.36, 92, 34, 0.52);
        this._playNoiseBurst(dest, now, 0.14, 0.28, 'bandpass', 1200, 600, 2.6, true);
        return;
      }
      if (!payload.captured) {
        this._lastZoneCaptured = false;
        const pct = Math.floor((Number(payload.progress) || 0) * 10);
        if (payload.capturing && pct > (this._lastZoneDecile || 0)) {
          this._lastZoneDecile = pct;
          this._playNoiseBurst(dest, now, 0.020, 0.15, 'bandpass', 1900 + pct * 70, 1500, 5.5, false);
        } else if (!payload.capturing) {
          this._lastZoneDecile = pct;
        }
      }
    } catch {}
  }

  /** @private */
  _playMapTransition() {
    if (!this._isReady()) return;
    try {
      const now = this.ctx.currentTime;
      const dest = this._sfxGain;
      this._playHeavyPunch(dest, now, 0.80, 72, 22, 0.68);
      this._playNoiseBurst(dest, now, 0.72, 0.40, 'lowpass', 1300, 160, 1.0, true);
      this._playNoiseBurst(dest, now + 0.08, 0.34, 0.22, 'bandpass', 2200, 850, 2.2, false);
    } catch {}
  }

  /** @private */
  _playSniperLock() {
    if (!this._isReady()) return;
    try {
      const now = this.ctx.currentTime;
      if (now - (this._lastSniperWarnTime || 0) < 1.15) return;
      this._lastSniperWarnTime = now;
      const dest = this._sfxGain;
      // Dry mechanical rangefinder double-click (no high sine beep)
      this._playNoiseBurst(dest, now, 0.018, 0.24, 'bandpass', 2600, 1900, 5.5, false);
      this._playNoiseBurst(dest, now + 0.085, 0.022, 0.28, 'bandpass', 3100, 2300, 5.5, false);
    } catch {}
  }

  /** @private */
  _playBossTelegraph(payload) {
    if (!this._isReady()) return;
    try {
      const now = this.ctx.currentTime;
      const dest = this._sfxGain;
      const type = payload && payload.type;
      if (type === 'shockwave') {
        this._playHeavyPunch(dest, now, 0.52, 86, 20, 0.84);
        this._playNoiseBurst(dest, now, 0.45, 0.54, 'lowpass', 880, 110, 0.9, true);
      } else {
        this._playHeavyPunch(dest, now, 0.20, 108, 34, 0.52);
        this._playNoiseBurst(dest, now, 0.18, 0.34, 'bandpass', 850, 280, 1.8, true);
      }
    } catch {}
  }

  /** @private */
  _playDryOrOverheat(payload) {
    if (!this._isReady()) return;
    try {
      const now = this.ctx.currentTime;
      if (now - (this._lastDryFireTime || 0) < 0.18) return;
      this._lastDryFireTime = now;
      const dest = this._sfxGain;
      if (payload && payload.overheat) {
        this._playNoiseBurst(dest, now, 0.36, 0.34, 'bandpass', 3000, 1100, 1.6, false);
        this._playHeavyPunch(dest, now, 0.12, 105, 42, 0.26);
      } else {
        this._playNoiseBurst(dest, now, 0.016, 0.28, 'bandpass', 3200, 2200, 6.5, false);
      }
    } catch {}
  }

  /** @private */
  _playDashReady() {
    if (!this._isReady()) return;
    try {
      const now = this.ctx.currentTime;
      const dest = this._sfxGain;
      this._playNoiseBurst(dest, now, 0.026, 0.16, 'bandpass', 2200, 1500, 4.8, false);
    } catch {}
  }

  /** @private */
  _playRankUp(payload) {
    if (!this._isReady()) return;
    try {
      const now = this.ctx.currentTime;
      const dest = this._sfxGain;
      this._playHeavyPunch(dest, now, 0.14, 105, 38, 0.36);
      this._playNoiseBurst(dest, now, 0.038, 0.24, 'bandpass', 2100, 1300, 4.2, false);
    } catch {}
  }

  /** @private */
  _playSynergy() {
    if (!this._isReady()) return;
    try {
      const now = this.ctx.currentTime;
      const dest = this._sfxGain;
      this._playHeavyPunch(dest, now, 0.28, 92, 30, 0.50);
      this._playNoiseBurst(dest, now, 0.15, 0.30, 'bandpass', 1500, 760, 2.8, true);
    } catch {}
  }

  // ===========================================================================
  // 3D SPATIALIZED EXPLOSIONS & ENEMY WEAPONRY (Heavy Ballistic — Zero Neon)
  // ===========================================================================

  /** @private */
  _playBarrelExplosion(payload) {
    if (!this._isReady()) return;
    try {
      const now = this.ctx.currentTime;
      const pos = payload && payload.position;
      const dest = pos ? this._getSpatialPanner(pos, 7.5, 85, 1.0) : this._sfxGain;

      this._playHeavyPunch(dest, now, 0.65, 84, 19, 0.96);
      this._playNoiseBurst(dest, now, 0.88, 0.82, 'lowpass', 2200, 95, 0.8, true);
      this._playNoiseBurst(dest, now + 0.02, 0.32, 0.44, 'bandpass', 1750, 380, 1.4, false);
    } catch {}
  }

  /** @private */
  playEnemyShot(worldPos, archetypeId = 'tactical_trooper') {
    if (!this._isReady()) return;
    try {
      const now = this.ctx.currentTime;
      if (now - this._lastEnemyShotTime < 0.028) return;
      this._lastEnemyShotTime = now;

      const dest = worldPos
        ? this._getSpatialPanner(worldPos, 6.0, 70, 1.2)
        : this._sfxGain;
      const jitter = 0.94 + Math.random() * 0.12;

      switch (archetypeId) {
        case 'rusher_drone':
        case 'interceptor_drone':
          this._playHeavyPunch(dest, now, 0.055, 108 * jitter, 38, 0.32);
          this._playNoiseBurst(dest, now, 0.044, 0.28, 'bandpass', 1800 * jitter, 720, 1.5, false);
          break;
        case 'shock_breacher':
          this._playHeavyPunch(dest, now, 0.15, 96 * jitter, 28, 0.56);
          this._playNoiseBurst(dest, now, 0.14, 0.48, 'lowpass', 1600, 200, 1.0, true);
          break;
        case 'vanguard_assassin':
          this._playHeavyPunch(dest, now, 0.055, 114 * jitter, 42, 0.34);
          this._playNoiseBurst(dest, now, 0.040, 0.30, 'bandpass', 2100 * jitter, 850, 1.4, false);
          break;
        case 'heavy_enforcer':
        case 'rail_warden':
          this._playHeavyPunch(dest, now, 0.20, 94 * jitter, 26, 0.60);
          this._playNoiseBurst(dest, now, 0.16, 0.48, 'lowpass', 1400, 180, 1.0, true);
          break;
        case 'mortar_artillery':
          this._playHeavyPunch(dest, now, 0.25, 82 * jitter, 22, 0.64);
          this._playNoiseBurst(dest, now, 0.22, 0.44, 'lowpass', 1050, 130, 0.9, true);
          break;
        case 'sniper_stalker':
          this._playHeavyPunch(dest, now, 0.16, 104 * jitter, 28, 0.58);
          this._playNoiseBurst(dest, now, 0.028, 0.56, 'bandpass', 2400 * jitter, 820, 1.1, false);
          this._playNoiseBurst(dest, now + 0.01, 0.16, 0.40, 'lowpass', 1500, 190, 0.9, true);
          break;
        case 'aegis_overlord_boss':
        case 'cyber_mech_boss':
          this._playHeavyPunch(dest, now, 0.26, 84 * jitter, 20, 0.72);
          this._playNoiseBurst(dest, now, 0.20, 0.54, 'lowpass', 1400, 140, 0.95, true);
          break;
        case 'tactical_trooper':
        default:
          this._playHeavyPunch(dest, now, 0.070, 102 * jitter, 36, 0.36);
          this._playNoiseBurst(dest, now, 0.062, 0.30, 'bandpass', 1550 * jitter, 520, 1.4, true);
          break;
      }
    } catch {}
  }

  // ===========================================================================
  // CINEMATIC WAVE & BOSS STINGERS (Deep War-Horn & Mechanical Impact — Zero Beeps)
  // ===========================================================================

  /** @private */
  _playWaveStarted(payload) {
    if (!this._isReady()) return;
    try {
      const now = this.ctx.currentTime;
      const dest = this._sfxGain;
      const isBoss = Boolean(payload && payload.isBossWave);
      if (isBoss) {
        this._playBossPhase({ phase: 1 });
        return;
      }
      this._playHeavyPunch(dest, now, 0.45, 78, 28, 0.50);
      const freqs = [73.42, 110.0];
      for (let i = 0; i < freqs.length; i++) {
        this._playTone(dest, 'sawtooth', now, 0.65, freqs[i], freqs[i], 0.12, 0.08, 620);
      }
    } catch {}
  }

  /** @private */
  _playWaveCleared(payload) {
    if (!this._isReady()) return;
    try {
      const now = this.ctx.currentTime;
      const dest = this._sfxGain;
      const isFinal = Boolean(payload && payload.isFinalWave);
      const baseNotes = isFinal ? [82.41, 110.0, 146.83] : [82.41, 110.0];
      for (let i = 0; i < baseNotes.length; i++) {
        const t = now + i * 0.16;
        this._playTone(dest, 'sawtooth', t, 0.45, baseNotes[i], baseNotes[i], 0.13, 0.03, 520);
        this._playHeavyPunch(dest, t, 0.25, baseNotes[i], 36, 0.32);
      }
      this._playNoiseBurst(dest, now, 0.07, 0.16, 'bandpass', 1600, 900, 3.0, false);
    } catch {}
  }

  /** @private */
  _playBossPhase(payload) {
    if (!this._isReady()) return;
    try {
      const now = this.ctx.currentTime;
      const dest = this._sfxGain;
      const phase = Number(payload && payload.phase) || 2;
      const baseHz = phase >= 3 ? 55.0 : 65.41;

      // Deep Cinematic War-Horn + Sub Impact (Zero square alert pips!)
      this._playTone(dest, 'sawtooth', now, 1.15, baseHz, baseHz * 0.96, 0.24, 0.06, 560);
      this._playTone(dest, 'sawtooth', now, 1.15, baseHz * 1.006, baseHz * 0.966, 0.24, 0.06, 600);
      this._playHeavyPunch(dest, now, 1.10, 74, 20, 0.72);
      this._playNoiseBurst(dest, now, 0.55, 0.34, 'lowpass', 620, 140, 1.4, true);
    } catch {}
  }

  /**
   * Sync Web Audio 3D AudioListener to camera transform and schedule adaptive
   * cyberpunk synth combat pulse notes via lookahead. Zero allocations.
   *
   * @param {number} dt
   */
  update(dt) {
    if (!this._isReady()) return;
    const clampedDt = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.1) : 0.016;

    // 1. Update 3D AudioListener position & orientation from Three.js camera matrixWorld
    this._syncAudioListener();

    // 2. Smoothly blend combat intensity & schedule cyberpunk synth pulse steps
    const desiredIntensity = this._musicEnabled && this._inGameplay ? this._targetIntensity : 0;
    this._currentIntensity +=
      (desiredIntensity - this._currentIntensity) * (1 - Math.exp(-2.4 * clampedDt));

    if (this._currentIntensity < 0.05 || !this._musicEnabled || !this._inGameplay) {
      this._nextStepTime = this.ctx.currentTime + 0.06;
      return;
    }

    const now = this.ctx.currentTime;
    if (this._nextStepTime < now - 0.25) {
      this._nextStepTime = now + 0.04;
    }

    // Lookahead scheduling window (120ms) for rock-solid rhythm
    while (this._nextStepTime < now + 0.12) {
      this._schedulePulseStep(this._nextStepTime, this._stepIndex, this._currentIntensity);
      this._nextStepTime += STEP_DURATION_SEC;
      this._stepIndex = (this._stepIndex + 1) & 15;
    }
  }

  /**
   * Read camera world position, forward (-Z), and up (+Y) directly from matrixWorld.elements.
   * @private
   */
  _syncAudioListener() {
    if (!this.camera || !this.ctx || !this.ctx.listener) return;
    try {
      const m = this.camera.matrixWorld && this.camera.matrixWorld.elements;
      if (!m || m.length < 16) return;

      const px = m[12];
      const py = m[13];
      const pz = m[14];

      // Forward is -Z column (-m[8], -m[9], -m[10]); Up is +Y column (m[4], m[5], m[6])
      let fx = -m[8];
      let fy = -m[9];
      let fz = -m[10];
      const fLen = Math.hypot(fx, fy, fz);
      if (fLen > 1e-5) {
        fx /= fLen;
        fy /= fLen;
        fz /= fLen;
      }

      let ux = m[4];
      let uy = m[5];
      let uz = m[6];
      const uLen = Math.hypot(ux, uy, uz);
      if (uLen > 1e-5) {
        ux /= uLen;
        uy /= uLen;
        uz /= uLen;
      }

      const listener = this.ctx.listener;
      const now = this.ctx.currentTime;

      if (listener.positionX && listener.forwardX && listener.upX) {
        listener.positionX.setValueAtTime(px, now);
        listener.positionY.setValueAtTime(py, now);
        listener.positionZ.setValueAtTime(pz, now);
        listener.forwardX.setValueAtTime(fx, now);
        listener.forwardY.setValueAtTime(fy, now);
        listener.forwardZ.setValueAtTime(fz, now);
        listener.upX.setValueAtTime(ux, now);
        listener.upY.setValueAtTime(uy, now);
        listener.upZ.setValueAtTime(uz, now);
      } else {
        if (typeof listener.setPosition === 'function') {
          listener.setPosition(px, py, pz);
        }
        if (typeof listener.setOrientation === 'function') {
          listener.setOrientation(fx, fy, fz, ux, uy, uz);
        }
      }
    } catch {}
  }

  /**
   * Schedule one 16th-note step of the adaptive cyberpunk dark-synth combat pulse.
   * @private
   */
  _schedulePulseStep(time, step, intensity) {
    try {
      const dest = this._musicGain;
      const bassHz = BASS_PATTERN_HZ[step] * 0.75; // Deeper post-apocalyptic industrial drone register
      const isDownbeat = step % 4 === 0;
      const isBackbeat = step === 4 || step === 12;
      const isOffbeat = step % 4 === 2;

      // Layer 1: Gritty low-pass industrial drone sub-bass (zero bright neon synth)
      if (isDownbeat || step % 2 === 0) {
        const cutoff = 140 + intensity * 420 + (isDownbeat ? 120 : 0);
        const bassGain = (0.28 + intensity * 0.22) * (isDownbeat ? 1.18 : 0.75);
        this._playTone(dest, 'sawtooth', time, STEP_DURATION_SEC * 1.45, bassHz, bassHz * 0.98, bassGain, 0.008, cutoff);
      }

      // Layer 2: Heavy industrial war-drum kick & muffled steel shaker
      if (intensity > 0.28) {
        const drumScale = Math.min(1, (intensity - 0.28) / 0.45);
        if (isDownbeat) {
          this._playTone(dest, 'sine', time, 0.14, 112, 32, 0.56 * drumScale, 0.002);
          this._playNoiseBurst(dest, time, 0.04, 0.16 * drumScale, 'lowpass', 420, 140, 1.0, true);
        } else if (isOffbeat) {
          this._playNoiseBurst(dest, time, 0.032, 0.12 * drumScale, 'bandpass', 2400, 1100, 2.2, true);
        }
      }

      // Layer 3: Heavy industrial war-drum & metallic anvil slam (zero neon square synth)
      if (intensity > 0.52 && (isBackbeat || (intensity > 0.78 && step === 14))) {
        const clangScale = Math.min(1, (intensity - 0.52) / 0.42);
        this._playTone(dest, 'sine', time, 0.18, 92, 28, 0.48 * clangScale, 0.002);
        this._playNoiseBurst(dest, time, 0.13, 0.26 * clangScale, 'bandpass', 1180, 360, 2.8, true);
      }
    } catch {}
  }

  /**
   * Unsubscribe from EventBus and close AudioContext cleanly.
   */
  dispose() {
    if (this._disposed) return;
    this._disposed = true;

    for (let i = 0; i < this._unsubs.length; i++) {
      this._unsubs[i]();
    }
    this._unsubs.length = 0;

    for (let i = 0; i < this._pannerPool.length; i++) {
      try {
        this._pannerPool[i].disconnect();
      } catch {}
    }
    this._pannerPool.length = 0;

    if (this.ctx) {
      try {
        const p = this.ctx.close();
        if (p && typeof p.catch === 'function') {
          p.catch(() => {});
        }
      } catch {}
      this.ctx = null;
    }
    this._masterGain = null;
    this._sfxGain = null;
    this._musicGain = null;
    this._compressor = null;
    this._whiteNoiseBuffer = null;
    this._pinkNoiseBuffer = null;
  }
}
  __exports.SoundEngine = SoundEngine;
});
