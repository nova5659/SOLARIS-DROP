# AETHER DROP: RECLAIM EARTH — Modular Architecture Guide

> **AI 어시스턴트(AI Studio 등) 안내**: 이 프로젝트는 빌드 도구 없이 GitHub Pages에서 바로 실행되는 모듈형 구조입니다. 전체 파일을 읽지 말고, 아래 표에서 수정 대상 기능에 해당하는 1~3개 파일만 열어 작업하세요.

## 기능별 수정 파일 매핑 (Quick Reference)
| 작업 목표 | 열어볼 파일 |
| :--- | :--- |
| **스테이지/웨이브 수 확장 (5 → 10스테이지)** | `src/config/waves.js`, `src/ai/WaveDirector.js` |
| **신규 맵 추가 및 구역 전환 연결** | `src/world/MapManager.js`, `src/world/Map3CitadelBuilder.js`(참고 템플릿), `src/runtime.js`(신규 파일 등록) |
| **신규 적 / 신규 보스 추가** | `src/ai/EnemyModelFactory.js`, `src/ai/EnemyAI.js`, `src/ai/WaveDirector.js` |
| **신규 공략 기믹 / 드랍 아이템 / 오브젝트** | `src/world/Interactables.js`, `src/ai/WaveDirector.js` |
| **신규 전술 카드 / 도전과제 / 영구 스탯 / 파일럿 기체** | `src/config/constants.js`, `src/main.js` |
| **무기 밸런스 / 오버클럭 / 사격 로직** | `src/config/weapons.js`, `src/weapons/WeaponSystem.js`, `src/weapons/WeaponModelFactory.js` |
| **플레이어 이동 / 대시 / 슬라이드 / 체력** | `src/player/PlayerController.js` |
| **사운드 / BGM 수정** | `src/audio/SoundEngine.js` |
| **인게임 HUD / 결과 화면 / 타이틀 UI** | `index.html`, `styles/main.css`, `src/ui/HudManager.js`, `src/main.js` |

## 새 JS 파일 추가 방법
1. `src/.../NewFile.js` 생성 후 `__define("src/.../NewFile.js", (__exports, __require) => { ... });` 형태로 작성
2. `src/runtime.js`의 `MODULE_FILES` 배열에 `"./.../NewFile.js"` 1줄 추가
3. 사용하는 파일에서 `const { ... } = __require("src/.../NewFile.js");`로 불러오기

## 폴더 구조
- `index.html`: 타이틀, 서브패널, HUD, 결과 화면 HTML 구조 (~1,150줄)
- `styles/main.css`: 전체 UI 및 HUD 스타일 (~4,550줄)
- `assets/`: 타이틀 키아트, 파일럿 로봇 4종, 전술 카드 13종 WebP 이미지
- `src/runtime.js`: Three.js 전역 주입 및 24개 모듈 병렬 로더
- `src/config/`: `constants.js`, `waves.js`, `weapons.js`
- `src/core/`: `EventBus.js`, `Engine.js`, `InputManager.js`
- `src/physics/`: `CollisionWorld.js`
- `src/player/`: `PlayerController.js`
- `src/world/`: `TextureGenerator.js`, `ArenaBuilder.js`, `Map2RefineryBuilder.js`, `Map3CitadelBuilder.js`, `MapManager.js`, `Interactables.js`
- `src/vfx/`: `VfxManager.js`
- `src/weapons/`: `WeaponModelFactory.js`, `WeaponSystem.js`
- `src/ai/`: `EnemyModelFactory.js`, `EnemyAI.js`, `WaveDirector.js`
- `src/audio/`: `SoundEngine.js`
- `src/ui/`: `HudManager.js`, `TouchOverlay.js`
- `src/main.js`: 메인 부트스트랩, 메타 상태, 서브패널 제어, 60FPS 게임 루프
