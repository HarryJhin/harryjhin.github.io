---
author: 주진현
pubDatetime: 2026-06-14T09:00:00+09:00
title: "Spring Boot 4·Framework 7 Web 변경점 총정리: 무엇이 바뀌었나 (Spring Web 다시 읽기 1)"
featured: true
section: spring
tags:
  - spring-boot-4
  - spring-framework-7
  - spring-web
  - http
  - rfc
description: Spring Boot 4·Framework 7의 Web 변화는 새 기능 추가가 아니라 "표준으로의 정렬"이다. Jackson 3, 네이티브 API 버저닝, RFC 9457·9745·8594·8288·9110 구현을 한 장의 지도로 묶고 7부작 딥다이브의 출발점을 잡는다.
faq:
  - question: "Spring Boot 4와 Spring Framework 7은 언제 출시됐나?"
    answer: "Spring Framework 7.0은 2025년 11월 13일, Spring Boot 4.0.0은 2025년 11월 20일에 GA됐다. JDK 17을 baseline으로 하면서 Java 25를 1급으로 지원하고, Jakarta EE 11(Tomcat 11, Hibernate ORM 7)을 채택했다."
  - question: "Spring Boot 4의 Web 관련 주요 변경점은?"
    answer: "기본 직렬화 엔진이 Jackson 3로 바뀌었고, 네이티브 API 버저닝, RFC 9457 ProblemDetail 에러 응답, RFC 9745·8594 deprecation·sunset 헤더, RFC 9110에 맞춘 HttpStatus, @HttpExchange·RestTestClient 같은 선언적 클라이언트/테스트가 들어왔다."
  - question: "Spring Boot 3에서 4로 올릴 때 가장 먼저 체감되는 변화는?"
    answer: "기본 JSON 엔진이 Jackson 3로 바뀌면서 날짜가 숫자 타임스탬프에서 ISO 문자열로, enum이 toString 기준으로, null→primitive가 예외로 바뀌는 등 JSON 출력이 달라진다. 컴파일은 통과하므로 직렬화 결과를 직접 비교해봐야 한다."
---

Spring Boot 3 시절, REST API에 버전을 붙이려면 어떻게 했나. `@RequestMapping`에 `/v1`, `/v2`를 손으로 박거나, 커스텀 `RequestCondition`을 만들거나, 헤더 라우팅을 직접 짰다. 에러 응답 포맷은 팀마다 제각각이었고, "Deprecated된 엔드포인트"를 클라이언트에 알리는 표준 방법 같은 건 없었다. 각자 사내 컨벤션으로 메웠다.

Boot 4와 Framework 7이 바꾼 건 이 "각자 메우던 자리"다. 새 장난감을 던져준 릴리스가 아니라, 그동안 우리가 임시변통으로 채우던 구멍을 RFC 표준 구현으로 메운 릴리스다. 그래서 변경 목록을 훑어보면 유독 RFC 번호가 많이 보인다. 9457, 9745, 8594, 8288, 9110. 우연이 아니라 이번 릴리스의 성격이다.

이 시리즈는 그 표준들을 하나씩, 원문 의도부터 Spring 구현 코드까지 따라가며 읽는다. 1부는 지도를 그린다.

## 먼저, baseline부터

표준 얘기를 하기 전에 바닥을 깔아야 한다. 코드는 그대로인데 실행 환경이 바뀌면 그게 더 무섭기 때문이다.

- **GA**: Spring Framework 7.0은 2025년 11월 13일, Spring Boot 4.0.0은 11월 20일에 나왔다.
- **JDK**: baseline이 JDK 17이다. 동시에 Java 25를 1급(first-class)으로 지원하면서 17 호환성도 유지한다. Java 8·11에서 올라오는 팀은 여기서부터 작업이다.
- **Jakarta EE 11**: Tomcat 11, Hibernate ORM 7, Hibernate Validator 9로 함께 올라간다.
- **주변 생태계**: Kotlin 2, Jackson 3, JUnit 6.
- **모듈화**: Spring Boot 코드베이스가 더 작고 초점이 분명한 jar들로 쪼개졌다.
- **null 안전성**: JSpecify 기반으로 포트폴리오 전반의 nullability 표기가 정리됐다.

이 중 Web 개발자가 당장 체감하는 건 Jackson 3가 기본이 됐다는 점이다. 직렬화는 모든 REST 응답이 지나가는 길목이라, 기본 ObjectMapper가 바뀌는 건 조용한 변화가 아니다. 2부에서 따로 다룬다.

## 변화 지도: 네 개의 축

Boot 4·FW7의 Web 변화를 무작정 나열하면 스무 개 항목이 되지만, 묶으면 네 덩어리다.

### 1. Jackson 3: 기본 직렬화 엔진 교체

Framework 7은 전 스택에서 Jackson 3.x를 기본으로 쓰고, Jackson 2.x로 폴백한다. Jackson 2는 deprecated 됐다. 단순 버전 올림이 아니라 패키지 네임스페이스와 Maven 좌표가 바뀌는 메이저 전환이라, 기존 설정 코드가 그대로 안 돈다.

대표적으로 `Jackson2ObjectMapperBuilder`에 대응하는 Jackson 3용 빌더가 없다. Spring은 Jackson이 제공하는 `JsonMapper.builder()`, `CBORMapper.builder()`를 직접 쓰라고 안내한다. 커스텀 ObjectMapper를 빈으로 등록해 쓰던 프로젝트라면 이 지점에서 가장 먼저 막힌다.

### 2. 네이티브 API 버저닝

MVC와 WebFlux가 API 버저닝을 1급으로 지원한다. `ApiVersionStrategy`를 중심으로 path, header, query parameter, media type 네 가지 전략을 고른다. 서버는 매핑에 버전을 직접 선언하고, 클라이언트(RestClient·WebClient·HTTP Interface)는 `ApiVersionInserter`로 요청에 버전을 주입한다.

