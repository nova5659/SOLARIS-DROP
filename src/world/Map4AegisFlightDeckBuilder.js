// Module: src/world/Map4AegisFlightDeckBuilder.js
__define("src/world/Map4AegisFlightDeckBuilder.js", (__exports, __require) => {
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
 * Map 4 Builder — "SECTOR-61 // AEGIS FLIGHT DECK" (Stages 6–7)
 * Unified Orbital Aegis Citadel forward hangar apron in charcoal-gunmetal & tungsten-amber.
 * Features riveted warship deck plates, U-shaped y=3.9m flight catwalks + side overlooks,
 * 4 wide stepped ramps (0.30m/step), 4 jump pads, 4 orbital capacitor pylons,
 * overhead hangar bridge rails (y=8.4m), and a docked Aegis frigate bow vista.
 */
class Map4AegisFlightDeckBuilder {
  constructor(scene, collisionWorld, qualityConfig = {}, sharedTexGen = null) {
    this.scene = scene;
    this.collisionWorld = collisionWorld;
    this.qualityConfig = qualityConfig || {};

    this._ownsTexGen = !sharedTexGen;
    this._texGen = sharedTexGen || new TextureGenerator(4);

    this.root = new THREE.Group();
    this.root.name = 'ArenaRoot_SECTOR61_AegisFlightDeck';

    this._geometries = [];
    this._materials = [];
    this._lights = [];
    this._accentLights = [];
    this._dirLight = null;
    this._hemiLight = null;

    this._tungstenAmberMat = null;
    this._keelEmberMat = null;
    this._radarRingOuter = null;
    this._radarRingInner = null;
    this._distantBeaconMat = null;
    this._coreLight = null;
    this._northHangarLight = null;

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
    this.root.name = 'ArenaRoot_SECTOR61_AegisFlightDeck';
    this.scene.add(this.root);

    const half = ARENA_CONFIG.halfSize; // 32
    const innerBound = half - 0.5; // 31.5
    const wallH = ARENA_CONFIG.wallHeight; // 11

    this.collisionWorld.setArenaBounds(-innerBound, innerBound, -innerBound, innerBound, 0, 28);

    const mats = this._createMaterials();
    this._buildFlightDeckFloorAndPlinth(mats, innerBound);
    this._buildPerimeterWalls(mats, innerBound, wallH);
    this._buildSectorSignboards(mats, innerBound);
    this._buildElevatedCatwalksAndRamps(mats, innerBound);
    this._buildCapacitorsAndBulkheads(mats);
    this._buildHangarOverheadAndVista(mats, innerBound);
    this._buildLighting();
    this.setQuality(this.qualityConfig);

    // Jump pad calibration: deckY = 3.9m, g = 26 m/s^2, Vh = 11.0 m/s, Vy = 17.2 m/s
    // Peak y = 5.69m, descending landing at y = 3.9m occurs at t = 1.0325s -> d = 11.36m.
    return {
      mapId: 'aegis_flight_deck',
      mapIndex: 3,
      mapCode: 'SEC-61',
      mapName: 'SECTOR-61 // CLOUDBREAK DECK',
      mapSubtitle: 'HIGH-ALTITUDE AEROSPACE CARRIER APRON',
      atmosphere: {
        bgColor: 0x58b0f7,
        fogColor: 0xbce2fc,
        fogDensity: 0.0030,
      },
      playerSpawn: {
        pos: new THREE.Vector3(0, 0.05, 24.5),
        yaw: 0,
      },
      enemySpawns: [
        { pos: new THREE.Vector3(0.0, 0.05, -19.0), isElevated: false },
        { pos: new THREE.Vector3(-5.0, 0.05, -19.5), isElevated: false },
        { pos: new THREE.Vector3(5.0, 0.05, -19.5), isElevated: false },
        { pos: new THREE.Vector3(0.0, 0.05, -7.5), isElevated: false },
        { pos: new THREE.Vector3(-17.5, 0.05, -11.5), isElevated: false },
        { pos: new THREE.Vector3(17.5, 0.05, -11.5), isElevated: false },
        { pos: new THREE.Vector3(-19.0, 0.05, 14.5), isElevated: false },
        { pos: new THREE.Vector3(19.0, 0.05, 14.5), isElevated: false },
        { pos: new THREE.Vector3(-27.8, 3.95, -10.5), isElevated: true },
        { pos: new THREE.Vector3(27.8, 3.95, -10.5), isElevated: true },
        { pos: new THREE.Vector3(-12.0, 3.95, -28.2), isElevated: true },
        { pos: new THREE.Vector3(12.0, 3.95, -28.2), isElevated: true },
      ],
      pickupSpawns: [
        { pos: new THREE.Vector3(-22.5, 3.90, 0.0), type: 'shield' },
        { pos: new THREE.Vector3(22.5, 3.90, 0.0), type: 'health' },
        { pos: new THREE.Vector3(0.0, 3.90, -28.2), type: 'ammo' },
        { pos: new THREE.Vector3(-27.5, 0.0, 29.0), type: 'ammo' },
        { pos: new THREE.Vector3(27.5, 0.0, 29.0), type: 'shield' },
        { pos: new THREE.Vector3(0.0, 0.0, 17.5), type: 'health' },
      ],
      barrelSpawns: [
        new THREE.Vector3(-7.0, 0.0, 0.0),
        new THREE.Vector3(7.0, 0.0, 0.0),
        new THREE.Vector3(-4.2, 0.0, -13.0),
        new THREE.Vector3(4.2, 0.0, -13.0),
        new THREE.Vector3(-14.5, 0.0, 14.0),
        new THREE.Vector3(14.5, 0.0, 14.0),
      ],
      jumpPadSpawns: [
        { pos: new THREE.Vector3(-15.0, 0.0, -4.0), launchVy: 17.2, launchDirX: -1, launchDirZ: 0 },
        { pos: new THREE.Vector3(15.0, 0.0, -4.0), launchVy: 17.2, launchDirX: 1, launchDirZ: 0 },
        { pos: new THREE.Vector3(-8.0, 0.0, -16.9), launchVy: 17.2, launchDirX: 0, launchDirZ: -1 },
        { pos: new THREE.Vector3(8.0, 0.0, -16.9), launchVy: 17.2, launchDirX: 0, launchDirZ: -1 },
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
        color: 0xf4f9ff,
        map: deckTex.map,
        roughnessMap: deckTex.roughnessMap,
        bumpMap: deckTex.bumpMap,
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
        color: 0xf8fbff,
        map: rustTex.map,
        roughnessMap: rustTex.roughnessMap,
        bumpMap: rustTex.bumpMap,
        bumpScale: 0.035,
        metalness: 0.36,
        roughness: 0.40,
      })
    );

    const darkIronMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x9ab4cf,
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
        metalness: 0.35,
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
        color: 0x38bdf8,
        emissive: new THREE.Color(0x0ea5e9),
        emissiveIntensity: 1.15,
        roughness: 0.3,
        metalness: 0.2,
      })
    );

    const keelEmberMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x7dd3fc,
        emissive: new THREE.Color(0x0284c7),
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
        roughness: 0.46,
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
      deckFloorMat,
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

  _buildFlightDeckFloorAndPlinth(mats, innerBound) {
    const floorSize = innerBound * 2 + 2;
    const floorGeo = this._trackGeo(new THREE.PlaneGeometry(floorSize, floorSize));
    const floorMesh = new THREE.Mesh(floorGeo, mats.deckFloorMat);
    floorMesh.rotation.x = -Math.PI * 0.5;
    floorMesh.receiveShadow = true;
    this.root.add(floorMesh);

    this.collisionWorld.addBox(-34, -1.0, -34, 34, 0.0, 34, 'floor');

    // Low octagonal central Flight Deck Turntable (R=5.8m, y=0.20m)
    const daisR = 5.8;
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

    this.collisionWorld.addBox(-4.1, 0, -4.1, 4.1, 0.2, 4.1, 'platform');
    this.collisionWorld.addBox(-5.36, 0, -2.22, 5.36, 0.2, 2.22, 'platform');
    this.collisionWorld.addBox(-2.22, 0, -5.36, 2.22, 0.2, 5.36, 'platform');

    const collarGeo = this._trackGeo(new THREE.RingGeometry(4.1, 4.85, 8));
    const collar = new THREE.Mesh(collarGeo, mats.darkIronMat);
    collar.rotation.x = -Math.PI * 0.5;
    collar.rotation.z = Math.PI / 8;
    collar.position.y = 0.205;
    this.root.add(collar);

    const emberRingGeo = this._trackGeo(new THREE.RingGeometry(2.3, 2.65, 16));
    const emberRing = new THREE.Mesh(emberRingGeo, mats.keelEmberMat);
    emberRing.rotation.x = -Math.PI * 0.5;
    emberRing.position.y = 0.207;
    this.root.add(emberRing);

    // Recessed tungsten-amber catapult guide rails leading out from central deck
    const seamGeo = this._trackGeo(new THREE.BoxGeometry(1, 0.016, 1));
    const seams = [
      { x: 0, z: 11.5, w: 0.22, d: 11.0 },
      { x: 0, z: -11.5, w: 0.22, d: 11.0 },
      { x: -11.5, z: 0, w: 11.0, d: 0.22 },
      { x: 11.5, z: 0, w: 11.0, d: 0.22 },
    ];
    for (let i = 0; i < seams.length; i++) {
      const s = seams[i];
      const m = new THREE.Mesh(seamGeo, mats.tungstenAmberMat);
      m.position.set(s.x, 0.008, s.z);
      m.scale.set(s.w, 1, s.d);
      this.root.add(m);
    }
  }

  _buildPerimeterWalls(mats, innerBound, wallH) {
    const wallThick = 1.5;
    const wallSpan = innerBound * 2 + wallThick * 2;
    const wallGeoX = this._trackGeo(
      scaleBoxUVs(new THREE.BoxGeometry(wallSpan, wallH, wallThick), wallSpan, wallH, wallThick, 6.4, 5.5)
    );
    const wallGeoZ = this._trackGeo(
      scaleBoxUVs(new THREE.BoxGeometry(wallThick, wallH, wallSpan), wallThick, wallH, wallSpan, 6.4, 5.5)
    );

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

    const upperRibGeo = this._trackGeo(
      scaleBoxUVs(new THREE.BoxGeometry(0.6, 5.0, 0.78), 0.6, 5.0, 0.78, 1.8, 1.8)
    );
    const offsets = [-24, -16, -8, 8, 16, 24];
    const ribInst = new THREE.InstancedMesh(upperRibGeo, mats.darkIronMat, offsets.length * 4);
    ribInst.castShadow = true;
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
      { title: 'FLIGHT DECK', subtitle: 'HANGAR APRON // SECTOR-61', accent: '#f09d38', pos: [0, 8.3, -(innerBound - 0.36)], rotY: 0 },
      { title: 'LAUNCH BAY', subtitle: 'DOCKING GATE // SOUTH', accent: '#e05814', pos: [0, 8.3, innerBound - 0.36], rotY: Math.PI },
      { title: 'PORT CATWALK', subtitle: 'OVERPASS LEVEL +3.9M', accent: '#f09d38', pos: [-(innerBound - 0.36), 8.3, 0], rotY: Math.PI * 0.5 },
      { title: 'STARBOARD CATWALK', subtitle: 'OVERPASS LEVEL +3.9M', accent: '#f09d38', pos: [innerBound - 0.36, 8.3, 0], rotY: -Math.PI * 0.5 },
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

  _buildElevatedCatwalksAndRamps(mats, innerBound) {
    const deckY = 3.9;
    const deckThick = 0.4;

    const platformSpecs = [
      { minX: -innerBound, maxX: -24.0, minZ: -25.0, maxZ: 18.0, fasciaSide: 'east' },
      { minX: 24.0, maxX: innerBound, minZ: -25.0, maxZ: 18.0, fasciaSide: 'west' },
      { minX: -innerBound, maxX: innerBound, minZ: -innerBound, maxZ: -25.0, fasciaSide: 'south' },
      { minX: -24.0, maxX: -21.0, minZ: -6.0, maxZ: 6.0, fasciaSide: 'east' },
      { minX: 21.0, maxX: 24.0, minZ: -6.0, maxZ: 6.0, fasciaSide: 'west' },
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

    // Support piers under elevated catwalks
    const pierCoords = [
      [-24.3, -24.5], [-24.3, -12.0], [-24.3, 12.0], [-24.3, 17.5],
      [24.3, -24.5], [24.3, -12.0], [24.3, 12.0], [24.3, 17.5],
      [-18.0, -25.3], [-4.5, -25.3], [4.5, -25.3], [18.0, -25.3],
    ];
    const pierGeo = this._trackGeo(scaleBoxUVs(new THREE.BoxGeometry(0.62, deckY - deckThick, 0.62), 0.62, deckY - deckThick, 0.62, 1.8, 1.8));
    const pierInst = new THREE.InstancedMesh(pierGeo, mats.darkIronMat, pierCoords.length);
    pierInst.castShadow = true;
    pierInst.receiveShadow = true;
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

    // Elevated Deck Tactical Half-Cover Shields (y = 3.90..4.95m)
    const shieldH = 1.05;
    const shieldThick = 0.38;
    const shieldSpecs = [
      { cx: -21.2, cz: 0.0, len: 4.8, rotY: Math.PI * 0.5 },
      { cx: 21.2, cz: 0.0, len: 4.8, rotY: Math.PI * 0.5 },
      { cx: -4.2, cz: -25.2, len: 3.6, rotY: 0 },
      { cx: 4.2, cz: -25.2, len: 3.6, rotY: 0 },
      { cx: -24.2, cz: -14.0, len: 3.6, rotY: Math.PI * 0.5 },
      { cx: 24.2, cz: -14.0, len: 3.6, rotY: Math.PI * 0.5 },
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
      m.receiveShadow = true;
      this.root.add(m);
      this.collisionWorld.addBox(s.cx - bw * 0.5, deckY, s.cz - bd * 0.5, s.cx + bw * 0.5, deckY + shieldH, s.cz + bd * 0.5, 'cover');
    }

    // 4 Wide Stepped Flight Deck Ramps (13 steps x 0.30m rise = 3.90m, stepDepth = 0.70m, runLen = 9.10m)
    const stepCount = 13;
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
    const stringerGeo = this._trackGeo(
      scaleGeometryUVs(new THREE.ExtrudeGeometry(stringerShape, { depth: 0.22, bevelEnabled: false }), 0.25, 0.25)
    );
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
      { cx: -27.5, zStart: 27.1, dirZ: -1 },
      { cx: 27.5, zStart: 27.1, dirZ: -1 },
      { cx: -14.0, zStart: -15.9, dirZ: -1 },
      { cx: 14.0, zStart: -15.9, dirZ: -1 },
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

  _buildCapacitorsAndBulkheads(mats) {
    // 4 Armored Orbital Capacitor Pylons at (±10.2, ±10.2)
    const capW = 2.4;
    const capH = 3.8;
    const capD = 1.4;
    const capGeo = this._trackGeo(scaleBoxUVs(new THREE.BoxGeometry(capW, capH, capD), capW, capH, capD, 1.8, 1.8));
    const capCollarGeo = this._trackGeo(scaleBoxUVs(new THREE.BoxGeometry(capW + 0.12, 0.34, capD + 0.12), capW + 0.12, 0.34, capD + 0.12, 1.2, 0.34));
    const capCoreGeo = this._trackGeo(new THREE.BoxGeometry(capW - 0.5, 0.12, capD + 0.04));

    const capPositions = [
      [-10.2, -10.2], [10.2, -10.2], [-10.2, 10.2], [10.2, 10.2],
    ];
    const capInst = new THREE.InstancedMesh(capGeo, mats.hullArmorMat, capPositions.length);
    capInst.castShadow = true;
    capInst.receiveShadow = true;
    const colInst = new THREE.InstancedMesh(capCollarGeo, mats.hazardMat, capPositions.length);
    const coreInst = new THREE.InstancedMesh(capCoreGeo, mats.tungstenAmberMat, capPositions.length);

    const dummy = new THREE.Object3D();
    for (let i = 0; i < capPositions.length; i++) {
      const [cx, cz] = capPositions[i];
      dummy.position.set(cx, capH * 0.5, cz);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      capInst.setMatrixAt(i, dummy.matrix);

      dummy.position.set(cx, 0.17, cz);
      dummy.updateMatrix();
      colInst.setMatrixAt(i, dummy.matrix);

      dummy.position.set(cx, capH * 0.72, cz);
      dummy.updateMatrix();
      coreInst.setMatrixAt(i, dummy.matrix);

      this.collisionWorld.addBox(cx - capW * 0.5, 0, cz - capD * 0.5, cx + capW * 0.5, capH, cz + capD * 0.5, 'pillar');
    }
    capInst.instanceMatrix.needsUpdate = true;
    colInst.instanceMatrix.needsUpdate = true;
    coreInst.instanceMatrix.needsUpdate = true;
    this.root.add(capInst, colInst, coreInst);

    // 4 Waist-High Armored Hangar Bulkhead Cargo Blocks
    const barSpecs = [
      { cx: 0, cz: -13.0, w: 3.2, d: 0.85 },
      { cx: 0, cz: 14.5, w: 3.2, d: 0.85 },
      { cx: -16.5, cz: 8.5, w: 0.85, d: 3.2 },
      { cx: 16.5, cz: 8.5, w: 0.85, d: 3.2 },
    ];
    const barH = 1.25;
    for (let i = 0; i < barSpecs.length; i++) {
      const b = barSpecs[i];
      const geo = this._trackGeo(scaleBoxUVs(new THREE.BoxGeometry(b.w, barH, b.d), b.w, barH, b.d, 1.6, 1.2));
      const mesh = new THREE.Mesh(geo, mats.darkIronMat);
      mesh.position.set(b.cx, barH * 0.5, b.cz);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.root.add(mesh);
      this.collisionWorld.addBox(b.cx - b.w * 0.5, 0, b.cz - b.d * 0.5, b.cx + b.w * 0.5, barH, b.cz + b.d * 0.5, 'cover');
    }
  }

  _createOrbitalSkyTexture() {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 256;
    const ctx = c.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0.0, '#020612');
    grad.addColorStop(0.45, '#071730');
    grad.addColorStop(0.72, '#0c2c52');
    grad.addColorStop(1.0, '#051020');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 256);
    // Crisp starfield
    const rng = createRng(61061);
    for (let i = 0; i < 420; i++) {
      const x = rng() * 512;
      const y = rng() * 190;
      const r = rng() < 0.15 ? 1.6 : 0.9;
      ctx.fillStyle = rng() < 0.3 ? 'rgba(125,211,252,0.9)' : 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // Glowing Orbital Blue Earth horizon arc
    const pGrad = ctx.createRadialGradient(256, 245, 25, 256, 245, 130);
    pGrad.addColorStop(0, 'rgba(56,189,248,0.65)');
    pGrad.addColorStop(0.5, 'rgba(14,165,233,0.28)');
    pGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = pGrad;
    ctx.fillRect(0, 80, 512, 176);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  _buildHangarOverheadAndVista(mats, innerBound) {
    // 1. Deep-Space Starfield & Glowing Blue Earth Horizon Sky Dome
    const skyTex = this._createOrbitalSkyTexture();
    const skyGeo = this._trackGeo(new THREE.SphereGeometry(195, 28, 18));
    const skyMat = this._trackMat(new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false }));
    this.root.add(new THREE.Mesh(skyGeo, skyMat));

    // Translucent cyan holographic force-field material
    const holoFieldMat = this._trackMat(
      new THREE.MeshBasicMaterial({
        color: 0x00e5ff,
        transparent: true,
        opacity: 0.22,
        side: THREE.DoubleSide,
        depthWrite: false,
      })
    );
    const whiteHullMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xeaf2fb,
        metalness: 0.78,
        roughness: 0.22,
      })
    );

    // 2. Glowing Cyan Magnetic Launch Runway Strips & Chevron Guide Arrows along the Flight Deck
    const stripGeo = this._trackGeo(new THREE.PlaneGeometry(0.45, innerBound * 1.75));
    stripGeo.rotateX(-Math.PI * 0.5);
    for (const sx of [-4.2, 4.2, -12.8, 12.8]) {
      const strip = new THREE.Mesh(stripGeo, mats.tungstenAmberMat);
      strip.position.set(sx, 0.04, 0);
      this.root.add(strip);
    }
    const chevGeo = this._trackGeo(new THREE.BoxGeometry(2.6, 0.04, 0.35));
    for (let z = -22; z <= 18; z += 8) {
      for (const side of [-1, 1]) {
        const chev = new THREE.Mesh(chevGeo, mats.keelEmberMat);
        chev.position.set(side * 1.15, 0.05, z);
        chev.rotation.y = side * 0.45;
        this.root.add(chev);
      }
    }

    // 3. Three Sweeping Holographic Hangar Force-Field Arches Spanning Overhead (y = 9.5m..14m)
    const archGeo = this._trackGeo(new THREE.TorusGeometry(innerBound * 0.92, 0.42, 8, 36, Math.PI));
    const archGlowGeo = this._trackGeo(new THREE.TorusGeometry(innerBound * 0.89, 0.16, 8, 36, Math.PI));
    for (const az of [-15, 0, 15]) {
      const arch = new THREE.Mesh(archGeo, mats.hullArmorMat);
      arch.position.set(0, 6.0, az);
      this.root.add(arch);
      const glowArch = new THREE.Mesh(archGlowGeo, mats.tungstenAmberMat);
      glowArch.position.set(0, 6.0, az);
      this.root.add(glowArch);
    }

    // 4. Two Multi-Part Detailed Aegis Orbital Gunships Suspended on Overhead Magnetic Docking Clamps
    this._dockedFighters = [];
    const fuselageGeo = this._trackGeo(new THREE.ConeGeometry(1.25, 9.8, 6));
    fuselageGeo.rotateX(Math.PI * 0.5);
    const bodyCoreGeo = this._trackGeo(new THREE.BoxGeometry(2.1, 1.2, 5.2));
    const canopyGeo = this._trackGeo(new THREE.BoxGeometry(1.1, 0.55, 2.4));
    const wingGeo = this._trackGeo(new THREE.BoxGeometry(9.6, 0.20, 3.2));
    const tailFinGeo = this._trackGeo(new THREE.BoxGeometry(0.18, 2.1, 2.2));
    const podGeo = this._trackGeo(new THREE.CylinderGeometry(0.32, 0.32, 3.2, 8));
    podGeo.rotateX(Math.PI * 0.5);
    const engineGeo = this._trackGeo(new THREE.TorusGeometry(0.68, 0.15, 8, 18));
    const clampGeo = this._trackGeo(new THREE.BoxGeometry(0.45, 5.2, 0.65));

    for (const fx of [-13.5, 13.5]) {
      const fighter = new THREE.Group();
      fighter.position.set(fx, 11.4, -5.5);
      fighter.rotation.z = fx < 0 ? 0.12 : -0.12;
      fighter.add(new THREE.Mesh(fuselageGeo, whiteHullMat));

      const core = new THREE.Mesh(bodyCoreGeo, mats.darkIronMat);
      core.position.set(0, -0.15, -1.6);
      fighter.add(core);

      const canopy = new THREE.Mesh(canopyGeo, mats.keelEmberMat);
      canopy.position.set(0, 0.58, 0.4);
      fighter.add(canopy);

      const wing = new THREE.Mesh(wingGeo, mats.hullArmorMat);
      wing.position.set(0, -0.1, -1.2);
      fighter.add(wing);

      for (const side of [-1, 1]) {
        const fin = new THREE.Mesh(tailFinGeo, whiteHullMat);
        fin.position.set(side * 2.2, 0.85, -3.4);
        fin.rotation.z = side * -0.28;
        fighter.add(fin);

        const pod = new THREE.Mesh(podGeo, mats.darkIronMat);
        pod.position.set(side * 3.4, -0.45, -0.6);
        fighter.add(pod);

        const eng = new THREE.Mesh(engineGeo, mats.tungstenAmberMat);
        eng.position.set(side * 1.65, 0, -4.6);
        fighter.add(eng);

        const clamp = new THREE.Mesh(clampGeo, mats.darkIronMat);
        clamp.position.set(side * 1.4, 3.2, -1.2);
        fighter.add(clamp);
      }
      this.root.add(fighter);
      this._dockedFighters.push(fighter);
    }

    // 5. Giant Orbital Planet Earth Sphere & Rotating Orbital Ring Beyond North Hangar Bay
    const planetGroup = new THREE.Group();
    planetGroup.position.set(0, 26, -98);
    const planetGeo = this._trackGeo(new THREE.SphereGeometry(28, 24, 18));
    const planetMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x0ea5e9,
        emissive: new THREE.Color(0x0369a1),
        emissiveIntensity: 0.65,
        roughness: 0.55,
        metalness: 0.1,
      })
    );
    planetGroup.add(new THREE.Mesh(planetGeo, planetMat));
    const ringGeo = this._trackGeo(new THREE.TorusGeometry(39, 0.55, 8, 48));
    ringGeo.rotateX(Math.PI * 0.42);
    this._radarRingOuter = new THREE.Mesh(ringGeo, mats.tungstenAmberMat);
    planetGroup.add(this._radarRingOuter);

    const innerRingGeo = this._trackGeo(new THREE.TorusGeometry(34, 0.35, 8, 40));
    innerRingGeo.rotateX(Math.PI * 0.46);
    this._radarRingInner = new THREE.Mesh(innerRingGeo, holoFieldMat);
    planetGroup.add(this._radarRingInner);
    this.root.add(planetGroup);

    // 6. Glowing Cyan Hangar Force-Field Portal Screens on North/East/West Perimeter
    const fieldGeo = this._trackGeo(new THREE.PlaneGeometry(24, 9.5));
    const northField = new THREE.Mesh(fieldGeo, holoFieldMat);
    northField.position.set(0, 15.2, -innerBound + 0.4);
    this.root.add(northField);
  }

  _buildLighting() {
    this.scene.background = new THREE.Color(0x58b0f7);
    this.scene.fog = new THREE.FogExp2(0xbce2fc, 0.0030);

    this._hemiLight = new THREE.HemisphereLight(0xc2e6ff, 0x8ea4ba, 0.85);
    this._hemiLight.position.set(0, 34, 0);
    this.root.add(this._hemiLight);
    this._lights.push(this._hemiLight);

    this._dirLight = new THREE.DirectionalLight(0xfff6e4, 1.92);
    this._dirLight.position.set(-28, 42, -22);
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
    const coreLight = new THREE.PointLight(0x38bdf8, 22, 34, 1.4);
    coreLight.position.set(0, 2.2, 0);
    coreLight.castShadow = false;
    this.root.add(coreLight);
    this._accentLights.push(coreLight);
    this._lights.push(coreLight);
    this._coreLight = coreLight;

    const northHangar = new THREE.PointLight(0x60a5fa, 20, 38, 1.4);
    northHangar.position.set(0, 9.5, -18);
    northHangar.castShadow = false;
    this.root.add(northHangar);
    this._accentLights.push(northHangar);
    this._lights.push(northHangar);
    this._northHangarLight = northHangar;
  }

  update(dt, elapsedTime) {
    if (!this._built) return;
    const t = Number.isFinite(elapsedTime) ? elapsedTime : 0;
    const safeDt = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.1) : 0;

    if (this._radarRingOuter) {
      this._radarRingOuter.rotation.y += safeDt * 0.45;
    }
    if (this._radarRingInner) {
      this._radarRingInner.rotation.y -= safeDt * 0.72;
    }
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.2);
    if (this._tungstenAmberMat) {
      this._tungstenAmberMat.emissiveIntensity = 1.05 + pulse * 0.45;
    }
    if (this._keelEmberMat) {
      this._keelEmberMat.emissiveIntensity = 1.15 + pulse * 0.45;
    }
    if (this._coreLight && this._coreLight.visible) {
      this._coreLight.intensity = 22 + pulse * 8;
    }
    if (this._distantBeaconMat) {
      const blink = Math.sin(t * 2.4) > 0.25 ? 1.0 : 0.25;
      this._distantBeaconMat.color.setRGB(0.05 * blink, 0.85 * blink, 1.0 * blink);
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
    this._coreLight = null;
    this._northHangarLight = null;
    this._tungstenAmberMat = null;
    this._keelEmberMat = null;
    this._radarRingOuter = null;
    this._radarRingInner = null;
    this._distantBeaconMat = null;

    if (this._ownsTexGen && this._texGen) {
      this._texGen.dispose();
    }
    this._built = false;
  }
}
  __exports.Map4AegisFlightDeckBuilder = Map4AegisFlightDeckBuilder;
});
