// Module: src/weapons/WeaponSystem.js
__define("src/weapons/WeaponSystem.js", (__exports, __require) => {
const { EVENTS, PLAYER_CONFIG } = __require("src/config/constants.js");
const { WEAPONS } = __require("src/config/weapons.js");
const { WeaponModelFactory } = __require("src/weapons/WeaponModelFactory.js");

const DEG2RAD = Math.PI / 180;
const TWO_PI = Math.PI * 2;
const VIEWMODEL_FOV_DEG = 65;
const TAN_HALF_VM_FOV = Math.tan((VIEWMODEL_FOV_DEG * 0.5) * DEG2RAD);

const MAX_RESOLVED_HITS = 32;
const MAX_SHOT_ACCUM = 16;

function wrapAngle(a) {
  let r = a;
  while (r > Math.PI) r -= TWO_PI;
  while (r < -Math.PI) r += TWO_PI;
  return r;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * AAA First-Person Weapon System, Spring-Damped 1P Animation State Machine,
 * Analytical Ray-vs-Sphere + Wall-Occluded Ballistics & Cyber-Blade Melee for NEON PROTOCOL.
 * Strictly zero heap allocations inside update(dt, targets).
 */
class WeaponSystem {
  /**
   * @param {THREE.Scene} viewmodelScene
   * @param {THREE.Scene} worldScene
   * @param {THREE.PerspectiveCamera} camera
   * @param {import('../player/PlayerController.js').PlayerController} playerController
   * @param {import('../core/InputManager.js').InputManager} input
   * @param {import('../physics/CollisionWorld.js').CollisionWorld} collisionWorld
   * @param {import('../vfx/VfxManager.js').VfxManager} vfxManager
   * @param {import('../core/EventBus.js').EventBus} eventBus
   */
  constructor(
    viewmodelScene,
    worldScene,
    camera,
    playerController,
    input,
    collisionWorld,
    vfxManager,
    eventBus
  ) {
    this.viewmodelScene = viewmodelScene;
    this.worldScene = worldScene;
    this.camera = camera;
    this.playerController = playerController;
    this.input = input;
    this.collisionWorld = collisionWorld;
    this.vfxManager = vfxManager;
    this.eventBus = eventBus;

    this._factory = new WeaponModelFactory();
    this._rigContainer = new THREE.Group();
    this._rigContainer.name = 'weaponRigContainer';
    this.viewmodelScene.add(this._rigContainer);

    // Build all 4 sculpted 1P weapon rigs and per-slot ammo states
    /** @type {Array<ReturnType<WeaponModelFactory['createWeaponRig']>>} */
    this._rigs = [];
    this._ammoStates = [];
    for (let i = 0; i < WEAPONS.length; i++) {
      const w = WEAPONS[i];
      const rig = this._factory.createWeaponRig(w);
      rig.overclockRig = this._buildOverclockAttachments(rig, w);
      rig.root.visible = i === 0;
      this._rigContainer.add(rig.root);
      this._rigs.push(rig);
      this._ammoStates.push({
        ammo: w.mech === 'heat' ? 0 : w.magSize,
        reserve: w.maxReserve,
        heat: 0,
        overheated: false,
        regenTimer: 0,
      });
    }

    // Build 3D Holographic Front Energy Guard Shield [E]
    this._guardShieldGroup = this._buildGuardShieldMesh();
    this._rigContainer.add(this._guardShieldGroup);

    // Build quick cyber-mantis melee blade rig
    this._meleeRig = this._factory.createMeleeBladeRig();
    this._meleeRig.root.visible = false;
    this.viewmodelScene.add(this._meleeRig.root);

    // 2-Slot Loadout: 1 Primary (default 0: M41-A) + 1 Secondary (default 4: W-01 Weld Pistol)
    this.equippedPrimaryIndex = 0;
    this.equippedSecondaryIndex = 4;
    this.activeLoadoutSlot = 0; // 0 = primary, 1 = secondary
    this.currentIndex = 0;
    this._pendingIndex = -1;
    this.weaponOverclock = new Array(WEAPONS.length).fill(0);

    // Listen for slide/dash auto-reload card
    if (this.eventBus) {
      this._unsubSlideReload = this.eventBus.on(EVENTS.PLAYER_SLIDE, () => this._trySlideReload());
      this._unsubDashReload = this.eventBus.on(EVENTS.PLAYER_DASH, () => this._trySlideReload());
    }

    this._fireCooldown = 0;
    this._wasFireDown = false;
    this._semiFireBuffer = 0;
    this._spreadBloom = 0;

    // ADS state
    this._adsProgress = 0;

    // Reload state
    this._isReloading = false;
    this._reloadTimer = 0;
    this._reloadSlapTriggered = false;

    // Swap state
    this._isSwapping = false;
    this._swapTimer = 0;
    this._swapDuration = 0.32;
    this._swapSwitched = false;

    // Quick Melee state
    this._isMeleeing = false;
    this._meleeTimer = 0;
    this._meleeDuration = 0.36;
    this._meleeCooldown = 0;
    this._meleeHitProcessed = false;

    // Procedural 1P animation springs & blends
    this._idleTime = 0;
    this._prevYaw = playerController ? playerController.yaw : 0;
    this._prevPitch = playerController ? playerController.pitch : 0;
    this._wasGrounded = true;

    this._swayX = 0;
    this._swayY = 0;
    this._swayRoll = 0;

    this._sprintBlend = 0;
    this._slideBlend = 0;
    this._airInertiaY = 0;
    this._landBounce = 0;
    this._landBounceVel = 0;

    this._recoilZ = 0;
    this._recoilZVel = 0;
    this._recoilPitch = 0;
    this._recoilPitchVel = 0;
    this._recoilRoll = 0;
    this._recoilRollVel = 0;

    // Mechanical bolt, shotgun pump, and emissive charge states
    this._boltState = 0;
    this._pumpDelay = 0;
    this._pumpTimer = 0;
    this._pumpActive = false;
    this._emissiveFlare = 0;
    this._railRecharge = 1.0;

    // Pre-allocated scratch vectors, hit pools & event payloads (ZERO GC!)
    this._eyePos = new THREE.Vector3();
    this._lookDir = new THREE.Vector3();
    this._camRight = new THREE.Vector3();
    this._camUp = new THREE.Vector3();
    this._camForward = new THREE.Vector3();
    this._rayDir = new THREE.Vector3();
    this._vmMuzzlePos = new THREE.Vector3();
    this._vmEjectPos = new THREE.Vector3();
    this._worldMuzzlePos = new THREE.Vector3();
    this._worldEjectPos = new THREE.Vector3();
    this._tracerEnd = new THREE.Vector3();
    this._hitPoint = new THREE.Vector3();
    this._hitNormal = new THREE.Vector3();
    this._kbDir = new THREE.Vector3();
    this._toTarget = new THREE.Vector3();
    this._tmpColor = new THREE.Color();
    this._dimColor = new THREE.Color(0x111622);
    this._warnColor = new THREE.Color(0xff2a3c);

    this._wallHitResult = {
      hit: false,
      distance: 0,
      point: new THREE.Vector3(),
      normal: new THREE.Vector3(),
      tag: '',
    };

    this._dmgOptions = {
      hitShield: false,
      weaponId: '',
      piercing: false,
      knockback: 0,
      isMelee: false,
    };

    this._resolvedHits = [];
    for (let i = 0; i < MAX_RESOLVED_HITS; i++) {
      this._resolvedHits.push({
        dist: 0,
        isHead: false,
        isShield: false,
        entity: null,
        cx: 0,
        cy: 0,
        cz: 0,
      });
    }

    this._shotAccum = [];
    for (let i = 0; i < MAX_SHOT_ACCUM; i++) {
      this._shotAccum.push({
        entity: null,
        amount: 0,
        isHeadshot: false,
        killed: false,
        blockedByShield: true,
        hasHeadPoint: false,
        point: new THREE.Vector3(),
      });
    }

    // Reusable event payloads & return snapshots
    this._updateResult = { adsFov: null, crosshairSpread: 0.018 };

    this._firedPayload = {
      weaponId: '',
      slot: 1,
      ammo: 0,
      reserve: 0,
      magSize: 0,
      color: 0,
      isAds: false,
      muzzleWorldPos: this._worldMuzzlePos,
    };
    this._reloadStartPayload = { weaponId: '', reloadTime: 0, ammo: 0, reserve: 0 };
    this._reloadedPayload = { weaponId: '', ammo: 0, reserve: 0, magSize: 0 };
    this._switchedPayload = { index: 0, weapon: WEAPONS[0], ammo: 0, reserve: 0, magSize: 0 };
    this._meleePayload = { position: this._eyePos, range: PLAYER_CONFIG.meleeRange };
    this._damagePayload = {
      amount: 0,
      point: new THREE.Vector3(),
      isHeadshot: false,
      killed: false,
      blockedByShield: false,
      targetId: null,
      isEnemy: false,
      weaponId: '',
      isMelee: false,
    };

    this._stateSnapshot = {
      index: 0,
      id: WEAPONS[0].id,
      name: WEAPONS[0].name,
      shortName: WEAPONS[0].shortName,
      slot: WEAPONS[0].slot,
      role: WEAPONS[0].role,
      color: WEAPONS[0].color,
      colorCss: WEAPONS[0].colorCss,
      ammo: WEAPONS[0].magSize,
      magSize: WEAPONS[0].magSize,
      reserve: WEAPONS[0].maxReserve,
      maxReserve: WEAPONS[0].maxReserve,
      isReloading: false,
      reloadProgress: 0,
      isSwapping: false,
      isAds: false,
      adsProgress: 0,
      isMeleeing: false,
      meleeCooldown: 0,
      weapon: WEAPONS[0],
    };

    // Initialize diegetic ammo bars & initial hipfire offset on all rigs
    for (let i = 0; i < WEAPONS.length; i++) {
      const w = WEAPONS[i];
      this._rigs[i].root.position.set(w.viewmodelOffset.x, w.viewmodelOffset.y, w.viewmodelOffset.z);
      this._updateAmmoBar(this._rigs[i], this._ammoStates[i].ammo, w.magSize, 1.0);
    }
  }

  // ---------------------------------------------------------------------------
  // Main Per-Frame Update (Zero GC)
  // ---------------------------------------------------------------------------

  /**
   * Update weapon inputs, ballistics, melee, and spring-damped 1P viewmodel animation.
   * @param {number} dt
   * @param {Array<any>} [targets]
   * @returns {{ adsFov: number | null, crosshairSpread: number }}
   */
  update(dt, targets = null) {
    if (!Number.isFinite(dt) || dt <= 0) {
      return this._updateResult;
    }
    const clampedDt = dt > 0.05 ? 0.05 : dt;
    const weapon = WEAPONS[this.currentIndex];
    const rig = this._rigs[this.currentIndex];
    const ammoState = this._ammoStates[this.currentIndex];
    const pc = this.playerController;
    if (pc && weapon) pc.weaponMoveMult = weapon.moveSpeedMult || 1.0;
    this._guardElapsed = (this._guardElapsed || 0) + clampedDt;
    if (this._guardShieldGroup && pc) {
      const guarding = Boolean(pc.isGuarding);
      const targetA = guarding ? 1.0 : 0.0;
      this._guardRaiseAlpha += (targetA - this._guardRaiseAlpha) * Math.min(1, clampedDt * 18);
      this._guardShieldGroup.visible = this._guardRaiseAlpha > 0.03;
      if (this._guardShieldGroup.visible) {
        const a = this._guardRaiseAlpha;
        const flash = pc.guardHitFlash || 0;
        const pct = Math.max(0, Math.min(1, (pc.guardEnergy || 0) / Math.max(1, pc.maxGuardEnergy || 100)));
        const stage = pct < 0.22 ? 3 : pct < 0.48 ? 2 : pct < 0.76 ? 1 : 0;

        if (this._guardShieldFillMat && this._guardCrackTextures && stage !== this._guardCurrentStage) {
          this._guardCurrentStage = stage;
          this._guardShieldFillMat.map = this._guardCrackTextures[stage];
          this._guardShieldFillMat.needsUpdate = true;
        }

        // Progressive stress shiver as shield gets closer to shattering
        const shiverAmp = stage === 3 ? 0.0085 : stage === 2 ? 0.003 : 0;
        const sx = shiverAmp > 0 ? (Math.random() - 0.5) * shiverAmp : 0;
        const sy = shiverAmp > 0 ? (Math.random() - 0.5) * shiverAmp : 0;
        this._guardShieldGroup.position.set(sx, -0.32 + a * 0.26 + sy, -0.58 + flash * 0.035);
        this._guardShieldGroup.scale.setScalar(0.75 + a * 0.25 + flash * 0.03);
        this._guardShieldGroup.rotation.z = Math.sin(this._guardElapsed * 1.8) * 0.012;

        if (this._guardShieldFillMat) {
          // Very clear low opacity when healthy; fractures glow brighter as damage mounts & on impact flash
          const baseOp = stage === 0 ? 0.34 : stage === 1 ? 0.46 : stage === 2 ? 0.60 : 0.74;
          const flicker = stage === 3 ? (Math.sin(this._guardElapsed * 32) > 0 ? 1.0 : 0.65) : 1.0;
          this._guardShieldFillMat.opacity = Math.min(0.95, (baseOp + flash * 0.45) * a * flicker);
          if (flash > 0.15) {
            this._guardShieldFillMat.color.setHex(0xffffff);
          } else if (stage === 3) {
            this._guardShieldFillMat.color.setHex(0xf43f5e);
          } else if (stage === 2) {
            this._guardShieldFillMat.color.setHex(0xf59e0b);
          } else {
            this._guardShieldFillMat.color.setHex(this._guardFrameColorHex || 0x38bdf8);
          }
        }
        if (this._guardRailGlowMat) {
          const railCol = stage === 3 ? 0xef4444 : stage === 2 ? 0xf59e0b : (this._guardFrameColorHex || 0x38bdf8);
          this._guardRailGlowMat.color.setHex(railCol);
          if (this._guardRailGlowMat.emissive) this._guardRailGlowMat.emissive.setHex(railCol);
          this._guardRailGlowMat.emissiveIntensity = 2.0 + flash * 4.0;
        }
      }
    }

    // Timers & No-Reload Secondary Mechanics (Heat Cooling + Auto-Regen Charges)
    if (this._fireCooldown > 0) this._fireCooldown = Math.max(0, this._fireCooldown - clampedDt);
    for (let i = 0; i < WEAPONS.length; i++) {
      const w = WEAPONS[i];
      const st = this._ammoStates[i];
      if (w.mech === 'heat') {
        const coolRate = st.overheated ? 52 : 34;
        if (st.heat > 0) {
          st.heat = Math.max(0, st.heat - coolRate * clampedDt);
          if (st.overheated && st.heat <= 1) {
            st.overheated = false;
          }
        }
        st.ammo = Math.round(st.heat);
      } else if (w.mech === 'regen' || w.mech === 'repulsor') {
        if (st.ammo < w.magSize) {
          st.regenTimer += clampedDt;
          const interval = w.regenTime || 1.5;
          if (st.regenTimer >= interval) {
            st.regenTimer -= interval;
            st.ammo = Math.min(w.magSize, st.ammo + 1);
            if (i === this.currentIndex) {
              this._updateAmmoBar(this._rigs[i], st.ammo, w.magSize, 1.0);
            }
          }
        } else {
          st.regenTimer = 0;
        }
      }
    }
    if (this._meleeCooldown > 0) this._meleeCooldown = Math.max(0, this._meleeCooldown - clampedDt);
    if (this._semiFireBuffer > 0) this._semiFireBuffer = Math.max(0, this._semiFireBuffer - clampedDt);
    this._spreadBloom *= Math.exp(-8.5 * clampedDt);
    this._emissiveFlare *= Math.exp(-10.0 * clampedDt);
    this._idleTime += clampedDt;

    if (weapon.id === 'railgun') {
      const cycle = 60 / weapon.rpm;
      this._railRecharge = clamp(1 - this._fireCooldown / cycle, 0, 1);
    } else {
      this._railRecharge = 1.0;
    }

    // If dead, gently settle viewmodel and abort combat inputs
    if (pc && !pc.isAlive) {
      this._adsProgress *= Math.exp(-10 * clampedDt);
      this._updateViewmodelAnimation(clampedDt, weapon, rig, ammoState, false);
      this._updateResult.adsFov = null;
      this._updateResult.crosshairSpread = weapon.hipSpread;
      return this._updateResult;
    }

    // 1. Weapon Switching Inputs (1-4 keys, mouse wheel, touch weaponNext/weaponPrev)
    this._handleSwitchInputs();

    // 2. Quick Cyber-Blade Melee Input
    if (this.input.consumePressed('melee') && this._meleeCooldown <= 0 && !this._isMeleeing) {
      this._startMelee();
    }

    // 3. Reload Input (skipped for no-reload secondary weapons)
    if (
      this.input.consumePressed('reload') &&
      !weapon.noReload &&
      !this._isReloading &&
      !this._isSwapping &&
      !this._isMeleeing &&
      ammoState.ammo < weapon.magSize &&
      ammoState.reserve > 0
    ) {
      this._startReload(weapon, ammoState);
    }

    // 4. Advance Active States (Swap, Melee, Reload)
    if (this._isSwapping) {
      this._updateSwap(clampedDt);
    }

    if (this._isMeleeing) {
      this._updateMelee(clampedDt, targets);
    }

    if (this._isReloading) {
      this._updateReload(clampedDt, weapon, rig, ammoState);
    }

    // Re-fetch active weapon/rig/ammo in case swap switched mid-frame
    const activeWeapon = WEAPONS[this.currentIndex];
    const activeRig = this._rigs[this.currentIndex];
    const activeAmmo = this._ammoStates[this.currentIndex];

    // 5. ADS State & Smooth Interpolation
    const wantsAds =
      this.input.isDown('ads') &&
      !this._isReloading &&
      !this._isSwapping &&
      !this._isMeleeing &&
      !(pc && pc.isDashing) &&
      !(pc && pc.isGuarding);

    if (pc) {
      pc.isAds = wantsAds;
    }

    const adsTarget = wantsAds ? 1 : 0;
    const adsLerp = 1 - Math.exp(-activeWeapon.adsSpeed * clampedDt);
    this._adsProgress += (adsTarget - this._adsProgress) * adsLerp;
    if (this._adsProgress < 0.001) this._adsProgress = 0;
    else if (this._adsProgress > 0.999) this._adsProgress = 1;

    // 6. Compute Dynamic Crosshair Spread (hip <-> ADS + movement + air + firing bloom)
    const speedRatio = pc ? clamp(pc.speed / PLAYER_CONFIG.walkSpeed, 0, 1.4) : 0;
    const airFactor = pc && !pc.isGrounded ? 1.45 : 1.0;
    const baseSpread =
      activeWeapon.hipSpread + (activeWeapon.adsSpread - activeWeapon.hipSpread) * this._adsProgress;
    const moveBonus =
      activeWeapon.moveSpreadBonus * speedRatio * airFactor * (1 - this._adsProgress * 0.72);
    const guardSpreadFactor = pc && pc.isGuarding ? (activeWeapon.guardSpreadMult || 1.35) : 1.0;
    const currentSpread = (baseSpread + moveBonus + this._spreadBloom * (1 - this._adsProgress * 0.65)) * guardSpreadFactor;

    // 7. Firing Input & Semi-Auto Buffer
    const fireDown = this.input.isDown('fire');
    const firePressed = this.input.consumePressed('fire') || (fireDown && !this._wasFireDown);
    this._wasFireDown = fireDown;

    if (firePressed && activeWeapon.fireMode === 'semi') {
      this._semiFireBuffer = 0.09;
    }

    const canFireAction = !this._isReloading && !this._isSwapping && !this._isMeleeing && !(pc && pc.isGuarding && activeWeapon.canFireWhileGuarding === false);
    const wantsToFire =
      activeWeapon.fireMode === 'auto'
        ? fireDown || firePressed
        : firePressed || this._semiFireBuffer > 0;

    if (canFireAction && wantsToFire) {
      const heatBlocked = activeWeapon.mech === 'heat' && activeAmmo.overheated;
      const emptyMag = activeWeapon.mech !== 'heat' && activeAmmo.ammo <= 0;
      if (heatBlocked) {
        this._semiFireBuffer = 0;
      } else if (emptyMag) {
        // Auto-reload on empty magazine only for reloadable primary weapons
        if (!activeWeapon.noReload && activeAmmo.reserve > 0) {
          this._semiFireBuffer = 0;
          this._startReload(activeWeapon, activeAmmo);
        }
      } else if (this._fireCooldown <= 0) {
        this._semiFireBuffer = 0;
        // Ensure viewmodel transforms are current before querying muzzle/eject anchors
        this._updateViewmodelAnimation(0, activeWeapon, activeRig, activeAmmo, wantsAds);
        this._fireShot(activeWeapon, activeRig, activeAmmo, currentSpread, wantsAds, targets);
      }
    }

    // 8. Update Procedural 1P Viewmodel Animation State Machine
    this._updateViewmodelAnimation(clampedDt, activeWeapon, activeRig, activeAmmo, wantsAds);

    // Return zero-GC result for PlayerController FOV + HUD crosshair
    this._updateResult.adsFov = wantsAds ? activeWeapon.adsFov : null;
    this._updateResult.crosshairSpread = currentSpread;
    return this._updateResult;
  }

  // ---------------------------------------------------------------------------
  // Weapon Switching, Reload & Melee State Transitions
  // ---------------------------------------------------------------------------

  /** @private */
  _handleSwitchInputs() {
    let desiredSlot = -1;
    if (this.input.consumePressed('weapon1')) desiredSlot = 0;
    else if (this.input.consumePressed('weapon2')) desiredSlot = 1;

    const wheel = this.input.consumeWheelDelta();
    const nextBtn = this.input.consumePressed('weaponNext');
    const prevBtn = this.input.consumePressed('weaponPrev');

    if (desiredSlot === -1 && (wheel !== 0 || nextBtn || prevBtn)) {
      desiredSlot = this.activeLoadoutSlot === 0 ? 1 : 0;
    }

    if (desiredSlot !== -1) {
      this.switchLoadoutSlot(desiredSlot);
    }
  }

  /**
   * Switch cleanly to weapon slot index (0..3) with holster/draw animation.
   * @param {number} index
   */
  _trySlideReload() {
    const pc = this.playerController;
    if (!pc || !pc.mods || !pc.mods.slideReload) return;
    const w = WEAPONS[this.currentIndex];
    const st = this._ammoStates[this.currentIndex];
    if (!w || !st || st.ammo >= w.magSize || st.reserve <= 0) return;
    const add = Math.min(Math.ceil(w.magSize * 0.4), w.magSize - st.ammo, st.reserve);
    if (add > 0) {
      st.ammo += add;
      st.reserve -= add;
      this._updateAmmoBar(this._rigs[this.currentIndex], st.ammo, w.magSize, 1.0);
    }
  }

  setPilotFrameStyle(frameId) {
    if (this._factory && typeof this._factory.setPilotFrameStyle === 'function') {
      this._factory.setPilotFrameStyle(frameId);
    }
    this._guardFrameColorHex =
      frameId === 'bastion'
        ? 0x22c55e
        : frameId === 'apex'
        ? 0xf43f5e
        : frameId === 'strider'
        ? 0x00f0ff
        : 0x38bdf8;
    if (this._guardRailGlowMat) {
      this._guardRailGlowMat.color.setHex(this._guardFrameColorHex);
      if (this._guardRailGlowMat.emissive) this._guardRailGlowMat.emissive.setHex(this._guardFrameColorHex);
    }
    if (this._guardShieldFillMat) {
      this._guardShieldFillMat.color.setHex(this._guardFrameColorHex);
    }
  }

  _createGuardCrackTexture(stage) {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 384;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 512, 384);

    // 1. Ultra-subtle edge vignette & fine hex micro-mesh (very transparent center for clear aiming!)
    const vig = ctx.createRadialGradient(256, 192, 95, 256, 192, 275);
    vig.addColorStop(0.0, 'rgba(200, 240, 255, 0.04)');
    vig.addColorStop(0.72, 'rgba(160, 230, 255, 0.14)');
    vig.addColorStop(1.0, 'rgba(210, 245, 255, 0.52)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, 512, 384);

    // Subtle fine hex grid
    ctx.strokeStyle = 'rgba(220, 245, 255, 0.12)';
    ctx.lineWidth = 1;
    const step = 28;
    for (let y = 0; y < 384; y += step) {
      for (let x = 0; x < 512; x += step * 1.5) {
        const ox = ((y / step) % 2) * (step * 0.75);
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = (k * Math.PI) / 3;
          const px = x + ox + Math.cos(a) * 11;
          const py = y + Math.sin(a) * 11;
          if (k === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();
      }
    }

    // Crisp technical corner framing lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
    ctx.lineWidth = 3;
    ctx.strokeRect(6, 6, 500, 372);

    // 2. Progressive Ballistic Glass Crack Webs (Stages 1, 2, 3)
    const drawCrackCluster = (cx, cy, branches, maxLen, alpha, color, width) => {
      ctx.save();
      ctx.strokeStyle = color;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      // Impact bullseye rings
      ctx.beginPath();
      ctx.arc(cx, cy, 7, 0, Math.PI * 2);
      ctx.stroke();
      if (stage >= 2) {
        ctx.beginPath();
        ctx.arc(cx, cy, 18, 0.2, Math.PI * 1.7);
        ctx.stroke();
      }
      let seed = Math.floor(cx * 31 + cy * 17 + stage * 97);
      const rand = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
      };
      for (let b = 0; b < branches; b++) {
        let ang = (b / branches) * Math.PI * 2 + (rand() - 0.5) * 0.45;
        let px = cx;
        let py = cy;
        const segs = 4 + Math.floor(rand() * 4);
        ctx.beginPath();
        ctx.moveTo(px, py);
        for (let s = 0; s < segs; s++) {
          const len = (maxLen / segs) * (0.65 + rand() * 0.7);
          ang += (rand() - 0.5) * 0.55;
          px += Math.cos(ang) * len;
          py += Math.sin(ang) * len;
          ctx.lineTo(px, py);
          // Secondary splinter fork
          if (s >= 1 && rand() < 0.55) {
            const forkAng = ang + (rand() < 0.5 ? 0.65 : -0.65);
            const fx = px + Math.cos(forkAng) * (len * 0.7);
            const fy = py + Math.sin(forkAng) * (len * 0.7);
            ctx.moveTo(px, py);
            ctx.lineTo(fx, fy);
            ctx.moveTo(px, py);
          }
        }
        ctx.stroke();
      }
      ctx.restore();
    };

    if (stage >= 1) {
      // Hairline impact cracks
      drawCrackCluster(175, 165, 6, 72, 0.72, '#e0f2fe', 1.6);
      drawCrackCluster(355, 225, 5, 58, 0.65, '#e0f2fe', 1.4);
    }
    if (stage >= 2) {
      // Deep branching structural fractures
      drawCrackCluster(258, 195, 9, 135, 0.88, '#ffffff', 2.2);
      drawCrackCluster(120, 260, 6, 85, 0.78, '#fde68a', 1.8);
      drawCrackCluster(390, 125, 7, 92, 0.78, '#fde68a', 1.8);
    }
    if (stage >= 3) {
      // Critical near-shatter dense spiderweb + hot stress fractures
      drawCrackCluster(256, 192, 14, 210, 0.96, '#ffffff', 2.8);
      drawCrackCluster(165, 115, 9, 130, 0.90, '#fca5a5', 2.1);
      drawCrackCluster(345, 275, 9, 130, 0.90, '#fca5a5', 2.1);
    }

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  _buildGuardShieldMesh() {
    const g = new THREE.Group();
    this._guardFrameColorHex = 0x38bdf8;
    this._guardCrackTextures = [
      this._createGuardCrackTexture(0),
      this._createGuardCrackTexture(1),
      this._createGuardCrackTexture(2),
      this._createGuardCrackTexture(3),
    ];
    this._guardCurrentStage = 0;

    // 1. Sleek Horizontally-Curved Ballistic Energy Glass Arc (low opacity so aim stays crystal clear!)
    const arcRadius = 0.88;
    const arcSpan = 0.86;
    const shieldH = 0.56;
    const glassGeo = new THREE.CylinderGeometry(
      arcRadius,
      arcRadius,
      shieldH,
      28,
      1,
      true,
      Math.PI - arcSpan * 0.5,
      arcSpan
    );
    this._guardShieldFillMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      map: this._guardCrackTextures[0],
      transparent: true,
      opacity: 0.42,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    const glassMesh = new THREE.Mesh(glassGeo, this._guardShieldFillMat);
    glassMesh.position.z = arcRadius;
    glassMesh.renderOrder = 20;
    g.add(glassMesh);

    // 2. Sculpted Dark Titanium-Gunmetal Top & Bottom Curved Armored Clamp Rails
    const railMat = new THREE.MeshStandardMaterial({
      color: 0x1e2633,
      metalness: 0.86,
      roughness: 0.32,
    });
    this._guardRailGlowMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: new THREE.Color(0x38bdf8),
      emissiveIntensity: 2.2,
      roughness: 0.2,
      metalness: 0.2,
      fog: false,
    });
    const railGeo = new THREE.CylinderGeometry(
      arcRadius + 0.012,
      arcRadius + 0.012,
      0.036,
      24,
      1,
      true,
      Math.PI - arcSpan * 0.52,
      arcSpan * 1.04
    );
    const glowStripGeo = new THREE.CylinderGeometry(
      arcRadius + 0.008,
      arcRadius + 0.008,
      0.010,
      24,
      1,
      true,
      Math.PI - arcSpan * 0.50,
      arcSpan
    );
    for (const sy of [-1, 1]) {
      const rail = new THREE.Mesh(railGeo, railMat);
      rail.position.set(0, sy * (shieldH * 0.5 + 0.014), arcRadius);
      rail.renderOrder = 21;
      g.add(rail);

      const strip = new THREE.Mesh(glowStripGeo, this._guardRailGlowMat);
      strip.position.set(0, sy * (shieldH * 0.5 - 0.004), arcRadius);
      strip.renderOrder = 22;
      g.add(strip);
    }

    // 3. Left & Right Beveled Tactical Emitter Pods framing the curved glass
    const emitterGeo = new THREE.BoxGeometry(0.032, shieldH + 0.04, 0.038);
    const edgeAngle = arcSpan * 0.52;
    for (const side of [-1, 1]) {
      const pod = new THREE.Mesh(emitterGeo, railMat);
      const ex = Math.sin(side * edgeAngle) * arcRadius;
      const ez = arcRadius - Math.cos(edgeAngle) * arcRadius;
      pod.position.set(ex, 0, ez);
      pod.rotation.y = -side * edgeAngle;
      pod.renderOrder = 21;
      g.add(pod);
    }

    g.position.set(0.0, -0.06, -0.58);
    g.visible = false;
    this._guardRaiseAlpha = 0;
    this._guardElapsed = 0;
    return g;
  }

  equipFloorWeapon(weaponIndex) {
    const idx = Math.max(0, Math.min(WEAPONS.length - 1, Math.floor(weaponIndex)));
    const w = WEAPONS[idx];
    const st = this._ammoStates[idx];
    const isSecondary = w.category === 'secondary';
    const prevIdx = isSecondary ? this.equippedSecondaryIndex : this.equippedPrimaryIndex;

    if (prevIdx === idx) {
      // Same weapon picked up -> Overclock +15% & visual 3D attachment evolution!
      this.weaponOverclock[idx] = Math.min(5, (this.weaponOverclock[idx] || 0) + 1);
      this._applyOverclockVisual(idx);
      if (!w.noReload) {
        st.ammo = w.magSize;
        st.reserve = w.maxReserve;
      }
      return { swapped: false, replacedIndex: -1, overclockLevel: this.weaponOverclock[idx], weapon: w };
    }

    if (isSecondary) {
      this.equippedSecondaryIndex = idx;
      this.activeLoadoutSlot = 1;
    } else {
      this.equippedPrimaryIndex = idx;
      this.activeLoadoutSlot = 0;
    }

    if (w.mech === 'heat') {
      st.heat = 0;
      st.overheated = false;
      st.ammo = 0;
    } else {
      st.ammo = w.magSize;
      st.reserve = w.maxReserve;
    }

    // Immediate swap to newly picked up weapon
    this.switchWeapon(idx);
    return {
      swapped: true,
      replacedIndex: prevIdx,
      replacedWeapon: WEAPONS[prevIdx],
      overclockLevel: this.weaponOverclock[idx] || 0,
      weapon: w,
    };
  }

  switchLoadoutSlot(slot) {
    const nextSlot = slot === 1 ? 1 : 0;
    this.activeLoadoutSlot = nextSlot;
    const targetIdx = nextSlot === 1 ? this.equippedSecondaryIndex : this.equippedPrimaryIndex;
    this.switchWeapon(targetIdx);
  }

  getLoadoutInfo() {
    return {
      activeSlot: this.activeLoadoutSlot,
      primaryIndex: this.equippedPrimaryIndex,
      secondaryIndex: this.equippedSecondaryIndex,
      primaryWeapon: WEAPONS[this.equippedPrimaryIndex],
      secondaryWeapon: WEAPONS[this.equippedSecondaryIndex],
      primaryOverclock: this.weaponOverclock[this.equippedPrimaryIndex] || 0,
      secondaryOverclock: this.weaponOverclock[this.equippedSecondaryIndex] || 0,
    };
  }

  switchWeapon(index) {
    const count = WEAPONS.length;
    const targetIdx = ((Math.floor(index) % count) + count) % count;

    if (!this._isSwapping && targetIdx === this.currentIndex) return;
    if (this._isSwapping && targetIdx === this._pendingIndex) return;

    // Cancel any active reload cleanly and restore magazine transform
    if (this._isReloading) {
      this._cancelReload();
    }

    const nextWeapon = WEAPONS[targetIdx];
    this._pendingIndex = targetIdx;
    this._swapDuration = nextWeapon.swapTime || 0.32;

    if (this._isSwapping && this._swapSwitched) {
      // Already drawing; dip back down smoothly from current progress
      this._swapSwitched = false;
      this._swapTimer = this._swapDuration * 0.25;
    } else if (!this._isSwapping) {
      this._isSwapping = true;
      this._swapSwitched = false;
      this._swapTimer = 0;
    }
  }

  /** @private */
  _updateSwap(dt) {
    this._swapTimer += dt;
    const mid = this._swapDuration * 0.45;

    if (!this._swapSwitched && this._swapTimer >= mid) {
      this._swapSwitched = true;
      this._rigs[this.currentIndex].root.visible = false;
      this._resetMechanicalParts(this._rigs[this.currentIndex]);

      this.currentIndex = this._pendingIndex >= 0 ? this._pendingIndex : this.currentIndex;
      this._pendingIndex = -1;

      const newWeapon = WEAPONS[this.currentIndex];
      const newRig = this._rigs[this.currentIndex];
      const newAmmo = this._ammoStates[this.currentIndex];
      newRig.root.visible = true;

      this._fireCooldown = Math.min(this._fireCooldown, 0.06);
      this._pumpActive = false;
      this._pumpDelay = 0;
      this._boltState = 0;
      this._recoilZ = 0;
      this._recoilPitch = 0;
      this._recoilRoll = 0;
      this._spreadBloom = 0;
      this._updateAmmoBar(newRig, newAmmo.ammo, newWeapon.magSize, 1.0);

      this._switchedPayload.index = this.currentIndex;
      this._switchedPayload.weapon = newWeapon;
      this._switchedPayload.ammo = newAmmo.ammo;
      this._switchedPayload.reserve = newAmmo.reserve;
      this._switchedPayload.magSize = newWeapon.magSize;
      this.eventBus.emit(EVENTS.WEAPON_SWITCHED, this._switchedPayload);
    }

    if (this._swapTimer >= this._swapDuration) {
      this._isSwapping = false;
      this._swapTimer = 0;
      this._swapSwitched = false;
    }
  }

  /** @private */
  _startReload(weapon, ammoState) {
    this._isReloading = true;
    this._reloadTimer = 0;
    this._reloadSlapTriggered = false;
    this._pumpActive = false;
    this._pumpDelay = 0;

    this._reloadStartPayload.weaponId = weapon.id;
    this._reloadStartPayload.reloadTime = weapon.reloadTime;
    this._reloadStartPayload.ammo = ammoState.ammo;
    this._reloadStartPayload.reserve = ammoState.reserve;
    this.eventBus.emit(EVENTS.WEAPON_RELOAD_START, this._reloadStartPayload);
  }

  /** @private */
  _cancelReload() {
    this._isReloading = false;
    this._reloadTimer = 0;
    this._reloadSlapTriggered = false;
    const rig = this._rigs[this.currentIndex];
    this._resetMechanicalParts(rig);
  }

  /** @private */
  _updateReload(dt, weapon, rig, ammoState) {
    const speedMult =
      this.playerController && this.playerController.mods
        ? this.playerController.mods.reloadSpeedMult
        : 1.0;
    const effReloadTime = weapon.reloadTime / Math.max(0.5, speedMult);
    this._reloadTimer += dt;
    const p = clamp(this._reloadTimer / effReloadTime, 0, 1);

    // Trigger tactile mag slap-in upward bump right when fresh mag locks home
    if (!this._reloadSlapTriggered && p >= 0.77) {
      this._reloadSlapTriggered = true;
      this._recoilPitchVel += 1.5;
      this._recoilZVel -= 0.16;
      this._emissiveFlare = 0.8;
    }

    // Sequentially light up LED bar during bolt-rack finish stage (0.80 -> 0.98)
    if (p >= 0.80) {
      const fillProg = clamp((p - 0.80) / 0.18, 0, 1);
      const previewAmmo = Math.min(
        weapon.magSize,
        ammoState.ammo + Math.ceil((Math.min(weapon.magSize - ammoState.ammo, ammoState.reserve)) * fillProg)
      );
      this._updateAmmoBar(rig, previewAmmo, weapon.magSize, 1.0);
    }

    if (this._reloadTimer >= effReloadTime) {
      const needed = weapon.magSize - ammoState.ammo;
      const transfer = Math.min(needed, ammoState.reserve);
      ammoState.ammo += transfer;
      ammoState.reserve -= transfer;

      this._isReloading = false;
      this._reloadTimer = 0;
      this._reloadSlapTriggered = false;
      this._resetMechanicalParts(rig);
      this._updateAmmoBar(rig, ammoState.ammo, weapon.magSize, 1.0);

      this._reloadedPayload.weaponId = weapon.id;
      this._reloadedPayload.ammo = ammoState.ammo;
      this._reloadedPayload.reserve = ammoState.reserve;
      this._reloadedPayload.magSize = weapon.magSize;
      this.eventBus.emit(EVENTS.WEAPON_RELOADED, this._reloadedPayload);
    }
  }

  /** @private */
  _startMelee() {
    if (this._isReloading) {
      this._cancelReload();
    }
    this._isMeleeing = true;
    this._meleeTimer = 0;
    this._meleeCooldown = PLAYER_CONFIG.meleeCooldown;
    this._meleeHitProcessed = false;
    this._meleeRig.root.visible = true;

    this.playerController.getEyePosition(this._eyePos);
    this._meleePayload.position = this._eyePos;
    this.eventBus.emit(EVENTS.WEAPON_MELEE, this._meleePayload);
  }

  /** @private */
  _updateMelee(dt, targets) {
    this._meleeTimer += dt;
    const t = clamp(this._meleeTimer / this._meleeDuration, 0, 1);

    // Animate cyber-mantis forearm blade: quick windup -> blazing diagonal slash across viewport -> retract
    const root = this._meleeRig.root;
    if (t < 0.20) {
      // Snappy left-low windup
      const w = smoothstep(0, 0.20, t);
      root.position.set(-0.48 + w * 0.12, -0.36 + w * 0.18, -0.34 - w * 0.08);
      root.rotation.set(0.32, 0.85 - w * 0.25, -0.85 + w * 0.20);
    } else if (t < 0.56) {
      // Lightning diagonal slash from left-lower to right-upper across center crosshair
      const s = smoothstep(0.20, 0.56, t);
      const arc = Math.sin(s * Math.PI);
      root.position.set(-0.36 + s * 0.78, -0.18 + s * 0.20 + arc * 0.06, -0.42 - arc * 0.16);
      root.rotation.set(0.32 - s * 0.65, 0.60 - s * 1.95, -0.65 + s * 1.45);
    } else {
      // Crisp follow-through & retract off bottom-right
      const r = smoothstep(0.56, 1.0, t);
      root.position.set(0.42 + r * 0.22, 0.02 - r * 0.44, -0.42 + r * 0.14);
      root.rotation.set(-0.33 - r * 0.35, -1.35 - r * 0.3, 0.80 + r * 0.25);
    }

    // Pulse blade edge energy during the strike apex
    const edgeGlow = t >= 0.18 && t <= 0.60 ? 5.4 : 2.8;
    this._meleeRig.bladeEdgeMat.emissiveIntensity = edgeGlow;

    // Perform melee cone hit check at slash apex
    if (!this._meleeHitProcessed && t >= 0.26) {
      this._meleeHitProcessed = true;
      this._executeMeleeHitCheck(targets);
    }

    if (this._meleeTimer >= this._meleeDuration) {
      this._isMeleeing = false;
      this._meleeTimer = 0;
      root.visible = false;
    }
  }

  /** @private */
  _executeMeleeHitCheck(targets) {
    if (!targets || targets.length === 0) return;

    const pc = this.playerController;
    pc.getEyePosition(this._eyePos);
    pc.getLookDirection(this._lookDir);

    const maxRange = PLAYER_CONFIG.meleeRange;
    const minCosCone = 0.32; // Generous ~71° half-angle horizontal slash arc
    let hitAny = false;

    for (let i = 0; i < targets.length; i++) {
      const target = targets[i];
      if (!target || !target.isAlive || typeof target.getHitSpheres !== 'function') continue;

      const spheres = target.getHitSpheres();
      if (!spheres || spheres.length === 0) continue;

      let bestDist = Infinity;
      let hitSphere = null;

      for (let s = 0; s < spheres.length; s++) {
        const sp = spheres[s];
        this._toTarget.subVectors(sp.center, this._eyePos);
        const dist = this._toTarget.length();
        const effDist = Math.max(0.05, dist - sp.radius);
        if (effDist > maxRange) continue;

        if (dist > 0.001) {
          const invD = 1 / dist;
          const dot =
            this._toTarget.x * invD * this._lookDir.x +
            this._toTarget.y * invD * this._lookDir.y +
            this._toTarget.z * invD * this._lookDir.z;
          if (dot < minCosCone && effDist > 0.6) continue;
        }

        if (effDist < bestDist && (!sp.isShield || !hitSphere)) {
          bestDist = effDist;
          hitSphere = sp;
        }
      }

      if (!hitSphere) continue;

      // Compute impact point on sphere surface facing player & verify no solid wall blocks strike
      this._toTarget.subVectors(hitSphere.center, this._eyePos);
      const centerDist = this._toTarget.length() || 1;
      const surfaceDist = Math.max(0.25, centerDist - hitSphere.radius * 0.85);
      this._rayDir.copy(this._toTarget).multiplyScalar(1 / centerDist);

      if (surfaceDist > 0.14) {
        const wallBlock = this.collisionWorld.raycastWorld(
          this._eyePos,
          this._rayDir,
          surfaceDist - 0.08,
          this._wallHitResult
        );
        if (wallBlock) continue;
      }

      this._hitPoint.copy(this._eyePos).addScaledVector(this._rayDir, surfaceDist);
      this._hitNormal.copy(this._lookDir).negate();

      this._kbDir.set(this._lookDir.x, Math.max(0.18, this._lookDir.y + 0.18), this._lookDir.z).normalize();

      this._dmgOptions.hitShield = false;
      this._dmgOptions.weaponId = 'melee_blade';
      this._dmgOptions.piercing = true;
      this._dmgOptions.knockback = 12.0;
      this._dmgOptions.isMelee = true;

      const res = target.applyDamage(
        PLAYER_CONFIG.meleeDamage,
        this._hitPoint,
        false,
        this._kbDir,
        this._dmgOptions
      );
      const dealt = res && typeof res.dealt === 'number' ? res.dealt : PLAYER_CONFIG.meleeDamage;
      const killed = Boolean(res && res.killed);
      const blocked = Boolean(res && res.blockedByShield);

      this.vfxManager.spawnImpact(
        this._hitPoint,
        this._hitNormal,
        0xff6a1a,
        blocked ? 'shield' : 'body'
      );

      this._damagePayload.amount = dealt;
      this._damagePayload.point.copy(this._hitPoint);
      this._damagePayload.isHeadshot = false;
      this._damagePayload.killed = killed;
      this._damagePayload.blockedByShield = blocked;
      this._damagePayload.targetId = target.id;
      this._damagePayload.isEnemy = Boolean(target.isEnemy);
      this._damagePayload.weaponId = 'melee_blade';
      this._damagePayload.isMelee = true;
      this.eventBus.emit(EVENTS.DAMAGE_DEALT, this._damagePayload);

      hitAny = true;
    }

    if (hitAny) {
      pc.addScreenShake(0.26);
    }
  }

  // ---------------------------------------------------------------------------
  // Shooting, Ballistics & Analytical Ray-vs-Sphere Hit Detection
  // ---------------------------------------------------------------------------

  /**
   * Project a viewmodel-space position (65° FOV camera at origin) into exact screen-aligned
   * world-space coordinates for the dynamic-FOV world camera. Zero allocations.
   * @private
   */
  _projectViewmodelToWorld(vmPos, outWorldPos) {
    this.camera.updateMatrixWorld(true);
    const mw = this.camera.matrixWorld;
    this._camRight.setFromMatrixColumn(mw, 0);
    this._camUp.setFromMatrixColumn(mw, 1);
    this._camForward.setFromMatrixColumn(mw, 2).negate();

    const worldFov = this.camera.fov || PLAYER_CONFIG.baseFov;
    const fovRatio = Math.tan((worldFov * 0.5) * DEG2RAD) / TAN_HALF_VM_FOV;
    const depth = Math.max(0.28, -vmPos.z);

    outWorldPos
      .copy(this.camera.position)
      .addScaledVector(this._camRight, vmPos.x * fovRatio)
      .addScaledVector(this._camUp, vmPos.y * fovRatio)
      .addScaledVector(this._camForward, depth);
  }

  /** @private */
  _fireShot(weapon, rig, ammoState, spread, isAds, targets) {
    const pc = this.playerController;
    const mods = pc && pc.mods ? pc.mods : null;
    const slideFree = Boolean(mods && mods.slideOverclock && pc && pc.isSliding);
    const overdrive = (pc && pc.dashOverdriveTimer > 0) || slideFree;
    if (weapon.mech === 'heat') {
      if (!overdrive) {
        ammoState.heat = Math.min(100, ammoState.heat + 13);
        if (ammoState.heat >= 100) {
          if (mods && mods.thermalNova) {
            // Thermal Nova rare card: forward 9m flame blast + instant vent to 45%
            ammoState.heat = 45;
            ammoState.overheated = false;
            if (targets && targets.length > 0 && pc) {
              pc.getEyePosition(this._eyePos);
              pc.getLookDirection(this._lookDir);
              for (let ti = 0; ti < targets.length; ti++) {
                const t = targets[ti];
                if (!t || !t.isEnemy || !t.isAlive) continue;
                const ddx = t.position.x - pc.position.x;
                const ddz = t.position.z - pc.position.z;
                const dist = Math.hypot(ddx, ddz);
                if (dist <= 9.0) {
                  const dot = (ddx * this._lookDir.x + ddz * this._lookDir.z) / Math.max(0.01, dist);
                  if (dot > 0.25) {
                    t.applyDamage(75, t.center || t.position, false, this._lookDir, { isExplosion: true, knockback: 10 });
                  }
                }
              }
            }
            if (this.vfxManager) {
              this.vfxManager.spawnExplosion(pc.position, 5.2, 0xf97316);
            }
          } else {
            ammoState.overheated = true;
            if (this.eventBus) this.eventBus.emit('SFX_WEAPON_DRY', { overheat: true });
          }
        }
      }
      ammoState.ammo = Math.round(ammoState.heat);
    } else if (!overdrive) {
      ammoState.ammo = Math.max(0, ammoState.ammo - 1);
    }
    const rpmMult = (mods ? mods.fireRateMult : 1.0) * (overdrive ? 1.3 : 1.0);
    this._fireCooldown = 60 / (weapon.rpm * rpmMult);
    this._spreadBloom = Math.min(0.045, this._spreadBloom + weapon.hipSpread * 0.35);

    // Update diegetic LED segments on weapon immediately
    this._updateAmmoBar(rig, ammoState.ammo, weapon.magSize, 1.0);

    // Refresh viewmodel matrices and query muzzle & ejection port positions
    rig.root.updateMatrixWorld(true);
    rig.muzzleAnchor.getWorldPosition(this._vmMuzzlePos);
    rig.ejectAnchor.getWorldPosition(this._vmEjectPos);

    pc.getEyePosition(this._eyePos);
    pc.getLookDirection(this._lookDir);

    // K-0 Kinetic Repulsor: downward shot triggers rocket-jump recoil launch!
    if (weapon.mech === 'repulsor' && this._lookDir.y < -0.45) {
      pc.velocity.y = Math.max(pc.velocity.y, 13.8);
      pc.velocity.x -= this._lookDir.x * 7.5;
      pc.velocity.z -= this._lookDir.z * 7.5;
      pc.isGrounded = false;
    }

    this._projectViewmodelToWorld(this._vmMuzzlePos, this._worldMuzzlePos);
    this._projectViewmodelToWorld(this._vmEjectPos, this._worldEjectPos);

    // Spawn 1P volumetric muzzle flash (suppressed while zoomed inside 2D railgun scope) + spinning shell casing
    const isRailgunScoped = weapon.id === 'railgun' && this._adsProgress > 0.45;
    if (!isRailgunScoped) {
      this.vfxManager.spawnMuzzleFlash(
        this._vmMuzzlePos,
        this._eyePos,
        this._lookDir,
        weapon.color,
        weapon.muzzleScale * (isAds ? 0.68 : 1.0)
      );
    }
    this.vfxManager.spawnShellCasing(
      this._worldEjectPos,
      this._camRight,
      this._camUp,
      this._camForward,
      weapon.color
    );

    // Build orthonormal ray basis from lookDir
    this._camForward.copy(this._lookDir);
    if (Math.abs(this._camForward.y) > 0.98) {
      this._camRight.set(1, 0, 0);
    } else {
      this._camRight.set(-this._camForward.z, 0, this._camForward.x).normalize();
    }
    this._camUp.crossVectors(this._camRight, this._camForward).normalize();

    // Reset per-shot target damage accumulator (aggregates shotgun pellets cleanly per enemy)
    let accumCount = 0;
    const pellets = weapon.pellets || 1;
    const pelletSpinOffset = Math.random() * TWO_PI;
    const isRailgun = weapon.id === 'railgun' || Boolean(weapon.piercing);

    for (let p = 0; p < pellets; p++) {
      // Compute spread direction (stratified ring pattern for multi-pellet shotgun)
      let offX = 0;
      let offY = 0;
      if (spread > 1e-5) {
        if (pellets > 1) {
          if (p === 0) {
            const r = Math.random() * 0.22 * spread;
            const a = Math.random() * TWO_PI;
            offX = Math.cos(a) * r;
            offY = Math.sin(a) * r;
          } else {
            const ringFrac = (p - 1) / (pellets - 1);
            const a = pelletSpinOffset + ringFrac * TWO_PI + (Math.random() - 0.5) * 0.42;
            const r = (0.45 + Math.random() * 0.55) * spread;
            offX = Math.cos(a) * r;
            offY = Math.sin(a) * r;
          }
        } else {
          const r = Math.sqrt(Math.random()) * spread;
          const a = Math.random() * TWO_PI;
          offX = Math.cos(a) * r;
          offY = Math.sin(a) * r;
        }
      }

      this._rayDir
        .copy(this._camForward)
        .addScaledVector(this._camRight, offX)
        .addScaledVector(this._camUp, offY)
        .normalize();

      // 1. Wall Occlusion FIRST (never shoot through solid walls!)
      const wallHit = this.collisionWorld.raycastWorld(
        this._eyePos,
        this._rayDir,
        weapon.range,
        this._wallHitResult
      );
      const maxDist = wallHit ? wallHit.distance : weapon.range;

      // 2. Analytical Ray-vs-Sphere against all living targets up to maxDist
      let resolvedCount = 0;
      if (targets && targets.length > 0) {
        const ox = this._eyePos.x;
        const oy = this._eyePos.y;
        const oz = this._eyePos.z;
        const dx = this._rayDir.x;
        const dy = this._rayDir.y;
        const dz = this._rayDir.z;

        for (let tIdx = 0; tIdx < targets.length; tIdx++) {
          const target = targets[tIdx];
          if (!target || !target.isAlive || typeof target.getHitSpheres !== 'function') continue;

          const spheres = target.getHitSpheres();
          if (!spheres || spheres.length === 0) continue;

          let hasShield = false;
          let shieldDist = Infinity;
          let shieldCx = 0, shieldCy = 0, shieldCz = 0;

          let hasHead = false;
          let headDist = Infinity;
          let headCx = 0, headCy = 0, headCz = 0;

          let hasBody = false;
          let bodyDist = Infinity;
          let bodyCx = 0, bodyCy = 0, bodyCz = 0;

          for (let s = 0; s < spheres.length; s++) {
            const sp = spheres[s];
            const c = sp.center;
            const r = sp.radius;

            const ocX = ox - c.x;
            const ocY = oy - c.y;
            const ocZ = oz - c.z;
            const b = ocX * dx + ocY * dy + ocZ * dz;
            const cTerm = ocX * ocX + ocY * ocY + ocZ * ocZ - r * r;
            const disc = b * b - cTerm;
            if (disc < 0) continue;

            const sqrtD = Math.sqrt(disc);
            let tHit = -b - sqrtD;
            if (tHit < 0) {
              const tFar = -b + sqrtD;
              if (tFar < 0) continue;
              tHit = 0.01;
            }
            if (tHit > maxDist) continue;

            if (sp.isShield) {
              if (tHit < shieldDist) {
                hasShield = true;
                shieldDist = tHit;
                shieldCx = c.x;
                shieldCy = c.y;
                shieldCz = c.z;
              }
            } else if (sp.isHead) {
              if (tHit < headDist) {
                hasHead = true;
                headDist = tHit;
                headCx = c.x;
                headCy = c.y;
                headCz = c.z;
              }
            } else {
              if (tHit < bodyDist) {
                hasBody = true;
                bodyDist = tHit;
                bodyCx = c.x;
                bodyCy = c.y;
                bodyCz = c.z;
              }
            }
          }

          if (!hasShield && !hasHead && !hasBody) continue;
          // Piercing rail shots pass cleanly through energy shields without phantom hits when no head/body lies behind
          if (weapon.piercing && !hasHead && !hasBody) continue;
          if (resolvedCount >= MAX_RESOLVED_HITS) break;

          const slot = this._resolvedHits[resolvedCount++];
          slot.entity = target;

          // Priority rules:
          // - Non-piercing hitting shield strictly in front -> shield block!
          // - Headshot priority within 0.15m tolerance when head & body overlap!
          // - Piercing Railgun punches straight through shields to hit head/body!
          const shieldBlocks =
            !weapon.piercing &&
            hasShield &&
            (!hasHead || shieldDist <= headDist) &&
            (!hasBody || shieldDist <= bodyDist);

          if (shieldBlocks) {
            slot.dist = shieldDist;
            slot.isHead = false;
            slot.isShield = true;
            slot.cx = shieldCx;
            slot.cy = shieldCy;
            slot.cz = shieldCz;
          } else if (hasHead && (!hasBody || headDist <= bodyDist + 0.15)) {
            slot.dist = headDist;
            slot.isHead = true;
            slot.isShield = false;
            slot.cx = headCx;
            slot.cy = headCy;
            slot.cz = headCz;
          } else {
            slot.dist = bodyDist;
            slot.isHead = false;
            slot.isShield = false;
            slot.cx = bodyCx;
            slot.cy = bodyCy;
            slot.cz = bodyCz;
          }
        }
      }

      // 3. In-place insertion sort of resolved entity hits by distance ascending (zero GC)
      for (let i = 1; i < resolvedCount; i++) {
        const cur = this._resolvedHits[i];
        const curDist = cur.dist;
        let j = i - 1;
        while (j >= 0 && this._resolvedHits[j].dist > curDist) {
          this._resolvedHits[j + 1] = this._resolvedHits[j];
          j--;
        }
        this._resolvedHits[j + 1] = cur;
      }

      // 4. Resolve hits along ray (stop at first for standard guns; pierce all for Railgun!)
      let stoppedOnEntity = false;
      let stopDist = maxDist;

      for (let i = 0; i < resolvedCount; i++) {
        const h = this._resolvedHits[i];
        const entity = h.entity;
        if (!entity || !entity.isAlive) continue;

        this._hitPoint.set(
          this._eyePos.x + this._rayDir.x * h.dist,
          this._eyePos.y + this._rayDir.y * h.dist,
          this._eyePos.z + this._rayDir.z * h.dist
        );

        this._hitNormal.set(
          this._hitPoint.x - h.cx,
          this._hitPoint.y - h.cy,
          this._hitPoint.z - h.cz
        );
        if (this._hitNormal.lengthSq() > 1e-6) {
          this._hitNormal.normalize();
        } else {
          this._hitNormal.copy(this._rayDir).negate();
        }

        const ocStep = 0.18 + (mods && mods.autoForgeBonus ? mods.autoForgeBonus : 0);
        const overclockMult = 1 + (this.weaponOverclock[this.currentIndex] || 0) * ocStep;
        let totalDmgMult = overclockMult * (mods ? mods.damageMult : 1.0) * (pc && pc.ultDamageMult ? pc.ultDamageMult : 1.0) * (pc && pc.hyperBarrageTimer > 0 ? 1.35 : 1.0);
        if (pc && pc.inZoneBuff) totalDmgMult *= 1.15 + (mods ? mods.zoneDamageBonus : 0);
        if (pc && mods && mods.airDamageBonus > 0 && (!pc.isGrounded || pc.isSliding)) {
          totalDmgMult *= 1 + mods.airDamageBonus;
        }
        if (pc && mods && mods.slideOverclock && pc.isSliding) {
          totalDmgMult *= 1.6;
        }
        if (pc && mods && mods.synergyVanguard && pc.shield >= pc.maxShield * 0.5) {
          totalDmgMult *= 1.2;
        }
        if (weapon.mech === 'heat' && ammoState.heat >= 78) {
          totalDmgMult *= 1.3; // High-heat sweet spot bonus!
        }
        const hsMult = h.isHead ? weapon.headshotMultiplier + (mods ? mods.headshotBonus : 0) : 1.0;
        let falloffMult = 1.0;
        if (weapon.falloffStart && h.distance > weapon.falloffStart) {
          const endD = weapon.falloffEnd || weapon.range;
          const minM = weapon.falloffMinMult || 0.45;
          const t = Math.min(1, (h.distance - weapon.falloffStart) / Math.max(1, endD - weapon.falloffStart));
          falloffMult = 1.0 - t * (1.0 - minM);
        }
        const rawDamage = weapon.damage * totalDmgMult * hsMult * falloffMult;
        this._kbDir.set(this._rayDir.x, this._rayDir.y + 0.12, this._rayDir.z).normalize();

        this._dmgOptions.hitShield = h.isShield;
        this._dmgOptions.weaponId = weapon.id;
        this._dmgOptions.piercing = Boolean(weapon.piercing);
        this._dmgOptions.knockback = weapon.knockback;
        this._dmgOptions.isMelee = false;

        const dmgRes = entity.applyDamage(
          rawDamage,
          this._hitPoint,
          h.isHead,
          this._kbDir,
          this._dmgOptions
        );

        const blocked = Boolean(h.isShield || (dmgRes && dmgRes.blockedByShield));
        const dealt = dmgRes && typeof dmgRes.dealt === 'number' ? dmgRes.dealt : (blocked ? 0 : rawDamage);
        const killed = Boolean(dmgRes && dmgRes.killed);

        const vfxType = blocked ? 'shield' : h.isHead ? 'head' : 'body';
        this.vfxManager.spawnImpact(this._hitPoint, this._hitNormal, weapon.tracerColor, vfxType);

        // Accumulate per-target damage cleanly for EVENTS.DAMAGE_DEALT
        let acc = null;
        for (let a = 0; a < accumCount; a++) {
          if (this._shotAccum[a].entity === entity) {
            acc = this._shotAccum[a];
            break;
          }
        }
        if (!acc && accumCount < MAX_SHOT_ACCUM) {
          acc = this._shotAccum[accumCount++];
          acc.entity = entity;
          acc.amount = 0;
          acc.isHeadshot = false;
          acc.killed = false;
          acc.blockedByShield = true;
          acc.hasHeadPoint = false;
          acc.point.copy(this._hitPoint);
        }
        if (acc) {
          acc.amount += dealt;
          if (h.isHead && !blocked) {
            acc.isHeadshot = true;
            acc.hasHeadPoint = true;
            acc.point.copy(this._hitPoint);
          } else if (!acc.hasHeadPoint) {
            acc.point.copy(this._hitPoint);
          }
          if (killed) acc.killed = true;
          if (!blocked) acc.blockedByShield = false;
        }

        if (!weapon.piercing) {
          stoppedOnEntity = true;
          stopDist = h.dist;
          break;
        }
      }

      // 5. Wall impact & tracer endpoint
      if (!stoppedOnEntity) {
        if (wallHit) {
          this.vfxManager.spawnImpact(wallHit.point, wallHit.normal, weapon.tracerColor, 'wall');
          this._tracerEnd.copy(wallHit.point);
        } else {
          this._tracerEnd.copy(this._eyePos).addScaledVector(this._rayDir, weapon.range);
        }
      } else {
        this._tracerEnd.copy(this._eyePos).addScaledVector(this._rayDir, stopDist);
      }

      // Guard against backwards tracer when target is point-blank inside muzzle depth
      const muzzleToImpactSq = this._tracerEnd.distanceToSquared(this._worldMuzzlePos);
      if (muzzleToImpactSq > 0.04) {
        const ocLv = this.weaponOverclock[this.currentIndex] || 0;
        const tColor =
          ocLv >= 3 ? 0xffd700 : ocLv === 2 ? 0xc084fc : ocLv === 1 ? 0x38bdf8 : weapon.tracerColor;
        const tWidth = weapon.tracerWidth * (1 + ocLv * 0.35);
        this.vfxManager.spawnTracer(
          this._worldMuzzlePos,
          this._tracerEnd,
          tColor,
          tWidth,
          isRailgun || ocLv >= 2
        );
      }
    }

    // Emit consolidated DAMAGE_DEALT events per target hit this shot
    for (let a = 0; a < accumCount; a++) {
      const acc = this._shotAccum[a];
      this._damagePayload.amount = acc.amount;
      this._damagePayload.point.copy(acc.point);
      this._damagePayload.isHeadshot = acc.isHeadshot;
      this._damagePayload.killed = acc.killed;
      this._damagePayload.blockedByShield = acc.blockedByShield;
      this._damagePayload.targetId = acc.entity.id;
      this._damagePayload.isEnemy = Boolean(acc.entity.isEnemy);
      this._damagePayload.weaponId = weapon.id;
      this._damagePayload.isMelee = false;
      this.eventBus.emit(EVENTS.DAMAGE_DEALT, this._damagePayload);

      // T-4 Arc Rivet: apply 4s +25% damage vulnerability mark
      if (weapon.marksTarget && acc.entity && acc.entity.isEnemy && acc.entity.isAlive) {
        acc.entity.markedTimer = 4.0;
      }

      // Precision Refund card: +ammo on kill
      if (acc.killed && acc.entity && acc.entity.isEnemy && mods && mods.killAmmoRefund > 0) {
        ammoState.ammo = Math.min(weapon.magSize, ammoState.ammo + mods.killAmmoRefund);
        this._updateAmmoBar(rig, ammoState.ammo, weapon.magSize, 1.0);
      }

      // Assault 2-Card Synergy: Headshot triggers 4m kinetic blast (+35 AoE damage)
      if (acc.isHeadshot && mods && mods.synergyAssault && targets && targets.length > 0) {
        this.vfxManager.spawnExplosion(acc.point, 2.6, 0xf59e0b);
        for (let k = 0; k < targets.length; k++) {
          const other = targets[k];
          if (!other || other === acc.entity || !other.isAlive || !other.isEnemy) continue;
          const distSq = other.position.distanceToSquared(acc.point);
          if (distSq <= 16.0) {
            other.applyDamage(35, other.center, false, null, { isExplosion: true });
          }
        }
      }
    }

    // 6. Camera Recoil, Screen Shake & 1P Mechanical Kickback ("손맛"!)
    const yawKick = (Math.random() - 0.5) * 2.0 * weapon.recoilYaw;
    pc.addRecoil(weapon.recoilPitch, yawKick, weapon.recoilRecovery);
    pc.addScreenShake(weapon.cameraShake);

    const adsKickScale = isAds ? 0.55 : 1.0;
    const isHeavy = weapon.id === 'scattergun' || weapon.id === 'railgun';
    this._recoilZVel += (isHeavy ? 1.55 : 0.82) * adsKickScale;
    this._recoilPitchVel += (isHeavy ? 3.8 : 1.55) * adsKickScale;
    this._recoilRollVel += (Math.random() - 0.5) * (isHeavy ? 3.4 : 1.6) * adsKickScale;
    this._emissiveFlare = 1.0;

    // Trigger reciprocating bolt blowback (or delayed shotgun pump cycle)
    if (rig.pumpLinkedLeftHand) {
      this._pumpDelay = 0.11;
      this._pumpActive = true;
      this._pumpTimer = 0;
    } else {
      this._boltState = 1.0;
    }

    // Emit WEAPON_FIRED event
    this._firedPayload.weaponId = weapon.id;
    this._firedPayload.slot = weapon.slot;
    this._firedPayload.ammo = ammoState.ammo;
    this._firedPayload.reserve = ammoState.reserve;
    this._firedPayload.magSize = weapon.magSize;
    this._firedPayload.color = weapon.color;
    this._firedPayload.isAds = isAds;
    this._firedPayload.muzzleWorldPos = this._worldMuzzlePos;
    this.eventBus.emit(EVENTS.WEAPON_FIRED, this._firedPayload);
  }

  // ---------------------------------------------------------------------------
  // Spring-Damped 1P Procedural Animation State Machine
  // ---------------------------------------------------------------------------

  /** @private */
  _updateViewmodelAnimation(dt, weapon, rig, ammoState, wantsAds) {
    const pc = this.playerController;
    const adsEase = this._adsProgress * this._adsProgress * (3 - 2 * this._adsProgress);
    const hipWeight = 1 - adsEase * 0.88;

    // 1. Mouse-lag look sway derived directly from PlayerController yaw/pitch (zero InputManager conflict!)
    if (pc && dt > 0) {
      const dYaw = wrapAngle(pc.yaw - this._prevYaw);
      const dPitch = pc.pitch - this._prevPitch;
      this._prevYaw = pc.yaw;
      this._prevPitch = pc.pitch;

      const targetSwayX = clamp(-dYaw * 0.55, -0.055, 0.055) * hipWeight;
      const targetSwayY = clamp(-dPitch * 0.45, -0.045, 0.045) * hipWeight;
      const targetSwayRoll = clamp(dYaw * 1.45, -0.14, 0.14) * hipWeight;

      const swaySmooth = 1 - Math.exp(-12 * dt);
      this._swayX += (targetSwayX - this._swayX) * swaySmooth;
      this._swayY += (targetSwayY - this._swayY) * swaySmooth;
      this._swayRoll += (targetSwayRoll - this._swayRoll) * swaySmooth;

      // Landing bounce spring
      if (!this._wasGrounded && pc.isGrounded) {
        this._landBounceVel -= 0.42;
      }
      this._wasGrounded = pc.isGrounded;

      const lbAcc = -180 * this._landBounce - 18 * this._landBounceVel;
      this._landBounceVel += lbAcc * dt;
      this._landBounce += this._landBounceVel * dt;

      // Airborne vertical velocity inertia
      const targetAir = pc.isGrounded ? 0 : clamp(-pc.velocity.y * 0.0038, -0.045, 0.045);
      this._airInertiaY += (targetAir - this._airInertiaY) * (1 - Math.exp(-10 * dt));

      // Sprint & slide tactical stance blends
      const isFiringNow = this._fireCooldown > 0 && this.input.isDown('fire');
      const sprintTarget =
        pc.isSprinting && !wantsAds && !this._isReloading && !this._isSwapping && !isFiringNow ? 1 : 0;
      const slideTarget = pc.isSliding && !this._isReloading ? 1 : 0;
      this._sprintBlend += (sprintTarget - this._sprintBlend) * (1 - Math.exp(-10 * dt));
      this._slideBlend += (slideTarget - this._slideBlend) * (1 - Math.exp(-11 * dt));
    }

    // 2. Second-order spring dampers for shot recoil kickback (Z, pitch, micro-roll)
    if (dt > 0) {
      const zAcc = -340 * this._recoilZ - 24 * this._recoilZVel;
      this._recoilZVel += zAcc * dt;
      this._recoilZ = clamp(this._recoilZ + this._recoilZVel * dt, -0.02, wantsAds ? 0.036 : 0.075);

      const pAcc = -280 * this._recoilPitch - 22 * this._recoilPitchVel;
      this._recoilPitchVel += pAcc * dt;
      this._recoilPitch = clamp(this._recoilPitch + this._recoilPitchVel * dt, -0.10, 0.24);

      const rAcc = -220 * this._recoilRoll - 18 * this._recoilRollVel;
      this._recoilRollVel += rAcc * dt;
      this._recoilRoll = clamp(this._recoilRoll + this._recoilRollVel * dt, -0.16, 0.16);
    }

    // 3. Base Hip <-> ADS Position Interpolation (exact {x, y, z} alignment!)
    const hip = weapon.viewmodelOffset;
    const ads = weapon.adsOffset;
    let posX = hip.x + (ads.x - hip.x) * adsEase;
    let posY = hip.y + (ads.y - hip.y) * adsEase;
    let posZ = hip.z + (ads.z - hip.z) * adsEase;

    let rotX = 0;
    let rotY = 0;
    let rotZ = 0;

    // 4. Breathing Figure-8 Idle + Grounded Walk/Sprint Locomotion Bob
    const idleScale = (1 - adsEase * 0.90);
    posX += Math.sin(this._idleTime * 1.45) * 0.0032 * idleScale;
    posY += Math.sin(this._idleTime * 2.90) * 0.0024 * idleScale;
    rotZ += Math.cos(this._idleTime * 1.45) * 0.008 * idleScale;

    if (pc && pc.isGrounded && !pc.isSliding && !pc.isDashing && pc.speed > 1.0) {
      const spdNorm = clamp(pc.speed / PLAYER_CONFIG.walkSpeed, 0, 1.35);
      const bobT = pc.headBobTime;
      const bobAmp = (1 - adsEase * 0.88) * spdNorm * (1 + this._sprintBlend * 0.65);
      posX += Math.cos(bobT * 0.5) * 0.011 * bobAmp;
      posY += Math.abs(Math.sin(bobT * 0.5)) * -0.012 * bobAmp;
      rotZ += Math.cos(bobT * 0.5) * 0.022 * bobAmp;
    }

    // Apply mouse-lag sway, airborne inertia, landing dip, and recoil kickback
    posX += this._swayX;
    posY += this._swayY + (this._airInertiaY + this._landBounce) * hipWeight;
    posZ += this._recoilZ;
    rotX += this._recoilPitch + this._swayY * 1.4;
    rotY += this._swayX * 1.8;
    rotZ += this._swayRoll + this._recoilRoll;

    // 5. Sprint Tactical Lowered Angle & Slide Tactical Cant
    if (this._sprintBlend > 0.001) {
      const sb = this._sprintBlend * (1 - adsEase);
      posX -= 0.045 * sb;
      posY -= 0.052 * sb;
      posZ += 0.022 * sb;
      rotX -= 0.16 * sb;
      rotY += 0.42 * sb;
      rotZ += 0.22 * sb;
    }

    if (this._slideBlend > 0.001) {
      const slb = this._slideBlend * (1 - adsEase * 0.78);
      posX -= 0.032 * slb;
      posY -= 0.024 * slb;
      rotZ += 0.38 * slb; // Iconic Titanfall/Apex tactical slide cant!
      rotY += 0.08 * slb;
    }

    // 6. Multi-Stage Reload Animation (Tilts Weapon, Drops & Slaps Magazine, Racks Bolt)
    if (this._isReloading) {
      const p = clamp(this._reloadTimer / weapon.reloadTime, 0, 1);
      const tiltIn = smoothstep(0.0, 0.18, p);
      const tiltOut = 1 - smoothstep(0.84, 1.0, p);
      const tilt = tiltIn * tiltOut;

      posX -= 0.065 * tilt;
      posY -= 0.028 * tilt;
      posZ += 0.032 * tilt;
      rotX += 0.24 * tilt;
      rotY += 0.28 * tilt;
      rotZ -= 0.46 * tilt;

      // Animate magazine ejection (stage 1), hidden swap (stage 2), punchy slap-in (stage 3)
      let magDrop = 0;
      let magPitch = 0;
      if (p < 0.30) {
        const t1 = smoothstep(0.10, 0.30, p);
        magDrop = t1 * 0.30;
        magPitch = t1 * 0.35;
      } else if (p < 0.60) {
        magDrop = 0.34;
        magPitch = 0.40;
      } else if (p < 0.79) {
        const t3 = smoothstep(0.60, 0.79, p);
        magDrop = (1 - t3) * 0.34;
        magPitch = (1 - t3) * 0.40;
      }

      rig.magazineGroup.position.set(
        rig.magRestPos.x,
        rig.magRestPos.y - magDrop,
        rig.magRestPos.z + magDrop * 0.15
      );
      rig.magazineGroup.rotation.set(
        rig.magRestRot.x + magPitch,
        rig.magRestRot.y,
        rig.magRestRot.z
      );

      // Animate left cyber-hand gripping mag out, slapping fresh mag in, then racking bolt!
      if (p < 0.79) {
        const grab = smoothstep(0.05, 0.16, p) * (1 - smoothstep(0.75, 0.84, p));
        rig.leftHand.position.set(
          rig.leftHandRestPos.x + 0.025 * grab,
          rig.leftHandRestPos.y - 0.11 * grab - magDrop * 0.65,
          rig.leftHandRestPos.z + 0.19 * grab
        );
      } else {
        // Stage 4: rack charging handle / bolt
        const rackT = clamp((p - 0.81) / 0.14, 0, 1);
        const rackCurve = Math.sin(rackT * Math.PI);
        rig.boltMesh.position.z = rig.boltRestPos.z + rackCurve * rig.boltKickDist;
        const reach = Math.sin(clamp((p - 0.79) / 0.21, 0, 1) * Math.PI);
        rig.leftHand.position.set(
          rig.leftHandRestPos.x - 0.015 * reach,
          rig.leftHandRestPos.y + 0.065 * reach,
          rig.leftHandRestPos.z + 0.14 * reach + rackCurve * rig.boltKickDist
        );
      }
    } else if (dt > 0) {
      // 7. Reciprocating Bolt Blowback & Scattergun Pump Forend Stroke
      if (rig.pumpLinkedLeftHand && this._pumpActive) {
        if (this._pumpDelay > 0) {
          this._pumpDelay -= dt;
        } else {
          this._pumpTimer += dt;
          const pumpDur = 0.27;
          const pt = clamp(this._pumpTimer / pumpDur, 0, 1);
          const stroke = Math.pow(Math.sin(pt * Math.PI), 1.25);
          const zOff = stroke * rig.boltKickDist;
          rig.boltMesh.position.z = rig.boltRestPos.z + zOff;
          rig.leftHand.position.set(
            rig.leftHandRestPos.x,
            rig.leftHandRestPos.y,
            rig.leftHandRestPos.z + zOff
          );
          // Subtle authoritative pump cadence tilt on shotgun chassis
          rotZ -= stroke * 0.065 * hipWeight;
          rotX += stroke * 0.045 * hipWeight;

          if (this._pumpTimer >= pumpDur) {
            this._pumpActive = false;
            rig.boltMesh.position.copy(rig.boltRestPos);
            rig.leftHand.position.copy(rig.leftHandRestPos);
          }
        }
      } else {
        this._boltState *= Math.exp(-26 * dt);
        rig.boltMesh.position.z = rig.boltRestPos.z + this._boltState * rig.boltKickDist;
      }
    }

    // 8. Weapon Swap Holster/Draw Dip & Quick Melee Conceal Dip
    if (this._isSwapping) {
      const sp = clamp(this._swapTimer / this._swapDuration, 0, 1);
      let dip = 0;
      if (sp < 0.45) {
        dip = smoothstep(0, 0.45, sp);
      } else {
        const up = smoothstep(0.45, 1.0, sp);
        // Subtle crisp draw-overshoot settle
        dip = (1 - up) - Math.sin(up * Math.PI) * 0.06;
      }
      posY -= dip * 0.36;
      posZ += dip * 0.06;
      rotX -= dip * 0.82;
      rotZ -= dip * 0.24;
    }

    if (this._isMeleeing) {
      const mt = clamp(this._meleeTimer / this._meleeDuration, 0, 1);
      const meleeDip = Math.sin(mt * Math.PI);
      posY -= meleeDip * 0.42;
      posX += meleeDip * 0.16;
      rotX -= meleeDip * 0.72;
    }

    // Apply final smooth transform to active weapon rig root
    rig.root.position.set(posX, posY, posZ);
    rig.root.rotation.set(rotX, rotY, rotZ);

    // Hide 3D HV-7 Rail Lance rig while 2D #railgun-scope overlay is active
    // so the 3D scope tube never blocks the zoomed sight picture.
    const hideForScope =
      weapon.id === 'railgun' &&
      this._adsProgress > 0.45 &&
      !this._isReloading &&
      !this._isSwapping &&
      !this._isMeleeing;
    rig.root.visible = !hideForScope;

    // 9. Pulse Emissive Charge Coils / Vents / Plasma Reservoir & Reticle Clarity
    const pulse = 0.16 * Math.sin(this._idleTime * 4.2);
    const baseEmissive = weapon.id === 'railgun'
      ? 0.45 + 2.35 * this._railRecharge * this._railRecharge
      : 2.45;
    const emissiveInt = baseEmissive + pulse + this._emissiveFlare * 2.6;
    for (let i = 0; i < rig.chargeEmissives.length; i++) {
      rig.chargeEmissives[i].emissiveIntensity = emissiveInt;
    }

    // Keep holographic reticle ultra-bright in ADS and crisply visible in hipfire
    if (rig.reticleMesh && rig.reticleMesh.material) {
      rig.reticleMesh.material.opacity = 0.72 + adsEase * 0.28;
    }

    // Low-ammo subtle warning pulse on diegetic LEDs
    if (!this._isReloading && ammoState.ammo > 0 && ammoState.ammo <= Math.ceil(weapon.magSize * 0.25)) {
      const warnPulse = 1.6 + 1.4 * Math.abs(Math.sin(this._idleTime * 9.5));
      this._updateAmmoBar(rig, ammoState.ammo, weapon.magSize, warnPulse / 2.6);
    }
  }

  /** @private */
  _resetMechanicalParts(rig) {
    rig.boltMesh.position.copy(rig.boltRestPos);
    rig.magazineGroup.position.copy(rig.magRestPos);
    rig.magazineGroup.rotation.copy(rig.magRestRot);
    rig.leftHand.position.copy(rig.leftHandRestPos);
    rig.leftHand.rotation.copy(rig.leftHandRestRot);
  }

  /**
   * Update individual glowing LED segments on the weapon's diegetic ammo display.
   * @private
   */
  _updateAmmoBar(rig, ammo, magSize, intensityScale = 1.0) {
    const segs = rig.ammoBarSegments;
    if (!segs || segs.length === 0) return;

    const ratio = magSize > 0 ? ammo / magSize : 0;
    const litCount = ammo > 0 ? Math.max(1, Math.ceil(ratio * segs.length)) : 0;
    const isLow = ammo > 0 && ratio <= 0.25;

    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i];
      const mat = seg.material;
      if (i < litCount) {
        if (isLow) {
          mat.color.copy(this._warnColor);
          mat.emissive.copy(this._warnColor);
        } else {
          this._tmpColor.setHex(seg.userData.baseColor ?? 0xf59e0b);
          mat.color.copy(this._tmpColor);
          mat.emissive.copy(this._tmpColor);
        }
        mat.emissiveIntensity = 2.6 * intensityScale;
      } else {
        mat.color.copy(this._dimColor);
        mat.emissive.copy(this._dimColor);
        mat.emissiveIntensity = 0.08;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Ammo Supply, Query Snapshot, Reset & Disposal
  // ---------------------------------------------------------------------------

  /**
   * Refill reserve ammo across all 4 weapons by a fraction of maxReserve (default 50%).
   * @param {number} [fraction=0.5]
   * @returns {number} Total rounds added across arsenal
   */
  addAmmo(fraction = 0.5) {
    const frac = clamp(Number.isFinite(fraction) ? fraction : 0.5, 0, 2);
    let totalAdded = 0;

    for (let i = 0; i < WEAPONS.length; i++) {
      const w = WEAPONS[i];
      const st = this._ammoStates[i];
      const gain = Math.max(w.magSize, Math.ceil(w.maxReserve * frac));
      const before = st.reserve;
      st.reserve = Math.min(w.maxReserve, st.reserve + gain);
      totalAdded += st.reserve - before;
    }

    return totalAdded;
  }

  /**
   * Return a zero-allocation snapshot of the currently equipped weapon state for HUD consumers.
   */
  getActiveWeapon() {
    return WEAPONS[this.currentIndex] || WEAPONS[0];
  }

  getCurrentWeaponState() {
    const w = WEAPONS[this.currentIndex];
    const st = this._ammoStates[this.currentIndex];
    const s = this._stateSnapshot;

    s.index = this.currentIndex;
    s.id = w.id;
    s.name = w.name;
    s.shortName = w.shortName;
    s.slot = w.slot;
    s.role = w.role;
    s.color = w.color;
    s.colorCss = w.colorCss;
    s.ammo = st.ammo;
    s.magSize = w.magSize;
    s.reserve = st.reserve;
    s.heat = st.heat || 0;
    s.overheated = Boolean(st.overheated);
    s.mech = w.mech || null;
    s.noReload = Boolean(w.noReload);
    s.maxReserve = w.maxReserve;
    s.isReloading = this._isReloading;
    s.reloadProgress = this._isReloading ? clamp(this._reloadTimer / w.reloadTime, 0, 1) : 0;
    s.isSwapping = this._isSwapping;
    s.isAds = this._adsProgress > 0.25;
    s.adsProgress = this._adsProgress;
    s.isMeleeing = this._isMeleeing;
    s.meleeCooldown = this._meleeCooldown;
    s.weapon = w;
    return s;
  }

  /**
   * Reset all weapons, ammo pools, animations, and active slot cleanly for a new match.
   */
  /**
   * Build 3-tier modular 3D Overclock visual attachments directly on each weapon rig:
   * - Tier 1 (+1): Muzzle Compensator & glowing amber heat vents at muzzleAnchor
   * - Tier 2 (+2): Twin Side Induction Energy Rails & Reinforced Mag Collar
   * - Tier 3 (+3 MAX): Aether Prime Spine Crown & Molten-Gold Overclock Fins
   * @private
   */
  _buildOverclockAttachments(rig, w) {
    const geos = [];
    const mats = [];
    const trackGeo = (g) => { geos.push(g); return g; };
    const trackMat = (m) => { mats.push(m); return m; };

    const isSecondary = w && w.category === 'secondary';
    const s = isSecondary ? 0.72 : 1.0;
    const accentHex = (w && w.color) || 0xf59e0b;

    const steelMat = trackMat(new THREE.MeshStandardMaterial({
      color: 0x2c3035,
      metalness: 0.82,
      roughness: 0.28,
    }));
    const goldMat = trackMat(new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: new THREE.Color(0x92400e),
      emissiveIntensity: 0.45,
      metalness: 0.88,
      roughness: 0.22,
    }));
    const glowMat1 = trackMat(new THREE.MeshStandardMaterial({
      color: accentHex,
      emissive: new THREE.Color(accentHex),
      emissiveIntensity: 2.2,
      metalness: 0.2,
      roughness: 0.2,
    }));
    const glowMat3 = trackMat(new THREE.MeshStandardMaterial({
      color: 0xfef08a,
      emissive: new THREE.Color(0xf97316),
      emissiveIntensity: 3.1,
      metalness: 0.2,
      roughness: 0.15,
    }));

    const mz = rig.muzzleAnchor ? rig.muzzleAnchor.position : new THREE.Vector3(0, 0.04, -0.45);

    // Tier 1: Muzzle Compensator + Vent Glow
    const tier1 = new THREE.Group();
    const brakeGeo = trackGeo(new THREE.BoxGeometry(0.052 * s, 0.048 * s, 0.11 * s));
    const brake = new THREE.Mesh(brakeGeo, steelMat);
    brake.position.set(mz.x, mz.y, mz.z + 0.03 * s);
    const ventGeo = trackGeo(new THREE.BoxGeometry(0.058 * s, 0.012 * s, 0.075 * s));
    const vent = new THREE.Mesh(ventGeo, glowMat1);
    vent.position.set(mz.x, mz.y + 0.008 * s, mz.z + 0.03 * s);
    tier1.add(brake, vent);
    tier1.visible = false;
    rig.root.add(tier1);

    // Tier 2: Twin Side Induction Energy Rails + Copper Coils
    const tier2 = new THREE.Group();
    const railLen = isSecondary ? 0.22 : 0.36;
    const railGeo = trackGeo(new THREE.BoxGeometry(0.012 * s, 0.016 * s, railLen));
    const coilGeo = trackGeo(new THREE.BoxGeometry(0.018 * s, 0.024 * s, 0.022 * s));
    const railZ = mz.z + railLen * 0.55 + 0.06 * s;
    const railX = isSecondary ? 0.036 : 0.048;
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(railGeo, glowMat1);
      rail.position.set(side * railX, mz.y - 0.006 * s, railZ);
      tier2.add(rail);
      for (let c = 0; c < 3; c++) {
        const coil = new THREE.Mesh(coilGeo, goldMat);
        coil.position.set(side * (railX + 0.003), mz.y - 0.006 * s, railZ - railLen * 0.32 + c * (railLen * 0.32));
        tier2.add(coil);
      }
    }
    tier2.visible = false;
    rig.root.add(tier2);

    // Tier 3 (MAX): Aether Prime Spine Crown & Molten Gold Fins
    const tier3 = new THREE.Group();
    const finGeo = trackGeo(new THREE.BoxGeometry(0.009 * s, 0.034 * s, 0.065 * s));
    const coreBarGeo = trackGeo(new THREE.BoxGeometry(0.024 * s, 0.012 * s, railLen * 0.78));
    const coreBar = new THREE.Mesh(coreBarGeo, glowMat3);
    coreBar.position.set(0, mz.y + 0.044 * s, railZ + 0.04 * s);
    tier3.add(coreBar);
    for (const side of [-1, 1]) {
      for (let f = 0; f < 2; f++) {
        const fin = new THREE.Mesh(finGeo, goldMat);
        fin.position.set(side * (railX * 0.72), mz.y + 0.042 * s, railZ - 0.05 * s + f * 0.11 * s);
        fin.rotation.z = side * -0.42;
        tier3.add(fin);
      }
    }
    tier3.visible = false;
    rig.root.add(tier3);

    return {
      tier1,
      tier2,
      tier3,
      glowMat1,
      glowMat3,
      dispose() {
        for (let i = 0; i < geos.length; i++) geos[i].dispose();
        for (let i = 0; i < mats.length; i++) mats[i].dispose();
      },
    };
  }

  /** @private */
  _applyOverclockVisual(idx) {
    const rig = this._rigs[idx];
    if (!rig || !rig.overclockRig) return;
    const lv = this.weaponOverclock[idx] || 0;
    rig.overclockRig.tier1.visible = lv >= 1;
    rig.overclockRig.tier2.visible = lv >= 2;
    rig.overclockRig.tier3.visible = lv >= 3;
    if (rig.chargeEmissives && rig.chargeEmissives.length) {
      const boost = 1.0 + lv * 0.45;
      for (let i = 0; i < rig.chargeEmissives.length; i++) {
        rig.chargeEmissives[i].emissiveIntensity = Math.min(4.2, 2.0 * boost);
      }
    }
  }

  reset() {
    for (let i = 0; i < WEAPONS.length; i++) {
      const w = WEAPONS[i];
      this._ammoStates[i].ammo = w.mech === 'heat' ? 0 : w.magSize;
      this._ammoStates[i].reserve = w.maxReserve;
      this._ammoStates[i].heat = 0;
      this._ammoStates[i].overheated = false;
      this._ammoStates[i].regenTimer = 0;
      this._rigs[i].root.visible = i === 0;
      this._resetMechanicalParts(this._rigs[i]);
      this._updateAmmoBar(this._rigs[i], w.magSize, w.magSize, 1.0);
    }

    this.equippedPrimaryIndex = 0;
    this.equippedSecondaryIndex = 4;
    this.activeLoadoutSlot = 0;
    this.currentIndex = 0;
    this._pendingIndex = -1;
    this.weaponOverclock = new Array(WEAPONS.length).fill(0);
    for (let i = 0; i < WEAPONS.length; i++) {
      this._applyOverclockVisual(i);
    }
    this._fireCooldown = 0;
    this._wasFireDown = false;
    this._semiFireBuffer = 0;
    this._spreadBloom = 0;
    this._adsProgress = 0;

    this._isReloading = false;
    this._reloadTimer = 0;
    this._reloadSlapTriggered = false;

    this._isSwapping = false;
    this._swapTimer = 0;
    this._swapSwitched = false;

    this._isMeleeing = false;
    this._meleeTimer = 0;
    this._meleeCooldown = 0;
    this._meleeHitProcessed = false;
    this._meleeRig.root.visible = false;

    this._swayX = 0;
    this._swayY = 0;
    this._swayRoll = 0;
    this._sprintBlend = 0;
    this._slideBlend = 0;
    this._airInertiaY = 0;
    this._landBounce = 0;
    this._landBounceVel = 0;

    this._recoilZ = 0;
    this._recoilZVel = 0;
    this._recoilPitch = 0;
    this._recoilPitchVel = 0;
    this._recoilRoll = 0;
    this._recoilRollVel = 0;

    this._boltState = 0;
    this._pumpDelay = 0;
    this._pumpTimer = 0;
    this._pumpActive = false;
    this._emissiveFlare = 0;
    this._railRecharge = 1.0;

    if (this.playerController) {
      this._prevYaw = this.playerController.yaw;
      this._prevPitch = this.playerController.pitch;
      this._wasGrounded = this.playerController.isGrounded;
      this.playerController.isAds = false;
    }

    const w0 = WEAPONS[0];
    this._rigs[0].root.position.set(
      w0.viewmodelOffset.x,
      w0.viewmodelOffset.y,
      w0.viewmodelOffset.z
    );
    this._rigs[0].root.rotation.set(0, 0, 0);

    this._switchedPayload.index = 0;
    this._switchedPayload.weapon = w0;
    this._switchedPayload.ammo = w0.magSize;
    this._switchedPayload.reserve = w0.maxReserve;
    this._switchedPayload.magSize = w0.magSize;
    this.eventBus.emit(EVENTS.WEAPON_SWITCHED, this._switchedPayload);
  }

  /**
   * Dispose all weapon rigs, melee rig, procedural PBR assets, and detach from viewmodelScene.
   */
  dispose() {
    for (let i = 0; i < this._rigs.length; i++) {
      this._rigContainer.remove(this._rigs[i].root);
      this._rigs[i].dispose();
    }
    this._rigs.length = 0;

    this.viewmodelScene.remove(this._rigContainer);
    this.viewmodelScene.remove(this._meleeRig.root);
    this._meleeRig.dispose();
    if (this._unsubSlideReload) this._unsubSlideReload();
    if (this._unsubDashReload) this._unsubDashReload();
    this._factory.dispose();
  }
}
  __exports.WeaponSystem = WeaponSystem;
});
