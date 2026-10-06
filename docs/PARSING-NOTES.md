# e-agate 페이지 구조 근거

파서가 기대하는 DOM 구조와 그 근거입니다. 페이지가 바뀌면 이 문서를 먼저 갱신합니다.

## 공통

- 로그인 상태 표시: `#log-on .on-name` 목록. 각 항목은 `li` 두 개(라벨, 값)입니다. 비로그인은 값이 `---`입니다.
- 로그인 필요 페이지: `#error-page .error_login`과 페이지 내 `userstatus` 스크립트의 `"login": false`.
- 페이지는 Shift_JIS일 수 있습니다. `document` 파싱 후에는 영향이 없지만, 원문 문자열을 다룰 때 주의합니다.

## status.html

근거: `eacache.s.konaminet.jp/game/2dx/34/css/djdata/status.css`

| 선택자                                       | 내용                                                        |
| -------------------------------------------- | ----------------------------------------------------------- |
| `.dj-status .dj-profile table tr`            | 라벨 td + 값 td 쌍                                          |
| `.dj-profile table td:first-child`           | 라벨 열 (width 80px)                                        |
| `.dj-status .dj-rank .point-cat`             | DJ POINT 등 포인트 계열                                     |
| `.dj-status .dj-rank .visit-cat`             | 플레이 횟수 계열                                            |
| `.dj-status .dj-rank#notes`                  | 노트레이더 블록                                             |
| `#notes ul li`                               | 축 하나. `p` 두 개(라벨, 값)                                |
| `#notes ul li:first-child` ~ `:nth-child(6)` | NOTES, CHORD, PEAK, CHARGE, SCRATCH, SOF-LAN 색상 지정 순서 |

CSS는 `#notes ul li:first-child > p`에 분홍(`#ff40eb`), 6번째에 파랑(`#0086e5`)을 지정합니다. 축 순서가 고정임을 시사합니다. 파서는 축 이름 매칭을 우선하고, 이름이 없을 때만 순서 기반으로 채웁니다. `matchedByLabel: false`가 그 경우입니다.

## notesradar.html

- 페이지 로드 후 `POST djdata/music/json/notesradar.html`이 비동기로 호출되어 레이더 값을 받습니다. `style`(또는 `play_style`) 파라미터를 받으며 비로그인 시 빈 본문을 돌려줍니다.
- 익스텐션은 이 엔드포인트를 먼저 시도하고, 응답이 비면 DOM 파싱으로 대체합니다.
- DOM 구조는 status.html의 `#notes`와 같은 계열로 가정합니다. 같은 CSS(`status.css`)가 두 페이지를 함께 다룹니다.

## difficulty.html

근거: `eacache.s.konaminet.jp/game/2dx/34/css/djdata/music.css`, `everybodyeverybody/iidx_eamuse_scraper`, `OhSorry-DP/ohSorry`의 `modules/eagateFetch.js`(level 모드 시절 구현)

| 선택자                           | 내용                                                      |
| -------------------------------- | --------------------------------------------------------- |
| `div.series-difficulty table`    | 곡 목록 표                                                |
| `div.series-difficulty table tr` | 곡 한 행. td 5개                                          |
| `td:first-child`                 | 곡명 링크 `a.music_info`                                  |
| `td:nth-child(2)`                | 난이도 텍스트 (BEGINNER/NORMAL/HYPER/ANOTHER/LEGGENDARIA) |
| `td:nth-child(3)`                | DJ LEVEL 이미지                                           |
| `td:nth-child(4)`                | EX SCORE (예: `3123(1500/123)`)                           |
| `td:last-child`                  | 클리어 램프 이미지                                        |
| 램프 이미지                      | `clflg<N>.gif`. N은 0=NO PLAY … 7=FULL COMBO              |
| 데이터 없음                      | 본문에 `データがみつかりません`                           |
| 페이지네이션                     | `offset` 파라미터. 0부터 50씩 증가                        |

CSS의 열 너비 지정(1열 30%, 2열 10%, 3열 10%, 4열 15%, 5열 25%)이 td 5개 구조와 일치합니다.

### 난이도 파라미터

URL의 `difficult`는 게임 레벨보다 1 작습니다. 레벨 12는 `difficult=11`입니다. OhSorry 구현도 `String(lv - 1)`을 사용합니다. `style`은 0=SP, 1=DP입니다.

## 이미지 경로

이미지 하위 경로는 버전별로 달라질 수 있어 파일명만 사용합니다.

- 램프: `/clflg(\d)\.gif/`
- DJ LEVEL: 파일명 stem이 `F`~`AAA`인 `.gif`

경로 전체를 고정하지 않으므로 CDN 경로가 바뀌어도 파서가 유지됩니다.

## 확인 필요 항목

로그인 세션 없이는 다음을 확정할 수 없습니다. 첫 실제 수집에서 확인하고 이 문서를 갱신합니다.

- status.html의 실제 라벨 문자열(DJ POINT, 플레이 횟수의 정확한 표기와 합계 위치).
- `json/notesradar.html`의 실제 응답 스키마와 파라미터 이름. 현재는 `style`과 `play_style`을 함께 보내고, 응답에서는 축 이름과 숫자를 재귀적으로 찾습니다.
- 노트레이더 페이지의 DOM이 status.html과 실제로 동일한지.
- 테이블 헤더 행이 있는지(파서는 `td` 4개 이상인 행만 처리하므로 헤더는 자연히 건너뜁니다).
