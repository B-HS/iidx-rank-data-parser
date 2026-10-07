# 아키텍처

## 구성 요소

| 경로                                    | 역할                                                                 |
| --------------------------------------- | -------------------------------------------------------------------- |
| `src/content-script.ts`                 | e-agate 페이지에서 DOM을 읽어 파싱 결과를 돌려주는 브리지            |
| `src/rank-content-script.ts`            | iidx-rank 페이지에서 가져오기 화면과 background를 잇는 브리지        |
| `src/core/eagate-parsers.ts`            | 로그인·DJ 정보·노트레이더·난이도 페이지 파서(순수 함수)              |
| `src/core/chart-id.ts`                  | iidx-rank와 동일한 `chart-<sha256 32자>` 식별자 생성                 |
| `src/core/collection-flow.ts`           | 난이도 페이지 종료 판정, 수집 정체 판정, 노트레이더 선택(순수 함수)  |
| `src/core/dataset-builder.ts`           | 수집 결과를 검증·정규화해 dataset으로 조립                           |
| `src/core/rank-export.ts`               | dataset을 rank-import v2 본문으로 변환                               |
| `src/core/rank-client.ts`               | iidx-rank 세션 확인 호출과 응답 분류                                 |
| `src/core/rank-sync.ts`                 | 반영 시작 판단, 화면이 보고한 결과의 상태 변환(순수 함수)            |
| `src/core/rank-handoff.ts`              | handoff 만료 판정, content script 요청의 보낸 쪽 확인(순수 함수)     |
| `src/core/rank-bridge.ts`               | 가져오기 화면과의 `window.postMessage` 대화 로직                     |
| `src/background/*`                      | 탭 오케스트레이션, 진행률 저장, 반영 실행, popup 요청 처리           |
| `src/shared/schema.ts`                  | Zod 단일 출처 DTO                                                    |
| `src/shared/rank-schema.ts`             | rank-import v2와 iidx-rank 응답, handoff, 반영 상태 스키마           |
| `src/shared/rank-bridge-schema.ts`      | 가져오기 화면과 주고받는 메시지 스키마                               |
| `src/shared/message-keys.ts`            | background가 저장하는 메시지 키와 파라미터 정의                      |
| `src/shared/i18n.ts`                    | popup 메시지 키, `chrome.i18n` 번역 헬퍼, 날짜·숫자 포맷             |
| `src/shared/storage.ts`                 | `chrome.storage` 읽기·쓰기 래퍼                                      |
| `src/widgets/popup/popup.tsx`           | background와 통신하고 카드들을 조립하는 popup 본체                   |
| `src/features/<이름>/<이름>.tsx`        | props로만 데이터를 받는 카드 컴포넌트(1파일 1컴포넌트)               |
| `src/ui/*`                              | Button, Badge, Card, Progress 기본 컴포넌트                          |
| `public/_locales/{ko,ja,en}`            | `chrome.i18n` 메시지. 세 로케일의 키 집합은 테스트가 같게 강제합니다 |
| `config/manifest.ts`, `config/build.ts` | `RANK_ORIGIN`을 `host_permissions`·content script·번들 상수로 주입   |

파서는 순수 함수이고 `Document`만 입력으로 받습니다. 네트워크·스토리지·권한은 background 계층에만 있습니다.

## 계층과 의존 방향

`widgets → features → ui → shared` 순으로만 참조합니다. popup 계층은 `src/core`·`src/background`를 import하지 않고, background와는 `chrome.runtime.sendMessage`로만 통신합니다. 요청과 응답은 `src/shared/messages.ts`의 Zod 스키마로 검증하며, popup은 응답을 `BackgroundResponseSchema`로 파싱한 뒤에만 사용합니다.

React Compiler는 쓰지 않습니다. 번들러가 Bun.build라 babel 파이프라인이 없기 때문입니다. `useCallback`·`useMemo`는 쓰지 않고, effect 안에서 쓰는 함수는 effect 내부나 모듈 수준에 둡니다.

## 메시지와 i18n

background는 문장을 만들지 않고 `{ key, params }`만 저장합니다(`LocalizedMessage`). `params`는 `MESSAGE_PARAMS`가 정한 순서의 문자열 배열이라 `chrome.i18n.getMessage(key, params)`에 그대로 넘깁니다. popup이 표시할 때 번역하므로 브라우저 언어가 바뀌어도 저장된 상태가 다시 번역되고, 내보내는 dataset의 `meta.warnings`도 키와 파라미터로 남습니다.

