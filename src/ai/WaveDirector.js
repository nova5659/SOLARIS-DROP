// Module: src/ai/WaveDirector.js
__define("src/ai/WaveDirector.js", (__exports, __require) => {
const { EVENTS, SCORE_CONFIG, PLAYER_CONFIG, ARENA_CONFIG } = __require("src/config/constants.js");
const { ENEMY_ARCHETYPES, WAVES } = __require("src/config/waves.js");
const { EnemyModelFactory } = __require("src/ai/EnemyModelFactory.js");
const { Enemy } = __require("src/ai/EnemyAI.js");

const MAX_PROJECTILES = 64;
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const ZERO_SPAWN_POS = new THREE.Vector3(0, 0, 0);

const POOL_CAPACITIES = Object.freeze({
  rusher_drone: 7,
  tactical_trooper: 7,
  heavy_enforcer: 4,
  sniper_stalker: 4,
  cyber_mech_boss: 1,
  interceptor_drone: 6,
  shock_breacher: 5,
  rail_warden: 4,
  mortar_artillery: 4,
  vanguard_assassin: 5,
  aegis_overlord_boss: 1,
});

const PROJECTILE_COLORS = Object.freeze({
  rusher_drone: 0xff7722,
  tactical_trooper: 0xff4422,
  heavy_enforcer: 0xff2200,
  sniper_stalker: 0xe63946,
  cyber_mech_boss: 0xff2200,
  interceptor_drone: 0xf59e0b,
  shock_breacher: 0xff5a1f,
  rail_warden: 0xff6b1a,
  mortar_artillery: 0xfbbf24,
  vanguard_assassin: 0xff3b14,
  aegis_overlord_boss: 0x0ea5e9,
});

const FALLBACK_SPAWNS = [
  { x: -24, y: 0, z: -24, elevated: false },
  { x: 24, y: 0, z: -24, elevated: false },
  { x: -24, y: 0, z: 24, elevated: false },
  { x: 24, y: 0, z: 24, elevated: false },
  { x: 0, y: 0, z: -26, elevated: false },
  { x: 0, y: 0, z: 26, elevated: false },
  { x: -26, y: 0, z: 0, elevated: false },
  { x: 26, y: 0, z: 0, elevated: false },
  { x: -18, y: 4.0, z: -18, elevated: true },
  { x: 18, y: 4.0, z: -18, elevated: true },
  { x: -18, y: 4.0, z: 18, elevated: true },
  { x: 18, y: 4.0, z: 18, elevated: true },
];

/**
 * Compute squared distance from a 3D line segment P0->P1 to a vertical capsule segment
 * centered at (cx, yBottom..yTop, cz). Zero allocations.
 */
function segmentToVerticalCapsuleDistSq(p0x, p0y, p0z, p1x, p1y, p1z, cx, yBot, yTop, cz) {
  const dx = p1x - p0x;
  const dy = p1y - p0y;
  const dz = p1z - p0z;

  // Closest point along projectile XZ segment to capsule axis (cx, cz)
  const xzLenSq = dx * dx + dz * dz;
  let t = 0;
  if (xzLenSq > 1e-8) {
    t = ((cx - p0x) * dx + (cz - p0z) * dz) / xzLenSq;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
  }

  const qx = p0x + dx * t;
  const qy = p0y + dy * t;
  const qz = p0z + dz * t;

  let clampedY = qy;
  if (clampedY < yBot) clampedY = yBot;
  else if (clampedY > yTop) clampedY = yTop;

  const ex = qx - cx;
  const ey = qy - clampedY;
  const ez = qz - cz;
  return ex * ex + ey * ey + ez * ez;
}

/**
 * AETHER DROP: RECLAIM EARTH — Escalating 5-Wave + Terra-Beacon Control Zone + 3-Phase Boss Director
 * Manages out-of-sight tactical spawning, pre-allocated pooled enemy rigs & projectiles with wall &
 * player capsule collision, 3-map campaign transitions, combo multipliers, score/kill telemetry,
 * and adaptive combat intensity scoring.
 */
class WaveDirector {
  /**
   * @param {THREE.Scene} scene
   * @param {import('../physics/CollisionWorld.js').CollisionWorld} collisionWorld
   * @param {import('../core/EventBus.js').EventBus} eventBus
   * @param {any} arenaData
   * @param {any} [vfxManager=null]
   */
  constructor(scene, collisionWorld, eventBus, arenaData, vfxManager = null) {
    this.scene = scene;
    this.collisionWorld = collisionWorld;
    this.eventBus = eventBus;
    this.arenaData = arenaData || null;
    this.vfxManager = vfxManager || null;
    this._soundEngine = null;
    this._interactables = null;

    this.modelFactory = new EnemyModelFactory();
    this._spawnPoints = this._normalizeSpawnPoints(arenaData);

    // Active enemies, pre-allocated rig pool & zero-GC target list
    this._enemyGroup = new THREE.Group();
    this._enemyGroup.name = 'enemy_pool_group';
    this.scene.add(this._enemyGroup);

    /** @type {Record<string, Array<Enemy>>} */
    this._enemyPool = {
      rusher_drone: [],
      tactical_trooper: [],
      heavy_enforcer: [],
      sniper_stalker: [],
      cyber_mech_boss: [],
      interceptor_drone: [],
      shock_breacher: [],
      rail_warden: [],
      mortar_artillery: [],
      vanguard_assassin: [],
      aegis_overlord_boss: [],
    };
    this._prewarmed = false;

    /** @type {Array<Enemy>} */
    this._enemies = [];
    /** @type {Array<Enemy>} */
    this._livingTargets = [];
    this._nextEnemyId = 1;

    // Wave progression, 6-map campaign transition & spawning state
    this._active = false;
    this._tutorialMode = false;
    this._currentWaveIndex = -1;
    this._currentWaveTotalEnemies = 0;
    this._currentMapIndex = WAVES[0]?.mapIndex ?? 0;
    this._awaitingMapTransition = false;
    this._spawnQueue = [];
    this._spawnTimer = 0;
    this._inIntermission = false;
    this._intermissionTimer = 0;
    this._draftPaused = false;
    this._killsSinceWeaponDrop = 0;
    this._bossMissileTimer = 4.5;
    this._bossSpecialCycle = 0;
    this._victory = false;
    this._bossEntity = null;

    // Hybrid Control Zone pacing state
    this._waveZoneBonusAwarded = false;
    this._reinforcementsSpawned = 0;
    this._reinforcementTimer = 0;
    this._fallbackZoneProgress = 0;
    this._emptyZoneClearTimer = 0;

    // Score, combo & combat stats
    this.score = 0;
    this.combo = 1;
    this._comboTimer = 0;
    this.totalKills = 0;
    this.headshots = 0;
    this._combatIntensity = 0;

    // Pre-allocated pooled enemy projectiles (zero per-shot heap allocations!)
    this._projGroup = new THREE.Group();
    this._projGroup.name = 'enemy_projectiles';
    this.scene.add(this._projGroup);
    this._projectiles = this._createProjectilePool();

    // Bound callbacks (avoid per-frame closures)
    this._boundSpawnProjectile = this._spawnProjectile.bind(this);
    this._boundOnEnemyDeath = this._handleEnemyDeath.bind(this);
    this._boundOnBossPhase = this._handleBossPhase.bind(this);

    this._unsubBossPhase = this.eventBus
      ? this.eventBus.on(EVENTS.BOSS_PHASE, this._boundOnBossPhase)
      : () => {};

    // Pre-allocated scratch structures & zero-GC snapshots
    this._playerEye = new THREE.Vector3();
    this._playerLook = new THREE.Vector3();
    this._spawnCandidate = new THREE.Vector3();
    this._spawnEye = new THREE.Vector3();
    this._prevProjPos = new THREE.Vector3();
    this._rayHit = {
      hit: false,
      distance: 0,
      point: new THREE.Vector3(),
      normal: new THREE.Vector3(),
      tag: '',
    };

    this._bossStateSnapshot = {
      active: false,
      name: '',
      hp: 0,
      maxHp: 1,
      hpRatio: 0,
      phase: 1,
      phaseName: '',
      shieldActive: false,
      position: new THREE.Vector3(),
    };

    this._hudSnapshot = {
      wave: 0,
      totalWaves: WAVES.length,
      waveName: '',
      subtitle: '',
      objective: '',
      objectiveType: 'eliminate',
      controlZoneActive: false,
      isBossWave: false,
      enemiesRemaining: 0,
      enemiesAlive: 0,
      enemiesQueued: 0,
      score: 0,
      combo: 1,
      comboProgress: 0,
      kills: 0,
      headshots: 0,
      inIntermission: false,
      intermissionRemaining: 0,
      awaitingMapTransition: false,
      mapIndex: this._currentMapIndex,
      victory: false,
      combatIntensity: 0,
      zoneProgress: 0,
    };
  }

  /**
   * Optional hook to route 3D spatialized enemy gunfire into SoundEngine.
   * @param {import('../audio/SoundEngine.js').SoundEngine} soundEngine
   */
  setSoundEngine(soundEngine) {
    this._soundEngine = soundEngine || null;
  }

  /**
   * Optional hook to synchronize Terra-Beacon control zone state with ArenaInteractables.
   * @param {any} interactables
   */
  setInteractables(interactables) {
    this._interactables = interactables || null;
  }

  /**
   * Update active arena data, normalized spawn points, map index, and optional interactables
   * (e.g., resetting a 3-map campaign back to SEC-09 before starting Wave 1).
   *
   * @param {any} arenaData
   * @param {any} [interactables=null]
   */
  setArenaData(arenaData, interactables = null) {
    this.arenaData = arenaData || null;
    this._spawnPoints = this._normalizeSpawnPoints(this.arenaData);
    this._currentMapIndex = this.arenaData?.mapIndex ?? 0;
    if (interactables !== null && interactables !== undefined) {
      this._interactables = interactables;
    }
  }

  /**
   * Normalize enemy spawn point formats from ArenaBuilder.
   * @private
   */
  _normalizeSpawnPoints(arenaData) {
    const raw =
      arenaData && Array.isArray(arenaData.enemySpawns) && arenaData.enemySpawns.length > 0
        ? arenaData.enemySpawns
        : FALLBACK_SPAWNS;

    const points = [];
    for (let i = 0; i < raw.length; i++) {
      const p = raw[i];
      if (!p) continue;
      const pos = p.pos || p.position || p;
      const x = Number(pos.x) || 0;
      const y = Number(pos.y) || 0;
      const z = Number(pos.z) || 0;
      const elevated = Boolean(p.elevated || p.isElevated || p.type === 'sniper' || y >= 2.0);
      points.push({ x, y, z, elevated });
    }
    return points.length > 0 ? points : FALLBACK_SPAWNS;
  }

  /**
   * Pre-allocate 64 pooled glowing plasma bolt meshes.
   * @private
   */
  _createProjectilePool() {
    this._projOuterGeo = new THREE.CylinderGeometry(1, 0.72, 1, 7, 1, false);
    this._projOuterGeo.rotateX(Math.PI * 0.5);
    this._projCoreGeo = new THREE.CylinderGeometry(0.42, 0.35, 1.06, 6, 1, false);
    this._projCoreGeo.rotateX(Math.PI * 0.5);

    this._projCoreMat = new THREE.MeshBasicMaterial({
      color: 0xffe8cc,
      transparent: true,
      opacity: 0.96,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const pool = [];
    for (let i = 0; i < MAX_PROJECTILES; i++) {
      const outerMat = new THREE.MeshBasicMaterial({
        color: 0xff4422,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });

      const mesh = new THREE.Mesh(this._projOuterGeo, outerMat);
      const core = new THREE.Mesh(this._projCoreGeo, this._projCoreMat);
      mesh.add(core);
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = 7;
      this._projGroup.add(mesh);

      pool.push({
        active: false,
        mesh,
        material: outerMat,
        position: new THREE.Vector3(),
        origin: new THREE.Vector3(),
        dir: new THREE.Vector3(),
        speed: 30,
        damage: 10,
        radius: 0.1,
        life: 0,
        maxLife: 3.5,
        archetypeId: '',
      });
    }
    return pool;
  }

  /**
   * Pre-allocate dormant Enemy rigs (7 rusher_drone, 7 tactical_trooper, 4 heavy_enforcer,
   * 4 sniper_stalker, 1 cyber_mech_boss = 23 rigs) inside _enemyGroup for zero-stutter waves.
   * Idempotent: calling multiple times never duplicates pooled rigs.
   */
  prewarm() {
    for (const archetypeId of Object.keys(POOL_CAPACITIES)) {
      const archetype = ENEMY_ARCHETYPES[archetypeId];
      if (!archetype) continue;
      const targetCount = POOL_CAPACITIES[archetypeId];
      const bucket =
        this._enemyPool[archetypeId] || (this._enemyPool[archetypeId] = []);

      while (bucket.length < targetCount) {
        const enemy = new Enemy(
          0,
          archetype,
          ZERO_SPAWN_POS,
          this._enemyGroup,
          this.collisionWorld,
          this.modelFactory,
          this.eventBus,
          null,
          { dormant: true, pooled: true }
        );
        enemy.setDeathCallback(this._boundOnEnemyDeath);
        bucket.push(enemy);
      }
    }
    this._prewarmed = true;
  }

  /**
   * Begin a fresh 5-wave run starting at Wave 1.
   */
  start() {
    this.reset();
    if (!this._prewarmed) {
      this.prewarm();
    }
    this._active = true;
    this._startWave(0);
  }

  /**
   * Reset all active enemies (returning pooled rigs to dormant state), pooled projectiles,
   * wave counters, map transition flags, and combat telemetry.
   */
  reset() {
    for (let i = 0; i < this._enemies.length; i++) {
      this._enemies[i].deactivate();
    }
    for (const key of Object.keys(this._enemyPool)) {
      const bucket = this._enemyPool[key];
      for (let i = 0; i < bucket.length; i++) {
        bucket[i].deactivate();
      }
    }
    this._enemies.length = 0;
    this._livingTargets.length = 0;
    this._bossEntity = null;

    for (let i = 0; i < this._projectiles.length; i++) {
      this._projectiles[i].active = false;
      this._projectiles[i].mesh.visible = false;
    }

    this._active = false;
    this._tutorialMode = false;
    this._currentWaveIndex = -1;
    this._currentWaveTotalEnemies = 0;
    this._currentMapIndex = WAVES[0]?.mapIndex ?? 0;
    this._awaitingMapTransition = false;
    this._spawnQueue.length = 0;
    this._spawnTimer = 0;
    this._inIntermission = false;
    this._intermissionTimer = 0;
    this._draftPaused = false;
    this._killsSinceWeaponDrop = 0;
    this._bossMissileTimer = 4.5;
    this._bossSpecialCycle = 0;
    this._victory = false;

    this._waveZoneBonusAwarded = false;
    this._reinforcementsSpawned = 0;
    this._reinforcementTimer = 0;
    this._fallbackZoneProgress = 0;
    this._emptyZoneClearTimer = 0;

    this.score = 0;
    this.combo = 1;
    this._comboTimer = 0;
    this.totalKills = 0;
    this.headshots = 0;
    this._combatIntensity = 0;

    if (this._interactables) {
      if (typeof this._interactables.resetZone === 'function') {
        this._interactables.resetZone();
      }
      if (typeof this._interactables.setZoneActive === 'function') {
        this._interactables.setZoneActive(false);
      }
      if (typeof this._interactables.setCaptureSpeedMultiplier === 'function') {
        this._interactables.setCaptureSpeedMultiplier(1.0);
      }
    }
  }

  /**
   * Finalize a 3-map campaign sector transition once the new arena & interactables are ready,
   * then immediately begin the queued next wave.
   *
   * @param {any} newArenaData
   * @param {any} [newInteractables=null]
   */
  completeMapTransition(newArenaData, newInteractables = null) {
    if (newArenaData) {
      this.arenaData = newArenaData;
      this._spawnPoints = this._normalizeSpawnPoints(newArenaData);
    }
    if (newInteractables) {
      this._interactables = newInteractables;
    }

    for (let i = 0; i < this._enemies.length; i++) {
      this._enemies[i].deactivate();
    }
    this._enemies.length = 0;
    this._livingTargets.length = 0;
    this._bossEntity = null;

    for (let i = 0; i < this._projectiles.length; i++) {
      this._projectiles[i].active = false;
      this._projectiles[i].mesh.visible = false;
    }

    const nextWaveIndex = this._currentWaveIndex + 1;
    const fallbackMapIdx =
      nextWaveIndex >= 0 && nextWaveIndex < WAVES.length
        ? this._getEffectiveMapIndex(WAVES[nextWaveIndex])
        : this._currentMapIndex;

    this._currentMapIndex =
      newArenaData && typeof newArenaData.mapIndex === 'number'
        ? newArenaData.mapIndex
        : fallbackMapIdx;

    this._awaitingMapTransition = false;

    if (nextWaveIndex >= 0 && nextWaveIndex < WAVES.length) {
      this._startWave(nextWaveIndex);
    }
  }

  /**
   * Resolve map index for a wave (10-wave campaign natively traverses all 6 sectors 0..5).
   * @private
   */
  _getEffectiveMapIndex(wave) {
    return wave && typeof wave.mapIndex === 'number' ? wave.mapIndex : this._currentMapIndex;
  }

  /**
   * Initialize and announce a specific wave index (0..WAVES.length-1).
   * @private
   */
  _startWave(index) {
    if (index < 0 || index >= WAVES.length) return;
    const wave = WAVES[index];
    this._currentWaveIndex = index;
    this._currentMapIndex = this._getEffectiveMapIndex(wave);
    this._awaitingMapTransition = false;
    this._inIntermission = false;
    this._intermissionTimer = 0;

    this._waveZoneBonusAwarded = false;
    this._supplyDroneSpawnedThisWave = false;
    this._reinforcementsSpawned = 0;
    this._reinforcementTimer = 0;
    this._fallbackZoneProgress = 0;
    this._emptyZoneClearTimer = 0;

    // Reset and configure Terra-Beacon control zone & Stage 6-10 tactical gimmicks cleanly for this wave
    if (this._interactables) {
      if (typeof this._interactables.resetZone === 'function') {
        this._interactables.resetZone();
      }
      if (typeof this._interactables.setZoneActive === 'function') {
        this._interactables.setZoneActive(Boolean(wave.controlZoneActive));
      }
      if (typeof this._interactables.setCaptureSpeedMultiplier === 'function') {
        this._interactables.setCaptureSpeedMultiplier(1.0);
      }
      if (typeof this._interactables.setWaveGimmicks === 'function') {
        this._interactables.setWaveGimmicks(wave.gimmick || null);
      }
    }

    // Build wave spawn queue (boss spawns first on Wave 5 & Wave 10; regular units interleaved for variety)
    this._spawnQueue.length = 0;
    const regularPool = [];
    for (let i = 0; i < wave.enemies.length; i++) {
      const entry = wave.enemies[i];
      for (let c = 0; c < entry.count; c++) {
        if (entry.type === 'cyber_mech_boss' || entry.type === 'aegis_overlord_boss') {
          this._spawnQueue.push(entry.type);
        } else {
          regularPool.push(entry.type);
        }
      }
    }

    // Light Fisher-Yates shuffle so waves present mixed-arms pressure immediately
    for (let i = regularPool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = regularPool[i];
      regularPool[i] = regularPool[j];
      regularPool[j] = tmp;
    }
    for (let i = 0; i < regularPool.length; i++) {
      this._spawnQueue.push(regularPool[i]);
    }
    this._currentWaveTotalEnemies = this._spawnQueue.length;

    // Spawn initial contact immediately on next update tick
    this._spawnTimer = 0.25;

    if (this.eventBus) {
      this.eventBus.emit(EVENTS.WAVE_STARTED, {
        wave: wave.wave,
        totalWaves: WAVES.length,
        name: wave.name,
        subtitle: wave.subtitle,
        objective: wave.objective,
        objectiveType: wave.objectiveType,
        controlZoneActive: wave.controlZoneActive,
        isBossWave: wave.isBossWave,
        totalEnemies: this._spawnQueue.length,
      });
    }
  }

  /**
   * Enqueue Boss Phase 2 / Phase 3 escorts immediately upon phase shift.
   * @private
   */
  setDraftPaused(paused) {
    this._draftPaused = Boolean(paused);
  }

  _handleBossPhase(payload) {
    if (!this._active || !payload || !Array.isArray(payload.escorts)) return;
    // Step 2: Boss Phase Transition triggers Ground Shockwave Ring (jump to evade!)
    if (this._bossEntity && this._interactables && typeof this._interactables.spawnBossShockwave === 'function') {
      this._interactables.spawnBossShockwave(this._bossEntity.position);
    }
    for (let i = 0; i < payload.escorts.length; i++) {
      const entry = payload.escorts[i];
      for (let c = 0; c < entry.count; c++) {
        this._spawnQueue.unshift(entry.type);
      }
    }
    // Deploy first escort promptly
    this._spawnTimer = Math.min(this._spawnTimer, 0.45);
  }

  /**
   * Synchronous enemy death handler: updates combo, calculates score, emits EVENTS.ENEMY_KILLED,
   * and fires optional death explosion VFX.
   * @private
   */
  _handleEnemyDeath(enemy, isHeadshot, hitPoint) {
    if (this._comboTimer > 0) {
      this.combo = Math.min(SCORE_CONFIG.maxComboMultiplier, this.combo + 1);
    } else {
      this.combo = 1;
    }
    this._comboTimer = SCORE_CONFIG.comboTimeout;

    const baseScore = enemy.archetype.score + (isHeadshot ? SCORE_CONFIG.headshotBonus : 0);
    const pointsAwarded = Math.round(baseScore * this.combo);
    this.score += pointsAwarded;
    this.totalKills++;
    if (isHeadshot) {
      this.headshots++;
    }

    const wasBoss = enemy === this._bossEntity || Boolean(enemy.archetype && enemy.archetype.isBoss);
    if (enemy === this._bossEntity) {
      this._bossEntity = null;
    }
    if (wasBoss) {
      // Clear any remaining queued escorts so no minions spawn after boss defeat
      this._spawnQueue.length = 0;
      // Immediately terminate all remaining living minions with chain-explosion VFX
      for (let i = 0; i < this._enemies.length; i++) {
        const minion = this._enemies[i];
        if (!minion || minion === enemy || !minion.isAlive) continue;
        minion.hp = 0;
        minion._killProcessed = true;
        minion.die();
        this.totalKills++;
        if (this.vfxManager) {
          const mPos = minion.center;
          if (typeof this.vfxManager.spawnEnemyDeath === 'function') {
            this.vfxManager.spawnEnemyDeath(mPos, minion.archetype.color, false);
          } else if (typeof this.vfxManager.spawnExplosion === 'function') {
            this.vfxManager.spawnExplosion(mPos, 1.0, minion.archetype.color);
          }
        }
        if (this.eventBus) {
          this.eventBus.emit(EVENTS.ENEMY_KILLED, {
            id: minion.id,
            enemy: minion,
            archetype: minion.archetype,
            archetypeId: minion.archetype.id,
            name: minion.archetype.name,
            isBoss: false,
            isHeadshot: false,
            isMelee: false,
            position: minion.position.clone(),
            headPosition: minion.headPosition.clone(),
            hitPoint: minion.center.clone(),
            score: minion.archetype.score,
            totalScore: this.score,
            combo: this.combo,
            kills: this.totalKills,
            headshots: this.headshots,
          });
        }
      }
      // Clear lingering enemy projectiles for a clean boss finish
      for (let p = 0; p < this._projectiles.length; p++) {
        const proj = this._projectiles[p];
        if (proj && proj.active) {
          proj.active = false;
          if (proj.mesh) proj.mesh.visible = false;
        }
      }
    }

    // Step 2: Gold Drop + Low-Chance Weapon Drop (with pity for locked BR-12 / HV-7)
    if (this._interactables) {
      const aid = enemy.archetype.id;
      const isElite =
        aid === 'heavy_enforcer' ||
        aid === 'sniper_stalker' ||
        aid === 'rail_warden' ||
        aid === 'mortar_artillery' ||
        aid === 'vanguard_assassin' ||
        aid === 'shock_breacher';

      if (typeof this._interactables.spawnGoldDrop === 'function') {
        const goldAmt = enemy.archetype.isBoss
          ? (aid === 'aegis_overlord_boss' ? 260 : 150)
          : aid === 'rail_warden'
          ? 36
          : aid === 'mortar_artillery'
          ? 32
          : aid === 'heavy_enforcer'
          ? 30
          : aid === 'vanguard_assassin'
          ? 26
          : aid === 'sniper_stalker'
          ? 24
          : aid === 'shock_breacher'
          ? 22
          : aid === 'interceptor_drone'
          ? 18
          : 14;
        this._interactables.spawnGoldDrop(enemy.position, goldAmt);
        if (enemy.archetype.isBoss) {
          const bonusDrop = aid === 'aegis_overlord_boss' ? 90 : 60;
          this._interactables.spawnGoldDrop(enemy.position, bonusDrop);
          this._interactables.spawnGoldDrop(enemy.position, bonusDrop);
        }
      }
      if (typeof this._interactables.spawnItemDrop === 'function') {
        if (enemy.archetype.isBoss) {
          this._interactables.spawnItemDrop(enemy.position, 'health', 35);
          this._interactables.spawnItemDrop(enemy.position, 'shield', 35);
        } else {
          const dropChance = isElite ? 0.45 : 0.26;
          if (Math.random() < dropChance) {
            const dropType = Math.random() < 0.62 ? 'health' : 'shield';
            this._interactables.spawnItemDrop(enemy.position, dropType, 25);
          }
        }
      }
      if (typeof this._interactables.spawnWeaponDrop === 'function' && !enemy.archetype.isBoss) {
        this._killsSinceWeaponDrop++;
        const baseChance = isElite ? 0.24 : 0.14;
        const pity = this._killsSinceWeaponDrop >= 7 ? 0.45 : 0;
        if (Math.random() < baseChance + pity) {
          this._killsSinceWeaponDrop = 0;
          // 60% Primary (BR-12, HV-7, K-9, M41-A), 40% Special Secondary (T-4, K-0, W-01)
          const pool = Math.random() < 0.6 ? [1, 2, 3, 0] : [5, 6, 4];
          const dropWeaponIdx = pool[Math.floor(Math.random() * pool.length)];
          this._interactables.spawnWeaponDrop(enemy.position, dropWeaponIdx);
        }
      }
    }

    // Optional death burst VFX on VFXManager
    if (this.vfxManager) {
      const burstPos = enemy.center;
      if (typeof this.vfxManager.spawnEnemyDeath === 'function') {
        this.vfxManager.spawnEnemyDeath(burstPos, enemy.archetype.color, enemy.archetype.isBoss);
      } else if (typeof this.vfxManager.spawnExplosion === 'function') {
        this.vfxManager.spawnExplosion(burstPos, enemy.archetype.isBoss ? 2.4 : 1.0, enemy.archetype.color);
      }
    }

    if (this.eventBus) {
      this.eventBus.emit(EVENTS.ENEMY_KILLED, {
        id: enemy.id,
        enemy,
        archetype: enemy.archetype,
        archetypeId: enemy.archetype.id,
        name: enemy.archetype.name,
        isBoss: enemy.archetype.isBoss,
        isHeadshot: Boolean(isHeadshot),
        isMelee: Boolean(enemy.lastHitWasMelee),
        position: enemy.position.clone(),
        headPosition: enemy.headPosition.clone(),
        hitPoint: hitPoint ? hitPoint.clone() : enemy.center.clone(),
        score: pointsAwarded,
        totalScore: this.score,
        combo: this.combo,
        kills: this.totalKills,
        headshots: this.headshots,
      });
    }
  }

  /**
   * Main per-frame update for spawning, enemy AI simulation, projectiles,
   * hybrid control-point wave pacing, and victory condition.
   *
   * @param {number} dt
   * @param {number} elapsedTime
   * @param {import('../player/PlayerController.js').PlayerController} playerController
   * @param {any} [zoneState=null]
   * @param {any} [interactables=null]
   */
  update(dt, elapsedTime, playerController, zoneState = null, interactables = null) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    const clampedDt = dt > 0.05 ? 0.05 : dt;

    if (interactables && !this._interactables) {
      this._interactables = interactables;
    }
    const activeInteractables = interactables || this._interactables;

    // Always update active projectiles cleanly even during intermissions
    this._updateProjectiles(clampedDt, playerController);

    // Combo decay timer
    if (this._comboTimer > 0) {
      this._comboTimer = Math.max(0, this._comboTimer - clampedDt);
      if (this._comboTimer <= 0) {
        this.combo = 1;
      }
    }

    if (!this._active || !playerController) {
      return;
    }

    const playerPos = playerController.position;
    playerController.getEyePosition(this._playerEye);

    // 1. Update all active & dissolving enemies; prune disposed entries
    let livingCount = 0;
    this._livingTargets.length = 0;

    for (let i = this._enemies.length - 1; i >= 0; i--) {
      const enemy = this._enemies[i];
      enemy.update(
        clampedDt,
        elapsedTime,
        playerPos,
        this._playerEye,
        this._boundSpawnProjectile
      );

      // Catch-all safety if an enemy died without hitting the synchronous hook
      if (!enemy.isAlive && !enemy._killProcessed) {
        enemy._killProcessed = true;
        this._handleEnemyDeath(enemy, enemy.lastHitWasHeadshot, enemy.lastHitPoint);
      }

      if (enemy.isRemoved) {
        this._enemies.splice(i, 1);
      } else if (enemy.isAlive) {
        livingCount++;
        this._livingTargets.push(enemy);
      }
    }

    // 2. Pause wave timer/spawns while awaiting 3-map campaign sector transition
    if (this._awaitingMapTransition) {
      this._combatIntensity += (0 - this._combatIntensity) * (1 - Math.exp(-3 * clampedDt));
      return;
    }

    // 3. Intermission countdown between waves (paused while player chooses Tactical Card)
    if (this._inIntermission) {
      if (this._draftPaused) return;
      this._intermissionTimer -= clampedDt;
      this._combatIntensity += (0.18 - this._combatIntensity) * (1 - Math.exp(-3 * clampedDt));
      if (this._intermissionTimer <= 0) {
        const nextWaveIndex = this._currentWaveIndex + 1;
        if (nextWaveIndex < WAVES.length) {
          const nextWave = WAVES[nextWaveIndex];
          const nextMapIndex = this._getEffectiveMapIndex(nextWave);
          if (nextMapIndex !== this._currentMapIndex) {
            this._inIntermission = false;
            this._intermissionTimer = 0;
            this._awaitingMapTransition = true;
            if (this.eventBus) {
              this.eventBus.emit(EVENTS.MAP_TRANSITION, {
                nextWaveIndex,
                nextMapIndex,
                fromMapIndex: this._currentMapIndex,
              });
            }
            return;
          }
          this._startWave(nextWaveIndex);
        }
      }
      return;
    }

    if (this._victory || this._currentWaveIndex < 0 || this._currentWaveIndex >= WAVES.length) {
      return;
    }

    const wave = WAVES[this._currentWaveIndex];

    // 3. Spawn queued hostiles respecting maxConcurrent & spawnInterval
    if (this._spawnQueue.length > 0 && livingCount < wave.maxConcurrent) {
      this._spawnTimer -= clampedDt;
      if (this._spawnTimer <= 0) {
        const nextType = this._spawnQueue.shift();
        const spawned = this._spawnEnemy(nextType, playerController, wave);
        if (spawned) {
          const scaleMult = (this.globalEnemyHpMult || 1.0) * (1.0 + (this.endlessLoop || 0) * 0.30);
          if (scaleMult > 1.01) {
            spawned.maxHp = Math.round(spawned.maxHp * scaleMult);
            spawned.hp = spawned.maxHp;
          }
          // Wave 2+: 22% chance to promote non-boss enemy into an Elite Variant
          if (!spawned.isBoss && this._currentWaveIndex >= 1 && Math.random() < 0.22) {
            const affixes = [
              { id: 'overcharged', label: '[과충전]', hpMult: 1.35, color: 0xef4444 },
              { id: 'shield_link', label: '[실드링크]', hpMult: 1.30, color: 0x38bdf8 },
              { id: 'splitter', label: '[분열체]', hpMult: 1.25, color: 0xf59e0b },
            ];
            const aff = affixes[Math.floor(Math.random() * affixes.length)];
            spawned.eliteAffix = aff.id;
            spawned.displayName = `${aff.label} ${spawned.archetype.name || spawned.typeId}`;
            spawned.maxHp = Math.round(spawned.maxHp * aff.hpMult);
            spawned.hp = spawned.maxHp;
            spawned.group.scale.multiplyScalar(1.16);
          }
          livingCount++;
          this._livingTargets.push(spawned);
        }

        // Wave 2+: Mid-wave Golden Supply Drone surprise event (once per wave)
        if (
          this._currentWaveIndex >= 1 &&
          !this._supplyDroneSpawnedThisWave &&
          this._spawnQueue.length <= Math.max(2, Math.floor((this._currentWaveTotalEnemies || 8) * 0.5))
        ) {
          this._supplyDroneSpawnedThisWave = true;
          const drone = this._spawnEnemy('rusher_drone', playerController, wave);
          if (drone) {
            drone.isSupplyDrone = true;
            drone.eliteAffix = 'supply_drone';
            drone.displayName = '★ 황금 보급 드론';
            drone.maxHp = Math.round(drone.maxHp * 1.6);
            drone.hp = drone.maxHp;
            drone.group.scale.multiplyScalar(1.32);
            livingCount++;
            this._livingTargets.push(drone);
            if (this.eventBus) {
              this.eventBus.emit(EVENTS.ANNOUNCEMENT, {
                kicker: '돌발 전술 이벤트',
                title: '황금 보급 드론 출현!',
                subtitle: '격추 시 대량 골드(+45 G) 및 무기 보급 즉시 드랍',
                duration: 3.2,
              });
            }
          }
        }
        // Fast initial wave population while field is sparse
        const cadenceScale = livingCount < Math.min(3, wave.maxConcurrent) ? 0.52 : 1.0;
        this._spawnTimer = wave.spawnInterval * cadenceScale;
      }
    }

    // 4. Evaluate Wave Completion (Elimination, Hybrid Control Zone, or Wave 5 Boss)
    const allQueuedSpawned = this._spawnQueue.length === 0;
    let waveCleared = false;

    if (wave.controlZoneActive) {
      const zoneInfo = this._evaluateControlZone(
        clampedDt,
        playerPos,
        zoneState,
        activeInteractables,
        allQueuedSpawned && livingCount === 0
      );

      if (zoneInfo.captured) {
        if (!this._waveZoneBonusAwarded) {
          this._waveZoneBonusAwarded = true;
          this.score += SCORE_CONFIG.zoneCaptureBonus;
          // Full shield top-off on Terra-Beacon capture
          if (playerController && typeof playerController.heal === 'function') {
            playerController.heal(0, playerController.maxShield || 100);
          }
        }
        if (
          activeInteractables &&
          typeof activeInteractables.setCaptureSpeedMultiplier === 'function'
        ) {
          activeInteractables.setCaptureSpeedMultiplier(1.0);
        }
        // Terra-Beacon upload hits 100%: EMP-clear remaining stragglers & win wave!
        this._spawnQueue.length = 0;
        for (let i = 0; i < this._enemies.length; i++) {
          const e = this._enemies[i];
          if (e.isAlive) {
            e.applyDamage(9999, e.center, false, null, { isExplosion: true });
          }
        }
        waveCleared = true;
      } else if (allQueuedSpawned && livingCount === 0) {
        // Player cleared all wave enemies before zone hit 100%:
        // Accelerate capture 2.5x via interactables API AND spawn light reinforcement pairs (max 2)
        if (
          activeInteractables &&
          typeof activeInteractables.setCaptureSpeedMultiplier === 'function'
        ) {
          activeInteractables.setCaptureSpeedMultiplier(2.5);
        }
        if (this._reinforcementsSpawned < 2 && zoneInfo.progress < 0.88) {
          this._reinforcementTimer += clampedDt;
          if (this._reinforcementTimer >= 3.8) {
            this._reinforcementTimer = 0;
            this._reinforcementsSpawned++;
            this._spawnQueue.push('rusher_drone', 'tactical_trooper');
            this._spawnTimer = 0.25;
          }
        } else {
          // Both reinforcement pairs defeated (or zone nearly done): auto-finalize upload cleanly!
          this._emptyZoneClearTimer += clampedDt;
          if (this._emptyZoneClearTimer >= 2.2) {
            waveCleared = true;
          }
        }
      } else {
        this._reinforcementTimer = 0;
        this._emptyZoneClearTimer = 0;
        if (
          activeInteractables &&
          typeof activeInteractables.setCaptureSpeedMultiplier === 'function'
        ) {
          activeInteractables.setCaptureSpeedMultiplier(1.0);
        }
      }
    } else {
      // Standard elimination (Wave 1) or Boss + Adds (Wave 5)
      if (allQueuedSpawned && livingCount === 0) {
        waveCleared = true;
      }
    }

    // 4.5. Diversified Boss Arena Hazard Patterns (Carpet Salvo / Cross-Ring Strike / Seismic Shockwave)
    if (
      this._bossEntity &&
      this._bossEntity.isAlive &&
      activeInteractables &&
      typeof activeInteractables.spawnBossMissile === 'function'
    ) {
      this._bossMissileTimer -= clampedDt;
      if (this._bossMissileTimer <= 0) {
        const phase = this._bossEntity.currentPhase || 1;
        const isOverlord = this._bossEntity.archetype.id === 'aegis_overlord_boss';
        const cycle = this._bossSpecialCycle++ % 3;
        this._bossMissileTimer = phase >= 3 ? 3.6 : phase === 2 ? 4.6 : 5.6;

        if (cycle === 0) {
          // Pattern A: Targeted Carpet-Bombing Line across player path
          const dirX = playerPos.x - this._bossEntity.position.x;
          const dirZ = playerPos.z - this._bossEntity.position.z;
          const dLen = Math.hypot(dirX, dirZ) || 1;
          const nx = dirX / dLen;
          const nz = dirZ / dLen;
          const count = phase >= 3 ? 5 : 4;
          for (let m = 0; m < count; m++) {
            const offset = (m - 1.5) * 3.4;
            const tx = Math.max(-28, Math.min(28, playerPos.x + nx * offset));
            const tz = Math.max(-28, Math.min(28, playerPos.z + nz * offset));
            activeInteractables.spawnBossMissile({ x: tx, y: playerPos.y, z: tz });
          }
        } else if (cycle === 1) {
          // Pattern B: Cross / Orbital X-Formation Strike around player
          const offsets = isOverlord || phase >= 3
            ? [[0, 0], [4.2, 4.2], [-4.2, 4.2], [4.2, -4.2], [-4.2, -4.2]]
            : [[0, 0], [4.5, 0], [-4.5, 0], [0, 4.5]];
          for (let m = 0; m < offsets.length; m++) {
            const tx = Math.max(-28, Math.min(28, playerPos.x + offsets[m][0]));
            const tz = Math.max(-28, Math.min(28, playerPos.z + offsets[m][1]));
            activeInteractables.spawnBossMissile({ x: tx, y: playerPos.y, z: tz });
          }
        } else {
          // Pattern C: Seismic Ground Shockwave Ring (jump to evade!) + flanking missile strikes
          if (typeof activeInteractables.spawnBossShockwave === 'function') {
            activeInteractables.spawnBossShockwave(this._bossEntity.position);
          }
          const flankCount = phase >= 2 ? 3 : 2;
          for (let m = 0; m < flankCount; m++) {
            const ang = (m / flankCount) * Math.PI * 2 + Math.random() * 0.6;
            const tx = Math.max(-28, Math.min(28, playerPos.x + Math.cos(ang) * 4.0));
            const tz = Math.max(-28, Math.min(28, playerPos.z + Math.sin(ang) * 4.0));
            activeInteractables.spawnBossMissile({ x: tx, y: playerPos.y, z: tz });
          }
        }
      }
    }

    // 4.8. [실드링크] Elite Aura & Stage 8-10 Aegis Shield Relays sustain living allies
    const activeRelays =
      activeInteractables && typeof activeInteractables.getActiveShieldRelayCount === 'function'
        ? activeInteractables.getActiveShieldRelayCount()
        : 0;
    if (activeRelays > 0) {
      const relayHeal = 5 * activeRelays * clampedDt;
      for (let i = 0; i < this._livingTargets.length; i++) {
        const enemy = this._livingTargets[i];
        if (!enemy || !enemy.isAlive || enemy.hp >= enemy.maxHp) continue;
        enemy.hp = Math.min(enemy.maxHp, enemy.hp + relayHeal);
      }
    }
    for (let i = 0; i < this._livingTargets.length; i++) {
      const linker = this._livingTargets[i];
      if (!linker || !linker.isAlive || linker.eliteAffix !== 'shield_link') continue;
      for (let j = 0; j < this._livingTargets.length; j++) {
        const ally = this._livingTargets[j];
        if (!ally || !ally.isAlive || ally === linker || ally.hp >= ally.maxHp) continue;
        if (ally.position.distanceToSquared(linker.position) <= 100) {
          ally.hp = Math.min(ally.maxHp, ally.hp + 6 * clampedDt);
        }
      }
    }

    // 5. Update adaptive combat intensity for SoundEngine (0..1)
    let targetIntensity = Math.min(0.75, 0.22 + livingCount * 0.11);
    if (this._bossEntity && this._bossEntity.isAlive) {
      targetIntensity = 0.72 + (this._bossEntity.currentPhase - 1) * 0.14;
    }
    this._combatIntensity += (targetIntensity - this._combatIntensity) * (1 - Math.exp(-2.8 * clampedDt));

    // 6. Complete wave -> award bonus -> intermission or final Victory!
    if (waveCleared && !this._tutorialMode) {
      this._completeCurrentWave(wave);
    }
  }

  /**
   * Read external Control Zone state cleanly (or maintain a fallback around arena center).
   * @private
   */
  _evaluateControlZone(dt, playerPos, zoneState, interactables, enemiesCleared) {
    let progress = 0;
    let captured = false;

    // Support zoneState object passed directly or retrieved from interactables
    const zState =
      zoneState ||
      (interactables && typeof interactables.getZoneState === 'function'
        ? interactables.getZoneState()
        : null);

    if (zState && typeof zState === 'object') {
      const raw = Number(zState.progress) || 0;
      progress = raw > 1 ? Math.min(1, raw / 100) : Math.max(0, Math.min(1, raw));
      captured = Boolean(zState.captured || zState.isCaptured || progress >= 0.999);

      const playerInZone = Boolean(zState.playerInside || zState.playerInZone || zState.inZone);
      // Help accelerate progress if enemies are cleared and player is inside zone
      if (enemiesCleared && !captured && playerInZone) {
        if (typeof zState.addProgress === 'function') {
          zState.addProgress((1.5 * dt) / ARENA_CONFIG.controlZoneCaptureTime);
        }
      }
      this._fallbackZoneProgress = progress;
    } else {
      // Self-contained fallback Control Zone at arena center (0, 0, 0)
      const distSq = playerPos.x * playerPos.x + playerPos.z * playerPos.z;
      const r = ARENA_CONFIG.controlZoneRadius;
      const inZone = distSq <= r * r;
      if (inZone) {
        const speedMult = enemiesCleared ? 2.5 : 1.0;
        this._fallbackZoneProgress = Math.min(
          1,
          this._fallbackZoneProgress + (dt * speedMult) / ARENA_CONFIG.controlZoneCaptureTime
        );
      }
      progress = this._fallbackZoneProgress;
      captured = progress >= 0.999;
    }

    return { progress, captured };
  }

  /**
   * Finalize cleared wave, emit WAVE_CLEARED, and start intermission or Victory state.
   * @private
   */
  _completeCurrentWave(wave) {
    const waveBonus = wave.scoreBonus || SCORE_CONFIG.waveClearBaseBonus * wave.wave;
    this.score += waveBonus;

    if (this._interactables) {
      if (typeof this._interactables.setCaptureSpeedMultiplier === 'function') {
        this._interactables.setCaptureSpeedMultiplier(1.0);
      }
      if (typeof this._interactables.setZoneActive === 'function') {
        this._interactables.setZoneActive(false);
      }
    }

    const isEndlessLoopEnd = Boolean(this.endlessMode) && this._currentWaveIndex >= WAVES.length - 1;
    const isFinalWave = !this.endlessMode && this._currentWaveIndex >= WAVES.length - 1;

    if (this.eventBus) {
      this.eventBus.emit(EVENTS.WAVE_CLEARED, {
        wave: wave.wave,
        totalWaves: WAVES.length,
        name: wave.name,
        scoreBonus: waveBonus,
        totalScore: this.score,
        isFinalWave,
        nextIntermission: isFinalWave ? 0 : wave.intermissionTime,
      });
    }

    if (isEndlessLoopEnd) {
      this.endlessLoop = (this.endlessLoop || 0) + 1;
      this._currentWaveIndex = -1;
      if (this.eventBus) {
        this.eventBus.emit(EVENTS.ANNOUNCEMENT, {
          kicker: `무한 강하 // LOOP ${this.endlessLoop}`,
          title: `위협 단계 상승 (적 체력 +${this.endlessLoop * 30}%)`,
          subtitle: '다음 궤도 강하 구역으로 순환 진입합니다',
          duration: 3.4,
        });
      }
    }

    if (isFinalWave) {
      this._victory = true;
      this._active = false;
    this._tutorialMode = false;
      this._combatIntensity = 0;

      if (this.eventBus) {
        this.eventBus.emit(EVENTS.GAME_STATE, {
          state: 'victory',
          score: this.score,
          kills: this.totalKills,
          headshots: this.headshots,
          wave: wave.wave,
        });
      }
    } else {
      this._inIntermission = true;
      this._intermissionTimer = wave.intermissionTime || 3.5;
    }
  }

  /**
   * Select an optimal out-of-sight, range-appropriate spawn point and activate a pooled Enemy.
   * @private
   */
  spawnTutorialEnemy(archetypeId, spawnPos) {
    this._tutorialMode = true;
    this._active = true;
    const archetype = ENEMY_ARCHETYPES[archetypeId];
    if (!archetype) return null;
    const enemyId = this._nextEnemyId++;
    const bucket = this._enemyPool[archetypeId] || (this._enemyPool[archetypeId] = []);
    let enemy = null;
    for (let i = 0; i < bucket.length; i++) {
      const candidate = bucket[i];
      if (!candidate.isAlive && candidate.isRemoved && !this._enemies.includes(candidate)) {
        enemy = candidate;
        break;
      }
    }
    if (enemy) {
      enemy.activate(enemyId, spawnPos, null);
    } else {
      enemy = new Enemy(
        enemyId,
        archetype,
        spawnPos,
        this._enemyGroup,
        this.collisionWorld,
        this.modelFactory,
        this.eventBus,
        null,
        this._onEnemyDeathBound
      );
      bucket.push(enemy);
    }
    this._enemies.push(enemy);
    return enemy;
  }

  _spawnEnemy(archetypeId, playerController, wave) {
    const archetype = ENEMY_ARCHETYPES[archetypeId];
    if (!archetype) return null;

    const spawnPos = this._pickSpawnPoint(archetype, playerController);
    const bossPhases = archetype.isBoss && wave ? wave.bossPhases || null : null;
    const enemyId = this._nextEnemyId++;

    const bucket =
      this._enemyPool[archetypeId] || (this._enemyPool[archetypeId] = []);
    let enemy = null;
    for (let i = 0; i < bucket.length; i++) {
      const candidate = bucket[i];
      if (!candidate.isAlive && candidate.isRemoved && !this._enemies.includes(candidate)) {
        enemy = candidate;
        break;
      }
    }

    if (enemy) {
      enemy.activate(enemyId, spawnPos, bossPhases);
    } else {
      enemy = new Enemy(
        enemyId,
        archetype,
        spawnPos,
        this._enemyGroup,
        this.collisionWorld,
        this.modelFactory,
        this.eventBus,
        bossPhases,
        { dormant: false, pooled: true }
      );
      enemy.setDeathCallback(this._boundOnEnemyDeath);
      bucket.push(enemy);
    }

    this._enemies.push(enemy);
    if (archetype.isBoss) {
      this._bossEntity = enemy;
    }

    if (this.vfxManager && typeof this.vfxManager.spawnTeleport === 'function') {
      this.vfxManager.spawnTeleport(enemy.position, archetype.color);
    }

    return enemy;
  }

  /**
   * Tactical spawn point selector: avoids <10m radius, prefers out-of-LOS / rear flank,
   * prefers elevated catwalk spawns for Sniper Stalker, and wide open space for Boss.
   * @private
   */
  _pickSpawnPoint(archetype, playerController) {
    const playerPos = playerController.position;
    playerController.getLookDirection(this._playerLook);

    let bestScore = -Infinity;
    let bestPoint = this._spawnPoints[0];

    for (let i = 0; i < this._spawnPoints.length; i++) {
      const sp = this._spawnPoints[i];
      const dx = sp.x - playerPos.x;
      const dz = sp.z - playerPos.z;
      const dist = Math.hypot(dx, dz);

      let score = Math.random() * 14; // Subtle unpredictability

      // Strongly avoid spawning right in the player's face (<10m)
      if (dist < 10.0) {
        score -= 120 + (10.0 - dist) * 15;
      } else if (dist < 14.0) {
        score -= 22;
      } else if (dist <= 34.0) {
        score += 24;
      } else {
        score += 10;
      }

      // Archetype elevation preferences
      if (archetype.id === 'sniper_stalker' || archetype.id === 'mortar_artillery') {
        score += sp.elevated ? 72 : -18;
        if (dist >= 18 && dist <= 40) score += 22;
      } else if (archetype.isBoss) {
        score += sp.elevated ? -150 : 40;
        if (dist >= 18) score += 25;
        if (
          !this.collisionWorld.hasClearance(
            sp.x,
            sp.y + 0.05,
            sp.z,
            archetype.radius,
            archetype.height
          )
        ) {
          score -= 140;
        }
      } else if (archetype.id === 'heavy_enforcer' || archetype.id === 'rail_warden' || archetype.id === 'shock_breacher') {
        score += sp.elevated ? -90 : 22;
      } else if (!archetype.isFlying) {
        score += sp.elevated ? -12 : 12;
      }

      // Prefer out-of-view-cone and out-of-LOS spawns so hostiles never pop in front of camera
      if (dist > 0.1) {
        const dot = (dx * this._playerLook.x + dz * this._playerLook.z) / dist;
        if (dot < 0.25) {
          score += 32; // Outside player's primary front view cone
        } else if (dot > 0.72) {
          score -= 26;
        }
      }

      this._spawnEye.set(sp.x, sp.y + archetype.headHeight, sp.z);
      const visible = this.collisionWorld.isLineOfSightClear(this._playerEye, this._spawnEye);
      if (!visible) {
        score += 42;
      }

      // Avoid stacking directly on another living enemy
      for (let e = 0; e < this._enemies.length; e++) {
        const other = this._enemies[e];
        if (!other.isAlive) continue;
        const edx = sp.x - other.position.x;
        const edz = sp.z - other.position.z;
        const eDistSq = edx * edx + edz * edz;
        if (eDistSq < 6.25) {
          score -= 85;
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestPoint = sp;
      }
    }

    this._spawnCandidate.set(bestPoint.x, bestPoint.y, bestPoint.z);
    return this._spawnCandidate;
  }

  /**
   * Activate a pooled glowing enemy projectile (zero allocations).
   * @private
   */
  _spawnProjectile(origin, dir, speed, damage, color, radius, archetypeId, isSniperBeam) {
    let slot = null;
    for (let i = 0; i < this._projectiles.length; i++) {
      if (!this._projectiles[i].active) {
        slot = this._projectiles[i];
        break;
      }
    }
    if (!slot) {
      // Recycle oldest projectile gracefully if pool is saturated
      slot = this._projectiles[0];
    }

    slot.active = true;
    slot.origin.copy(origin);
    slot.position.copy(origin);
    slot.dir.copy(dir).normalize();
    slot.speed = speed;
    slot.damage = damage;
    slot.radius = radius;
    slot.life = 0;
    slot.maxLife = isSniperBeam ? 1.4 : 3.2;
    slot.archetypeId = archetypeId;

    // Distinct glowing silhouette per archetype
    const length = isSniperBeam
      ? 2.4
      : archetypeId === 'aegis_overlord_boss'
      ? 1.48
      : archetypeId === 'cyber_mech_boss' || archetypeId === 'rail_warden'
      ? 1.35
      : archetypeId === 'mortar_artillery' || archetypeId === 'vanguard_assassin'
      ? 0.98
      : archetypeId === 'heavy_enforcer' || archetypeId === 'shock_breacher'
      ? 0.70
      : 0.90;
    const visualRadius = isSniperBeam ? 0.065 : radius * 0.85;

    const boltColor = PROJECTILE_COLORS[archetypeId] || 0xff4422;
    slot.material.color.setHex(boltColor);
    slot.mesh.position.copy(origin);
    slot.mesh.quaternion.setFromUnitVectors(Z_AXIS, slot.dir);
    slot.mesh.scale.set(visualRadius, visualRadius, length);
    slot.mesh.visible = true;

    // 3D spatialized enemy gunfire audio
    if (this._soundEngine && typeof this._soundEngine.playEnemyShot === 'function') {
      this._soundEngine.playEnemyShot(origin, archetypeId);
    }
  }

  /**
   * Advance pooled enemy projectiles, test swept collisions against world AABBs & player capsule.
   * @private
   */
  _updateProjectiles(dt, playerController) {
    const playerAlive = Boolean(playerController && playerController.isAlive);
    const pPos = playerAlive ? playerController.position : null;
    const pRadius = PLAYER_CONFIG.radius;
    const pHeight = playerAlive ? playerController.currentHeight : PLAYER_CONFIG.standHeight;

    for (let i = 0; i < this._projectiles.length; i++) {
      const proj = this._projectiles[i];
      if (!proj.active) continue;

      proj.life += dt;
      if (proj.life >= proj.maxLife) {
        proj.active = false;
        proj.mesh.visible = false;
        continue;
      }

      const stepDist = proj.speed * dt;
      this._prevProjPos.copy(proj.position);

      // 1. Check solid world geometry collision first
      const wallHit = this.collisionWorld.raycastWorld(
        this._prevProjPos,
        proj.dir,
        stepDist,
        this._rayHit
      );
      const maxMove = wallHit ? wallHit.distance : stepDist;

      const nextX = this._prevProjPos.x + proj.dir.x * maxMove;
      const nextY = this._prevProjPos.y + proj.dir.y * maxMove;
      const nextZ = this._prevProjPos.z + proj.dir.z * maxMove;

      // 2. Check swept segment against player vertical capsule
      if (playerAlive && pPos) {
        const hitR = pRadius + proj.radius * 0.85;
        const yBot = pPos.y + Math.min(pRadius, pHeight * 0.45);
        const yTop = pPos.y + Math.max(pRadius, pHeight - pRadius * 0.4);
        const distSq = segmentToVerticalCapsuleDistSq(
          this._prevProjPos.x,
          this._prevProjPos.y,
          this._prevProjPos.z,
          nextX,
          nextY,
          nextZ,
          pPos.x,
          yBot,
          yTop,
          pPos.z
        );

        if (distSq <= hitR * hitR) {
          playerController.applyDamage(proj.damage, proj.origin);
          proj.active = false;
          proj.mesh.visible = false;
          continue;
        }
      }

      // 3. Apply wall impact or advance bolt mesh
      if (wallHit) {
        if (this.vfxManager && typeof this.vfxManager.spawnImpact === 'function') {
          this.vfxManager.spawnImpact(wallHit.point, wallHit.normal, proj.material.color.getHex());
        }
        proj.active = false;
        proj.mesh.visible = false;
        continue;
      }

      proj.position.set(nextX, nextY, nextZ);
      proj.mesh.position.copy(proj.position);
    }
  }

  /**
   * Return pre-allocated list of currently living Enemy targets (zero allocation).
   * @returns {Array<Enemy>}
   */
  getTargets() {
    return this._livingTargets;
  }

  /**
   * Return all active enemies (including those completing death dissolve animations).
   * @returns {Array<Enemy>}
   */
  getEnemies() {
    return this._enemies;
  }

  /**
   * Return live Boss HUD state snapshot, or null when no Boss is active.
   */
  getBossState() {
    const boss = this._bossEntity;
    if (!boss || !boss.isAlive) {
      return null;
    }
    const s = this._bossStateSnapshot;
    s.active = true;
    s.name = boss.archetype.name;
    s.hp = Math.ceil(boss.hp);
    s.maxHp = boss.maxHp;
    s.hpRatio = Math.max(0, Math.min(1, boss.hp / boss.maxHp));
    s.phase = boss.currentPhase;
    s.phaseName = boss._phaseName || `PHASE ${boss.currentPhase}`;
    s.shieldActive = boss._phaseShieldTimer > 0;
    s.position.copy(boss.position);
    return s;
  }

  /**
   * Return zero-allocation HUD/director state snapshot.
   */
  getActiveEnemies() {
    return this._livingTargets || [];
  }

  getHudState() {
    const s = this._hudSnapshot;
    const wave =
      this._currentWaveIndex >= 0 && this._currentWaveIndex < WAVES.length
        ? WAVES[this._currentWaveIndex]
        : null;

    s.wave = this.endlessMode
      ? (this.endlessLoop || 0) * WAVES.length + (wave ? wave.wave : 0)
      : (wave ? wave.wave : 0);
    s.totalWaves = this.endlessMode ? 0 : WAVES.length;
    s.waveName = wave ? wave.name : '';
    s.subtitle = wave ? wave.subtitle : '';
    s.objective = wave ? wave.objective : '';
    s.objectiveType = wave ? wave.objectiveType : 'eliminate';
    s.controlZoneActive = wave ? wave.controlZoneActive : false;
    s.isBossWave = wave ? wave.isBossWave : false;
    s.enemiesAlive = this._livingTargets.length;
    s.enemiesQueued = this._spawnQueue.length;
    s.enemiesRemaining = s.enemiesAlive + s.enemiesQueued;
    s.score = this.score;
    s.combo = this.combo;
    s.comboProgress =
      this._comboTimer > 0 ? Math.max(0, Math.min(1, this._comboTimer / SCORE_CONFIG.comboTimeout)) : 0;
    s.kills = this.totalKills;
    s.headshots = this.headshots;
    s.inIntermission = this._inIntermission;
    s.intermissionRemaining = Math.max(0, this._intermissionTimer);
    s.awaitingMapTransition = this._awaitingMapTransition;
    s.mapIndex = this._currentMapIndex;
    s.victory = this._victory;
    s.combatIntensity = this._combatIntensity;
    s.zoneProgress = this._fallbackZoneProgress;
    return s;
  }

  /**
   * Clean up all listeners, pooled enemies, pooled projectiles, and shared model caches.
   */
  dispose() {
    if (this._unsubBossPhase) {
      this._unsubBossPhase();
      this._unsubBossPhase = null;
    }

    this.reset();

    for (const key of Object.keys(this._enemyPool)) {
      const bucket = this._enemyPool[key];
      for (let i = 0; i < bucket.length; i++) {
        bucket[i].dispose();
      }
      bucket.length = 0;
    }
    this._prewarmed = false;

    if (this._enemyGroup && this._enemyGroup.parent) {
      this._enemyGroup.parent.remove(this._enemyGroup);
    }

    if (this._projGroup && this._projGroup.parent) {
      this._projGroup.parent.remove(this._projGroup);
    }
    for (let i = 0; i < this._projectiles.length; i++) {
      this._projectiles[i].material.dispose();
    }
    if (this._projOuterGeo) this._projOuterGeo.dispose();
    if (this._projCoreGeo) this._projCoreGeo.dispose();
    if (this._projCoreMat) this._projCoreMat.dispose();
    if (this.modelFactory) this.modelFactory.dispose();
  }
}
  __exports.WaveDirector = WaveDirector;
});
