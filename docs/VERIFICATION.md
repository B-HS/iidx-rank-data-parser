# 검증

## 자동 검사

```bash
bun run typecheck   # tsc --noEmit
bun test            # fixture 기반 파서·계약 테스트
bun run build       # MV3 번들 생성
```

최근 결과:

| 검사                | 결과                                                                 |
| ------------------- | -------------------------------------------------------------------- |
| `bunx tsc --noEmit` | 오류 0                                                               |
| `bun test`          | 14 pass / 0 fail (파서 9, 계약 5)                                    |
| `bun run build`     | 성공. `build/` 아래 manifest, content-script, background, popup 산출 |

테스트가 덮는 범위:

- `tests/parsers.test.ts`
    - 비로그인·로그인 fixture 판정
    - DJ 정보·노트레이더 6축 파싱
    - 난이도 페이지 3행 파싱(점수·DJ LEVEL·램프·미플레이)
    - `データがみつかりません` 종료 판정
    - 로그인 필요 페이지 판정
    - `chartId` 고정 벡터 4건(iidx-rank 규칙 교차 검증)
- `tests/contract.test.ts`
    - `DatasetSchema` 검증·버전 거부
    - `SettingsSchema` 레벨 검증
    - `toRankImport` 필드 집합 고정

## 수동 검증

자동 테스트는 fixture 기반이므로 실제 로그인 세션에서 다음을 확인해야 합니다.

### 1. 로드

1. `chrome://extensions`에서 `build/`를 로드합니다.
2. popup이 열리고 로그인 카드가 보이는지 확인합니다.

### 2. 비로그인

로그아웃 상태(또는 시크릿 창)에서:

1. `로그인 확인`을 누릅니다.
2. `비로그인` 배지가 표시됩니다.
3. `데이터 수집 시작` 버튼이 비활성인지 확인합니다.

### 3. 로그인

e-amusement 로그인 후:

1. `로그인 확인`을 누릅니다.
2. `로그인됨` 배지와 DJ NAME이 표시되는지 확인합니다.
3. DJ NAME이 `---`가 아닌지 확인합니다.

### 4. 수집

레벨 하나(예: 12)로 수집하고 확인합니다.

- 진행 카드에 페이지·차트 수가 증가하는지.
- 수집 중단이 즉시 동작하고 탭이 닫히는지.
- 완료 후 차트 수가 0보다 큰지. 0이면 `docs/PARSING-NOTES.md`의 "확인 필요 항목"을 점검합니다.
- 노트레이더 6축 값이 채워졌는지. 모두 `-`이면 JSON 엔드포인트와 DOM 선택자를 확인합니다.

### 5. export

1. `JSON 내보내기`로 파일을 저장하고 `format`·`schemaVersion`·`charts` 길이를 확인합니다.
2. `iidx-rank용`으로 파일을 저장하고 `kind`·`chartId` 형식을 확인합니다.
3. `저장 데이터 삭제` 후 `GET_OVERVIEW`가 빈 상태를 돌려주는지 확인합니다.

## 미검증·확인 필요

다음은 로그인 세션이 필요해 자동 검증하지 못했습니다.

- 실제 e-agate DOM의 정확한 라벨 문자열과 노트레이더 페이지 구조.
- `json/notesradar.html` 응답 스키마와 필요한 파라미터 이름.
- 대량 수집(레벨 12 전체) 시 실제 페이지 수와 소요 시간.
- iidx-rank 가져오기 기능은 서버에 아직 없으므로 종단 검증 불가.
- Turso 운영 DB에 대한 반영 검증.

첫 실제 수집 결과로 `docs/PARSING-NOTES.md`를 확정합니다.
