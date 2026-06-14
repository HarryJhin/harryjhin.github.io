---
author: 주진현
pubDatetime: 2026-02-11T09:00:00+09:00
title: "Spring Boot 4 API 버저닝: ApiVersionStrategy로 /v1 걷어내기 (Spring Web 다시 읽기 3)"
section: spring
tags:
  - spring-boot-4
  - spring-framework-7
  - api-versioning
  - rest
  - http
description: Spring MVC·WebFlux가 API 버저닝을 1급으로 지원한다. URL이냐 헤더냐 하는 "어떻게"를 ApiVersionStrategy로 추상화하고, 매핑은 version 속성만 선언한다. baseline 버전 1.2+가 풀어주는 메서드 중복 문제, 클라이언트 ApiVersionInserter까지 코드로 따라간다.
faq:
  - question: "Spring Boot 4에서 REST API 버전은 어떻게 매기나?"
    answer: "WebMvcConfigurer의 configureApiVersioning에서 전략(헤더/쿼리/경로/미디어타입)을 한 곳에 정하고, 컨트롤러는 @GetMapping(path=\"/account/{id}\", version=\"1.1\")처럼 매핑에 버전만 선언한다. 헤더·쿼리·미디어타입 전략이면 매핑에 추가 작업이 없다."
  - question: "API 버전을 헤더로 받을지 URL로 받을지 어떻게 고르나?"
    answer: "configureApiVersioning에서 useRequestHeader, usePathSegment 등 전략을 한 줄로 바꾼다. 컨트롤러 매핑과 클라이언트 호출 코드는 전략과 무관하게 동일하므로, 공개 API 가시성·캐싱·게이트웨이 친화성 같은 기준으로 전략만 갈아끼우면 된다."
  - question: "안 바뀐 엔드포인트도 버전마다 메서드를 복제해야 하나?"
    answer: "아니다. 고정 버전 \"1.2\" 대신 baseline 버전 \"1.2+\"를 쓰면 1.2 이상 모든 버전을 한 메서드가 처리한다. 응답이 실제로 바뀌는 버전에서만 새 메서드를 만들면 되어 버전×엔드포인트 조합 폭발을 막는다."
---

REST API 버저닝에 정답이 없다는 건 다들 안다. URL에 `/v1`을 박는 파, `API-Version` 헤더를 쓰는 파, `Accept` 미디어 타입 파라미터에 숨기는 파. 어느 쪽이 옳으냐는 거의 종교전쟁이고, 팀마다 결론이 다르다.

Spring Boot 3까지 이 싸움은 전부 애플리케이션 코드가 떠안았다. `@RequestMapping`에 `/v1`을 손으로 박거나, 커스텀 `RequestCondition`을 만들어 헤더를 비교하거나. 그러다 보면 버전 라우팅 로직이 컨트롤러 곳곳에 흩어진다.

Framework 7은 이 문제를 다르게 접근한다. 버전을 "어떻게" 전달하느냐(전략)와 "무엇"에 매핑하느냐(선언)를 분리했다. 전략은 한 곳에서 정하고, 컨트롤러는 자기가 지원하는 버전만 선언한다. MVC와 WebFlux 둘 다 1급으로 지원한다.

## ApiVersionStrategy: 버저닝의 중앙 정책

모든 버저닝 동작은 `ApiVersionStrategy` 하나로 모인다. 이게 네 가지 일을 한다.

1. 요청에서 버전 값을 꺼낸다 (`ApiVersionResolver`)
2. 꺼낸 raw 문자열을 비교 가능한 `Comparable`로 파싱한다 (`ApiVersionParser`)
3. 요청 버전이 지원 목록에 있는지 검증한다
4. 응답에 deprecation 힌트를 실어 보낸다

애플리케이션은 보통 `ApiVersionStrategy`를 직접 만지지 않는다. MVC 설정이 알아서 초기화한다. 개발자가 하는 건 "어떤 전략을 쓸지" 고르는 것뿐이다.

