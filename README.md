# EMBERHIDE

https://rak-kr.github.io/EMBERHIDE/

대형 몬스터 수렵 액션 — 전투 프로토타입 (Three.js, 외부 리소스 없음)

## 실행
GitHub 저장소에 이 폴더 내용을 그대로 올리고 Pages 를 켜면 주소로 바로 플레이됩니다.
로컬에서는 `python -m http.server` 등으로 폴더를 서버로 띄운 뒤 접속하세요 (파일 더블클릭으로는 모듈이 로드되지 않습니다).

## 파일 구조
| 파일 | 역할 |
|---|---|
| `index.html` | 화면 구조(HUD, 메뉴, 터치 버튼) |
| `css/style.css` | UI 스타일 |
| `js/config.js` | **밸런스 수치** — 체력, 공격 위력, 모션 길이, 부위 내구도 |
| `js/main.js` | 렌더러, 후처리, 카메라, 게임 흐름 |
| `js/world.js` | 지형, 하늘, 조명, 풀, 바위, 나무 |
| `js/player.js` | 헌터 모델, 이동/회피, 태도 모션과 판정 |
| `js/monster.js` | 몬스터 모델, 보행, AI 패턴, 부위 파괴 |
| `js/fx.js` | 입자, 검 궤적, 예고 표시, 대미지 숫자 |
| `js/audio.js` | 효과음 합성 |
| `js/input.js` | 키보드/마우스/터치 입력 |
| `js/ui.js` | HUD 갱신, 결과 화면 |
| `js/util.js` | 수학, 노이즈, 절차적 텍스처, IK |
| `vendor/`, `fonts/` | Three.js 와 글꼴 (수정 불필요) |

## 조작
WASD 이동 · Shift 달리기 · Space 회피 · 좌클릭 연속 베기 · 우클릭 강베기 · E 흘려베기 · F 오의 · Q 회복약 · R 록온 · M 음소거
