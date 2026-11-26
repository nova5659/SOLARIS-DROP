// Module: src/player/PlayerController.js
__define("src/player/PlayerController.js", (__exports, __require) => {
const { PLAYER_CONFIG, EVENTS } = __require("src/config/constants.js");

const DEG2RAD = Math.PI / 180;
const TWO_PI = Math.PI * 2;
const MAX_PITCH = 88 * DEG2RAD;
const MAX_FINAL_PITCH = 89 * DEG2RAD;
const DEFAULT_RECOIL_RECOVERY = 11.5;

function wrapAngle(angle) {
  let a = angle;
  while (a > Math.PI) a -= TWO_PI;
  while (a < -Math.PI) a += TWO_PI;
  return a;
}

/**
 * Hyper-fluid AAA 3C First-Person PlayerController for NEON PROTOCOL.
 * Features ground/air Quake-Titanfall projection momentum control, coyote time,
 * jump buffering, double jump, crouch-sliding with camera roll & slide-jump carry,
 * full-capsule headroom crouch retention, 2-charge directional omni-dash with FOV
 * kick, jump pads, per-weapon recoil spring, trauma screen shake, shield regen,
 * kill shield siphon, and soft magnetic touch aim-assist.
 *
 * Strictly zero heap allocations inside update(dt).
 */
class PlayerController {
  /**
   * @param {THREE.PerspectiveCamera} camera
   * @param {import('../core/InputManager.js').InputManager} input
   * @param {import('../physics/CollisionWorld.js').CollisionWorld} collisionWorld
   * @param {import('../core/EventBus.js').EventBus} eventBus
   */
  constructor(camera, input, collisionWorld, eventBus) {
    this.camera = camera;
    this.input = input;
    this.collisionWorld = collisionWorld;
    this.eventBus = eventBus;

    // Public 3C & Combat State
    this.position = new THREE.Vector3(0, 0, 0); // Feet world position
    this.velocity = new THREE.Vector3(0, 0, 0);
    this.yaw = 0;
    this.pitch = 0;

    this.maxHealth = PLAYER_CONFIG.maxHealth + (this.mods ? this.mods.maxHealthBonus : 0);
    this.health = this.maxHealth;
    this.maxShield = PLAYER_CONFIG.maxShield + (this.mods ? this.mods.maxShieldBonus : 0);
    this.shield = this.maxShield;
    this.inZoneBuff = false;
    this.dashOverdriveTimer = 0;
    this.reactiveArmorTimer = 0;
    this.maxGuardEnergy = 100;
    this.guardEnergy = 100;
    this.isGuarding = false;
    this.guardBreakTimer = 0;
    this.guardHitFlash = 0;
    this._guardRegenDelay = 0;
    this.ultCharge = 0;
    this.ultActiveTimer = 0;
    this.ultInvulnTimer = 0;
    this.timeSlowTimer = 0;
    this.ultDamageMult = 1.0;
    this.phaseInvulnTimer = 0;
    this.reloadBuffTimer = 0;
    this.hyperBarrageTimer = 0;
    this._guardCheckVec = new THREE.Vector3();
    this.isAlive = true;

    this.isGrounded = false;
    this.isSprinting = false;
    this.isCrouching = false;
    this.isSliding = false;
    this.isDashing = false;
    this.isAds = false;

    this.dashCharges = PLAYER_CONFIG.dashMaxCharges;
    this.dashCooldownProgress = 1.0;

    this.currentHeight = PLAYER_CONFIG.standHeight;
    this.headBobTime = 0;
    this.speed = 0;
    this.currentFov = PLAYER_CONFIG.baseFov;
    this.cameraRoll = 0;

    // Step 2: Meta + Roguelike Tactical Card & Synergy Modifiers
    this.inZoneBuff = false;
    this.dashOverdriveTimer = 0;
    this.reactiveArmorTimer = 0;
    this.maxGuardEnergy = (this.mods && this.mods.guardMax) || 100;
    this.guardEnergy = this.maxGuardEnergy;
    this.isGuarding = false;
    this.guardBreakTimer = 0;
    this.guardHitFlash = 0;
    this._guardRegenDelay = 0;
    this.ultCharge = 0;
    this.ultActiveTimer = 0;
    this.ultInvulnTimer = 0;
    this.timeSlowTimer = 0;
    this.ultDamageMult = 1.0;
    this.phaseInvulnTimer = 0;
    this.reloadBuffTimer = 0;
    this.hyperBarrageTimer = 0;
    this.mods = this._defaultMods();

    // Internal locomotion & timers
    this._coyoteTimer = 0;
    this._jumpBufferTimer = 0;
    this._doubleJumpAvailable = true;

    this._slideTimer = 0;
    this._slideCooldown = 0;
    this._slideRollSign = -1;
    this._slideDir = new THREE.Vector3(0, 0, -1);

    this._dashTimer = 0;
    this._dashRechargeTimer = 0;
    this._dashDir = new THREE.Vector3(0, 0, -1);

    this._timeSinceDamaged = PLAYER_CONFIG.shieldRegenDelay;
    this._wasGrounded = false;
    this._justLanded = false;
    this._footstepArmed = true;

    // Camera juice: landing dip, per-weapon recoil spring, trauma screen shake
    this._landDip = 0;
    this._landDipVel = 0;
    this._recoilPitch = 0;
    this._recoilPitchTarget = 0;
    this._recoilYaw = 0;
    this._recoilYawTarget = 0;
    this._recoilRecovery = DEFAULT_RECOIL_RECOVERY;
    this._shakeTrauma = 0;
    this._shakeTime = 0;

    // Pre-allocated scratch vectors & payloads (zero-GC update loop)
    this._forward = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._wishDir = new THREE.Vector3();
    this._eyePos = new THREE.Vector3();
    this._lookDir = new THREE.Vector3();
    this._toTarget = new THREE.Vector3();
    this._shakeOut = { pitch: 0, yaw: 0, roll: 0 };

    this._footstepPayload = { speed: 0, sprinting: false, isLanding: false, position: this.position };
    this._jumpPayload = { isDoubleJump: false, position: this.position };
    this._slidePayload = { position: this.position, velocity: this.velocity };
    this._dashPayload = { direction: this._dashDir, position: this.position, chargesRemaining: 0 };
    this._jumpPadPayload = { position: this.position, pad: null };

    this._snapshot = {
      position: this.position,
      velocity: this.velocity,
      yaw: 0,
      pitch: 0,
      health: this.health,
      maxHealth: this.maxHealth,
      shield: this.shield,
      maxShield: this.maxShield,
      isAlive: true,
      isGrounded: false,
      isSprinting: false,
      isCrouching: false,
      isSliding: false,
      isDashing: false,
      isAds: false,
      dashCharges: this.dashCharges,
      maxDashCharges: PLAYER_CONFIG.dashMaxCharges,
      dashCooldownProgress: 1,
      speed: 0,
      currentFov: this.currentFov,
      cameraRoll: 0,
    };

    this.camera.rotation.order = 'YXZ';
  }

  /**
   * Reset player transform, health/shield, abilities, and camera feel for a new match/spawn.
   * @param {THREE.Vector3|{x:number,y:number,z:number}} spawnPos
   * @param {number} [yaw=0]
   */
  _defaultMods() {
    return {
      damageMult: 1.0,
      headshotBonus: 0.0,
      reloadSpeedMult: 1.0,
      fireRateMult: 1.0,
      moveSpeedMult: 1.0,
      dashCooldownMult: 1.0,
      shieldRegenMult: 1.0,
      killShieldBonus: 0,
      maxHealthBonus: 0,
      maxShieldBonus: 0,
      killAmmoRefund: 0,
      slideReload: false,
      airDamageBonus: 0.0,
      zoneRegenHp: 0,
      zoneDamageBonus: 0.0,
      reactiveArmor: false,
      synergyAssault: false,
      synergyMobility: false,
      synergyVanguard: false,
    };
  }

  applyModifiers(nextMods, refillVitals = false) {
    this.mods = Object.assign(this._defaultMods(), nextMods || {});
    const prevMaxHp = this.maxHealth;
    const prevMaxSh = this.maxShield;
    this.maxHealth = PLAYER_CONFIG.maxHealth + this.mods.maxHealthBonus;
    this.maxShield = PLAYER_CONFIG.maxShield + this.mods.maxShieldBonus;
    const prevMaxG = this.maxGuardEnergy || 100;
    this.maxGuardEnergy = (this.mods && this.mods.guardMax) || 100;
    if (refillVitals) {
      this.guardEnergy = this.maxGuardEnergy;
    } else if (this.maxGuardEnergy > prevMaxG) {
      this.guardEnergy = Math.min(this.maxGuardEnergy, this.guardEnergy + (this.maxGuardEnergy - prevMaxG));
    } else {
      this.guardEnergy = Math.min(this.maxGuardEnergy, this.guardEnergy);
    }
    if (refillVitals) {
      this.health = this.maxHealth;
      this.shield = this.maxShield;
    } else {
      if (this.maxHealth > prevMaxHp) this.health = Math.min(this.maxHealth, this.health + (this.maxHealth - prevMaxHp));
      if (this.maxShield > prevMaxSh) this.shield = Math.min(this.maxShield, this.shield + (this.maxShield - prevMaxSh));
    }
  }

  reset(spawnPos, yaw = 0) {
    if (spawnPos) {
      this.position.set(spawnPos.x || 0, spawnPos.y || 0, spawnPos.z || 0);
    } else {
      this.position.set(0, 0, 0);
    }

    this.velocity.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;

    this.maxHealth = PLAYER_CONFIG.maxHealth + (this.mods ? this.mods.maxHealthBonus : 0);
    this.health = this.maxHealth;
    this.maxShield = PLAYER_CONFIG.maxShield + (this.mods ? this.mods.maxShieldBonus : 0);
    this.shield = this.maxShield;
    this.inZoneBuff = false;
    this.dashOverdriveTimer = 0;
    this.reactiveArmorTimer = 0;
    this.isAlive = true;

    this.isGrounded = false;
    this.isSprinting = false;
    this.isCrouching = false;
    this.isSliding = false;
    this.isDashing = false;
    this.isAds = false;

    this.dashCharges = PLAYER_CONFIG.dashMaxCharges;
    this.dashCooldownProgress = 1.0;

    this.currentHeight = PLAYER_CONFIG.standHeight;
    this.headBobTime = 0;
    this.speed = 0;
    this.currentFov = PLAYER_CONFIG.baseFov;
    this.cameraRoll = 0;

    this._coyoteTimer = 0;
    this._jumpBufferTimer = 0;
    this._doubleJumpAvailable = true;
    this._slideTimer = 0;
    this._slideCooldown = 0;
    this._dashTimer = 0;
    this._dashRechargeTimer = 0;
    this._timeSinceDamaged = PLAYER_CONFIG.shieldRegenDelay;
    this._wasGrounded = false;
    this._justLanded = false;
    this._footstepArmed = true;

    this._landDip = 0;
    this._landDipVel = 0;
    this._recoilPitch = 0;
    this._recoilPitchTarget = 0;
    this._recoilYaw = 0;
    this._recoilYawTarget = 0;
    this._recoilRecovery = DEFAULT_RECOIL_RECOVERY;
    this._shakeTrauma = 0;
    this._shakeTime = 0;

    this._syncCameraTransform(0, 0, 0, 0, 0);
    this.camera.fov = this.currentFov;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Main per-frame 3C update. Strictly zero allocations.
   * @param {number} dt
   * @param {{ adsFov?: number, allowAds?: boolean, aimAssistTargets?: Array<any> }} [options]
   */
  update(dt, options) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    const clampedDt = dt > 0.05 ? 0.05 : dt;

    const adsFov = options && options.adsFov ? options.adsFov : 0;
    const allowAds = !options || options.allowAds !== false;
    const aimAssistTargets = options && options.aimAssistTargets ? options.aimAssistTargets : null;

    if (!this.isAlive) {
      // Gentle death settle: decay shake/recoil & drop eye near floor
      this._updateCameraJuice(clampedDt);
      this.currentHeight += (0.45 - this.currentHeight) * (1 - Math.exp(-8 * clampedDt));
      this.cameraRoll += (0.28 - this.cameraRoll) * (1 - Math.exp(-6 * clampedDt));
      this._syncCameraTransform(0, 0, 0, 0, 0);
      return;
    }

    // 1. Look input & ADS state
    this.isAds = allowAds && this.input.isDown('ads') && !this.isDashing;
    const look = this.input.consumeLookDelta();
    const adsLookScale = this.isAds ? 0.56 : 1.0;

    this.yaw -= look.x * adsLookScale;
    this.pitch -= look.y * adsLookScale;
    if (this.pitch > MAX_PITCH) this.pitch = MAX_PITCH;
    else if (this.pitch < -MAX_PITCH) this.pitch = -MAX_PITCH;

    // Soft magnetic touch aim assist
    if (this.input.isTouchMode() && aimAssistTargets && aimAssistTargets.length > 0) {
      this._applyTouchAimAssist(clampedDt, aimAssistTargets);
    }

    // 2. Horizontal movement basis from yaw
    const sinY = Math.sin(this.yaw);
    const cosY = Math.cos(this.yaw);
    this._forward.set(-sinY, 0, -cosY);
    this._right.set(cosY, 0, -sinY);

    const move = this.input.getMoveVector();
    this._wishDir.set(
      this._forward.x * move.y + this._right.x * move.x,
      0,
      this._forward.z * move.y + this._right.z * move.x
    );
    const wishMag = Math.hypot(this._wishDir.x, this._wishDir.z);
    if (wishMag > 1e-4) {
      const inv = 1 / wishMag;
      this._wishDir.x *= inv;
      this._wishDir.z *= inv;
    }

    // 3. Dash charge regeneration & trigger
    this._updateDashCharges(clampedDt);
    if (this.input.consumePressed('dash') && this.dashCharges > 0 && !this.isDashing) {
      this._startDash(wishMag, move.x);
    }

    // 4. Slide input, full-capsule overhead clearance & forced crouch state
    if (this._slideCooldown > 0) {
      this._slideCooldown = Math.max(0, this._slideCooldown - clampedDt);
    }
    const slidePressed = this.input.consumePressed('slide');
    const slideHeld = this.input.isDown('slide');
    const currentHorizSpeed = Math.hypot(this.velocity.x, this.velocity.z);

    if (
      !this.isSliding &&
      !this.isDashing &&
      this.isGrounded &&
      this._slideCooldown <= 0 &&
      (slidePressed || (slideHeld && this._justLanded))
    ) {
      const fastEnough =
        currentHorizSpeed >= PLAYER_CONFIG.walkSpeed * 0.72 ||
        (wishMag > 0.45 && (this.isSprinting || currentHorizSpeed >= 5.2));
      if (fastEnough) {
        this._startSlide(currentHorizSpeed, wishMag, move.x);
      }
    }

    // Check full-capsule standing clearance to enforce crouch under low overhangs
    const isLowCurrently = this.currentHeight < PLAYER_CONFIG.standHeight - 0.01;
    const hasStandHeadroom =
      !isLowCurrently ||
      this.collisionWorld.hasClearance(
        this.position.x,
        this.position.y,
        this.position.z,
        PLAYER_CONFIG.radius,
        PLAYER_CONFIG.standHeight
      );
    const forcedCrouch = isLowCurrently && !hasStandHeadroom;

    this.isCrouching =
      !this.isSliding &&
      !this.isDashing &&
      ((slideHeld && this.isGrounded) || forcedCrouch);

    const physicallyCrouched =
      this.isCrouching || this.currentHeight < PLAYER_CONFIG.standHeight - 0.25;

    // 5. Sprint state (supports GDD touch outer-ring auto-sprint; blocked while physically crouched)
    const wantsSprint =
      this.input.isDown('sprint') ||
      (this.input.isTouchMode() && move.y > 0.85);

    this.isSprinting =
      wantsSprint &&
      move.y > 0.35 &&
      wishMag > 0.1 &&
      !this.isAds &&
      !this.isSliding &&
      !this.isDashing &&
      !physicallyCrouched;

    // 6. Jump buffering & coyote time
    if (this.isGrounded) {
      this._coyoteTimer = PLAYER_CONFIG.coyoteTime;
      this._doubleJumpAvailable = true;
    } else if (this._coyoteTimer > 0) {
      this._coyoteTimer = Math.max(0, this._coyoteTimer - clampedDt);
    }

    if (this.input.consumePressed('jump')) {
      this._jumpBufferTimer = PLAYER_CONFIG.jumpBufferTime;
    } else if (this._jumpBufferTimer > 0) {
      this._jumpBufferTimer = Math.max(0, this._jumpBufferTimer - clampedDt);
    }

    if (this._jumpBufferTimer > 0 && !this.isDashing) {
      if (this._coyoteTimer > 0) {
        // Crisp ground / coyote jump (with slide-jump momentum carry!)
        this.velocity.y = PLAYER_CONFIG.jumpVelocity;
        if (this.isSliding) {
          this.isSliding = false;
          this._slideTimer = 0;
          this._slideCooldown = 0.24;
          const boosted = Math.min(PLAYER_CONFIG.slideBoostSpeed * 1.12, currentHorizSpeed * 1.07);
          if (currentHorizSpeed > 0.1) {
            const ratio = boosted / currentHorizSpeed;
            this.velocity.x *= ratio;
            this.velocity.z *= ratio;
          }
        }
        this.isGrounded = false;
        this._coyoteTimer = 0;
        this._jumpBufferTimer = 0;
        this._jumpPayload.isDoubleJump = false;
        this.eventBus.emit(EVENTS.PLAYER_JUMP, this._jumpPayload);
      } else if (this._doubleJumpAvailable) {
        // Crisp mid-air double jump with directional air snap
        this.velocity.y = PLAYER_CONFIG.doubleJumpVelocity;
        if (wishMag > 0.15) {
          const carrySpeed = Math.max(currentHorizSpeed, PLAYER_CONFIG.walkSpeed * 1.05);
          this.velocity.x = this.velocity.x * 0.35 + this._wishDir.x * carrySpeed * 0.65;
          this.velocity.z = this.velocity.z * 0.35 + this._wishDir.z * carrySpeed * 0.65;
        }
        this._doubleJumpAvailable = false;
        this._jumpBufferTimer = 0;
        this._jumpPayload.isDoubleJump = true;
        this.eventBus.emit(EVENTS.PLAYER_JUMP, this._jumpPayload);
      }
    }

    // 7. Horizontal locomotion & gravity integration
    if (this.isDashing) {
      this._dashTimer -= clampedDt;
      this.velocity.x = this._dashDir.x * PLAYER_CONFIG.dashSpeed;
      this.velocity.z = this._dashDir.z * PLAYER_CONFIG.dashSpeed;
      this.velocity.y = 0;

      if (this._dashTimer <= 0) {
        this.isDashing = false;
        // Bleed out into fast combat momentum rather than an abrupt halt
        const exitSpeed = PLAYER_CONFIG.sprintSpeed * 1.12;
        this.velocity.x = this._dashDir.x * exitSpeed;
        this.velocity.z = this._dashDir.z * exitSpeed;
      }
    } else if (this.isSliding) {
      this._slideTimer -= clampedDt;

      // Low-friction slide decay + subtle lateral carve steering
      const decay = Math.exp(-PLAYER_CONFIG.slideFriction * clampedDt);
      this.velocity.x *= decay;
      this.velocity.z *= decay;

      if (wishMag > 0.1) {
        const steerAccel = 14.0 * clampedDt;
        this.velocity.x += this._wishDir.x * steerAccel;
        this.velocity.z += this._wishDir.z * steerAccel;
      }

      const slideSpeed = Math.hypot(this.velocity.x, this.velocity.z);
      const releasedEarly = !slideHeld && this._slideTimer < PLAYER_CONFIG.slideDuration - 0.18;
      if (
        this._slideTimer <= 0 ||
        releasedEarly ||
        slideSpeed < PLAYER_CONFIG.slideMinSpeed ||
        !this.isGrounded
      ) {
        this.isSliding = false;
        this._slideTimer = 0;
        this._slideCooldown = 0.25;
      }

      const gravScale = this.mods && this.mods.lowGravity ? 0.75 : 1.0;
      this.velocity.y -= PLAYER_CONFIG.gravity * gravScale * clampedDt;
    } else {
      // Standard ground / air locomotion (with meta/card moveSpeedMult)
      let targetSpeed =
        (this.isSprinting ? PLAYER_CONFIG.sprintSpeed : PLAYER_CONFIG.walkSpeed) *
        (this.mods ? this.mods.moveSpeedMult : 1.0) *
        (this.weaponMoveMult || 1.0);
      if (this.isGuarding) {
        targetSpeed *= 0.78;
      } else if (this.isAds) {
        targetSpeed *= PLAYER_CONFIG.adsSpeedMultiplier;
      } else if (physicallyCrouched) {
        targetSpeed *= 0.56;
      }
      if (this.timeSlowTimer > 0) {
        targetSpeed *= 1.25;
      }

      if (this.isGrounded) {
        const targetVx = this._wishDir.x * targetSpeed * wishMag;
        const targetVz = this._wishDir.z * targetSpeed * wishMag;

        if (wishMag > 0.05) {
          // Responsive ground acceleration
          const accelStep = PLAYER_CONFIG.groundAccel * clampedDt;
          const dx = targetVx - this.velocity.x;
          const dz = targetVz - this.velocity.z;
          const diffLen = Math.hypot(dx, dz);
          if (diffLen <= accelStep || diffLen < 1e-5) {
            this.velocity.x = targetVx;
            this.velocity.z = targetVz;
          } else {
            const inv = accelStep / diffLen;
            this.velocity.x += dx * inv;
            this.velocity.z += dz * inv;
          }
        } else {
          // Crisp exponential ground friction
          const fric = Math.exp(-PLAYER_CONFIG.groundFriction * clampedDt);
          this.velocity.x *= fric;
          this.velocity.z *= fric;
          if (Math.hypot(this.velocity.x, this.velocity.z) < 0.05) {
            this.velocity.x = 0;
            this.velocity.z = 0;
          }
        }
      } else {
        // Quake/Titanfall projection-based air acceleration:
        // Preserves full slide-jump, dash & jump-pad forward speed while keeping strafing/braking crisp
        if (wishMag > 0.05) {
          const prevHorizSpeed = Math.hypot(this.velocity.x, this.velocity.z);
          const projSpeed =
            this.velocity.x * this._wishDir.x + this.velocity.z * this._wishDir.z;

          if (projSpeed < targetSpeed) {
            const airAccel = PLAYER_CONFIG.groundAccel * PLAYER_CONFIG.airControl;
            const addSpeed = Math.min(targetSpeed - projSpeed, airAccel * clampedDt);
            this.velocity.x += this._wishDir.x * addSpeed;
            this.velocity.z += this._wishDir.z * addSpeed;
          }

          // Cap horizontal speed at max(targetSpeed, prevHorizSpeed)
          const maxAirSpeed = Math.max(targetSpeed, prevHorizSpeed);
          const newSpeed = Math.hypot(this.velocity.x, this.velocity.z);
          if (newSpeed > maxAirSpeed) {
            const scale = maxAirSpeed / newSpeed;
            this.velocity.x *= scale;
            this.velocity.z *= scale;
          }
        }
      }

      this.velocity.y -= PLAYER_CONFIG.gravity * clampedDt;
    }

    // 8. Smooth capsule height interpolation respecting full-capsule overhead clearance
    const targetHeight =
      this.isSliding || this.isCrouching || !hasStandHeadroom
        ? PLAYER_CONFIG.crouchHeight
        : PLAYER_CONFIG.standHeight;
    this.currentHeight += (targetHeight - this.currentHeight) * (1 - Math.exp(-15 * clampedDt));

    // 9. Collision World physics sweep
    const prevVy = this.velocity.y;
    this._wasGrounded = this.isGrounded;
    const moveRes = this.collisionWorld.resolveCapsuleMove(
      this.position,
      this.velocity,
      PLAYER_CONFIG.radius,
      this.currentHeight,
      clampedDt,
      PLAYER_CONFIG.stepHeight,
      true
    );
    this.isGrounded = moveRes.grounded;
    this._justLanded = !this._wasGrounded && this.isGrounded;

    // Landing impact camera dip & footstep audio event
    if (this._justLanded && prevVy < -5.5) {
      const impact = Math.min(1.0, Math.abs(prevVy) / 18.0);
      this._landDipVel -= 1.85 * impact;
      this.addScreenShake(0.14 * impact);
      this._footstepPayload.speed = Math.abs(prevVy);
      this._footstepPayload.sprinting = this.isSprinting;
      this._footstepPayload.isLanding = true;
      this.eventBus.emit(EVENTS.PLAYER_FOOTSTEP, this._footstepPayload);
    }

    // Jump pad boost handling
    if (moveRes.onJumpPad) {
      this.isGrounded = false;
      this.isSliding = false;
      this.isDashing = false;
      this._coyoteTimer = 0;
      this._doubleJumpAvailable = true;
      this.addScreenShake(0.2);
      this._jumpPadPayload.pad = moveRes.jumpPad;
      this.eventBus.emit(EVENTS.PLAYER_JUMPPAD, this._jumpPadPayload);
    }

    // 10. Speed, standing headbob & rhythmic footsteps
    this.speed = Math.hypot(this.velocity.x, this.velocity.z);
    let bobX = 0;
    let bobY = 0;

    if (
      this.isGrounded &&
      !this.isSliding &&
      !this.isDashing &&
      !physicallyCrouched &&
      this.speed > 1.2
    ) {
      const bobFreq = this.isSprinting ? 12.6 : 9.4;
      const speedNorm = Math.min(1.25, this.speed / PLAYER_CONFIG.walkSpeed);
      this.headBobTime += clampedDt * bobFreq * speedNorm;

      const bobAmpScale =
        (this.isAds ? 0.22 : 1.0) * Math.min(1.0, this.speed / PLAYER_CONFIG.walkSpeed);
      const sinBob = Math.sin(this.headBobTime);
      bobY = sinBob * 0.042 * bobAmpScale;
      bobX = Math.cos(this.headBobTime * 0.5) * 0.026 * bobAmpScale;

      if (sinBob < -0.82 && this._footstepArmed) {
        this._footstepArmed = false;
        this._footstepPayload.speed = this.speed;
        this._footstepPayload.sprinting = this.isSprinting;
        this._footstepPayload.isLanding = false;
        this.eventBus.emit(EVENTS.PLAYER_FOOTSTEP, this._footstepPayload);
      } else if (sinBob > 0.2) {
        this._footstepArmed = true;
      }
    } else {
      this._footstepArmed = true;
    }

    // 11. Dynamic FOV & Camera Roll
    const frameBaseFov = (this.mods && this.mods.baseFov) || PLAYER_CONFIG.baseFov;
    let targetFov = this.isAds && adsFov > 0 ? adsFov : frameBaseFov;
    if (!this.isAds) {
      if (this.isDashing) {
        targetFov += PLAYER_CONFIG.dashFovBonus;
      } else if (this.isSliding) {
        targetFov += PLAYER_CONFIG.slideFovBonus;
      } else if (this.isSprinting && this.speed > PLAYER_CONFIG.walkSpeed * 0.8) {
        targetFov += PLAYER_CONFIG.sprintFovBonus;
      }
    }
    this.currentFov += (targetFov - this.currentFov) * (1 - Math.exp(-12 * clampedDt));
    if (Math.abs(this.camera.fov - this.currentFov) > 0.02) {
      this.camera.fov = this.currentFov;
      this.camera.updateProjectionMatrix();
    }

    let targetRoll = 0;
    if (this.isSliding) {
      targetRoll = this._slideRollSign * PLAYER_CONFIG.slideCameraRollDeg * DEG2RAD;
    } else if (!this.isDashing) {
      const strafeTilt = this.isAds ? 0.35 : 1.45;
      targetRoll = -move.x * strafeTilt * DEG2RAD;
    }
    this.cameraRoll += (targetRoll - this.cameraRoll) * (1 - Math.exp(-11 * clampedDt));

    // 12. Front Energy Guard Shield [E], Special/Ultimate Timers (NO passive shield regen - dodge/guard/pickups only!)
    if (this.dashOverdriveTimer > 0) this.dashOverdriveTimer = Math.max(0, this.dashOverdriveTimer - clampedDt);
    if (this.reactiveArmorTimer > 0) this.reactiveArmorTimer = Math.max(0, this.reactiveArmorTimer - clampedDt);
    if (this.phaseInvulnTimer > 0) this.phaseInvulnTimer = Math.max(0, this.phaseInvulnTimer - clampedDt);
    if (this.reloadBuffTimer > 0) this.reloadBuffTimer = Math.max(0, this.reloadBuffTimer - clampedDt);
    if (this.hyperBarrageTimer > 0) this.hyperBarrageTimer = Math.max(0, this.hyperBarrageTimer - clampedDt);
    if (this.ultActiveTimer > 0) {
      this.ultActiveTimer = Math.max(0, this.ultActiveTimer - clampedDt);
      if (this.ultActiveTimer <= 0) this.ultDamageMult = 1.0;
    }
    if (this.ultInvulnTimer > 0) this.ultInvulnTimer = Math.max(0, this.ultInvulnTimer - clampedDt);
    if (this.timeSlowTimer > 0) this.timeSlowTimer = Math.max(0, this.timeSlowTimer - clampedDt);
    if (this.guardHitFlash > 0) this.guardHitFlash = Math.max(0, this.guardHitFlash - clampedDt * 4.5);
    if (this.guardBreakTimer > 0) this.guardBreakTimer = Math.max(0, this.guardBreakTimer - clampedDt);

    const prevGuarding = this.isGuarding;
    const wantsGuard = this.input.isDown('guard');
    if (wantsGuard && this.guardBreakTimer <= 0 && this.guardEnergy > 1.0) {
      this.isGuarding = true;
      this.isAds = false;
      this._guardRegenDelay = 0.90;
    } else {
      this.isGuarding = false;
      if (this._guardRegenDelay > 0) {
        this._guardRegenDelay = Math.max(0, this._guardRegenDelay - clampedDt);
      } else if (this.guardEnergy < this.maxGuardEnergy) {
        const regenRate = (this.mods && this.mods.frameId === 'bastion' ? 16.8 : 11.2) * (this.mods && this.mods.guardRegenMult ? this.mods.guardRegenMult : 1.0);
        this.guardEnergy = Math.min(this.maxGuardEnergy, this.guardEnergy + regenRate * clampedDt);
      }
    }

    if (this.isGuarding !== prevGuarding && this.eventBus) {
      this.eventBus.emit('SFX_GUARD_TOGGLE', { raised: this.isGuarding });
    }
    if (this.ultActiveTimer <= 0 && this.ultCharge < 100) {
      const uMult = (this.mods && this.mods.ultChargeMult) || 1.0;
      this.ultCharge = Math.min(100, this.ultCharge + 0.8 * uMult * clampedDt);
    }

    this._timeSinceDamaged += clampedDt;
    if (this.inZoneBuff && this.mods && this.mods.zoneRegenHp > 0 && this.health < this.maxHealth) {
      this.health = Math.min(this.maxHealth, this.health + this.mods.zoneRegenHp * clampedDt);
    }

    // 13. Update recoil spring, landing spring, trauma shake & sync camera
    const shake = this._updateCameraJuice(clampedDt);
    this._syncCameraTransform(bobX, bobY, shake.pitch, shake.yaw, shake.roll);
  }

  /** @private */
  _updateDashCharges(dt) {
    const effCooldown = Math.max(
      0.7,
      PLAYER_CONFIG.dashCooldown * (this.mods ? this.mods.dashCooldownMult : 1.0)
    );
    const maxDashes = (this.mods && this.mods.dashMax) || PLAYER_CONFIG.dashMaxCharges;
    if (this.dashCharges < maxDashes) {
      this._dashRechargeTimer += dt;
      if (this._dashRechargeTimer >= effCooldown) {
        this._dashRechargeTimer -= effCooldown;
        this.dashCharges++;
        if (this.eventBus) this.eventBus.emit('SFX_DASH_READY', {});
        if (this.dashCharges >= maxDashes) {
          this._dashRechargeTimer = 0;
        }
      }
    }
    this.dashCooldownProgress =
      this.dashCharges >= maxDashes
        ? 1.0
        : Math.max(0, Math.min(1, this._dashRechargeTimer / effCooldown));
  }

  /** @private */
  _startDash(wishMag, strafeInput) {
    this.dashCharges--;
    this.isSliding = false;
    this._slideTimer = 0;
    this.isDashing = true;
    this._dashTimer = PLAYER_CONFIG.dashDuration;

    if (wishMag > 0.1) {
      this._dashDir.set(this._wishDir.x, 0, this._wishDir.z).normalize();
    } else {
      this._dashDir.set(this._forward.x, 0, this._forward.z).normalize();
    }

    this.velocity.x = this._dashDir.x * PLAYER_CONFIG.dashSpeed;
    this.velocity.z = this._dashDir.z * PLAYER_CONFIG.dashSpeed;
    this.velocity.y = 0;

    this.cameraRoll += -strafeInput * 0.085;
    this.addScreenShake(0.14);

    if (this.mods && this.mods.synergyMobility) {
      this.dashOverdriveTimer = 2.0;
    }
    if (this.mods && this.mods.crossHyperBarrage) {
      this.hyperBarrageTimer = 2.5;
    }
    if (this.mods && this.mods.phaseBlink) {
      this.phaseInvulnTimer = 0.35;
    }
    this._dashPayload.chargesRemaining = this.dashCharges;
    this.eventBus.emit(EVENTS.PLAYER_DASH, this._dashPayload);
  }

  /** @private */
  _startSlide(currentHorizSpeed, wishMag, strafeInput) {
    this.isSliding = true;
    this._slideTimer = PLAYER_CONFIG.slideDuration;

    if (currentHorizSpeed > 1.5) {
      const inv = 1 / currentHorizSpeed;
      this._slideDir.set(this.velocity.x * inv, 0, this.velocity.z * inv);
    } else if (wishMag > 0.1) {
      this._slideDir.set(this._wishDir.x, 0, this._wishDir.z);
    } else {
      this._slideDir.set(this._forward.x, 0, this._forward.z);
    }

    const burst = Math.max(PLAYER_CONFIG.slideBoostSpeed, currentHorizSpeed + 3.2);
    this.velocity.x = this._slideDir.x * burst;
    this.velocity.z = this._slideDir.z * burst;

    // Bank into strafe direction (or classic right-shoulder dip when sliding straight)
    this._slideRollSign = Math.abs(strafeInput) > 0.15 ? -Math.sign(strafeInput) : -1;
    this.addScreenShake(0.08);
    this.eventBus.emit(EVENTS.PLAYER_SLIDE, this._slidePayload);
  }

  /**
   * Gentle magnetic touch aim-assist toward enemies inside cone (zero allocation).
   * @private
   */
  _applyTouchAimAssist(dt, targets) {
    this.getEyePosition(this._eyePos);
    this.getLookDirection(this._lookDir);

    const coneRad = PLAYER_CONFIG.touchAimAssistConeDeg * DEG2RAD;
    const minDot = Math.cos(coneRad);
    const maxDistSq = 45 * 45;

    let bestDot = minDot;
    let bestTx = 0;
    let bestTy = 0;
    let bestTz = 0;
    let found = false;

    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      if (!t) continue;
      if (t.isAlive === false || t.alive === false) continue;

      const pt = t.aimPoint || t.center || t.headPosition || t.position || t;
      if (pt.x === undefined || pt.y === undefined || pt.z === undefined) continue;

      const dx = pt.x - this._eyePos.x;
      const dy = pt.y - this._eyePos.y;
      const dz = pt.z - this._eyePos.z;
      const distSq = dx * dx + dy * dy + dz * dz;
      if (distSq < 0.25 || distSq > maxDistSq) continue;

      const invDist = 1 / Math.sqrt(distSq);
      const dot =
        dx * invDist * this._lookDir.x +
        dy * invDist * this._lookDir.y +
        dz * invDist * this._lookDir.z;

      if (dot > bestDot) {
        bestDot = dot;
        bestTx = pt.x;
        bestTy = pt.y;
        bestTz = pt.z;
        found = true;
      }
    }

    if (!found) return;

    this._toTarget.set(bestTx, bestTy, bestTz);
    if (!this.collisionWorld.isLineOfSightClear(this._eyePos, this._toTarget)) {
      return;
    }

    const dx = bestTx - this._eyePos.x;
    const dy = bestTy - this._eyePos.y;
    const dz = bestTz - this._eyePos.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist < 0.1) return;

    const targetYaw = Math.atan2(-dx, -dz);
    const targetPitch = Math.asin(Math.max(-1, Math.min(1, dy / dist)));

    const dYaw = wrapAngle(targetYaw - this.yaw);
    const dPitch = targetPitch - this.pitch;

    // Smooth cone falloff: softest at rim, gentlest lock inside center
    const angle = Math.acos(Math.max(-1, Math.min(1, bestDot)));
    const weight = Math.max(0, 1 - angle / coneRad);
    const strength = PLAYER_CONFIG.touchAimAssistStrength * (this.isAds ? 1.35 : 1.0);
    const pull = (1 - Math.exp(-strength * 14 * dt)) * (0.35 + 0.65 * weight);

    this.yaw += dYaw * pull;
    this.pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, this.pitch + dPitch * pull));
  }

  /**
   * Update landing spring, per-weapon recoil spring recovery, and damped trauma shake.
   * Reuses an internal scratch object.
   * @private
   */
  _updateCameraJuice(dt) {
    // Landing dip critically damped spring
    const springK = 140;
    const springD = 19;
    const acc = -springK * this._landDip - springD * this._landDipVel;
    this._landDipVel += acc * dt;
    this._landDip += this._landDipVel * dt;
    if (Math.abs(this._landDip) < 0.0005 && Math.abs(this._landDipVel) < 0.001) {
      this._landDip = 0;
      this._landDipVel = 0;
    }

    // Recoil spring: snappy kick toward target, per-weapon tuned recovery to 0
    const kickBlend = 1 - Math.exp(-32 * dt);
    const recoverDecay = Math.exp(-this._recoilRecovery * dt);
    this._recoilPitchTarget *= recoverDecay;
    this._recoilYawTarget *= recoverDecay;
    this._recoilPitch += (this._recoilPitchTarget - this._recoilPitch) * kickBlend;
    this._recoilYaw += (this._recoilYawTarget - this._recoilYaw) * kickBlend;

    // Trauma-squared damped screen shake
    if (this._shakeTrauma > 0) {
      this._shakeTrauma = Math.max(0, this._shakeTrauma - dt * 2.35);
      this._shakeTime += dt * 44;
    }
    const mag = this._shakeTrauma * this._shakeTrauma;
    const t = this._shakeTime;

    this._shakeOut.pitch = mag * 0.045 * Math.sin(t * 1.13);
    this._shakeOut.yaw = mag * 0.038 * Math.cos(t * 0.89);
    this._shakeOut.roll = mag * 0.055 * Math.sin(t * 1.47);
    return this._shakeOut;
  }

  /** @private */
  _syncCameraTransform(bobX, bobY, shakePitch, shakeYaw, shakeRoll) {
    const eyeY = this.currentHeight - PLAYER_CONFIG.eyeOffset + bobY + this._landDip;
    this.camera.position.set(
      this.position.x + this._right.x * bobX,
      this.position.y + eyeY,
      this.position.z + this._right.z * bobX
    );

    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw + this._recoilYaw + shakeYaw;
    this.camera.rotation.x = Math.max(
      -MAX_FINAL_PITCH,
      Math.min(MAX_FINAL_PITCH, this.pitch + this._recoilPitch + shakePitch)
    );
    this.camera.rotation.z = this.cameraRoll + shakeRoll;
  }

  // ---------------------------------------------------------------------------
  // Combat Feedback, Vitality & Query API
  // ---------------------------------------------------------------------------

  /**
   * Apply upward pitch & horizontal yaw recoil spring kick (radians) with optional
   * per-weapon recovery speed.
   * @param {number} pitchKick
   * @param {number} [yawKick=0]
   * @param {number} [recoveryRate]
   */
  addRecoil(pitchKick, yawKick = 0, recoveryRate) {
    if (Number.isFinite(recoveryRate) && recoveryRate > 0) {
      this._recoilRecovery = recoveryRate;
    }
    const adsDamp = this.isAds ? 0.72 : 1.0;
    this._recoilPitchTarget = Math.min(0.32, this._recoilPitchTarget + pitchKick * adsDamp);
    this._recoilYawTarget = Math.max(
      -0.18,
      Math.min(0.18, this._recoilYawTarget + yawKick * adsDamp)
    );
  }

  /**
   * Add trauma-based damped screen shake intensity (0..1).
   * @param {number} intensity
   */
  addScreenShake(intensity) {
    if (!Number.isFinite(intensity) || intensity <= 0) return;
    this._shakeTrauma = Math.min(1.0, this._shakeTrauma + intensity);
  }

  /**
   * Apply incoming damage: absorbs into shield first, then overflows into health.
   * Emits EVENTS.PLAYER_DAMAGED.
   * @param {number} amount
   * @param {THREE.Vector3|null} [sourcePos=null]
   */
  applyDamage(amount, sourcePos = null) {
    if (!this.isAlive || !Number.isFinite(amount) || amount <= 0) {
      return { shieldDamage: 0, healthDamage: 0, killed: false };
    }

    if (this.phaseInvulnTimer > 0 || this.ultInvulnTimer > 0) {
      return { shieldDamage: 0, healthDamage: 0, killed: false, invulnerable: true };
    }

    if (this.isGuarding && this.guardEnergy > 0) {
      let isFrontal = true;
      if (sourcePos && Number.isFinite(sourcePos.x)) {
        this.getLookDirection(this._lookDir);
        this.getEyePosition(this._eyePos);
        this._guardCheckVec.set(sourcePos.x - this._eyePos.x, 0, sourcePos.z - this._eyePos.z);
        const len = this._guardCheckVec.length();
        if (len > 0.05) {
          this._guardCheckVec.multiplyScalar(1 / len);
          const fwdLen = Math.hypot(this._lookDir.x, this._lookDir.z) || 1;
          const dot = (this._lookDir.x / fwdLen) * this._guardCheckVec.x + (this._lookDir.z / fwdLen) * this._guardCheckVec.z;
          isFrontal = dot > 0.20;
        }
      }
      if (isFrontal) {
        const costMult = (this.mods && this.mods.guardCostMult) || 1.0;
        const energyCost = amount * costMult;
        this.guardEnergy = Math.max(0, this.guardEnergy - energyCost);
        this.guardHitFlash = 1.0;
        this._guardRegenDelay = 0.65;
        let guardBroken = false;
        if (this.guardEnergy <= 0.01) {
          this.guardEnergy = 0;
          this.isGuarding = false;
          this.guardBreakTimer = 2.0;
          guardBroken = true;
        }
        this.addScreenShake(0.08);
        this.eventBus.emit(EVENTS.GUARD_BLOCKED, {
          amount,
          guardEnergy: this.guardEnergy,
          maxGuardEnergy: this.maxGuardEnergy,
          guardBroken,
          sourcePos,
        });
        return { shieldDamage: 0, healthDamage: 0, killed: false, blockedByGuard: true };
      }
    }

    this._timeSinceDamaged = 0;

    const dmgScale = this.reactiveArmorTimer > 0 ? 0.55 : 1.0;
    let remaining = amount * dmgScale;
    let shieldDamage = 0;
    let healthDamage = 0;
    const hadShield = this.shield > 0;

    if (this.shield > 0) {
      shieldDamage = Math.min(this.shield, remaining);
      this.shield -= shieldDamage;
      remaining -= shieldDamage;
    }
    const shieldBroken = hadShield && this.shield <= 0.01;
    if (shieldBroken && this.mods && this.mods.reactiveArmor) {
      this.reactiveArmorTimer = 1.8;
      this.health = Math.min(this.maxHealth, this.health + 15);
    }

    if (remaining > 0) {
      healthDamage = Math.min(this.health, remaining);
      this.health = Math.max(0, this.health - healthDamage);
    }

    if (this.health <= 0) {
      this.isAlive = false;
    }

    this.addScreenShake(Math.min(0.55, 0.14 + amount * 0.008));

    this.eventBus.emit(EVENTS.PLAYER_DAMAGED, {
      amount,
      shieldDamage,
      healthDamage,
      health: this.health,
      shield: this.shield,
      sourcePos,
      shieldBroken,
      isFatal: !this.isAlive,
    });

    return { shieldDamage, healthDamage, killed: !this.isAlive };
  }

  /**
   * Restore player health and/or shield. Emits EVENTS.PLAYER_HEALED if any value increased.
   * @param {number} [hpAmount=0]
   * @param {number} [shieldAmount=0]
   */
  heal(hpAmount = 0, shieldAmount = 0) {
    if (!this.isAlive) return;

    const prevHp = this.health;
    const prevShield = this.shield;

    const hMult = (this.mods && this.mods.dropHealMult) || 1.0;
    if (hpAmount > 0) {
      this.health = Math.min(this.maxHealth, this.health + hpAmount * hMult);
    }
    if (shieldAmount > 0) {
      this.shield = Math.min(this.maxShield, this.shield + shieldAmount * hMult);
    }

    const healthGain = this.health - prevHp;
    const shieldGain = this.shield - prevShield;

    if (healthGain > 0 || shieldGain > 0) {
      this.eventBus.emit(EVENTS.PLAYER_HEALED, {
        healthGain,
        shieldGain,
        health: this.health,
        shield: this.shield,
      });
    }
  }

  /**
   * Aggressive kill shield-siphon reward (+headshot bonus).
   * @param {boolean} [isHeadshot=false]
   */
  onEnemyKill(isHeadshot = false) {
    // Item 8: No HP or Shield recovery on kill — dodge, block with [E] Front Shield, or collect pickups!
    this.addUltCharge(isHeadshot ? 7 : 5);
  }

  addUltCharge(amount) {
    if (!Number.isFinite(amount) || amount <= 0 || this.ultActiveTimer > 0) return;
    const uMult = (this.mods && this.mods.ultChargeMult) || 1.0;
    this.ultCharge = Math.min(100, this.ultCharge + amount * uMult);
  }

  /**
   * Write the player's current world-space eye position into outVec.
   * @param {THREE.Vector3} [outVec]
   * @returns {THREE.Vector3}
   */
  getEyePosition(outVec = new THREE.Vector3()) {
    return outVec.set(
      this.position.x,
      this.position.y + this.currentHeight - PLAYER_CONFIG.eyeOffset + this._landDip,
      this.position.z
    );
  }

  /**
   * Write the player's unit world-space aim direction (including recoil) into outVec.
   * @param {THREE.Vector3} [outVec]
   * @returns {THREE.Vector3}
   */
  getLookDirection(outVec = new THREE.Vector3()) {
    const effPitch = Math.max(
      -MAX_FINAL_PITCH,
      Math.min(MAX_FINAL_PITCH, this.pitch + this._recoilPitch)
    );
    const effYaw = this.yaw + this._recoilYaw;
    const cosP = Math.cos(effPitch);
    return outVec
      .set(-Math.sin(effYaw) * cosP, Math.sin(effPitch), -Math.cos(effYaw) * cosP)
      .normalize();
  }

  /**
   * Return a zero-allocation snapshot of player state for HUD/telemetry consumers.
   */
  getStateSnapshot() {
    const s = this._snapshot;
    s.yaw = this.yaw;
    s.pitch = this.pitch;
    s.health = this.health;
    s.maxHealth = this.maxHealth;
    s.shield = this.shield;
    s.maxShield = this.maxShield;
    s.isAlive = this.isAlive;
    s.isGrounded = this.isGrounded;
    s.isSprinting = this.isSprinting;
    s.isCrouching = this.isCrouching;
    s.isSliding = this.isSliding;
    s.isDashing = this.isDashing;
    s.isAds = this.isAds;
    s.dashCharges = this.dashCharges;
    s.maxDashCharges = (this.mods && this.mods.dashMax) || PLAYER_CONFIG.dashMaxCharges;
    s.dashCooldownProgress = this.dashCooldownProgress;
    s.speed = this.speed;
    s.currentFov = this.currentFov;
    s.cameraRoll = this.cameraRoll;
    s.isGuarding = this.isGuarding;
    s.guardEnergy = this.guardEnergy;
    s.maxGuardEnergy = this.maxGuardEnergy;
    s.guardBreakTimer = this.guardBreakTimer;
    s.guardHitFlash = this.guardHitFlash;
    s.ultCharge = this.ultCharge;
    s.ultActiveTimer = this.ultActiveTimer;
    s.frameId = (this.mods && this.mods.frameId) || 'vanguard';
    return s;
  }
}
  __exports.PlayerController = PlayerController;
});
