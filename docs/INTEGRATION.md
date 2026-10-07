# iidx-rank 연동

정본 계약은 iidx-rank 저장소의 `docs/E-AMUSEMENT.md`이고 결정 근거는 `docs/acknowledge/2026-10-07-eamusement-import-oauth.md`입니다. 이 문서는 익스텐션 쪽 동작만 정리하며 둘이 다르면 계약 문서가 우선합니다. 메시지 규약은 계약의 "익스텐션 반영 흐름 (페이지 경유)" 절을 그대로 따릅니다.

대상: `/Users/hyunseokbyun/development/iidx-rank` (Next.js + Drizzle + better-auth)

## 방식 — 가져오기 화면 경유

익스텐션은 사용자를 따로 인증하지 않고 `POST /api/import/records`도 직접 호출하지 않습니다. iidx-rank의 가져오기 화면(`<RANK_ORIGIN>/import`)을 열어 수집 데이터를 넘기면, 그 화면이 사이트 자신의 요청으로 업로드하고 결과를 돌려줍니다. 서버에 익스텐션 ID를 등록하지 않으며 ID가 바뀌어도 영향이 없습니다. 일회용 코드를 교환하는 인증 위임 설계는 채택하지 않았습니다.

1. popup을 열 때 `GET /api/extension/session`으로 로그인 여부를 확인합니다. 응답은 `{ user: { id, name, handle } | null }`입니다.
2. 로그인되어 있지 않으면 popup의 `iidx-rank 로그인 열기`가 `RANK_ORIGIN`을 새 탭으로 엽니다. 로그인한 뒤 popup을 다시 열거나 `다시 확인`을 누르면 세션을 다시 읽습니다.
3. 반영을 시작하면 background가 handoff(`handoffId`, `createdAt`)를 `chrome.storage.session`에 두고 `<RANK_ORIGIN>/import`를 새 활성 탭으로 엽니다. 마지막 반영 상태는 `pending`이 됩니다.
4. iidx-rank 출처에 주입된 content script(`src/rank-content-script.ts`)가 화면과 `window.postMessage`로 대화해 본문을 넘깁니다.
5. 화면이 업로드하고 `result`를 돌려주면 background가 마지막 반영 상태로 저장하고 handoff를 지웁니다.

익스텐션은 쿠키 값을 읽거나 저장하지 않습니다. 세션 확인만 `fetch(..., { credentials: 'include', cache: 'no-store' })`로 하며, `host_permissions`의 `RANK_ORIGIN`은 이 요청과 content script 주입에 쓰입니다. 본문에는 사용자 식별 정보를 넣지 않습니다. 서버는 세션의 사용자 UUID로만 반영합니다.

## 반영 시작

`planRankSync`(`src/core/rank-sync.ts`)가 저장된 dataset을 보고 시작 여부를 정합니다. 시작하지 않는 경우는 가져오기 화면을 열지 않고 결과만 기록합니다.

| 상태      | 사유 코드                  | 조건                                                    |
| --------- | -------------------------- | ------------------------------------------------------- |
| `skipped` | `no_data`                  | 저장 데이터가 없거나 차트가 0건                         |
| `skipped` | `dp_unsupported`           | 저장 데이터의 스타일이 DP                               |
| `failed`  | `invalid_payload`          | 본문이 rank-import v2 strict 스키마에 맞지 않음         |
| `skipped` | `not_logged_in`            | 자동 반영인데 세션 확인 결과가 `user: null`             |
| `failed`  | `network` · `server_error` | 자동 반영의 세션 확인 실패(비로그인으로 기록하지 않음)  |
| `pending` | 없음                       | 위에 해당하지 않음. handoff를 만들고 가져오기 화면을 엶 |

