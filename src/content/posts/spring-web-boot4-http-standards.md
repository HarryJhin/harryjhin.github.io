---
author: 주진현
pubDatetime: 2026-04-14T09:00:00+09:00
title: "Spring Boot 4 HttpStatus 변경: RFC 9110 정렬과 Forwarded 헤더 (Spring Web 다시 읽기 6)"
section: spring
tags:
  - spring-boot-4
  - spring-framework-7
  - http
  - rfc
  - security
description: HTTP 상태 코드와 헤더는 다 아는 영역 같지만 RFC는 계속 갱신된다. Framework 7이 RFC 9110에 맞춰 HttpStatus 상수 이름을 바꾸고(숫자는 그대로), RFC 7239 ForwardedHeaderFilter로 프록시 뒤 정보를 복원하고, trailing slash 매칭을 보안 이유로 걷어낸 자리를 본다.
faq:
  - question: "HttpStatus.UNPROCESSABLE_ENTITY가 왜 deprecated 됐나?"
    answer: "RFC 9110이 \"Entity\"를 \"Content\"로 용어를 통일하면서, Framework 7이 UNPROCESSABLE_CONTENT 상수를 추가하고 옛 UNPROCESSABLE_ENTITY를 deprecated로 표시했다(spring-framework #32870). 숫자 코드 422는 그대로다. 413 PAYLOAD_TOO_LARGE → CONTENT_TOO_LARGE, 418 I_AM_A_TEAPOT deprecated도 같은 정렬이다."
  - question: "프록시 뒤에서 host나 scheme이 틀리게 나온다?"
    answer: "ForwardedHeaderFilter가 RFC 7239 Forwarded(및 X-Forwarded-Host/Proto/Port) 헤더를 읽어 요청의 host·port·scheme을 원래 값으로 복원한다. 단 헤더 위조 위험이 있어, 신뢰 경계 프록시가 외부 헤더를 제거해야 하고 프록시 뒤가 아니라면 setRemoveOnly(true)로 쓴다."
  - question: "Spring Boot 4에서 /users와 /users/가 다르게 동작한다?"
    answer: "trailing slash 매칭이 6.0에서 보안상 deprecated, 7.0에서 제거됐다. URL 기반 인가 규칙과 매핑이 어긋나 우회가 생길 수 있기 때문이다. 대신 UrlHandlerFilter로 trailing slash를 명시적으로 제거해 경로를 정규화한다."
---

HTTP 상태 코드는 다 외운 것 같은 영역이다. 200, 404, 500. `422`가 "Unprocessable Entity"라는 것도 안다. 그런데 그 "Entity"라는 단어가 최신 표준에서 바뀐 건 의외로 모른다.

HTTP 명세는 멈춰 있지 않다. 2022년 RFC 9110이 흩어져 있던 HTTP 시맨틱 문서들을 한데 모아 정리하면서 용어도 손봤다. Framework 7은 거기에 맞춰 `HttpStatus`를 조정했다. 이번 6부는 그렇게 "이미 안다고 생각한 자리"가 표준 갱신으로 바뀐 지점들을 본다.

## RFC 9110: 숫자는 그대로, 이름이 바뀐다

먼저 분명히 할 것. 상태 코드 숫자는 하나도 안 바뀐다. 422는 여전히 422고, 413은 여전히 413이다. 와이어를 타는 값은 불변이다. 바뀐 건 Spring이 그 숫자에 붙인 Java 상수 이름이다.

RFC 9110은 두 군데서 용어를 정리했다.

```java
// 413
HttpStatus.PAYLOAD_TOO_LARGE       // deprecated
HttpStatus.CONTENT_TOO_LARGE       // 새 이름

// 422
HttpStatus.UNPROCESSABLE_ENTITY    // deprecated
HttpStatus.UNPROCESSABLE_CONTENT   // 새 이름
```

