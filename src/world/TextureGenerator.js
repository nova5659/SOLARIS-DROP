// Module: src/world/TextureGenerator.js
__define("src/world/TextureGenerator.js", (__exports, __require) => {
/**
 * Deterministic fast PRNG (Mulberry32) for consistent procedural PBR art direction.
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
 * Tileable 2D value noise helper on a periodic grid so 512x512 textures wrap seamlessly.
 */
function createTileableNoise(gridSize, seed) {
  const rng = createRng(seed);
  const grid = new Float32Array(gridSize * gridSize);
  for (let i = 0; i < grid.length; i++) {
    grid[i] = rng();
  }

  return function sample(u, v) {
    const x = (((u % 1) + 1) % 1) * gridSize;
    const y = (((v % 1) + 1) % 1) * gridSize;
    const x0 = Math.floor(x) % gridSize;
    const y0 = Math.floor(y) % gridSize;
    const x1 = (x0 + 1) % gridSize;
    const y1 = (y0 + 1) % gridSize;

    const fx = x - Math.floor(x);
    const fy = y - Math.floor(y);
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);

    const n00 = grid[y0 * gridSize + x0];
    const n10 = grid[y0 * gridSize + x1];
    const n01 = grid[y1 * gridSize + x0];
    const n11 = grid[y1 * gridSize + x1];

    const nx0 = n00 + (n10 - n00) * sx;
    const nx1 = n01 + (n11 - n01) * sx;
    return nx0 + (nx1 - nx0) * sy;
  };
}

/**
 * Tileable Worley cellular ridge helper for inlaid marble/terrace energy conduits.
 */
function createTileableCellCracks(cells, seed) {
  const rng = createRng(seed);
  const ptsX = new Float32Array(cells * cells);
  const ptsY = new Float32Array(cells * cells);
  for (let cy = 0; cy < cells; cy++) {
    for (let cx = 0; cx < cells; cx++) {
      const idx = cy * cells + cx;
      ptsX[idx] = cx + 0.16 + rng() * 0.68;
      ptsY[idx] = cy + 0.16 + rng() * 0.68;
    }
  }

  return function sampleEdge(u, v) {
    const gx = (((u % 1) + 1) % 1) * cells;
    const gy = (((v % 1) + 1) % 1) * cells;
    const ix = Math.floor(gx);
    const iy = Math.floor(gy);

    let d1 = 99;
    let d2 = 99;

    for (let oy = -1; oy <= 1; oy++) {
      const ncy = ((iy + oy) % cells + cells) % cells;
      const shiftY = iy + oy - ncy;
      for (let ox = -1; ox <= 1; ox++) {
        const ncx = ((ix + ox) % cells + cells) % cells;
        const shiftX = ix + ox - ncx;
        const idx = ncy * cells + ncx;
        const dx = ptsX[idx] + shiftX - gx;
        const dy = ptsY[idx] + shiftY - gy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < d1) {
          d2 = d1;
          d1 = dist;
        } else if (dist < d2) {
          d2 = dist;
        }
      }
    }
    return d2 - d1;
  };
}

