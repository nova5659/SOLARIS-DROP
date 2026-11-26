// Module: src/world/MapManager.js
__define("src/world/MapManager.js", (__exports, __require) => {
const { MAPS } = __require("src/config/constants.js");
const { TextureGenerator } = __require("src/world/TextureGenerator.js");
const { ArenaBuilder } = __require("src/world/ArenaBuilder.js");
const { Map2RefineryBuilder } = __require("src/world/Map2RefineryBuilder.js");
const { Map3CitadelBuilder } = __require("src/world/Map3CitadelBuilder.js");
const { Map4AegisFlightDeckBuilder } = __require("src/world/Map4AegisFlightDeckBuilder.js");
const { Map5AegisReactorBayBuilder } = __require("src/world/Map5AegisReactorBayBuilder.js");
const { Map6OrbitalDrydockBuilder } = __require("src/world/Map6OrbitalDrydockBuilder.js");
const { TutorialMapBuilder } = __require("src/world/TutorialMapBuilder.js");

/**
 * Campaign Map Manager for AETHER DROP: RECLAIM EARTH.
 * Manages clean 6-map rotation across:
 * - 0: SECTOR-09 // DEAD METROPOLIS (ArenaBuilder)
 * - 1: SECTOR-14 // SUNKEN REFINERY (Map2RefineryBuilder)
 * - 2: SECTOR-00 // THE CRATER CITADEL (Map3CitadelBuilder)
 * - 3: SECTOR-61 // AEGIS FLIGHT DECK (Map4AegisFlightDeckBuilder)
 * - 4: SECTOR-74 // AEGIS REACTOR BAY (Map5AegisReactorBayBuilder)
 * - 5: SECTOR-99 // AEGIS DRYDOCK (Map6OrbitalDrydockBuilder)
 *
 * Owns a single shared TextureGenerator instance so procedural CanvasTextures
 * stay cached across transitions and dispose cleanly with zero GPU memory leaks.
 */
class MapManager {
  /**
   * @param {import('three').Scene} scene
   * @param {import('../physics/CollisionWorld.js').CollisionWorld} collisionWorld
   * @param {import('../core/Engine.js').Engine} engine
   */
  constructor(scene, collisionWorld, engine) {
    this.scene = scene;
    this.collisionWorld = collisionWorld;
    this.engine = engine;

    this._texGen = new TextureGenerator(4);
    this._activeBuilder = null;
    this._currentMapIndex = 0;
    this._currentArenaData = null;
  }

  /**
   * Dispose the currently loaded sector, reset CollisionWorld, build the target
   * sector (0..5), apply its atmosphere via Engine, and return arenaData.
   *
   * @param {number} mapIndex
   * @returns {any}
   */
  loadMap(mapIndex) {
    const parsed = Number.isFinite(mapIndex) ? Math.floor(mapIndex) : 0;
    const idx = parsed >= 0 && parsed <= 6 ? parsed : 0;

    if (this._activeBuilder) {
      this._activeBuilder.dispose();
      this._activeBuilder = null;
    }

    if (this.collisionWorld && typeof this.collisionWorld.clear === 'function') {
      this.collisionWorld.clear();
    }

    const qualityConfig =
      this.engine && typeof this.engine.getQualityConfig === 'function'
        ? this.engine.getQualityConfig()
        : {};

    let builder;
    if (idx === 1) {
      builder = new Map2RefineryBuilder(this.scene, this.collisionWorld, qualityConfig, this._texGen);
    } else if (idx === 2) {
      builder = new Map3CitadelBuilder(this.scene, this.collisionWorld, qualityConfig, this._texGen);
    } else if (idx === 3) {
      builder = new Map4AegisFlightDeckBuilder(this.scene, this.collisionWorld, qualityConfig, this._texGen);
    } else if (idx === 4) {
      builder = new Map5AegisReactorBayBuilder(this.scene, this.collisionWorld, qualityConfig, this._texGen);
    } else if (idx === 5) {
      builder = new Map6OrbitalDrydockBuilder(this.scene, this.collisionWorld, qualityConfig, this._texGen);
    } else if (idx === 6) {
      builder = new TutorialMapBuilder(this.scene, this.collisionWorld, qualityConfig, this._texGen);
    } else {
      builder = new ArenaBuilder(this.scene, this.collisionWorld, qualityConfig, this._texGen);
    }

    this._activeBuilder = builder;
    const arenaData = builder.build();

    if (
      this.engine &&
      typeof this.engine.setAtmosphere === 'function' &&
      arenaData &&
      arenaData.atmosphere
    ) {
      this.engine.setAtmosphere(arenaData.atmosphere);
    }
    if (this.engine && typeof this.engine.bakeStaticShadows === 'function') {
      this.engine.bakeStaticShadows();
    }

    this._currentMapIndex = idx;
    this._currentArenaData = arenaData;
    return arenaData;
  }

  /**
   * Forward per-frame animated environment updates to the active map builder.
   * @param {number} dt
   * @param {number} elapsedTime
   */
  update(dt, elapsedTime) {
    if (this._activeBuilder && typeof this._activeBuilder.update === 'function') {
      this._activeBuilder.update(dt, elapsedTime);
    }
  }

  /**
   * Forward dynamic quality preset changes to the active map builder.
   * @param {any} qualityConfig
   */
  setQuality(qualityConfig) {
    if (this._activeBuilder && typeof this._activeBuilder.setQuality === 'function') {
      this._activeBuilder.setQuality(qualityConfig);
    }
  }

  /**
   * Return the active map index (0, 1, or 2).
   * @returns {number}
   */
  getCurrentMapIndex() {
    return this._currentMapIndex;
  }

  /**
   * Return metadata for the active map from constants.MAPS.
   */
  getCurrentMapMeta() {
    return MAPS[this._currentMapIndex] || MAPS[0];
  }

  /**
   * Dispose the active map builder and all shared procedural textures.
   */
  dispose() {
    if (this._activeBuilder) {
      this._activeBuilder.dispose();
      this._activeBuilder = null;
    }
    if (this._texGen) {
      this._texGen.dispose();
      this._texGen = null;
    }
    this._currentArenaData = null;
  }
}
  __exports.MapManager = MapManager;
});
