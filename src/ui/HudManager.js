// Module: src/ui/HudManager.js
__define("src/ui/HudManager.js", (__exports, __require) => {
const { EVENTS, MAPS } = __require("src/config/constants.js");
const { WEAPONS } = __require("src/config/weapons.js");

const MAX_FLOATING_NUMBERS = 20;
const KILLFEED_SLOTS = 4;
const DAMAGE_ARC_SLOTS = 4;
const MINIMAP_SIZE = 140;
const MINIMAP_INTERVAL = 0.05; // ~20Hz crisp radar refresh

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function formatScore(n) {
  const num = Math.max(0, Math.floor(Number(n) || 0));
  return String(num).padStart(6, '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function formatTime(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
}

/**
 * Post-Apocalyptic Military-SF Tactical HUD Manager for AETHER DROP: RECLAIM EARTH.
 * Subscribes cleanly to EventBus combat/world events and renders zero-DOM-churn
 * tactical telemetry: dynamic crosshair, multi-type hitmarkers, pooled 3D->2D
 * floating damage numbers, 360-degree directional hit arcs, vitality/dash gauges,
 * 4-weapon loadout strip, Terra-Beacon & Ash Titan Boss HP bars, dynamically rebaked
 * 2D canvas radar across all 3 campaign sectors, killfeed, callouts, and debrief UI.
 */
class HudManager {
  /**
   * @param {import('../core/EventBus.js').EventBus} eventBus
   * @param {THREE.PerspectiveCamera} camera
   */
  constructor(eventBus, camera) {
    this.eventBus = eventBus;
    this.camera = camera;

    const byId = (id) => document.getElementById(id);

    this._hudRoot = byId('hud-root');
    this._damageVignette = byId('damage-vignette');
    this._healFlash = byId('heal-flash');
    this._railgunScope = byId('railgun-scope');
    this._floatingLayer = byId('floating-damage-layer');

    // Crosshair & Hitmarkers
    this._crosshair = byId('crosshair');
    this._xhairTop = byId('xhair-top');
    this._xhairBottom = byId('xhair-bottom');
    this._xhairLeft = byId('xhair-left');
    this._xhairRight = byId('xhair-right');
    this._xhairDot = byId('xhair-dot');
    this._hitmarker = byId('hitmarker');
    this._hitmarkerHeadshot = byId('hitmarker-headshot');
    this._hitmarkerShield = byId('hitmarker-shield');

    // Minimap & FPS
    this._minimapCanvas = byId('minimap-canvas');
    this._minimapCtx = this._minimapCanvas ? this._minimapCanvas.getContext('2d') : null;
    this._minimapTag = byId('minimap-tag');
    this._staticMapCanvas = null;
    this._fpsCounter = byId('fps-counter');

    // Top-Center Wave, Terra-Beacon Zone, Ash Titan Boss & Announcement Banner
    this._waveBadge = byId('wave-badge');
    this._waveName = byId('wave-name');
    this._objectiveText = byId('objective-text');
    this._hostilesCount = byId('hostiles-count');

    this._zonePanel = byId('zone-panel');
    this._zoneStatusLabel = byId('zone-status-label');
    this._zonePct = byId('zone-pct');
    this._zoneBarFill = byId('zone-bar-fill');

    this._bossPanel = byId('boss-panel');
    this._bossName = byId('boss-name');
    this._bossPhaseBadge = byId('boss-phase-badge');
    this._bossShieldTag = byId('boss-shield-tag');
    this._bossHpText = byId('boss-hp-text');
    this._bossBarFill = byId('boss-bar-fill');

    this._banner = byId('announcement-banner');
    this._bannerKicker = byId('announcement-kicker');
    this._bannerTitle = byId('announcement-title');
    this._bannerSub = byId('announcement-sub');

    // Step 1: 3D Beacon Waypoint, Sniper Lock Warning & Micro-Onboarding Tip
    this._beaconWaypoint = byId('beacon-waypoint');
    this._beaconDist = byId('beacon-dist');
    this._hudGoldPill = byId('hud-gold-pill');
    this._hudBuffRow = byId('hud-buff-row');
    this._lastGoldText = '';
    this._lastBuffKey = '';
    this._sniperWarning = byId('sniper-warning');
    this._onboardingTip = byId('onboarding-tip');
    this._onboardingTimer = 0;
    this._onboardingFlags = {
      firstKill: false,
      firstBeacon: false,
      firstHeavy: false,
      firstMortar: false,
      firstOverlord: false,
    };
    this._waypointVec = new THREE.Vector3();

    // Top-Right Score, Combo & Killfeed
    this._scoreValue = byId('score-value');
    this._comboBadge = byId('combo-badge');
    this._comboMult = byId('combo-mult');
    this._comboBarFill = byId('combo-bar-fill');
    this._killfeedEls = [
      byId('killfeed-slot-0'),
      byId('killfeed-slot-1'),
      byId('killfeed-slot-2'),
      byId('killfeed-slot-3'),
    ];

    // Bottom-Left Vitality & Mobility
    this._shieldValue = byId('shield-value');
    this._shieldBarFill = byId('shield-bar-fill');
    this._healthValue = byId('health-value');
    this._healthBarFill = byId('health-bar-fill');
    this._dashPips = [byId('dash-pip-0'), byId('dash-pip-1'), byId('dash-pip-2')];
    this._dashPipFills = [byId('dash-pip-fill-0'), byId('dash-pip-fill-1'), byId('dash-pip-fill-2')];
    this._mobilityStatus = byId('mobility-status');

    // Bottom-Right Weapon & Loadout Strip
    this._weaponPanel = byId('weapon-panel');
    this._weaponName = byId('weapon-name');
    this._weaponRole = byId('weapon-role');
    this._ammoMag = byId('ammo-mag');
    this._ammoReserve = byId('ammo-reserve');
    this._reloadBarWrap = byId('reload-bar-wrap');
    this._reloadBarFill = byId('reload-bar-fill');
    this._slotBtns = [
      byId('weapon-slot-0'),
      byId('weapon-slot-1'),
    ];
    this._slotCodeEls = [
      byId('slot-code-0'),
      byId('slot-code-1'),
    ];
    this._pickupPrompt = byId('pickup-prompt');

    // Independent Result / Debrief Scene Refs (#scene-result)
    this._sceneResult = byId('scene-result');
    this._endBadge = byId('end-badge');
    this._endTitle = byId('end-title');
    this._endSubtitle = byId('end-subtitle');
    this._endRank = byId('end-rank');
    this._statScore = byId('stat-score');
    this._statKills = byId('stat-kills');
    this._statHeadshots = byId('stat-headshots');
    this._statAccuracy = byId('stat-accuracy');
    this._statCombo = byId('stat-combo');
    this._statWave = byId('stat-wave');
    this._statTime = byId('stat-time');

    // 4-Slot 360-Degree Directional Damage Arc Pool
    const arcEls = [
      byId('damage-arc-0'),
      byId('damage-arc-1'),
      byId('damage-arc-2'),
      byId('damage-arc-3'),
    ];
    this._dmgEdgeTop = byId('dmg-edge-top');
    this._dmgEdgeRight = byId('dmg-edge-right');
    this._dmgEdgeBottom = byId('dmg-edge-bottom');
    this._dmgEdgeLeft = byId('dmg-edge-left');
    this._damageArcs = [];
    for (let i = 0; i < DAMAGE_ARC_SLOTS; i++) {
      this._damageArcs.push({
        el: arcEls[i],
        active: false,
        age: 0,
        duration: 0.72,
        sourceX: 0,
        sourceZ: 0,
        isShieldOnly: false,
      });
    }
    this._damageArcCursor = 0;

    // 20-Slot Pre-Allocated Floating Damage Numbers Pool (strictly zero runtime DOM creation!)
    this._floatPool = [];
    this._floatCursor = 0;
    this._projVec = new THREE.Vector3();
    for (let i = 0; i < MAX_FLOATING_NUMBERS; i++) {
      const div = document.createElement('div');
      div.className = 'floating-dmg';
      if (this._floatingLayer) {
        this._floatingLayer.appendChild(div);
      }
      this._floatPool.push({
        el: div,
        active: false,
        age: 0,
        duration: 0.78,
        worldPos: new THREE.Vector3(),
        driftX: 0,
        riseSpeed: 1.65,
      });
    }

    // 4-Slot Killfeed State
    this._killfeed = [];
    for (let i = 0; i < KILLFEED_SLOTS; i++) {
      this._killfeed.push({
        text: '',
        cls: '',
        timer: 0,
        visible: false,
      });
    }

    // Timers & Transient Feedback State
    this._hitTimer = 0;
    this._hitMaxTimer = 0.14;
    this._hitIsKill = false;
    this._headshotTimer = 0;
    this._shieldHitTimer = 0;

    this._vignetteIntensity = 0;
    this._vignetteShieldOnly = false;
    this._healFlashIntensity = 0;

    this._bannerTimer = 0;
    this._bannerVisible = false;
    this._zoneCapturedNotified = false;

    // Minimap Arena Cache
    this._arenaData = null;
    this._bounds = { minX: -32, maxX: 32, minZ: -32, maxZ: 32 };
    this._minimapAccum = MINIMAP_INTERVAL;
    this._radarTime = 0;

    // Dirty-Check Caches (prevents unnecessary DOM writes in hot 60fps loop!)
    this._cache = {
      health: -1,
      healthTier: '',
      shield: -1,
      dash0Pct: -1,
      dash1Pct: -1,
      dash0Ready: null,
      dash1Ready: null,
      mobility: '',
      mobilityBoost: false,
      weaponId: '',
      weaponSlot: -1,
      ammo: -1,
      reserve: -1,
      lowAmmo: false,
      isReloading: null,
      reloadPct: -1,
      spreadPx: -1,
      crosshairMode: '',
      railScope: false,
      wave: -1,
      waveName: '',
      objective: '',
      hostiles: -1,
      intermissionStr: '',
      zoneVisible: null,
      zoneClass: '',
      zoneLabel: '',
      zonePct: -1,
      bossVisible: null,
      bossName: '',
      bossPhase: '',
      bossHpText: '',
      bossHpPct: -1,
      bossShield: null,
      score: -1,
      combo: -1,
      comboPct: -1,
      fps: -1,
      fpsTimer: 0,
      vignetteOp: '0.000',
      vignetteShield: false,
      vignetteLowHp: false,
      healOp: '0.000',
    };

    // Weapon slot click/tap handlers
    this._weaponSwitchHandler = null;
    this._slotListeners = [];
    for (let i = 0; i < this._slotBtns.length; i++) {
      const btn = this._slotBtns[i];
      if (!btn) continue;
      const slotIndex = i;
      const handler = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this._weaponSwitchHandler) {
          this._weaponSwitchHandler(slotIndex);
        }
      };
      btn.addEventListener('pointerdown', handler);
      this._slotListeners.push({ btn, handler });
    }

    // Bind EventBus subscriptions
    this._unsubs = [];
    this._bindEvents();
  }

  /** @private */
  _bindEvents() {
    if (!this.eventBus) return;
    const on = (evt, fn) => {
      this._unsubs.push(this.eventBus.on(evt, fn));
    };

    on(EVENTS.DAMAGE_DEALT, (p) => this._onDamageDealt(p));
    on(EVENTS.ENEMY_KILLED, (p) => this._onEnemyKilled(p));
    on(EVENTS.PLAYER_DAMAGED, (p) => this._onPlayerDamaged(p));
    on(EVENTS.PLAYER_HEALED, (p) => this._onPlayerHealed(p));
    on(EVENTS.WEAPON_SWITCHED, (p) => this._onWeaponSwitched(p));
    on(EVENTS.ZONE_PROGRESS, (p) => this._onZoneProgress(p));
    on(EVENTS.WAVE_STARTED, (p) => this._onWaveStarted(p));
    on(EVENTS.WAVE_CLEARED, (p) => this._onWaveCleared(p));
    on(EVENTS.BOSS_PHASE, (p) => this._onBossPhase(p));
    on(EVENTS.BARREL_EXPLODED, (p) => {
      const label =
        p && p.gimmickType === 'emp_pylon'
          ? 'EMP PYLON OVERLOADED'
          : p && p.gimmickType === 'shield_relay'
          ? 'SHIELD RELAY SHATTERED'
          : 'THERMITE DRUM DETONATED';
      this._pushKillfeed(label, p && p.gimmickType ? 'boss' : 'headshot');
    });
    on(EVENTS.ANNOUNCEMENT, (p) => {
      if (!p) return;
      this.showAnnouncement(
        p.kicker || '',
        p.title || '',
        p.subtitle || '',
        p.themeClass || '',
        p.duration || 2.8
      );
    });
    on(EVENTS.PICKUP_COLLECTED, (p) => this._onPickupCollected(p));
    on(EVENTS.GOLD_COLLECTED, (p) => {
      if (p && p.amount) this._pushKillfeed(`+${p.amount} G 획득`, 'pickup');
    });
    on(EVENTS.WEAPON_DROPPED, (p) => {
      if (!p || !p.weapon) return;
      const msg = p.unlocked
        ? `무기 교체: ${p.weapon.shortName}`
        : `${p.weapon.shortName} 오버클럭 +${p.overclockLevel * 15}%`;
      this._pushKillfeed(msg, 'headshot');
      const tip = p.unlocked
        ? `${p.weapon.name} 장착 완료` + (p.replacedWeapon ? ` (${p.replacedWeapon.shortName} 바닥에 드랍)` : '')
        : `${p.weapon.name} 화력 강화 (+15%) 및 탄약 완충`;
      this.showOnboardingTip(tip, 3.0);
    });
    on(EVENTS.MAP_TRANSITION, (p) => this._onMapTransition(p));
    on(EVENTS.GAME_STATE, (p) => this._onGameState(p));
  }

  /**
   * Register callback invoked when player clicks or taps weapon slot buttons 1..4.
   * @param {(slotIndex: number) => void} fn
   */
  setWeaponSwitchHandler(fn) {
    this._weaponSwitchHandler = typeof fn === 'function' ? fn : null;
  }

  /**
   * Show or hide the in-game HUD container cleanly.
   * @param {boolean} visible
   */
  setVisible(visible) {
    if (this._hudRoot) {
      this._hudRoot.classList.toggle('hidden', !visible);
    }
    if (!visible && this._railgunScope) {
      this._railgunScope.classList.remove('active');
      this._cache.railScope = false;
    }
  }

  /**
   * Update dynamic minimap sector tag (#minimap-tag) and re-bake static arena
   * architecture onto an offscreen canvas cleanly on every map load/transition.
   * @param {any} arenaData
   * @param {import('../physics/CollisionWorld.js').CollisionWorld} collisionWorld
   */
  setArenaData(arenaData, collisionWorld) {
    this._arenaData = arenaData || null;
    if (arenaData && arenaData.arenaBounds) {
      this._bounds.minX = arenaData.arenaBounds.minX;
      this._bounds.maxX = arenaData.arenaBounds.maxX;
      this._bounds.minZ = arenaData.arenaBounds.minZ;
      this._bounds.maxZ = arenaData.arenaBounds.maxZ;
    } else {
      this._bounds.minX = -32;
      this._bounds.maxX = 32;
      this._bounds.minZ = -32;
      this._bounds.maxZ = 32;
    }

    if (this._minimapTag) {
      this._minimapTag.textContent = (arenaData && arenaData.mapCode) || 'SEC-09';
    }

    // Force immediate redraw on next update tick
    this._minimapAccum = MINIMAP_INTERVAL;

    if (typeof document === 'undefined') return;

    const off = document.createElement('canvas');
    off.width = MINIMAP_SIZE;
    off.height = MINIMAP_SIZE;
    const ctx = off.getContext('2d');
    if (!ctx) return;

    // 1. Bright Daylight Aero-Glass Tactical Radar Base & Range Grid
    ctx.fillStyle = '#f1f7fd';
    ctx.fillRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);

    ctx.strokeStyle = 'rgba(2, 132, 199, 0.14)';
    ctx.lineWidth = 1;
    const step = MINIMAP_SIZE / 4;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(i * step, 0);
      ctx.lineTo(i * step, MINIMAP_SIZE);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * step);
      ctx.lineTo(MINIMAP_SIZE, i * step);
      ctx.stroke();
    }

    // Concentric range circles
    ctx.strokeStyle = 'rgba(2, 132, 199, 0.22)';
    ctx.beginPath();
    ctx.arc(MINIMAP_SIZE * 0.5, MINIMAP_SIZE * 0.5, 28, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(MINIMAP_SIZE * 0.5, MINIMAP_SIZE * 0.5, 52, 0, Math.PI * 2);
    ctx.stroke();

    // 2. Render CollisionWorld static architecture (platforms/catwalks first, then walls/cover)
    const boxes =
      collisionWorld && typeof collisionWorld.getBoxes === 'function'
        ? collisionWorld.getBoxes()
        : [];

    const pad = 6;
    const spanX = Math.max(1, this._bounds.maxX - this._bounds.minX);
    const spanZ = Math.max(1, this._bounds.maxZ - this._bounds.minZ);
    const drawSpan = MINIMAP_SIZE - pad * 2;

    const toMapX = (wx) => pad + ((wx - this._bounds.minX) / spanX) * drawSpan;
    const toMapY = (wz) => pad + ((wz - this._bounds.minZ) / spanZ) * drawSpan;

    // Pass A: Elevated platforms, ramps, dais
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (b.tag === 'floor' || b.maxY <= 0.05) continue;
      if (b.tag === 'platform' || b.tag === 'catwalk' || b.tag === 'ramp') {
        const x1 = toMapX(b.minX);
        const y1 = toMapY(b.minZ);
        const w = Math.max(2, toMapX(b.maxX) - x1);
        const h = Math.max(2, toMapY(b.maxZ) - y1);
        ctx.fillStyle = b.maxY > 2.5 ? 'rgba(14, 165, 233, 0.22)' : 'rgba(56, 189, 248, 0.14)';
        ctx.fillRect(x1, y1, w, h);
        ctx.strokeStyle = 'rgba(2, 132, 199, 0.42)';
        ctx.lineWidth = 0.85;
        ctx.strokeRect(x1, y1, w, h);
      }
    }

    // Pass B: Solid walls, pillars & tactical cover
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (b.tag === 'floor' || b.maxY <= 0.05) continue;
      if (b.tag === 'platform' || b.tag === 'catwalk' || b.tag === 'ramp') continue;
      const x1 = toMapX(b.minX);
      const y1 = toMapY(b.minZ);
      const w = Math.max(2.5, toMapX(b.maxX) - x1);
      const h = Math.max(2.5, toMapY(b.maxZ) - y1);
      ctx.fillStyle = b.tag === 'wall' ? 'rgba(51, 65, 85, 0.58)' : 'rgba(100, 116, 139, 0.62)';
      ctx.fillRect(x1, y1, w, h);
    }

    // Pneumatic jump-pad thruster rings on static map
    const pads =
      collisionWorld && typeof collisionWorld.getJumpPads === 'function'
        ? collisionWorld.getJumpPads()
        : [];
    ctx.strokeStyle = 'rgba(249, 115, 22, 0.88)';
    ctx.lineWidth = 1.4;
    for (let i = 0; i < pads.length; i++) {
      const p = pads[i];
      ctx.beginPath();
      ctx.arc(toMapX(p.x), toMapY(p.z), 3.2, 0, Math.PI * 2);
      ctx.stroke();
    }

    this._staticMapCanvas = off;
  }

  // ---------------------------------------------------------------------------
  // EventBus Handlers
  // ---------------------------------------------------------------------------

  /** @private */
  _onDamageDealt(payload) {
    if (!payload) return;
    const amount = Math.round(Number(payload.amount) || 0);
    const isHead = Boolean(payload.isHeadshot);
    const killed = Boolean(payload.killed);
    const blocked = Boolean(payload.blockedByShield);

    // Hitmarker triggers
    if (blocked) {
      this._shieldHitTimer = 0.18;
    } else if (isHead) {
      this._headshotTimer = 0.22;
      if (killed) {
        this._hitTimer = 0.22;
        this._hitMaxTimer = 0.22;
        this._hitIsKill = true;
      }
    } else {
      this._hitIsKill = killed;
      this._hitMaxTimer = killed ? 0.22 : 0.14;
      this._hitTimer = this._hitMaxTimer;
    }

    // Spawn pooled 3D->2D floating damage number
    if (amount > 0 && payload.point) {
      const slot = this._floatPool[this._floatCursor];
      this._floatCursor = (this._floatCursor + 1) % MAX_FLOATING_NUMBERS;

      slot.active = true;
      slot.age = 0;
      slot.duration = isHead || killed ? 0.86 : 0.68;
      slot.worldPos.set(
        payload.point.x || 0,
        (payload.point.y || 0) + 0.18,
        payload.point.z || 0
      );
      slot.driftX = (Math.random() - 0.5) * 46;
      slot.riseSpeed = isHead ? 1.9 : 1.35;

      slot.el.textContent = isHead ? `${amount}!` : String(amount);
      slot.el.className = blocked
        ? 'floating-dmg shield'
        : isHead
        ? 'floating-dmg headshot'
        : killed
        ? 'floating-dmg kill'
        : 'floating-dmg';
      slot.el.style.display = 'block';
    }
  }

  /** @private */
  _onEnemyKilled(payload) {
    if (!payload) return;
    this._hitIsKill = true;
    this._hitMaxTimer = 0.22;
    this._hitTimer = 0.22;

    const name = payload.name || '적기';
    const pts = payload.score ? ` +${payload.score}` : '';
    const prefix = payload.isBoss ? '[보스 격파] ' : payload.isHeadshot ? '[헤드샷] ' : '';
    const cls = payload.isBoss ? 'boss' : payload.isHeadshot ? 'headshot' : '';
    this._pushKillfeed(`${prefix}${name}${pts}`, cls);

    if (!this._onboardingFlags.firstKill) {
      this._onboardingFlags.firstKill = true;
      this.showOnboardingTip('쉴드 흡수 +25 — 연속 처치와 헤드샷으로 방어막을 유지하세요', 4.0);
    }
  }

  /** @private */
  _onPlayerDamaged(payload) {
    if (!payload) return;
    const healthDmg = Number(payload.healthDamage) || 0;
    const shieldDmg = Number(payload.shieldDamage) || 0;
    const total = Number(payload.amount) || healthDmg + shieldDmg;

    this._vignetteShieldOnly = healthDmg <= 0 && shieldDmg > 0;
    this._vignetteIntensity = Math.min(1.0, Math.max(this._vignetteIntensity, 0.42 + total * 0.015));

    if (payload.sourcePos) {
      const arc = this._damageArcs[this._damageArcCursor];
      this._damageArcCursor = (this._damageArcCursor + 1) % DAMAGE_ARC_SLOTS;
      arc.active = true;
      arc.age = 0;
      arc.duration = 0.78;
      arc.sourceX = payload.sourcePos.x || 0;
      arc.sourceZ = payload.sourcePos.z || 0;
      arc.isShieldOnly = this._vignetteShieldOnly;
      if (arc.el) {
        arc.el.classList.toggle('shield-arc', arc.isShieldOnly);
      }
    }
  }

  /** @private */
  _onPlayerHealed(payload) {
    if (!payload) return;
    if ((payload.healthGain || 0) > 0 || (payload.shieldGain || 0) > 4) {
      this._healFlashIntensity = Math.max(this._healFlashIntensity, 0.7);
    }
  }

  /** @private */
  _onWeaponSwitched(payload) {
    if (!payload || !payload.weapon) return;
    this._applyWeaponTheme(payload.weapon, payload.index);
  }

  /** @private */
  _onZoneProgress(payload) {
    if (!payload) return;
    if (payload.captured && !this._zoneCapturedNotified) {
      this._zoneCapturedNotified = true;
      this.showAnnouncement(
        'SOLARIS DROP // SKYWARD UPLINK',
        'TERRA-BEACON SECURED',
        'SHIELD & AMMO RESTORED // +1,200 BONUS',
        'clear-alert',
        2.8
      );
    } else if (!payload.active || payload.progress < 0.05) {
      this._zoneCapturedNotified = false;
    }
  }

  /** @private */
  _onWaveStarted(payload) {
    if (!payload) return;
    this._zoneCapturedNotified = false;
    const wPad = String(payload.wave || 1).padStart(2, '0');
    const tPad = String(payload.totalWaves || 10).padStart(2, '0');
    const kicker = payload.isBossWave
      ? '최종 보스 출현'
      : `WAVE ${wPad} / ${tPad}`;
    this.showAnnouncement(
      kicker,
      payload.name || `WAVE ${payload.wave}`,
      payload.subtitle || payload.objective || '',
      payload.isBossWave ? 'boss-alert' : '',
      1.9
    );

    if (payload.wave === 1) {
      this.showOnboardingTip('적을 처치하면 쉴드가 회복됩니다 — 이동하며 교전하세요', 4.5);
    } else if (payload.wave === 6) {
      this.showOnboardingTip('전술 기믹: 노란 EMP 파일런을 사격하면 주변 적 방어막을 붕괴시킵니다', 4.8);
    } else if (payload.wave === 8) {
      this.showOnboardingTip('이지스 쉴드 중계기가 적 체력을 회복시킵니다 — 최우선 파괴하세요', 4.8);
    } else if (payload.controlZoneActive && !this._onboardingFlags.firstBeacon) {
      this._onboardingFlags.firstBeacon = true;
      this.showOnboardingTip('노란 마커(테라비콘)를 점령하거나 적을 섬멸하세요', 4.5);
    }
  }

  /** @private */
  _onWaveCleared(payload) {
    if (!payload) return;
    if (payload.isFinalWave) {
      this.showAnnouncement(
        'SOLARIS DROP COMPLETE',
        'SKY CITADEL RECLAIMED',
        `+${payload.scoreBonus || 0} CLEAR BONUS`,
        'clear-alert',
        2.6
      );
    } else {
      const wPad = String(payload.wave || 1).padStart(2, '0');
      this.showAnnouncement(
        `WAVE ${wPad} COMPLETE`,
        'SECTOR CLEARED',
        `+${payload.scoreBonus || 0} BONUS // PREPARING NEXT DROP`,
        'clear-alert',
        2.5
      );
    }
  }

  /** @private */
  _onMapTransition(payload) {
    const nextMeta = payload && MAPS[payload.nextMapIndex] ? MAPS[payload.nextMapIndex] : null;
    const subtitle = nextMeta
      ? `ORBITAL REDEPLOYMENT TO ${nextMeta.name}`
      : 'ORBITAL REDEPLOYMENT IN PROGRESS';
    this.showAnnouncement('SOLARIS DROP', 'SECTOR REDEPLOYMENT', subtitle, 'clear-alert', 2.4);
    if (nextMeta) {
      this._pushKillfeed(`REDEPLOYED // ${nextMeta.code}`, 'pickup');
    }
  }

  /** @private */
  _onBossPhase(payload) {
    if (!payload) return;
    this.showAnnouncement(
      `PHASE ${payload.phase} // ${payload.name || 'FURNACE OVERDRIVE'}`,
      payload.bossName || 'COLOSSUS-IV // ASH TITAN',
      payload.callout || 'ESCORTS DEPLOYED — EVADE SLAG BARRAGE',
      'boss-alert',
      3.4
    );
  }

  /** @private */
  _onPickupCollected(payload) {
    if (!payload) return;
    this._healFlashIntensity = Math.max(this._healFlashIntensity, 0.78);
    const label =
      payload.type === 'health'
        ? `+${Math.round(payload.amount || 35)} HULL INTEGRITY`
        : payload.type === 'shield'
        ? `+${Math.round(payload.amount || 40)} SHIELD MATRIX`
        : 'AMMO CRATE RESUPPLIED';
    this._pushKillfeed(label, 'pickup');
  }

  /** @private */
  _onGameState(payload) {
    const state = typeof payload === 'string' ? payload : payload && payload.state;
    if (state === 'playing') {
      this.hideEndScreen();
    }
  }

  /**
   * Display tactical center-top callout banner.
   */
  showOnboardingTip(text, duration = 4.0) {
    if (!this._onboardingTip || !text) return;
    this._onboardingTip.textContent = text;
    this._onboardingTip.classList.add('visible');
    this._onboardingTimer = duration;
  }

  showAnnouncement(kicker, title, subtitle = '', themeClass = '', duration = 1.8) {
    if (!this._banner) return;
    if (this._bannerKicker) this._bannerKicker.textContent = kicker;
    if (this._bannerTitle) this._bannerTitle.textContent = title;
    if (this._bannerSub) this._bannerSub.textContent = subtitle;

    this._banner.classList.remove('boss-alert', 'clear-alert');
    if (themeClass) this._banner.classList.add(themeClass);
    this._banner.classList.add('visible');
    this._bannerVisible = true;
    this._bannerTimer = duration;
  }

  /** @private */
  _pushKillfeed(text, cls = '') {
    for (let i = KILLFEED_SLOTS - 1; i > 0; i--) {
      this._killfeed[i].text = this._killfeed[i - 1].text;
      this._killfeed[i].cls = this._killfeed[i - 1].cls;
      this._killfeed[i].timer = this._killfeed[i - 1].timer;
      this._killfeed[i].visible = this._killfeed[i - 1].visible;
    }
    this._killfeed[0].text = text;
    this._killfeed[0].cls = cls;
    this._killfeed[0].timer = 4.2;
    this._killfeed[0].visible = true;
    this._syncKillfeedDOM();
  }

  /** @private */
  _syncKillfeedDOM() {
    for (let i = 0; i < KILLFEED_SLOTS; i++) {
      const item = this._killfeed[i];
      const el = this._killfeedEls[i];
      if (!el) continue;
      if (item.visible && item.timer > 0) {
        el.textContent = item.text;
        el.className = item.cls ? `killfeed-item visible ${item.cls}` : 'killfeed-item visible';
      } else {
        el.className = 'killfeed-item';
      }
    }
  }

  /** @private */
  _applyWeaponTheme(weapon, slotIndex) {
    if (!weapon) return;
    const accent = weapon.colorCss || '#f59e0b';
    if (typeof document !== 'undefined' && document.documentElement) {
      document.documentElement.style.setProperty('--ad-weapon-accent', accent);
    }
    if (this._weaponName) this._weaponName.textContent = weapon.name;
    if (this._weaponRole) this._weaponRole.textContent = weapon.role;

    const activeIdx = Number.isFinite(slotIndex) ? slotIndex : weapon.slot ? weapon.slot - 1 : 0;
    for (let i = 0; i < this._slotBtns.length; i++) {
      const btn = this._slotBtns[i];
      if (btn) btn.classList.toggle('active', i === activeIdx);
    }
    this._cache.weaponId = weapon.id;
    this._cache.weaponSlot = activeIdx;
  }

  // ---------------------------------------------------------------------------
  // Main Per-Frame HUD Update (Zero DOM Churn, Zero Allocations)
  // ---------------------------------------------------------------------------

  /**
   * @param {number} dt
   * @param {{
   *   player: any,
   *   weapon: any,
   *   crosshairSpread: number,
   *   wave: any,
   *   boss: any,
   *   zone: any,
   *   enemies: Array<any>,
   *   pickups?: Array<any>,
   *   fps: number
   * }} snapshot
   */
  update(dt, snapshot) {
    if (!snapshot) return;
    const clampedDt = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.05) : 0.016;
    const c = this._cache;

    const player = snapshot.player;
    const weapon = snapshot.weapon;
    const wave = snapshot.wave;
    const boss = snapshot.boss;
    const zone = snapshot.zone;

    // 1. Dynamic Crosshair & HV-7 Rail Lance Scope Overlay
    this._updateCrosshair(snapshot.crosshairSpread || 0.018, weapon, player);

    // 2. Hitmarkers (Body / Kill / Headshot Double-X / Shield Diamond)
    this._updateHitmarkers(clampedDt);

    // 3. Screen Vignette, Heal Flash & 360-Deg Directional Damage Arcs
    this._updateScreenFeedback(clampedDt, player);

    // 4. Pooled 3D->2D Floating Damage Numbers
    this._updateFloatingDamage(clampedDt);

    // 5. Vitality (Shield, Hull Integrity), Omni-Dash Pips & Mobility Indicator
    if (player) {
      const hp = Math.ceil(player.health);
      const sh = Math.ceil(player.shield);
      const hpPct = clamp((player.health / Math.max(1, player.maxHealth)) * 100, 0, 100);
      const shPct = clamp((player.shield / Math.max(1, player.maxShield)) * 100, 0, 100);

      if (c.shield !== sh) {
        c.shield = sh;
        if (this._shieldValue) this._shieldValue.textContent = String(sh);
        if (this._shieldBarFill) this._shieldBarFill.style.width = `${shPct.toFixed(1)}%`;
      }

      const hpTier = hp <= 30 ? 'critical' : hp <= 60 ? 'warn' : '';
      if (c.health !== hp || c.healthTier !== hpTier) {
        c.health = hp;
        c.healthTier = hpTier;
        if (this._healthValue) {
          this._healthValue.textContent = String(hp);
          this._healthValue.className = hpTier ? `vital-num ${hpTier}` : 'vital-num';
        }
        if (this._healthBarFill) {
          this._healthBarFill.style.width = `${hpPct.toFixed(1)}%`;
          this._healthBarFill.className = hpTier;
        }
      }

      // 2 Omni-Dash charge pips with live refill bar
      const charges = player.dashCharges | 0;
      const prog = clamp(player.dashCooldownProgress || 0, 0, 1);
      const p0 = charges >= 1 ? 100 : Math.round(prog * 100);
      const p1 = charges >= 2 ? 100 : charges === 1 ? Math.round(prog * 100) : 0;
      const r0 = charges >= 1;
      const r1 = charges >= 2;

      if (c.dash0Pct !== p0) {
        c.dash0Pct = p0;
        if (this._dashPipFills[0]) this._dashPipFills[0].style.width = `${p0}%`;
      }
      if (c.dash1Pct !== p1) {
        c.dash1Pct = p1;
        if (this._dashPipFills[1]) this._dashPipFills[1].style.width = `${p1}%`;
      }
      if (c.dash0Ready !== r0) {
        c.dash0Ready = r0;
        if (this._dashPips[0]) this._dashPips[0].classList.toggle('ready', r0);
      }
      if (c.dash1Ready !== r1) {
        c.dash1Ready = r1;
        if (this._dashPips[1]) this._dashPips[1].classList.toggle('ready', r1);
      }
      const hasDash3 = (player.maxDashCharges || 2) >= 3;
      if (this._dashPips[2]) {
        this._dashPips[2].classList.toggle('hidden', !hasDash3);
        if (hasDash3) {
          const r2 = (player.dashCharges | 0) >= 3;
          const p2 = r2 ? 100 : (player.dashCharges | 0) === 2 ? Math.round((player.dashCooldownProgress || 0) * 100) : 0;
          if (this._dashPipFills[2]) this._dashPipFills[2].style.width = `${p2}%`;
          this._dashPips[2].classList.toggle('ready', r2);
        }
      }

      // Live mobility status badge
      let mob = 'READY';
      let mobBoost = false;
      if (player.isDashing) {
        mob = 'OMNI-DASH';
        mobBoost = true;
      } else if (player.isSliding) {
        mob = 'SLIDE BOOST';
        mobBoost = true;
      } else if (!player.isGrounded) {
        mob = 'AIRBORNE';
      } else if (player.isSprinting) {
        mob = 'SPRINT';
        mobBoost = true;
      } else if (player.isCrouching) {
        mob = 'CROUCH';
      }

      if (c.mobility !== mob || c.mobilityBoost !== mobBoost) {
        c.mobility = mob;
        c.mobilityBoost = mobBoost;
        if (this._mobilityStatus) {
          this._mobilityStatus.textContent = mob;
          this._mobilityStatus.classList.toggle('active-boost', mobBoost);
        }
      }
    }

    // 6. Weapon Info, Ammo & Reload Progress Bar
    if (weapon) {
      if (c.weaponId !== weapon.id || c.weaponSlot !== weapon.index) {
        this._applyWeaponTheme(weapon.weapon || weapon, weapon.index);
      }

      const isHeat = weapon.mech === 'heat';
      const isRegen = weapon.mech === 'regen' || weapon.mech === 'repulsor';
      const displayMag = isHeat ? (weapon.overheated ? '과열' : `${Math.round(weapon.heat || 0)}%`) : String(weapon.ammo);
      const displayRes = isHeat ? (weapon.heat >= 78 ? '고열 +30%' : '열기') : isRegen ? `/ ${weapon.magSize} 자동` : `/ ${weapon.reserve}`;
      const lowAmmo = isHeat ? Boolean(weapon.overheated || weapon.heat >= 85) : weapon.ammo <= Math.ceil(weapon.magSize * 0.25);

      if (c.ammo !== displayMag || c.lowAmmo !== lowAmmo) {
        c.ammo = displayMag;
        c.lowAmmo = lowAmmo;
        if (this._ammoMag) {
          this._ammoMag.textContent = displayMag;
          this._ammoMag.classList.toggle('low-ammo', lowAmmo);
        }
      }

      if (c.reserve !== displayRes) {
        c.reserve = displayRes;
        if (this._ammoReserve) {
          this._ammoReserve.textContent = displayRes;
        }
      }

      const reloading = Boolean(weapon.isReloading);
      if (c.isReloading !== reloading) {
        c.isReloading = reloading;
        if (this._reloadBarWrap) {
          this._reloadBarWrap.classList.toggle('hidden', !reloading);
        }
      }
      if (reloading) {
        const rPct = Math.round(clamp(weapon.reloadProgress || 0, 0, 1) * 100);
        if (c.reloadPct !== rPct) {
          c.reloadPct = rPct;
          if (this._reloadBarFill) this._reloadBarFill.style.width = `${rPct}%`;
        }
      }
    }

    // 7. Wave Objective, Score & Combo Multiplier
    if (wave) {
      if (c.wave !== wave.wave) {
        c.wave = wave.wave;
        if (this._waveBadge) {
          this._waveBadge.textContent = wave.totalWaves === 0 ? `ENDLESS // W${Math.max(1, wave.wave)}` : `WAVE ${Math.max(1, wave.wave)} / ${wave.totalWaves || 10}`;
        }
      }
      if (c.waveName !== wave.waveName) {
        c.waveName = wave.waveName;
        if (this._waveName) this._waveName.textContent = wave.waveName || 'ORBITAL TOUCHDOWN';
      }

      if (wave.inIntermission) {
        const interStr = `NEXT DROP IN ${Math.ceil(wave.intermissionRemaining)}S`;
        if (c.intermissionStr !== interStr) {
          c.intermissionStr = interStr;
          if (this._hostilesCount) this._hostilesCount.textContent = interStr;
          if (this._objectiveText) this._objectiveText.textContent = 'RESUPPLY & REPOSITION';
          c.hostiles = -2;
          c.objective = 'RESUPPLY & REPOSITION';
        }
      } else {
        if (c.hostiles !== wave.enemiesRemaining) {
          c.hostiles = wave.enemiesRemaining;
          c.intermissionStr = '';
          if (this._hostilesCount) {
            this._hostilesCount.textContent = `HOSTILES: ${wave.enemiesRemaining}`;
          }
        }
        if (c.objective !== wave.objective) {
          c.objective = wave.objective;
          if (this._objectiveText) this._objectiveText.textContent = wave.objective || '';
        }
      }

      if (c.score !== wave.score) {
        c.score = wave.score;
        if (this._scoreValue) this._scoreValue.textContent = formatScore(wave.score);
      }

      if (c.combo !== wave.combo) {
        c.combo = wave.combo;
        if (this._comboMult) this._comboMult.textContent = `x${wave.combo}`;
        if (this._comboBadge) this._comboBadge.classList.toggle('hot', wave.combo > 1);
      }

      const comboPct = Math.round(clamp(wave.comboProgress || 0, 0, 1) * 100);
      if (c.comboPct !== comboPct) {
        c.comboPct = comboPct;
        if (this._comboBarFill) this._comboBarFill.style.width = `${comboPct}%`;
      }
    }

    // 8. Terra-Beacon Control Zone Capture Bar
    const zoneActive = Boolean(zone && zone.active);
    if (c.zoneVisible !== zoneActive) {
      c.zoneVisible = zoneActive;
      if (this._zonePanel) this._zonePanel.classList.toggle('hidden', !zoneActive);
    }
    if (zoneActive && zone) {
      const zPct = Math.round(clamp(zone.progress || 0, 0, 1) * 100);
      let zClass = '';
      let zLabel = 'TERRA-BEACON // STANDBY';
      if (zone.captured) {
        zClass = 'capturing';
        zLabel = 'TERRA-BEACON // SECURED';
      } else if (zone.contesting) {
        zClass = 'contested';
        zLabel = 'TERRA-BEACON // CONTESTED!';
      } else if (zone.owner === 'player') {
        zClass = 'capturing';
        zLabel =
          zone.captureSpeedMultiplier > 1.5
            ? 'TERRA-BEACON // FAST UPLINK'
            : 'TERRA-BEACON // UPLINKING';
      } else if (zone.owner === 'enemy') {
        zClass = 'contested';
        zLabel = 'TERRA-BEACON // HOSTILE LOCK';
      }

      if (c.zoneClass !== zClass) {
        c.zoneClass = zClass;
        if (this._zonePanel) this._zonePanel.className = zClass;
      }
      if (c.zoneLabel !== zLabel) {
        c.zoneLabel = zLabel;
        if (this._zoneStatusLabel) this._zoneStatusLabel.textContent = zLabel;
      }
      if (c.zonePct !== zPct) {
        c.zonePct = zPct;
        if (this._zonePct) this._zonePct.textContent = `${zPct}%`;
        if (this._zoneBarFill) this._zoneBarFill.style.width = `${zPct}%`;
      }
    }

    // 9. Boss HP Bar (COLOSSUS-IV // ASH TITAN with 33% / 66% phase marks)
    const bossActive = Boolean(boss && boss.active);
    if (c.bossVisible !== bossActive) {
      c.bossVisible = bossActive;
      if (this._bossPanel) this._bossPanel.classList.toggle('hidden', !bossActive);
    }
    if (bossActive && boss) {
      if (c.bossName !== boss.name) {
        c.bossName = boss.name;
        if (this._bossName) this._bossName.textContent = boss.name;
      }
      const phaseTxt = `PHASE ${boss.phase} // ${boss.phaseName}`;
      if (c.bossPhase !== phaseTxt) {
        c.bossPhase = phaseTxt;
        if (this._bossPhaseBadge) this._bossPhaseBadge.textContent = phaseTxt;
      }
      const hpTxt = `${boss.hp} / ${boss.maxHp}`;
      if (c.bossHpText !== hpTxt) {
        c.bossHpText = hpTxt;
        if (this._bossHpText) this._bossHpText.textContent = hpTxt;
      }
      const hpPct = Math.round(clamp(boss.hpRatio || 0, 0, 1) * 1000) / 10;
      if (c.bossHpPct !== hpPct) {
        c.bossHpPct = hpPct;
        if (this._bossBarFill) this._bossBarFill.style.width = `${hpPct}%`;
      }
      const shActive = Boolean(boss.shieldActive);
      if (c.bossShield !== shActive) {
        c.bossShield = shActive;
        if (this._bossShieldTag) this._bossShieldTag.classList.toggle('hidden', !shActive);
      }
    }

    // 10. Announcement Banner & Killfeed Timers
    if (this._bannerVisible) {
      this._bannerTimer -= clampedDt;
      if (this._bannerTimer <= 0) {
        this._bannerVisible = false;
        if (this._banner) this._banner.classList.remove('visible');
      }
    }

    let killfeedDirty = false;
    for (let i = 0; i < KILLFEED_SLOTS; i++) {
      if (this._killfeed[i].visible) {
        this._killfeed[i].timer -= clampedDt;
        if (this._killfeed[i].timer <= 0) {
          this._killfeed[i].visible = false;
          killfeedDirty = true;
        }
      }
    }
    if (killfeedDirty) {
      this._syncKillfeedDOM();
    }

    // 11. FPS Counter (throttled to ~4Hz)
    c.fpsTimer += clampedDt;
    if (c.fpsTimer >= 0.25) {
      c.fpsTimer = 0;
      const fpsInt = Math.max(1, Math.round(snapshot.fps || 60));
      if (c.fps !== fpsInt) {
        c.fps = fpsInt;
        if (this._fpsCounter) {
          this._fpsCounter.textContent = `${fpsInt} FPS`;
          this._fpsCounter.style.color =
            fpsInt >= 50 ? '#22c55e' : fpsInt >= 32 ? '#f59e0b' : '#ef4444';
        }
      }
    }

    // 11.2. Step 2: Gold Pill, Locked/Overclock Weapon Slots & Synergy/Zone Buff Chips
    if (this._hudGoldPill && snapshot.gold !== undefined) {
      const gText = `${snapshot.gold} G`;
      if (this._lastGoldText !== gText) {
        this._lastGoldText = gText;
        this._hudGoldPill.textContent = gText;
      }
    }
    if (snapshot.loadout) {
      const lo = snapshot.loadout;
      if (this._slotBtns[0]) {
        this._slotBtns[0].classList.toggle('active', lo.activeSlot === 0);
        this._slotBtns[0].classList.toggle('overclocked', lo.primaryOverclock > 0);
      }
      if (this._slotBtns[1]) {
        this._slotBtns[1].classList.toggle('active', lo.activeSlot === 1);
        this._slotBtns[1].classList.toggle('overclocked', lo.secondaryOverclock > 0);
      }
      if (this._slotCodeEls[0] && lo.primaryWeapon) {
        this._slotCodeEls[0].textContent = lo.primaryWeapon.shortName;
      }
      if (this._slotCodeEls[1] && lo.secondaryWeapon) {
        this._slotCodeEls[1].textContent = lo.secondaryWeapon.shortName;
      }
    }
    if (this._pickupPrompt) {
      const near = snapshot.nearbyWeapon;
      if (near && near.weapon) {
        const isSec = near.weapon.category === 'secondary';
        const isSame = near.isSame;
        this._pickupPrompt.classList.remove('hidden');
        this._pickupPrompt.classList.toggle('secondary-drop', isSec);
        this._pickupPrompt.textContent = isSame
          ? `[F] ${near.weapon.name} 오버클럭 (+15%)`
          : `[F] ${near.weapon.name} 장착 (${near.currentName} 바닥에 드랍)`;
      } else {
        this._pickupPrompt.classList.add('hidden');
      }
    }
    if (this._hudBuffRow) {
      const chips = [];
      if (player && player.inZoneBuff) chips.push('<span class="hud-buff-chip zone">거점 버프 +15%</span>');
      if (snapshot.activeSynergies) {
        for (let i = 0; i < snapshot.activeSynergies.length; i++) {
          const syn = snapshot.activeSynergies[i];
          const cls = syn.id === 'vanguard' ? 'vanguard' : syn.id === 'mobility' ? 'zone' : '';
          chips.push(`<span class="hud-buff-chip ${cls}">★ ${syn.name}</span>`);
        }
      }
      const key = chips.join('|');
      if (this._lastBuffKey !== key) {
        this._lastBuffKey = key;
        this._hudBuffRow.innerHTML = chips.join('');
      }
    }

    // 11.5. Step 1: 3D Beacon Waypoint, Sniper Lock Warning & Micro-Onboarding Tip
    this._updateWaypointsAndOnboarding(clampedDt, player, snapshot.enemies, zone);

    // 12. Real-Time 2D Canvas Tactical Minimap (~20Hz)
    this._radarTime += clampedDt;
    this._minimapAccum += clampedDt;
    if (this._minimapAccum >= MINIMAP_INTERVAL) {
      this._minimapAccum = 0;
      this._renderMinimap(player, snapshot.enemies, snapshot.pickups, zone);
    }
  }

  /** @private */
  _updateCrosshair(spread, weapon, player) {
    const c = this._cache;
    const isAds = Boolean((weapon && weapon.isAds) || (player && player.isAds));
    const isRailgunAds = Boolean(
      isAds && weapon && weapon.id === 'railgun' && (weapon.adsProgress || 0) > 0.45
    );

    if (c.railScope !== isRailgunAds) {
      c.railScope = isRailgunAds;
      if (this._railgunScope) {
        this._railgunScope.classList.toggle('active', isRailgunAds);
      }
    }

    const mode = isRailgunAds ? 'ads-railgun' : isAds ? 'ads-compact' : '';
    if (c.crosshairMode !== mode) {
      c.crosshairMode = mode;
      if (this._crosshair) {
        this._crosshair.className = mode;
      }
    }

    const gap = Math.round(clamp(5 + spread * 460, 4, 48));
    if (c.spreadPx !== gap) {
      c.spreadPx = gap;
      if (this._xhairTop) this._xhairTop.style.transform = `translate3d(0, ${-gap - 5}px, 0)`;
      if (this._xhairBottom) this._xhairBottom.style.transform = `translate3d(0, ${gap + 5}px, 0)`;
      if (this._xhairLeft) this._xhairLeft.style.transform = `translate3d(${-gap - 5}px, 0, 0)`;
      if (this._xhairRight) this._xhairRight.style.transform = `translate3d(${gap + 5}px, 0, 0)`;
    }
  }

  /** @private */
  _updateHitmarkers(dt) {
    if (this._hitTimer > 0) {
      this._hitTimer = Math.max(0, this._hitTimer - dt);
      const t = this._hitTimer / Math.max(0.01, this._hitMaxTimer);
      if (this._hitmarker) {
        this._hitmarker.classList.toggle('kill-confirm', this._hitIsKill);
        this._hitmarker.style.opacity = t > 0 ? t.toFixed(2) : '0';
        const s = 0.85 + t * (this._hitIsKill ? 0.36 : 0.22);
        this._hitmarker.style.transform = `translate(-50%, -50%) scale(${s.toFixed(2)})`;
      }
    }

    if (this._headshotTimer > 0) {
      this._headshotTimer = Math.max(0, this._headshotTimer - dt);
      const t = this._headshotTimer / 0.22;
      if (this._hitmarkerHeadshot) {
        this._hitmarkerHeadshot.style.opacity = t > 0 ? t.toFixed(2) : '0';
        const s = 0.9 + t * 0.32;
        this._hitmarkerHeadshot.style.transform = `translate(-50%, -50%) scale(${s.toFixed(2)})`;
      }
    }

    if (this._shieldHitTimer > 0) {
      this._shieldHitTimer = Math.max(0, this._shieldHitTimer - dt);
      const t = this._shieldHitTimer / 0.18;
      if (this._hitmarkerShield) {
        this._hitmarkerShield.style.opacity = t > 0 ? t.toFixed(2) : '0';
        const s = 0.82 + (1 - t) * 0.38;
        this._hitmarkerShield.style.transform = `translate(-50%, -50%) rotate(45deg) scale(${s.toFixed(2)})`;
      }
    }
  }

  /** @private */
  _updateScreenFeedback(dt, player) {
    const c = this._cache;

    const lowHp = Boolean(player && player.isAlive && player.health <= 30);
    const minLowHp = lowHp ? 0.34 : 0;

    if (this._vignetteIntensity > minLowHp) {
      this._vignetteIntensity = Math.max(minLowHp, this._vignetteIntensity - dt * 1.9);
    } else if (lowHp && this._vignetteIntensity < minLowHp) {
      this._vignetteIntensity = minLowHp;
      this._vignetteShieldOnly = false;
    }

    if (this._damageVignette) {
      const vOp = this._vignetteIntensity.toFixed(3);
      const vShield = this._vignetteShieldOnly && !lowHp;
      if (c.vignetteOp !== vOp) {
        c.vignetteOp = vOp;
        this._damageVignette.style.opacity = vOp;
      }
      if (c.vignetteShield !== vShield) {
        c.vignetteShield = vShield;
        this._damageVignette.classList.toggle('shield-hit', vShield);
      }
      if (c.vignetteLowHp !== lowHp) {
        c.vignetteLowHp = lowHp;
        this._damageVignette.classList.toggle('low-health', lowHp);
      }
    }

    if (this._healFlashIntensity > 0) {
      this._healFlashIntensity = Math.max(0, this._healFlashIntensity - dt * 2.4);
    }
    if (this._healFlash) {
      const hOp = this._healFlashIntensity.toFixed(3);
      if (c.healOp !== hOp) {
        c.healOp = hOp;
        this._healFlash.style.opacity = hOp;
      }
    }

    const px = player ? player.position.x : 0;
    const pz = player ? player.position.z : 0;
    const yaw = player ? player.yaw : 0;
    const sinY = Math.sin(yaw);
    const cosY = Math.cos(yaw);

    let edgeTop = 0;
    let edgeRight = 0;
    let edgeBottom = 0;
    let edgeLeft = 0;

    for (let i = 0; i < DAMAGE_ARC_SLOTS; i++) {
      const arc = this._damageArcs[i];
      if (!arc.active || !arc.el) continue;

      arc.age += dt;
      if (arc.age >= arc.duration) {
        arc.active = false;
        arc.el.style.opacity = '0';
        continue;
      }

      const dx = arc.sourceX - px;
      const dz = arc.sourceZ - pz;
      const fwdDot = dx * -sinY + dz * -cosY;
      const rightDot = dx * cosY + dz * -sinY;
      const angleDeg = Math.atan2(rightDot, fwdDot) * (180 / Math.PI);
      const alpha = 1 - arc.age / arc.duration;
      const aSq = alpha * alpha;

      arc.el.style.opacity = aSq.toFixed(2);
      arc.el.style.transform = `rotate(${angleDeg.toFixed(1)}deg)`;

      // Directional screen-edge red blur weights (tracks live camera rotation)
      const invLen = 1 / Math.max(0.001, Math.hypot(fwdDot, rightDot));
      const nf = fwdDot * invLen;
      const nr = rightDot * invLen;
      const edgeStr = Math.min(0.95, aSq * 1.15);
      if (nf > 0.08) edgeTop = Math.max(edgeTop, nf * edgeStr);
      if (nf < -0.08) edgeBottom = Math.max(edgeBottom, -nf * edgeStr);
      if (nr > 0.08) edgeRight = Math.max(edgeRight, nr * edgeStr);
      if (nr < -0.08) edgeLeft = Math.max(edgeLeft, -nr * edgeStr);
    }

    const applyEdge = (el, val) => {
      if (!el) return;
      if (val <= 0.01) {
        if (el.style.visibility !== 'hidden') {
          el.style.opacity = '0';
          el.style.visibility = 'hidden';
        }
      } else {
        if (el.style.visibility !== 'visible') el.style.visibility = 'visible';
        el.style.opacity = val.toFixed(2);
      }
    };
    applyEdge(this._dmgEdgeTop, edgeTop);
    applyEdge(this._dmgEdgeRight, edgeRight);
    applyEdge(this._dmgEdgeBottom, edgeBottom);
    applyEdge(this._dmgEdgeLeft, edgeLeft);
  }

  /** @private */
  _updateFloatingDamage(dt) {
    if (!this.camera) return;
    const w = window.innerWidth || 1280;
    const h = window.innerHeight || 720;
    const halfW = w * 0.5;
    const halfH = h * 0.5;

    for (let i = 0; i < MAX_FLOATING_NUMBERS; i++) {
      const f = this._floatPool[i];
      if (!f.active) continue;

      f.age += dt;
      if (f.age >= f.duration) {
        f.active = false;
        f.el.style.display = 'none';
        f.el.style.opacity = '0';
        continue;
      }

      f.worldPos.y += f.riseSpeed * dt;
      this._projVec.copy(f.worldPos).project(this.camera);

      if (this._projVec.z > 1 || this._projVec.z < -1) {
        f.el.style.opacity = '0';
        continue;
      }

      const t = f.age / f.duration;
      const sx = this._projVec.x * halfW + halfW + f.driftX * t;
      const sy = -this._projVec.y * halfH + halfH - 18 * t;
      const alpha = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;
      const scale = t < 0.12 ? 0.78 + (t / 0.12) * 0.35 : 1.0;

      f.el.style.opacity = clamp(alpha, 0, 1).toFixed(2);
      f.el.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) translate(-50%, -50%) scale(${scale.toFixed(2)})`;
    }
  }

  /** @private */
  _updateWaypointsAndOnboarding(dt, player, enemies, zone) {
    // 1. Onboarding 1-line tip timer
    if (this._onboardingTimer > 0) {
      this._onboardingTimer = Math.max(0, this._onboardingTimer - dt);
      if (this._onboardingTimer <= 0 && this._onboardingTip) {
        this._onboardingTip.classList.remove('visible');
      }
    }

    // 2. Sniper Lock Warning & Heavy Enforcer tip detection
    let sniperLock = false;
    if (Array.isArray(enemies)) {
      for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        if (!e || !e.isAlive) continue;
        if (e.isSniperLocking) {
          sniperLock = true;
        }
        if (
          !this._onboardingFlags.firstHeavy &&
          e.archetype &&
          (e.archetype.id === 'heavy_enforcer' || e.archetype.id === 'rail_warden')
        ) {
          this._onboardingFlags.firstHeavy = true;
          this.showOnboardingTip('HV-7 레일 랜스와 T-4 아크 리벳건은 중장갑 방패를 관통합니다', 4.5);
        }
        if (
          !this._onboardingFlags.firstMortar &&
          e.archetype &&
          e.archetype.id === 'mortar_artillery'
        ) {
          this._onboardingFlags.firstMortar = true;
          this.showOnboardingTip('포격수(SIEGE MORTAR)의 주황 조준 레이저가 고정되기 전에 대시로 회피하세요', 4.5);
        }
        if (
          !this._onboardingFlags.firstOverlord &&
          e.archetype &&
          e.archetype.id === 'aegis_overlord_boss'
        ) {
          this._onboardingFlags.firstOverlord = true;
          this.showOnboardingTip('AEGIS-IX 위상 방어막 가동 시 EMP 파일런·중계기를 파괴해 즉시 해제하세요', 5.0);
        }
      }
    }
    if (this._sniperWarning) {
      this._sniperWarning.classList.toggle('hidden', !sniperLock);
    }
    if (sniperLock && this.eventBus) {
      this.eventBus.emit('SFX_SNIPER_LOCK', {});
    }

    // 3. 3D->2D Projected Terra-Beacon Waypoint (clamped to viewport edge when off-screen)
    if (!this._beaconWaypoint || !this.camera) return;
    const zoneActive = Boolean(zone && zone.active && !zone.captured);
    if (!zoneActive || !this._arenaData || !this._arenaData.controlZoneCenter) {
      this._beaconWaypoint.classList.add('hidden');
      return;
    }

    this._beaconWaypoint.classList.remove('hidden');
    const zc = this._arenaData.controlZoneCenter;
    this._waypointVec.set(zc.x, (zc.y || 0) + 2.4, zc.z);

    let dist = 0;
    if (player && player.position) {
      dist = Math.round(
        Math.hypot(zc.x - player.position.x, zc.z - player.position.z)
      );
    }
    if (this._beaconDist) {
      this._beaconDist.textContent =
        zone.contesting ? `경합 중 ${dist}M` : zone.owner === 'player' ? `점령 중 ${dist}M` : `테라비콘 ${dist}M`;
    }
    this._beaconWaypoint.classList.toggle('capturing', zone.owner === 'player' && !zone.contesting);
    this._beaconWaypoint.classList.toggle('contested', Boolean(zone.contesting || zone.owner === 'enemy'));

    this._waypointVec.project(this.camera);
    const w = window.innerWidth || 1280;
    const h = window.innerHeight || 720;
    const behind = this._waypointVec.z > 1;
    let sx = (behind ? -this._waypointVec.x : this._waypointVec.x) * (w * 0.5) + w * 0.5;
    let sy = -(behind ? -this._waypointVec.y : this._waypointVec.y) * (h * 0.5) + h * 0.5;

    const padX = 56;
    const padY = 96;
    if (behind) {
      sy = h - padY;
    }
    sx = clamp(sx, padX, w - padX);
    sy = clamp(sy, padY, h - padY);
    this._beaconWaypoint.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) translate(-50%, -50%)`;
  }

  /** @private */
  _renderMinimap(player, enemies, pickups, zone) {
    const ctx = this._minimapCtx;
    if (!ctx) return;

    // 1. Blit cached static arena walls/platforms
    if (this._staticMapCanvas) {
      ctx.drawImage(this._staticMapCanvas, 0, 0);
    } else {
      ctx.fillStyle = '#f1f7fd';
      ctx.fillRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);
    }

    const pad = 6;
    const spanX = Math.max(1, this._bounds.maxX - this._bounds.minX);
    const spanZ = Math.max(1, this._bounds.maxZ - this._bounds.minZ);
    const drawSpan = MINIMAP_SIZE - pad * 2;
    const toMapX = (wx) => pad + ((wx - this._bounds.minX) / spanX) * drawSpan;
    const toMapY = (wz) => pad + ((wz - this._bounds.minZ) / spanZ) * drawSpan;

    // 2. Terra-Beacon Control Zone Ring
    if (this._arenaData && this._arenaData.controlZoneCenter) {
      const zc = this._arenaData.controlZoneCenter;
      const zx = toMapX(zc.x);
      const zy = toMapY(zc.z);
      const zr = ((this._arenaData.controlZoneRadius || 7.5) / spanX) * drawSpan;

      const isActive = Boolean(zone && zone.active);
      let stroke = 'rgba(245, 158, 11, 0.38)';
      let fill = 'rgba(245, 158, 11, 0.08)';
      if (isActive) {
        if (zone.contesting || zone.owner === 'enemy') {
          const pulse = 0.5 + 0.5 * Math.sin(this._radarTime * 12);
          stroke = `rgba(239, 68, 68, ${(0.55 + pulse * 0.45).toFixed(2)})`;
          fill = 'rgba(239, 68, 68, 0.20)';
        } else if (zone.owner === 'player' || zone.captured) {
          stroke = 'rgba(34, 197, 94, 0.92)';
          fill = 'rgba(34, 197, 94, 0.18)';
        } else {
          stroke = 'rgba(245, 158, 11, 0.86)';
          fill = 'rgba(245, 158, 11, 0.14)';
        }
      }

      ctx.beginPath();
      ctx.arc(zx, zy, zr, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = stroke;
      ctx.lineWidth = isActive ? 1.8 : 1.0;
      ctx.stroke();
    }

    // 3. Active Orbital Supply Pickup Dots
    const pickupList =
      Array.isArray(pickups) && pickups.length > 0
        ? pickups
        : this._arenaData && Array.isArray(this._arenaData.pickupSpawns)
        ? this._arenaData.pickupSpawns
        : null;

    if (pickupList) {
      for (let i = 0; i < pickupList.length; i++) {
        const p = pickupList[i];
        if (!p || p.active === false) continue;
        const pos = p.position || p.pos;
        if (!pos) continue;
        ctx.fillStyle =
          p.type === 'health' ? '#22c55e' : p.type === 'shield' ? '#38bdf8' : '#f59e0b';
        ctx.beginPath();
        ctx.arc(toMapX(pos.x), toMapY(pos.z), 2.1, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 4. Scrap-Machine Enemy Blips (pulsing crimson/amber diamond for Ash Titan)
    if (Array.isArray(enemies)) {
      for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        if (!e || e.isAlive === false) continue;
        const ex = toMapX(e.position.x);
        const ey = toMapY(e.position.z);
        const isBoss = Boolean(e.archetype && e.archetype.isBoss);

        if (isBoss) {
          const pulse = 5.4 + Math.sin(this._radarTime * 8) * 1.4;
          ctx.save();
          ctx.translate(ex, ey);
          ctx.rotate(Math.PI * 0.25);
          ctx.fillStyle = '#ef4444';
          ctx.fillRect(-pulse * 0.5, -pulse * 0.5, pulse, pulse);
          ctx.strokeStyle = '#fbbf24';
          ctx.lineWidth = 1.2;
          ctx.strokeRect(-pulse * 0.5, -pulse * 0.5, pulse, pulse);
          ctx.restore();
        } else {
          const aid = e.archetype ? e.archetype.id : '';
          ctx.fillStyle =
            aid === 'sniper_stalker' || aid === 'mortar_artillery'
              ? '#fb923c'
              : aid === 'vanguard_assassin'
              ? '#f43f5e'
              : '#ef4444';
          ctx.beginPath();
          ctx.arc(ex, ey, 3.0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // 5. Player Directional Chevron & Translucent Amber FOV Cone
    if (player && player.position) {
      const px = toMapX(player.position.x);
      const py = toMapY(player.position.z);
      const dirX = -Math.sin(player.yaw || 0);
      const dirY = -Math.cos(player.yaw || 0);
      const angle = Math.atan2(dirY, dirX);

      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(angle);

      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, 24, -0.68, 0.68);
      ctx.closePath();
      ctx.fillStyle = 'rgba(2, 132, 199, 0.22)';
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(6.4, 0);
      ctx.lineTo(-4.2, -3.9);
      ctx.lineTo(-2.0, 0);
      ctx.lineTo(-4.2, 3.9);
      ctx.closePath();
      ctx.fillStyle = '#0284c7';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.3;
      ctx.stroke();

      ctx.restore();
    }
  }

  // ---------------------------------------------------------------------------
  // Independent Result / Debrief Scene (#scene-result)
  // ---------------------------------------------------------------------------

  /**
   * Populate and show the independent #scene-result debrief with computed Rank badge.
   * @param {boolean} isVictory
   * @param {{
   *   score: number,
   *   kills: number,
   *   headshots: number,
   *   shotsFired: number,
   *   shotsHit: number,
   *   maxCombo: number,
   *   wave: number,
   *   totalWaves: number,
   *   elapsedSec: number
   * }} stats
   */
  showEndScreen(isVictory, stats) {
    if (!this._sceneResult) return;
    const s = stats || {};
    const score = Math.round(s.score || 0);
    const kills = s.kills || 0;
    const headshots = s.headshots || 0;
    const shotsFired = Math.max(0, s.shotsFired || 0);
    const shotsHit = Math.min(shotsFired, Math.max(0, s.shotsHit || 0));
    const accuracy = shotsFired > 0 ? Math.round((shotsHit / shotsFired) * 100) : 0;
    const hsRatio = kills > 0 ? headshots / kills : 0;

    let rank = 'C';
    let rankClass = 'rank-c';
    if (isVictory) {
      if (score >= 22000 && accuracy >= 38 && hsRatio >= 0.28) {
        rank = 'S+';
        rankClass = '';
      } else if (score >= 16500 || (accuracy >= 32 && hsRatio >= 0.2)) {
        rank = 'S';
        rankClass = 'rank-s';
      } else if (score >= 12000) {
        rank = 'A';
        rankClass = 'rank-a';
      } else {
        rank = 'B';
        rankClass = 'rank-b';
      }
    } else {
      if (score >= 14000) {
        rank = 'A';
        rankClass = 'rank-a';
      } else if (score >= 7000) {
        rank = 'B';
        rankClass = 'rank-b';
      } else {
        rank = 'C';
        rankClass = 'rank-c';
      }
    }

    if (this._endBadge) {
      this._endBadge.textContent = isVictory
        ? '궤도 수복 작전 완수'
        : 'VANGUARD-09 신호 두절';
      this._endBadge.classList.toggle('defeat', !isVictory);
    }
    if (this._endTitle) {
      this._endTitle.textContent = isVictory ? '지구 수복 완료' : '작전 실패';
    }
    if (this._endSubtitle) {
      this._endSubtitle.textContent = isVictory
        ? (s.wave || 0) >= 10
          ? 'AEGIS-IX 격파 완료 — 이지스 궤도 성채 완전 탈환'
          : 'COLOSSUS-IV 격파 완료 — 지상 구역 안전 확보'
        : `WAVE ${s.wave || 1}에서 기체 파괴 — 재투입 준비 완료`;
    }
    if (this._endRank) {
      this._endRank.textContent = rank;
      this._endRank.className = rankClass;
    }

    if (this._statScore) this._statScore.textContent = formatScore(score);
    if (this._statKills) this._statKills.textContent = String(kills);
    if (this._statHeadshots) this._statHeadshots.textContent = String(headshots);
    if (this._statAccuracy) this._statAccuracy.textContent = `${accuracy}%`;
    if (this._statCombo) this._statCombo.textContent = `x${Math.max(1, s.maxCombo || 1)}`;
    if (this._statWave) this._statWave.textContent = `${s.wave || 1} / ${s.totalWaves || 10}`;
    if (this._statTime) this._statTime.textContent = formatTime(s.elapsedSec || 0);

    this._sceneResult.classList.toggle('victory', Boolean(isVictory));
    this._sceneResult.classList.toggle('defeat', !isVictory);
    this._sceneResult.classList.remove('hidden');
  }

  /** Hide independent #scene-result debrief cleanly. */
  hideEndScreen() {
    if (this._sceneResult) {
      this._sceneResult.classList.add('hidden');
      this._sceneResult.classList.remove('victory', 'defeat');
    }
  }

  // ---------------------------------------------------------------------------
  // Combat Overlay Cleanup, Reset & Clean Disposal
  // ---------------------------------------------------------------------------

  /**
   * Immediately clear transient screen-space combat overlays (vignette, heal flash,
   * HV-7 rail scope, directional hit arcs, hitmarkers, banners & floating damage pool).
   */
  clearCombatOverlays() {
    this._hitTimer = 0;
    this._headshotTimer = 0;
    this._shieldHitTimer = 0;
    this._vignetteIntensity = 0;
    this._vignetteShieldOnly = false;
    this._healFlashIntensity = 0;
    this._bannerTimer = 0;
    this._bannerVisible = false;

    if (this._hitmarker) {
      this._hitmarker.style.opacity = '0';
      this._hitmarker.classList.remove('kill-confirm');
    }
    if (this._hitmarkerHeadshot) this._hitmarkerHeadshot.style.opacity = '0';
    if (this._hitmarkerShield) this._hitmarkerShield.style.opacity = '0';
    if (this._damageVignette) {
      this._damageVignette.style.opacity = '0';
      this._damageVignette.classList.remove('low-health', 'shield-hit');
    }
    if (this._healFlash) this._healFlash.style.opacity = '0';
    if (this._banner) this._banner.classList.remove('visible', 'boss-alert', 'clear-alert');
    if (this._railgunScope) this._railgunScope.classList.remove('active');
    if (this._beaconWaypoint) this._beaconWaypoint.classList.add('hidden');
    if (this._sniperWarning) this._sniperWarning.classList.add('hidden');
    if (this._onboardingTip) this._onboardingTip.classList.remove('visible');
    if (this._pickupPrompt) this._pickupPrompt.classList.add('hidden');
    this._onboardingTimer = 0;

    for (let i = 0; i < DAMAGE_ARC_SLOTS; i++) {
      this._damageArcs[i].active = false;
      this._damageArcs[i].age = 0;
      if (this._damageArcs[i].el) this._damageArcs[i].el.style.opacity = '0';
    }
    if (this._dmgEdgeTop) this._dmgEdgeTop.style.opacity = '0';
    if (this._dmgEdgeRight) this._dmgEdgeRight.style.opacity = '0';
    if (this._dmgEdgeBottom) this._dmgEdgeBottom.style.opacity = '0';
    if (this._dmgEdgeLeft) this._dmgEdgeLeft.style.opacity = '0';

    for (let i = 0; i < MAX_FLOATING_NUMBERS; i++) {
      this._floatPool[i].active = false;
      this._floatPool[i].age = 0;
      this._floatPool[i].el.style.display = 'none';
      this._floatPool[i].el.style.opacity = '0';
    }

    const c = this._cache;
    c.railScope = false;
    c.vignetteOp = '0.000';
    c.vignetteShield = false;
    c.vignetteLowHp = false;
    c.healOp = '0.000';
  }

  reset() {
    this.clearCombatOverlays();
    this._zoneCapturedNotified = false;
    this._minimapAccum = MINIMAP_INTERVAL;
    this._onboardingFlags.firstKill = false;
    this._onboardingFlags.firstBeacon = false;
    this._onboardingFlags.firstHeavy = false;
    this._onboardingFlags.firstMortar = false;
    this._onboardingFlags.firstOverlord = false;

    if (this._zonePanel) this._zonePanel.className = 'hidden';
    if (this._crosshair) this._crosshair.className = '';
    if (this._bossPanel) this._bossPanel.classList.add('hidden');
    this.hideEndScreen();

    for (let i = 0; i < KILLFEED_SLOTS; i++) {
      this._killfeed[i].visible = false;
      this._killfeed[i].timer = 0;
    }
    this._syncKillfeedDOM();

    const c = this._cache;
    c.health = -1;
    c.shield = -1;
    c.dash0Pct = -1;
    c.dash1Pct = -1;
    c.dash0Ready = null;
    c.dash1Ready = null;
    c.mobility = '';
    c.weaponId = '';
    c.weaponSlot = -1;
    c.ammo = -1;
    c.reserve = -1;
    c.isReloading = null;
    c.reloadPct = -1;
    c.spreadPx = -1;
    c.crosshairMode = '';
    c.railScope = false;
    c.wave = -1;
    c.waveName = '';
    c.objective = '';
    c.hostiles = -1;
    c.intermissionStr = '';
    c.zoneVisible = null;
    c.zoneClass = '';
    c.zoneLabel = '';
    c.zonePct = -1;
    c.bossVisible = null;
    c.bossHpText = '';
    c.bossHpPct = -1;
    c.bossShield = null;
    c.score = -1;
    c.combo = -1;
    c.comboPct = -1;
    c.vignetteOp = '0.000';
    c.vignetteShield = false;
    c.vignetteLowHp = false;
    c.healOp = '0.000';

    if (WEAPONS[0]) {
      this._applyWeaponTheme(WEAPONS[0], 0);
    }
  }

  dispose() {
    for (let i = 0; i < this._unsubs.length; i++) {
      this._unsubs[i]();
    }
    this._unsubs.length = 0;

    for (let i = 0; i < this._slotListeners.length; i++) {
      const { btn, handler } = this._slotListeners[i];
      btn.removeEventListener('pointerdown', handler);
    }
    this._slotListeners.length = 0;

    for (let i = 0; i < this._floatPool.length; i++) {
      const el = this._floatPool[i].el;
      if (el && el.parentNode) el.parentNode.removeChild(el);
    }
    this._floatPool.length = 0;
    this._staticMapCanvas = null;
  }
}
  __exports.HudManager = HudManager;
});