- popup 전용 문구의 키와 파라미터는 `src/shared/i18n.ts`의 `POPUP_MESSAGE_PARAMS`가 정의합니다.
- `t(key, params)`는 키에 선언된 파라미터만 받습니다. 번역이 비어 있으면 키 이름을 대신 보여 주어 빈 문자열이 화면에 나오지 않습니다.
- 날짜와 숫자는 `Intl`에 `chrome.i18n.getUILanguage()`를 넘겨 포맷합니다.
- DJ NAME, IIDX ID, EX SCORE, NOTES 등 게임 고유 용어는 번역하지 않습니다.
- `tests/i18n-keys.test.ts`가 세 로케일의 키 집합, placeholder 이름과 순서, 코드가 쓰는 키의 존재, manifest의 `__MSG_*__` 참조, 화면 코드의 한국어·일본어 하드코딩 여부를 검사합니다.

## 수집 오케스트레이션

background는 popup의 요청을 받으면 `runCollection`을 실행합니다. 전체는 하나의 탭에서 순차로 진행됩니다. 실행 잠금(`runState.active`)은 동기적으로 잡아 두 수집이 겹치지 않게 합니다.

1. 로그인 확인 — `index.html`을 열고 로그인 상태를 판정합니다. 60초 이내의 성공 결과는 재사용합니다.
2. DJ 정보 — `djdata/status.html`에서 플레이어와 노트레이더를 읽습니다. 로그인이 필요한 페이지면 `session_expired`로 실패합니다.
3. 노트레이더 — `djdata/music/notesradar.html`의 DOM을 읽고, status 페이지 값과 합쳐 라벨로 매칭된 값을 우선 선택합니다.
4. 곡 데이터 — 선택한 레벨마다 `difficult=<level-1>&style=<style>&disp=1&offset=<n>`을 0부터 50씩 증가시키며 요청합니다.
5. 저장 — `DatasetSchema`로 검증한 뒤 `chrome.storage.local`에 저장합니다.
6. 반영 — 저장이 끝나면 iidx-rank 세션이 있을 때 handoff를 만들고 iidx-rank 가져오기 화면을 새 활성 탭으로 엽니다. 업로드는 그 화면이 합니다(`docs/INTEGRATION.md`).

종료 판정은 `classifyDifficultyPage`가 파싱한 행 수로 합니다. 표가 있고 행이 50건 미만이면 종료, 안내 문구만 있으면 종료입니다. 표도 안내 문구도 없는 페이지는 종료가 아니라 예상 밖 페이지로 보고 재시도한 뒤 레벨 실패로 처리합니다. 레벨당 상한은 60페이지입니다.

실패 처리 규칙:

- 페이지는 2회까지 시도합니다. 응답에는 요청 URL과 같은 URL인지 확인합니다.
- 탭 닫힘·로딩 초과(25초)·세션 만료·연속 2레벨 실패가 나오면 남은 레벨을 실패로 표시하고 지금까지 모은 결과를 저장합니다. 상태는 `partial`입니다.
- 차트가 0건이고 실패 레벨이 있으면 저장하지 않고 실패로 끝냅니다. 이전의 정상 데이터를 빈 결과로 덮지 않기 위함입니다.
- 중단은 `AbortController`로 대기를 즉시 끊습니다. 수집 중에는 로그인 확인과 데이터 삭제를 거부합니다(`error_busy`).

### service worker 재시작 복구

service worker는 수집 도중 종료될 수 있습니다. 기동 시와 `GET_OVERVIEW`·`START_COLLECTION`·`CHECK_LOGIN`·`CLEAR_DATA` 앞에서 `reconcileCollection`이 저장소는 `running`인데 살아 있는 run이 없는 경우를 `failed` + `error_interrupted`로 바꾸고 남은 수집 탭을 닫습니다. `COLLECTION_STALE_MS`(5분)의 `updatedAt` 정체는 보조 판정입니다. 이 복구가 없으면 `running`이 영구히 남아 시작·삭제 버튼이 모두 막힙니다.

요청 사이에는 `DELAY_PROFILES`의 균등분포 대기를 둡니다. 서버 부하를 사람의 페이지 넘김 속도로 낮추기 위한 것이며 낮추지 않습니다.

## iidx-rank 반영

익스텐션은 가져오기 API를 직접 호출하지 않습니다. background가 handoff를 `chrome.storage.session`에 두고 `<RANK_ORIGIN>/import`를 열면, `RANK_ORIGIN`에 주입된 `rank-content-script`가 화면의 `ready`에 `payload`나 `none`으로 답하고 화면의 `result`를 background에 전달합니다. 메시지 표와 handoff 규칙은 `docs/INTEGRATION.md`에 있습니다.

- handoff와 진행 상태(`pending`)는 저장소에만 둡니다. service worker가 종료되어도 화면이 다시 물으면 같은 `handoffId`로 답합니다.
- background는 `GET_RANK_HANDOFF`와 `REPORT_RANK_RESULT`를 `RANK_ORIGIN` 탭의 최상위 프레임에서 온 것만 처리합니다.
- `GET_OVERVIEW`에서 `reconcileRankSync`가 handoff가 없거나 만료된 `pending`을 `failed` + `handoff_expired`로 바꿉니다.

