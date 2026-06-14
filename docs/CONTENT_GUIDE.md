# 콘텐츠 작성 규약 (SEO / GEO / AEO)

검색엔진(SEO), 생성형 AI 답변(GEO), 답변엔진·스니펫(AEO) 노출을 위한 글쓰기 표준.
기술 구현은 `Layout.astro` / `PostLayout.astro` / `content.config.ts`에 반영돼 있고,
이 문서는 **글을 쓸 때 지킬 컨벤션**을 정리한다.

## Frontmatter 필수/권장

```yaml
---
title: "구체적이고 검색 의도를 담은 제목"
description: "120~160자. 핵심 결론을 한 문장으로. 메타 설명·RSS·llms.txt·OG에 그대로 쓰임."
pubDatetime: 2026-06-14T09:00:00+09:00
modDatetime: # 수정 시 갱신 (BlogPosting dateModified에 반영)
tags: [kotlin, spring] # JSON-LD keywords로 출력
faq: # 선택. 있으면 FAQPage 구조화 데이터 생성 (스니펫·AI 인용에 유리)
  - question: "질문을 사용자가 검색할 법한 자연어로"
    answer: "2~3문장 직답."
---
```

- `description`은 결론을 담아 한 문장으로. AI 답변엔진이 그대로 인용한다.
- `modDatetime`은 실제 수정 시 갱신 — 미설정 시 `dateModified`는 `datePublished`로 대체된다.

## 본문 구조 (AEO 핵심)

- **H2/H3를 질문형으로**: "java.time을 왜 확장하는가?"처럼 사용자가 검색할 문구로.
- 질문형 헤딩 **직후 2~3문장 직답 단락**을 둔다 (featured snippet / AI 인용 타깃).
- 핵심 정보는 **표·정의 목록**으로 (`ResponsiveTable` 사용 가능). 비교·옵션·수치는 표가 유리.
- 첫 단락(리드)에 글의 결론을 요약 — 크롤러·LLM이 가장 먼저 읽는다.
- 코드 블록에는 파일명·언어 명시.

## FAQ / HowTo

- Q&A형 콘텐츠 → frontmatter `faq` 배열 사용 → `FAQPage` JSON-LD 자동 생성.
- 단계별 튜토리얼(HowTo)은 현재 자동 스키마 미지원. 필요 시 본문을 번호 매긴 단계로 명확히 구성하고,
  추후 `howTo` frontmatter 지원을 추가한다.

## GEO (생성형 AI 답변)

- AI 크롤러는 전부 허용됨 (`robots.txt`). 콘텐츠가 LLM 학습·인용 대상이 된다.
- `/llms.txt`가 발행 글 목록(제목·URL·description)을 자동 노출 — description 품질이 곧 인용 품질.
- 사실·수치는 출처를 본문에 명시 (LLM이 검증된 사실로 인용하도록).

## 검증 체크리스트 (발행 전)

- [ ] description 120~160자, 결론 포함
- [ ] tags 지정 (keywords 출력)
- [ ] 헤딩 질문형 + 직답 단락
- [ ] (해당 시) faq 작성
- [ ] 빌드 후 [Rich Results Test](https://search.google.com/test/rich-results)로 BlogPosting/FAQPage 검증
