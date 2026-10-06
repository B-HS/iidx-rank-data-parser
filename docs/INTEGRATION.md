# iidx-rank 연동

대상: `/Users/hyunseokbyun/development/iidx-rank` (Next.js + Drizzle + better-auth, Turso/SQLite)

## 현재 방식 — 파일 가져오기

익스텐션은 서버에 접속하지 않습니다. 사용자가 JSON을 내보내고 iidx-rank에서 읽습니다.

1. 익스텐션에서 `iidx-rank용`을 눌러 `iidx-data-parser-rank-import-v1-*.json`을 저장합니다.
2. iidx-rank에 가져오기 화면을 추가하고 파일을 업로드합니다.
3. 서버가 `charts[]`를 `user_record`로 upsert합니다.

가져오기 화면이 아직 없으므로 서버 측에 필요한 계약만 정리합니다.

### 서버가 해야 할 일

| 단계 | 내용                                                                                                  |
| ---- | ----------------------------------------------------------------------------------------------------- |
| 검증 | `version === 1 && kind === 'iidx-rank-import'`, `chartId` 형식, `lamp`·`scoreGrade` enum을 Zod로 검증 |
| 인증 | better-auth 세션 필수. 요청 본문의 사용자 식별자를 신뢰하지 않고 세션 UUID를 사용                     |
| 매칭 | `chartId`로 `catalog_charts`를 찾습니다. 없으면 건너뛰고 `skipped` 수를 응답에 포함                   |
| 병합 | `user_record`에 upsert. 기존 `memo`는 보존하고 `lamp`·`scoreGrade`·`updatedAt`만 갱신                 |
| 캐시 | 반영 후 `user:<uuid>:records` 태그를 `revalidateTag(tag, { expire: 0 })`로 만료                       |

### 충돌 정책 제안

- 램프는 상위 유지가 아니라 가져오기 값을 우선하되, 서버에 더 높은 램프가 있고 가져오기 값이 `NO_PLAY`이면 무시합니다. e-amusement 미플레이 표시가 실제 기록을 덮어쓰지 않게 하기 위함입니다.
- 점수는 최고값을 유지합니다. 가져오기 `exScore`가 기존보다 높을 때만 갱신합니다.
- 메모는 항상 보존합니다.

## 향후 — 익스텐션에서 직접 반영

사용자 요청의 최종 목표는 익스텐션에서 iidx-rank 인증을 거쳐 바로 반영하는 것입니다. 설계만 기록합니다.

### 인증 위임 흐름

```
[extension popup]
   → chrome.identity.launchWebAuthFlow로 iidx-rank 로그인 페이지 열기
   → better-auth 세션 생성 후 리다이렉트 URL로 일회용 코드 전달
   → 익스텐션이 코드를 받아 chrome.storage.session에 보관
   → 수집 완료 시 코드 + rank-import 본문을 POST
   → 서버가 코드를 세션으로 교환하고 반영
```

핵심 제약:

- 익스텐션은 better-auth 쿠키를 직접 만들거나 읽지 않습니다. 서버가 발급한 일회용 코드만 다룹니다.
- 코드는 1회용·단수명(예: 5분)이며 `chrome.storage.session`에만 둡니다. `local`에 영구 저장하지 않습니다.
- 서버는 `state` 값으로 CSRF를 막고, 리다이렉트 URL을 익스텐션 ID 화이트리스트로 제한합니다.
- 이메일/비밀번호는 익스텐션이 수집하지 않습니다. 로그인 화면은 항상 서버 페이지에서 렌더링합니다.

### 왜 쿠키를 직접 다루지 않는가

Chrome MV3에서 `p.eagate.573.jp`와 iidx-rank는 서로 다른 출처입니다. 익스텐션이 서버 쿠키를 복제하거나 직접 쓰면 better-auth의 세션 회전·만료 정책과 어긋나고, 탈취 위험도 커집니다. 따라서 서버가 인증 결과를 명시적으로 발급하는 코드 교환 방식을 사용합니다.

## 필요한 서버 확장

| 항목   | 내용                                                                                           |
| ------ | ---------------------------------------------------------------------------------------------- |
| API    | `POST /api/import/records` — rank-import 본문과 인증 코드를 받아 upsert                        |
| API    | `POST /api/auth/extension` — 일회용 코드 발급·교환                                             |
| 스키마 | `user_record`에 `exScore`·`missCount` 컬럼 추가 검토. 현재는 `lamp`·`scoreGrade`·`memo`만 저장 |
| 스키마 | `extension_authorization` 테이블 — 코드 해시, 만료, 사용 여부                                  |
| CORS   | iidx-rank 도메인에서 익스텐션 origin(`chrome-extension://<id>`)을 허용. `*`는 금지             |
| 문서   | `docs/E-AMUSEMENT.md`의 미해결 항목(안정 ID, 삭제곡, 개인 메모 보존)을 이 작업에서 확정        |

## 주의

- e-amusement는 공식 개인 데이터 API를 제공하지 않습니다. 이 익스텐션은 로그인한 본인의 브라우저 세션으로 본인 데이터를 읽습니다. 타인 데이터 수집, 자동 로그인, 요청 빈도 상향은 범위 밖이며 구현하지 않습니다.
- 수집 간격 기본값(500~1100ms)은 서버 부하를 낮추기 위한 것입니다. 낮추지 않습니다.
- iidx-rank 반영 후 원본 데이터 정합성 검증은 서버 책임입니다. 익스텐션은 파싱 결과를 그대로 전달하고 성공을 가정하지 않습니다.
