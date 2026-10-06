# iidx-data-parser

beatmania IIDX 34 ZINRAI e-amusement 사이트에서 DJ 데이터를 수집해 [iidx-rank](https://iidx-rank.vercel.app)로 가져오기 위한 Chrome 익스텐션입니다.

## 기능

- e-amusement 로그인 상태 감지. 비로그인 상태에서는 수집 기능이 비활성화됩니다.
- DJ 정보 수집: `djdata/status.html`의 DJ NAME, IIDX ID, DJ POINT, 플레이 횟수, 노트레이더 6축.
- 플레이어 노트레이더 수집: `djdata/music/notesradar.html`의 NOTES, CHORD, PEAK, CHARGE, SCRATCH, SOF-LAN.
- 난이도별 곡 데이터 수집: `djdata/music/difficulty.html`을 난이도별 offset 0부터 50씩 증가시키며 순회.
- JSON 내보내기: 전체 데이터(`dataset`)와 iidx-rank 가져오기용 요약(`rank-import`) 두 형식.

## 수집 흐름

1. 익스텐션이 `p.eagate.573.jp`에 로그인되어 있는지 확인합니다.
2. 로그인되어 있으면 새 탭을 열고 DJ 정보, 노트레이더, 난이도별 곡 목록을 순차로 파싱합니다.
3. 파싱한 데이터는 정규화 후 브라우저 스토리지(`chrome.storage.local`)에 저장됩니다.
4. popup에서 JSON 파일로 내보내 iidx-rank에 가져옵니다.

곡 데이터가 더 이상 없으면(`データがみつかりません`) 해당 난이도 순회를 종료합니다. 요청 간격은 popup에서 빠름·보통·느긋 중 선택할 수 있으며 기본값은 보통(500~1100ms)입니다.

## 설치

```bash
bun install
bun run build
```

1. Chrome에서 `chrome://extensions`를 엽니다.
2. 우측 상단의 개발자 모드를 켭니다.
3. `압축해제된 확장 프로그램을 로드`를 눌러 `build/` 폴더를 선택합니다.

개발 중에는 `bun run dev`로 파일 변경 시 자동 재빌드를, `bun run pack`으로 배포용 zip을 만들 수 있습니다.

## 사용

1. 브라우저에서 e-amusement에 로그인합니다.
2. 익스텐션 popup에서 `로그인 확인`을 누릅니다. 로그인되지 않았다면 수집 버튼이 비활성화됩니다.
3. 수집 스타일(SP/DP), 레벨, 요청 간격을 선택합니다.
4. `데이터 수집 시작`을 누르면 진행률과 경고가 표시됩니다. 진행 중에는 `수집 중단`으로 멈출 수 있습니다.
5. `JSON 내보내기` 또는 `iidx-rank용`을 눌러 파일을 저장합니다.

## 검사

```bash
bun run typecheck
bun test
bun run build
```

## 문서

- `docs/ARCHITECTURE.md` — 구성 요소, 수집 오케스트레이션, 권한 경계
- `docs/DATA_SCHEMA.md` — dataset JSON v1과 rank-import 형식
- `docs/INTEGRATION.md` — iidx-rank 연동과 향후 인증 연동 설계
- `docs/PARSING-NOTES.md` — e-agate 페이지 구조 근거
- `docs/VERIFICATION.md` — 자동 검사와 수동 검증 절차

## 범위와 한계

- 수집 대상은 IIDX 34 경로 고정입니다. 게임 버전이 바뀌면 `src/shared/constants.ts`의 `GAME_VERSION`만 교체합니다.
- 스크래핑은 e-amusement 로그인 세션을 사용합니다. 계정 자격 증명은 익스텐션이 읽거나 저장하지 않습니다.
- iidx-rank 서버 업로드, 자동 로그인, 주기적 동기화는 이번 범위가 아닙니다. 설계만 `docs/INTEGRATION.md`에 기록합니다.
