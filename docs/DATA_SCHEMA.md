# 데이터 스키마

정본은 `src/shared/schema.ts`입니다. 이 문서는 계약 요약이며, 값이 다르면 코드가 우선합니다.

## dataset JSON v2

익스텐션이 저장·내보내는 전체 형식입니다.

```jsonc
{
    "format": "iidx-data-parser",
    "schemaVersion": 2,
    "gameVersion": 34,
    "player": {
        "communityNickname": "TESTPLAYER",
        "djName": "-TEST-",
        "iidxId": "1234-5678",
        "danRank": "十段",
        "djPoint": 1234.56,
        "playCountSp": 432,
        "playCountDp": 123,
        "playCountTotal": 555,
        "profile": [{ "label": "DJ NAME", "value": "-TEST-" }],
    },
    "notesRadar": {
        "values": {
            "NOTES": 128.45,
            "CHORD": 131.22,
            "PEAK": 118.9,
            "CHARGE": 142.0,
            "SCRATCH": 136.75,
            "SOF-LAN": 124.1,
        },
        "raw": [],
        "source": "status",
        "matchedByLabel": true,
    },
    "charts": [
        {
            "chartId": "chart-6d4d8c5dd256f3870c3527063b541f01",
            "title": "冥",
            "difficultyName": "ANOTHER",
            "difficulty": "A",
            "level": 12,
            "style": 0,
            "djLevel": "AAA",
            "exScore": 3123,
            "pgreat": 1500,
            "great": 123,
            "missCount": null,
            "lamp": "FULL_COMBO",
        },
    ],
    "meta": {
        "status": "complete",
        "generatedAt": "2026-10-06T10:05:00.000Z",
        "finishedAt": "2026-10-06T10:05:00.000Z",
        "gameVersion": 34,
        "style": 0,
        "levels": [12],
        "delay": { "minMs": 500, "maxMs": 1100 },
        "pagesFetched": 3,
        "failedLevels": [],
        "warnings": [{ "key": "warning_level_first_page_empty", "params": ["11"] }],
    },
}
```

### 필드 규칙

| 필드                           | 규칙                                                                                                                             |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `format` / `schemaVersion`     | 리터럴 고정. 버전이 다르면 소비 측에서 거부해야 합니다                                                                           |
| `difficulty`                   | `B` `N` `H` `A` `L` — BEGINNER·NORMAL·HYPER·ANOTHER·LEGGENDARIA                                                                  |
| `difficultyName`               | e-agate 표기 원문                                                                                                                |
| `level`                        | 1~12 정수. 요청한 레벨이며 `difficult` 파라미터는 `level - 1`입니다                                                              |
| `style`                        | `0` SP, `1` DP                                                                                                                   |
| `lamp`                         | `NO_PLAY` `FAILED` `ASSIST` `EASY` `CLEAR` `HARD` `EX_HARD` `FULL_COMBO`                                                         |
| `djLevel`                      | `F` `E` `D` `C` `B` `A` `AA` `AAA` 또는 `null`                                                                                   |
| `exScore` / `pgreat` / `great` | 값이 없으면 `null`. 미플레이 곡에서 발생합니다                                                                                   |
| `missCount`                    | 항상 `null`. difficulty 페이지(5열)에 BP 값이 없고 곡 상세 페이지는 수집하지 않습니다                                            |
| `notesRadar.values`            | 6축 각각 숫자 또는 `null`                                                                                                        |
| `notesRadar.raw`               | 라벨-값 원문. 빈 라벨은 저장하지 않습니다                                                                                        |
| `notesRadar.source`            | 값을 읽은 경로. `status`(상태 페이지 DOM), `notesradar`(노트레이더 페이지)                                                       |
| `meta.status`                  | `empty`(0곡), `complete`(경고 없음), `partial`(일부 실패·상한 도달·차트 제외·플레이어/레이더 누락)                               |
| `meta.warnings`                | `{ key, params }[]`. 문장이 아니라 메시지 키와 `chrome.i18n` 위치 파라미터입니다. 키는 `src/shared/message-keys.ts`가 정의합니다 |
| `notesRadar.matchedByLabel`    | `false`이면 순서 기반 추정이며 rank-import에서는 제외됩니다                                                                      |

