---
author: 주진현
pubDatetime: 2026-03-23T09:00:00+09:00
title: "Spring Boot 4 에러 응답 표준화: RFC 9457 ProblemDetail 사용법 (Spring Web 다시 읽기 5)"
section: spring
series:
  slug: spring-web-boot4
  order: 5
tags:
  - spring-boot-4
  - spring-framework-7
  - problem-details
  - rfc
  - error-handling
description: 에러 응답 포맷이 서비스마다 다른 문제를 RFC 9457이 표준 바디로 푼다. Spring의 ProblemDetail과 ErrorResponse가 어떻게 맞물리는지, 내장 예외까지 표준 형식으로 내보내는 법, properties Map으로 검증 에러를 확장하는 법을 코드로 따라간다.
faq:
  - question: "RFC 9457 Problem Details가 무엇인가?"
    answer: "HTTP API 에러 응답 바디를 표준화한 명세다. type·title·status·detail·instance 다섯 필드를 가진 JSON에 application/problem+json 미디어 타입을 쓴다. 구 RFC 7807의 후속으로, 서비스마다 제각각이던 에러 포맷을 한 형식으로 통일한다."
  - question: "Spring에서 모든 예외를 RFC 9457로 내보내려면?"
    answer: "ResponseEntityExceptionHandler를 상속해 @ControllerAdvice로 등록하거나, Spring Boot에서 spring.mvc.problemdetails.enabled=true로 켠다. 그러면 Spring MVC 내장 예외들이 ProblemDetail로 변환된다. 단 커스텀 @ExceptionHandler와 우선순위가 충돌하면 @Order로 명시해야 한다."
  - question: "ProblemDetail에 커스텀 필드를 추가하려면?"
    answer: "ProblemDetail.setProperty(key, value)로 properties Map에 넣으면 ProblemDetailJacksonMixin이 그 값을 최상위 JSON 필드로 펼친다. 검증 에러의 필드별 메시지도 이렇게 errors 같은 키로 담는다."
---

마이크로서비스를 몇 개 굴려보면 에러 응답이 제일 먼저 엉킨다. 주문 서비스는 `{"error": "not found"}`, 결제 서비스는 `{"code": 4001, "message": "...", "timestamp": "..."}`, 어떤 팀은 `{"errors": [...]}`. 프론트엔드는 서비스마다 다른 파싱 로직을 들고 있어야 하고, 새 서비스가 붙을 때마다 또 하나 추가된다.

이건 표준이 없어서 생기는 비용이다. 그리고 표준은 이미 있다. RFC 9457, "Problem Details for HTTP APIs". 구 RFC 7807의 후속이고, Spring은 이걸 `ProblemDetail`과 `ErrorResponse`로 구현한다.

## RFC 9457이 정하는 다섯 필드

RFC 9457은 에러 바디를 JSON 객체 하나로 표준화한다. 필드는 다섯 개다.

- **type**: 문제 유형을 식별하는 URI. 같은 종류의 에러는 같은 type을 갖는다. 일종의 에러 코드인데 URI라서 그 자체가 문서 주소가 될 수 있다.
- **title**: 사람이 읽는 짧은 요약. type마다 고정된 문구.
- **status**: HTTP 상태 코드. 바디 안에도 넣어 응답 라인과 일치시킨다.
- **detail**: 이 발생 건에 대한 구체적 설명. title이 "잔액 부족"이면 detail은 "잔액 30, 필요 50".
- **instance**: 이 특정 발생을 식별하는 URI. 보통 요청 경로.

미디어 타입도 따로 있다. `application/json`이 아니라 `application/problem+json`을 쓴다. 클라이언트가 "이건 표준 에러 바디"임을 콘텐츠 협상 단계에서 안다.

## Spring의 두 축: ProblemDetail과 ErrorResponse

Spring은 이 표준을 두 타입으로 나눠 구현한다. 역할이 다르다.

`ProblemDetail`은 데이터 컨테이너다. 위 다섯 필드를 담고, 거기에 비표준 필드를 위한 `properties` Map을 더한다. 그냥 값 객체라고 보면 된다.

