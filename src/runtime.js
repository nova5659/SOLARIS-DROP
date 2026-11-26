// SOLARIS DROP // SKYWARD PROTOCOL — Zero-Build Modular Runtime Loader
import * as THREE from "three";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";

// Expose shared Three.js imports to modular game files
globalThis.THREE = THREE;
globalThis.OutputPass = OutputPass;
globalThis.UnrealBloomPass = UnrealBloomPass;
globalThis.RenderPass = RenderPass;
globalThis.EffectComposer = EffectComposer;

const __modules = Object.create(null);
const __cache = Object.create(null);

globalThis.__define = function __define(id, factory) {
  __modules[id] = factory;
};

globalThis.__require = function __require(id) {
  if (__cache[id]) return __cache[id];
  const exports = {};
  __cache[id] = exports;
  const factory = __modules[id];
  if (!factory) {
    throw new Error("AETHER DROP Module Error — missing module: " + id);
  }
  factory(exports, globalThis.__require);
  return exports;
};

// Add any new module files (e.g. "./world/Map4Builder.js") to this list:
const MODULE_FILES = [
  "./config/constants.js",
  "./config/waves.js",
  "./core/EventBus.js",
  "./core/Engine.js",
  "./core/InputManager.js",
  "./physics/CollisionWorld.js",
  "./player/PlayerController.js",
  "./world/TextureGenerator.js",
  "./world/ArenaBuilder.js",
  "./world/Map2RefineryBuilder.js",
  "./world/Map3CitadelBuilder.js",
  "./world/Map4AegisFlightDeckBuilder.js",
  "./world/Map5AegisReactorBayBuilder.js",
  "./world/Map6OrbitalDrydockBuilder.js",
  "./world/TutorialMapBuilder.js",
  "./world/MapManager.js",
  "./world/Interactables.js",
  "./vfx/VfxManager.js",
  "./config/weapons.js",
  "./weapons/WeaponModelFactory.js",
  "./weapons/WeaponSystem.js",
  "./ai/EnemyModelFactory.js",
  "./ai/EnemyAI.js",
  "./ai/WaveDirector.js",
  "./audio/SoundEngine.js",
  "./ui/HudManager.js",
  "./ui/TouchOverlay.js",
  "./main.js"
];

async function bootModularGame() {
  await Promise.all(MODULE_FILES.map((relPath) => import(relPath + "?v=solaris2")));
  globalThis.__require("src/main.js");
}

bootModularGame().catch((err) => {
  console.error("[SOLARIS DROP] Failed to load modular scripts:", err);
  const fb = document.getElementById("webgl-fallback");
  const msg = document.getElementById("webgl-fallback-msg");
  if (msg) msg.textContent = "모듈 로딩 오류: " + (err && err.message ? err.message : String(err));
  if (fb) fb.classList.remove("hidden");
});
