# The JVM Index

> Cloud-native, seen from the JVM — notes on Spring, Kotlin, and the path to Kubernetes.

[https://harryjhin.github.io](https://harryjhin.github.io) 의 소스입니다.
[Astro](https://astro.build) + [AstroPaper](https://github.com/satnaing/astro-paper) 테마 기반 정적 블로그.

## 다루는 주제

- **Spring / Spring Boot** — 웹, 데이터, 시큐리티, 배치, 클라우드
- **Java / Kotlin / JVM** — 언어, 런타임, 성능
- **Cloud Native (CNCF)** — 컨테이너화, Kubernetes, 관측성

## 로컬 개발

이 프로젝트는 **pnpm**을 사용합니다 (Node ≥ 22.12). corepack으로 활성화하세요.

```bash
corepack enable
pnpm install
pnpm dev          # http://localhost:4321
pnpm build        # 정적 빌드 + Pagefind 검색 인덱싱 → dist/
pnpm preview      # 빌드 결과 미리보기
```

## 글 작성

`src/content/posts/` 에 마크다운(`.md`/`.mdx`) 파일을 추가합니다.

```yaml
---
author: 주진현
pubDatetime: 2026-01-01T09:00:00+09:00
title: 글 제목
featured: false
draft: false
tags:
  - spring
description: 검색·SEO·RSS에 쓰이는 한 줄 요약.
---
```

## 배포

`main` 브랜치에 push하면 GitHub Actions(`.github/workflows/deploy.yml`)가
빌드 후 GitHub Pages로 자동 배포합니다. 수동 실행은 Actions 탭의 *Deploy to GitHub Pages* → *Run workflow*.

> GitHub 레포 **Settings → Pages → Build and deployment → Source** 를 **GitHub Actions**로 설정해야 합니다.

## 테마

[AstroPaper](https://github.com/satnaing/astro-paper) by Sat Naing (MIT License). 설정은 `astro-paper.config.ts` 한 파일에 중앙화돼 있습니다.
