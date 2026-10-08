# 검증

## 자동 검사

```bash
bun run typecheck   # tsc --noEmit
bun test            # fixture 기반 파서·계약·background·popup·i18n 테스트
bun run build       # MV3 번들 생성
```

최근 결과(2026-10-08):

| 검사                                              | 결과                                                                                                                                                                                                             |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun run typecheck`                               | 오류 0                                                                                                                                                                                                           |
| `bun test`                                        | 165 pass / 0 fail, 15개 파일                                                                                                                                                                                     |
| `bun run build`                                   | 성공. `host_permissions`는 e-agate와 `https://iidx.hyns.dev/*`, `content_scripts`는 e-agate용 `content-script.js`와 `https://iidx.hyns.dev/*`용 `rank-content-script.js` 두 항목, `permissions`는 `storage` 하나 |
| `build/`                                          | `content-script.js`·`rank-content-script.js`·`background/index.js`·`popup/`·`_locales/{en,ja,ko}`가 산출되고 번들에 `/api/import/records` 호출이 없음                                                            |
| `RANK_ORIGIN=http://localhost:3000 bun run build` | `host_permissions`와 iidx-rank용 content script의 `matches`가 `http://localhost:3000/*`로 바뀌고 background 번들에서 `iidx.hyns.dev`가 사라짐. 기본값으로 다시 빌드해 복귀 확인                                  |

popup 레이아웃(폭 440px, ko·ja·en)은 이전 버전에서 headless Chrome으로 확인했고, 반영 카드의 문구와 진행 중 안내를 바꾼 뒤에는 다시 확인하지 않았습니다.

테스트가 덮는 범위:

- `tests/parsers.test.ts`, `tests/collection-flow.test.ts`
    - 로그인·DJ 정보·노트레이더·난이도 페이지 파싱과 종료 판정, 로그인 필요 페이지 판정
    - `chartId` 고정 벡터(iidx-rank 규칙 교차 검증)
- `tests/dataset-builder.test.ts`, `tests/contract.test.ts`
    - dataset v2 검증, 경고를 포함한 `partial` 판정, 설정 스키마, rank-import v2 필드 집합
- `tests/tab.test.ts`, `tests/collection-run.test.ts`(가짜 `chrome.tabs`·`chrome.storage`)
    - 로딩 대기의 완료·URL 불일치·탭 닫힘·중단, 로딩이 끝났는데 탭 URL을 읽을 수 없을 때의 즉시 `url_mismatch`, URL을 읽을 수 없는 탭의 이동 방식
    - 수집 한 번의 저장과 탭 정리, 저장소가 dataset 쓰기를 거부할 때의 `failed` 표시와 이전 데이터 보존, 난이도 페이지 대신 URL을 읽을 수 없는 곳에 도착했을 때의 레벨 실패
- `tests/rank-client.test.ts`, `tests/rank-sync.test.ts`, `tests/build-config.test.ts`
    - 세션 확인 응답 분류, 자동·수동 반영의 시작 판단과 건너뜀 사유(`no_data`·`dp_unsupported`·`not_logged_in`), 화면이 보고한 결과와 실패 코드의 사유 매핑, `changes` 필드 수용, 만료 처리
    - `RANK_ORIGIN` 정규화와 manifest 생성(`host_permissions`, content script 두 항목, `permissions`가 `storage` 하나이고 선택 권한이 없음)
- `tests/rank-bridge.test.ts`(jsdom), `tests/rank-handoff.test.ts`
    - content script의 `hello`·`payload`·`none` 전송과 `targetOrigin`, `ready`마다의 handoff 조회, `result` 검증과 전달
    - 다른 창·다른 출처·다른 채널·형식이 다른 메시지 무시, handoff 10분 만료 경계, content script 요청의 보낸 쪽 확인
- `tests/background.test.ts`
    - service worker 재시작 후 `running` 복구, 이전 버전 저장 값 삭제, 잘못된 요청·설정 거부, 데이터 없음 시 내보내기·반영 거부, 로그인 페이지 열기
    - 수동 반영의 handoff 생성과 `/import` 탭 열기, iidx-rank 탭이 아닌 곳에서 온 handoff 요청 거부, 반복 조회, 다른 `handoffId` 무시, 결과 저장과 handoff 삭제, 만료와 유실 시 `handoff_expired`, DP 전환, 데이터 삭제
- `tests/message-keys.test.ts`, `tests/i18n-keys.test.ts`
    - 메시지 키와 파라미터 정의, 세 로케일의 키 집합 일치, placeholder 이름과 순서, 코드가 쓰는 키의 존재, manifest `__MSG_*__` 참조, 화면 코드의 한국어·일본어 하드코딩 금지
