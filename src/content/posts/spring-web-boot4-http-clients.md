---
author: 주진현
pubDatetime: 2026-05-12T09:00:00+09:00
title: "Spring Boot 4 RestTemplate 대체: @HttpExchange와 RestTestClient (Spring Web 다시 읽기 7)"
section: spring
series:
  slug: spring-web-boot4
  order: 7
tags:
  - spring-boot-4
  - spring-framework-7
  - http-interface
  - testing
  - rest
description: 서버를 표준으로 정리했으면 클라이언트와 테스트도 따라와야 반쪽이 아니다. RestTemplate의 공식 deprecation, @HttpExchange 선언적 클라이언트와 HTTP Interface Groups, 그리고 라이브 서버와 단일 컨트롤러를 한 API로 테스트하는 RestTestClient로 시리즈를 닫는다.
faq:
  - question: "Spring Boot 4에서 RestTemplate 대신 무엇을 써야 하나?"
    answer: "동기 호출은 RestClient, 리액티브는 WebClient를 쓴다. RestTemplate은 7.0에서 deprecation 경로에 올랐고 7.1에서 공식 @Deprecated와 제거 예정 표시가 붙는다. Boot 4는 spring-boot-starter-restclient·spring-boot-starter-webclient로 클라이언트 의존성을 분리했다."
  - question: "@HttpExchange는 어떻게 쓰나?"
    answer: "인터페이스에 @HttpExchange와 @GetExchange·@PostExchange로 호출을 선언하면, Spring이 RestClient(또는 WebClient) 기반 구현을 프록시로 만들어준다. URL 조립·직렬화·응답 변환을 계약으로 선언만 하고 호출 코드는 짜지 않는다. 여러 클라이언트는 HTTP Interface Groups로 묶어 설정을 공유한다."
  - question: "TestRestTemplate은 계속 써도 되나?"
    answer: "7.0 신규 RestTestClient가 라이브 서버(bindToServer)와 단일 컨트롤러(bindToController)를 같은 fluent API로 테스트하며 대체 후보다. Boot 팀이 TestRestTemplate의 deprecation을 검토 중이다(spring-boot #46632). 단 bindToController는 필터·보안을 우회할 수 있어 전체 스택 검증은 bindToServer로 한다."
---

여섯 편 동안 서버 쪽을 봤다. Jackson 3로 직렬화가 바뀌고, API 버저닝이 전략으로 추상화되고, 에러와 deprecation이 RFC 표준 헤더로 나갔다. 그런데 서버만 표준으로 정리하면 반쪽이다. 그 서버를 부르는 클라이언트, 그리고 그 서버를 검증하는 테스트가 같은 수준으로 따라와야 한다.

마지막 7부는 클라이언트와 테스트다. 여기서 시리즈가 닫힌다.

## 먼저, HTTP 클라이언트 지형이 바뀌었다

Spring에는 HTTP 클라이언트가 여럿이다. `RestTemplate`, `RestClient`, `WebClient`. 7.0에서 이 지형에 큰 선이 하나 그어졌다. `RestTemplate`이 공식적으로 deprecation 길에 올랐다.

`RestTemplate`은 오래도록 "기능 완성(feature complete)" 상태였다. 더 손대지 않는다는 뜻이었지 죽이겠다는 건 아니었는데, 7.0 레퍼런스에서 deprecated로 표시됐고 7.1(잠정적으로 2026년 11월)에서 공식 `@Deprecated`와 제거 예정 표시가 붙는다. 이유는 단순하다. 템플릿 스타일 API가 한계에 닿았고, `RestClient`가 그 자리를 fluent API로 대체했다. `RestClient`는 6.1에서 들어와 6.x에서 자랐고, 7.0에서 또 한 차례 기능이 붙었다. 3부에서 본 API 버저닝(`ApiVersionInserter`)도 그 가운데 하나다.

Boot 4는 패키징도 손봤다. 그동안 `RestClient`는 `spring-web`, `WebClient`는 `spring-webflux`에 묻혀 있어서 "HTTP 클라이언트가 필요하다"를 의존성으로 표현하기 어려웠다. 이제 `spring-boot-starter-restclient`, `spring-boot-starter-webclient` 스타터로 의도를 분명히 선언한다.

## @HttpExchange: 인터페이스가 곧 클라이언트

가장 깔끔한 클라이언트는 직접 호출을 짜지 않는 클라이언트다. HTTP Interface는 인터페이스에 애너테이션만 붙여 선언하면, 구현은 Spring이 프록시로 만들어준다.

```java
@HttpExchange("/accounts")
public interface AccountService {

    @GetExchange("/{id}")
    Account getAccount(@PathVariable Long id);

    @PostExchange
    Account create(@RequestBody Account account);
}
```

3부에서 이 인터페이스에 `version` 속성을 달 수 있다는 걸 봤다. 여기서 핵심은 호출 코드가 한 줄도 없다는 점이다. URL 조립, 직렬화, 응답 변환을 인터페이스 계약으로 선언하면 끝이다. 이 인터페이스 뒤에는 `RestClient`(또는 `WebClient`)가 깔리고, 그 클라이언트가 메시지 변환·에러 처리 같은 걸 담당한다.

## HTTP Interface Groups: 반복을 묶는다

7.0이 여기 새 개념을 더했다. 클라이언트가 몇 개일 땐 괜찮지만, 외부 API를 열 개씩 부르기 시작하면 인터페이스마다 프록시를 만들고 설정을 거는 게 반복적이고 흩어진다.

