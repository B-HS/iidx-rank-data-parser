# iidx-rank 연동

정본 계약은 iidx-rank 저장소의 `docs/E-AMUSEMENT.md`이고 결정 근거는 `docs/acknowledge/2026-10-07-eamusement-import-oauth.md`입니다. 이 문서는 익스텐션 쪽 동작만 정리하며 둘이 다르면 계약 문서가 우선합니다.

대상: `/Users/hyunseokbyun/development/iidx-rank` (Next.js + Drizzle + better-auth)

## 방식 — 브라우저 세션

익스텐션은 사용자를 따로 인증하지 않습니다. 사용자가 브라우저에서 iidx-rank에 로그인(이메일·GitHub·Naver)해 둔 세션을 그대로 씁니다. 일회용 코드를 교환하는 인증 위임 설계는 채택하지 않았습니다.

1. popup을 열 때 `GET /api/extension/session`으로 로그인 여부를 확인합니다. 응답은 `{ user: { id, name, handle } | null }`입니다.
2. 로그인되어 있지 않으면 popup의 `iidx-rank 로그인 열기`가 `RANK_ORIGIN`을 새 탭으로 엽니다. 로그인한 뒤 popup을 다시 열거나 `다시 확인`을 누르면 세션을 다시 읽습니다.
3. 수집이 `saved` 상태로 끝나면 background가 자동으로 `POST /api/import/records`에 rank-import v2 본문을 보냅니다. 수동 반영은 popup의 `iidx-rank에 반영` 버튼입니다.
4. 서버가 세션의 사용자 UUID로 기록을 반영합니다. 본문의 사용자 식별 정보는 신뢰하지 않으므로 보내지도 않습니다.

익스텐션은 쿠키 값을 읽거나 저장하지 않습니다. `host_permissions`에 `RANK_ORIGIN`을 넣고 `fetch(..., { credentials: 'include', cache: 'no-store' })`로 브라우저가 쿠키를 붙이게 합니다. 서버는 CORS 헤더를 보내지 않으며 `host_permissions`가 있는 익스텐션 페이지만 응답을 읽습니다. 세션 확인은 GET이라 `Origin`이 붙지 않고, 가져오기는 POST라 `Origin: chrome-extension://<id>`가 붙습니다.

## 반영 전 검사

`syncDatasetToRank`는 전송 전에 다음을 차례로 확인하고, 해당하면 보내지 않고 `skipped`로 기록합니다.

| 사유 코드        | 조건                            |
| ---------------- | ------------------------------- |
| `no_data`        | 저장 데이터가 없거나 차트가 0건 |
| `dp_unsupported` | 저장 데이터의 스타일이 DP       |
| `not_logged_in`  | 세션 확인 결과 `user: null`     |

그 뒤 본문을 rank-import v2 strict 스키마로 검증하고(실패하면 `invalid_payload`), 직렬화한 본문이 2MB를 넘어도 보내지 않고 `invalid_payload`로 기록합니다. 전송 후 실패는 `failed`로 기록하며 사유는 다음과 같습니다.

| 사유 코드         | 원인                                                                           |
| ----------------- | ------------------------------------------------------------------------------ |
| `origin_rejected` | 서버가 403 `ORIGIN_NOT_ALLOWED`. 서버 `EXTENSION_ORIGINS`에 익스텐션 ID가 없음 |
| `rate_limited`    | 429 `IMPORT_COOLDOWN`. 직전 가져오기 후 10초 이내                              |
| `network`         | 연결 실패나 타임아웃(세션 10초, 가져오기 25초)                                 |
| `server_error`    | 5xx 또는 해석할 수 없는 응답                                                   |
| `invalid_payload` | 서버 400·413                                                                   |
| `not_logged_in`   | 서버 401 `AUTH_REQUIRED`                                                       |

세션 확인이 실패한 경우는 로그인되지 않은 것으로 기록하지 않고 `network` 또는 `server_error`로 구분합니다.

## 서버 반영 규칙 요약

- 반영 대상은 SP의 레벨 12 차트 중 iidx-rank catalog에 있는 것입니다. 다른 레벨과 DP는 수집은 되지만 서버가 쓰지 않습니다. 익스텐션은 수집한 모든 레벨을 계약대로 보냅니다.
- `NO_PLAY`는 기록으로 취급하지 않고 건너뜁니다.
- 램프·등급·EX SCORE·MISS COUNT 중 하나라도 다르면 최신 값으로 바꾸고 이력에 한 줄을 추가합니다. 메모는 보존합니다.
- 응답의 `unmatched`는 레벨 12인데 catalog에서 찾지 못한 차트입니다(최대 200건). popup은 건수와 앞 5건만 저장해 보입니다. 곡명 표기 차이를 찾는 근거입니다.

`missCount`는 difficulty 페이지에서 얻을 수 없어 항상 `null`입니다.

## 익스텐션 출처 등록

서버 환경변수 `EXTENSION_ORIGINS`에 `chrome-extension://<32자 ID>`를 쉼표로 나열합니다. 압축 해제 로드의 ID는 폴더 경로에 따라 정해지므로 `chrome://extensions`에서 확인해 등록합니다. 비어 있으면 익스텐션 요청은 모두 403입니다. manifest `key`로 ID를 고정하는 것은 아직 하지 않았습니다.

## 파일 가져오기

익스텐션 없이도 popup의 `iidx-rank용 내보내기`로 받은 `iidx-data-parser-rank-import-v2-*.json`을 iidx-rank 설정 화면에서 올려 같은 API로 반영할 수 있습니다.

## 주의

- e-amusement는 공식 개인 데이터 API를 제공하지 않습니다. 이 익스텐션은 로그인한 본인의 브라우저 세션으로 본인 데이터를 읽습니다. 타인 데이터 수집, 자동 로그인, 요청 빈도 상향은 범위 밖입니다.
- 수집 간격 기본값(500~1100ms)은 서버 부하를 낮추기 위한 것입니다. 낮추지 않습니다.
- 반영 후 정합성 검증은 서버 책임입니다. 익스텐션은 응답을 그대로 기록하고 성공을 가정하지 않습니다.

## TODO

- 카카오 로그인(서버 설정).
- DP 가져오기(서버가 지원할 때).
- 곡 상세 페이지 수집으로 `missCount` 채우기.
- manifest `key`로 확장 ID 고정.