## 서버: 전략은 한 곳, 버전은 매핑에

설정은 `WebMvcConfigurer`에서 한 줄이다.

```java
@Configuration
public class WebConfiguration implements WebMvcConfigurer {

    @Override
    public void configureApiVersioning(ApiVersionConfigurer configurer) {
        configurer.useRequestHeader("API-Version");
    }
}
```

여기서 전략을 고른다. `useRequestHeader`는 헤더 전략이고, 같은 자리에서 path segment·query parameter·media type parameter 전략으로 바꾼다. 종교전쟁의 결론을 이 한 줄에 박아두면, 나머지 코드는 그게 헤더인지 경로인지 몰라도 된다.

그다음 컨트롤러는 버전만 선언한다.

```java
@RestController
public class AccountController {

    @GetMapping(path = "/account/{id}", version = "1.1")
    public Account getAccount(@PathVariable Long id) {
        // ...
    }
}
```

버전이 헤더·쿼리·미디어 타입에 실려 오면 매핑에서 할 일은 `version = "1.1"`이 전부다. 경로 자체에는 버전이 안 보인다. path segment 전략을 쓸 때만 경로에 버전이 드러난다. 손코딩 시절 `/v1/account/{id}`처럼 URL과 버전이 엉겨붙던 걸 떼어낸 셈이다.

## 설계의 핵심: baseline 버전 `1.2+`

여기가 이 기능에서 제일 잘 만든 부분이다.

버전이 올라갈 때마다 모든 엔드포인트를 복제해야 한다면 버저닝은 금방 지옥이 된다. `/account`는 1.2에서 1.3으로 가도 하나도 안 바뀌었는데, 단지 버전이 올라갔다는 이유로 `version = "1.3"` 메서드를 똑같이 또 만들어야 하나? 손코딩 방식이 늘 부딪히던 벽이다.

Framework 7은 baseline 버전으로 이걸 푼다. 고정 버전 `"1.2"` 대신 `"1.2+"`라고 쓰면, "1.2 이상 모든 버전"을 뜻한다.

```java
@GetMapping(path = "/account/{id}", version = "1.2+")
public Account getAccount(@PathVariable Long id) {
    // 1.2, 1.3, 그 이후까지 — 바뀔 때까지 이 메서드가 계속 처리
}
```

지원 버전이 1.2와 1.3일 때, `"1.2+"` 메서드는 둘 다 받는다. 그러다 1.3에서 이 엔드포인트의 응답 구조가 진짜로 바뀌는 순간, 그때 비로소 `version = "1.3"` 메서드를 새로 만들면 된다. 바뀐 것만 새 버전을 갖고, 안 바뀐 건 baseline 하나로 흘러간다. 버전 N개 × 엔드포인트 M개의 조합 폭발을 막는 설계다.

이게 가능한 이유는 2번 단계, 파싱에 있다. 기본 `SemanticApiVersionParser`가 버전을 major·minor·patch 정수로 쪼개서 비교 가능하게 만든다(`minor`·`patch`는 없으면 0). 그래서 `1.2+` 같은 범위 비교가 성립한다. 날짜 기반 버저닝(`2026-06-16`)을 쓰고 싶으면 파서를 갈아끼우면 된다.

## 검증과 기본 버전

버전을 켜면 기본적으로 버전은 필수다. 요청에 버전이 없으면 `MissingApiVersionException`이 나고 400으로 떨어진다. 지원하지 않는 버전을 보내면 `InvalidApiVersionException`, 역시 400이다.

이 엄격함은 끌 수 있다. 버전을 선택(optional)으로 바꾸면 버전이 없을 때 가장 최신 버전을 쓰고, 아예 기본 버전을 지정해둘 수도 있다.

