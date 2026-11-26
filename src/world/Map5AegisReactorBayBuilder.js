// Module: src/world/Map5AegisReactorBayBuilder.js
__define("src/world/Map5AegisReactorBayBuilder.js", (__exports, __require) => {
const { ARENA_CONFIG } = __require("src/config/constants.js");
const { TextureGenerator } = __require("src/world/TextureGenerator.js");

function createRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function scaleGeometryUVs(geo, scaleU = 0.22, scaleV = 0.22) {
  const uv = geo.attributes.uv;
  if (!uv) return geo;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * scaleU, uv.getY(i) * scaleV);
  }
  uv.needsUpdate = true;
  return geo;
}

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
 * Map 5 Builder — "SECTOR-74 // AEGIS REACTOR BAY" (Stages 8–9)
 * Unified Orbital Aegis Citadel propulsion core & heat-sink bay in charcoal-gunmetal & tungsten-amber.
 * Features riveted warship deck plates, 4 corner y=3.6m reactor control terraces + perimeter skybridges,
 * 4 wide stepped ramps (0.30m/step), 4 jump pads, 4 heavy radiator heat-sink monoliths,
 * 6 angled blast-deflector armor baffles, overhead coolant conduit trusses (y=8.5m),
 * and an external Aegis Plasma Thruster Spire with counter-rotating containment rings.
 */
class Map5AegisReactorBayBuilder {
  constructor(scene, collisionWorld, qualityConfig = {}, sharedTexGen = null) {
    this.scene = scene;
    this.collisionWorld = collisionWorld;
    this.qualityConfig = qualityConfig || {};

    this._ownsTexGen = !sharedTexGen;
    this._texGen = sharedTexGen || new TextureGenerator(4);

    this.root = new THREE.Group();
    this.root.name = 'ArenaRoot_SECTOR74_AegisReactorBay';

    this._geometries = [];
    this._materials = [];
    this._lights = [];
    this._accentLights = [];
    this._dirLight = null;
    this._hemiLight = null;

    this._tungstenAmberMat = null;
    this._keelEmberMat = null;
    this._containmentRingA = null;
    this._containmentRingB = null;
    this._distantBeaconMat = null;
    this._coreReactorLight = null;
    this._spireGlowLight = null;

    this._built = false;
  }

  _trackGeo(geo) {
    this._geometries.push(geo);
    return geo;
  }

  _trackMat(mat) {
    this._materials.push(mat);
    return mat;
  }

  build() {
    if (this._built) {
      this.dispose();
    }
    this._built = true;

    this.root = new THREE.Group();
    this.root.name = 'ArenaRoot_SECTOR74_AegisReactorBay';
    this.scene.add(this.root);

    const half = ARENA_CONFIG.halfSize; // 32
    const innerBound = half - 0.5; // 31.5
    const wallH = ARENA_CONFIG.wallHeight; // 11

    this.collisionWorld.setArenaBounds(-innerBound, innerBound, -innerBound, innerBound, 0, 28);

    const mats = this._createMaterials();
    this._buildReactorFloorAndPlinth(mats, innerBound);
    this._buildPerimeterWalls(mats, innerBound, wallH);
    this._buildSectorSignboards(mats, innerBound);
    this._buildTerracesAndRamps(mats, innerBound);
    this._buildHeatSinksAndBlastBaffles(mats);
    this._buildThrusterSpireVista(mats, innerBound);
    this._buildLighting();
    this.setQuality(this.qualityConfig);

    // Jump pad calibration: deckY = 3.6m, g = 26 m/s^2, Vh = 11.0 m/s, Vy = 16.8 m/s
    // Peak y = 5.43m, descending landing at y = 3.6m occurs at t = 1.021s -> d = 11.23m.
    return {
      mapId: 'aegis_reactor_bay',
      mapIndex: 4,
      mapCode: 'SEC-74',
      mapName: 'SECTOR-74 // PRISM SOLAR CORE',
      mapSubtitle: 'RADIANT PHOTON ARRAY & ATRIUM HALL',
      atmosphere: {
        bgColor: 0x6ebcf7,
        fogColor: 0xcce4fc,
        fogDensity: 0.0032,
      },
      playerSpawn: {
        pos: new THREE.Vector3(0, 0.05, 24.5),
        yaw: 0,
      },
      enemySpawns: [
        { pos: new THREE.Vector3(0.0, 0.05, -19.0), isElevated: false },
        { pos: new THREE.Vector3(-4.5, 0.05, -19.5), isElevated: false },
        { pos: new THREE.Vector3(4.5, 0.05, -19.5), isElevated: false },
        { pos: new THREE.Vector3(0.0, 0.05, -9.5), isElevated: false },
        { pos: new THREE.Vector3(-19.5, 0.05, -6.0), isElevated: false },
        { pos: new THREE.Vector3(19.5, 0.05, -6.0), isElevated: false },
        { pos: new THREE.Vector3(-15.5, 0.05, 17.5), isElevated: false },
        { pos: new THREE.Vector3(15.5, 0.05, 17.5), isElevated: false },
        { pos: new THREE.Vector3(-25.5, 3.65, -25.5), isElevated: true },
        { pos: new THREE.Vector3(25.5, 3.65, -25.5), isElevated: true },
        { pos: new THREE.Vector3(-25.5, 3.65, 25.5), isElevated: true },
        { pos: new THREE.Vector3(25.5, 3.65, 25.5), isElevated: true },
      ],
      pickupSpawns: [
        { pos: new THREE.Vector3(-28.5, 3.60, 0.0), type: 'shield' },
        { pos: new THREE.Vector3(28.5, 3.60, 0.0), type: 'health' },
        { pos: new THREE.Vector3(0.0, 3.60, -28.5), type: 'ammo' },
        { pos: new THREE.Vector3(-14.0, 0.0, 26.5), type: 'ammo' },
        { pos: new THREE.Vector3(14.0, 0.0, 26.5), type: 'shield' },
        { pos: new THREE.Vector3(0.0, 0.0, 14.5), type: 'health' },
      ],
      barrelSpawns: [
        new THREE.Vector3(-7.5, 0.0, 0.0),
        new THREE.Vector3(7.5, 0.0, 0.0),
        new THREE.Vector3(-4.0, 0.0, -13.0),
        new THREE.Vector3(4.0, 0.0, -13.0),
        new THREE.Vector3(-16.0, 0.0, 11.5),
        new THREE.Vector3(16.0, 0.0, 11.5),
      ],
      jumpPadSpawns: [
        { pos: new THREE.Vector3(-17.2, 0.0, 0.0), launchVy: 16.8, launchDirX: -1, launchDirZ: 0 },
        { pos: new THREE.Vector3(17.2, 0.0, 0.0), launchVy: 16.8, launchDirX: 1, launchDirZ: 0 },
        { pos: new THREE.Vector3(-9.0, 0.0, -17.3), launchVy: 16.8, launchDirX: 0, launchDirZ: -1 },
        { pos: new THREE.Vector3(9.0, 0.0, -17.3), launchVy: 16.8, launchDirX: 0, launchDirZ: -1 },
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
  }

  _createMaterials() {
    const deckTex = this._texGen.getDrydockFloorTextures(14, 14);
    const concreteTex = this._texGen.getWallTextures(1, 1);
    const catwalkTex = this._texGen.getCatwalkTextures(1, 1);
    const rustTex = this._texGen.getRustMetalTextures(1, 1);
    const hazardTex = this._texGen.getHazardTextures(1, 1);
    const ruinedSkyTex = this._texGen.getRuinedSkylineTextures();

    const deckFloorMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xf4f2ff,
        map: deckTex.map,
        roughnessMap: deckTex.roughnessMap,
        bumpMap: deckTex.bumpMap,
        bumpScale: 0.038,
        metalness: 0.25,
        roughness: 0.48,
      })
    );