`ErrorResponse`는 계약(contract)이다. "나는 HTTP 상태·헤더·RFC 9457 형식의 바디로 표현될 수 있다"를 선언하는 인터페이스다. 핵심은 이 문장이다. Spring MVC의 모든 내장 예외가 `ErrorResponse`를 구현한다. 즉 `MethodArgumentNotValidException` 같은 프레임워크 예외들이 이미 자기를 RFC 9457로 어떻게 표현할지 알고 있다. 그리고 `ErrorResponseException`은 이 계약을 구현한 `RuntimeException`이라, 직접 던질 수 있는 예외다.

데이터(`ProblemDetail`)와 계약(`ErrorResponse`)을 가른 이 구조가 뒤에 나오는 모든 동작의 바탕이다.

## 직접 만들어 던지기

가장 단순한 경로부터. `@ExceptionHandler`에서 `ProblemDetail`을 반환하면 그대로 RFC 9457 응답이 된다.

```java
@ExceptionHandler(OrderNotFoundException.class)
ProblemDetail handle(OrderNotFoundException ex) {
    ProblemDetail pd = ProblemDetail.forStatusAndDetail(
        HttpStatus.NOT_FOUND, ex.getMessage());
    pd.setType(URI.create("https://api.example.com/problems/order-not-found"));
    pd.setTitle("Order not found");
    pd.setProperty("orderId", ex.getOrderId());
    return pd;
}
```

`ProblemDetail`은 생성자가 아니라 정적 팩토리로 만든다. `forStatusAndDetail(status, detail)` 또는 `forStatus(status)`. status가 곧 응답 HTTP 상태를 결정한다. `instance`는 따로 안 넣으면 현재 요청 경로로 자동 채워진다.

응답은 이렇게 나간다.

```json
{
  "type": "https://api.example.com/problems/order-not-found",
  "title": "Order not found",
  "status": 404,
  "detail": "No order with id 12345",
  "instance": "/orders/12345",
  "orderId": 12345
}
```

`orderId`를 눈여겨보자. 표준 다섯 필드가 아닌데 최상위에 평평하게 들어가 있다. `setProperty`로 넣은 값이 그렇게 펼쳐진다. 그 메커니즘은 잠시 뒤에 다룬다.

## 내장 예외까지 표준으로

직접 만든 예외만 RFC 9457로 내보내면 반쪽이다. 타입 변환 실패, 검증 실패, 415 같은 프레임워크 내장 예외들도 같은 포맷이어야 클라이언트가 일관되게 받는다.

여기서 `ResponseEntityExceptionHandler`가 쓰인다. 이걸 상속하고 `@ControllerAdvice`로 등록하면, 모든 내장 Spring MVC 예외(전부 `ErrorResponse`를 구현하니까)가 RFC 9457로 변환된다.

```java
@ControllerAdvice
class GlobalExceptionHandler extends ResponseEntityExceptionHandler {

    // 내장 예외는 부모가 이미 ProblemDetail로 처리한다.
    // 여기엔 애플리케이션 고유 예외만 추가한다.
    @ExceptionHandler(OrderNotFoundException.class)
    ProblemDetail handle(OrderNotFoundException ex) {
        // ...
    }
}
```

Spring Boot에선 이걸 손으로 등록하는 대신 프로퍼티로 켤 수 있다.

```properties
spring.mvc.problemdetails.enabled=true
```

이 스위치를 켜면 Boot가 `ResponseEntityExceptionHandler` 기반 `@ControllerAdvice`를 자동 구성해서, 내장 예외들이 `application/problem+json`으로 직렬화된다. 이 프로퍼티는 Boot 4에도 그대로 있다. 기본값은 환경마다 다를 수 있으니 직접 켜는 걸 권한다. 명시적으로 `true`를 박아두면 의도가 분명하다.

