// Module: src/ui/TouchOverlay.js
__define("src/ui/TouchOverlay.js", (__exports, __require) => {
/**
 * Ergonomic True Multi-Touch Tablet & Mobile FPS Overlay for AETHER DROP: RECLAIM EARTH.
 * Strictly gated to coarse-pointer touch devices (`pointer: coarse`) so desktop browsers
 * never show virtual touch controls.
 * Uses independent PointerEvent.pointerId tracking so tablet/mobile players can simultaneously:
 * - Move & auto-sprint via left dynamic virtual thumbstick
 * - Aim smoothly via right drag pad OR while holding & dragging the Fire button
 * - Toggle ADS, Jump, Hold/Tap Slide, Omni-Dash, Reload, Thermal Pry-Blade Melee, and Swap
 */
class TouchOverlay {
  /**
   * @param {import('../core/InputManager.js').InputManager} inputManager
   * @param {import('../weapons/WeaponSystem.js').WeaponSystem} weaponSystem
   * @param {() => void} onPause
   */
  constructor(inputManager, weaponSystem, onPause) {
    this.input = inputManager;
    this.weaponSystem = weaponSystem;
    this.onPause = typeof onPause === 'function' ? onPause : () => {};

    const byId = (id) => document.getElementById(id);

    this._root = byId('touch-overlay');
    this._moveZone = byId('touch-move-zone');
    this._joyBase = byId('touch-joy-base');
    this._joyKnob = byId('touch-joy-knob');
    this._lookZone = byId('touch-look-zone');

    this._btnFire = byId('touch-btn-fire');
    this._btnAds = byId('touch-btn-ads');
    this._btnJump = byId('touch-btn-jump');
    this._btnSlide = byId('touch-btn-slide');
    this._btnDash = byId('touch-btn-dash');
    this._btnReload = byId('touch-btn-reload');
    this._btnMelee = byId('touch-btn-melee');
    this._btnSwap = byId('touch-btn-swap');
    this._btnPickup = byId('touch-btn-pickup');
    this._btnPause = byId('touch-btn-pause');

    this._visible = false;
    this._joyMaxRadius = 56;
    this._coarseQuery =
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(pointer: coarse)')
        : null;

    // Independent multi-touch pointer IDs (strictly zero finger collisions!)
    this._movePointerId = null;
    this._moveOriginX = 0;
    this._moveOriginY = 0;

    this._lookPointerId = null;
    this._lookLastX = 0;
    this._lookLastY = 0;

    this._firePointerId = null;
    this._fireLastX = 0;
    this._fireLastY = 0;

    this._slidePointerId = null;
    this._dashPointerId = null;
    this._dashHoldTimer = null;
    this._dashHeldAsSlide = false;
    this._adsToggled = false;

    // Dirty caches for syncState()
    this._lastDashEmpty = null;
    this._lastReloading = null;

    this._cleanups = [];
    this._bindAll();
  }

  /**
   * Check whether the active device uses a coarse touch pointer (tablets / phones).
   * @returns {boolean}
   */
  isCoarsePointer() {
    if (this._coarseQuery) {
      return Boolean(this._coarseQuery.matches);
    }
    return Boolean(
      typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(pointer: coarse)').matches
    );
  }

  /** @private */
  _listen(el, type, fn, opts) {
    if (!el) return;
    el.addEventListener(type, fn, opts);
    this._cleanups.push(() => el.removeEventListener(type, fn, opts));
  }

  /** @private */
  _bindAll() {
    // 1. Left Virtual Thumbstick (dynamic anchor within left 42% zone + >85% auto-sprint glow)
    this._listen(this._moveZone, 'pointerdown', (e) => {
      if (this._movePointerId !== null) return;
      e.preventDefault();
      this._movePointerId = e.pointerId;
      this._capturePointer(this._moveZone, e.pointerId);

      const rect = this._moveZone.getBoundingClientRect();
      const pad = 68;
      const localX = Math.max(pad, Math.min(rect.width - pad, e.clientX - rect.left));
      const localY = Math.max(pad, Math.min(rect.height - pad, e.clientY - rect.top));

      this._moveOriginX = rect.left + localX;
      this._moveOriginY = rect.top + localY;

      if (this._joyBase) {
        this._joyBase.style.left = `${localX}px`;
        this._joyBase.style.top = `${localY}px`;
        this._joyBase.style.bottom = 'auto';
        this._joyBase.style.marginTop = '-64px';
        this._joyBase.style.marginBottom = '0';
        this._joyBase.classList.add('active');
      }
      this._updateJoystick(e.clientX, e.clientY);
    });

    this._listen(this._moveZone, 'pointermove', (e) => {
      if (e.pointerId !== this._movePointerId) return;
      e.preventDefault();
      this._updateJoystick(e.clientX, e.clientY);
    });

    const releaseMove = (e) => {
      if (e.pointerId !== this._movePointerId) return;
      if (e.cancelable) e.preventDefault();
      this._releaseJoystick();
    };
    this._listen(this._moveZone, 'pointerup', releaseMove);
    this._listen(this._moveZone, 'pointercancel', releaseMove);
    this._listen(this._moveZone, 'lostpointercapture', releaseMove);

    // 2. Right Look / Aim Drag Pad
    this._listen(this._lookZone, 'pointerdown', (e) => {
      if (this._lookPointerId !== null) return;
      e.preventDefault();
      this._lookPointerId = e.pointerId;
      this._lookLastX = e.clientX;
      this._lookLastY = e.clientY;
      this._capturePointer(this._lookZone, e.pointerId);
    });

    this._listen(this._lookZone, 'pointermove', (e) => {
      if (e.pointerId !== this._lookPointerId) return;
      e.preventDefault();
      const dx = e.clientX - this._lookLastX;
      const dy = e.clientY - this._lookLastY;
      this._lookLastX = e.clientX;
      this._lookLastY = e.clientY;
      this.input.addTouchLook(dx, dy);
    });

    const releaseLook = (e) => {
      if (e.pointerId !== this._lookPointerId) return;
      if (e.cancelable) e.preventDefault();
      this._lookPointerId = null;
    };
    this._listen(this._lookZone, 'pointerup', releaseLook);
    this._listen(this._lookZone, 'pointercancel', releaseLook);
    this._listen(this._lookZone, 'lostpointercapture', releaseLook);

    // 3. Fire Button (hold to fire + drag thumb while holding to track targets simultaneously!)
    this._listen(this._btnFire, 'pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this._firePointerId !== null) return;
      this._firePointerId = e.pointerId;
      this._fireLastX = e.clientX;
      this._fireLastY = e.clientY;
      this._capturePointer(this._btnFire, e.pointerId);
      this._btnFire.classList.add('active');
      this.input.setTouchAction('fire', true);
    });

    this._listen(this._btnFire, 'pointermove', (e) => {
      if (e.pointerId !== this._firePointerId) return;
      e.preventDefault();
      e.stopPropagation();
      const dx = e.clientX - this._fireLastX;
      const dy = e.clientY - this._fireLastY;
      this._fireLastX = e.clientX;
      this._fireLastY = e.clientY;
      if (dx !== 0 || dy !== 0) {
        this.input.addTouchLook(dx, dy);
      }
    });

    const releaseFire = (e) => {
      if (e.pointerId !== this._firePointerId) return;
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
      this._firePointerId = null;
      this._btnFire.classList.remove('active');
      this.input.setTouchAction('fire', false);
    };
    this._listen(this._btnFire, 'pointerup', releaseFire);
    this._listen(this._btnFire, 'pointercancel', releaseFire);
    this._listen(this._btnFire, 'lostpointercapture', releaseFire);

    // 4. ADS Toggle Button
    this._listen(this._btnAds, 'pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._adsToggled = !this._adsToggled;
      this._btnAds.classList.toggle('toggled', this._adsToggled);
      this.input.setTouchAction('ads', this._adsToggled);
    });

    // 5. Slide / Crouch Hold + Tap Button
    this._listen(this._btnSlide, 'pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this._slidePointerId !== null) return;
      this._slidePointerId = e.pointerId;
      this._capturePointer(this._btnSlide, e.pointerId);
      this._btnSlide.classList.add('active');
      this.input.setTouchAction('slide', true);
    });

    const releaseSlide = (e) => {
      if (e.pointerId !== this._slidePointerId) return;
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
      this._slidePointerId = null;
      this._btnSlide.classList.remove('active');
      this.input.setTouchAction('slide', false);
    };
    this._listen(this._btnSlide, 'pointerup', releaseSlide);
    this._listen(this._btnSlide, 'pointercancel', releaseSlide);
    this._listen(this._btnSlide, 'lostpointercapture', releaseSlide);

    // 6. Dash (Tap) / Slide (Hold >= 180ms) Combined Button
    this._listen(this._btnDash, 'pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this._dashPointerId !== null) return;
      this._dashPointerId = e.pointerId;
      this._dashHeldAsSlide = false;
      this._capturePointer(this._btnDash, e.pointerId);
      this._btnDash.classList.add('active');
      this._dashHoldTimer = window.setTimeout(() => {
        this._dashHoldTimer = null;
        if (this._dashPointerId !== null) {
          this._dashHeldAsSlide = true;
          this.input.setTouchAction('slide', true);
        }
      }, 180);
    });

    const releaseDash = (e) => {
      if (e.pointerId !== this._dashPointerId) return;
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
      if (this._dashHoldTimer !== null) {
        window.clearTimeout(this._dashHoldTimer);
        this._dashHoldTimer = null;
      }
      this._dashPointerId = null;
      this._btnDash.classList.remove('active');
      if (this._dashHeldAsSlide) {
        this._dashHeldAsSlide = false;
        this.input.setTouchAction('slide', false);
      } else {
        this.input.triggerTouchAction('dash');
      }
    };
    this._listen(this._btnDash, 'pointerup', releaseDash);
    this._listen(this._btnDash, 'pointercancel', releaseDash);
    this._listen(this._btnDash, 'lostpointercapture', releaseDash);

    // 7. Instant One-Shot Tactical Action Buttons (6-button layout)
    this._bindTriggerButton(this._btnJump, 'jump', false);
    this._bindTriggerButton(this._btnReload, 'reload', true);
    this._bindTriggerButton(this._btnSwap, 'weaponNext', true);
    this._bindTriggerButton(this._btnPickup, 'interact', false);

    // 7. Pause Button
    this._listen(this._btnPause, 'pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.onPause();
    });
  }

  /** @private */
  _clearAdsToggle() {
    if (!this._adsToggled) return;
    this._adsToggled = false;
    if (this._btnAds) this._btnAds.classList.remove('toggled');
    this.input.setTouchAction('ads', false);
  }

  /** @private */
  _bindTriggerButton(btn, action, clearsAds = false) {
    if (!btn) return;
    this._listen(btn, 'pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      btn.classList.add('active');
      if (clearsAds) {
        this._clearAdsToggle();
      }
      this.input.triggerTouchAction(action);
    });
    const release = (e) => {
      e.stopPropagation();
      btn.classList.remove('active');
    };
    this._listen(btn, 'pointerup', release);
    this._listen(btn, 'pointercancel', release);
    this._listen(btn, 'pointerleave', release);
  }

  /** @private */
  _capturePointer(el, pointerId) {
    try {
      if (el && typeof el.setPointerCapture === 'function') {
        el.setPointerCapture(pointerId);
      }
    } catch {
      // Ignore if synthetic or unsupported event
    }
  }

  /** @private */
  _updateJoystick(clientX, clientY) {
    let dx = clientX - this._moveOriginX;
    let dy = clientY - this._moveOriginY;
    const dist = Math.hypot(dx, dy);
    const maxR = this._joyMaxRadius;

    if (dist > maxR && dist > 0.001) {
      const scale = maxR / dist;
      dx *= scale;
      dy *= scale;
    }

    const normX = dx / maxR;
    const normY = -dy / maxR; // Screen-up maps to forward (+1)

    this.input.setTouchMove(normX, normY);

    if (this._joyKnob) {
      this._joyKnob.style.transform = `translate3d(${dx.toFixed(1)}px, ${dy.toFixed(1)}px, 0)`;
    }
    if (this._joyBase) {
      this._joyBase.classList.toggle('sprint-engaged', normY > 0.85);
    }
  }

  /** @private */
  _releaseJoystick() {
    this._movePointerId = null;
    this.input.setTouchMove(0, 0);

    if (this._joyKnob) {
      this._joyKnob.style.transform = 'translate3d(0px, 0px, 0)';
    }
    if (this._joyBase) {
      this._joyBase.classList.remove('active', 'sprint-engaged');
      this._joyBase.style.left = '';
      this._joyBase.style.top = '';
      this._joyBase.style.bottom = '';
      this._joyBase.style.marginTop = '';
      this._joyBase.style.marginBottom = '';
    }
  }

  /**
   * Show or hide the multi-touch control layer, strictly gated on coarse pointer devices
   * unless explicitly overridden via Settings (`forceShow = true`).
   * Desktop browsers (`pointer: fine`) in AUTO mode will never reveal touch controls or set `body.touch-active`.
   * @param {boolean} visible
   * @param {boolean} [forceShow=false]
   */
  setVisible(visible, forceShow = false) {
    const next = Boolean(visible) && (Boolean(forceShow) || this.isCoarsePointer());
    if (this._visible === next) {
      if (!next && this._root && !this._root.classList.contains('hidden')) {
        this._root.classList.add('hidden');
      }
      if (!next && typeof document !== 'undefined' && document.body) {
        document.body.classList.remove('touch-active');
      }
      return;
    }
    this._visible = next;
    if (this._root) {
      this._root.classList.toggle('hidden', !next);
    }
    if (typeof document !== 'undefined' && document.body) {
      document.body.classList.toggle('touch-active', next);
    }
    if (!next) {
      this.reset();
    }
  }

  /**
   * Sync visual button highlights with live player/weapon state (zero DOM churn).
   * @param {{ player?: any, weapon?: any }} hudSnapshot
   */
  syncState(hudSnapshot) {
    if (!this._visible || !hudSnapshot) return;

    const player = hudSnapshot.player;
    const weapon = hudSnapshot.weapon;

    if (player && this._btnDash) {
      const dashEmpty = (player.dashCharges | 0) <= 0;
      if (this._lastDashEmpty !== dashEmpty) {
        this._lastDashEmpty = dashEmpty;
        this._btnDash.classList.toggle('dash-empty', dashEmpty);
      }
    }

    if (this._btnPickup) {
      this._btnPickup.classList.toggle('hidden', !Boolean(hudSnapshot.nearbyWeapon));
    }

    if (weapon) {
      const reloading = Boolean(weapon.isReloading);
      if (this._btnReload && this._lastReloading !== reloading) {
        this._lastReloading = reloading;
        this._btnReload.classList.toggle('active', reloading);
      }
      if ((reloading || weapon.isSwapping || weapon.isMeleeing) && this._adsToggled) {
        this._clearAdsToggle();
      }
    }
  }

  /**
   * Clear all held pointers, reset virtual joystick, and release toggle buttons cleanly.
   */
  reset() {
    this._releaseJoystick();
    this._lookPointerId = null;

    if (this._firePointerId !== null) {
      this._firePointerId = null;
      this.input.setTouchAction('fire', false);
    }
    if (this._dashHoldTimer !== null) {
      window.clearTimeout(this._dashHoldTimer);
      this._dashHoldTimer = null;
    }
    if (this._dashPointerId !== null) {
      this._dashPointerId = null;
      if (this._dashHeldAsSlide) {
        this._dashHeldAsSlide = false;
        this.input.setTouchAction('slide', false);
      }
    }
    if (this._slidePointerId !== null) {
      this._slidePointerId = null;
      this.input.setTouchAction('slide', false);
    }
    if (this._adsToggled) {
      this._adsToggled = false;
      this.input.setTouchAction('ads', false);
    }

    if (this._btnFire) this._btnFire.classList.remove('active');
    if (this._btnAds) this._btnAds.classList.remove('toggled');
    if (this._btnSlide) this._btnSlide.classList.remove('active');
    if (this._btnReload) this._btnReload.classList.remove('active');
    if (this._btnDash) this._btnDash.classList.remove('dash-empty');
    this._lastDashEmpty = null;
    this._lastReloading = null;
  }

  /**
   * Remove all DOM event listeners cleanly.
   */
  dispose() {
    this.reset();
    for (let i = 0; i < this._cleanups.length; i++) {
      this._cleanups[i]();
    }
    this._cleanups.length = 0;
    if (typeof document !== 'undefined' && document.body) {
      document.body.classList.remove('touch-active');
    }
  }
}
  __exports.TouchOverlay = TouchOverlay;
});
