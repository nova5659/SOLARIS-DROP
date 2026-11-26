// Module: src/core/Engine.js
__define("src/core/Engine.js", (__exports, __require) => {
const { QUALITY_PRESETS, PLAYER_CONFIG } = __require("src/config/constants.js");

/**
 * Lightweight EffectComposer pass that clears the depth buffer and renders
 * the 1st-person viewmodel scene directly onto the active world render target.
 * Prevents weapons from ever clipping into world geometry while receiving bloom.
 */
class ViewmodelRenderPass {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.enabled = true;
    this.needsSwap = false;
    this.clear = false;
    this.renderToScreen = false;
  }

  setSize() {}

  render(renderer, writeBuffer, readBuffer) {
    const prevAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setRenderTarget(this.renderToScreen ? null : readBuffer);
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
    renderer.autoClear = prevAutoClear;
  }

  dispose() {}
}

/**
 * Core WebGL Rendering Engine for AETHER DROP: RECLAIM EARTH.
 * Manages world + depth-cleared 1P viewmodel scenes, procedural post-apocalyptic
 * golden-ash dusk PMREM environment lighting, half-float & half-resolution bloom
 * post-processing with direct fallback, static shadow baking, shader pre-warming,
 * per-map atmosphere switching, and WebGL context-loss recovery.
 */
class Engine {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {'low'|'medium'|'high'} [initialQuality='medium']
   */
  constructor(canvas, initialQuality = 'medium') {
    this.canvas = canvas;
    this.qualityName = QUALITY_PRESETS[initialQuality] ? initialQuality : 'medium';
    this._qualityConfig = QUALITY_PRESETS[this.qualityName];

    // Performance telemetry & fixed-per-preset DPR state (zero mid-game reallocations)
    this.fps = 60;
    this.frameTimeMs = 16.67;
    this._currentDpr = this._computeTargetDpr();
    this._contextLost = false;
    this._baseFogDensity = null;

    // WebGL Renderer setup
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.88;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = Boolean(this._qualityConfig.shadowsEnabled);
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.autoClear = false;

    // Apply initial DPR and viewport size BEFORE allocating any GPU render targets
    const width = Math.max(1, window.innerWidth || canvas.clientWidth || 1280);
    const height = Math.max(1, window.innerHeight || canvas.clientHeight || 720);
    const aspect = width / height;
    this.renderer.setPixelRatio(this._currentDpr);
    this.renderer.setSize(width, height);

    // World Scene & Main FPS Camera (bright sunlit daylight sky default atmosphere)
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x7ec8f8);
    this.scene.fog = new THREE.FogExp2(0xd6efff, this._qualityConfig.fogDensity ?? 0.0062);

    this.camera = new THREE.PerspectiveCamera(PLAYER_CONFIG.baseFov ?? 80, aspect, 0.1, 240);
    this.camera.rotation.order = 'YXZ';

    // Dedicated 1st-Person Viewmodel Scene & Camera (zero wall clipping)
    this.viewmodelScene = new THREE.Scene();
    this.viewmodelCamera = new THREE.PerspectiveCamera(65, aspect, 0.02, 20);
    this.viewmodelScene.add(this.viewmodelCamera);

    // Procedural post-apocalyptic golden-ash dusk PMREM environment & 3-point viewmodel lighting
    this._envRenderTarget = null;
    this._envMap = null;
    this._buildPostApocEnvironment();
    this._buildViewmodelLighting();

    // Post-processing pipeline (EffectComposer + ViewmodelPass + Half-Res UnrealBloom + OutputPass)
    this.composer = null;
    this._renderPass = null;
    this._viewmodelPass = null;
    this.bloomPass = null;
    this._outputPass = null;
    this._composerReady = false;
    this._composerDpr = null;
    this._initPostProcessing(width, height);

    // Sync active quality settings & arm initial static shadow bake
    this._applyQualitySettings();
    this.bakeStaticShadows();

    // Window resize & WebGL context-loss resilience
    this._onResize = this.resize.bind(this);
    this._onContextLost = this._handleContextLost.bind(this);
    this._onContextRestored = this._handleContextRestored.bind(this);

    window.addEventListener('resize', this._onResize);
    if (this.canvas) {
      this.canvas.addEventListener('webglcontextlost', this._onContextLost, false);
      this.canvas.addEventListener('webglcontextrestored', this._onContextRestored, false);
    }
  }

  /**
   * Compute clamped target DPR for the active quality preset.
   * @private
   */
  _computeTargetDpr() {
    const deviceDpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    const presetMax = this._qualityConfig.dprMax ?? 1.0;
    const targetDpr = Math.min(deviceDpr, presetMax);
    return Math.max(0.75, Math.min(presetMax, targetDpr));
  }

  /** @private */
  _handleContextLost(e) {
    e.preventDefault();
    this._contextLost = true;
  }

  /** @private */
  _handleContextRestored() {
    this._contextLost = false;
    if (this._envRenderTarget) {
      this._envRenderTarget.dispose();
      this._envRenderTarget = null;
    }
    this._disposePostProcessing();
    this._buildPostApocEnvironment();
    const width = Math.max(1, window.innerWidth || this.canvas.clientWidth || 1280);
    const height = Math.max(1, window.innerHeight || this.canvas.clientHeight || 720);
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.setPixelRatio(this._currentDpr);
    this.renderer.setSize(width, height);
    this._initPostProcessing(width, height);
    this._applyQualitySettings();
    this.resize();
    this.bakeStaticShadows();
  }

  /**
   * Generates a procedural radiant daylight sky-citadel equirectangular
   * environment texture on a 512x256 canvas and compiles it via PMREMGenerator
   * so porcelain-white armor, brushed titanium, and cobalt trim gleam crisply in daylight.
   * @private
   */
  _buildPostApocEnvironment() {
    try {
      if (this._envRenderTarget) {
        this._envRenderTarget.dispose();
        this._envRenderTarget = null;
      }

      const envCanvas = document.createElement('canvas');
      envCanvas.width = 512;
      envCanvas.height = 256;
      const ctx = envCanvas.getContext('2d');
      if (!ctx) return;

      const w = envCanvas.width;
      const h = envCanvas.height;

      // 1. Bright daylight vertical sky gradient: crisp cerulean zenith -> airy sky -> sunlit pearl bounce
      const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
      skyGrad.addColorStop(0.0, '#2a86dc');
      skyGrad.addColorStop(0.22, '#62baf7');
      skyGrad.addColorStop(0.42, '#b9e4ff');
      skyGrad.addColorStop(0.50, '#eef8ff');
      skyGrad.addColorStop(0.56, '#dcebf7');
      skyGrad.addColorStop(0.76, '#c7d6e4');
      skyGrad.addColorStop(1.0, '#aebfcc');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, w, h);

      // 2. Radiant sunlit morning sun disc + warm golden solar scatter in clear blue sky
      const sunX = w * 0.28;
      const sunY = h * 0.30;

      const horizonScatter = ctx.createLinearGradient(0, h * 0.36, 0, h * 0.56);
      horizonScatter.addColorStop(0, 'rgba(255, 250, 238, 0)');
      horizonScatter.addColorStop(0.55, 'rgba(255, 252, 242, 0.45)');
      horizonScatter.addColorStop(0.76, 'rgba(255, 242, 214, 0.40)');
      horizonScatter.addColorStop(1, 'rgba(220, 238, 255, 0)');
      ctx.fillStyle = horizonScatter;
      ctx.fillRect(0, h * 0.36, w, h * 0.2);

      const solarGlow = ctx.createRadialGradient(sunX, sunY, 8, sunX, sunY, 155);
      solarGlow.addColorStop(0, 'rgba(255, 254, 244, 0.95)');
      solarGlow.addColorStop(0.24, 'rgba(255, 244, 208, 0.56)');
      solarGlow.addColorStop(0.58, 'rgba(186, 230, 255, 0.24)');
      solarGlow.addColorStop(1, 'rgba(135, 206, 250, 0)');
      ctx.fillStyle = solarGlow;
      ctx.fillRect(sunX - 155, sunY - 155, 310, 310);

      const sunDisc = ctx.createRadialGradient(sunX, sunY, 2, sunX, sunY, 22);
      sunDisc.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
      sunDisc.addColorStop(0.45, 'rgba(255, 248, 224, 0.96)');
      sunDisc.addColorStop(0.75, 'rgba(255, 232, 178, 0.48)');
      sunDisc.addColorStop(1, 'rgba(255, 232, 178, 0)');
      ctx.fillStyle = sunDisc;
      ctx.beginPath();
      ctx.arc(sunX, sunY, 22, 0, Math.PI * 2);
      ctx.fill();

      // 3. Gleaming white-gold SOLARIS orbital sky-ring + bright contrail streaks
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(205, 48);
      ctx.quadraticCurveTo(328, 12, 442, 44);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.42)';
      ctx.lineWidth = 5.5;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(205, 48);
      ctx.quadraticCurveTo(328, 12, 442, 44);
      ctx.strokeStyle = 'rgba(255, 252, 240, 0.94)';
      ctx.lineWidth = 2.0;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(210, 49.5);
      ctx.quadraticCurveTo(328, 14, 438, 45.5);
      ctx.strokeStyle = 'rgba(217, 172, 74, 0.72)';
      ctx.lineWidth = 1.2;
      ctx.stroke();

      const contrails = [
        [278, 34, 248, 86],
        [314, 28, 282, 92],
        [342, 29, 314, 82],
        [374, 33, 352, 78],
      ];
      for (let i = 0; i < contrails.length; i++) {
        const [x0, y0, x1, y1] = contrails[i];
        const cg = ctx.createLinearGradient(x0, y0, x1, y1);
        cg.addColorStop(0, 'rgba(255, 255, 255, 0.12)');
        cg.addColorStop(0.6, 'rgba(255, 255, 255, 0.55)');
        cg.addColorStop(0.92, 'rgba(255, 250, 232, 0.80)');
        cg.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.strokeStyle = cg;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }
      ctx.restore();

      // 4. Crisp bright daylight studio softboxes in upper hemisphere for gleaming ceramic/titanium PBR
      const drawSoftbox = (x, y, bw, bh, innerColor, outerColor) => {
        const cx = x + bw * 0.5;
        const cy = y + bh * 0.5;
        const rad = Math.max(bw, bh) * 0.75;
        const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, rad);
        g.addColorStop(0, innerColor);
        g.addColorStop(0.55, outerColor);
        g.addColorStop(1, 'rgba(255, 255, 255, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - 16, y - 16, bw + 32, bh + 32);

        ctx.fillStyle = innerColor;
        ctx.fillRect(x, y, bw, bh);
      };

      drawSoftbox(62, 24, 130, 22, 'rgba(255, 252, 242, 0.95)', 'rgba(255, 242, 210, 0.36)');
      drawSoftbox(208, 16, 120, 20, 'rgba(244, 250, 255, 0.94)', 'rgba(186, 226, 255, 0.32)');
      drawSoftbox(344, 28, 124, 20, 'rgba(235, 248, 255, 0.92)', 'rgba(166, 216, 252, 0.28)');
      drawSoftbox(150, 56, 94, 16, 'rgba(255, 255, 255, 0.85)', 'rgba(218, 240, 255, 0.24)');

      // 5. Soft sunlit modern sky-city horizon silhouette in airy aerial perspective
      const horizonY = Math.floor(h * 0.508);
      const cityProfile = [
        [0, 12], [18, 18], [26, 32], [38, 32], [44, 14], [64, 16],
        [72, 38], [86, 38], [94, 24], [108, 12], [126, 16],
        [136, 46], [150, 46], [158, 24], [176, 14], [194, 22],
        [204, 34], [218, 30], [230, 14], [248, 44], [264, 50],
        [276, 32], [292, 16], [314, 24], [326, 40], [340, 32],
        [356, 14], [374, 44], [390, 38], [404, 20], [426, 14],
        [438, 36], [454, 30], [472, 18], [492, 30], [512, 14],
      ];

      ctx.fillStyle = '#c4dff3';
      ctx.beginPath();
      ctx.moveTo(0, horizonY + 12);
      for (let i = 0; i < cityProfile.length; i++) {
        const [rx, rh] = cityProfile[i];
        ctx.lineTo(rx, horizonY - rh);
      }
      ctx.lineTo(w, horizonY + 12);
      ctx.closePath();
      ctx.fill();

      // Bright sunlit mist veil along city base
      const mistVeil = ctx.createLinearGradient(0, horizonY - 12, 0, horizonY + 26);
      mistVeil.addColorStop(0, 'rgba(235, 248, 255, 0)');
      mistVeil.addColorStop(0.55, 'rgba(242, 250, 255, 0.58)');
      mistVeil.addColorStop(1, 'rgba(218, 234, 246, 0)');
      ctx.fillStyle = mistVeil;
      ctx.fillRect(0, horizonY - 12, w, 38);

      const envTexture = new THREE.CanvasTexture(envCanvas);
      envTexture.mapping = THREE.EquirectangularReflectionMapping;
      envTexture.colorSpace = THREE.SRGBColorSpace;
      envTexture.needsUpdate = true;

      const pmrem = new THREE.PMREMGenerator(this.renderer);
      pmrem.compileEquirectangularShader();
      this._envRenderTarget = pmrem.fromEquirectangular(envTexture);
      this._envMap = this._envRenderTarget.texture;

      envTexture.dispose();
      pmrem.dispose();

      this.scene.environment = this._envMap;
      this.viewmodelScene.environment = this._envMap;
      if ('environmentIntensity' in this.scene) {
        this.scene.environmentIntensity = 0.56;
        this.viewmodelScene.environmentIntensity = 0.84;
      }
    } catch {
      // Fallback safely if PMREM compilation is unavailable on legacy drivers
      this._envMap = null;
    }
  }

  /**
   * Dedicated bright daylight 3-point lighting for the 1st-person viewmodel scene
   * so porcelain-white weapons and exo-hands read crisply in radiant sunlight.
   * @private
   */
  _buildViewmodelLighting() {
    const hemi = new THREE.HemisphereLight(0xeef8ff, 0xc7d7e6, 1.3);
    this.viewmodelScene.add(hemi);

    const sunKey = new THREE.DirectionalLight(0xfff7e6, 2.3);
    sunKey.position.set(1.8, 1.6, -1.2);
    this.viewmodelScene.add(sunKey);

    const skyFill = new THREE.DirectionalLight(0x9bd6ff, 1.35);
    skyFill.position.set(-0.9, 3.0, 1.8);
    this.viewmodelScene.add(skyFill);

    const azureRim = new THREE.PointLight(0x38bdf8, 0.85, 8);
    azureRim.position.set(-1.6, 0.35, 0.7);
    azureRim.visible = true;
    this.viewmodelScene.add(azureRim);
  }

  /**
   * Initialize EffectComposer pipeline guarded by explicit Half-Float RT capability
   * verification so Android GPUs lacking float color buffers never black-screen,
   * while constraining UnrealBloomPass strictly to half-resolution for 4x lower fillrate.
   * @private
   */
  _initPostProcessing(width, height) {
    const gl = this.renderer.getContext();
    const supportsHalfFloatRT = Boolean(
      gl &&
        (gl.getExtension('EXT_color_buffer_float') ||
          gl.getExtension('EXT_color_buffer_half_float'))
    );

    if (!supportsHalfFloatRT) {
      this._composerReady = false;
      this.composer = null;
      this.bloomPass = null;
      return;
    }

    try {
      const rtWidth = Math.max(1, Math.floor(width * this._currentDpr));
      const rtHeight = Math.max(1, Math.floor(height * this._currentDpr));
      const bloomWidth = Math.max(1, Math.floor(rtWidth * 0.5));
      const bloomHeight = Math.max(1, Math.floor(rtHeight * 0.5));
      const renderTarget = new THREE.WebGLRenderTarget(rtWidth, rtHeight, {
        type: THREE.HalfFloatType,
      });

      this.composer = new EffectComposer(this.renderer, renderTarget);
      this.composer.setPixelRatio(this._currentDpr);
      this._composerDpr = this._currentDpr;

      this._renderPass = new RenderPass(this.scene, this.camera);
      this._renderPass.clear = true;
      this._renderPass.clearDepth = true;
      this.composer.addPass(this._renderPass);

      this._viewmodelPass = new ViewmodelRenderPass(this.viewmodelScene, this.viewmodelCamera);
      this.composer.addPass(this._viewmodelPass);

      const q = this._qualityConfig;
      this.bloomPass = new UnrealBloomPass(
        new THREE.Vector2(bloomWidth, bloomHeight),
        q.bloomStrength ?? 0.45,
        q.bloomRadius ?? 0.35,
        q.bloomThreshold ?? 0.72
      );
      this.composer.addPass(this.bloomPass);

      this._outputPass = new OutputPass();
      this.composer.addPass(this._outputPass);

      this.composer.setSize(width, height);
      this.bloomPass.setSize(bloomWidth, bloomHeight);
      this._composerReady = true;
    } catch {
      this._disposePostProcessing();
      this._composerReady = false;
    }
  }

  /** @private */
  _disposePostProcessing() {
    if (this.composer) {
      this.composer.dispose();
      this.composer = null;
    }
    if (this.bloomPass) {
      this.bloomPass.dispose();
      this.bloomPass = null;
    }
    if (this._outputPass && typeof this._outputPass.dispose === 'function') {
      this._outputPass.dispose();
      this._outputPass = null;
    }
    this._renderPass = null;
    this._viewmodelPass = null;
    this._composerDpr = null;
  }

  /**
   * Compute active fog density, preserving quality preset scaling over per-map overrides.
   * @private
   */
  _computeFogDensity() {
    const presetDensity = this._qualityConfig.fogDensity ?? 0.013;
    if (this._baseFogDensity !== null && Number.isFinite(this._baseFogDensity)) {
      const basePresetDensity = QUALITY_PRESETS.medium?.fogDensity ?? 0.013;
      const scale = basePresetDensity > 0 ? presetDensity / basePresetDensity : 1;
      return this._baseFogDensity * scale;
    }
    return presetDensity;
  }

  /**
   * Apply current quality preset parameters to renderer, shadows, fog, and bloom.
   * @private
   */
  _applyQualitySettings() {
    const q = this._qualityConfig;

    const shadowsEnabled = Boolean(q.shadowsEnabled);
    if (this.renderer.shadowMap.enabled !== shadowsEnabled) {
      this.renderer.shadowMap.enabled = shadowsEnabled;
      if (shadowsEnabled) {
        this.renderer.shadowMap.needsUpdate = true;
      }
    }

    if (this.scene.fog && 'density' in this.scene.fog) {
      this.scene.fog.density = this._computeFogDensity();
    }

    if (this.bloomPass) {
      this.bloomPass.enabled = Boolean(q.bloomEnabled);
      this.bloomPass.strength = q.bloomStrength ?? 0.45;
      this.bloomPass.radius = q.bloomRadius ?? 0.35;
      this.bloomPass.threshold = q.bloomThreshold ?? 0.72;
    }
  }

  /**
   * Bake static shadow maps on the next rendered frame when shadows are enabled.
   */
  bakeStaticShadows() {
    if (this.renderer && this.renderer.shadowMap.enabled) {
      this.renderer.shadowMap.needsUpdate = true;
    }
  }

  /**
   * Pre-compile world and 1P viewmodel shaders ahead of combat to eliminate
   * first-shot or first-spawn GPU pipeline stutters.
   */
  prewarmShaders() {
    if (this._contextLost) return;
    const prevVmVisible = this.viewmodelScene.visible;
    this.viewmodelScene.visible = true;
    try {
      this.renderer.compile(this.scene, this.camera);
      this.renderer.compile(this.viewmodelScene, this.viewmodelCamera);
    } catch {
      // Safe no-op on driver edge cases
    } finally {
      this.viewmodelScene.visible = prevVmVisible;
    }
  }

  /**
   * Switch scene sky background and exponential fog parameters per map/sector.
   * @param {{ bgColor?: THREE.ColorRepresentation, fogColor?: THREE.ColorRepresentation, fogDensity?: number }} [options={}]
   */
  setAtmosphere(options = {}) {
    const opts = options || {};
    const bgColor = opts.bgColor !== undefined ? opts.bgColor : 0x7ec8f8;
    const fogColor = opts.fogColor !== undefined ? opts.fogColor : 0xd6efff;

    if (this.scene.background instanceof THREE.Color) {
      this.scene.background.set(bgColor);
    } else {
      this.scene.background = new THREE.Color(bgColor);
    }

    if (opts.fogDensity !== undefined && Number.isFinite(opts.fogDensity)) {
      this._baseFogDensity = Math.max(0, opts.fogDensity);
    } else {
      this._baseFogDensity = null;
    }

    const density = this._computeFogDensity();
    if (this.scene.fog && 'color' in this.scene.fog) {
      this.scene.fog.color.set(fogColor);
      if ('density' in this.scene.fog) {
        this.scene.fog.density = density;
      }
    } else {
      this.scene.fog = new THREE.FogExp2(fogColor, density);
    }
  }

  /**
   * Switch rendering quality preset ('low' | 'medium' | 'high').
   * @param {'low'|'medium'|'high'} presetName
   */
  setQuality(presetName) {
    const key = String(presetName || 'medium').toLowerCase();
    if (!QUALITY_PRESETS[key]) return;
    this.qualityName = key;
    this._qualityConfig = QUALITY_PRESETS[key];
    this._applyQualitySettings();
    this.resize();
    this.bakeStaticShadows();
  }

  /**
   * Return the active quality preset configuration object.
   */
  getQualityConfig() {
    return this._qualityConfig;
  }

  /**
   * Smoothly update the main FPS camera vertical FOV (degrees).
   * Supports scoped railgun ADS zoom down to 25 degrees.
   * @param {number} fov
   */
  setFov(fov) {
    if (!Number.isFinite(fov)) return;
    const clamped = Math.max(25, Math.min(120, fov));
    if (Math.abs(this.camera.fov - clamped) > 0.01) {
      this.camera.fov = clamped;
      this.camera.updateProjectionMatrix();
    }
  }

  /**
   * Handle viewport / orientation changes cleanly across cameras, renderer, and composer,
   * preserving half-resolution UnrealBloomPass sizing.
   */
  resize() {
    const width = Math.max(1, window.innerWidth || this.canvas.clientWidth || 1280);
    const height = Math.max(1, window.innerHeight || this.canvas.clientHeight || 720);
    const aspect = width / height;

    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();

    this.viewmodelCamera.aspect = aspect;
    this.viewmodelCamera.updateProjectionMatrix();

    const prevDpr = this._currentDpr;
    this._currentDpr = this._computeTargetDpr();
    if (prevDpr !== this._currentDpr) {
      this.renderer.setPixelRatio(this._currentDpr);
    }
    this.renderer.setSize(width, height);

    if (this.composer) {
      if (this._composerDpr !== this._currentDpr) {
        this.composer.setPixelRatio(this._currentDpr);
        this._composerDpr = this._currentDpr;
      }
      this.composer.setSize(width, height);
      if (this.bloomPass) {
        this.bloomPass.setSize(
          Math.max(1, Math.floor(width * this._currentDpr * 0.5)),
          Math.max(1, Math.floor(height * this._currentDpr * 0.5))
        );
      }
    }
  }

  /**
   * Record frame delta time (seconds) and update smoothed fps/frameTimeMs telemetry
   * with zero mid-combat GPU render-target reallocations.
   * @param {number} dt
   */
  recordFrame(dt) {
    if (!Number.isFinite(dt) || dt <= 0 || dt > 0.25) return;

    const ms = dt * 1000;
    this.frameTimeMs += (ms - this.frameTimeMs) * 0.08;
    this.fps = 1000 / Math.max(1, this.frameTimeMs);
  }

  /**
   * Render one frame. Uses EffectComposer + Bloom on High/Medium quality,
   * bypassing composer completely on Low quality (or fallback) for max FPS.
   */
  render() {
    if (this._contextLost) return;

    const useComposer =
      this._composerReady &&
      this.composer !== null &&
      Boolean(this._qualityConfig.bloomEnabled);

    if (useComposer) {
      try {
        this.composer.render();
        return;
      } catch {
        this._composerReady = false;
      }
    }

    // Direct 2-pass render: World Scene -> Clear Depth -> 1P Viewmodel Scene
    this.renderer.setRenderTarget(null);
    this.renderer.autoClear = false;
    this.renderer.clear(true, true, true);
    this.renderer.render(this.scene, this.camera);
    this.renderer.clearDepth();
    this.renderer.render(this.viewmodelScene, this.viewmodelCamera);
  }

  /**
   * Clean up GPU resources and event listeners.
   */
  dispose() {
    window.removeEventListener('resize', this._onResize);
    if (this.canvas) {
      this.canvas.removeEventListener('webglcontextlost', this._onContextLost, false);
      this.canvas.removeEventListener('webglcontextrestored', this._onContextRestored, false);
    }

    this._disposePostProcessing();

    if (this._envRenderTarget) {
      this._envRenderTarget.dispose();
      this._envRenderTarget = null;
    }

    this.scene.environment = null;
    this.viewmodelScene.environment = null;
    this.renderer.dispose();
  }
}
  __exports.Engine = Engine;
});
