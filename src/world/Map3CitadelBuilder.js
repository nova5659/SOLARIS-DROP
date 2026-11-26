// Module: src/world/Map3CitadelBuilder.js
__define("src/world/Map3CitadelBuilder.js", (__exports, __require) => {
const { ARENA_CONFIG } = __require("src/config/constants.js");
const { TextureGenerator } = __require("src/world/TextureGenerator.js");

/**
 * Deterministic PRNG (Mulberry32) for consistent procedural ruined-vista placement.
 * @param {number} seed
 * @returns {() => number}
 */
function createRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Scale ExtrudeGeometry world-meter UVs so procedural PBR textures tile cleanly.
 * @param {THREE.BufferGeometry} geo
 * @param {number} [scaleU=0.22]
 * @param {number} [scaleV=0.22]
 * @returns {THREE.BufferGeometry}
 */
function scaleGeometryUVs(geo, scaleU = 0.22, scaleV = 0.22) {
  const uv = geo.attributes.uv;
  if (!uv) return geo;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * scaleU, uv.getY(i) * scaleV);
  }
  uv.needsUpdate = true;
  return geo;
}

/**
 * Compute world-metric normal-aware UVs on a BoxGeometry(w, h, d) so textures
 * tile uniformly in meters across every face with zero aspect distortion.
 * @param {THREE.BufferGeometry} geo
 * @param {number} w
 * @param {number} h
 * @param {number} d
 * @param {number} [tileU=2.0]
 * @param {number} [tileV=2.0]
 * @returns {THREE.BufferGeometry}
 */
function scaleBoxUVs(geo, w, h, d, tileU = 2.0, tileV = 2.0) {
  const pos = geo.attributes.position;
  const norm = geo.attributes.normal;
  const uv = geo.attributes.uv;
  if (!pos || !norm || !uv) return geo;
  const invU = 1 / (tileU || 1);
  const invV = 1 / (tileV || 1);
  for (let i = 0; i < uv.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const nx = Math.abs(norm.getX(i));
    const ny = Math.abs(norm.getY(i));
    if (nx > 0.5) {
      uv.setXY(i, (z + d * 0.5) * invU, (y + h * 0.5) * invV);
    } else if (ny > 0.5) {
      uv.setXY(i, (x + w * 0.5) * invU, (z + d * 0.5) * invV);
    } else {
      uv.setXY(i, (x + w * 0.5) * invU, (y + h * 0.5) * invV);
    }
  }
  uv.needsUpdate = true;
  return geo;
}

/**
 * Map 3 Builder — "SECTOR-00 // THE CRATER CITADEL"
 * Monumental crimson-ochre dusk impact crater & shattered orbital elevator boss crucible
 * engineered for wide-open maneuvering against COLOSSUS-IV // ASH TITAN (4.2m, r=1.55m)
 * while offering 8 radial blast-shield monoliths and a wrap-around y=4.2m ring-catwalk
 * reached by 4 wide stepped ramps (0.30m/step) and 4 ballistically calibrated jump pads.
 */