한 가지 주의. 이 자동 구성이 켜진 상태에서 커스텀 `@ExceptionHandler`를 같은 예외에 걸면, 우선순위 문제로 커스텀 핸들러가 조용히 무시되는 경우가 보고돼 있다([spring-framework #35982](https://github.com/spring-projects/spring-framework/issues/35982)). 이럴 땐 핸들러에 `@Order`를 줘서 우선순위를 명시해야 한다.

## 확장: properties와 검증 에러

RFC 9457은 다섯 필드만 표준으로 정하고, 그 외 필드는 자유롭게 추가하도록 열어뒀다. Spring은 이걸 `ProblemDetail`의 `properties` Map으로 받는다.

아까 `orderId`가 최상위로 펼쳐진 게 이 덕분이다. Jackson을 쓸 때 Spring이 `ProblemDetailJacksonMixin`을 등록하는데, 이게 `properties` Map을 최상위 JSON 필드로 펼쳐서(unwrap) 직렬화한다. 역직렬화 때 표준 외 필드는 거꾸로 이 Map으로 모인다. 그래서 `setProperty("orderId", ...)` 하나면 응답 JSON 최상위에 `orderId`가 박힌다.

이게 가장 빛나는 자리가 검증 에러다. `@Valid`가 실패하면 `MethodArgumentNotValidException`이 나는데, 이건 내장 예외라 기본적으로 RFC 9457로 변환된다. 다만 기본 변환은 "검증 실패"라는 두루뭉술한 detail만 주고 어떤 필드가 왜 틀렸는지는 잘 안 담는 한계가 보고돼 있다([spring-framework #29849](https://github.com/spring-projects/spring-framework/issues/29849)). 필드별 에러를 클라이언트에 주려면 직접 채워야 한다.

```java
@Override
protected ResponseEntity<Object> handleMethodArgumentNotValid(
        MethodArgumentNotValidException ex, HttpHeaders headers,
        HttpStatusCode status, WebRequest request) {

    ProblemDetail pd = ProblemDetail.forStatusAndDetail(
        status, "Validation failed");
    Map<String, String> errors = ex.getBindingResult().getFieldErrors().stream()
        .collect(Collectors.toMap(
            FieldError::getField,
            fe -> fe.getDefaultMessage() == null ? "" : fe.getDefaultMessage()));
    pd.setProperty("errors", errors);

    return handleExceptionInternal(ex, pd, headers, status, request);
}
```

`errors`가 `properties`로 들어가니, 응답 JSON 최상위에 필드별 메시지가 펼쳐진다. 표준 다섯 필드는 그대로 두고, 우리 도메인에 필요한 정보만 곁에 얹는 방식이다.

## 클라이언트도 표준을 읽는다

서버가 표준으로 내보내면 클라이언트가 표준으로 읽을 수 있다. `WebClient`는 `WebClientResponseException`, `RestTemplate`은 `RestClientResponseException`을 던지는데, 둘 다 `getResponseBodyAs(ProblemDetail.class)`로 에러 바디를 `ProblemDetail`로 디코드한다. 서비스마다 다른 에러 파서를 짜는 대신, 한 타입으로 받는다.

## 정리

1부에서 "프론트엔드 인터셉터 하나로 모든 서비스의 에러를 같은 방식으로 파싱한다"고 했던 게 이거다. `ProblemDetail`은 데이터, `ErrorResponse`는 계약, 그리고 `properties` Map이 표준과 도메인 사이의 숨통이다. 핵심은 화려한 API가 아니라, 에러 바디 모양을 더 이상 팀마다 새로 정하지 않아도 된다는 점이다.

다음 6부는 HTTP 표준 정렬이다. RFC 9110에 맞춰 손본 `HttpStatus`와, 프록시 뒤 클라이언트 정보를 복원하는 RFC 7239 `ForwardedHeaderFilter`를 본다.

## 참고

- [RFC 9457: Problem Details for HTTP APIs](https://www.rfc-editor.org/rfc/rfc9457.html)
- [Error Responses :: Spring Framework Reference](https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-ann-rest-exceptions.html)
- [ProblemDetail (Spring Framework 7.0 API)](https://docs.spring.io/spring-framework/docs/current/javadoc-api/org/springframework/http/ProblemDetail.html)
- [ErrorResponse (Spring Framework 7.0 API)](https://docs.spring.io/spring-framework/docs/current/javadoc-api/org/springframework/web/ErrorResponse.html)
- [spring.mvc.problemdetails.enabled (Spring Boot 4.0 properties)](https://docs.spring.io/spring-boot/appendix/application-properties/index.html#application-properties.web.spring.mvc.problemdetails.enabled)
