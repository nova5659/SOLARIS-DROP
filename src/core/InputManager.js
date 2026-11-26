// Module: src/core/InputManager.js
__define("src/core/InputManager.js", (__exports, __require) => {
const BASE_MOUSE_RAD_PER_PX = 0.0022;
const TOUCH_LOOK_MULTIPLIER = 2.4;
const MAX_MOUSE_EVENT_DELTA = 650;
const PRESSED_TTL_MS = 150;

const KEY_TO_ACTION = {
  ShiftLeft: 'sprint',
  ShiftRight: 'sprint',
  ControlLeft: 'slide',
  KeyC: 'slide',
  Space: 'jump',
  KeyQ: 'dash',
  KeyE: 'guard',
  KeyX: 'ultimate',
  AltLeft: 'dash',
  KeyR: 'reload',
  KeyV: 'melee',
  KeyF: 'interact',
  Digit1: 'slot1',
  Digit2: 'slot2',
  Digit3: 'slot3',
  Digit4: 'slot4',
  KeyP: 'pause',
  Escape: 'pause',
};

const ACTION_ALIASES = {
  crouch: 'slide',
  shoot: 'fire',
  aim: 'ads',
  weapon1: 'slot1',
  weapon2: 'slot2',
  weapon3: 'slot3',
  weapon4: 'slot4',
};

const PREVENT_DEFAULT_CODES = new Set([
  'Space',
  'AltLeft',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Tab',
]);

/**
 * Hybrid PC (PointerLock + Keyboard/Mouse) and Mobile/Tablet Touch InputManager.
 * Uses timestamped press edges (150ms TTL) to eliminate stale phantom inputs,
 * pointer-lock engage spike filtering for crisp PC flick shots, and zero-GC getters.
 */
class InputManager {
  /**
   * @param {HTMLCanvasElement} canvas
   */
  constructor(canvas) {
    this._canvas = canvas;
    this._radPerPx = BASE_MOUSE_RAD_PER_PX;
    this._sensitivityMultiplier = 1.0;

    // Explicit 'auto' | 'pc' | 'touch' control mode + coarse-pointer default detection
    this._controlMode = 'auto';
    const coarse =
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(pointer: coarse)').matches
        : typeof window !== 'undefined' &&
          ('ontouchstart' in window || (navigator && navigator.maxTouchPoints > 0));
    this._touchMode = Boolean(coarse);

    // Held states separated by source so releasing one never clobbers another
    this._codesDown = new Set();
    this._mouseActionsDown = new Set();
    this._touchActionsDown = new Set();

    // Timestamped edge-triggered presses: Map<canonicalAction, timestampMs>
    /** @type {Map<string, number>} */
    this._pressedActions = new Map();

    // Ignore first 2 mousemove events right after pointerlock engages (Chromium lock spike)
    this._ignoreMouseMoveCount = 0;

    // Touch virtual joystick vector (x: right/left, y: forward/backward)
    this._touchMoveX = 0;
    this._touchMoveY = 0;

    // Look accumulators (in radians) & mouse wheel step accumulator
    this._lookDeltaX = 0;
    this._lookDeltaY = 0;
    this._wheelDelta = 0;
    this._lastFallbackMouseX = null;
    this._lastFallbackMouseY = null;
    this._cursorInsideViewport = false;
    this._cursorNormX = 0.5;
    this._cursorNormY = 0.5;
    this._lastWheelTime = 0;

    // Scratch return objects (zero allocation in update loops)
    this._moveOut = { x: 0, y: 0 };
    this._lookOut = { x: 0, y: 0 };

    // Bound event handlers for clean disposal
    this._onKeyDown = this._handleKeyDown.bind(this);
    this._onKeyUp = this._handleKeyUp.bind(this);
    this._onMouseMove = this._handleMouseMove.bind(this);
    this._onMouseDown = this._handleMouseDown.bind(this);
    this._onMouseUp = this._handleMouseUp.bind(this);
    this._onWheel = this._handleWheel.bind(this);
    this._onContextMenu = this._handleContextMenu.bind(this);
    this._onPointerLockChange = this._handlePointerLockChange.bind(this);
    this._onWindowBlur = this._handleWindowBlur.bind(this);
    this._onTouchStart = this._handleTouchStart.bind(this);

    this._bindEvents();
  }

  /**
   * Normalize action aliases to canonical action names.
   * @private
   */
  _normalizeAction(action) {
    return ACTION_ALIASES[action] || action;
  }

  /** @private */
  _bindEvents() {
    window.addEventListener('keydown', this._onKeyDown, { passive: false });
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    window.addEventListener('pointerdown', this._onMouseDown);
    window.addEventListener('pointerup', this._onMouseUp);
    window.addEventListener('wheel', this._onWheel, { passive: true });
    window.addEventListener('blur', this._onWindowBlur);
    document.addEventListener('mouseleave', this._onWindowBlur);
    document.addEventListener('pointerlockchange', this._onPointerLockChange);

    if (this._canvas) {
      this._canvas.addEventListener('contextmenu', this._onContextMenu);
      this._canvas.addEventListener('touchstart', this._onTouchStart, { passive: true });
    }
  }

  /** @private */
  _handleKeyDown(e) {
    const code = e.code;

    // Switch seamlessly to PC mode on physical keyboard interaction (when in AUTO)
    if (this._controlMode === 'auto' && this._touchMode && !e.isComposing) {
      this._touchMode = false;
    }

    if (this.isPointerLocked() && PREVENT_DEFAULT_CODES.has(code)) {
      e.preventDefault();
    }

    const wasDown = this._codesDown.has(code);
    this._codesDown.add(code);

    if (!wasDown && !e.repeat) {
      const action = KEY_TO_ACTION[code];
      if (action) {
        this._pressedActions.set(action, performance.now());
      }
    }
  }

  /** @private */
  _handleKeyUp(e) {
    this._codesDown.delete(e.code);
  }

  /** @private */
  _isPlayingFallbackActive() {
    return Boolean(
      typeof document !== 'undefined' &&
      document.body &&
      document.body.classList.contains('playing-active') &&
      this._controlMode !== 'touch'
    );
  }

  /** @private */
  _handleMouseMove(e) {
    const locked = this.isPointerLocked();
    if (!locked && !this._isPlayingFallbackActive()) {
      this._lastFallbackMouseX = null;
      this._lastFallbackMouseY = null;
      return;
    }

    if (this._controlMode === 'auto') this._touchMode = false;

    let mx = 0;
    let my = 0;

    if (locked) {
      this._lastFallbackMouseX = null;
      this._lastFallbackMouseY = null;
      if (this._ignoreMouseMoveCount > 0) {
        this._ignoreMouseMoveCount--;
        return;
      }
      mx = e.movementX || 0;
      my = e.movementY || 0;
    } else {
      // Smooth non-pointer-lock fallback + track edge-zone coords for continuous 360° turn at HTML walls
      const cx = e.clientX;
      const cy = e.clientY;
      const vw = Math.max(1, window.innerWidth || 1280);
      const vh = Math.max(1, window.innerHeight || 720);
      this._cursorNormX = Math.max(0, Math.min(1, cx / vw));
      this._cursorNormY = Math.max(0, Math.min(1, cy / vh));
      this._cursorInsideViewport = true;
      this._lastMouseMoveTime = performance.now();

      if (this._lastFallbackMouseX !== null && this._lastFallbackMouseY !== null) {
        mx = cx - this._lastFallbackMouseX;
        my = cy - this._lastFallbackMouseY;
      }
      this._lastFallbackMouseX = cx;
      this._lastFallbackMouseY = cy;
    }

    // Clamp spikes smoothly instead of dropping the frame (eliminates micro-stutter on fast flicks)
    if (Math.abs(mx) > MAX_MOUSE_EVENT_DELTA) mx = Math.sign(mx) * MAX_MOUSE_EVENT_DELTA;
    if (Math.abs(my) > MAX_MOUSE_EVENT_DELTA) my = Math.sign(my) * MAX_MOUSE_EVENT_DELTA;

    this._lookDeltaX += mx * this._radPerPx;
    this._lookDeltaY += my * this._radPerPx;
  }

  /** @private */
  _handleMouseDown(e) {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    const locked = this.isPointerLocked();
    if (!locked) {
      if (!this._isPlayingFallbackActive()) return;
      // Ignore clicks on HUD buttons (pause, weapon slots, etc.)
      if (e.target && typeof e.target.closest === 'function' && e.target.closest('button')) {
        return;
      }
    }

    if (this._controlMode === 'auto') this._touchMode = false;

    if (e.button === 0) {
      if (!this._mouseActionsDown.has('fire')) {
        this._pressedActions.set('fire', performance.now());
      }
      this._mouseActionsDown.add('fire');
    } else if (e.button === 2) {
      if (!this._mouseActionsDown.has('ads')) {
        this._pressedActions.set('ads', performance.now());
      }
      this._mouseActionsDown.add('ads');
    }
  }

  /** @private */
  _handleMouseUp(e) {
    if (e.button === 0) {
      this._mouseActionsDown.delete('fire');
    } else if (e.button === 2) {
      this._mouseActionsDown.delete('ads');
    }
  }

  /** @private */
  _handleWheel(e) {
    if (!this.isPointerLocked() && !this._isPlayingFallbackActive()) return;
    if (Math.abs(e.deltaY) < 1) return;

    const now = performance.now();
    // Light debounce to prevent trackpad momentum from skipping multiple weapons in 1 tick
    if (now - this._lastWheelTime < 70) return;
    this._lastWheelTime = now;

    this._wheelDelta += e.deltaY > 0 ? 1 : -1;
  }

  /** @private */
  _handleContextMenu(e) {
    e.preventDefault();
  }

  /** @private */
  _handlePointerLockChange() {
    if (this.isPointerLocked()) {
      if (this._controlMode === 'auto') this._touchMode = false;
      this._ignoreMouseMoveCount = 2;
      this._lookDeltaX = 0;
      this._lookDeltaY = 0;
    } else {
      this._ignoreMouseMoveCount = 0;
      // Clear held inputs when pointer lock releases so fire/movement never sticks
      this._mouseActionsDown.clear();
      this._codesDown.clear();
    }
  }

  /** @private */
  _handleWindowBlur() {
    this.resetAll();
  }

  /** @private */
  _handleTouchStart() {
    if (this._controlMode === 'auto') this._touchMode = true;
  }

  // ---------------------------------------------------------------------------
  // Pointer Lock API
  // ---------------------------------------------------------------------------

  /**
   * Request pointer lock on the game canvas (safe on mobile/desktop).
   */
  requestPointerLock() {
    if (!this._canvas || typeof this._canvas.requestPointerLock !== 'function') {
      return;
    }
    try {
      const maybePromise = this._canvas.requestPointerLock();
      if (maybePromise && typeof maybePromise.catch === 'function') {
        maybePromise.catch(() => {});
      }
    } catch {
      // Ignored when browser requires a direct user gesture or rejects pointer lock
    }
  }

  /**
   * Exit pointer lock if currently locked.
   */
  exitPointerLock() {
    if (document.pointerLockElement && typeof document.exitPointerLock === 'function') {
      try {
        document.exitPointerLock();
      } catch {
        // Ignore
      }
    }
  }

  /**
   * @returns {boolean}
   */
  isPointerLocked() {
    return Boolean(this._canvas && document.pointerLockElement === this._canvas);
  }

  // ---------------------------------------------------------------------------
  // Sensitivity & Touch Overlay API
  // ---------------------------------------------------------------------------

  /**
   * Configure look sensitivity.
   * Accepts either a UI multiplier (e.g. 0.2..3.0, default 1.0) or raw rad/px (< 0.05).
   * @param {number} s
   */
  setSensitivity(s) {
    if (!Number.isFinite(s) || s <= 0) return;
    if (s < 0.05) {
      this._radPerPx = s;
      this._sensitivityMultiplier = s / BASE_MOUSE_RAD_PER_PX;
    } else {
      this._sensitivityMultiplier = Math.max(0.1, Math.min(5.0, s));
      this._radPerPx = BASE_MOUSE_RAD_PER_PX * this._sensitivityMultiplier;
    }
  }

  /**
   * Set virtual thumbstick movement vector (x: -1..1 right/left, y: -1..1 forward/back).
   * @param {number} x
   * @param {number} y
   */
  setTouchMove(x, y) {
    this._touchMoveX = Math.max(-1, Math.min(1, x || 0));
    this._touchMoveY = Math.max(-1, Math.min(1, y || 0));
    if (this._controlMode === 'auto' && (Math.abs(this._touchMoveX) > 0.01 || Math.abs(this._touchMoveY) > 0.01)) {
      this._touchMode = true;
    }
  }

  /**
   * Accumulate touch look drag delta in screen pixels.
   * @param {number} dx
   * @param {number} dy
   */
  addTouchLook(dx, dy) {
    if (this._controlMode === 'auto') this._touchMode = true;
    const scale = this._radPerPx * TOUCH_LOOK_MULTIPLIER;
    this._lookDeltaX += (dx || 0) * scale;
    this._lookDeltaY += (dy || 0) * scale;
  }

  /**
   * Set held state for a touch action button ('fire', 'ads', 'sprint', 'slide', etc.).
   * @param {string} action
   * @param {boolean} isDown
   */
  setTouchAction(action, isDown) {
    const canon = this._normalizeAction(action);
    if (isDown) {
      if (this._controlMode === 'auto') this._touchMode = true;
      if (!this._touchActionsDown.has(canon)) {
        this._pressedActions.set(canon, performance.now());
      }
      this._touchActionsDown.add(canon);
    } else {
      this._touchActionsDown.delete(canon);
    }
  }

  /**
   * Fire a one-shot touch action button ('jump', 'dash', 'reload', 'melee', 'slot1'..'slot4', 'pause').
   * @param {string} action
   */
  triggerTouchAction(action) {
    const canon = this._normalizeAction(action);
    if (this._controlMode === 'auto') this._touchMode = true;
    this._pressedActions.set(canon, performance.now());
  }

  /**
   * Lock input handling to 'pc', 'touch', or dynamic 'auto' detection.
   * @param {'auto' | 'pc' | 'touch'} mode
   */
  setControlMode(mode) {
    const normalized = mode === 'pc' || mode === 'touch' ? mode : 'auto';
    this._controlMode = normalized;
    if (normalized === 'pc') {
      this._touchMode = false;
    } else if (normalized === 'touch') {
      this._touchMode = true;
    }
  }

  /**
   * @returns {'auto' | 'pc' | 'touch'}
   */
  getControlMode() {
    return this._controlMode;
  }

  /**
   * Explicitly toggle touch mode.
   * @param {boolean} enabled
   */
  setTouchMode(enabled) {
    this._touchMode = Boolean(enabled);
  }

  /**
   * @returns {boolean}
   */
  isTouchMode() {
    if (this._controlMode === 'pc') return false;
    if (this._controlMode === 'touch') return true;
    return this._touchMode;
  }

  // ---------------------------------------------------------------------------
  // Per-frame Polling API (zero allocation)
  // ---------------------------------------------------------------------------

  /**
   * Get normalized movement vector { x: right(+)/left(-), y: forward(+)/back(-) }.
   * Reuses an internal scratch object.
   * @returns {{ x: number, y: number }}
   */
  getMoveVector() {
    let x = 0;
    let y = 0;

    if (this._codesDown.has('KeyD') || this._codesDown.has('ArrowRight')) x += 1;
    if (this._codesDown.has('KeyA') || this._codesDown.has('ArrowLeft')) x -= 1;
    if (this._codesDown.has('KeyW') || this._codesDown.has('ArrowUp')) y += 1;
    if (this._codesDown.has('KeyS') || this._codesDown.has('ArrowDown')) y -= 1;

    x += this._touchMoveX;
    y += this._touchMoveY;

    const lenSq = x * x + y * y;
    if (lenSq > 1) {
      const invLen = 1 / Math.sqrt(lenSq);
      x *= invLen;
      y *= invLen;
    }

    this._moveOut.x = x;
    this._moveOut.y = y;
    return this._moveOut;
  }

  /**
   * Consume accumulated look delta (in radians) since last frame.
   * Reuses an internal scratch object.
   * @returns {{ x: number, y: number }}
   */
  consumeLookDelta() {
    let lx = this._lookDeltaX;
    let ly = this._lookDeltaY;
    this._lookDeltaX = 0;
    this._lookDeltaY = 0;

    this._lookOut.x = lx;
    this._lookOut.y = ly;
    return this._lookOut;
  }

  /**
   * Check whether a continuous action is currently held down.
   * @param {string} action
   * @returns {boolean}
   */
  isDown(action) {
    const canon = this._normalizeAction(action);
    if (this._mouseActionsDown.has(canon) || this._touchActionsDown.has(canon)) {
      return true;
    }
    switch (canon) {
      case 'sprint':
        return this._codesDown.has('ShiftLeft') || this._codesDown.has('ShiftRight');
      case 'slide':
        return this._codesDown.has('ControlLeft') || this._codesDown.has('KeyC');
      case 'jump':
        return this._codesDown.has('Space');
      case 'dash':
        return this._codesDown.has('KeyQ') || this._codesDown.has('AltLeft');
      case 'guard':
        return this._codesDown.has('KeyE');
      case 'ultimate':
        return this._codesDown.has('KeyX');
      case 'reload':
        return this._codesDown.has('KeyR');
      case 'melee':
        return this._codesDown.has('KeyV');
      case 'interact':
        return this._codesDown.has('KeyF');
      case 'slot1':
        return this._codesDown.has('Digit1');
      case 'slot2':
        return this._codesDown.has('Digit2');
      case 'slot3':
        return this._codesDown.has('Digit3');
      case 'slot4':
        return this._codesDown.has('Digit4');
      case 'pause':
        return this._codesDown.has('KeyP') || this._codesDown.has('Escape');
      default:
        return false;
    }
  }

  /**
   * Consume a one-shot action press edge if recorded within the last 150ms.
   * Prevents stale unconsumed inputs from triggering phantom shots or abilities later.
   * @param {string} action
   * @returns {boolean}
   */
  consumePressed(action) {
    const canon = this._normalizeAction(action);
    const ts = this._pressedActions.get(canon);
    if (ts !== undefined) {
      this._pressedActions.delete(canon);
      return performance.now() - ts <= PRESSED_TTL_MS;
    }
    return false;
  }

  /**
   * Optional end-of-frame cleanup hook that purges expired press timestamps.
   */
  endFrame() {
    if (this._pressedActions.size === 0) return;
    const now = performance.now();
    for (const [action, ts] of this._pressedActions) {
      if (now - ts > PRESSED_TTL_MS) {
        this._pressedActions.delete(action);
      }
    }
  }

  /**
   * Consume accumulated mouse wheel steps (+1 scroll down, -1 scroll up).
   * @returns {number}
   */
  consumeWheelDelta() {
    const delta = this._wheelDelta;
    this._wheelDelta = 0;
    return delta;
  }

  /**
   * Reset all held keys, pressed buffers, touch sticks, and deltas.
   */
  resetAll() {
    this._codesDown.clear();
    this._mouseActionsDown.clear();
    this._touchActionsDown.clear();
    this._pressedActions.clear();
    this._ignoreMouseMoveCount = 0;
    this._touchMoveX = 0;
    this._touchMoveY = 0;
    this._lookDeltaX = 0;
    this._lookDeltaY = 0;
    this._wheelDelta = 0;
    this._lastFallbackMouseX = null;
    this._lastFallbackMouseY = null;
    this._cursorInsideViewport = false;
    this._cursorNormX = 0.5;
    this._cursorNormY = 0.5;
  }

  /**
   * Clean up all DOM event listeners.
   */
  dispose() {
    this.resetAll();
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mouseup', this._onMouseUp);
    window.removeEventListener('wheel', this._onWheel);
    window.removeEventListener('blur', this._onWindowBlur);
    document.removeEventListener('pointerlockchange', this._onPointerLockChange);

    if (this._canvas) {
      this._canvas.removeEventListener('contextmenu', this._onContextMenu);
      this._canvas.removeEventListener('touchstart', this._onTouchStart);
    }
  }
}
  __exports.InputManager = InputManager;
});
