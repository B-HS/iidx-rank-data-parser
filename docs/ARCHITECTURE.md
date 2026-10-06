# 아키텍처

## 구성 요소

| 경로                         | 역할                                                      |
| ---------------------------- | --------------------------------------------------------- |
| `src/content-script.ts`      | e-agate 페이지에서 DOM을 읽어 파싱 결과를 돌려주는 브리지 |
| `src/core/eagate-parsers.ts` | 로그인·DJ 정보·노트레이더·난이도 페이지 파서              |
| `src/core/chart-id.ts`       | iidx-rank와 동일한 `chart-<sha256 32자>` 식별자 생성      |
| `src/core/rank-export.ts`    | iidx-rank 가져오기용 요약 변환                            |
| `src/background/index.ts`    | 탭 오케스트레이션, 진행률 저장, export 처리               |
| `src/shared/schema.ts`       | Zod 단일 출처 DTO                                         |
| `src/shared/storage.ts`      | `chrome.storage` 읽기·쓰기 래퍼                           |
| `src/widgets/popup/*`        | popup UI                                                  |

파서는 순수 함수이고 `Document`만 입력으로 받습니다. 네트워크·스토리지·권한은 background 계층에만 있습니다.

## 수집 오케스트레이션

background는 popup의 요청을 받으면 `runCollection`을 실행합니다. 전체는 하나의 탭에서 순차로 진행됩니다.

1. 로그인 확인 — `index.html`을 열고 로그인 상태를 판정합니다. 60초 이내의 성공 결과는 재사용합니다.
2. DJ 정보 — `djdata/status.html`로 이동해 `EXTRACT STATUS`를 요청합니다.
3. 노트레이더 — `djdata/music/notesradar.html`로 이동합니다. 비동기 JSON 엔드포인트(`djdata/music/json/notesradar.html`)를 먼저 시도하고, 값이 비어 있으면 같은 문서에서 DOM 파싱으로 대체합니다.
4. 곡 데이터 — 선택한 레벨마다 `difficult=<level-1>&style=<style>&disp=1&offset=<n>`을 0부터 50씩 증가시키며 요청합니다.
5. 저장 — `DatasetSchema.parse`로 검증한 뒤 `chrome.storage.local`에 저장합니다.

종료 조건은 데이터 없음 문구, 0건 페이지, 또는 페이지당 50건 미만입니다. 레벨당 상한은 60페이지입니다. 레벨 하나가 실패하면 경고를 남기고 다음 레벨로 진행하며, 최종 상태는 `partial`이 됩니다.

요청 사이에는 `DELAY_PROFILES`의 균등분포 대기를 둡니다. 이는 서버 부하를 사람의 페이지 넘김 속도로 낮추기 위한 것입니다.

## 로그인 감지

`#error-page .error_login`이 있거나 페이지 내 `ea_common_template.userstatus`의 `"login": false`가 있으면 로그아웃으로 판정합니다. 그 밖에는 `#log-on .on-name` 목록의 DJ NAME·커뮤니티 닉네임이 `---`가 아닐 때 로그인으로 봅니다. 두 경로 모두 실패하면 `false`로 처리합니다(fail-closed).

## 권한 경계

| 권한                                | 사용 목적                                    |
| ----------------------------------- | -------------------------------------------- |
| `storage`, `unlimitedStorage`       | 수집 결과·로그인 상태·설정 저장              |
| `tabs`                              | 수집용 탭 생성·닫기·이동, 페이지 로딩 대기   |
| `scripting`                         | 로그인 세션 쿠키로 notesradar JSON 요청 실행 |
| `downloads`                         | popup에서 export 파일 저장                   |
| `host_permissions: p.eagate.573.jp` | 수집 대상 호스트 한정                        |

계정 비밀번호·쿠키 값을 코드에서 읽거나 저장하지 않습니다. JSON 요청은 `credentials: 'include'`로 브라우저 세션을 그대로 사용하며 background에서 쿠키 헤더를 직접 조작하지 않습니다.

## 확장 지점

- 게임 버전: `GAME_VERSION` 상수 단일 지점.
- 페이지 구조 변경: `eagate-parsers.ts`의 선택자·정규식만 수정. UI·스토리지 계층은 그대로 유지됩니다.
- 수집 항목 추가: `EXTRACT_KINDS`에 종류를 추가하고 `ExtractPayload`에 필드를 넣은 뒤 `DatasetSchema`에 반영합니다.
- 서버 연동: `docs/INTEGRATION.md`의 인증 흐름 계획을 참고합니다. `rank-export.ts`가 이미 서버가 기대하는 형태로 투영하므로, 이후에는 전송 계층만 추가하면 됩니다.
