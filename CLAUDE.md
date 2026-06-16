# CLAUDE.md — The JVM Index (AstroPaper 블로그)

AstroPaper v6 기반 기술 블로그. 스택·빌드·설정 상세는 `astropaper` 스킬에 위임. 이 파일은 **포스트 작성 표준 프로세스**와 repo 교정 로그만 담는다.

## 포스트 작성 표준 프로세스 (소스 → 글 → FAQ → 검증)

RFC/스펙/문서를 소재로 글을 쓸 때 아래 순서를 표준으로 따른다. 단계 생략 금지.

1. **소스 grounding** — 소재 원문을 `c4ai-sse`(`md`)로 직접 fetch해 읽는다. 본문에 쓸 사실이 소재 원문 밖이면(예: 다른 RFC, 버전, 날짜) 그 출처도 별도 fetch해 확인하고 쓴다. 훈련 데이터 기억만으로 수치·버전·날짜·스펙 단정 금지. 근거 없는 구체는 채우지 말고 삭제.
2. **컨벤션 파악** — 기존 포스트(특히 같은 계열: RFC 해설은 `what-is-rfc.md`)의 frontmatter·문체·참고 섹션 구조를 Read해 맞춘다. `section` 값은 `grep`으로 기존 관행 확인(`web`/`spring`/`cloud-native`/`kotlin`). slug = 파일명, posts 위치 = `src/content/posts/`.
3. **초안 (1인칭 보이스)** — `writing-korean-prose` 스킬 규율 적용. 1인칭 고백형 톤, 의도적으로 들쭉날쭉한 문단 리듬, 균형 마무리 클리셰·번역투·과한 인라인 볼드·em dash 금지. 본문은 보이스, 사실은 날조 금지.
4. **query fan-out FAQ** — `optimizing-for-ai-search` 규율 적용. LLM 웹검색이 분해할 하위 쿼리 3~5개를 예측하고, 각각에 1:1 대응하는 FAQ를 frontmatter `faq:`에 추가. 답은 **단정형으로 시작**(lead-with-answer), 40~60단어, 소재 원문에 grounding. 본문 1인칭 톤과 달리 FAQ는 객관·단정 어조로 분업. `PostLayout.astro`가 `faq`로 schema.org `FAQPage` JSON-LD를 자동 방출(`src/layouts/PostLayout.astro:60-64,122`) + 본문 FAQ 섹션 렌더.
5. **검증 게이트** — 완료 주장 전 반드시:
   ```bash
   export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use || nvm use 24
   pnpm exec astro check   # 0 errors 확인
   ```
   frontmatter 스키마(`faq` 포함)·타입이 통과해야 한다. 벤더 GEO 수치(FAQ 3.2x 등)는 단정 인용 금지 — 방향만 채택.
6. **커밋** — 사용자 요청 시에만. `git add .` 금지, 개별 staging. 플러그인/plan 산출물(`crawled-ai-articles/` 등) staging 대상 아님.

## repo 교정 로그

- **pnpm 전용.** npm 쓰면 `astro check`가 vite plugin 타입 미스매치로 깨진다.
- **Bash fresh 셸은 Node v22를 잡는다.** node/pnpm 실행 전 `nvm use` 먼저(위 검증 게이트 참조).
- **`section` frontmatter는 문서엔 없지만 실재한다** (`src/content.config.ts`에 `z.string().optional()`). 기존 포스트와 값 맞출 것.
- **user site**(`harryjhin.github.io`)다 — `astro.config.ts`에 `base` 설정 금지, `site`만.