- `tests/popup.test.tsx`(jsdom에 실제 React 마운트)
    - 로딩·로그인 미확인·확인 실패 표시와 비활성 사유, 수집 시작 요청 본문
    - `aria-pressed`, DP 경고, 수집 중 설정·반영 버튼 비활성과 live region
    - 경고 4건 초과 생략, 반영 결과(시각·건수·일치하지 않은 곡·사유·서버 코드), 진행 중 안내와 만료 사유, 비로그인에서도 반영 버튼 활성, 곡명의 HTML 비주입
    - 삭제 확인 단계, background 무응답·거부·형식 오류 표시, 저장소 변경 시 재조회, 영어 표시, 번역 누락 시 키 표시

## 수동 검증

자동 테스트는 fixture와 가짜 `chrome`을 쓰므로 실제 로그인 세션에서 다음을 확인해야 합니다.

### 1. 로드

1. `chrome://extensions`에서 개발자 모드를 켜고 `build/`를 로드합니다.
2. popup이 열리고 두 로그인 카드가 `미확인`으로 보이는지 확인합니다. 브라우저 언어(ko·ja·en)에 맞춘 문구인지 확인합니다.

### 2. e-amusement 로그인

1. 로그아웃 상태에서 `로그인 확인`을 누릅니다. `로그인 필요`가 보이고 `데이터 수집 시작`이 비활성이며 버튼 아래에 이유가 있어야 합니다.
2. e-amusement 로그인 후 다시 확인합니다. `로그인됨`과 DJ NAME이 보이고 `---`가 아니어야 합니다.

### 3. 수집

레벨 하나(예: 12)로 수집하고 확인합니다.

- 진행 카드의 페이지·차트 수가 늘고, 수집 중에는 설정·반영·삭제·로그인 확인 버튼이 비활성인지.
- `수집 중단`이 즉시 동작하고 수집 탭이 닫히는지.
- 완료 후 차트 수가 0보다 큰지. 0이면 `docs/PARSING-NOTES.md`의 확인 필요 항목을 점검합니다.
- NOTES RADAR 6축이 채워졌는지.
- 수집 도중 확장 프로그램을 다시 로드한 뒤 popup을 열었을 때 `실패`와 중단 사유가 보이고 버튼이 다시 활성화되는지.

### 4. iidx-rank 연동

사전 준비는 iidx-rank 로컬 서버와 익스텐션의 출처를 맞추는 것입니다. 서버에 익스텐션 ID를 등록하는 절차는 없습니다.

1. iidx-rank를 `http://localhost:3000`으로 띄웁니다.
2. `RANK_ORIGIN=http://localhost:3000 bun run build`로 빌드한 뒤 `chrome://extensions`에서 `build/`를 로드(또는 새로고침)합니다. 이미 열려 있던 iidx-rank 탭은 새로고침해야 content script가 주입됩니다.

확인 순서:

1. **로그인 열기**: iidx-rank에 로그인하지 않은 브라우저에서 popup을 엽니다. iidx-rank 카드가 `로그인 필요`이고 대상 출처가 `http://localhost:3000`으로 보여야 합니다. `iidx-rank 로그인 열기`로 새 탭을 열어 로그인(이메일·GitHub·Naver)한 뒤 popup을 다시 열면 `로그인됨`과 이름·핸들이 보여야 합니다. 로그인이 되었는데도 `로그인 필요`이면 세션 쿠키가 service worker 요청에 붙지 않는 것이므로 `미검증·확인 필요`를 참고합니다.
2. **수동 반영**: 저장된 SP 데이터가 있는 상태에서 `iidx-rank에 반영` 카드의 `가져오기 화면을 열어 반영`을 누릅니다. `http://localhost:3000/import` 탭이 새 활성 탭으로 열리고 업로드 중 표시 뒤에 결과 표(건수, 바뀐 차트, 일치하지 않은 곡)가 보여야 합니다. popup을 다시 열면 반영 카드에 `반영 성공`, 방식 `수동`, 계정, 시각과 건수(전송·일치·변경·일치하지 않은 곡)가 화면과 같은 값으로 보여야 합니다.
3. **자동 반영**: iidx-rank에 로그인한 상태에서 SP 레벨 12로 수집합니다. 수집이 끝나면 `/import` 탭이 자동으로 열리고 업로드 중 → 결과 표가 보여야 하며, popup 반영 카드에는 방식 `자동`으로 같은 결과가 남아야 합니다.
4. **진행 중과 다시 시도**: 반영 버튼을 누른 뒤 `/import` 탭을 결과가 나오기 전에 닫고 popup을 열면 `반영 진행 중`과 탭을 닫았으면 다시 시도하라는 안내가 보여야 합니다. 버튼을 다시 누르면 새 탭에서 반영됩니다. 10분 동안 결과가 오지 않으면 popup을 열었을 때 `반영 실패`와 제한 시간 안내가 보여야 합니다.
5. **화면 새로고침**: `/import` 탭이 본문을 받은 뒤 결과가 나오기 전에 새로고침해도 같은 본문으로 다시 진행되어야 합니다. 결과가 popup에 기록된 뒤 새로고침하면 화면은 대기 중인 데이터가 없다는 안내를 보여야 합니다.
6. **비로그인 수동 반영**: iidx-rank에서 로그아웃하고 반영 버튼을 누릅니다. 버튼은 활성이어야 하고 `/import` 화면이 로그인을 안내해야 합니다. 로그인한 뒤 같은 데이터로 이어서 업로드되고 popup에 결과가 남아야 합니다. 로그인하지 않은 채 자동 반영이 일어날 조건(수집 완료)에서는 탭이 열리지 않고 반영 카드에 `반영 건너뜀`과 로그인 사유가 보여야 합니다.
7. **결과 확인**: iidx-rank의 사용자 페이지에서 램프·등급이 반영되었는지, 설정 화면의 가져오기 상태에 같은 건수가 보이는지 확인합니다. 같은 데이터로 다시 반영하면 변경 건수가 0이어야 합니다(10초 안에 다시 반영하면 화면과 popup에 실패와 `IMPORT_COOLDOWN`이 보이는 것이 정상).
8. **DP**: 스타일을 DP로 바꾸면 경고가 보이고 반영 버튼이 `DP 데이터는 iidx-rank에 반영되지 않습니다` 사유로 비활성이어야 합니다.
9. **일치하지 않은 곡**: 건수와 앞 5건이 곡명·난이도로 보이면 곡명 표기 차이 후보입니다. 서버 별칭 표 작성의 근거로 기록합니다.
10. **다른 페이지**: iidx-rank의 `/import`가 아닌 페이지를 열어 둔 채 반영해도 그 페이지의 동작이 달라지지 않아야 합니다.

### 5. 권한 축소 뒤 확인

`tabs`와 `unlimitedStorage`를 뺀 빌드(`build/manifest.json`의 `permissions`가 `["storage"]`)를 실제 Chrome에 로드해 확인합니다. 근거는 `docs/ARCHITECTURE.md`의 "요청하지 않는 권한"입니다.

1. **설치 경고**: `chrome://extensions`의 세부정보에서 사이트 액세스가 `p.eagate.573.jp`와 iidx-rank 출처 두 곳뿐이고 "방문 기록 읽기" 항목이 없는지 확인합니다. 이전 빌드를 덮어쓴 경우와 새로 로드한 경우 모두 오류 없이 로드되어야 합니다.
2. **수집 전체 흐름**: `로그인 확인` 뒤 레벨 하나로 수집합니다. 수집 탭이 열리고 DJ 정보 → 노트레이더 → 난이도 페이지 순으로 넘어가며, 페이지마다 25초를 기다리지 않고 바로 다음으로 진행되어 `완료`로 끝나야 합니다. 정상 페이지인데 `예상과 다른 페이지가 열렸습니다`로 실패하면 탭 URL을 읽지 못하는 것이므로 판정 근거가 틀린 것입니다.
3. **중단**: 수집 중 `수집 중단`을 누르면 즉시 멈추고 수집 탭이 닫혀야 합니다.
4. **탭을 직접 닫기**: 수집 중 수집 탭을 손으로 닫습니다. 25초를 기다리지 않고 탭 닫힘 사유로 끝나며, 그때까지 모은 차트가 있으면 `partial`로 저장되어야 합니다.
5. **수집 중 다른 사이트로 이동**: 수집 중 수집 탭의 주소창에 `https://example.com`을 넣어 이동합니다. 다음 페이지 요청에서 탭이 다시 e-agate로 돌아와 수집이 이어지거나, 그 페이지가 `예상과 다른 페이지가 열렸습니다` 경고와 함께 레벨 실패로 기록되어야 합니다. 25초 로딩 초과로 수집 전체가 끊기면 안 됩니다.
6. **로그아웃 상태**: e-amusement에서 로그아웃한 상태로 `로그인 확인`을 누릅니다. 페이지가 다른 호스트의 로그인 화면으로 넘어가더라도 25초를 기다리지 않고 `로그인 필요` 또는 확인 실패가 표시되어야 합니다.
7. **반영 화면 열기**: `iidx-rank 로그인 열기`와 `가져오기 화면을 열어 반영`이 각각 새 활성 탭을 열고, `/import` 화면이 데이터를 받아 결과를 popup에 남겨야 합니다(4번 절차의 2·3항과 같음).
8. **서비스 워커 콘솔**: `chrome://extensions`의 서비스 워커 검사 창에 권한 관련 오류(`Cannot access`, `permission`)가 없어야 합니다.
9. **저장 용량**: 전 레벨을 수집한 뒤 서비스 워커 콘솔에서 `await chrome.storage.local.getBytesInUse()`가 10,485,760보다 충분히 작은지(예상 2~3MB) 확인합니다.