    const bulkheadWallMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xf1eefc,
        map: concreteTex.map,
        roughnessMap: concreteTex.roughnessMap,
        bumpMap: concreteTex.bumpMap,
        bumpScale: 0.045,
        metalness: 0.22,
        roughness: 0.52,
      })
    );

    const hullArmorMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xe4ddf8,
        map: rustTex.map,
        roughnessMap: rustTex.roughnessMap,
        bumpMap: rustTex.bumpMap,
        bumpScale: 0.035,
        metalness: 0.38,
        roughness: 0.42,
      })
    );

    const darkIronMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xa59fc8,
        roughnessMap: rustTex.roughnessMap,
        bumpMap: rustTex.bumpMap,
        bumpScale: 0.03,
        metalness: 0.48,
        roughness: 0.40,
      })
    );

    const baffleShieldMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x818cf8,
        roughnessMap: catwalkTex.roughnessMap,
        metalness: 0.52,
        roughness: 0.30,
      })
    );

    const catwalkMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xedeaff,
        map: catwalkTex.map,
        roughnessMap: catwalkTex.roughnessMap,
        bumpMap: catwalkTex.bumpMap,
        bumpScale: 0.035,
        metalness: 0.36,
        roughness: 0.44,
      })
    );

    const stepMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xe6e2fa,
        map: catwalkTex.map,
        roughnessMap: catwalkTex.roughnessMap,
        bumpMap: catwalkTex.bumpMap,
        bumpScale: 0.035,
        metalness: 0.34,
        roughness: 0.46,
      })
    );

    const hazardMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        map: hazardTex.map,
        roughnessMap: hazardTex.roughnessMap,
        bumpMap: hazardTex.bumpMap,
        bumpScale: 0.032,
        metalness: 0.22,
        roughness: 0.54,
      })
    );

    const tungstenAmberMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xa78bfa,
        emissive: new THREE.Color(0x6366f1),
        emissiveIntensity: 1.15,
        roughness: 0.32,
        metalness: 0.2,
      })
    );

    const keelEmberMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: new THREE.Color(0x0ea5e9),
        emissiveIntensity: 1.2,
        roughness: 0.34,
        metalness: 0.15,
      })
    );

    const ruinedSkylineMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xf4f7ff,
        map: ruinedSkyTex.map,
        roughnessMap: ruinedSkyTex.roughnessMap,
        roughness: 0.48,
        metalness: 0.18,
      })
    );

    const distantBeaconMat = this._trackMat(
      new THREE.MeshBasicMaterial({
        color: 0x6366f1,
      })
    );

    this._tungstenAmberMat = tungstenAmberMat;
    this._keelEmberMat = keelEmberMat;
    this._distantBeaconMat = distantBeaconMat;

    return {
      deckFloorMat,
      bulkheadWallMat,
      hullArmorMat,
      darkIronMat,
      baffleShieldMat,
      catwalkMat,
      stepMat,
      hazardMat,
      tungstenAmberMat,
      keelEmberMat,
      ruinedSkylineMat,
      distantBeaconMat,
    };
  }

  _buildReactorFloorAndPlinth(mats, innerBound) {
    const floorSize = innerBound * 2 + 2;
    const floorGeo = this._trackGeo(new THREE.PlaneGeometry(floorSize, floorSize));
    const floorMesh = new THREE.Mesh(floorGeo, mats.deckFloorMat);
    floorMesh.rotation.x = -Math.PI * 0.5;
    floorMesh.receiveShadow = true;
    this.root.add(floorMesh);

    this.collisionWorld.addBox(-34, -1.0, -34, 34, 0.0, 34, 'floor');

    // Low octagonal Reactor Core Containment Pedestal (R=6.0m, y=0.20m)
    const daisR = 6.0;
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
          bevelSize: 0.12,
          bevelSegments: 2,
        }),
        0.18,
        0.18
      )
    );
    daisGeo.rotateX(-Math.PI * 0.5);
    const daisMesh = new THREE.Mesh(daisGeo, mats.hullArmorMat);
    daisMesh.receiveShadow = true;
    this.root.add(daisMesh);

    this.collisionWorld.addBox(-4.24, 0, -4.24, 4.24, 0.2, 4.24, 'platform');
    this.collisionWorld.addBox(-5.54, 0, -2.3, 5.54, 0.2, 2.3, 'platform');
    this.collisionWorld.addBox(-2.3, 0, -5.54, 2.3, 0.2, 5.54, 'platform');

    const collarGeo = this._trackGeo(new THREE.RingGeometry(4.2, 4.95, 8));
    const collar = new THREE.Mesh(collarGeo, mats.darkIronMat);
    collar.rotation.x = -Math.PI * 0.5;
    collar.rotation.z = Math.PI / 8;
    collar.position.y = 0.205;
    this.root.add(collar);

    const emberRingGeo = this._trackGeo(new THREE.RingGeometry(2.4, 2.75, 16));
    const emberRing = new THREE.Mesh(emberRingGeo, mats.keelEmberMat);
    emberRing.rotation.x = -Math.PI * 0.5;
    emberRing.position.y = 0.207;
    this.root.add(emberRing);
  }

  _buildPerimeterWalls(mats, innerBound, wallH) {
    const wallThick = 1.5;
    const wallSpan = innerBound * 2 + wallThick * 2;
    const wallGeoX = this._trackGeo(scaleBoxUVs(new THREE.BoxGeometry(wallSpan, wallH, wallThick), wallSpan, wallH, wallThick, 6.4, 5.5));
    const wallGeoZ = this._trackGeo(scaleBoxUVs(new THREE.BoxGeometry(wallThick, wallH, wallSpan), wallThick, wallH, wallSpan, 6.4, 5.5));

    const defs = [
      { geo: wallGeoX, pos: [0, wallH * 0.5, -(innerBound + wallThick * 0.5)], box: [-innerBound - wallThick, 0, -innerBound - wallThick, innerBound + wallThick, wallH + 4, -innerBound] },
      { geo: wallGeoX, pos: [0, wallH * 0.5, innerBound + wallThick * 0.5], box: [-innerBound - wallThick, 0, innerBound, innerBound + wallThick, wallH + 4, innerBound + wallThick] },
      { geo: wallGeoZ, pos: [-(innerBound + wallThick * 0.5), wallH * 0.5, 0], box: [-innerBound - wallThick, 0, -innerBound, -innerBound, wallH + 4, innerBound] },
      { geo: wallGeoZ, pos: [innerBound + wallThick * 0.5, wallH * 0.5, 0], box: [innerBound, 0, -innerBound, innerBound + wallThick, wallH + 4, innerBound] },
    ];
    for (let i = 0; i < defs.length; i++) {
      const w = new THREE.Mesh(defs[i].geo, mats.bulkheadWallMat);
      w.position.set(defs[i].pos[0], defs[i].pos[1], defs[i].pos[2]);
      w.receiveShadow = true;
      this.root.add(w);
      const b = defs[i].box;
      this.collisionWorld.addBox(b[0], b[1], b[2], b[3], b[4], b[5], 'wall');
    }

    const upperRibGeo = this._trackGeo(scaleBoxUVs(new THREE.BoxGeometry(0.6, 5.0, 0.78), 0.6, 5.0, 0.78, 1.8, 1.8));
    const offsets = [-24, -16, -8, 8, 16, 24];
    const ribInst = new THREE.InstancedMesh(upperRibGeo, mats.darkIronMat, offsets.length * 4);
    const dummy = new THREE.Object3D();
    let idx = 0;
    for (let side = 0; side < 4; side++) {
      for (let i = 0; i < offsets.length; i++) {
        const off = offsets[i];
        if (side === 0) {
          dummy.position.set(-innerBound + 0.25, 8.6, off);
          dummy.rotation.set(0, 0, 0);
        } else if (side === 1) {
          dummy.position.set(innerBound - 0.25, 8.6, off);
          dummy.rotation.set(0, Math.PI, 0);
        } else if (side === 2) {
          dummy.position.set(off, 8.6, -innerBound + 0.25);
          dummy.rotation.set(0, -Math.PI * 0.5, 0);
        } else {
          dummy.position.set(off, 8.6, innerBound - 0.25);
          dummy.rotation.set(0, Math.PI * 0.5, 0);
        }
        dummy.updateMatrix();
        ribInst.setMatrixAt(idx++, dummy.matrix);
      }
    }
    ribInst.instanceMatrix.needsUpdate = true;
    this.root.add(ribInst);
  }

  _buildSectorSignboards(mats, innerBound) {
    const configs = [
      { title: 'REACTOR BAY', subtitle: 'THRUSTER CORE // SECTOR-74', accent: '#f09d38', pos: [0, 8.3, -(innerBound - 0.36)], rotY: 0 },
      { title: 'COOLANT DECK', subtitle: 'PROPULSION ENTRY // SOUTH', accent: '#e05814', pos: [0, 8.3, innerBound - 0.36], rotY: Math.PI },
      { title: 'PORT RADIATOR', subtitle: 'TERRACE DECK +3.6M', accent: '#f09d38', pos: [-(innerBound - 0.36), 8.3, 0], rotY: Math.PI * 0.5 },
      { title: 'STARBOARD RADIATOR', subtitle: 'TERRACE DECK +3.6M', accent: '#f09d38', pos: [innerBound - 0.36, 8.3, 0], rotY: -Math.PI * 0.5 },
    ];
    const screenW = 5.6;
    const screenH = 3.2;
    const bezelGeo = this._trackGeo(scaleBoxUVs(new THREE.BoxGeometry(screenW + 0.5, screenH + 0.5, 0.24), screenW + 0.5, screenH + 0.5, 0.24, 2.0, 2.0));
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
          roughness: 0.5,
          metalness: 0.28,
        })
      );
      const g = new THREE.Group();
      g.position.set(cfg.pos[0], cfg.pos[1], cfg.pos[2]);
      g.rotation.y = cfg.rotY;
      const bezel = new THREE.Mesh(bezelGeo, mats.darkIronMat);
      bezel.position.z = -0.14;
      const board = new THREE.Mesh(boardGeo, boardMat);
      board.position.z = 0.02;
      g.add(bezel, board);
      this.root.add(g);
    }
  }

  _buildTerracesAndRamps(mats, innerBound) {
    const deckY = 3.6;
    const deckThick = 0.4;

    const platformSpecs = [
      { minX: -innerBound, maxX: -19.5, minZ: -innerBound, maxZ: -19.5, fasciaSide: 'south' },
      { minX: 19.5, maxX: innerBound, minZ: -innerBound, maxZ: -19.5, fasciaSide: 'south' },
      { minX: -innerBound, maxX: -19.5, minZ: 19.5, maxZ: innerBound, fasciaSide: 'north' },
      { minX: 19.5, maxX: innerBound, minZ: 19.5, maxZ: innerBound, fasciaSide: 'north' },
      { minX: -innerBound, maxX: -25.5, minZ: -19.5, maxZ: 19.5, fasciaSide: 'east' },
      { minX: 25.5, maxX: innerBound, minZ: -19.5, maxZ: 19.5, fasciaSide: 'west' },
      { minX: -19.5, maxX: 19.5, minZ: -innerBound, maxZ: -25.5, fasciaSide: 'south' },
    ];

    for (let i = 0; i < platformSpecs.length; i++) {
      const p = platformSpecs[i];
      const w = p.maxX - p.minX;
      const d = p.maxZ - p.minZ;
      const cx = (p.minX + p.maxX) * 0.5;
      const cz = (p.minZ + p.maxZ) * 0.5;
      const isZEdge = p.fasciaSide === 'south' || p.fasciaSide === 'north';

      const hullGeo = this._trackGeo(scaleBoxUVs(new THREE.BoxGeometry(w - 0.04, deckThick - 0.08, d - 0.04), w - 0.04, deckThick - 0.08, d - 0.04, 2.4, 2.4));
      const hull = new THREE.Mesh(hullGeo, mats.darkIronMat);
      hull.position.set(cx, deckY - deckThick * 0.5 - 0.02, cz);
      hull.castShadow = true;
      hull.receiveShadow = true;
      this.root.add(hull);

      const topGeo = this._trackGeo(scaleBoxUVs(new THREE.BoxGeometry(w - 0.08, 0.06, d - 0.08), w - 0.08, 0.06, d - 0.08, 2.2, 2.2));
      const topPlate = new THREE.Mesh(topGeo, mats.catwalkMat);
      topPlate.position.set(cx, deckY - 0.03, cz);
      topPlate.receiveShadow = true;
      this.root.add(topPlate);

      const fw = isZEdge ? w : 0.06;
      const fd = isZEdge ? 0.06 : d;
      const fasciaGeo = this._trackGeo(scaleBoxUVs(new THREE.BoxGeometry(fw, 0.24, fd), fw, 0.24, fd, 1.2, 0.24));
      const trimGeo = this._trackGeo(new THREE.BoxGeometry(isZEdge ? w : 0.07, 0.05, isZEdge ? 0.07 : d));
      const fascia = new THREE.Mesh(fasciaGeo, mats.hazardMat);
      const trim = new THREE.Mesh(trimGeo, mats.tungstenAmberMat);

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

    // Support piers
    const pierCoords = [
      [-19.8, -19.8], [19.8, -19.8], [-19.8, 19.8], [19.8, 19.8],
      [-25.8, -8.5], [-25.8, 8.5], [25.8, -8.5], [25.8, 8.5],
      [-7.5, -25.8], [7.5, -25.8],
    ];
    const pierGeo = this._trackGeo(scaleBoxUVs(new THREE.BoxGeometry(0.62, deckY - deckThick, 0.62), 0.62, deckY - deckThick, 0.62, 1.8, 1.8));
    const pierInst = new THREE.InstancedMesh(pierGeo, mats.darkIronMat, pierCoords.length);
    pierInst.castShadow = true;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < pierCoords.length; i++) {
      const [px, pz] = pierCoords[i];
      dummy.position.set(px, (deckY - deckThick) * 0.5, pz);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      pierInst.setMatrixAt(i, dummy.matrix);
      this.collisionWorld.addBox(px - 0.31, 0, pz - 0.31, px + 0.31, deckY - deckThick, pz + 0.31, 'pillar');
    }
    pierInst.instanceMatrix.needsUpdate = true;
    this.root.add(pierInst);

    // Terrace Half-Cover Shields (y = 3.60..4.64m)
    const shieldH = 1.04;
    const shieldSpecs = [
      { cx: -21.5, cz: -19.8, len: 3.4, rotY: 0 },
      { cx: 21.5, cz: -19.8, len: 3.4, rotY: 0 },
      { cx: -21.5, cz: 19.8, len: 3.4, rotY: 0 },
      { cx: 21.5, cz: 19.8, len: 3.4, rotY: 0 },
      { cx: 0.0, cz: -25.8, len: 5.2, rotY: 0 },
    ];
    for (let i = 0; i < shieldSpecs.length; i++) {
      const s = shieldSpecs[i];
      const geo = this._trackGeo(scaleBoxUVs(new THREE.BoxGeometry(s.len, shieldH, 0.38), s.len, shieldH, 0.38, 1.8, 1.8));
      const m = new THREE.Mesh(geo, mats.hullArmorMat);
      m.position.set(s.cx, deckY + shieldH * 0.5, s.cz);
      m.castShadow = true;
      this.root.add(m);
      this.collisionWorld.addBox(s.cx - s.len * 0.5, deckY, s.cz - 0.19, s.cx + s.len * 0.5, deckY + shieldH, s.cz + 0.19, 'cover');
    }

    // 4 Wide Stepped Steel Ramps (12 steps x 0.30m rise = 3.60m, stepDepth = 0.70m, runLen = 8.40m)
    const stepCount = 12;
    const stepRise = deckY / stepCount;
    const stepDepth = 0.7;
    const rampWidth = 3.6;
    const runLen = stepCount * stepDepth;

    const stepGeo = this._trackGeo(scaleBoxUVs(new THREE.BoxGeometry(rampWidth, 0.32, stepDepth), rampWidth, 0.32, stepDepth, 1.8, 1.8));
    const stepLipGeo = this._trackGeo(new THREE.BoxGeometry(rampWidth - 0.24, 0.05, 0.08));
    const totalSteps = stepCount * 4;
    const stepInst = new THREE.InstancedMesh(stepGeo, mats.stepMat, totalSteps);
    stepInst.castShadow = true;
    stepInst.receiveShadow = true;
    const stepLipInst = new THREE.InstancedMesh(stepLipGeo, mats.tungstenAmberMat, totalSteps);

    const stringerShape = new THREE.Shape();
    stringerShape.moveTo(0, 0);
    stringerShape.lineTo(runLen, deckY - 0.36);
    stringerShape.lineTo(runLen, deckY + 0.12);
    stringerShape.lineTo(0, 0.38);
    stringerShape.closePath();
    const stringerGeo = this._trackGeo(scaleGeometryUVs(new THREE.ExtrudeGeometry(stringerShape, { depth: 0.22, bevelEnabled: false }), 0.25, 0.25));
    stringerGeo.translate(0, 0, -0.11);

    const plinthShape = new THREE.Shape();
    plinthShape.moveTo(0, 0);
    plinthShape.lineTo(stepDepth * 7, 0);
    plinthShape.lineTo(stepDepth * 7, stepRise * 7 - 0.04);
    plinthShape.lineTo(0, 0.08);
    plinthShape.closePath();
    const plinthGeo = this._trackGeo(scaleGeometryUVs(new THREE.ExtrudeGeometry(plinthShape, { depth: rampWidth - 0.08, bevelEnabled: false }), 0.8, 0.8));
    plinthGeo.translate(0, 0, -(rampWidth - 0.08) * 0.5);

    const rampConfigs = [
      { cx: -22.5, zStart: -11.1, dirZ: -1 },
      { cx: 22.5, zStart: -11.1, dirZ: -1 },
      { cx: -22.5, zStart: 11.1, dirZ: 1 },
      { cx: 22.5, zStart: 11.1, dirZ: 1 },
    ];

    let sIdx = 0;
    for (let r = 0; r < rampConfigs.length; r++) {
      const rc = rampConfigs[r];
      const rotY = rc.dirZ < 0 ? Math.PI * 0.5 : -Math.PI * 0.5;
      for (const sideOff of [-rampWidth * 0.5 - 0.04, rampWidth * 0.5 + 0.04]) {
        const str = new THREE.Mesh(stringerGeo, mats.darkIronMat);
        str.position.set(rc.cx + sideOff, 0, rc.zStart);
        str.rotation.y = rotY;
        str.castShadow = true;
        this.root.add(str);
      }
      const plinth = new THREE.Mesh(plinthGeo, mats.hazardMat);
      plinth.position.set(rc.cx, 0, rc.zStart);
      plinth.rotation.y = rotY;
      plinth.receiveShadow = true;
      this.root.add(plinth);

      for (let i = 0; i < stepCount; i++) {
        const topY = (i + 1) * stepRise;
        const zCenter = rc.zStart + rc.dirZ * (i + 0.5) * stepDepth;
        dummy.position.set(rc.cx, topY - 0.16, zCenter);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        stepInst.setMatrixAt(sIdx, dummy.matrix);

        dummy.position.set(rc.cx, topY - 0.02, zCenter - rc.dirZ * (stepDepth * 0.5 - 0.04));
        dummy.updateMatrix();
        stepLipInst.setMatrixAt(sIdx, dummy.matrix);
        sIdx++;

        const colMinY = i < 7 ? 0.0 : topY - 0.42;
        this.collisionWorld.addBox(rc.cx - rampWidth * 0.5, colMinY, zCenter - stepDepth * 0.5, rc.cx + rampWidth * 0.5, topY, zCenter + stepDepth * 0.5, 'ramp');
      }
    }
    stepInst.instanceMatrix.needsUpdate = true;
    stepLipInst.instanceMatrix.needsUpdate = true;
    this.root.add(stepInst, stepLipInst);
  }

  _buildHeatSinksAndBlastBaffles(mats) {
    // 4 Heavy Heat-Sink Monoliths at (±13.5, ±13.5)
    const pylonGeo = this._trackGeo(scaleBoxUVs(new THREE.BoxGeometry(2.0, 4.2, 2.0), 2.0, 4.2, 2.0, 1.8, 1.8));
    const finGeo = this._trackGeo(scaleBoxUVs(new THREE.BoxGeometry(2.3, 0.22, 2.3), 2.3, 0.22, 2.3, 1.6, 1.6));
    const coords = [
      [-13.5, -13.5], [13.5, -13.5], [-13.5, 13.5], [13.5, 13.5],
    ];
    const pylonInst = new THREE.InstancedMesh(pylonGeo, mats.hullArmorMat, coords.length);
    pylonInst.castShadow = true;
    pylonInst.receiveShadow = true;
    const finInst = new THREE.InstancedMesh(finGeo, mats.darkIronMat, coords.length * 3);
    const dummy = new THREE.Object3D();
    let fIdx = 0;

    for (let i = 0; i < coords.length; i++) {
      const [px, pz] = coords[i];
      dummy.position.set(px, 2.1, pz);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      pylonInst.setMatrixAt(i, dummy.matrix);

      for (const fy of [1.2, 2.4, 3.6]) {
        dummy.position.set(px, fy, pz);
        dummy.updateMatrix();
        finInst.setMatrixAt(fIdx++, dummy.matrix);
      }
      this.collisionWorld.addBox(px - 1.0, 0, pz - 1.0, px + 1.0, 4.2, pz + 1.0, 'pillar');
    }
    pylonInst.instanceMatrix.needsUpdate = true;
    finInst.instanceMatrix.needsUpdate = true;
    this.root.add(pylonInst, finInst);

    // 6 Angled Armored Blast-Deflector Baffle Covers
    const baffleSpecs = [
      { cx: -11.5, cz: -6.5, tilt: 0.28 },
      { cx: 11.5, cz: -6.5, tilt: -0.28 },
      { cx: -11.5, cz: 6.5, tilt: 0.25 },
      { cx: 11.5, cz: 6.5, tilt: -0.25 },
      { cx: -6.5, cz: 16.5, tilt: 0.22 },
      { cx: 6.5, cz: 16.5, tilt: -0.22 },
    ];
    const baseGeo = this._trackGeo(scaleBoxUVs(new THREE.BoxGeometry(3.0, 1.1, 0.88), 3.0, 1.1, 0.88, 1.6, 1.1));
    const shieldGeo = this._trackGeo(scaleBoxUVs(new THREE.BoxGeometry(2.9, 0.14, 1.25), 2.9, 0.14, 1.25, 1.6, 1.2));

    const baseInst = new THREE.InstancedMesh(baseGeo, mats.darkIronMat, baffleSpecs.length);
    baseInst.castShadow = true;
    baseInst.receiveShadow = true;
    const shieldInst = new THREE.InstancedMesh(shieldGeo, mats.baffleShieldMat, baffleSpecs.length);
    shieldInst.castShadow = true;

    for (let i = 0; i < baffleSpecs.length; i++) {
      const m = baffleSpecs[i];
      dummy.position.set(m.cx, 0.55, m.cz);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      baseInst.setMatrixAt(i, dummy.matrix);

      dummy.position.set(m.cx, 1.22, m.cz);
      dummy.rotation.set(m.tilt, 0, 0);
      dummy.updateMatrix();
      shieldInst.setMatrixAt(i, dummy.matrix);

      this.collisionWorld.addBox(m.cx - 1.5, 0, m.cz - 0.45, m.cx + 1.5, 1.32, m.cz + 0.45, 'cover');
    }
    baseInst.instanceMatrix.needsUpdate = true;
    shieldInst.instanceMatrix.needsUpdate = true;
    this.root.add(baseInst, shieldInst);
  }

  _createReactorSkyTexture() {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 256;
    const ctx = c.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0.0, '#070212');
    grad.addColorStop(0.42, '#170830');
    grad.addColorStop(0.75, '#2b0f4d');
    grad.addColorStop(1.0, '#0e051c');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 256);
    // Violet-cyan cosmic nebula glow
    const neb1 = ctx.createRadialGradient(160, 110, 10, 160, 110, 120);
    neb1.addColorStop(0, 'rgba(192,132,252,0.42)');
    neb1.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = neb1;
    ctx.fillRect(0, 0, 512, 256);
    const neb2 = ctx.createRadialGradient(360, 130, 10, 360, 130, 110);
    neb2.addColorStop(0, 'rgba(34,211,238,0.30)');
    neb2.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = neb2;
    ctx.fillRect(0, 0, 512, 256);
    const rng = createRng(74074);
    for (let i = 0; i < 380; i++) {
      const x = rng() * 512;
      const y = rng() * 210;
      const r = rng() < 0.16 ? 1.5 : 0.85;
      ctx.fillStyle = rng() < 0.35 ? 'rgba(232,121,249,0.88)' : 'rgba(224,242,254,0.85)';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  _buildThrusterSpireVista(mats, innerBound) {
    // 1. Deep Cosmic Violet-Cyan Nebula Sky Dome
    const skyTex = this._createReactorSkyTexture();
    const skyGeo = this._trackGeo(new THREE.SphereGeometry(195, 28, 18));
    const skyMat = this._trackMat(new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false }));
    this.root.add(new THREE.Mesh(skyGeo, skyMat));

    const plasmaBeamMat = this._trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xd946ef,
        transparent: true,
        opacity: 0.38,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    const coolantGlowMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x22d3ee,
        emissive: new THREE.Color(0x06b6d4),
        emissiveIntensity: 2.2,
        transparent: true,
        opacity: 0.72,
      })
    );

    // 2. Colossal Overhead Central Plasma Containment Core Suspended at (0, 12.5, 0)
    const coreHub = new THREE.Group();
    coreHub.position.set(0, 12.5, 0);

    const beamGeo = this._trackGeo(new THREE.CylinderGeometry(1.6, 2.2, 34, 16, 1, true));
    const beamMesh = new THREE.Mesh(beamGeo, plasmaBeamMat);
    beamMesh.position.y = 14;
    coreHub.add(beamMesh);

    const innerCoreGeo = this._trackGeo(new THREE.OctahedronGeometry(2.4, 1));
    const innerCore = new THREE.Mesh(innerCoreGeo, mats.tungstenAmberMat);
    coreHub.add(innerCore);

    // 4 Heavy Armored Vertical Containment Struts & Layered Accelerator Coils around Central Core
    const strutGeo = this._trackGeo(new THREE.BoxGeometry(0.75, 11.5, 1.1));
    for (let s = 0; s < 4; s++) {
      const ang = (s / 4) * Math.PI * 2 + Math.PI / 4;
      const strut = new THREE.Mesh(strutGeo, mats.darkIronMat);
      strut.position.set(Math.cos(ang) * 4.4, 2.5, Math.sin(ang) * 4.4);
      strut.rotation.y = -ang;
      coreHub.add(strut);
    }
    const coilGeo = this._trackGeo(new THREE.TorusGeometry(3.4, 0.22, 8, 28));
    coilGeo.rotateX(Math.PI * 0.5);
    for (const cy of [-2.4, 2.6, 5.8]) {
      const coil = new THREE.Mesh(coilGeo, mats.keelEmberMat);
      coil.position.y = cy;
      coreHub.add(coil);
    }

    const ringAGeo = this._trackGeo(new THREE.TorusGeometry(6.8, 0.34, 10, 36));
    ringAGeo.rotateX(Math.PI * 0.5);
    this._containmentRingA = new THREE.Mesh(ringAGeo, mats.tungstenAmberMat);
    coreHub.add(this._containmentRingA);

    const ringBGeo = this._trackGeo(new THREE.TorusGeometry(9.4, 0.28, 10, 40));
    ringBGeo.rotateX(Math.PI * 0.5);
    this._containmentRingB = new THREE.Mesh(ringBGeo, mats.keelEmberMat);
    coreHub.add(this._containmentRingB);
    this.root.add(coreHub);

    // 3. Radial Glowing Floor Plasma Conduits Connecting Center to Perimeter Coolant Pillars
    const spokeGeo = this._trackGeo(new THREE.PlaneGeometry(0.65, innerBound * 0.85));
    spokeGeo.rotateX(-Math.PI * 0.5);
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      const spoke = new THREE.Mesh(spokeGeo, i % 2 === 0 ? mats.tungstenAmberMat : mats.keelEmberMat);
      spoke.position.set(Math.sin(ang) * innerBound * 0.48, 0.04, Math.cos(ang) * innerBound * 0.48);
      spoke.rotation.y = ang;
      this.root.add(spoke);
    }

    // 4. Eight Towering Crystalline Plasma Coolant Columns Around the Chamber Perimeter
    const colTubeGeo = this._trackGeo(new THREE.CylinderGeometry(1.15, 1.15, 18, 12));
    const colRingGeo = this._trackGeo(new THREE.TorusGeometry(1.55, 0.16, 8, 18));
    colRingGeo.rotateX(Math.PI * 0.5);
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const px = Math.cos(ang) * (innerBound + 4.5);
      const pz = Math.sin(ang) * (innerBound + 4.5);
      const tube = new THREE.Mesh(colTubeGeo, i % 2 === 0 ? coolantGlowMat : plasmaBeamMat);
      tube.position.set(px, 11.5, pz);
      this.root.add(tube);
      for (const ry of [6.5, 11.5, 16.5]) {
        const cRing = new THREE.Mesh(colRingGeo, mats.hullArmorMat);
        cRing.position.set(px, ry, pz);
        this.root.add(cRing);
      }
    }

    // 5. Overhead Diagonal Energy-Conduit Gantries Linking Perimeter to Central Core
    const diagGeo = this._trackGeo(new THREE.CylinderGeometry(0.32, 0.32, 34, 8));
    for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const pipe = new THREE.Mesh(diagGeo, mats.hullArmorMat);
      pipe.position.set(Math.cos(ang) * 15, 12.8, Math.sin(ang) * 15);
      pipe.rotation.z = Math.PI * 0.5;
      pipe.rotation.y = -ang;
      this.root.add(pipe);
    }
  }

  _buildLighting() {
    this.scene.background = new THREE.Color(0x6ebcf7);
    this.scene.fog = new THREE.FogExp2(0xcce4fc, 0.0032);

    this._hemiLight = new THREE.HemisphereLight(0xd2e4ff, 0x949cb8, 0.85);
    this._hemiLight.position.set(0, 34, 0);
    this.root.add(this._hemiLight);
    this._lights.push(this._hemiLight);

    this._dirLight = new THREE.DirectionalLight(0xfff6e6, 1.92);
    this._dirLight.position.set(30, 44, -22);
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

    // Strictly <= 2 PointLights
    const coreReactor = new THREE.PointLight(0x818cf8, 22, 34, 1.4);
    coreReactor.position.set(0, 2.2, 0);
    coreReactor.castShadow = false;
    this.root.add(coreReactor);
    this._accentLights.push(coreReactor);
    this._lights.push(coreReactor);
    this._coreReactorLight = coreReactor;

    const spireLight = new THREE.PointLight(0x38bdf8, 20, 38, 1.4);
    spireLight.position.set(0, 10.0, -18);
    spireLight.castShadow = false;
    this.root.add(spireLight);
    this._accentLights.push(spireLight);
    this._lights.push(spireLight);
    this._spireGlowLight = spireLight;
  }

  update(dt, elapsedTime) {
    if (!this._built) return;
    const t = Number.isFinite(elapsedTime) ? elapsedTime : 0;
    const safeDt = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.1) : 0;

    if (this._containmentRingA) {
      this._containmentRingA.rotation.y += safeDt * 0.42;
      this._containmentRingA.rotation.z = Math.sin(t * 0.5) * 0.1;
    }
    if (this._containmentRingB) {
      this._containmentRingB.rotation.y -= safeDt * 0.68;
      this._containmentRingB.rotation.x = Math.cos(t * 0.65) * 0.12;
    }
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.3);
    if (this._tungstenAmberMat) {
      this._tungstenAmberMat.emissiveIntensity = 1.05 + pulse * 0.45;
    }
    if (this._keelEmberMat) {
      this._keelEmberMat.emissiveIntensity = 1.15 + pulse * 0.45;
    }
    if (this._coreReactorLight && this._coreReactorLight.visible) {
      this._coreReactorLight.intensity = 22 + pulse * 8;
    }
    if (this._distantBeaconMat) {
      const blink = Math.sin(t * 2.5) > 0.2 ? 1.0 : 0.25;
      this._distantBeaconMat.color.setRGB(0.90 * blink, 0.35 * blink, 1.0 * blink);
    }
  }

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
    this._coreReactorLight = null;
    this._spireGlowLight = null;
    this._tungstenAmberMat = null;
    this._keelEmberMat = null;
    this._containmentRingA = null;
    this._containmentRingB = null;
    this._distantBeaconMat = null;

    if (this._ownsTexGen && this._texGen) {
      this._texGen.dispose();
    }
    this._built = false;
  }
}
  __exports.Map5AegisReactorBayBuilder = Map5AegisReactorBayBuilder;
});
