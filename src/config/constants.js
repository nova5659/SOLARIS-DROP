// Module: src/config/constants.js
__define("src/config/constants.js", (__exports, __require) => {
/**
 * AETHER DROP: RECLAIM EARTH — Core Game Constants, Event Bus Keys & Balance Tunings
 * Zero external dependencies. ES2022 module.
 */

const EVENTS = Object.freeze({
  WEAPON_FIRED: 'weapon:fired',
  WEAPON_RELOADED: 'weapon:reloaded',
  WEAPON_RELOAD_START: 'weapon:reload_start',
  WEAPON_SWITCHED: 'weapon:switched',
  WEAPON_MELEE: 'weapon:melee',
  DAMAGE_DEALT: 'damage:dealt',
  ENEMY_KILLED: 'enemy:killed',
  PLAYER_DAMAGED: 'player:damaged',
  PLAYER_HEALED: 'player:healed',
  PLAYER_DASH: 'player:dash',
  PLAYER_SLIDE: 'player:slide',
  PLAYER_JUMP: 'player:jump',
  PLAYER_JUMPPAD: 'player:jumppad',
  PLAYER_FOOTSTEP: 'player:footstep',
  BARREL_EXPLODED: 'barrel:exploded',
  PICKUP_COLLECTED: 'pickup:collected',
  ZONE_PROGRESS: 'zone:progress',
  WAVE_STARTED: 'wave:started',
  WAVE_CLEARED: 'wave:cleared',
  BOSS_PHASE: 'boss:phase',
  GAME_STATE: 'game:state',
  MAP_TRANSITION: 'map:transition',
  GOLD_COLLECTED: 'gold:collected',
  WEAPON_DROPPED: 'weapon:dropped',
  UPGRADE_SELECTED: 'upgrade:selected',
  ANNOUNCEMENT: 'hud:announcement',
  GUARD_BLOCKED: 'player:guard_blocked',
  ULTIMATE_USED: 'player:ultimate_used',
});



const HEAT_CONTRACTS = [
  { level: 0, label: 'HEAT 0 · 표준', enemyHpMult: 1.0, goldMult: 1.0, desc: '기본 난이도' },
  { level: 1, label: 'HEAT 1 · 경계', enemyHpMult: 1.25, goldMult: 1.35, desc: '적 HP +25% → 골드 +35%' },
  { level: 2, label: 'HEAT 2 · 격전', enemyHpMult: 1.55, goldMult: 1.75, desc: '적 HP +55% → 골드 +75%' },
  { level: 3, label: 'HEAT 3 · 극한', enemyHpMult: 1.90, goldMult: 2.25, desc: '적 HP +90% → 골드 +125%' },
];

const DAILY_MODIFIERS = [
  { id: 'hyper_mobility', name: '고속 기동전', desc: '이동속도 +28% · 대시 쿨 -28%', speedMult: 1.28, dashCdMult: 0.72 },
  { id: 'deadeye', name: '정밀 사격전', desc: '헤드샷 배율 +0.8x · 적 HP +25%', headshotBonus: 0.8, enemyHpMult: 1.25 },
  { id: 'glass_cannon', name: '초화력 교전', desc: '무기 피해 +35% · 적 HP +35%', dmgMult: 1.35, enemyHpMult: 1.35 },
  { id: 'vanguard_surge', name: '방호 돌파전', desc: '처치 쉴드 +22 · 최대 실드 +35', killShield: 22, shieldBonus: 35 },
];

const ACHIEVEMENTS = [
  { id: 'first_blood', cat: 'combat', catLabel: '전투', reward: 30, name: '첫 교전', desc: '적 1기 이상 격파' },
  { id: 'kills_50', cat: 'combat', catLabel: '전투', reward: 50, name: '전선 청소부', desc: '누적 적 50기 격파' },
  { id: 'kills_200', cat: 'combat', catLabel: '전투', reward: 100, name: '강철 수확자', desc: '누적 적 200기 격파' },
  { id: 'hs_15', cat: 'combat', catLabel: '전투', reward: 60, name: '정밀 사수', desc: '한 판 헤드샷 15회 달성' },
  { id: 'combo_5', cat: 'combat', catLabel: '전투', reward: 50, name: '연쇄 화력', desc: '최대 콤보 x5 달성' },
  { id: 'style_a', cat: 'combat', catLabel: '전투', reward: 40, name: '전술 리듬', desc: '스타일 랭크 A 이상 달성' },
  { id: 'style_s', cat: 'combat', catLabel: '전투', reward: 80, name: '스타일 마스터', desc: '스타일 랭크 S 이상 달성' },
  { id: 'style_sss', cat: 'combat', catLabel: '전투', reward: 150, name: '에이서 폭풍', desc: '스타일 랭크 SSS 달성' },
  { id: 'air_ace', cat: 'mobility', catLabel: '기동', reward: 60, name: '하늘의 지배자', desc: '한 판 공중 처치 5회' },
  { id: 'slide_ace', cat: 'mobility', catLabel: '기동', reward: 60, name: '지면 돌파자', desc: '한 판 슬라이드 처치 5회' },
  { id: 'melee_ace', cat: 'mobility', catLabel: '기동', reward: 60, name: '열선 블레이드', desc: '한 판 근접 처치 5회' },
  { id: 'swap_ace', cat: 'mobility', catLabel: '기동', reward: 60, name: '퀵드로우', desc: '한 판 무기 전환 처치 5회' },
  { id: 'drone_hunter', cat: 'ops', catLabel: '작전', reward: 50, name: '보급 사냥꾼', desc: '황금 보급 드론 격추' },
  { id: 'emp_tactician', cat: 'ops', catLabel: '작전', reward: 80, name: '전자전 전문가', desc: 'EMP 파일런 또는 쉴드 중계기 파괴' },
  { id: 'elite_slayer', cat: 'combat', catLabel: '전투', reward: 90, name: '전선 분쇄자', desc: '한 판에 이지스 신규 정예병 10기 격파' },
  { id: 'first_clear', cat: 'ops', catLabel: '작전', reward: 120, name: '지구 수복', desc: '캠페인 웨이브 5 보스 COLOSSUS-IV 격파' },
  { id: 'citadel_clear', cat: 'ops', catLabel: '작전', reward: 250, name: '이지스 성채 탈환', desc: '캠페인 웨이브 10 최종 보스 AEGIS-IX 격파' },
  { id: 'heat_clear', cat: 'ops', catLabel: '작전', reward: 220, name: '극한 돌파', desc: 'HEAT 2 이상에서 캠페인 최종 승리' },
  { id: 'endless_8', cat: 'ops', catLabel: '작전', reward: 120, name: '무한의 생존자', desc: '무한 강하 8웨이브 도달' },
  { id: 'endless_12', cat: 'ops', catLabel: '작전', reward: 200, name: '궤도의 전설', desc: '무한 강하 12웨이브 도달' },
];

function getTodayDailyModifier() {
  const now = new Date();
  const key = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
  return DAILY_MODIFIERS[key % DAILY_MODIFIERS.length];
}

const PILOT_FRAMES = [
  {
    id: 'vanguard',
    name: 'VANGUARD-09',
    tier: '표준 전술형',
    cost: 0,
    color: '#f59e0b',
    visorColor: 'rgba(245, 158, 11, 0.24)',
    baseFov: 80,
    hpBonus: 0,
    shieldBonus: 0,
    dashMax: 2,
    speedMult: 1.0,
    dmgMult: 1.0,
    airBonus: 0.0,
    dashCdMult: 1.0,
    killShield: 0,
    tacticalReload: true,
    guardMax: 100,
    guardCostMult: 1.0,
    specialName: '전술 리로드 집중',
    specialDesc: '표준 속도(1.0x) · 재장전 완료 시 2.5초간 연사속도 +25% & 반동 -35%',
    ultName: '궤도 포격 (ORBITAL BARRAGE)',
    ultDesc: '[X] 전방 적들에게 5발의 연쇄 궤도 폭격 투하 (각 180 광역 피해)',
  },
  {
    id: 'strider',
    name: 'STRIDER-04',
    tier: '초고속 기동형',
    cost: 1200,
    color: '#38bdf8',
    visorColor: 'rgba(56, 189, 248, 0.30)',
    baseFov: 88,
    hpBonus: -15,
    shieldBonus: -10,
    dashMax: 3,
    speedMult: 1.35,
    dmgMult: 1.0,
    airBonus: 0.40,
    dashCdMult: 0.70,
    killShield: 0,
    phaseBlink: true,
    lowGravity: true,
    guardMax: 85,
    guardCostMult: 1.05,
    specialName: '페이즈 블링크 & 에어 스트라이크',
    specialDesc: '초고속 기동(1.35x) · 대시 시 0.35초 위상 무적 + 공중 중력 -25% & 공중/슬라이드 피해 +40%',
    ultName: '타임 다이레이션 (PHASE OVERCLOCK)',
    ultDesc: '[X] 6초간 적 시간 60% 감속 + 초고속 연사·무한 탄창',
  },
  {
    id: 'bastion',
    name: 'BASTION-12',
    tier: '초중장갑 요새형',
    cost: 2400,
    color: '#22c55e',
    visorColor: 'rgba(34, 197, 94, 0.32)',
    baseFov: 74,
    hpBonus: 90,
    shieldBonus: 80,
    dashMax: 2,
    speedMult: 0.76,
    dmgMult: 1.08,
    airBonus: 0.0,
    dashCdMult: 1.05,
    killShield: 0,
    dashSlam: true,
    guardMax: 200,
    guardCostMult: 0.50,
    specialName: '지진 돌파 & 철벽 방패',
    specialDesc: '중장갑(0.76x) · HP +90/쉴드 +80 · 대시 시 7.5m 지진 강타(65피해) & [E] 방패 용량 2배·소모 절반',
    ultName: '이지스 포트리스 (AEGIS FORTRESS)',
    ultDesc: '[X] 7초간 완전 무적 에너지 돔 전개 + 주변 12m 지속 전기 충격 + 방패 즉시 완충',
  },
  {
    id: 'apex',
    name: 'APEX-ZERO',
    tier: '최상위 프로토타입',
    cost: 4800,
    color: '#ef4444',
    visorColor: 'rgba(239, 68, 68, 0.32)',
    baseFov: 84,
    hpBonus: 40,
    shieldBonus: 40,
    dashMax: 3,
    speedMult: 1.24,
    dmgMult: 1.18,
    airBonus: 0.20,
    dashCdMult: 0.78,
    killShield: 0,
    apexOverdrive: true,
    chainLightning: true,
    guardMax: 130,
    guardCostMult: 0.80,
    specialName: '오버드라이브 & 연쇄 번개',
    specialDesc: '고속 기동(1.24x) · 화력 +18% · 처치 시 대시 충전+3초 폭주 & 헤드샷 시 7m 연쇄 아크 번개(50피해)',
    ultName: '아포칼립스 노바 (APOCALYPSE NOVA)',
    ultDesc: '[X] 반경 28m 초신성 플라즈마 폭발(260 피해 + 3초 기절) & 5초간 화력 1.6배 폭주',
  },
];

const PILOT_FRAME_ART = {
  vanguard: "./assets/pilot-vanguard.webp",
  strider: "./assets/pilot-strider.webp",
  bastion: "./assets/pilot-bastion.webp",
  apex: "./assets/pilot-apex.webp",
};

const META_UPGRADES = [
  {
    id: 'firepower',
    name: '화력 코어',
    maxLevel: 10,
    baseCost: 70,
    costStep: 55,
    desc: '모든 무기 기본 피해량 +4% / Lv (최대 +40%)',
    formatBonus: (lv) => `기본 화력 +${lv * 4}%`,
  },
  {
    id: 'hull',
    name: '강화 장갑판',
    maxLevel: 10,
    baseCost: 70,
    costStep: 55,
    desc: '최대 체력 +12 / Lv (최대 +120 HP)',
    formatBonus: (lv) => `최대 체력 +${lv * 12}`,
  },
  {
    id: 'shield',
    name: '쉴드 캐패시터',
    maxLevel: 10,
    baseCost: 70,
    costStep: 55,
    desc: '최대 쉴드 +12 & 재생 속도 +8% / Lv',
    formatBonus: (lv) => `쉴드 +${lv * 12} · 재생 +${lv * 8}%`,
  },
  {
    id: 'thruster',
    name: '전술 추진기',
    maxLevel: 10,
    baseCost: 80,
    costStep: 60,
    desc: '이동 속도 +2.5% & 대시 쿨타임 -4.5% / Lv',
    formatBonus: (lv) => `이속 +${(lv * 2.5).toFixed(1)}% · 쿨 -${(lv * 4.5).toFixed(1)}%`,
  },
  {
    id: 'reload',
    name: '고속 급탄 장치',
    maxLevel: 10,
    baseCost: 75,
    costStep: 55,
    desc: '재장전 속도 +5% & 연사 속도 +2% / Lv',
    formatBonus: (lv) => `재장전 +${lv * 5}% · 연사 +${lv * 2}%`,
  },
  {
    id: 'crit',
    name: '정밀 사격 광학',
    maxLevel: 10,
    baseCost: 85,
    costStep: 60,
    desc: '헤드샷 치명타 배율 +0.08x / Lv (최대 +0.80x)',
    formatBonus: (lv) => `헤드샷 배율 +${(lv * 0.08).toFixed(2)}x`,
  },
  {
    id: 'siphon',
    name: '전투 회복 모듈',
    maxLevel: 10,
    baseCost: 80,
    costStep: 60,
    desc: '적 처치 시 쉴드 추가 회복 +3 / Lv (최대 +30)',
    formatBonus: (lv) => `처치 시 쉴드 +${lv * 3}`,
  },
  {
    id: 'salvage',
    name: '전리품 회수 코어',
    maxLevel: 10,
    baseCost: 65,
    costStep: 50,
    desc: '전투 중 획득 골드 +8% / Lv (최대 +80%)',
    formatBonus: (lv) => `골드 획득 +${lv * 8}%`,
  },
];

const SYNERGIES = Object.freeze({
  assault: {
    id: 'assault',
    name: '화력 공명',
    tagLabel: '화력',
    color: '#f59e0b',
    threshold: 2,
    tier4Threshold: 4,
    desc: '2장: 헤드샷 시 4m 폭발(+35) · 4장: 전 무기 피해 +25% & 폭발 반경 7m',
  },
  mobility: {
    id: 'mobility',
    name: '기동 과부하',
    tagLabel: '기동',
    color: '#22c55e',
    threshold: 2,
    tier4Threshold: 4,
    desc: '2장: 대시 후 2초 탄약무한·연사 +30% · 4장: 이속 +18% & 대시 쿨 -30%',
  },
  vanguard: {
    id: 'vanguard',
    name: '철벽 방벽',
    tagLabel: '방어',
    color: '#38bdf8',
    threshold: 2,
    tier4Threshold: 4,
    desc: '2장: [E] 방패 내구도 +40% & 충전 +30% · 4장: 방패 파괴 시 10m 충격파(110 피해)',
  },
  tactical: {
    id: 'tactical',
    name: '전술 과충전',
    tagLabel: '전술',
    color: '#c084fc',
    threshold: 2,
    tier4Threshold: 4,
    desc: '2장: 궁극기 충전 +30% & 드랍 회복 +25% · 4장: 궁극기 발동 시 방패 완충 + 4초 화력 +35%',
  },
});

const CROSS_SYNERGIES = Object.freeze([
  {
    id: 'hyper_barrage',
    name: '초음속 탄막',
    requires: ['assault', 'mobility'],
    desc: '[화력2 + 기동2] 대시 후 2.5초간 사격 피해 1.35배 증폭',
  },
  {
    id: 'aegis_converter',
    name: '절대 방벽 변환',
    requires: ['vanguard', 'tactical'],
    desc: '[방어2 + 전술2] 방패 소모 -25% & 방패로 막을 때마다 궁극기 +4% 충전',
  },
]);

const TACTICAL_CARDS = [
  // === ASSAULT (화력 6장) ===
  {
    id: 'tungsten_core',
    tag: 'assault',
    name: '텅스텐 코어 탄두',
    desc: '모든 무기 피해량 +18%',
  },
  {
    id: 'overclock_mag',
    tag: 'assault',
    name: '고속 탄창 급탄',
    desc: '재장전 속도 +30%, 연사속도 +12%',
  },
  {
    id: 'precision_refund',
    tag: 'assault',
    name: '정밀 관통 회수',
    desc: '헤드샷 배율 +0.4x, 적 처치 시 탄창 3발 즉시 환급',
  },
  {
    id: 'armor_piercer',
    tag: 'assault',
    name: '아머 피어서',
    desc: '모든 무기 피해 +14%, 헤드샷 배율 +0.35x, 방패·보스 대상 추가 피해 +22%',
  },
  {
    id: 'mark_contagion',
    tag: 'assault',
    rare: true,
    name: '표식 전이',
    desc: '표식/헤드샷 적 처치 시 반경 10m 내 적 2기에게 표식 전이 + 25 피해',
  },
  {
    id: 'thermal_nova',
    tag: 'assault',
    rare: true,
    name: '과열 폭발',
    desc: 'W-01 과열 도달 또는 재장전 완료 시 전방 9m 화염 폭발(75 피해)',
  },

  // === MOBILITY (기동 6장) ===
  {
    id: 'thruster_tune',
    tag: 'mobility',
    name: '추진기 튜닝',
    desc: '이동 속도 +12%, 옴니 대시 쿨타임 -25%',
  },
  {
    id: 'slide_reload',
    tag: 'mobility',
    name: '슬라이드 자동 장전',
    desc: '슬라이드 또는 대시 발동 시 현재 탄창 40% 즉시 장전',
  },
  {
    id: 'aerial_gunner',
    tag: 'mobility',
    name: '공중·슬라이드 사격술',
    desc: '공중 또는 슬라이드 중 무기 피해량 +28%',
  },
  {
    id: 'kinetic_momentum',
    tag: 'mobility',
    name: '운동 에너지 순환',
    desc: '이동 속도 +12%, 대시 쿨타임 -18%, 적 처치 시 탄창 3발 회수 & 방패 에너지 +10',
  },
  {
    id: 'repulsor_slam',
    tag: 'mobility',
    rare: true,
    name: '충격 강하',
    desc: '공중·로켓점프 후 착지 시 반경 7.5m 적에게 60 충격 피해 + 강넉백',
  },
  {
    id: 'slide_overclock',
    tag: 'mobility',
    rare: true,
    name: '슬라이드 폭주',
    desc: '슬라이드 중 사격 시 탄약·열기 미소모 + 확정 치명타(피해 1.6배)',
  },

  // === VANGUARD (방어 6장 — 전방 방패 & 드랍 생존 특화!) ===
  {
    id: 'siphon_boost',
    tag: 'vanguard',
    name: '강화 방패 셀',
    desc: '최대 쉴드 +25, [E] 전방 방패 최대 내구도 +40 & 방패 충전 속도 +30%',
  },
  {
    id: 'beacon_resonance',
    tag: 'vanguard',
    name: '테라비콘 공명',
    desc: '거점 구역 내 초당 체력 +7 회복 & 피해량 추가 +20%',
  },
  {
    id: 'reactive_armor',
    tag: 'vanguard',
    name: '반응형 충격 장갑',
    desc: '피격 시 주변 6m 적에게 40 반사 피해 + 넉백',
  },
  {
    id: 'aegis_capacitor',
    tag: 'vanguard',
    name: '이지스 캐패시터',
    desc: '최대 체력 +35, 최대 쉴드 +35, [E] 방패 피격 소모량 -22%',
  },
  {
    id: 'shield_counter',
    tag: 'vanguard',
    rare: true,
    name: '방패 역충격',
    desc: '[E] 방패로 탄환을 막을 때 전방 9m 충격파 반사(45 피해) & 방패 최대치 +35',
  },
  {
    id: 'field_medic',
    tag: 'vanguard',
    name: '야전 보급 효율',
    desc: '바닥 회복/쉴드 드랍 아이템 회복량 +55% & [E] 방패 충전 속도 +35%',
  },

  // === TACTICAL (전술 6장 — 궁극기 · 자동 업그레이드 · 드랍 특화!) ===
  {
    id: 'ult_accelerator',
    tag: 'tactical',
    name: '궁극기 가속 코어',
    desc: '[X] 궁극기 게이지 충전 속도 +40%',
  },
  {
    id: 'auto_forge',
    tag: 'tactical',
    name: '자동 병기 제련',
    desc: '무기 자동 업그레이드(MK)당 추가 피해 +12% & 재장전 속도 +18%',
  },
  {
    id: 'scavenger_protocol',
    tag: 'tactical',
    name: '전리품 탐색기',
    desc: '획득 골드 +30% & 바닥 아이템 회복량 +25% & 궁극기 충전 +15%',
  },
  {
    id: 'orbital_overload',
    tag: 'tactical',
    rare: true,
    name: '궤도 과부하',
    desc: '연사 속도 +16%, 헤드샷 처치 시 주변 7.5m 적에게 65 아크 충격파 연쇄 피해',
  },
  {
    id: 'ult_overdrive',
    tag: 'tactical',
    rare: true,
    name: '초임계 궁극기',
    desc: '[X] 궁극기 피해량 +45% & 궁극기 지속시간 +2초',
  },
  {
    id: 'shield_to_ult',
    tag: 'tactical',
    rare: true,
    name: '에너지 변환 장치',
    desc: '[E] 방패로 막은 피해의 60%를 [X] 궁극기 게이지로 즉시 전환',
  },
];

const PLAYER_CONFIG = {
  // Capsule & camera dimensions (meters)
  radius: 0.45,
  standHeight: 1.75,
  crouchHeight: 1.05,
  eyeOffset: 0.15,
  stepHeight: 0.55,

  // Ground & air locomotion (m/s, m/s^2)
  walkSpeed: 7.8,
  sprintSpeed: 11.4,
  adsSpeedMultiplier: 0.62,
  airControl: 0.40,
  groundAccel: 68,
  groundFriction: 11,
  gravity: 26,

  // Jump & forgiveness windows
  jumpVelocity: 10.4,
  doubleJumpVelocity: 9.6,
  coyoteTime: 0.14,
  jumpBufferTime: 0.14,

  // Momentum slide
  slideBoostSpeed: 16.0,
  slideMinSpeed: 5.5,
  slideDuration: 0.72,
  slideFriction: 3.0,
  slideCameraRollDeg: 5.5,

  // 2-charge directional omni-dash
  dashSpeed: 24.5,
  dashDuration: 0.16,
  dashMaxCharges: 2,
  dashCooldown: 2.2,

  // Vitality & aggressive shield-siphon loop
  maxHealth: 100,
  maxShield: 100,
  shieldRegenDelay: 3.0,
  shieldRegenRate: 0,
  killShieldBonus: 0,
  headshotShieldBonus: 0,

  // Dynamic camera FOV (degrees)
  baseFov: 80,
  sprintFovBonus: 4.5,
  slideFovBonus: 8.5,
  dashFovBonus: 12.0,

  // Mobile / tablet aim assist
  touchAimAssistConeDeg: 7.5,
  touchAimAssistStrength: 0.35,

  // Quick thermal pry-blade melee
  meleeRange: 2.8,
  meleeDamage: 65,
  meleeCooldown: 0.55,
};

const QUALITY_PRESETS = {
  low: {
    label: 'LOW',
    dprMax: 0.85,
    bloomEnabled: false,
    bloomStrength: 0.0,
    bloomRadius: 0.0,
    bloomThreshold: 1.1,
    shadowsEnabled: false,
    shadowMapSize: 512,
    maxParticles: 80,
    maxDecals: 24,
    dynamicLights: 1,
    fogDensity: 0.0038,
  },
  medium: {
    label: 'MEDIUM',
    dprMax: 1.0,
    bloomEnabled: true,
    bloomStrength: 0.16,
    bloomRadius: 0.22,
    bloomThreshold: 1.12,
    shadowsEnabled: true,
    shadowMapSize: 1024,
    maxParticles: 180,
    maxDecals: 56,
    dynamicLights: 2,
    fogDensity: 0.0034,
  },
  high: {
    label: 'HIGH',
    dprMax: 1.35,
    bloomEnabled: true,
    bloomStrength: 0.20,
    bloomRadius: 0.26,
    bloomThreshold: 1.08,
    shadowsEnabled: true,
    shadowMapSize: 1024,
    maxParticles: 320,
    maxDecals: 96,
    dynamicLights: 2,
    fogDensity: 0.0030,
  },
};

const ARENA_CONFIG = {
  name: 'SECTOR-09 // SOLARIS PLAZA',
  size: 64,
  halfSize: 32,
  wallHeight: 11,
  controlZoneRadius: 7.5,
  controlZoneCaptureTime: 22,
  barrelDamage: 165,
  barrelRadius: 8.5,
  barrelRespawnTime: 24,
};

const MAPS = [
  {
    index: 0,
    id: 'dead_metropolis',
    code: 'SEC-09',
    name: 'SECTOR-09 // SOLARIS PLAZA',
    subtitle: 'SUNLIT SKY-OVERPASS & BEACON TERRACE',
    waves: [1, 2],
  },
  {
    index: 1,
    id: 'sunken_refinery',
    code: 'SEC-14',
    name: 'SECTOR-14 // HELIOS HYDRO-PLANT',
    subtitle: 'COASTAL SOLAR REFINERY & AQUA BASIN',
    waves: [3, 4],
  },
  {
    index: 2,
    id: 'crater_citadel',
    code: 'SEC-00',
    name: 'SECTOR-00 // SKY-SPIRE CITADEL',
    subtitle: 'SUNLIT ORBITAL ELEVATOR — BOSS CRUCIBLE',
    waves: [5],
  },
  {
    index: 3,
    id: 'aegis_flight_deck',
    code: 'SEC-61',
    name: 'SECTOR-61 // CLOUDBREAK DECK',
    subtitle: 'HIGH-ALTITUDE AEROSPACE CARRIER APRON',
    waves: [6, 7],
  },
  {
    index: 4,
    id: 'aegis_reactor_bay',
    code: 'SEC-74',
    name: 'SECTOR-74 // PRISM SOLAR CORE',
    subtitle: 'RADIANT PHOTON ARRAY & ATRIUM HALL',
    waves: [8, 9],
  },
  {
    index: 5,
    id: 'aegis_drydock',
    code: 'SEC-99',
    name: 'SECTOR-99 // STRATOSPHERE HALO',
    subtitle: 'ORBITAL COMMAND CITADEL — FINAL BOSS',
    waves: [10],
  },
];

const SCORE_CONFIG = {
  comboTimeout: 4.8,
  maxComboMultiplier: 5,
  headshotBonus: 50,
  zoneCaptureBonus: 1200,
  waveClearBaseBonus: 500,
};
  __exports.EVENTS = EVENTS;
  __exports.PLAYER_CONFIG = PLAYER_CONFIG;
  __exports.QUALITY_PRESETS = QUALITY_PRESETS;
  __exports.ARENA_CONFIG = ARENA_CONFIG;
  __exports.MAPS = MAPS;
  __exports.SCORE_CONFIG = SCORE_CONFIG;
  __exports.META_UPGRADES = META_UPGRADES;
  __exports.SYNERGIES = SYNERGIES;
  __exports.CROSS_SYNERGIES = CROSS_SYNERGIES;
  __exports.TACTICAL_CARDS = TACTICAL_CARDS;
  __exports.PILOT_FRAMES = PILOT_FRAMES;
  __exports.PILOT_FRAME_ART = PILOT_FRAME_ART;
  __exports.HEAT_CONTRACTS = HEAT_CONTRACTS;
  __exports.DAILY_MODIFIERS = DAILY_MODIFIERS;
  __exports.ACHIEVEMENTS = ACHIEVEMENTS;
  __exports.getTodayDailyModifier = getTodayDailyModifier;
});
