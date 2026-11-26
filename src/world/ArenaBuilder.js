// Module: src/world/ArenaBuilder.js
__define("src/world/ArenaBuilder.js", (__exports, __require) => {
const { ARENA_CONFIG } = __require("src/config/constants.js");
const { TextureGenerator } = __require("src/world/TextureGenerator.js");

/**
 * Deterministic PRNG (Mulberry32) for procedural skyline and rubble placement.
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
 * Scale UVs of an ExtrudeGeometry (emitted in world meters) so seamless
 * PBR textures map at crisp, uniform real-world scale.
 * @param {THREE.BufferGeometry} geo
 * @param {number} [scaleU=0.22]
 * @param {number} [scaleV=0.22]
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
 * Scale BoxGeometry UVs directly from world dimensions using face normals so
 * seamless PBR textures maintain uniform real-world texel density without stretching.
 * @param {THREE.BufferGeometry} geo
 * @param {number} w
 * @param {number} h
 * @param {number} d
 * @param {number} [tileU=2.0]
 * @param {number} [tileV=2.0]
 */
function scaleBoxUVs(geo, w, h, d, tileU = 2.0, tileV = 2.0) {
  const pos = geo.attributes.position;
  const norm = geo.attributes.normal;
  const uv = geo.attributes.uv;
  if (!pos || !norm || !uv) return geo;

  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(norm.getX(i));
    const ny = Math.abs(norm.getY(i));
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);

    if (nx > 0.5) {
      uv.setXY(i, (z + d * 0.5) / tileU, (y + h * 0.5) / tileV);
    } else if (ny > 0.5) {
      uv.setXY(i, (x + w * 0.5) / tileU, (z + d * 0.5) / tileV);
    } else {
      uv.setXY(i, (x + w * 0.5) / tileU, (y + h * 0.5) / tileV);
    }
  }
  uv.needsUpdate = true;
  return geo;
}

/**
 * Map 1 Arena Builder — "SECTOR-09 // DEAD METROPOLIS" (Ruined Overpass & Terra-Beacon Plaza).
 * Constructs a 64m x 64m post-apocalyptic multi-tier FPS arena using sculpted ExtrudeGeometry,
 * LatheGeometry, TubeGeometry, InstancedMesh batching, and procedural Canvas PBR textures,
 * with exact 1:1 CollisionWorld AABB registration.
 *
 * Strictly zero neon, zero MeshPhysicalMaterial, max 2 PointLights, and never overwrites
 * scene.fog.density inside setQuality().
 */