class Map3CitadelBuilder {
  /**
   * @param {THREE.Scene} scene
   * @param {import('../physics/CollisionWorld.js').CollisionWorld} collisionWorld
   * @param {any} [qualityConfig={}]
   * @param {TextureGenerator|null} [sharedTexGen=null]
   */
  constructor(scene, collisionWorld, qualityConfig = {}, sharedTexGen = null) {
    this.scene = scene;
    this.collisionWorld = collisionWorld;
    this.qualityConfig = qualityConfig || {};

    this._ownsTexGen = !sharedTexGen;
    this._texGen = sharedTexGen || new TextureGenerator(4);

    this.root = new THREE.Group();
    this.root.name = 'ArenaRoot_SECTOR00_CraterCitadel';

    /** @type {THREE.BufferGeometry[]} */
    this._geometries = [];
    /** @type {THREE.Material[]} */
    this._materials = [];
    /** @type {THREE.Light[]} */
    this._lights = [];
    /** @type {THREE.PointLight[]} */
    this._accentLights = [];
    /** @type {THREE.DirectionalLight|null} */
    this._dirLight = null;
    /** @type {THREE.HemisphereLight|null} */
    this._hemiLight = null;

    // Animated references (zero-GC update)
    this._craterGroundMat = null;
    this._fissureEmberMat = null;
    this._tetherBeaconMat = null;
    this._tetherRingOuter = null;
    this._tetherRingInner = null;
    this._distantBeaconMat = null;
    this._craterGlowLight = null;
    this._tetherBeaconLight = null;

    this._built = false;
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

  /**
   * Build the complete SECTOR-00 // THE CRATER CITADEL arena, register 1:1 colliders,
   * and return structured arenaData.
   */
  build() {
    if (this._built) {
      this.dispose();
    }
    this._built = true;

    this.root = new THREE.Group();
    this.root.name = 'ArenaRoot_SECTOR00_CraterCitadel';
    this.scene.add(this.root);

    const half = ARENA_CONFIG.halfSize; // 32
    const innerBound = half - 0.5; // 31.5
    const wallH = ARENA_CONFIG.wallHeight; // 11

    // Register exact inner arena boundary clamp (63m x 63m interior, maxY = 28m)
    this.collisionWorld.setArenaBounds(-innerBound, innerBound, -innerBound, innerBound, 0, 28);

    // 1. Shared Procedural PBR Materials (strictly MeshStandardMaterial / MeshBasicMaterial)
    const mats = this._createMaterials();

    // 2. Scorched Basalt Impact Crater Floor & Low Central Orbital Anchor Plinth (y=0.20m)
    this._buildCraterFloorAndPlinth(mats, innerBound);

    // 3. Perimeter Blast Walls, Upper Parapet Buttresses & Weathered Sector Signboards
    this._buildPerimeterWalls(mats, innerBound, wallH);
    this._buildSectorSignboards(mats, innerBound);

    // 4. 8 Radial Blast-Shield Concrete Monoliths (r=13.5m) & 8 Leaning Orbital-Tether Pylon Ribs (r=18.8m)
    this._buildMonolithRingAndTetherRibs(mats);

    // 5. Wrap-Around Elevated Ring-Catwalk (y=4.2m) & 4 Wide Stepped Ramps (0.30m/step <= 0.35m)
    this._buildElevatedRingCatwalkAndRamps(mats, innerBound);

    // 6. Outer Corridor Waist-High Crashed Orbital Elevator Slabs
    this._buildCrashedElevatorSlabs(mats);

    // 7. Shattered Orbital Elevator North Spire, Rotating Warning Rings & Ruined Dusk Skyline
    this._buildOrbitalElevatorVistaAndSkyDome(mats);

    // 8. Crimson-Ochre Dusk Sun + Ash Bounce + <=2 PointLights + Volcanic Ash Fog
    this._buildLighting();
    this.setQuality(this.qualityConfig);

    // 9. Collision-verified spawns & metadata
    // All ground spawns verified >= 2.75m clear (Boss radius = 1.55m, height = 4.20m).
    // Jump pads ballistically calibrated for g=26 m/s^2, Vh=11.0 m/s, Vy=17.6 m/s:
    //   peak y = 5.96m at t=0.677s (+1.76m above 4.2m deck), lands at y=4.2m at t=1.0445s (d=11.49m).
    const arenaData = {
      mapId: 'crater_citadel',
      mapIndex: 2,
      mapCode: 'SEC-00',
      mapName: 'SECTOR-00 // SKY-SPIRE CITADEL',
      mapSubtitle: 'SUNLIT ORBITAL ELEVATOR — BOSS CRUCIBLE',
      atmosphere: {
        bgColor: 0x5eb2f5,
        fogColor: 0xc2e4fc,
        fogDensity: 0.0032,
      },
      playerSpawn: {
        pos: new THREE.Vector3(0, 0.05, 23.5),
        yaw: 0,
      },
      enemySpawns: [
        // 8 Wide-Open Ground Crater & Outer Ring Spawns (>= 2.75m clearance for 4.2m Boss)
        { pos: new THREE.Vector3(0.0, 0.05, -18.5), isElevated: false },
        { pos: new THREE.Vector3(-4.0, 0.05, -19.5), isElevated: false },
        { pos: new THREE.Vector3(4.0, 0.05, -19.5), isElevated: false },
        { pos: new THREE.Vector3(0.0, 0.05, -8.5), isElevated: false },
        { pos: new THREE.Vector3(-19.5, 0.05, 0.0), isElevated: false },
        { pos: new THREE.Vector3(19.5, 0.05, 0.0), isElevated: false },
        { pos: new THREE.Vector3(-9.5, 0.05, -9.5), isElevated: false },
        { pos: new THREE.Vector3(9.5, 0.05, -9.5), isElevated: false },
        // 4 Elevated Ring-Catwalk Overwatch Spawns (y = 4.20m deck)
        { pos: new THREE.Vector3(-28.2, 4.25, -13.0), isElevated: true },
        { pos: new THREE.Vector3(28.2, 4.25, -13.0), isElevated: true },
        { pos: new THREE.Vector3(-28.2, 4.25, 13.0), isElevated: true },
        { pos: new THREE.Vector3(28.2, 4.25, 13.0), isElevated: true },
      ],
      pickupSpawns: [
        { pos: new THREE.Vector3(-24.5, 4.20, 0.0), type: 'shield' },
        { pos: new THREE.Vector3(24.5, 4.20, 0.0), type: 'health' },
        { pos: new THREE.Vector3(0.0, 4.20, -24.8), type: 'ammo' },
        { pos: new THREE.Vector3(-28.5, 0.0, 0.0), type: 'ammo' },
        { pos: new THREE.Vector3(28.5, 0.0, 0.0), type: 'shield' },
        { pos: new THREE.Vector3(0.0, 0.0, 16.5), type: 'health' },
      ],
      barrelSpawns: [
        new THREE.Vector3(-9.5, 0.0, 0.0),
        new THREE.Vector3(9.5, 0.0, 0.0),
        new THREE.Vector3(-2.6, 0.0, -13.0),
        new THREE.Vector3(2.6, 0.0, -13.0),
        new THREE.Vector3(-14.5, 0.0, 11.5),
        new THREE.Vector3(14.5, 0.0, 11.5),
      ],
      jumpPadSpawns: [
        // Launches cleanly from open rim (z=±17.3, x=±15.0) onto center of North/South Ring (z=±28.79)
        { pos: new THREE.Vector3(-15.0, 0.0, -17.3), launchVy: 17.6, launchDirX: 0, launchDirZ: -1 },
        { pos: new THREE.Vector3(15.0, 0.0, -17.3), launchVy: 17.6, launchDirX: 0, launchDirZ: -1 },
        { pos: new THREE.Vector3(-15.0, 0.0, 17.3), launchVy: 17.6, launchDirX: 0, launchDirZ: 1 },
        { pos: new THREE.Vector3(15.0, 0.0, 17.3), launchVy: 17.6, launchDirX: 0, launchDirZ: 1 },
      ],
      controlZoneCenter: new THREE.Vector3(0, 0.2, 0),
      controlZoneRadius: ARENA_CONFIG.controlZoneRadius,
      arenaBounds: {
        minX: -innerBound,
        maxX: innerBound,
        minZ: -innerBound,
        maxZ: innerBound,
      },
    };

    return arenaData;
  }

  /**
   * Create shared PBR materials tailored to a scorched volcanic basalt & rusted iron crucible.
   * Zero MeshPhysicalMaterial, zero neon cyan/magenta.
   * @private
   */
  _createMaterials() {
    const craterTex = this._texGen.getCraterGroundTextures(12, 12);
    const concreteTex = this._texGen.getWallTextures(1, 1);
    const catwalkTex = this._texGen.getCatwalkTextures(1, 1);
    const rustTex = this._texGen.getRustMetalTextures(1, 1);
    const hazardTex = this._texGen.getHazardTextures(1, 1);
    const ruinedSkyTex = this._texGen.getRuinedSkylineTextures();

    const craterGroundMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        map: craterTex.map,
        roughnessMap: craterTex.roughnessMap,
        bumpMap: craterTex.bumpMap,
        bumpScale: 0.045,
        emissive: new THREE.Color(0x38bdf8),
        emissiveMap: craterTex.emissiveMap,
        emissiveIntensity: 0.32,
        metalness: 0.14,
        roughness: 0.62,
      })
    );

    const plinthConcreteMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xf4f8fc,
        map: concreteTex.map,
        roughnessMap: concreteTex.roughnessMap,
        bumpMap: concreteTex.bumpMap,
        bumpScale: 0.035,
        metalness: 0.14,
        roughness: 0.58,
      })
    );

    const wallConcreteMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xf2f7fc,
        map: concreteTex.map,
        roughnessMap: concreteTex.roughnessMap,
        bumpMap: concreteTex.bumpMap,
        bumpScale: 0.05,
        metalness: 0.14,
        roughness: 0.62,
      })
    );

    const monolithConcreteMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xfafcff,
        map: concreteTex.map,
        roughnessMap: concreteTex.roughnessMap,
        bumpMap: concreteTex.bumpMap,
        bumpScale: 0.045,
        metalness: 0.16,
        roughness: 0.56,
      })
    );

    const rustSteelMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xe6eef6,
        map: rustTex.map,
        roughnessMap: rustTex.roughnessMap,
        bumpMap: rustTex.bumpMap,
        bumpScale: 0.04,
        metalness: 0.42,
        roughness: 0.42,
      })
    );

    const darkIronMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x9cb3c9,
        roughnessMap: rustTex.roughnessMap,
        bumpMap: rustTex.bumpMap,
        bumpScale: 0.03,
        metalness: 0.48,
        roughness: 0.40,
      })
    );

    const spireSteelMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xdae6f2,
        map: rustTex.map,
        roughnessMap: rustTex.roughnessMap,
        bumpMap: rustTex.bumpMap,
        bumpScale: 0.04,
        metalness: 0.44,
        roughness: 0.44,
      })
    );

    const catwalkMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xf0f6fc,
        map: catwalkTex.map,
        roughnessMap: catwalkTex.roughnessMap,
        bumpMap: catwalkTex.bumpMap,
        bumpScale: 0.035,
        metalness: 0.42,
        roughness: 0.44,
      })
    );

    const stepMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xeef5fc,
        map: catwalkTex.map,
        roughnessMap: catwalkTex.roughnessMap,
        bumpMap: catwalkTex.bumpMap,
        bumpScale: 0.035,
        metalness: 0.38,
        roughness: 0.48,
      })
    );

    const hazardMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        map: hazardTex.map,
        roughnessMap: hazardTex.roughnessMap,
        bumpMap: hazardTex.bumpMap,
        bumpScale: 0.03,
        metalness: 0.2,
        roughness: 0.56,
      })
    );

    const fissureEmberMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: new THREE.Color(0x0284c7),
        emissiveIntensity: 1.2,
        roughness: 0.3,
        metalness: 0.08,
      })
    );

    const tungstenAmberMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xfbbf24,
        emissive: new THREE.Color(0xf59e0b),
        emissiveIntensity: 1.0,
        roughness: 0.3,
        metalness: 0.22,
      })
    );

    const tetherBeaconMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xfb923c,
        emissive: new THREE.Color(0xf97316),
        emissiveIntensity: 1.2,
        roughness: 0.25,
        metalness: 0.15,
      })
    );

    const ruinedSkylineMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xf4f9ff,
        map: ruinedSkyTex.map,
        roughnessMap: ruinedSkyTex.roughnessMap,
        roughness: 0.48,
        metalness: 0.16,
      })
    );

    const distantBeaconMat = this._trackMat(
      new THREE.MeshBasicMaterial({
        color: 0x0ea5e9,
      })
    );

    this._craterGroundMat = craterGroundMat;
    this._fissureEmberMat = fissureEmberMat;
    this._tetherBeaconMat = tetherBeaconMat;
    this._distantBeaconMat = distantBeaconMat;

    return {
      craterGroundMat,
      plinthConcreteMat,
      wallConcreteMat,
      monolithConcreteMat,
      rustSteelMat,
      darkIronMat,
      spireSteelMat,
      catwalkMat,
      stepMat,
      hazardMat,
      fissureEmberMat,
      tungstenAmberMat,
      tetherBeaconMat,
      ruinedSkylineMat,
      distantBeaconMat,
    };
  }

  /**
   * Build the 64m x 64m scorched basalt crater floor and the low (y=0.20m)
   * Shattered Orbital Elevator Anchor Plinth so the 4.2m Boss crosses center smoothly.
   * @private
   */
  _buildCraterFloorAndPlinth(mats, innerBound) {
    const floorSize = innerBound * 2 + 2;
    const floorGeo = this._trackGeo(new THREE.PlaneGeometry(floorSize, floorSize));
    const floorMesh = new THREE.Mesh(floorGeo, mats.craterGroundMat);
    floorMesh.rotation.x = -Math.PI * 0.5;
    floorMesh.position.y = 0;
    floorMesh.receiveShadow = true;
    this.root.add(floorMesh);

    // Solid ground floor AABB below y=0
    this.collisionWorld.addBox(-34, -1.0, -34, 34, 0.0, 34, 'floor');

    // Low octagonal Shattered Orbital Elevator Anchor Plinth (R = 6.2m, y = 0.20m <= 0.55m stepHeight)
    const daisR = 6.2;
    const daisShape = new THREE.Shape();
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI / 4) * i + Math.PI / 8;
      const x = Math.cos(a) * daisR;
      const y = Math.sin(a) * daisR;
      if (i === 0) daisShape.moveTo(x, y);
      else daisShape.lineTo(x, y);
    }
    daisShape.closePath();

    const daisGeo = this._trackGeo(
      scaleGeometryUVs(
        new THREE.ExtrudeGeometry(daisShape, {
          depth: 0.14,
          bevelEnabled: true,
          bevelThickness: 0.06,
          bevelSize: 0.14,
          bevelSegments: 2,
        }),
        0.18,
        0.18
      )
    );
    daisGeo.rotateX(-Math.PI * 0.5);

    const daisMesh = new THREE.Mesh(daisGeo, mats.plinthConcreteMat);
    daisMesh.position.y = 0.0;
    daisMesh.receiveShadow = true;
    this.root.add(daisMesh);

    // 1:1 3-box octagonal collision registration (top at y = 0.20m)
    this.collisionWorld.addBox(-4.38, 0, -4.38, 4.38, 0.2, 4.38, 'platform');
    this.collisionWorld.addBox(-5.72, 0, -2.37, 5.72, 0.2, 2.37, 'platform');
    this.collisionWorld.addBox(-2.37, 0, -5.72, 2.37, 0.2, 5.72, 'platform');

    // Flush scorched steel collar ring + pulsing central molten magma fissure socket (no snag height)
    const steelCollarGeo = this._trackGeo(new THREE.RingGeometry(4.45, 5.15, 8));
    const steelCollar = new THREE.Mesh(steelCollarGeo, mats.darkIronMat);
    steelCollar.rotation.x = -Math.PI * 0.5;
    steelCollar.rotation.z = Math.PI / 8;
    steelCollar.position.y = 0.205;
    steelCollar.receiveShadow = true;
    this.root.add(steelCollar);

    const fissureRingGeo = this._trackGeo(new THREE.RingGeometry(2.55, 2.88, 16));
    const fissureRing = new THREE.Mesh(fissureRingGeo, mats.fissureEmberMat);
    fissureRing.rotation.x = -Math.PI * 0.5;
    fissureRing.position.y = 0.207;
    this.root.add(fissureRing);

    const coreSocketGeo = this._trackGeo(new THREE.CircleGeometry(1.15, 16));
    const coreSocket = new THREE.Mesh(coreSocketGeo, mats.fissureEmberMat);
    coreSocket.rotation.x = -Math.PI * 0.5;
    coreSocket.position.y = 0.206;
    this.root.add(coreSocket);

    // 4 Flush sheared orbital-tether anchor clamp plates embedded around the plinth (0.04m tall)
    const clampGeo = this._trackGeo(
      scaleBoxUVs(new THREE.BoxGeometry(1.1, 0.04, 0.58), 1.1, 0.04, 0.58, 1.6, 1.6)
    );
    const clampInst = new THREE.InstancedMesh(clampGeo, mats.rustSteelMat, 4);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < 4; i++) {
      const ang = (Math.PI * 0.5) * i + Math.PI * 0.25;
      dummy.position.set(Math.cos(ang) * 4.55, 0.215, Math.sin(ang) * 4.55);
      dummy.rotation.set(0, -ang + Math.PI * 0.5, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      clampInst.setMatrixAt(i, dummy.matrix);
    }
    clampInst.instanceMatrix.needsUpdate = true;
    this.root.add(clampInst);

    // Cracked magma-seam inlays radiating along cardinal approaches (flush 0.015m surface strips)
    const seamGeo = this._trackGeo(new THREE.BoxGeometry(1, 0.016, 1));
    const seamSpecs = [
      { x: 0, z: 12.2, w: 0.16, d: 11.2, mat: mats.fissureEmberMat },
      { x: 0, z: -12.2, w: 0.16, d: 11.2, mat: mats.fissureEmberMat },
      { x: -12.2, z: 0, w: 11.2, d: 0.16, mat: mats.fissureEmberMat },
      { x: 12.2, z: 0, w: 11.2, d: 0.16, mat: mats.fissureEmberMat },
    ];
    for (let i = 0; i < seamSpecs.length; i++) {
      const s = seamSpecs[i];
      const m = new THREE.Mesh(seamGeo, s.mat);
      m.position.set(s.x, 0.008, s.z);
      m.scale.set(s.w, 1, s.d);
      this.root.add(m);
    }
  }

  /**
   * Build 11m tall brutalist weathered-concrete perimeter walls with upper parapet cornices
   * and cantilevered upper buttress ribs (mounted at y >= 6.2m so the y=4.2m ring deck stays snag-free).
   * @private
   */
  _buildPerimeterWalls(mats, innerBound, wallH) {
    const wallThick = 1.5;
    const wallSpan = innerBound * 2 + wallThick * 2;

    const wallGeoX = this._trackGeo(
      scaleBoxUVs(new THREE.BoxGeometry(wallSpan, wallH, wallThick), wallSpan, wallH, wallThick, 6.4, 5.5)
    );
    const wallGeoZ = this._trackGeo(
      scaleBoxUVs(new THREE.BoxGeometry(wallThick, wallH, wallSpan), wallThick, wallH, wallSpan, 6.4, 5.5)
    );

    const northWall = new THREE.Mesh(wallGeoX, mats.wallConcreteMat);
    northWall.position.set(0, wallH * 0.5, -(innerBound + wallThick * 0.5));
    northWall.receiveShadow = true;
    this.root.add(northWall);
    this.collisionWorld.addBox(
      -innerBound - wallThick, 0, -innerBound - wallThick,
      innerBound + wallThick, wallH + 4, -innerBound,
      'wall'
    );

    const southWall = new THREE.Mesh(wallGeoX, mats.wallConcreteMat);
    southWall.position.set(0, wallH * 0.5, innerBound + wallThick * 0.5);
    southWall.receiveShadow = true;
    this.root.add(southWall);
    this.collisionWorld.addBox(
      -innerBound - wallThick, 0, innerBound,
      innerBound + wallThick, wallH + 4, innerBound + wallThick,
      'wall'
    );

    const westWall = new THREE.Mesh(wallGeoZ, mats.wallConcreteMat);
    westWall.position.set(-(innerBound + wallThick * 0.5), wallH * 0.5, 0);
    westWall.receiveShadow = true;
    this.root.add(westWall);
    this.collisionWorld.addBox(
      -innerBound - wallThick, 0, -innerBound,
      -innerBound, wallH + 4, innerBound,
      'wall'
    );

    const eastWall = new THREE.Mesh(wallGeoZ, mats.wallConcreteMat);
    eastWall.position.set(innerBound + wallThick * 0.5, wallH * 0.5, 0);
    eastWall.receiveShadow = true;
    this.root.add(eastWall);
    this.collisionWorld.addBox(
      innerBound, 0, -innerBound,
      innerBound + wallThick, wallH + 4, innerBound,
      'wall'
    );

    // Sculpted beveled upper parapet cornice framing the 11m citadel rim
    const corniceShape = new THREE.Shape();
    corniceShape.moveTo(0, 0);
    corniceShape.lineTo(1.05, 0);
    corniceShape.lineTo(1.28, 0.42);
    corniceShape.lineTo(1.28, 1.0);
    corniceShape.lineTo(0, 1.0);
    corniceShape.closePath();

    const corniceGeo = this._trackGeo(
      scaleGeometryUVs(
        new THREE.ExtrudeGeometry(corniceShape, {
          depth: innerBound * 2,
          bevelEnabled: true,
          bevelThickness: 0.05,
          bevelSize: 0.05,
          bevelSegments: 2,
        }),
        0.2,
        0.2
      )
    );
    corniceGeo.translate(0, 0, -innerBound);

    const corniceTransforms = [
      { pos: [-innerBound, wallH - 0.5, 0], rotY: 0 },
      { pos: [innerBound, wallH - 0.5, 0], rotY: Math.PI },
      { pos: [0, wallH - 0.5, -innerBound], rotY: -Math.PI * 0.5 },
      { pos: [0, wallH - 0.5, innerBound], rotY: Math.PI * 0.5 },
    ];
    for (let i = 0; i < corniceTransforms.length; i++) {
      const t = corniceTransforms[i];
      const m = new THREE.Mesh(corniceGeo, mats.darkIronMat);
      m.position.set(t.pos[0], t.pos[1], t.pos[2]);
      m.rotation.y = t.rotY;
      this.root.add(m);
    }

    // Upper Citadel Wall Buttress Ribs mounted ABOVE player head height on y=4.2m deck (y = 6.2m..11.3m)
    const upperRibShape = new THREE.Shape();
    upperRibShape.moveTo(0, 6.2);
    upperRibShape.lineTo(0.28, 6.2);
    upperRibShape.lineTo(0.56, 7.1);
    upperRibShape.lineTo(0.56, wallH + 0.3);
    upperRibShape.lineTo(0, wallH + 0.3);
    upperRibShape.closePath();

    const upperRibGeo = this._trackGeo(
      scaleGeometryUVs(
        new THREE.ExtrudeGeometry(upperRibShape, {
          depth: 0.72,
          bevelEnabled: true,
          bevelThickness: 0.06,
          bevelSize: 0.06,
          bevelSegments: 1,
        }),
        0.24,
        0.24
      )
    );
    upperRibGeo.translate(0, 0, -0.36);

    const ribOffsets = [-24, -17.5, -11, -5, 5, 11, 17.5, 24];
    const ribInst = new THREE.InstancedMesh(upperRibGeo, mats.rustSteelMat, ribOffsets.length * 4);
    ribInst.castShadow = true;
    ribInst.receiveShadow = true;

    const dummy = new THREE.Object3D();
    let idx = 0;
    for (let side = 0; side < 4; side++) {
      for (let i = 0; i < ribOffsets.length; i++) {
        const off = ribOffsets[i];
        if (side === 0) {
          dummy.position.set(-innerBound, 0, off);
          dummy.rotation.set(0, 0, 0);
        } else if (side === 1) {
          dummy.position.set(innerBound, 0, off);
          dummy.rotation.set(0, Math.PI, 0);
        } else if (side === 2) {
          dummy.position.set(off, 0, -innerBound);
          dummy.rotation.set(0, -Math.PI * 0.5, 0);
        } else {
          dummy.position.set(off, 0, innerBound);
          dummy.rotation.set(0, Math.PI * 0.5, 0);
        }
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        ribInst.setMatrixAt(idx++, dummy.matrix);
      }
    }
    ribInst.instanceMatrix.needsUpdate = true;
    this.root.add(ribInst);
  }

  /**
   * Build 4 weathered industrial sector designation signboards mounted high on the perimeter walls.
   * Uses TextureGenerator.getSignboardTexture(title, subtitle, accentHex) with warm rust/amber tones.
   * @private
   */
  _buildSectorSignboards(mats, innerBound) {
    const configs = [
      {
        title: 'CRATER CITADEL',
        subtitle: 'ORBITAL TETHER // SECTOR-00',
        accent: '#e86a28',
        pos: [0, 8.3, -(innerBound - 0.36)],
        rotY: 0,
      },
      {
        title: 'DROP CRUCIBLE',
        subtitle: 'THREAT CLASS // ASH TITAN',
        accent: '#d9480f',
        pos: [0, 8.3, innerBound - 0.36],
        rotY: Math.PI,
      },
      {
        title: 'WEST BASTION',
        subtitle: 'ELEVATED RAIL PERCH',
        accent: '#d97706',
        pos: [-(innerBound - 0.36), 8.3, 0],
        rotY: Math.PI * 0.5,
      },
      {
        title: 'EAST BASTION',
        subtitle: 'HIGH-GROUND OVERWATCH',
        accent: '#c2410c',
        pos: [innerBound - 0.36, 8.3, 0],
        rotY: -Math.PI * 0.5,
      },
    ];

    const screenW = 5.6;
    const screenH = 3.2;

    const bezelShape = new THREE.Shape();
    const hw = screenW * 0.5 + 0.28;
    const hh = screenH * 0.5 + 0.28;
    const ch = 0.35;
    bezelShape.moveTo(-hw + ch, -hh);
    bezelShape.lineTo(hw - ch, -hh);
    bezelShape.lineTo(hw, -hh + ch);
    bezelShape.lineTo(hw, hh - ch);
    bezelShape.lineTo(hw - ch, hh);
    bezelShape.lineTo(-hw + ch, hh);
    bezelShape.lineTo(-hw, hh - ch);
    bezelShape.lineTo(-hw, -hh + ch);
    bezelShape.closePath();

    const hole = new THREE.Path();
    const ihw = screenW * 0.5 - 0.04;
    const ihh = screenH * 0.5 - 0.04;
    hole.moveTo(-ihw, -ihh);
    hole.lineTo(ihw, -ihh);
    hole.lineTo(ihw, ihh);
    hole.lineTo(-ihw, ihh);
    hole.closePath();
    bezelShape.holes.push(hole);

    const bezelGeo = this._trackGeo(
      scaleGeometryUVs(
        new THREE.ExtrudeGeometry(bezelShape, {
          depth: 0.24,
          bevelEnabled: true,
          bevelThickness: 0.05,
          bevelSize: 0.05,
          bevelSegments: 1,
        }),
        0.25,
        0.25
      )
    );
    const boardGeo = this._trackGeo(new THREE.PlaneGeometry(screenW, screenH));

    for (let i = 0; i < configs.length; i++) {
      const cfg = configs[i];
      const tex = this._texGen.getSignboardTexture(cfg.title, cfg.subtitle, cfg.accent);
      const boardMat = this._trackMat(
        new THREE.MeshStandardMaterial({
          map: tex,
          emissive: new THREE.Color(0xffffff),
          emissiveMap: tex,
          emissiveIntensity: 0.65,
          roughness: 0.55,
          metalness: 0.25,
        })
      );

      const group = new THREE.Group();
      group.position.set(cfg.pos[0], cfg.pos[1], cfg.pos[2]);
      group.rotation.y = cfg.rotY;

      const bezelMesh = new THREE.Mesh(bezelGeo, mats.darkIronMat);
      bezelMesh.position.z = -0.12;
      group.add(bezelMesh);

      const boardMesh = new THREE.Mesh(boardGeo, boardMat);
      boardMesh.position.z = 0.08;
      group.add(boardMesh);

      this.root.add(group);
    }
  }

  /**
   * Build 8 Radial Blast-Shield Concrete Monolith Pillars around r=13.5m
   * (sculpted ExtrudeGeometry slabs + steel brackets + hazard bases, 1:1 axis-aligned colliders)
   * AND 8 Embedded Broken Colossal Orbital-Tether Pylon Ribs around r=18.8m leaning inward dramatically.
   * @private
   */
  _buildMonolithRingAndTetherRibs(mats) {
    // 1. 8 Radial Blast-Shield Monolith Pillars at r = 13.5m, azimuths 22.5° + i*45°
    // Leaves North/South/East/West cardinal sightlines completely open for Boss & Player!
    const monW = 2.4;
    const monD = 1.3;
    const monH = 4.4;

    const monProfile = new THREE.Shape();
    monProfile.moveTo(-monD * 0.5, 0);
    monProfile.lineTo(monD * 0.5, 0);
    monProfile.lineTo(monD * 0.5, 0.52);
    monProfile.lineTo(monD * 0.42, 0.85);
    monProfile.lineTo(monD * 0.42, monH - 0.55);
    monProfile.lineTo(monD * 0.24, monH);
    monProfile.lineTo(-monD * 0.24, monH);
    monProfile.lineTo(-monD * 0.42, monH - 0.55);
    monProfile.lineTo(-monD * 0.42, 0.85);
    monProfile.lineTo(-monD * 0.5, 0.52);
    monProfile.closePath();

    const monBodyGeo = this._trackGeo(
      scaleGeometryUVs(
        new THREE.ExtrudeGeometry(monProfile, {
          depth: monW - 0.14,
          bevelEnabled: true,
          bevelThickness: 0.07,
          bevelSize: 0.06,
          bevelSegments: 2,
        }),
        0.26,
        0.26
      )
    );
    monBodyGeo.translate(0, 0, -(monW - 0.14) * 0.5);
    monBodyGeo.rotateY(Math.PI * 0.5);

    const monHazardGeo = this._trackGeo(
      scaleBoxUVs(
        new THREE.BoxGeometry(monW + 0.06, 0.36, monD + 0.06),
        monW + 0.06,
        0.36,
        monD + 0.06,
        1.2,
        0.36
      )
    );
    const monBracketGeo = this._trackGeo(
      scaleBoxUVs(
        new THREE.BoxGeometry(0.2, monH - 0.85, monD - 0.14),
        0.2,
        monH - 0.85,
        monD - 0.14,
        1.8,
        1.8
      )
    );
    const monCapBeaconGeo = this._trackGeo(new THREE.BoxGeometry(monW - 0.36, 0.08, 0.16));

    const monSpecs = [
      { x: -5.17, z: -12.47, rotY: 0 },
      { x: 5.17, z: -12.47, rotY: 0 },
      { x: -5.17, z: 12.47, rotY: 0 },
      { x: 5.17, z: 12.47, rotY: 0 },
      { x: -12.47, z: -5.17, rotY: Math.PI * 0.5 },
      { x: -12.47, z: 5.17, rotY: Math.PI * 0.5 },
      { x: 12.47, z: -5.17, rotY: Math.PI * 0.5 },
      { x: 12.47, z: 5.17, rotY: Math.PI * 0.5 },
    ];

    const monBodyInst = new THREE.InstancedMesh(monBodyGeo, mats.monolithConcreteMat, monSpecs.length);
    monBodyInst.castShadow = true;
    monBodyInst.receiveShadow = true;

    const monHazardInst = new THREE.InstancedMesh(monHazardGeo, mats.hazardMat, monSpecs.length);
    monHazardInst.receiveShadow = true;

    const monBracketInst = new THREE.InstancedMesh(monBracketGeo, mats.rustSteelMat, monSpecs.length * 2);
    monBracketInst.castShadow = true;

    const monBeaconInst = new THREE.InstancedMesh(monCapBeaconGeo, mats.tungstenAmberMat, monSpecs.length);

    const dummy = new THREE.Object3D();
    let bracketIdx = 0;

    for (let i = 0; i < monSpecs.length; i++) {
      const m = monSpecs[i];

      dummy.position.set(m.x, 0, m.z);
      dummy.rotation.set(0, m.rotY, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      monBodyInst.setMatrixAt(i, dummy.matrix);

      dummy.position.set(m.x, 0.18, m.z);
      dummy.updateMatrix();
      monHazardInst.setMatrixAt(i, dummy.matrix);

      dummy.position.set(m.x, monH + 0.06, m.z);
      dummy.updateMatrix();
      monBeaconInst.setMatrixAt(i, dummy.matrix);

      const isZAligned = Math.abs(Math.sin(m.rotY)) > 0.5;
      for (const side of [-1, 1]) {
        const off = side * monW * 0.36;
        dummy.position.set(
          m.x + (isZAligned ? 0 : off),
          monH * 0.48,
          m.z + (isZAligned ? off : 0)
        );
        dummy.rotation.set(0, m.rotY, 0);
        dummy.updateMatrix();
        monBracketInst.setMatrixAt(bracketIdx++, dummy.matrix);
      }

      // 1:1 Axis-aligned monolith collider
      const hx = isZAligned ? monD * 0.5 : monW * 0.5;
      const hz = isZAligned ? monW * 0.5 : monD * 0.5;
      this.collisionWorld.addBox(m.x - hx, 0, m.z - hz, m.x + hx, monH, m.z + hz, 'cover');
    }

    monBodyInst.instanceMatrix.needsUpdate = true;
    monHazardInst.instanceMatrix.needsUpdate = true;
    monBracketInst.instanceMatrix.needsUpdate = true;
    monBeaconInst.instanceMatrix.needsUpdate = true;
    this.root.add(monBodyInst, monHazardInst, monBracketInst, monBeaconInst);

    // 2. 8 Embedded Broken Colossal Orbital-Tether Pylon Ribs around r = 18.8m leaning inward dramatically
    // Ground footing pier sits cleanly at y=0..4.5m (1:1 AABB 1.5m x 1.5m);
    // Leaning severed tether girder rises from y=4.5m up to ~9.8m cleanly ABOVE the 4.2m Boss!
    const pierGeo = this._trackGeo(
      scaleBoxUVs(new THREE.BoxGeometry(1.5, 4.5, 1.5), 1.5, 4.5, 1.5, 2.5, 2.5)
    );
    const pierCollarGeo = this._trackGeo(
      scaleBoxUVs(new THREE.BoxGeometry(1.76, 0.48, 1.76), 1.76, 0.48, 1.76, 1.2, 0.48)
    );
    const ribBeamGeo = this._trackGeo(
      scaleBoxUVs(new THREE.BoxGeometry(0.95, 6.2, 1.15), 0.95, 6.2, 1.15, 2.2, 2.2)
    );
    const ribSeamGeo = this._trackGeo(new THREE.BoxGeometry(0.24, 5.4, 1.2));

    const ribRadius = 18.8;
    const ribCount = 8;

    const pierInst = new THREE.InstancedMesh(pierGeo, mats.plinthConcreteMat, ribCount);
    pierInst.castShadow = true;
    pierInst.receiveShadow = true;

    const collarInst = new THREE.InstancedMesh(pierCollarGeo, mats.hazardMat, ribCount);
    collarInst.receiveShadow = true;

    const beamInst = new THREE.InstancedMesh(ribBeamGeo, mats.rustSteelMat, ribCount);
    beamInst.castShadow = true;
    beamInst.receiveShadow = true;

    const seamInst = new THREE.InstancedMesh(ribSeamGeo, mats.tetherBeaconMat, ribCount);

    for (let i = 0; i < ribCount; i++) {
      const ang = (Math.PI / 4) * i + Math.PI / 8; // Matches 22.5°+i*45°: (±7.20, ±17.38) & (±17.38, ±7.20)
      const rx = Math.cos(ang) * ribRadius;
      const rz = Math.sin(ang) * ribRadius;

      // Ground concrete pier (axis-aligned 1.5m x 1.5m)
      dummy.position.set(rx, 2.25, rz);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      pierInst.setMatrixAt(i, dummy.matrix);

      dummy.position.set(rx, 0.24, rz);
      dummy.updateMatrix();
      collarInst.setMatrixAt(i, dummy.matrix);

      this.collisionWorld.addBox(rx - 0.75, 0, rz - 0.75, rx + 0.75, 4.5, rz + 0.75, 'pillar');

      // Tilted severed orbital-tether pylon rib springing from pier top (y=4.3m) inward toward crater center
      const inwardPitch = 0.48; // ~27.5 deg lean inward
      const midDist = ribRadius - 1.35;
      const mx = Math.cos(ang) * midDist;
      const mz = Math.sin(ang) * midDist;
      // Orient local +X toward center (-cos, 0, -sin) so rotation.z tilts beam inward cleanly
      const yaw = -ang + Math.PI;

      dummy.position.set(mx, 6.95, mz);
      dummy.rotation.order = 'YXZ';
      dummy.rotation.set(0, yaw, -inwardPitch);
      dummy.updateMatrix();
      beamInst.setMatrixAt(i, dummy.matrix);
      seamInst.setMatrixAt(i, dummy.matrix);
    }

    dummy.rotation.order = 'XYZ';
    pierInst.instanceMatrix.needsUpdate = true;
    collarInst.instanceMatrix.needsUpdate = true;
    beamInst.instanceMatrix.needsUpdate = true;
    seamInst.instanceMatrix.needsUpdate = true;
    this.root.add(pierInst, collarInst, beamInst, seamInst);
  }

  /**
   * Build the Wrap-Around Elevated Ring-Catwalk (y = 4.20m) spanning all 4 quadrants
   * with Cardinal Bastion Overlooks, tactical half-cover shields, under-deck piers/braces,
   * and 4 wide stepped rubble/steel ramps (14 steps x 0.30m rise <= 0.35m/step).
   * @private
   */
  _buildElevatedRingCatwalkAndRamps(mats, innerBound) {
    const deckY = 4.2;
    const deckThick = 0.4;

    // 1. Wrap-Around Ring Sections & Bastion Overlooks (1:1 collision + world-metric UV-calibrated visual meshes)
    const platformSpecs = [
      // 4 Continuous Outer Perimeter Ring Wings (5.5m wide, hugging innerBound=31.5m)
      { minX: -innerBound, maxX: innerBound, minZ: -innerBound, maxZ: -26.0, fasciaSide: 'south' },
      { minX: -innerBound, maxX: innerBound, minZ: 26.0, maxZ: innerBound, fasciaSide: 'north' },
      { minX: -innerBound, maxX: -26.0, minZ: -26.0, maxZ: 26.0, fasciaSide: 'east' },
      { minX: 26.0, maxX: innerBound, minZ: -26.0, maxZ: 26.0, fasciaSide: 'west' },
      // 3 Cardinal Overlook Bastions projecting inward (North, West, East)
      { minX: -8.5, maxX: 8.5, minZ: -26.0, maxZ: -23.0, fasciaSide: 'south' },
      { minX: -26.0, maxX: -23.0, minZ: -8.5, maxZ: 8.5, fasciaSide: 'east' },
      { minX: 23.0, maxX: 26.0, minZ: -8.5, maxZ: 8.5, fasciaSide: 'west' },
      // 2 Flanking South Overlook Bastions framing open playerSpawn (0, 0.05, 23.5)
      { minX: -12.5, maxX: -4.5, minZ: 23.0, maxZ: 26.0, fasciaSide: 'north' },
      { minX: 4.5, maxX: 12.5, minZ: 23.0, maxZ: 26.0, fasciaSide: 'north' },
    ];

    const deckGeoCache = new Map();
    const getDeckGeos = (w, d, isZEdge) => {
      const key = `${w.toFixed(2)}_${d.toFixed(2)}_${isZEdge ? 'z' : 'x'}`;
      if (deckGeoCache.has(key)) return deckGeoCache.get(key);

      const hullW = w - 0.04;
      const hullH = deckThick - 0.08;
      const hullD = d - 0.04;
      const hullGeo = this._trackGeo(
        scaleBoxUVs(new THREE.BoxGeometry(hullW, hullH, hullD), hullW, hullH, hullD, 2.4, 2.4)
      );

      const topW = w - 0.08;
      const topH = 0.06;
      const topD = d - 0.08;
      const topGeo = this._trackGeo(
        scaleBoxUVs(new THREE.BoxGeometry(topW, topH, topD), topW, topH, topD, 2.2, 2.2)
      );

      const fw = isZEdge ? w : 0.06;
      const fh = 0.24;
      const fd = isZEdge ? 0.06 : d;
      const fasciaGeo = this._trackGeo(
        scaleBoxUVs(new THREE.BoxGeometry(fw, fh, fd), fw, fh, fd, 1.2, fh)
      );

      const tw = isZEdge ? w : 0.07;
      const th = 0.05;
      const td = isZEdge ? 0.07 : d;
      const trimGeo = this._trackGeo(new THREE.BoxGeometry(tw, th, td));

      const bundle = { hullGeo, topGeo, fasciaGeo, trimGeo };
      deckGeoCache.set(key, bundle);
      return bundle;
    };

    for (let i = 0; i < platformSpecs.length; i++) {
      const p = platformSpecs[i];
      const w = p.maxX - p.minX;
      const d = p.maxZ - p.minZ;
      const cx = (p.minX + p.maxX) * 0.5;
      const cz = (p.minZ + p.maxZ) * 0.5;
      const isZEdge = p.fasciaSide === 'south' || p.fasciaSide === 'north';
      const geos = getDeckGeos(w, d, isZEdge);

      // Structural dark-iron underside slab (world-metric UVs)
      const hull = new THREE.Mesh(geos.hullGeo, mats.darkIronMat);
      hull.position.set(cx, deckY - deckThick * 0.5 - 0.02, cz);
      hull.castShadow = true;
      hull.receiveShadow = true;
      this.root.add(hull);

      // Top industrial grated catwalk plate flush at y = 4.20m (world-metric 2.2m grate tiling)
      const topPlate = new THREE.Mesh(geos.topGeo, mats.catwalkMat);
      topPlate.position.set(cx, deckY - 0.03, cz);
      topPlate.receiveShadow = true;
      this.root.add(topPlate);

      // Industrial hazard caution fascia (1.2m stripe cycle) + warm tungsten bottom guide lip
      const fascia = new THREE.Mesh(geos.fasciaGeo, mats.hazardMat);
      const trim = new THREE.Mesh(geos.trimGeo, mats.tungstenAmberMat);
      if (p.fasciaSide === 'south') {
        fascia.position.set(cx, deckY - 0.19, p.maxZ - 0.03);
        trim.position.set(cx, deckY - deckThick + 0.025, p.maxZ - 0.035);
      } else if (p.fasciaSide === 'north') {
        fascia.position.set(cx, deckY - 0.19, p.minZ + 0.03);
        trim.position.set(cx, deckY - deckThick + 0.025, p.minZ + 0.035);
      } else if (p.fasciaSide === 'east') {
        fascia.position.set(p.maxX - 0.03, deckY - 0.19, cz);
        trim.position.set(p.maxX - 0.035, deckY - deckThick + 0.025, cz);
      } else {
        fascia.position.set(p.minX + 0.03, deckY - 0.19, cz);
        trim.position.set(p.minX + 0.035, deckY - deckThick + 0.025, cz);
      }
      this.root.add(fascia, trim);

      this.collisionWorld.addBox(p.minX, deckY - deckThick, p.minZ, p.maxX, deckY, p.maxZ, 'platform');
    }

    // 2. Elevated Ring-Catwalk Inner Support Piers & Diagonal Knee Braces (InstancedMesh)
    const pierCoords = [
      // North & South inner edge piers (keep x=[-8,8] clear of playerSpawn & x=±15 clear of jump pads)
      [-26.3, -26.3], [-18.5, -26.3], [-8.2, -26.3], [8.2, -26.3], [18.5, -26.3], [26.3, -26.3],
      [-26.3, 26.3], [-18.5, 26.3], [-8.2, 26.3], [8.2, 26.3], [18.5, 26.3], [26.3, 26.3],
      // West & East mid-span piers
      [-26.3, -8.2], [-26.3, 8.2], [26.3, -8.2], [26.3, 8.2],
    ];

    const pierGeo = this._trackGeo(
      scaleBoxUVs(
        new THREE.BoxGeometry(0.6, deckY - deckThick, 0.6),
        0.6,
        deckY - deckThick,
        0.6,
        1.8,
        1.8
      )
    );
    const pierInst = new THREE.InstancedMesh(pierGeo, mats.darkIronMat, pierCoords.length);
    pierInst.castShadow = true;
    pierInst.receiveShadow = true;

    const braceGeo = this._trackGeo(
      scaleBoxUVs(new THREE.BoxGeometry(2.6, 0.18, 0.22), 2.6, 0.18, 0.22, 1.8, 1.8)
    );
    const braceInst = new THREE.InstancedMesh(braceGeo, mats.rustSteelMat, pierCoords.length);

    const dummy = new THREE.Object3D();
    for (let i = 0; i < pierCoords.length; i++) {
      const [px, pz] = pierCoords[i];
      dummy.position.set(px, (deckY - deckThick) * 0.5, pz);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      pierInst.setMatrixAt(i, dummy.matrix);

      this.collisionWorld.addBox(px - 0.3, 0, pz - 0.3, px + 0.3, deckY - deckThick, pz + 0.3, 'pillar');

      // Outward knee-brace reaching under the main ring deck
      const onXSide = Math.abs(px) > 25 && Math.abs(pz) < 25;
      if (onXSide) {
        const s = Math.sign(px);
        dummy.position.set(px + s * 1.0, deckY - deckThick - 0.9, pz);
        dummy.rotation.set(0, 0, s * 0.62);
      } else {
        const s = Math.sign(pz);
        dummy.position.set(px, deckY - deckThick - 0.9, pz + s * 1.0);
        dummy.rotation.set(0, Math.PI * 0.5, s * 0.62);
      }
      dummy.updateMatrix();
      braceInst.setMatrixAt(i, dummy.matrix);
    }
    pierInst.instanceMatrix.needsUpdate = true;
    braceInst.instanceMatrix.needsUpdate = true;
    this.root.add(pierInst, braceInst);

    // 3. Elevated Bastion Tactical Half-Cover Shields (y = 4.20..5.26m, sculpted beveled ExtrudeGeometry batched by width)
    const shieldH = 1.06;
    const shieldThick = 0.38;
    const shieldSpecs = [
      // North Overlook twin shields (open 8m center & side notches)
      { cx: -5.9, cz: -23.2, len: 3.8, rotY: 0 },
      { cx: 5.9, cz: -23.2, len: 3.8, rotY: 0 },
      // South Overlook twin shields
      { cx: -8.5, cz: 23.2, len: 5.2, rotY: 0 },
      { cx: 8.5, cz: 23.2, len: 5.2, rotY: 0 },
      // West & East Overlook twin shields
      { cx: -23.2, cz: -5.9, len: 3.8, rotY: Math.PI * 0.5 },
      { cx: -23.2, cz: 5.9, len: 3.8, rotY: Math.PI * 0.5 },
      { cx: 23.2, cz: -5.9, len: 3.8, rotY: Math.PI * 0.5 },
      { cx: 23.2, cz: 5.9, len: 3.8, rotY: Math.PI * 0.5 },
      // Outer Ring perimeter flanking shields (clear of x=±15 jump-pad landings & x=±24.2 ramp exits)
      { cx: -19.2, cz: -26.2, len: 3.2, rotY: 0 },
      { cx: 19.2, cz: -26.2, len: 3.2, rotY: 0 },
      { cx: -19.2, cz: 26.2, len: 3.2, rotY: 0 },
      { cx: 19.2, cz: 26.2, len: 3.2, rotY: 0 },
    ];

    const shieldProfile = new THREE.Shape();
    const halfD = shieldThick * 0.5 - 0.025; // +0.025 bevelSize = exact 0.38m base footprint
    shieldProfile.moveTo(-halfD, 0.025);
    shieldProfile.lineTo(halfD, 0.025);
    shieldProfile.lineTo(halfD, 0.78);
    shieldProfile.lineTo(halfD * 0.68, shieldH - 0.025);
    shieldProfile.lineTo(-halfD * 0.68, shieldH - 0.025);
    shieldProfile.lineTo(-halfD, 0.78);
    shieldProfile.closePath();

    const shieldsByLen = new Map();
    for (let i = 0; i < shieldSpecs.length; i++) {
      const s = shieldSpecs[i];
      if (!shieldsByLen.has(s.len)) shieldsByLen.set(s.len, []);
      shieldsByLen.get(s.len).push(s);
    }

    shieldsByLen.forEach((groupSpecs, len) => {
      const bodyGeo = this._trackGeo(
        scaleGeometryUVs(
          new THREE.ExtrudeGeometry(shieldProfile, {
            depth: len - 0.05,
            bevelEnabled: true,
            bevelThickness: 0.025,
            bevelSize: 0.025,
            bevelSegments: 1,
          }),
          0.32,
          0.32
        )
      );
      bodyGeo.translate(0, 0, -(len - 0.05) * 0.5);
      bodyGeo.rotateY(Math.PI * 0.5);

      const capGeo = this._trackGeo(
        scaleBoxUVs(
          new THREE.BoxGeometry(len + 0.04, 0.08, shieldThick + 0.04),
          len + 0.04,
          0.08,
          shieldThick + 0.04,
          1.8,
          1.8
        )
      );

      const bodyInst = new THREE.InstancedMesh(bodyGeo, mats.monolithConcreteMat, groupSpecs.length);
      bodyInst.castShadow = true;
      bodyInst.receiveShadow = true;
      const capInst = new THREE.InstancedMesh(capGeo, mats.rustSteelMat, groupSpecs.length);

      for (let i = 0; i < groupSpecs.length; i++) {
        const s = groupSpecs[i];
        dummy.position.set(s.cx, deckY, s.cz);
        dummy.rotation.set(0, s.rotY, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        bodyInst.setMatrixAt(i, dummy.matrix);

        dummy.position.set(s.cx, deckY + shieldH + 0.04, s.cz);
        dummy.updateMatrix();
        capInst.setMatrixAt(i, dummy.matrix);

        const isZAligned = Math.abs(Math.sin(s.rotY)) > 0.5;
        const hx = isZAligned ? shieldThick * 0.5 : len * 0.5;
        const hz = isZAligned ? len * 0.5 : shieldThick * 0.5;
        this.collisionWorld.addBox(
          s.cx - hx,
          deckY,
          s.cz - hz,
          s.cx + hx,
          deckY + shieldH,
          s.cz + hz,
          'cover'
        );
      }
      bodyInst.instanceMatrix.needsUpdate = true;
      capInst.instanceMatrix.needsUpdate = true;
      this.root.add(bodyInst, capInst);
    });

    // 4. 4 Wide Sloped Rubble/Steel Stair Ramps (14 steps x 0.30m rise = 4.20m, <= 0.35m/step)
    const stepCount = 14;
    const stepRise = deckY / stepCount; // 0.30m
    const stepDepth = 0.7;
    const rampWidth = 3.6; // x ∈ [±22.4, ±26.0]
    const runLen = stepCount * stepDepth; // 9.80m -> climbs z=±16.2 to z=±26.0

    const stepGeo = this._trackGeo(
      scaleBoxUVs(new THREE.BoxGeometry(rampWidth, 0.32, stepDepth), rampWidth, 0.32, stepDepth, 1.8, 1.8)
    );
    const stepLipGeo = this._trackGeo(new THREE.BoxGeometry(rampWidth - 0.24, 0.05, 0.08));
    const totalSteps = stepCount * 4;

    const stepInst = new THREE.InstancedMesh(stepGeo, mats.stepMat, totalSteps);
    stepInst.castShadow = true;
    stepInst.receiveShadow = true;
    const stepLipInst = new THREE.InstancedMesh(stepLipGeo, mats.tungstenAmberMat, totalSteps);

    const stringerShape = new THREE.Shape();
    stringerShape.moveTo(0, 0);
    stringerShape.lineTo(runLen, deckY - 0.36);
    stringerShape.lineTo(runLen, deckY + 0.14);
    stringerShape.lineTo(0, 0.4);
    stringerShape.closePath();

    const stringerGeo = this._trackGeo(
      scaleGeometryUVs(
        new THREE.ExtrudeGeometry(stringerShape, {
          depth: 0.22,
          bevelEnabled: true,
          bevelThickness: 0.03,
          bevelSize: 0.03,
          bevelSegments: 1,
        }),
        0.25,
        0.25
      )
    );
    stringerGeo.translate(0, 0, -0.11);

    const plinthShape = new THREE.Shape();
    plinthShape.moveTo(0, 0);
    plinthShape.lineTo(stepDepth * 7, 0);
    plinthShape.lineTo(stepDepth * 7, stepRise * 7 - 0.04);
    plinthShape.lineTo(0, 0.08);
    plinthShape.closePath();
    const plinthGeo = this._trackGeo(
      scaleGeometryUVs(
        new THREE.ExtrudeGeometry(plinthShape, {
          depth: rampWidth - 0.08,
          bevelEnabled: false,
        }),
        0.833,
        0.833
      )
    );
    plinthGeo.translate(0, 0, -(rampWidth - 0.08) * 0.5);

    const rampConfigs = [
      { cx: -24.2, zStart: -16.2, dirZ: -1 }, // West-North climbs North (-Z) to z=-26.0
      { cx: 24.2, zStart: -16.2, dirZ: -1 },  // East-North climbs North (-Z) to z=-26.0
      { cx: -24.2, zStart: 16.2, dirZ: 1 },   // West-South climbs South (+Z) to z=+26.0
      { cx: 24.2, zStart: 16.2, dirZ: 1 },    // East-South climbs South (+Z) to z=+26.0
    ];

    let stepIdx = 0;
    for (let r = 0; r < rampConfigs.length; r++) {
      const rc = rampConfigs[r];
      const rotY = rc.dirZ < 0 ? Math.PI * 0.5 : -Math.PI * 0.5;

      for (const sideOff of [-rampWidth * 0.5 - 0.04, rampWidth * 0.5 + 0.04]) {
        const strMesh = new THREE.Mesh(stringerGeo, mats.darkIronMat);
        strMesh.position.set(rc.cx + sideOff, 0, rc.zStart);
        strMesh.rotation.y = rotY;
        strMesh.castShadow = true;
        strMesh.receiveShadow = true;
        this.root.add(strMesh);
      }

      // Solid rubble-concrete lower foundation matching steps 0..6 (zero crawl trap)
      const plinthMesh = new THREE.Mesh(plinthGeo, mats.hazardMat);
      plinthMesh.position.set(rc.cx, 0, rc.zStart);
      plinthMesh.rotation.y = rotY;
      plinthMesh.receiveShadow = true;
      this.root.add(plinthMesh);

      for (let i = 0; i < stepCount; i++) {
        const topY = (i + 1) * stepRise;
        const zCenter = rc.zStart + rc.dirZ * (i + 0.5) * stepDepth;
        const zMin = zCenter - stepDepth * 0.5;
        const zMax = zCenter + stepDepth * 0.5;

        dummy.position.set(rc.cx, topY - 0.16, zCenter);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        stepInst.setMatrixAt(stepIdx, dummy.matrix);

        const frontZ = zCenter - rc.dirZ * (stepDepth * 0.5 - 0.04);
        dummy.position.set(rc.cx, topY - 0.02, frontZ);
        dummy.updateMatrix();
        stepLipInst.setMatrixAt(stepIdx, dummy.matrix);
        stepIdx++;

        // Solid foundation under steps 0..6 (<= 2.1m); full-headroom arch (>= 1.98m) under steps 7..13
        const colMinY = i < 7 ? 0.0 : topY - 0.42;
        this.collisionWorld.addBox(
          rc.cx - rampWidth * 0.5,
          colMinY,
          zMin,
          rc.cx + rampWidth * 0.5,
          topY,
          zMax,
          'ramp'
        );
      }
    }

    stepInst.instanceMatrix.needsUpdate = true;
    stepLipInst.instanceMatrix.needsUpdate = true;
    this.root.add(stepInst, stepLipInst);
  }

  /**
   * Build 4 waist-high crashed orbital elevator hull slabs in the outer diagonal lanes
   * for tactical perimeter flank cover without encroaching on the r=16m boss crater.
   * @private
   */
  _buildCrashedElevatorSlabs(mats) {
    const slabW = 3.0;
    const slabD = 0.86;
    const slabH = 1.25;

    const slabProfile = new THREE.Shape();
    slabProfile.moveTo(-slabD * 0.5, 0);
    slabProfile.lineTo(slabD * 0.5, 0);
    slabProfile.lineTo(slabD * 0.5, 0.34);
    slabProfile.lineTo(slabD * 0.34, 1.08);
    slabProfile.lineTo(slabD * 0.16, slabH);
    slabProfile.lineTo(-slabD * 0.18, slabH);
    slabProfile.lineTo(-slabD * 0.34, 1.08);
    slabProfile.lineTo(-slabD * 0.5, 0.34);
    slabProfile.closePath();

    const slabGeo = this._trackGeo(
      scaleGeometryUVs(
        new THREE.ExtrudeGeometry(slabProfile, {
          depth: slabW - 0.12,
          bevelEnabled: true,
          bevelThickness: 0.06,
          bevelSize: 0.05,
          bevelSegments: 2,
        }),
        0.34,
        0.34
      )
    );
    slabGeo.translate(0, 0, -(slabW - 0.12) * 0.5);
    slabGeo.rotateY(Math.PI * 0.5);

    const baseGeo = this._trackGeo(
      scaleBoxUVs(
        new THREE.BoxGeometry(slabW + 0.06, 0.24, slabD + 0.06),
        slabW + 0.06,
        0.24,
        slabD + 0.06,
        1.2,
        0.24
      )
    );
    const ribGeo = this._trackGeo(
      scaleBoxUVs(
        new THREE.BoxGeometry(0.18, slabH - 0.16, slabD + 0.02),
        0.18,
        slabH - 0.16,
        slabD + 0.02,
        1.6,
        1.6
      )
    );

    const coords = [
      [-20.5, -11.5],
      [20.5, -11.5],
      [-20.5, 11.5],
      [20.5, 11.5],
    ];

    const bodyInst = new THREE.InstancedMesh(slabGeo, mats.rustSteelMat, coords.length);
    bodyInst.castShadow = true;
    bodyInst.receiveShadow = true;

    const baseInst = new THREE.InstancedMesh(baseGeo, mats.hazardMat, coords.length);
    baseInst.receiveShadow = true;

    const ribInst = new THREE.InstancedMesh(ribGeo, mats.darkIronMat, coords.length * 2);

    const dummy = new THREE.Object3D();
    let ribIdx = 0;
    for (let i = 0; i < coords.length; i++) {
      const [sx, sz] = coords[i];

      dummy.position.set(sx, 0, sz);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      bodyInst.setMatrixAt(i, dummy.matrix);

      dummy.position.set(sx, 0.12, sz);
      dummy.updateMatrix();
      baseInst.setMatrixAt(i, dummy.matrix);

      for (const off of [-slabW * 0.34, slabW * 0.34]) {
        dummy.position.set(sx + off, slabH * 0.48, sz);
        dummy.updateMatrix();
        ribInst.setMatrixAt(ribIdx++, dummy.matrix);
      }

      this.collisionWorld.addBox(
        sx - slabW * 0.5,
        0,
        sz - slabD * 0.5,
        sx + slabW * 0.5,
        slabH,
        sz + slabD * 0.5,
        'cover'
      );
    }

    bodyInst.instanceMatrix.needsUpdate = true;
    baseInst.instanceMatrix.needsUpdate = true;
    ribInst.instanceMatrix.needsUpdate = true;
    this.root.add(bodyInst, baseInst, ribInst);
  }

  /**
   * Build the shattered orbital elevator North spire with rotating orbital tether warning rings,
   * ruined skyline megastructures & tilted broken truss columns (InstancedMesh), and crimson-ochre sky dome.
   * @private
   */
  _buildOrbitalElevatorVistaAndSkyDome(mats) {
    // 1. Volcanic Crimson-Ochre Dusk Sky Dome (broken orbital ring arc painted on dome)
    const skyTex = this._texGen.getSkyDomeTexture('citadel');
    const skyGeo = this._trackGeo(new THREE.SphereGeometry(195, 24, 16));
    const skyMat = this._trackMat(
      new THREE.MeshBasicMaterial({
        map: skyTex,
        side: THREE.BackSide,
        fog: false,
        depthWrite: false,
      })
    );
    const skyDome = new THREE.Mesh(skyGeo, skyMat);
    this.root.add(skyDome);

    // 2. Hero Shattered Orbital Elevator Spine towering beyond North wall (0, 0, -52)
    const spireGroup = new THREE.Group();
    spireGroup.position.set(0, -4, -52);
    spireGroup.rotation.z = 0.08; // Dramatic structural list

    const coreGeo = this._trackGeo(
      scaleGeometryUVs(new THREE.CylinderGeometry(3.4, 4.8, 52, 8), 3.0, 6.0)
    );
    const coreMesh = new THREE.Mesh(coreGeo, mats.spireSteelMat);
    coreMesh.position.y = 26;
    spireGroup.add(coreMesh);

    const sleeveGeo = this._trackGeo(
      scaleBoxUVs(new THREE.BoxGeometry(8.8, 16, 8.8), 8.8, 16, 8.8, 4.4, 4.4)
    );
    const sleeveMesh = new THREE.Mesh(sleeveGeo, mats.wallConcreteMat);
    sleeveMesh.position.y = 11;
    spireGroup.add(sleeveMesh);

    // Jagged severed upper crown beams
    const crownShardGeo = this._trackGeo(
      scaleBoxUVs(new THREE.BoxGeometry(1.4, 14, 1.4), 1.4, 14, 1.4, 2.4, 2.4)
    );
    const crownOffsets = [
      [-2.8, 52, -2.0, 0.2, 0.14],
      [2.6, 54, 1.8, -0.18, -0.15],
      [0.4, 56, -2.8, 0.12, -0.22],
    ];
    for (let i = 0; i < crownOffsets.length; i++) {
      const [cx, cy, cz, rx, rz] = crownOffsets[i];
      const shard = new THREE.Mesh(crownShardGeo, mats.rustSteelMat);
      shard.position.set(cx, cy, cz);
      shard.rotation.set(rx, 0, rz);
      spireGroup.add(shard);
    }

    // Counter-rotating shattered orbital tether warning rings around the North spire
    const outerRingGeo = this._trackGeo(new THREE.TorusGeometry(9.5, 0.36, 8, 32));
    outerRingGeo.rotateX(Math.PI * 0.5);
    this._tetherRingOuter = new THREE.Mesh(outerRingGeo, mats.tetherBeaconMat);
    this._tetherRingOuter.position.y = 30;
    spireGroup.add(this._tetherRingOuter);

    const innerRingGeo = this._trackGeo(new THREE.TorusGeometry(6.8, 0.28, 8, 28));
    innerRingGeo.rotateX(Math.PI * 0.5);
    this._tetherRingInner = new THREE.Mesh(innerRingGeo, mats.tungstenAmberMat);
    this._tetherRingInner.position.y = 37;
    spireGroup.add(this._tetherRingInner);

    this.root.add(spireGroup);

    // 3. Distant Ruined Megastructure Slabs, Tilted Elevator Truss Columns & Warning Beacons (3 InstancedMeshes)
    const slabCount = 32;
    const trussCount = 16;
    const rng = createRng(70707);
    const dummy = new THREE.Object3D();

    const ruinSlabGeo = this._trackGeo(new THREE.BoxGeometry(1, 1, 1));
    const ruinInst = new THREE.InstancedMesh(ruinSlabGeo, mats.ruinedSkylineMat, slabCount);
    const beaconGeo = this._trackGeo(new THREE.SphereGeometry(0.65, 8, 6));
    const beaconInst = new THREE.InstancedMesh(beaconGeo, mats.distantBeaconMat, slabCount);

    for (let i = 0; i < slabCount; i++) {
      const ang = (i / slabCount) * Math.PI * 2 + (rng() - 0.5) * 0.14;
      const dist = i % 2 === 0 ? 58 + rng() * 22 : 88 + rng() * 34;
      const tx = Math.cos(ang) * dist;
      const tz = Math.sin(ang) * dist;
      const tw = 9 + rng() * 14;
      const td = 8 + rng() * 12;
      const th = 26 + rng() * 58;

      dummy.position.set(tx, th * 0.5 - 8, tz);
      dummy.rotation.set(
        (rng() - 0.5) * 0.14,
        rng() * Math.PI * 0.5,
        (rng() - 0.5) * 0.16
      );
      dummy.scale.set(tw, th, td);
      dummy.updateMatrix();
      ruinInst.setMatrixAt(i, dummy.matrix);

      dummy.position.set(tx, th - 7.5, tz);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      beaconInst.setMatrixAt(i, dummy.matrix);
    }
    ruinInst.instanceMatrix.needsUpdate = true;
    beaconInst.instanceMatrix.needsUpdate = true;

    const trussGeo = this._trackGeo(
      scaleBoxUVs(new THREE.BoxGeometry(2.2, 42, 2.2), 2.2, 42, 2.2, 4.0, 4.0)
    );
    const trussInst = new THREE.InstancedMesh(trussGeo, mats.spireSteelMat, trussCount);
    for (let i = 0; i < trussCount; i++) {
      const ang = (i / trussCount) * Math.PI * 2 + 0.18;
      const dist = 48 + rng() * 24;
      const tx = Math.cos(ang) * dist;
      const tz = Math.sin(ang) * dist;
      dummy.position.set(tx, 14, tz);
      dummy.rotation.set((rng() - 0.5) * 0.42, ang, (rng() - 0.5) * 0.42);
      dummy.scale.set(1, 0.8 + rng() * 0.7, 1);
      dummy.updateMatrix();
      trussInst.setMatrixAt(i, dummy.matrix);
    }
    trussInst.instanceMatrix.needsUpdate = true;

    this.root.add(ruinInst, trussInst, beaconInst);
  }

  /**
   * Configure crimson-ochre dusk sunlight, volcanic ash hemisphere fill, exponential haze,
   * and at most 2 strategic PointLights.
   * @private
   */
  _buildLighting() {
    this.scene.background = new THREE.Color(0x5eb2f5);
    this.scene.fog = new THREE.FogExp2(0xc2e4fc, 0.0032);

    this._hemiLight = new THREE.HemisphereLight(0xc4e6ff, 0x90a3b5, 0.84);
    this._hemiLight.position.set(0, 34, 0);
    this.root.add(this._hemiLight);
    this._lights.push(this._hemiLight);

    this._dirLight = new THREE.DirectionalLight(0xfff4dc, 1.95);
    this._dirLight.position.set(-28, 42, -24);
    this._dirLight.shadow.camera.left = -36;
    this._dirLight.shadow.camera.right = 36;
    this._dirLight.shadow.camera.top = 36;
    this._dirLight.shadow.camera.bottom = -36;
    this._dirLight.shadow.camera.near = 8;
    this._dirLight.shadow.camera.far = 112;
    this._dirLight.shadow.bias = -0.0005;
    this._dirLight.shadow.normalBias = 0.03;
    this.root.add(this._dirLight);
    this._lights.push(this._dirLight);

    const craterGlow = new THREE.PointLight(0x38bdf8, 22, 28, 1.5);
    craterGlow.position.set(0, 1.8, 0);
    craterGlow.castShadow = false;
    this.root.add(craterGlow);
    this._accentLights.push(craterGlow);
    this._lights.push(craterGlow);
    this._craterGlowLight = craterGlow;

    const tetherBeacon = new THREE.PointLight(0xfbbf24, 20, 34, 1.45);
    tetherBeacon.position.set(0, 10.5, -15);
    tetherBeacon.castShadow = false;
    this.root.add(tetherBeacon);
    this._accentLights.push(tetherBeacon);
    this._lights.push(tetherBeacon);
    this._tetherBeaconLight = tetherBeacon;
  }

  /**
   * Zero-GC animation: rotating orbital tether warning rings, pulsing crater fissure ember glow,
   * and distant ruined skyline aviation beacons.
   *
   * @param {number} dt
   * @param {number} elapsedTime
   */
  update(dt, elapsedTime) {
    if (!this._built) return;
    const t = Number.isFinite(elapsedTime) ? elapsedTime : 0;
    const safeDt = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.1) : 0;

    if (this._tetherRingOuter) {
      this._tetherRingOuter.rotation.y += safeDt * 0.42;
      this._tetherRingOuter.rotation.z = Math.sin(t * 0.55) * 0.1;
    }
    if (this._tetherRingInner) {
      this._tetherRingInner.rotation.y -= safeDt * 0.78;
      this._tetherRingInner.rotation.x = Math.cos(t * 0.7) * 0.14;
    }

    const pulse = 0.5 + 0.5 * Math.sin(t * 2.4);
    if (this._fissureEmberMat) {
      this._fissureEmberMat.emissiveIntensity = 1.2 + pulse * 0.55;
    }
    if (this._craterGroundMat) {
      this._craterGroundMat.emissiveIntensity = 0.31 + pulse * 0.08;
    }
    if (this._tetherBeaconMat) {
      this._tetherBeaconMat.emissiveIntensity = 1.25 + pulse * 0.5;
    }
    if (this._craterGlowLight && this._craterGlowLight.visible) {
      this._craterGlowLight.intensity = 24 + pulse * 8;
    }
    if (this._distantBeaconMat) {
      const blink = Math.sin(t * 2.6) > 0.2 ? 1.0 : 0.24;
      this._distantBeaconMat.color.setRGB(0.92 * blink, 0.32 * blink, 0.1 * blink);
    }
  }

  /**
   * Apply quality preset (directional shadows & <=2 accent point lights).
   * Preserves Map 3 fog density managed by Engine.setAtmosphere().
   *
   * @param {any} qualityConfig
   */
  setQuality(qualityConfig) {
    if (!qualityConfig) return;
    this.qualityConfig = qualityConfig;

    if (this._dirLight) {
      const shadowsOn = Boolean(qualityConfig.shadowsEnabled);
      this._dirLight.castShadow = shadowsOn;
      if (shadowsOn && Number.isFinite(qualityConfig.shadowMapSize)) {
        const size = qualityConfig.shadowMapSize;
        if (
          this._dirLight.shadow.mapSize.width !== size ||
          this._dirLight.shadow.mapSize.height !== size
        ) {
          this._dirLight.shadow.mapSize.set(size, size);
          if (this._dirLight.shadow.map) {
            this._dirLight.shadow.map.dispose();
            this._dirLight.shadow.map = null;
          }
        }
      }
    }

    const maxDynamic = Number.isFinite(qualityConfig.dynamicLights)
      ? Math.max(0, Math.min(2, qualityConfig.dynamicLights))
      : this._accentLights.length;
    for (let i = 0; i < this._accentLights.length; i++) {
      this._accentLights[i].visible = i < maxDynamic;
    }
  }

  /**
   * Cleanly dispose all meshes, geometries, materials, and lights.
   * Never disposes a shared TextureGenerator supplied via constructor.
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

    for (let i = 0; i < this._lights.length; i++) {
      if (this._lights[i].shadow && this._lights[i].shadow.map) {
        this._lights[i].shadow.map.dispose();
      }
    }
    this._lights.length = 0;
    this._accentLights.length = 0;
    this._dirLight = null;
    this._hemiLight = null;
    this._craterGlowLight = null;
    this._tetherBeaconLight = null;

    this._craterGroundMat = null;
    this._fissureEmberMat = null;
    this._tetherBeaconMat = null;
    this._tetherRingOuter = null;
    this._tetherRingInner = null;
    this._distantBeaconMat = null;

    if (this._ownsTexGen && this._texGen) {
      this._texGen.dispose();
    }
    this._built = false;
  }
}
  __exports.Map3CitadelBuilder = Map3CitadelBuilder;
});
