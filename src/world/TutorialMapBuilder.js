// Module: src/world/TutorialMapBuilder.js
__define("src/world/TutorialMapBuilder.js", (__exports, __require) => {
const { ARENA_CONFIG } = __require("src/config/constants.js");
const { TextureGenerator } = __require("src/world/TextureGenerator.js");

/**
 * AAA Military-SF Vanguard Training Bay (mapIndex: 6)
 * Full PBR textured training facility built strictly around the 6 tutorial zones:
 * - South: Mobility Runway & Hazard Launch Lane
 * - West: Jump Pad -> Pier-Supported Elevated Observation Deck
 * - Center: Terra-Beacon Holographic Control Dais & Explosive Barrel Range
 * - East: Illuminated Supply & Weapon Drop Pedestals (HP / Shield / Ammo)
 * - North: Armored Barricade Live-Fire & Shield-Defense Target Range
 */
class TutorialMapBuilder {
  constructor(scene, collisionWorld, qualityConfig = {}, sharedTexGen = null) {
    this.scene = scene;
    this.collisionWorld = collisionWorld;
    this.qualityConfig = qualityConfig || {};
    this._ownsTexGen = !sharedTexGen;
    this._texGen = sharedTexGen || new TextureGenerator(4);

    this.root = null;
    this._geometries = [];
    this._materials = [];
    this._lights = [];
    this._accentLights = [];
    this._dirLight = null;
    this._hemiLight = null;
    this._built = false;
    this._ringMesh = null;
    this._innerRingMesh = null;
    this._cyanGlowMat = null;
  }

  _trackGeo(geo) {
    this._geometries.push(geo);
    return geo;
  }

  _trackMat(mat) {
    this._materials.push(mat);
    return mat;
  }

  _createZoneSignTexture(code, title, accentCss) {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 128;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#f8fbff';
    ctx.fillRect(0, 0, 512, 128);
    ctx.strokeStyle = accentCss;
    ctx.lineWidth = 6;
    ctx.strokeRect(4, 4, 504, 120);
    ctx.fillStyle = accentCss;
    ctx.fillRect(14, 18, 10, 92);
    ctx.font = 'bold 24px ui-monospace, monospace';
    ctx.fillStyle = accentCss;
    ctx.fillText(code, 38, 50);
    ctx.font = 'bold 34px system-ui, sans-serif';
    ctx.fillStyle = '#0f172a';
    ctx.fillText(title, 38, 96);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  build() {
    if (this._built) this.dispose();
    this._built = true;

    this.root = new THREE.Group();
    this.root.name = 'ArenaRoot_TutorialTrainingBay';
    this.scene.add(this.root);

    const innerBound = 24.5;
    const wallH = 10.5;
    this.collisionWorld.setArenaBounds(-innerBound, innerBound, -innerBound, innerBound, 0, 26);

    // 1. Shared Procedural PBR Textures (matches Maps 1-3 & 4-6 tactile surface quality!)
    const deckTex = this._texGen.getDrydockFloorTextures(10, 10);
    const wallTex = this._texGen.getWallTextures(3, 1.5);
    const catwalkTex = this._texGen.getCatwalkTextures(2, 2);
    const rustTex = this._texGen.getRustMetalTextures(1, 1);
    const hazardTex = this._texGen.getHazardTextures(3, 1);
    const skyTex = this._texGen.getSkyDomeTexture('drydock');

    const floorMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xf4f9ff,
        map: deckTex.map,
        roughnessMap: deckTex.roughnessMap,
        bumpMap: deckTex.bumpMap,
        bumpScale: 0.038,
        roughness: 0.48,
        metalness: 0.25,
      })
    );
    const wallMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xf6faff,
        map: wallTex.map,
        roughnessMap: wallTex.roughnessMap,
        bumpMap: wallTex.bumpMap,
        bumpScale: 0.042,
        roughness: 0.50,
        metalness: 0.22,
      })
    );
    const deckMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xe6f1fc,
        map: catwalkTex.map,
        roughnessMap: catwalkTex.roughnessMap,
        bumpMap: catwalkTex.bumpMap,
        bumpScale: 0.035,
        roughness: 0.42,
        metalness: 0.36,
      })
    );
    const darkSteelMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x9fb6ce,
        roughnessMap: rustTex.roughnessMap,
        bumpMap: rustTex.bumpMap,
        bumpScale: 0.028,
        roughness: 0.38,
        metalness: 0.46,
      })
    );
    const hazardMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        map: hazardTex.map,
        roughnessMap: hazardTex.roughnessMap,
        bumpMap: hazardTex.bumpMap,
        bumpScale: 0.032,
        roughness: 0.54,
        metalness: 0.22,
      })
    );
    const cyanGlowMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: new THREE.Color(0x0ea5e9),
        emissiveIntensity: 1.35,
        roughness: 0.22,
      })
    );
    const amberGlowMat = this._trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xfb923c,
        emissive: new THREE.Color(0xf97316),
        emissiveIntensity: 1.35,
        roughness: 0.22,
      })
    );
    this._cyanGlowMat = cyanGlowMat;

    // 2. Sky Dome
    const skyGeo = this._trackGeo(new THREE.SphereGeometry(165, 24, 16));
    const skyMat = this._trackMat(new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false }));
    this.root.add(new THREE.Mesh(skyGeo, skyMat));

    // 3. PBR Training Floor + Center Runway Lanes
    const floorGeo = this._trackGeo(new THREE.PlaneGeometry(innerBound * 2 + 2, innerBound * 2 + 2));
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI * 0.5;
    floorMesh.receiveShadow = true;
    this.root.add(floorMesh);

    const stripGeo = this._trackGeo(new THREE.PlaneGeometry(0.32, innerBound * 1.8));
    stripGeo.rotateX(-Math.PI * 0.5);
    for (const sx of [-3.8, 3.8]) {
      const strip = new THREE.Mesh(stripGeo, cyanGlowMat);
      strip.position.set(sx, 0.03, 0);
      this.root.add(strip);
    }

    // 4. Reinforced Perimeter Walls + Hazard Baseboards + Ribbed Buttress Columns
    const wallSpan = innerBound * 2 + 1.0;
    const wallThick = 1.0;
    const nsGeo = this._trackGeo(new THREE.BoxGeometry(wallSpan, wallH, wallThick));
    const ewGeo = this._trackGeo(new THREE.BoxGeometry(wallThick, wallH, wallSpan));
    const trimNS = this._trackGeo(new THREE.BoxGeometry(wallSpan - 1, 0.24, 0.16));
    const trimEW = this._trackGeo(new THREE.BoxGeometry(0.16, 0.24, wallSpan - 1));
    const baseNS = this._trackGeo(new THREE.BoxGeometry(wallSpan - 1, 0.75, 0.22));
    const baseEW = this._trackGeo(new THREE.BoxGeometry(0.22, 0.75, wallSpan - 1));

    const wallDefs = [
      { geo: nsGeo, trim: trimNS, base: baseNS, pos: [0, wallH * 0.5, -innerBound - 0.5], tPos: [0, 4.2, -innerBound + 0.08], bPos: [0, 0.375, -innerBound + 0.11] },
      { geo: nsGeo, trim: trimNS, base: baseNS, pos: [0, wallH * 0.5, innerBound + 0.5], tPos: [0, 4.2, innerBound - 0.08], bPos: [0, 0.375, innerBound - 0.11] },
      { geo: ewGeo, trim: trimEW, base: baseEW, pos: [-innerBound - 0.5, wallH * 0.5, 0], tPos: [-innerBound + 0.08, 4.2, 0], bPos: [-innerBound + 0.11, 0.375, 0] },
      { geo: ewGeo, trim: trimEW, base: baseEW, pos: [innerBound + 0.5, wallH * 0.5, 0], tPos: [innerBound - 0.08, 4.2, 0], bPos: [innerBound - 0.11, 0.375, 0] },
    ];
    for (let i = 0; i < wallDefs.length; i++) {
      const d = wallDefs[i];
      const wMesh = new THREE.Mesh(d.geo, wallMat);
      wMesh.position.set(d.pos[0], d.pos[1], d.pos[2]);
      wMesh.receiveShadow = true;
      this.root.add(wMesh);
      const tMesh = new THREE.Mesh(d.trim, cyanGlowMat);
      tMesh.position.set(d.tPos[0], d.tPos[1], d.tPos[2]);
      this.root.add(tMesh);
      const bMesh = new THREE.Mesh(d.base, hazardMat);
      bMesh.position.set(d.bPos[0], d.bPos[1], d.bPos[2]);
      this.root.add(bMesh);
    }

    // Ribbed structural buttresses along all 4 walls
    const buttressGeo = this._trackGeo(new THREE.BoxGeometry(1.1, wallH + 0.4, 0.9));
    for (const off of [-16, -8, 0, 8, 16]) {
      for (const side of [-1, 1]) {
        const b1 = new THREE.Mesh(buttressGeo, darkSteelMat);
        b1.position.set(off, wallH * 0.5, side * (innerBound - 0.25));
        this.root.add(b1);
        const b2 = new THREE.Mesh(buttressGeo, darkSteelMat);
        b2.position.set(side * (innerBound - 0.25), wallH * 0.5, off);
        b2.rotation.y = Math.PI * 0.5;
        this.root.add(b2);
      }
    }

    // 5. Overhead Steel Hangar Truss Gantries & Floodlight Bars
    const beamGeo = this._trackGeo(new THREE.BoxGeometry(innerBound * 2, 0.85, 1.0));
    const lampGeo = this._trackGeo(new THREE.BoxGeometry(8.5, 0.18, 0.45));
    for (const bz of [-12, 0, 12]) {
      const beam = new THREE.Mesh(beamGeo, darkSteelMat);
      beam.position.set(0, 9.6, bz);
      this.root.add(beam);
      const lamp = new THREE.Mesh(lampGeo, bz === 0 ? cyanGlowMat : amberGlowMat);
      lamp.position.set(0, 9.1, bz);
      this.root.add(lamp);
    }

    // 6. Diegetic Zone Signboards on All 4 Walls
    const signGeo = this._trackGeo(new THREE.PlaneGeometry(8.2, 2.05));
    const signConfigs = [
      { code: 'ZONE D // FIRING RANGE', title: '표적 사격 · 방패 방어', col: '#ef4444', pos: [0, 6.8, -innerBound + 0.22], rotY: 0 },
      { code: 'ZONE A // MOBILITY DECK', title: '점프 패드 · 고지대 도약', col: '#f59e0b', pos: [-innerBound + 0.22, 6.8, 7.5], rotY: Math.PI * 0.5 },
      { code: 'ZONE C // SUPPLY BAY', title: '회복 아이템 · 무기 드랍', col: '#22c55e', pos: [innerBound - 0.22, 6.8, 8.5], rotY: -Math.PI * 0.5 },
      { code: 'TRN-00 // VANGUARD', title: '종합 전술 훈련장', col: '#38bdf8', pos: [0, 6.8, innerBound - 0.22], rotY: Math.PI },
    ];
    for (let i = 0; i < signConfigs.length; i++) {
      const sc = signConfigs[i];
      const sTex = this._createZoneSignTexture(sc.code, sc.title, sc.col);
      const sMat = this._trackMat(new THREE.MeshBasicMaterial({ map: sTex }));
      const sMesh = new THREE.Mesh(signGeo, sMat);
      sMesh.position.set(sc.pos[0], sc.pos[1], sc.pos[2]);
      sMesh.rotation.y = sc.rotY;
      this.root.add(sMesh);
    }

    // 7. West Pier-Supported Elevated Observation Deck (x = -15.5, z = 7.5, y = 3.6m)
    const platW = 7.5;
    const platH = 3.6;
    const platD = 8.5;
    const platCx = -15.5;
    const platCz = 7.5;
    const deckSlabGeo = this._trackGeo(new THREE.BoxGeometry(platW, 0.55, platD));
    const deckSlab = new THREE.Mesh(deckSlabGeo, deckMat);
    deckSlab.position.set(platCx, platH - 0.275, platCz);
    deckSlab.castShadow = true;
    deckSlab.receiveShadow = true;
    this.root.add(deckSlab);

    const fasciaGeo = this._trackGeo(new THREE.BoxGeometry(platW + 0.14, 0.32, platD + 0.14));
    const fascia = new THREE.Mesh(fasciaGeo, hazardMat);
    fascia.position.set(platCx, platH - 0.52, platCz);
    this.root.add(fascia);

    // 4 Heavy Steel Support Piers under the platform
    const pierGeo = this._trackGeo(new THREE.CylinderGeometry(0.42, 0.52, platH - 0.5, 8));
    for (const px of [platCx - 2.9, platCx + 2.9]) {
      for (const pz of [platCz - 3.3, platCz + 3.3]) {
        const pier = new THREE.Mesh(pierGeo, darkSteelMat);
        pier.position.set(px, (platH - 0.5) * 0.5, pz);
        pier.castShadow = true;
        this.root.add(pier);
      }
    }
    this.collisionWorld.addBox(
      platCx - platW * 0.5,
      0,
      platCz - platD * 0.5,
      platCx + platW * 0.5,
      platH,
      platCz + platD * 0.5,
      'platform'
    );

    // 8. Armored Firing-Line Cover Barricades (z = -5.5) with Hazard Trim
    const coverMainGeo = this._trackGeo(new THREE.BoxGeometry(4.2, 1.35, 0.8));
    const coverCapGeo = this._trackGeo(new THREE.BoxGeometry(4.32, 0.18, 0.92));
    for (const cx of [-6.5, 6.5]) {
      const cover = new THREE.Mesh(coverMainGeo, darkSteelMat);
      cover.position.set(cx, 0.675, -5.5);
      cover.castShadow = true;
      cover.receiveShadow = true;
      this.root.add(cover);
      const cap = new THREE.Mesh(coverCapGeo, hazardMat);
      cap.position.set(cx, 1.32, -5.5);
      this.root.add(cap);
      this.collisionWorld.addBox(cx - 2.1, 0, -5.9, cx + 2.1, 1.35, -5.1, 'cover');
    }

    // 9. East Illuminated Supply Pad Pedestals (HP / Shield / Ammo)
    const padBaseGeo = this._trackGeo(new THREE.CylinderGeometry(1.15, 1.35, 0.12, 16));
    const padRingGeo = this._trackGeo(new THREE.RingGeometry(1.05, 1.22, 20));
    padRingGeo.rotateX(-Math.PI * 0.5);
    const supplyPads = [
      { pos: [8.5, 9.5], mat: amberGlowMat },
      { pos: [11.5, 9.5], mat: cyanGlowMat },
      { pos: [10.0, 6.5], mat: cyanGlowMat },
    ];
    for (let i = 0; i < supplyPads.length; i++) {
      const sp = supplyPads[i];
      const base = new THREE.Mesh(padBaseGeo, darkSteelMat);
      base.position.set(sp.pos[0], 0.06, sp.pos[1]);
      this.root.add(base);
      const ring = new THREE.Mesh(padRingGeo, sp.mat);
      ring.position.set(sp.pos[0], 0.13, sp.pos[1]);
      this.root.add(ring);
    }

    // 10. Center Terra-Beacon Octagonal Plinth & Counter-Rotating Overhead Holographic Rings
    const daisGeo = this._trackGeo(new THREE.CylinderGeometry(5.1, 5.5, 0.18, 8));
    const dais = new THREE.Mesh(daisGeo, deckMat);
    dais.position.y = 0.09;
    dais.receiveShadow = true;
    this.root.add(dais);

    const centerRingGeo = this._trackGeo(new THREE.RingGeometry(4.85, 5.2, 40));
    centerRingGeo.rotateX(-Math.PI * 0.5);
    const centerRing = new THREE.Mesh(centerRingGeo, cyanGlowMat);
    centerRing.position.y = 0.20;
    this.root.add(centerRing);

    const overheadGeo = this._trackGeo(new THREE.TorusGeometry(9.2, 0.24, 8, 42));
    overheadGeo.rotateX(Math.PI * 0.5);
    this._ringMesh = new THREE.Mesh(overheadGeo, cyanGlowMat);
    this._ringMesh.position.set(0, 11.4, 0);
    this.root.add(this._ringMesh);

    const innerOverheadGeo = this._trackGeo(new THREE.TorusGeometry(6.6, 0.18, 8, 32));
    innerOverheadGeo.rotateX(Math.PI * 0.5);
    this._innerRingMesh = new THREE.Mesh(innerOverheadGeo, amberGlowMat);
    this._innerRingMesh.position.set(0, 12.2, 0);
    this.root.add(this._innerRingMesh);

    // 11. Bright Daylight Lighting (2 dynamic point lights max)
    this.scene.background = new THREE.Color(0x62baf7);
    this.scene.fog = new THREE.FogExp2(0xc4e6fc, 0.0028);

    this._hemiLight = new THREE.HemisphereLight(0xc8e9ff, 0x90a8be, 0.86);
    this._hemiLight.position.set(0, 32, 0);
    this.root.add(this._hemiLight);
    this._lights.push(this._hemiLight);

    this._dirLight = new THREE.DirectionalLight(0xfff6e4, 1.92);
    this._dirLight.position.set(-18, 36, 18);
    this._dirLight.shadow.camera.left = -28;
    this._dirLight.shadow.camera.right = 28;
    this._dirLight.shadow.camera.top = 28;
    this._dirLight.shadow.camera.bottom = -28;
    this._dirLight.shadow.camera.near = 6;
    this._dirLight.shadow.camera.far = 90;
    this.root.add(this._dirLight);
    this._lights.push(this._dirLight);

    const centerLight = new THREE.PointLight(0x38bdf8, 18, 34, 1.4);
    centerLight.position.set(0, 4.5, 0);
    this.root.add(centerLight);
    this._accentLights.push(centerLight);
    this._lights.push(centerLight);

    const northRangeLight = new THREE.PointLight(0xfbbf24, 14, 30, 1.4);
    northRangeLight.position.set(0, 5.5, -14);
    this.root.add(northRangeLight);
    this._accentLights.push(northRangeLight);
    this._lights.push(northRangeLight);

    this.setQuality(this.qualityConfig);

    return {
      mapId: 'tutorial_training_bay',
      mapIndex: 6,
      mapCode: 'TRN-00',
      mapName: 'SECTOR-00 // SKYLINE PROVING GROUNDS',
      mapSubtitle: '전술 기동 · 방패 · 무기 강화 종합 훈련장',
      atmosphere: {
        bgColor: 0x62baf7,
        fogColor: 0xc4e6fc,
        fogDensity: 0.0028,
      },
      playerSpawn: {
        pos: new THREE.Vector3(0, 0.05, 16.5),
        yaw: 0,
      },
      enemySpawns: [
        { pos: new THREE.Vector3(0.0, 0.05, -14.0), isElevated: false },
        { pos: new THREE.Vector3(-6.0, 0.05, -15.0), isElevated: false },
        { pos: new THREE.Vector3(6.0, 0.05, -15.0), isElevated: false },
        { pos: new THREE.Vector3(-10.0, 0.05, -12.0), isElevated: false },
        { pos: new THREE.Vector3(10.0, 0.05, -12.0), isElevated: false },
      ],
      pickupSpawns: [
        { pos: new THREE.Vector3(8.5, 0.14, 9.5), type: 'health' },
        { pos: new THREE.Vector3(11.5, 0.14, 9.5), type: 'shield' },
        { pos: new THREE.Vector3(10.0, 0.14, 6.5), type: 'ammo' },
        { pos: new THREE.Vector3(-15.5, 3.62, 7.5), type: 'shield' },
      ],
      barrelSpawns: [
        new THREE.Vector3(-3.5, 0.0, 4.5),
        new THREE.Vector3(3.5, 0.0, 4.5),
      ],
      jumpPadSpawns: [
        { pos: new THREE.Vector3(-6.8, 0.0, 7.5), launchVy: 16.5, launchDirX: -1, launchDirZ: 0 },
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

  update(dt, elapsedTime) {
    if (!this._built) return;
    const safeDt = Number.isFinite(dt) ? Math.min(dt, 0.1) : 0;
    const t = Number.isFinite(elapsedTime) ? elapsedTime : 0;
    if (this._ringMesh) this._ringMesh.rotation.y += safeDt * 0.38;
    if (this._innerRingMesh) this._innerRingMesh.rotation.y -= safeDt * 0.62;
    if (this._cyanGlowMat) {
      this._cyanGlowMat.emissiveIntensity = 1.7 + 0.45 * Math.sin(t * 2.4);
    }
  }

  setQuality(qualityConfig) {
    if (!qualityConfig) return;
    this.qualityConfig = qualityConfig;
    if (this._dirLight) {
      this._dirLight.castShadow = Boolean(qualityConfig.shadowsEnabled);
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
    for (let i = 0; i < this._geometries.length; i++) this._geometries[i].dispose();
    this._geometries.length = 0;
    for (let i = 0; i < this._materials.length; i++) this._materials[i].dispose();
    this._materials.length = 0;
    this._lights.length = 0;
    this._accentLights.length = 0;
    this._dirLight = null;
    this._hemiLight = null;
    this._ringMesh = null;
    this._innerRingMesh = null;
    this._cyanGlowMat = null;
    if (this._ownsTexGen && this._texGen) this._texGen.dispose();
    this._built = false;
  }
}
  __exports.TutorialMapBuilder = TutorialMapBuilder;
});
