// Module: src/main.js
__define("src/main.js", (__exports, __require) => {
const { EVENTS, QUALITY_PRESETS, META_UPGRADES, SYNERGIES, CROSS_SYNERGIES, TACTICAL_CARDS, PILOT_FRAMES, PILOT_FRAME_ART, HEAT_CONTRACTS, DAILY_MODIFIERS, ACHIEVEMENTS, getTodayDailyModifier } = __require("src/config/constants.js");
const { WAVES } = __require("src/config/waves.js");
const { WEAPONS } = __require("src/config/weapons.js");
const { WeaponModelFactory } = __require("src/weapons/WeaponModelFactory.js");
const { EventBus } = __require("src/core/EventBus.js");
const { Engine } = __require("src/core/Engine.js");
const { InputManager } = __require("src/core/InputManager.js");
const { CollisionWorld } = __require("src/physics/CollisionWorld.js");
const { PlayerController } = __require("src/player/PlayerController.js");
const { MapManager } = __require("src/world/MapManager.js");
const { Interactables } = __require("src/world/Interactables.js");
const { VfxManager } = __require("src/vfx/VfxManager.js");
const { WeaponSystem } = __require("src/weapons/WeaponSystem.js");
const { WaveDirector } = __require("src/ai/WaveDirector.js");
const { SoundEngine } = __require("src/audio/SoundEngine.js");
const { HudManager } = __require("src/ui/HudManager.js");
const { TouchOverlay } = __require("src/ui/TouchOverlay.js");

const FADE_DURATION_MS = 300;
const ENDING_LINGER_SEC = 0.5;
const ENDING_SLOWMO_SCALE = 0.25;

/**
 * AETHER DROP: RECLAIM EARTH — Independent 3-Scene Architecture (TITLE / PLAYING / RESULT),
 * Lazy Zero-Stutter GPU Initialization, 3-Map Campaign Transition & 60FPS Game Loop.
 */
function bootstrap() {
  const byId = (id) => document.getElementById(id);

  // Independent Scene Containers & Global Curtains
  const sceneTitle = byId('scene-title');
  const scenePlaying = byId('scene-playing');
  const sceneResult = byId('scene-result');
  const sceneFade = byId('scene-fade');
  const fallbackEl = byId('webgl-fallback');
  const fallbackMsg = byId('webgl-fallback-msg');
  const canvas = byId('game-canvas');

  // Title Scene Controls & Sub-Panels
  const titleDeviceBadge = byId('title-device-badge');
  const titleQualityBadge = byId('title-quality-badge');
  const titleMenuMain = byId('title-menu-main');
  const btnDeploy = byId('btn-deploy');
  const btnTutorial = byId('btn-tutorial');
  const btnTutExit = byId('btn-tut-exit');
  if (btnTutorial) btnTutorial.addEventListener('click', () => startTutorialRun());
  if (btnTutExit) btnTutExit.addEventListener('click', () => finishTutorial(false));
  const titleGoldBadge = byId('title-gold-badge');
  const btnTitleArmory = byId('btn-title-armory');
  const panelArmory = byId('title-panel-armory');
  const btnArmoryBack = byId('btn-armory-back');
  const armoryGoldAmount = byId('armory-gold-amount');
  const armoryGrid = byId('armory-grid');
  const upgradePanel = byId('upgrade-panel');
  const upgradeKicker = byId('upgrade-kicker');
  const upgradeCardsGrid = byId('upgrade-cards-grid');
  const btnTitleArsenal = byId('btn-title-arsenal');
  const btnTitleControls = byId('btn-title-controls');
  const btnTitleSettings = byId('btn-title-settings');
  const btnTitleAchievements = byId('btn-title-achievements');
  const titleAchBadge = byId('title-ach-badge');

  const panelArsenal = byId('title-panel-arsenal');
  const btnArsenalBack = byId('btn-arsenal-back');
  const panelControls = byId('title-panel-controls');
  const btnControlsBack = byId('btn-controls-back');
  const panelSettings = byId('title-panel-settings');
  const btnSettingsBack = byId('btn-settings-back');
  const panelAchievements = byId('title-panel-achievements');
  const btnAchievementsBack = byId('btn-achievements-back');
  const achievementsGrid = byId('achievements-grid');
  const achProgressText = byId('ach-progress-text');
  const achProgressFill = byId('ach-progress-fill');
  const achStatsInline = byId('ach-stats-inline');

  const titleSelQuality = byId('title-setting-quality');
  const titleSelControls = byId('title-setting-controls');
  const titleRngSensitivity = byId('title-setting-sensitivity');
  const titleValSensitivity = byId('title-setting-sensitivity-val');
  const titleRngVolume = byId('title-setting-volume');
  const titleValVolume = byId('title-setting-volume-val');
  const titleChkMusic = byId('title-setting-music');
  const titleChkFps = byId('title-setting-fps');

  // Playing Scene HUD / Pause Controls
  const btnHudPause = byId('hud-pause-btn');
  const pausePanel = byId('pause-panel');
  const btnResume = byId('btn-resume');
  const btnRestartPause = byId('btn-restart-pause');
  const btnQuitTitle = byId('btn-quit-title');

  const pauseSelQuality = byId('setting-quality');
  const pauseSelControls = byId('setting-controls');
  const pauseRngSensitivity = byId('setting-sensitivity');
  const pauseValSensitivity = byId('setting-sensitivity-val');
  const pauseRngVolume = byId('setting-volume');
  const pauseValVolume = byId('setting-volume-val');
  const pauseChkMusic = byId('setting-music');
  const pauseChkFps = byId('setting-fps');
  const fpsCounterEl = byId('fps-counter');

  // Result Scene Actions
  const btnRedeploy = byId('btn-redeploy');
  const btnEndTitle = byId('btn-end-title');

  // ---------------------------------------------------------------------------
  // 1. Coarse-Pointer Device Detection & Bi-Directional Settings State
  // ---------------------------------------------------------------------------
  const coarseMediaQuery =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(pointer: coarse)')
      : null;

  function isCoarsePointer() {
    if (coarseMediaQuery) {
      return Boolean(coarseMediaQuery.matches);
    }
    return Boolean(
      typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(pointer: coarse)').matches
    );
  }

  function isTouchActive() {
    if (settings.controlMode === 'pc') return false;
    if (settings.controlMode === 'touch') return true;
    if (!isCoarsePointer()) return false;
    return runtimeReady && input ? input.isTouchMode() : true;
  }

  const settings = {
    quality: (titleSelQuality && titleSelQuality.value) || 'medium',
    controlMode: (titleSelControls && titleSelControls.value) || 'auto',
    sensitivity: parseFloat((titleRngSensitivity && titleRngSensitivity.value) || '1.0') || 1.0,
    volume: parseInt((titleRngVolume && titleRngVolume.value) || '78', 10),
    music: titleChkMusic ? Boolean(titleChkMusic.checked) : true,
    showFps: titleChkFps ? Boolean(titleChkFps.checked) : false,
  };
  if (!Number.isFinite(settings.volume)) settings.volume = 78;

  // ---------------------------------------------------------------------------
  // 1.5. Persistent Gold & Meta Armory + In-Run Tactical Cards & Synergies
  // ---------------------------------------------------------------------------
  const META_STORAGE_KEY = 'solaris_drop_meta_v1';
  const metaState = {
    gold: 0,
    levels: { firepower: 0, hull: 0, shield: 0, thruster: 0, reload: 0, crit: 0, siphon: 0, salvage: 0 },
    ownedFrames: ['vanguard'],
    equippedFrame: 'vanguard',
    achievements: [],
    bestEndlessWave: 0,
    totalKillsAllTime: 0,
  };
  function _readCookieBackup(name) {
    try {
      const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
      return m ? decodeURIComponent(m[1]) : null;
    } catch { return null; }
  }
  function _writeCookieBackup(name, val) {
    try {
      document.cookie = name + '=' + encodeURIComponent(val) + '; max-age=31536000; path=/; SameSite=Lax';
    } catch {}
  }
  try {
    const raw = window.localStorage.getItem(META_STORAGE_KEY) || _readCookieBackup(META_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Number.isFinite(parsed.gold)) metaState.gold = Math.max(0, Math.floor(parsed.gold));
      if (parsed.levels) {
        for (const k of Object.keys(metaState.levels)) {
          if (Number.isFinite(parsed.levels[k])) {
            metaState.levels[k] = Math.max(0, Math.min(10, Math.floor(parsed.levels[k])));
          }
        }
      }
      if (Array.isArray(parsed.ownedFrames)) {
        metaState.ownedFrames = Array.from(new Set(['vanguard', ...parsed.ownedFrames]));
      }
      if (typeof parsed.equippedFrame === 'string' && metaState.ownedFrames.includes(parsed.equippedFrame)) {
        metaState.equippedFrame = parsed.equippedFrame;
      }
      if (Array.isArray(parsed.achievements)) {
        metaState.achievements = Array.from(new Set(parsed.achievements));
      }
      if (Number.isFinite(parsed.bestEndlessWave)) {
        metaState.bestEndlessWave = Math.max(0, Math.floor(parsed.bestEndlessWave));
      }
      if (Number.isFinite(parsed.totalKillsAllTime)) {
        metaState.totalKillsAllTime = Math.max(0, Math.floor(parsed.totalKillsAllTime));
      }
    }
  } catch {}

  function getEquippedFrame() {
    return PILOT_FRAMES.find((f) => f.id === metaState.equippedFrame) || PILOT_FRAMES[0];
  }

  let selectedMissionMode = 'campaign'; // 'campaign' | 'endless' | 'daily'
  let selectedHeatLevel = 0; // 0..3

  let activeAchCategory = 'all';

  function unlockAchievement(id) {
    if (metaState.achievements.includes(id)) return;
    const ach = ACHIEVEMENTS.find((a) => a.id === id);
    if (!ach) return;
    metaState.achievements.push(id);
    if (ach.reward > 0) {
      metaState.gold += ach.reward;
      if (titleGoldBadge) titleGoldBadge.textContent = `${metaState.gold} G`;
    }
    saveMetaState();
    renderMedalsStrip();
    if (eventBus) {
      eventBus.emit(EVENTS.ANNOUNCEMENT, {
        kicker: ach.reward ? `도전과제 달성 (+${ach.reward} G)` : '도전과제 달성',
        title: ach.name,
        subtitle: ach.desc,
        duration: 3.0,
      });
    }
  }

  function renderMedalsStrip() {
    const unlockedCount = metaState.achievements.length;
    const totalCount = ACHIEVEMENTS.length;
    if (titleAchBadge) {
      titleAchBadge.textContent = `${unlockedCount}/${totalCount}`;
    }
    if (achProgressText) {
      achProgressText.textContent = `달성 ${unlockedCount} / ${totalCount}`;
    }
    if (achProgressFill) {
      achProgressFill.style.width = `${Math.round((unlockedCount / Math.max(1, totalCount)) * 100)}%`;
    }
    if (achStatsInline) {
      achStatsInline.textContent = `누적 처치 ${metaState.totalKillsAllTime || 0} · 무한 최고 W${metaState.bestEndlessWave || 0}`;
    }
    if (!achievementsGrid) return;

    let html = '';
    for (let i = 0; i < ACHIEVEMENTS.length; i++) {
      const a = ACHIEVEMENTS[i];
      if (activeAchCategory !== 'all' && a.cat !== activeAchCategory) continue;
      const unlocked = metaState.achievements.includes(a.id);
      html += `
        <article class="ach-card ${unlocked ? 'unlocked' : ''}">
          <div class="ach-card-top">
            <span class="ach-cat-tag">${a.catLabel || '기록'}</span>
            <span class="ach-reward">${unlocked ? '달성 완료' : `+${a.reward || 0} G`}</span>
          </div>
          <h3 class="ach-name">${a.name}</h3>
          <p class="ach-desc">${a.desc}</p>
        </article>`;
    }
    achievementsGrid.innerHTML = html;
  }

  // Lazy one-shot orthographic 3D side-profile renderer for Arsenal Briefing
  let arsenalPreviewsRendered = false;
  function renderArsenalPreviews() {
    if (arsenalPreviewsRendered) return;
    arsenalPreviewsRendered = true;
    const boxes = document.querySelectorAll('[data-weapon-preview]');
    if (!boxes.length || typeof THREE === 'undefined') return;

    let renderer = null;
    let factory = null;
    const builtRigs = [];
    try {
      const W = 440;
      const H = 132;
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      renderer.setSize(W, H, false);
      renderer.setPixelRatio(1);
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.28;

      const scene = new THREE.Scene();
      const hemi = new THREE.HemisphereLight(0xf0f9ff, 0xcbd5e1, 1.55);
      const key = new THREE.DirectionalLight(0xfffbeb, 2.35);
      key.position.set(3.5, 4.2, 2.2);
      const rim = new THREE.DirectionalLight(0x38bdf8, 1.15);
      rim.position.set(-2.5, 2.2, -3.2);
      const fill = new THREE.DirectionalLight(0xe2e8f0, 1.0);
      fill.position.set(2.2, -1.6, -2.5);
      scene.add(hemi, key, rim, fill);

      const cam = new THREE.OrthographicCamera(-1, 1, 0.3, -0.3, 0.05, 20);
      factory = new WeaponModelFactory();
      const aspect = W / H;

      boxes.forEach((boxEl) => {
        const wid = boxEl.getAttribute('data-weapon-preview');
        const cfg = WEAPONS.find((w) => w.id === wid) || WEAPONS[0];
        const rig = factory.createWeaponRig(cfg);
        builtRigs.push(rig);
        if (rig.leftHand) rig.leftHand.visible = false;
        if (rig.rightHand) rig.rightHand.visible = false;
        if (rig.reticleMesh) rig.reticleMesh.visible = false;

        scene.add(rig.root);
        rig.root.updateMatrixWorld(true);

        const bbox = new THREE.Box3().setFromObject(rig.root);
        const center = new THREE.Vector3();
        const size = new THREE.Vector3();
        bbox.getCenter(center);
        bbox.getSize(size);

        // Camera on +X looking toward -X => weapon barrel (-Z) points right, stock (+Z) on left
        const pad = 1.16;
        const halfW = Math.max(size.z * 0.5 * pad, (size.y * 0.5 * pad) * aspect, 0.12);
        const halfH = halfW / aspect;
        cam.left = -halfW;
        cam.right = halfW;
        cam.top = halfH;
        cam.bottom = -halfH;
        cam.position.set(center.x + 2.8, center.y, center.z);
        cam.lookAt(center);
        cam.updateProjectionMatrix();

        renderer.clear();
        renderer.render(scene, cam);
        const dataUrl = renderer.domElement.toDataURL('image/png');
        scene.remove(rig.root);

        boxEl.innerHTML = `<img class="weapon-preview-img" src="${dataUrl}" alt="${cfg.name} 3D 측면도" />`;
      });
    } catch (err) {
      boxes.forEach((boxEl) => {
        boxEl.innerHTML = '<span class="weapon-preview-loading">3D PREVIEW UNAVAILABLE</span>';
      });
    } finally {
      for (let i = 0; i < builtRigs.length; i++) {
        builtRigs[i].dispose();
      }
      if (factory) factory.dispose();
      if (renderer) renderer.dispose();
    }
  }

  function updateMissionConfigUI() {
    const heat = HEAT_CONTRACTS[selectedHeatLevel] || HEAT_CONTRACTS[0];
    const daily = getTodayDailyModifier();
    const heatBtn = byId('btn-heat-cycle');
    const descEl = byId('mission-mode-desc');
    for (const m of ['campaign', 'endless', 'daily']) {
      const b = byId(`mode-${m}`);
      if (b) b.classList.toggle('active', selectedMissionMode === m);
    }
    if (heatBtn) {
      heatBtn.textContent = heat.label;
      heatBtn.classList.toggle('hot', selectedHeatLevel > 0);
    }
    if (descEl) {
      if (selectedMissionMode === 'endless') {
        descEl.textContent = `무한 강하: 10웨이브마다 적 강화 루프 (최고 W${metaState.bestEndlessWave || 0}) · ${heat.desc}`;
      } else if (selectedMissionMode === 'daily') {
        descEl.textContent = `오늘의 작전 [${daily.name}]: ${daily.desc} · ${heat.desc}`;
      } else {
        descEl.textContent = `표준 10웨이브 궤도 수복 작전 · ${heat.desc}`;
      }
    }
  }

  function saveMetaState() {
    try {
      const serialized = JSON.stringify(metaState);
      window.localStorage.setItem(META_STORAGE_KEY, serialized);
      _writeCookieBackup(META_STORAGE_KEY, serialized);
    } catch {}
  }
  window.addEventListener('beforeunload', saveMetaState);
  window.addEventListener('pagehide', saveMetaState);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveMetaState();
  });

  let runCards = [];
  let draftChoices = [];

  let _visorEl = null;
  let _ultFlashEl = null;
  let _guardFillEl = null;
  let _guardTextEl = null;
  let _ultRingEl = null;
  let _ultDialEl = null;
  let _ultTextEl = null;
  let _frameBadgeEl = null;
  let _frameStatusEl = null;

  // Dedicated 3D Ultimate VFX Objects (Orbital Laser Pillars, Expanding Nova Spheres, Shockwave Rings, Bastion Fortress Dome)
  const _ult3dEffects = [];
  const _preloadedCardArt = [];
  (function preloadAllCardArt() {
    const srcs = [
      "./assets/card-tungsten_core.webp", "./assets/card-overclock_mag.webp",
      "./assets/card-precision_refund.webp", "./assets/card-thruster_tune.webp",
      "./assets/card-slide_reload.webp", "./assets/card-aerial_gunner.webp",
      "./assets/card-siphon_boost.webp", "./assets/card-beacon_resonance.webp",
      "./assets/card-reactive_armor.webp", "./assets/card-repulsor_slam.webp",
      "./assets/card-mark_contagion.webp", "./assets/card-thermal_nova.webp",
      "./assets/card-slide_overclock.webp", "./assets/card-shield_counter.webp",
      "./assets/card-field_medic.webp", "./assets/card-ult_accelerator.webp",
      "./assets/card-ult_overdrive.webp", "./assets/card-auto_forge.webp",
      "./assets/card-scavenger_protocol.webp", "./assets/card-shield_to_ult.webp",
    ];
    for (let i = 0; i < srcs.length; i++) {
      const img = new Image();
      img.decoding = 'sync';
      img.src = srcs[i];
      if (typeof img.decode === 'function') img.decode().catch(() => {});
      _preloadedCardArt.push(img);
    }
  })();
  let _hitstopTimer = 0;

  // === Dedicated 6-Step Interactive Tutorial Controller (Map 6: TutorialMapBuilder) ===
  const tutorialState = {
    active: false,
    step: 0,
    didDash: false,
    didJumpPad: false,
    didBarrel: false,
    killsInStep: 0,
    guardHoldSec: 0,
    pickedItem: false,
    autoUpgraded: false,
    enteredBeacon: false,
    usedUlt: false,
  };

  function updateTutorialBannerUI() {
    const banner = document.getElementById('tutorial-banner');
    if (!banner) return;
    if (!tutorialState.active || gameState !== 'playing') {
      banner.classList.add('hidden');
      return;
    }
    banner.classList.remove('hidden');
    const badge = document.getElementById('tut-step-badge');
    const title = document.getElementById('tut-step-title');
    const desc = document.getElementById('tut-step-desc');
    const goal = document.getElementById('tut-step-goal');
    const s = tutorialState.step;
    if (badge) badge.textContent = `STEP ${s} / 6`;

    if (s === 1) {
      if (title) title.textContent = '1. 기동 & 맵 오브젝트 (점프 패드 · 폭발 드럼통)';
      if (desc) desc.textContent = 'WASD로 이동하고 [Q]로 대시하세요. 서쪽 바닥의 점프 패드를 밟아 고지대로 도약하고, 중앙의 빨간 연료 드럼통을 사격해 폭파해 보세요.';
      if (goal) goal.textContent = `목표: 대시(${tutorialState.didDash ? '완료' : '0/1'}) · 점프패드(${tutorialState.didJumpPad ? '완료' : '0/1'}) · 드럼통 폭파(${tutorialState.didBarrel ? '완료' : '0/1'})`;
    } else if (s === 2) {
      if (title) title.textContent = '2. 무기 장단점 & 정조준 사격';
      if (desc) desc.textContent = '주무기별 특징이 다릅니다 — M41-A(균형), BR-12(근접강화·원거리 약화), HV-7(저격 2.6배·방패 중 사격불가), K-9(이속+12%·빠른 장전). [1]/[2]로 보조무기도 전환하며 북쪽 표적 2기를 처치하세요.';
      if (goal) goal.textContent = `목표: 북쪽 훈련 표적 처치 (${tutorialState.killsInStep} / 2)`;
    } else if (s === 3) {
      if (title) title.textContent = '3. [E] 전방 방패 & 맵 스폰 아이템';
      if (desc) desc.textContent = '적 처치 시 체력·방어력이 회복되지 않습니다! [E]를 길게 눌러 정면 탄환을 막고(방패 중 정조준 불가, 피격 시 균열 발생), 동쪽 패드에 스폰된 체력 키트·쉴드 셀·탄약 상자를 직접 먹어 회복하세요.';
      if (goal) goal.textContent = `목표: [E] 방패 전개(${tutorialState.guardHoldSec >= 0.8 ? '완료' : Math.round(tutorialState.guardHoldSec * 100) + '%'}) · 바닥 아이템 획득(${tutorialState.pickedItem ? '완료' : '0/1'})`;
    } else if (s === 4) {
      if (title) title.textContent = '4. 드랍 총기 교체 & 자동 업그레이드';
      if (desc) desc.textContent = '적이 떨어뜨린 다른 총기는 [F]로 교체하고, 지금 들고 있는 것과 "같은 총기"에 다가가면 자동으로 업그레이드(MK.II~)되며 외형과 탄환 이펙트가 진화합니다!';
      if (goal) goal.textContent = `목표: 앞에 떨어진 M41-A에 다가가 자동 업그레이드 체험 (${tutorialState.autoUpgraded ? '완료' : '0/1'})`;
    } else if (s === 5) {
      if (title) title.textContent = '5. 테라-비콘 거점 & [X] 궁극기';
      if (desc) desc.textContent = '2스테이지부터 등장하는 중앙 테라-비콘 원형 구역 안에서 버티면 거점이 점령됩니다. 지금 궁극기 게이지를 100% 채워드렸으니 중앙 거점에 들어가 [X] 궁극기로 북쪽 분대를 섬멸하세요!';
      if (goal) goal.textContent = `목표: 중앙 거점 진입(${tutorialState.enteredBeacon ? '완료' : '0/1'}) · [X] 궁극기 발동(${tutorialState.usedUlt ? '완료' : '0/1'})`;
    } else if (s === 6) {
      if (title) title.textContent = '6. 스테이지 종료 전술 카드 강화';
      if (desc) desc.textContent = '매 스테이지가 끝나면 3장의 전술 카드 중 1장을 골라 기체를 강화합니다. 같은 태그(화력·기동·방어) 카드를 2장 모으면 강력한 시너지가 발동합니다!';
      if (goal) goal.textContent = '목표: 화면의 전술 카드 1장을 선택해 훈련 완료';
    }
  }

  function advanceTutorialStep(nextStep) {
    tutorialState.step = nextStep;
    if (nextStep === 2 && waveDirector && arenaData) {
      tutorialState.killsInStep = 0;
      if (typeof waveDirector.spawnTutorialEnemy === 'function') {
        waveDirector.spawnTutorialEnemy('rusher_drone', new THREE.Vector3(-4.5, 0.2, -13.5));
        waveDirector.spawnTutorialEnemy('tactical_trooper', new THREE.Vector3(4.5, 0.05, -14.5));
      }
    } else if (nextStep === 3 && playerController) {
      tutorialState.guardHoldSec = 0;
      tutorialState.pickedItem = false;
      // Slightly reduce shield so player can pick up the East Shield/Health pad!
      playerController.shield = Math.max(20, playerController.shield - 35);
      playerController.health = Math.max(40, playerController.health - 20);
      if (interactables && typeof interactables.spawnGoldDrop === 'function') {
        interactables.spawnGoldDrop(new THREE.Vector3(9.5, 0.2, 8.0), 30);
      }
    } else if (nextStep === 4 && interactables && playerController) {
      tutorialState.autoUpgraded = false;
      const base = playerController.position;
      // Spawn matching M41-A (index 0) for auto-upgrade + alternate BR-12 (index 1) for [F] swap demo
      if (typeof interactables.spawnWeaponDrop === 'function') {
        interactables.spawnWeaponDrop(new THREE.Vector3(Math.max(-18, Math.min(18, base.x)), 0.2, Math.max(-18, base.z - 4.5)), 0);
        interactables.spawnWeaponDrop(new THREE.Vector3(Math.max(-18, Math.min(18, base.x + 3.2)), 0.2, Math.max(-18, base.z - 4.5)), 1);
      }
    } else if (nextStep === 5 && playerController && interactables && waveDirector) {
      tutorialState.enteredBeacon = false;
      tutorialState.usedUlt = false;
      playerController.ultCharge = 100;
      if (typeof interactables.setZoneActive === 'function') {
        interactables.setZoneActive(true);
      }
      if (typeof waveDirector.spawnTutorialEnemy === 'function') {
        waveDirector.spawnTutorialEnemy('tactical_trooper', new THREE.Vector3(-5.0, 0.05, -13.0));
        waveDirector.spawnTutorialEnemy('tactical_trooper', new THREE.Vector3(0.0, 0.05, -14.5));
        waveDirector.spawnTutorialEnemy('rusher_drone', new THREE.Vector3(5.0, 0.2, -13.0));
      }
    } else if (nextStep === 6) {
      if (typeof openUpgradeDraft === 'function') {
        openUpgradeDraft(1);
      }
    }
    updateTutorialBannerUI();
  }

  function finishTutorial(completed = false) {
    tutorialState.active = false;
    tutorialState.step = 0;
    const banner = document.getElementById('tutorial-banner');
    if (banner) banner.classList.add('hidden');
    if (completed) {
      metaState.tutorialDone = true;
      saveMetaState();
    }
    returnToTitle();
  }

  function startTutorialRun() {
    if (sceneTitle) sceneTitle.classList.add('hidden');
    if (scenePlaying) scenePlaying.classList.remove('hidden');
    const ok = ensureRuntimeInitialized();
    if (!ok) return;

    if (interactables) {
      interactables.dispose();
      interactables = null;
    }
    arenaData = mapManager.loadMap(6);
    interactables = new Interactables(engine.scene, collisionWorld, eventBus, arenaData);
    waveDirector.setArenaData(arenaData, interactables);
    hudManager.setArenaData(arenaData, collisionWorld);

    resetTelemetry();
    input.resetAll();
    touchOverlay.reset();
    hudManager.reset();
    vfxManager.reset();
    waveDirector.reset();
    runCards = [];
    draftChoices = [];
    if (upgradePanel) upgradePanel.classList.add('hidden');

    const { mods: startMods } = computePlayerMods();
    playerController.applyModifiers(startMods, true);
    playerController.reset(arenaData.playerSpawn.pos, arenaData.playerSpawn.yaw);
    weaponSystem.reset();
    lastWeaponState = weaponSystem.getCurrentWeaponState();

    engine.viewmodelScene.visible = true;
    engine.resize();
    engine.setFov(playerController.currentFov);
    engine.bakeStaticShadows();
    engine.prewarmShaders();

    hudManager.setVisible(true);
    gameState = 'playing';
    document.body.classList.add('playing-active');
    syncTouchOverlayVisibility();

    tutorialState.active = true;
    tutorialState.didDash = false;
    tutorialState.didJumpPad = false;
    tutorialState.didBarrel = false;
    tutorialState.killsInStep = 0;
    tutorialState.guardHoldSec = 0;
    tutorialState.pickedItem = false;
    tutorialState.autoUpgraded = false;
    tutorialState.enteredBeacon = false;
    tutorialState.usedUlt = false;
    advanceTutorialStep(1);

    eventBus.emit(EVENTS.GAME_STATE, { state: 'playing' });
    if (!input.isTouchMode()) {
      input.requestPointerLock();
    }
  }
  let _bastionDomeGroup = null;

  function triggerUltScreenFlash(colorCss, opacity = 0.52) {
    ensureTacticalFrameHudOverlay();
    if (!_ultFlashEl) return;
    _ultFlashEl.style.background = `radial-gradient(circle, ${colorCss} 0%, transparent 72%)`;
    _ultFlashEl.style.opacity = String(opacity);
    _ultFlashEl.dataset.alpha = String(opacity);
  }

  function spawnUltBeamPillar(pos, colorHex) {
    if (!engine || !engine.scene) return;
    const g = new THREE.Group();
    g.position.set(pos.x, pos.y, pos.z);
    const outerGeo = new THREE.CylinderGeometry(1.25, 1.85, 44, 16, 1, true);
    const outerMat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const outer = new THREE.Mesh(outerGeo, outerMat);
    outer.position.y = 22;
    g.add(outer);

    const coreGeo = new THREE.CylinderGeometry(0.45, 0.72, 44, 12, 1, true);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const core = new THREE.Mesh(coreGeo, coreMat);
    core.position.y = 22;
    g.add(core);

    const scorchGeo = new THREE.CircleGeometry(3.8, 24);
    scorchGeo.rotateX(-Math.PI * 0.5);
    const scorchMat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const scorch = new THREE.Mesh(scorchGeo, scorchMat);
    scorch.position.y = 0.08;
    g.add(scorch);

    engine.scene.add(g);
    _ult3dEffects.push({ type: 'pillar', mesh: g, mats: [outerMat, coreMat, scorchMat], geos: [outerGeo, coreGeo, scorchGeo], age: 0, maxAge: 1.25 });
  }

  function spawnUltShockRing(pos, maxRadius, colorHex, maxAge = 0.85, tiltX = 0) {
    if (!engine || !engine.scene) return;
    const geo = new THREE.TorusGeometry(1.0, 0.14, 10, 36);
    geo.rotateX(Math.PI * 0.5 + tiltX);
    const mat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(pos.x, Math.max(0.25, pos.y + 0.35), pos.z);
    engine.scene.add(mesh);
    _ult3dEffects.push({ type: 'ring', mesh, mats: [mat], geos: [geo], age: 0, maxAge, maxRadius });
  }

  function spawnUltNovaSphere(pos, maxRadius, colorHex, maxAge = 1.05) {
    if (!engine || !engine.scene) return;
    const geo = new THREE.SphereGeometry(1.0, 20, 14);
    const mat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.58,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(pos.x, pos.y + 1.0, pos.z);
    engine.scene.add(mesh);
    _ult3dEffects.push({ type: 'sphere', mesh, mats: [mat], geos: [geo], age: 0, maxAge, maxRadius });
  }

  function updateUlt3dEffects(dt) {
    if (_ultFlashEl) {
      const a = parseFloat(_ultFlashEl.dataset.alpha || '0');
      if (a > 0.005) {
        const na = Math.max(0, a - dt * 1.35);
        _ultFlashEl.dataset.alpha = String(na);
        _ultFlashEl.style.opacity = String(na);
      }
    }
    // Bastion 3D Emerald Fortress Dome following player while ultInvulnTimer > 0
    if (playerController && playerController.ultInvulnTimer > 0 && engine && engine.scene) {
      if (!_bastionDomeGroup) {
        _bastionDomeGroup = new THREE.Group();
        const domeGeo = new THREE.SphereGeometry(2.65, 18, 12);
        const domeMat = new THREE.MeshBasicMaterial({
          color: 0x22c55e,
          transparent: true,
          opacity: 0.22,
          wireframe: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        });
        _bastionDomeGroup.add(new THREE.Mesh(domeGeo, domeMat));
        const eqGeo = new THREE.TorusGeometry(2.7, 0.08, 8, 32);
        eqGeo.rotateX(Math.PI * 0.5);
        const eqMat = new THREE.MeshBasicMaterial({
          color: 0x4ade80,
          transparent: true,
          opacity: 0.85,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        });
        _bastionDomeGroup.add(new THREE.Mesh(eqGeo, eqMat));
        engine.scene.add(_bastionDomeGroup);
      }
      _bastionDomeGroup.visible = true;
      _bastionDomeGroup.position.set(playerController.position.x, playerController.position.y + 1.1, playerController.position.z);
      _bastionDomeGroup.rotation.y += dt * 1.8;
    } else if (_bastionDomeGroup) {
      _bastionDomeGroup.visible = false;
    }

    for (let i = _ult3dEffects.length - 1; i >= 0; i--) {
      const fx = _ult3dEffects[i];
      fx.age += dt;
      const t = Math.min(1, fx.age / fx.maxAge);
      if (fx.type === 'pillar') {
        const sc = 1.0 - t * 0.65;
        fx.mesh.scale.set(sc, 1.0, sc);
        fx.mats[0].opacity = 0.72 * (1 - t);
        fx.mats[1].opacity = 0.92 * (1 - t);
        if (fx.mats[2]) fx.mats[2].opacity = 0.65 * (1 - t);
      } else if (fx.type === 'ring') {
        const r = 1.0 + (fx.maxRadius - 1.0) * (1 - Math.pow(1 - t, 2.2));
        fx.mesh.scale.set(r, r, r);
        fx.mats[0].opacity = 0.92 * (1 - t);
      } else if (fx.type === 'sphere') {
        const r = 1.0 + (fx.maxRadius - 1.0) * (1 - Math.pow(1 - t, 2.5));
        fx.mesh.scale.setScalar(r);
        fx.mats[0].opacity = 0.58 * (1 - t);
      }
      if (fx.age >= fx.maxAge) {
        if (fx.mesh.parent) fx.mesh.parent.remove(fx.mesh);
        for (let g = 0; g < fx.geos.length; g++) fx.geos[g].dispose();
        for (let k = 0; k < fx.mats.length; k++) fx.mats[k].dispose();
        _ult3dEffects.splice(i, 1);
      }
    }
  }

  function ensureTacticalFrameHudOverlay() {
    if (!_visorEl) {
      _visorEl = document.createElement('div');
      _visorEl.id = 'frame-visor-overlay';
      _visorEl.style.cssText =
        'position:fixed;inset:0;pointer-events:none;z-index:12;transition:box-shadow 0.35s ease,border-color 0.35s ease;border:2px solid transparent;display:none;';
      document.body.appendChild(_visorEl);
    }
    if (!_ultFlashEl) {
      _ultFlashEl = document.createElement('div');
      _ultFlashEl.id = 'ult-screen-flash';
      _ultFlashEl.style.cssText =
        'position:fixed;inset:0;pointer-events:none;z-index:14;opacity:0;';
      document.body.appendChild(_ultFlashEl);
    }
    if (!_guardFillEl) _guardFillEl = document.getElementById('hud-guard-fill');
    if (!_guardTextEl) _guardTextEl = document.getElementById('hud-guard-val');
    if (!_ultRingEl) _ultRingEl = document.getElementById('hud-ult-ring');
    if (!_ultDialEl) _ultDialEl = document.getElementById('hud-ult-dial');
    if (!_ultTextEl) _ultTextEl = document.getElementById('hud-ult-val');
    if (!_frameBadgeEl) _frameBadgeEl = document.getElementById('hud-frame-badge');
    if (!_frameStatusEl) _frameStatusEl = document.getElementById('hud-frame-status');
  }

  function renderBuildSummaryInto(el) {
    if (!el) return;
    const { mods, tagCounts } = computePlayerMods();
    const statsHtml = `
      <div class="build-stat-grid">
        <div class="build-stat-item">화력 배율<strong>${Math.round(mods.damageMult * 100)}%</strong></div>
        <div class="build-stat-item">이동 속도<strong>${Math.round(mods.moveSpeedMult * 100)}%</strong></div>
        <div class="build-stat-item">방패 최대<strong>${mods.guardMax}</strong></div>
        <div class="build-stat-item">방패 충전<strong>${Math.round(mods.guardRegenMult * 100)}%</strong></div>
        <div class="build-stat-item">궁극기 충전<strong>${Math.round(mods.ultChargeMult * 100)}%</strong></div>
        <div class="build-stat-item">드랍 회복<strong>${Math.round(mods.dropHealMult * 100)}%</strong></div>
      </div>`;
    let synHtml = '<div class="build-syn-row">';
    for (const key of ['assault', 'mobility', 'vanguard', 'tactical']) {
      const s = SYNERGIES[key];
      const cnt = tagCounts[key] || 0;
      const tier = cnt >= 4 ? '4/4 MAX' : cnt >= 2 ? '2/4 활성' : `${cnt}/2`;
      synHtml += `<span class="build-syn-pill ${cnt >= 2 ? 'active' : ''}" style="border-left:3px solid ${s.color}">${s.tagLabel} ${tier}</span>`;
    }
    for (let i = 0; i < CROSS_SYNERGIES.length; i++) {
      const csyn = CROSS_SYNERGIES[i];
      const ok = csyn.requires.every((r) => (tagCounts[r] || 0) >= 2);
      if (ok) synHtml += `<span class="build-syn-pill active">★ ${csyn.name}</span>`;
    }
    synHtml += '</div>';

    let cardsHtml = '<div class="build-card-list">';
    if (runCards.length === 0) {
      cardsHtml += '<span style="opacity:0.65;">아직 획득한 전술 카드가 없습니다.</span>';
    } else {
      for (let i = 0; i < runCards.length; i++) {
        const cid = runCards[i];
        const card = TACTICAL_CARDS.find((c) => c.id === cid);
        if (!card) continue;
        const s = SYNERGIES[card.tag] || SYNERGIES.assault;
        cardsHtml += `<span class="build-card-chip" style="border-left-color:${s.color}" title="${card.desc}">[${s.tagLabel}] ${card.name}</span>`;
      }
    }
    cardsHtml += '</div>';
    el.innerHTML = statsHtml + synHtml + cardsHtml;
  }

  // [TAB] Hold Live Build Inspector
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Tab' && gameState === 'playing') {
      e.preventDefault();
      const ov = document.getElementById('tab-build-overlay');
      const ct = document.getElementById('tab-build-content');
      if (ov && ct) {
        renderBuildSummaryInto(ct);
        ov.classList.remove('hidden');
      }
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Tab') {
      const ov = document.getElementById('tab-build-overlay');
      if (ov) ov.classList.add('hidden');
    }
  });

  function updateTacticalFrameHudOverlay(pSnap, mods) {
    ensureTacticalFrameHudOverlay();
    const visible = gameState === 'playing' && pSnap && pSnap.isAlive;
    if (_visorEl) _visorEl.style.display = visible ? 'block' : 'none';
    if (!visible) return;

    const fid = (mods && mods.frameId) || 'vanguard';
    const vCol = (mods && mods.visorColor) || 'rgba(245, 158, 11, 0.24)';
    const fCol = (mods && mods.frameColor) || '#f59e0b';
    const spread = fid === 'bastion' ? '52px' : fid === 'strider' ? '26px' : '38px';
    const activeGlow =
      pSnap.ultActiveTimer > 0
        ? `inset 0 0 95px ${fCol}`
        : pSnap.isGuarding
        ? `inset 0 0 60px rgba(56, 189, 248, 0.35)`
        : `inset 0 0 ${spread} ${vCol}`;
    if (_visorEl) {
      _visorEl.style.boxShadow = activeGlow;
      _visorEl.style.borderColor =
        fid === 'bastion'
          ? 'rgba(34,197,94,0.42)'
          : fid === 'apex'
          ? 'rgba(239,68,68,0.38)'
          : fid === 'strider'
          ? 'rgba(56,189,248,0.36)'
          : 'rgba(245,158,11,0.22)';
    }

    if (_guardFillEl && _guardTextEl) {
      const gPct = Math.max(0, Math.min(100, Math.round((pSnap.guardEnergy / Math.max(1, pSnap.maxGuardEnergy)) * 100)));
      _guardFillEl.style.width = gPct + '%';
      _guardFillEl.style.background =
        pSnap.guardBreakTimer > 0
          ? 'linear-gradient(90deg,#dc2626,#ef4444)'
          : fid === 'bastion'
          ? 'linear-gradient(90deg,#16a34a,#4ade80)'
          : 'linear-gradient(90deg,#0284c7,#38bdf8)';
      _guardTextEl.textContent = pSnap.guardBreakTimer > 0 ? '파괴됨' : pSnap.isGuarding ? `방어 ${gPct}%` : gPct + '%';
    }

    if (_ultRingEl && _ultTextEl) {
      const uPct = Math.max(0, Math.min(100, Math.round(pSnap.ultCharge || 0)));
      const visualPct = pSnap.ultActiveTimer > 0 ? 100 : uPct;
      const circ = 220;
      _ultRingEl.style.strokeDashoffset = String((circ * (1 - visualPct / 100)).toFixed(1));
      _ultRingEl.style.stroke =
        pSnap.ultActiveTimer > 0 ? '#4ade80' : uPct >= 100 ? '#f43f5e' : fCol;
      _ultTextEl.textContent = pSnap.ultActiveTimer > 0 ? 'ON' : uPct >= 100 ? 'MAX' : uPct + '%';
      if (_ultDialEl) {
        _ultDialEl.classList.toggle('ult-ready', uPct >= 100 && pSnap.ultActiveTimer <= 0);
      }
    }
    if (_frameBadgeEl && _frameStatusEl) {
      _frameBadgeEl.textContent = (mods && mods.frameName) || 'VANGUARD-09';
      _frameStatusEl.textContent =
        pSnap.ultActiveTimer > 0
          ? '궁극기 가동!'
          : pSnap.isGuarding
          ? '방패 전개 중'
          : pSnap.guardBreakTimer > 0
          ? '방패 복구 대기'
          : '전술 대기';
    }
  }

  function computePlayerMods() {
    const lv = metaState.levels;
    const frame = getEquippedFrame();
    const mods = {
      frameId: frame.id,
      frameName: frame.name,
      frameColor: frame.color || '#f59e0b',
      visorColor: frame.visorColor || 'rgba(245, 158, 11, 0.24)',
      baseFov: frame.baseFov || 80,
      dashMax: frame.dashMax || 2,
      tacticalReload: Boolean(frame.tacticalReload),
      phaseBlink: Boolean(frame.phaseBlink),
      lowGravity: Boolean(frame.lowGravity),
      dashSlam: Boolean(frame.dashSlam),
      apexOverdrive: Boolean(frame.apexOverdrive),
      chainLightning: Boolean(frame.chainLightning),
      guardMax: frame.guardMax || 100,
      guardCostMult: frame.guardCostMult || 1.0,
      ultName: frame.ultName || '',
      damageMult: (1.0 + (lv.firepower || 0) * 0.04) * (frame.dmgMult || 1.0),
      headshotBonus: (lv.crit || 0) * 0.08,
      reloadSpeedMult: 1.0 + (lv.reload || 0) * 0.05,
      fireRateMult: 1.0 + (lv.reload || 0) * 0.02,
      moveSpeedMult: (1.0 + (lv.thruster || 0) * 0.025) * (frame.speedMult || 1.0),
      dashCooldownMult: Math.max(0.42, (1.0 - (lv.thruster || 0) * 0.045) * (frame.dashCdMult || 1.0)),
      shieldRegenMult: 1.0 + (lv.shield || 0) * 0.08,
      killShieldBonus: 0,
      maxHealthBonus: (lv.hull || 0) * 12 + (frame.hpBonus || 0),
      maxShieldBonus: (lv.shield || 0) * 12 + (frame.shieldBonus || 0),
      salvageGoldMult: 1.0 + (lv.salvage || 0) * 0.08,
      killAmmoRefund: 0,
      slideReload: false,
      airDamageBonus: frame.airBonus || 0.0,
      zoneRegenHp: 0,
      zoneDamageBonus: 0.0,
      reactiveArmor: false,
      repulsorSlam: false,
      markContagion: false,
      thermalNova: false,
      slideOverclock: false,
      armorPiercer: false,
      orbitalOverload: false,
      synergyAssault: false,
      synergyMobility: false,
      synergyVanguard: false,
    };

    if (selectedMissionMode === 'daily') {
      const dm = getTodayDailyModifier();
      if (dm.speedMult) mods.moveSpeedMult *= dm.speedMult;
      if (dm.dashCdMult) mods.dashCooldownMult *= dm.dashCdMult;
      if (dm.headshotBonus) mods.headshotBonus += dm.headshotBonus;
      if (dm.dmgMult) mods.damageMult *= dm.dmgMult;
      if (dm.killShield) mods.killShieldBonus += dm.killShield;
      if (dm.shieldBonus) mods.maxShieldBonus += dm.shieldBonus;
    }

    mods.guardRegenMult = 1.0;
    mods.ultChargeMult = 1.0;
    mods.ultDamageBonus = 1.0;
    mods.ultDurationBonus = 0;
    mods.dropHealMult = 1.0;
    mods.shieldCounter = false;
    mods.shieldToUlt = false;
    mods.autoForgeBonus = 0;
    mods.killGuardBonus = 0;
    mods.synergyTactical = false;
    mods.synergyAssault4 = false;
    mods.synergyMobility4 = false;
    mods.synergyVanguard4 = false;
    mods.synergyTactical4 = false;
    mods.crossHyperBarrage = false;
    mods.crossAegisConverter = false;

    const tagCounts = { assault: 0, mobility: 0, vanguard: 0, tactical: 0 };
    for (let i = 0; i < runCards.length; i++) {
      const card = runCards[i];
      if (tagCounts[card.tag] !== undefined) tagCounts[card.tag]++;
      switch (card.id) {
        case 'tungsten_core': mods.damageMult *= 1.18; break;
        case 'overclock_mag': mods.reloadSpeedMult *= 1.3; mods.fireRateMult *= 1.12; break;
        case 'precision_refund': mods.headshotBonus += 0.4; mods.killAmmoRefund += 3; break;
        case 'thruster_tune': mods.moveSpeedMult *= 1.12; mods.dashCooldownMult *= 0.75; break;
        case 'slide_reload': mods.slideReload = true; break;
        case 'aerial_gunner': mods.airDamageBonus += 0.28; break;
        case 'siphon_boost': mods.maxShieldBonus += 25; mods.guardMax += 40; mods.guardRegenMult += 0.30; break;
        case 'beacon_resonance': mods.zoneRegenHp += 7; mods.zoneDamageBonus += 0.2; break;
        case 'reactive_armor': mods.reactiveArmor = true; break;
        case 'repulsor_slam': mods.repulsorSlam = true; break;
        case 'mark_contagion': mods.markContagion = true; break;
        case 'thermal_nova': mods.thermalNova = true; break;
        case 'slide_overclock': mods.slideOverclock = true; break;
        case 'armor_piercer':
          mods.damageMult *= 1.14;
          mods.headshotBonus += 0.35;
          mods.armorPiercer = true;
          break;
        case 'aegis_capacitor':
          mods.maxHealthBonus += 30;
          mods.maxShieldBonus += 30;
          mods.shieldRegenMult *= 1.35;
          break;
        case 'kinetic_momentum':
          mods.killGuardBonus += 10;
          mods.moveSpeedMult *= 1.10;
          mods.dashCooldownMult *= 0.85;
          mods.killShieldBonus += 10;
          mods.killAmmoRefund += 2;
          break;
        case 'orbital_overload':
          mods.fireRateMult *= 1.16;
          mods.orbitalOverload = true;
          break;
        case 'shield_counter':
          mods.shieldCounter = true;
          mods.guardMax += 35;
          break;
        case 'field_medic':
          mods.dropHealMult += 0.55;
          mods.guardRegenMult += 0.35;
          break;
        case 'ult_accelerator':
          mods.ultChargeMult += 0.40;
          break;
        case 'ult_overdrive':
          mods.ultDamageBonus += 0.45;
          mods.ultDurationBonus += 2.0;
          break;
        case 'auto_forge':
          mods.autoForgeBonus += 0.12;
          mods.reloadSpeedMult += 0.18;
          break;
        case 'scavenger_protocol':
          mods.salvageGoldMult += 0.30;
          mods.dropHealMult += 0.25;
          mods.ultChargeMult += 0.15;
          break;
        case 'shield_to_ult':
          mods.shieldToUlt = true;
          break;
      }
    }

    mods.synergyAssault = tagCounts.assault >= 2;
    mods.synergyMobility = tagCounts.mobility >= 2;
    mods.synergyVanguard = tagCounts.vanguard >= 2;
    mods.synergyTactical = tagCounts.tactical >= 2;
    if (mods.synergyVanguard) {
      mods.guardMax = Math.round(mods.guardMax * 1.40);
      mods.guardRegenMult += 0.30;
    }
    if (mods.synergyTactical) {
      mods.ultChargeMult += 0.30;
      mods.dropHealMult += 0.25;
    }
    if (tagCounts.assault >= 4) { mods.synergyAssault4 = true; mods.damageMult *= 1.25; }
    if (tagCounts.mobility >= 4) { mods.synergyMobility4 = true; mods.moveSpeedMult *= 1.18; mods.dashCooldownMult *= 0.70; }
    if (tagCounts.vanguard >= 4) { mods.synergyVanguard4 = true; }
    if (tagCounts.tactical >= 4) { mods.synergyTactical4 = true; }
    if (tagCounts.assault >= 2 && tagCounts.mobility >= 2) { mods.crossHyperBarrage = true; }
    if (tagCounts.vanguard >= 2 && tagCounts.tactical >= 2) {
      mods.crossAegisConverter = true;
      mods.guardCostMult = Math.max(0.25, mods.guardCostMult * 0.75);
    }
    return { mods, tagCounts };
  }

  function getActiveSynergiesList() {
    const { mods } = computePlayerMods();
    const list = [];
    if (mods.synergyAssault) list.push(SYNERGIES.assault);
    if (mods.synergyMobility) list.push(SYNERGIES.mobility);
    if (mods.synergyVanguard) list.push(SYNERGIES.vanguard);
    return list;
  }

  function renderArmoryUI() {
    if (titleGoldBadge) titleGoldBadge.textContent = `${metaState.gold} G`;
    if (armoryGoldAmount) armoryGoldAmount.textContent = `${metaState.gold} G`;
    const eqFrame = getEquippedFrame();
    const unitBadge = byId('title-unit-badge');
    if (unitBadge) unitBadge.textContent = eqFrame.name;
    const pauseKicker = byId('pause-unit-kicker');
    if (pauseKicker) pauseKicker.textContent = `${eqFrame.name} 전술 터미널`;

    if (armoryGrid) {
      armoryGrid.innerHTML = '';
      const ARMORY_ICONS = {
        firepower: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="7"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>',
        hull: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l7 4v6c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6l7-4z"/></svg>',
        shield: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 3v18M3 12h18"/></svg>',
        thruster: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h8l-1 8 11-12h-8l0-8z"/></svg>',
        reload: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>',
        crit: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>',
        siphon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>',
        salvage: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8"/><path d="M12 8v8M9.5 10.5c0-1 1-1.5 2.5-1.5s2.5.6 2.5 1.5-1 1.5-2.5 1.5-2.5.6-2.5 1.5 1 1.5 2.5 1.5 2.5-.5 2.5-1.5"/></svg>',
      };

      for (let i = 0; i < META_UPGRADES.length; i++) {
        const upg = META_UPGRADES[i];
        const lv = metaState.levels[upg.id] || 0;
        const isMax = lv >= upg.maxLevel;
        const cost = upg.baseCost + lv * upg.costStep;
        const ico = ARMORY_ICONS[upg.id] || ARMORY_ICONS.hull;
        let pipsHtml = '';
        for (let p = 0; p < upg.maxLevel; p++) {
          pipsHtml += `<span class="armory-pip ${p < lv ? 'filled' : ''}"></span>`;
        }
        const curBonusText = typeof upg.formatBonus === 'function' ? upg.formatBonus(lv) : `LV ${lv}`;

        const card = document.createElement('div');
        card.className = 'armory-item';
        card.innerHTML = `
          <div class="armory-item-head">
            <div class="armory-item-title-wrap">
              <span class="armory-ico-badge" aria-hidden="true">${ico}</span>
              <span class="armory-item-name">${upg.name}</span>
            </div>
            <span class="armory-item-lv">LV ${lv} / ${upg.maxLevel}</span>
          </div>
          <div class="armory-pips" aria-hidden="true">${pipsHtml}</div>
          <div class="armory-cur-bonus">현재 적용: ${curBonusText}</div>
          <p class="armory-item-desc">${upg.desc}</p>
          <button class="mil-btn armory-buy-btn" type="button" ${isMax || metaState.gold < cost ? 'disabled' : ''}>
            ${isMax ? '최대 강화 완료' : `강화 (${cost} G)`}
          </button>
        `;
        const btn = card.querySelector('button');
        if (btn && !isMax) {
          btn.addEventListener('click', () => {
            if (metaState.gold < cost || (metaState.levels[upg.id] || 0) >= upg.maxLevel) return;
            metaState.gold -= cost;
            metaState.levels[upg.id] = (metaState.levels[upg.id] || 0) + 1;
            saveMetaState();
            renderArmoryUI();
          });
        }
        armoryGrid.appendChild(card);
      }
    }

    // Render Pilot Frame Shop Grid (4 Real Robot Concept Art Portraits)
    const framesGrid = byId('frames-shop-grid');
    if (framesGrid) {
      framesGrid.innerHTML = '';
      for (let i = 0; i < PILOT_FRAMES.length; i++) {
        const f = PILOT_FRAMES[i];
        const owned = metaState.ownedFrames.includes(f.id);
        const equipped = metaState.equippedFrame === f.id;
        const canBuy = !owned && metaState.gold >= f.cost;
        const artSrc = (PILOT_FRAME_ART && PILOT_FRAME_ART[f.id]) || '';
        const hpVal = 100 + (f.hpBonus || 0);
        const shVal = 100 + (f.shieldBonus || 0);
        const spdPct = Math.round((f.speedMult || 1.0) * 100);

        const card = document.createElement('article');
        card.className = `frame-showcase-card ${equipped ? 'equipped' : ''}`;
        card.style.setProperty('--frame-accent', f.color);
        card.innerHTML = `
          <div class="frame-portrait-wrap">
            <img class="frame-portrait-img" src="${artSrc}" alt="${f.name} 기체 일러스트" />
            <div class="frame-portrait-scrim"></div>
            <span class="frame-tier-pill">${f.tier}</span>
          </div>
          <div class="frame-card-body">
            <h3 class="frame-card-name" style="color:${f.color}">${f.name}</h3>
            <div class="frame-stat-chips">
              <div class="frame-stat-chip"><span>HP</span>${hpVal}</div>
              <div class="frame-stat-chip"><span>SHIELD</span>${shVal}</div>
              <div class="frame-stat-chip"><span>DASH</span>${f.dashMax}회</div>
              <div class="frame-stat-chip"><span>SPEED</span>${spdPct}%</div>
            </div>
            <div class="frame-special-box">
              <strong>특수능력 · ${f.specialName}</strong>
              ${f.specialDesc}<br><span class="frame-ult-note">★ 궁극기: ${f.ultName || ''} — ${f.ultDesc || ''}</span>
            </div>
            <button class="mil-btn armory-buy-btn" type="button" ${!owned && !canBuy ? 'disabled' : ''}>
              ${equipped ? '현재 장착 중' : owned ? '기체 장착' : `구매 (${f.cost} G)`}
            </button>
          </div>
        `;
        const btn = card.querySelector('button');
        if (btn && !equipped) {
          btn.addEventListener('click', () => {
            if (owned) {
              metaState.equippedFrame = f.id;
              saveMetaState();
              renderArmoryUI();
            } else if (metaState.gold >= f.cost) {
              metaState.gold -= f.cost;
              metaState.ownedFrames.push(f.id);
              metaState.equippedFrame = f.id;
              saveMetaState();
              renderArmoryUI();
            }
          });
        }
        framesGrid.appendChild(card);
      }
    }
  }

  // Wire Mission Mode & Heat Contract buttons once
  for (const m of ['campaign', 'endless', 'daily']) {
    const btn = byId(`mode-${m}`);
    if (btn) {
      btn.addEventListener('click', () => {
        selectedMissionMode = m;
        updateMissionConfigUI();
      });
    }
  }
  const btnHeatCycle = byId('btn-heat-cycle');
  if (btnHeatCycle) {
    btnHeatCycle.addEventListener('click', () => {
      selectedHeatLevel = (selectedHeatLevel + 1) % HEAT_CONTRACTS.length;
      updateMissionConfigUI();
    });
  }
  updateMissionConfigUI();
  renderMedalsStrip();

  // Wire Armory 2-tab switcher (completely separated full-panel views)
  const tabStatsBtn = byId('tab-armory-stats');
  const tabFramesBtn = byId('tab-armory-frames');
  const viewStatsEl = byId('armory-view-stats');
  const viewFramesEl = byId('armory-view-frames');
  if (tabStatsBtn && tabFramesBtn && viewStatsEl && viewFramesEl) {
    tabStatsBtn.addEventListener('click', () => {
      tabStatsBtn.classList.add('active');
      tabFramesBtn.classList.remove('active');
      viewStatsEl.classList.remove('hidden');
      viewFramesEl.classList.add('hidden');
    });
    tabFramesBtn.addEventListener('click', () => {
      tabFramesBtn.classList.add('active');
      tabStatsBtn.classList.remove('active');
      viewFramesEl.classList.remove('hidden');
      viewStatsEl.classList.add('hidden');
      renderArmoryUI();
    });
  }

  function openUpgradeDraft(waveNum) {
    if (!upgradePanel || !upgradeCardsGrid || gameState !== 'playing') return;
    gameState = 'upgrading';
    hadPointerLock = false;
    document.body.classList.remove('playing-active');
    if (input) {
      input.exitPointerLock();
      input.resetAll();
    }
    if (touchOverlay) touchOverlay.setVisible(false);
    if (waveDirector) waveDirector.setDraftPaused(true);

    // Pick 3 distinct random cards (prefer unpicked cards first)
    const ownedIds = new Set(runCards.map((c) => c.id));
    let pool = TACTICAL_CARDS.filter((c) => !ownedIds.has(c.id));
    if (pool.length < 3) pool = TACTICAL_CARDS.slice();
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = pool[i];
      pool[i] = pool[j];
      pool[j] = tmp;
    }
    draftChoices = pool.slice(0, 3);

    const { tagCounts } = computePlayerMods();
    if (upgradeKicker) upgradeKicker.textContent = `WAVE ${String(waveNum).padStart(2, '0')} 클리어 // 전술 강화 선택`;
    upgradeCardsGrid.innerHTML = '';

    for (let i = 0; i < draftChoices.length; i++) {
      const card = draftChoices[i];
      const syn = SYNERGIES[card.tag];
      const nextCount = (tagCounts[card.tag] || 0) + 1;
      const willTrigger = nextCount === syn.threshold;
      const alreadyActive = (tagCounts[card.tag] || 0) >= syn.threshold;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = card.rare ? 'tactical-card rare-card' : 'tactical-card';
      btn.style.setProperty('--card-tag-color', card.rare ? '#fbbf24' : syn.color);
      const TAG_ICONS = {
        assault: '<svg class="tactical-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/></svg>',
        mobility: '<svg class="tactical-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h8l-1 8 11-12h-8l0-8z"/></svg>',
        vanguard: '<svg class="tactical-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l7 4v6c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6l7-4z"/></svg>',
        tactical: '<svg class="tactical-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
      };
      const tagIco = TAG_ICONS[card.tag] || TAG_ICONS.assault;
      const CARD_ART_MAP = {
        tungsten_core: "./assets/card-tungsten_core.webp",
        overclock_mag: "./assets/card-overclock_mag.webp",
        precision_refund: "./assets/card-precision_refund.webp",
        thruster_tune: "./assets/card-thruster_tune.webp",
        slide_reload: "./assets/card-slide_reload.webp",
        aerial_gunner: "./assets/card-aerial_gunner.webp",
        siphon_boost: "./assets/card-siphon_boost.webp",
        beacon_resonance: "./assets/card-beacon_resonance.webp",
        reactive_armor: "./assets/card-reactive_armor.webp",
        repulsor_slam: "./assets/card-repulsor_slam.webp",
        mark_contagion: "./assets/card-mark_contagion.webp",
        thermal_nova: "./assets/card-thermal_nova.webp",
        slide_overclock: "./assets/card-slide_overclock.webp",
        armor_piercer: "./assets/card-tungsten_core.webp",
        aegis_capacitor: "./assets/card-reactive_armor.webp",
        kinetic_momentum: "./assets/card-thruster_tune.webp",
        orbital_overload: "./assets/card-mark_contagion.webp",
        shield_counter: "./assets/card-shield_counter.webp",
        field_medic: "./assets/card-field_medic.webp",
        ult_accelerator: "./assets/card-ult_accelerator.webp",
        ult_overdrive: "./assets/card-ult_overdrive.webp",
        auto_forge: "./assets/card-auto_forge.webp",
        scavenger_protocol: "./assets/card-scavenger_protocol.webp",
        shield_to_ult: "./assets/card-shield_to_ult.webp",
      };
      const cardArtSrc = CARD_ART_MAP[card.id] || CARD_ART_MAP.tungsten_core;
      const cardArt = `<img class="tactical-card-img" loading="eager" decoding="sync" src="${cardArtSrc}" alt="${card.name} 일러스트" />`;
      btn.innerHTML = `
        <div class="tactical-card-top">
          <span class="tactical-tag-wrap">${tagIco}<span class="tactical-tag">${syn.tagLabel} (${nextCount}/${syn.threshold})</span></span>
          <span class="tactical-key">[${i + 1}]</span>
        </div>
        <div class="tactical-card-art" aria-hidden="true">${cardArt}</div>
        <div class="tactical-card-title">${card.rare ? '<span class="rare-pill">RARE</span> ' : ''}${card.name}</div>
        <div class="tactical-card-desc">${card.desc}</div>
        <div class="tactical-synergy-hint ${willTrigger || nextCount === 4 ? 'ready' : ''}">
          ${nextCount === 4 ? `<span class="syn-badge">MAX 4/4</span>[${syn.name}] 최종 강화 해금!` : willTrigger ? `<span class="syn-badge">SYNERGY 2/4</span>[${syn.name}] 활성!` : alreadyActive ? `시너지 활성 (${nextCount}/4) · 4장 달성 시 최종 강화` : `2장/4장 시너지 [${syn.name}]: ${syn.desc}`}
        </div>
      `;
      const pickIdx = i;
      btn.addEventListener('click', () => selectUpgradeCard(pickIdx));
      upgradeCardsGrid.appendChild(btn);
    }

    upgradePanel.classList.remove('hidden');
  }

  function selectUpgradeCard(idx) {
    if (gameState !== 'upgrading' || !draftChoices[idx]) return;
    const chosen = draftChoices[idx];
    runCards.push(chosen);
    draftChoices = [];

    const { mods } = computePlayerMods();
    if (playerController) {
      playerController.applyModifiers(mods, false);
    }
    if (upgradePanel) upgradePanel.classList.add('hidden');
    if (eventBus) {
      eventBus.emit(EVENTS.UPGRADE_SELECTED, { card: chosen });
      const synActive =
        (chosen.tag === 'assault' && mods.synergyAssault) ||
        (chosen.tag === 'mobility' && mods.synergyMobility) ||
        (chosen.tag === 'vanguard' && mods.synergyVanguard);
      if (synActive) eventBus.emit('SFX_SYNERGY', { tag: chosen.tag });
    }
    if (hudManager) {
      hudManager.showOnboardingTip(`전술 강화 적용: ${chosen.name}`, 3.0);
    }

    gameState = 'playing';
    document.body.classList.add('playing-active');
    if (waveDirector) waveDirector.setDraftPaused(false);
    syncTouchOverlayVisibility();
    if (input) {
      input.resetAll();
      if (!isTouchActive()) input.requestPointerLock();
    }
  }

  // ---------------------------------------------------------------------------
  // 2. Scene State Machine & Lazy Runtime Handles (0% WebGL on TITLE / RESULT)
  // ---------------------------------------------------------------------------
  /** @type {'title' | 'playing' | 'paused' | 'ending' | 'result'} */
  let gameState = 'title';
  let activeTitleSubpanel = 'main';
  let isTransitioning = false;
  let rafId = null;

  // Lazy-initialized 3D & Combat Subsystems (null until first DEPLOY click!)
  let runtimeReady = false;
  let eventBus = null;
  let soundEngine = null;
  let engine = null;
  let collisionWorld = null;
  let input = null;
  let playerController = null;
  let mapManager = null;
  let arenaData = null;
  let interactables = null;
  let vfxManager = null;
  let weaponSystem = null;
  let waveDirector = null;
  let hudManager = null;
  let touchOverlay = null;

  let hadPointerLock = false;
  let pauseDebounce = 0;
  let lastAdsFov = null;
  let zoneAmmoRefilled = false;
  let lastWeaponState = null;

  // 0.5s Slow-Mo Ending Linger State
  let endingTimer = 0;
  let endingIsVictory = false;
  let endingFadeStarted = false;

  // Match Telemetry
  const STYLE_TIERS = [
    { grade: 'D', min: 0, color: '#64748b', goldMult: 1.0, shieldMult: 1.0 },
    { grade: 'C', min: 20, color: '#0284c7', goldMult: 1.05, shieldMult: 1.05 },
    { grade: 'B', min: 40, color: '#10b981', goldMult: 1.10, shieldMult: 1.12 },
    { grade: 'A', min: 60, color: '#d97706', goldMult: 1.15, shieldMult: 1.20 },
    { grade: 'S', min: 78, color: '#ea580c', goldMult: 1.30, shieldMult: 1.35 },
    { grade: 'SSS', min: 92, color: '#dc2626', goldMult: 1.50, shieldMult: 1.50 },
  ];

  const telemetry = {
    shotsFired: 0,
    shotsHit: 0,
    shotSeq: 0,
    lastHitShotSeq: -1,
    maxCombo: 1,
    elapsedSec: 0,
    styleMeter: 0,
    styleTierIdx: 0,
    maxStyleTierIdx: 0,
    lastStyleCallout: 'STYLE',
    lastSwapTime: -99,
    wasGroundedPrev: true,
    airTimeAccum: 0,
    airKills: 0,
    slideKills: 0,
    swapKills: 0,
    meleeKills: 0,
    aegisEliteKills: 0,
    weaponKills: {},
  };

  function getStyleTier(meter) {
    let idx = 0;
    for (let i = STYLE_TIERS.length - 1; i >= 0; i--) {
      if (meter >= STYLE_TIERS[i].min) {
        idx = i;
        break;
      }
    }
    return idx;
  }

  let _lastStylePct = -1;
  let _lastStyleGrade = '';
  let _lastStyleCallout = '';
  function updateStyleHudUI() {
    const pct = Math.round(Math.max(0, Math.min(100, telemetry.styleMeter)));
    const tier = STYLE_TIERS[telemetry.styleTierIdx] || STYLE_TIERS[0];
    if (pct === _lastStylePct && tier.grade === _lastStyleGrade && telemetry.lastStyleCallout === _lastStyleCallout) {
      return;
    }
    const cardEl = byId('style-rank-card');
    const gradeEl = byId('style-grade');
    const barEl = byId('style-bar-fill');
    const callEl = byId('style-callout');
    if (tier.grade !== _lastStyleGrade) {
      _lastStyleGrade = tier.grade;
      if (cardEl) cardEl.style.setProperty('--style-color', tier.color);
      if (gradeEl) gradeEl.textContent = tier.grade;
    }
    if (pct !== _lastStylePct) {
      _lastStylePct = pct;
      if (barEl) barEl.style.width = `${pct}%`;
    }
    if (telemetry.lastStyleCallout !== _lastStyleCallout) {
      _lastStyleCallout = telemetry.lastStyleCallout;
      if (callEl) callEl.textContent = telemetry.lastStyleCallout;
    }
  }

  function addStylePoints(pts, label) {
    const prevTier = telemetry.styleTierIdx;
    telemetry.styleMeter = Math.min(100, telemetry.styleMeter + pts);
    telemetry.styleTierIdx = getStyleTier(telemetry.styleMeter);
    if (telemetry.styleTierIdx > prevTier && eventBus) {
      eventBus.emit('SFX_RANK_UP', { tier: telemetry.styleTierIdx });
    }
    if (telemetry.styleTierIdx > telemetry.maxStyleTierIdx) {
      telemetry.maxStyleTierIdx = telemetry.styleTierIdx;
    }
    if (telemetry.styleTierIdx >= 3) unlockAchievement('style_a');
    if (telemetry.styleTierIdx >= 4) unlockAchievement('style_s');
    if (telemetry.styleTierIdx >= 5) unlockAchievement('style_sss');
    if (label) telemetry.lastStyleCallout = label;
    updateStyleHudUI();
  }

  function resetTelemetry() {
    telemetry.shotsFired = 0;
    telemetry.shotsHit = 0;
    telemetry.shotSeq = 0;
    telemetry.lastHitShotSeq = -1;
    telemetry.maxCombo = 1;
    telemetry.elapsedSec = 0;
    telemetry.styleMeter = 0;
    telemetry.styleTierIdx = 0;
    telemetry.maxStyleTierIdx = 0;
    telemetry.lastStyleCallout = 'STYLE';
    telemetry.lastSwapTime = -99;
    telemetry.wasGroundedPrev = true;
    telemetry.airTimeAccum = 0;
    telemetry.airKills = 0;
    telemetry.slideKills = 0;
    telemetry.swapKills = 0;
    telemetry.meleeKills = 0;
    telemetry.aegisEliteKills = 0;
    telemetry.weaponKills = {};
    updateStyleHudUI();
  }

  // Zero-GC Frame Buffers
  const mergedTargets = [];
  const playerUpdateOpts = {
    adsFov: null,
    aimAssistTargets: null,
    allowAds: true,
  };
  const hudSnapshot = {
    player: null,
    weapon: null,
    crosshairSpread: 0.018,
    wave: null,
    boss: null,
    zone: null,
    enemies: null,
    pickups: null,
    fps: 60,
  };

  let lastTime = 0;
  let elapsedTime = 0;

  // ---------------------------------------------------------------------------
  // 3. Scene Fade Transition Guard (300ms Blackout, Double-Click Safe)
  // ---------------------------------------------------------------------------
  function runFadeTransition(onBlackout, onComplete = null) {
    if (isTransitioning) return false;
    isTransitioning = true;

    if (sceneFade) {
      sceneFade.classList.add('active');
    }

    window.setTimeout(() => {
      try {
        if (typeof onBlackout === 'function') {
          onBlackout();
        }
      } finally {
        window.requestAnimationFrame(() => {
          if (sceneFade) {
            sceneFade.classList.remove('active');
          }
          window.setTimeout(() => {
            isTransitioning = false;
            if (typeof onComplete === 'function') {
              onComplete();
            }
          }, FADE_DURATION_MS);
        });
      }
    }, FADE_DURATION_MS);

    return true;
  }

  // ---------------------------------------------------------------------------
  // 4. Audio Gesture Unlock & Lazy GPU Runtime Initialization
  // ---------------------------------------------------------------------------
  function unlockAudioOnGesture() {
    if (!eventBus) {
      eventBus = new EventBus();
    }
    if (!soundEngine) {
      soundEngine = new SoundEngine(eventBus, engine ? engine.camera : null);
      soundEngine.setMasterVolume(settings.volume / 100);
      soundEngine.setMusicEnabled(settings.music);
    }
    soundEngine.unlock();
  }

  function showWebGLFallback(reason) {
    stopLoop();
    gameState = 'title';
    document.body.classList.remove('playing-active', 'touch-active', 'force-touch');
    if (sceneTitle) sceneTitle.classList.add('hidden');
    if (scenePlaying) scenePlaying.classList.add('hidden');
    if (sceneResult) sceneResult.classList.add('hidden');
    if (fallbackEl) fallbackEl.classList.remove('hidden');
    if (fallbackMsg && reason) {
      fallbackMsg.textContent = `Unable to initialize WebGL 3D Renderer (${reason}). Please enable hardware acceleration and reload.`;
    }
  }

  /**
   * Construct Engine, MapManager, WaveDirector & all 3D subsystems lazily on first DEPLOY
   * inside the 300ms #scene-fade blackout so Title screen boots with 0% GPU cost.
   */
  function ensureRuntimeInitialized() {
    if (runtimeReady) return true;
    if (!canvas) {
      showWebGLFallback('canvas element unavailable');
      return false;
    }

    try {
      engine = new Engine(canvas, settings.quality);
    } catch (err) {
      showWebGLFallback(err && err.message ? err.message : 'context creation failed');
      return false;
    }

    if (!eventBus) {
      eventBus = new EventBus();
    }

    collisionWorld = new CollisionWorld();
    input = new InputManager(canvas);
    input.setSensitivity(settings.sensitivity);
    input.setControlMode(settings.controlMode);
    if (settings.controlMode === 'auto') {
      input.setTouchMode(isCoarsePointer());
    }

    playerController = new PlayerController(engine.camera, input, collisionWorld, eventBus);
    mapManager = new MapManager(engine.scene, collisionWorld, engine);
    arenaData = mapManager.loadMap(0);

    interactables = new Interactables(engine.scene, collisionWorld, eventBus, arenaData);
    vfxManager = new VfxManager(
      engine.scene,
      engine.viewmodelScene,
      engine.camera,
      engine.getQualityConfig()
    );

    weaponSystem = new WeaponSystem(
      engine.viewmodelScene,
      engine.scene,
      engine.camera,
      playerController,
      input,
      collisionWorld,
      vfxManager,
      eventBus
    );

    waveDirector = new WaveDirector(
      engine.scene,
      collisionWorld,
      eventBus,
      arenaData,
      vfxManager
    );

    if (!soundEngine) {
      soundEngine = new SoundEngine(eventBus, engine.camera);
    } else {
      soundEngine.camera = engine.camera;
    }
    soundEngine.setMasterVolume(settings.volume / 100);
    soundEngine.setMusicEnabled(settings.music);

    hudManager = new HudManager(eventBus, engine.camera);
    touchOverlay = new TouchOverlay(input, weaponSystem, () => {
      if (gameState === 'playing') {
        pauseGame();
      }
    });

    // Cross-subsystem hooks
    waveDirector.setSoundEngine(soundEngine);
    waveDirector.setInteractables(interactables);
    hudManager.setArenaData(arenaData, collisionWorld);
    hudManager.setWeaponSwitchHandler((slotIndex) => {
      if (gameState === 'playing' && !isTransitioning) {
        weaponSystem.switchLoadoutSlot(slotIndex);
      }
    });

    // Zero-stutter prewarm inside blackout: 23 pooled Enemy rigs + shadows + shader compilation
    waveDirector.prewarm();
    engine.bakeStaticShadows();
    engine.prewarmShaders();

    // EventBus combat & campaign wiring
    bindRuntimeEvents();

    // PC canvas click re-locks pointer & unlocks Web Audio cleanly
    canvas.addEventListener('pointerdown', () => {
      unlockAudioOnGesture();
      if (gameState === 'playing' && !isTransitioning && !isTouchActive() && !input.isPointerLocked()) {
        input.requestPointerLock();
      }
    });

    runtimeReady = true;
    return true;
  }

  function bindRuntimeEvents() {
    eventBus.on(EVENTS.WEAPON_SWITCHED, () => {
      telemetry.lastSwapTime = telemetry.elapsedSec;
    });

    // VANGUARD-09 Special: Tactical Reload grants 2.5s rapid fire & stability
    eventBus.on(EVENTS.WEAPON_RELOADED, () => {
      if (playerController && playerController.mods && playerController.mods.thermalNova && waveDirector) {
        const pPos = playerController.position;
        const look = playerController.getLookDirection();
        const activeE = waveDirector.getActiveEnemies ? waveDirector.getActiveEnemies() : [];
        for (let ei = 0; ei < activeE.length; ei++) {
          const e = activeE[ei];
          if (!e || !e.isAlive) continue;
          if (e.position.distanceTo(pPos) <= 9.0) {
            e.applyDamage(75, e.center || e.position, false, look, { isExplosion: true, knockback: 10 });
          }
        }
        if (vfxManager) vfxManager.spawnExplosion(pPos, 4.8, 0xf97316);
      }
      if (playerController && playerController.mods && playerController.mods.tacticalReload) {
        playerController.reloadBuffTimer = 2.5;
        if (hudManager && typeof hudManager.showAnnouncement === 'function') {
          hudManager.showAnnouncement('전술 리로드 집중', '2.5초 연사 속도 +25% · 반동 안정화', 'info');
        }
      }
    });

    // Tutorial event listeners
    eventBus.on(EVENTS.PLAYER_JUMPPAD, () => {
      if (tutorialState.active && tutorialState.step === 1) {
        tutorialState.didJumpPad = true;
        updateTutorialBannerUI();
      }
    });
    eventBus.on(EVENTS.BARREL_EXPLODED, () => {
      if (tutorialState.active && tutorialState.step === 1) {
        tutorialState.didBarrel = true;
        updateTutorialBannerUI();
      }
    });
    eventBus.on(EVENTS.PICKUP_COLLECTED, () => {
      if (tutorialState.active && tutorialState.step === 3) {
        tutorialState.pickedItem = true;
        updateTutorialBannerUI();
      }
    });
    eventBus.on(EVENTS.UPGRADE_SELECTED, () => {
      if (tutorialState.active && tutorialState.step === 6) {
        finishTutorial(true);
      }
    });

    // STRIDER-04 Special: Phase-Blink VFX on dash
    eventBus.on(EVENTS.PLAYER_DASH, () => {
      if (tutorialState.active && tutorialState.step === 1) {
        tutorialState.didDash = true;
        updateTutorialBannerUI();
      }
      if (playerController && playerController.mods && playerController.mods.phaseBlink && vfxManager) {
        vfxManager.spawnExplosion(playerController.position, 2.2, 0x00f0ff);
      }
    });

    // APEX-ZERO Special: Headshot Chain-Lightning Arc (7m radius, 50 dmg) + Ultimate Charge on hit
    eventBus.on(EVENTS.DAMAGE_DEALT, (p) => {
      if (!playerController || !p || !p.isEnemy) return;
      playerController.addUltCharge(p.isHeadshot ? 0.9 : 0.35);
      // Tactile Gunfeel: Micro-FOV punch & micro-hitstop on headshots / heavy hits
      if (p.isHeadshot || p.killed) {
        playerController.currentFov = Math.max(52, playerController.currentFov - (p.killed ? 2.4 : 1.3));
        playerController.addScreenShake(p.killed ? 0.14 : 0.07);
      }
      if (p.killed && (p.isHeadshot || p.weaponId === 'railgun' || p.weaponId === 'scattergun' || p.weaponId === 'repulsor')) {
        _hitstopTimer = Math.max(_hitstopTimer, p.weaponId === 'railgun' ? 0.036 : 0.024);
      }
      if (p.isHeadshot && playerController.mods && playerController.mods.chainLightning && waveDirector && p.point) {
        const activeEnemies = waveDirector.getActiveEnemies ? waveDirector.getActiveEnemies() : [];
        let arcs = 0;
        for (let ei = 0; ei < activeEnemies.length && arcs < 3; ei++) {
          const e = activeEnemies[ei];
          if (!e || !e.isAlive || e.id === p.targetId) continue;
          const ePos = e.center || e.position;
          if (ePos.distanceTo(p.point) <= 7.0) {
            const dir = ePos.clone().sub(p.point).normalize();
            e.applyDamage(50, ePos, false, dir, { isExplosion: true, knockback: 4 });
            if (vfxManager && typeof vfxManager.spawnTracer === 'function') {
              vfxManager.spawnTracer(p.point, ePos, 0xff2a44, 0.045, true);
            }
            arcs++;
          }
        }
      }
    });

    // Front Energy Shield [E] Blocked VFX & Break Callout
    eventBus.on(EVENTS.GUARD_BLOCKED, (p) => {
      if (vfxManager && playerController) {
        const eye = playerController.getEyePosition();
        const dir = playerController.getLookDirection();
        const sparkPos = eye.clone().addScaledVector(dir, 1.1);
        const col = playerController.mods && playerController.mods.frameId === 'bastion' ? 0x22c55e : 0x38bdf8;
        vfxManager.spawnExplosion(sparkPos, p && p.guardBroken ? 2.4 : 1.0, col);
      }
      if (playerController && playerController.mods) {
        const gm = playerController.mods;
        if (gm.shieldToUlt && p && p.amount > 0) {
          playerController.addUltCharge(p.amount * 0.60);
        }
        if (gm.crossAegisConverter) {
          playerController.addUltCharge(4.0);
        }
        if (gm.shieldCounter && waveDirector) {
          const pPos = playerController.position;
          const look = playerController.getLookDirection();
          const activeE = waveDirector.getActiveEnemies ? waveDirector.getActiveEnemies() : [];
          for (let ei = 0; ei < activeE.length; ei++) {
            const e = activeE[ei];
            if (!e || !e.isAlive) continue;
            if (e.position.distanceTo(pPos) <= 9.0) {
              e.applyDamage(45, e.center || e.position, false, look, { isExplosion: true, knockback: 12 });
            }
          }
          spawnUltShockRing(pPos, 9.0, 0x38bdf8, 0.45);
        }
        if (p && p.guardBroken && gm.synergyVanguard4 && waveDirector) {
          const pPos = playerController.position;
          const activeE = waveDirector.getActiveEnemies ? waveDirector.getActiveEnemies() : [];
          for (let ei = 0; ei < activeE.length; ei++) {
            const e = activeE[ei];
            if (!e || !e.isAlive) continue;
            if (e.position.distanceTo(pPos) <= 10.0) {
              const dir = e.position.clone().sub(pPos).normalize();
              e.applyDamage(110, e.center || e.position, false, dir, { isExplosion: true, knockback: 18 });
            }
          }
          spawnUltShockRing(pPos, 10.5, 0x38bdf8, 0.65);
        }
      }
      if (p && p.guardBroken && hudManager && typeof hudManager.showAnnouncement === 'function') {
        hudManager.showAnnouncement('에너지 방패 파괴!', '2초 후 재충전 시작', 'danger');
      }
    });

    eventBus.on(EVENTS.ENEMY_KILLED, (p) => {
      if (!playerController) return;
      if (tutorialState.active && tutorialState.step === 2) {
        tutorialState.killsInStep++;
        updateTutorialBannerUI();
        if (tutorialState.killsInStep >= 2) {
          advanceTutorialStep(3);
        }
      }
      const tier = STYLE_TIERS[telemetry.styleTierIdx] || STYLE_TIERS[0];
      playerController.onEnemyKill(Boolean(p && p.isHeadshot));
      // Item 8: No HP or Shield recovery on kill
      if (p && p.combo > telemetry.maxCombo) {
        telemetry.maxCombo = p.combo;
      }
      if (playerController.mods && playerController.mods.killGuardBonus > 0 && playerController.guardBreakTimer <= 0) {
        playerController.guardEnergy = Math.min(playerController.maxGuardEnergy, playerController.guardEnergy + playerController.mods.killGuardBonus);
      }
      // APEX-ZERO Special: Kill instantly restores 1 dash + 2.5s Overdrive (infinite ammo + 30% RPM)
      if (playerController.mods && playerController.mods.apexOverdrive) {
        const maxD = playerController.mods.dashMax || 3;
        playerController.dashCharges = Math.min(maxD, (playerController.dashCharges || 0) + 1);
        playerController.dashOverdriveTimer = Math.max(playerController.dashOverdriveTimer || 0, 3.0);
      }

      // Track style points & combat highlight categories
      let pts = 12;
      let tag = '적 격파';
      const isAir = !playerController.isGrounded;
      const isSlide = Boolean(playerController.isSliding);
      const isQuickSwap = telemetry.elapsedSec - telemetry.lastSwapTime <= 2.5;
      const isHs = Boolean(p && p.isHeadshot);
      const isMelee = Boolean(p && p.isMelee);

      metaState.totalKillsAllTime = (metaState.totalKillsAllTime || 0) + 1;
      if (metaState.totalKillsAllTime >= 1) unlockAchievement('first_blood');
      if (metaState.totalKillsAllTime >= 50) unlockAchievement('kills_50');
      if (metaState.totalKillsAllTime >= 200) unlockAchievement('kills_200');
      if (telemetry.maxCombo >= 5) unlockAchievement('combo_5');
      if (waveDirector && waveDirector.headshots >= 15) unlockAchievement('hs_15');
      if (p && p.isBoss) {
        _hitstopTimer = Math.max(_hitstopTimer, 0.065);
        playerController.addScreenShake(0.45);
      }
      if (p && p.archetypeId === 'cyber_mech_boss') unlockAchievement('first_clear');
      if (
        p &&
        (p.archetypeId === 'interceptor_drone' ||
          p.archetypeId === 'shock_breacher' ||
          p.archetypeId === 'rail_warden' ||
          p.archetypeId === 'mortar_artillery' ||
          p.archetypeId === 'vanguard_assassin')
      ) {
        telemetry.aegisEliteKills++;
        if (telemetry.aegisEliteKills >= 10) unlockAchievement('elite_slayer');
      }

      if (isMelee) { pts += 18; tag = '근접 처치!'; telemetry.meleeKills++; if (telemetry.meleeKills >= 5) unlockAchievement('melee_ace'); }
      else if (isAir) { pts += 18; tag = '공중 처치!'; telemetry.airKills++; if (telemetry.airKills >= 5) unlockAchievement('air_ace'); }
      else if (isSlide) { pts += 16; tag = '슬라이드 킬!'; telemetry.slideKills++; if (telemetry.slideKills >= 5) unlockAchievement('slide_ace'); }
      else if (isQuickSwap) { pts += 14; tag = '무기 전환 킬!'; telemetry.swapKills++; if (telemetry.swapKills >= 5) unlockAchievement('swap_ace'); }
      else if (isHs) { pts += 12; tag = '정밀 헤드샷!'; }
      if (isHs && tag !== '정밀 헤드샷!') pts += 8;
      addStylePoints(pts, tag);

      // Track weapon kill count for debrief summary
      const activeW = weaponSystem && weaponSystem.getActiveWeapon ? weaponSystem.getActiveWeapon() : null;
      if (activeW && activeW.shortName) {
        telemetry.weaponKills[activeW.shortName] = (telemetry.weaponKills[activeW.shortName] || 0) + 1;
      }

      // Elite Variant Death Effects & Golden Supply Drone Jackpot
      const killedUnit = p && p.enemy;
      if (killedUnit && killedUnit.eliteAffix) {
        if (killedUnit.eliteAffix === 'supply_drone') {
          if (interactables) {
            interactables.spawnGoldDrop(killedUnit.position, 45);
            const dropPool = [1, 2, 3, 5, 6];
            interactables.spawnWeaponDrop(killedUnit.position, dropPool[Math.floor(Math.random() * dropPool.length)]);
          }
          addStylePoints(28, '보급 드론 격추!');
          unlockAchievement('drone_hunter');
        } else if (killedUnit.eliteAffix === 'overcharged' && waveDirector) {
          // Overcharged elite explodes on death, damaging nearby enemies too!
          if (vfxManager) vfxManager.spawnExplosion(killedUnit.position, 6.2, 0xef4444);
          const nearList = waveDirector.getActiveEnemies ? waveDirector.getActiveEnemies() : [];
          for (let ei = 0; ei < nearList.length; ei++) {
            const e = nearList[ei];
            if (!e || !e.isAlive || e === killedUnit) continue;
            if (e.position.distanceTo(killedUnit.position) <= 6.5) {
              e.applyDamage(45, e.center || e.position, false, null, { isExplosion: true });
            }
          }
          if (playerController && playerController.position.distanceTo(killedUnit.position) <= 5.5) {
            playerController.applyDamage(18, killedUnit.position);
          }
        } else if (killedUnit.eliteAffix === 'splitter' && interactables) {
          interactables.spawnGoldDrop(killedUnit.position, 15);
          if (vfxManager) vfxManager.spawnExplosion(killedUnit.position, 3.2, 0xf59e0b);
        }
      }

      // Rare Card: Orbital Overload (Headshot kill triggers 7.5m arc shockwave dealing 65 damage)
      const mods = playerController.mods;
      const deadEnemy = p && p.enemy;
      if (isHs && mods && mods.orbitalOverload && deadEnemy && waveDirector) {
        const originPos = deadEnemy.center || deadEnemy.position;
        if (vfxManager) vfxManager.spawnExplosion(originPos, 5.2, 0x38bdf8);
        const nearList = waveDirector.getActiveEnemies ? waveDirector.getActiveEnemies() : [];
        for (let ei = 0; ei < nearList.length; ei++) {
          const e = nearList[ei];
          if (!e || !e.isAlive || e === deadEnemy) continue;
          if (e.position.distanceTo(deadEnemy.position) <= 7.5) {
            e.applyDamage(65, e.center || e.position, false, null, { isExplosion: true, piercing: true });
          }
        }
        addStylePoints(14, '궤도 과부하!');
      }

      // Rare Card: Mark Contagion (jump T-4 mark to 2 nearest enemies within 10m)
      if (mods && mods.markContagion && deadEnemy && deadEnemy.markedTimer > 0 && waveDirector) {
        const activeEnemies = waveDirector.getActiveEnemies ? waveDirector.getActiveEnemies() : [];
        const nearby = [];
        for (let ei = 0; ei < activeEnemies.length; ei++) {
          const e = activeEnemies[ei];
          if (!e || !e.isAlive || e === deadEnemy) continue;
          const dist = e.position.distanceTo(deadEnemy.position);
          if (dist <= 10.0) nearby.push({ e, dist });
        }
        nearby.sort((a, b) => a.dist - b.dist);
        for (let ni = 0; ni < Math.min(2, nearby.length); ni++) {
          nearby[ni].e.markedTimer = 4.0;
          nearby[ni].e.applyDamage(20, nearby[ni].e.center || nearby[ni].e.position, false, null, { isExplosion: false });
        }
      }
    });

    eventBus.on(EVENTS.BARREL_EXPLODED, (p) => {
      if (p && (p.gimmickType === 'emp_pylon' || p.gimmickType === 'shield_relay')) {
        unlockAchievement('emp_tactician');
        addStylePoints(18, p.gimmickType === 'emp_pylon' ? 'EMP 과부하!' : '중계기 파괴!');
      }
      if (vfxManager && p && p.position) {
        const vfxHex = p.gimmickType === 'emp_pylon' ? 0xf59e0b : p.gimmickType === 'shield_relay' ? 0x38bdf8 : 0xff6a00;
        vfxManager.spawnExplosion(p.position, p.radius, vfxHex);
      }
    });

    eventBus.on(EVENTS.WEAPON_FIRED, () => {
      if (gameState !== 'playing') return;
      telemetry.shotsFired++;
      telemetry.shotSeq++;
    });

    eventBus.on(EVENTS.DAMAGE_DEALT, (p) => {
      if (gameState !== 'playing' || !p) return;
      if (!p.isMelee && p.isEnemy && telemetry.lastHitShotSeq !== telemetry.shotSeq) {
        telemetry.lastHitShotSeq = telemetry.shotSeq;
        telemetry.shotsHit++;
      }
      // Card: Armor Piercer (+22% bonus piercing damage against shielded / boss foes)
      if (
        p.isEnemy &&
        p.amount > 0 &&
        !p.killed &&
        playerController &&
        playerController.mods &&
        playerController.mods.armorPiercer &&
        waveDirector
      ) {
        const list = waveDirector.getActiveEnemies ? waveDirector.getActiveEnemies() : [];
        for (let i = 0; i < list.length; i++) {
          const e = list[i];
          if (e && e.id === p.targetId && e.isAlive) {
            if (e.archetype && (e.archetype.hasShield || e.archetype.isBoss)) {
              const bonus = Math.max(2, Math.round(p.amount * 0.22));
              e.applyDamage(bonus, p.point || e.center, false, null, { piercing: true });
            }
            break;
          }
        }
      }
    });

    eventBus.on(EVENTS.PLAYER_DAMAGED, (p) => {
      if (gameState === 'playing' && p && (p.healthDamage > 0 || p.shieldDamage > 0)) {
        telemetry.styleMeter = Math.max(0, telemetry.styleMeter - 20);
        telemetry.styleTierIdx = getStyleTier(telemetry.styleMeter);
        updateStyleHudUI();
      }
      if (gameState === 'playing' && p && p.isFatal) {
        beginEndingSequence(false);
      }
    });

    eventBus.on(EVENTS.GOLD_COLLECTED, (p) => {
      if (!p || !p.amount) return;
      const styleTier = STYLE_TIERS[telemetry.styleTierIdx] || STYLE_TIERS[0];
      const heat = HEAT_CONTRACTS[selectedHeatLevel] || HEAT_CONTRACTS[0];
      const salvageMult = 1.0 + ((metaState.levels && metaState.levels.salvage) || 0) * 0.08;
      metaState.gold += Math.max(1, Math.round(p.amount * styleTier.goldMult * heat.goldMult * salvageMult));
      saveMetaState();
      if (titleGoldBadge) titleGoldBadge.textContent = `${metaState.gold} G`;
    });

    eventBus.on(EVENTS.WAVE_CLEARED, (p) => {
      if (gameState === 'playing' && p && !p.isFinalWave) {
        window.setTimeout(() => {
          if (gameState === 'playing') openUpgradeDraft(p.wave || 1);
        }, 550);
      }
    });

    eventBus.on(EVENTS.WAVE_STARTED, () => {
      zoneAmmoRefilled = false;
    });

    eventBus.on(EVENTS.ZONE_PROGRESS, (p) => {
      if (gameState !== 'playing' || !p) return;
      if (p.captured && !zoneAmmoRefilled) {
        zoneAmmoRefilled = true;
        weaponSystem.addAmmo(1.0);
      } else if (!p.active || p.progress < 0.05) {
        zoneAmmoRefilled = false;
      }
    });

    eventBus.on(EVENTS.MAP_TRANSITION, (p) => {
      if (gameState !== 'playing' || !p) return;
      handleMapTransition(p.nextMapIndex);
    });

    eventBus.on(EVENTS.GAME_STATE, (p) => {
      const next = typeof p === 'string' ? p : p && p.state;
      if (next === 'victory' && gameState === 'playing') {
        beginEndingSequence(true);
      } else if (next === 'gameover' && gameState === 'playing') {
        beginEndingSequence(false);
      }
    });
  }

  // ---------------------------------------------------------------------------
  // 5. Title Sub-Panels, Badges & Bi-Directional Settings Sync
  // ---------------------------------------------------------------------------
  function showTitleSubpanel(panelName) {
    activeTitleSubpanel = panelName;
    if (sceneTitle) sceneTitle.classList.toggle('subpanel-open', panelName !== 'main');
    if (panelName === 'armory') renderArmoryUI();
    if (panelName === 'arsenal') renderArsenalPreviews();
    if (panelName === 'achievements') renderMedalsStrip();
    if (titleMenuMain) titleMenuMain.classList.toggle('hidden', panelName !== 'main');
    if (panelArmory) panelArmory.classList.toggle('hidden', panelName !== 'armory');
    if (panelArsenal) panelArsenal.classList.toggle('hidden', panelName !== 'arsenal');
    if (panelControls) panelControls.classList.toggle('hidden', panelName !== 'controls');
    if (panelSettings) panelSettings.classList.toggle('hidden', panelName !== 'settings');
    if (panelAchievements) panelAchievements.classList.toggle('hidden', panelName !== 'achievements');
    if (btnTitleArmory) btnTitleArmory.classList.toggle('active-nav', panelName === 'armory');
    if (btnTitleArsenal) btnTitleArsenal.classList.toggle('active-nav', panelName === 'arsenal');
    if (btnTitleControls) btnTitleControls.classList.toggle('active-nav', panelName === 'controls');
    if (btnTitleSettings) btnTitleSettings.classList.toggle('active-nav', panelName === 'settings');
    if (btnTitleAchievements) btnTitleAchievements.classList.toggle('active-nav', panelName === 'achievements');
  }
  const brandHomeBtn = byId('btn-brand-home');
  if (brandHomeBtn) brandHomeBtn.addEventListener('click', () => showTitleSubpanel('main'));

  function updateDeviceBadge() {
    const coarse = isCoarsePointer();
    if (titleDeviceBadge) {
      if (settings.controlMode === 'pc') {
        titleDeviceBadge.textContent = 'INPUT: PC // MOUSE+KB';
      } else if (settings.controlMode === 'touch') {
        titleDeviceBadge.textContent = 'INPUT: TOUCH // MANUAL';
      } else {
        titleDeviceBadge.textContent = coarse
          ? 'INPUT: AUTO // TOUCH'
          : 'INPUT: AUTO // PC';
      }
    }
    if (runtimeReady && input && settings.controlMode === 'auto') {
      input.setTouchMode(coarse);
    }
    syncTouchOverlayVisibility();
  }

  function applyControlMode(mode) {
    const key = mode === 'pc' || mode === 'touch' ? mode : 'auto';
    settings.controlMode = key;

    if (titleSelControls && titleSelControls.value !== key) titleSelControls.value = key;
    if (pauseSelControls && pauseSelControls.value !== key) pauseSelControls.value = key;

    if (typeof document !== 'undefined' && document.body) {
      document.body.classList.toggle('force-touch', key === 'touch');
    }

    if (runtimeReady && input) {
      input.setControlMode(key);
      if (key === 'auto') {
        input.setTouchMode(isCoarsePointer());
      } else if (key === 'touch') {
        input.exitPointerLock();
      }
    }

    updateDeviceBadge();
  }

  function applyQuality(preset) {
    const key = String(preset || 'medium').toLowerCase();
    if (!QUALITY_PRESETS[key]) return;
    settings.quality = key;

    if (titleSelQuality && titleSelQuality.value !== key) titleSelQuality.value = key;
    if (pauseSelQuality && pauseSelQuality.value !== key) pauseSelQuality.value = key;
    if (titleQualityBadge) {
      titleQualityBadge.textContent = `QUALITY: ${QUALITY_PRESETS[key].label || key.toUpperCase()}`;
    }

    if (runtimeReady && engine) {
      engine.setQuality(key);
      const qCfg = engine.getQualityConfig();
      if (mapManager) mapManager.setQuality(qCfg);
      if (vfxManager) vfxManager.setQuality(qCfg);
      engine.bakeStaticShadows();
    }
  }

  function applySensitivity(val) {
    const s = Math.max(0.3, Math.min(2.5, Number(val) || 1.0));
    settings.sensitivity = s;
    const strVal = s.toFixed(2);
    const label = `${strVal}x`;

    if (titleRngSensitivity && titleRngSensitivity.value !== strVal) titleRngSensitivity.value = strVal;
    if (pauseRngSensitivity && pauseRngSensitivity.value !== strVal) pauseRngSensitivity.value = strVal;
    if (titleValSensitivity) titleValSensitivity.textContent = label;
    if (pauseValSensitivity) pauseValSensitivity.textContent = label;

    if (runtimeReady && input) {
      input.setSensitivity(s);
    }
  }

  function applyVolume(val) {
    const v = Math.max(0, Math.min(100, Math.round(Number(val) || 0)));
    settings.volume = v;
    const strVal = String(v);
    const label = `${v}%`;

    if (titleRngVolume && titleRngVolume.value !== strVal) titleRngVolume.value = strVal;
    if (pauseRngVolume && pauseRngVolume.value !== strVal) pauseRngVolume.value = strVal;
    if (titleValVolume) titleValVolume.textContent = label;
    if (pauseValVolume) pauseValVolume.textContent = label;

    if (soundEngine) {
      soundEngine.setMasterVolume(v / 100);
    }
  }

  function applyMusic(enabled) {
    const on = Boolean(enabled);
    settings.music = on;

    if (titleChkMusic && titleChkMusic.checked !== on) titleChkMusic.checked = on;
    if (pauseChkMusic && pauseChkMusic.checked !== on) pauseChkMusic.checked = on;

    if (soundEngine) {
      soundEngine.setMusicEnabled(on);
    }
  }

  function applyShowFps(enabled) {
    const on = Boolean(enabled);
    settings.showFps = on;

    if (titleChkFps && titleChkFps.checked !== on) titleChkFps.checked = on;
    if (pauseChkFps && pauseChkFps.checked !== on) pauseChkFps.checked = on;
    if (fpsCounterEl) fpsCounterEl.classList.toggle('hidden', !on);
  }

  function syncTouchOverlayVisibility() {
    if (!touchOverlay) return;
    const show = gameState === 'playing' && isTouchActive();
    touchOverlay.setVisible(show, settings.controlMode === 'touch');
  }

  function syncHudImmediate() {
    if (!runtimeReady || !hudManager || !playerController || !weaponSystem || !waveDirector || !interactables) {
      return;
    }
    hudSnapshot.player = playerController.getStateSnapshot();
    hudSnapshot.weapon = weaponSystem.getCurrentWeaponState();
    hudSnapshot.crosshairSpread = 0.018;
    hudSnapshot.wave = waveDirector.getHudState();
    hudSnapshot.boss = waveDirector.getBossState();
    hudSnapshot.zone = interactables.getZoneState();
    hudSnapshot.enemies = waveDirector.getTargets();
    hudSnapshot.pickups = interactables.getPickups();
    hudSnapshot.fps = engine ? engine.fps : 60;
    hudManager.update(0.016, hudSnapshot);
    if (touchOverlay) touchOverlay.syncState(hudSnapshot);
  }

  // ---------------------------------------------------------------------------
  // 6. Independent Scene State Machine & 3-Map Campaign Transitions
  // ---------------------------------------------------------------------------
  function startLoop() {
    if (rafId !== null) return;
    lastTime = performance.now();
    rafId = window.requestAnimationFrame(frame);
  }

  function stopLoop() {
    if (rafId !== null) {
      window.cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function startNewGame() {
    if (isTransitioning) return;
    unlockAudioOnGesture();

    runFadeTransition(
      () => {
        // Hide Title / Result / Pause & reveal Playing scene underneath opaque fade curtain
        if (sceneTitle) sceneTitle.classList.add('hidden');
        if (sceneResult) {
          sceneResult.classList.add('hidden');
          sceneResult.classList.remove('victory', 'defeat');
        }
        if (pausePanel) pausePanel.classList.add('hidden');
        if (upgradePanel) upgradePanel.classList.add('hidden');
        if (scenePlaying) scenePlaying.classList.remove('hidden');

        // Lazy WebGL init on first deploy (or reuse warmed runtime)
        const ok = ensureRuntimeInitialized();
        if (!ok) return;

        tutorialState.active = false;
        const _tb = document.getElementById('tutorial-banner');
        if (_tb) _tb.classList.add('hidden');
        // Always start fresh campaign on Map 0 (SEC-09 Dead Metropolis)
        if (mapManager.getCurrentMapIndex() !== 0) {
          if (interactables) {
            interactables.dispose();
            interactables = null;
          }
          arenaData = mapManager.loadMap(0);
          interactables = new Interactables(engine.scene, collisionWorld, eventBus, arenaData);
        } else {
          interactables.reset();
        }
        waveDirector.setArenaData(arenaData, interactables);
        hudManager.setArenaData(arenaData, collisionWorld);

        resetTelemetry();
        lastAdsFov = null;
        hadPointerLock = false;
        zoneAmmoRefilled = false;
        endingTimer = 0;
        endingIsVictory = false;
        endingFadeStarted = false;

        input.resetAll();
        input.setControlMode(settings.controlMode);
        if (settings.controlMode === 'auto') {
          input.setTouchMode(isCoarsePointer());
        }
        touchOverlay.reset();
        hudManager.reset();
        vfxManager.reset();
        waveDirector.reset();
        runCards = [];
        draftChoices = [];
        if (upgradePanel) upgradePanel.classList.add('hidden');
        const { mods: startMods } = computePlayerMods();
        playerController.applyModifiers(startMods, true);
        playerController.reset(arenaData.playerSpawn.pos, arenaData.playerSpawn.yaw);
        weaponSystem.reset();
        lastWeaponState = weaponSystem.getCurrentWeaponState();

        engine.viewmodelScene.visible = true;
        engine.resize();
        engine.setFov(playerController.currentFov);
        engine.bakeStaticShadows();
        engine.prewarmShaders();

        hudManager.setVisible(true);
        gameState = 'playing';
        document.body.classList.add('playing-active');
        syncTouchOverlayVisibility();

        eventBus.emit(EVENTS.GAME_STATE, { state: 'playing' });
        const heatCfg = HEAT_CONTRACTS[selectedHeatLevel] || HEAT_CONTRACTS[0];
    const dailyHpMult = selectedMissionMode === 'daily' ? (getTodayDailyModifier().enemyHpMult || 1.0) : 1.0;
    waveDirector.endlessMode = selectedMissionMode === 'endless';
    waveDirector.endlessLoop = 0;
    waveDirector.globalEnemyHpMult = heatCfg.enemyHpMult * dailyHpMult;
    waveDirector.start();
        syncHudImmediate();

        // Render one pre-warmed frame during blackout to bake shadows & upload textures
        engine.render();
        startLoop();
      },
      () => {
        if (gameState === 'playing' && runtimeReady && !isTouchActive()) {
          input.requestPointerLock();
        }
      }
    );
  }

  function handleMapTransition(nextMapIndex) {
    if (!runtimeReady || gameState !== 'playing') return;

    runFadeTransition(() => {
      if (gameState !== 'playing') return;

      input.resetAll();
      touchOverlay.reset();
      hudManager.clearCombatOverlays();
      zoneAmmoRefilled = false;

      if (interactables) {
        interactables.dispose();
        interactables = null;
      }

      arenaData = mapManager.loadMap(nextMapIndex);
      interactables = new Interactables(engine.scene, collisionWorld, eventBus, arenaData);
      vfxManager.reset();

      // Reset position/velocity to new sector spawn while preserving health, score, combo & ammo,
      // and granting a full Orbital Drop shield top-off
      const savedHealth = playerController.health;
      const savedShield = playerController.shield;
      playerController.reset(arenaData.playerSpawn.pos, arenaData.playerSpawn.yaw);
      playerController.health = Math.max(1, Math.min(playerController.maxHealth, savedHealth));
      playerController.shield = Math.max(0, Math.min(playerController.maxShield, savedShield));
      playerController.heal(0, playerController.maxShield);

      hudManager.setArenaData(arenaData, collisionWorld);
      engine.setFov(playerController.currentFov);
      engine.bakeStaticShadows();
      engine.prewarmShaders();

      waveDirector.completeMapTransition(arenaData, interactables);
      syncHudImmediate();
      engine.render();
    });
  }

  function pauseGame() {
    if (!runtimeReady || gameState !== 'playing' || isTransitioning) return;
    gameState = 'paused';
    pauseDebounce = 0.2;
    hadPointerLock = false;

    document.body.classList.remove('playing-active');
    input.exitPointerLock();
    input.resetAll();
    touchOverlay.setVisible(false);

    if (pausePanel) pausePanel.classList.remove('hidden');
    eventBus.emit(EVENTS.GAME_STATE, { state: 'paused' });
  }

  function resumeFromPause() {
    if (!runtimeReady || gameState !== 'paused' || isTransitioning) return;
    unlockAudioOnGesture();

    if (pausePanel) pausePanel.classList.add('hidden');
    gameState = 'playing';
    pauseDebounce = 0.15;
    input.resetAll();
    document.body.classList.add('playing-active');
    syncTouchOverlayVisibility();
    eventBus.emit(EVENTS.GAME_STATE, { state: 'playing' });

    if (!isTouchActive()) {
      input.requestPointerLock();
    }
  }

  /**
   * 0.5s Death/Victory Slow-Motion Linger (0.25x sim speed, input disabled)
   * followed by 300ms fade curtain -> stopLoop() -> hide #scene-playing -> #scene-result.
   */
  function beginEndingSequence(isVictory) {
    if (gameState !== 'playing') return;
    gameState = 'ending';
    endingIsVictory = Boolean(isVictory);
    endingTimer = ENDING_LINGER_SEC;
    endingFadeStarted = false;
    hadPointerLock = false;
    lastAdsFov = null;

    document.body.classList.remove('playing-active');
    if (pausePanel) pausePanel.classList.add('hidden');

    if (input) {
      input.exitPointerLock();
      input.resetAll();
    }
    if (touchOverlay) {
      touchOverlay.setVisible(false);
    }

    if (!endingIsVictory && eventBus && waveDirector) {
      const waveHud = waveDirector.getHudState();
      eventBus.emit(EVENTS.GAME_STATE, {
        state: 'gameover',
        score: waveHud.score,
        kills: waveHud.kills,
        headshots: waveHud.headshots,
        wave: waveHud.wave,
      });
    }
  }

  function enterResultScene(isVictory) {
    stopLoop();
    gameState = 'result';
    hadPointerLock = false;
    document.body.classList.remove('playing-active');

    if (input) {
      input.exitPointerLock();
      input.resetAll();
    }
    if (touchOverlay) touchOverlay.setVisible(false);
    if (hudManager) {
      hudManager.setVisible(false);
      hudManager.clearCombatOverlays();
    }
    if (soundEngine) {
      soundEngine.setCombatIntensity(0);
    }
    if (pausePanel) pausePanel.classList.add('hidden');
    if (scenePlaying) scenePlaying.classList.add('hidden');
    if (sceneTitle) sceneTitle.classList.add('hidden');

    const waveHud = waveDirector ? waveDirector.getHudState() : {};
    // Compute personalized Combat Persona Title & Build Summary
    const maxStyle = (STYLE_TIERS[telemetry.maxStyleTierIdx] || STYLE_TIERS[0]).grade;
    let topWep = 'M41-A';
    let topWepKills = -1;
    for (const [k, v] of Object.entries(telemetry.weaponKills)) {
      if (v > topWepKills) { topWepKills = v; topWep = k; }
    }
    const runKills = waveHud.kills || 0;
    const runHs = waveHud.headshots || 0;
    const hsRate = runKills > 0 ? runHs / runKills : 0;
    let personaTitle = '[강철의 선봉장]';
    if (telemetry.maxStyleTierIdx >= 5) personaTitle = '[SSS 전장의 화신]';
    else if (telemetry.airKills >= 5) personaTitle = '[하늘의 학살자]';
    else if (telemetry.slideKills >= 5) personaTitle = '[슬라이드 폭주족]';
    else if (telemetry.meleeKills >= 4) personaTitle = '[고열 블레이드 검귀]';
    else if (hsRate >= 0.45 && runHs >= 5) personaTitle = '[냉혈 정밀 저격수]';
    else if (telemetry.swapKills >= 4) personaTitle = '[전술 무장 달인]';

    const titleEl = byId('debrief-persona-title');
    const sumEl = byId('debrief-build-summary');
    if (titleEl) titleEl.textContent = personaTitle;
    if (sumEl) {
      sumEl.textContent = `최고 스타일 ${maxStyle} · 핵심 무장 ${topWep} · 공중 ${telemetry.airKills} / 슬라이드 ${telemetry.slideKills} / 전환 ${telemetry.swapKills} 처치`;
    }

    // Update Endless Best Wave & Check End-of-Run Achievements
    const totalReachedWave = Math.max(1, waveHud.wave || 1);
    if (selectedMissionMode === 'endless' && totalReachedWave > metaState.bestEndlessWave) {
      metaState.bestEndlessWave = totalReachedWave;
      saveMetaState();
    }
    if (selectedMissionMode === 'endless' && totalReachedWave >= 8) unlockAchievement('endless_8');
    if (selectedMissionMode === 'endless' && totalReachedWave >= 12) unlockAchievement('endless_12');
    if (isVictory) {
      unlockAchievement('first_clear');
      unlockAchievement('citadel_clear');
      if (selectedHeatLevel >= 2) unlockAchievement('heat_clear');
    }
    saveMetaState();
    renderMedalsStrip();
    updateMissionConfigUI();

    const resFrame = getEquippedFrame();
    const resImg = byId('result-pilot-img');
    const resName = byId('result-pilot-name');
    const resTier = byId('result-pilot-tier');
    if (resImg && PILOT_FRAME_ART && PILOT_FRAME_ART[resFrame.id]) {
      resImg.src = PILOT_FRAME_ART[resFrame.id];
    }
    if (resName) {
      resName.textContent = resFrame.name;
      resName.style.color = resFrame.color || '#f5f5f4';
    }
    if (resTier) resTier.textContent = resFrame.tier || '전술 기체';

    if (hudManager) {
      hudManager.showEndScreen(isVictory, {
        score: waveHud.score || 0,
        kills: waveHud.kills || 0,
        headshots: waveHud.headshots || 0,
        shotsFired: telemetry.shotsFired,
        shotsHit: telemetry.shotsHit,
        maxCombo: Math.max(telemetry.maxCombo, waveHud.combo || 1),
        wave: Math.max(1, waveHud.wave || 1),
        totalWaves: waveHud.totalWaves || WAVES.length,
        elapsedSec: telemetry.elapsedSec,
      });
    } else if (sceneResult) {
      sceneResult.classList.remove('hidden');
    }
  }

  function returnToTitle() {
    if (isTransitioning) return;

    runFadeTransition(() => {
      stopLoop();
      gameState = 'title';
      hadPointerLock = false;
      lastAdsFov = null;
      zoneAmmoRefilled = false;
      endingTimer = 0;
      endingFadeStarted = false;
      document.body.classList.remove('playing-active');

      if (runtimeReady) {
        input.exitPointerLock();
        input.resetAll();
        touchOverlay.setVisible(false);
        hudManager.setVisible(false);
        hudManager.hideEndScreen();
        hudManager.reset();
        waveDirector.reset();
        if (interactables) interactables.reset();
        vfxManager.reset();
        weaponSystem.reset();
        if (soundEngine) soundEngine.setCombatIntensity(0);
        eventBus.emit(EVENTS.GAME_STATE, { state: 'title' });
      }

      if (pausePanel) pausePanel.classList.add('hidden');
      if (upgradePanel) upgradePanel.classList.add('hidden');
      renderArmoryUI();
      if (scenePlaying) scenePlaying.classList.add('hidden');
      if (sceneResult) {
        sceneResult.classList.add('hidden');
        sceneResult.classList.remove('victory', 'defeat');
      }
      if (sceneTitle) sceneTitle.classList.remove('hidden');
      showTitleSubpanel('main');
      updateDeviceBadge();
    });
  }

  // ---------------------------------------------------------------------------
  // 6.5. Lightweight Title / Hangar Mechanical UI Switch Audio (Zero WebGL)
  // ---------------------------------------------------------------------------
  let uiAudioCtx = null;
  function playUiSfx(kind = 'click') {
    try {
      const vol = Math.max(0, Math.min(1, (settings.volume || 78) / 100));
      if (vol <= 0.01) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!uiAudioCtx) uiAudioCtx = new AC();
      if (uiAudioCtx.state === 'suspended') uiAudioCtx.resume();
      const now = uiAudioCtx.currentTime;
      const gain = uiAudioCtx.createGain();
      gain.connect(uiAudioCtx.destination);
      const osc = uiAudioCtx.createOscillator();
      if (kind === 'buy') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(160, now);
        osc.frequency.exponentialRampToValueAtTime(320, now + 0.09);
        gain.gain.setValueAtTime(0.14 * vol, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
        osc.connect(gain);
        osc.start(now);
        osc.stop(now + 0.15);
      } else {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(520, now);
        osc.frequency.exponentialRampToValueAtTime(180, now + 0.032);
        gain.gain.setValueAtTime(0.08 * vol, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.038);
        osc.connect(gain);
        osc.start(now);
        osc.stop(now + 0.042);
      }
    } catch {}
  }
  document.addEventListener('click', (e) => {
    const btn = e.target && e.target.closest ? e.target.closest('button') : null;
    if (!btn || btn.disabled) return;
    if (btn.classList.contains('armory-buy-btn')) playUiSfx('buy');
    else if (gameState !== 'playing') playUiSfx('click');
  });

  // ---------------------------------------------------------------------------
  // 7. DOM Event Bindings (Title, Pause, Result & Live Settings Sync)
  // ---------------------------------------------------------------------------
  if (btnDeploy) btnDeploy.addEventListener('click', () => startNewGame());
  if (btnTitleArmory) btnTitleArmory.addEventListener('click', () => showTitleSubpanel('armory'));
  if (btnArmoryBack) btnArmoryBack.addEventListener('click', () => showTitleSubpanel('main'));
  if (btnTitleArsenal) btnTitleArsenal.addEventListener('click', () => showTitleSubpanel('arsenal'));
  if (btnTitleControls) btnTitleControls.addEventListener('click', () => showTitleSubpanel('controls'));
  if (btnTitleSettings) btnTitleSettings.addEventListener('click', () => showTitleSubpanel('settings'));
  if (btnTitleAchievements) btnTitleAchievements.addEventListener('click', () => showTitleSubpanel('achievements'));

  if (btnArsenalBack) btnArsenalBack.addEventListener('click', () => showTitleSubpanel('main'));
  if (btnControlsBack) btnControlsBack.addEventListener('click', () => showTitleSubpanel('main'));
  if (btnSettingsBack) btnSettingsBack.addEventListener('click', () => showTitleSubpanel('main'));
  if (btnAchievementsBack) btnAchievementsBack.addEventListener('click', () => showTitleSubpanel('main'));

  document.querySelectorAll('[data-ach-cat]').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeAchCategory = btn.getAttribute('data-ach-cat') || 'all';
      document.querySelectorAll('[data-ach-cat]').forEach((b) => {
        b.classList.toggle('active', b === btn);
      });
      renderMedalsStrip();
    });
  });

  if (btnHudPause) {
    btnHudPause.addEventListener('click', (e) => {
      e.stopPropagation();
      if (gameState === 'playing') pauseGame();
    });
  }
  if (btnResume) btnResume.addEventListener('click', () => resumeFromPause());
  if (btnRestartPause) btnRestartPause.addEventListener('click', () => startNewGame());
  if (btnQuitTitle) btnQuitTitle.addEventListener('click', () => returnToTitle());
  if (btnRedeploy) btnRedeploy.addEventListener('click', () => startNewGame());
  if (btnEndTitle) btnEndTitle.addEventListener('click', () => returnToTitle());

  // ESC closes open Title sub-panels; 1/2/3 selects Tactical Upgrade Card cleanly
  window.addEventListener('keydown', (e) => {
    if (gameState === 'title' && e.code === 'Escape' && activeTitleSubpanel !== 'main') {
      showTitleSubpanel('main');
    } else if (gameState === 'upgrading') {
      if (e.code === 'Digit1') selectUpgradeCard(0);
      else if (e.code === 'Digit2') selectUpgradeCard(1);
      else if (e.code === 'Digit3') selectUpgradeCard(2);
    }
  });

  // Auto-pause cleanly when PC player presses ESC to exit PointerLock
  document.addEventListener('pointerlockchange', () => {
    if (!runtimeReady || !input) return;
    const locked = input.isPointerLocked();
    if (locked) {
      hadPointerLock = true;
    } else if (hadPointerLock && gameState === 'playing' && !isTouchActive() && !isTransitioning) {
      hadPointerLock = false;
      pauseGame();
    }
  });

  // React to dynamic pointer capability changes (e.g., tablet keyboard/mouse dock)
  if (coarseMediaQuery && typeof coarseMediaQuery.addEventListener === 'function') {
    coarseMediaQuery.addEventListener('change', updateDeviceBadge);
  }

  // Bi-directional live settings controls (Title <-> Pause)
  if (titleSelQuality) titleSelQuality.addEventListener('change', () => applyQuality(titleSelQuality.value));
  if (pauseSelQuality) pauseSelQuality.addEventListener('change', () => applyQuality(pauseSelQuality.value));
  if (titleSelControls) titleSelControls.addEventListener('change', () => applyControlMode(titleSelControls.value));
  if (pauseSelControls) pauseSelControls.addEventListener('change', () => applyControlMode(pauseSelControls.value));

  if (titleRngSensitivity) {
    titleRngSensitivity.addEventListener('input', () => applySensitivity(titleRngSensitivity.value));
  }
  if (pauseRngSensitivity) {
    pauseRngSensitivity.addEventListener('input', () => applySensitivity(pauseRngSensitivity.value));
  }

  if (titleRngVolume) {
    titleRngVolume.addEventListener('input', () => applyVolume(titleRngVolume.value));
  }
  if (pauseRngVolume) {
    pauseRngVolume.addEventListener('input', () => applyVolume(pauseRngVolume.value));
  }

  if (titleChkMusic) titleChkMusic.addEventListener('change', () => applyMusic(titleChkMusic.checked));
  if (pauseChkMusic) pauseChkMusic.addEventListener('change', () => applyMusic(pauseChkMusic.checked));
  if (titleChkFps) titleChkFps.addEventListener('change', () => applyShowFps(titleChkFps.checked));
  if (pauseChkFps) pauseChkFps.addEventListener('change', () => applyShowFps(pauseChkFps.checked));

  // Initialize Title state & badges (ZERO WebGL, ZERO rAF!)
  applyQuality(settings.quality);
  applySensitivity(settings.sensitivity);
  applyVolume(settings.volume);
  applyMusic(settings.music);
  applyShowFps(settings.showFps);
  applyControlMode(settings.controlMode);
  renderArmoryUI();
  showTitleSubpanel('main');

  // ---------------------------------------------------------------------------
  // 8. Main 60FPS Combat Loop (Active ONLY in 'playing' | 'paused' | 'ending')
  // ---------------------------------------------------------------------------
  function frame(now) {
    if (rafId === null || gameState === 'title' || gameState === 'result') {
      rafId = null;
      return;
    }
    rafId = window.requestAnimationFrame(frame);

    const rawDt = Math.max(0.0001, (now - lastTime) * 0.001);
    lastTime = now;
    const dt = rawDt > 0.05 ? 0.05 : rawDt;

    if (pauseDebounce > 0) {
      pauseDebounce = Math.max(0, pauseDebounce - dt);
    }

    if (gameState === 'playing') {
      // Freeze combat simulation during 300ms mid-campaign map transition fade
      if (isTransitioning) {
        elapsedTime += dt;
        mapManager.update(dt, elapsedTime);
        vfxManager.update(dt);
      updateUlt3dEffects(dt);
        soundEngine.update(dt);
        input.endFrame();
        engine.recordFrame(rawDt);
        engine.render();
        return;
      }

      elapsedTime += dt;
      telemetry.elapsedSec += dt;

      // Style meter gentle decay over time
      if (telemetry.styleMeter > 0) {
        const decayRate = 3.2 + telemetry.styleTierIdx * 1.1;
        telemetry.styleMeter = Math.max(0, telemetry.styleMeter - decayRate * dt);
        const newIdx = getStyleTier(telemetry.styleMeter);
        if (newIdx !== telemetry.styleTierIdx) {
          telemetry.styleTierIdx = newIdx;
          if (newIdx === 0) telemetry.lastStyleCallout = 'STYLE';
        }
        updateStyleHudUI();
      }

      // BASTION-12 Special: Seismic Dash Slam shockwave (bug-fixed: uses playerController.isDashing!)
      if (playerController && playerController.mods && playerController.mods.dashSlam) {
        const isDashingNow = Boolean(playerController.isDashing);
        if (isDashingNow && !telemetry.wasDashingPrev && waveDirector) {
          const pPos = playerController.position;
          const activeEnemies = waveDirector.getActiveEnemies ? waveDirector.getActiveEnemies() : [];
          for (let ei = 0; ei < activeEnemies.length; ei++) {
            const e = activeEnemies[ei];
            if (!e || !e.isAlive) continue;
            if (e.position.distanceTo(pPos) <= 7.5) {
              const dir = e.position.clone().sub(pPos).normalize();
              e.applyDamage(65, e.center || e.position, false, dir, { isExplosion: true, knockback: 18 });
            }
          }
          if (vfxManager) vfxManager.spawnExplosion(pPos, 5.2, 0x22c55e);
        }
        telemetry.wasDashingPrev = isDashingNow;
      }

      // Rare Card: Repulsor Slam (landing shockwave after airborne >= 0.28s)
      if (playerController) {
        const groundedNow = Boolean(playerController.isGrounded);
        if (!groundedNow) {
          telemetry.airTimeAccum += dt;
        } else {
          if (!telemetry.wasGroundedPrev && telemetry.airTimeAccum >= 0.28 && playerController.mods && playerController.mods.repulsorSlam) {
            const pPos = playerController.position;
            const activeEnemies = waveDirector && waveDirector.getActiveEnemies ? waveDirector.getActiveEnemies() : [];
            let slamHits = 0;
            for (let ei = 0; ei < activeEnemies.length; ei++) {
              const e = activeEnemies[ei];
              if (!e || !e.isAlive) continue;
              const d = e.position.distanceTo(pPos);
              if (d <= 7.5) {
                const dir = e.position.clone().sub(pPos).normalize();
                e.applyDamage(55, e.center || e.position, false, dir, { isExplosion: true, knockback: 14 });
                slamHits++;
              }
            }
            if (vfxManager) vfxManager.spawnExplosion(pPos, 4.8, 0x22c55e);
            if (slamHits > 0) addStylePoints(14, '충격 강하!');
          }
          telemetry.airTimeAccum = 0;
        }
        telemetry.wasGroundedPrev = groundedNow;
      }
      syncTouchOverlayVisibility();

      // Build zero-GC merged target list (living enemies + alive explosive fuel drums)
      const livingEnemies = waveDirector.getTargets();
      const activeBarrels = interactables.getDestructibleTargets();
      mergedTargets.length = 0;
      for (let i = 0; i < livingEnemies.length; i++) {
        mergedTargets.push(livingEnemies[i]);
      }
      for (let i = 0; i < activeBarrels.length; i++) {
        mergedTargets.push(activeBarrels[i]);
      }

      // 1. Player 3C locomotion, camera & touch aim-assist
      playerUpdateOpts.adsFov = lastAdsFov;
      playerUpdateOpts.aimAssistTargets = livingEnemies;
      playerUpdateOpts.allowAds = !(
        lastWeaponState &&
        (lastWeaponState.isReloading || lastWeaponState.isSwapping || lastWeaponState.isMeleeing)
      );
      playerController.update(dt, playerUpdateOpts);
      engine.setFov(playerController.currentFov);
      engine.camera.updateMatrixWorld();

      // 1.4. Sync 1st-person Robot Hands & Frame Visor HUD Style
      if (weaponSystem && playerController && playerController.mods) {
        const curFid = playerController.mods.frameId || 'vanguard';
        if (telemetry._appliedFrameVisual !== curFid) {
          telemetry._appliedFrameVisual = curFid;
          if (typeof weaponSystem.setPilotFrameStyle === 'function') {
            weaponSystem.setPilotFrameStyle(curFid);
          }
        }
      }

      // 1.5. Floor Weapon Auto-Upgrade on proximity (same weapon) OR Swap on [F]
      if (interactables && weaponSystem && playerController) {
        const autoNear = interactables.getNearbyWeaponDrop(playerController.position);
        if (autoNear) {
          const loNow = weaponSystem.getLoadoutInfo();
          const dropW = __require("src/config/weapons.js").WEAPONS[autoNear.weaponIndex];
          const isSecDrop = dropW && dropW.category === 'secondary';
          const curSlotIdx = isSecDrop ? loNow.secondaryIndex : loNow.primaryIndex;
          if (curSlotIdx === autoNear.weaponIndex) {
            const upgraded = interactables.trySwapNearbyWeapon(playerController.position, weaponSystem);
            if (upgraded) {
              const ocLv = weaponSystem.weaponOverclock[autoNear.weaponIndex] || 1;
              if (vfxManager) {
                const upCol = ocLv >= 3 ? 0xffd700 : ocLv === 2 ? 0xc084fc : 0x38bdf8;
                vfxManager.spawnExplosion(playerController.position, 2.8, upCol);
              }
              if (tutorialState.active && tutorialState.step === 4) { tutorialState.autoUpgraded = true; advanceTutorialStep(5); }
              if (hudManager && typeof hudManager.showAnnouncement === 'function' && dropW) {
                hudManager.showAnnouncement(
                  `${dropW.shortName} 자동 업그레이드!`,
                  `MK.${ocLv + 1} 강화 완료 · 외형 및 탄환 이펙트 진화`,
                  'info'
                );
              }
            }
          }
        }
        if (input.consumePressed('interact')) {
          interactables.trySwapNearbyWeapon(playerController.position, weaponSystem);
        }
      }

      // 1.6. Frame Ultimate Activation on [X]
      if (input.consumePressed('ultimate') && playerController && playerController.ultCharge >= 100) {
        const fid = (playerController.mods && playerController.mods.frameId) || 'vanguard';
        eventBus.emit(EVENTS.ULTIMATE_USED, { frameId: fid });
        const uDmgM = (playerController.mods && playerController.mods.ultDamageBonus) || 1.0;
        const uDurAdd = (playerController.mods && playerController.mods.ultDurationBonus) || 0;
        playerController.ultCharge = 0;
        if (playerController.mods && playerController.mods.synergyTactical4) {
          playerController.guardEnergy = playerController.maxGuardEnergy;
          playerController.guardBreakTimer = 0;
          playerController.ultDamageMult = Math.max(playerController.ultDamageMult || 1.0, 1.35);
          playerController.ultActiveTimer = Math.max(playerController.ultActiveTimer || 0, 4.0);
        }
        if (tutorialState.active && tutorialState.step === 5) { tutorialState.usedUlt = true; updateTutorialBannerUI(); }
        const pPos = playerController.position;
        const activeEnemies = waveDirector && waveDirector.getActiveEnemies ? waveDirector.getActiveEnemies() : [];

        if (fid === 'vanguard') {
          // VANGUARD-09: ORBITAL BARRAGE (5 sky-to-ground orbital laser strikes, 180 AoE dmg each)
          playerController.ultActiveTimer = 2.0;
          const targets = activeEnemies
            .filter((e) => e && e.isAlive)
            .sort((a, b) => a.position.distanceToSquared(pPos) - b.position.distanceToSquared(pPos))
            .slice(0, 5);
          for (let ti = 0; ti < Math.max(1, targets.length); ti++) {
            const tPos = targets[ti] ? targets[ti].position.clone() : pPos.clone().addScaledVector(playerController.getLookDirection(), 14);
            const skyOrigin = tPos.clone();
            skyOrigin.y += 38;
            if (vfxManager) {
              if (typeof vfxManager.spawnTracer === 'function') vfxManager.spawnTracer(skyOrigin, tPos, 0xf59e0b, 0.28, true);
              vfxManager.spawnExplosion(tPos, 5.5, 0xf59e0b);
            }
            spawnUltBeamPillar(tPos, 0xf59e0b);
            spawnUltShockRing(tPos, 8.5, 0xfbbf24, 0.95);
            for (let ei = 0; ei < activeEnemies.length; ei++) {
              const e = activeEnemies[ei];
              if (!e || !e.isAlive) continue;
              if (e.position.distanceTo(tPos) <= 7.5) {
                const dir = e.position.clone().sub(tPos).normalize();
                e.applyDamage(Math.round(180 * uDmgM), e.center || e.position, false, dir, { isExplosion: true, knockback: 18 });
              }
            }
          }
          triggerUltScreenFlash('rgba(245,158,11,0.75)', 0.55);
          playerController.addScreenShake(0.45);
          if (hudManager && typeof hudManager.showAnnouncement === 'function') {
            hudManager.showAnnouncement('궁극기: 궤도 포격!', 'ORBITAL BARRAGE — 5연쇄 궤도 타격 투하', 'info');
          }
        } else if (fid === 'strider') {
          // STRIDER-04: PHASE OVERCLOCK (6s 60% enemy time-dilation + hyper speed + infinite ammo)
          playerController.timeSlowTimer = 6.0 + uDurAdd;
          playerController.ultActiveTimer = Math.max(playerController.ultActiveTimer, 6.0 + uDurAdd);
          playerController.dashOverdriveTimer = 6.0 + uDurAdd;
          if (vfxManager) vfxManager.spawnExplosion(pPos, 5.0, 0x00f0ff);
          spawnUltNovaSphere(pPos, 24.0, 0x00f0ff, 1.1);
          spawnUltShockRing(pPos, 26.0, 0x38bdf8, 1.0);
          spawnUltShockRing(pPos, 18.0, 0x7dd3fc, 0.7, 0.25);
          triggerUltScreenFlash('rgba(0,240,255,0.72)', 0.55);
          if (hudManager && typeof hudManager.showAnnouncement === 'function') {
            hudManager.showAnnouncement('궁극기: 타임 다이레이션!', '6초간 적 시간 60% 감속 · 초고속 무한 사격', 'info');
          }
        } else if (fid === 'bastion') {
          // BASTION-12: AEGIS FORTRESS (7s invulnerability + 12m periodic electric shockwaves + 100% guard refill)
          playerController.ultInvulnTimer = 7.0 + uDurAdd;
          playerController.ultActiveTimer = Math.max(playerController.ultActiveTimer, 7.0 + uDurAdd);
          playerController.guardEnergy = playerController.maxGuardEnergy;
          playerController.guardBreakTimer = 0;
          telemetry._bastionPulseTimer = 0.05;
          if (vfxManager) vfxManager.spawnExplosion(pPos, 6.0, 0x22c55e);
          spawnUltNovaSphere(pPos, 12.0, 0x22c55e, 0.9);
          spawnUltShockRing(pPos, 13.0, 0x4ade80, 0.85);
          triggerUltScreenFlash('rgba(34,197,94,0.68)', 0.50);
          if (hudManager && typeof hudManager.showAnnouncement === 'function') {
            hudManager.showAnnouncement('궁극기: 이지스 포트리스!', '7초간 완전 무적 돔 전개 · 주변 12m 전기 충격', 'info');
          }
        } else if (fid === 'apex') {
          // APEX-ZERO: APOCALYPSE NOVA (28m 260 dmg + stagger nova + 5s 1.6x damage overdrive)
          playerController.ultActiveTimer = Math.max(playerController.ultActiveTimer, 5.0 + uDurAdd);
          playerController.ultDamageMult = Math.max(playerController.ultDamageMult, 1.6 * uDmgM);
          playerController.dashOverdriveTimer = 5.0 + uDurAdd;
          if (vfxManager) vfxManager.spawnExplosion(pPos, 9.5, 0xef4444);
          spawnUltNovaSphere(pPos, 28.0, 0xef4444, 1.2);
          spawnUltShockRing(pPos, 28.0, 0xf59e0b, 1.05, 0.0);
          spawnUltShockRing(pPos, 26.0, 0xf43f5e, 1.05, 0.45);
          spawnUltShockRing(pPos, 26.0, 0xfbbf24, 1.05, -0.45);
          triggerUltScreenFlash('rgba(239,68,68,0.85)', 0.65);
          for (let ei = 0; ei < activeEnemies.length; ei++) {
            const e = activeEnemies[ei];
            if (!e || !e.isAlive) continue;
            if (e.position.distanceTo(pPos) <= 28.0) {
              const dir = e.position.clone().sub(pPos).normalize();
              e.applyDamage(Math.round(260 * uDmgM), e.center || e.position, false, dir, { isExplosion: true, knockback: 22 });
            }
          }
          playerController.addScreenShake(0.55);
          if (hudManager && typeof hudManager.showAnnouncement === 'function') {
            hudManager.showAnnouncement('궁극기: 아포칼립스 노바!', '전장 초신성 폭발 · 5초간 화력 1.6배 폭주', 'danger');
          }
        }
      }

      // BASTION-12 Ultimate periodic 12m shockwave pulse while Aegis Fortress is active
      if (playerController && playerController.ultInvulnTimer > 0 && waveDirector) {
        telemetry._bastionPulseTimer = (telemetry._bastionPulseTimer || 0) - dt;
        if (telemetry._bastionPulseTimer <= 0) {
          telemetry._bastionPulseTimer = 0.85;
          const pPos = playerController.position;
          const activeEnemies = waveDirector.getActiveEnemies ? waveDirector.getActiveEnemies() : [];
          for (let ei = 0; ei < activeEnemies.length; ei++) {
            const e = activeEnemies[ei];
            if (!e || !e.isAlive) continue;
            if (e.position.distanceTo(pPos) <= 12.0) {
              const dir = e.position.clone().sub(pPos).normalize();
              e.applyDamage(Math.round(45 * ((playerController.mods && playerController.mods.ultDamageBonus) || 1.0)), e.center || e.position, false, dir, { isExplosion: true, knockback: 10 });
            }
          }
          if (vfxManager) vfxManager.spawnExplosion(pPos, 4.5, 0x22c55e);
          spawnUltShockRing(pPos, 12.5, 0x4ade80, 0.65);
        }
      }

      // 2. Weapon inputs, ballistics, thermal pry-blade melee & 1P viewmodel animation
      const weaponRes = weaponSystem.update(dt, mergedTargets);
      lastAdsFov = weaponRes.adsFov;
      lastWeaponState = weaponSystem.getCurrentWeaponState();

      // 3. Active Sector Environment, Interactables, WaveDirector AI & VFX
      mapManager.update(dt, elapsedTime);
      interactables.update(dt, elapsedTime, playerController, livingEnemies, weaponSystem);
      let worldScale = 1.0;
      if (_hitstopTimer > 0) {
        _hitstopTimer = Math.max(0, _hitstopTimer - dt);
        worldScale = 0.08;
      }
      const enemyDt = (playerController && playerController.timeSlowTimer > 0 ? dt * 0.40 : dt) * worldScale;
      waveDirector.update(
        enemyDt,
        elapsedTime,
        playerController,
        interactables.getZoneState(),
        interactables
      );
      vfxManager.update(dt);
      updateUlt3dEffects(dt);

      // 4. Spatial 3D Audio & Adaptive Combat Pulse
      const waveHud = waveDirector.getHudState();
      soundEngine.setCombatIntensity(waveHud.combatIntensity);
      soundEngine.update(dt);

      // 5. Zero-GC HUD & Touch Overlay State Sync
      hudSnapshot.player = playerController.getStateSnapshot();
      hudSnapshot.weapon = lastWeaponState;
      hudSnapshot.crosshairSpread = weaponRes.crosshairSpread;
      hudSnapshot.wave = waveHud;
      hudSnapshot.boss = waveDirector.getBossState();
      hudSnapshot.zone = interactables.getZoneState();
      hudSnapshot.enemies = livingEnemies;
      hudSnapshot.pickups = interactables.getPickups();
      hudSnapshot.fps = engine.fps;
      hudSnapshot.gold = metaState.gold;
      hudSnapshot.loadout = weaponSystem.getLoadoutInfo();
      hudSnapshot.activeSynergies = getActiveSynergiesList();
      const nearDrop = interactables.getNearbyWeaponDrop(playerController.position);
      if (nearDrop) {
        const dropW = __require("src/config/weapons.js").WEAPONS[nearDrop.weaponIndex];
        const lo = hudSnapshot.loadout;
        const isSec = dropW && dropW.category === 'secondary';
        const curIdx = isSec ? lo.secondaryIndex : lo.primaryIndex;
        const curW = isSec ? lo.secondaryWeapon : lo.primaryWeapon;
        hudSnapshot.nearbyWeapon = dropW
          ? { weapon: dropW, isSame: curIdx === nearDrop.weaponIndex, currentName: curW ? curW.shortName : '' }
          : null;
      } else {
        hudSnapshot.nearbyWeapon = null;
      }

      hudManager.update(dt, hudSnapshot);
      updateTacticalFrameHudOverlay(hudSnapshot.player, playerController && playerController.mods);
      if (tutorialState.active) {
        if (tutorialState.step === 1 && tutorialState.didDash && tutorialState.didJumpPad && tutorialState.didBarrel) {
          advanceTutorialStep(2);
        } else if (tutorialState.step === 3) {
          if (playerController.isGuarding) {
            tutorialState.guardHoldSec += dt;
            updateTutorialBannerUI();
          }
          if (tutorialState.guardHoldSec >= 0.8 && tutorialState.pickedItem) {
            advanceTutorialStep(4);
          }
        } else if (tutorialState.step === 5) {
          if (Math.hypot(playerController.position.x, playerController.position.z) <= 5.5) {
            tutorialState.enteredBeacon = true;
            updateTutorialBannerUI();
          }
          if (tutorialState.enteredBeacon && tutorialState.usedUlt) {
            advanceTutorialStep(6);
          }
        }
      }
      touchOverlay.syncState(hudSnapshot);

      // Safety death transition check
      if (!playerController.isAlive && gameState === 'playing') {
        beginEndingSequence(false);
      }

      // Pause key check (P / ESC)
      if (pauseDebounce <= 0 && input.consumePressed('pause') && gameState === 'playing') {
        pauseGame();
      }

      input.endFrame();
    } else if (gameState === 'paused') {
      if (pauseDebounce <= 0 && input.consumePressed('pause')) {
        resumeFromPause();
      }
      input.endFrame();
    } else if (gameState === 'ending') {
      // 0.5s slow-motion death/victory linger (0.25x residual animation/VFX, input disabled)
      endingTimer -= dt;
      const simDt = dt * ENDING_SLOWMO_SCALE;
      elapsedTime += simDt;

      if (!endingIsVictory) {
        playerController.update(simDt, playerUpdateOpts);
      }
      mapManager.update(simDt, elapsedTime);
      interactables.update(simDt, elapsedTime, null, null, null);
      vfxManager.update(simDt);
      soundEngine.setCombatIntensity(0);
      soundEngine.update(dt);
      input.endFrame();

      if (endingTimer <= 0 && !endingFadeStarted) {
        endingFadeStarted = true;
        runFadeTransition(() => enterResultScene(endingIsVictory));
      }
    }

    engine.recordFrame(rawDt);
    engine.render();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
} else {
  bootstrap();
}
});
