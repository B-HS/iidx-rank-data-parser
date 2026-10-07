# 검증

## 자동 검사

```bash
bun run typecheck   # tsc --noEmit
bun test            # fixture 기반 파서·계약·background·popup·i18n 테스트
bun run build       # MV3 번들 생성
```

최근 결과(2026-10-07):

| 검사                                              | 결과                                                                                                                                               |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun run typecheck`                               | 오류 0                                                                                                                                             |
| `bun test`                                        | 115 pass / 0 fail, 11개 파일                                                                                                                       |
| `bun run build`                                   | 성공. `host_permissions`는 e-agate와 `https://iidx.hyns.dev/*`, `default_locale`은 `en`                                                            |
| `build/_locales`                                  | `en`, `ja`, `ko` 세 폴더가 있고 `build/popup`에 `index.html`·`index.js`·`global.css`가 산출됨                                                      |
| `RANK_ORIGIN=http://localhost:3000 bun run build` | manifest 출처가 `http://localhost:3000/*`로 바뀌고 background 번들에서 `iidx.hyns.dev`가 사라짐. 기본값으로 다시 빌드해 복귀 확인                  |
| 레이아웃 확인(headless Chrome, 폭 440px)          | ko·ja·en에서 긴 DJ NAME·곡명·핸들이 줄바꿈되고 가로 넘침과 버튼 글자 넘침이 없음. 가짜 `chrome` 스텁으로 렌더한 결과이며 실제 익스텐션 로드는 아님 |

테스트가 덮는 범위:

- `tests/parsers.test.ts`, `tests/collection-flow.test.ts`
    - 로그인·DJ 정보·노트레이더·난이도 페이지 파싱과 종료 판정, 로그인 필요 페이지 판정
    - `chartId` 고정 벡터(iidx-rank 규칙 교차 검증)
- `tests/dataset-builder.test.ts`, `tests/contract.test.ts`
    - dataset v2 검증, 경고를 포함한 `partial` 판정, 설정 스키마, rank-import v2 필드 집합
- `tests/rank-client.test.ts`, `tests/rank-sync.test.ts`, `tests/build-config.test.ts`
    - 세션 확인과 가져오기 응답 분류, 반영 전 건너뜀 사유(`no_data`·`dp_unsupported`·`not_logged_in`), `RANK_ORIGIN` 정규화와 manifest 생성
- `tests/background.test.ts`
    - service worker 재시작 후 `running` 복구, 이전 버전 저장 값 삭제, 잘못된 요청·설정 거부, 데이터 없음 시 내보내기·반영 거부, 로그인 페이지 열기
- `tests/message-keys.test.ts`, `tests/i18n-keys.test.ts`
    - 메시지 키와 파라미터 정의, 세 로케일의 키 집합 일치, placeholder 이름과 순서, 코드가 쓰는 키의 존재, manifest `__MSG_*__` 참조, 화면 코드의 한국어·일본어 하드코딩 금지
- `tests/popup.test.tsx`(jsdom에 실제 React 마운트)
    - 로딩·로그인 미확인·확인 실패 표시와 비활성 사유, 수집 시작 요청 본문
    - `aria-pressed`, DP 경고, 수집 중 설정·반영 버튼 비활성과 live region
    - 경고 4건 초과 생략, 반영 결과(시각·건수·일치하지 않은 곡·사유·서버 코드), 곡명의 HTML 비주입
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

사전 준비는 iidx-rank 로컬 서버와 익스텐션의 출처를 맞추는 것입니다.

1. iidx-rank를 `http://localhost:3000`으로 띄웁니다. 서버 환경에서 `.env`는 직접 열지 않고 `.env.example`을 참고해 `EXTENSION_ORIGINS`를 설정합니다.
2. `RANK_ORIGIN=http://localhost:3000 bun run build`로 빌드한 뒤 `chrome://extensions`에서 `build/`를 로드(또는 새로고침)합니다.
3. `chrome://extensions`에 보이는 익스텐션 ID를 서버 `EXTENSION_ORIGINS`에 `chrome-extension://<ID>`로 등록하고 서버를 다시 시작합니다.

확인 순서:

