// Module: src/core/EventBus.js
__define("src/core/EventBus.js", (__exports, __require) => {
/**
 * Decoupled publish/subscribe event bus for NEON PROTOCOL.
 * Uses cached listener snapshots for zero per-emit heap allocations
 * while remaining 100% safe against re-entrant on/off/clear during emit.
 */
class EventBus {
  constructor() {
    /** @type {Map<string, { set: Set<Function>, snapshot: Array<Function> | null }>} */
    this._listeners = new Map();
  }

  /**
   * Subscribe to an event.
   * @param {string} event
   * @param {(payload?: any) => void} listener
   * @returns {() => void} Unsubscribe function
   */
  on(event, listener) {
    if (!event || typeof listener !== 'function') {
      return () => {};
    }
    let entry = this._listeners.get(event);
    if (!entry) {
      entry = { set: new Set(), snapshot: null };
      this._listeners.set(event, entry);
    }
    if (!entry.set.has(listener)) {
      entry.set.add(listener);
      entry.snapshot = null;
    }
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      this.off(event, listener);
    };
  }

  /**
   * Subscribe to an event once.
   * @param {string} event
   * @param {(payload?: any) => void} listener
   * @returns {() => void} Unsubscribe function
   */
  once(event, listener) {
    if (!event || typeof listener !== 'function') {
      return () => {};
    }
    const wrapper = (payload) => {
      unsub();
      listener(payload);
    };
    const unsub = this.on(event, wrapper);
    return unsub;
  }

  /**
   * Unsubscribe a listener from an event.
   * @param {string} event
   * @param {Function} listener
   */
  off(event, listener) {
    const entry = this._listeners.get(event);
    if (!entry) return;
    if (entry.set.delete(listener)) {
      entry.snapshot = null;
      if (entry.set.size === 0) {
        this._listeners.delete(event);
      }
    }
  }

  /**
   * Emit an event with an optional payload.
   * Zero allocations on steady-state calls; safe if listeners subscribe/unsubscribe mid-emission.
   * @param {string} event
   * @param {any} [payload]
   */
  emit(event, payload) {
    if (!event) return;
    const entry = this._listeners.get(event);
    if (!entry || entry.set.size === 0) return;

    if (entry.snapshot === null) {
      entry.snapshot = Array.from(entry.set);
    }

    const snapshot = entry.snapshot;
    const set = entry.set;
    for (let i = 0; i < snapshot.length; i++) {
      const listener = snapshot[i];
      if (set.has(listener)) {
        listener(payload);
      }
    }
  }

  /**
   * Clear all listeners, or only listeners for a specific event.
   * @param {string} [event]
   */
  clear(event) {
    if (event !== undefined) {
      const entry = this._listeners.get(event);
      if (entry) {
        entry.set.clear();
        entry.snapshot = null;
        this._listeners.delete(event);
      }
    } else {
      for (const entry of this._listeners.values()) {
        entry.set.clear();
        entry.snapshot = null;
      }
      this._listeners.clear();
    }
  }
}
  __exports.EventBus = EventBus;
});
