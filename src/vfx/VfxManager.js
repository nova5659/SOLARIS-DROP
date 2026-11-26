// Module: src/vfx/VfxManager.js
__define("src/vfx/VfxManager.js", (__exports, __require) => {
const TWO_PI = Math.PI * 2;
const Z_AXIS = new THREE.Vector3(0, 0, 1);

const MAX_SPARKS = 450;
const MAX_DECALS = 120;
const MAX_CASINGS = 40;
const MAX_TRACERS = 40;
const MAX_RAIL_BEAMS = 4;
const MAX_RINGS = 28;
const MAX_EXPLOSIONS = 6;
const MAX_DYNAMIC_LIGHTS = 2;

/**
 * 100% Object-Pooled, Zero-GC, Zero-Stutter VFX Manager for AETHER DROP: RECLAIM EARTH.
 * Renders warm gunpowder muzzle blasts, ballistic tracers, superheated tungsten/amber
 * HV-7 railbeams with dust shockwaves, spinning brass shell casings (0xd4a338),
 * orange-gold armor & crimson-amber headshot sparks, heated amber shield deflection
 * ripples, dark charred bullet-hole decals, and fiery industrial explosions.
 *
 * Uses strictly MAX_DYNAMIC_LIGHTS = 2 persistent PointLights whose `visible` stays
 * permanently `true` (modulating `intensity = 0` when idle) to eliminate Three.js
 * shader recompilation hitches mid-firefight. Zero MeshPhysicalMaterial.
 */
class VfxManager {
  /**
   * @param {THREE.Scene} worldScene
   * @param {THREE.Scene} viewmodelScene
   * @param {THREE.PerspectiveCamera} camera
   * @param {object} [qualityConfig]
   */
  constructor(worldScene, viewmodelScene, camera, qualityConfig = null) {
    this.worldScene = worldScene;
    this.viewmodelScene = viewmodelScene;
    this.camera = camera;

    this._maxParticles = MAX_SPARKS;
    this._maxDecals = MAX_DECALS;
    this._maxDynamicLights = MAX_DYNAMIC_LIGHTS;
    this._particleScale = 1.0;

    // Pre-allocated scratch math objects (strictly zero-GC hot paths)
    this._v1 = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._v3 = new THREE.Vector3();
    this._v4 = new THREE.Vector3();
    this._scale = new THREE.Vector3();
    this._quat = new THREE.Quaternion();
    this._quat2 = new THREE.Quaternion();
    this._mat4 = new THREE.Matrix4();
    this._euler = new THREE.Euler();
    this._color = new THREE.Color();
    this._color2 = new THREE.Color();
    this._zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);

    // Tracked disposable assets
    /** @type {Array<THREE.Texture>} */
    this._textures = [];
    /** @type {Array<THREE.BufferGeometry>} */
    this._geometries = [];
    /** @type {Array<THREE.Material>} */
    this._materials = [];

    this._buildProceduralTextures();
    this._initDynamicLights();
    this._initMuzzleFlash();
    this._initTracers();
    this._initRailBeams();
    this._initShellCasings();
    this._initSparks();
    this._initDecals();
    this._initImpactRings();
    this._initExplosions();

    if (qualityConfig) {
      this.setQuality(qualityConfig);
    }
  }

  // ---------------------------------------------------------------------------
  // Procedural Canvas VFX Textures (Gunpowder, Bullet Craters, Dust & Deflection)
  // ---------------------------------------------------------------------------

  /** @private */
  _makeCanvas(size) {
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    return c;
  }

  /** @private */
  _registerTex(canvas) {
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    this._textures.push(tex);
    return tex;
  }

  /** @private */
  _buildProceduralTextures() {
    // 1. Volumetric Multi-Prong Gunpowder Blast Star Texture
    const flashCanvas = this._makeCanvas(128);
    const fCtx = flashCanvas.getContext('2d');
    if (fCtx) {
      const c = 64;
      fCtx.clearRect(0, 0, 128, 128);

      // Hot combustion fireball core
      const coreGrad = fCtx.createRadialGradient(c, c, 2, c, c, 54);
      coreGrad.addColorStop(0.0, 'rgba(255,252,238,1)');
      coreGrad.addColorStop(0.20, 'rgba(255,228,165,0.92)');
      coreGrad.addColorStop(0.50, 'rgba(255,165,70,0.42)');
      coreGrad.addColorStop(1.0, 'rgba(255,110,20,0)');
      fCtx.fillStyle = coreGrad;
      fCtx.fillRect(0, 0, 128, 128);

      // Sharp primary muzzle-brake blast prongs
      fCtx.save();
      fCtx.translate(c, c);
      for (let i = 0; i < 6; i++) {
        fCtx.rotate(Math.PI / 3);
        const len = i % 2 === 0 ? 60 : 48;
        const width = i % 2 === 0 ? 8.5 : 6.0;
        const spike = fCtx.createLinearGradient(0, -len, 0, len);
        spike.addColorStop(0.0, 'rgba(255,140,40,0)');
        spike.addColorStop(0.42, 'rgba(255,210,120,0.92)');
        spike.addColorStop(0.5, 'rgba(255,255,245,1)');
        spike.addColorStop(0.58, 'rgba(255,210,120,0.92)');
        spike.addColorStop(1.0, 'rgba(255,140,40,0)');
        fCtx.fillStyle = spike;
        fCtx.beginPath();
        fCtx.moveTo(0, -len);
        fCtx.lineTo(width, 0);
        fCtx.lineTo(0, len);
        fCtx.lineTo(-width, 0);
        fCtx.closePath();
        fCtx.fill();
      }
      fCtx.restore();
    }
    this._texMuzzleFlash = this._registerTex(flashCanvas);

    // 2. Dark Charred Concrete / Armor Bullet-Hole Scorch Decal Texture
    const scorchCanvas = this._makeCanvas(128);
    const sCtx = scorchCanvas.getContext('2d');
    if (sCtx) {
      const c = 64;
      sCtx.clearRect(0, 0, 128, 128);

      // Outer carbon soot & concrete dust halo
      const soot = sCtx.createRadialGradient(c, c, 4, c, c, 58);
      soot.addColorStop(0.0, 'rgba(6,6,6,0.98)');
      soot.addColorStop(0.35, 'rgba(20,18,16,0.88)');
      soot.addColorStop(0.68, 'rgba(32,28,24,0.42)');
      soot.addColorStop(1.0, 'rgba(0,0,0,0)');
      sCtx.fillStyle = soot;
      sCtx.fillRect(0, 0, 128, 128);

      // Jagged radial bullet-impact cracks & powder burn streaks
      sCtx.save();
      sCtx.translate(c, c);
      sCtx.strokeStyle = 'rgba(10,9,8,0.85)';
      sCtx.lineWidth = 2.6;
      for (let i = 0; i < 14; i++) {
        const ang = (i / 14) * TWO_PI + ((i % 3) * 0.16);
        const len = 30 + ((i * 23) % 26);
        sCtx.beginPath();
        sCtx.moveTo(Math.cos(ang) * 7, Math.sin(ang) * 7);
        sCtx.lineTo(Math.cos(ang + 0.08) * (len * 0.55), Math.sin(ang + 0.08) * (len * 0.55));
        sCtx.lineTo(Math.cos(ang) * len, Math.sin(ang) * len);
        sCtx.stroke();
      }
      sCtx.restore();

      // Deep dark perforated bullet crater pit + tiny cooling cinder rim
      const ember = sCtx.createRadialGradient(c, c, 3, c, c, 19);
      ember.addColorStop(0.0, 'rgba(4,4,4,1.0)');
      ember.addColorStop(0.45, 'rgba(210,160,110,0.55)');
      ember.addColorStop(0.75, 'rgba(120,90,65,0.22)');
      ember.addColorStop(1.0, 'rgba(0,0,0,0)');
      sCtx.fillStyle = ember;
      sCtx.beginPath();
      sCtx.arc(c, c, 19, 0, TWO_PI);
      sCtx.fill();
    }
    this._texScorch = this._registerTex(scorchCanvas);

    // 3. Ballistic Shockwave & Dust Expansion Ring Texture
    const ringCanvas = this._makeCanvas(128);
    const rCtx = ringCanvas.getContext('2d');
    if (rCtx) {
      const c = 64;
      rCtx.clearRect(0, 0, 128, 128);
      const rg = rCtx.createRadialGradient(c, c, 24, c, c, 60);
      rg.addColorStop(0.0, 'rgba(255,255,255,0)');
      rg.addColorStop(0.52, 'rgba(255,255,255,0.22)');
      rg.addColorStop(0.76, 'rgba(255,255,255,0.92)');
      rg.addColorStop(0.88, 'rgba(255,255,255,0.96)');
      rg.addColorStop(1.0, 'rgba(255,255,255,0)');
      rCtx.fillStyle = rg;
      rCtx.fillRect(0, 0, 128, 128);
    }
    this._texRing = this._registerTex(ringCanvas);

    // 4. Heated Armor / Steel Shield Deflection Ripple Texture (Amber-Orange Heavy Grid)
    const shieldCanvas = this._makeCanvas(128);
    const hCtx = shieldCanvas.getContext('2d');
    if (hCtx) {
      const c = 64;
      hCtx.clearRect(0, 0, 128, 128);

      const drawHex = (cx, cy, r) => {
        hCtx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (Math.PI / 3) * i + Math.PI / 6;
          const px = cx + Math.cos(a) * r;
          const py = cy + Math.sin(a) * r;
          if (i === 0) hCtx.moveTo(px, py);
          else hCtx.lineTo(px, py);
        }
        hCtx.closePath();
        hCtx.stroke();
      };

      hCtx.strokeStyle = 'rgba(255,235,205,0.95)';
      hCtx.lineWidth = 2.8;
      const r = 15;
      const dx = r * Math.sqrt(3);
      const dy = r * 1.5;
      for (let row = -3; row <= 3; row++) {
        for (let col = -3; col <= 3; col++) {
          const hx = c + col * dx + (Math.abs(row) % 2 === 1 ? dx * 0.5 : 0);
          const hy = c + row * dy;
          if (Math.hypot(hx - c, hy - c) < 52) {
            drawHex(hx, hy, r * 0.92);
          }
        }
      }

      hCtx.lineWidth = 4.5;
      hCtx.beginPath();
      hCtx.arc(c, c, 54, 0, TWO_PI);
      hCtx.stroke();

      hCtx.globalCompositeOperation = 'destination-in';
      const mask = hCtx.createRadialGradient(c, c, 6, c, c, 62);
      mask.addColorStop(0.0, 'rgba(255,255,255,0.95)');
      mask.addColorStop(0.75, 'rgba(255,255,255,0.95)');
      mask.addColorStop(1.0, 'rgba(255,255,255,0)');
      hCtx.fillStyle = mask;
      hCtx.fillRect(0, 0, 128, 128);
      hCtx.globalCompositeOperation = 'source-over';
    }
    this._texShieldRipple = this._registerTex(shieldCanvas);
  }

  // ---------------------------------------------------------------------------
  // Pooled Subsystems Initialization
  // ---------------------------------------------------------------------------

  /** @private */
  _initDynamicLights() {
    this._lights = [];
    for (let i = 0; i < MAX_DYNAMIC_LIGHTS; i++) {
      const light = new THREE.PointLight(0xffb84d, 0, 8, 2);
      // Keep visible = true permanently! Zero shader recompilation hitches mid-combat.
      light.visible = true;
      this.worldScene.add(light);
      this._lights.push({
        light,
        age: 0,
        maxLife: 0.08,
        peakIntensity: 0,
        active: false,
      });
    }
  }

  /** @private */
  _initMuzzleFlash() {
    const group = new THREE.Group();
    group.visible = false;

    const starMat = new THREE.MeshBasicMaterial({
      map: this._texMuzzleFlash,
      color: 0xffb84d,
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xfff3d4,
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    this._materials.push(starMat, coreMat);

    // Front-facing gunpowder blast star + 3 axial gas plume planes along -Z
    const frontGeo = new THREE.PlaneGeometry(0.19, 0.19);
    const jetGeo = new THREE.PlaneGeometry(0.14, 0.28);
    jetGeo.rotateX(Math.PI * 0.5);
    jetGeo.translate(0, 0, -0.10);
    const coreGeo = new THREE.OctahedronGeometry(0.032, 1);
    this._geometries.push(frontGeo, jetGeo, coreGeo);

    const pFront = new THREE.Mesh(frontGeo, starMat);
    const pJet1 = new THREE.Mesh(jetGeo, starMat);
    const pJet2 = new THREE.Mesh(jetGeo, starMat);
    pJet2.rotation.z = Math.PI * 0.5;
    const pJet3 = new THREE.Mesh(jetGeo, starMat);
    pJet3.rotation.z = Math.PI * 0.25;
    const pCore = new THREE.Mesh(coreGeo, coreMat);

    group.add(pFront, pJet1, pJet2, pJet3, pCore);
    this.viewmodelScene.add(group);

    this._muzzleFlash = {
      group,
      starMat,
      coreMat,
      age: 0,
      maxLife: 0.055,
      baseScale: 1.0,
      active: false,
    };
  }

  /** @private */
  _initTracers() {
    const outerGeo = new THREE.CylinderGeometry(0.65, 1.0, 1.0, 6, 1, true);
    outerGeo.rotateX(Math.PI * 0.5);
    outerGeo.translate(0, 0, 0.5);

    const coreGeo = new THREE.CylinderGeometry(0.28, 0.42, 1.0, 5, 1, true);
    coreGeo.rotateX(Math.PI * 0.5);
    coreGeo.translate(0, 0, 0.5);
    this._geometries.push(outerGeo, coreGeo);

    this._tracers = [];
    this._tracerCursor = 0;

    for (let i = 0; i < MAX_TRACERS; i++) {
      const outerMat = new THREE.MeshBasicMaterial({
        color: 0xffc864,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      });
      const coreMat = new THREE.MeshBasicMaterial({
        color: 0xfff5d8,
        transparent: true,
        opacity: 0.96,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      });
      this._materials.push(outerMat, coreMat);

      const group = new THREE.Group();
      group.visible = false;
      group.add(new THREE.Mesh(outerGeo, outerMat));
      group.add(new THREE.Mesh(coreGeo, coreMat));
      this.worldScene.add(group);

      this._tracers.push({
        group,
        outerMat,
        coreMat,
        start: new THREE.Vector3(),
        end: new THREE.Vector3(),
        dir: new THREE.Vector3(),
        totalLen: 1,
        width: 0.02,
        age: 0,
        maxLife: 0.11,
        active: false,
      });
    }
  }

  /** @private */
  _initRailBeams() {
    const coreGeo = new THREE.CylinderGeometry(0.036, 0.036, 1.0, 8, 1, true);
    coreGeo.rotateX(Math.PI * 0.5);
    coreGeo.translate(0, 0, 0.5);

    const outerGeo = new THREE.CylinderGeometry(0.092, 0.092, 1.0, 8, 1, true);
    outerGeo.rotateX(Math.PI * 0.5);
    outerGeo.translate(0, 0, 0.5);

    const helixPts = [];
    const turns = 12;
    const steps = 72;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const a = t * turns * TWO_PI;
      helixPts.push(new THREE.Vector3(Math.cos(a) * 0.14, Math.sin(a) * 0.14, t));
    }
    const helixCurve = new THREE.CatmullRomCurve3(helixPts);
    const helixGeo = new THREE.TubeGeometry(helixCurve, 72, 0.018, 5, false);

    // Sonic dust shockwave rings along HV-7 Rail Lance beam
    const shockRingGeo = new THREE.TorusGeometry(0.18, 0.024, 6, 18);
    this._geometries.push(coreGeo, outerGeo, helixGeo, shockRingGeo);

    this._railBeams = [];
    this._railCursor = 0;

    for (let i = 0; i < MAX_RAIL_BEAMS; i++) {
      const group = new THREE.Group();
      group.visible = false;

      const coreMat = new THREE.MeshBasicMaterial({
        color: 0xfff8dc,
        transparent: true,
        opacity: 1,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      });
      const outerMat = new THREE.MeshBasicMaterial({
        color: 0xfbbf24,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      });
      const helixMat = new THREE.MeshBasicMaterial({
        color: 0xff7a24,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      });
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0xe6bc7a,
        transparent: true,
        opacity: 0.88,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      });
      this._materials.push(coreMat, outerMat, helixMat, ringMat);

      const coreMesh = new THREE.Mesh(coreGeo, coreMat);
      const outerMesh = new THREE.Mesh(outerGeo, outerMat);
      const helixMesh = new THREE.Mesh(helixGeo, helixMat);
      group.add(coreMesh, outerMesh, helixMesh);

      const rings = [];
      for (let r = 0; r < 5; r++) {
        const rm = new THREE.Mesh(shockRingGeo, ringMat);
        group.add(rm);
        rings.push(rm);
      }

      this.worldScene.add(group);
      this._railBeams.push({
        group,
        coreMesh,
        outerMesh,
        helixMesh,
        rings,
        coreMat,
        outerMat,
        helixMat,
        ringMat,
        length: 10,
        age: 0,
        maxLife: 0.52,
        active: false,
      });
    }
  }

  /** @private */
  _initShellCasings() {
    const casingGeo = new THREE.CylinderGeometry(0.007, 0.0085, 0.032, 6);
    casingGeo.rotateZ(Math.PI * 0.5);
    const casingMat = new THREE.MeshStandardMaterial({
      color: 0xd4a338,
      metalness: 0.92,
      roughness: 0.22,
    });
    this._geometries.push(casingGeo);
    this._materials.push(casingMat);

    this._casingMesh = new THREE.InstancedMesh(casingGeo, casingMat, MAX_CASINGS);
    this._casingMesh.frustumCulled = false;
    this._casingMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    this._casings = [];
    this._casingCursor = 0;
    this._casingsDirty = false;
    this._color.setHex(0xd4a338);

    for (let i = 0; i < MAX_CASINGS; i++) {
      this._casingMesh.setMatrixAt(i, this._zeroMatrix);
      this._casingMesh.setColorAt(i, this._color);
      this._casings.push({
        active: false,
        age: 0,
        maxLife: 1.5,
        floorY: 0.02,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        rot: new THREE.Vector3(),
        angVel: new THREE.Vector3(),
      });
    }
    this._casingMesh.instanceMatrix.needsUpdate = true;
    if (this._casingMesh.instanceColor) this._casingMesh.instanceColor.needsUpdate = true;
    this.worldScene.add(this._casingMesh);
  }

  /** @private */
  _initSparks() {
    const sparkGeo = new THREE.OctahedronGeometry(0.026, 0);
    sparkGeo.scale(0.45, 0.45, 3.6);
    const sparkMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    this._geometries.push(sparkGeo);
    this._materials.push(sparkMat);

    this._sparkMesh = new THREE.InstancedMesh(sparkGeo, sparkMat, MAX_SPARKS);
    this._sparkMesh.frustumCulled = false;
    this._sparkMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    this._sparks = [];
    this._sparkCursor = 0;
    this._sparksDirty = false;
    this._color.setHex(0xffffff);

    for (let i = 0; i < MAX_SPARKS; i++) {
      this._sparkMesh.setMatrixAt(i, this._zeroMatrix);
      this._sparkMesh.setColorAt(i, this._color);
      this._sparks.push({
        active: false,
        age: 0,
        maxLife: 0.35,
        gravity: 14.0,
        drag: 3.5,
        baseSize: 1.0,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
      });
    }
    this._sparkMesh.instanceMatrix.needsUpdate = true;
    if (this._sparkMesh.instanceColor) this._sparkMesh.instanceColor.needsUpdate = true;
    this.worldScene.add(this._sparkMesh);
  }

  /** @private */
  _initDecals() {
    const decalGeo = new THREE.PlaneGeometry(0.32, 0.32);
    this._geometries.push(decalGeo);

    this._decals = [];
    this._decalCursor = 0;

    for (let i = 0; i < MAX_DECALS; i++) {
      const mat = new THREE.MeshBasicMaterial({
        map: this._texScorch,
        color: 0xffffff,
        transparent: true,
        opacity: 0.92,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      });
      this._materials.push(mat);

      const mesh = new THREE.Mesh(decalGeo, mat);
      mesh.visible = false;
      this.worldScene.add(mesh);

      this._decals.push({
        mesh,
        mat,
        age: 0,
        maxLife: 13.0,
        hotColor: new THREE.Color(0xff9a3c),
        active: false,
      });
    }
  }

  /** @private */
  _initImpactRings() {
    const ringGeo = new THREE.PlaneGeometry(1.0, 1.0);
    this._geometries.push(ringGeo);

    this._rings = [];
    this._ringCursor = 0;

    for (let i = 0; i < MAX_RINGS; i++) {
      const mat = new THREE.MeshBasicMaterial({
        map: this._texRing,
        color: 0xffb347,
        transparent: true,
        opacity: 1.0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      });
      this._materials.push(mat);

      const mesh = new THREE.Mesh(ringGeo, mat);
      mesh.visible = false;
      this.worldScene.add(mesh);

      this._rings.push({
        mesh,
        mat,
        age: 0,
        maxLife: 0.22,
        startScale: 0.12,
        endScale: 0.72,
        active: false,
      });
    }
  }

  /** @private */
  _initExplosions() {
    const coreGeo = new THREE.IcosahedronGeometry(1.0, 1);
    const fireGeo = new THREE.IcosahedronGeometry(1.0, 2);
    const torusGeo = new THREE.TorusGeometry(1.0, 0.08, 8, 28);
    torusGeo.rotateX(Math.PI * 0.5);
    const torus2Geo = new THREE.TorusGeometry(1.0, 0.048, 6, 24);
    this._geometries.push(coreGeo, fireGeo, torusGeo, torus2Geo);

    this._explosions = [];
    this._explosionCursor = 0;

    for (let i = 0; i < MAX_EXPLOSIONS; i++) {
      const group = new THREE.Group();
      group.visible = false;

      const coreMat = new THREE.MeshBasicMaterial({
        color: 0xfff2cf,
        transparent: true,
        opacity: 1.0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      });
      const fireMat = new THREE.MeshBasicMaterial({
        color: 0xff5a18,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      });
      const shockMat = new THREE.MeshBasicMaterial({
        color: 0xff9a33,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      });
      const shock2Mat = new THREE.MeshBasicMaterial({
        color: 0xff6220,
        transparent: true,
        opacity: 0.82,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      });
      this._materials.push(coreMat, fireMat, shockMat, shock2Mat);

      const coreMesh = new THREE.Mesh(coreGeo, coreMat);
      const fireMesh = new THREE.Mesh(fireGeo, fireMat);
      const shockMesh = new THREE.Mesh(torusGeo, shockMat);
      const shock2Mesh = new THREE.Mesh(torus2Geo, shock2Mat);
      shock2Mesh.rotation.set(0.65, 0.4, 0.5);

      group.add(coreMesh, fireMesh, shockMesh, shock2Mesh);
      this.worldScene.add(group);

      this._explosions.push({
        group,
        coreMesh,
        fireMesh,
        shockMesh,
        shock2Mesh,
        coreMat,
        fireMat,
        shockMat,
        shock2Mat,
        radius: 6.0,
        age: 0,
        maxLife: 0.65,
        active: false,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Internal Pool Helpers (Zero GC)
  // ---------------------------------------------------------------------------

  /** @private */
  _orientZ(quat, dir) {
    const lenSq = dir.lengthSq();
    if (lenSq < 1e-10) {
      quat.identity();
      return;
    }
    this._v4.copy(dir).multiplyScalar(1 / Math.sqrt(lenSq));
    quat.setFromUnitVectors(Z_AXIS, this._v4);
  }

  /** @private */
  _spawnDynamicLight(slotIndex, position, colorHex, intensity, distance, duration) {
    if (this._maxDynamicLights <= 0) return;
    const cappedIndex = slotIndex < this._maxDynamicLights ? slotIndex : 0;
    const slot = this._lights[cappedIndex];
    slot.light.position.copy(position);
    slot.light.color.setHex(colorHex);
    slot.light.intensity = intensity;
    slot.light.distance = distance;
    slot.light.visible = true;
    slot.peakIntensity = intensity;
    slot.age = 0;
    slot.maxLife = duration;
    slot.active = true;
  }

  /** @private */
  _allocWorldLightSlot() {
    if (this._maxDynamicLights <= 1) return 0;
    let oldestIdx = 1;
    let oldestRatio = -1;
    for (let i = 1; i < this._maxDynamicLights; i++) {
      if (!this._lights[i].active) return i;
      const ratio = this._lights[i].age / Math.max(0.001, this._lights[i].maxLife);
      if (ratio > oldestRatio) {
        oldestRatio = ratio;
        oldestIdx = i;
      }
    }
    return oldestIdx;
  }

  /** @private */
  _emitSpark(pos, velX, velY, velZ, colorHex, maxLife, baseSize = 1.0, gravity = 15.0, drag = 3.2) {
    if (this._maxParticles <= 0) return;
    const idx = this._sparkCursor % this._maxParticles;
    this._sparkCursor = (this._sparkCursor + 1) % this._maxParticles;

    const sp = this._sparks[idx];
    sp.active = true;
    sp.age = 0;
    sp.maxLife = maxLife;
    sp.gravity = gravity;
    sp.drag = drag;
    sp.baseSize = baseSize;
    sp.pos.copy(pos);
    sp.vel.set(velX, velY, velZ);

    this._color.setHex(colorHex);
    this._sparkMesh.setColorAt(idx, this._color);
    if (this._sparkMesh.instanceColor) {
      this._sparkMesh.instanceColor.needsUpdate = true;
    }
    this._sparksDirty = true;
  }

  /** @private */
  _spawnRing(point, normal, colorHex, startScale, endScale, maxLife, useShieldTex = false) {
    const ring = this._rings[this._ringCursor];
    this._ringCursor = (this._ringCursor + 1) % MAX_RINGS;

    ring.active = true;
    ring.age = 0;
    ring.maxLife = maxLife;
    ring.startScale = startScale;
    ring.endScale = endScale;

    ring.mat.map = useShieldTex ? this._texShieldRipple : this._texRing;
    ring.mat.color.setHex(colorHex);
    ring.mat.opacity = 1.0;

    ring.mesh.position.set(
      point.x + normal.x * 0.025,
      point.y + normal.y * 0.025,
      point.z + normal.z * 0.025
    );
    this._orientZ(this._quat, normal);
    this._quat2.setFromAxisAngle(Z_AXIS, Math.random() * TWO_PI);
    ring.mesh.quaternion.copy(this._quat).multiply(this._quat2);
    ring.mesh.scale.set(startScale, startScale, 1);
    ring.mesh.visible = true;
  }

  /** @private */
  _spawnScorchDecal(point, normal, colorHex) {
    if (this._maxDecals <= 0) return;
    const idx = this._decalCursor % this._maxDecals;
    this._decalCursor = (this._decalCursor + 1) % this._maxDecals;

    const d = this._decals[idx];
    d.active = true;
    d.age = 0;
    d.maxLife = 13.0;
    d.hotColor.setHex(colorHex || 0xff9a3c);

    const size = 0.56 + Math.random() * 0.44;
    d.mesh.position.set(
      point.x + normal.x * 0.015,
      point.y + normal.y * 0.015,
      point.z + normal.z * 0.015
    );
    this._orientZ(this._quat, normal);
    this._quat2.setFromAxisAngle(Z_AXIS, Math.random() * TWO_PI);
    d.mesh.quaternion.copy(this._quat).multiply(this._quat2);
    d.mesh.scale.set(size, size, 1);
    d.mat.color.copy(d.hotColor);
    d.mat.opacity = 0.94;
    d.mesh.visible = true;
  }

  // ---------------------------------------------------------------------------
  // Public Spawn API (100% Backward Compatible)
  // ---------------------------------------------------------------------------

  /**
   * Spawn 1P volumetric gunpowder muzzle flash in viewmodelScene + dynamic world PointLight.
   * @param {THREE.Vector3} viewmodelMuzzleWorldPos
   * @param {THREE.Vector3} worldEyePos
   * @param {THREE.Vector3} worldForward
   * @param {number} color
   * @param {number} [scale=1.0]
   */
  spawnMuzzleFlash(viewmodelMuzzleWorldPos, worldEyePos, worldForward, color, scale = 1.0) {
    const mf = this._muzzleFlash;
    mf.active = true;
    mf.age = 0;
    mf.maxLife = 0.055;
    mf.baseScale = Math.max(0.4, scale || 1.0);

    // Blend weapon accent toward warm golden-amber gunpowder flash (0xffb84d / 0xff7a24)
    this._color.setHex(0xffb84d).lerp(this._color2.setHex(color || 0xff7a24), 0.35);

    mf.group.position.copy(viewmodelMuzzleWorldPos);
    mf.group.rotation.set(0, 0, Math.random() * TWO_PI);
    mf.group.scale.setScalar(mf.baseScale);
    mf.starMat.color.copy(this._color);
    mf.starMat.opacity = 1.0;
    mf.coreMat.opacity = 1.0;
    mf.group.visible = true;

    if (this._maxDynamicLights > 0 && worldEyePos && worldForward) {
      this._v1.copy(worldEyePos).addScaledVector(worldForward, 0.85);
      this._spawnDynamicLight(0, this._v1, this._color.getHex(), 4.4 * mf.baseScale, 8.5, 0.065);
    }
  }

  /**
   * Spawn a warm ballistic bullet tracer (or superheated tungsten/amber HV-7 railbeam + dust shockwave rings).
   * @param {THREE.Vector3} startPos
   * @param {THREE.Vector3} endPos
   * @param {number} color
   * @param {number} [width=0.02]
   * @param {boolean} [isRailgun=false]
   */
  spawnTracer(startPos, endPos, color, width = 0.02, isRailgun = false) {
    this._v1.subVectors(endPos, startPos);
    const dist = this._v1.length();
    if (dist < 0.08) return;
    this._v2.copy(this._v1).multiplyScalar(1 / dist);

    if (isRailgun) {
      const rb = this._railBeams[this._railCursor];
      this._railCursor = (this._railCursor + 1) % MAX_RAIL_BEAMS;

      rb.active = true;
      rb.age = 0;
      rb.maxLife = 0.52;
      rb.length = dist;

      rb.group.position.copy(startPos);
      this._orientZ(rb.group.quaternion, this._v2);
      rb.coreMesh.scale.set(1, 1, dist);
      rb.outerMesh.scale.set(1, 1, dist);
      rb.helixMesh.scale.set(1, 1, dist);
      rb.helixMesh.rotation.z = Math.random() * TWO_PI;

      // Superheated orbital tungsten/amber beam + warm copper-amber helix + dust shockwave rings
      const beamColor = color || 0xfbbf24;
      rb.outerMat.color.setHex(beamColor);
      rb.helixMat.color.setHex(0xff7a24);
      rb.ringMat.color.setHex(0xe2b97b);
      rb.coreMat.opacity = 1.0;
      rb.outerMat.opacity = 0.90;
      rb.helixMat.opacity = 0.92;
      rb.ringMat.opacity = 0.90;

      const ringCount = rb.rings.length;
      for (let i = 0; i < ringCount; i++) {
        const frac = (i + 0.6) / (ringCount + 0.5);
        const rm = rb.rings[i];
        rm.position.set(0, 0, Math.min(dist - 0.25, dist * frac));
        rm.scale.setScalar(0.35);
      }
      rb.group.visible = true;
      return;
    }

    // Standard high-velocity warm ballistic tracer
    const tr = this._tracers[this._tracerCursor];
    this._tracerCursor = (this._tracerCursor + 1) % MAX_TRACERS;

    tr.active = true;
    tr.age = 0;
    tr.maxLife = Math.min(0.14, 0.075 + dist * 0.0008);
    tr.start.copy(startPos);
    tr.end.copy(endPos);
    tr.dir.copy(this._v2);
    tr.totalLen = dist;
    tr.width = Math.max(0.01, width || 0.02);

    this._color.setHex(0xffc864).lerp(this._color2.setHex(color || 0xff9233), 0.5);
    tr.outerMat.color.copy(this._color);
    tr.outerMat.opacity = 0.92;
    tr.coreMat.opacity = 0.98;

    tr.group.position.copy(startPos);
    this._orientZ(tr.group.quaternion, this._v2);
    tr.group.scale.set(tr.width, tr.width, dist);
    tr.group.visible = true;
  }

  /**
   * Spawn a spinning brass shell casing (0xd4a338) ejected cleanly from the chamber.
   * @param {THREE.Vector3} worldPos
   * @param {THREE.Vector3} rightDir
   * @param {THREE.Vector3} upDir
   * @param {THREE.Vector3} forwardDir
   * @param {number} color
   */
  spawnShellCasing(worldPos, rightDir, upDir, forwardDir, color) {
    const idx = this._casingCursor;
    this._casingCursor = (this._casingCursor + 1) % MAX_CASINGS;

    const c = this._casings[idx];
    c.active = true;
    c.age = 0;
    c.maxLife = 1.45;
    c.pos.copy(worldPos);
    c.floorY = Math.max(0.02, worldPos.y - 1.55);

    const rSpd = 2.0 + Math.random() * 1.3;
    const uSpd = 1.1 + Math.random() * 0.9;
    const fSpd = 0.4 + Math.random() * 0.8;
    c.vel.set(
      rightDir.x * rSpd + upDir.x * uSpd + forwardDir.x * fSpd,
      rightDir.y * rSpd + upDir.y * uSpd + forwardDir.y * fSpd,
      rightDir.z * rSpd + upDir.z * uSpd + forwardDir.z * fSpd
    );

    c.rot.set(Math.random() * TWO_PI, Math.random() * TWO_PI, Math.random() * TWO_PI);
    c.angVel.set(
      (Math.random() - 0.5) * 28,
      14 + Math.random() * 16,
      (Math.random() - 0.5) * 28
    );

    // Pure machined brass shell casing color (0xd4a338) with subtle hull variation
    this._color.setHex(0xd4a338);
    if (color === 0xea580c) {
      // Subtle warm copper-brass tone for 12g breacher shells
      this._color.lerp(this._color2.setHex(0xc46028), 0.25);
    }
    this._casingMesh.setColorAt(idx, this._color);
    if (this._casingMesh.instanceColor) {
      this._casingMesh.instanceColor.needsUpdate = true;
    }
    this._casingsDirty = true;
  }

  /**
   * Spawn tailored ballistic impact feedback:
   * - wall: charred bullet-hole decal, orange-gold sparks, dust puff ring
   * - body: orange-gold metal armor sparks
   * - head: bright crimson-amber spark burst
   * - shield: heated amber deflection ripple on Juggernaut steel shields
   * @param {THREE.Vector3} point
   * @param {THREE.Vector3} normal
   * @param {number} color
   * @param {'wall'|'body'|'head'|'shield'} [hitType='wall']
   */
  spawnImpact(point, normal, color, hitType = 'wall') {
    const n = this._v3.copy(normal);
    if (n.lengthSq() < 1e-6) n.set(0, 1, 0);
    else n.normalize();

    let sparkCount = 12;
    let baseSpeed = 7.0;
    let primaryColor = 0xffb347;
    let secondaryColor = 0xfff0c2;
    let sparkSize = 1.0;

    if (hitType === 'wall') {
      sparkCount = Math.max(4, Math.round(12 * this._particleScale));
      baseSpeed = 7.4;
      primaryColor = 0xffb347;
      secondaryColor = 0xd6ba94;
      this._spawnScorchDecal(point, n, color || 0xff9a3c);
      this._spawnRing(point, n, 0xd8b48a, 0.08, 0.56, 0.20, false);
    } else if (hitType === 'body') {
      sparkCount = Math.max(6, Math.round(16 * this._particleScale));
      baseSpeed = 8.6;
      primaryColor = 0xffb347;
      secondaryColor = 0xff7a24;
      sparkSize = 1.25;
      this._spawnRing(point, n, 0xff9f40, 0.10, 0.68, 0.18, false);
    } else if (hitType === 'head') {
      // Bright crimson-amber critical spark burst on headshots!
      sparkCount = Math.max(10, Math.round(28 * this._particleScale));
      baseSpeed = 11.4;
      primaryColor = 0xff3b1f;
      secondaryColor = 0xffb833;
      sparkSize = 1.65;
      this._spawnRing(point, n, 0xff4824, 0.14, 1.15, 0.25, false);
      this._spawnRing(point, n, 0xffcc55, 0.08, 0.78, 0.18, false);
      if (this._maxDynamicLights > 1) {
        this._spawnDynamicLight(this._allocWorldLightSlot(), point, 0xff7a24, 3.6, 5.5, 0.11);
      }
    } else if (hitType === 'shield') {
      // Heated amber ripple on Juggernaut steel shields!
      sparkCount = Math.max(6, Math.round(14 * this._particleScale));
      baseSpeed = 6.8;
      primaryColor = 0xf59e0b;
      secondaryColor = 0xffe099;
      sparkSize = 1.15;
      this._spawnRing(point, n, 0xf59e0b, 0.22, 1.45, 0.30, true);
    }

    for (let i = 0; i < sparkCount; i++) {
      const rx = (Math.random() - 0.5) * 2.0;
      const ry = (Math.random() - 0.5) * 2.0;
      const rz = (Math.random() - 0.5) * 2.0;
      let vx = n.x * 1.15 + rx;
      let vy = n.y * 1.15 + ry + (hitType === 'head' ? 0.35 : 0.2);
      let vz = n.z * 1.15 + rz;
      const len = Math.hypot(vx, vy, vz) || 1;
      const spd = baseSpeed * (0.45 + Math.random() * 0.85);
      vx = (vx / len) * spd;
      vy = (vy / len) * spd;
      vz = (vz / len) * spd;

      const useSec = i % 3 === 0;
      const sparkHex = hitType === 'head' && i % 5 === 0 ? 0xfff2c2 : useSec ? secondaryColor : primaryColor;
      this._emitSpark(
        point,
        vx,
        vy,
        vz,
        sparkHex,
        0.18 + Math.random() * 0.22,
        sparkSize * (0.7 + Math.random() * 0.65),
        hitType === 'shield' ? 8.0 : 16.0,
        3.6
      );
    }
  }

  /**
   * Spawn a pooled multi-layer fiery industrial explosion with orange-red fireball,
   * expanding shockwave rings, glowing embers, and brief warm light flash.
   * @param {THREE.Vector3} position
   * @param {number} [radius=6.0]
   * @param {number} [color=0xff6a00]
   */
  spawnExplosion(position, radius = 6.0, color = 0xff6a00) {
    const exp = this._explosions[this._explosionCursor];
    this._explosionCursor = (this._explosionCursor + 1) % MAX_EXPLOSIONS;

    const fireColor = color || 0xff6a00;
    exp.active = true;
    exp.age = 0;
    exp.maxLife = 0.68;
    exp.radius = Math.max(1.5, radius || 6.0);

    exp.group.position.copy(position);
    exp.group.visible = true;

    exp.fireMat.color.setHex(fireColor);
    exp.shockMat.color.setHex(0xff9a33);
    exp.shock2Mat.color.setHex(0xff5a1f);
    exp.coreMat.opacity = 1.0;
    exp.fireMat.opacity = 0.92;
    exp.shockMat.opacity = 0.95;
    exp.shock2Mat.opacity = 0.85;

    exp.coreMesh.scale.setScalar(0.3);
    exp.fireMesh.scale.setScalar(0.45);
    exp.shockMesh.scale.setScalar(0.3);
    exp.shock2Mesh.scale.setScalar(0.25);

    this._v3.set(0, 1, 0);
    this._spawnRing(position, this._v3, fireColor, 0.6, exp.radius * 2.0, 0.42, false);

    const emberCount = Math.max(14, Math.round(48 * this._particleScale));
    for (let i = 0; i < emberCount; i++) {
      const theta = Math.random() * TWO_PI;
      const phi = Math.acos(2 * Math.random() - 1);
      const sinPhi = Math.sin(phi);
      const spd = (5.5 + Math.random() * 14.5) * Math.min(1.5, exp.radius * 0.16);
      const vx = sinPhi * Math.cos(theta) * spd;
      const vy = Math.abs(Math.cos(phi)) * spd * 1.15 + 2.5;
      const vz = sinPhi * Math.sin(theta) * spd;

      const cHex = i % 4 === 0 ? 0xfff2b0 : i % 3 === 0 ? 0xffb347 : fireColor;
      this._emitSpark(
        position,
        vx,
        vy,
        vz,
        cHex,
        0.42 + Math.random() * 0.45,
        1.6 + Math.random() * 1.2,
        18.0,
        2.1
      );
    }

    if (this._maxDynamicLights > 0) {
      const slot = this._allocWorldLightSlot();
      this._spawnDynamicLight(slot, position, fireColor, 16.0, exp.radius * 3.0, 0.46);
    }
  }

  /**
   * Spawn a fiery scrap-metal & ember burst on machine elimination, or a heavy
   * detonation + shockwave ring when a Boss is destroyed.
   * @param {THREE.Vector3} position
   * @param {number} [color=0xff8c2a]
   * @param {boolean} [isBoss=false]
   */
  spawnEnemyDeath(position, color = 0xff8c2a, isBoss = false) {
    const deathColor = color || 0xff8c2a;

    if (isBoss) {
      this.spawnExplosion(position, 5.5, deathColor);
      this._v3.set(0.32, 0.88, 0.35).normalize();
      this._spawnRing(position, this._v3, 0xffd27d, 0.45, 9.5, 0.48, false);
      return;
    }

    const sparkCount = Math.max(10, Math.round(22 * this._particleScale));
    for (let i = 0; i < sparkCount; i++) {
      const theta = Math.random() * TWO_PI;
      const phi = Math.acos(2 * Math.random() - 1);
      const sinPhi = Math.sin(phi);
      const spd = 4.5 + Math.random() * 9.5;
      const vx = sinPhi * Math.cos(theta) * spd;
      const vy = Math.cos(phi) * spd * 0.85 + 2.4;
      const vz = sinPhi * Math.sin(theta) * spd;

      const cHex = i % 4 === 0 ? 0xfff0c2 : i % 2 === 0 ? 0xffb347 : deathColor;
      this._emitSpark(
        position,
        vx,
        vy,
        vz,
        cHex,
        0.26 + Math.random() * 0.28,
        1.15 + Math.random() * 0.85,
        14.0,
        2.8
      );
    }

    if (this.camera && this.camera.position) {
      this._v3.subVectors(this.camera.position, position);
      if (this._v3.lengthSq() > 1e-6) {
        this._v3.normalize();
      } else {
        this._v3.set(0, 1, 0);
      }
    } else {
      this._v3.set(0, 1, 0);
    }
    this._spawnRing(position, this._v3, deathColor, 0.22, 2.35, 0.28, false);

    if (this._maxDynamicLights > 1) {
      const slot = this._allocWorldLightSlot();
      this._spawnDynamicLight(slot, position, deathColor, 5.5, 6.5, 0.22);
    }
  }

  // ---------------------------------------------------------------------------
  // Quality Scaling, Per-Frame Update, Reset & Disposal
  // ---------------------------------------------------------------------------

  /**
   * Apply quality preset particle, decal, and dynamic light caps immediately.
   * Keeps persistent PointLights permanently visible (`intensity = 0` when inactive).
   * @param {object} qualityConfig
   */
  setQuality(qualityConfig) {
    if (!qualityConfig) return;
    const prevParticles = this._maxParticles;
    const prevDecals = this._maxDecals;

    this._maxParticles = Math.max(30, Math.min(MAX_SPARKS, qualityConfig.maxParticles ?? 220));
    this._maxDecals = Math.max(8, Math.min(MAX_DECALS, qualityConfig.maxDecals ?? 64));
    this._maxDynamicLights = Math.max(0, Math.min(MAX_DYNAMIC_LIGHTS, qualityConfig.dynamicLights ?? MAX_DYNAMIC_LIGHTS));
    this._particleScale = Math.max(0.35, Math.min(1.15, this._maxParticles / 320));

    if (this._maxParticles < prevParticles) {
      for (let i = this._maxParticles; i < MAX_SPARKS; i++) {
        if (this._sparks[i].active) {
          this._sparks[i].active = false;
          this._sparkMesh.setMatrixAt(i, this._zeroMatrix);
          this._sparksDirty = true;
        }
      }
      if (this._sparksDirty) {
        this._sparkMesh.instanceMatrix.needsUpdate = true;
      }
    }

    if (this._maxDecals < prevDecals) {
      for (let i = this._maxDecals; i < MAX_DECALS; i++) {
        this._decals[i].active = false;
        this._decals[i].mesh.visible = false;
      }
    }

    for (let i = this._maxDynamicLights; i < MAX_DYNAMIC_LIGHTS; i++) {
      this._lights[i].active = false;
      this._lights[i].light.intensity = 0;
    }
  }

  /**
   * Step all active VFX pools cleanly with zero allocations.
   * @param {number} dt
   */
  update(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    const clampedDt = dt > 0.05 ? 0.05 : dt;

    // 1. 1P Volumetric Gunpowder Muzzle Flash
    const mf = this._muzzleFlash;
    if (mf.active) {
      mf.age += clampedDt;
      if (mf.age >= mf.maxLife) {
        mf.active = false;
        mf.group.visible = false;
      } else {
        const t = mf.age / mf.maxLife;
        const fade = 1 - t;
        const s = mf.baseScale * (0.85 + 0.45 * Math.sin(t * Math.PI));
        mf.group.scale.setScalar(s);
        mf.starMat.opacity = fade * fade;
        mf.coreMat.opacity = fade;
      }
    }

    // 2. Persistent Dynamic World PointLights (modulate intensity only — never toggle visible!)
    for (let i = 0; i < MAX_DYNAMIC_LIGHTS; i++) {
      const slot = this._lights[i];
      if (!slot.active) continue;
      slot.age += clampedDt;
      if (slot.age >= slot.maxLife) {
        slot.active = false;
        slot.light.intensity = 0;
      } else {
        const fade = 1 - slot.age / slot.maxLife;
        slot.light.intensity = slot.peakIntensity * fade * fade;
      }
    }

    // 3. Warm Ballistic Bullet Tracers
    for (let i = 0; i < MAX_TRACERS; i++) {
      const tr = this._tracers[i];
      if (!tr.active) continue;
      tr.age += clampedDt;
      if (tr.age >= tr.maxLife) {
        tr.active = false;
        tr.group.visible = false;
      } else {
        const t = tr.age / tr.maxLife;
        const fade = 1 - t;
        const tailFrac = Math.min(0.88, t * 1.15);
        const remLen = Math.max(0.15, tr.totalLen * (1 - tailFrac));
        tr.group.position.copy(tr.start).addScaledVector(tr.dir, tr.totalLen * tailFrac);
        const w = tr.width * (0.45 + 0.55 * fade);
        tr.group.scale.set(w, w, remLen);
        tr.outerMat.opacity = 0.92 * fade;
        tr.coreMat.opacity = 0.98 * fade * fade;
      }
    }

    // 4. HV-7 Rail Lance Superheated Helical Beams & Dust Shockwave Rings
    for (let i = 0; i < MAX_RAIL_BEAMS; i++) {
      const rb = this._railBeams[i];
      if (!rb.active) continue;
      rb.age += clampedDt;
      if (rb.age >= rb.maxLife) {
        rb.active = false;
        rb.group.visible = false;
      } else {
        const t = rb.age / rb.maxLife;
        const fade = 1 - t;
        const coreThin = Math.max(0.05, 1 - t * 1.35);
        rb.coreMesh.scale.set(coreThin, coreThin, rb.length);
        rb.outerMesh.scale.set(1 + t * 1.1, 1 + t * 1.1, rb.length);
        rb.helixMesh.scale.set(1 + t * 1.85, 1 + t * 1.85, rb.length);
        rb.helixMesh.rotation.z += clampedDt * 14.0;

        rb.coreMat.opacity = Math.max(0, 1 - t * 1.5);
        rb.outerMat.opacity = 0.88 * fade * fade;
        rb.helixMat.opacity = 0.92 * fade;
        rb.ringMat.opacity = 0.90 * fade * fade;

        const ringScale = 0.35 + t * 3.8;
        for (let r = 0; r < rb.rings.length; r++) {
          rb.rings[r].scale.setScalar(ringScale);
        }
      }
    }

    // 5. Instanced Spinning Brass Shell Casings
    let anyCasingChanged = this._casingsDirty;
    this._casingsDirty = false;
    for (let i = 0; i < MAX_CASINGS; i++) {
      const c = this._casings[i];
      if (!c.active) continue;
      anyCasingChanged = true;
      c.age += clampedDt;

      if (c.age >= c.maxLife) {
        c.active = false;
        this._casingMesh.setMatrixAt(i, this._zeroMatrix);
        continue;
      }

      c.vel.y -= 16.5 * clampedDt;
      c.pos.addScaledVector(c.vel, clampedDt);

      if (c.pos.y <= c.floorY) {
        c.pos.y = c.floorY;
        if (c.vel.y < -0.5) {
          c.vel.y = -c.vel.y * 0.42;
          c.vel.x *= 0.68;
          c.vel.z *= 0.68;
          c.angVel.multiplyScalar(0.62);
        } else {
          c.vel.y = 0;
          c.vel.x *= Math.exp(-8 * clampedDt);
          c.vel.z *= Math.exp(-8 * clampedDt);
          c.angVel.multiplyScalar(Math.exp(-8 * clampedDt));
        }
      }

      c.rot.addScaledVector(c.angVel, clampedDt);
      this._euler.set(c.rot.x, c.rot.y, c.rot.z);
      this._quat.setFromEuler(this._euler);
      const shrink = c.age > c.maxLife * 0.72 ? 1 - (c.age - c.maxLife * 0.72) / (c.maxLife * 0.28) : 1.0;
      this._scale.setScalar(Math.max(0.01, shrink));
      this._mat4.compose(c.pos, this._quat, this._scale);
      this._casingMesh.setMatrixAt(i, this._mat4);
    }
    if (anyCasingChanged) {
      this._casingMesh.instanceMatrix.needsUpdate = true;
    }

    // 6. Instanced Velocity-Stretched Impact Sparks & Embers
    let anySparkChanged = this._sparksDirty;
    this._sparksDirty = false;
    for (let i = 0; i < this._maxParticles; i++) {
      const sp = this._sparks[i];
      if (!sp.active) continue;
      anySparkChanged = true;
      sp.age += clampedDt;

      if (sp.age >= sp.maxLife) {
        sp.active = false;
        this._sparkMesh.setMatrixAt(i, this._zeroMatrix);
        continue;
      }

      const dragFactor = Math.exp(-sp.drag * clampedDt);
      sp.vel.x *= dragFactor;
      sp.vel.z *= dragFactor;
      sp.vel.y = sp.vel.y * dragFactor - sp.gravity * clampedDt;
      sp.pos.addScaledVector(sp.vel, clampedDt);

      const t = sp.age / sp.maxLife;
      const fade = 1 - t;
      const speed = sp.vel.length();

      if (speed > 0.05) {
        this._orientZ(this._quat, sp.vel);
      } else {
        this._quat.identity();
      }
      const stretch = Math.min(3.5, 0.5 + speed * 0.16);
      const sz = sp.baseSize * fade;
      this._scale.set(sz, sz, sz * stretch);
      this._mat4.compose(sp.pos, this._quat, this._scale);
      this._sparkMesh.setMatrixAt(i, this._mat4);
    }
    if (anySparkChanged) {
      this._sparkMesh.instanceMatrix.needsUpdate = true;
    }

    // 7. Ring-Buffered Charred Bullet-Hole Decals (cooling ember -> charred ash -> fade)
    for (let i = 0; i < this._maxDecals; i++) {
      const d = this._decals[i];
      if (!d.active) continue;
      d.age += clampedDt;
      if (d.age >= d.maxLife) {
        d.active = false;
        d.mesh.visible = false;
      } else {
        if (d.age < 0.7) {
          const cool = Math.min(1, d.age / 0.65);
          d.mat.color.copy(d.hotColor).lerp(this._color.setHex(0x4a453f), cool);
        }
        if (d.age > d.maxLife - 2.5) {
          d.mat.opacity = 0.94 * Math.max(0, (d.maxLife - d.age) / 2.5);
        }
      }
    }

    // 8. Expanding Impact Shockwave Rings & Heated Shield Ripples
    for (let i = 0; i < MAX_RINGS; i++) {
      const ring = this._rings[i];
      if (!ring.active) continue;
      ring.age += clampedDt;
      if (ring.age >= ring.maxLife) {
        ring.active = false;
        ring.mesh.visible = false;
      } else {
        const t = ring.age / ring.maxLife;
        const easeOut = 1 - (1 - t) * (1 - t);
        const s = ring.startScale + (ring.endScale - ring.startScale) * easeOut;
        ring.mesh.scale.set(s, s, 1);
        ring.mat.opacity = (1 - t) * (1 - t);
      }
    }

    // 9. Multi-Layer Industrial Explosions
    for (let i = 0; i < MAX_EXPLOSIONS; i++) {
      const exp = this._explosions[i];
      if (!exp.active) continue;
      exp.age += clampedDt;
      if (exp.age >= exp.maxLife) {
        exp.active = false;
        exp.group.visible = false;
      } else {
        const t = exp.age / exp.maxLife;
        const easeOut = 1 - Math.pow(1 - t, 3);
        const fade = 1 - t;

        const coreS = exp.radius * 0.42 * (0.2 + easeOut * 0.85);
        const fireS = exp.radius * 0.68 * (0.18 + easeOut * 0.95);
        const shockS = exp.radius * (0.15 + easeOut * 1.15);

        exp.coreMesh.scale.setScalar(coreS);
        exp.fireMesh.scale.setScalar(fireS);
        exp.fireMesh.rotation.y += clampedDt * 2.4;
        exp.fireMesh.rotation.x += clampedDt * 1.6;
        exp.shockMesh.scale.setScalar(shockS);
        exp.shock2Mesh.scale.setScalar(shockS * 0.88);
        exp.shock2Mesh.rotation.z += clampedDt * 4.5;

        exp.coreMat.opacity = Math.max(0, 1 - t * 1.75);
        exp.fireMat.opacity = 0.90 * fade * fade;
        exp.shockMat.opacity = 0.95 * fade * fade;
        exp.shock2Mat.opacity = 0.82 * fade * fade;
      }
    }
  }

  /**
   * Immediately clear and hide all active pooled VFX (on match restart/reset).
   * Persistent PointLights stay `visible = true` with `intensity = 0`.
   */
  reset() {
    this._muzzleFlash.active = false;
    this._muzzleFlash.group.visible = false;

    for (let i = 0; i < MAX_DYNAMIC_LIGHTS; i++) {
      this._lights[i].active = false;
      this._lights[i].light.intensity = 0;
    }

    for (let i = 0; i < MAX_TRACERS; i++) {
      this._tracers[i].active = false;
      this._tracers[i].group.visible = false;
    }

    for (let i = 0; i < MAX_RAIL_BEAMS; i++) {
      this._railBeams[i].active = false;
      this._railBeams[i].group.visible = false;
    }

    for (let i = 0; i < MAX_CASINGS; i++) {
      this._casings[i].active = false;
      this._casingMesh.setMatrixAt(i, this._zeroMatrix);
    }
    this._casingMesh.instanceMatrix.needsUpdate = true;

    for (let i = 0; i < MAX_SPARKS; i++) {
      this._sparks[i].active = false;
      this._sparkMesh.setMatrixAt(i, this._zeroMatrix);
    }
    this._sparkMesh.instanceMatrix.needsUpdate = true;

    for (let i = 0; i < MAX_DECALS; i++) {
      this._decals[i].active = false;
      this._decals[i].mesh.visible = false;
    }

    for (let i = 0; i < MAX_RINGS; i++) {
      this._rings[i].active = false;
      this._rings[i].mesh.visible = false;
    }

    for (let i = 0; i < MAX_EXPLOSIONS; i++) {
      this._explosions[i].active = false;
      this._explosions[i].group.visible = false;
    }

    this._sparksDirty = false;
    this._casingsDirty = false;
  }

  /**
   * Cleanly remove all pooled VFX objects from scenes and free GPU memory.
   */
  dispose() {
    this.reset();

    this.viewmodelScene.remove(this._muzzleFlash.group);
    this.worldScene.remove(this._casingMesh);
    this.worldScene.remove(this._sparkMesh);

    for (let i = 0; i < MAX_DYNAMIC_LIGHTS; i++) this.worldScene.remove(this._lights[i].light);
    for (let i = 0; i < MAX_TRACERS; i++) this.worldScene.remove(this._tracers[i].group);
    for (let i = 0; i < MAX_RAIL_BEAMS; i++) this.worldScene.remove(this._railBeams[i].group);
    for (let i = 0; i < MAX_DECALS; i++) this.worldScene.remove(this._decals[i].mesh);
    for (let i = 0; i < MAX_RINGS; i++) this.worldScene.remove(this._rings[i].mesh);
    for (let i = 0; i < MAX_EXPLOSIONS; i++) this.worldScene.remove(this._explosions[i].group);

    for (let i = 0; i < this._geometries.length; i++) this._geometries[i].dispose();
    for (let i = 0; i < this._materials.length; i++) this._materials[i].dispose();
    for (let i = 0; i < this._textures.length; i++) this._textures[i].dispose();

    this._geometries.length = 0;
    this._materials.length = 0;
    this._textures.length = 0;
  }
}
  __exports.VfxManager = VfxManager;
});