- 자동 반영(수집이 저장으로 끝난 직후)은 스타일이 SP이고 세션 사용자가 있을 때만 시작합니다.
- 수동 반영(popup의 `가져오기 화면을 열어 반영`)은 저장 데이터가 있고 SP이면 세션을 확인하지 않고 화면을 엽니다. 로그인되어 있지 않으면 화면이 로그인을 안내하고, 로그인 뒤 같은 본문으로 이어서 업로드합니다.
- 반영의 실패는 수집 결과를 실패로 만들지 않습니다. 수집 상태와 반영 상태는 따로 저장합니다.
- 새로 반영을 시작하면 이전 handoff는 새 것으로 바뀌고, 이전 handoff의 결과는 받지 않습니다.

## handoff

- 형태는 `{ handoffId, createdAt }`이고 `handoffId`는 `crypto.randomUUID()`입니다. `chrome.storage.session`의 `iidx:rank-handoff`에 두므로 service worker가 종료되어도 남고 브라우저를 닫으면 사라집니다.
- 본문은 저장하지 않습니다. 화면이 요청할 때마다 그 시점에 저장된 dataset에서 `toRankImport`로 만들고 `RankImportSchema`로 검증합니다.
- 만든 지 10분(`RANK_HANDOFF_TTL_MS`)이 지나면 만료로 취급해 본문을 넘기지 않습니다. dataset이 없거나 DP로 바뀐 경우에도 넘기지 않습니다.
- `result`를 받기 전까지는 지우지 않습니다. 화면이 새로고침되거나 로그인으로 다시 열려도 같은 `handoffId`로 본문을 다시 넘깁니다.
- 마지막 반영 상태가 `pending`인데 handoff가 없거나 만료됐으면 popup이 개요를 읽을 때 `failed` + `handoff_expired`로 바꿉니다. 진행 중 표시가 영구히 남지 않게 하기 위함입니다. 만료 전에 본문을 받은 화면이 늦게 보낸 `result`는 `handoffId`가 같으면 받아 실제 결과로 덮어씁니다.
- 저장 데이터를 삭제하면 handoff와 마지막 반영 상태도 함께 지웁니다.

## 메시지

화면과 content script는 `window.postMessage(message, window.location.origin)`으로 대화합니다. 공통 필드 `channel`은 `"iidx-rank-import"`입니다. 스키마는 `src/shared/rank-bridge-schema.ts`, 처리 로직은 `src/core/rank-bridge.ts`입니다.

| type      | 방향            | 나머지 필드                                    | content script의 동작                                          |
| --------- | --------------- | ---------------------------------------------- | -------------------------------------------------------------- |
| `hello`   | 익스텐션 → 화면 | 없음                                           | 주입 직후(`document_idle`) 한 번 보냄                          |
| `ready`   | 화면 → 익스텐션 | 없음                                           | 받을 때마다 background에 `GET_RANK_HANDOFF`를 보냄             |
| `payload` | 익스텐션 → 화면 | `handoffId: string`, `payload: rank-import v2` | 대기 중인 handoff가 있을 때의 답                               |
| `none`    | 익스텐션 → 화면 | 없음                                           | handoff가 없거나 만료됐거나 background가 응답하지 않을 때의 답 |
| `result`  | 화면 → 익스텐션 | `handoffId: string`, `outcome`                 | Zod로 검증한 뒤 background에 `REPORT_RANK_RESULT`로 전달       |

```jsonc
{ "channel": "iidx-rank-import", "type": "hello" }
{ "channel": "iidx-rank-import", "type": "ready" }
{ "channel": "iidx-rank-import", "type": "payload", "handoffId": "0b9c…", "payload": { "version": 2, "kind": "iidx-rank-import", "…": "…" } }
{ "channel": "iidx-rank-import", "type": "none" }
{ "channel": "iidx-rank-import", "type": "result", "handoffId": "0b9c…", "outcome": { "status": "success", "result": { "importId": 12, "…": "…" } } }
{ "channel": "iidx-rank-import", "type": "result", "handoffId": "0b9c…", "outcome": { "status": "failed", "code": "AUTH_REQUIRED" } }
```