## popup 화면

위에서 아래로 e-amusement 로그인, iidx-rank 계정, 수집 설정, 수집 시작, 진행, 저장된 데이터, iidx-rank 반영 카드가 있습니다.

- 버튼이 비활성이면 사유를 버튼 근처에 문장으로 보입니다(로그인 미확인·확인 실패·필요, 레벨 없음, 수집 중, 가져오기 화면을 여는 중, 저장 데이터 없음, DP).
- 반영 카드의 버튼은 `가져오기 화면을 열어 반영`이고 iidx-rank 로그인 여부로 막지 않습니다. 화면에서 결과가 오기 전에는 `반영 진행 중` 배지와 함께 탭에서 진행 중이라는 안내, 탭을 닫았으면 다시 시도하라는 안내를 보입니다.
- 로그인 상태는 미확인과 확인 실패와 비로그인을 서로 다른 배지로 구분합니다. 모든 배지는 색뿐 아니라 문구로 상태를 말합니다.
- 설정의 선택형 버튼은 `aria-pressed`, 그룹은 `role='group'`과 라벨 연결, 진행바는 `aria-label`, 진행 문구와 반영 결과는 `aria-live`, 오류는 `role='alert'`입니다.
- 경고는 4건까지 보이고 나머지는 건수로 생략합니다. 긴 DJ NAME·곡명·번역 문구는 줄바꿈하며 폭 420px에서 가로 넘침이 없습니다.
- 저장 데이터 삭제는 브라우저 `confirm` 대신 화면 안의 확인 단계를 거칩니다.
- SP 레벨 12만 iidx-rank에 반영된다는 안내를 설정 카드와 반영 카드에 둡니다. DP를 고르면 경고를 추가로 보입니다.
- background가 응답하지 않거나(40초 초과, 연결 오류, `undefined`) 응답 형식이 맞지 않으면 오류 배너를 보입니다.
- popup을 열 때마다 `GET_OVERVIEW` 뒤에 `CHECK_RANK_SESSION`을 보내 로그인 탭에서 돌아온 상태를 반영합니다.

## 권한 경계

| 권한                                | 사용 목적                                  |
| ----------------------------------- | ------------------------------------------ |
| `storage`, `unlimitedStorage`       | 수집 결과·로그인 상태·설정·반영 결과 저장  |
| `tabs`                              | 수집용 탭 생성·닫기·이동, 페이지 로딩 대기 |
| `host_permissions: p.eagate.573.jp` | 수집 대상 호스트 한정                      |
| `host_permissions: <RANK_ORIGIN>`   | iidx-rank 세션 확인, content script 주입   |

계정 비밀번호·쿠키 값을 코드에서 읽거나 저장하지 않습니다. iidx-rank 세션 확인은 `credentials: 'include'`로 브라우저가 세션 쿠키를 붙이게 하며 쿠키 헤더를 직접 다루지 않습니다. 가져오기 화면 경유로 바꾸면서 새로 추가한 권한은 없습니다.

`RANK_ORIGIN`은 빌드 시 환경변수로 정합니다. 기본값은 `https://iidx.hyns.dev`이고 `config/manifest.ts`가 `host_permissions`와 iidx-rank용 `content_scripts` 항목(`<RANK_ORIGIN>/*`, `rank-content-script.js`, `document_idle`)을 만들며 같은 값이 번들 상수로 주입됩니다. 정적 `public/manifest.json`에는 iidx-rank 출처가 없고 e-agate용 content script만 있습니다.

## 저장소 키

`STORAGE_KEYS`의 dataset·collection·login은 v2입니다. 기동 시 v1 값은 지워지므로 이전 버전에서 수집한 데이터는 다시 수집해야 합니다.

`SESSION_STORAGE_KEYS`(`chrome.storage.session`)에는 수집 탭 ID와 반영 handoff(`iidx:rank-handoff`)를 둡니다. 이전 버전이 저장한 `origin_rejected` 사유의 반영 상태는 스키마에 맞지 않아 읽을 때 버려집니다.

## 확장 지점

- 게임 버전: `GAME_VERSION` 상수 단일 지점.
- 페이지 구조 변경: `eagate-parsers.ts`의 선택자·정규식만 수정. UI·스토리지 계층은 그대로 유지됩니다.
- 새 문구: `MESSAGE_PARAMS`(background 저장용) 또는 `POPUP_MESSAGE_PARAMS`(popup 전용)에 키를 더하고 세 로케일에 모두 번역을 넣습니다. 빠지면 `tests/i18n-keys.test.ts`가 실패합니다.
- 서버 연동: `docs/INTEGRATION.md`를 따릅니다.
- 카카오 등 다른 외부 로그인: 서버 쪽 설정이며 익스텐션 변경은 없습니다(TODO).
