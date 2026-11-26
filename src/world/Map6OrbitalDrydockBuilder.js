// Module: src/world/Map6OrbitalDrydockBuilder.js
__define("src/world/Map6OrbitalDrydockBuilder.js", (__exports, __require) => {
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
 * Map 6 Builder — "SECTOR-99 // AEGIS DRYDOCK"
 * Charcoal-gunmetal & tungsten-amber derelict orbital warship drydock & keel cradle.
 * Features riveted warship floor plates, wrap-around y=4.2m shipyard gantry catwalks,
 * overhead gantry crane bridges (y >= 8.6m), 4 wide stepped ramps (0.30m/step),
 * 4 jump pads, and a colossal derelict dreadnought hull skeleton beyond the North wall.
 */
class Map6OrbitalDrydockBuilder {
  constructor(scene, collisionWorld, qualityConfig = {}, sharedTexGen = null) {
    this.scene = scene;
    this.collisionWorld = collisionWorld;
    this.qualityConfig = qualityConfig || {};

    this._ownsTexGen = !sharedTexGen;
    this._texGen = sharedTexGen || new TextureGenerator(4);

    this.root = new THREE.Group();
    this.root.name = 'ArenaRoot_SECTOR99_AegisDrydock';

    this._geometries = [];
    this._materials = [];
    this._lights = [];
    this._accentLights = [];
    this._dirLight = null;
    this._hemiLight = null;

    this._tungstenAmberMat = null;
    this._keelEmberMat = null;
    this._radarDish = null;
    this._radarRing = null;
    this._distantBeaconMat = null;
    this._keelLight = null;
    this._gantryLight = null;

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
    this.root.name = 'ArenaRoot_SECTOR99_AegisDrydock';
    this.scene.add(this.root);

    const half = ARENA_CONFIG.halfSize; // 32
    const innerBound = half - 0.5; // 31.5
    const wallH = ARENA_CONFIG.wallHeight; // 11

    this.collisionWorld.setArenaBounds(-innerBound, innerBound, -innerBound, innerBound, 0, 28);

    const mats = this._createMaterials();
    this._buildDrydockFloorAndTurntable(mats, innerBound);
    this._buildPerimeterWalls(mats, innerBound, wallH);
    this._buildSectorSignboards(mats, innerBound);
    this._buildGantriesAndRamps(mats, innerBound);
    this._buildKeelButtressesAndBulkheads(mats);
    this._buildCranesDreadnoughtAndSkyDome(mats, innerBound);
    this._buildLighting();
    this.setQuality(this.qualityConfig);

    // Jump pad calibration: deckY = 4.2m, g = 26 m/s^2, Vh = 11.0 m/s, Vy = 17.6 m/s
    // Peak y = 5.96m, descending landing at y = 4.2m occurs at t = 1.0445s -> d = 11.49m.
    return {
      mapId: 'aegis_drydock',
      mapIndex: 5,
      mapCode: 'SEC-99',
      mapName: 'SECTOR-99 // STRATOSPHERE HALO',
      mapSubtitle: 'ORBITAL COMMAND CITADEL — FINAL BOSS',
      atmosphere: {
        bgColor: 0x4ea6f2,
        fogColor: 0xbadffc,
        fogDensity: 0.0028,
      },
      playerSpawn: {
        pos: new THREE.Vector3(0, 0.05, 22.8),
        yaw: 0,
      },
      enemySpawns: [
        { pos: new THREE.Vector3(0.0, 0.05, -18.5), isElevated: false },
        { pos: new THREE.Vector3(-4.2, 0.05, -19.5), isElevated: false },
        { pos: new THREE.Vector3(4.2, 0.05, -19.5), isElevated: false },
        { pos: new THREE.Vector3(0.0, 0.05, -8.5), isElevated: false },
        { pos: new THREE.Vector3(-18.5, 0.05, -7.5), isElevated: false },
        { pos: new THREE.Vector3(18.5, 0.05, -7.5), isElevated: false },
        { pos: new THREE.Vector3(-18.5, 0.05, 7.5), isElevated: false },
        { pos: new THREE.Vector3(18.5, 0.05, 7.5), isElevated: false },
        { pos: new THREE.Vector3(-28.0, 4.25, -12.0), isElevated: true },
        { pos: new THREE.Vector3(28.0, 4.25, -12.0), isElevated: true },
        { pos: new THREE.Vector3(-28.0, 4.25, 12.0), isElevated: true },
        { pos: new THREE.Vector3(28.0, 4.25, 12.0), isElevated: true },
      ],
      pickupSpawns: [
        { pos: new THREE.Vector3(-24.0, 4.20, 0.0), type: 'shield' },
        { pos: new THREE.Vector3(24.0, 4.20, 0.0), type: 'health' },
        { pos: new THREE.Vector3(0.0, 4.20, -24.0), type: 'ammo' },
        { pos: new THREE.Vector3(-28.5, 0.0, 0.0), type: 'ammo' },
        { pos: new THREE.Vector3(28.5, 0.0, 0.0), type: 'shield' },
        { pos: new THREE.Vector3(0.0, 0.0, 15.5), type: 'health' },
      ],
      barrelSpawns: [
        new THREE.Vector3(-8.0, 0.0, 0.0),
        new THREE.Vector3(8.0, 0.0, 0.0),
        new THREE.Vector3(-3.0, 0.0, -13.0),
        new THREE.Vector3(3.0, 0.0, -13.0),
        new THREE.Vector3(-15.5, 0.0, 9.5),
        new THREE.Vector3(15.5, 0.0, 9.5),
      ],
      jumpPadSpawns: [
        { pos: new THREE.Vector3(-13.5, 0.0, -17.0), launchVy: 17.6, launchDirX: 0, launchDirZ: -1 },
        { pos: new THREE.Vector3(13.5, 0.0, -17.0), launchVy: 17.6, launchDirX: 0, launchDirZ: -1 },
        { pos: new THREE.Vector3(-13.5, 0.0, 17.0), launchVy: 17.6, launchDirX: 0, launchDirZ: 1 },
        { pos: new THREE.Vector3(13.5, 0.0, 17.0), launchVy: 17.6, launchDirX: 0, launchDirZ: 1 },
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
    const floorTex = this._texGen.getDrydockFloorTextures(14, 14);
    const concreteTex = this._texGen.getWallTextures(1, 1);
    const catwalkTex = this._texGen.getCatwalkTextures(1, 1);
    const rustTex = this._texGen.getRustMetalTextures(1, 1);
    const hazardTex = this._texGen.getHazardTextures(1, 1);
    const ruinedSkyTex = this._texGen.getRuinedSkylineTextures();

    const drydockFloorMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xf2f7fc,
        map: floorTex.map,
        roughnessMap: floorTex.roughnessMap,
        bumpMap: floorTex.bumpMap,
        bumpScale: 0.038,
        metalness: 0.28,
        roughness: 0.48,
      })
    );

    const bulkheadWallMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xedf4fc,
        map: concreteTex.map,
        roughnessMap: concreteTex.roughnessMap,
        bumpMap: concreteTex.bumpMap,
        bumpScale: 0.045,
        metalness: 0.24,
        roughness: 0.52,
      })
    );

    const hullArmorMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xfde68a,
        map: rustTex.map,
        roughnessMap: rustTex.roughnessMap,
        bumpMap: rustTex.bumpMap,
        bumpScale: 0.035,
        metalness: 0.44,
        roughness: 0.36,
      })
    );

    const darkIronMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x9ab3cc,
        roughnessMap: rustTex.roughnessMap,
        bumpMap: rustTex.bumpMap,
        bumpScale: 0.03,
        metalness: 0.48,
        roughness: 0.38,
      })
    );

    const catwalkMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xe6f1fc,
        map: catwalkTex.map,
        roughnessMap: catwalkTex.roughnessMap,
        bumpMap: catwalkTex.bumpMap,
        bumpScale: 0.035,
        metalness: 0.38,
        roughness: 0.42,
      })
    );

    const stepMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xdbeafe,
        map: catwalkTex.map,
        roughnessMap: catwalkTex.roughnessMap,
        bumpMap: catwalkTex.bumpMap,
        bumpScale: 0.035,
        metalness: 0.36,
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
        color: 0xfbbf24,
        emissive: new THREE.Color(0xf59e0b),
        emissiveIntensity: 1.15,
        roughness: 0.3,
        metalness: 0.22,
      })
    );

    const keelEmberMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: new THREE.Color(0x0ea5e9),
        emissiveIntensity: 1.2,
        roughness: 0.32,
        metalness: 0.15,
      })
    );

    const ruinedSkylineMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xf4f9ff,
        map: ruinedSkyTex.map,
        roughnessMap: ruinedSkyTex.roughnessMap,
        roughness: 0.48,
        metalness: 0.18,
      })
    );

    const distantBeaconMat = this._trackMat(
      new THREE.MeshBasicMaterial({
        color: 0x0ea5e9,
      })
    );

    this._tungstenAmberMat = tungstenAmberMat;
    this._keelEmberMat = keelEmberMat;
    this._distantBeaconMat = distantBeaconMat;

    return {
      drydockFloorMat,
      bulkheadWallMat,
      hullArmorMat,
      darkIronMat,
      catwalkMat,
      stepMat,
      hazardMat,
      tungstenAmberMat,
      keelEmberMat,
      ruinedSkylineMat,
      distantBeaconMat,
    };
  }

  _buildDrydockFloorAndTurntable(mats, innerBound) {
    const floorSize = innerBound * 2 + 2;
    const floorGeo = this._trackGeo(new THREE.PlaneGeometry(floorSize, floorSize));
    const floorMesh = new THREE.Mesh(floorGeo, mats.drydockFloorMat);
    floorMesh.rotation.x = -Math.PI * 0.5;
    floorMesh.receiveShadow = true;
    this.root.add(floorMesh);

    this.collisionWorld.addBox(-34, -1.0, -34, 34, 0.0, 34, 'floor');

    // Low octagonal Starship Keel Turntable (R=6.2m, y=0.20m)
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
    const daisMesh = new THREE.Mesh(daisGeo, mats.hullArmorMat);
    daisMesh.receiveShadow = true;
    this.root.add(daisMesh);

    this.collisionWorld.addBox(-4.38, 0, -4.38, 4.38, 0.2, 4.38, 'platform');
    this.collisionWorld.addBox(-5.72, 0, -2.37, 5.72, 0.2, 2.37, 'platform');
    this.collisionWorld.addBox(-2.37, 0, -5.72, 2.37, 0.2, 5.72, 'platform');

    const collarGeo = this._trackGeo(new THREE.RingGeometry(4.45, 5.2, 8));
    const collar = new THREE.Mesh(collarGeo, mats.darkIronMat);
    collar.rotation.x = -Math.PI * 0.5;
    collar.rotation.z = Math.PI / 8;
    collar.position.y = 0.205;
    this.root.add(collar);

    const emberRingGeo = this._trackGeo(new THREE.RingGeometry(2.55, 2.9, 16));
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
      { title: 'AEGIS DRYDOCK', subtitle: 'KEEL CRADLE // SECTOR-99', accent: '#f09d38', pos: [0, 8.3, -(innerBound - 0.36)], rotY: 0 },
      { title: 'AFT BULKHEAD', subtitle: 'ORBITAL BAY // SOUTH', accent: '#e05814', pos: [0, 8.3, innerBound - 0.36], rotY: Math.PI },
      { title: 'PORT GANTRY', subtitle: 'CATWALK LEVEL +4.2M', accent: '#f09d38', pos: [-(innerBound - 0.36), 8.3, 0], rotY: Math.PI * 0.5 },
      { title: 'STARBOARD GANTRY', subtitle: 'CATWALK LEVEL +4.2M', accent: '#f09d38', pos: [innerBound - 0.36, 8.3, 0], rotY: -Math.PI * 0.5 },
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

  _buildGantriesAndRamps(mats, innerBound) {
    const deckY = 4.2;
    const deckThick = 0.4;

    const platformSpecs = [
      { minX: -innerBound, maxX: innerBound, minZ: -innerBound, maxZ: -25.5, fasciaSide: 'south' },
      { minX: -innerBound, maxX: innerBound, minZ: 25.5, maxZ: innerBound, fasciaSide: 'north' },
      { minX: -innerBound, maxX: -25.5, minZ: -25.5, maxZ: 25.5, fasciaSide: 'east' },
      { minX: 25.5, maxX: innerBound, minZ: -25.5, maxZ: 25.5, fasciaSide: 'west' },
      { minX: -7.5, maxX: 7.5, minZ: -25.5, maxZ: -22.5, fasciaSide: 'south' },
      { minX: -25.5, maxX: -22.5, minZ: -7.5, maxZ: 7.5, fasciaSide: 'east' },
      { minX: 22.5, maxX: 25.5, minZ: -7.5, maxZ: 7.5, fasciaSide: 'west' },
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

    // Gantry Support Piers
    const pierCoords = [
      [-25.8, -25.8], [-17.5, -25.8], [-7.5, -25.8], [7.5, -25.8], [17.5, -25.8], [25.8, -25.8],
      [-25.8, 25.8], [-17.5, 25.8], [-7.5, 25.8], [7.5, 25.8], [17.5, 25.8], [25.8, 25.8],
      [-25.8, -7.5], [-25.8, 7.5], [25.8, -7.5], [25.8, 7.5],
    ];
    const pierGeo = this._trackGeo(scaleBoxUVs(new THREE.BoxGeometry(0.6, deckY - deckThick, 0.6), 0.6, deckY - deckThick, 0.6, 1.8, 1.8));
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
      this.collisionWorld.addBox(px - 0.3, 0, pz - 0.3, px + 0.3, deckY - deckThick, pz + 0.3, 'pillar');
    }
    pierInst.instanceMatrix.needsUpdate = true;
    this.root.add(pierInst);

    // Gantry Spur Half-Cover Shields (y = 4.20..5.26m)
    const shieldH = 1.06;
    const shieldThick = 0.38;
    const shieldSpecs = [
      { cx: -4.8, cz: -22.7, len: 3.8, rotY: 0 },
      { cx: 4.8, cz: -22.7, len: 3.8, rotY: 0 },
      { cx: -22.7, cz: -4.8, len: 3.8, rotY: Math.PI * 0.5 },
      { cx: -22.7, cz: 4.8, len: 3.8, rotY: Math.PI * 0.5 },
      { cx: 22.7, cz: -4.8, len: 3.8, rotY: Math.PI * 0.5 },
      { cx: 22.7, cz: 4.8, len: 3.8, rotY: Math.PI * 0.5 },
    ];
    for (let i = 0; i < shieldSpecs.length; i++) {
      const s = shieldSpecs[i];
      const isZ = Math.abs(Math.sin(s.rotY)) > 0.5;
      const bw = isZ ? shieldThick : s.len;
      const bd = isZ ? s.len : shieldThick;
      const geo = this._trackGeo(scaleBoxUVs(new THREE.BoxGeometry(bw, shieldH, bd), bw, shieldH, bd, 1.8, 1.8));
      const m = new THREE.Mesh(geo, mats.hullArmorMat);
      m.position.set(s.cx, deckY + shieldH * 0.5, s.cz);
      m.castShadow = true;
      this.root.add(m);
      this.collisionWorld.addBox(s.cx - bw * 0.5, deckY, s.cz - bd * 0.5, s.cx + bw * 0.5, deckY + shieldH, s.cz + bd * 0.5, 'cover');
    }

    // 4 Wide Stepped Gantry Stairs (14 steps x 0.30m rise = 4.20m, stepDepth = 0.70m, runLen = 9.80m)
    const stepCount = 14;
    const stepRise = deckY / stepCount; // 0.30m
    const stepDepth = 0.7;
    const rampWidth = 3.6;
    const runLen = stepCount * stepDepth; // 9.80m

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
    stringerShape.lineTo(runLen, deckY + 0.14);
    stringerShape.lineTo(0, 0.4);
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
      { cx: -23.7, zStart: -15.7, dirZ: -1 },
      { cx: 23.7, zStart: -15.7, dirZ: -1 },
      { cx: -23.7, zStart: 15.7, dirZ: 1 },
      { cx: 23.7, zStart: 15.7, dirZ: 1 },
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

  _buildKeelButtressesAndBulkheads(mats) {
    // 4 Heavy Armored Keel Cradle Buttresses at (±11.5, ±11.5)
    const butW = 2.2;
    const butH = 4.4;
    const butD = 1.4;
    const butGeo = this._trackGeo(scaleBoxUVs(new THREE.BoxGeometry(butW, butH, butD), butW, butH, butD, 1.8, 1.8));
    const colGeo = this._trackGeo(scaleBoxUVs(new THREE.BoxGeometry(butW + 0.12, 0.36, butD + 0.12), butW + 0.12, 0.36, butD + 0.12, 1.2, 0.36));
    const trimGeo = this._trackGeo(new THREE.BoxGeometry(butW - 0.3, 0.1, butD + 0.04));

    const coords = [
      [-11.5, -11.5], [11.5, -11.5], [-11.5, 11.5], [11.5, 11.5],
    ];
    const butInst = new THREE.InstancedMesh(butGeo, mats.hullArmorMat, coords.length);
    butInst.castShadow = true;
    butInst.receiveShadow = true;
    const colInst = new THREE.InstancedMesh(colGeo, mats.hazardMat, coords.length);
    const trimInst = new THREE.InstancedMesh(trimGeo, mats.tungstenAmberMat, coords.length);

    const dummy = new THREE.Object3D();
    for (let i = 0; i < coords.length; i++) {
      const [bx, bz] = coords[i];
      dummy.position.set(bx, butH * 0.5, bz);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      butInst.setMatrixAt(i, dummy.matrix);

      dummy.position.set(bx, 0.18, bz);
      dummy.updateMatrix();
      colInst.setMatrixAt(i, dummy.matrix);

      dummy.position.set(bx, butH - 0.35, bz);
      dummy.updateMatrix();
      trimInst.setMatrixAt(i, dummy.matrix);

      this.collisionWorld.addBox(bx - butW * 0.5, 0, bz - butD * 0.5, bx + butW * 0.5, butH, bz + butD * 0.5, 'pillar');
    }
    butInst.instanceMatrix.needsUpdate = true;
    colInst.instanceMatrix.needsUpdate = true;
    trimInst.instanceMatrix.needsUpdate = true;
    this.root.add(butInst, colInst, trimInst);

    // 4 Waist-High Armored Bulkhead Cargo Blocks
    const bulkSpecs = [
      { cx: -18.0, cz: 0.0, w: 1.0, d: 3.0 },
      { cx: 18.0, cz: 0.0, w: 1.0, d: 3.0 },
      { cx: -6.8, cz: -14.5, w: 3.0, d: 1.0 },
      { cx: 6.8, cz: -14.5, w: 3.0, d: 1.0 },
    ];
    const bulkH = 1.25;
    for (let i = 0; i < bulkSpecs.length; i++) {
      const b = bulkSpecs[i];
      const geo = this._trackGeo(scaleBoxUVs(new THREE.BoxGeometry(b.w, bulkH, b.d), b.w, bulkH, b.d, 1.6, 1.2));
      const mesh = new THREE.Mesh(geo, mats.darkIronMat);
      mesh.position.set(b.cx, bulkH * 0.5, b.cz);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.root.add(mesh);
      this.collisionWorld.addBox(b.cx - b.w * 0.5, 0, b.cz - b.d * 0.5, b.cx + b.w * 0.5, bulkH, b.cz + b.d * 0.5, 'cover');
    }
  }

  _createCitadelSkyTexture() {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 256;
    const ctx = c.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0.0, '#02030a');
    grad.addColorStop(0.48, '#090e24');
    grad.addColorStop(0.78, '#171333');
    grad.addColorStop(1.0, '#050712');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 256);
    // Golden Solar Eclipse Corona
    const corona = ctx.createRadialGradient(256, 86, 16, 256, 86, 84);
    corona.addColorStop(0, 'rgba(251,191,36,0.95)');
    corona.addColorStop(0.32, 'rgba(244,63,94,0.45)');
    corona.addColorStop(0.7, 'rgba(56,189,248,0.18)');
    corona.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = corona;
    ctx.fillRect(140, 0, 232, 190);
    ctx.fillStyle = '#04060f';
    ctx.beginPath();
    ctx.arc(256, 86, 17, 0, Math.PI * 2);
    ctx.fill();
    const rng = createRng(99099);
    for (let i = 0; i < 480; i++) {
      const x = rng() * 512;
      const y = rng() * 210;
      const r = rng() < 0.14 ? 1.6 : 0.85;
      ctx.fillStyle = rng() < 0.25 ? 'rgba(253,224,71,0.9)' : 'rgba(224,242,254,0.85)';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  _buildCranesDreadnoughtAndSkyDome(mats, innerBound) {
    // 1. Cosmic Deep-Space Starfield & Golden Solar Eclipse Sky Dome
    const skyTex = this._createCitadelSkyTexture();
    const skyGeo = this._trackGeo(new THREE.SphereGeometry(195, 28, 18));
    const skyMat = this._trackMat(new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false }));
    this.root.add(new THREE.Mesh(skyGeo, skyMat));

    const sovereignCrimsonMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xf43f5e,
        emissive: new THREE.Color(0xe11d48),
        emissiveIntensity: 1.9,
        roughness: 0.25,
        metalness: 0.4,
      })
    );

    // 2. Grand Concentric Gold & Sovereign-Cyan Floor Inlay Rings Framing the Boss Arena
    const floorRingOuter = this._trackGeo(new THREE.RingGeometry(11.6, 12.2, 48));
    floorRingOuter.rotateX(-Math.PI * 0.5);
    const outerMesh = new THREE.Mesh(floorRingOuter, mats.tungstenAmberMat);
    outerMesh.position.y = 0.04;
    this.root.add(outerMesh);

    const floorRingMid = this._trackGeo(new THREE.RingGeometry(19.2, 19.7, 48));
    floorRingMid.rotateX(-Math.PI * 0.5);
    const midMesh = new THREE.Mesh(floorRingMid, mats.keelEmberMat);
    midMesh.position.y = 0.04;
    this.root.add(midMesh);

    // 3. Colossal Overhead Sovereign Orbital Dreadnought Halo Assembly (y = 14.8m)
    const haloGroup = new THREE.Group();
    haloGroup.position.set(0, 14.8, 0);

    const giantRingGeo = this._trackGeo(new THREE.TorusGeometry(21.5, 0.55, 10, 56));
    giantRingGeo.rotateX(Math.PI * 0.5);
    this._radarRing = new THREE.Mesh(giantRingGeo, mats.tungstenAmberMat);
    haloGroup.add(this._radarRing);

    const innerHaloGeo = this._trackGeo(new THREE.TorusGeometry(14.5, 0.38, 10, 44));
    innerHaloGeo.rotateX(Math.PI * 0.5);
    this._radarDish = new THREE.Mesh(innerHaloGeo, mats.keelEmberMat);
    this._radarDish.position.y = -1.6;
    haloGroup.add(this._radarDish);
    this.root.add(haloGroup);

    // 4. Eight Towering Sovereign Monolith Obelisks with Floating Halo Rings Around Perimeter
    const obeliskGeo = this._trackGeo(new THREE.CylinderGeometry(1.2, 2.4, 28, 6));
    const obeliskHaloGeo = this._trackGeo(new THREE.TorusGeometry(2.6, 0.18, 8, 20));
    obeliskHaloGeo.rotateX(Math.PI * 0.5);
    const spireCapGeo = this._trackGeo(new THREE.OctahedronGeometry(1.4, 0));

    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const dist = innerBound + 7.5;
      const ox = Math.cos(ang) * dist;
      const oz = Math.sin(ang) * dist;

      const ob = new THREE.Mesh(obeliskGeo, mats.darkIronMat);
      ob.position.set(ox, 12, oz);
      this.root.add(ob);

      const ped = new THREE.Mesh(
        this._trackGeo(new THREE.CylinderGeometry(2.8, 3.4, 2.4, 6)),
        mats.hullArmorMat
      );
      ped.position.set(ox, 1.2, oz);
      this.root.add(ped);

      const conduit = new THREE.Mesh(
        this._trackGeo(new THREE.BoxGeometry(0.32, 22, 0.32)),
        i % 2 === 0 ? mats.keelEmberMat : mats.tungstenAmberMat
      );
      conduit.position.set(ox * 0.96, 12, oz * 0.96);
      this.root.add(conduit);

      const cap = new THREE.Mesh(spireCapGeo, i % 2 === 0 ? mats.tungstenAmberMat : sovereignCrimsonMat);
      cap.position.set(ox, 27.5, oz);
      this.root.add(cap);

      const oHalo = new THREE.Mesh(obeliskHaloGeo, i % 2 === 0 ? mats.keelEmberMat : mats.tungstenAmberMat);
      oHalo.position.set(ox, 22.5, oz);
      this.root.add(oHalo);
    }

    // 5. Distant Sovereign Orbital Fleet Silhouette Arches Beyond North Wall
    const fleetArcGeo = this._trackGeo(new THREE.TorusGeometry(42, 1.1, 10, 48, Math.PI));
    const fleetArc = new THREE.Mesh(fleetArcGeo, mats.hullArmorMat);
    fleetArc.position.set(0, 6, -68);
    this.root.add(fleetArc);
    const fleetGlowGeo = this._trackGeo(new THREE.TorusGeometry(39.5, 0.45, 8, 44, Math.PI));
    const fleetGlow = new THREE.Mesh(fleetGlowGeo, sovereignCrimsonMat);
    fleetGlow.position.set(0, 6, -67.5);
    this.root.add(fleetGlow);
  }

  _buildLighting() {
    this.scene.background = new THREE.Color(0x4ea6f2);
    this.scene.fog = new THREE.FogExp2(0xbadffc, 0.0028);

    this._hemiLight = new THREE.HemisphereLight(0xc2e6ff, 0x8ea4ba, 0.85);
    this._hemiLight.position.set(0, 34, 0);
    this.root.add(this._hemiLight);
    this._lights.push(this._hemiLight);

    this._dirLight = new THREE.DirectionalLight(0xfff3d8, 1.95);
    this._dirLight.position.set(-26, 42, -24);
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
    const keelLight = new THREE.PointLight(0x38bdf8, 22, 34, 1.4);
    keelLight.position.set(0, 2.0, 0);
    keelLight.castShadow = false;
    this.root.add(keelLight);
    this._accentLights.push(keelLight);
    this._lights.push(keelLight);
    this._keelLight = keelLight;

    const gantryLight = new THREE.PointLight(0xfbbf24, 20, 38, 1.4);
    gantryLight.position.set(0, 9.5, -16);
    gantryLight.castShadow = false;
    this.root.add(gantryLight);
    this._accentLights.push(gantryLight);
    this._lights.push(gantryLight);
    this._gantryLight = gantryLight;
  }

  update(dt, elapsedTime) {
    if (!this._built) return;
    const t = Number.isFinite(elapsedTime) ? elapsedTime : 0;
    const safeDt = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.1) : 0;

    if (this._radarRing) {
      this._radarRing.rotation.y += safeDt * 0.48;
      this._radarRing.rotation.z = Math.sin(t * 0.5) * 0.08;
    }
    if (this._radarDish) {
      this._radarDish.rotation.y += safeDt * 0.85;
    }
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.3);
    if (this._tungstenAmberMat) {
      this._tungstenAmberMat.emissiveIntensity = 1.05 + pulse * 0.45;
    }
    if (this._keelEmberMat) {
      this._keelEmberMat.emissiveIntensity = 1.15 + pulse * 0.45;
    }
    if (this._keelLight && this._keelLight.visible) {
      this._keelLight.intensity = 22 + pulse * 8;
    }
    if (this._distantBeaconMat) {
      const blink = Math.sin(t * 2.4) > 0.2 ? 1.0 : 0.25;
      this._distantBeaconMat.color.setRGB(0.22 * blink, 0.74 * blink, 0.97 * blink);
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
    this._keelLight = null;
    this._gantryLight = null;
    this._tungstenAmberMat = null;
    this._keelEmberMat = null;
    this._radarDish = null;
    this._radarRing = null;
    this._distantBeaconMat = null;

    if (this._ownsTexGen && this._texGen) {
      this._texGen.dispose();
    }
    this._built = false;
  }
}
  __exports.Map6OrbitalDrydockBuilder = Map6OrbitalDrydockBuilder;
});