그룹(group)은 여러 HTTP Interface 클라이언트를 한 번에 선언하고, 적절할 때 같은 `RestClient`를 공유하게 묶는다. 예를 들어 StackOverflow와 ServerFault를 부르는 인터페이스들을 "stackexchange" 그룹으로, GitHub 관련 인터페이스들을 "github" 그룹으로 묶어 각 그룹이 베이스 패키지 단위로 같은 HTTP 클라이언트를 쓰게 한다. 클라이언트 설정(베이스 URL, 공통 헤더, 인터셉터)을 그룹 단위로 한 번 정의하는 구조다.

여기서 시리즈 전체를 관통한 패턴이 또 보인다. API 버저닝이 "전략은 한 곳, 매핑은 선언"이었듯, HTTP Interface Groups도 "공통 설정은 그룹, 호출은 인터페이스 선언"이다. 반복되는 구성을 한 층 위로 끌어올려 한 번만 정의하게 하는 것.

## RestTestClient: 단위에서 통합까지 한 API로

테스트로 넘어가자. 7.0의 신규 `RestTestClient`는 그동안 갈라져 있던 테스트 도구들을 하나의 API로 모은다.

그전까지는 상황마다 도구가 달랐다. 단일 컨트롤러를 mock으로 빠르게 보려면 `MockMvc`, 리액티브 스택이나 라이브 서버엔 `WebTestClient`, Boot 통합 테스트엔 `TestRestTemplate`. 문법이 제각각이라 테스트 종류를 바꾸면 코드도 다시 썼다.

`RestTestClient`는 바인딩 방식만 바꾸면 같은 호출·검증 API를 쓴다.

```java
// 라이브 서버 — 네트워킹 스택과 메시지 변환을 전부 거친다
RestTestClient client = RestTestClient.bindToServer()
    .baseUrl("http://localhost:8080")
    .build();

client.get().uri("/accounts/1")
    .exchange()
    .expectStatus().isOk()
    .expectBody(Account.class);
```

같은 검증 코드를, 바인딩만 바꾸면 단일 컨트롤러에도 쓴다.

- `bindToServer()`: 실제 구동 중인 서버에 붙는다. 전체 스택을 탄다.
- `bindToController(...)`: 컨트롤러 하나를 standalone으로 띄운다. `MockMvc`처럼 가볍고 빠르다.
- `bindToApplicationContext(...)`: `WebApplicationContext` 기반으로 띄운다.

`exchange()` 이후의 `expectStatus()`, `expectBody()` 같은 검증 API는 바인딩과 무관하게 동일하다. 단위 테스트로 빠르게 짜뒀다가, 같은 검증을 라이브 서버 통합 테스트로 승격하기가 쉬워진다. Boot 팀은 이 도구가 `TestRestTemplate`을 대체할 수 있다고 보고 그쪽 deprecation을 검토 중이다([spring-boot #46632](https://github.com/spring-projects/spring-boot/issues/46632)).

### 한 가지 함정

편하다고 `bindToController()`만 쓰면 놓치는 게 있다. 이 방식은 컨트롤러만 격리해 띄우기 때문에 servlet 필터나 security 체크를 건너뛸 수 있다. 6부에서 본 `ForwardedHeaderFilter`나 인증 필터가 안 타는 경로라는 뜻이다. 그러면 테스트는 초록불인데 실제 배포에선 깨지는 false negative가 생긴다. 필터·보안까지 포함한 진짜 동작을 검증하려면 `bindToServer()`로 전체 스택을 태워야 한다.

테스트가 어디까지 실제를 흉내 내는지 아는 것, 이것도 6부에서 말한 "정확하게 다루기"의 일부다.

## 시리즈를 닫으며

일곱 편을 한 문장으로 줄이면 이렇다. Boot 4와 Framework 7의 Web 변화는 새 기능 잔치가 아니라, 그동안 각자 메우던 자리를 표준 구현으로 채운 릴리스다.

직렬화는 Jackson 3로(2부), 버전 전달은 `ApiVersionStrategy`로(3부), 버전 종료 통보는 RFC 9745·8594·8288 헤더로(4부), 에러 바디는 RFC 9457 `ProblemDetail`로(5부), 상태 코드와 프록시 헤더는 RFC 9110·7239로(6부), 그리고 클라이언트와 테스트는 선언적 인터페이스와 `RestTestClient`로(7부).

화려한 변화는 별로 없었다. 대신 사내 컨벤션으로 풀던 문제가 하나씩 표준 자리로 옮겨갔다. 상호운용성은 그 표준에서 공짜로 따라온다. 내가 표준대로 내보내면, 그 표준을 아는 모든 클라이언트·게이트웨이·도구가 별도 약속 없이 알아듣는다. 이게 이번 릴리스가 조용히, 그러나 단단하게 바꿔놓은 것이다.

## 참고

- [The state of HTTP clients in Spring](https://spring.io/blog/2025/09/30/the-state-of-http-clients-in-spring/)
- [HTTP Service Client Enhancements](https://spring.io/blog/2025/09/23/http-service-client-enhancements/)
- [RestTestClient (Spring Framework 7.0 API)](https://docs.spring.io/spring-framework/docs/current/javadoc-api/org/springframework/test/web/servlet/client/RestTestClient.html)
- [RestTestClient :: Spring Framework Reference](https://docs.spring.io/spring-framework/reference/7.0/testing/resttestclient.html)
- [REST Clients :: Spring Framework Reference (HTTP Interface)](https://docs.spring.io/spring-framework/reference/integration/rest-clients.html#rest-http-interface)