지원 버전 목록도 두 가지 방식이다. 기본은 컨트롤러 매핑에 선언된 버전들을 자동으로 긁어모아 목록을 만든다. 컨트롤러에 `1.1`, `1.2+`가 있으면 그게 곧 지원 목록이다. MVC 설정에서 이 자동 수집을 끄고, 설정에 명시한 버전만 허용하도록 좁힐 수도 있다. 외부에 공개하는 버전을 의도적으로 통제하고 싶을 때 쓴다.

## 클라이언트: "어떻게"와 "무엇"의 분리

서버만 깔끔해지고 클라이언트가 헤더를 손으로 붙이고 있으면 반쪽이다. Framework 7은 클라이언트에도 같은 추상화를 줬다.

`ApiVersionInserter`가 "버전을 요청 어디에 넣을지"를 한 번 정한다.

```java
RestClient client = RestClient.builder()
    .baseUrl("http://localhost:8080")
    .apiVersionInserter(ApiVersionInserter.useHeader("API-Version"))
    .build();
```

한 번 인서터를 꽂아두면, 이후 요청에서는 버전 값만 지정한다. 호출하는 쪽은 그 버전이 헤더로 가는지 경로로 가는지 신경 쓸 필요가 없다. 서버에서 전략을 한 줄로 바꾼 것처럼, 클라이언트도 전송 방식을 한 곳에서 갈아끼운다. `RestClient`·`WebClient` 둘 다 같은 방식이다.

선언적 클라이언트인 HTTP Interface는 더 깔끔하다. `@HttpExchange`와 `@GetExchange`에 `version` 속성이 생겼다.

```java
@HttpExchange("/accounts")
public interface AccountService {

    @GetExchange(url = "/{id}", version = "1.1")
    Account getAccount(@PathVariable int id);
}
```

인터페이스에 버전을 선언만 하면, 실제 전송은 인서터가 처리한다. 서버 컨트롤러의 `version = "1.1"`과 모양이 거의 같다는 게 의도된 대칭이다. 서버와 클라이언트가 같은 언어로 버전을 말한다.

테스트도 빠지지 않는다. 7.0에서 새로 들어온 `RestTestClient`와 기존 `WebTestClient`가 버저닝을 그대로 지원한다.

## deprecation은 다음 글에서

`ApiVersionStrategy`의 4번 일, "응답에 deprecation 힌트 보내기"는 일부러 건너뛰었다. 이게 `StandardApiVersionDeprecationHandler`로 `Deprecation`·`Sunset`·`Link` 헤더를 RFC 9745·8594 형식으로 발급하는 부분인데, RFC 원문까지 펼칠 무게가 있어서 4부로 따로 뺀다.

## 정리

손코딩 `/v1`과 네이티브 버저닝의 진짜 차이는 "기능이 내장됐다"가 아니다. 버전을 어떻게 받을지와 어디에 매핑할지를 갈라놓은 구조가 차이다. 전략은 한 줄, 매핑은 `version` 한 속성, 안 바뀐 엔드포인트는 `1.2+` baseline 하나. 컨트롤러에 흩어져 있던 버전 분기 로직이 사라지는 게 체감되는 이득이다.

다음 4부는 미뤄둔 deprecation이다. 버전을 끊을 때 클라이언트에게 "이건 곧 죽는다"를 RFC 표준 헤더로 알리는 방법을 본다.

## 참고

- [API Versioning in Spring (spring.io 블로그)](https://spring.io/blog/2025/09/16/api-versioning-in-spring/)
- [API Versioning :: Spring Framework Reference](https://docs.spring.io/spring-framework/reference/web/webmvc-versioning.html)
- [The state of HTTP clients in Spring](https://spring.io/blog/2025/09/30/the-state-of-http-clients-in-spring/)
- [RestClient.Builder (Spring Framework 7.0 API)](https://docs.spring.io/spring-framework/docs/current/javadoc-api/org/springframework/web/client/RestClient.Builder.html)