1. **로그인 전**: iidx-rank에 로그인하지 않은 브라우저에서 popup을 엽니다. iidx-rank 카드가 `로그인 필요`이고 대상 출처가 `http://localhost:3000`으로 보여야 합니다. 반영 버튼은 비활성이며 `iidx-rank에 로그인해야 반영할 수 있습니다`가 보입니다.
2. **로그인 열기**: `iidx-rank 로그인 열기`로 새 탭을 열어 로그인(이메일·GitHub·Naver)합니다. popup을 다시 열면 자동으로, 열어 둔 채라면 `다시 확인`으로 `로그인됨`과 이름·핸들이 보여야 합니다. 로그인이 되었는데도 `로그인 필요`이면 세션 쿠키가 service worker 요청에 붙지 않는 것이므로 `확인 필요 항목`을 참고합니다.
3. **자동 반영**: SP 레벨 12로 수집합니다. 수집이 끝나면 `iidx-rank에 반영` 카드에 `반영 성공`, 방식 `자동`, 시각과 건수(전송·일치·변경·일치하지 않은 곡)가 보여야 합니다.
4. **결과 확인**: iidx-rank의 사용자 페이지에서 램프·등급이 반영되었는지, 설정 화면의 가져오기 상태에 같은 건수가 보이는지 확인합니다. 같은 데이터로 `iidx-rank에 반영`을 다시 누르면 변경 건수가 0이어야 합니다(10초 안에 누르면 `반영 실패`와 사유가 보이는 것이 정상).
5. **실패 사유**: 서버에서 `EXTENSION_ORIGINS`를 비우고 반영하면 `반영 실패`와 익스텐션 ID 등록 안내, 서버 코드 `ORIGIN_NOT_ALLOWED`가 보여야 합니다.
6. **DP**: 스타일을 DP로 바꾸면 경고가 보이고 반영 버튼이 `DP 데이터는 iidx-rank에 반영되지 않습니다` 사유로 비활성이어야 합니다.
7. **일치하지 않은 곡**: 건수와 앞 5건이 곡명·난이도로 보이면 곡명 표기 차이 후보입니다. 서버 별칭 표 작성의 근거로 기록합니다.

### 5. export와 삭제

1. `JSON 내보내기`로 파일을 저장하고 `format`·`schemaVersion: 2`·`charts` 길이와 `meta.warnings`의 `{ key, params }` 형태를 확인합니다.
2. `iidx-rank용 내보내기`로 받은 파일에서 `version: 2`·`kind`·`chartId` 형식을 확인합니다.
3. `저장 데이터 삭제`를 누르면 `삭제 확인`/`취소` 단계가 먼저 보이고, 확인해야 데이터가 지워지는지 확인합니다.

## 미검증·확인 필요

다음은 로그인 세션 또는 실제 Chrome이 필요해 이번 자동 검사로 확인하지 못했습니다.

- 실제 Chrome에 로드한 동작 전체와 실제 e-agate의 DOM(라벨 문자열, 미플레이 행의 셀 내용, 노트레이더 구조, 세션 만료 시 이동 방식).
- service worker의 `fetch(credentials: 'include')`에 iidx-rank 세션 쿠키가 실제로 붙는지. SameSite와 서드파티 쿠키 차단 설정의 영향은 공식 문서로 확정하지 못했습니다. 붙지 않으면 iidx-rank 출처의 content script가 first-party로 요청하는 방식을 검토합니다.
- iidx-rank의 `/api/extension/session`과 `/api/import/records`는 계약 문서만 보고 구현했습니다. `handle`은 `string | null`로 가정합니다.
- 세션 만료가 `/gate/p/login.html` 리다이렉트로 오면 `session_expired`가 아니라 `url_mismatch`로 잡혀 재시도 후 레벨 실패 경로를 탑니다.
- 0곡 레벨은 `warning_level_first_page_empty` 때문에 `partial`로 표시될 수 있습니다.
- `unmatchedCount`는 서버가 200건으로 자른 뒤의 길이입니다.
- 수집 탭이 활성 탭을 계속 가져가므로 수집 중 popup은 닫힙니다. 비활성 탭 수집은 실기 확인 전이라 적용하지 않았습니다.
