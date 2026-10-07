# iidx-data-parser 작업 기록

## iidx-rank 연동·i18n·검증 보강

현재 상태: 구현·자동 검증·기록·GitHub 반영 완료 (6/6). 실제 Chrome 로드와 e-amusement·iidx-rank 실측은 미검증

- [x] a. 검증 리뷰(읽기 전용) — 파서·수집 오케스트레이션·저장·popup의 결함 목록
- [x] b. 코어·background — 리뷰 지적 수정, rank-import v2, iidx-rank 세션 확인과 자동 반영, 표시 문자열의 키화, 빌드 시 RANK_ORIGIN 주입
- [x] c. popup — 1파일 1컴포넌트 분리, useCallback 제거, iidx-rank 계정·반영 카드, chrome.i18n ko·ja·en, UI/UX 점검
- [x] d. 교차 리뷰 지적 반영 — 음수 DJ POINT 차단, 마지막 레벨 해제 방지, 데이터 삭제 범위에 반영 결과 포함
- [x] e. 문서 갱신 — README, ARCHITECTURE, DATA_SCHEMA, INTEGRATION, VERIFICATION, PARSING-NOTES
- [x] f. 검증·commit·push

사용자 결정(2026-10-07): 익스텐션은 브라우저의 iidx-rank 세션을 그대로 쓰고, 수집이 끝나면 그 계정으로 자동 반영합니다. 두 저장소가 함께 지키는 계약은 iidx-rank 저장소의 `docs/E-AMUSEMENT.md`입니다.

main의 기본값: i18n은 Chrome 공식 `chrome.i18n`(`_locales`)을 쓰고 브라우저 언어를 따릅니다. 번들러가 Bun.build라 React Compiler는 넣지 않고 수동 메모이제이션이 필요 없도록 구조를 바꿨습니다.

형식 변화: dataset과 rank-import가 v2가 되었고 저장 키도 v2입니다. 이전에 수집해 둔 데이터는 다시 수집해야 합니다. manifest에서 쓰이지 않던 `scripting`·`downloads` 권한을 뺐습니다.

검증: `bun run typecheck` 오류 0, `bun test` 115 pass, `bun run build` 성공(`host_permissions`에 e-agate와 `https://iidx.hyns.dev/*`, `default_locale` en, `_locales` 3개 언어). `RANK_ORIGIN=http://localhost:3000 bun run build`로 대상 출처가 바뀌는 것도 확인했습니다.

남은 확인(수동 절차는 `docs/VERIFICATION.md`):

- service worker의 `fetch(credentials: 'include')`에 iidx-rank 세션 쿠키가 실제로 붙는지(세션 확인에만 해당)
- 반영 버튼과 수집 완료 뒤에 `<RANK_ORIGIN>/import` 탭이 열리고, 업로드 중 표시 뒤에 결과 표가 보이며, 같은 결과가 popup 반영 카드에 남는지(서버에 익스텐션 ID 등록 없이)
- `/import` 탭을 닫거나 새로고침했을 때 popup의 진행 중 안내와 다시 시도, 10분 뒤 만료 표시가 동작하는지
- 실제 수집에서의 `unmatched` 목록과 `docs/PARSING-NOTES.md`의 확인 필요 항목

보류: 수집 탭을 비활성으로 둘지, 곡명을 NFKC 전 원문으로 저장할지, MISS COUNT 수집(곡 상세 페이지 필요), manifest `key`로 ID 고정, `tabs`·`unlimitedStorage` 권한 제거, 미사용 코드(`parseRadarJson`, `difficultyUrl`, `resolveDifficultyCode`, `src/ui/input.tsx`) 정리.

## iidx-rank 반영을 가져오기 화면 경유로 전환

현재 상태: 구현·자동 검증·기록·GitHub 반영 완료 (4/4). 실제 Chrome에 로드한 익스텐션과 운영 화면의 왕복은 사용자 확인 대기

- [x] a. 직접 POST 제거, handoff(10분 만료)와 반영 시작 시 `<RANK_ORIGIN>/import` 탭 열기
- [x] b. iidx-rank용 content script(`rank-content-script.js`)와 메시지 규약, background의 handoff 조회·결과 보고(sender 검사)
- [x] c. 진행 중·만료 상태와 popup 문구, ko·ja·en 번역, 문서 갱신
- [x] d. main — 실패 보고 뒤에도 handoff를 만료까지 유지해 화면의 다시 시도 결과를 받도록 수정, 검증·commit·push

사용자 지적(2026-10-07): 반영이 `ORIGIN_NOT_ALLOWED`로 실패했고 서버에 익스텐션 ID를 등록하는 절차를 없애 달라는 요청이었습니다. 사용자 결정으로 익스텐션은 iidx-rank의 가져오기 화면을 열고, 화면이 업로드 중 표시 뒤 결과 표를 보여 줍니다. 계약은 iidx-rank 저장소 `docs/E-AMUSEMENT.md`의 "익스텐션 반영 흐름 (페이지 경유)"입니다.

검증: `bun run typecheck` 오류 0, `bun test` 148 pass, `bun run build` 성공(content_scripts에 e-agate용과 `https://iidx.hyns.dev/*`용 두 항목). 로컬 iidx-rank 서버의 `/import` 화면에 빌드된 `rank-content-script.js`를 넣고 background 응답만 흉내 내어 hello → ready → payload → 업로드 → result 보고까지 확인했습니다.