class ArenaBuilder {
  /**
   * @param {THREE.Scene} scene
   * @param {import('../physics/CollisionWorld.js').CollisionWorld} collisionWorld
   * @param {any} [qualityConfig]
   * @param {TextureGenerator|null} [sharedTexGen=null]
   */
  constructor(scene, collisionWorld, qualityConfig = {}, sharedTexGen = null) {
    this.scene = scene;
    this.collisionWorld = collisionWorld;
    this.qualityConfig = qualityConfig || {};

    this.root = new THREE.Group();
    this.root.name = 'ArenaRoot_SECTOR09';

    this._ownsTexGen = !sharedTexGen;
    this._texGen = sharedTexGen || new TextureGenerator(4);

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

    // Animated hero references (updated in update() with zero allocations)
    this._beaconOuterRing = null;
    this._beaconInnerRing = null;
    this._terraCoreMesh = null;
    this._terraLight = null;
    this._podLight = null;
    this._podBeaconMat = null;
    this._amberTrimMat = null;
    this._beaconMat = null;

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
   * Construct Map 1 ("SECTOR-09 // DEAD METROPOLIS") and return structured arenaData.
   */
  build() {
    if (this._built) {
      this.dispose();
    }
    this._built = true;
    this.root = new THREE.Group();
    this.root.name = 'ArenaRoot_SECTOR09';
    this.scene.add(this.root);

    const half = ARENA_CONFIG.halfSize; // 32
    const innerBound = half - 0.5; // 31.5
    const wallH = ARENA_CONFIG.wallHeight; // 11

    // Hard arena safety bounds matching inner perimeter wall faces 1:1
    this.collisionWorld.setArenaBounds(-innerBound, innerBound, -innerBound, innerBound, 0, 28);

    // 1. Shared Post-Apocalyptic Canvas PBR Materials
    const mats = this._createMaterials();

    // 2. Cracked Asphalt Floor, Leading Tarmac Guides, Ruined Concrete Perimeter & Military Signboards
    this._buildFloorAndLeadingLines(mats, innerBound);
    this._buildPerimeterWalls(mats, innerBound, wallH);
    this._buildMilitarySignboards(mats, innerBound);

    // 3. Central Terra-Beacon Plaza, Overhead Uplink Tower & Crashed Orbital Drop Pod Wreckage
    this._buildTerraBeaconPlaza(mats, innerBound);
    this._buildCrashedDropPod(mats);

    // 4. Elevated Collapsed Highway Catwalks (y=4.0m), 4 Stepped Ramps (<=0.333m/step) & Corner Overpasses
    this._buildCatwalksAndRamps(mats);
    this._buildCornerBalconies(mats, innerBound);

    // 5. 3-Lane Concrete Jersey Barriers & Rusted Cargo Monoliths
    this._buildTacticalCover(mats);

    // 6. Tilted Ruined Skyscrapers & Golden-Ash Sunset Sky Dome (with AETHER-1 Orbital Carrier)
    this._buildSkylineAndSkyDome(mats);

    // 7. Golden-Ash Dusk Lighting (at most 2 PointLights, zero neon)
    this._buildLighting();
    this.setQuality(this.qualityConfig);

    // 8. Structured Arena Data (verified 100% collision-clear)
    const arenaData = {
      mapId: 'dead_metropolis',
      mapIndex: 0,
      mapCode: 'SEC-09',
      mapName: 'SECTOR-09 // SOLARIS PLAZA',
      mapSubtitle: 'SUNLIT SKY-OVERPASS & BEACON TERRACE',
      atmosphere: {
        bgColor: 0x5eb4f5,
        fogColor: 0xbfe2fc,
        fogDensity: 0.0032,
      },
      playerSpawn: {
        pos: new THREE.Vector3(0, 0.05, 24),
        yaw: 0,
      },
      enemySpawns: [
        // 8 Ground Spawns across North, Mid-Flank, and Outer Lanes
        { pos: new THREE.Vector3(0, 0.05, -26.5), isElevated: false },
        { pos: new THREE.Vector3(-16.5, 0.05, -26.5), isElevated: false },
        { pos: new THREE.Vector3(16.5, 0.05, -26.5), isElevated: false },
        { pos: new THREE.Vector3(-28.0, 0.05, 0.0), isElevated: false },
        { pos: new THREE.Vector3(28.0, 0.05, 0.0), isElevated: false },
        { pos: new THREE.Vector3(-11.0, 0.05, -15.5), isElevated: false },
        { pos: new THREE.Vector3(11.0, 0.05, -15.5), isElevated: false },
        { pos: new THREE.Vector3(0.0, 0.05, -19.0), isElevated: false },
        // 4 Elevated Flank Catwalk Spawns (y = 4.0m)
        { pos: new THREE.Vector3(-22.0, 4.05, -6.5), isElevated: true },
        { pos: new THREE.Vector3(22.0, 4.05, -6.5), isElevated: true },
        { pos: new THREE.Vector3(-22.0, 4.05, 6.5), isElevated: true },
        { pos: new THREE.Vector3(22.0, 4.05, 6.5), isElevated: true },
      ],
      pickupSpawns: [
        { pos: new THREE.Vector3(-22.0, 4.0, 0.0), type: 'shield' },
        { pos: new THREE.Vector3(22.0, 4.0, 0.0), type: 'health' },
        { pos: new THREE.Vector3(-28.0, 4.6, -28.0), type: 'ammo' },
        { pos: new THREE.Vector3(28.0, 4.6, -28.0), type: 'shield' },
        { pos: new THREE.Vector3(-16.5, 0.0, 26.5), type: 'health' },
        { pos: new THREE.Vector3(16.5, 0.0, 26.5), type: 'ammo' },
      ],
      barrelSpawns: [
        // 3 tactical twin-choke pairs spaced ~6.4m apart for rewarding chain reactions
        new THREE.Vector3(-11.2, 0.0, -3.2),
        new THREE.Vector3(-11.2, 0.0, 3.2),
        new THREE.Vector3(11.2, 0.0, -3.2),
        new THREE.Vector3(11.2, 0.0, 3.2),
        new THREE.Vector3(-3.4, 0.0, -13.0),
        new THREE.Vector3(3.4, 0.0, -13.0),
      ],
      jumpPadSpawns: [
        // Calibrated for g=26 m/s^2 -> clears 4.6m corner overpass deck lip cleanly
        { pos: new THREE.Vector3(-27.8, 0.0, -17.0), launchVy: 18.2, launchDirX: 0, launchDirZ: -1 },
        { pos: new THREE.Vector3(27.8, 0.0, -17.0), launchVy: 18.2, launchDirX: 0, launchDirZ: -1 },
        { pos: new THREE.Vector3(-27.8, 0.0, 17.0), launchVy: 18.2, launchDirX: 0, launchDirZ: 1 },
        { pos: new THREE.Vector3(27.8, 0.0, 17.0), launchVy: 18.2, launchDirX: 0, launchDirZ: 1 },
      ],
      controlZoneCenter: new THREE.Vector3(0, 0.25, 0),
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
   * Create shared PBR material palette (MeshStandardMaterial / MeshBasicMaterial only).
   * @private
   */
  _createMaterials() {
    const floorTex = this._texGen.getFloorTextures(16, 16);
    const daisTex = this._texGen.getFloorTextures(2, 2);
    const wallTex = this._texGen.getWallTextures(1, 1);
    const coverConcreteTex = this._texGen.getWallTextures(1, 1);
    const catwalkTex = this._texGen.getCatwalkTextures(1, 1);
    const stepTex = this._texGen.getCatwalkTextures(1, 1);
    const rustTex = this._texGen.getRustMetalTextures(1, 1);
    const rustLargeTex = this._texGen.getRustMetalTextures(1, 1);
    const hazardTex = this._texGen.getHazardTextures(1, 1);
    const skylineTex = this._texGen.getRuinedSkylineTextures();

    const floorMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        map: floorTex.map,
        roughnessMap: floorTex.roughnessMap,
        bumpMap: floorTex.bumpMap,
        bumpScale: 0.045,
        metalness: 0.08,
        roughness: 0.92,
      })
    );

    const daisMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        map: daisTex.map,
        roughnessMap: daisTex.roughnessMap,
        bumpMap: daisTex.bumpMap,
        bumpScale: 0.04,
        metalness: 0.14,
        roughness: 0.86,
      })
    );

    const wallMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        map: wallTex.map,
        roughnessMap: wallTex.roughnessMap,
        bumpMap: wallTex.bumpMap,
        bumpScale: 0.065,
        metalness: 0.08,
        roughness: 0.92,
      })
    );

    const concreteCoverMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xd8e6f4,
        map: coverConcreteTex.map,
        roughnessMap: coverConcreteTex.roughnessMap,
        bumpMap: coverConcreteTex.bumpMap,
        bumpScale: 0.055,
        metalness: 0.14,
        roughness: 0.72,
      })
    );

    const rustMetalMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        map: rustTex.map,
        roughnessMap: rustTex.roughnessMap,
        bumpMap: rustTex.bumpMap,
        bumpScale: 0.04,
        color: 0xd8e5f2,
        metalness: 0.38,
        roughness: 0.48,
      })
    );

    const darkSteelMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x7a96b4,
        map: rustLargeTex.map,
        roughnessMap: rustLargeTex.roughnessMap,
        bumpMap: rustLargeTex.bumpMap,
        bumpScale: 0.035,
        metalness: 0.48,
        roughness: 0.44,
      })
    );

    const podHullMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xf8fbff,
        roughnessMap: rustLargeTex.roughnessMap,
        bumpMap: rustLargeTex.bumpMap,
        bumpScale: 0.025,
        metalness: 0.32,
        roughness: 0.36,
      })
    );

    const scorchMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xb8cde0,
        bumpMap: rustLargeTex.bumpMap,
        bumpScale: 0.03,
        metalness: 0.18,
        roughness: 0.68,
      })
    );

    const catwalkMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        map: catwalkTex.map,
        roughnessMap: catwalkTex.roughnessMap,
        bumpMap: catwalkTex.bumpMap,
        bumpScale: 0.04,
        color: 0xf0f6fc,
        metalness: 0.38,
        roughness: 0.46,
      })
    );

    const stepMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        map: stepTex.map,
        roughnessMap: stepTex.roughnessMap,
        bumpMap: stepTex.bumpMap,
        bumpScale: 0.035,
        color: 0xeaf2fa,
        metalness: 0.35,
        roughness: 0.48,
      })
    );

    const hazardMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        map: hazardTex.map,
        roughnessMap: hazardTex.roughnessMap,
        bumpMap: hazardTex.bumpMap,
        bumpScale: 0.03,
        metalness: 0.18,
        roughness: 0.56,
      })
    );

    // Crisp sky-cobalt plaza leading-line material
    const ochreGuideMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x0ea5e9,
        roughness: 0.48,
        metalness: 0.14,
      })
    );

    // Bright sunlit sky-cyan indicator lamp
    const amberBeaconMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: new THREE.Color(0x0ea5e9),
        emissiveIntensity: 1.15,
        roughness: 0.24,
        metalness: 0.15,
      })
    );

    const terraCoreMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x7dd3fc,
        emissive: new THREE.Color(0x0284c7),
        emissiveIntensity: 1.5,
        roughness: 0.2,
        metalness: 0.1,
      })
    );

    const podBeaconMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xfb923c,
        emissive: new THREE.Color(0xf97316),
        emissiveIntensity: 1.4,
        roughness: 0.25,
        metalness: 0.1,
      })
    );

    const skylineMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        map: skylineTex.map,
        roughnessMap: skylineTex.roughnessMap,
        color: 0xf8fbff,
        roughness: 0.48,
        metalness: 0.16,
      })
    );

    const beaconMat = this._trackMat(
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
      })
    );

    this._amberTrimMat = amberBeaconMat;
    this._podBeaconMat = podBeaconMat;
    this._beaconMat = beaconMat;

    return {
      floorMat,
      daisMat,
      wallMat,
      concreteCoverMat,
      rustMetalMat,
      darkSteelMat,
      podHullMat,
      scorchMat,
      catwalkMat,
      stepMat,
      hazardMat,
      ochreGuideMat,
      amberBeaconMat,
      terraCoreMat,
      podBeaconMat,
      skylineMat,
      beaconMat,
    };
  }

  /**
   * Build 64m x 64m cracked asphalt floor & weathered ochre/steel leading lines
   * guiding sightlines cleanly toward Terra-Beacon Plaza, Ramps, and Jump Pads.
   * @private
   */
  _buildFloorAndLeadingLines(mats, innerBound) {
    const size = innerBound * 2;
    const floorGeo = this._trackGeo(new THREE.PlaneGeometry(size + 2, size + 2));
    const floorMesh = new THREE.Mesh(floorGeo, mats.floorMat);
    floorMesh.rotation.x = -Math.PI * 0.5;
    floorMesh.position.y = 0;
    floorMesh.receiveShadow = true;
    this.root.add(floorMesh);

    // Solid ground floor AABB below y=0
    this.collisionWorld.addBox(-34, -1.0, -34, 34, 0.0, 34, 'floor');

    // Recessed rusted steel cable trenches & faded ochre tarmac markings leading player eyes
    const ochreSpecs = [
      // South Spawn corridor into Central Terra-Beacon Plaza
      { x: 0, z: 19.2, w: 0.28, d: 21.0 },
      // North Approach into Plaza
      { x: 0, z: -19.2, w: 0.28, d: 21.0 },
      // South Ramp approach guide lines (x=±22)
      { x: -11.0, z: 24.4, w: 18.0, d: 0.16 },
      { x: 11.0, z: 24.4, w: 18.0, d: 0.16 },
      // Outer jump-pad runway guides along x = ±27.8
      { x: -27.8, z: 0, w: 0.22, d: 30.0 },
      { x: 27.8, z: 0, w: 0.22, d: 30.0 },
    ];

    const stripGeo = this._trackGeo(new THREE.BoxGeometry(1, 0.016, 1));
    for (let i = 0; i < ochreSpecs.length; i++) {
      const s = ochreSpecs[i];
      const m = new THREE.Mesh(stripGeo, mats.ochreGuideMat);
      m.position.set(s.x, 0.008, s.z);
      m.scale.set(s.w, 1, s.d);
      m.receiveShadow = true;
      this.root.add(m);
    }

    const trenchZGeo = this._trackGeo(
      scaleBoxUVs(new THREE.BoxGeometry(0.12, 0.016, 14.0), 0.12, 0.016, 14.0, 2.0, 2.0)
    );
    for (const tx of [-1.6, 1.6]) {
      const m = new THREE.Mesh(trenchZGeo, mats.darkSteelMat);
      m.position.set(tx, 0.008, 22.8);
      m.receiveShadow = true;
      this.root.add(m);
    }

    const trenchXGeo = this._trackGeo(
      scaleBoxUVs(new THREE.BoxGeometry(17.2, 0.016, 0.24), 17.2, 0.016, 0.24, 2.0, 2.0)
    );
    for (const tx of [-16.5, 16.5]) {
      const m = new THREE.Mesh(trenchXGeo, mats.darkSteelMat);
      m.position.set(tx, 0.008, 0);
      m.receiveShadow = true;
      this.root.add(m);
    }

    // Embedded amber runway marker studs along center spawn approach & jump-pad runways (1 InstancedMesh)
    const studCoords = [
      [-1.6, 25.0], [1.6, 25.0],
      [-1.6, 20.5], [1.6, 20.5],
      [-1.6, 16.0], [1.6, 16.0],
      [-27.8, -11.5], [27.8, -11.5],
      [-27.8, 11.5], [27.8, 11.5],
    ];
    const studGeo = this._trackGeo(new THREE.BoxGeometry(0.18, 0.03, 0.36));
    const studInst = new THREE.InstancedMesh(studGeo, mats.amberBeaconMat, studCoords.length);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < studCoords.length; i++) {
      dummy.position.set(studCoords[i][0], 0.015, studCoords[i][1]);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      studInst.setMatrixAt(i, dummy.matrix);
    }
    studInst.instanceMatrix.needsUpdate = true;
    this.root.add(studInst);
  }

  /**
   * Build 11m tall weathered brutalist concrete perimeter walls, beveled concrete buttresses,
   * shattered jagged parapet caps, and warm amber bulkhead markers.
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

    // North (-Z) and South (+Z) walls
    const northWall = new THREE.Mesh(wallGeoX, mats.wallMat);
    northWall.position.set(0, wallH * 0.5, -(innerBound + wallThick * 0.5));
    northWall.receiveShadow = true;
    this.root.add(northWall);
    this.collisionWorld.addBox(
      -innerBound - wallThick, 0, -innerBound - wallThick,
      innerBound + wallThick, wallH + 4, -innerBound,
      'wall'
    );

    const southWall = new THREE.Mesh(wallGeoX, mats.wallMat);
    southWall.position.set(0, wallH * 0.5, innerBound + wallThick * 0.5);
    southWall.receiveShadow = true;
    this.root.add(southWall);
    this.collisionWorld.addBox(
      -innerBound - wallThick, 0, innerBound,
      innerBound + wallThick, wallH + 4, innerBound + wallThick,
      'wall'
    );

    // West (-X) and East (+X) walls
    const westWall = new THREE.Mesh(wallGeoZ, mats.wallMat);
    westWall.position.set(-(innerBound + wallThick * 0.5), wallH * 0.5, 0);
    westWall.receiveShadow = true;
    this.root.add(westWall);
    this.collisionWorld.addBox(
      -innerBound - wallThick, 0, -innerBound,
      -innerBound, wallH + 4, innerBound,
      'wall'
    );

    const eastWall = new THREE.Mesh(wallGeoZ, mats.wallMat);
    eastWall.position.set(innerBound + wallThick * 0.5, wallH * 0.5, 0);
    eastWall.receiveShadow = true;
    this.root.add(eastWall);
    this.collisionWorld.addBox(
      innerBound, 0, -innerBound,
      innerBound + wallThick, wallH + 4, innerBound,
      'wall'
    );

    // Upper concrete overpass parapet cornice beam framing top rim of all 4 walls
    const corniceShape = new THREE.Shape();
    corniceShape.moveTo(0, 0);
    corniceShape.lineTo(1.05, 0);
    corniceShape.lineTo(1.3, 0.45);
    corniceShape.lineTo(1.3, 1.0);
    corniceShape.lineTo(0, 1.0);
    corniceShape.closePath();

    const corniceGeo = this._trackGeo(
      scaleGeometryUVs(
        new THREE.ExtrudeGeometry(corniceShape, {
          depth: innerBound * 2,
          bevelEnabled: true,
          bevelThickness: 0.05,
          bevelSize: 0.05,
          bevelSegments: 1,
        }),
        0.18,
        0.18
      )
    );
    corniceGeo.translate(0, 0, -innerBound);

    const corniceTransforms = [
      { pos: [-innerBound, wallH - 0.52, 0], rotY: 0 },
      { pos: [innerBound, wallH - 0.52, 0], rotY: Math.PI },
      { pos: [0, wallH - 0.52, -innerBound], rotY: -Math.PI * 0.5 },
      { pos: [0, wallH - 0.52, innerBound], rotY: Math.PI * 0.5 },
    ];
    for (let i = 0; i < corniceTransforms.length; i++) {
      const t = corniceTransforms[i];
      const m = new THREE.Mesh(corniceGeo, mats.concreteCoverMat);
      m.position.set(t.pos[0], t.pos[1], t.pos[2]);
      m.rotation.y = t.rotY;
      this.root.add(m);
    }

    // Beveled Brutalist Concrete Buttress Ribs (InstancedMesh -> 1 draw call)
    const ribShape = new THREE.Shape();
    ribShape.moveTo(0, 0);
    ribShape.lineTo(0.56, 0);
    ribShape.lineTo(0.56, 1.4);
    ribShape.lineTo(0.36, 2.2);
    ribShape.lineTo(0.36, wallH - 1.4);
    ribShape.lineTo(0.64, wallH - 0.3);
    ribShape.lineTo(0.64, wallH + 0.35);
    ribShape.lineTo(0, wallH + 0.35);
    ribShape.closePath();

    const ribGeo = this._trackGeo(
      scaleGeometryUVs(
        new THREE.ExtrudeGeometry(ribShape, {
          depth: 0.72,
          bevelEnabled: true,
          bevelThickness: 0.06,
          bevelSize: 0.06,
          bevelSegments: 2,
        }),
        0.24,
        0.24
      )
    );
    ribGeo.translate(0, 0, -0.36);

    const ribPositions = [-24, -17.5, -11, -4.5, 4.5, 11, 17.5, 24];
    const totalRibs = ribPositions.length * 4;
    const ribInst = new THREE.InstancedMesh(ribGeo, mats.concreteCoverMat, totalRibs);
    ribInst.castShadow = true;
    ribInst.receiveShadow = true;

    // Rusted steel I-beam girder faces + sparse warm amber industrial bulkhead markers
    const steelBracketGeo = this._trackGeo(
      scaleBoxUVs(new THREE.BoxGeometry(0.12, wallH - 2.4, 0.24), 0.12, wallH - 2.4, 0.24, 2.0, 2.0)
    );
    const bracketInst = new THREE.InstancedMesh(steelBracketGeo, mats.rustMetalMat, totalRibs);

    const lampGeo = this._trackGeo(new THREE.BoxGeometry(0.14, 0.36, 0.22));
    const lampInst = new THREE.InstancedMesh(lampGeo, mats.amberBeaconMat, totalRibs);

    const dummy = new THREE.Object3D();
    let idx = 0;

    for (let side = 0; side < 4; side++) {
      for (let i = 0; i < ribPositions.length; i++) {
        const offset = ribPositions[i];
        let insetX = 0;
        let insetZ = 0;
        let rotY = 0;

        if (side === 0) {
          insetX = -innerBound;
          insetZ = offset;
          rotY = 0;
        } else if (side === 1) {
          insetX = innerBound;
          insetZ = offset;
          rotY = Math.PI;
        } else if (side === 2) {
          insetX = offset;
          insetZ = -innerBound;
          rotY = -Math.PI * 0.5;
        } else {
          insetX = offset;
          insetZ = innerBound;
          rotY = Math.PI * 0.5;
        }

        dummy.position.set(insetX, 0, insetZ);
        dummy.rotation.set(0, rotY, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        ribInst.setMatrixAt(idx, dummy.matrix);

        const push = 0.42;
        const bx = side === 0 ? insetX + push : side === 1 ? insetX - push : insetX;
        const bz = side === 2 ? insetZ + push : side === 3 ? insetZ - push : insetZ;

        dummy.position.set(bx, wallH * 0.5, bz);
        dummy.rotation.set(0, rotY, 0);
        dummy.updateMatrix();
        bracketInst.setMatrixAt(idx, dummy.matrix);

        dummy.position.set(bx, wallH - 1.5, bz);
        dummy.rotation.set(0, rotY, 0);
        dummy.updateMatrix();
        lampInst.setMatrixAt(idx, dummy.matrix);

        idx++;
      }
    }

    ribInst.instanceMatrix.needsUpdate = true;
    bracketInst.instanceMatrix.needsUpdate = true;
    lampInst.instanceMatrix.needsUpdate = true;
    this.root.add(ribInst, bracketInst, lampInst);

    // Jagged shattered concrete parapet teeth & exposed rebar along upper wall skyline (1 InstancedMesh)
    const rng = createRng(9093);
    const toothCount = 24;
    const toothGeo = this._trackGeo(
      scaleBoxUVs(new THREE.BoxGeometry(2.6, 1.4, 0.9), 2.6, 1.4, 0.9, 3.2, 3.2)
    );
    const toothInst = new THREE.InstancedMesh(toothGeo, mats.concreteCoverMat, toothCount);
    for (let i = 0; i < toothCount; i++) {
      const side = i % 4;
      const along = -26 + ((i / toothCount) * 52) + (rng() - 0.5) * 3;
      const hScale = 0.45 + rng() * 1.05;
      const tilt = (rng() - 0.5) * 0.18;
      if (side < 2) {
        dummy.position.set(side === 0 ? -innerBound - 0.25 : innerBound + 0.25, wallH + 0.45 * hScale, along);
        dummy.rotation.set(tilt, Math.PI * 0.5, (rng() - 0.5) * 0.12);
      } else {
        dummy.position.set(along, wallH + 0.45 * hScale, side === 2 ? -innerBound - 0.25 : innerBound + 0.25);
        dummy.rotation.set((rng() - 0.5) * 0.12, 0, tilt);
      }
      dummy.scale.set(0.7 + rng() * 0.65, hScale, 1);
      dummy.updateMatrix();
      toothInst.setMatrixAt(i, dummy.matrix);
    }
    toothInst.instanceMatrix.needsUpdate = true;
    this.root.add(toothInst);
  }

  /**
   * Build 4 weathered bolted steel military stencil plates mounted on perimeter walls.
   * @private
   */
  _buildMilitarySignboards(mats, innerBound) {
    const configs = [
      {
        title: 'TERRA-BEACON ACTIVE',
        subtitle: 'SECTOR-09 // RECLAMATION UPLINK',
        accent: '#f59e0b',
        pos: [0, 7.6, -(innerBound - 0.48)],
        rotY: 0,
      },
      {
        title: 'DROP ZONE 09',
        subtitle: 'VANGUARD INSERTION CORRIDOR',
        accent: '#ea580c',
        pos: [0, 7.6, innerBound - 0.48],
        rotY: Math.PI,
      },
      {
        title: 'OVERPASS WEST // 01',
        subtitle: 'ELEVATED FLANK ROUTE',
        accent: '#d97706',
        pos: [-(innerBound - 0.48), 7.6, 0],
        rotY: Math.PI * 0.5,
      },
      {
        title: 'AETHER-1 UPLINK',
        subtitle: 'ORBITAL TELEMETRY RELAY',
        accent: '#eab308',
        pos: [innerBound - 0.48, 7.6, 0],
        rotY: -Math.PI * 0.5,
      },
    ];

    const screenW = 5.4;
    const screenH = 4.2;

    const bezelShape = new THREE.Shape();
    const hw = screenW * 0.5 + 0.34;
    const hh = screenH * 0.5 + 0.34;
    const ch = 0.42;
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
          depth: 0.28,
          bevelEnabled: true,
          bevelThickness: 0.06,
          bevelSize: 0.06,
          bevelSegments: 2,
        }),
        0.5,
        0.5
      )
    );
    const plateGeo = this._trackGeo(new THREE.PlaneGeometry(screenW, screenH));

    for (let i = 0; i < configs.length; i++) {
      const cfg = configs[i];
      const tex = this._texGen.getSignboardTexture(cfg.title, cfg.subtitle, cfg.accent);
      const plateMat = this._trackMat(
        new THREE.MeshStandardMaterial({
          map: tex,
          roughness: 0.66,
          metalness: 0.45,
        })
      );

      const group = new THREE.Group();
      group.position.set(cfg.pos[0], cfg.pos[1], cfg.pos[2]);
      group.rotation.y = cfg.rotY;

      const bezelMesh = new THREE.Mesh(bezelGeo, mats.rustMetalMat);
      bezelMesh.position.z = -0.14;
      group.add(bezelMesh);

      const plateMesh = new THREE.Mesh(plateGeo, plateMat);
      plateMesh.position.z = 0.06;
      group.add(plateMesh);

      this.root.add(group);
    }
  }

  /**
   * Build Central Orbital Terra-Beacon Plaza:
   * - Octagonal concrete & rusted steel dais (y=0.25m, 1:1 collision)
   * - 4 sculpted steel truss pylons at (±9.5, ±9.5) with overhead steel guy-wires
   * - Overhead suspended LatheGeometry Terra-Beacon dish/heat-sink spire (y=7.5..11m)
   *   with rotating mechanical radar lattice & 4 cardinal steel suspension conduits
   * @private
   */
  _buildTerraBeaconPlaza(mats, innerBound) {
    // 1. Octagonal Concrete Dais (y = 0..0.25m, radius 8.0m)
    const daisR = 8.0;
    const daisShape = new THREE.Shape();
    for (let i = 0; i < 8; i++) {
      const ang = (Math.PI / 4) * i + Math.PI / 8;
      const x = Math.cos(ang) * daisR;
      const y = Math.sin(ang) * daisR;
      if (i === 0) daisShape.moveTo(x, y);
      else daisShape.lineTo(x, y);
    }
    daisShape.closePath();

    const daisGeo = this._trackGeo(
      scaleGeometryUVs(
        new THREE.ExtrudeGeometry(daisShape, {
          depth: 0.19,
          bevelEnabled: true,
          bevelThickness: 0.06,
          bevelSize: 0.14,
          bevelSegments: 2,
        }),
        0.16,
        0.16
      )
    );
    daisGeo.rotateX(-Math.PI * 0.5);

    const daisMesh = new THREE.Mesh(daisGeo, mats.daisMat);
    daisMesh.position.y = 0.0;
    daisMesh.receiveShadow = true;
    this.root.add(daisMesh);

    // Rusted steel octagonal curb collar around dais rim
    const rimGeo = this._trackGeo(scaleGeometryUVs(new THREE.RingGeometry(7.48, 7.82, 8), 4.0, 4.0));
    const rimMesh = new THREE.Mesh(rimGeo, mats.hazardMat);
    rimMesh.rotation.x = -Math.PI * 0.5;
    rimMesh.rotation.z = Math.PI / 8;
    rimMesh.position.y = 0.256;
    this.root.add(rimMesh);

    // Exact 3-box octagonal collision registration (top at y = 0.25m)
    this.collisionWorld.addBox(-5.65, 0, -5.65, 5.65, 0.25, 5.65, 'platform');
    this.collisionWorld.addBox(-7.42, 0, -3.12, 7.42, 0.25, 3.12, 'platform');
    this.collisionWorld.addBox(-3.12, 0, -7.42, 3.12, 0.25, 7.42, 'platform');

    // 2. 4 Sculpted Diagonal Steel Pylon Buttresses at (±9.5, 0, ±9.5)
    const pylonCoords = [
      [-9.5, -9.5],
      [9.5, -9.5],
      [-9.5, 9.5],
      [9.5, 9.5],
    ];

    const makeOctagonShape = (radius) => {
      const s = new THREE.Shape();
      for (let i = 0; i < 8; i++) {
        const a = (Math.PI / 4) * i + Math.PI / 8;
        const x = Math.cos(a) * radius;
        const y = Math.sin(a) * radius;
        if (i === 0) s.moveTo(x, y);
        else s.lineTo(x, y);
      }
      s.closePath();
      return s;
    };

    const pylonPlinthGeo = this._trackGeo(
      scaleGeometryUVs(
        new THREE.ExtrudeGeometry(makeOctagonShape(0.95), {
          depth: 1.25,
          bevelEnabled: true,
          bevelThickness: 0.1,
          bevelSize: 0.1,
          bevelSegments: 2,
        }),
        0.4,
        0.4
      )
    );
    pylonPlinthGeo.rotateX(-Math.PI * 0.5);

    const pylonHazardGeo = this._trackGeo(
      scaleGeometryUVs(new THREE.CylinderGeometry(0.92, 0.96, 0.34, 8), 4.5, 0.35)
    );
    const pylonShaftGeo = this._trackGeo(
      scaleGeometryUVs(
        new THREE.ExtrudeGeometry(makeOctagonShape(0.68), {
          depth: 8.6,
          bevelEnabled: true,
          bevelThickness: 0.08,
          bevelSize: 0.08,
          bevelSegments: 2,
        }),
        0.3,
        0.22
      )
    );
    pylonShaftGeo.rotateX(-Math.PI * 0.5);

    const pylonCapGeo = this._trackGeo(
      scaleGeometryUVs(
        new THREE.ExtrudeGeometry(makeOctagonShape(0.98), {
          depth: 0.72,
          bevelEnabled: true,
          bevelThickness: 0.1,
          bevelSize: 0.1,
          bevelSegments: 2,
        }),
        0.8,
        0.8
      )
    );
    pylonCapGeo.rotateX(-Math.PI * 0.5);

    const pylonRibGeo = this._trackGeo(
      scaleBoxUVs(new THREE.BoxGeometry(0.16, 7.6, 1.48), 0.16, 7.6, 1.48, 2.0, 2.0)
    );
    const pylonMarkerGeo = this._trackGeo(new THREE.BoxGeometry(0.18, 0.48, 1.50));

    for (let i = 0; i < pylonCoords.length; i++) {
      const [px, pz] = pylonCoords[i];
      const pGroup = new THREE.Group();
      pGroup.position.set(px, 0, pz);

      const plinth = new THREE.Mesh(pylonPlinthGeo, mats.concreteCoverMat);
      plinth.position.y = 0.08;
      plinth.castShadow = true;
      plinth.receiveShadow = true;
      pGroup.add(plinth);

      const hazardBand = new THREE.Mesh(pylonHazardGeo, mats.hazardMat);
      hazardBand.position.y = 1.46;
      hazardBand.rotation.y = Math.PI / 8;
      pGroup.add(hazardBand);

      const shaft = new THREE.Mesh(pylonShaftGeo, mats.concreteCoverMat);
      shaft.position.y = 1.55;
      shaft.castShadow = true;
      shaft.receiveShadow = true;
      pGroup.add(shaft);

      const cap = new THREE.Mesh(pylonCapGeo, mats.rustMetalMat);
      cap.position.y = 9.95;
      pGroup.add(cap);

      // Rusted steel reinforcement ribs & subtle upper amber hazard beacon strip
      const ribA = new THREE.Mesh(pylonRibGeo, mats.darkSteelMat);
      ribA.position.y = 5.7;
      pGroup.add(ribA);

      const ribB = new THREE.Mesh(pylonRibGeo, mats.darkSteelMat);
      ribB.position.y = 5.7;
      ribB.rotation.y = Math.PI * 0.5;
      pGroup.add(ribB);

      const markerA = new THREE.Mesh(pylonMarkerGeo, mats.amberBeaconMat);
      markerA.position.y = 9.2;
      pGroup.add(markerA);

      const markerB = new THREE.Mesh(pylonMarkerGeo, mats.amberBeaconMat);
      markerB.position.y = 9.2;
      markerB.rotation.y = Math.PI * 0.5;
      pGroup.add(markerB);

      this.root.add(pGroup);

      // 1:1 Pylon collision registration
      this.collisionWorld.addBox(px - 0.88, 0, pz - 0.88, px + 0.88, 10.8, pz + 0.88, 'pillar');

      // Overhead heavy steel girder conduit arching from Pylon capital to Central Terra-Beacon
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(px, 9.7, pz),
        new THREE.Vector3(px * 0.65, 10.65, pz * 0.65),
        new THREE.Vector3(px * 0.24, 9.8, pz * 0.24),
        new THREE.Vector3(px * 0.10, 9.45, pz * 0.10),
      ]);
      const tubeGeo = this._trackGeo(new THREE.TubeGeometry(curve, 18, 0.22, 8, false));
      const tubeMesh = new THREE.Mesh(tubeGeo, mats.rustMetalMat);
      this.root.add(tubeMesh);

      // Tensioned steel suspension guy-wire cable beneath main conduit
      const wireCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(px, 9.25, pz),
        new THREE.Vector3(px * 0.60, 8.95, pz * 0.60),
        new THREE.Vector3(px * 0.14, 8.85, pz * 0.14),
      ]);
      const wireGeo = this._trackGeo(new THREE.TubeGeometry(wireCurve, 14, 0.055, 6, false));
      this.root.add(new THREE.Mesh(wireGeo, mats.darkSteelMat));
    }

    // 3. 4 Cardinal Wall-to-Center Steel Guy-Wires & Utility Conduits (y = 9.4..11.2m)
    const wallDirs = [
      [0, -1],
      [0, 1],
      [-1, 0],
      [1, 0],
    ];
    for (let i = 0; i < wallDirs.length; i++) {
      const [dx, dz] = wallDirs[i];
      const mainCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(dx * (innerBound - 0.2), 10.2, dz * (innerBound - 0.2)),
        new THREE.Vector3(dx * 21.0, 10.95, dz * 21.0),
        new THREE.Vector3(dx * 9.5, 11.1, dz * 9.5),
        new THREE.Vector3(dx * 1.4, 10.35, dz * 1.4),
      ]);
      const conduitGeo = this._trackGeo(new THREE.TubeGeometry(mainCurve, 20, 0.24, 8, false));
      this.root.add(new THREE.Mesh(conduitGeo, mats.darkSteelMat));

      const catenaryCurve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(dx * (innerBound - 0.2), 9.65, dz * (innerBound - 0.2)),
        new THREE.Vector3(dx * 20.5, 9.15, dz * 20.5),
        new THREE.Vector3(dx * 9.5, 9.35, dz * 9.5),
        new THREE.Vector3(dx * 1.4, 9.6, dz * 1.4),
      ]);
      const wireGeo = this._trackGeo(new THREE.TubeGeometry(catenaryCurve, 18, 0.06, 6, false));
      this.root.add(new THREE.Mesh(wireGeo, mats.rustMetalMat));
    }

    // 4. Overhead Suspended LatheGeometry Orbital Terra-Beacon Tower (y = 7.4..11.2m)
    const beaconGroup = new THREE.Group();
    beaconGroup.position.set(0, 9.25, 0);

    // Sculpted LatheGeometry parabolic uplink dish + heat-sink spire housing
    const spirePoints = [
      new THREE.Vector2(0.01, -1.75),
      new THREE.Vector2(0.36, -1.45),
      new THREE.Vector2(0.24, -1.25),
      new THREE.Vector2(0.72, -0.95),
      new THREE.Vector2(0.58, -0.68),
      new THREE.Vector2(1.22, -0.30),
      new THREE.Vector2(1.55, 0.12),
      new THREE.Vector2(1.18, 0.45),
      new THREE.Vector2(1.38, 0.85),
      new THREE.Vector2(0.95, 1.15),
      new THREE.Vector2(1.42, 1.48),
      new THREE.Vector2(1.10, 1.82),
      new THREE.Vector2(0.01, 1.95),
    ];
    const spireGeo = this._trackGeo(new THREE.LatheGeometry(spirePoints, 20));
    const spireMesh = new THREE.Mesh(spireGeo, mats.darkSteelMat);
    beaconGroup.add(spireMesh);

    // Warm amber orbital Terra-Core transceiver lens suspended beneath dish
    const corePoints = [
      new THREE.Vector2(0.01, -0.56),
      new THREE.Vector2(0.42, -0.40),
      new THREE.Vector2(0.62, 0.0),
      new THREE.Vector2(0.44, 0.40),
      new THREE.Vector2(0.01, 0.54),
    ];
    const coreGeo = this._trackGeo(new THREE.LatheGeometry(corePoints, 16));
    const coreMesh = new THREE.Mesh(coreGeo, mats.terraCoreMat);
    coreMesh.position.y = -0.92;
    beaconGroup.add(coreMesh);
    this._terraCoreMesh = coreMesh;

    // Counter-rotating mechanical radar & telemetry truss rings
    const finShape = new THREE.Shape();
    finShape.moveTo(-0.18, -0.35);
    finShape.lineTo(0.18, -0.35);
    finShape.lineTo(0.34, 0.0);
    finShape.lineTo(0.18, 0.35);
    finShape.lineTo(-0.18, 0.35);
    finShape.lineTo(-0.34, 0.0);
    finShape.closePath();
    const finGeo = this._trackGeo(
      new THREE.ExtrudeGeometry(finShape, {
        depth: 0.24,
        bevelEnabled: true,
        bevelThickness: 0.04,
        bevelSize: 0.04,
        bevelSegments: 1,
      })
    );
    finGeo.translate(0, 0, -0.12);

    const buildRadarRing = (radius, tube, ringMat, trimMat) => {
      const rGroup = new THREE.Group();
      const torusGeo = this._trackGeo(new THREE.TorusGeometry(radius, tube, 10, 32));
      const torusMesh = new THREE.Mesh(torusGeo, ringMat);
      torusMesh.rotation.x = Math.PI * 0.5;
      rGroup.add(torusMesh);

      const trimGeo = this._trackGeo(new THREE.TorusGeometry(radius - tube * 0.85, tube * 0.24, 6, 32));
      const trimMesh = new THREE.Mesh(trimGeo, trimMat);
      trimMesh.rotation.x = Math.PI * 0.5;
      rGroup.add(trimMesh);

      for (let k = 0; k < 4; k++) {
        const ang = (Math.PI * 0.5) * k;
        const fin = new THREE.Mesh(finGeo, mats.rustMetalMat);
        fin.position.set(Math.cos(ang) * radius, 0, Math.sin(ang) * radius);
        fin.rotation.y = -ang;
        rGroup.add(fin);
      }
      return rGroup;
    };

    this._beaconOuterRing = buildRadarRing(2.85, 0.16, mats.darkSteelMat, mats.amberBeaconMat);
    this._beaconOuterRing.position.y = -0.30;
    beaconGroup.add(this._beaconOuterRing);

    this._beaconInnerRing = buildRadarRing(1.92, 0.12, mats.rustMetalMat, mats.amberBeaconMat);
    this._beaconInnerRing.position.y = -0.68;
    beaconGroup.add(this._beaconInnerRing);

    this.root.add(beaconGroup);
  }

  /**
   * Build Crashed Orbital Drop Pod Wreckage embedded nose-first into a scorched
   * impact crater on the SW dais border (-6.4, 0, 6.3) with 1:1 cover collision.
   * @private
   */
  _buildCrashedDropPod(mats) {
    const px = -6.4;
    const pz = 6.3;

    const podSite = new THREE.Group();
    podSite.position.set(px, 0, pz);

    // 1. Scorched crater rim & ash depression ring (LatheGeometry)
    const craterPts = [
      new THREE.Vector2(0.01, 0.02),
      new THREE.Vector2(1.05, 0.03),
      new THREE.Vector2(1.38, 0.18),
      new THREE.Vector2(1.66, 0.08),
      new THREE.Vector2(1.88, 0.01),
    ];
    const craterGeo = this._trackGeo(new THREE.LatheGeometry(craterPts, 16));
    const craterMesh = new THREE.Mesh(craterGeo, mats.scorchMat);
    craterMesh.receiveShadow = true;
    podSite.add(craterMesh);

    // 2. Heat-shielded Orbital Drop Pod capsule (LatheGeometry) tilted at dramatic impact angle
    const podGroup = new THREE.Group();
    podGroup.position.set(0, 0.72, 0);
    podGroup.rotation.set(0.24, 0.45, -0.38);

    const podPts = [
      new THREE.Vector2(0.01, -0.95),
      new THREE.Vector2(0.58, -0.78),
      new THREE.Vector2(0.76, -0.42),
      new THREE.Vector2(0.74, 0.18),
      new THREE.Vector2(0.66, 0.78),
      new THREE.Vector2(0.48, 1.18),
      new THREE.Vector2(0.24, 1.32),
      new THREE.Vector2(0.01, 1.34),
    ];
    const podGeo = this._trackGeo(new THREE.LatheGeometry(podPts, 14));
    const podBody = new THREE.Mesh(podGeo, mats.podHullMat);
    podBody.castShadow = true;
    podBody.receiveShadow = true;
    podGroup.add(podBody);

    // Scorched carbon ablative heat-shield collar around nose
    const shieldGeo = this._trackGeo(new THREE.CylinderGeometry(0.78, 0.66, 0.34, 14));
    const shieldMesh = new THREE.Mesh(shieldGeo, mats.scorchMat);
    shieldMesh.position.y = -0.58;
    podGroup.add(shieldMesh);

    // Weathered black/ochre hazard identification collar
    const bandGeo = this._trackGeo(
      scaleGeometryUVs(new THREE.CylinderGeometry(0.72, 0.74, 0.24, 14), 3.5, 0.3)
    );
    const bandMesh = new THREE.Mesh(bandGeo, mats.hazardMat);
    bandMesh.position.y = 0.42;
    podGroup.add(bandMesh);

    // 3 Flared air-brake stabilizer fins (ExtrudeGeometry)
    const finShape = new THREE.Shape();
    finShape.moveTo(0.58, 0.15);
    finShape.lineTo(1.06, 0.65);
    finShape.lineTo(0.96, 1.08);
    finShape.lineTo(0.48, 1.02);
    finShape.closePath();
    const podFinGeo = this._trackGeo(
      scaleGeometryUVs(
        new THREE.ExtrudeGeometry(finShape, {
          depth: 0.08,
          bevelEnabled: true,
          bevelThickness: 0.02,
          bevelSize: 0.02,
          bevelSegments: 1,
        }),
        0.5,
        0.5
      )
    );
    podFinGeo.translate(0, 0, -0.04);

    for (let f = 0; f < 3; f++) {
      const fin = new THREE.Mesh(podFinGeo, mats.rustMetalMat);
      fin.rotation.y = (Math.PI * 2 * f) / 3;
      fin.castShadow = true;
      podGroup.add(fin);
    }

    // Pulsing amber orbital distress beacon at tail crown
    const beaconGeo = this._trackGeo(new THREE.CylinderGeometry(0.14, 0.18, 0.16, 10));
    const beaconMesh = new THREE.Mesh(beaconGeo, mats.podBeaconMat);
    beaconMesh.position.y = 1.38;
    podGroup.add(beaconMesh);

    podSite.add(podGroup);
    this.root.add(podSite);

    // 1:1 Collision box enclosing the grounded wreckage hull cleanly
    this.collisionWorld.addBox(px - 1.05, 0, pz - 1.05, px + 1.05, 2.25, pz + 1.05, 'cover');
  }

  /**
   * Build 2 Elevated Collapsed Highway Catwalks (x=±22, y=4.0m) with rusted steel trusses,
   * concrete/steel half-cover guardrails, and 4 smooth 12-step ramps (<=0.333m/step).
   * @private
   */
  _buildCatwalksAndRamps(mats) {
    const deckY = 4.0;
    const deckThick = 0.35;
    const deckWidth = 4.0;
    const deckLength = 28.0; // z in [-14, 14]

    const deckShape = new THREE.Shape();
    deckShape.moveTo(-deckWidth * 0.5, 0);
    deckShape.lineTo(deckWidth * 0.5, 0);
    deckShape.lineTo(deckWidth * 0.5 - 0.18, -deckThick);
    deckShape.lineTo(-deckWidth * 0.5 + 0.18, -deckThick);
    deckShape.closePath();

    const deckGeo = this._trackGeo(
      scaleGeometryUVs(
        new THREE.ExtrudeGeometry(deckShape, {
          depth: deckLength,
          bevelEnabled: false,
        }),
        0.5,
        0.5
      )
    );
    deckGeo.translate(0, 0, -deckLength * 0.5);

    const grateTopGeo = this._trackGeo(
      scaleBoxUVs(
        new THREE.BoxGeometry(deckWidth - 0.12, 0.06, deckLength),
        deckWidth - 0.12,
        0.06,
        deckLength,
        deckWidth - 0.12,
        3.5
      )
    );

    const railLen = 8.5;
    const railShape = new THREE.Shape();
    railShape.moveTo(-0.18, 0);
    railShape.lineTo(0.18, 0);
    railShape.lineTo(0.18, 0.92);
    railShape.lineTo(0.08, 1.15);
    railShape.lineTo(-0.12, 1.15);
    railShape.lineTo(-0.18, 0.95);
    railShape.closePath();

    const railGeo = this._trackGeo(
      scaleGeometryUVs(
        new THREE.ExtrudeGeometry(railShape, {
          depth: railLen,
          bevelEnabled: true,
          bevelThickness: 0.04,
          bevelSize: 0.03,
          bevelSegments: 1,
        }),
        0.35,
        0.35
      )
    );
    railGeo.translate(0, 0, -railLen * 0.5);

    const railTrimGeo = this._trackGeo(
      scaleBoxUVs(new THREE.BoxGeometry(0.14, 0.07, railLen - 0.2), 0.14, 0.07, railLen - 0.2, 2.0, 2.0)
    );
    const underBeamGeo = this._trackGeo(
      scaleBoxUVs(new THREE.BoxGeometry(0.10, 0.10, deckLength), 0.10, 0.10, deckLength, 1.2, 0.35)
    );

    const sides = [-1, 1];
    for (let s = 0; s < sides.length; s++) {
      const sign = sides[s];
      const cx = sign * 22.0;

      const deckHull = new THREE.Mesh(deckGeo, mats.rustMetalMat);
      deckHull.position.set(cx, deckY - 0.04, 0);
      deckHull.castShadow = true;
      deckHull.receiveShadow = true;
      this.root.add(deckHull);

      const deckTop = new THREE.Mesh(grateTopGeo, mats.catwalkMat);
      deckTop.position.set(cx, deckY - 0.03, 0);
      deckTop.receiveShadow = true;
      this.root.add(deckTop);

      // Painted hazard flange along underside edge for strong silhouette contrast
      const underFlange = new THREE.Mesh(underBeamGeo, mats.hazardMat);
      underFlange.position.set(cx - sign * (deckWidth * 0.5 - 0.14), deckY - deckThick + 0.05, 0);
      this.root.add(underFlange);

      // 1:1 Catwalk Deck Collision Box
      this.collisionWorld.addBox(
        cx - deckWidth * 0.5,
        deckY - deckThick,
        -deckLength * 0.5,
        cx + deckWidth * 0.5,
        deckY,
        deckLength * 0.5,
        'platform'
      );

      // Two inner-edge concrete Jersey half-cover rails
      const railCentersZ = [-7.25, 7.25];
      const railX = cx - sign * (deckWidth * 0.5 - 0.18);
      for (let r = 0; r < railCentersZ.length; r++) {
        const rz = railCentersZ[r];
        const railMesh = new THREE.Mesh(railGeo, mats.concreteCoverMat);
        railMesh.position.set(railX, deckY, rz);
        railMesh.castShadow = true;
        railMesh.receiveShadow = true;
        this.root.add(railMesh);

        const trimMesh = new THREE.Mesh(railTrimGeo, mats.rustMetalMat);
        trimMesh.position.set(railX, deckY + 1.19, rz);
        this.root.add(trimMesh);

        this.collisionWorld.addBox(
          railX - 0.20,
          deckY,
          rz - railLen * 0.5,
          railX + 0.20,
          deckY + 1.16,
          rz + railLen * 0.5,
          'cover'
        );
      }
    }

    // Rusted Steel Support Columns & Diagonal Knee-Braces (InstancedMesh -> 2 draw calls)
    const colGeo = this._trackGeo(new THREE.CylinderGeometry(0.24, 0.28, deckY - deckThick, 8));
    const colZs = [-13.4, -5.2, 5.2, 13.4];
    const colInst = new THREE.InstancedMesh(colGeo, mats.darkSteelMat, colZs.length * 2);
    colInst.castShadow = true;
    colInst.receiveShadow = true;

    const braceGeo = this._trackGeo(
      scaleBoxUVs(new THREE.BoxGeometry(2.9, 0.14, 0.14), 2.9, 0.14, 0.14, 2.0, 2.0)
    );
    const braceInst = new THREE.InstancedMesh(braceGeo, mats.rustMetalMat, colZs.length * 2);

    const dummy = new THREE.Object3D();
    let ci = 0;
    let bi = 0;
    for (let s = 0; s < sides.length; s++) {
      const sign = sides[s];
      const colX = sign * 23.65;
      for (let k = 0; k < colZs.length; k++) {
        const cz = colZs[k];
        dummy.position.set(colX, (deckY - deckThick) * 0.5, cz);
        dummy.rotation.set(0, Math.PI / 8, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        colInst.setMatrixAt(ci++, dummy.matrix);

        this.collisionWorld.addBox(colX - 0.27, 0, cz - 0.27, colX + 0.27, deckY - deckThick, cz + 0.27, 'pillar');

        dummy.position.set(colX - sign * 1.15, deckY - 1.15, cz);
        dummy.rotation.set(0, 0, -sign * 0.62);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        braceInst.setMatrixAt(bi++, dummy.matrix);
      }
    }
    colInst.instanceMatrix.needsUpdate = true;
    braceInst.instanceMatrix.needsUpdate = true;
    this.root.add(colInst, braceInst);

    // 4 Smooth Climbable Stepped Ramps (12 steps <= 0.3333m rise each)
    const stepCount = 12;
    const stepRise = deckY / stepCount;
    const stepDepth = 0.80;
    const rampWidth = 3.4;

    const stepSlabGeo = this._trackGeo(
      scaleBoxUVs(new THREE.BoxGeometry(rampWidth, 0.34, stepDepth), rampWidth, 0.34, stepDepth, rampWidth, 1.6)
    );
    const stepEdgeGeo = this._trackGeo(new THREE.BoxGeometry(rampWidth - 0.24, 0.055, 0.07));
    const totalSteps = stepCount * 4;

    const stepInst = new THREE.InstancedMesh(stepSlabGeo, mats.stepMat, totalSteps);
    stepInst.castShadow = true;
    stepInst.receiveShadow = true;
    const stepEdgeInst = new THREE.InstancedMesh(stepEdgeGeo, mats.ochreGuideMat, totalSteps);

    const stringerShape = new THREE.Shape();
    const runLen = stepCount * stepDepth; // 9.6m
    stringerShape.moveTo(0, 0);
    stringerShape.lineTo(runLen, deckY - 0.35);
    stringerShape.lineTo(runLen, deckY + 0.14);
    stringerShape.lineTo(0, 0.42);
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
        0.5,
        0.5
      )
    );
    stringerGeo.translate(0, 0, -0.11);

    const plinthShape = new THREE.Shape();
    plinthShape.moveTo(0, 0);
    plinthShape.lineTo(stepDepth * 6, 0);
    plinthShape.lineTo(stepDepth * 6, stepRise * 6 - 0.06);
    plinthShape.lineTo(0, 0.08);
    plinthShape.closePath();
    const plinthGeo = this._trackGeo(
      scaleGeometryUVs(
        new THREE.ExtrudeGeometry(plinthShape, {
          depth: rampWidth - 0.08,
          bevelEnabled: false,
        }),
        0.85,
        0.85
      )
    );
    plinthGeo.translate(0, 0, -(rampWidth - 0.08) * 0.5);

    let stepIdx = 0;
    const rampConfigs = [
      { cx: -22.0, zStart: 23.6, dirZ: -1 },
      { cx: -22.0, zStart: -23.6, dirZ: 1 },
      { cx: 22.0, zStart: 23.6, dirZ: -1 },
      { cx: 22.0, zStart: -23.6, dirZ: 1 },
    ];

    for (let r = 0; r < rampConfigs.length; r++) {
      const rc = rampConfigs[r];
      const rotY = rc.dirZ < 0 ? Math.PI * 0.5 : -Math.PI * 0.5;

      for (const sideOff of [-rampWidth * 0.5 - 0.04, rampWidth * 0.5 + 0.04]) {
        const strMesh = new THREE.Mesh(stringerGeo, mats.rustMetalMat);
        strMesh.position.set(rc.cx + sideOff, 0, rc.zStart);
        strMesh.rotation.y = rotY;
        strMesh.castShadow = true;
        strMesh.receiveShadow = true;
        this.root.add(strMesh);
      }

      const plinthMesh = new THREE.Mesh(plinthGeo, mats.hazardMat);
      plinthMesh.position.set(rc.cx, 0, rc.zStart);
      plinthMesh.rotation.y = rotY;
      plinthMesh.receiveShadow = true;
      this.root.add(plinthMesh);

      for (let i = 0; i < stepCount; i++) {
        const topY = (i + 1) * stepRise;
        const zCenter = rc.zStart + rc.dirZ * (i + 0.5) * stepDepth;
        const zMin = Math.min(zCenter - stepDepth * 0.5, zCenter + stepDepth * 0.5);
        const zMax = Math.max(zCenter - stepDepth * 0.5, zCenter + stepDepth * 0.5);

        dummy.position.set(rc.cx, topY - 0.17, zCenter);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        stepInst.setMatrixAt(stepIdx, dummy.matrix);

        const frontZ = zCenter - rc.dirZ * (stepDepth * 0.5 - 0.03);
        dummy.position.set(rc.cx, topY - 0.03, frontZ);
        dummy.updateMatrix();
        stepEdgeInst.setMatrixAt(stepIdx, dummy.matrix);
        stepIdx++;

        const colMinY = i < 6 ? 0.0 : topY - 0.42;
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
    stepEdgeInst.instanceMatrix.needsUpdate = true;
    this.root.add(stepInst, stepEdgeInst);
  }

  /**
   * Build 4 Corner Overpass Balconies (y = 4.6m) accessible via the 4 Pneumatic Jump Pads.
   * @private
   */
  _buildCornerBalconies(mats, innerBound) {
    const deckY = 4.6;
    const deckThick = 0.38;
    const size = 7.0;

    const balcDeckGeo = this._trackGeo(
      scaleBoxUVs(new THREE.BoxGeometry(size, deckThick, size), size, deckThick, size, 3.5, 3.5)
    );
    const balcTopGeo = this._trackGeo(
      scaleBoxUVs(
        new THREE.BoxGeometry(size - 0.16, 0.05, size - 0.16),
        size - 0.16,
        0.05,
        size - 0.16,
        3.42,
        3.42
      )
    );
    const landingStripGeo = this._trackGeo(new THREE.BoxGeometry(2.8, 0.03, 0.24));

    const bracketShape = new THREE.Shape();
    bracketShape.moveTo(0, 0);
    bracketShape.lineTo(3.4, 1.5);
    bracketShape.lineTo(3.4, 1.85);
    bracketShape.lineTo(0, 1.85);
    bracketShape.closePath();
    const bracketGeo = this._trackGeo(
      scaleGeometryUVs(
        new THREE.ExtrudeGeometry(bracketShape, {
          depth: 0.42,
          bevelEnabled: true,
          bevelThickness: 0.04,
          bevelSize: 0.04,
          bevelSegments: 1,
        }),
        0.3,
        0.3
      )
    );
    bracketGeo.translate(0, 0, -0.21);

    const shieldLen = 3.2;
    const shieldShape = new THREE.Shape();
    shieldShape.moveTo(-0.18, 0);
    shieldShape.lineTo(0.18, 0);
    shieldShape.lineTo(0.18, 0.92);
    shieldShape.lineTo(0.06, 1.15);
    shieldShape.lineTo(-0.12, 1.15);
    shieldShape.lineTo(-0.18, 0.92);
    shieldShape.closePath();
    const shieldGeo = this._trackGeo(
      scaleGeometryUVs(
        new THREE.ExtrudeGeometry(shieldShape, {
          depth: shieldLen,
          bevelEnabled: true,
          bevelThickness: 0.04,
          bevelSize: 0.03,
          bevelSegments: 1,
        }),
        0.35,
        0.35
      )
    );
    shieldGeo.translate(0, 0, -shieldLen * 0.5);

    const shieldTrimGeo = this._trackGeo(
      scaleBoxUVs(new THREE.BoxGeometry(0.12, 0.06, shieldLen - 0.16), 0.12, 0.06, shieldLen - 0.16, 2.0, 2.0)
    );

    const corners = [
      { sx: -1, sz: -1 },
      { sx: 1, sz: -1 },
      { sx: -1, sz: 1 },
      { sx: 1, sz: 1 },
    ];

    for (let i = 0; i < corners.length; i++) {
      const { sx, sz } = corners[i];
      const cx = sx * (innerBound - size * 0.5);
      const cz = sz * (innerBound - size * 0.5);

      const hull = new THREE.Mesh(balcDeckGeo, mats.concreteCoverMat);
      hull.position.set(cx, deckY - deckThick * 0.5, cz);
      hull.castShadow = true;
      hull.receiveShadow = true;
      this.root.add(hull);

      const topGrate = new THREE.Mesh(balcTopGeo, mats.stepMat);
      topGrate.position.set(cx, deckY - 0.015, cz);
      topGrate.receiveShadow = true;
      this.root.add(topGrate);

      const entryZ = sz * (innerBound - size + 0.35);
      const strip = new THREE.Mesh(landingStripGeo, mats.ochreGuideMat);
      strip.position.set(cx, deckY + 0.02, entryZ);
      this.root.add(strip);

      const b1 = new THREE.Mesh(bracketGeo, mats.concreteCoverMat);
      b1.position.set(sx * innerBound, deckY - deckThick - 1.85, cz - sz * 1.4);
      b1.rotation.y = sx < 0 ? 0 : Math.PI;
      this.root.add(b1);

      const b2 = new THREE.Mesh(bracketGeo, mats.concreteCoverMat);
      b2.position.set(cx - sx * 1.4, deckY - deckThick - 1.85, sz * innerBound);
      b2.rotation.y = sz < 0 ? -Math.PI * 0.5 : Math.PI * 0.5;
      this.root.add(b2);

      // 1:1 Corner Overpass Deck Collision Box
      this.collisionWorld.addBox(
        cx - size * 0.5,
        deckY - deckThick,
        cz - size * 0.5,
        cx + size * 0.5,
        deckY,
        cz + size * 0.5,
        'platform'
      );

      // Tactical Jersey crouch-shield on back inner X-edge
      const shieldX = sx * (innerBound - size + 0.22);
      const shieldZ = sz * 29.2;
      const shieldMesh = new THREE.Mesh(shieldGeo, mats.concreteCoverMat);
      shieldMesh.position.set(shieldX, deckY, shieldZ);
      shieldMesh.castShadow = true;
      shieldMesh.receiveShadow = true;
      this.root.add(shieldMesh);

      const sTrim = new THREE.Mesh(shieldTrimGeo, mats.rustMetalMat);
      sTrim.position.set(shieldX, deckY + 1.19, shieldZ);
      this.root.add(sTrim);

      this.collisionWorld.addBox(
        shieldX - 0.20,
        deckY,
        shieldZ - shieldLen * 0.5,
        shieldX + 0.20,
        deckY + 1.16,
        shieldZ + shieldLen * 0.5,
        'cover'
      );
    }
  }

  /**
   * Build 3-lane concrete Jersey barriers (1.3m) and oxidized rusted steel cargo/bunker
   * monoliths (3.2m) matching CollisionWorld AABBs 1:1.
   * @private
   */
  _buildTacticalCover(mats) {
    // 1. Concrete Highway Jersey Barrier (width=3.6, depth=0.86, height=1.30m)
    const lowW = 3.6;
    const lowD = 0.86;
    const lowH = 1.30;
    const lowProfile = new THREE.Shape();
    lowProfile.moveTo(-lowD * 0.5, 0);
    lowProfile.lineTo(lowD * 0.5, 0);
    lowProfile.lineTo(lowD * 0.5, 0.34);
    lowProfile.lineTo(lowD * 0.34, 1.14);
    lowProfile.lineTo(lowD * 0.18, lowH);
    lowProfile.lineTo(-lowD * 0.18, lowH);
    lowProfile.lineTo(-lowD * 0.34, 1.14);
    lowProfile.lineTo(-lowD * 0.5, 0.34);
    lowProfile.closePath();

    const lowGeo = this._trackGeo(
      scaleGeometryUVs(
        new THREE.ExtrudeGeometry(lowProfile, {
          depth: lowW - 0.12,
          bevelEnabled: true,
          bevelThickness: 0.06,
          bevelSize: 0.05,
          bevelSegments: 2,
        }),
        0.34,
        0.34
      )
    );
    lowGeo.translate(0, 0, -(lowW - 0.12) * 0.5);
    lowGeo.rotateY(Math.PI * 0.5);

    const lowHazardGeo = this._trackGeo(
      scaleBoxUVs(new THREE.BoxGeometry(lowW + 0.04, 0.24, lowD + 0.04), lowW + 0.04, 0.24, lowD + 0.04, 1.2, 0.35)
    );
    const lowCapGeo = this._trackGeo(
      scaleBoxUVs(new THREE.BoxGeometry(lowW - 0.24, 0.06, 0.16), lowW - 0.24, 0.06, 0.16, 2.0, 2.0)
    );

    // 2. Full-Height Rusted Cargo Container / Bunker Monolith (width=3.2, depth=1.06, height=3.20m)
    const highW = 3.2;
    const highD = 1.06;
    const highH = 3.20;
    const highProfile = new THREE.Shape();
    highProfile.moveTo(-highD * 0.5, 0);
    highProfile.lineTo(highD * 0.5, 0);
    highProfile.lineTo(highD * 0.5, 0.45);
    highProfile.lineTo(highD * 0.40, 0.72);
    highProfile.lineTo(highD * 0.40, highH - 0.45);
    highProfile.lineTo(highD * 0.22, highH);
    highProfile.lineTo(-highD * 0.22, highH);
    highProfile.lineTo(-highD * 0.40, highH - 0.45);
    highProfile.lineTo(-highD * 0.40, 0.72);
    highProfile.lineTo(-highD * 0.5, 0.45);
    highProfile.closePath();

    const highGeo = this._trackGeo(
      scaleGeometryUVs(
        new THREE.ExtrudeGeometry(highProfile, {
          depth: highW - 0.14,
          bevelEnabled: true,
          bevelThickness: 0.07,
          bevelSize: 0.06,
          bevelSegments: 2,
        }),
        0.56,
        0.56
      )
    );
    highGeo.translate(0, 0, -(highW - 0.14) * 0.5);
    highGeo.rotateY(Math.PI * 0.5);

    const highHazardGeo = this._trackGeo(
      scaleBoxUVs(
        new THREE.BoxGeometry(highW + 0.06, 0.34, highD + 0.06),
        highW + 0.06,
        0.34,
        highD + 0.06,
        1.2,
        0.4
      )
    );
    const highRibGeo = this._trackGeo(
      scaleBoxUVs(
        new THREE.BoxGeometry(0.18, highH - 0.7, highD - 0.12),
        0.18,
        highH - 0.7,
        highD - 0.12,
        2.0,
        2.0
      )
    );
    const highCrownGeo = this._trackGeo(new THREE.BoxGeometry(highW - 0.3, 0.07, 0.16));

    const lowCoverSpecs = [
      { x: 0, z: 11.2, rotY: 0 },
      { x: 0, z: -11.2, rotY: 0 },
      { x: -4.8, z: 15.5, rotY: 0 },
      { x: 4.8, z: 15.5, rotY: 0 },
      { x: -4.8, z: -15.5, rotY: 0 },
      { x: 4.8, z: -15.5, rotY: 0 },
      { x: -14.5, z: 10.0, rotY: 0 },
      { x: 14.5, z: 10.0, rotY: 0 },
      { x: -14.5, z: -10.0, rotY: 0 },
      { x: 14.5, z: -10.0, rotY: 0 },
    ];

    for (let i = 0; i < lowCoverSpecs.length; i++) {
      const c = lowCoverSpecs[i];
      const group = new THREE.Group();
      group.position.set(c.x, 0, c.z);
      group.rotation.y = c.rotY;

      const body = new THREE.Mesh(lowGeo, mats.concreteCoverMat);
      body.castShadow = true;
      body.receiveShadow = true;
      group.add(body);

      const base = new THREE.Mesh(lowHazardGeo, mats.hazardMat);
      base.position.y = 0.12;
      base.receiveShadow = true;
      group.add(base);

      const cap = new THREE.Mesh(lowCapGeo, mats.rustMetalMat);
      cap.position.y = lowH + 0.065;
      group.add(cap);

      this.root.add(group);

      const halfX = Math.abs(Math.cos(c.rotY)) > 0.5 ? lowW * 0.5 : lowD * 0.5;
      const halfZ = Math.abs(Math.cos(c.rotY)) > 0.5 ? lowD * 0.5 : lowW * 0.5;
      this.collisionWorld.addBox(c.x - halfX, 0, c.z - halfZ, c.x + halfX, lowH, c.z + halfZ, 'cover');
    }

    const highCoverSpecs = [
      { x: -14.2, z: 0.0, rotY: Math.PI * 0.5 },
      { x: 14.2, z: 0.0, rotY: Math.PI * 0.5 },
      { x: -11.5, z: 22.0, rotY: 0 },
      { x: 11.5, z: 22.0, rotY: 0 },
      { x: -11.5, z: -22.0, rotY: 0 },
      { x: 11.5, z: -22.0, rotY: 0 },
    ];

    for (let i = 0; i < highCoverSpecs.length; i++) {
      const c = highCoverSpecs[i];
      const group = new THREE.Group();
      group.position.set(c.x, 0, c.z);
      group.rotation.y = c.rotY;

      const body = new THREE.Mesh(highGeo, mats.rustMetalMat);
      body.castShadow = true;
      body.receiveShadow = true;
      group.add(body);

      const base = new THREE.Mesh(highHazardGeo, mats.hazardMat);
      base.position.y = 0.17;
      base.receiveShadow = true;
      group.add(base);

      for (const rx of [-highW * 0.36, highW * 0.36]) {
        const rib = new THREE.Mesh(highRibGeo, mats.darkSteelMat);
        rib.position.set(rx, highH * 0.5, 0);
        group.add(rib);
      }

      const crownBar = new THREE.Mesh(highCrownGeo, mats.ochreGuideMat);
      crownBar.position.y = highH + 0.075;
      group.add(crownBar);

      this.root.add(group);

      const isZAligned = Math.abs(Math.sin(c.rotY)) > 0.5;
      const halfX = isZAligned ? highD * 0.5 : highW * 0.5;
      const halfZ = isZAligned ? highW * 0.5 : highD * 0.5;
      this.collisionWorld.addBox(c.x - halfX, 0, c.z - halfZ, c.x + halfX, highH, c.z + halfZ, 'cover');
    }
  }

  /**
   * Build distant tilted ruined concrete skyscrapers (InstancedMesh) with blown-out
   * windows, sparse amber rooftop beacons, and golden-ash sunset sky dome ('metropolis').
   * @private
   */
  _buildSkylineAndSkyDome(mats) {
    const skyTex = this._texGen.getSkyDomeTexture('metropolis');
    const skyGeo = this._trackGeo(new THREE.SphereGeometry(195, 24, 16));
    const skyMat = this._trackMat(
      new THREE.MeshBasicMaterial({
        map: skyTex,
        side: THREE.BackSide,
        fog: false,
        depthWrite: false,
      })
    );
    this.root.add(new THREE.Mesh(skyGeo, skyMat));

    const towerCount = 36;
    const towerGeo = this._trackGeo(new THREE.BoxGeometry(1, 1, 1));
    const towerInst = new THREE.InstancedMesh(towerGeo, mats.skylineMat, towerCount);

    const spireGeo = this._trackGeo(new THREE.BoxGeometry(0.45, 1, 0.45));
    const spireInst = new THREE.InstancedMesh(spireGeo, mats.darkSteelMat, towerCount);

    const beaconGeo = this._trackGeo(new THREE.SphereGeometry(0.55, 8, 6));
    const beaconInst = new THREE.InstancedMesh(beaconGeo, mats.beaconMat, towerCount);

    const rng = createRng(90909);
    const dummy = new THREE.Object3D();

    for (let i = 0; i < towerCount; i++) {
      const ang = (i / towerCount) * Math.PI * 2 + (rng() - 0.5) * 0.14;
      const ring = i % 2 === 0 ? 58 + rng() * 24 : 88 + rng() * 38;
      const tx = Math.cos(ang) * ring;
      const tz = Math.sin(ang) * ring;
      const tw = 9 + rng() * 14;
      const td = 9 + rng() * 14;
      const th = 32 + rng() * 68;

      // Subtle tilt on ruined skyscrapers for collapsed Earth metropolis silhouette
      const tiltX = (rng() - 0.5) * 0.085;
      const tiltZ = (rng() - 0.5) * 0.085;
      const yaw = rng() * Math.PI * 0.5;

      dummy.position.set(tx, th * 0.5 - 6, tz);
      dummy.rotation.set(tiltX, yaw, tiltZ);
      dummy.scale.set(tw, th, td);
      dummy.updateMatrix();
      towerInst.setMatrixAt(i, dummy.matrix);

      // Broken concrete/steel roof core remnant
      const spireH = 3 + rng() * 7;
      dummy.position.set(tx, th - 6 + spireH * 0.35, tz);
      dummy.rotation.set(tiltX * 1.4, yaw + 0.3, tiltZ * 1.4);
      dummy.scale.set(tw * 0.65, spireH, td * 0.65);
      dummy.updateMatrix();
      spireInst.setMatrixAt(i, dummy.matrix);

      // Sparse warm amber emergency aviation beacons (only on taller towers)
      const hasBeacon = i % 3 === 0;
      dummy.position.set(tx, th - 4.8, tz);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(hasBeacon ? 1 : 0.001);
      dummy.updateMatrix();
      beaconInst.setMatrixAt(i, dummy.matrix);
    }

    towerInst.instanceMatrix.needsUpdate = true;
    spireInst.instanceMatrix.needsUpdate = true;
    beaconInst.instanceMatrix.needsUpdate = true;
    this.root.add(towerInst, spireInst, beaconInst);
  }

  /**
   * Configure golden-ash sunset dusk lighting:
   * - Warm DirectionalLight (0xffb36b, 2.2)
   * - Dusty HemisphereLight (0x889cb0, 0x4a392b, 0.95)
   * - Strictly 2 PointLights max (Terra-Beacon warm amber + Drop Pod scorch glow)
   * @private
   */
  _buildLighting() {
    if (this.scene.background instanceof THREE.Color) {
      this.scene.background.set(0x5eb4f5);
    } else {
      this.scene.background = new THREE.Color(0x5eb4f5);
    }

    if (this.scene.fog && 'color' in this.scene.fog) {
      this.scene.fog.color.set(0xbfe2fc);
    } else {
      this.scene.fog = new THREE.FogExp2(0xbfe2fc, 0.0032);
    }

    this._hemiLight = new THREE.HemisphereLight(0xbbe2ff, 0x8ea4ba, 0.84);
    this._hemiLight.position.set(0, 36, 0);
    this.root.add(this._hemiLight);
    this._lights.push(this._hemiLight);

    this._dirLight = new THREE.DirectionalLight(0xfff4dc, 1.92);
    this._dirLight.position.set(28, 40, 22);
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

    // Strictly max 2 PointLights in ArenaBuilder for 60fps tablet performance
    const terraLight = new THREE.PointLight(0x38bdf8, 22, 28, 1.5);
    terraLight.position.set(0, 7.2, 0);
    terraLight.castShadow = false;
    this.root.add(terraLight);
    this._accentLights.push(terraLight);
    this._lights.push(terraLight);
    this._terraLight = terraLight;

    const podLight = new THREE.PointLight(0xfbbf24, 14, 16, 1.6);
    podLight.position.set(-6.4, 2.2, 6.3);
    podLight.castShadow = false;
    this.root.add(podLight);
    this._accentLights.push(podLight);
    this._lights.push(podLight);
    this._podLight = podLight;
  }

  /**
   * Smoothly animate Terra-Beacon radar array, thermal lens pulse,
   * crashed Drop Pod distress strobe, and distant amber warning beacons.
   * Strictly zero heap allocations.
   *
   * @param {number} dt
   * @param {number} elapsedTime
   */
  update(dt, elapsedTime) {
    if (!this._built) return;
    const t = Number.isFinite(elapsedTime) ? elapsedTime : 0;
    const safeDt = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.1) : 0;

    if (this._beaconOuterRing) {
      this._beaconOuterRing.rotation.y += safeDt * 0.42;
      this._beaconOuterRing.rotation.x = Math.sin(t * 0.5) * 0.08;
    }
    if (this._beaconInnerRing) {
      this._beaconInnerRing.rotation.y -= safeDt * 0.85;
      this._beaconInnerRing.rotation.z = Math.cos(t * 0.7) * 0.12;
    }

    const pulse = 0.5 + 0.5 * Math.sin(t * 2.4);
    if (this._terraCoreMesh) {
      const s = 0.95 + pulse * 0.09;
      this._terraCoreMesh.scale.set(s, s, s);
    }
    if (this._terraLight && this._terraLight.visible) {
      this._terraLight.intensity = 25 + pulse * 6;
    }

    const distress = 0.5 + 0.5 * Math.sin(t * 5.2);
    if (this._podBeaconMat) {
      this._podBeaconMat.emissiveIntensity = 1.0 + distress * 1.4;
    }
    if (this._podLight && this._podLight.visible) {
      this._podLight.intensity = 13 + distress * 5;
    }

    if (this._amberTrimMat) {
      this._amberTrimMat.emissiveIntensity = 1.15 + pulse * 0.35;
    }
    if (this._beaconMat) {
      const blink = Math.sin(t * 2.6) > 0.2 ? 1.0 : 0.25;
      this._beaconMat.color.setRGB(blink, 0.55 * blink, 0.14 * blink);
    }
  }

  /**
   * Apply quality preset dynamically (shadows, shadowMapSize, active dynamic light budget).
   * Does NOT overwrite this.scene.fog.density (owned by Engine.setAtmosphere()).
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
   * Cleanly dispose all meshes, geometries, materials, lights, and owned procedural textures.
   * Does NOT dispose sharedTexGen if one was injected.
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
    this._terraLight = null;
    this._podLight = null;

    this._beaconOuterRing = null;
    this._beaconInnerRing = null;
    this._terraCoreMesh = null;
    this._podBeaconMat = null;
    this._amberTrimMat = null;
    this._beaconMat = null;

    if (this._ownsTexGen && this._texGen) {
      this._texGen.dispose();
    }
    this._built = false;
  }
}
  __exports.ArenaBuilder = ArenaBuilder;
});