- 받는 메시지는 `event.source === window`, `event.origin === window.location.origin`, `channel` 리터럴, 스키마를 모두 확인합니다. 하나라도 맞지 않으면 응답 없이 무시합니다.
- content script는 `RANK_ORIGIN`의 모든 경로에 주입됩니다. 화면이 클라이언트 이동으로 `/import`에 들어와도 `ready`를 받을 수 있게 하기 위함입니다. background에는 `ready`나 `result`를 받았을 때만 요청합니다.
- background는 `GET_RANK_HANDOFF`와 `REPORT_RANK_RESULT`를 보낸 쪽을 확인합니다. 이 익스텐션의 content script가 `RANK_ORIGIN` 탭의 최상위 프레임에서 보낸 것만 처리하고 popup이나 다른 출처의 탭에서 온 것은 거부합니다.
- `REPORT_RANK_RESULT`는 `handoffId`가 저장된 handoff와 같을 때만 받습니다.

## 결과 기록

`resolveRankSync`가 `outcome`을 마지막 반영 상태로 바꿉니다.

- `success`: 건수(`receivedCount`·`matchedCount`·`changedCount`)와 `unmatched`의 건수·앞 5건을 저장합니다. 응답의 `changes`는 받아도 오류가 나지 않으며 저장하지 않습니다(표는 화면이 보여 줍니다). 저장한 뒤 세션을 다시 확인해 업로드한 계정을 함께 기록합니다.
- `failed`: `code`를 사유로 바꾸고 `code`는 서버 코드로 함께 남깁니다.

| `code`                                                    | 사유 코드         |
| --------------------------------------------------------- | ----------------- |
| `AUTH_REQUIRED`                                           | `not_logged_in`   |
| `IMPORT_COOLDOWN`                                         | `rate_limited`    |
| `UNSUPPORTED_STYLE`                                       | `dp_unsupported`  |
| `INVALID_INPUT` · `INVALID_PAYLOAD` · `PAYLOAD_TOO_LARGE` | `invalid_payload` |
| `REQUEST_FAILED`                                          | `network`         |
| 그 밖                                                     | `server_error`    |

마지막 반영 상태의 `status`는 `success`·`failed`·`skipped`·`pending`이고, 사유 코드는 `not_logged_in`·`dp_unsupported`·`no_data`·`rate_limited`·`network`·`server_error`·`invalid_payload`·`handoff_expired`입니다.

## 서버 반영 규칙 요약

- 반영 대상은 SP의 레벨 12 차트 중 iidx-rank catalog에 있는 것입니다. 다른 레벨과 DP는 수집은 되지만 서버가 쓰지 않습니다. 익스텐션은 수집한 모든 레벨을 계약대로 넘깁니다.
- `NO_PLAY`는 기록으로 취급하지 않고 건너뜁니다.
- 램프·등급·EX SCORE·MISS COUNT 중 하나라도 다르면 최신 값으로 바꾸고 이력에 한 줄을 추가합니다. 메모는 보존합니다.
- 응답의 `unmatched`는 레벨 12인데 catalog에서 찾지 못한 차트입니다(최대 200건). popup은 건수와 앞 5건만 저장해 보입니다. 곡명 표기 차이를 찾는 근거입니다.

`missCount`는 difficulty 페이지에서 얻을 수 없어 항상 `null`입니다.

## 파일 가져오기

익스텐션 없이도 popup의 `iidx-rank용 내보내기`로 받은 `iidx-data-parser-rank-import-v2-*.json`을 iidx-rank 설정 화면에서 올려 같은 API로 반영할 수 있습니다.

## 주의

- e-amusement는 공식 개인 데이터 API를 제공하지 않습니다. 이 익스텐션은 로그인한 본인의 브라우저 세션으로 본인 데이터를 읽습니다. 타인 데이터 수집, 자동 로그인, 요청 빈도 상향은 범위 밖입니다.
- 수집 간격 기본값(500~1100ms)은 서버 부하를 낮추기 위한 것입니다. 낮추지 않습니다.
- 반영 후 정합성 검증은 서버 책임입니다. 익스텐션은 화면이 돌려준 결과를 그대로 기록하고 성공을 가정하지 않습니다.

## TODO

- 카카오 로그인(서버 설정).
- DP 가져오기(서버가 지원할 때).
- 곡 상세 페이지 수집으로 `missCount` 채우기.