### 6. export와 삭제

1. `JSON 내보내기`로 파일을 저장하고 `format`·`schemaVersion: 2`·`charts` 길이와 `meta.warnings`의 `{ key, params }` 형태를 확인합니다.
2. `iidx-rank용 내보내기`로 받은 파일에서 `version: 2`·`kind`·`chartId` 형식을 확인합니다.
3. `저장 데이터 삭제`를 누르면 `삭제 확인`/`취소` 단계가 먼저 보이고, 확인해야 데이터가 지워지는지 확인합니다.

## 미검증·확인 필요

다음은 로그인 세션 또는 실제 Chrome이 필요해 이번 자동 검사로 확인하지 못했습니다.

- 실제 Chrome에 로드한 동작 전체와 실제 e-agate의 DOM(라벨 문자열, 미플레이 행의 셀 내용, 노트레이더 구조, 세션 만료 시 이동 방식).
- service worker의 `fetch(credentials: 'include')`에 iidx-rank 세션 쿠키가 실제로 붙는지. 세션 확인(`GET /api/extension/session`)에만 해당하며, 붙지 않으면 자동 반영이 `not_logged_in`으로 건너뛰어집니다. 수동 반영은 세션 확인 없이 화면을 열므로 영향이 없습니다.
- 가져오기 화면(`/import`)과의 메시지 대화는 계약 문서(`docs/E-AMUSEMENT.md`의 "익스텐션 반영 흐름 (페이지 경유)")만 보고 구현했고 실제 화면과 함께 실행해 보지 않았습니다. content script가 실제 Chrome에서 `http://localhost:3000/*`처럼 포트가 있는 match pattern으로 주입되는지도 실기 확인이 필요합니다(Chrome 문서는 포트 지정을 지원한다고 적고 있습니다).
- iidx-rank의 `/api/extension/session`은 계약 문서만 보고 구현했습니다. `handle`은 `string | null`로 가정합니다.
- 수집 직후 자동으로 열리는 `/import` 탭이 활성 탭이 되는 것은 계약대로이며, 사용자가 다른 작업 중일 때의 사용성은 실기에서 확인합니다.
- 세션 만료가 `/gate/p/login.html` 리다이렉트로 오면 `session_expired`가 아니라 `url_mismatch`로 잡혀 재시도 후 레벨 실패 경로를 탑니다. 리다이렉트가 e-agate 밖의 호스트로 가면 `tabs` 권한이 없어 탭 URL을 읽지 못하지만 같은 `url_mismatch`로 처리합니다.
- `tabs`·`unlimitedStorage`를 뺀 뒤의 동작은 Chrome 공식 문서와 Chromium 소스, 가짜 `chrome`을 쓴 단위 테스트로만 확인했습니다. 실제 Chrome에 로드해 본 것이 아니므로 "5. 권한 축소 뒤 확인"을 거쳐야 합니다. 특히 host permission만으로 `onUpdated`의 `tab.url`이 채워지는지, 새로 만든 탭에서 탐색 전에 `complete`가 오지 않는지가 판정의 전제입니다.
- 전 레벨 수집의 실제 저장 크기는 재지 못했습니다. 표본 객체로 잰 예상은 한도의 20~30%입니다. 한도 초과 시 popup에는 구체적 사유 없이 `error_unknown` 문구가 보입니다.
- 0곡 레벨은 `warning_level_first_page_empty` 때문에 `partial`로 표시될 수 있습니다.
- `unmatchedCount`는 서버가 200건으로 자른 뒤의 길이입니다.
- 수집 탭이 활성 탭을 계속 가져가므로 수집 중 popup은 닫힙니다. 비활성 탭 수집은 실기 확인 전이라 적용하지 않았습니다.
