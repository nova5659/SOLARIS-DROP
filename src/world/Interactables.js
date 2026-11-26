// Module: src/world/Interactables.js
__define("src/world/Interactables.js", (__exports, __require) => {
const { ARENA_CONFIG, EVENTS } = __require("src/config/constants.js");
const { WEAPONS } = __require("src/config/weapons.js");
const { WeaponModelFactory } = __require("src/weapons/WeaponModelFactory.js");

const PICKUP_RESPAWN_TIME = 18.0;
const PICKUP_COLLECT_RADIUS = 1.8;
const PICKUP_COLLECT_RADIUS_SQ = PICKUP_COLLECT_RADIUS * PICKUP_COLLECT_RADIUS;
const HEALTH_PICKUP_AMOUNT = 35;
const SHIELD_PICKUP_AMOUNT = 40;
const AMMO_PICKUP_FRACTION = 0.5;
const BARREL_MAX_HP = 60;
const BARREL_HIT_RADIUS = 0.65;
const JUMP_PAD_TRIGGER_RADIUS = 1.65;

/**
 * Create a seamless vertical telemetry uplink gradient + rib CanvasTexture
 * for the Terra-Beacon Control Zone perimeter cylinder.
 */
function createZoneFieldTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  // Vertical atmospheric uplink gradient: grounded base anchor tapering smoothly upward
  const grad = ctx.createLinearGradient(0, 256, 0, 0);
  grad.addColorStop(0.0, 'rgba(255, 255, 255, 0.92)');
  grad.addColorStop(0.1, 'rgba(255, 255, 255, 0.52)');
  grad.addColorStop(0.38, 'rgba(255, 255, 255, 0.22)');
  grad.addColorStop(0.76, 'rgba(255, 255, 255, 0.06)');
  grad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  // Subtle horizontal telemetry bands
  ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
  for (let y = 0; y < 256; y += 8) {
    ctx.fillRect(0, y, 256, 2);
  }

  // Structural uplink beam ribs
  ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
  for (let x = 0; x < 256; x += 32) {
    ctx.fillRect(x, 36, 3, 220);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.repeat.set(6, 1);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Create a weathered, scratched industrial ochre/black caution collar CanvasTexture
 * for corroded thermite fuel drums and pneumatic jump pad rings.
 */
function createBarrelHazardTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#201c18';
  ctx.fillRect(0, 0, 256, 64);

  ctx.fillStyle = '#d98a1e';
  const stripeW = 24;
  for (let x = -64; x < 320; x += stripeW * 2) {
    ctx.beginPath();
    ctx.moveTo(x, 64);
    ctx.lineTo(x + stripeW, 64);
    ctx.lineTo(x + stripeW + 32, 0);
    ctx.lineTo(x + 32, 0);
    ctx.closePath();
    ctx.fill();
  }

  // Weathering rust scuffs & chipped grime
  ctx.fillStyle = 'rgba(92, 42, 20, 0.42)';
  for (let i = 0; i < 28; i++) {
    const sx = (i * 47) % 246;
    const sy = (i * 19) % 52;
    ctx.fillRect(sx, sy, 8 + (i % 7), 4 + (i % 5));
  }

  ctx.fillStyle = '#181411';
  ctx.fillRect(0, 0, 256, 8);
  ctx.fillRect(0, 56, 256, 8);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.repeat.set(2, 1);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Interactive Arena Gameplay Systems for AETHER DROP: RECLAIM EARTH:
 * - Sculpted LatheGeometry Pneumatic Orbital Booster Jump Pads with rising heated-amber air rings
 * - Corroded Fuel / Thermite Drums (full Target contract + chain-reaction LOS splash)
 * - Orbital Supply Pickups (Med-Repair Pod, Tactical Shield Battery, Brass Ammo Crate)
 * - Terra-Beacon Control Zone with industrial steel perimeter projectors & orbital uplink field
 *
 * Strictly zero neon, zero MeshPhysicalMaterial, zero heap allocations inside update(),
 * and complete GPU resource disposal inside dispose().
 */
class Interactables {
  /**
   * @param {THREE.Scene} scene
   * @param {import('../physics/CollisionWorld.js').CollisionWorld} collisionWorld
   * @param {import('../core/EventBus.js').EventBus} eventBus
   * @param {any} arenaData
   */
  constructor(scene, collisionWorld, eventBus, arenaData) {
    this.scene = scene;
    this.collisionWorld = collisionWorld;
    this.eventBus = eventBus;
    this.arenaData = arenaData || {};

    this.root = new THREE.Group();
    this.root.name = 'InteractablesRoot';
    this.scene.add(this.root);

    /** @type {THREE.BufferGeometry[]} */
    this._geometries = [];
    /** @type {THREE.Material[]} */
    this._materials = [];
    /** @type {THREE.Texture[]} */
    this._textures = [];

    // System collections
    this._jumpPads = [];
    this._jumpRingMats = [];
    this._barrels = [];
    this._activeBarrels = [];
    this._gimmickPylons = [];
    this._activeGimmickConfig = { empPylons: false, orbitalSweep: false, shieldRelays: false };
    this._orbitalSweepTimer = 5.5;
    this._shockwaves = [];
    this._pickups = [];

    // Latest combat context cached from update() for mid-frame barrel chain reactions
    this._lastPlayerController = null;
    this._lastEnemies = null;

    // Control Zone state
    const zc = this.arenaData.controlZoneCenter || new THREE.Vector3(0, 0.25, 0);
    this._zoneCenter = new THREE.Vector3(zc.x, zc.y, zc.z);
    this._zoneRadius = this.arenaData.controlZoneRadius || ARENA_CONFIG.controlZoneRadius;
    this._zone = {
      active: false,
      progress: 0,
      captured: false,
      contesting: false,
      playerInside: false,
      owner: 'neutral',
      captureSpeedMultiplier: 1.0,
      emitCooldown: 0,
      lastEmittedProgress: -1,
      lastEmittedOwner: '',
      lastEmittedActive: false,
      lastEmittedCaptured: false,
      lastEmittedContesting: false,
    };

    // Zone visual refs
    this._zoneGroup = null;
    this._zoneCylinder = null;
    this._zoneCylinderMat = null;
    this._zoneOuterRingMat = null;
    this._zoneInnerRing = null;
    this._zoneInnerRingMat = null;
    this._zoneProgressMesh = null;
    this._zoneProgressMat = null;
    this._zoneFieldTex = null;

    // Shared hazard texture for barrels & jump pad collars
    this._hazardCollarTex = this._trackTex(createBarrelHazardTexture());

    // Pre-allocated scratch vectors, colors & event payloads (zero-GC hot paths)
    this._tmpVecA = new THREE.Vector3();
    this._tmpVecB = new THREE.Vector3();
    this._tmpKnockback = new THREE.Vector3();
    this._tmpColorTarget = new THREE.Color();
    this._colNeutral = new THREE.Color(0xf59e0b); // Warm amber standby
    this._colPlayer = new THREE.Color(0x84cc16); // Emerald-gold uplink
    this._colContestedA = new THREE.Color(0xef4444); // Pulsing red contested warning
    this._colContestedB = new THREE.Color(0xf59e0b);
    this._colCaptured = new THREE.Color(0x22c55e); // Emerald orbital uplink secured
    this._detonationQueue = [];
    this._ammoResult = { collected: false, amount: 0 };

    this._pickupPayload = { type: '', amount: 0, position: new THREE.Vector3() };
    this._zonePayload = {
      progress: 0,
      contesting: false,
      owner: 'neutral',
      active: false,
      captured: false,
    };
    this._zoneSnapshot = {
      active: false,
      progress: 0,
      captured: false,
      contesting: false,
      playerInside: false,
      playerInZone: false,
      owner: 'neutral',
      captureSpeedMultiplier: 1.0,
    };

    // Build all interactive systems + Step 2 Dynamic Drops & Boss Hazard Pools + Stage 6-10 Gimmick Pylons
    this._buildJumpPads();
    this._buildBarrels();
    this._buildGimmickPylons();
    this._buildShockwavePool();
    this._buildPickups();
    this._buildControlZone();
    this._buildDynamicPools();
  }

  /** @private */
  _trackGeo(geo) {
    this._geometries.push(geo);
    return geo;
  }

  /** @private */
  _trackMat(mat) {
    this._materials.push(mat);
    return mat;
  }

  /** @private */
  _trackTex(tex) {
    this._textures.push(tex);
    return tex;
  }

  // ---------------------------------------------------------------------------
  // 1. Pneumatic Orbital Booster Jump Pads (LatheGeometry + Rising Amber Thrust Rings)
  // ---------------------------------------------------------------------------

  /** @private */
  _buildJumpPads() {
    const spawns = this.arenaData.jumpPadSpawns || [];
    if (spawns.length === 0) return;

    // Sculpted rusted steel hydraulic pneumatic booster housing via LatheGeometry
    const basePoints = [
      new THREE.Vector2(1.94, 0.0),
      new THREE.Vector2(1.88, 0.09),
      new THREE.Vector2(1.70, 0.24),
      new THREE.Vector2(1.44, 0.26),
      new THREE.Vector2(1.36, 0.14),
      new THREE.Vector2(0.01, 0.14),
    ];
    const baseGeo = this._trackGeo(new THREE.LatheGeometry(basePoints, 24));
    const hazardRingGeo = this._trackGeo(new THREE.CylinderGeometry(1.72, 1.84, 0.12, 24, 1, true));
    const coreDiscGeo = this._trackGeo(new THREE.CylinderGeometry(1.34, 1.38, 0.05, 24));
    const ringGeo = this._trackGeo(new THREE.TorusGeometry(1.18, 0.045, 8, 32));
    ringGeo.rotateX(Math.PI * 0.5);

    // Directional trajectory chevron plate
    const chevShape = new THREE.Shape();
    chevShape.moveTo(0, 0.72);
    chevShape.lineTo(0.62, -0.05);
    chevShape.lineTo(0.36, -0.22);
    chevShape.lineTo(0, 0.24);
    chevShape.lineTo(-0.36, -0.22);
    chevShape.lineTo(-0.62, -0.05);
    chevShape.closePath();
    const chevGeo = this._trackGeo(
      new THREE.ExtrudeGeometry(chevShape, {
        depth: 0.04,
        bevelEnabled: false,
      })
    );
    chevGeo.rotateX(-Math.PI * 0.5);

    const baseMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x463a31,
        metalness: 0.72,
        roughness: 0.62,
      })
    );
    const hazardRingMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        map: this._hazardCollarTex,
        metalness: 0.35,
        roughness: 0.72,
      })
    );
    const coreMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xd97706,
        emissive: new THREE.Color(0xff801a),
        emissiveIntensity: 1.5,
        roughness: 0.34,
        metalness: 0.35,
      })
    );
    const chevMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xfbbf24,
        emissive: new THREE.Color(0xf59e0b),
        emissiveIntensity: 1.6,
        roughness: 0.25,
      })
    );

    // 3 shared translucent heated-amber air-thrust ring materials
    for (let k = 0; k < 3; k++) {
      this._jumpRingMats.push(
        this._trackMat(
          new THREE.MeshBasicMaterial({
            color: k === 1 ? 0xffb347 : 0xff7b24,
            transparent: true,
            opacity: 0.72,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          })
        )
      );
    }

    for (let i = 0; i < spawns.length; i++) {
      const cfg = spawns[i];
      const pos = cfg.pos;

      this.collisionWorld.addJumpPad(
        pos.x,
        pos.y,
        pos.z,
        JUMP_PAD_TRIGGER_RADIUS,
        cfg.launchVy,
        cfg.launchDirX || 0,
        cfg.launchDirZ || 0
      );

      const group = new THREE.Group();
      group.position.set(pos.x, pos.y, pos.z);

      const baseMesh = new THREE.Mesh(baseGeo, baseMat);
      baseMesh.receiveShadow = true;
      group.add(baseMesh);

      const hazardCollar = new THREE.Mesh(hazardRingGeo, hazardRingMat);
      hazardCollar.position.y = 0.17;
      group.add(hazardCollar);

      const coreMesh = new THREE.Mesh(coreDiscGeo, coreMat);
      coreMesh.position.y = 0.14;
      group.add(coreMesh);

      const chevMesh = new THREE.Mesh(chevGeo, chevMat);
      chevMesh.position.y = 0.17;
      if (cfg.launchDirX || cfg.launchDirZ) {
        chevMesh.rotation.y = Math.atan2(-(cfg.launchDirX || 0), -(cfg.launchDirZ || 0));
      }
      group.add(chevMesh);

      const rings = [];
      for (let k = 0; k < 3; k++) {
        const ring = new THREE.Mesh(ringGeo, this._jumpRingMats[k]);
        ring.position.y = 0.25 + k * 0.55;
        group.add(ring);
        rings.push(ring);
      }

      this.root.add(group);
      this._jumpPads.push({ group, rings, coreMesh, phaseOffset: i * 0.23 });
    }
  }

  // ---------------------------------------------------------------------------
  // 2. Corroded Fuel / Thermite Drums (LatheGeometry + Target Contract)
  // ---------------------------------------------------------------------------

  /** @private */
  _buildBarrels() {
    const spawns = this.arenaData.barrelSpawns || [];
    if (spawns.length === 0) return;

    // Sculpted LatheGeometry ribbed corroded steel fuel drum
    const bodyPoints = [
      new THREE.Vector2(0.01, 0.0),
      new THREE.Vector2(0.39, 0.0),
      new THREE.Vector2(0.43, 0.06),
      new THREE.Vector2(0.43, 0.24),
      new THREE.Vector2(0.38, 0.30),
      new THREE.Vector2(0.36, 0.36),
      new THREE.Vector2(0.28, 0.40),
      new THREE.Vector2(0.28, 1.00),
      new THREE.Vector2(0.36, 1.04),
      new THREE.Vector2(0.39, 1.10),
      new THREE.Vector2(0.43, 1.16),
      new THREE.Vector2(0.43, 1.32),
      new THREE.Vector2(0.36, 1.38),
      new THREE.Vector2(0.22, 1.41),
      new THREE.Vector2(0.01, 1.42),
    ];
    const bodyGeo = this._trackGeo(new THREE.LatheGeometry(bodyPoints, 18));

    // Molten thermite warning vent sleeve visible through protective drum ribs
    const corePoints = [
      new THREE.Vector2(0.31, 0.38),
      new THREE.Vector2(0.355, 0.48),
      new THREE.Vector2(0.365, 0.70),
      new THREE.Vector2(0.355, 0.92),
      new THREE.Vector2(0.31, 1.02),
    ];
    const coreGeo = this._trackGeo(new THREE.LatheGeometry(corePoints, 16));

    const collarGeo = this._trackGeo(new THREE.CylinderGeometry(0.442, 0.442, 0.16, 18, 1, true));
    const strutGeo = this._trackGeo(new THREE.BoxGeometry(0.065, 0.76, 0.075));
    const valveGeo = this._trackGeo(new THREE.TorusGeometry(0.20, 0.032, 6, 16));
    valveGeo.rotateX(Math.PI * 0.5);
    const capGeo = this._trackGeo(new THREE.CylinderGeometry(0.07, 0.07, 0.08, 10));

    // Corroded crimson-oxide oil barrel steel shell
    const shellMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x74281b,
        metalness: 0.58,
        roughness: 0.72,
      })
    );
    const strutMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x3b322b,
        metalness: 0.72,
        roughness: 0.65,
      })
    );
    const collarMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        map: this._hazardCollarTex,
        metalness: 0.35,
        roughness: 0.68,
      })
    );

    const self = this;

    for (let i = 0; i < spawns.length; i++) {
      const sp = spawns[i];

      const coreMat = this._trackMat(
        new THREE.MeshStandardMaterial({
          color: 0xff6e24,
          emissive: new THREE.Color(0xff420a),
          emissiveIntensity: 1.9,
          roughness: 0.25,
          metalness: 0.15,
        })
      );

      const group = new THREE.Group();
      group.position.set(sp.x, sp.y, sp.z);

      const bodyMesh = new THREE.Mesh(bodyGeo, shellMat);
      bodyMesh.castShadow = true;
      bodyMesh.receiveShadow = true;
      group.add(bodyMesh);

      const coreMesh = new THREE.Mesh(coreGeo, coreMat);
      group.add(coreMesh);

      const lowCollar = new THREE.Mesh(collarGeo, collarMat);
      lowCollar.position.y = 0.15;
      group.add(lowCollar);

      const highCollar = new THREE.Mesh(collarGeo, collarMat);
      highCollar.position.y = 1.24;
      group.add(highCollar);

      for (let s = 0; s < 4; s++) {
        const ang = (Math.PI * 0.5) * s + Math.PI * 0.25;
        const strut = new THREE.Mesh(strutGeo, strutMat);
        strut.position.set(Math.cos(ang) * 0.39, 0.70, Math.sin(ang) * 0.39);
        strut.rotation.y = -ang;
        group.add(strut);
      }

      const valve = new THREE.Mesh(valveGeo, strutMat);
      valve.position.y = 1.42;
      group.add(valve);

      const bungCap = new THREE.Mesh(capGeo, strutMat);
      bungCap.position.set(0.16, 1.43, 0.08);
      group.add(bungCap);

      this.root.add(group);

      const position = new THREE.Vector3(sp.x, sp.y, sp.z);
      const center = new THREE.Vector3(sp.x, sp.y + 0.72, sp.z);
      const head = new THREE.Vector3(sp.x, sp.y + 1.18, sp.z);
      const hitSphere = {
        center: new THREE.Vector3(sp.x, sp.y + 0.72, sp.z),
        radius: BARREL_HIT_RADIUS,
        isHead: false,
      };
      const hitSpheres = [hitSphere];
      const explodePayload = {
        position: center,
        radius: ARENA_CONFIG.barrelRadius,
        damage: ARENA_CONFIG.barrelDamage,
        barrelId: `barrel_${i}`,
      };

      const barrel = {
        id: `barrel_${i}`,
        isAlive: true,
        isEnemy: false,
        hp: BARREL_MAX_HP,
        maxHp: BARREL_MAX_HP,
        position,
        center,
        aimPoint: center,
        group,
        coreMat,
        respawnTimer: 0,
        hitFlashTimer: 0,
        spawnPopTimer: 0,
        _hitSphere: hitSphere,
        _hitSpheres: hitSpheres,
        _explodePayload: explodePayload,

        getCenterPosition(outVec = new THREE.Vector3()) {
          return outVec.copy(center);
        },

        getHeadPosition(outVec = new THREE.Vector3()) {
          return outVec.copy(head);
        },

        getHitSpheres() {
          return hitSpheres;
        },

        applyDamage(amount) {
          if (!barrel.isAlive || !Number.isFinite(amount) || amount <= 0) {
            return { dealt: 0, killed: false, blockedByShield: false };
          }
          const dealt = Math.min(barrel.hp, amount);
          barrel.hp -= dealt;
          barrel.hitFlashTimer = 0.14;

          if (barrel.hp <= 0) {
            barrel.hp = 0;
            barrel.isAlive = false;
            self._triggerBarrelDetonation(barrel);
            return { dealt, killed: true, blockedByShield: false };
          }
          return { dealt, killed: false, blockedByShield: false };
        },
      };

      this._barrels.push(barrel);
    }
  }

  /**
   * Stage 6-10 Aegis Citadel Tactical Gimmick Pylons:
   * - EMP Overload Pylons: 14m piercing shockwave, strips shields, staggers foes, +10% Beacon upload
   * - Aegis Shield Relays: sustain hostiles while intact; shattering breaks boss barriers & drops shield cell
   * @private
   */
  _buildGimmickPylons() {
    const mapIdx = typeof this.arenaData.mapIndex === 'number' ? this.arenaData.mapIndex : 0;
    if (mapIdx < 3) return;

    const layoutByMap = {
      3: {
        emp: [{ x: -12.5, y: 0, z: -4.5 }, { x: 12.5, y: 0, z: -4.5 }],
        relay: [{ x: -12.5, y: 0, z: 5.5 }, { x: 12.5, y: 0, z: 5.5 }],
      },
      4: {
        emp: [{ x: -8.5, y: 0, z: -10.5 }, { x: 8.5, y: 0, z: -10.5 }],
        relay: [{ x: -8.5, y: 0, z: 10.5 }, { x: 8.5, y: 0, z: 10.5 }],
      },
      5: {
        emp: [{ x: -13.5, y: 0, z: -5.0 }, { x: 13.5, y: 0, z: -5.0 }],
        relay: [{ x: -13.5, y: 0, z: 5.0 }, { x: 13.5, y: 0, z: 5.0 }],
      },
    };
    const cfg = layoutByMap[mapIdx] || layoutByMap[3];

    const baseGeo = this._trackGeo(new THREE.CylinderGeometry(0.54, 0.68, 0.38, 8));
    const stemGeo = this._trackGeo(new THREE.CylinderGeometry(0.18, 0.28, 1.55, 8));
    const coreGeo = this._trackGeo(new THREE.OctahedronGeometry(0.36, 0));
    const haloGeo = this._trackGeo(new THREE.TorusGeometry(0.52, 0.045, 6, 20));
    haloGeo.rotateX(Math.PI * 0.5);
    const finGeo = this._trackGeo(new THREE.BoxGeometry(0.08, 0.92, 0.22));

    const steelMat = this._trackMat(
      new THREE.MeshStandardMaterial({ color: 0x3f434a, metalness: 0.78, roughness: 0.44 })
    );
    const darkArmorMat = this._trackMat(
      new THREE.MeshStandardMaterial({ color: 0x22262e, metalness: 0.65, roughness: 0.58 })
    );

    const self = this;
    const makePylon = (sp, gimmickKind, idx) => {
      const isEmp = gimmickKind === 'emp_pylon';
      const coreColorHex = isEmp ? 0xfbbf24 : 0x38bdf8;
      const emissiveHex = isEmp ? 0xf59e0b : 0x0284c7;
      const maxHp = isEmp ? 95 : 125;

      const coreMat = this._trackMat(
        new THREE.MeshStandardMaterial({
          color: coreColorHex,
          emissive: new THREE.Color(emissiveHex),
          emissiveIntensity: 1.85,
          roughness: 0.22,
          metalness: 0.28,
        })
      );
      const haloMat = this._trackMat(
        new THREE.MeshBasicMaterial({
          color: coreColorHex,
          transparent: true,
          opacity: 0.85,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );

      const group = new THREE.Group();
      const groundY = this.collisionWorld
        ? this.collisionWorld.getGroundHeightAt(sp.x, sp.z, (sp.y || 0) + 1.5)
        : sp.y || 0;
      group.position.set(sp.x, groundY, sp.z);
      group.visible = false;

      const base = new THREE.Mesh(baseGeo, darkArmorMat);
      base.position.y = 0.19;
      base.castShadow = true;
      base.receiveShadow = true;
      group.add(base);

      const stem = new THREE.Mesh(stemGeo, steelMat);
      stem.position.y = 0.96;
      stem.castShadow = true;
      group.add(stem);

      const core = new THREE.Mesh(coreGeo, coreMat);
      core.position.y = 1.92;
      group.add(core);

      const halo = new THREE.Mesh(haloGeo, haloMat);
      halo.position.y = 1.92;
      group.add(halo);

      for (let f = 0; f < 3; f++) {
        const a = (f * Math.PI * 2) / 3;
        const fin = new THREE.Mesh(finGeo, darkArmorMat);
        fin.position.set(Math.cos(a) * 0.42, 1.08, Math.sin(a) * 0.42);
        fin.rotation.y = -a;
        group.add(fin);
      }

      this.root.add(group);

      const position = new THREE.Vector3(sp.x, groundY, sp.z);
      const center = new THREE.Vector3(sp.x, groundY + 1.55, sp.z);
      const head = new THREE.Vector3(sp.x, groundY + 1.92, sp.z);
      const hitSphere = {
        center: new THREE.Vector3(sp.x, groundY + 1.55, sp.z),
        radius: 0.82,
        isHead: false,
      };
      const hitSpheres = [hitSphere];
      const radius = isEmp ? 14.0 : 16.0;
      const damage = isEmp ? 110 : 140;

      const pylon = {
        id: `${gimmickKind}_${idx}`,
        gimmickKind,
        enabled: false,
        isAlive: false,
        isEnemy: false,
        hp: maxHp,
        maxHp,
        position,
        center,
        aimPoint: head,
        group,
        core,
        halo,
        coreMat,
        haloMat,
        respawnTimer: 0,
        hitFlashTimer: 0,
        spawnPopTimer: 0,
        phase: idx * 1.3 + (isEmp ? 0 : 0.7),
        _hitSphere: hitSphere,
        _hitSpheres: hitSpheres,
        _explodePayload: {
          position: center,
          radius,
          damage,
          barrelId: `${gimmickKind}_${idx}`,
          gimmickType: gimmickKind,
        },
        getCenterPosition(outVec = new THREE.Vector3()) {
          return outVec.copy(center);
        },
        getHeadPosition(outVec = new THREE.Vector3()) {
          return outVec.copy(head);
        },
        getHitSpheres() {
          return hitSpheres;
        },
        applyDamage(amount) {
          if (!pylon.enabled || !pylon.isAlive || !Number.isFinite(amount) || amount <= 0) {
            return { dealt: 0, killed: false, blockedByShield: false };
          }
          const dealt = Math.min(pylon.hp, amount);
          pylon.hp -= dealt;
          pylon.hitFlashTimer = 0.14;
          if (pylon.hp <= 0) {
            pylon.hp = 0;
            pylon.isAlive = false;
            self._triggerGimmickDetonation(pylon);
            return { dealt, killed: true, blockedByShield: false };
          }
          return { dealt, killed: false, blockedByShield: false };
        },
      };

      this._gimmickPylons.push(pylon);
    };

    for (let i = 0; i < cfg.emp.length; i++) {
      makePylon(cfg.emp[i], 'emp_pylon', i);
    }
    for (let i = 0; i < cfg.relay.length; i++) {
      makePylon(cfg.relay[i], 'shield_relay', i);
    }
  }

  /**
   * Trigger Stage 6-10 EMP Overload Pylon or Aegis Shield Relay tactical detonation.
   * @private
   */
  _triggerGimmickDetonation(pylon) {
    const isEmp = pylon.gimmickKind === 'emp_pylon';
    const radius = isEmp ? 14.0 : 16.0;
    const damage = isEmp ? 110 : 140;
    const enemies = this._lastEnemies;
    const blastPos = pylon.center;

    pylon.isAlive = false;
    pylon.hp = 0;
    pylon.group.visible = false;
    pylon.respawnTimer = 20.0;

    this._spawnShockwave(blastPos);

    if (this.eventBus) {
      this.eventBus.emit(EVENTS.BARREL_EXPLODED, pylon._explodePayload);
      this.eventBus.emit(EVENTS.ANNOUNCEMENT, {
        kicker: isEmp ? 'EMP 파일런 과부하' : '이지스 쉴드 중계기 파괴',
        title: isEmp ? '전자기 충격파 발동!' : '적 방어 재생 차단!',
        subtitle: isEmp
          ? '주변 적 방어막 붕괴 및 0.75초 감전 경직'
          : '모든 보스/적 방어막 해제 및 아군 실드 셀 보급',
        duration: 2.4,
      });
    }

    if (enemies && enemies.length > 0) {
      for (let i = 0; i < enemies.length; i++) {
        const enemy = enemies[i];
        if (!enemy || enemy.isAlive === false || enemy.alive === false) continue;

        if (!isEmp && enemy._phaseShieldTimer > 0) {
          enemy._phaseShieldTimer = 0;
        }

        this._getEntityCenter(enemy, this._tmpVecA);
        const dist = blastPos.distanceTo(this._tmpVecA);
        if (dist > radius) continue;

        enemy._phaseShieldTimer = 0;
        if (typeof enemy.applyDamage === 'function') {
          this._tmpKnockback.subVectors(this._tmpVecA, blastPos);
          if (this._tmpKnockback.lengthSq() > 1e-4) this._tmpKnockback.normalize();
          else this._tmpKnockback.set(0, 1, 0);

          const falloff = Math.max(0.45, 1 - (dist / radius) * 0.55);
          enemy.applyDamage(damage * falloff, this._tmpVecA, false, this._tmpKnockback, {
            source: pylon.gimmickKind,
            piercing: true,
            isExplosion: true,
          });
        }
        if (isEmp && enemy.isAlive && !enemy.archetype?.isBoss) {
          enemy.state = 'stagger';
          enemy._staggerTimer = Math.max(enemy._staggerTimer || 0, 0.75);
        }
      }
    }

    if (isEmp) {
      if (this._zone.active && !this._zone.captured) {
        this.addZoneProgress(0.10);
      }
    } else {
      this.spawnItemDrop(pylon.position, 'shield', 30);
      this.spawnGoldDrop(pylon.position, 25);
    }
  }

  /**
   * Pre-allocated expanding thermite fireball shockwave pool.
   * @private
   */
  _buildShockwavePool() {
    const sphereGeo = this._trackGeo(new THREE.SphereGeometry(1, 16, 12));
    const ringGeo = this._trackGeo(new THREE.TorusGeometry(1, 0.12, 8, 28));
    ringGeo.rotateX(Math.PI * 0.5);

    const poolSize = Math.max(6, this._barrels.length + this._gimmickPylons.length);
    for (let i = 0; i < poolSize; i++) {
      const sphereMat = this._trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xff5a14,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      const ringMat = this._trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xffb838,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );

      const group = new THREE.Group();
      group.visible = false;
      const sphereMesh = new THREE.Mesh(sphereGeo, sphereMat);
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      group.add(sphereMesh, ringMesh);
      this.root.add(group);

      this._shockwaves.push({
        active: false,
        age: 0,
        duration: 0.38,
        maxRadius: ARENA_CONFIG.barrelRadius * 0.85,
        group,
        sphereMesh,
        ringMesh,
        sphereMat,
        ringMat,
      });
    }
  }

  /** @private */
  _spawnShockwave(pos) {
    for (let i = 0; i < this._shockwaves.length; i++) {
      const sw = this._shockwaves[i];
      if (!sw.active) {
        sw.active = true;
        sw.age = 0;
        sw.group.position.copy(pos);
        sw.group.visible = true;
        sw.sphereMesh.scale.setScalar(0.35);
        sw.ringMesh.scale.setScalar(0.35);
        sw.sphereMat.opacity = 0.85;
        sw.ringMat.opacity = 0.95;
        return;
      }
    }
  }

  /**
   * Iterative queue-based barrel detonation & chain-reaction splash damage with
   * distance falloff and CollisionWorld line-of-sight check.
   * @private
   */
  _triggerBarrelDetonation(initialBarrel) {
    const queue = this._detonationQueue;
    queue.push(initialBarrel);

    if (queue.length > 1) return;

    const radius = ARENA_CONFIG.barrelRadius;
    const baseDamage = ARENA_CONFIG.barrelDamage;
    const player = this._lastPlayerController;
    const enemies = this._lastEnemies;

    let head = 0;
    while (head < queue.length) {
      const barrel = queue[head++];
      barrel.isAlive = false;
      barrel.hp = 0;
      barrel.group.visible = false;
      barrel.respawnTimer = ARENA_CONFIG.barrelRespawnTime;

      const blastPos = barrel.center;
      this._spawnShockwave(blastPos);

      if (this.eventBus) {
        this.eventBus.emit(EVENTS.BARREL_EXPLODED, barrel._explodePayload);
      }

      // 1. Splash damage to nearby enemies
      if (enemies && enemies.length > 0) {
        for (let i = 0; i < enemies.length; i++) {
          const enemy = enemies[i];
          if (!enemy || enemy.isAlive === false || enemy.alive === false) continue;
          if (typeof enemy.applyDamage !== 'function') continue;

          this._getEntityCenter(enemy, this._tmpVecA);
          const dist = blastPos.distanceTo(this._tmpVecA);
          if (dist > radius) continue;

          if (this.collisionWorld && !this.collisionWorld.isLineOfSightClear(blastPos, this._tmpVecA)) {
            continue;
          }

          const falloff = Math.max(0.25, 1 - (dist / radius) * 0.72);
          const dmg = baseDamage * falloff;
          this._tmpKnockback.subVectors(this._tmpVecA, blastPos);
          if (this._tmpKnockback.lengthSq() > 1e-4) {
            this._tmpKnockback.normalize();
          } else {
            this._tmpKnockback.set(0, 1, 0);
          }

          enemy.applyDamage(dmg, this._tmpVecA, false, this._tmpKnockback, {
            source: 'barrel',
            isExplosion: true,
          });
        }
      }

      // 2. Chain-reaction splash damage to other barrels
      for (let i = 0; i < this._barrels.length; i++) {
        const other = this._barrels[i];
        if (other === barrel || !other.isAlive) continue;

        const dist = blastPos.distanceTo(other.center);
        if (dist > radius) continue;

        if (this.collisionWorld && !this.collisionWorld.isLineOfSightClear(blastPos, other.center)) {
          continue;
        }

        const falloff = Math.max(0.3, 1 - (dist / radius) * 0.68);
        const dmg = baseDamage * falloff;
        other.hp -= dmg;
        other.hitFlashTimer = 0.14;
        if (other.hp <= 0) {
          other.hp = 0;
          other.isAlive = false;
          queue.push(other);
        }
      }

      // 3. Self-splash damage to player
      if (player && player.isAlive && typeof player.applyDamage === 'function') {
        this._tmpVecB.set(player.position.x, player.position.y + 0.92, player.position.z);
        const dist = blastPos.distanceTo(this._tmpVecB);
        if (dist <= radius) {
          const losClear =
            !this.collisionWorld || this.collisionWorld.isLineOfSightClear(blastPos, this._tmpVecB);
          if (losClear) {
            const falloff = Math.max(0.2, 1 - (dist / radius) * 0.75);
            const playerDmg = Math.min(78, baseDamage * 0.48 * falloff);
            player.applyDamage(playerDmg, blastPos);
          }
        }
      }
    }

    queue.length = 0;
  }

  /** @private */
  _getEntityCenter(entity, outVec) {
    if (typeof entity.getCenterPosition === 'function') {
      entity.getCenterPosition(outVec);
    } else if (entity.center) {
      outVec.copy(entity.center);
    } else if (entity.position) {
      outVec.set(entity.position.x, entity.position.y + 0.95, entity.position.z);
    } else {
      outVec.set(0, 0, 0);
    }
    return outVec;
  }

  // ---------------------------------------------------------------------------
  // 3. Orbital Supply Pickups (Med-Repair Pod, Tactical Shield Battery, Brass Ammo)
  // ---------------------------------------------------------------------------

  /** @private */
  _buildPickups() {
    const spawns = this.arenaData.pickupSpawns || [];
    if (spawns.length === 0) return;

    // Orbital supply drop cradle pad (LatheGeometry)
    const padPoints = [
      new THREE.Vector2(0.72, 0.0),
      new THREE.Vector2(0.68, 0.06),
      new THREE.Vector2(0.54, 0.11),
      new THREE.Vector2(0.46, 0.07),
      new THREE.Vector2(0.01, 0.07),
    ];
    const padGeo = this._trackGeo(new THREE.LatheGeometry(padPoints, 18));
    const padGlowRingGeo = this._trackGeo(new THREE.TorusGeometry(0.56, 0.028, 6, 24));
    padGlowRingGeo.rotateX(Math.PI * 0.5);

    const padBaseMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x3b3832,
        metalness: 0.72,
        roughness: 0.52,
      })
    );
    const oliveArmorMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x424a3c,
        metalness: 0.55,
        roughness: 0.54,
      })
    );
    const ceramicArmorMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xd8dcd6,
        metalness: 0.25,
        roughness: 0.42,
      })
    );

    // Health silhouette: Med-Repair Pod (beveled military cross canister + gimbal collar)
    const crossShape = new THREE.Shape();
    const cw = 0.13;
    const cl = 0.36;
    crossShape.moveTo(-cw, cl);
    crossShape.lineTo(cw, cl);
    crossShape.lineTo(cw, cw);
    crossShape.lineTo(cl, cw);
    crossShape.lineTo(cl, -cw);
    crossShape.lineTo(cw, -cw);
    crossShape.lineTo(cw, -cl);
    crossShape.lineTo(-cw, -cl);
    crossShape.lineTo(-cw, -cw);
    crossShape.lineTo(-cl, -cw);
    crossShape.lineTo(-cl, cw);
    crossShape.lineTo(-cw, cw);
    crossShape.closePath();
    const healthCrossGeo = this._trackGeo(
      new THREE.ExtrudeGeometry(crossShape, {
        depth: 0.16,
        bevelEnabled: true,
        bevelThickness: 0.04,
        bevelSize: 0.035,
        bevelSegments: 2,
      })
    );
    healthCrossGeo.translate(0, 0, -0.08);
    const healthGimbalGeo = this._trackGeo(new THREE.TorusGeometry(0.46, 0.03, 6, 20));

    // Shield silhouette: Ceramic-white hex casing + steel-blue orbital shield cell
    const hexShape = new THREE.Shape();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i + Math.PI / 6;
      const hx = Math.cos(a) * 0.38;
      const hy = Math.sin(a) * 0.42;
      if (i === 0) hexShape.moveTo(hx, hy);
      else hexShape.lineTo(hx, hy);
    }
    hexShape.closePath();
    const shieldHexGeo = this._trackGeo(
      new THREE.ExtrudeGeometry(hexShape, {
        depth: 0.12,
        bevelEnabled: true,
        bevelThickness: 0.05,
        bevelSize: 0.04,
        bevelSegments: 2,
      })
    );
    shieldHexGeo.translate(0, 0, -0.06);
    const shieldPrismGeo = this._trackGeo(new THREE.OctahedronGeometry(0.24, 0));

    // Ammo silhouette: Military brass ammo crate / magazine cell + olive steel end-caps
    const ammoShape = new THREE.Shape();
    ammoShape.moveTo(-0.24, -0.32);
    ammoShape.lineTo(0.24, -0.32);
    ammoShape.lineTo(0.32, -0.20);
    ammoShape.lineTo(0.32, 0.22);
    ammoShape.lineTo(0.20, 0.34);
    ammoShape.lineTo(-0.20, 0.34);
    ammoShape.lineTo(-0.32, 0.22);
    ammoShape.lineTo(-0.32, -0.20);
    ammoShape.closePath();
    const ammoCellGeo = this._trackGeo(
      new THREE.ExtrudeGeometry(ammoShape, {
        depth: 0.24,
        bevelEnabled: true,
        bevelThickness: 0.04,
        bevelSize: 0.03,
        bevelSegments: 2,
      })
    );
    ammoCellGeo.translate(0, 0, -0.12);
    const ammoCapGeo = this._trackGeo(new THREE.BoxGeometry(0.60, 0.11, 0.36));

    const typeColors = {
      health: 0x22c55e,
      shield: 0x38bdf8,
      ammo: 0xeab308,
    };

    const healthMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x4ade80,
        emissive: new THREE.Color(0x22c55e),
        emissiveIntensity: 1.35,
        roughness: 0.28,
        metalness: 0.2,
      })
    );
    const shieldMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x7dd3fc,
        emissive: new THREE.Color(0x38bdf8),
        emissiveIntensity: 1.35,
        roughness: 0.22,
        metalness: 0.35,
      })
    );
    const ammoMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xfacc15,
        emissive: new THREE.Color(0xeab308),
        emissiveIntensity: 1.25,
        roughness: 0.32,
        metalness: 0.45,
      })
    );

    for (let i = 0; i < spawns.length; i++) {
      const cfg = spawns[i];
      const type = cfg.type || 'health';
      const pos = cfg.pos;
      const accentHex = typeColors[type] || 0x22c55e;

      const rootGroup = new THREE.Group();
      rootGroup.position.set(pos.x, pos.y, pos.z);

      const padMesh = new THREE.Mesh(padGeo, padBaseMat);
      padMesh.receiveShadow = true;
      rootGroup.add(padMesh);

      const padRingMat = this._trackMat(
        new THREE.MeshBasicMaterial({
          color: accentHex,
          transparent: true,
          opacity: 0.78,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      const padRing = new THREE.Mesh(padGlowRingGeo, padRingMat);
      padRing.position.y = 0.09;
      rootGroup.add(padRing);

      const iconGroup = new THREE.Group();
      iconGroup.position.y = 1.0;

      if (type === 'health') {
        const cross = new THREE.Mesh(healthCrossGeo, healthMat);
        const gimbal = new THREE.Mesh(healthGimbalGeo, oliveArmorMat);
        gimbal.rotation.x = 0.55;
        gimbal.rotation.y = 0.4;
        iconGroup.add(cross, gimbal);
      } else if (type === 'shield') {
        const hex = new THREE.Mesh(shieldHexGeo, ceramicArmorMat);
        const prism = new THREE.Mesh(shieldPrismGeo, shieldMat);
        prism.scale.set(1.25, 1.35, 1.15);
        const ring = new THREE.Mesh(healthGimbalGeo, shieldMat);
        ring.scale.setScalar(0.95);
        iconGroup.add(hex, prism, ring);
      } else {
        const cell = new THREE.Mesh(ammoCellGeo, ammoMat);
        const topCap = new THREE.Mesh(ammoCapGeo, oliveArmorMat);
        topCap.position.y = 0.32;
        const botCap = new THREE.Mesh(ammoCapGeo, oliveArmorMat);
        botCap.position.y = -0.32;
        iconGroup.add(cell, topCap, botCap);
      }

      rootGroup.add(iconGroup);
      this.root.add(rootGroup);

      this._pickups.push({
        id: `pickup_${type}_${i}`,
        type,
        position: new THREE.Vector3(pos.x, pos.y, pos.z),
        active: true,
        respawnTimer: 0,
        spawnPopTimer: 0,
        phase: i * 1.15,
        rootGroup,
        iconGroup,
        padRingMat,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // 4. Terra-Beacon Control Zone (Industrial Steel Projectors + Uplink Field)
  // ---------------------------------------------------------------------------

  /** @private */
  _buildControlZone() {
    const r = this._zoneRadius;
    const zGroup = new THREE.Group();
    zGroup.position.copy(this._zoneCenter);
    this._zoneGroup = zGroup;

    // Outer primary uplink boundary ring (starts warm amber standby)
    const outerRingGeo = this._trackGeo(new THREE.RingGeometry(r - 0.18, r + 0.04, 48));
    outerRingGeo.rotateX(-Math.PI * 0.5);
    this._zoneOuterRingMat = this._trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xf59e0b,
        transparent: true,
        opacity: 0.45,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    const outerRing = new THREE.Mesh(outerRingGeo, this._zoneOuterRingMat);
    outerRing.position.y = 0.035;
    zGroup.add(outerRing);

    // Inner counter-rotating segmented orbital uplink ring
    const innerRingGroup = new THREE.Group();
    innerRingGroup.position.y = 0.045;
    this._zoneInnerRingMat = this._trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xf59e0b,
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    const segArc = (Math.PI * 2) / 8;
    const segGeo = this._trackGeo(new THREE.RingGeometry(r - 0.92, r - 0.72, 8, 1, 0, segArc * 0.62));
    segGeo.rotateX(-Math.PI * 0.5);
    for (let i = 0; i < 8; i++) {
      const seg = new THREE.Mesh(segGeo, this._zoneInnerRingMat);
      seg.rotation.y = i * segArc;
      innerRingGroup.add(seg);
    }
    zGroup.add(innerRingGroup);
    this._zoneInnerRing = innerRingGroup;

    // Expanding radial floor progress disc
    const progGeo = this._trackGeo(new THREE.CircleGeometry(r - 0.25, 40));
    progGeo.rotateX(-Math.PI * 0.5);
    this._zoneProgressMat = this._trackMat(
      new THREE.MeshBasicMaterial({
        color: 0x84cc16,
        transparent: true,
        opacity: 0.0,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    const progMesh = new THREE.Mesh(progGeo, this._zoneProgressMat);
    progMesh.position.y = 0.025;
    progMesh.scale.setScalar(0.01);
    zGroup.add(progMesh);
    this._zoneProgressMesh = progMesh;

    // 4 Industrial Steel Ground Projector Pods anchoring the Terra-Beacon perimeter
    const podShape = new THREE.Shape();
    podShape.moveTo(-0.34, 0);
    podShape.lineTo(0.34, 0);
    podShape.lineTo(0.24, 0.32);
    podShape.lineTo(-0.24, 0.32);
    podShape.closePath();
    const podGeo = this._trackGeo(
      new THREE.ExtrudeGeometry(podShape, {
        depth: 0.46,
        bevelEnabled: true,
        bevelThickness: 0.04,
        bevelSize: 0.03,
        bevelSegments: 1,
      })
    );
    podGeo.translate(0, 0, -0.23);
    const podMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x3b342d,
        metalness: 0.75,
        roughness: 0.54,
      })
    );
    const podCollarGeo = this._trackGeo(new THREE.BoxGeometry(0.46, 0.08, 0.50));
    const podCollarMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        map: this._hazardCollarTex,
        metalness: 0.35,
        roughness: 0.7,
      })
    );

    for (let i = 0; i < 4; i++) {
      const ang = (Math.PI * 0.5) * i;
      const pod = new THREE.Mesh(podGeo, podMat);
      pod.position.set(Math.cos(ang) * r, 0.01, Math.sin(ang) * r);
      pod.rotation.y = -ang + Math.PI * 0.5;
      zGroup.add(pod);

      const collar = new THREE.Mesh(podCollarGeo, podCollarMat);
      collar.position.set(Math.cos(ang) * r, 0.05, Math.sin(ang) * r);
      collar.rotation.y = -ang + Math.PI * 0.5;
      zGroup.add(collar);
    }

    // Translucent vertical Terra-Beacon uplink field cylinder
    this._zoneFieldTex = this._trackTex(createZoneFieldTexture());
    const cylH = 4.4;
    const cylGeo = this._trackGeo(new THREE.CylinderGeometry(r, r, cylH, 48, 1, true));
    this._zoneCylinderMat = this._trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xf59e0b,
        map: this._zoneFieldTex,
        transparent: true,
        opacity: 0.0,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    const cylMesh = new THREE.Mesh(cylGeo, this._zoneCylinderMat);
    cylMesh.position.y = cylH * 0.5 + 0.02;
    cylMesh.visible = false;
    zGroup.add(cylMesh);
    this._zoneCylinder = cylMesh;

    this.root.add(zGroup);
  }

  // ---------------------------------------------------------------------------
  // Per-Frame Update (Zero Heap Allocations!)
  // ---------------------------------------------------------------------------

  /**
   * Update all interactables: jump pad animations, barrels & shockwaves,
   * floating pickups & collection, and Control Zone capture state.
   *
   * @param {number} dt
   * @param {number} elapsedTime
   * @param {any} [playerController]
   * @param {Array<any>} [enemies]
   * @param {any} [weaponSystem]
   */
  update(dt, elapsedTime, playerController = null, enemies = null, weaponSystem = null) {
    const safeDt = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.1) : 0;
    const t = Number.isFinite(elapsedTime) ? elapsedTime : 0;

    this._lastPlayerController = playerController;
    this._lastEnemies = enemies;

    this._updateJumpPads(t);
    this._updateBarrels(safeDt, t);
    this._updateGimmicks(safeDt, t, playerController, enemies);
    this._updateShockwaves(safeDt);
    this._updatePickups(safeDt, t, playerController, weaponSystem);
    this._updateControlZone(safeDt, t, playerController, enemies);
    this._updateDynamicPools(safeDt, t, playerController, weaponSystem);
    if (playerController) {
      playerController.inZoneBuff = Boolean(this._zone.active && this._zone.playerInside);
    }
  }

  /**
   * Step 2: Pre-allocated pools for Gold Drops (24), Weapon Drops (4),
   * Boss Missile Telegraph Strikes (6), and Boss Ground Shockwaves (2).
   * @private
   */
  _buildDynamicPools() {
    // 1. Upright 3D Gold Coins (disc + raised rim + embossed hex emblem)
    this._goldDrops = [];
    const coinDiscGeo = this._trackGeo(new THREE.CylinderGeometry(0.23, 0.23, 0.05, 20));
    coinDiscGeo.rotateX(Math.PI * 0.5);
    const coinRimGeo = this._trackGeo(new THREE.TorusGeometry(0.22, 0.025, 8, 20));
    const coinEmblemGeo = this._trackGeo(new THREE.CylinderGeometry(0.105, 0.105, 0.064, 6));
    coinEmblemGeo.rotateX(Math.PI * 0.5);

    const coinFaceMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xfacc15,
        emissive: new THREE.Color(0xb45309),
        emissiveIntensity: 0.65,
        metalness: 0.92,
        roughness: 0.18,
      })
    );
    const coinRimMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        emissive: new THREE.Color(0x92400e),
        emissiveIntensity: 0.45,
        metalness: 0.88,
        roughness: 0.24,
      })
    );
    for (let i = 0; i < 24; i++) {
      const coinGroup = new THREE.Group();
      coinGroup.add(
        new THREE.Mesh(coinDiscGeo, coinFaceMat),
        new THREE.Mesh(coinRimGeo, coinRimMat),
        new THREE.Mesh(coinEmblemGeo, coinRimMat)
      );
      coinGroup.visible = false;
      this.root.add(coinGroup);
      this._goldDrops.push({
        active: false,
        age: 0,
        amount: 15,
        pos: new THREE.Vector3(),
        velY: 0,
        floorY: 0.34,
        mesh: coinGroup,
      });
    }

    // 2. Actual 3D Weapon Drops (using real WeaponModelFactory rigs instead of boxes)
    this._weaponDrops = [];
    this._weaponDropRigs = [];
    this._weaponFactory = new WeaponModelFactory();
    this._swapCooldown = 0;
    const beamGeo = this._trackGeo(new THREE.CylinderGeometry(0.08, 0.18, 3.2, 10, 1, true));
    const ringGeo = this._trackGeo(new THREE.RingGeometry(0.42, 0.56, 24));
    ringGeo.rotateX(-Math.PI * 0.5);
    for (let i = 0; i < 8; i++) {
      const group = new THREE.Group();
      group.visible = false;
      const modelPivot = new THREE.Group();
      modelPivot.position.y = 0.78;
      const ringMat = this._trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xf59e0b,
          transparent: true,
          opacity: 0.72,
          side: THREE.DoubleSide,
          depthWrite: false,
        })
      );
      const beamMat = this._trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xfbbf24,
          transparent: true,
          opacity: 0.18,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.y = 0.05;
      const beam = new THREE.Mesh(beamGeo, beamMat);
      beam.position.y = 1.65;
      group.add(modelPivot, ring, beam);
      this.root.add(group);
      this._weaponDrops.push({
        active: false,
        age: 0,
        weaponIndex: 1,
        pos: new THREE.Vector3(),
        group,
        modelPivot,
        modelsByIdx: Object.create(null),
        activeModel: null,
        ringMat,
        beamMat,
      });
    }

    // 3. Enemy-Dropped 3D Medkit (Heal) & Shield Cell Pickups
    this._itemDrops = [];
    const medBodyGeo = this._trackGeo(new THREE.BoxGeometry(0.42, 0.28, 0.18));
    const medHandleGeo = this._trackGeo(new THREE.BoxGeometry(0.18, 0.055, 0.065));
    const medStrapGeo = this._trackGeo(new THREE.BoxGeometry(0.44, 0.045, 0.195));
    const medCrossHGeo = this._trackGeo(new THREE.BoxGeometry(0.20, 0.062, 0.202));
    const medCrossVGeo = this._trackGeo(new THREE.BoxGeometry(0.062, 0.20, 0.202));
    const medCaseMat = this._trackMat(
      new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.38, metalness: 0.16 })
    );
    const medTrimMat = this._trackMat(
      new THREE.MeshStandardMaterial({ color: 0x27272a, roughness: 0.55, metalness: 0.45 })
    );
    const medCrossMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x22c55e,
        emissive: new THREE.Color(0x16a34a),
        emissiveIntensity: 1.65,
        roughness: 0.25,
        metalness: 0.1,
      })
    );

    const shBodyGeo = this._trackGeo(new THREE.CylinderGeometry(0.16, 0.16, 0.36, 6));
    const shCapGeo = this._trackGeo(new THREE.CylinderGeometry(0.175, 0.175, 0.07, 6));
    const shCoreGeo = this._trackGeo(new THREE.CylinderGeometry(0.172, 0.172, 0.14, 6));
    const shShellMat = this._trackMat(
      new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.36, metalness: 0.72 })
    );
    const shCoreMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: new THREE.Color(0x0284c7),
        emissiveIntensity: 1.75,
        roughness: 0.2,
        metalness: 0.25,
      })
    );

    for (let i = 0; i < 12; i++) {
      const rootGroup = new THREE.Group();
      rootGroup.visible = false;

      const medkitGroup = new THREE.Group();
      const medBody = new THREE.Mesh(medBodyGeo, medCaseMat);
      const medHandle = new THREE.Mesh(medHandleGeo, medTrimMat);
      medHandle.position.y = 0.165;
      const medStrap = new THREE.Mesh(medStrapGeo, medTrimMat);
      medStrap.position.y = -0.10;
      const crossH = new THREE.Mesh(medCrossHGeo, medCrossMat);
      const crossV = new THREE.Mesh(medCrossVGeo, medCrossMat);
      medkitGroup.add(medBody, medHandle, medStrap, crossH, crossV);

      const shieldGroup = new THREE.Group();
      const shBody = new THREE.Mesh(shBodyGeo, shShellMat);
      const shTop = new THREE.Mesh(shCapGeo, medTrimMat);
      shTop.position.y = 0.18;
      const shBot = new THREE.Mesh(shCapGeo, medTrimMat);
      shBot.position.y = -0.18;
      const shCore = new THREE.Mesh(shCoreGeo, shCoreMat);
      shieldGroup.add(shBody, shTop, shBot, shCore);
      shieldGroup.visible = false;

      rootGroup.add(medkitGroup, shieldGroup);
      this.root.add(rootGroup);
      this._itemDrops.push({
        active: false,
        age: 0,
        type: 'health',
        amount: 25,
        pos: new THREE.Vector3(),
        velY: 0,
        floorY: 0.38,
        group: rootGroup,
        medkitGroup,
        shieldGroup,
      });
    }

    // Boss Missile & Orbital Sweep Telegraph Strikes (floor ring + expanding fill -> explosion)
    this._bossMissiles = [];
    const mOuterGeo = this._trackGeo(new THREE.RingGeometry(2.9, 3.25, 28));
    mOuterGeo.rotateX(-Math.PI * 0.5);
    const mFillGeo = this._trackGeo(new THREE.CircleGeometry(3.15, 28));
    mFillGeo.rotateX(-Math.PI * 0.5);
    for (let i = 0; i < 10; i++) {
      const group = new THREE.Group();
      group.visible = false;
      const outerMat = this._trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xef4444,
          transparent: true,
          opacity: 0.9,
          side: THREE.DoubleSide,
          depthWrite: false,
        })
      );
      const fillMat = this._trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xf97316,
          transparent: true,
          opacity: 0.35,
          side: THREE.DoubleSide,
          depthWrite: false,
        })
      );
      const outer = new THREE.Mesh(mOuterGeo, outerMat);
      const fill = new THREE.Mesh(mFillGeo, fillMat);
      fill.position.y = 0.01;
      group.add(outer, fill);
      this.root.add(group);
      this._bossMissiles.push({
        active: false,
        age: 0,
        fuse: 1.25,
        radius: 3.3,
        damage: 26,
        hitEnemies: false,
        enemyDamage: 0,
        pos: new THREE.Vector3(),
        group,
        fill,
        outerMat,
        fillMat,
      });
    }

    // Boss Phase Ground Shockwave Rings (jump over to evade!)
    this._bossShockwaves = [];
    const sRingGeo = this._trackGeo(new THREE.RingGeometry(0.84, 1.0, 40));
    sRingGeo.rotateX(-Math.PI * 0.5);
    for (let i = 0; i < 2; i++) {
      const mat = this._trackMat(
        new THREE.MeshBasicMaterial({
          color: 0xef4444,
          transparent: true,
          opacity: 0.88,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      const mesh = new THREE.Mesh(sRingGeo, mat);
      mesh.visible = false;
      this.root.add(mesh);
      this._bossShockwaves.push({
        active: false,
        age: 0,
        duration: 1.45,
        maxRadius: 26.0,
        hitPlayer: false,
        origin: new THREE.Vector3(),
        mesh,
        mat,
      });
    }
  }

  spawnGoldDrop(pos, amount = 15) {
    if (!this._goldDrops) return;
    let slot = null;
    for (let i = 0; i < this._goldDrops.length; i++) {
      if (!this._goldDrops[i].active) {
        slot = this._goldDrops[i];
        break;
      }
    }
    if (!slot) slot = this._goldDrops[0];
    const floorY = this.collisionWorld ? this.collisionWorld.getGroundHeightAt(pos.x, pos.z, pos.y + 1.0) : 0;
    slot.active = true;
    slot.age = 0;
    slot.amount = Math.max(5, Math.round(amount));
    slot.floorY = floorY + 0.4;
    slot.pos.set(pos.x + (Math.random() - 0.5) * 0.8, Math.max(slot.floorY, pos.y + 0.6), pos.z + (Math.random() - 0.5) * 0.8);
    slot.velY = 3.8 + Math.random() * 1.5;
    slot.mesh.position.copy(slot.pos);
    slot.mesh.visible = true;
  }

  _ensureWeaponDropModel(slot, weaponIndex) {
    if (slot.modelsByIdx[weaponIndex]) {
      return slot.modelsByIdx[weaponIndex];
    }
    const cfg = WEAPONS[weaponIndex] || WEAPONS[0];
    const rig = this._weaponFactory.createWeaponRig(cfg);
    if (rig.leftHand) rig.leftHand.visible = false;
    if (rig.rightHand) rig.rightHand.visible = false;
    if (rig.reticleMesh) rig.reticleMesh.visible = false;
    this._weaponDropRigs.push(rig);

    const holder = new THREE.Group();
    const box = new THREE.Box3().setFromObject(rig.root);
    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    box.getCenter(center);
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z, 0.25);
    const targetLen = weaponIndex >= 4 ? 0.72 : 1.02;
    const scale = targetLen / maxDim;

    rig.root.position.sub(center);
    holder.add(rig.root);
    holder.scale.setScalar(scale);
    holder.rotation.set(0.08, 0, 0.14);
    holder.visible = false;
    slot.modelPivot.add(holder);
    slot.modelsByIdx[weaponIndex] = holder;
    return holder;
  }

  spawnWeaponDrop(pos, weaponIndex) {
    if (!this._weaponDrops) return;
    let slot = null;
    for (let i = 0; i < this._weaponDrops.length; i++) {
      if (!this._weaponDrops[i].active) {
        slot = this._weaponDrops[i];
        break;
      }
    }
    if (!slot) slot = this._weaponDrops[0];
    const floorY = this.collisionWorld ? this.collisionWorld.getGroundHeightAt(pos.x, pos.z, (pos.y || 0) + 1.2) : 0;
    slot.active = true;
    slot.age = 0;
    slot.weaponIndex = weaponIndex;
    slot.pos.set(pos.x, floorY, pos.z);

    if (slot.activeModel) slot.activeModel.visible = false;
    const model = this._ensureWeaponDropModel(slot, weaponIndex);
    model.visible = true;
    slot.activeModel = model;

    // Primary drops = Amber/Rust, Secondary drops = Cyan/Emerald
    const hex = weaponIndex >= 4 ? (weaponIndex === 6 ? 0x22c55e : 0x38bdf8) : (weaponIndex === 2 ? 0xfbbf24 : 0xea580c);
    slot.ringMat.color.setHex(hex);
    slot.beamMat.color.setHex(hex);
    slot.group.position.copy(slot.pos);
    slot.group.visible = true;
  }

  spawnItemDrop(pos, type = 'health', amount = 25) {
    if (!this._itemDrops) return;
    let slot = null;
    for (let i = 0; i < this._itemDrops.length; i++) {
      if (!this._itemDrops[i].active) {
        slot = this._itemDrops[i];
        break;
      }
    }
    if (!slot) slot = this._itemDrops[0];
    const isShield = type === 'shield';
    const floorY = this.collisionWorld ? this.collisionWorld.getGroundHeightAt(pos.x, pos.z, (pos.y || 0) + 1.0) : 0;
    slot.active = true;
    slot.age = 0;
    slot.type = isShield ? 'shield' : 'health';
    slot.amount = Math.max(10, Math.round(amount));
    slot.floorY = floorY + 0.42;
    slot.pos.set(
      pos.x + (Math.random() - 0.5) * 1.1,
      Math.max(slot.floorY, (pos.y || 0) + 0.65),
      pos.z + (Math.random() - 0.5) * 1.1
    );
    slot.velY = 3.6 + Math.random() * 1.2;
    slot.medkitGroup.visible = !isShield;
    slot.shieldGroup.visible = isShield;
    slot.group.position.copy(slot.pos);
    slot.group.visible = true;
  }

  getNearbyWeaponDrop(playerPos) {
    if (!this._weaponDrops || !playerPos) return null;
    let best = null;
    let bestDistSq = 3.0 * 3.0;
    for (let i = 0; i < this._weaponDrops.length; i++) {
      const wd = this._weaponDrops[i];
      if (!wd.active) continue;
      const dx = playerPos.x - wd.pos.x;
      const dz = playerPos.z - wd.pos.z;
      const dSq = dx * dx + dz * dz;
      if (dSq < bestDistSq && Math.abs(playerPos.y - wd.pos.y) < 2.2) {
        bestDistSq = dSq;
        best = wd;
      }
    }
    return best;
  }

  trySwapNearbyWeapon(playerPos, weaponSystem) {
    if (this._swapCooldown > 0 || !playerPos || !weaponSystem) return false;
    const drop = this.getNearbyWeaponDrop(playerPos);
    if (!drop) return false;

    const dropPos = drop.pos.clone();
    const pickedIdx = drop.weaponIndex;
    drop.active = false;
    drop.group.visible = false;
    this._swapCooldown = 0.45;

    const res = weaponSystem.equipFloorWeapon(pickedIdx);
    if (res && res.swapped && res.replacedIndex >= 0) {
      // Drop previously equipped weapon onto the floor!
      this.spawnWeaponDrop(dropPos, res.replacedIndex);
    }
    if (this.eventBus && res) {
      this.eventBus.emit(EVENTS.WEAPON_DROPPED, {
        weaponIndex: pickedIdx,
        weapon: res.weapon,
        unlocked: res.swapped,
        replacedWeapon: res.replacedWeapon || null,
        overclockLevel: res.overclockLevel,
      });
    }
    return true;
  }

  spawnBossMissile(targetPos, opts = null) {
    if (!this._bossMissiles) return;
    for (let i = 0; i < this._bossMissiles.length; i++) {
      const m = this._bossMissiles[i];
      if (!m.active) {
        const floorY = this.collisionWorld
          ? this.collisionWorld.getGroundHeightAt(targetPos.x, targetPos.z, (targetPos.y || 0) + 1.5)
          : 0;
        m.active = true;
        m.age = 0;
        m.fuse = opts && Number.isFinite(opts.fuse) ? opts.fuse : 1.25;
        m.damage = opts && Number.isFinite(opts.damage) ? opts.damage : 26;
        m.hitEnemies = Boolean(opts && opts.hitEnemies);
        m.enemyDamage = opts && Number.isFinite(opts.enemyDamage) ? opts.enemyDamage : 0;
        m.pos.set(targetPos.x, floorY + 0.08, targetPos.z);
        m.group.position.copy(m.pos);
        m.fill.scale.setScalar(0.05);
        m.group.visible = true;
        if (this.eventBus) this.eventBus.emit('SFX_BOSS_TELEGRAPH', { type: 'missile' });
        return;
      }
    }
  }

  spawnBossShockwave(origin) {
    if (!this._bossShockwaves) return;
    for (let i = 0; i < this._bossShockwaves.length; i++) {
      const sw = this._bossShockwaves[i];
      if (!sw.active) {
        const floorY = this.collisionWorld
          ? this.collisionWorld.getGroundHeightAt(origin.x, origin.z, (origin.y || 0) + 1.0)
          : 0;
        sw.active = true;
        sw.age = 0;
        sw.hitPlayer = false;
        sw.origin.set(origin.x, floorY + 0.16, origin.z);
        sw.mesh.position.copy(sw.origin);
        sw.mesh.scale.setScalar(1.5);
        sw.mat.opacity = 0.92;
        sw.mesh.visible = true;
        if (this.eventBus) this.eventBus.emit('SFX_BOSS_TELEGRAPH', { type: 'shockwave' });
        return;
      }
    }
  }

  /** @private */
  _updateDynamicPools(dt, t, playerController, weaponSystem) {
    const canCheck = playerController && playerController.isAlive;
    const px = canCheck ? playerController.position.x : 0;
    const py = canCheck ? playerController.position.y + 0.9 : 0;
    const pz = canCheck ? playerController.position.z : 0;

    // 1. Gold Drops (magnet pull within 4.8m)
    if (this._goldDrops) {
      for (let i = 0; i < this._goldDrops.length; i++) {
        const g = this._goldDrops[i];
        if (!g.active) continue;
        g.age += dt;
        if (g.age > 24.0) {
          g.active = false;
          g.mesh.visible = false;
          continue;
        }
        g.velY -= 14.0 * dt;
        g.pos.y += g.velY * dt;
        if (g.pos.y < g.floorY) {
          g.pos.y = g.floorY;
          g.velY = Math.abs(g.velY) > 1.2 ? -g.velY * 0.35 : 0;
        }
        if (canCheck) {
          const dx = px - g.pos.x;
          const dy = py - g.pos.y;
          const dz = pz - g.pos.z;
          const distSq = dx * dx + dy * dy + dz * dz;
          if (distSq < 1.35 * 1.35) {
            g.active = false;
            g.mesh.visible = false;
            if (this.eventBus) {
              this.eventBus.emit(EVENTS.GOLD_COLLECTED, { amount: g.amount, position: g.pos });
            }
            continue;
          } else if (distSq < 4.8 * 4.8) {
            const dist = Math.sqrt(distSq) || 1;
            const pull = 12.5 * dt;
            g.pos.x += (dx / dist) * pull;
            g.pos.y += (dy / dist) * pull;
            g.pos.z += (dz / dist) * pull;
          }
        }
        g.mesh.position.set(g.pos.x, g.pos.y + Math.sin(t * 4.5 + i) * 0.08, g.pos.z);
        g.mesh.rotation.y += dt * 3.2;
      }
    }

    // 2. Floor Weapon Drops (rotate & persist up to 45s; picked up via [F] / Touch Swap)
    if (this._swapCooldown > 0) {
      this._swapCooldown = Math.max(0, this._swapCooldown - dt);
    }
    if (this._weaponDrops) {
      for (let i = 0; i < this._weaponDrops.length; i++) {
        const wd = this._weaponDrops[i];
        if (!wd.active) continue;
        wd.age += dt;
        if (wd.age > 45.0) {
          wd.active = false;
          wd.group.visible = false;
          continue;
        }
        wd.modelPivot.rotation.y += dt * 1.85;
        wd.modelPivot.position.y = 0.74 + Math.sin(t * 3.0 + i) * 0.11;
      }
    }

    // 2.5. Enemy-Dropped 3D Medkits (Heal) & Shield Cells
    if (this._itemDrops) {
      for (let i = 0; i < this._itemDrops.length; i++) {
        const it = this._itemDrops[i];
        if (!it.active) continue;
        it.age += dt;
        if (it.age > 26.0) {
          it.active = false;
          it.group.visible = false;
          continue;
        }
        it.velY -= 14.0 * dt;
        it.pos.y += it.velY * dt;
        if (it.pos.y < it.floorY) {
          it.pos.y = it.floorY;
          it.velY = Math.abs(it.velY) > 1.1 ? -it.velY * 0.32 : 0;
        }
        if (canCheck) {
          const needsIt =
            it.type === 'health'
              ? playerController.health < playerController.maxHealth - 0.5
              : playerController.shield < playerController.maxShield - 0.5;
          if (needsIt) {
            const dx = px - it.pos.x;
            const dy = py - it.pos.y;
            const dz = pz - it.pos.z;
            const distSq = dx * dx + dy * dy + dz * dz;
            if (distSq < 1.45 * 1.45) {
              it.active = false;
              it.group.visible = false;
              let gained = it.amount;
              if (it.type === 'health') {
                gained = Math.min(it.amount, playerController.maxHealth - playerController.health);
                playerController.heal(it.amount, 0);
              } else {
                gained = Math.min(it.amount, playerController.maxShield - playerController.shield);
                playerController.heal(0, it.amount);
              }
              if (this.eventBus) {
                this._pickupPayload.type = it.type;
                this._pickupPayload.amount = Math.round(gained);
                this._pickupPayload.position.copy(it.pos);
                this.eventBus.emit(EVENTS.PICKUP_COLLECTED, this._pickupPayload);
              }
              continue;
            } else if (distSq < 4.4 * 4.4) {
              const dist = Math.sqrt(distSq) || 1;
              const pull = 11.5 * dt;
              it.pos.x += (dx / dist) * pull;
              it.pos.y += (dy / dist) * pull;
              it.pos.z += (dz / dist) * pull;
            }
          }
        }
        it.group.position.set(it.pos.x, it.pos.y + Math.sin(t * 3.8 + i) * 0.08, it.pos.z);
        it.group.rotation.y += dt * 2.2;
      }
    }

    // 3. Boss Missile & Orbital Sweep Telegraph Strikes
    if (this._bossMissiles) {
      const enemies = this._lastEnemies;
      for (let i = 0; i < this._bossMissiles.length; i++) {
        const m = this._bossMissiles[i];
        if (!m.active) continue;
        m.age += dt;
        const p = Math.min(1, m.age / m.fuse);
        m.fill.scale.setScalar(Math.max(0.05, p));
        m.outerMat.opacity = 0.6 + 0.4 * Math.sin(t * 24);
        if (m.age >= m.fuse) {
          m.active = false;
          m.group.visible = false;
          this._spawnShockwave(m.pos);
          if (this.eventBus) {
            this.eventBus.emit(EVENTS.BARREL_EXPLODED, { position: m.pos, radius: m.radius, damage: 0 });
          }
          if (canCheck) {
            const dx = playerController.position.x - m.pos.x;
            const dz = playerController.position.z - m.pos.z;
            const dy = Math.abs(playerController.position.y - m.pos.y);
            if (dx * dx + dz * dz <= m.radius * m.radius && dy < 2.6) {
              playerController.applyDamage(m.damage, m.pos);
            }
          }
          if (m.hitEnemies && m.enemyDamage > 0 && enemies && enemies.length > 0) {
            const rSq = m.radius * m.radius;
            for (let ei = 0; ei < enemies.length; ei++) {
              const e = enemies[ei];
              if (!e || !e.isAlive || typeof e.applyDamage !== 'function') continue;
              const edx = e.position.x - m.pos.x;
              const edz = e.position.z - m.pos.z;
              if (edx * edx + edz * edz <= rSq) {
                e.applyDamage(m.enemyDamage, e.center || e.position, false, null, {
                  source: 'orbital_sweep',
                  isExplosion: true,
                });
              }
            }
          }
        }
      }
    }

    // 4. Boss Ground Shockwave Rings (Jump to evade!)
    if (this._bossShockwaves) {
      for (let i = 0; i < this._bossShockwaves.length; i++) {
        const sw = this._bossShockwaves[i];
        if (!sw.active) continue;
        sw.age += dt;
        const p = sw.age / sw.duration;
        if (p >= 1) {
          sw.active = false;
          sw.mesh.visible = false;
          continue;
        }
        const radius = 1.5 + p * (sw.maxRadius - 1.5);
        sw.mesh.scale.setScalar(radius);
        sw.mat.opacity = (1 - p) * 0.92;
        if (canCheck && !sw.hitPlayer) {
          const dist = Math.hypot(playerController.position.x - sw.origin.x, playerController.position.z - sw.origin.z);
          const onGroundHeight = playerController.position.y < sw.origin.y + 1.05;
          if (onGroundHeight && Math.abs(dist - radius) < 1.35) {
            sw.hitPlayer = true;
            playerController.applyDamage(28, sw.origin);
          }
        }
      }
    }
  }

  /** @private */
  _updateJumpPads(t) {
    for (let k = 0; k < this._jumpRingMats.length; k++) {
      const phase = (t * 1.08 + k / 3) % 1.0;
      const fade = Math.sin(phase * Math.PI);
      this._jumpRingMats[k].opacity = fade * 0.72;
    }

    for (let i = 0; i < this._jumpPads.length; i++) {
      const pad = this._jumpPads[i];
      for (let k = 0; k < pad.rings.length; k++) {
        const phase = (t * 1.08 + k / 3) % 1.0;
        const ring = pad.rings[k];
        ring.position.y = 0.22 + phase * 1.78;
        const scale = 0.88 + phase * 0.24;
        ring.scale.set(scale, 1, scale);
      }
    }
  }

  /** @private */
  _updateBarrels(dt, t) {
    const basePulse = 1.8 + 0.32 * Math.sin(t * 4.0);

    for (let i = 0; i < this._barrels.length; i++) {
      const b = this._barrels[i];

      if (b.isAlive) {
        if (b.hitFlashTimer > 0) {
          b.hitFlashTimer = Math.max(0, b.hitFlashTimer - dt);
          const f = b.hitFlashTimer / 0.14;
          b.coreMat.emissive.setRGB(1.0, 0.25 + f * 0.72, 0.04 + f * 0.65);
          b.coreMat.emissiveIntensity = 1.9 + f * 2.8;
        } else {
          const damageFrac = 1 - b.hp / b.maxHp;
          const warnPulse =
            damageFrac > 0.01 ? 1.9 + damageFrac * 1.5 + Math.sin(t * 18) * damageFrac * 0.8 : basePulse;
          b.coreMat.emissive.setRGB(1.0, 0.26, 0.04);
          b.coreMat.emissiveIntensity = warnPulse;
        }

        if (b.spawnPopTimer > 0) {
          b.spawnPopTimer = Math.max(0, b.spawnPopTimer - dt);
          const p = 1 - b.spawnPopTimer / 0.3;
          const s = 0.2 + 0.8 * (1 - (1 - p) * (1 - p));
          b.group.scale.setScalar(s);
        }
      } else {
        b.respawnTimer -= dt;
        if (b.respawnTimer <= 0) {
          b.hp = b.maxHp;
          b.isAlive = true;
          b.hitFlashTimer = 0;
          b.spawnPopTimer = 0.3;
          b.group.scale.setScalar(0.2);
          b.group.visible = true;
        }
      }
    }
  }

  /**
   * Update Stage 6-10 EMP Pylons, Shield Relays, and periodic Orbital Sweep Strikes.
   * @private
   */
  _updateGimmicks(dt, t, playerController, enemies) {
    for (let i = 0; i < this._gimmickPylons.length; i++) {
      const p = this._gimmickPylons[i];
      if (!p.enabled) continue;

      if (p.isAlive) {
        p.core.rotation.y += dt * 1.9;
        p.core.position.y = 1.92 + Math.sin(t * 3.2 + p.phase) * 0.08;
        p.halo.rotation.z += dt * 1.35;

        if (p.hitFlashTimer > 0) {
          p.hitFlashTimer = Math.max(0, p.hitFlashTimer - dt);
          const f = p.hitFlashTimer / 0.14;
          p.coreMat.emissiveIntensity = 1.9 + f * 3.0;
        } else {
          p.coreMat.emissiveIntensity = 1.7 + 0.38 * Math.sin(t * 4.6 + p.phase);
        }

        if (p.spawnPopTimer > 0) {
          p.spawnPopTimer = Math.max(0, p.spawnPopTimer - dt);
          const prog = 1 - p.spawnPopTimer / 0.35;
          p.group.scale.setScalar(0.2 + 0.8 * (1 - (1 - prog) * (1 - prog)));
        }
      } else {
        p.respawnTimer -= dt;
        if (p.respawnTimer <= 0) {
          p.hp = p.maxHp;
          p.isAlive = true;
          p.hitFlashTimer = 0;
          p.spawnPopTimer = 0.35;
          p.group.scale.setScalar(0.2);
          p.group.visible = true;
        }
      }
    }

    // Periodic Orbital Sweep Barrage (lures enemies into telegraphed strike zones too!)
    if (this._activeGimmickConfig.orbitalSweep && playerController && playerController.isAlive) {
      this._orbitalSweepTimer -= dt;
      if (this._orbitalSweepTimer <= 0) {
        this._orbitalSweepTimer = 7.2;
        const pPos = playerController.position;
        this.spawnBossMissile(
          { x: pPos.x + (Math.random() - 0.5) * 3.2, y: pPos.y, z: pPos.z + (Math.random() - 0.5) * 3.2 },
          { fuse: 1.55, damage: 24, hitEnemies: true, enemyDamage: 115 }
        );
        if (enemies && enemies.length > 0) {
          let extra = 0;
          for (let ei = 0; ei < enemies.length && extra < 2; ei++) {
            const e = enemies[ei];
            if (!e || !e.isAlive) continue;
            this.spawnBossMissile(
              { x: e.position.x, y: e.position.y, z: e.position.z },
              { fuse: 1.55, damage: 24, hitEnemies: true, enemyDamage: 115 }
            );
            extra++;
          }
        }
      }
    }
  }

  /** @private */
  _updateShockwaves(dt) {
    for (let i = 0; i < this._shockwaves.length; i++) {
      const sw = this._shockwaves[i];
      if (!sw.active) continue;

      sw.age += dt;
      const p = sw.age / sw.duration;
      if (p >= 1) {
        sw.active = false;
        sw.group.visible = false;
        continue;
      }

      const easeOut = 1 - (1 - p) * (1 - p);
      const rSphere = 0.35 + easeOut * sw.maxRadius * 0.65;
      const rRing = 0.4 + easeOut * sw.maxRadius;
      sw.sphereMesh.scale.setScalar(rSphere);
      sw.ringMesh.scale.set(rRing, 1, rRing);
      sw.sphereMat.opacity = (1 - p) * (1 - p) * 0.72;
      sw.ringMat.opacity = (1 - p) * 0.92;
    }
  }

  /** @private */
  _updatePickups(dt, t, playerController, weaponSystem) {
    const canCheckPlayer = playerController && playerController.isAlive;
    let px = 0;
    let py = 0;
    let pz = 0;
    if (canCheckPlayer) {
      px = playerController.position.x;
      py = playerController.position.y + 0.9;
      pz = playerController.position.z;
    }

    for (let i = 0; i < this._pickups.length; i++) {
      const p = this._pickups[i];

      if (!p.active) {
        p.respawnTimer -= dt;
        p.padRingMat.opacity = 0.16;
        if (p.respawnTimer <= 0) {
          p.active = true;
          p.spawnPopTimer = 0.32;
          p.iconGroup.visible = true;
          p.iconGroup.scale.setScalar(0.15);
          p.padRingMat.opacity = 0.78;
        }
        continue;
      }

      p.iconGroup.position.y = 1.0 + Math.sin(t * 2.6 + p.phase) * 0.14;
      p.iconGroup.rotation.y += dt * 1.85;
      p.padRingMat.opacity = 0.58 + 0.24 * Math.sin(t * 3.5 + p.phase);

      if (p.spawnPopTimer > 0) {
        p.spawnPopTimer = Math.max(0, p.spawnPopTimer - dt);
        const k = 1 - p.spawnPopTimer / 0.32;
        p.iconGroup.scale.setScalar(0.15 + 0.85 * (1 - (1 - k) * (1 - k)));
      }

      if (!canCheckPlayer) continue;

      const dx = px - p.position.x;
      const dy = py - (p.position.y + 0.95);
      const dz = pz - p.position.z;
      const distSq = dx * dx + dy * dy + dz * dz;
      if (distSq > PICKUP_COLLECT_RADIUS_SQ) continue;

      let collected = false;
      let amount = 0;

      if (p.type === 'health') {
        if (playerController.health < playerController.maxHealth - 0.5) {
          amount = Math.min(HEALTH_PICKUP_AMOUNT, playerController.maxHealth - playerController.health);
          playerController.heal(HEALTH_PICKUP_AMOUNT, 0);
          collected = true;
        }
      } else if (p.type === 'shield') {
        if (playerController.shield < playerController.maxShield - 0.5) {
          amount = Math.min(SHIELD_PICKUP_AMOUNT, playerController.maxShield - playerController.shield);
          playerController.heal(0, SHIELD_PICKUP_AMOUNT);
          collected = true;
        }
      } else if (p.type === 'ammo') {
        const ammoResult = this._tryRefillAmmo(weaponSystem);
        if (ammoResult.collected) {
          collected = true;
          amount = ammoResult.amount;
        }
      }

      if (collected) {
        p.active = false;
        p.respawnTimer = PICKUP_RESPAWN_TIME;
        p.iconGroup.visible = false;
        p.padRingMat.opacity = 0.16;

        if (this.eventBus) {
          this._pickupPayload.type = p.type;
          this._pickupPayload.amount = amount;
          this._pickupPayload.position.copy(p.position);
          this.eventBus.emit(EVENTS.PICKUP_COLLECTED, this._pickupPayload);
        }
      }
    }
  }

  /** @private */
  _tryRefillAmmo(weaponSystem) {
    const out = this._ammoResult;
    out.collected = false;
    out.amount = 0;

    if (!weaponSystem) return out;

    if (typeof weaponSystem.needsAmmo === 'function' && !weaponSystem.needsAmmo()) {
      return out;
    }
    if (typeof weaponSystem.isAmmoFull === 'function' && weaponSystem.isAmmoFull()) {
      return out;
    }
    if (typeof weaponSystem.canRefillAmmo === 'function' && !weaponSystem.canRefillAmmo()) {
      return out;
    }

    if (typeof weaponSystem.refillAmmo === 'function') {
      const res = weaponSystem.refillAmmo(AMMO_PICKUP_FRACTION);
      if (res === false || res === 0) return out;
      out.collected = true;
      out.amount = typeof res === 'number' && res > 0 ? res : Math.round(AMMO_PICKUP_FRACTION * 100);
      return out;
    }

    if (typeof weaponSystem.addAmmo === 'function') {
      const res = weaponSystem.addAmmo(AMMO_PICKUP_FRACTION);
      if (res === false || res === 0) return out;
      out.collected = true;
      out.amount = typeof res === 'number' && res > 0 ? res : 50;
      return out;
    }

    return out;
  }

  /** @private */
  _updateControlZone(dt, t, playerController, enemies) {
    const z = this._zone;
    const cx = this._zoneCenter.x;
    const cy = this._zoneCenter.y;
    const cz = this._zoneCenter.z;
    const rSq = this._zoneRadius * this._zoneRadius;

    let playerInside = false;
    if (playerController && playerController.isAlive) {
      const dx = playerController.position.x - cx;
      const dz = playerController.position.z - cz;
      const dy = playerController.position.y - cy;
      if (dx * dx + dz * dz <= rSq && dy >= -1.0 && dy <= 4.5) {
        playerInside = true;
      }
    }

    let enemyInside = false;
    if (enemies && enemies.length > 0) {
      for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        if (!e || e.isAlive === false || e.alive === false) continue;
        const ep = e.position || e.center;
        if (!ep) continue;
        const dx = ep.x - cx;
        const dz = ep.z - cz;
        const dy = ep.y - cy;
        if (dx * dx + dz * dz <= rSq && dy >= -1.0 && dy <= 4.5) {
          enemyInside = true;
          break;
        }
      }
    }

    z.playerInside = playerInside;
    z.contesting = z.active && !z.captured && playerInside && enemyInside;

    if (z.active && !z.captured) {
      if (playerInside && !enemyInside) {
        z.owner = 'player';
        z.progress = Math.min(
          1,
          z.progress + (dt / ARENA_CONFIG.controlZoneCaptureTime) * z.captureSpeedMultiplier
        );
        if (z.progress >= 1) {
          z.progress = 1;
          z.captured = true;
          z.contesting = false;
        }
      } else if (z.contesting) {
        z.owner = 'contested';
      } else if (enemyInside) {
        z.owner = 'enemy';
        z.progress = Math.max(0, z.progress - dt / (ARENA_CONFIG.controlZoneCaptureTime * 2.8));
      } else {
        z.owner = 'neutral';
      }
    } else if (z.captured) {
      z.owner = 'player';
    } else {
      z.owner = 'neutral';
    }

    if (this._zoneInnerRing) {
      const spinSpeed = z.active ? (z.contesting ? 1.55 : 0.55) : 0.22;
      this._zoneInnerRing.rotation.y -= dt * spinSpeed;
    }
    if (this._zoneFieldTex && z.active) {
      this._zoneFieldTex.offset.x = (t * 0.08) % 1;
    }

    // Select Terra-Beacon uplink ring color: warm amber -> emerald-gold -> pulsing red contested
    if (z.captured) {
      this._tmpColorTarget.copy(this._colCaptured);
    } else if (z.contesting || (z.active && z.owner === 'enemy')) {
      const flash = 0.5 + 0.5 * Math.sin(t * 14.0);
      this._tmpColorTarget.copy(this._colContestedA).lerp(this._colContestedB, flash);
    } else if (z.active && z.playerInside) {
      this._tmpColorTarget.copy(this._colPlayer);
    } else {
      this._tmpColorTarget.copy(this._colNeutral);
    }

    const lerpAmt = Math.min(1, dt * 10);
    this._zoneOuterRingMat.color.lerp(this._tmpColorTarget, lerpAmt);
    this._zoneInnerRingMat.color.lerp(this._tmpColorTarget, lerpAmt);
    this._zoneCylinderMat.color.lerp(this._tmpColorTarget, lerpAmt);
    this._zoneProgressMat.color.lerp(this._tmpColorTarget, lerpAmt);

    if (z.active) {
      this._zoneCylinder.visible = true;
      const pulse = 0.5 + 0.5 * Math.sin(t * (z.contesting ? 10.0 : 3.2));
      this._zoneCylinderMat.opacity = z.captured ? 0.34 + pulse * 0.14 : 0.24 + pulse * 0.16;
      this._zoneOuterRingMat.opacity = 0.72 + pulse * 0.22;
      this._zoneInnerRingMat.opacity = 0.55 + pulse * 0.25;

      const fillScale = Math.max(0.01, z.progress);
      this._zoneProgressMesh.visible = z.progress > 0.005;
      this._zoneProgressMesh.scale.setScalar(fillScale);
      this._zoneProgressMat.opacity = z.captured ? 0.24 : 0.10 + z.progress * 0.16;
    } else {
      this._zoneCylinder.visible = false;
      this._zoneProgressMesh.visible = false;
      const idlePulse = 0.5 + 0.5 * Math.sin(t * 1.8);
      this._zoneOuterRingMat.opacity = 0.28 + idlePulse * 0.12;
      this._zoneInnerRingMat.opacity = 0.20 + idlePulse * 0.08;
    }

    z.emitCooldown = Math.max(0, z.emitCooldown - dt);
    const stateChanged =
      z.active !== z.lastEmittedActive ||
      z.captured !== z.lastEmittedCaptured ||
      z.contesting !== z.lastEmittedContesting ||
      z.owner !== z.lastEmittedOwner;
    const progressMoved = Math.abs(z.progress - z.lastEmittedProgress) >= 0.004;

    if (stateChanged || (z.active && progressMoved && z.emitCooldown <= 0)) {
      this._emitZoneProgress();
      z.emitCooldown = 0.06;
    }
  }

  /** @private */
  _emitZoneProgress() {
    const z = this._zone;
    z.lastEmittedActive = z.active;
    z.lastEmittedCaptured = z.captured;
    z.lastEmittedContesting = z.contesting;
    z.lastEmittedOwner = z.owner;
    z.lastEmittedProgress = z.progress;

    if (!this.eventBus) return;
    this._zonePayload.progress = z.progress;
    this._zonePayload.contesting = z.contesting;
    this._zonePayload.owner = z.owner;
    this._zonePayload.active = z.active;
    this._zonePayload.captured = z.captured;
    this.eventBus.emit(EVENTS.ZONE_PROGRESS, this._zonePayload);
  }

  // ---------------------------------------------------------------------------
  // Public Query & Control API
  // ---------------------------------------------------------------------------

  /**
   * Configure Stage 6-10 wave gimmicks (EMP Pylons, Shield Relays, Orbital Sweeps).
   * @param {{ empPylons?: boolean, orbitalSweep?: boolean, shieldRelays?: boolean }|null} gimmick
   */
  setWaveGimmicks(gimmick) {
    const cfg = gimmick || {};
    this._activeGimmickConfig.empPylons = Boolean(cfg.empPylons);
    this._activeGimmickConfig.orbitalSweep = Boolean(cfg.orbitalSweep);
    this._activeGimmickConfig.shieldRelays = Boolean(cfg.shieldRelays);
    this._orbitalSweepTimer = 5.2;

    for (let i = 0; i < this._gimmickPylons.length; i++) {
      const p = this._gimmickPylons[i];
      const shouldEnable =
        (p.gimmickKind === 'emp_pylon' && this._activeGimmickConfig.empPylons) ||
        (p.gimmickKind === 'shield_relay' && this._activeGimmickConfig.shieldRelays);
      p.enabled = shouldEnable;
      p.isAlive = shouldEnable;
      p.hp = p.maxHp;
      p.respawnTimer = 0;
      p.hitFlashTimer = 0;
      p.spawnPopTimer = shouldEnable ? 0.35 : 0;
      p.group.scale.setScalar(shouldEnable ? 0.2 : 1);
      p.group.visible = shouldEnable;
    }
  }

  /**
   * Return the number of intact Aegis Shield Relays sustaining enemy defenses.
   */
  getActiveShieldRelayCount() {
    let count = 0;
    for (let i = 0; i < this._gimmickPylons.length; i++) {
      const p = this._gimmickPylons[i];
      if (p.enabled && p.isAlive && p.gimmickKind === 'shield_relay') {
        count++;
      }
    }
    return count;
  }

  /**
   * Return a zero-allocation array of all currently alive destructible targets (barrels + Stage 6-10 pylons).
   */
  getDestructibleTargets() {
    this._activeBarrels.length = 0;
    for (let i = 0; i < this._barrels.length; i++) {
      if (this._barrels[i].isAlive) {
        this._activeBarrels.push(this._barrels[i]);
      }
    }
    for (let i = 0; i < this._gimmickPylons.length; i++) {
      const p = this._gimmickPylons[i];
      if (p.enabled && p.isAlive) {
        this._activeBarrels.push(p);
      }
    }
    return this._activeBarrels;
  }

  /**
   * Return the zero-allocation internal list of arena pickup descriptors for HUD/minimap rendering.
   */
  getPickups() {
    return this._pickups;
  }

  /**
   * Activate or deactivate the Terra-Beacon Control Zone objective.
   * @param {boolean} active
   */
  setZoneActive(active) {
    const next = Boolean(active);
    if (this._zone.active === next) return;
    this._zone.active = next;
    if (next && this._zone.captured) {
      this._zone.captured = false;
      this._zone.progress = 0;
    }
    this._emitZoneProgress();
  }

  /**
   * Set the capture speed multiplier for the Control Zone (clamped to [0.25, 5.0]).
   * @param {number} [mult=1.0]
   */
  setCaptureSpeedMultiplier(mult = 1.0) {
    const safe = Number.isFinite(mult) ? mult : 1.0;
    this._zone.captureSpeedMultiplier = Math.max(0.25, Math.min(5.0, safe));
  }

  /**
   * Adjust Control Zone progress directly by delta (clamped to [0, 1]), updating capture state
   * and emitting EVENTS.ZONE_PROGRESS when changed.
   * @param {number} delta
   */
  addZoneProgress(delta) {
    if (!Number.isFinite(delta) || delta === 0) return;
    const z = this._zone;
    const prevProgress = z.progress;
    const prevCaptured = z.captured;

    const nextProgress = Math.max(0, Math.min(1, prevProgress + delta));
    const nextCaptured = nextProgress >= 1;

    if (nextProgress === prevProgress && nextCaptured === prevCaptured) return;

    z.progress = nextProgress;
    z.captured = nextCaptured;
    if (z.captured) {
      z.contesting = false;
      z.owner = 'player';
    }
    this._emitZoneProgress();
  }

  /**
   * Reset Control Zone capture progress, speed multiplier, and contest flags.
   */
  resetZone() {
    this._zone.active = false;
    this._zone.progress = 0;
    this._zone.captured = false;
    this._zone.contesting = false;
    this._zone.playerInside = false;
    this._zone.owner = 'neutral';
    this._zone.captureSpeedMultiplier = 1.0;
    this._zone.emitCooldown = 0;
    if (this._zoneCylinder) this._zoneCylinder.visible = false;
    if (this._zoneProgressMesh) {
      this._zoneProgressMesh.visible = false;
      this._zoneProgressMesh.scale.setScalar(0.01);
    }
    this._emitZoneProgress();
  }

  /**
   * Return a zero-allocation snapshot of the Control Zone state.
   */
  getZoneState() {
    const s = this._zoneSnapshot;
    s.active = this._zone.active;
    s.progress = this._zone.progress;
    s.captured = this._zone.captured;
    s.contesting = this._zone.contesting;
    s.playerInside = this._zone.playerInside;
    s.playerInZone = this._zone.playerInside;
    s.owner = this._zone.owner;
    s.captureSpeedMultiplier = this._zone.captureSpeedMultiplier;
    return s;
  }

  /**
   * Reset all interactables (control zone, barrels, shockwaves, pickups) for a fresh match.
   */
  reset() {
    this.resetZone();
    this._zone.captureSpeedMultiplier = 1.0;
    this._detonationQueue.length = 0;

    for (let i = 0; i < this._barrels.length; i++) {
      const b = this._barrels[i];
      b.isAlive = true;
      b.hp = b.maxHp;
      b.respawnTimer = 0;
      b.hitFlashTimer = 0;
      b.spawnPopTimer = 0;
      b.group.scale.setScalar(1);
      b.group.visible = true;
      b.coreMat.emissive.setRGB(1.0, 0.26, 0.04);
      b.coreMat.emissiveIntensity = 1.9;
    }

    for (let i = 0; i < this._shockwaves.length; i++) {
      this._shockwaves[i].active = false;
      this._shockwaves[i].group.visible = false;
    }
    if (this._goldDrops) {
      for (let i = 0; i < this._goldDrops.length; i++) {
        this._goldDrops[i].active = false;
        this._goldDrops[i].mesh.visible = false;
      }
    }
    if (this._weaponDrops) {
      for (let i = 0; i < this._weaponDrops.length; i++) {
        this._weaponDrops[i].active = false;
        this._weaponDrops[i].group.visible = false;
      }
    }
    if (this._itemDrops) {
      for (let i = 0; i < this._itemDrops.length; i++) {
        this._itemDrops[i].active = false;
        this._itemDrops[i].group.visible = false;
      }
    }
    if (this._bossMissiles) {
      for (let i = 0; i < this._bossMissiles.length; i++) {
        this._bossMissiles[i].active = false;
        this._bossMissiles[i].group.visible = false;
      }
    }
    if (this._bossShockwaves) {
      for (let i = 0; i < this._bossShockwaves.length; i++) {
        this._bossShockwaves[i].active = false;
        this._bossShockwaves[i].mesh.visible = false;
      }
    }

    this.setWaveGimmicks(null);

    for (let i = 0; i < this._pickups.length; i++) {
      const p = this._pickups[i];
      p.active = true;
      p.respawnTimer = 0;
      p.spawnPopTimer = 0;
      p.iconGroup.visible = true;
      p.iconGroup.scale.setScalar(1);
      p.padRingMat.opacity = 0.78;
    }
  }

  /**
   * Cleanly remove all scene objects and dispose every geometry, material, and procedural texture
   * so map transitions leak zero GPU resources.
   */
  dispose() {
    if (this.root && this.root.parent) {
      this.root.parent.remove(this.root);
    }

    for (let i = 0; i < this._geometries.length; i++) {
      this._geometries[i].dispose();
    }
    this._geometries.length = 0;

    for (let i = 0; i < this._materials.length; i++) {
      this._materials[i].dispose();
    }
    this._materials.length = 0;

    for (let i = 0; i < this._textures.length; i++) {
      this._textures[i].dispose();
    }
    this._textures.length = 0;

    if (this._weaponDropRigs) {
      for (let i = 0; i < this._weaponDropRigs.length; i++) {
        this._weaponDropRigs[i].dispose();
      }
      this._weaponDropRigs.length = 0;
    }
    if (this._weaponFactory) {
      this._weaponFactory.dispose();
      this._weaponFactory = null;
    }

    this._jumpPads.length = 0;
    this._jumpRingMats.length = 0;
    this._barrels.length = 0;
    this._activeBarrels.length = 0;
    this._gimmickPylons.length = 0;
    this._shockwaves.length = 0;
    this._pickups.length = 0;
    this._detonationQueue.length = 0;

    this._zoneGroup = null;
    this._zoneCylinder = null;
    this._zoneCylinderMat = null;
    this._zoneOuterRingMat = null;
    this._zoneInnerRing = null;
    this._zoneInnerRingMat = null;
    this._zoneProgressMesh = null;
    this._zoneProgressMat = null;
    this._zoneFieldTex = null;
    this._hazardCollarTex = null;
    this._lastPlayerController = null;
    this._lastEnemies = null;
    this.root = null;
  }
}
  __exports.Interactables = Interactables;
});