### 저장 전 검증

저장 직전에 전체 스키마로 검증합니다. 실패하면 필드 단위로 낮춰 저장하며, 차트 한 건이 잘못되면 그 차트만 제외합니다. 이때 `meta.status`는 `partial`이 되고 제외 건수가 `meta.warnings`에 기록됩니다.

### chartId

`chart-` + `sha256(normalize(title) + NUL + difficulty)`의 앞 32자입니다. `normalize`는 NFKC 정규화, 물결표(`〜〜∼`) 통일, 연속 공백 축약, 앞뒤 공백 제거입니다. 이는 iidx-rank의 `canonicalChartId`와 동일하며 `tests/parsers.test.ts`가 고정 벡터로 교차 검증합니다.

## rank-import JSON v2

iidx-rank 가져오기에 쓰는 형식이며 정본 계약은 iidx-rank의 `docs/E-AMUSEMENT.md`입니다. 모르는 필드는 서버가 거부하므로(strict) 익스텐션도 전송 전에 같은 제약의 Zod 스키마(`src/shared/rank-schema.ts`)로 검증합니다. 파일 이름은 `iidx-data-parser-rank-import-v2-<시각>.json`입니다.

```jsonc
{
    "version": 2,
    "kind": "iidx-rank-import",
    "generatedAt": "2026-10-07T10:05:00.000Z",
    "gameVersion": 34,
    "style": 0,
    "player": { "djName": "-TEST-", "iidxId": "1234-5678", "danRank": "十段", "djPoint": 1234.56, "playCountSp": 432, "playCountDp": 123 },
    "notesRadar": { "NOTES": 128.45, "CHORD": 131.22, "PEAK": 118.9, "CHARGE": 142.0, "SCRATCH": 136.75, "SOF-LAN": 124.1 },
    "charts": [
        {
            "chartId": "chart-6d4d8c5dd256f3870c3527063b541f01",
            "title": "冥",
            "difficulty": "A",
            "level": 12,
            "lamp": "FULL_COMBO",
            "scoreGrade": "AAA",
            "exScore": 3123,
            "missCount": null,
        },
    ],
}
```

변환 규칙(`src/core/rank-export.ts`):

- `player` 문자열은 64자를 넘으면 `null`이 됩니다. 곡명은 1~200자여야 하며 어긋난 차트는 제외합니다.
- `notesRadar`는 축 이름으로 매칭된 값(`matchedByLabel: true`)만 보내고 음수는 `null`로 바꿉니다. 값이 하나도 없으면 `null`입니다.
- `charts`는 최대 20000건, 본문은 최대 2MB입니다.
- `style`이 `1`(DP)이면 서버가 400 `UNSUPPORTED_STYLE`로 거부하므로 익스텐션은 전송하지 않습니다.

`lamp`와 `scoreGrade`는 iidx-rank의 `RecordSchema` 값 집합과 같습니다. 서버는 `level === 12`인 SP 차트 중 catalog와 `chartId`가 일치하는 것만 반영합니다.

## 호환성 규칙

- 필드를 추가할 때는 `schemaVersion`을 올립니다. dataset의 소비 측은 모르는 필드를 무시하되 버전이 다르면 거부합니다. rank-import는 서버가 모르는 필드도 거부합니다(strict).
- 미플레이 곡도 수집합니다. 램프가 `NO_PLAY`이고 점수가 `null`인 항목이 정상이며, 소비 측은 기록이 아니라 상태로 취급합니다.
- 같은 차트가 여러 레벨에서 나오면 `chartId` 기준으로 중복 제거합니다. 같은 곡의 다른 패턴은 `difficulty`가 달라 서로 다른 `chartId`를 가집니다.
