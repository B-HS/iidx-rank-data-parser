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

- service worker의 `fetch(credentials: 'include')`에 iidx-rank 세션 쿠키가 실제로 붙는지
- 서버 `EXTENSION_ORIGINS`에 이 익스텐션 ID 등록 후 반영이 200으로 끝나는지
- 실제 수집에서의 `unmatched` 목록과 `docs/PARSING-NOTES.md`의 확인 필요 항목

보류: 수집 탭을 비활성으로 둘지, 곡명을 NFKC 전 원문으로 저장할지, MISS COUNT 수집(곡 상세 페이지 필요), manifest `key`로 ID 고정, `tabs`·`unlimitedStorage` 권한 제거, 미사용 코드(`parseRadarJson`, `difficultyUrl`, `resolveDifficultyCode`, `src/ui/input.tsx`) 정리.