서두에서 말한 "손으로 `/v1` 박던" 그 자리가 여기로 대체된다. 3부 주제다.

### 3. RFC 표준 구현: 이번 릴리스의 정체성

여기가 시리즈의 무게중심이다. 흩어져 있던 HTTP 관례들이 RFC 구현으로 들어왔다.

- **RFC 9457 (Problem Details)**: 에러 응답 표준. 구 RFC 7807의 후속이다. `ProblemDetail`·`ErrorResponse`로 에러 바디를 표준화하고, Spring MVC의 모든 내장 예외가 `ErrorResponse`를 구현한다. 내장 예외의 자동 변환은 `spring.mvc.problemdetails.enabled`로 켠다.
- **RFC 9745 (Deprecation 헤더) + RFC 8594 (Sunset 헤더) + RFC 8288 (Link 헤더)**: `StandardApiVersionDeprecationHandler`가 이 세 헤더를 자동으로 발급해, "이 버전은 언제 죽고 대체재는 어디"라는 정보를 표준 형식으로 클라이언트에 흘려보낸다.
- **RFC 9110 (HTTP Semantics)**: `HttpStatus`가 최신 표준에 맞춰 신규 상태 코드를 추가하고 일부를 deprecate 했다.
- **RFC 7239 (Forwarded)**: 프록시 뒤에서 원 클라이언트 정보를 복원하는 `ForwardedHeaderFilter`.

RFC 9457을 미리 맛보면 이런 JSON이다. 어느 Spring Boot 4 서비스에서 에러가 나든 같은 모양으로 떨어진다.

```json
{
  "type": "https://example.com/probs/out-of-credit",
  "title": "You do not have enough credit.",
  "status": 403,
  "detail": "Your current balance is 30, but that costs 50.",
  "instance": "/account/12345/msgs/abc"
}
```

프론트엔드 인터셉터 하나로 모든 마이크로서비스의 에러를 같은 방식으로 파싱할 수 있게 된다는 게 핵심 이득이다. 4부(Deprecation 헤더)와 5부(Problem Details)에서 RFC 원문 필드 정의까지 펼친다.

### 4. 선언적 클라이언트와 테스트

`@HttpExchange` 기반 HTTP Interface Client 구성이 1급으로 정리됐고, 비반응형 `RestTestClient`가 새로 들어왔다. 서버만 표준화되고 클라이언트·테스트가 따라오지 않으면 반쪽이라, 이 축이 나머지 셋을 닫아준다. 7부에서 다룬다.

## 왜 하필 "표준"인가

기능 하나하나는 따로 외워도 된다. 그런데 한 발 물러서면 방향이 보인다.

Spring이 자체 컨벤션으로 풀던 문제들을 IETF RFC 구현으로 바꾸는 흐름이다. 버전 deprecation을 사내 헤더로 알리던 걸 RFC 9745 `Deprecation` 헤더로, 제각각이던 에러 바디를 RFC 9457 `ProblemDetail`로. 이게 왜 중요하냐면, 표준은 상호운용성을 공짜로 준다. 내 서버가 RFC 9457로 에러를 내면, 그 포맷을 아는 모든 클라이언트 라이브러리·게이트웨이·관측 도구가 별도 약속 없이 알아듣는다. 사내 컨벤션은 사내에서만 통한다.

솔직히 이건 화려한 변화는 아니다. 신기능 데모처럼 박수가 나오진 않는다. 그런데 마이크로서비스를 여러 개 굴려본 입장에서, "팀마다 다른 에러 포맷"이 만드는 누수를 표준 하나로 막는 건 생각보다 큰 일이다.

## 시리즈 로드맵

표준/원리 딥다이브 7부작으로 간다. 각 편은 *RFC 원문 의도 → Spring 구현 매핑 → 코드*의 순서를 따른다.

1. **(이 글) 개요**: 변화 지도와 baseline
2. **Jackson 3 마이그레이션**: 패키지·좌표 전환, `JsonMapper.builder()`, `Jackson2ObjectMapperBuilder` 부재 대응, `HttpMessageConverter` 영향
3. **네이티브 API 버저닝**: `ApiVersionStrategy` 4개 전략, 서버 매핑 + 클라이언트 `ApiVersionInserter`
4. **API Deprecation을 표준 헤더로**: `StandardApiVersionDeprecationHandler`와 RFC 9745·8594·8288
5. **RFC 9457 Problem Details**: `ProblemDetail`·`ErrorResponse`, 프레임워크 전역 기본화, 검증 에러 확장
6. **HTTP 표준 정렬**: RFC 9110과 `HttpStatus` 개편, RFC 7239 `ForwardedHeaderFilter`
7. **HTTP Interface Client & RestTestClient**: `@HttpExchange` 1급 구성과 테스트

다음 글은 Jackson 3다. 기본 직렬화 엔진이 바뀐 자리부터 손에 잡히는 코드로 들어간다.

## 참고

- [Spring Framework 7.0 General Availability](https://spring.io/blog/2025/11/13/spring-framework-7-0-general-availability/)
- [Spring Boot 4.0.0 available now](https://spring.io/blog/2025/11/20/spring-boot-4-0-0-available-now/)
- [Spring Framework 7.0 Release Notes](https://github.com/spring-projects/spring-framework/wiki/Spring-Framework-7.0-Release-Notes)
- [API Versioning :: Spring Framework Reference](https://docs.spring.io/spring-framework/reference/7.0-SNAPSHOT/web/webmvc-versioning.html)
- [RFC 9457 — Problem Details for HTTP APIs](https://www.rfc-editor.org/rfc/rfc9457)