"Payload", "Entity"라고 부르던 걸 RFC 9110이 "Content"로 통일했다. Spring은 새 이름의 상수를 추가하고, 옛 이름은 `@Deprecated`로 표시했다([spring-framework #32870](https://github.com/spring-projects/spring-framework/issues/32870)). 둘 다 같은 숫자를 가리키니 동작은 똑같다. `UNPROCESSABLE_ENTITY`나 `UNPROCESSABLE_CONTENT`나 응답엔 `422`가 나간다.

418도 손봤다. `I_AM_A_TEAPOT`은 7.0부터 deprecated인데, 사유가 재밌다. "RFC 9110에서 unused로 표시됨." 만우절 농담으로 들어왔던 그 찻주전자 코드를, 표준이 공식적으로 "안 쓰는 것"으로 정리하자 Spring도 따라 deprecated로 내렸다.

deprecated지 제거가 아니라는 게 중요하다. 옛 상수를 쓰던 코드는 그대로 컴파일되고 동작한다. 다만 IDE가 줄을 긋고, 새 코드는 새 이름을 쓰라고 안내한다. 마이그레이션 영향은 `HttpStatus` 상수를 직접 참조하는 코드에 한정된다. 숫자로 응답을 비교하던 클라이언트는 아무 영향이 없다.

이 변화의 결은 좀 특이하다. 기능이 늘지도, 동작이 바뀌지도 않았다. 단지 코드 안의 단어를 표준 문서의 단어와 맞췄을 뿐이다. 표준 정렬이라는 게 때로 이렇게 눈에 안 보이고, API 이름표만 바꾸는 일이다.

## RFC 7239: 프록시 뒤에서 나를 찾기

상태 코드에서 헤더로 넘어가자. 여기서 다루는 `ForwardedHeaderFilter`는 Framework 7 신규가 아니다. 오래전부터 있던 필터다. 다만 RFC 표준을 구현한 좋은 예라 이 시리즈 흐름에 넣는다.

문제는 이렇다. 요청이 로드 밸런서·리버스 프록시를 거치면 서버가 보는 host·port·scheme이 원래 클라이언트가 본 것과 달라진다. 클라이언트는 `https://example.com`으로 들어왔는데, 프록시 뒤 서버는 `http://localhost:8080`으로 받는다. 이 상태로 서버가 리다이렉트 URL이나 절대 링크를 만들면 `http://localhost:8080`이 박혀 나간다. 클라이언트 입장에선 깨진 링크다.

RFC 7239가 이걸 표준화한 게 `Forwarded` 헤더다. 프록시가 원래 요청 정보를 여기 실어 보낸다.

```http
Forwarded: for=192.0.2.60; proto=https; host=example.com
```

그전부터 쓰이던 `X-Forwarded-Host`, `X-Forwarded-Proto`, `X-Forwarded-Port` 같은 헤더들은 표준이 아니라 사실상의(de-facto) 관행이다. RFC 7239는 이 난립을 하나의 `Forwarded` 헤더로 모았다.

`ForwardedHeaderFilter`는 이 헤더들을 읽어 요청의 host·port·scheme을 원래 값으로 복원하는 서블릿 필터다. 두 가지 일을 한다. (a) `Forwarded`(및 `X-Forwarded-*`) 헤더를 보고 요청 정보를 바꾸고, (b) 그 헤더를 제거해서 뒤따르는 처리에 영향이 안 가게 한다. 요청을 래핑하는 방식이라, `RequestContextFilter`처럼 바뀐 요청을 봐야 하는 필터보다 앞에 와야 한다.

```java
@Bean
ForwardedHeaderFilter forwardedHeaderFilter() {
    return new ForwardedHeaderFilter();
}
```

### 그런데 이 헤더를 믿어도 되나

여기 보안 함정이 있다. 서버는 `Forwarded` 헤더가 진짜 프록시가 붙인 건지, 악의적 클라이언트가 위조한 건지 구분할 수 없다. 외부에서 `Forwarded: host=evil.com`을 그냥 보내면? 필터가 그대로 믿고 host를 바꾼다. 링크 위조, 캐시 오염으로 이어질 수 있다.

그래서 원칙은 둘이다. 신뢰 경계에 있는 프록시가 외부에서 들어온 `Forwarded` 헤더를 제거하고 자기가 새로 붙여야 한다. 그리고 애플리케이션이 프록시 뒤에 있지 않다면, 필터를 `removeOnly`로 설정해 헤더를 쓰지 않고 제거만 하게 한다.

```java
@Bean
ForwardedHeaderFilter forwardedHeaderFilter() {
    ForwardedHeaderFilter filter = new ForwardedHeaderFilter();
    filter.setRemoveOnly(true);   // 헤더를 신뢰하지 않고 제거만
    return filter;
}
```

표준 헤더를 구현한다는 건 그 헤더를 파싱하는 것만이 아니다. 누가 그 헤더를 붙였는지 신뢰할 수 있느냐까지 설계에 들어와야 한다. RFC 7239 자체가 보안 고려사항을 명시하는 이유다.

## 보너스: trailing slash 매칭이 사라졌다

이건 Framework 7 신규 변경이고, 같은 "표준·보안 정렬"의 결이라 덧붙인다.

Spring MVC는 오래도록 trailing slash를 너그럽게 처리했다. `/users`로 매핑했어도 `/users/`가 들어오면 같은 핸들러로 보냈다. 편해 보이지만 보안 구멍이 된다. URL 기반 인가 규칙(`/admin`을 막음)과 프레임워크 매핑(`/admin/`도 받음)이 어긋나면, `/admin/`으로 인가를 우회할 수 있다.

이 trailing slash 매칭은 6.0에서 보안상의 이유로 deprecated 됐고, 7.0에서 제거됐다. 대신 `UrlHandlerFilter`가 더 안전한 대안을 준다. 필요하면 이 필터로 trailing slash를 명시적으로 제거해, 경로를 한 가지 형태로 정규화한 뒤 매핑·인가가 같은 걸 보게 한다. 암묵적 관용을 명시적 정규화로 바꾼 셈이다.

## 정리

6부의 세 변화는 전부 화려함과 거리가 멀다. 상태 코드는 이름만 바꿨고(숫자는 안 건드림), `ForwardedHeaderFilter`는 원래 있던 거고, trailing slash는 그냥 없앴다. 그런데 공통점이 있다. HTTP를 "대충 통하게"가 아니라 "표준대로 정확하게" 다루는 쪽으로 미는 변화다. 그리고 그 정확함의 절반은 보안이다. 위조된 `Forwarded` 헤더, `/admin/`로 새는 인가. 표준을 어설프게 따르면 생기는 구멍을 메우는 일이다.

다음 7부는 시리즈의 마지막, HTTP Interface Client와 RestTestClient다. 선언적 클라이언트가 1급으로 정리된 이야기로 시리즈를 닫는다.

## 참고

- [RFC 9110: HTTP Semantics](https://www.rfc-editor.org/rfc/rfc9110.html)
- [RFC 7239: Forwarded HTTP Extension](https://www.rfc-editor.org/rfc/rfc7239.html)
- [HttpStatus (Spring Framework 7.0 API)](https://docs.spring.io/spring-framework/docs/current/javadoc-api/org/springframework/http/HttpStatus.html)
- [Filters :: Spring Framework Reference (Forwarded Headers)](https://docs.spring.io/spring-framework/reference/web/webmvc/filters.html#filters-forwarded-headers)
- [Spring Framework 7.0 Release Notes](https://github.com/spring-projects/spring-framework/wiki/Spring-Framework-7.0-Release-Notes)
