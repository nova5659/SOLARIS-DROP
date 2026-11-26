// Module: src/ai/EnemyModelFactory.js
__define("src/ai/EnemyModelFactory.js", (__exports, __require) => {
/**
 * AETHER DROP: RECLAIM EARTH — Post-Apocalyptic Feral Scrap-Machine 3D Model Factory
 * Sculpted multi-part articulated silhouettes built with THREE.ExtrudeGeometry,
 * THREE.LatheGeometry, THREE.TubeGeometry, and procedural Canvas PBR corroded iron,
 * rust, weld-bead, soot, industrial blast-shield & furnace-red optic textures.
 *
 * ZERO NEON & ZERO MeshPhysicalMaterial — strictly weathered rust, corroded cast iron,
 * exposed pistons/exhausts, bolted steel plates, and high-contrast furnace-red/amber optics.
 *
 * Shared GPU geometries & procedural textures are cached on the factory instance
 * while per-enemy materials allow crisp hit-flashes, shield ripples, phase shifts,
 * death-dissolve animations, and zero-stutter rig pooling without affecting siblings.
 */
class EnemyModelFactory {
  constructor() {
    this._geoCache = new Map();
    this._textures = this._createProceduralTextures();

    this._contactShadowMat = new THREE.MeshBasicMaterial({
      color: 0x080605,
      map: this._textures.contactShadow,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    });
  }

  /**
   * Generate shared procedural Canvas PBR textures:
   * - armorWear: subtle corroded iron, rust stains, scratched paint & exhaust soot albedo map
   * - armorBump: pitted cast iron, bolted plate seams, raised rivets, weld beads & louver vents
   * - armorRoughness: bright bare-metal scratches vs matte soot & oxidized rust patches
   * - blastShield: welded heavy industrial blast shield (diagonal hazard rivets, steel grid cage,
   *   and glowing heated thermal-amber impact lattice)
   * - visorGrid: glowing furnace-red optical scanner matrix
   * - contactShadow: soft radial ground contact shadow disc
   * @private
   */
  _createProceduralTextures() {
    if (typeof document === 'undefined') {
      return {
        armorWear: null,
        armorBump: null,
        armorRoughness: null,
        blastShield: null,
        hexShield: null,
        visorGrid: null,
        contactShadow: null,
      };
    }

    const size = 512;

    // 1. Corroded, pitted cast-iron & rust armor albedo/bump/roughness trio (512x512)
    const wearCanvas = document.createElement('canvas');
    wearCanvas.width = size;
    wearCanvas.height = size;
    const wCtx = wearCanvas.getContext('2d');

    const bumpCanvas = document.createElement('canvas');
    bumpCanvas.width = size;
    bumpCanvas.height = size;
    const bCtx = bumpCanvas.getContext('2d');

    const roughCanvas = document.createElement('canvas');
    roughCanvas.width = size;
    roughCanvas.height = size;
    const rCtx = roughCanvas.getContext('2d');

    // Neutral light warm steel base so archetype colors tint cleanly while showing wear
    wCtx.fillStyle = '#d8d0c8';
    wCtx.fillRect(0, 0, size, size);
    bCtx.fillStyle = '#848484';
    bCtx.fillRect(0, 0, size, size);
    rCtx.fillStyle = '#9a9a9a'; // matte-satin weathered cast iron
    rCtx.fillRect(0, 0, size, size);

    // Pitted cast-iron micro-grain & corrosion flecks
    for (let i = 0; i < 1900; i++) {
      const px = (i * 197 + (i % 13) * 17) % size;
      const py = (i * 113 + (i % 7) * 29) % size;
      const r = 1 + (i % 3);
      const isPit = i % 3 !== 0;

      if (isPit) {
        bCtx.fillStyle = i % 2 === 0 ? '#4d4d4d' : '#656565';
        bCtx.fillRect(px, py, r, r);
        rCtx.fillStyle = '#c8c8c8';
        rCtx.fillRect(px, py, r, r);
        wCtx.fillStyle = i % 4 === 0 ? '#8c4c2b' : '#aba199';
        wCtx.fillRect(px, py, r + 1, r + 1);
      } else {
        // Oxidation rust bloom spots
        wCtx.fillStyle = 'rgba(155, 76, 36, 0.24)';
        wCtx.fillRect(px, py, 6 + (i % 10), 4 + (i % 8));
        rCtx.fillStyle = 'rgba(225, 225, 225, 0.35)';
        rCtx.fillRect(px, py, 6 + (i % 10), 4 + (i % 8));
      }
    }

    // Bolted steel armor sub-plates with recessed weld seams & corner dome rivets
    const panels = [
      [14, 14, 228, 228],
      [268, 14, 228, 142],
      [268, 172, 228, 70],
      [14, 268, 152, 228],
      [182, 268, 314, 110],
      [182, 394, 314, 102],
    ];

    for (let i = 0; i < panels.length; i++) {
      const [px, py, pw, ph] = panels[i];

      // Deep dark panel seam & exhaust soot bleed
      wCtx.fillStyle = '#524943';
      wCtx.fillRect(px - 5, py - 5, pw + 10, ph + 10);
      bCtx.fillStyle = '#1b1b1b';
      bCtx.fillRect(px - 5, py - 5, pw + 10, ph + 10);
      rCtx.fillStyle = '#e8e8e8';
      rCtx.fillRect(px - 5, py - 5, pw + 10, ph + 10);

      // Weld bead border ripples around panel perimeter
      bCtx.fillStyle = '#dadada';
      bCtx.fillRect(px - 1, py - 1, pw + 2, ph + 2);
      rCtx.fillStyle = '#555555';
      rCtx.fillRect(px - 1, py - 1, pw + 2, ph + 2);

      for (let wx = px; wx < px + pw; wx += 10) {
        bCtx.beginPath();
        bCtx.arc(wx, py, 3.2, 0, Math.PI * 2);
        bCtx.arc(wx, py + ph, 3.2, 0, Math.PI * 2);
        bCtx.fillStyle = '#d4d4d4';
        bCtx.fill();
      }

      // Main worn plate face
      wCtx.fillStyle = '#ded6ce';
      wCtx.fillRect(px + 4, py + 4, pw - 8, ph - 8);
      bCtx.fillStyle = '#929292';
      bCtx.fillRect(px + 4, py + 4, pw - 8, ph - 8);
      rCtx.fillStyle = '#969696';
      rCtx.fillRect(px + 4, py + 4, pw - 8, ph - 8);

      // Rust streaking down from rivets & top edge
      const rustGrad = wCtx.createLinearGradient(px, py, px, py + Math.min(72, ph));
      rustGrad.addColorStop(0, 'rgba(130, 58, 24, 0.42)');
      rustGrad.addColorStop(1, 'rgba(130, 58, 24, 0.0)');
      wCtx.fillStyle = rustGrad;
      wCtx.fillRect(px + 4, py + 4, pw - 8, Math.min(72, ph - 8));

      // Heavy dome-head rivets around plate edges
      const inset = 14;
      const rivets = [
        [px + inset, py + inset],
        [px + pw * 0.5, py + inset],
        [px + pw - inset, py + inset],
        [px + inset, py + ph - inset],
        [px + pw * 0.5, py + ph - inset],
        [px + pw - inset, py + ph - inset],
      ];
      for (let c = 0; c < rivets.length; c++) {
        const [rx, ry] = rivets[c];
        bCtx.beginPath();
        bCtx.arc(rx, ry, 5.2, 0, Math.PI * 2);
        bCtx.fillStyle = '#262626';
        bCtx.fill();
        bCtx.beginPath();
        bCtx.arc(rx, ry, 3.4, 0, Math.PI * 2);
        bCtx.fillStyle = '#efefef';
        bCtx.fill();

        wCtx.beginPath();
        wCtx.arc(rx, ry, 4.0, 0, Math.PI * 2);
        wCtx.fillStyle = '#6c5a4f';
        wCtx.fill();
      }
    }

    // Scratched paint / bare-steel gouge marks (glossy steel core + raised bump edge)
    for (let s = 0; s < 42; s++) {
      const sx = (s * 89 + 23) % (size - 60);
      const sy = (s * 131 + 19) % (size - 60);
      const dx = 18 + (s % 5) * 14;
      const dy = (s % 2 === 0 ? 1 : -1) * (8 + (s % 4) * 7);

      bCtx.strokeStyle = '#383838';
      bCtx.lineWidth = 2.6;
      bCtx.beginPath();
      bCtx.moveTo(sx, sy);
      bCtx.lineTo(sx + dx, sy + dy);
      bCtx.stroke();

      rCtx.strokeStyle = '#363636'; // bright metallic scratch
      rCtx.lineWidth = 2.0;
      rCtx.beginPath();
      rCtx.moveTo(sx, sy);
      rCtx.lineTo(sx + dx, sy + dy);
      rCtx.stroke();

      wCtx.strokeStyle = '#f2ede6';
      wCtx.lineWidth = 1.8;
      wCtx.beginPath();
      wCtx.moveTo(sx, sy);
      wCtx.lineTo(sx + dx, sy + dy);
      wCtx.stroke();
    }

    // Exhaust soot & cooling louver vents on plates 2 & 5
    for (let v = 0; v < 7; v++) {
      const vx = 292 + v * 28;
      bCtx.fillStyle = '#1e1e1e';
      bCtx.fillRect(vx, 184, 14, 44);
      rCtx.fillStyle = '#efefef';
      rCtx.fillRect(vx, 184, 14, 44);
      wCtx.fillStyle = '#342c28';
      wCtx.fillRect(vx, 184, 14, 44);
    }
    const sootGrad = wCtx.createRadialGradient(392, 448, 12, 392, 448, 130);
    sootGrad.addColorStop(0, 'rgba(26, 20, 18, 0.72)');
    sootGrad.addColorStop(1, 'rgba(26, 20, 18, 0.0)');
    wCtx.fillStyle = sootGrad;
    wCtx.fillRect(182, 394, 314, 102);

    for (let v = 0; v < 8; v++) {
      const vx = 204 + v * 34;
      bCtx.fillStyle = '#1e1e1e';
      bCtx.fillRect(vx, 422, 18, 50);
      rCtx.fillStyle = '#f0f0f0';
      rCtx.fillRect(vx, 422, 18, 50);
    }

    const armorWear = new THREE.CanvasTexture(wearCanvas);
    armorWear.colorSpace = THREE.SRGBColorSpace;
    armorWear.wrapS = THREE.RepeatWrapping;
    armorWear.wrapT = THREE.RepeatWrapping;
    armorWear.repeat.set(2, 2);

    const armorBump = new THREE.CanvasTexture(bumpCanvas);
    armorBump.wrapS = THREE.RepeatWrapping;
    armorBump.wrapT = THREE.RepeatWrapping;
    armorBump.repeat.set(2, 2);

    const armorRoughness = new THREE.CanvasTexture(roughCanvas);
    armorRoughness.wrapS = THREE.RepeatWrapping;
    armorRoughness.wrapT = THREE.RepeatWrapping;
    armorRoughness.repeat.set(2, 2);

    // 2. Welded Heavy Industrial Blast Shield Texture (512x512 RGBA — zero cyan neon!)
    const shieldCanvas = document.createElement('canvas');
    shieldCanvas.width = size;
    shieldCanvas.height = size;
    const sCtx = shieldCanvas.getContext('2d');

    sCtx.clearRect(0, 0, size, size);

    // Heated thermal-amber impact lattice glow backdrop
    const heatGrad = sCtx.createRadialGradient(
      size * 0.5,
      size * 0.5,
      size * 0.06,
      size * 0.5,
      size * 0.5,
      size * 0.56
    );
    heatGrad.addColorStop(0, 'rgba(255, 138, 35, 0.52)');
    heatGrad.addColorStop(0.55, 'rgba(220, 74, 18, 0.44)');
    heatGrad.addColorStop(0.88, 'rgba(92, 36, 18, 0.72)');
    heatGrad.addColorStop(1, 'rgba(42, 24, 18, 0.96)');
    sCtx.fillStyle = heatGrad;
    sCtx.fillRect(0, 0, size, size);

    // Glowing heated thermal-amber impact lattice (diamond + hex thermal grid)
    const cell = 34;
    sCtx.lineWidth = 3.0;
    for (let y = -cell; y < size + cell; y += cell) {
      for (let x = -cell; x < size + cell; x += cell) {
        const hot = ((x / cell + y / cell) & 3) === 0;
        sCtx.strokeStyle = hot ? 'rgba(255, 175, 65, 0.92)' : 'rgba(255, 102, 24, 0.68)';
        sCtx.beginPath();
        sCtx.moveTo(x, y);
        sCtx.lineTo(x + cell, y + cell);
        sCtx.moveTo(x + cell, y);
        sCtx.lineTo(x, y + cell);
        sCtx.stroke();
      }
    }

    // Welded heavy steel grid cage bars over the heated thermal lattice
    sCtx.strokeStyle = 'rgba(34, 26, 22, 0.94)';
    sCtx.lineWidth = 7;
    for (let g = 64; g < size; g += 64) {
      sCtx.beginPath();
      sCtx.moveTo(g, 0);
      sCtx.lineTo(g, size);
      sCtx.stroke();

      sCtx.beginPath();
      sCtx.moveTo(0, g);
      sCtx.lineTo(size, g);
      sCtx.stroke();
    }
    // Metallic rim highlights on steel cage intersections
    sCtx.strokeStyle = 'rgba(130, 104, 86, 0.65)';
    sCtx.lineWidth = 1.8;
    for (let g = 64; g < size; g += 64) {
      sCtx.beginPath();
      sCtx.moveTo(g - 3, 0);
      sCtx.lineTo(g - 3, size);
      sCtx.moveTo(0, g - 3);
      sCtx.lineTo(size, g - 3);
      sCtx.stroke();
    }

    // Diagonal hazard stripe steel perimeter bands (top, bottom, left, right)
    const band = 40;
    sCtx.save();
    sCtx.beginPath();
    sCtx.rect(0, 0, size, size);
    sCtx.rect(band, band, size - band * 2, size - band * 2);
    sCtx.clip('evenodd');

    sCtx.fillStyle = '#241d19';
    sCtx.fillRect(0, 0, size, size);
    sCtx.fillStyle = '#c26b14';
    for (let d = -size; d < size * 2; d += 38) {
      sCtx.beginPath();
      sCtx.moveTo(d, 0);
      sCtx.lineTo(d + 19, 0);
      sCtx.lineTo(d - size + 19, size);
      sCtx.lineTo(d - size, size);
      sCtx.closePath();
      sCtx.fill();
    }
    // Grime & soot over hazard border
    sCtx.fillStyle = 'rgba(28, 20, 16, 0.34)';
    sCtx.fillRect(0, 0, size, size);
    sCtx.restore();

    // Heavy welded steel perimeter frame + diagonal corner hazard rivets
    sCtx.strokeStyle = '#3b302a';
    sCtx.lineWidth = 12;
    sCtx.strokeRect(band, band, size - band * 2, size - band * 2);

    const frameRivets = [20, 84, 148, 212, 276, 340, 404, 468, 492];
    for (let i = 0; i < frameRivets.length; i++) {
      const p = frameRivets[i];
      const pts = [
        [p, 20],
        [p, size - 20],
        [20, p],
        [size - 20, p],
      ];
      for (let k = 0; k < pts.length; k++) {
        const [rx, ry] = pts[k];
        sCtx.beginPath();
        sCtx.arc(rx, ry, 5.5, 0, Math.PI * 2);
        sCtx.fillStyle = '#181210';
        sCtx.fill();
        sCtx.beginPath();
        sCtx.arc(rx - 1, ry - 1, 3.2, 0, Math.PI * 2);
        sCtx.fillStyle = '#8b7768';
        sCtx.fill();
      }
    }

    const blastShield = new THREE.CanvasTexture(shieldCanvas);
    blastShield.colorSpace = THREE.SRGBColorSpace;
    blastShield.wrapS = THREE.ClampToEdgeWrapping;
    blastShield.wrapT = THREE.ClampToEdgeWrapping;

    // 3. Glowing Furnace-Red Optical Scanner Grid Texture (256x128)
    const visorCanvas = document.createElement('canvas');
    visorCanvas.width = 256;
    visorCanvas.height = 128;
    const vCtx = visorCanvas.getContext('2d');
    vCtx.fillStyle = '#ff6b4a';
    vCtx.fillRect(0, 0, 256, 128);

    // Hot furnace center strip
    const vGrad = vCtx.createLinearGradient(0, 0, 0, 128);
    vGrad.addColorStop(0, '#a81c0e');
    vGrad.addColorStop(0.5, '#ffdfcf');
    vGrad.addColorStop(1, '#a81c0e');
    vCtx.fillStyle = vGrad;
    vCtx.fillRect(0, 0, 256, 128);

    // Dark armored aperture louver slits
    vCtx.fillStyle = 'rgba(38, 6, 2, 0.45)';
    for (let y = 0; y < 128; y += 8) {
      vCtx.fillRect(0, y, 256, 2);
    }
    vCtx.strokeStyle = 'rgba(42, 6, 2, 0.36)';
    vCtx.lineWidth = 2;
    for (let x = 0; x < 256; x += 22) {
      vCtx.beginPath();
      vCtx.moveTo(x, 0);
      vCtx.lineTo(x, 128);
      vCtx.stroke();
    }
    const visorGrid = new THREE.CanvasTexture(visorCanvas);
    visorGrid.colorSpace = THREE.SRGBColorSpace;
    visorGrid.wrapS = THREE.RepeatWrapping;
    visorGrid.wrapT = THREE.RepeatWrapping;

    // 4. Radial Grounded Contact Shadow Disc Texture (128x128)
    const shCanvas = document.createElement('canvas');
    shCanvas.width = 128;
    shCanvas.height = 128;
    const shCtx = shCanvas.getContext('2d');
    const shGrad = shCtx.createRadialGradient(64, 64, 8, 64, 64, 62);
    shGrad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
    shGrad.addColorStop(0.55, 'rgba(255, 255, 255, 0.55)');
    shGrad.addColorStop(1.0, 'rgba(255, 255, 255, 0.0)');
    shCtx.fillStyle = shGrad;
    shCtx.fillRect(0, 0, 128, 128);
    const contactShadow = new THREE.CanvasTexture(shCanvas);

    return {
      armorWear,
      armorBump,
      armorRoughness,
      blastShield,
      hexShield: blastShield,
      visorGrid,
      contactShadow,
    };
  }

  /**
   * Retrieve or build & cache a shared BufferGeometry by key.
   * @private
   */
  _getGeo(key, builderFn) {
    let geo = this._geoCache.get(key);
    if (!geo) {
      geo = builderFn();
      this._geoCache.set(key, geo);
    }
    return geo;
  }

  /**
   * Build a centered beveled ExtrudeGeometry from a 2D polygon point list.
   * @private
   */
  _makeExtrudedPoly(key, points, depth, bevelThickness = 0.025, bevelSize = 0.02, bevelSegments = 2) {
    return this._getGeo(key, () => {
      const shape = new THREE.Shape();
      shape.moveTo(points[0][0], points[0][1]);
      for (let i = 1; i < points.length; i++) {
        shape.lineTo(points[i][0], points[i][1]);
      }
      shape.closePath();

      const geo = new THREE.ExtrudeGeometry(shape, {
        depth,
        bevelEnabled: true,
        bevelThickness,
        bevelSize,
        bevelSegments,
        curveSegments: 6,
      });
      geo.translate(0, 0, -depth * 0.5);
      geo.computeVertexNormals();
      return geo;
    });
  }

  /**
   * Build a cached LatheGeometry from [radius, y] pairs.
   * @private
   */
  _makeLathe(key, profilePairs, segments = 18) {
    return this._getGeo(key, () => {
      const pts = profilePairs.map(([r, y]) => new THREE.Vector2(r, y));
      const geo = new THREE.LatheGeometry(pts, segments);
      geo.computeVertexNormals();
      return geo;
    });
  }

  /**
   * Build a cached TubeGeometry from 3D control point triples.
   * @private
   */
  _makeTube(key, pointTriples, radius = 0.025, tubularSegments = 12, radialSegments = 7) {
    return this._getGeo(key, () => {
      const pts = pointTriples.map(([x, y, z]) => new THREE.Vector3(x, y, z));
      const curve = new THREE.CatmullRomCurve3(pts);
      return new THREE.TubeGeometry(curve, tubularSegments, radius, radialSegments, false);
    });
  }

  /**
   * Create per-enemy material palette sharing the procedural PBR maps.
   * Strictly MeshStandardMaterial — corroded iron, rusted plates, greased rubber,
   * steel pistons, and high-contrast furnace-red/amber weakpoints.
   * @private
   */
  _createPalette(archetype) {
    const { armorWear, armorBump, armorRoughness, visorGrid } = this._textures;

    const isAegisOrbital =
      archetype.id === 'interceptor_drone' ||
      archetype.id === 'shock_breacher' ||
      archetype.id === 'rail_warden' ||
      archetype.id === 'mortar_artillery' ||
      archetype.id === 'vanguard_assassin' ||
      archetype.id === 'aegis_overlord_boss';

    const primaryArmor = isAegisOrbital
      ? new THREE.MeshStandardMaterial({
          color: archetype.id === 'vanguard_assassin' ? 0x1e1b2e : 0xeaf2fb,
          metalness: 0.78,
          roughness: 0.20,
          emissive: new THREE.Color(archetype.id === 'vanguard_assassin' ? 0x1f0a28 : 0x0c243e),
          emissiveIntensity: 0.28,
        })
      : new THREE.MeshStandardMaterial({
          color: 0xa8b4c0,
          map: armorWear,
          metalness: 0.52,
          roughness: 0.48,
          bumpMap: armorBump,
          bumpScale: 0.042,
          roughnessMap: armorRoughness,
          emissive: new THREE.Color(0x161e26),
          emissiveIntensity: 0.22,
        });

    const coloredPlate = isAegisOrbital
      ? new THREE.MeshStandardMaterial({
          color: archetype.color,
          metalness: 0.74,
          roughness: 0.22,
          emissive: new THREE.Color(archetype.color),
          emissiveIntensity: 0.52,
        })
      : new THREE.MeshStandardMaterial({
          color: archetype.color,
          map: armorWear,
          metalness: 0.42,
          roughness: 0.48,
          bumpMap: armorBump,
          bumpScale: 0.036,
          roughnessMap: armorRoughness,
          emissive: new THREE.Color(archetype.color),
          emissiveIntensity: 0.28,
        });

    const darkFrame = isAegisOrbital
      ? new THREE.MeshStandardMaterial({
          color: 0x0b1222,
          metalness: 0.88,
          roughness: 0.26,
          emissive: new THREE.Color(0x06101f),
          emissiveIntensity: 0.15,
        })
      : new THREE.MeshStandardMaterial({
          color: 0x201b18,
          metalness: 0.78,
          roughness: 0.58,
          bumpMap: armorBump,
          bumpScale: 0.024,
          roughnessMap: armorRoughness,
          emissive: new THREE.Color(0x000000),
          emissiveIntensity: 0.0,
        });

    const pistonSteel = new THREE.MeshStandardMaterial({
      color: archetype.id === 'aegis_overlord_boss' ? 0xf59e0b : isAegisOrbital ? 0xf1f5f9 : 0xcbd5e1,
      metalness: 0.92,
      roughness: 0.20,
      emissive: new THREE.Color(archetype.id === 'aegis_overlord_boss' ? 0x4a2a00 : 0x000000),
      emissiveIntensity: archetype.id === 'aegis_overlord_boss' ? 0.35 : 0.0,
    });

    const cableMat = isAegisOrbital
      ? new THREE.MeshStandardMaterial({
          color: 0x164e63,
          metalness: 0.55,
          roughness: 0.35,
          emissive: new THREE.Color(archetype.accentColor),
          emissiveIntensity: 0.45,
        })
      : new THREE.MeshStandardMaterial({
          color: 0x2b231f,
          metalness: 0.22,
          roughness: 0.78,
          emissive: new THREE.Color(0x000000),
          emissiveIntensity: 0.0,
        });

    const accentGlow = new THREE.MeshStandardMaterial({
      color: archetype.accentColor,
      emissive: new THREE.Color(archetype.accentColor),
      emissiveIntensity: isAegisOrbital ? 3.1 : 2.2,
      metalness: 0.15,
      roughness: 0.20,
      fog: false,
    });

    const opticColor = isAegisOrbital
      ? archetype.id === 'vanguard_assassin'
        ? 0xf43f5e
        : archetype.id === 'mortar_artillery'
        ? 0xe879f9
        : archetype.id === 'aegis_overlord_boss'
        ? 0xfbbf24
        : 0x00f0ff
      : archetype.id === 'tactical_trooper'
      ? 0xff3b14
      : 0xff220c;

    const weakpointGlow = new THREE.MeshStandardMaterial({
      color: isAegisOrbital ? 0xffffff : 0xffe4d6,
      map: visorGrid,
      emissive: new THREE.Color(opticColor),
      emissiveIntensity: 4.0,
      metalness: 0.1,
      roughness: 0.14,
      fog: false,
    });

    const holoEnergy = new THREE.MeshStandardMaterial({
      color: archetype.accentColor,
      emissive: new THREE.Color(archetype.accentColor),
      emissiveIntensity: 2.6,
      metalness: 0.1,
      roughness: 0.15,
      transparent: true,
      opacity: 0.52,
      side: THREE.DoubleSide,
      depthWrite: false,
      fog: false,
    });

    const flashMaterials = [
      primaryArmor,
      coloredPlate,
      darkFrame,
      pistonSteel,
      cableMat,
      accentGlow,
      weakpointGlow,
      holoEnergy,
    ];

    return {
      primaryArmor,
      coloredPlate,
      darkFrame,
      pistonSteel,
      cableMat,
      accentGlow,
      weakpointGlow,
      holoEnergy,
      flashMaterials,
    };
  }

  /**
   * Create diegetic floating world-space health bar mounted cleanly above enemy head.
   * @private
   */
  _createHealthBar(archetype, ownedMaterials) {
    const isHeavy =
      archetype.id === 'heavy_enforcer' ||
      archetype.id === 'rail_warden' ||
      archetype.id === 'mortar_artillery';
    const barWidth = archetype.isBoss ? 2.25 : isHeavy ? 1.15 : 0.86;
    const barHeight = archetype.isBoss ? 0.16 : 0.085;

    const bgGeo = this._getGeo(`hp_bg_${archetype.id}`, () => {
      return new THREE.PlaneGeometry(barWidth + 0.07, barHeight + 0.055);
    });
    const fillGeo = this._getGeo(`hp_fill_${archetype.id}`, () => {
      const g = new THREE.PlaneGeometry(barWidth, barHeight);
      g.translate(barWidth * 0.5, 0, 0);
      return g;
    });

    const bgMat = new THREE.MeshBasicMaterial({
      color: 0x120e0c,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const fillHex = isHeavy ? archetype.accentColor : archetype.color;
    const fillMat = new THREE.MeshBasicMaterial({
      color: fillHex,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    ownedMaterials.push(bgMat, fillMat);

    const healthBarBg = new THREE.Mesh(bgGeo, bgMat);
    healthBarBg.position.set(0, archetype.height + 0.34, 0);
    healthBarBg.visible = false;
    healthBarBg.renderOrder = 10;

    const healthBarFill = new THREE.Mesh(fillGeo, fillMat);
    healthBarFill.position.set(-barWidth * 0.5, 0, 0.004);
    healthBarFill.renderOrder = 11;
    healthBarBg.add(healthBarFill);

    return { healthBarBg, healthBarFill };
  }

  /**
   * Build a sculpted, articulated Feral Scrap-Machine rig for the requested archetype.
   * @param {import('../config/waves.js').ENEMY_ARCHETYPES[keyof typeof import('../config/waves.js').ENEMY_ARCHETYPES]} archetype
   */
  createEnemyRig(archetype) {
    const root = new THREE.Group();
    root.name = `enemy_${archetype.id}`;

    const bodyGroup = new THREE.Group();
    const headGroup = new THREE.Group();
    const headAnchor = new THREE.Object3D();
    const leftArm = new THREE.Group();
    const rightArm = new THREE.Group();
    const leftLeg = new THREE.Group();
    const rightLeg = new THREE.Group();
    const weaponMuzzle = new THREE.Object3D();
    let leftWeaponMuzzle = null;

    const rotors = [];
    const coreRings = [];
    let shieldMesh = null;
    let laserLine = null;

    const palette = this._createPalette(archetype);
    const ownedMaterials = [...palette.flashMaterials];
    const ownedGeometries = [];

    root.add(bodyGroup);

    switch (archetype.id) {
      case 'rusher_drone':
        this._buildRusherDrone(
          palette,
          bodyGroup,
          headGroup,
          headAnchor,
          leftArm,
          rightArm,
          weaponMuzzle,
          rotors
        );
        break;
      case 'tactical_trooper':
        this._buildTacticalTrooper(
          palette,
          bodyGroup,
          headGroup,
          headAnchor,
          leftArm,
          rightArm,
          leftLeg,
          rightLeg,
          weaponMuzzle
        );
        break;
      case 'heavy_enforcer':
        shieldMesh = this._buildHeavyEnforcer(
          palette,
          ownedMaterials,
          bodyGroup,
          headGroup,
          headAnchor,
          leftArm,
          rightArm,
          leftLeg,
          rightLeg,
          weaponMuzzle
        );
        break;
      case 'sniper_stalker':
        laserLine = this._buildSniperStalker(
          palette,
          ownedMaterials,
          ownedGeometries,
          root,
          bodyGroup,
          headGroup,
          headAnchor,
          leftArm,
          rightArm,
          leftLeg,
          rightLeg,
          weaponMuzzle
        );
        break;
      case 'cyber_mech_boss': {
        const bossExtras = this._buildCyberMechBoss(
          palette,
          ownedMaterials,
          bodyGroup,
          headGroup,
          headAnchor,
          leftArm,
          rightArm,
          leftLeg,
          rightLeg,
          weaponMuzzle,
          rotors,
          coreRings
        );
        shieldMesh = bossExtras.shieldMesh;
        leftWeaponMuzzle = bossExtras.leftWeaponMuzzle;
        break;
      }
      case 'interceptor_drone':
        leftWeaponMuzzle = this._buildInterceptorDrone(
          palette,
          bodyGroup,
          headGroup,
          headAnchor,
          leftArm,
          rightArm,
          weaponMuzzle,
          rotors
        );
        break;
      case 'shock_breacher':
        this._buildShockBreacher(
          palette,
          bodyGroup,
          headGroup,
          headAnchor,
          leftArm,
          rightArm,
          leftLeg,
          rightLeg,
          weaponMuzzle
        );
        break;
      case 'rail_warden':
        shieldMesh = this._buildRailWarden(
          palette,
          ownedMaterials,
          bodyGroup,
          headGroup,
          headAnchor,
          leftArm,
          rightArm,
          leftLeg,
          rightLeg,
          weaponMuzzle
        );
        break;
      case 'mortar_artillery':
        laserLine = this._buildMortarArtillery(
          palette,
          ownedMaterials,
          ownedGeometries,
          root,
          bodyGroup,
          headGroup,
          headAnchor,
          leftArm,
          rightArm,
          leftLeg,
          rightLeg,
          weaponMuzzle
        );
        break;
      case 'vanguard_assassin':
        leftWeaponMuzzle = this._buildVanguardAssassin(
          palette,
          bodyGroup,
          headGroup,
          headAnchor,
          leftArm,
          rightArm,
          leftLeg,
          rightLeg,
          weaponMuzzle
        );
        break;
      case 'aegis_overlord_boss': {
        const overlordExtras = this._buildAegisOverlordBoss(
          palette,
          ownedMaterials,
          bodyGroup,
          headGroup,
          headAnchor,
          leftArm,
          rightArm,
          leftLeg,
          rightLeg,
          weaponMuzzle,
          rotors,
          coreRings
        );
        shieldMesh = overlordExtras.shieldMesh;
        leftWeaponMuzzle = overlordExtras.leftWeaponMuzzle;
        break;
      }
      default:
        this._buildTacticalTrooper(
          palette,
          bodyGroup,
          headGroup,
          headAnchor,
          leftArm,
          rightArm,
          leftLeg,
          rightLeg,
          weaponMuzzle
        );
        break;
    }

    // Grounded radial contact shadow disc for all ground-based enemies
    if (!archetype.isFlying) {
      const shadowGeo = this._getGeo('contact_shadow_disc', () => {
        const g = new THREE.CircleGeometry(1, 20);
        g.rotateX(-Math.PI * 0.5);
        return g;
      });
      const shadowRadius = archetype.isBoss
        ? archetype.id === 'aegis_overlord_boss'
          ? 2.55
          : 2.35
        : archetype.id === 'heavy_enforcer' || archetype.id === 'rail_warden'
        ? 1.18
        : archetype.id === 'mortar_artillery'
        ? 1.14
        : archetype.id === 'shock_breacher'
        ? 0.92
        : archetype.id === 'sniper_stalker' || archetype.id === 'vanguard_assassin'
        ? 0.72
        : 0.78;
      const shadowDisc = new THREE.Mesh(shadowGeo, this._contactShadowMat);
      shadowDisc.position.set(0, 0.03, 0);
      shadowDisc.scale.set(shadowRadius, 1, shadowRadius);
      shadowDisc.castShadow = false;
      shadowDisc.receiveShadow = false;
      shadowDisc.renderOrder = 1;
      root.add(shadowDisc);
    }

    // Cast & receive shadows cleanly across solid sculpted armor meshes
    root.traverse((obj) => {
      if (obj.isMesh && obj !== shieldMesh) {
        const mat = obj.material;
        if (mat && !mat.transparent) {
          obj.castShadow = true;
          obj.receiveShadow = true;
        }
      }
    });

    const { healthBarBg, healthBarFill } = this._createHealthBar(archetype, ownedMaterials);
    root.add(healthBarBg);

    // Store base emissive state on each flash material for zero-GC flash recovery & pool reset
    for (let i = 0; i < palette.flashMaterials.length; i++) {
      const m = palette.flashMaterials[i];
      m.userData.baseEmissive = m.emissive.clone();
      m.userData.baseEmissiveIntensity = m.emissiveIntensity;
    }

    const dispose = () => {
      for (let i = 0; i < ownedMaterials.length; i++) {
        ownedMaterials[i].dispose();
      }
      for (let i = 0; i < ownedGeometries.length; i++) {
        ownedGeometries[i].dispose();
      }
    };

    return {
      root,
      bodyGroup,
      headGroup,
      headAnchor,
      leftArm,
      rightArm,
      leftLeg,
      rightLeg,
      weaponMuzzle,
      leftWeaponMuzzle,
      shieldMesh,
      rotors,
      coreRings,
      laserLine,
      healthBarFill,
      healthBarBg,
      flashMaterials: palette.flashMaterials,
      dispose,
    };
  }

  // ===========================================================================
  // 1. SCAVENGER DRONE (Rusted Ducted Quad-Fan Chassis + Exposed Wires + Crimson Eye)
  // ===========================================================================
  _buildRusherDrone(
    p,
    bodyGroup,
    headGroup,
    headAnchor,
    leftArm,
    rightArm,
    weaponMuzzle,
    rotors
  ) {
    bodyGroup.position.set(0, 0.55, 0);

    // Bolted cast-iron salvage main drum chassis
    const hullGeo = this._makeExtrudedPoly(
      'scavenger_hull',
      [
        [-0.22, 0.30],
        [0.22, 0.30],
        [0.34, 0.08],
        [0.28, -0.26],
        [0.14, -0.34],
        [-0.14, -0.34],
        [-0.28, -0.26],
        [-0.34, 0.08],
      ],
      0.18,
      0.028,
      0.022,
      2
    );
    const hull = new THREE.Mesh(hullGeo, p.primaryArmor);
    hull.rotation.x = Math.PI * 0.5;
    hull.position.set(0, 0.06, 0);
    bodyGroup.add(hull);

    // Asymmetric rusted salvage top cowling + welded reinforcement bar
    const cowlGeo = this._makeExtrudedPoly(
      'scavenger_cowl',
      [
        [-0.16, -0.24],
        [0.18, -0.20],
        [0.21, 0.16],
        [0.06, 0.32],
        [-0.14, 0.24],
      ],
      0.10,
      0.02,
      0.018,
      2
    );
    const cowl = new THREE.Mesh(cowlGeo, p.coloredPlate);
    cowl.rotation.x = Math.PI * 0.5;
    cowl.position.set(0.02, 0.17, -0.02);
    cowl.rotation.z = -0.06;
    bodyGroup.add(cowl);

    // Asymmetric scrap salvage antenna + bumper cage
    const antenna = new THREE.Mesh(
      this._getGeo('scavenger_antenna', () => new THREE.CylinderGeometry(0.008, 0.014, 0.36, 6)),
      p.pistonSteel
    );
    antenna.position.set(-0.18, 0.32, -0.18);
    antenna.rotation.z = 0.22;
    antenna.rotation.x = -0.18;
    bodyGroup.add(antenna);

    // Quad/Twin LatheGeometry Ducted Industrial Turbofans on Outrigger Struts
    const mainShroudGeo = this._makeLathe(
      'scavenger_shroud_main',
      [
        [0.16, -0.09],
        [0.21, -0.07],
        [0.22, 0.01],
        [0.20, 0.08],
        [0.15, 0.09],
        [0.14, 0.03],
        [0.14, -0.05],
        [0.16, -0.09],
      ],
      18
    );
    const smallShroudGeo = this._makeLathe(
      'scavenger_shroud_rear',
      [
        [0.11, -0.06],
        [0.145, -0.05],
        [0.15, 0.01],
        [0.135, 0.06],
        [0.105, 0.07],
        [0.095, -0.04],
        [0.11, -0.06],
      ],
      14
    );
    const bladeGeo = this._makeExtrudedPoly(
      'scavenger_blade',
      [
        [-0.13, -0.02],
        [0.13, -0.02],
        [0.115, 0.02],
        [-0.115, 0.02],
      ],
      0.012,
      0.003,
      0.003,
      1
    );
    const hubGeo = this._getGeo('scavenger_rotor_hub', () => new THREE.CylinderGeometry(0.036, 0.04, 0.08, 8));
    const emberRingGeo = this._getGeo('scavenger_heat_ring', () => new THREE.TorusGeometry(0.15, 0.012, 6, 16));

    const mountFan = (x, y, z, tiltZ, tiltX, isRear) => {
      const fanGroup = new THREE.Group();
      fanGroup.position.set(x, y, z);
      fanGroup.rotation.z = tiltZ;
      fanGroup.rotation.x = tiltX;

      fanGroup.add(new THREE.Mesh(isRear ? smallShroudGeo : mainShroudGeo, p.primaryArmor));

      if (!isRear) {
        const heatRing = new THREE.Mesh(emberRingGeo, p.accentGlow);
        heatRing.rotation.x = Math.PI * 0.5;
        heatRing.position.y = -0.05;
        fanGroup.add(heatRing);
      }

      const rotorPivot = new THREE.Group();
      rotorPivot.add(new THREE.Mesh(hubGeo, p.darkFrame));
      const bladeCount = isRear ? 2 : 3;
      const scale = isRear ? 0.68 : 1.0;
      for (let b = 0; b < bladeCount; b++) {
        const blade = new THREE.Mesh(bladeGeo, p.pistonSteel);
        blade.scale.set(scale, 1, 1);
        blade.rotation.x = Math.PI * 0.5;
        blade.rotation.z = (b / bladeCount) * Math.PI;
        rotorPivot.add(blade);
      }
      fanGroup.add(rotorPivot);
      rotors.push(rotorPivot);
      bodyGroup.add(fanGroup);
    };

    for (let side = -1; side <= 1; side += 2) {
      // Main forward-lateral turbofans
      mountFan(side * 0.46, 0.06, 0.06, -side * 0.16, 0.12, false);
      // Secondary rear stabilizer turbofans
      mountFan(side * 0.34, 0.13, -0.28, -side * 0.24, 0.22, true);

      // Tubular steel outrigger boom
      bodyGroup.add(
        new THREE.Mesh(
          this._makeTube(
            `scavenger_strut_${side}`,
            [
              [side * 0.16, 0.05, 0.04],
              [side * 0.34, 0.07, 0.06],
              [side * 0.42, 0.06, 0.06],
            ],
            0.024,
            8,
            6
          ),
          p.darkFrame
        )
      );

      // Tangled exposed hydraulic / copper power wires
      bodyGroup.add(
        new THREE.Mesh(
          this._makeTube(
            `scavenger_wire_a_${side}`,
            [
              [side * 0.12, 0.11, 0.08],
              [side * 0.26, 0.20, -0.06],
              [side * 0.32, 0.12, -0.24],
            ],
            0.015,
            10,
            6
          ),
          p.cableMat
        )
      );
      bodyGroup.add(
        new THREE.Mesh(
          this._makeTube(
            `scavenger_wire_b_${side}`,
            [
              [side * 0.18, -0.02, -0.06],
              [side * 0.32, -0.10, 0.08],
              [side * 0.08, -0.14, 0.12],
            ],
            0.013,
            10,
            6
          ),
          p.cableMat
        )
      );
    }

    // Dirty Rear Soot Muffler Exhaust Vent + Hot Radiator Slit
    const mufflerGeo = this._makeLathe(
      'scavenger_exhaust',
      [
        [0.065, 0.0],
        [0.095, 0.04],
        [0.09, 0.20],
        [0.115, 0.24],
        [0.08, 0.24],
        [0.075, 0.12],
      ],
      12
    );
    const muffler = new THREE.Mesh(mufflerGeo, p.darkFrame);
    muffler.rotation.x = -Math.PI * 0.42;
    muffler.position.set(0, 0.04, -0.28);
    bodyGroup.add(muffler);

    const coalVent = new THREE.Mesh(
      this._getGeo('scavenger_ember', () => new THREE.CylinderGeometry(0.06, 0.06, 0.06, 8)),
      p.accentGlow
    );
    coalVent.rotation.x = Math.PI * 0.5;
    coalVent.position.set(0, 0.02, -0.34);
    bodyGroup.add(coalVent);

    // Bright Glowing Crimson Infrared Scanner Eye Weakpoint (headGroup / headAnchor)
    headGroup.position.set(0, 0.02, 0.28);
    bodyGroup.add(headGroup);

    const eyeCanGeo = this._makeLathe(
      'scavenger_eye_can',
      [
        [0.05, -0.14],
        [0.20, -0.10],
        [0.23, 0.02],
        [0.21, 0.12],
        [0.15, 0.14],
        [0.13, 0.08],
      ],
      16
    );
    const eyeCan = new THREE.Mesh(eyeCanGeo, p.darkFrame);
    eyeCan.rotation.x = Math.PI * 0.5;
    headGroup.add(eyeCan);

    // Welded steel shutter brow hood over scanner eye
    const shutterHoodGeo = this._makeExtrudedPoly(
      'scavenger_shutter_hood',
      [
        [-0.25, 0.04],
        [-0.17, 0.19],
        [0.17, 0.19],
        [0.25, 0.04],
        [0.15, 0.09],
        [-0.15, 0.09],
      ],
      0.16,
      0.018,
      0.015,
      1
    );
    const hood = new THREE.Mesh(shutterHoodGeo, p.coloredPlate);
    hood.position.set(0, 0.06, 0.03);
    headGroup.add(hood);

    const irIrisGeo = this._getGeo('scavenger_ir_iris', () => new THREE.SphereGeometry(0.145, 16, 12));
    const irIris = new THREE.Mesh(irIrisGeo, p.weakpointGlow);
    irIris.scale.set(1.0, 1.0, 0.65);
    irIris.position.set(0, 0, 0.085);
    headGroup.add(irIris);

    const irBezel = new THREE.Mesh(
      this._getGeo('scavenger_ir_bezel', () => new THREE.TorusGeometry(0.162, 0.018, 8, 18)),
      p.accentGlow
    );
    irBezel.position.set(0, 0, 0.115);
    headGroup.add(irBezel);

    headAnchor.position.set(0, 0, 0.06);
    headGroup.add(headAnchor);

    // Under-slung Scrap Autocannon (rightArm gimbal)
    rightArm.position.set(0, -0.18, 0.12);
    bodyGroup.add(rightArm);

    const gunBoxGeo = this._makeExtrudedPoly(
      'scavenger_gun_box',
      [
        [-0.085, -0.065],
        [0.085, -0.065],
        [0.095, 0.065],
        [-0.095, 0.065],
      ],
      0.32,
      0.014,
      0.012,
      1
    );
    rightArm.add(new THREE.Mesh(gunBoxGeo, p.darkFrame));

    const drumMag = new THREE.Mesh(
      this._getGeo('scavenger_ammo_drum', () => new THREE.CylinderGeometry(0.068, 0.068, 0.11, 10)),
      p.coloredPlate
    );
    drumMag.rotation.z = Math.PI * 0.5;
    drumMag.position.set(0.11, -0.02, 0.02);
    rightArm.add(drumMag);

    const autoBarrelGeo = this._makeLathe(
      'scavenger_auto_barrel',
      [
        [0.036, 0.0],
        [0.036, 0.16],
        [0.025, 0.18],
        [0.025, 0.36],
        [0.036, 0.38],
        [0.022, 0.43],
      ],
      10
    );
    const gunBarrel = new THREE.Mesh(autoBarrelGeo, p.pistonSteel);
    gunBarrel.rotation.x = Math.PI * 0.5;
    gunBarrel.position.set(0, -0.01, 0.10);
    rightArm.add(gunBarrel);

    const hotCollar = new THREE.Mesh(
      this._getGeo('scavenger_hot_collar', () => new THREE.CylinderGeometry(0.034, 0.034, 0.10, 10)),
      p.accentGlow
    );
    hotCollar.rotation.x = Math.PI * 0.5;
    hotCollar.position.set(0, -0.01, 0.28);
    rightArm.add(hotCollar);

    weaponMuzzle.position.set(0, -0.01, 0.55);
    rightArm.add(weaponMuzzle);
    bodyGroup.add(leftArm);
  }

  // ===========================================================================
  // 2. RUST-WALKER TROOPER (Asymmetric Scrap Armor + Diesel Exhaust Pack + Red Optic)
  // ===========================================================================
  _buildTacticalTrooper(
    p,
    bodyGroup,
    headGroup,
    headAnchor,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    weaponMuzzle
  ) {
    // Exposed Piston Cyber-Legs (hip pivot at y = 0.94)
    const thighStrutGeo = this._makeExtrudedPoly(
      'rustwalker_thigh',
      [
        [-0.075, 0.02],
        [0.075, 0.02],
        [0.09, -0.20],
        [0.06, -0.42],
        [-0.06, -0.42],
        [-0.085, -0.20],
      ],
      0.13,
      0.018,
      0.016,
      2
    );
    const shinStrutGeo = this._makeExtrudedPoly(
      'rustwalker_shin',
      [
        [-0.06, 0.0],
        [0.065, 0.0],
        [0.055, -0.36],
        [0.045, -0.44],
        [-0.05, -0.44],
        [-0.068, -0.22],
      ],
      0.11,
      0.014,
      0.012,
      1
    );
    const pistonRodGeo = this._getGeo('rustwalker_piston_rod', () => new THREE.CylinderGeometry(0.022, 0.022, 0.38, 8));
    const pistonSleeveGeo = this._getGeo('rustwalker_piston_slv', () => new THREE.CylinderGeometry(0.036, 0.036, 0.22, 8));
    const kneeJointGeo = this._getGeo('rustwalker_knee_drum', () => new THREE.CylinderGeometry(0.065, 0.065, 0.14, 10));
    const bootGeo = this._makeExtrudedPoly(
      'rustwalker_boot',
      [
        [-0.085, -0.06],
        [0.085, -0.06],
        [0.095, 0.16],
        [0.06, 0.25],
        [-0.06, 0.25],
        [-0.095, 0.16],
      ],
      0.09,
      0.015,
      0.014,
      1
    );
    const legHoseGeo = this._makeTube(
      'rustwalker_leg_hose',
      [
        [0, -0.10, -0.08],
        [0, -0.38, -0.14],
        [0, -0.72, -0.07],
      ],
      0.018,
      8,
      6
    );

    const buildLeg = (legGroup, sideX, hasScrapPlate) => {
      legGroup.position.set(sideX, 0.94, 0);
      legGroup.add(new THREE.Mesh(thighStrutGeo, p.darkFrame));

      // Exposed front hydraulic thigh piston
      const thighPiston = new THREE.Mesh(pistonRodGeo, p.pistonSteel);
      thighPiston.position.set(0, -0.24, 0.068);
      legGroup.add(thighPiston);

      const knee = new THREE.Mesh(kneeJointGeo, p.primaryArmor);
      knee.rotation.z = Math.PI * 0.5;
      knee.position.set(0, -0.43, 0.02);
      legGroup.add(knee);

      const shin = new THREE.Mesh(shinStrutGeo, p.darkFrame);
      shin.position.set(0, -0.44, -0.01);
      legGroup.add(shin);

      // Exposed shin piston cylinder
      const shinSleeve = new THREE.Mesh(pistonSleeveGeo, p.pistonSteel);
      shinSleeve.position.set(sideX > 0 ? 0.05 : -0.05, -0.62, 0.03);
      legGroup.add(shinSleeve);

      // Asymmetric bolted shin plate on left leg only
      if (hasScrapPlate) {
        const scrapShin = new THREE.Mesh(
          this._getGeo('rustwalker_scrap_shin', () => new THREE.BoxGeometry(0.11, 0.28, 0.045)),
          p.coloredPlate
        );
        scrapShin.position.set(0, -0.64, 0.072);
        legGroup.add(scrapShin);
      }

      const boot = new THREE.Mesh(bootGeo, p.primaryArmor);
      boot.rotation.x = Math.PI * 0.5;
      boot.position.set(0, -0.89, 0.05);
      legGroup.add(boot);

      legGroup.add(new THREE.Mesh(legHoseGeo, p.cableMat));
      bodyGroup.add(legGroup);
    };

    buildLeg(leftLeg, 0.17, true);
    buildLeg(rightLeg, -0.17, false);

    // Pelvis & Skeletal Piston Spine
    const pelvisGeo = this._makeExtrudedPoly(
      'rustwalker_pelvis',
      [
        [-0.22, 0.08],
        [0.22, 0.08],
        [0.16, -0.12],
        [-0.16, -0.12],
      ],
      0.22,
      0.022,
      0.018,
      2
    );
    const pelvis = new THREE.Mesh(pelvisGeo, p.darkFrame);
    pelvis.position.set(0, 0.96, 0);
    bodyGroup.add(pelvis);

    const spineCore = new THREE.Mesh(
      this._getGeo('rustwalker_waist', () => new THREE.CylinderGeometry(0.12, 0.15, 0.24, 8)),
      p.pistonSteel
    );
    spineCore.position.set(0, 1.10, 0);
    bodyGroup.add(spineCore);

    // Welded Angular Cast-Iron Chest Hull
    const chestGeo = this._makeExtrudedPoly(
      'rustwalker_chest',
      [
        [-0.27, 0.22],
        [-0.14, 0.28],
        [0.16, 0.27],
        [0.28, 0.20],
        [0.23, -0.07],
        [0.16, -0.18],
        [-0.17, -0.18],
        [-0.24, -0.05],
      ],
      0.26,
      0.032,
      0.026,
      2
    );
    const chest = new THREE.Mesh(chestGeo, p.primaryArmor);
    chest.position.set(0, 1.32, 0.02);
    bodyGroup.add(chest);

    // Asymmetric Welded Rust-Vermilion Pectoral Scrap Plate
    const asymPlateGeo = this._makeExtrudedPoly(
      'rustwalker_asym_chest',
      [
        [-0.24, 0.14],
        [0.20, 0.10],
        [0.16, -0.09],
        [-0.04, -0.13],
        [-0.20, -0.04],
      ],
      0.065,
      0.018,
      0.014,
      2
    );
    const asymPlate = new THREE.Mesh(asymPlateGeo, p.coloredPlate);
    asymPlate.position.set(-0.02, 1.38, 0.155);
    asymPlate.rotation.z = 0.04;
    bodyGroup.add(asymPlate);

    // Furnace-amber chest battery gauge slit
    const batterySlit = new THREE.Mesh(
      this._getGeo('rustwalker_chest_gauge', () => new THREE.BoxGeometry(0.14, 0.045, 0.035)),
      p.accentGlow
    );
    batterySlit.position.set(0.06, 1.35, 0.195);
    bodyGroup.add(batterySlit);

    // Rear Diesel / Battery Pack + Vertical Exhaust Smoke Pipe + Fuel Hoses
    const packGeo = this._makeExtrudedPoly(
      'rustwalker_diesel_pack',
      [
        [-0.18, 0.20],
        [0.18, 0.20],
        [0.20, -0.08],
        [0.14, -0.22],
        [-0.14, -0.22],
        [-0.20, -0.08],
      ],
      0.18,
      0.022,
      0.018,
      2
    );
    const pack = new THREE.Mesh(packGeo, p.primaryArmor);
    pack.position.set(0, 1.34, -0.22);
    bodyGroup.add(pack);

    // Twin battery / diesel canisters on back
    const cellGeo = this._makeLathe(
      'rustwalker_cell_drum',
      [
        [0.048, 0.0],
        [0.066, 0.03],
        [0.066, 0.26],
        [0.048, 0.29],
      ],
      10
    );
    for (let side = -1; side <= 1; side += 2) {
      const cell = new THREE.Mesh(cellGeo, p.darkFrame);
      cell.position.set(side * 0.085, 1.18, -0.32);
      bodyGroup.add(cell);
    }

    const packGauge = new THREE.Mesh(
      this._getGeo('rustwalker_pack_gauge', () => new THREE.BoxGeometry(0.036, 0.16, 0.03)),
      p.accentGlow
    );
    packGauge.position.set(0, 1.33, -0.32);
    bodyGroup.add(packGauge);

    // Vertical exhaust smoke pipe rising off right shoulder of diesel pack
    const pipeGeo = this._makeLathe(
      'rustwalker_exhaust_pipe',
      [
        [0.032, 0.0],
        [0.032, 0.36],
        [0.046, 0.40],
        [0.042, 0.44],
        [0.028, 0.44],
      ],
      10
    );
    const exhaustPipe = new THREE.Mesh(pipeGeo, p.darkFrame);
    exhaustPipe.position.set(-0.14, 1.46, -0.26);
    exhaustPipe.rotation.x = -0.16;
    exhaustPipe.rotation.z = 0.08;
    bodyGroup.add(exhaustPipe);

    // Fuel hoses curving from diesel pack into torso/waist
    for (let side = -1; side <= 1; side += 2) {
      bodyGroup.add(
        new THREE.Mesh(
          this._makeTube(
            `rustwalker_fuel_hose_${side}`,
            [
              [side * 0.13, 1.45, -0.24],
              [side * 0.23, 1.34, -0.14],
              [side * 0.17, 1.15, -0.04],
            ],
            0.022,
            10,
            6
          ),
          p.cableMat
        )
      );
    }

    // Menacing Single Glowing Furnace-Red Optical Visor Head (headHeight = 1.62)
    headGroup.position.set(0, 1.62, 0.02);
    bodyGroup.add(headGroup);

    const neck = new THREE.Mesh(
      this._getGeo('rustwalker_neck', () => new THREE.CylinderGeometry(0.072, 0.09, 0.12, 8)),
      p.pistonSteel
    );
    neck.position.set(0, -0.10, 0);
    headGroup.add(neck);

    const helmGeo = this._makeExtrudedPoly(
      'rustwalker_helmet',
      [
        [-0.125, -0.10],
        [0.125, -0.10],
        [0.155, 0.04],
        [0.12, 0.16],
        [0, 0.18],
        [-0.12, 0.16],
        [-0.155, 0.04],
      ],
      0.24,
      0.028,
      0.024,
      2
    );
    headGroup.add(new THREE.Mesh(helmGeo, p.primaryArmor));

    // Welded forehead scrap visor hood
    const browPlate = new THREE.Mesh(
      this._getGeo('rustwalker_helm_brow', () => new THREE.BoxGeometry(0.28, 0.06, 0.20)),
      p.coloredPlate
    );
    browPlate.position.set(0, 0.11, 0.04);
    browPlate.rotation.x = 0.18;
    headGroup.add(browPlate);

    // Menacing Single Glowing Furnace-Red Optical Visor Slit
    const visorGeo = this._makeExtrudedPoly(
      'rustwalker_visor',
      [
        [-0.125, 0.04],
        [0.125, 0.04],
        [0.105, -0.045],
        [-0.105, -0.045],
      ],
      0.08,
      0.012,
      0.01,
      1
    );
    const visor = new THREE.Mesh(visorGeo, p.weakpointGlow);
    visor.position.set(0, 0.025, 0.125);
    headGroup.add(visor);

    // Crooked rusted radio mast on left ear
    const earAnt = new THREE.Mesh(
      this._getGeo('rustwalker_antenna', () => new THREE.CylinderGeometry(0.007, 0.012, 0.24, 6)),
      p.pistonSteel
    );
    earAnt.position.set(0.15, 0.14, -0.04);
    earAnt.rotation.z = -0.16;
    headGroup.add(earAnt);

    headAnchor.position.set(0, 0.02, 0.02);
    headGroup.add(headAnchor);

    // Mismatched Rusty Pauldrons & Articulated Arms
    const bigPauldronGeo = this._makeExtrudedPoly(
      'rustwalker_pauldron_big',
      [
        [-0.12, 0.14],
        [0.12, 0.10],
        [0.16, -0.07],
        [0.04, -0.14],
        [-0.12, -0.06],
      ],
      0.24,
      0.022,
      0.018,
      2
    );
    const smallCapGeo = this._makeLathe(
      'rustwalker_pauldron_cap',
      [
        [0.02, 0.08],
        [0.12, 0.06],
        [0.15, -0.02],
        [0.12, -0.08],
      ],
      10
    );
    const upperArmGeo = this._getGeo('rustwalker_uarm', () => new THREE.CylinderGeometry(0.056, 0.048, 0.30, 8));
    const forearmGeo = this._getGeo('rustwalker_farm', () => new THREE.BoxGeometry(0.095, 0.28, 0.105));

    // Right Arm (Weapon Arm with heavy angled rust-vermilion pauldron)
    rightArm.position.set(-0.34, 1.44, 0.02);
    const rPauldron = new THREE.Mesh(bigPauldronGeo, p.coloredPlate);
    rPauldron.position.set(-0.04, 0.04, 0);
    rPauldron.rotation.z = 0.26;
    rightArm.add(rPauldron);

    const rUpper = new THREE.Mesh(upperArmGeo, p.pistonSteel);
    rUpper.position.set(-0.02, -0.14, 0.06);
    rUpper.rotation.x = -0.45;
    rightArm.add(rUpper);

    const rFore = new THREE.Mesh(forearmGeo, p.primaryArmor);
    rFore.position.set(0.02, -0.22, 0.24);
    rFore.rotation.x = -1.32;
    rightArm.add(rFore);

    // Battered Scrap Assault Rifle held forward in rightArm
    const rifleGroup = new THREE.Group();
    rifleGroup.position.set(0.08, -0.21, 0.38);

    const receiverGeo = this._makeExtrudedPoly(
      'rustwalker_rifle_body',
      [
        [-0.042, -0.06],
        [0.042, -0.06],
        [0.048, 0.055],
        [-0.048, 0.055],
      ],
      0.56,
      0.012,
      0.01,
      1
    );
    rifleGroup.add(new THREE.Mesh(receiverGeo, p.darkFrame));

    const handguard = new THREE.Mesh(
      this._getGeo('rustwalker_rifle_guard', () => new THREE.BoxGeometry(0.065, 0.052, 0.34)),
      p.coloredPlate
    );
    handguard.position.set(0, 0.048, 0.08);
    rifleGroup.add(handguard);

    const rifleBarrelGeo = this._makeLathe(
      'rustwalker_rifle_barrel',
      [
        [0.024, 0.0],
        [0.024, 0.26],
        [0.034, 0.28],
        [0.034, 0.36],
        [0.02, 0.38],
      ],
      10
    );
    const rifleBarrel = new THREE.Mesh(rifleBarrelGeo, p.pistonSteel);
    rifleBarrel.rotation.x = Math.PI * 0.5;
    rifleBarrel.position.set(0, 0.015, 0.24);
    rifleGroup.add(rifleBarrel);

    const mag = new THREE.Mesh(
      this._getGeo('rustwalker_rifle_mag', () => new THREE.BoxGeometry(0.042, 0.17, 0.078)),
      p.primaryArmor
    );
    mag.position.set(0, -0.11, 0.08);
    mag.rotation.x = 0.24;
    rifleGroup.add(mag);

    const sight = new THREE.Mesh(
      this._getGeo('rustwalker_rifle_sight', () => new THREE.BoxGeometry(0.036, 0.042, 0.075)),
      p.accentGlow
    );
    sight.position.set(0, 0.09, -0.02);
    rifleGroup.add(sight);

    weaponMuzzle.position.set(0, 0.015, 0.64);
    rifleGroup.add(weaponMuzzle);
    rightArm.add(rifleGroup);
    bodyGroup.add(rightArm);

    // Left Arm (Mismatched smaller boiler-cap shoulder guard supporting foregrip)
    leftArm.position.set(0.34, 1.44, 0.02);
    const lCap = new THREE.Mesh(smallCapGeo, p.primaryArmor);
    lCap.position.set(0.04, 0.05, 0);
    lCap.rotation.z = -0.35;
    leftArm.add(lCap);

    const lUpper = new THREE.Mesh(upperArmGeo, p.pistonSteel);
    lUpper.position.set(0.01, -0.13, 0.08);
    lUpper.rotation.x = -0.62;
    lUpper.rotation.z = -0.22;
    leftArm.add(lUpper);

    const lFore = new THREE.Mesh(forearmGeo, p.darkFrame);
    lFore.position.set(-0.12, -0.20, 0.30);
    lFore.rotation.x = -1.25;
    lFore.rotation.y = 0.52;
    leftArm.add(lFore);
    bodyGroup.add(leftArm);
  }

  // ===========================================================================
  // 3. BULWARK JUGGERNAUT (2.35m Sloped Bunker-Torso + Welded Thermal-Amber Blast Shield)
  // ===========================================================================
  _buildHeavyEnforcer(
    p,
    ownedMaterials,
    bodyGroup,
    headGroup,
    headAnchor,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    weaponMuzzle
  ) {
    // Heavy Demolition Legs (hip pivot at y = 1.08)
    const thighGeo = this._makeExtrudedPoly(
      'bulwark_thigh',
      [
        [-0.16, 0.06],
        [0.16, 0.06],
        [0.19, -0.22],
        [0.14, -0.48],
        [-0.14, -0.48],
        [-0.19, -0.22],
      ],
      0.28,
      0.032,
      0.026,
      2
    );
    const shinGeo = this._makeExtrudedPoly(
      'bulwark_shin',
      [
        [-0.15, 0.02],
        [0.15, 0.02],
        [0.18, -0.46],
        [0.14, -0.54],
        [-0.14, -0.54],
        [-0.18, -0.46],
      ],
      0.27,
      0.03,
      0.024,
      2
    );
    const footGeo = this._makeExtrudedPoly(
      'bulwark_foot',
      [
        [-0.17, -0.12],
        [0.17, -0.12],
        [0.20, 0.24],
        [0.11, 0.34],
        [-0.11, 0.34],
        [-0.20, 0.24],
      ],
      0.13,
      0.022,
      0.02,
      1
    );
    const calfPistonGeo = this._makeTube(
      'bulwark_calf_piston',
      [
        [0, -0.16, -0.16],
        [0, -0.52, -0.24],
        [0, -0.90, -0.15],
      ],
      0.036,
      10,
      7
    );

    const buildHeavyLeg = (legGroup, sideX) => {
      legGroup.position.set(sideX, 1.08, 0);
      legGroup.add(new THREE.Mesh(thighGeo, p.primaryArmor));

      const kneeDrum = new THREE.Mesh(
        this._getGeo('bulwark_knee', () => new THREE.CylinderGeometry(0.13, 0.14, 0.28, 10)),
        p.pistonSteel
      );
      kneeDrum.rotation.z = Math.PI * 0.5;
      kneeDrum.position.set(0, -0.48, 0.04);
      legGroup.add(kneeDrum);

      const kneeCap = new THREE.Mesh(
        this._getGeo('bulwark_knee_cap', () => new THREE.BoxGeometry(0.24, 0.18, 0.10)),
        p.coloredPlate
      );
      kneeCap.position.set(0, -0.48, 0.15);
      legGroup.add(kneeCap);

      const shin = new THREE.Mesh(shinGeo, p.darkFrame);
      shin.position.set(0, -0.50, 0);
      legGroup.add(shin);

      const foot = new THREE.Mesh(footGeo, p.primaryArmor);
      foot.rotation.x = Math.PI * 0.5;
      foot.position.set(0, -1.01, 0.06);
      legGroup.add(foot);

      legGroup.add(new THREE.Mesh(calfPistonGeo, p.cableMat));
      bodyGroup.add(legGroup);
    };

    buildHeavyLeg(leftLeg, 0.28);
    buildHeavyLeg(rightLeg, -0.28);

    // Armored Pelvis & Sloped Rusted Steel Bunker-Torso
    const pelvisGeo = this._makeExtrudedPoly(
      'bulwark_pelvis',
      [
        [-0.38, 0.14],
        [0.38, 0.14],
        [0.28, -0.18],
        [-0.28, -0.18],
      ],
      0.38,
      0.035,
      0.03,
      2
    );
    const pelvis = new THREE.Mesh(pelvisGeo, p.darkFrame);
    pelvis.position.set(0, 1.12, 0);
    bodyGroup.add(pelvis);

    const torsoGeo = this._makeExtrudedPoly(
      'bulwark_torso',
      [
        [-0.54, 0.42],
        [-0.32, 0.54],
        [0.32, 0.54],
        [0.54, 0.42],
        [0.46, -0.12],
        [0.32, -0.34],
        [-0.32, -0.34],
        [-0.46, -0.12],
      ],
      0.50,
      0.05,
      0.04,
      2
    );
    const torso = new THREE.Mesh(torsoGeo, p.primaryArmor);
    torso.position.set(0, 1.62, 0.02);
    bodyGroup.add(torso);

    // Sloped Welded Bunker Glacis Plate + Heated Furnace Boiler Slits
    const glacisGeo = this._makeExtrudedPoly(
      'bulwark_glacis',
      [
        [-0.42, 0.26],
        [0.42, 0.26],
        [0.32, -0.22],
        [-0.32, -0.22],
      ],
      0.13,
      0.03,
      0.025,
      2
    );
    const glacis = new THREE.Mesh(glacisGeo, p.coloredPlate);
    glacis.position.set(0, 1.66, 0.29);
    glacis.rotation.x = -0.18;
    bodyGroup.add(glacis);

    for (let i = 0; i < 3; i++) {
      const furnaceSlit = new THREE.Mesh(
        this._getGeo('bulwark_chest_slit', () => new THREE.BoxGeometry(0.36, 0.04, 0.04)),
        p.accentGlow
      );
      furnaceSlit.position.set(0, 1.76 - i * 0.11, 0.365);
      bodyGroup.add(furnaceSlit);
    }

    // Sloped Bunker Collar Hood (frames head cleanly without obstructing headshot hitbox)
    const collarGeo = this._makeExtrudedPoly(
      'bulwark_collar',
      [
        [-0.46, 0.0],
        [-0.34, 0.28],
        [0.34, 0.28],
        [0.46, 0.0],
        [0.29, 0.0],
        [0.24, 0.18],
        [-0.24, 0.18],
        [-0.29, 0.0],
      ],
      0.34,
      0.028,
      0.024,
      2
    );
    const collar = new THREE.Mesh(collarGeo, p.primaryArmor);
    collar.position.set(0, 1.94, -0.06);
    bodyGroup.add(collar);

    // Dual Hydraulic Spine Pistons + Twin Industrial Exhaust Stacks
    const exhaustGeo = this._makeLathe(
      'bulwark_exhaust',
      [
        [0.06, 0.0],
        [0.095, 0.05],
        [0.09, 0.44],
        [0.115, 0.50],
        [0.075, 0.52],
      ],
      12
    );
    const spineCylGeo = this._getGeo('bulwark_spine_cyl', () => new THREE.CylinderGeometry(0.05, 0.05, 0.68, 8));
    for (let side = -1; side <= 1; side += 2) {
      const stack = new THREE.Mesh(exhaustGeo, p.darkFrame);
      stack.position.set(side * 0.25, 1.88, -0.32);
      stack.rotation.x = -0.22;
      bodyGroup.add(stack);

      const spinePiston = new THREE.Mesh(spineCylGeo, p.pistonSteel);
      spinePiston.position.set(side * 0.18, 1.62, -0.32);
      bodyGroup.add(spinePiston);

      const hose = new THREE.Mesh(
        this._makeTube(
          `bulwark_back_hose_${side}`,
          [
            [side * 0.28, 1.24, -0.34],
            [side * 0.37, 1.66, -0.44],
            [side * 0.28, 2.02, -0.24],
          ],
          0.036,
          10,
          7
        ),
        p.cableMat
      );
      bodyGroup.add(hose);
    }

    // Recessed Glowing Furnace-Red Slit Visor Weakpoint (headHeight = 2.02)
    headGroup.position.set(0, 2.02, 0.07);
    bodyGroup.add(headGroup);

    const pillboxHelmGeo = this._makeExtrudedPoly(
      'bulwark_helm',
      [
        [-0.18, -0.11],
        [0.18, -0.11],
        [0.21, 0.06],
        [0.14, 0.21],
        [-0.14, 0.21],
        [-0.21, 0.06],
      ],
      0.28,
      0.032,
      0.026,
      2
    );
    headGroup.add(new THREE.Mesh(pillboxHelmGeo, p.primaryArmor));

    // Recessed furnace-red slit visor + armored brow peak
    const browShield = new THREE.Mesh(
      this._getGeo('bulwark_brow_plate', () => new THREE.BoxGeometry(0.38, 0.065, 0.16)),
      p.darkFrame
    );
    browShield.position.set(0, 0.12, 0.10);
    browShield.rotation.x = 0.16;
    headGroup.add(browShield);

    const heavyVisorGeo = this._makeExtrudedPoly(
      'bulwark_visor',
      [
        [-0.17, 0.055],
        [0.17, 0.055],
        [0.145, -0.045],
        [-0.145, -0.045],
      ],
      0.09,
      0.014,
      0.012,
      1
    );
    const heavyVisor = new THREE.Mesh(heavyVisorGeo, p.weakpointGlow);
    heavyVisor.position.set(0, 0.025, 0.14);
    headGroup.add(heavyVisor);

    const browOptic = new THREE.Mesh(
      this._getGeo('bulwark_brow_optic', () => new THREE.CylinderGeometry(0.046, 0.054, 0.08, 10)),
      p.accentGlow
    );
    browOptic.rotation.x = Math.PI * 0.5;
    browOptic.position.set(0, 0.13, 0.16);
    headGroup.add(browOptic);

    headAnchor.position.set(0, 0.04, 0.04);
    headGroup.add(headAnchor);

    // Massive Bolted Shoulder Pauldrons
    const heavyPauldronGeo = this._makeExtrudedPoly(
      'bulwark_pauldron',
      [
        [-0.22, 0.22],
        [0.18, 0.16],
        [0.25, -0.14],
        [0.08, -0.24],
        [-0.20, -0.10],
      ],
      0.38,
      0.036,
      0.03,
      2
    );

    // Right Arm — Shoulder/Forearm Heavy Autocannon
    rightArm.position.set(-0.60, 1.84, 0.04);
    const rPauldron = new THREE.Mesh(heavyPauldronGeo, p.coloredPlate);
    rPauldron.position.set(-0.08, 0.06, 0);
    rightArm.add(rPauldron);

    const rArmPiston = new THREE.Mesh(
      this._getGeo('bulwark_arm_core', () => new THREE.CylinderGeometry(0.105, 0.095, 0.42, 8)),
      p.pistonSteel
    );
    rArmPiston.position.set(-0.04, -0.22, 0.08);
    rArmPiston.rotation.x = -0.35;
    rightArm.add(rArmPiston);

    const cannonGroup = new THREE.Group();
    cannonGroup.position.set(-0.02, -0.34, 0.34);

    const breechGeo = this._makeExtrudedPoly(
      'bulwark_cannon_breech',
      [
        [-0.12, -0.13],
        [0.12, -0.13],
        [0.15, 0.12],
        [-0.15, 0.12],
      ],
      0.56,
      0.022,
      0.018,
      2
    );
    cannonGroup.add(new THREE.Mesh(breechGeo, p.primaryArmor));

    const cannonBarrelGeo = this._makeLathe(
      'bulwark_cannon_barrel',
      [
        [0.09, 0.0],
        [0.095, 0.14],
        [0.072, 0.16],
        [0.072, 0.48],
        [0.115, 0.54],
        [0.10, 0.62],
        [0.062, 0.60],
      ],
      14
    );
    const barrel = new THREE.Mesh(cannonBarrelGeo, p.darkFrame);
    barrel.rotation.x = Math.PI * 0.5;
    barrel.position.set(0, 0.02, 0.24);
    cannonGroup.add(barrel);

    // Heated amber barrel cooling ribs
    const heatRingGeo = this._getGeo('bulwark_cannon_heat', () => new THREE.TorusGeometry(0.096, 0.016, 8, 14));
    for (let c = 0; c < 3; c++) {
      const ring = new THREE.Mesh(heatRingGeo, p.accentGlow);
      ring.position.set(0, 0.02, 0.36 + c * 0.14);
      cannonGroup.add(ring);
    }

    cannonGroup.add(
      new THREE.Mesh(
        this._makeTube(
          'bulwark_cannon_feed',
          [
            [0.08, 0.08, -0.18],
            [0.24, 0.28, -0.36],
            [0.34, 0.42, -0.52],
          ],
          0.036,
          10,
          6
        ),
        p.cableMat
      )
    );

    weaponMuzzle.position.set(0, 0.02, 0.90);
    cannonGroup.add(weaponMuzzle);
    rightArm.add(cannonGroup);
    bodyGroup.add(rightArm);

    // Left Arm — Articulated Welded Steel + Thermal-Amber Reinforced Riot Shield
    leftArm.position.set(0.60, 1.84, 0.06);
    const lPauldron = new THREE.Mesh(heavyPauldronGeo, p.coloredPlate);
    lPauldron.position.set(0.08, 0.06, 0);
    lPauldron.scale.x = -1;
    leftArm.add(lPauldron);

    const lArmCore = new THREE.Mesh(
      this._getGeo('bulwark_arm_core', () => new THREE.CylinderGeometry(0.105, 0.095, 0.42, 8)),
      p.pistonSteel
    );
    lArmCore.position.set(0.02, -0.22, 0.16);
    lArmCore.rotation.x = -0.68;
    leftArm.add(lArmCore);

    // Welded industrial blast shield mounted cleanly across chest while leaving head open!
    const shieldPivot = new THREE.Group();
    shieldPivot.position.set(-0.22, -0.50, 0.62);
    shieldPivot.rotation.y = -0.22;

    const bumperBarGeo = this._makeExtrudedPoly(
      'bulwark_shield_bumper',
      [
        [-0.48, -0.065],
        [0.48, -0.065],
        [0.40, 0.065],
        [-0.40, 0.065],
      ],
      0.11,
      0.018,
      0.014,
      1
    );
    const topBumper = new THREE.Mesh(bumperBarGeo, p.primaryArmor);
    topBumper.position.set(0, 0.64, -0.02);
    shieldPivot.add(topBumper);
    const botBumper = new THREE.Mesh(bumperBarGeo, p.primaryArmor);
    botBumper.position.set(0, -0.64, -0.02);
    shieldPivot.add(botBumper);

    const sideFrameGeo = this._getGeo('bulwark_shield_post', () => new THREE.BoxGeometry(0.09, 1.24, 0.09));
    for (let s = -1; s <= 1; s += 2) {
      const post = new THREE.Mesh(sideFrameGeo, p.darkFrame);
      post.position.set(s * 0.48, 0, -0.02);
      shieldPivot.add(post);
    }

    // Curved Welded Steel + Thermal-Amber Blast Shield Plate
    const curvedShieldGeo = this._getGeo('bulwark_blast_shield', () => {
      const geo = new THREE.CylinderGeometry(1.15, 1.15, 1.28, 18, 1, true, -0.46, 0.92);
      geo.translate(0, 0, -1.06);
      return geo;
    });

    const shieldMat = new THREE.MeshStandardMaterial({
      color: 0x00f0ff,
      map: this._textures.blastShield,
      emissive: new THREE.Color(0x0284c7),
      emissiveMap: this._textures.blastShield,
      emissiveIntensity: 1.45,
      transparent: true,
      opacity: 0.86,
      roughness: 0.42,
      metalness: 0.55,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    shieldMat.userData.baseColor = shieldMat.color.clone();
    shieldMat.userData.baseEmissive = shieldMat.emissive.clone();
    shieldMat.userData.baseEmissiveIntensity = shieldMat.emissiveIntensity;
    shieldMat.userData.baseOpacity = 0.86;
    ownedMaterials.push(shieldMat);

    const shieldMesh = new THREE.Mesh(curvedShieldGeo, shieldMat);
    shieldMesh.renderOrder = 6;
    shieldPivot.add(shieldMesh);

    leftArm.add(shieldPivot);
    bodyGroup.add(leftArm);

    return shieldMesh;
  }

  // ===========================================================================
  // 4. DEADEYE RECON (Gaunt Sniper Walker + Tattered Shroud Fins + Crimson Laser)
  // ===========================================================================
  _buildSniperStalker(
    p,
    ownedMaterials,
    ownedGeometries,
    root,
    bodyGroup,
    headGroup,
    headAnchor,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    weaponMuzzle
  ) {
    // Gaunt Digitigrade Recon Legs (hip pivot at y = 0.98)
    const thighGeo = this._makeExtrudedPoly(
      'deadeye_thigh',
      [
        [-0.065, 0.02],
        [0.065, 0.02],
        [0.078, -0.22],
        [0.048, -0.46],
        [-0.048, -0.46],
        [-0.068, -0.22],
      ],
      0.12,
      0.016,
      0.014,
      2
    );
    const shinStrutGeo = this._makeExtrudedPoly(
      'deadeye_shin',
      [
        [-0.05, 0.02],
        [0.05, 0.02],
        [0.04, -0.46],
        [0.024, -0.52],
        [-0.024, -0.52],
        [-0.048, -0.26],
      ],
      0.10,
      0.012,
      0.01,
      1
    );
    const tendonGeo = this._makeTube(
      'deadeye_leg_tendon',
      [
        [0, -0.14, -0.06],
        [0, -0.46, -0.14],
        [0, -0.82, -0.04],
      ],
      0.015,
      10,
      6
    );

    const buildReconLeg = (legGroup, sideX) => {
      legGroup.position.set(sideX, 0.98, 0);
      const thigh = new THREE.Mesh(thighGeo, p.primaryArmor);
      thigh.rotation.x = -0.14;
      legGroup.add(thigh);

      const shin = new THREE.Mesh(shinStrutGeo, p.darkFrame);
      shin.position.set(0, -0.44, 0.03);
      shin.rotation.x = 0.14;
      legGroup.add(shin);

      const piston = new THREE.Mesh(
        this._getGeo('deadeye_leg_piston', () => new THREE.CylinderGeometry(0.016, 0.016, 0.40, 6)),
        p.pistonSteel
      );
      piston.position.set(0, -0.66, -0.02);
      legGroup.add(piston);

      const footClaw = new THREE.Mesh(
        this._getGeo('deadeye_foot', () => new THREE.BoxGeometry(0.095, 0.065, 0.25)),
        p.coloredPlate
      );
      footClaw.position.set(0, -0.945, 0.06);
      legGroup.add(footClaw);

      legGroup.add(new THREE.Mesh(tendonGeo, p.cableMat));
      bodyGroup.add(legGroup);
    };

    buildReconLeg(leftLeg, 0.145);
    buildReconLeg(rightLeg, -0.145);

    // Gaunt Skeletal Angular Torso
    const torsoGeo = this._makeExtrudedPoly(
      'deadeye_torso',
      [
        [-0.21, 0.26],
        [0.21, 0.26],
        [0.15, -0.04],
        [0.095, -0.26],
        [-0.095, -0.26],
        [-0.15, -0.04],
      ],
      0.19,
      0.024,
      0.02,
      2
    );
    const torso = new THREE.Mesh(torsoGeo, p.primaryArmor);
    torso.position.set(0, 1.32, 0);
    bodyGroup.add(torso);

    // Glowing furnace-amber spine battery core
    const spineStrip = new THREE.Mesh(
      this._getGeo('deadeye_spine_strip', () => new THREE.BoxGeometry(0.036, 0.40, 0.03)),
      p.accentGlow
    );
    spineStrip.position.set(0, 1.34, -0.12);
    bodyGroup.add(spineStrip);

    // Tattered Weathered Steel Shroud Fins (notched jagged battle-damaged silhouettes!)
    const shroudLargeGeo = this._makeExtrudedPoly(
      'deadeye_shroud_large',
      [
        [0.0, 0.18],
        [0.36, 0.34],
        [0.44, -0.06],
        [0.28, -0.22],
        [0.34, -0.42],
        [0.14, -0.60],
        [0.06, -0.36],
        [-0.04, -0.18],
      ],
      0.032,
      0.009,
      0.008,
      1
    );
    const shroudLeft = new THREE.Mesh(shroudLargeGeo, p.coloredPlate);
    shroudLeft.position.set(0.14, 1.44, -0.10);
    shroudLeft.rotation.y = -0.35;
    shroudLeft.rotation.x = 0.16;
    bodyGroup.add(shroudLeft);

    const shroudSmallGeo = this._makeExtrudedPoly(
      'deadeye_shroud_small',
      [
        [0.0, 0.14],
        [-0.28, 0.24],
        [-0.22, -0.08],
        [-0.28, -0.24],
        [-0.12, -0.34],
        [0.0, -0.12],
      ],
      0.03,
      0.008,
      0.008,
      1
    );
    const shroudRight = new THREE.Mesh(shroudSmallGeo, p.primaryArmor);
    shroudRight.position.set(-0.14, 1.44, -0.10);
    shroudRight.rotation.y = 0.32;
    shroudRight.rotation.x = 0.14;
    bodyGroup.add(shroudRight);

    // Dorsal Recon Rangefinder Antenna Spire
    const spire = new THREE.Mesh(
      this._getGeo('deadeye_spire', () => new THREE.CylinderGeometry(0.008, 0.022, 0.44, 6)),
      p.pistonSteel
    );
    spire.position.set(0.16, 1.78, -0.16);
    spire.rotation.x = -0.22;
    bodyGroup.add(spire);

    const spireTip = new THREE.Mesh(
      this._getGeo('deadeye_spire_tip', () => new THREE.SphereGeometry(0.025, 8, 6)),
      p.weakpointGlow
    );
    spireTip.position.set(0.16, 1.99, -0.21);
    bodyGroup.add(spireTip);

    // Triple-Lens Red Telescopic Optic Head (headHeight = 1.68)
    headGroup.position.set(0, 1.68, 0.03);
    bodyGroup.add(headGroup);

    const maskGeo = this._makeExtrudedPoly(
      'deadeye_head_mask',
      [
        [0, -0.14],
        [0.14, 0.09],
        [0, 0.19],
        [-0.14, 0.09],
      ],
      0.24,
      0.022,
      0.018,
      2
    );
    headGroup.add(new THREE.Mesh(maskGeo, p.darkFrame));

    // Three protruding telescopic camera housings + blazing crimson lenses
    const scopeTubeGeo = this._makeLathe(
      'deadeye_optic_tube',
      [
        [0.03, -0.02],
        [0.048, 0.0],
        [0.05, 0.07],
        [0.04, 0.08],
      ],
      12
    );
    const lensCapGeo = this._getGeo('deadeye_optic_lens', () => new THREE.CylinderGeometry(0.036, 0.036, 0.02, 12));
    const lensPositions = [
      [0, 0.068, 0.115, 1.15],
      [-0.062, -0.02, 0.11, 0.9],
      [0.062, -0.02, 0.11, 0.9],
    ];
    for (let i = 0; i < lensPositions.length; i++) {
      const [lx, ly, lz, sc] = lensPositions[i];
      const tube = new THREE.Mesh(scopeTubeGeo, p.pistonSteel);
      tube.rotation.x = Math.PI * 0.5;
      tube.position.set(lx, ly, lz);
      tube.scale.set(sc, 1, sc);
      headGroup.add(tube);

      const lens = new THREE.Mesh(lensCapGeo, p.weakpointGlow);
      lens.rotation.x = Math.PI * 0.5;
      lens.position.set(lx, ly, lz + 0.072);
      lens.scale.set(sc, 1, sc);
      headGroup.add(lens);
    }

    // Swept dual jagged hood fins
    for (let side = -1; side <= 1; side += 2) {
      const ear = new THREE.Mesh(
        this._getGeo('deadeye_ear', () => new THREE.BoxGeometry(0.022, 0.24, 0.05)),
        p.coloredPlate
      );
      ear.position.set(side * 0.12, 0.15, -0.06);
      ear.rotation.x = -0.58;
      ear.rotation.z = -side * 0.24;
      headGroup.add(ear);
    }

    headAnchor.position.set(0, 0.02, 0.02);
    headGroup.add(headAnchor);

    // Arms & Elongated Twin-Bar Anti-Materiel Rifle
    rightArm.position.set(-0.27, 1.46, 0.02);
    const armGeo = this._getGeo('deadeye_arm', () => new THREE.CylinderGeometry(0.042, 0.036, 0.34, 8));
    const rUpper = new THREE.Mesh(armGeo, p.pistonSteel);
    rUpper.position.set(0, -0.14, 0.08);
    rUpper.rotation.x = -0.6;
    rightArm.add(rUpper);

    const rifle = new THREE.Group();
    rifle.position.set(0.06, -0.14, 0.44);

    const stockGeo = this._makeExtrudedPoly(
      'deadeye_rifle_stock',
      [
        [-0.036, -0.065],
        [0.036, -0.065],
        [0.044, 0.05],
        [-0.044, 0.05],
      ],
      0.54,
      0.012,
      0.01,
      1
    );
    rifle.add(new THREE.Mesh(stockGeo, p.primaryArmor));

    // Twin elongated parallel anti-materiel steel rails (1.08m barrel extension!)
    const railGeo = this._makeExtrudedPoly(
      'deadeye_rail_bar',
      [
        [-0.017, -0.018],
        [0.017, -0.018],
        [0.013, 0.018],
        [-0.013, 0.018],
      ],
      1.08,
      0.005,
      0.005,
      1
    );
    const upperRail = new THREE.Mesh(railGeo, p.darkFrame);
    upperRail.position.set(0, 0.036, 0.65);
    rifle.add(upperRail);
    const lowerRail = new THREE.Mesh(railGeo, p.darkFrame);
    lowerRail.position.set(0, -0.022, 0.65);
    rifle.add(lowerRail);

    // Heated copper-amber inner core tube between twin bars
    const coreBarrel = new THREE.Mesh(
      this._getGeo('deadeye_inner_barrel', () => new THREE.CylinderGeometry(0.012, 0.012, 1.02, 8)),
      p.accentGlow
    );
    coreBarrel.rotation.x = Math.PI * 0.5;
    coreBarrel.position.set(0, 0.008, 0.63);
    rifle.add(coreBarrel);

    // Heavy LatheGeometry telescopic rangefinder scope
    const scopeGeo = this._makeLathe(
      'deadeye_scope',
      [
        [0.024, 0.0],
        [0.028, 0.06],
        [0.02, 0.08],
        [0.02, 0.24],
        [0.035, 0.28],
        [0.035, 0.36],
        [0.026, 0.36],
      ],
      12
    );
    const scope = new THREE.Mesh(scopeGeo, p.coloredPlate);
    scope.rotation.x = Math.PI * 0.5;
    scope.position.set(0, 0.085, -0.04);
    rifle.add(scope);

    rifle.add(
      new THREE.Mesh(
        this._makeTube(
          'deadeye_rifle_hose',
          [
            [0.02, -0.05, 0.04],
            [0.12, -0.22, -0.14],
            [0.08, -0.32, -0.34],
          ],
          0.014,
          10,
          6
        ),
        p.cableMat
      )
    );

    weaponMuzzle.position.set(0, 0.008, 1.20);
    rifle.add(weaponMuzzle);
    rightArm.add(rifle);
    bodyGroup.add(rightArm);

    leftArm.position.set(0.27, 1.46, 0.02);
    const lUpper = new THREE.Mesh(armGeo, p.pistonSteel);
    lUpper.position.set(-0.08, -0.14, 0.22);
    lUpper.rotation.x = -1.1;
    lUpper.rotation.z = -0.38;
    leftArm.add(lUpper);
    bodyGroup.add(leftArm);

    // Active Visible Crimson Targeting Laser Beam (unit-length along +Z from z=0 to z=1)
    const outerBeamGeo = new THREE.CylinderGeometry(0.018, 0.018, 1.0, 8, 1, true);
    outerBeamGeo.rotateX(Math.PI * 0.5);
    outerBeamGeo.translate(0, 0, 0.5);
    ownedGeometries.push(outerBeamGeo);

    const innerBeamGeo = new THREE.CylinderGeometry(0.006, 0.006, 1.0, 6, 1, true);
    innerBeamGeo.rotateX(Math.PI * 0.5);
    innerBeamGeo.translate(0, 0, 0.5);
    ownedGeometries.push(innerBeamGeo);

    const outerLaserMat = new THREE.MeshBasicMaterial({
      color: 0xe62020,
      transparent: true,
      opacity: 0.82,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const innerLaserMat = new THREE.MeshBasicMaterial({
      color: 0xffb3a0,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    ownedMaterials.push(outerLaserMat, innerLaserMat);

    const laserLine = new THREE.Mesh(outerBeamGeo, outerLaserMat);
    const innerCore = new THREE.Mesh(innerBeamGeo, innerLaserMat);
    laserLine.add(innerCore);
    laserLine.visible = false;
    laserLine.frustumCulled = false;
    laserLine.renderOrder = 8;
    root.add(laserLine);

    return laserLine;
  }

  // ===========================================================================
  // 5. COLOSSUS-IV // ASH TITAN (4.2m Reverse-Jointed Mining/Siege Boss)
  // ===========================================================================
  _buildCyberMechBoss(
    p,
    ownedMaterials,
    bodyGroup,
    headGroup,
    headAnchor,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    weaponMuzzle,
    rotors,
    coreRings
  ) {
    // Colossal Reverse-Jointed Mining/Siege Walker Legs (hip pivot at y = 1.96)
    const thighGeo = this._makeExtrudedPoly(
      'colossus_thigh',
      [
        [-0.26, 0.14],
        [0.26, 0.14],
        [0.32, -0.34],
        [0.24, -0.86],
        [-0.24, -0.86],
        [-0.32, -0.34],
      ],
      0.52,
      0.05,
      0.044,
      2
    );
    const kneeDrumGeo = this._makeLathe(
      'colossus_knee_drum',
      [
        [0.14, -0.26],
        [0.28, -0.24],
        [0.30, 0.0],
        [0.28, 0.24],
        [0.14, 0.26],
      ],
      14
    );
    const shinGeo = this._makeExtrudedPoly(
      'colossus_shin',
      [
        [-0.24, 0.04],
        [0.24, 0.04],
        [0.30, -0.78],
        [0.22, -0.98],
        [-0.22, -0.98],
        [-0.30, -0.78],
      ],
      0.46,
      0.048,
      0.04,
      2
    );
    const clawToeGeo = this._makeExtrudedPoly(
      'colossus_toe_claw',
      [
        [-0.12, -0.04],
        [0.12, -0.04],
        [0.09, 0.44],
        [-0.09, 0.44],
      ],
      0.22,
      0.024,
      0.02,
      1
    );
    const legHydraulicGeo = this._makeTube(
      'colossus_leg_hose',
      [
        [0, -0.20, -0.28],
        [0, -0.88, -0.48],
        [0, -1.62, -0.22],
      ],
      0.068,
      12,
      8
    );

    const buildBossLeg = (legGroup, sideX) => {
      legGroup.position.set(sideX, 1.96, 0);

      const thigh = new THREE.Mesh(thighGeo, p.primaryArmor);
      thigh.rotation.x = -0.22;
      legGroup.add(thigh);

      // Reverse-jointed heavy knee drum + heated bronze/amber hydraulic bearing ring
      const knee = new THREE.Mesh(kneeDrumGeo, p.darkFrame);
      knee.rotation.z = Math.PI * 0.5;
      knee.position.set(0, -0.86, 0.16);
      legGroup.add(knee);

      const kneeRing = new THREE.Mesh(
        this._getGeo('colossus_knee_ring', () => new THREE.TorusGeometry(0.24, 0.032, 8, 16)),
        p.accentGlow
      );
      kneeRing.rotation.y = Math.PI * 0.5;
      kneeRing.position.set(sideX > 0 ? 0.27 : -0.27, -0.86, 0.16);
      legGroup.add(kneeRing);

      const shin = new THREE.Mesh(shinGeo, p.coloredPlate);
      shin.position.set(0, -0.90, 0.12);
      shin.rotation.x = 0.14;
      legGroup.add(shin);

      // Exposed hydraulic cylinder behind shin
      const shinPiston = new THREE.Mesh(
        this._getGeo('colossus_shin_piston', () => new THREE.CylinderGeometry(0.08, 0.08, 0.85, 8)),
        p.pistonSteel
      );
      shinPiston.position.set(0, -1.32, -0.18);
      legGroup.add(shinPiston);

      // Heavy Industrial Hydraulic Talons (splayed outward properly: toe.rotation.z = -toeAngles[t])
      const footHub = new THREE.Mesh(
        this._getGeo('colossus_foot_hub', () => new THREE.CylinderGeometry(0.32, 0.38, 0.22, 8)),
        p.darkFrame
      );
      footHub.position.set(0, -1.85, 0.02);
      legGroup.add(footHub);

      const toeAngles = [-0.55, 0.0, 0.55];
      for (let t = 0; t < toeAngles.length; t++) {
        const toe = new THREE.Mesh(clawToeGeo, p.primaryArmor);
        toe.rotation.x = Math.PI * 0.5;
        toe.rotation.z = -toeAngles[t];
        toe.position.set(Math.sin(toeAngles[t]) * 0.28, -1.85, 0.14 + Math.cos(toeAngles[t]) * 0.12);
        legGroup.add(toe);
      }

      const heel = new THREE.Mesh(clawToeGeo, p.primaryArmor);
      heel.rotation.x = Math.PI * 0.5;
      heel.rotation.z = Math.PI;
      heel.position.set(0, -1.85, -0.24);
      legGroup.add(heel);

      legGroup.add(new THREE.Mesh(legHydraulicGeo, p.cableMat));
      bodyGroup.add(legGroup);
    };

    buildBossLeg(leftLeg, 0.62);
    buildBossLeg(rightLeg, -0.62);

    // Massive Gyro-Turret Waist & Bolted Pelvis
    const pelvisGeo = this._makeExtrudedPoly(
      'colossus_pelvis',
      [
        [-0.74, 0.26],
        [0.74, 0.26],
        [0.54, -0.34],
        [-0.54, -0.34],
      ],
      0.72,
      0.055,
      0.045,
      2
    );
    const pelvis = new THREE.Mesh(pelvisGeo, p.darkFrame);
    pelvis.position.set(0, 2.02, 0);
    bodyGroup.add(pelvis);

    const waistColumn = new THREE.Mesh(
      this._getGeo('colossus_waist', () => new THREE.CylinderGeometry(0.46, 0.54, 0.44, 12)),
      p.pistonSteel
    );
    waistColumn.position.set(0, 2.34, 0);
    bodyGroup.add(waistColumn);

    // Towering Multi-Tiered Siege Dreadnought Chassis
    const torsoGeo = this._makeExtrudedPoly(
      'colossus_torso',
      [
        [-0.98, 0.58],
        [-0.64, 0.82],
        [0.64, 0.82],
        [0.98, 0.58],
        [0.86, -0.26],
        [0.56, -0.62],
        [-0.56, -0.62],
        [-0.86, -0.26],
      ],
      0.92,
      0.085,
      0.07,
      2
    );
    const torso = new THREE.Mesh(torsoGeo, p.primaryArmor);
    torso.position.set(0, 2.94, 0.04);
    bodyGroup.add(torso);

    // Burnt-Crimson Siege Breastplate + Exposed Chest Furnace Reactor Grill
    const breastplateGeo = this._makeExtrudedPoly(
      'colossus_breastplate',
      [
        [-0.76, 0.44],
        [0.76, 0.44],
        [0.58, -0.38],
        [0, -0.52],
        [-0.58, -0.38],
      ],
      0.24,
      0.046,
      0.038,
      2
    );
    const breastplate = new THREE.Mesh(breastplateGeo, p.coloredPlate);
    breastplate.position.set(0, 2.96, 0.54);
    breastplate.rotation.x = -0.14;
    bodyGroup.add(breastplate);

    // Exposed Furnace Reactor Core + Heavy Iron Grill Cage on Chest
    const furnaceCoreGeo = this._makeLathe(
      'colossus_chest_furnace',
      [
        [0.05, 0.0],
        [0.24, 0.04],
        [0.28, 0.13],
        [0.18, 0.20],
      ],
      16
    );
    const chestFurnace = new THREE.Mesh(furnaceCoreGeo, p.accentGlow);
    chestFurnace.rotation.x = Math.PI * 0.5;
    chestFurnace.position.set(0, 2.98, 0.61);
    bodyGroup.add(chestFurnace);

    const grillBarGeo = this._getGeo('colossus_grill_bar', () => new THREE.BoxGeometry(0.56, 0.042, 0.045));
    for (let g = -2; g <= 2; g++) {
      const bar = new THREE.Mesh(grillBarGeo, p.darkFrame);
      bar.position.set(0, 2.98 + g * 0.095, 0.72);
      bodyGroup.add(bar);
    }

    for (let side = -1; side <= 1; side += 2) {
      for (let v = 0; v < 4; v++) {
        const louver = new THREE.Mesh(
          this._getGeo('colossus_side_vent', () => new THREE.BoxGeometry(0.14, 0.07, 0.34)),
          p.accentGlow
        );
        louver.position.set(side * 0.94, 3.24 - v * 0.16, 0.08);
        bodyGroup.add(louver);
      }

      // Massive dorsal coolant & fuel hoses
      bodyGroup.add(
        new THREE.Mesh(
          this._makeTube(
            `colossus_reactor_hose_${side}`,
            [
              [side * 0.44, 2.38, -0.46],
              [side * 0.72, 2.98, -0.78],
              [side * 0.66, 3.66, -0.32],
              [side * 0.38, 3.54, 0.06],
            ],
            0.075,
            14,
            8
          ),
          p.cableMat
        )
      );
    }

    // Twin Dorsal Smokestack Exhaust Chimneys (LatheGeometry)
    const smokestackGeo = this._makeLathe(
      'colossus_smokestack',
      [
        [0.16, 0.0],
        [0.20, 0.10],
        [0.18, 0.95],
        [0.24, 1.06],
        [0.21, 1.12],
        [0.14, 1.08],
      ],
      14
    );
    for (let side = -1; side <= 1; side += 2) {
      const stack = new THREE.Mesh(smokestackGeo, p.darkFrame);
      stack.position.set(side * 0.48, 3.28, -0.58);
      stack.rotation.x = -0.22;
      stack.rotation.z = -side * 0.08;
      bodyGroup.add(stack);

      const emberTop = new THREE.Mesh(
        this._getGeo('colossus_stack_ember', () => new THREE.CylinderGeometry(0.13, 0.13, 0.08, 10)),
        p.accentGlow
      );
      emberTop.position.set(side * 0.56, 4.26, -0.80);
      emberTop.rotation.x = -0.22;
      bodyGroup.add(emberTop);
    }

    // Twin Shoulder-Mounted 6-Cell Missile Racks
    const podGeo = this._makeExtrudedPoly(
      'colossus_missile_pod',
      [
        [-0.32, -0.22],
        [0.32, -0.22],
        [0.36, 0.24],
        [-0.36, 0.24],
      ],
      0.56,
      0.032,
      0.028,
      2
    );
    const warheadGeo = this._getGeo('colossus_warhead', () => new THREE.ConeGeometry(0.062, 0.14, 8));
    for (let side = -1; side <= 1; side += 2) {
      const pod = new THREE.Group();
      pod.position.set(side * 0.96, 3.84, -0.06);
      pod.rotation.x = -0.18;
      pod.rotation.z = -side * 0.12;
      pod.add(new THREE.Mesh(podGeo, p.primaryArmor));

      for (let r = 0; r < 2; r++) {
        for (let c = 0; c < 3; c++) {
          const tip = new THREE.Mesh(warheadGeo, p.coloredPlate);
          tip.rotation.x = Math.PI * 0.5;
          tip.position.set((c - 1) * 0.18, (r - 0.5) * 0.18, 0.30);
          pod.add(tip);
        }
      }
      bodyGroup.add(pod);
    }

    // Prominent Armored Cranial Furnace Reactor Core (Headshot Weakpoint at y = 3.55!)
    headGroup.position.set(0, 3.55, 0.16);
    bodyGroup.add(headGroup);

    const cranialCoreGeo = this._makeLathe(
      'colossus_cranial_core',
      [
        [0.01, -0.34],
        [0.24, -0.28],
        [0.38, -0.08],
        [0.40, 0.12],
        [0.30, 0.32],
        [0.14, 0.42],
        [0.01, 0.44],
      ],
      20
    );
    headGroup.add(new THREE.Mesh(cranialCoreGeo, p.weakpointGlow));

    // Welded Armored Blast Crown Cage framing the glowing furnace core (clear frontal sightline!)
    const crownHornGeo = this._makeExtrudedPoly(
      'colossus_crown_horn',
      [
        [-0.08, -0.26],
        [0.10, -0.18],
        [0.22, 0.46],
        [0.04, 0.56],
        [-0.06, 0.20],
      ],
      0.16,
      0.022,
      0.018,
      1
    );
    for (let side = -1; side <= 1; side += 2) {
      const horn = new THREE.Mesh(crownHornGeo, p.coloredPlate);
      horn.position.set(side * 0.42, 0.12, -0.02);
      horn.scale.x = side;
      horn.rotation.y = side * 0.24;
      headGroup.add(horn);
    }

    const crownCollar = new THREE.Mesh(
      this._getGeo('colossus_crown_ring', () => new THREE.TorusGeometry(0.45, 0.042, 10, 22)),
      p.darkFrame
    );
    crownCollar.rotation.x = Math.PI * 0.5;
    crownCollar.position.set(0, 0.06, 0);
    headGroup.add(crownCollar);

    headAnchor.position.set(0, 0.06, 0.06);
    headGroup.add(headAnchor);

    // Twin Articulated Arms Wielding 6-Barrel Spinning Rotary Autocannons
    const bossPauldronGeo = this._makeExtrudedPoly(
      'colossus_pauldron',
      [
        [-0.36, 0.34],
        [0.32, 0.28],
        [0.42, -0.24],
        [0.14, -0.40],
        [-0.34, -0.18],
      ],
      0.68,
      0.05,
      0.044,
      2
    );
    const rotaryBarrelGeo = this._makeLathe(
      'colossus_rotary_barrel',
      [
        [0.036, 0.0],
        [0.036, 0.88],
        [0.048, 0.92],
        [0.042, 1.02],
        [0.028, 1.02],
      ],
      8
    );
    const clampDiskGeo = this._getGeo('colossus_rotary_clamp', () => new THREE.CylinderGeometry(0.21, 0.21, 0.06, 12));
    const gunHousingGeo = this._makeExtrudedPoly(
      'colossus_gun_housing',
      [
        [-0.24, -0.24],
        [0.24, -0.24],
        [0.28, 0.22],
        [-0.28, 0.22],
      ],
      0.86,
      0.036,
      0.03,
      2
    );

    const leftWeaponMuzzle = new THREE.Object3D();

    const buildBossCannonArm = (armGroup, side, muzzleObj) => {
      armGroup.position.set(side * 1.24, 3.24, 0.08);

      const pauldron = new THREE.Mesh(bossPauldronGeo, p.coloredPlate);
      pauldron.position.set(side * 0.14, 0.12, 0);
      pauldron.scale.x = -side;
      armGroup.add(pauldron);

      const upperArm = new THREE.Mesh(
        this._getGeo('colossus_upper_arm', () => new THREE.CylinderGeometry(0.18, 0.16, 0.72, 10)),
        p.pistonSteel
      );
      upperArm.position.set(side * 0.12, -0.38, 0.08);
      upperArm.rotation.x = -0.28;
      armGroup.add(upperArm);

      const cannonPod = new THREE.Group();
      cannonPod.position.set(side * 0.14, -0.68, 0.56);
      cannonPod.add(new THREE.Mesh(gunHousingGeo, p.primaryArmor));

      const heatRail = new THREE.Mesh(
        this._getGeo('colossus_gun_rail', () => new THREE.BoxGeometry(0.12, 0.08, 0.76)),
        p.accentGlow
      );
      heatRail.position.set(0, 0.25, 0.06);
      cannonPod.add(heatRail);

      // Spinning 6-barrel Gatling rotary autocannon cluster
      const barrelCluster = new THREE.Group();
      barrelCluster.position.set(0, -0.02, 0.40);
      for (let b = 0; b < 6; b++) {
        const ang = (b / 6) * Math.PI * 2;
        const barrel = new THREE.Mesh(rotaryBarrelGeo, p.darkFrame);
        barrel.rotation.x = Math.PI * 0.5;
        barrel.position.set(Math.cos(ang) * 0.135, Math.sin(ang) * 0.135, 0);
        barrelCluster.add(barrel);
      }
      const clamp1 = new THREE.Mesh(clampDiskGeo, p.coloredPlate);
      clamp1.rotation.x = Math.PI * 0.5;
      clamp1.position.z = 0.34;
      barrelCluster.add(clamp1);

      const clamp2 = new THREE.Mesh(clampDiskGeo, p.accentGlow);
      clamp2.rotation.x = Math.PI * 0.5;
      clamp2.position.z = 0.78;
      barrelCluster.add(clamp2);

      cannonPod.add(barrelCluster);
      rotors.push(barrelCluster);

      cannonPod.add(
        new THREE.Mesh(
          this._makeTube(
            `colossus_ammo_feed_${side}`,
            [
              [-side * 0.16, 0.12, -0.26],
              [-side * 0.42, 0.48, -0.58],
              [-side * 0.52, 0.82, -0.52],
            ],
            0.055,
            10,
            6
          ),
          p.cableMat
        )
      );

      muzzleObj.position.set(0, -0.02, 1.48);
      cannonPod.add(muzzleObj);
      armGroup.add(cannonPod);
      bodyGroup.add(armGroup);
    };

    buildBossCannonArm(rightArm, -1, weaponMuzzle);
    buildBossCannonArm(leftArm, 1, leftWeaponMuzzle);

    // 3 Rotating Heavy Iron & Overheated Molten-Amber Orbital Cooling Rings (coreRings)
    const ringConfigs = [
      { r: 1.75, tube: 0.052, tiltX: 0.45, tiltZ: 0.32, y: 2.96, color: 0x5c4b42, emissive: 0xd97706 },
      { r: 2.02, tube: 0.048, tiltX: -0.58, tiltZ: 0.65, y: 2.98, color: 0x7c2d12, emissive: 0xff3b1f },
      { r: 2.24, tube: 0.042, tiltX: 0.82, tiltZ: -0.48, y: 2.94, color: 0x4f443d, emissive: 0xff6b1a },
    ];

    const finGeo = this._getGeo('colossus_ring_fin', () => new THREE.BoxGeometry(0.18, 0.12, 0.16));
    for (let i = 0; i < ringConfigs.length; i++) {
      const cfg = ringConfigs[i];
      const ringGroup = new THREE.Group();
      ringGroup.position.set(0, cfg.y, 0.04);
      ringGroup.rotation.set(cfg.tiltX, i * 1.1, cfg.tiltZ);
      ringGroup.userData.baseRotation = new THREE.Euler(cfg.tiltX, i * 1.1, cfg.tiltZ);

      const ringMat = new THREE.MeshStandardMaterial({
        color: cfg.color,
        emissive: new THREE.Color(cfg.emissive),
        emissiveIntensity: 1.55,
        roughness: 0.38,
        metalness: 0.72,
      });
      ringMat.userData.baseColor = ringMat.color.clone();
      ringMat.userData.baseEmissive = ringMat.emissive.clone();
      ringMat.userData.baseEmissiveIntensity = ringMat.emissiveIntensity;
      ownedMaterials.push(ringMat);

      const ringGeo = this._getGeo(`colossus_orbit_ring_${i}`, () => {
        return new THREE.TorusGeometry(cfg.r, cfg.tube, 8, 36);
      });
      ringGroup.add(new THREE.Mesh(ringGeo, ringMat));

      // Heavy cast-iron cooling fin clamps anchored along each orbital ring
      for (let n = 0; n < 6; n++) {
        const ang = (n / 6) * Math.PI * 2;
        const fin = new THREE.Mesh(finGeo, n % 2 === 0 ? p.darkFrame : ringMat);
        fin.position.set(Math.cos(ang) * cfg.r, Math.sin(ang) * cfg.r, 0);
        fin.rotation.z = ang;
        ringGroup.add(fin);
      }

      ringGroup.userData.ringMaterial = ringMat;
      bodyGroup.add(ringGroup);
      coreRings.push(ringGroup);
    }

    // Phase-Surge Heated Industrial Blast Shield Shell (flares up on Phase 2/3 shieldPulse)
    const bossShieldGeo = this._getGeo('colossus_phase_shield', () => {
      return new THREE.CylinderGeometry(1.78, 1.85, 2.2, 24, 1, true);
    });
    const bossShieldMat = new THREE.MeshStandardMaterial({
      color: 0xff7b24,
      map: this._textures.blastShield,
      emissive: new THREE.Color(0xe63916),
      emissiveMap: this._textures.blastShield,
      emissiveIntensity: 2.0,
      transparent: true,
      opacity: 0.0,
      roughness: 0.38,
      metalness: 0.45,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    bossShieldMat.userData.baseColor = bossShieldMat.color.clone();
    bossShieldMat.userData.baseEmissive = bossShieldMat.emissive.clone();
    bossShieldMat.userData.baseEmissiveIntensity = bossShieldMat.emissiveIntensity;
    bossShieldMat.userData.baseOpacity = 0.72;
    ownedMaterials.push(bossShieldMat);

    const shieldMesh = new THREE.Mesh(bossShieldGeo, bossShieldMat);
    shieldMesh.position.set(0, 2.15, 0.04);
    shieldMesh.visible = false;
    shieldMesh.renderOrder = 7;
    bodyGroup.add(shieldMesh);

    // --- Orbital Sovereign Remodel: 6 Towering Seraphim Plasma Wings, Solar Crown Halo & Sovereign Shield ---
    if (shieldMesh && shieldMesh.material) {
      shieldMesh.material.color.setHex(0x38bdf8);
      shieldMesh.material.emissive.setHex(0x0284c7);
      if (shieldMesh.material.userData) {
        shieldMesh.material.userData.baseColor = shieldMesh.material.color.clone();
        shieldMesh.material.userData.baseEmissive = shieldMesh.material.emissive.clone();
      }
    }
    const seraphWingGeo = this._getGeo('overlord_seraph_wing', () => new THREE.BoxGeometry(0.18, 2.35, 0.52));
    const seraphGlowGeo = this._getGeo('overlord_seraph_glow', () => new THREE.PlaneGeometry(0.65, 2.45));
    for (const side of [-1, 1]) {
      for (let f = 0; f < 3; f++) {
        const angleZ = side * (-0.38 - f * 0.34);
        const wingSpine = new THREE.Mesh(seraphWingGeo, p.primaryArmor);
        wingSpine.position.set(side * (1.25 + f * 0.58), 3.35 + (1 - f) * 0.45, -0.88 - f * 0.18);
        wingSpine.rotation.set(-0.22, side * 0.16, angleZ);
        bodyGroup.add(wingSpine);

        const wingAura = new THREE.Mesh(seraphGlowGeo, p.holoEnergy);
        wingAura.position.set(side * (1.42 + f * 0.65), 3.45 + (1 - f) * 0.45, -0.94 - f * 0.18);
        wingAura.rotation.set(-0.22, side * 0.16, angleZ);
        bodyGroup.add(wingAura);
      }
    }
    const crownHalo = new THREE.Mesh(
      this._getGeo('overlord_crown_halo', () => new THREE.TorusGeometry(0.95, 0.065, 10, 32)),
      p.accentGlow
    );
    crownHalo.position.set(0, 4.35, -0.25);
    crownHalo.rotation.x = 0.25;
    bodyGroup.add(crownHalo);
    coreRings.push(crownHalo);

    const sovereignRing = new THREE.Mesh(
      this._getGeo('overlord_sovereign_ring', () => new THREE.TorusGeometry(2.35, 0.075, 10, 40)),
      p.holoEnergy
    );
    sovereignRing.position.set(0, 2.85, -0.65);
    sovereignRing.rotation.set(0.35, 0.2, 0);
    bodyGroup.add(sovereignRing);
    coreRings.push(sovereignRing);

    return { shieldMesh, leftWeaponMuzzle };
  }

  /**
   * Shared helper to create a clipped telegraph lock-on laser beam mesh.
   * @private
   */
  _createLaserBeam(ownedMaterials, ownedGeometries, root, outerColorHex, innerColorHex) {
    const outerBeamGeo = new THREE.CylinderGeometry(0.018, 0.018, 1.0, 8, 1, true);
    outerBeamGeo.rotateX(Math.PI * 0.5);
    outerBeamGeo.translate(0, 0, 0.5);
    ownedGeometries.push(outerBeamGeo);

    const innerBeamGeo = new THREE.CylinderGeometry(0.006, 0.006, 1.0, 6, 1, true);
    innerBeamGeo.rotateX(Math.PI * 0.5);
    innerBeamGeo.translate(0, 0, 0.5);
    ownedGeometries.push(innerBeamGeo);

    const outerLaserMat = new THREE.MeshBasicMaterial({
      color: outerColorHex,
      transparent: true,
      opacity: 0.82,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const innerLaserMat = new THREE.MeshBasicMaterial({
      color: innerColorHex,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    ownedMaterials.push(outerLaserMat, innerLaserMat);

    const laserLine = new THREE.Mesh(outerBeamGeo, outerLaserMat);
    const innerCore = new THREE.Mesh(innerBeamGeo, innerLaserMat);
    laserLine.add(innerCore);
    laserLine.visible = false;
    laserLine.frustumCulled = false;
    laserLine.renderOrder = 8;
    root.add(laserLine);
    return laserLine;
  }

  // ===========================================================================
  // 6. AEGIS INTERCEPTOR (Swept-Wing Twin Tilt-Rotor Gunship + Twin Blasters)
  // ===========================================================================
  _buildInterceptorDrone(
    p,
    bodyGroup,
    headGroup,
    headAnchor,
    leftArm,
    rightArm,
    weaponMuzzle,
    rotors
  ) {
    bodyGroup.position.set(0, 0.62, 0);

    // Swept angular gunship fuselage
    const hullGeo = this._makeExtrudedPoly(
      'interceptor_hull',
      [
        [0.0, 0.44],
        [0.24, 0.14],
        [0.30, -0.26],
        [0.14, -0.46],
        [-0.14, -0.46],
        [-0.30, -0.26],
        [-0.24, 0.14],
      ],
      0.20,
      0.026,
      0.022,
      2
    );
    const hull = new THREE.Mesh(hullGeo, p.primaryArmor);
    hull.rotation.x = Math.PI * 0.5;
    hull.position.set(0, 0.04, 0);
    bodyGroup.add(hull);

    // Armored dorsal spine crest
    const spineGeo = this._makeExtrudedPoly(
      'interceptor_spine',
      [
        [0.0, 0.28],
        [0.12, -0.34],
        [-0.12, -0.34],
      ],
      0.11,
      0.018,
      0.015,
      1
    );
    const spine = new THREE.Mesh(spineGeo, p.coloredPlate);
    spine.rotation.x = Math.PI * 0.5;
    spine.position.set(0, 0.18, -0.05);
    bodyGroup.add(spine);

    // Swept Delta Thruster Wings + Twin Tilt-Rotor Nacelles
    const wingGeo = this._makeExtrudedPoly(
      'interceptor_wing',
      [
        [0.0, 0.16],
        [0.54, -0.10],
        [0.62, -0.30],
        [0.14, -0.22],
      ],
      0.045,
      0.012,
      0.01,
      1
    );
    const shroudGeo = this._makeLathe(
      'interceptor_rotor_shroud',
      [
        [0.17, -0.10],
        [0.23, -0.07],
        [0.24, 0.02],
        [0.21, 0.10],
        [0.16, 0.10],
        [0.15, -0.06],
        [0.17, -0.10],
      ],
      16
    );
    const bladeGeo = this._getGeo('interceptor_rotor_blade', () => new THREE.BoxGeometry(0.28, 0.016, 0.048));
    const hubGeo = this._getGeo('interceptor_rotor_hub', () => new THREE.CylinderGeometry(0.038, 0.044, 0.10, 8));
    const ringGeo = this._getGeo('interceptor_heat_ring', () => new THREE.TorusGeometry(0.165, 0.014, 6, 16));

    for (let side = -1; side <= 1; side += 2) {
      const wing = new THREE.Mesh(wingGeo, p.coloredPlate);
      wing.rotation.x = Math.PI * 0.5;
      wing.scale.x = side;
      wing.position.set(side * 0.18, 0.08, -0.04);
      bodyGroup.add(wing);

      const nacelle = new THREE.Group();
      nacelle.position.set(side * 0.72, 0.12, -0.16);
      nacelle.rotation.z = -side * 0.22;
      nacelle.rotation.x = 0.24;
      nacelle.add(new THREE.Mesh(shroudGeo, p.darkFrame));

      const ring = new THREE.Mesh(ringGeo, p.accentGlow);
      ring.rotation.x = Math.PI * 0.5;
      ring.position.y = -0.06;
      nacelle.add(ring);

      const rotorPivot = new THREE.Group();
      rotorPivot.add(new THREE.Mesh(hubGeo, p.pistonSteel));
      for (let b = 0; b < 3; b++) {
        const blade = new THREE.Mesh(bladeGeo, p.pistonSteel);
        blade.rotation.y = (b / 3) * Math.PI;
        rotorPivot.add(blade);
      }
      nacelle.add(rotorPivot);
      rotors.push(rotorPivot);
      bodyGroup.add(nacelle);

      // Rear coolant feed tube
      bodyGroup.add(
        new THREE.Mesh(
          this._makeTube(
            `interceptor_hose_${side}`,
            [
              [side * 0.14, 0.08, -0.24],
              [side * 0.42, 0.15, -0.32],
              [side * 0.64, 0.12, -0.20],
            ],
            0.016,
            8,
            6
          ),
          p.cableMat
        )
      );
    }

    // Rear jet exhaust thruster
    const exhaust = new THREE.Mesh(
      this._getGeo('interceptor_exhaust', () => new THREE.CylinderGeometry(0.11, 0.15, 0.24, 10)),
      p.darkFrame
    );
    exhaust.rotation.x = Math.PI * 0.5;
    exhaust.position.set(0, 0.04, -0.48);
    bodyGroup.add(exhaust);

    const thrusterGlow = new THREE.Mesh(
      this._getGeo('interceptor_thruster_core', () => new THREE.CylinderGeometry(0.08, 0.08, 0.06, 10)),
      p.accentGlow
    );
    thrusterGlow.rotation.x = Math.PI * 0.5;
    thrusterGlow.position.set(0, 0.04, -0.58);
    bodyGroup.add(thrusterGlow);

    // Armored Sensor Pod Nose (headGroup / headAnchor)
    headGroup.position.set(0, 0.02, 0.38);
    bodyGroup.add(headGroup);

    const noseCowl = new THREE.Mesh(
      this._makeExtrudedPoly(
        'interceptor_nose_cowl',
        [
          [-0.18, 0.08],
          [0.18, 0.08],
          [0.12, -0.09],
          [-0.12, -0.09],
        ],
        0.18,
        0.018,
        0.015,
        1
      ),
      p.darkFrame
    );
    headGroup.add(noseCowl);

    const opticEye = new THREE.Mesh(
      this._getGeo('interceptor_optic_core', () => new THREE.BoxGeometry(0.24, 0.085, 0.10)),
      p.weakpointGlow
    );
    opticEye.position.set(0, 0, 0.08);
    headGroup.add(opticEye);

    headAnchor.position.set(0, 0, 0.08);
    headGroup.add(headAnchor);

    // Twin Wingtip Repeater Pods (rightArm -> weaponMuzzle, leftArm -> leftWeaponMuzzle)
    const podHousingGeo = this._getGeo('interceptor_pod_box', () => new THREE.BoxGeometry(0.11, 0.10, 0.36));
    const podBarrelGeo = this._getGeo('interceptor_pod_barrel', () => new THREE.CylinderGeometry(0.024, 0.028, 0.32, 8));
    const leftWeaponMuzzle = new THREE.Object3D();

    const mountPod = (armGroup, sideX, muzzleObj) => {
      armGroup.position.set(sideX, -0.09, 0.14);
      armGroup.add(new THREE.Mesh(podHousingGeo, p.darkFrame));
      const barrel = new THREE.Mesh(podBarrelGeo, p.pistonSteel);
      barrel.rotation.x = Math.PI * 0.5;
      barrel.position.set(0, -0.01, 0.24);
      armGroup.add(barrel);
      const collar = new THREE.Mesh(
        this._getGeo('interceptor_pod_collar', () => new THREE.CylinderGeometry(0.034, 0.034, 0.06, 8)),
        p.accentGlow
      );
      collar.rotation.x = Math.PI * 0.5;
      collar.position.set(0, -0.01, 0.34);
      armGroup.add(collar);
      muzzleObj.position.set(0, -0.01, 0.42);
      armGroup.add(muzzleObj);
      bodyGroup.add(armGroup);
    };

    mountPod(rightArm, -0.46, weaponMuzzle);
    mountPod(leftArm, 0.46, leftWeaponMuzzle);

    // --- Orbital Remodel: Swept-Forward Stealth Delta Wings, Plasma Halo Thrusters & Dorsal Holo Fin ---
    const deltaWingGeo = this._getGeo('interceptor_delta_wing', () => new THREE.BoxGeometry(0.68, 0.04, 0.42));
    const haloRingGeo = this._getGeo('interceptor_plasma_halo', () => new THREE.TorusGeometry(0.32, 0.032, 8, 22));
    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(deltaWingGeo, p.primaryArmor);
      wing.position.set(side * 0.72, 0.06, 0.16);
      wing.rotation.set(0.08, side * -0.45, side * 0.18);
      bodyGroup.add(wing);

      const wingEdge = new THREE.Mesh(
        this._getGeo('interceptor_wing_holo', () => new THREE.PlaneGeometry(0.55, 0.18)),
        p.holoEnergy
      );
      wingEdge.position.set(side * 0.88, 0.06, 0.02);
      wingEdge.rotation.set(Math.PI * 0.5, 0, side * -0.45);
      bodyGroup.add(wingEdge);

      const halo = new THREE.Mesh(haloRingGeo, p.accentGlow);
      halo.position.set(side * 0.66, 0.08, -0.05);
      halo.rotation.x = Math.PI * 0.5;
      bodyGroup.add(halo);
      rotors.push(halo);
    }
    const dorsalFin = new THREE.Mesh(
      this._getGeo('interceptor_dorsal_fin', () => new THREE.ConeGeometry(0.14, 0.52, 4)),
      p.holoEnergy
    );
    dorsalFin.position.set(0, 0.44, -0.18);
    dorsalFin.rotation.x = -0.55;
    bodyGroup.add(dorsalFin);

    return leftWeaponMuzzle;
  }

  // ===========================================================================
  // 7. SHOCK BREACHER (Hunched Pneumatic Close-Assault Shotgunner + Ram Claw)
  // ===========================================================================
  _buildShockBreacher(
    p,
    bodyGroup,
    headGroup,
    headAnchor,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    weaponMuzzle
  ) {
    // Wide Digitigrade Pneumatic Breacher Legs (hip pivot at y = 0.96)
    const thighGeo = this._makeExtrudedPoly(
      'breacher_thigh',
      [
        [-0.13, 0.05],
        [0.13, 0.05],
        [0.16, -0.22],
        [0.11, -0.44],
        [-0.11, -0.44],
        [-0.16, -0.22],
      ],
      0.22,
      0.025,
      0.02,
      2
    );
    const shinGeo = this._makeExtrudedPoly(
      'breacher_shin',
      [
        [-0.12, 0.02],
        [0.12, 0.02],
        [0.14, -0.42],
        [0.10, -0.50],
        [-0.10, -0.50],
        [-0.14, -0.42],
      ],
      0.21,
      0.024,
      0.02,
      2
    );
    const footGeo = this._getGeo('breacher_foot', () => new THREE.BoxGeometry(0.24, 0.11, 0.38));

    const buildLeg = (legGroup, sideX) => {
      legGroup.position.set(sideX, 0.96, 0);
      const thigh = new THREE.Mesh(thighGeo, p.primaryArmor);
      thigh.rotation.x = -0.18;
      legGroup.add(thigh);
      const shin = new THREE.Mesh(shinGeo, p.darkFrame);
      shin.position.set(0, -0.42, 0.06);
      shin.rotation.x = 0.12;
      legGroup.add(shin);
      const piston = new THREE.Mesh(
        this._getGeo('breacher_piston', () => new THREE.CylinderGeometry(0.036, 0.036, 0.44, 8)),
        p.pistonSteel
      );
      piston.position.set(0, -0.62, -0.08);
      legGroup.add(piston);
      const foot = new THREE.Mesh(footGeo, p.coloredPlate);
      foot.position.set(0, -0.905, 0.07);
      legGroup.add(foot);
      bodyGroup.add(legGroup);
    };
    buildLeg(leftLeg, 0.24);
    buildLeg(rightLeg, -0.24);

    // Forward-Hunched Broad Siege Torso
    const pelvis = new THREE.Mesh(
      this._getGeo('breacher_pelvis', () => new THREE.BoxGeometry(0.56, 0.24, 0.34)),
      p.darkFrame
    );
    pelvis.position.set(0, 1.0, 0);
    bodyGroup.add(pelvis);

    const torsoGeo = this._makeExtrudedPoly(
      'breacher_torso',
      [
        [-0.46, 0.34],
        [0.46, 0.34],
        [0.36, -0.28],
        [-0.36, -0.28],
      ],
      0.44,
      0.04,
      0.032,
      2
    );
    const torso = new THREE.Mesh(torsoGeo, p.primaryArmor);
    torso.position.set(0, 1.42, 0.06);
    torso.rotation.x = 0.14;
    bodyGroup.add(torso);

    const breastPlate = new THREE.Mesh(
      this._getGeo('breacher_chest_plate', () => new THREE.BoxGeometry(0.68, 0.42, 0.14)),
      p.coloredPlate
    );
    breastPlate.position.set(0, 1.46, 0.28);
    breastPlate.rotation.x = -0.12;
    bodyGroup.add(breastPlate);

    // Dorsal Pressurized Plasma Canisters
    const tankGeo = this._getGeo('breacher_tank', () => new THREE.CylinderGeometry(0.11, 0.11, 0.56, 10));
    for (let side = -1; side <= 1; side += 2) {
      const tank = new THREE.Mesh(tankGeo, p.darkFrame);
      tank.position.set(side * 0.20, 1.54, -0.24);
      tank.rotation.x = -0.18;
      bodyGroup.add(tank);

      const band = new THREE.Mesh(
        this._getGeo('breacher_tank_glow', () => new THREE.CylinderGeometry(0.118, 0.118, 0.10, 10)),
        p.accentGlow
      );
      band.position.set(side * 0.20, 1.62, -0.25);
      band.rotation.x = -0.18;
      bodyGroup.add(band);
    }

    // Horned Jaw-Cage Helm (headHeight = 1.72)
    headGroup.position.set(0, 1.72, 0.16);
    bodyGroup.add(headGroup);

    const helmGeo = this._makeExtrudedPoly(
      'breacher_helm',
      [
        [-0.17, -0.11],
        [0.17, -0.11],
        [0.20, 0.08],
        [0.12, 0.20],
        [-0.12, 0.20],
        [-0.20, 0.08],
      ],
      0.26,
      0.025,
      0.02,
      2
    );
    headGroup.add(new THREE.Mesh(helmGeo, p.darkFrame));

    const twinVisor = new THREE.Mesh(
      this._getGeo('breacher_visor', () => new THREE.BoxGeometry(0.29, 0.085, 0.08)),
      p.weakpointGlow
    );
    twinVisor.position.set(0, 0.02, 0.13);
    headGroup.add(twinVisor);

    const hornGeo = this._getGeo('breacher_horn', () => new THREE.ConeGeometry(0.055, 0.22, 6));
    for (let side = -1; side <= 1; side += 2) {
      const horn = new THREE.Mesh(hornGeo, p.coloredPlate);
      horn.position.set(side * 0.16, 0.17, 0.02);
      horn.rotation.z = -side * 0.36;
      horn.rotation.x = 0.24;
      headGroup.add(horn);
    }
    headAnchor.position.set(0, 0.02, 0.06);
    headGroup.add(headAnchor);

    // Right Arm — Triple-Barrel Heavy Plasma Scattergun
    const pauldronGeo = this._getGeo('breacher_pauldron', () => new THREE.BoxGeometry(0.28, 0.26, 0.34));
    rightArm.position.set(-0.52, 1.56, 0.08);
    rightArm.add(new THREE.Mesh(pauldronGeo, p.coloredPlate));

    const shotgunGroup = new THREE.Group();
    shotgunGroup.position.set(-0.02, -0.32, 0.30);
    shotgunGroup.add(
      new THREE.Mesh(
        this._getGeo('breacher_shotgun_body', () => new THREE.BoxGeometry(0.18, 0.20, 0.56)),
        p.primaryArmor
      )
    );
    const barrelGeo = this._getGeo('breacher_shotgun_barrel', () => new THREE.CylinderGeometry(0.032, 0.032, 0.42, 8));
    for (let b = -1; b <= 1; b++) {
      const bar = new THREE.Mesh(barrelGeo, p.pistonSteel);
      bar.rotation.x = Math.PI * 0.5;
      bar.position.set(b * 0.052, 0.02, 0.36);
      shotgunGroup.add(bar);
    }
    const muzzleShroud = new THREE.Mesh(
      this._getGeo('breacher_muzzle_glow', () => new THREE.BoxGeometry(0.19, 0.06, 0.12)),
      p.accentGlow
    );
    muzzleShroud.position.set(0, 0.10, 0.44);
    shotgunGroup.add(muzzleShroud);
    weaponMuzzle.position.set(0, 0.02, 0.60);
    shotgunGroup.add(weaponMuzzle);
    rightArm.add(shotgunGroup);
    bodyGroup.add(rightArm);

    // Left Arm — Pneumatic Pile-Bunker Ram Gauntlet
    leftArm.position.set(0.52, 1.56, 0.08);
    leftArm.add(new THREE.Mesh(pauldronGeo, p.coloredPlate));
    const gauntlet = new THREE.Mesh(
      this._getGeo('breacher_ram_gauntlet', () => new THREE.BoxGeometry(0.22, 0.24, 0.44)),
      p.darkFrame
    );
    gauntlet.position.set(0.02, -0.30, 0.22);
    leftArm.add(gauntlet);
    const spike = new THREE.Mesh(
      this._getGeo('breacher_ram_spike', () => new THREE.ConeGeometry(0.085, 0.28, 6)),
      p.accentGlow
    );
    spike.rotation.x = Math.PI * 0.5;
    spike.position.set(0.02, -0.30, 0.52);
    leftArm.add(spike);
    bodyGroup.add(leftArm);

    // --- Orbital Remodel: Twin Cryo-Arc Gauntlet Rings, Dorsal Capacitor Spines & Energy Crest ---
    const arcRingGeo = this._getGeo('breacher_arc_ring', () => new THREE.TorusGeometry(0.19, 0.026, 8, 18));
    for (const arm of [leftArm, rightArm]) {
      const ring1 = new THREE.Mesh(arcRingGeo, p.accentGlow);
      ring1.position.set(0, -0.28, 0.34);
      arm.add(ring1);
      const shieldBlade = new THREE.Mesh(
        this._getGeo('breacher_holo_bracer', () => new THREE.BoxGeometry(0.06, 0.34, 0.46)),
        p.holoEnergy
      );
      shieldBlade.position.set(arm === leftArm ? 0.14 : -0.14, -0.26, 0.24);
      arm.add(shieldBlade);
    }
    const spineFinGeo = this._getGeo('breacher_spine_fin', () => new THREE.BoxGeometry(0.08, 0.38, 0.16));
    for (let s = -1; s <= 1; s++) {
      const fin = new THREE.Mesh(spineFinGeo, s === 0 ? p.accentGlow : p.primaryArmor);
      fin.position.set(s * 0.22, 1.56 - Math.abs(s) * 0.08, -0.34);
      fin.rotation.x = -0.38;
      fin.rotation.z = s * -0.22;
      bodyGroup.add(fin);
    }
    const helmCrest = new THREE.Mesh(
      this._getGeo('breacher_helm_crest', () => new THREE.BoxGeometry(0.06, 0.22, 0.34)),
      p.accentGlow
    );
    helmCrest.position.set(0, 0.22, -0.02);
    headGroup.add(helmCrest);
  }

  // ===========================================================================
  // 8. AEGIS PHALANX / RAIL WARDEN (2.4m Shielded Orbital Phalanx + Rail Lance)
  // ===========================================================================
  _buildRailWarden(
    p,
    ownedMaterials,
    bodyGroup,
    headGroup,
    headAnchor,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    weaponMuzzle
  ) {
    // Heavy Orbital Armored Legs (hip pivot at y = 1.12)
    const thighGeo = this._makeExtrudedPoly(
      'warden_thigh',
      [
        [-0.14, 0.06],
        [0.14, 0.06],
        [0.17, -0.24],
        [0.12, -0.50],
        [-0.12, -0.50],
        [-0.17, -0.24],
      ],
      0.26,
      0.03,
      0.024,
      2
    );
    const shinGeo = this._makeExtrudedPoly(
      'warden_shin',
      [
        [-0.13, 0.02],
        [0.13, 0.02],
        [0.16, -0.48],
        [0.12, -0.56],
        [-0.12, -0.56],
        [-0.16, -0.48],
      ],
      0.24,
      0.028,
      0.022,
      2
    );
    const footGeo = this._getGeo('warden_foot', () => new THREE.BoxGeometry(0.28, 0.13, 0.42));

    const buildLeg = (legGroup, sideX) => {
      legGroup.position.set(sideX, 1.12, 0);
      legGroup.add(new THREE.Mesh(thighGeo, p.primaryArmor));
      const knee = new THREE.Mesh(
        this._getGeo('warden_knee', () => new THREE.BoxGeometry(0.22, 0.18, 0.12)),
        p.coloredPlate
      );
      knee.position.set(0, -0.48, 0.14);
      legGroup.add(knee);
      const shin = new THREE.Mesh(shinGeo, p.darkFrame);
      shin.position.set(0, -0.50, 0);
      legGroup.add(shin);
      const foot = new THREE.Mesh(footGeo, p.primaryArmor);
      foot.position.set(0, -1.055, 0.07);
      legGroup.add(foot);
      bodyGroup.add(legGroup);
    };
    buildLeg(leftLeg, 0.27);
    buildLeg(rightLeg, -0.27);

    // Tall Orbital Phalanx Chassis
    const pelvis = new THREE.Mesh(
      this._getGeo('warden_pelvis', () => new THREE.BoxGeometry(0.66, 0.28, 0.38)),
      p.darkFrame
    );
    pelvis.position.set(0, 1.15, 0);
    bodyGroup.add(pelvis);

    const torsoGeo = this._makeExtrudedPoly(
      'warden_torso',
      [
        [-0.50, 0.44],
        [-0.28, 0.56],
        [0.28, 0.56],
        [0.50, 0.44],
        [0.42, -0.22],
        [0.28, -0.36],
        [-0.28, -0.36],
        [-0.42, -0.22],
      ],
      0.46,
      0.045,
      0.036,
      2
    );
    const torso = new THREE.Mesh(torsoGeo, p.primaryArmor);
    torso.position.set(0, 1.66, 0.02);
    bodyGroup.add(torso);

    const sternum = new THREE.Mesh(
      this._getGeo('warden_sternum', () => new THREE.BoxGeometry(0.56, 0.52, 0.14)),
      p.coloredPlate
    );
    sternum.position.set(0, 1.70, 0.26);
    bodyGroup.add(sternum);

    // Dorsal Capacitor Backpack + Twin Cooling Fins
    const backpack = new THREE.Mesh(
      this._getGeo('warden_backpack', () => new THREE.BoxGeometry(0.52, 0.62, 0.28)),
      p.darkFrame
    );
    backpack.position.set(0, 1.72, -0.32);
    bodyGroup.add(backpack);

    const packCore = new THREE.Mesh(
      this._getGeo('warden_pack_glow', () => new THREE.BoxGeometry(0.32, 0.36, 0.06)),
      p.accentGlow
    );
    packCore.position.set(0, 1.74, -0.46);
    bodyGroup.add(packCore);

    // Crested Orbital Helm (headHeight = 2.08)
    headGroup.position.set(0, 2.08, 0.06);
    bodyGroup.add(headGroup);

    const helmGeo = this._makeExtrudedPoly(
      'warden_helm',
      [
        [-0.17, -0.12],
        [0.17, -0.12],
        [0.19, 0.10],
        [0.10, 0.24],
        [-0.10, 0.24],
        [-0.19, 0.10],
      ],
      0.27,
      0.028,
      0.022,
      2
    );
    headGroup.add(new THREE.Mesh(helmGeo, p.primaryArmor));

    const crestVisor = new THREE.Mesh(
      this._getGeo('warden_visor', () => new THREE.BoxGeometry(0.28, 0.095, 0.08)),
      p.weakpointGlow
    );
    crestVisor.position.set(0, 0.02, 0.14);
    headGroup.add(crestVisor);

    const headFin = new THREE.Mesh(
      this._getGeo('warden_crest_fin', () => new THREE.BoxGeometry(0.06, 0.20, 0.28)),
      p.coloredPlate
    );
    headFin.position.set(0, 0.22, -0.02);
    headGroup.add(headFin);

    headAnchor.position.set(0, 0.03, 0.04);
    headGroup.add(headAnchor);

    // Massive Flanged Shoulder Pauldrons
    const pauldronGeo = this._makeExtrudedPoly(
      'warden_pauldron',
      [
        [-0.22, 0.24],
        [0.18, 0.20],
        [0.24, -0.16],
        [-0.18, -0.16],
      ],
      0.38,
      0.034,
      0.028,
      2
    );

    // Right Arm — Long Twin-Rail Magnetic Accelerator Lance
    rightArm.position.set(-0.58, 1.88, 0.04);
    rightArm.add(new THREE.Mesh(pauldronGeo, p.coloredPlate));

    const railLance = new THREE.Group();
    railLance.position.set(-0.04, -0.34, 0.36);
    railLance.add(
      new THREE.Mesh(
        this._getGeo('warden_lance_breech', () => new THREE.BoxGeometry(0.18, 0.22, 0.54)),
        p.darkFrame
      )
    );
    const railBarGeo = this._getGeo('warden_rail_bar', () => new THREE.BoxGeometry(0.055, 0.055, 0.88));
    for (const ry of [-0.055, 0.055]) {
      const rail = new THREE.Mesh(railBarGeo, p.pistonSteel);
      rail.position.set(0, ry, 0.56);
      railLance.add(rail);
    }
    const coreSlot = new THREE.Mesh(
      this._getGeo('warden_rail_core', () => new THREE.BoxGeometry(0.042, 0.038, 0.78)),
      p.accentGlow
    );
    coreSlot.position.set(0, 0, 0.54);
    railLance.add(coreSlot);

    weaponMuzzle.position.set(0, 0, 1.04);
    railLance.add(weaponMuzzle);
    rightArm.add(railLance);
    bodyGroup.add(rightArm);

    // Left Arm — Tall Slotted Aegis Siege Tower Shield (shieldMesh)
    leftArm.position.set(0.58, 1.88, 0.06);
    const lPauldron = new THREE.Mesh(pauldronGeo, p.coloredPlate);
    lPauldron.scale.x = -1;
    leftArm.add(lPauldron);

    const shieldPivot = new THREE.Group();
    shieldPivot.position.set(-0.20, -0.52, 0.64);
    shieldPivot.rotation.y = -0.18;

    const frameBarGeo = this._getGeo('warden_shield_bar', () => new THREE.BoxGeometry(0.92, 0.11, 0.10));
    const topBar = new THREE.Mesh(frameBarGeo, p.primaryArmor);
    topBar.position.set(0, 0.72, -0.02);
    shieldPivot.add(topBar);
    const botBar = new THREE.Mesh(frameBarGeo, p.primaryArmor);
    botBar.position.set(0, -0.72, -0.02);
    shieldPivot.add(botBar);

    const sidePostGeo = this._getGeo('warden_shield_post', () => new THREE.BoxGeometry(0.09, 1.44, 0.09));
    for (let s = -1; s <= 1; s += 2) {
      const post = new THREE.Mesh(sidePostGeo, p.darkFrame);
      post.position.set(s * 0.46, 0, -0.02);
      shieldPivot.add(post);
    }

    const curvedShieldGeo = this._getGeo('warden_blast_shield', () => {
      const geo = new THREE.CylinderGeometry(1.18, 1.18, 1.42, 18, 1, true, -0.44, 0.88);
      geo.translate(0, 0, -1.08);
      return geo;
    });
    const shieldMat = new THREE.MeshStandardMaterial({
      color: 0xff8c2b,
      map: this._textures.blastShield,
      emissive: new THREE.Color(0xd9480f),
      emissiveMap: this._textures.blastShield,
      emissiveIntensity: 1.45,
      transparent: true,
      opacity: 0.88,
      roughness: 0.4,
      metalness: 0.58,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    shieldMat.userData.baseColor = shieldMat.color.clone();
    shieldMat.userData.baseEmissive = shieldMat.emissive.clone();
    shieldMat.userData.baseEmissiveIntensity = shieldMat.emissiveIntensity;
    shieldMat.userData.baseOpacity = 0.88;
    ownedMaterials.push(shieldMat);

    const shieldMesh = new THREE.Mesh(curvedShieldGeo, shieldMat);
    shieldMesh.renderOrder = 6;
    shieldPivot.add(shieldMesh);

    leftArm.add(shieldPivot);
    bodyGroup.add(leftArm);

    // --- Orbital Remodel: Twin Sweeping Cathedral Capacitor Wing-Pylons & Halo Crest ---
    const pylonGeo = this._getGeo('warden_wing_pylon', () => new THREE.BoxGeometry(0.12, 1.15, 0.28));
    const holoWingGeo = this._getGeo('warden_holo_wing', () => new THREE.PlaneGeometry(0.55, 1.05));
    for (const side of [-1, 1]) {
      const pylon = new THREE.Mesh(pylonGeo, p.primaryArmor);
      pylon.position.set(side * 0.62, 2.02, -0.32);
      pylon.rotation.set(-0.24, side * 0.18, side * -0.46);
      bodyGroup.add(pylon);

      const hWing = new THREE.Mesh(holoWingGeo, p.holoEnergy);
      hWing.position.set(side * 0.92, 2.18, -0.42);
      hWing.rotation.set(-0.2, side * 0.25, side * -0.46);
      bodyGroup.add(hWing);
    }
    const wardenHalo = new THREE.Mesh(
      this._getGeo('warden_head_halo', () => new THREE.TorusGeometry(0.28, 0.024, 8, 20)),
      p.accentGlow
    );
    wardenHalo.position.set(0, 0.24, -0.10);
    headGroup.add(wardenHalo);

    return shieldMesh;
  }

  // ===========================================================================
  // 9. SIEGE MORTAR (Wide-Stanced Bombardment Walker + Elevated Dorsal Cannon + Laser)
  // ===========================================================================
  _buildMortarArtillery(
    p,
    ownedMaterials,
    ownedGeometries,
    root,
    bodyGroup,
    headGroup,
    headAnchor,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    weaponMuzzle
  ) {
    // Squat Heavy Stabilizer Legs (hip pivot at y = 0.88)
    const legStrutGeo = this._makeExtrudedPoly(
      'mortar_leg_strut',
      [
        [-0.14, 0.08],
        [0.14, 0.08],
        [0.24, -0.46],
        [0.20, -0.84],
        [-0.12, -0.84],
        [-0.18, -0.42],
      ],
      0.26,
      0.03,
      0.025,
      2
    );
    const padGeo = this._getGeo('mortar_foot_pad', () => new THREE.BoxGeometry(0.38, 0.14, 0.56));

    const buildStabilizer = (legGroup, sideX) => {
      legGroup.position.set(sideX, 0.88, 0);
      const strut = new THREE.Mesh(legStrutGeo, p.darkFrame);
      strut.position.set(sideX > 0 ? 0.08 : -0.08, 0, 0);
      strut.scale.x = sideX > 0 ? 1 : -1;
      legGroup.add(strut);

      const armorPlate = new THREE.Mesh(
        this._getGeo('mortar_leg_plate', () => new THREE.BoxGeometry(0.24, 0.44, 0.34)),
        p.primaryArmor
      );
      armorPlate.position.set(sideX > 0 ? 0.12 : -0.12, -0.34, 0.06);
      legGroup.add(armorPlate);

      const pad = new THREE.Mesh(padGeo, p.coloredPlate);
      pad.position.set(sideX > 0 ? 0.14 : -0.14, -0.81, 0.04);
      legGroup.add(pad);
      bodyGroup.add(legGroup);
    };
    buildStabilizer(leftLeg, 0.42);
    buildStabilizer(rightLeg, -0.42);

    // Wide Rotating Cylindrical Artillery Turret Hull
    const waistDrum = new THREE.Mesh(
      this._getGeo('mortar_waist_drum', () => new THREE.CylinderGeometry(0.46, 0.54, 0.42, 12)),
      p.darkFrame
    );
    waistDrum.position.set(0, 1.04, 0);
    bodyGroup.add(waistDrum);

    const turretHullGeo = this._makeExtrudedPoly(
      'mortar_turret_hull',
      [
        [-0.56, 0.28],
        [0.56, 0.28],
        [0.48, -0.26],
        [-0.48, -0.26],
      ],
      0.64,
      0.045,
      0.036,
      2
    );
    const turretHull = new THREE.Mesh(turretHullGeo, p.primaryArmor);
    turretHull.position.set(0, 1.46, 0);
    bodyGroup.add(turretHull);

    const glacisShield = new THREE.Mesh(
      this._getGeo('mortar_glacis', () => new THREE.BoxGeometry(0.84, 0.36, 0.18)),
      p.coloredPlate
    );
    glacisShield.position.set(0, 1.44, 0.36);
    glacisShield.rotation.x = -0.24;
    bodyGroup.add(glacisShield);

    // Front Optical Targeting Cyclops Turret (headHeight = 1.56)
    headGroup.position.set(0, 1.56, 0.38);
    bodyGroup.add(headGroup);

    const sensorPod = new THREE.Mesh(
      this._getGeo('mortar_sensor_pod', () => new THREE.CylinderGeometry(0.18, 0.20, 0.22, 12)),
      p.darkFrame
    );
    sensorPod.rotation.x = Math.PI * 0.5;
    headGroup.add(sensorPod);

    const eyeLens = new THREE.Mesh(
      this._getGeo('mortar_eye_lens', () => new THREE.SphereGeometry(0.135, 14, 10)),
      p.weakpointGlow
    );
    eyeLens.scale.set(1.0, 1.0, 0.65);
    eyeLens.position.set(0, 0, 0.09);
    headGroup.add(eyeLens);

    headAnchor.position.set(0, 0, 0.08);
    headGroup.add(headAnchor);

    // Right Arm — Elevated Dorsal Heavy Plasma Mortar Barrel
    rightArm.position.set(-0.18, 1.84, -0.02);
    const breech = new THREE.Mesh(
      this._getGeo('mortar_breech', () => new THREE.BoxGeometry(0.36, 0.34, 0.62)),
      p.darkFrame
    );
    breech.rotation.x = -0.22;
    rightArm.add(breech);

    const mortarTubeGeo = this._makeLathe(
      'mortar_cannon_tube',
      [
        [0.14, 0.0],
        [0.15, 0.22],
        [0.125, 0.26],
        [0.125, 0.78],
        [0.165, 0.84],
        [0.165, 0.96],
        [0.11, 0.96],
      ],
      16
    );
    const mortarTube = new THREE.Mesh(mortarTubeGeo, p.pistonSteel);
    mortarTube.rotation.x = Math.PI * 0.5 - 0.22;
    mortarTube.position.set(0, 0.06, 0.22);
    rightArm.add(mortarTube);

    const heatCollar = new THREE.Mesh(
      this._getGeo('mortar_heat_collar', () => new THREE.TorusGeometry(0.155, 0.024, 8, 16)),
      p.accentGlow
    );
    heatCollar.rotation.x = -0.22;
    heatCollar.position.set(0, 0.22, 0.88);
    rightArm.add(heatCollar);

    weaponMuzzle.position.set(0, 0.26, 1.14);
    rightArm.add(weaponMuzzle);
    bodyGroup.add(rightArm);

    // Left Arm — Heavy Rotary Ammunition Drum Pod
    leftArm.position.set(0.62, 1.48, -0.04);
    const ammoDrum = new THREE.Mesh(
      this._getGeo('mortar_ammo_drum', () => new THREE.CylinderGeometry(0.24, 0.24, 0.44, 12)),
      p.coloredPlate
    );
    ammoDrum.rotation.z = Math.PI * 0.5;
    leftArm.add(ammoDrum);
    leftArm.add(
      new THREE.Mesh(
        this._makeTube(
          'mortar_feed_chute',
          [
            [-0.12, 0.14, 0.0],
            [-0.44, 0.34, -0.04],
            [-0.72, 0.38, -0.04],
          ],
          0.045,
          8,
          6
        ),
        p.cableMat
      )
    );
    bodyGroup.add(leftArm);

    // --- Orbital Remodel: Hovering Anti-Gravity Base Ring, Plasma Mortar Coils & Dorsal Radar Dish ---
    const hoverRing = new THREE.Mesh(
      this._getGeo('mortar_hover_ring', () => new THREE.TorusGeometry(0.86, 0.055, 10, 28)),
      p.accentGlow
    );
    hoverRing.rotation.x = Math.PI * 0.5;
    hoverRing.position.set(0, 0.26, 0);
    bodyGroup.add(hoverRing);

    const hoverField = new THREE.Mesh(
      this._getGeo('mortar_hover_field', () => new THREE.CircleGeometry(0.82, 24)),
      p.holoEnergy
    );
    hoverField.rotation.x = -Math.PI * 0.5;
    hoverField.position.set(0, 0.24, 0);
    bodyGroup.add(hoverField);

    const coilGeo = this._getGeo('mortar_plasma_coil', () => new THREE.TorusGeometry(0.24, 0.03, 8, 18));
    for (let c = 0; c < 3; c++) {
      const coil = new THREE.Mesh(coilGeo, p.accentGlow);
      coil.position.set(0, 2.08 + c * 0.22, -0.18 - c * 0.14);
      coil.rotation.x = 0.55;
      bodyGroup.add(coil);
    }
    const radarDish = new THREE.Mesh(
      this._getGeo('mortar_radar_dish', () => new THREE.ConeGeometry(0.42, 0.18, 12, 1, true)),
      p.holoEnergy
    );
    radarDish.position.set(-0.48, 2.15, -0.35);
    radarDish.rotation.set(-0.65, 0.35, 0);
    bodyGroup.add(radarDish);

    // Neon-violet orbital target lock telegraph laser
    return this._createLaserBeam(ownedMaterials, ownedGeometries, root, 0xa855f7, 0xf0abfc);
  }

  // ===========================================================================
  // 10. PHANTOM STALKER / VANGUARD ASSASSIN (Sleek Reverse-Jointed Cyber Flanker)
  // ===========================================================================
  _buildVanguardAssassin(
    p,
    bodyGroup,
    headGroup,
    headAnchor,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    weaponMuzzle
  ) {
    // Sleek Reverse-Jointed Sprint Legs (hip pivot at y = 0.98)
    const thighGeo = this._makeExtrudedPoly(
      'assassin_thigh',
      [
        [-0.07, 0.03],
        [0.07, 0.03],
        [0.09, -0.22],
        [0.055, -0.44],
        [-0.055, -0.44],
        [-0.08, -0.22],
      ],
      0.13,
      0.016,
      0.014,
      2
    );
    const shinGeo = this._makeExtrudedPoly(
      'assassin_shin',
      [
        [-0.055, 0.02],
        [0.055, 0.02],
        [0.045, -0.46],
        [0.028, -0.54],
        [-0.028, -0.54],
        [-0.055, -0.24],
      ],
      0.11,
      0.012,
      0.01,
      1
    );
    const footGeo = this._getGeo('assassin_foot', () => new THREE.BoxGeometry(0.11, 0.07, 0.28));

    const buildLeg = (legGroup, sideX) => {
      legGroup.position.set(sideX, 0.98, 0);
      const thigh = new THREE.Mesh(thighGeo, p.primaryArmor);
      thigh.rotation.x = -0.20;
      legGroup.add(thigh);
      const shin = new THREE.Mesh(shinGeo, p.darkFrame);
      shin.position.set(0, -0.42, 0.06);
      shin.rotation.x = 0.16;
      legGroup.add(shin);
      const foot = new THREE.Mesh(footGeo, p.coloredPlate);
      foot.position.set(0, -0.945, 0.08);
      legGroup.add(foot);
      bodyGroup.add(legGroup);
    };
    buildLeg(leftLeg, 0.16);
    buildLeg(rightLeg, -0.16);

    // Tapered Aero-Hunter Torso + Twin Swept Dorsal Thruster Fins
    const torsoGeo = this._makeExtrudedPoly(
      'assassin_torso',
      [
        [-0.24, 0.28],
        [0.24, 0.28],
        [0.16, -0.06],
        [0.10, -0.28],
        [-0.10, -0.28],
        [-0.16, -0.06],
      ],
      0.22,
      0.024,
      0.02,
      2
    );
    const torso = new THREE.Mesh(torsoGeo, p.primaryArmor);
    torso.position.set(0, 1.32, 0.02);
    bodyGroup.add(torso);

    const finGeo = this._makeExtrudedPoly(
      'assassin_aero_fin',
      [
        [0.0, 0.0],
        [0.34, 0.36],
        [0.42, 0.18],
        [0.12, -0.16],
      ],
      0.036,
      0.009,
      0.008,
      1
    );
    for (let side = -1; side <= 1; side += 2) {
      const fin = new THREE.Mesh(finGeo, p.coloredPlate);
      fin.scale.x = side;
      fin.position.set(side * 0.12, 1.48, -0.12);
      fin.rotation.y = side * 0.32;
      fin.rotation.x = -0.18;
      bodyGroup.add(fin);
    }

    const spineCore = new THREE.Mesh(
      this._getGeo('assassin_spine_glow', () => new THREE.BoxGeometry(0.05, 0.38, 0.04)),
      p.accentGlow
    );
    spineCore.position.set(0, 1.34, -0.13);
    bodyGroup.add(spineCore);

    // Angular Predator Cowl Helm (headHeight = 1.66)
    headGroup.position.set(0, 1.66, 0.08);
    bodyGroup.add(headGroup);

    const helmGeo = this._makeExtrudedPoly(
      'assassin_helm',
      [
        [-0.13, -0.09],
        [0.13, -0.09],
        [0.15, 0.07],
        [0.0, 0.19],
        [-0.15, 0.07],
      ],
      0.26,
      0.018,
      0.015,
      1
    );
    headGroup.add(new THREE.Mesh(helmGeo, p.darkFrame));

    const predatorVisor = new THREE.Mesh(
      this._getGeo('assassin_visor', () => new THREE.BoxGeometry(0.22, 0.065, 0.09)),
      p.weakpointGlow
    );
    predatorVisor.position.set(0, 0.02, 0.13);
    headGroup.add(predatorVisor);

    headAnchor.position.set(0, 0.02, 0.06);
    headGroup.add(headAnchor);

    // Right Arm — Suppressed Rapid Pulse Carbine
    const pauldronGeo = this._getGeo('assassin_pauldron', () => new THREE.BoxGeometry(0.16, 0.14, 0.22));
    rightArm.position.set(-0.28, 1.48, 0.02);
    rightArm.add(new THREE.Mesh(pauldronGeo, p.coloredPlate));
    const rArm = new THREE.Mesh(
      this._getGeo('assassin_arm_strut', () => new THREE.CylinderGeometry(0.045, 0.04, 0.34, 8)),
      p.pistonSteel
    );
    rArm.position.set(-0.02, -0.18, 0.08);
    rArm.rotation.x = -0.5;
    rightArm.add(rArm);

    const carbine = new THREE.Group();
    carbine.position.set(-0.02, -0.28, 0.28);
    carbine.add(
      new THREE.Mesh(
        this._getGeo('assassin_carbine_body', () => new THREE.BoxGeometry(0.08, 0.11, 0.44)),
        p.darkFrame
      )
    );
    const suppressor = new THREE.Mesh(
      this._getGeo('assassin_suppressor', () => new THREE.CylinderGeometry(0.028, 0.028, 0.28, 8)),
      p.pistonSteel
    );
    suppressor.rotation.x = Math.PI * 0.5;
    suppressor.position.set(0, 0.01, 0.34);
    carbine.add(suppressor);
    weaponMuzzle.position.set(0, 0.01, 0.50);
    carbine.add(weaponMuzzle);
    rightArm.add(carbine);
    bodyGroup.add(rightArm);

    // Left Arm — Long Thermal Wrist-Blade + Forearm Pulse Emitter
    leftArm.position.set(0.28, 1.48, 0.02);
    leftArm.add(new THREE.Mesh(pauldronGeo, p.coloredPlate));
    const lArm = new THREE.Mesh(
      this._getGeo('assassin_arm_strut', () => new THREE.CylinderGeometry(0.045, 0.04, 0.34, 8)),
      p.pistonSteel
    );
    lArm.position.set(0.02, -0.18, 0.08);
    lArm.rotation.x = -0.5;
    leftArm.add(lArm);

    const bladeGeo = this._makeExtrudedPoly(
      'assassin_wrist_blade',
      [
        [0.0, 0.03],
        [0.54, 0.0],
        [0.06, -0.06],
      ],
      0.024,
      0.005,
      0.005,
      1
    );
    const blade = new THREE.Mesh(bladeGeo, p.accentGlow);
    blade.rotation.y = -Math.PI * 0.5;
    blade.position.set(0.05, -0.28, 0.16);
    leftArm.add(blade);

    const leftWeaponMuzzle = new THREE.Object3D();
    leftWeaponMuzzle.position.set(0.02, -0.28, 0.44);
    leftArm.add(leftWeaponMuzzle);
    bodyGroup.add(leftArm);

    // --- Orbital Remodel: 4 Sweeping Holographic Wing-Blades, Forearm Plasma Katanas & Cyber Horns ---
    const wingBladeGeo = this._getGeo('assassin_holo_wing', () => new THREE.PlaneGeometry(0.22, 1.25));
    for (const side of [-1, 1]) {
      for (let w = 0; w < 2; w++) {
        const blade = new THREE.Mesh(wingBladeGeo, p.holoEnergy);
        blade.position.set(side * (0.42 + w * 0.28), 1.62 + w * 0.18, -0.34 - w * 0.12);
        blade.rotation.set(-0.35 - w * 0.15, side * 0.25, side * (-0.52 - w * 0.28));
        bodyGroup.add(blade);
      }
      const horn = new THREE.Mesh(
        this._getGeo('assassin_cyber_horn', () => new THREE.ConeGeometry(0.035, 0.28, 5)),
        p.accentGlow
      );
      horn.position.set(side * 0.12, 0.24, -0.04);
      horn.rotation.set(-0.45, 0, side * -0.28);
      headGroup.add(horn);
    }
    const katanaGeo = this._getGeo('assassin_plasma_katana', () => new THREE.BoxGeometry(0.03, 0.08, 0.78));
    for (const arm of [leftArm, rightArm]) {
      const katana = new THREE.Mesh(katanaGeo, p.holoEnergy);
      katana.position.set(0, -0.24, 0.56);
      arm.add(katana);
    }

    return leftWeaponMuzzle;
  }

  // ===========================================================================
  // 11. AEGIS-IX // ORBITAL OVERLORD (4.5m Stage-10 Final Boss Dreadnought)
  // ===========================================================================
  _buildAegisOverlordBoss(
    p,
    ownedMaterials,
    bodyGroup,
    headGroup,
    headAnchor,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    weaponMuzzle,
    rotors,
    coreRings
  ) {
    // Colossal Dreadnought Walker Legs (hip pivot at y = 2.08)
    const thighGeo = this._makeExtrudedPoly(
      'overlord_thigh',
      [
        [-0.28, 0.16],
        [0.28, 0.16],
        [0.34, -0.38],
        [0.26, -0.92],
        [-0.26, -0.92],
        [-0.34, -0.38],
      ],
      0.56,
      0.055,
      0.048,
      2
    );
    const shinGeo = this._makeExtrudedPoly(
      'overlord_shin',
      [
        [-0.26, 0.04],
        [0.26, 0.04],
        [0.32, -0.82],
        [0.24, -1.04],
        [-0.24, -1.04],
        [-0.32, -0.82],
      ],
      0.50,
      0.05,
      0.042,
      2
    );
    const clawToeGeo = this._makeExtrudedPoly(
      'overlord_toe',
      [
        [-0.13, -0.04],
        [0.13, -0.04],
        [0.10, 0.48],
        [-0.10, 0.48],
      ],
      0.24,
      0.025,
      0.02,
      1
    );

    const buildBossLeg = (legGroup, sideX) => {
      legGroup.position.set(sideX, 2.08, 0);
      const thigh = new THREE.Mesh(thighGeo, p.primaryArmor);
      thigh.rotation.x = -0.2;
      legGroup.add(thigh);

      const kneeRing = new THREE.Mesh(
        this._getGeo('overlord_knee_ring', () => new THREE.TorusGeometry(0.26, 0.036, 8, 16)),
        p.accentGlow
      );
      kneeRing.rotation.y = Math.PI * 0.5;
      kneeRing.position.set(sideX > 0 ? 0.28 : -0.28, -0.90, 0.16);
      legGroup.add(kneeRing);

      const shin = new THREE.Mesh(shinGeo, p.coloredPlate);
      shin.position.set(0, -0.94, 0.12);
      shin.rotation.x = 0.12;
      legGroup.add(shin);

      const footHub = new THREE.Mesh(
        this._getGeo('overlord_foot_hub', () => new THREE.CylinderGeometry(0.34, 0.42, 0.24, 8)),
        p.darkFrame
      );
      footHub.position.set(0, -1.96, 0.02);
      legGroup.add(footHub);

      for (const ang of [-0.55, 0.0, 0.55]) {
        const toe = new THREE.Mesh(clawToeGeo, p.primaryArmor);
        toe.rotation.x = Math.PI * 0.5;
        toe.rotation.z = -ang;
        toe.position.set(Math.sin(ang) * 0.30, -1.96, 0.16 + Math.cos(ang) * 0.12);
        legGroup.add(toe);
      }
      bodyGroup.add(legGroup);
    };
    buildBossLeg(leftLeg, 0.68);
    buildBossLeg(rightLeg, -0.68);

    // Armored Pelvis & Tiered Orbital Dreadnought Torso
    const pelvis = new THREE.Mesh(
      this._getGeo('overlord_pelvis', () => new THREE.BoxGeometry(1.48, 0.58, 0.78)),
      p.darkFrame
    );
    pelvis.position.set(0, 2.16, 0);
    bodyGroup.add(pelvis);

    const torsoGeo = this._makeExtrudedPoly(
      'overlord_torso',
      [
        [-1.08, 0.66],
        [-0.70, 0.90],
        [0.70, 0.90],
        [1.08, 0.66],
        [0.92, -0.28],
        [0.60, -0.66],
        [-0.60, -0.66],
        [-0.92, -0.28],
      ],
      1.0,
      0.09,
      0.075,
      2
    );
    const torso = new THREE.Mesh(torsoGeo, p.primaryArmor);
    torso.position.set(0, 3.12, 0.04);
    bodyGroup.add(torso);

    // Chest Orbital Core Turbine + Armored Ribs
    const coreDisc = new THREE.Mesh(
      this._getGeo('overlord_chest_core', () => new THREE.CylinderGeometry(0.34, 0.34, 0.24, 16)),
      p.accentGlow
    );
    coreDisc.rotation.x = Math.PI * 0.5;
    coreDisc.position.set(0, 3.12, 0.56);
    bodyGroup.add(coreDisc);

    const grillGeo = this._getGeo('overlord_chest_rib', () => new THREE.BoxGeometry(0.76, 0.05, 0.06));
    for (let g = -2; g <= 2; g++) {
      const bar = new THREE.Mesh(grillGeo, p.darkFrame);
      bar.position.set(0, 3.12 + g * 0.11, 0.69);
      bodyGroup.add(bar);
    }

    // Twin Swept Dreadnought Wing-Thruster Pylons + Dorsal Exhaust Chimneys
    const wingPylonGeo = this._makeExtrudedPoly(
      'overlord_wing_pylon',
      [
        [0.0, 0.0],
        [0.86, 0.78],
        [1.12, 0.34],
        [0.24, -0.44],
      ],
      0.16,
      0.026,
      0.022,
      1
    );
    for (let side = -1; side <= 1; side += 2) {
      const wing = new THREE.Mesh(wingPylonGeo, p.coloredPlate);
      wing.scale.x = side;
      wing.position.set(side * 0.68, 3.46, -0.44);
      wing.rotation.y = side * 0.28;
      bodyGroup.add(wing);

      const thruster = new THREE.Mesh(
        this._getGeo('overlord_wing_thruster', () => new THREE.CylinderGeometry(0.18, 0.24, 0.85, 10)),
        p.darkFrame
      );
      thruster.position.set(side * 0.52, 3.72, -0.66);
      thruster.rotation.x = -0.22;
      bodyGroup.add(thruster);
    }

    // Winged Crown Helm housing Furnace Sensor Core Weakpoint (headHeight = 3.85)
    headGroup.position.set(0, 3.85, 0.18);
    bodyGroup.add(headGroup);

    const cranialCore = new THREE.Mesh(
      this._getGeo('overlord_cranial_core', () => new THREE.SphereGeometry(0.42, 16, 12)),
      p.weakpointGlow
    );
    headGroup.add(cranialCore);

    const hornGeo = this._makeExtrudedPoly(
      'overlord_crown_horn',
      [
        [-0.08, -0.24],
        [0.12, -0.18],
        [0.28, 0.54],
        [0.04, 0.64],
        [-0.08, 0.22],
      ],
      0.16,
      0.022,
      0.018,
      1
    );
    for (let side = -1; side <= 1; side += 2) {
      const horn = new THREE.Mesh(hornGeo, p.coloredPlate);
      horn.position.set(side * 0.44, 0.14, -0.02);
      horn.scale.x = side;
      horn.rotation.y = side * 0.24;
      headGroup.add(horn);
    }

    const crownRing = new THREE.Mesh(
      this._getGeo('overlord_crown_ring', () => new THREE.TorusGeometry(0.48, 0.048, 10, 22)),
      p.darkFrame
    );
    crownRing.rotation.x = Math.PI * 0.5;
    crownRing.position.set(0, 0.04, 0);
    headGroup.add(crownRing);

    headAnchor.position.set(0, 0.06, 0.08);
    headGroup.add(headAnchor);

    // Twin Heavy Dual-Rail Siege Cannons (weaponMuzzle & leftWeaponMuzzle)
    const pauldronGeo = this._makeExtrudedPoly(
      'overlord_pauldron',
      [
        [-0.40, 0.36],
        [0.34, 0.30],
        [0.46, -0.26],
        [0.14, -0.44],
        [-0.36, -0.20],
      ],
      0.74,
      0.055,
      0.046,
      2
    );
    const cannonHousingGeo = this._getGeo('overlord_gun_housing', () => new THREE.BoxGeometry(0.54, 0.48, 0.96));
    const railBarrelGeo = this._getGeo('overlord_rail_barrel', () => new THREE.BoxGeometry(0.11, 0.11, 1.12));
    const clampDiskGeo = this._getGeo('overlord_rotor_clamp', () => new THREE.CylinderGeometry(0.22, 0.22, 0.08, 10));

    const leftWeaponMuzzle = new THREE.Object3D();

    const buildOverlordArm = (armGroup, side, muzzleObj) => {
      armGroup.position.set(side * 1.36, 3.42, 0.08);
      const pauldron = new THREE.Mesh(pauldronGeo, p.coloredPlate);
      pauldron.position.set(side * 0.14, 0.14, 0);
      pauldron.scale.x = -side;
      armGroup.add(pauldron);

      const upper = new THREE.Mesh(
        this._getGeo('overlord_upper_arm', () => new THREE.CylinderGeometry(0.20, 0.18, 0.78, 10)),
        p.pistonSteel
      );
      upper.position.set(side * 0.12, -0.40, 0.08);
      upper.rotation.x = -0.26;
      armGroup.add(upper);

      const pod = new THREE.Group();
      pod.position.set(side * 0.14, -0.72, 0.58);
      pod.add(new THREE.Mesh(cannonHousingGeo, p.primaryArmor));

      // Twin heavy magnetic siege rails
      for (const rx of [-0.14, 0.14]) {
        const rail = new THREE.Mesh(railBarrelGeo, p.darkFrame);
        rail.position.set(rx, 0.02, 0.88);
        pod.add(rail);
      }

      // Central spinning internal accelerator core (rotors)
      const rotorCluster = new THREE.Group();
      rotorCluster.position.set(0, 0.02, 0.55);
      const disc = new THREE.Mesh(clampDiskGeo, p.accentGlow);
      disc.rotation.x = Math.PI * 0.5;
      disc.position.z = 0.62;
      rotorCluster.add(disc);
      const coreRod = new THREE.Mesh(
        this._getGeo('overlord_rotor_rod', () => new THREE.CylinderGeometry(0.06, 0.06, 1.05, 8)),
        p.pistonSteel
      );
      coreRod.rotation.x = Math.PI * 0.5;
      coreRod.position.z = 0.32;
      rotorCluster.add(coreRod);
      pod.add(rotorCluster);
      rotors.push(rotorCluster);

      muzzleObj.position.set(0, 0.02, 1.56);
      pod.add(muzzleObj);
      armGroup.add(pod);
      bodyGroup.add(armGroup);
    };

    buildOverlordArm(rightArm, -1, weaponMuzzle);
    buildOverlordArm(leftArm, 1, leftWeaponMuzzle);

    // 4 Rotating Gyroscopic Orbital Armor & Furnace Rings (coreRings)
    const ringConfigs = [
      { r: 1.85, tube: 0.055, tiltX: 0.42, tiltZ: 0.30, y: 3.12, color: 0x5c4b42, emissive: 0xf09d38 },
      { r: 2.12, tube: 0.050, tiltX: -0.55, tiltZ: 0.62, y: 3.14, color: 0x7c2d12, emissive: 0xff3b1f },
      { r: 2.36, tube: 0.044, tiltX: 0.78, tiltZ: -0.45, y: 3.10, color: 0x4f443d, emissive: 0xff6b1a },
      { r: 2.60, tube: 0.038, tiltX: -0.28, tiltZ: -0.72, y: 3.12, color: 0x3b404c, emissive: 0xe8923a },
    ];
    const finGeo = this._getGeo('overlord_ring_fin', () => new THREE.BoxGeometry(0.20, 0.14, 0.18));
    for (let i = 0; i < ringConfigs.length; i++) {
      const cfg = ringConfigs[i];
      const ringGroup = new THREE.Group();
      ringGroup.position.set(0, cfg.y, 0.04);
      ringGroup.rotation.set(cfg.tiltX, i * 0.95, cfg.tiltZ);
      ringGroup.userData.baseRotation = new THREE.Euler(cfg.tiltX, i * 0.95, cfg.tiltZ);

      const ringMat = new THREE.MeshStandardMaterial({
        color: cfg.color,
        emissive: new THREE.Color(cfg.emissive),
        emissiveIntensity: 1.6,
        roughness: 0.36,
        metalness: 0.74,
      });
      ringMat.userData.baseColor = ringMat.color.clone();
      ringMat.userData.baseEmissive = ringMat.emissive.clone();
      ringMat.userData.baseEmissiveIntensity = ringMat.emissiveIntensity;
      ownedMaterials.push(ringMat);

      const ringGeo = this._getGeo(`overlord_orbit_ring_${i}`, () => {
        return new THREE.TorusGeometry(cfg.r, cfg.tube, 8, 36);
      });
      ringGroup.add(new THREE.Mesh(ringGeo, ringMat));

      for (let n = 0; n < 6; n++) {
        const ang = (n / 6) * Math.PI * 2;
        const fin = new THREE.Mesh(finGeo, n % 2 === 0 ? p.darkFrame : ringMat);
        fin.position.set(Math.cos(ang) * cfg.r, Math.sin(ang) * cfg.r, 0);
        fin.rotation.z = ang;
        ringGroup.add(fin);
      }

      ringGroup.userData.ringMaterial = ringMat;
      bodyGroup.add(ringGroup);
      coreRings.push(ringGroup);
    }

    // Phase-Surge Heated Orbital Blast Shield Barrier
    const bossShieldGeo = this._getGeo('overlord_phase_shield', () => {
      return new THREE.CylinderGeometry(1.94, 2.02, 2.5, 24, 1, true);
    });
    const bossShieldMat = new THREE.MeshStandardMaterial({
      color: 0xff8c2b,
      map: this._textures.blastShield,
      emissive: new THREE.Color(0xe63916),
      emissiveMap: this._textures.blastShield,
      emissiveIntensity: 2.0,
      transparent: true,
      opacity: 0.0,
      roughness: 0.38,
      metalness: 0.45,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    bossShieldMat.userData.baseColor = bossShieldMat.color.clone();
    bossShieldMat.userData.baseEmissive = bossShieldMat.emissive.clone();
    bossShieldMat.userData.baseEmissiveIntensity = bossShieldMat.emissiveIntensity;
    bossShieldMat.userData.baseOpacity = 0.72;
    ownedMaterials.push(bossShieldMat);

    const shieldMesh = new THREE.Mesh(bossShieldGeo, bossShieldMat);
    shieldMesh.position.set(0, 2.28, 0.04);
    shieldMesh.visible = false;
    shieldMesh.renderOrder = 7;
    bodyGroup.add(shieldMesh);

    return { shieldMesh, leftWeaponMuzzle };
  }

  /**
   * Dispose all shared procedural textures, shared contact shadow material, and cached GPU geometries.
   * Call only on full application teardown.
   */
  dispose() {
    for (const geo of this._geoCache.values()) {
      geo.dispose();
    }
    this._geoCache.clear();
    if (this._contactShadowMat) {
      this._contactShadowMat.dispose();
      this._contactShadowMat = null;
    }
    if (this._textures.armorWear) this._textures.armorWear.dispose();
    if (this._textures.armorBump) this._textures.armorBump.dispose();
    if (this._textures.armorRoughness) this._textures.armorRoughness.dispose();
    if (this._textures.blastShield) this._textures.blastShield.dispose();
    if (this._textures.visorGrid) this._textures.visorGrid.dispose();
    if (this._textures.contactShadow) this._textures.contactShadow.dispose();
  }
}
  __exports.EnemyModelFactory = EnemyModelFactory;
});