function traceRoundedRect(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w * 0.5, h * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
  ctx.lineTo(x + rad, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
  ctx.lineTo(x, y + rad);
  ctx.quadraticCurveTo(x, y, x + rad, y);
  ctx.closePath();
}

function parseHexColor(hex) {
  const clean = typeof hex === 'string' ? hex.replace('#', '') : '0ea5e9';
  const num = parseInt(
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean,
    16
  );
  if (!Number.isFinite(num)) return { r: 14, g: 165, b: 233 };
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function clampByte(v) {
  return v < 0 ? 0 : v > 255 ? 255 : v | 0;
}

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Procedural 512x512 Canvas PBR Texture Generator for SOLARIS DROP // SKYWARD PROTOCOL.
 * Produces bright sunlit Solarpunk / Sky-Citadel architectural materials (porcelain ceramic,
 * sunlit travertine, brushed silver titanium, glass towers, radiant azure daylight skies)
 * with seamless RepeatWrapping, proper color spaces, anisotropic filtering, and disposal tracking.
 */
class TextureGenerator {
  constructor(anisotropy = 4) {
    this._anisotropy = Math.max(1, Math.min(16, anisotropy || 4));
    this._textures = [];
    this._cache = new Map();
  }

  _createCanvas(width = 512, height = 512) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    return { canvas, ctx };
  }

  _buildTexture(canvas, { isColor = true, repeatX = 1, repeatY = 1, wrap = true, wrapS, wrapT } = {}) {
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.wrapS = wrapS !== undefined ? wrapS : wrap ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    tex.wrapT = wrapT !== undefined ? wrapT : wrap ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    tex.repeat.set(repeatX, repeatY);
    tex.anisotropy = this._anisotropy;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    this._textures.push(tex);
    return tex;
  }

  /**
   * 512x512 sunlit warm ivory-travertine & white ceramic plaza tiles with sky-blue & gold inlays.
   */
  getFloorTextures(repeatX = 16, repeatY = 16) {
    const cacheKey = `floor_${repeatX}_${repeatY}`;
    if (this._cache.has(cacheKey)) return this._cache.get(cacheKey);

    const size = 512;
    const albedo = this._createCanvas(size, size);
    const rough = this._createCanvas(size, size);
    const bump = this._createCanvas(size, size);
    const aCtx = albedo.ctx;
    const rCtx = rough.ctx;
    const bCtx = bump.ctx;

    const stoneLow = createTileableNoise(6, 101);
    const stoneMid = createTileableNoise(18, 202);
    const grain = createTileableNoise(48, 303);

    const aImg = aCtx.createImageData(size, size);
    const rImg = rCtx.createImageData(size, size);
    const bImg = bCtx.createImageData(size, size);

    for (let y = 0; y < size; y++) {
      const v = y / size;
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const idx = (y * size + x) * 4;

        const low = stoneLow(u, v);
        const mid = stoneMid(u, v);
        const fine = grain(u, v);
        const tileChecker = ((x >> 8) + (y >> 8)) % 2 === 0 ? 1 : 0;

        // Crisp sunlit warm sandstone-limestone alternating with cool sky-slate ceramic tiles
        const baseR = (tileChecker ? 186 : 168) + low * 16 + fine * 10;
        const baseG = (tileChecker ? 190 : 178) + low * 15 + fine * 9;
        const baseB = (tileChecker ? 194 : 190) + low * 13 + fine * 9;

        const roughVal = 148 + mid * 42 + fine * 20;
        const bumpVal = 152 + (fine - 0.5) * 32 + (mid - 0.5) * 18;

        aImg.data[idx] = clampByte(baseR);
        aImg.data[idx + 1] = clampByte(baseG);
        aImg.data[idx + 2] = clampByte(baseB);
        aImg.data[idx + 3] = 255;

        const rv = clampByte(roughVal);
        rImg.data[idx] = rv;
        rImg.data[idx + 1] = rv;
        rImg.data[idx + 2] = rv;
        rImg.data[idx + 3] = 255;

        const bv = clampByte(bumpVal);
        bImg.data[idx] = bv;
        bImg.data[idx + 1] = bv;
        bImg.data[idx + 2] = bv;
        bImg.data[idx + 3] = 255;
      }
    }

    aCtx.putImageData(aImg, 0, 0);
    rCtx.putImageData(rImg, 0, 0);
    bCtx.putImageData(bImg, 0, 0);

    // Clean architectural expansion grooves (2x2 plaza tiles)
    for (const s of [0, 256, 512]) {
      aCtx.fillStyle = 'rgba(72, 98, 126, 0.85)';
      aCtx.fillRect(s - 3, 0, 6, size);
      aCtx.fillRect(0, s - 3, size, 6);

      aCtx.fillStyle = 'rgba(255, 255, 255, 0.45)';
      aCtx.fillRect(s + 3, 0, 2, size);
      aCtx.fillRect(0, s + 3, size, 2);

      bCtx.fillStyle = '#363636';
      bCtx.fillRect(s - 3, 0, 6, size);
      bCtx.fillRect(0, s - 3, size, 6);

      rCtx.fillStyle = '#d4d4d4';
      rCtx.fillRect(s - 3, 0, 6, size);
      rCtx.fillRect(0, s - 3, size, 6);
    }

    // Crisp sky-cobalt & sunlit coral-gold aerospace plaza wayfinding stripes
    aCtx.fillStyle = 'rgba(2, 132, 199, 0.78)';
    aCtx.fillRect(120, 24, 14, 88);
    aCtx.fillRect(120, 144, 14, 88);
    aCtx.fillRect(376, 280, 14, 88);
    aCtx.fillRect(376, 400, 14, 88);

    aCtx.fillStyle = 'rgba(249, 115, 22, 0.76)';
    aCtx.fillRect(28, 234, 84, 8);
    aCtx.fillRect(284, 490, 84, 8);

    // Subtle inset corner accent pins
    for (const [px, py] of [[20, 20], [236, 20], [20, 236], [236, 236], [276, 276], [492, 276], [276, 492], [492, 492]]) {
      aCtx.fillStyle = '#94a3b8';
      aCtx.beginPath();
      aCtx.arc(px, py, 3.2, 0, Math.PI * 2);
      aCtx.fill();
    }

    const result = {
      map: this._buildTexture(albedo.canvas, { isColor: true, repeatX, repeatY }),
      roughnessMap: this._buildTexture(rough.canvas, { isColor: false, repeatX, repeatY }),
      bumpMap: this._buildTexture(bump.canvas, { isColor: false, repeatX, repeatY }),
    };
    this._cache.set(cacheKey, result);
    return result;
  }

  /**
   * 512x512 gleaming white-porcelain & light architectural alabaster citadel wall panels
   * with crisp brushed-silver seams and cobalt architectural trim.
   */
  getWallTextures(repeatX = 8, repeatY = 2) {
    const cacheKey = `wall_${repeatX}_${repeatY}`;
    if (this._cache.has(cacheKey)) return this._cache.get(cacheKey);

    const size = 512;
    const albedo = this._createCanvas(size, size);
    const rough = this._createCanvas(size, size);
    const bump = this._createCanvas(size, size);
    const aCtx = albedo.ctx;
    const rCtx = rough.ctx;
    const bCtx = bump.ctx;

    const panelNoise = createTileableNoise(14, 511);
    const fineNoise = createTileableNoise(48, 619);

    const aImg = aCtx.createImageData(size, size);
    const rImg = rCtx.createImageData(size, size);
    const bImg = bCtx.createImageData(size, size);

    for (let y = 0; y < size; y++) {
      const v = y / size;
      const isPlinth = y >= 392;
      const isMidBand = y >= 156 && y <= 368;

      for (let x = 0; x < size; x++) {
        const u = x / size;
        const idx = (y * size + x) * 4;
        const mix = panelNoise(u, v) * 0.6 + fineNoise(u, v) * 0.4;

        // Clean architectural light porcelain panels with defined cool-slate plinth for 3D depth
        const base = isPlinth ? 138 + mix * 16 : isMidBand ? 196 + mix * 14 : 182 + mix * 15;
        aImg.data[idx] = clampByte(base * 0.97);
        aImg.data[idx + 1] = clampByte(base * 1.0);
        aImg.data[idx + 2] = clampByte(base * 1.04);
        aImg.data[idx + 3] = 255;

        const rVal = clampByte(isPlinth ? 132 + mix * 30 : 108 + mix * 32);
        rImg.data[idx] = rVal;
        rImg.data[idx + 1] = rVal;
        rImg.data[idx + 2] = rVal;
        rImg.data[idx + 3] = 255;

        const bVal = clampByte(150 + (mix - 0.5) * 20);
        bImg.data[idx] = bVal;
        bImg.data[idx + 1] = bVal;
        bImg.data[idx + 2] = bVal;
        bImg.data[idx + 3] = 255;
      }
    }

    aCtx.putImageData(aImg, 0, 0);
    rCtx.putImageData(rImg, 0, 0);
    bCtx.putImageData(bImg, 0, 0);

    // Architectural panel seams
    for (const y of [0, 156, 368, 392, 512]) {
      aCtx.fillStyle = '#9db2c8';
      aCtx.fillRect(0, y - 2.5, size, 5);
      bCtx.fillStyle = '#404040';
      bCtx.fillRect(0, y - 2.5, size, 5);
      rCtx.fillStyle = '#d0d0d0';
      rCtx.fillRect(0, y - 2.5, size, 5);
    }

    for (const x of [0, 256, 512]) {
      aCtx.fillStyle = '#9db2c8';
      aCtx.fillRect(x - 2.5, 0, 5, size);
      bCtx.fillStyle = '#404040';
      bCtx.fillRect(x - 2.5, 0, 5, size);
    }

    // Crisp sky-cobalt architectural inlay band above plinth
    aCtx.fillStyle = '#0ea5e9';
    aCtx.fillRect(0, 374, size, 12);
    rCtx.fillStyle = '#505050';
    rCtx.fillRect(0, 374, size, 12);

    // Subtle sunlit glass/louver recessed bays
    for (const ox of [32, 288]) {
      aCtx.fillStyle = '#dbeafe';
      traceRoundedRect(aCtx, ox, 206, 192, 114, 10);
      aCtx.fill();
      aCtx.strokeStyle = '#93c5fd';
      aCtx.lineWidth = 3;
      aCtx.stroke();

      rCtx.fillStyle = '#383838';
      traceRoundedRect(rCtx, ox, 206, 192, 114, 10);
      rCtx.fill();

      // Clean architectural horizontal louvers
      aCtx.fillStyle = 'rgba(255, 255, 255, 0.72)';
      for (let ly = 224; ly < 312; ly += 22) {
        aCtx.fillRect(ox + 12, ly, 168, 5);
      }
    }

    // Clean brushed titanium anchor bolts
    for (let p = 0; p < 2; p++) {
      const ox = p * 256;
      for (const hy of [44, 116, 444]) {
        for (const hx of [ox + 36, ox + 128, ox + 220]) {
          aCtx.fillStyle = '#94a3b8';
          aCtx.beginPath();
          aCtx.arc(hx, hy, 4.5, 0, Math.PI * 2);
          aCtx.fill();
          aCtx.fillStyle = '#f1f5f9';
          aCtx.beginPath();
          aCtx.arc(hx - 1, hy - 1, 2.2, 0, Math.PI * 2);
          aCtx.fill();
        }
      }
    }

    const result = {
      map: this._buildTexture(albedo.canvas, { isColor: true, repeatX, repeatY }),
      roughnessMap: this._buildTexture(rough.canvas, { isColor: false, repeatX, repeatY }),
      bumpMap: this._buildTexture(bump.canvas, { isColor: false, repeatX, repeatY }),
    };
    this._cache.set(cacheKey, result);
    return result;
  }

  /**
   * 512x512 bright coastal hydro-solar deck slabs with sparkling turquoise coolant basins
   * and anodized aluminum floor drainage grates (Map 2: Helios Hydro-Plant).
   */
  getRefineryFloorTextures(repeatX = 16, repeatY = 16) {
    const cacheKey = `refinery_floor_${repeatX}_${repeatY}`;
    if (this._cache.has(cacheKey)) return this._cache.get(cacheKey);

    const size = 512;
    const albedo = this._createCanvas(size, size);
    const rough = this._createCanvas(size, size);
    const bump = this._createCanvas(size, size);
    const aCtx = albedo.ctx;
    const rCtx = rough.ctx;
    const bCtx = bump.ctx;

    const poolLow = createTileableNoise(5, 1401);
    const poolMid = createTileableNoise(14, 1409);
    const grit = createTileableNoise(44, 1423);

    const aImg = aCtx.createImageData(size, size);
    const rImg = rCtx.createImageData(size, size);
    const bImg = bCtx.createImageData(size, size);

    for (let y = 0; y < size; y++) {
      const v = y / size;
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const idx = (y * size + x) * 4;

        const g = grit(u, v);
        const aquaField = poolLow(u, v) * 0.65 + poolMid(u, v) * 0.35;
        const aquaPool = smoothstep(0.60, 0.74, aquaField);

        // Bright sunlit coastal limestone/ceramic deck (#cfdce6)
        let r = 198 + g * 18;
        let gCol = 210 + g * 18;
        let b = 218 + g * 18;
        let rv = 136 + g * 34;
        let bv = 152 + (g - 0.5) * 26;

        // Clean glossy turquoise solar-coolant reflection sheen
        if (aquaPool > 0.01) {
          r = r * (1 - aquaPool) + (126 + g * 18) * aquaPool;
          gCol = gCol * (1 - aquaPool) + (214 + g * 18) * aquaPool;
          b = b * (1 - aquaPool) + (234 + g * 14) * aquaPool;
          rv = rv * (1 - aquaPool) + (32 + g * 16) * aquaPool;
          bv = bv * (1 - aquaPool) + 148 * aquaPool;
        }

        aImg.data[idx] = clampByte(r);
        aImg.data[idx + 1] = clampByte(gCol);
        aImg.data[idx + 2] = clampByte(b);
        aImg.data[idx + 3] = 255;

        const rByte = clampByte(rv);
        rImg.data[idx] = rByte;
        rImg.data[idx + 1] = rByte;
        rImg.data[idx + 2] = rByte;
        rImg.data[idx + 3] = 255;

        const bByte = clampByte(bv);
        bImg.data[idx] = bByte;
        bImg.data[idx + 1] = bByte;
        bImg.data[idx + 2] = bByte;
        bImg.data[idx + 3] = 255;
      }
    }

    aCtx.putImageData(aImg, 0, 0);
    rCtx.putImageData(rImg, 0, 0);
    bCtx.putImageData(bImg, 0, 0);

    for (const s of [0, 256, 512]) {
      aCtx.fillStyle = '#8aa4bc';
      aCtx.fillRect(s - 4, 0, 8, size);
      aCtx.fillRect(0, s - 4, size, 8);
      bCtx.fillStyle = '#404040';
      bCtx.fillRect(s - 4, 0, 8, size);
      bCtx.fillRect(0, s - 4, size, 8);
    }

    // Clean recessed bright-silver drainage grates over sunlit turquoise water channels
    for (const [dx, dy] of [[128, 128], [384, 384]]) {
      const dw = 112;
      const dh = 68;
      aCtx.fillStyle = '#9fb6ca';
      aCtx.fillRect(dx - dw * 0.5 - 5, dy - dh * 0.5 - 5, dw + 10, dh + 10);
      aCtx.fillStyle = '#0ea5e9';
      aCtx.fillRect(dx - dw * 0.5, dy - dh * 0.5, dw, dh);
      bCtx.fillStyle = '#242424';
      bCtx.fillRect(dx - dw * 0.5, dy - dh * 0.5, dw, dh);

      for (let gx = dx - dw * 0.5 + 8; gx < dx + dw * 0.5 - 4; gx += 14) {
        aCtx.fillStyle = '#e2edf7';
        aCtx.fillRect(gx, dy - dh * 0.5 + 4, 6, dh - 8);
        bCtx.fillStyle = '#dcdcdc';
        bCtx.fillRect(gx, dy - dh * 0.5 + 4, 6, dh - 8);
        rCtx.fillStyle = '#606060';
        rCtx.fillRect(gx, dy - dh * 0.5 + 4, 6, dh - 8);
      }
    }

    // Vibrant coral-orange safety guide bars
    aCtx.fillStyle = 'rgba(249, 115, 22, 0.72)';
    aCtx.fillRect(72, 82, 112, 6);
    aCtx.fillRect(72, 168, 112, 6);
    aCtx.fillRect(328, 338, 112, 6);
    aCtx.fillRect(328, 424, 112, 6);

    const result = {
      map: this._buildTexture(albedo.canvas, { isColor: true, repeatX, repeatY }),
      roughnessMap: this._buildTexture(rough.canvas, { isColor: false, repeatX, repeatY }),
      bumpMap: this._buildTexture(bump.canvas, { isColor: false, repeatX, repeatY }),
    };
    this._cache.set(cacheKey, result);
    return result;
  }

  /**
   * 512x512 brushed bright anodized silver-titanium sky-walkway grating with sky-blue edge rails.
   */
  getCatwalkTextures(repeatX = 6, repeatY = 2) {
    const cacheKey = `catwalk_${repeatX}_${repeatY}`;
    if (this._cache.has(cacheKey)) return this._cache.get(cacheKey);

    const size = 512;
    const albedo = this._createCanvas(size, size);
    const rough = this._createCanvas(size, size);
    const bump = this._createCanvas(size, size);
    const aCtx = albedo.ctx;
    const rCtx = rough.ctx;
    const bCtx = bump.ctx;

    const gritNoise = createTileableNoise(42, 709);
    const aImg = aCtx.createImageData(size, size);
    const rImg = rCtx.createImageData(size, size);
    const bImg = bCtx.createImageData(size, size);

    for (let y = 0; y < size; y++) {
      const v = y / size;
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const idx = (y * size + x) * 4;
        const g = gritNoise(u, v);

        // Bright brushed aluminum/titanium skywalk plate
        aImg.data[idx] = clampByte(196 + g * 20);
        aImg.data[idx + 1] = clampByte(206 + g * 20);
        aImg.data[idx + 2] = clampByte(218 + g * 20);
        aImg.data[idx + 3] = 255;

        const rv = clampByte(96 + g * 32);
        rImg.data[idx] = rv;
        rImg.data[idx + 1] = rv;
        rImg.data[idx + 2] = rv;
        rImg.data[idx + 3] = 255;

        const bv = clampByte(144 + (g - 0.5) * 20);
        bImg.data[idx] = bv;
        bImg.data[idx + 1] = bv;
        bImg.data[idx + 2] = bv;
        bImg.data[idx + 3] = 255;
      }
    }

    aCtx.putImageData(aImg, 0, 0);
    rCtx.putImageData(rImg, 0, 0);
    bCtx.putImageData(bImg, 0, 0);

    const cell = 32;
    for (let gy = 0; gy < size / cell; gy++) {
      for (let gx = 0; gx < size / cell; gx++) {
        const cx = gx * cell + cell * 0.5;
        const cy = gy * cell + cell * 0.5;
        const isSlot = (gx + gy) % 2 === 0;

        if (isSlot) {
          aCtx.fillStyle = '#738ca6';
          traceRoundedRect(aCtx, cx - 7, cy - 4, 14, 8, 3);
          aCtx.fill();
          bCtx.fillStyle = '#363636';
          traceRoundedRect(bCtx, cx - 7, cy - 4, 14, 8, 3);
          bCtx.fill();
        } else {
          const angle = gx % 2 === 0 ? Math.PI * 0.25 : -Math.PI * 0.25;
          const drawLug = (ctx, fill) => {
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(angle);
            ctx.fillStyle = fill;
            ctx.beginPath();
            ctx.ellipse(0, 0, 9.0, 3.0, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          };
          drawLug(aCtx, '#e8f1fa');
          drawLug(rCtx, '#525252');
          drawLug(bCtx, '#f0f0f0');
        }
      }
    }

    for (const ry of [0, 256, 512]) {
      aCtx.fillStyle = '#b4c6d8';
      aCtx.fillRect(0, ry - 8, size, 16);
      bCtx.fillStyle = '#d8d8d8';
      bCtx.fillRect(0, ry - 8, size, 16);
    }

    const drawSideFlange = (x0, w, stripX) => {
      aCtx.fillStyle = '#d9e5f0';
      aCtx.fillRect(x0, 0, w, size);
      aCtx.fillStyle = '#0ea5e9';
      aCtx.fillRect(stripX, 0, 10, size);
      rCtx.fillStyle = '#6e6e6e';
      rCtx.fillRect(x0, 0, w, size);
      bCtx.fillStyle = '#e0e0e0';
      bCtx.fillRect(x0, 0, w, size);
    };
    drawSideFlange(0, 24, 24);
    drawSideFlange(size - 24, 24, size - 34);

    const result = {
      map: this._buildTexture(albedo.canvas, { isColor: true, repeatX, repeatY }),
      roughnessMap: this._buildTexture(rough.canvas, { isColor: false, repeatX, repeatY }),
      bumpMap: this._buildTexture(bump.canvas, { isColor: false, repeatX, repeatY }),
    };
    this._cache.set(cacheKey, result);
    return result;
  }

  /**
   * 512x512 satin pearl-titanium & brushed champagne-gold aerospace composite armor plates.
   */
  getRustMetalTextures(repeatX = 4, repeatY = 4) {
    const cacheKey = `rustmetal_${repeatX}_${repeatY}`;
    if (this._cache.has(cacheKey)) return this._cache.get(cacheKey);

    const size = 512;
    const albedo = this._createCanvas(size, size);
    const rough = this._createCanvas(size, size);
    const bump = this._createCanvas(size, size);
    const aCtx = albedo.ctx;
    const rCtx = rough.ctx;
    const bCtx = bump.ctx;

    const panelLow = createTileableNoise(8, 811);
    const micro = createTileableNoise(52, 839);

    const aImg = aCtx.createImageData(size, size);
    const rImg = rCtx.createImageData(size, size);
    const bImg = bCtx.createImageData(size, size);

    for (let y = 0; y < size; y++) {
      const v = y / size;
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const idx = (y * size + x) * 4;
        const m = micro(u, v);
        const tint = smoothstep(0.45, 0.78, panelLow(u, v));

        // Brushed pearl titanium blending with warm champagne-gold alloy highlights
        const r = (204 + m * 16) * (1 - tint * 0.25) + 236 * (tint * 0.25);
        const g = (212 + m * 16) * (1 - tint * 0.25) + 220 * (tint * 0.25);
        const b = (224 + m * 16) * (1 - tint * 0.25) + 190 * (tint * 0.25);

        aImg.data[idx] = clampByte(r);
        aImg.data[idx + 1] = clampByte(g);
        aImg.data[idx + 2] = clampByte(b);
        aImg.data[idx + 3] = 255;

        const rv = clampByte(88 + m * 36);
        rImg.data[idx] = rv;
        rImg.data[idx + 1] = rv;
        rImg.data[idx + 2] = rv;
        rImg.data[idx + 3] = 255;

        const bv = clampByte(148 + (m - 0.5) * 22);
        bImg.data[idx] = bv;
        bImg.data[idx + 1] = bv;
        bImg.data[idx + 2] = bv;
        bImg.data[idx + 3] = 255;
      }
    }

    aCtx.putImageData(aImg, 0, 0);
    rCtx.putImageData(rImg, 0, 0);
    bCtx.putImageData(bImg, 0, 0);

    // Clean precision aerospace seams + champagne-gold inlay trim
    for (const s of [0, 256, 512]) {
      aCtx.fillStyle = '#8fa4ba';
      aCtx.fillRect(s - 2.5, 0, 5, size);
      aCtx.fillRect(0, s - 2.5, size, 5);
      bCtx.fillStyle = '#404040';
      bCtx.fillRect(s - 2.5, 0, 5, size);
      bCtx.fillRect(0, s - 2.5, size, 5);
    }

    aCtx.fillStyle = 'rgba(234, 179, 8, 0.55)';
    aCtx.fillRect(14, 122, 228, 8);
    aCtx.fillRect(270, 378, 228, 8);

    // Precision hex fasteners
    for (let py = 0; py < 2; py++) {
      for (let px = 0; px < 2; px++) {
        const ox = px * 256;
        const oy = py * 256;
        for (const [rx, ry] of [
          [ox + 22, oy + 22], [ox + 234, oy + 22],
          [ox + 22, oy + 234], [ox + 234, oy + 234],
        ]) {
          aCtx.fillStyle = '#94a3b8';
          aCtx.beginPath();
          aCtx.arc(rx, ry, 4.5, 0, Math.PI * 2);
          aCtx.fill();
          aCtx.fillStyle = '#ffffff';
          aCtx.beginPath();
          aCtx.arc(rx - 1, ry - 1, 2.2, 0, Math.PI * 2);
          aCtx.fill();
          bCtx.fillStyle = '#f2f2f2';
          bCtx.beginPath();
          bCtx.arc(rx, ry, 4, 0, Math.PI * 2);
          bCtx.fill();
        }
      }
    }

    const result = {
      map: this._buildTexture(albedo.canvas, { isColor: true, repeatX, repeatY }),
      roughnessMap: this._buildTexture(rough.canvas, { isColor: false, repeatX, repeatY }),
      bumpMap: this._buildTexture(bump.canvas, { isColor: false, repeatX, repeatY }),
    };
    this._cache.set(cacheKey, result);
    return result;
  }

  /**
   * 512x512 sunlit white-marble & warm travertine terrace floor with luminous gold-sky energy veins
   * (Map 3: Sky-Spire Citadel).
   */
  getCraterGroundTextures(repeatX = 12, repeatY = 12) {
    const cacheKey = `crater_${repeatX}_${repeatY}`;
    if (this._cache.has(cacheKey)) return this._cache.get(cacheKey);

    const size = 512;
    const albedo = this._createCanvas(size, size);
    const rough = this._createCanvas(size, size);
    const bump = this._createCanvas(size, size);
    const emissive = this._createCanvas(size, size);
    const aCtx = albedo.ctx;
    const rCtx = rough.ctx;
    const bCtx = bump.ctx;
    const eCtx = emissive.ctx;

    const cells = createTileableCellCracks(6, 991);
    const warpNoise = createTileableNoise(14, 997);
    const marbleNoise = createTileableNoise(10, 1009);
    const grain = createTileableNoise(44, 1013);
    const energyPocket = createTileableNoise(6, 1021);

    const aImg = aCtx.createImageData(size, size);
    const rImg = rCtx.createImageData(size, size);
    const bImg = bCtx.createImageData(size, size);
    const eImg = eCtx.createImageData(size, size);

    for (let y = 0; y < size; y++) {
      const v = y / size;
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const idx = (y * size + x) * 4;

        const warp = (warpNoise(u, v) - 0.5) * 0.038;
        const edge = cells(u + warp, v - warp * 0.85);
        const m = marbleNoise(u, v);
        const g = grain(u, v);
        const pocket = energyPocket(u, v);

        const seam = 1 - smoothstep(0.012, 0.044, edge);
        const veinCore = 1 - smoothstep(0.004, 0.022, edge);
        const glowMask = smoothstep(0.36, 0.72, pocket);
        const glowStrength = veinCore * (0.3 + glowMask * 0.7);

        // Bright sunlit ivory-marble & pale sandstone slabs
        const marbleMix = smoothstep(0.4, 0.75, m);
        let r = 212 + g * 16 + marbleMix * 16;
        let gCol = 214 + g * 15 + marbleMix * 16;
        let b = 218 + g * 14 + marbleMix * 14;

        let rv = 118 + g * 34 + marbleMix * 18;
        let bv = 156 + (g - 0.5) * 28;

        if (seam > 0.01) {
          r = r * (1 - seam) + (142 + glowStrength * 110) * seam;
          gCol = gCol * (1 - seam) + (186 + glowStrength * 64) * seam;
          b = b * (1 - seam) + (214 + glowStrength * 40) * seam;
          rv = rv * (1 - seam) + 96 * seam;
          bv = bv * (1 - seam) + 64 * seam;
        }

        aImg.data[idx] = clampByte(r);
        aImg.data[idx + 1] = clampByte(gCol);
        aImg.data[idx + 2] = clampByte(b);
        aImg.data[idx + 3] = 255;

        const rByte = clampByte(rv);
        rImg.data[idx] = rByte;
        rImg.data[idx + 1] = rByte;
        rImg.data[idx + 2] = rByte;
        rImg.data[idx + 3] = 255;

        const bByte = clampByte(bv);
        bImg.data[idx] = bByte;
        bImg.data[idx + 1] = bByte;
        bImg.data[idx + 2] = bByte;
        bImg.data[idx + 3] = 255;

        // Luminous solar-gold & cyan energy conduit veins
        eImg.data[idx] = clampByte(glowStrength * 190);
        eImg.data[idx + 1] = clampByte(glowStrength * 220);
        eImg.data[idx + 2] = clampByte(glowStrength * 255);
        eImg.data[idx + 3] = 255;
      }
    }

    aCtx.putImageData(aImg, 0, 0);
    rCtx.putImageData(rImg, 0, 0);
    bCtx.putImageData(bImg, 0, 0);
    eCtx.putImageData(eImg, 0, 0);

    const result = {
      map: this._buildTexture(albedo.canvas, { isColor: true, repeatX, repeatY }),
      roughnessMap: this._buildTexture(rough.canvas, { isColor: false, repeatX, repeatY }),
      bumpMap: this._buildTexture(bump.canvas, { isColor: false, repeatX, repeatY }),
      emissiveMap: this._buildTexture(emissive.canvas, { isColor: true, repeatX, repeatY }),
    };
    this._cache.set(cacheKey, result);
    return result;
  }

  /**
   * 512x512 crisp Mirror's-Edge white & vibrant solar-coral diagonal aerospace caution stripes.
   */
  getHazardTextures(repeatX = 4, repeatY = 1) {
    const cacheKey = `hazard_${repeatX}_${repeatY}`;
    if (this._cache.has(cacheKey)) return this._cache.get(cacheKey);

    const size = 512;
    const albedo = this._createCanvas(size, size);
    const rough = this._createCanvas(size, size);
    const bump = this._createCanvas(size, size);
    const aCtx = albedo.ctx;
    const rCtx = rough.ctx;
    const bCtx = bump.ctx;

    const wearNoise = createTileableNoise(16, 773);
    const period = 128;
    const aImg = aCtx.createImageData(size, size);
    const rImg = rCtx.createImageData(size, size);
    const bImg = bCtx.createImageData(size, size);

    for (let y = 0; y < size; y++) {
      const v = y / size;
      const inBorder = y < 26 || y > size - 26;
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const idx = (y * size + x) * 4;
        const n = wearNoise(u * 2, v * 2);
        const phase = (x + y) % period;
        const isCoral = !inBorder && phase < period * 0.45;

        let r, g, b, roughVal, bumpVal;
        if (inBorder) {
          r = 210 + n * 14;
          g = 220 + n * 14;
          b = 232 + n * 14;
          roughVal = 92 + n * 24;
          bumpVal = 178;
        } else if (isCoral) {
          r = 248 - n * 12;
          g = 112 - n * 10;
          b = 46 - n * 8;
          roughVal = 104 + n * 24;
          bumpVal = 166;
        } else {
          r = 242 - n * 10;
          g = 246 - n * 10;
          b = 250 - n * 8;
          roughVal = 112 + n * 22;
          bumpVal = 158;
        }

        aImg.data[idx] = clampByte(r);
        aImg.data[idx + 1] = clampByte(g);
        aImg.data[idx + 2] = clampByte(b);
        aImg.data[idx + 3] = 255;

        const rv = clampByte(roughVal);
        rImg.data[idx] = rv;
        rImg.data[idx + 1] = rv;
        rImg.data[idx + 2] = rv;
        rImg.data[idx + 3] = 255;

        const bv = clampByte(bumpVal);
        bImg.data[idx] = bv;
        bImg.data[idx + 1] = bv;
        bImg.data[idx + 2] = bv;
        bImg.data[idx + 3] = 255;
      }
    }

    aCtx.putImageData(aImg, 0, 0);
    rCtx.putImageData(rImg, 0, 0);
    bCtx.putImageData(bImg, 0, 0);

    for (const y of [26, size - 26]) {
      aCtx.fillStyle = '#94a3b8';
      aCtx.fillRect(0, y - 2, size, 4);
    }

    const result = {
      map: this._buildTexture(albedo.canvas, { isColor: true, repeatX, repeatY }),
      roughnessMap: this._buildTexture(rough.canvas, { isColor: false, repeatX, repeatY }),
      bumpMap: this._buildTexture(bump.canvas, { isColor: false, repeatX, repeatY }),
    };
    this._cache.set(cacheKey, result);
    return result;
  }

  /**
   * 512x512 sleek frosted daylight-white architectural wayfinding panel for SOLARIS-DROP.
   */
  getSignboardTexture(title, subtitle, accentHex = '#0ea5e9') {
    const cacheKey = `signboard_${title}_${subtitle}_${accentHex}`;
    if (this._cache.has(cacheKey)) return this._cache.get(cacheKey);

    const size = 512;
    const { canvas, ctx } = this._createCanvas(size, size);
    const { r, g, b } = parseHexColor(accentHex);
    const rgba = (alpha) => `rgba(${r}, ${g}, ${b}, ${alpha})`;

    // Bright porcelain-white aerospace signboard plate
    const plateGrad = ctx.createLinearGradient(0, 0, size, size);
    plateGrad.addColorStop(0, '#ffffff');
    plateGrad.addColorStop(0.55, '#f1f7fd');
    plateGrad.addColorStop(1, '#e2eef8');
    ctx.fillStyle = plateGrad;
    ctx.fillRect(0, 0, size, size);

    // Clean framed border
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 8;
    ctx.strokeRect(12, 12, size - 24, size - 24);

    ctx.strokeStyle = rgba(0.82);
    ctx.lineWidth = 3;
    ctx.strokeRect(26, 26, size - 52, size - 52);

    // Vibrant cobalt/accent header ribbon
    ctx.fillStyle = '#0284c7';
    ctx.fillRect(34, 38, size - 68, 44);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 18px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('SOLARIS-DROP // SKYWARD PROTOCOL', 54, 60);

    // Crisp deep navy title typography
    const titleStr = String(title || 'SECTOR-09').toUpperCase();
    let titleFontSize = 54;
    ctx.font = `900 ${titleFontSize}px system-ui, -apple-system, sans-serif`;
    while (ctx.measureText(titleStr).width > 420 && titleFontSize > 24) {
      titleFontSize -= 3;
      ctx.font = `900 ${titleFontSize}px system-ui, -apple-system, sans-serif`;
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#0f172a';
    ctx.fillText(titleStr, 256, 202);

    // Subtitle pill band
    ctx.fillStyle = '#e0f2fe';
    traceRoundedRect(ctx, 46, 268, size - 92, 52, 10);
    ctx.fill();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    const subStr = String(subtitle || 'SKYWARD PROTOCOL').toUpperCase();
    let subFontSize = 20;
    ctx.font = `700 ${subFontSize}px ui-monospace, monospace`;
    while (ctx.measureText(subStr).width > 395 && subFontSize > 11) {
      subFontSize -= 1;
      ctx.font = `700 ${subFontSize}px ui-monospace, monospace`;
    }
    ctx.fillStyle = '#0369a1';
    ctx.fillText(subStr, 256, 294);

    // Footer telemetry & sunlit coral accent bars
    ctx.fillStyle = '#475569';
    ctx.font = 'bold 15px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.fillText('UNIT: VANGUARD-09 // AUTH: SOLARIS-CMD', 46, 378);
    ctx.fillText('ALTITUDE: 4,200M // CLEAR DAYLIGHT OPS', 46, 404);

    ctx.fillStyle = '#f97316';
    for (let i = 0; i < 10; i++) {
      ctx.fillRect(46 + i * 42, 434, 30, 12);
    }

    const tex = this._buildTexture(canvas, { isColor: true, repeatX: 1, repeatY: 1, wrap: false });
    this._cache.set(cacheKey, tex);
    return tex;
  }

  /**
   * 512x512 bright glacial-white & sky-cyan high-altitude deck tiles.
   */
  getCryoFloorTextures(repeatX = 14, repeatY = 14) {
    const cacheKey = `cryo_floor_${repeatX}_${repeatY}`;
    if (this._cache.has(cacheKey)) return this._cache.get(cacheKey);

    const size = 512;
    const albedo = this._createCanvas(size, size);
    const rough = this._createCanvas(size, size);
    const bump = this._createCanvas(size, size);
    const aCtx = albedo.ctx;
    const rCtx = rough.ctx;
    const bCtx = bump.ctx;

    const frostLow = createTileableNoise(6, 2101);
    const frostMid = createTileableNoise(16, 2111);
    const grit = createTileableNoise(44, 2129);

    const aImg = aCtx.createImageData(size, size);
    const rImg = rCtx.createImageData(size, size);
    const bImg = bCtx.createImageData(size, size);

    for (let y = 0; y < size; y++) {
      const v = y / size;
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const idx = (y * size + x) * 4;
        const g = grit(u, v);
        const fField = frostLow(u, v) * 0.65 + frostMid(u, v) * 0.35;
        const gloss = smoothstep(0.55, 0.72, fField);

        let r = 212 + g * 16 + gloss * 18;
        let gCol = 226 + g * 14 + gloss * 14;
        let b = 238 + g * 12 + gloss * 10;
        let rv = 112 + g * 34 - gloss * 58;
        let bv = 152 + (g - 0.5) * 20;

        aImg.data[idx] = clampByte(r);
        aImg.data[idx + 1] = clampByte(gCol);
        aImg.data[idx + 2] = clampByte(b);
        aImg.data[idx + 3] = 255;

        const rb = clampByte(rv);
        rImg.data[idx] = rb;
        rImg.data[idx + 1] = rb;
        rImg.data[idx + 2] = rb;
        rImg.data[idx + 3] = 255;

        const bb = clampByte(bv);
        bImg.data[idx] = bb;
        bImg.data[idx + 1] = bb;
        bImg.data[idx + 2] = bb;
        bImg.data[idx + 3] = 255;
      }
    }

    aCtx.putImageData(aImg, 0, 0);
    rCtx.putImageData(rImg, 0, 0);
    bCtx.putImageData(bImg, 0, 0);

    for (const s of [0, 256, 512]) {
      aCtx.fillStyle = '#93c5fd';
      aCtx.fillRect(s - 3, 0, 6, size);
      aCtx.fillRect(0, s - 3, size, 6);
    }

    const result = {
      map: this._buildTexture(albedo.canvas, { isColor: true, repeatX, repeatY }),
      roughnessMap: this._buildTexture(rough.canvas, { isColor: false, repeatX, repeatY }),
      bumpMap: this._buildTexture(bump.canvas, { isColor: false, repeatX, repeatY }),
    };
    this._cache.set(cacheKey, result);
    return result;
  }

  /**
   * 512x512 sunlit warm sandstone & pearl-white heliostat terrace tiles.
   */
  getSolarFloorTextures(repeatX = 14, repeatY = 14) {
    const cacheKey = `solar_floor_${repeatX}_${repeatY}`;
    if (this._cache.has(cacheKey)) return this._cache.get(cacheKey);

    const size = 512;
    const albedo = this._createCanvas(size, size);
    const rough = this._createCanvas(size, size);
    const bump = this._createCanvas(size, size);
    const aCtx = albedo.ctx;
    const rCtx = rough.ctx;
    const bCtx = bump.ctx;

    const duneLow = createTileableNoise(5, 3701);
    const grain = createTileableNoise(48, 3733);

    const aImg = aCtx.createImageData(size, size);
    const rImg = rCtx.createImageData(size, size);
    const bImg = bCtx.createImageData(size, size);

    for (let y = 0; y < size; y++) {
      const v = y / size;
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const idx = (y * size + x) * 4;
        const g = grain(u, v);
        const warm = duneLow(u, v);

        aImg.data[idx] = clampByte(226 + warm * 16 + g * 10);
        aImg.data[idx + 1] = clampByte(218 + warm * 14 + g * 10);
        aImg.data[idx + 2] = clampByte(202 + warm * 12 + g * 10);
        aImg.data[idx + 3] = 255;

        const rb = clampByte(138 + g * 34);
        rImg.data[idx] = rb;
        rImg.data[idx + 1] = rb;
        rImg.data[idx + 2] = rb;
        rImg.data[idx + 3] = 255;

        const bb = clampByte(152 + (g - 0.5) * 26);
        bImg.data[idx] = bb;
        bImg.data[idx + 1] = bb;
        bImg.data[idx + 2] = bb;
        bImg.data[idx + 3] = 255;
      }
    }

    aCtx.putImageData(aImg, 0, 0);
    rCtx.putImageData(rImg, 0, 0);
    bCtx.putImageData(bImg, 0, 0);

    for (const s of [0, 256, 512]) {
      aCtx.fillStyle = 'rgba(180, 152, 114, 0.72)';
      aCtx.fillRect(s - 3, 0, 6, size);
      aCtx.fillRect(0, s - 3, size, 6);
    }

    aCtx.fillStyle = 'rgba(245, 158, 11, 0.65)';
    aCtx.fillRect(64, 240, 128, 8);
    aCtx.fillRect(320, 494, 128, 8);

    const result = {
      map: this._buildTexture(albedo.canvas, { isColor: true, repeatX, repeatY }),
      roughnessMap: this._buildTexture(rough.canvas, { isColor: false, repeatX, repeatY }),
      bumpMap: this._buildTexture(bump.canvas, { isColor: false, repeatX, repeatY }),
    };
    this._cache.set(cacheKey, result);
    return result;
  }

  /**
   * 512x512 crisp bright pearl-silver aerospace carrier deck plates with sky-cobalt bay markings
   * (Maps 4, 5, 6 & Tutorial Proving Grounds).
   */
  getDrydockFloorTextures(repeatX = 14, repeatY = 14) {
    const cacheKey = `drydock_floor_${repeatX}_${repeatY}`;
    if (this._cache.has(cacheKey)) return this._cache.get(cacheKey);

    const size = 512;
    const albedo = this._createCanvas(size, size);
    const rough = this._createCanvas(size, size);
    const bump = this._createCanvas(size, size);
    const aCtx = albedo.ctx;
    const rCtx = rough.ctx;
    const bCtx = bump.ctx;

    const plateNoise = createTileableNoise(12, 9901);
    const micro = createTileableNoise(46, 9923);

    const aImg = aCtx.createImageData(size, size);
    const rImg = rCtx.createImageData(size, size);
    const bImg = bCtx.createImageData(size, size);

    for (let y = 0; y < size; y++) {
      const v = y / size;
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const idx = (y * size + x) * 4;
        const n = plateNoise(u, v) * 0.55 + micro(u, v) * 0.45;
        const panelAlt = (((x >> 7) + (y >> 7)) % 2 === 0) ? 10 : 0;

        aImg.data[idx] = clampByte(206 + panelAlt + n * 16);
        aImg.data[idx + 1] = clampByte(214 + panelAlt + n * 16);
        aImg.data[idx + 2] = clampByte(226 + panelAlt + n * 16);
        aImg.data[idx + 3] = 255;

        const rv = clampByte(102 + n * 34);
        rImg.data[idx] = rv;
        rImg.data[idx + 1] = rv;
        rImg.data[idx + 2] = rv;
        rImg.data[idx + 3] = 255;

        const bv = clampByte(150 + (micro(u, v) - 0.5) * 22);
        bImg.data[idx] = bv;
        bImg.data[idx + 1] = bv;
        bImg.data[idx + 2] = bv;
        bImg.data[idx + 3] = 255;
      }
    }

    aCtx.putImageData(aImg, 0, 0);
    rCtx.putImageData(rImg, 0, 0);
    bCtx.putImageData(bImg, 0, 0);

    for (const s of [0, 128, 256, 384, 512]) {
      aCtx.fillStyle = '#9db4cc';
      aCtx.fillRect(s - 2, 0, 4, size);
      aCtx.fillRect(0, s - 2, size, 4);
      bCtx.fillStyle = '#484848';
      bCtx.fillRect(s - 2, 0, 4, size);
      bCtx.fillRect(0, s - 2, size, 4);
    }

    for (let y = 64; y < size; y += 128) {
      for (let x = 64; x < size; x += 128) {
        aCtx.fillStyle = '#8aa4bf';
        aCtx.fillRect(x - 14, y - 3.5, 28, 7);
        bCtx.fillStyle = '#363636';
        bCtx.fillRect(x - 14, y - 3.5, 28, 7);
      }
    }

    // Crisp sky-blue & solar-coral flight deck lane markings
    aCtx.fillStyle = 'rgba(14, 165, 233, 0.72)';
    aCtx.fillRect(28, 118, 72, 6);
    aCtx.fillStyle = 'rgba(249, 115, 22, 0.72)';
    aCtx.fillRect(284, 374, 72, 6);

    const result = {
      map: this._buildTexture(albedo.canvas, { isColor: true, repeatX, repeatY }),
      roughnessMap: this._buildTexture(rough.canvas, { isColor: false, repeatX, repeatY }),
      bumpMap: this._buildTexture(bump.canvas, { isColor: false, repeatX, repeatY }),
    };
    this._cache.set(cacheKey, result);
    return result;
  }

  /**
   * Procedural 512x512 RADIANT DAYLIGHT sky dome textures across all 6 sectors.
   */
  getSkyDomeTexture(variant = 'metropolis') {
    const allowed = ['metropolis', 'refinery', 'citadel', 'cryo', 'solar', 'drydock'];
    const key = allowed.includes(variant) ? variant : 'metropolis';
    const cacheKey = `sky_dome_${key}`;
    if (this._cache.has(cacheKey)) return this._cache.get(cacheKey);

    const size = 512;
    const { canvas, ctx } = this._createCanvas(size, size);
    const seedMap = {
      metropolis: 55123,
      refinery: 66234,
      citadel: 77345,
      cryo: 88456,
      solar: 99567,
      drydock: 11678,
    };
    const rng = createRng(seedMap[key] || 55123);

    const drawPeriodic = (fn) => {
      fn(0);
      fn(-size);
      fn(size);
    };

    const drawPeriodicRadialGlow = (cx, cy, r1, stops) => {
      drawPeriodic((ox) => {
        const px = cx + ox;
        if (px + r1 < 0 || px - r1 > size) return;
        const g = ctx.createRadialGradient(px, cy, 4, px, cy, r1);
        for (let s = 0; s < stops.length; s++) {
          g.addColorStop(stops[s][0], stops[s][1]);
        }
        ctx.fillStyle = g;
        ctx.fillRect(px - r1, cy - r1, r1 * 2, r1 * 2);
      });
    };

    const drawPeriodicEllipse = (cx, cy, rx, ry, fillStyle) => {
      ctx.fillStyle = fillStyle;
      drawPeriodic((ox) => {
        const px = cx + ox;
        if (px + rx < 0 || px - rx > size) return;
        ctx.beginPath();
        ctx.ellipse(px, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
      });
    };

    const drawCloudBank = (count, minY, spanY, tintTop = 'rgba(255, 255, 255, 0.72)', tintBase = 'rgba(208, 232, 252, 0.45)') => {
      for (let i = 0; i < count; i++) {
        const cx = rng() * size;
        const cy = minY + rng() * spanY;
        const w = 52 + rng() * 115;
        const h = 11 + rng() * 20;
        drawPeriodicEllipse(cx, cy + 4, w * 1.02, h * 0.9, tintBase);
        drawPeriodicEllipse(cx, cy, w, h, tintTop);
      }
    };

    if (key === 'metropolis') {
      // Crisp cerulean morning daylight sky + gleaming SOLARIS orbital sky-ring
      const grad = ctx.createLinearGradient(0, 0, 0, size);
      grad.addColorStop(0.0, '#1e7bd6');
      grad.addColorStop(0.24, '#4ca9f5');
      grad.addColorStop(0.46, '#9ed9ff');
      grad.addColorStop(0.57, '#eef8ff');
      grad.addColorStop(0.70, '#dff0fc');
      grad.addColorStop(1.0, '#cbe1f2');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);

      drawPeriodicRadialGlow(148, 210, 175, [
        [0, 'rgba(255, 255, 245, 0.98)'],
        [0.22, 'rgba(255, 246, 208, 0.72)'],
        [0.55, 'rgba(186, 234, 255, 0.30)'],
        [1, 'rgba(135, 206, 250, 0.0)'],
      ]);

      drawCloudBank(28, 160, 128);

      // Gleaming white-gold SOLARIS Orbital Sky-Ring + bright contrails
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(226, 92);
      ctx.quadraticCurveTo(342, 46, 460, 88);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.lineWidth = 8;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(228, 92);
      ctx.quadraticCurveTo(342, 48, 458, 88);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3.5;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(232, 93.5);
      ctx.quadraticCurveTo(342, 50, 454, 89.5);
      ctx.strokeStyle = 'rgba(234, 179, 8, 0.85)';
      ctx.lineWidth = 1.6;
      ctx.stroke();

      for (const [x0, y0, x1, y1] of [
        [296, 78, 256, 176],
        [334, 70, 294, 190],
        [364, 72, 330, 172],
        [394, 76, 368, 162],
      ]) {
        const cg = ctx.createLinearGradient(x0, y0, x1, y1);
        cg.addColorStop(0, 'rgba(255, 255, 255, 0.14)');
        cg.addColorStop(0.65, 'rgba(255, 255, 255, 0.78)');
        cg.addColorStop(1, 'rgba(255, 245, 205, 0)');
        ctx.strokeStyle = cg;
        ctx.lineWidth = 2.0;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }
      ctx.restore();
    } else if (key === 'refinery') {
      // Bright coastal golden-morning aqua sky
      const grad = ctx.createLinearGradient(0, 0, 0, size);
      grad.addColorStop(0.0, '#2088d8');
      grad.addColorStop(0.28, '#5ebef2');
      grad.addColorStop(0.48, '#b8ebff');
      grad.addColorStop(0.59, '#fff5dc');
      grad.addColorStop(0.74, '#e5f2fa');
      grad.addColorStop(1.0, '#cde0ee');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);

      drawPeriodicRadialGlow(260, 224, 185, [
        [0, 'rgba(255, 253, 238, 0.96)'],
        [0.35, 'rgba(255, 232, 182, 0.56)'],
        [1, 'rgba(184, 235, 255, 0.0)'],
      ]);

      drawCloudBank(30, 148, 138, 'rgba(255, 254, 248, 0.76)', 'rgba(206, 234, 248, 0.44)');
    } else if (key === 'citadel') {
      // High-altitude brilliant azure & sunlit champagne sky + gleaming white-gold orbital halo ring
      const grad = ctx.createLinearGradient(0, 0, 0, size);
      grad.addColorStop(0.0, '#2278d8');
      grad.addColorStop(0.26, '#58b0f7');
      grad.addColorStop(0.47, '#b4e0ff');
      grad.addColorStop(0.59, '#fff2de');
      grad.addColorStop(0.74, '#e6f0f8');
      grad.addColorStop(1.0, '#cfdfee');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);

      drawPeriodicRadialGlow(256, 230, 210, [
        [0, 'rgba(255, 252, 240, 0.95)'],
        [0.4, 'rgba(255, 236, 198, 0.48)'],
        [1, 'rgba(180, 224, 255, 0.0)'],
      ]);

      drawCloudBank(24, 162, 122);

      // Gleaming continuous white-gold orbital halo ring
      const ringY = (u) => 148 + 56 * Math.cos(u * Math.PI * 2);
      const drawRingSpan = (uFrom, uTo, yOff, strokeStyle, lineWidth) => {
        ctx.strokeStyle = strokeStyle;
        ctx.lineWidth = lineWidth;
        ctx.beginPath();
        const steps = 72;
        for (let i = 0; i <= steps; i++) {
          const u = uFrom + ((uTo - uFrom) * i) / steps;
          const px = u * size;
          const py = ringY(u) + yOff;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.stroke();
      };
      drawRingSpan(-0.02, 1.02, 0, 'rgba(255, 255, 255, 0.92)', 8);
      drawRingSpan(-0.02, 1.02, 4, 'rgba(245, 158, 11, 0.78)', 2.5);
    } else if (key === 'cryo') {
      // Crisp alpine bluebird winter daylight sky
      const grad = ctx.createLinearGradient(0, 0, 0, size);
      grad.addColorStop(0.0, '#2a84de');
      grad.addColorStop(0.28, '#6ec0fb');
      grad.addColorStop(0.50, '#c8ecff');
      grad.addColorStop(0.62, '#f4fbff');
      grad.addColorStop(0.78, '#e2f1fc');
      grad.addColorStop(1.0, '#cfe3f2');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);

      drawPeriodicRadialGlow(180, 206, 175, [
        [0, 'rgba(255, 255, 255, 0.96)'],
        [0.35, 'rgba(216, 242, 255, 0.52)'],
        [1, 'rgba(135, 206, 250, 0.0)'],
      ]);
      drawCloudBank(28, 154, 126);
    } else if (key === 'solar') {
      // Radiant high-noon Mediterranean sky & golden solar aura
      const grad = ctx.createLinearGradient(0, 0, 0, size);
      grad.addColorStop(0.0, '#248ae6');
      grad.addColorStop(0.26, '#62bdf8');
      grad.addColorStop(0.48, '#bde4ff');
      grad.addColorStop(0.60, '#fff7dc');
      grad.addColorStop(0.75, '#f4efe0');
      grad.addColorStop(1.0, '#e2dac8');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);

      drawPeriodicRadialGlow(256, 200, 195, [
        [0, 'rgba(255, 255, 242, 0.98)'],
        [0.26, 'rgba(255, 238, 180, 0.65)'],
        [0.62, 'rgba(186, 230, 255, 0.25)'],
        [1, 'rgba(186, 230, 255, 0.0)'],
      ]);
      drawCloudBank(22, 168, 110);
    } else {
      // 'drydock': Bright high-altitude stratosphere blue-white daylight
      const grad = ctx.createLinearGradient(0, 0, 0, size);
      grad.addColorStop(0.0, '#1e6ec7');
      grad.addColorStop(0.28, '#4fa8f0');
      grad.addColorStop(0.48, '#a6dbff');
      grad.addColorStop(0.60, '#edf7ff');
      grad.addColorStop(0.76, '#dbeaf7');
      grad.addColorStop(1.0, '#c6daec');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);

      drawPeriodicRadialGlow(340, 210, 180, [
        [0, 'rgba(255, 255, 246, 0.98)'],
        [0.32, 'rgba(255, 242, 206, 0.56)'],
        [1, 'rgba(166, 219, 255, 0.0)'],
      ]);
      drawCloudBank(26, 174, 118);
    }

    const tex = this._buildTexture(canvas, {
      isColor: true,
      repeatX: 1,
      repeatY: 1,
      wrapS: THREE.RepeatWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
    });
    this._cache.set(cacheKey, tex);
    return tex;
  }

  /**
   * 512x512 gleaming futuristic white-porcelain & reflective sky-blue glass skyscrapers.
   */
  getRuinedSkylineTextures() {
    const cacheKey = 'ruined_skyline';
    if (this._cache.has(cacheKey)) return this._cache.get(cacheKey);

    const size = 512;
    const albedo = this._createCanvas(size, size);
    const rough = this._createCanvas(size, size);
    const aCtx = albedo.ctx;
    const rCtx = rough.ctx;
    const rng = createRng(8844);

    // Bright white architectural tower facade
    const facadeGrad = aCtx.createLinearGradient(0, 0, 0, size);
    facadeGrad.addColorStop(0, '#f8fbff');
    facadeGrad.addColorStop(0.5, '#e8f1fa');
    facadeGrad.addColorStop(1, '#d2e2f2');
    aCtx.fillStyle = facadeGrad;
    aCtx.fillRect(0, 0, size, size);

    rCtx.fillStyle = '#909090';
    rCtx.fillRect(0, 0, size, size);

    // Crisp vertical white pilasters
    for (let x = 0; x < size; x += 32) {
      aCtx.fillStyle = '#ffffff';
      aCtx.fillRect(x, 0, 6, size);
      aCtx.fillStyle = '#cbdceb';
      aCtx.fillRect(x + 6, 0, 2, size);
    }

    // Reflective sky-blue curtain-wall glass windows
    for (let row = 0; row < 34; row++) {
      const y = row * 15 + 10;
      if (y > size - 14) break;
      for (let col = 0; col < 16; col++) {
        const x = col * 32 + 9;
        const w = 18;
        const h = 9;

        aCtx.fillStyle = rng() > 0.35 ? '#7cc4f5' : '#9ed6fa';
        aCtx.fillRect(x, y, w, h);

        // Specular sky reflection glint
        aCtx.fillStyle = 'rgba(255, 255, 255, 0.45)';
        aCtx.fillRect(x + 1, y + 1, w - 2, 3);

        rCtx.fillStyle = '#2a2a2a';
        rCtx.fillRect(x, y, w, h);

        // Occasional warm sunlit gold architectural trim lights
        if (rng() > 0.94) {
          aCtx.fillStyle = '#fbbf24';
          aCtx.fillRect(x + 3, y + 3, 12, 3);
        }
      }
    }

    const result = {
      map: this._buildTexture(albedo.canvas, { isColor: true, repeatX: 1, repeatY: 2 }),
      roughnessMap: this._buildTexture(rough.canvas, { isColor: false, repeatX: 1, repeatY: 2 }),
    };
    this._cache.set(cacheKey, result);
    return result;
  }

  dispose() {
    for (let i = 0; i < this._textures.length; i++) {
      this._textures[i].dispose();
    }
    this._textures.length = 0;
    this._cache.clear();
  }
}
  __exports.TextureGenerator = TextureGenerator;
});
