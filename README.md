# iidx-data-parser

beatmania IIDX 34 ZINRAI e-amusement 사이트에서 DJ 데이터를 수집해 [iidx-rank](https://iidx-rank.vercel.app)로 가져오기 위한 Chrome 익스텐션입니다. 브라우저의 iidx-rank 로그인 세션을 그대로 사용해 수집한 기록을 로그인한 계정에 반영합니다.

## 기능

- e-amusement 로그인 상태 감지. 비로그인이거나 확인하지 못한 상태에서는 수집 버튼이 비활성화되고 이유가 표시됩니다.
- DJ 정보 수집: `djdata/status.html`의 DJ NAME, IIDX ID, DJ POINT, 플레이 횟수, 노트레이더 6축.
- 노트레이더 수집: `djdata/music/notesradar.html`.
- 난이도별 곡 데이터 수집: `djdata/music/difficulty.html`을 레벨별 offset 0부터 50씩 증가시키며 순회.
- iidx-rank 연동: 브라우저의 iidx-rank 세션을 확인하고, 수집이 끝나면 로그인한 계정에 자동으로 반영합니다. 수동 반영과 마지막 반영 결과(시각·건수·일치하지 않은 곡·실패 사유)도 popup에서 봅니다.
- JSON 내보내기: 전체 데이터(`dataset` v2)와 iidx-rank 가져오기용 `rank-import` v2 두 형식.
- 다국어: 브라우저 언어에 따라 한국어, 일본어, 영어(`chrome.i18n`).

## 수집 흐름

1. 익스텐션이 `p.eagate.573.jp`에 로그인되어 있는지 확인합니다.
2. 로그인되어 있으면 새 탭을 열고 DJ 정보, 노트레이더, 난이도별 곡 목록을 순차로 파싱합니다.
3. 파싱한 데이터는 정규화 후 브라우저 스토리지(`chrome.storage.local`)에 저장됩니다.
4. iidx-rank에 로그인되어 있으면 저장 직후 자동으로 반영합니다. 아니면 JSON으로 내보내 iidx-rank 설정 화면에서 올릴 수 있습니다.

iidx-rank에 반영되는 것은 SP 레벨 12뿐입니다. DP와 다른 레벨은 수집과 내보내기만 됩니다. 요청 간격은 popup에서 빠름·보통·느림 중 선택하며 기본값은 보통(500~1100ms)입니다.

## 설치

```bash
bun install
bun run build
```

1. Chrome에서 `chrome://extensions`를 엽니다.
2. 우측 상단의 개발자 모드를 켭니다.
3. `압축해제된 확장 프로그램을 로드`를 눌러 `build/` 폴더를 선택합니다.

iidx-rank 출처는 빌드 시 `RANK_ORIGIN` 환경변수로 정합니다. 기본값은 `https://iidx.hyns.dev`이고, 로컬 서버와 연동하려면 `RANK_ORIGIN=http://localhost:3000 bun run build`를 씁니다. 서버의 `EXTENSION_ORIGINS`에 `chrome://extensions`에서 확인한 `chrome-extension://<ID>`를 등록해야 반영이 허용됩니다.

개발 중에는 `bun run dev`로 파일 변경 시 자동 재빌드를, `bun run pack`으로 배포용 zip을 만들 수 있습니다.

## 사용

1. 브라우저에서 e-amusement에 로그인하고 popup의 `로그인 확인`을 누릅니다.
2. iidx-rank에 로그인합니다. popup의 `iidx-rank 로그인 열기`로 로그인 페이지를 열고, 돌아와서 popup을 다시 열면 상태가 갱신됩니다.
3. 수집 스타일(SP/DP), 레벨, 요청 간격을 선택하고 `데이터 수집 시작`을 누릅니다. 진행 중에는 `수집 중단`으로 멈출 수 있습니다.
4. 수집이 끝나면 iidx-rank에 자동 반영되고 결과가 `iidx-rank에 반영` 카드에 남습니다. 다시 반영하려면 같은 카드의 버튼을 누릅니다.
5. 필요하면 `JSON 내보내기` 또는 `iidx-rank용 내보내기`로 파일을 저장합니다. `저장 데이터 삭제`는 확인 단계를 거칩니다.

## 검사

```bash
bun run typecheck
bun test
bun run build
```

## 문서

- `docs/ARCHITECTURE.md` — 구성 요소, 수집 오케스트레이션, popup, i18n, 권한 경계
- `docs/DATA_SCHEMA.md` — dataset JSON v2와 rank-import v2 형식
- `docs/INTEGRATION.md` — 브라우저 세션 기반 iidx-rank 연동
- `docs/PARSING-NOTES.md` — e-agate 페이지 구조 근거
- `docs/VERIFICATION.md` — 자동 검사와 수동 검증 절차

## 범위와 한계

- 수집 대상은 IIDX 34 경로 고정입니다. 게임 버전이 바뀌면 `src/shared/constants.ts`의 `GAME_VERSION`만 교체합니다.
- 스크래핑은 e-amusement 로그인 세션을 사용합니다. 계정 자격 증명과 iidx-rank 쿠키 값을 익스텐션이 읽거나 저장하지 않습니다.
- `missCount`는 수집하지 않습니다(항상 `null`). DP는 iidx-rank에 반영되지 않습니다.
- 자동 로그인과 주기적 동기화는 범위가 아닙니다. 카카오 등 추가 외부 로그인은 서버 쪽 TODO입니다.
