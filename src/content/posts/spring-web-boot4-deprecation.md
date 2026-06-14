---
author: 주진현
pubDatetime: 2026-02-28T09:00:00+09:00
title: "Spring Boot 4 API Deprecation: RFC 9745 Deprecation·Sunset 헤더 (Spring Web 다시 읽기 4)"
section: spring
series:
  slug: spring-web-boot4
  order: 4
tags:
  - spring-boot-4
  - spring-framework-7
  - api-versioning
  - rfc
  - http
description: 버전을 끊기 전에 클라이언트에게 "이건 곧 죽는다"를 어떻게 알리나. Spring 7의 StandardApiVersionDeprecationHandler가 RFC 9745 Deprecation·RFC 8594 Sunset·RFC 8288 Link 헤더를 자동 발급한다. 두 헤더의 날짜 형식이 다른 이유까지 RFC 원문으로 따라간다.
faq:
  - question: "deprecated된 API 버전을 클라이언트에 어떻게 알리나?"
    answer: "StandardApiVersionDeprecationHandler를 configureApiVersioning에 등록하면 RFC 9745 Deprecation, RFC 8594 Sunset, RFC 8288 Link 헤더를 자동 발급한다. configureVersion(\"1.1\")로 버전별 deprecation·sunset 날짜를 설정한다."
  - question: "Deprecation 헤더와 Sunset 헤더의 차이는?"
    answer: "Deprecation은 \"이 버전은 권장하지 않는다(아직 동작함)\"는 신호이고, Sunset은 \"이 날짜에 접근이 불가능해진다\"는 종료 예고다. 날짜 형식도 다른데, Deprecation은 @유닉스타임스탬프(Structured Field Date), Sunset은 전통 HTTP-date를 쓴다."
---

3부 끝에 미뤄둔 질문이 있다. 구버전 API를 끄기로 했다. 그런데 그걸 클라이언트에게 어떻게 알리나?

현실에서 이건 대개 HTTP 바깥에서 해결한다. 이메일을 돌리고, 체인지로그에 적고, 운 좋으면 개발자 포털에 공지를 띄운다. 문제는 이 채널들이 전부 사람을 거친다는 점이다. 클라이언트를 짠 개발자가 그 이메일을 읽고, 기억하고, 코드를 고쳐야 한다. 자동화된 클라이언트는 자기가 부르는 엔드포인트가 다음 달에 죽는다는 걸 알 방법이 없다.

HTTP는 이걸 응답 안에서 푸는 표준을 갖고 있다. Spring 7의 `StandardApiVersionDeprecationHandler`는 그 표준 세 개, RFC 9745, 8594, 8288을 한꺼번에 구현한다.

## Deprecation과 Sunset은 다른 말이다

먼저 용어부터 갈라야 한다. 둘을 같은 뜻으로 쓰는 경우가 많은데, RFC는 명확히 구분한다.

**Deprecation(RFC 9745)** 은 "이 버전은 한물갔다"는 신호다. 권장하지 않는다는 뜻이지, 당장 안 된다는 뜻이 아니다. deprecated된 엔드포인트는 여전히 정상 동작한다. 단지 "새로 쓰지 마라, 옮겨갈 준비를 해라"는 표시다.

**Sunset(RFC 8594)** 은 "이 URI는 이 날짜에 죽는다"는 예고다. 실제 종료 시점이다. 그 날이 지나면 응답이 안 온다.

이 둘은 보통 순서대로 온다. 먼저 deprecated 되고(쓰지 마), 얼마 뒤 sunset 날짜가 박힌다(이날 끝). 클라이언트 입장에서 "지금 당장 깨지나"와 "언제까지 옮기면 되나"는 다른 정보고, 그래서 헤더도 둘로 나뉜다.

## RFC 9745: Deprecation 헤더

Deprecation 헤더의 값은 날짜다. 정확히는 RFC 9651이 정의하는 Structured Field Date 형식을 쓴다.

```http
Deprecation: @1735689600
```

`@` 뒤에 유닉스 타임스탬프 정수가 온다. 위 값은 2025년 1월 1일 00:00:00 UTC다. 여기서 미묘한 게 하나 있다. 이 날짜는 과거일 수도 미래일 수도 있다. 과거 시각이면 "이미 deprecated 됐다"는 뜻이고, 미래 시각이면 "그날부터 deprecated 될 예정"이라는 뜻이다. 시점 하나로 두 상태를 다 표현한다.

## RFC 8594: Sunset 헤더, 그리고 형식 비대칭

Sunset 헤더도 날짜를 담는다. 그런데 형식이 Deprecation과 다르다.

```http
Sunset: Thu, 31 Dec 2026 23:59:59 GMT
```

이건 전통적인 HTTP-date 형식이다. `@타임스탬프`가 아니라 `요일, 일 월 연 시:분:초 GMT`. 같은 "날짜를 담는 헤더"인데 한쪽은 유닉스 타임스탬프, 다른 쪽은 사람이 읽는 날짜 문자열을 쓴다.

왜 이렇게 엇갈렸나. 답은 시간이다. Sunset(RFC 8594)은 2019년에 나왔고, 그때는 HTTP-date가 표준 관행이었다. Deprecation(RFC 9745)은 2025년에 나오면서 더 새로운 Structured Fields 표준을 채택했다. 둘 다 "역사적 이유"로 자기 시대의 형식을 들고 있는 셈이다. 표준을 정렬한다면서도 정렬되지 않은 자리가 남아 있다.

## RFC 8288: Link 헤더로 맥락을 붙인다

날짜만으로는 부족하다. "deprecated 됐다"는 건 알겠는데, 그래서 뭘 어떻게 하라는 건지, 마이그레이션 가이드는 어디 있고 후속 버전은 뭔지를 알려줘야 한다.

여기서 RFC 8288(Web Linking)이 쓰인다. 응답에 `Link` 헤더를 달아 관련 문서를 가리킨다.

```http
Link: <https://api.example.com/deprecation>; rel="sunset"
```

`rel` 파라미터가 링크의 관계를 표현한다. deprecation 정보 문서, sunset 안내 페이지, 후속 버전 위치 같은 걸 각각의 관계로 연결한다. `Deprecation`·`Sunset`이 "언제"라면 `Link`는 "그래서 어디로"를 담는다.

## Spring 구현: StandardApiVersionDeprecationHandler

여기까지가 표준이고, Spring은 이 셋을 한 핸들러로 묶어준다. 설정은 3부에서 본 `configureApiVersioning` 안에서 한다.

```java
@Configuration
public class WebConfig implements WebMvcConfigurer {

    @Override
    public void configureApiVersioning(ApiVersionConfigurer configurer) {
        StandardApiVersionDeprecationHandler handler =
            new StandardApiVersionDeprecationHandler();

        // 1.0 — sunset만 박는다 (deprecated 표시 없이 종료일만)
        handler.configureVersion("1.0")
            .setSunsetDate(LocalDate.of(2026, Month.APRIL, 1)
                .atStartOfDay(ZoneOffset.UTC));

        // 1.1 — deprecated 시점 + sunset 예정일
        StandardApiVersionDeprecationHandler.VersionSpec v11 =
            handler.configureVersion("1.1");
        v11.setDeprecationDate(LocalDate.of(2026, Month.APRIL, 1)
            .atStartOfDay(ZoneOffset.UTC).plusMonths(6));
        v11.setSunsetDate(LocalDate.of(2026, Month.APRIL, 1)
            .atStartOfDay(ZoneOffset.UTC).plusYears(1));

        configurer.setDeprecationHandler(handler);
    }
}
```

구조가 명확하다. 핸들러를 만들고, `configureVersion("1.1")`로 버전마다 `VersionSpec`을 받아 날짜를 박고, 마지막에 `setDeprecationHandler`로 등록한다. 버전별로 deprecation·sunset 시점이 다를 수 있으니 그걸 버전 단위로 매핑하는 구조다.

날짜 타입에 주목할 만하다. `setSunsetDate`는 `ZonedDateTime`을 받는다. `LocalDate.of(...).atStartOfDay(ZoneOffset.UTC)`로 타임존을 명시한 시각을 넘긴다. deprecation/sunset은 전 세계 클라이언트가 보는 절대 시각이라 타임존이 빠지면 안 된다. API 서버 로컬 시간으로 "4월 1일"을 말하면 클라이언트마다 다른 순간이 된다.

요청이 1.1 버전으로 들어오면, 핸들러가 그 버전의 설정을 찾아 응답에 헤더를 얹는다. 헤더가 어떻게 생겼는지만 보자(아래 날짜 값은 위 코드의 설정과 별개로, RFC 형식을 보여주기 위한 예시다).

```http
HTTP/1.1 200 OK
Content-Type: application/json
Deprecation: @1735689600
Sunset: Thu, 31 Dec 2026 23:59:59 GMT
Link: <https://api.example.com/deprecation>; rel="sunset"

{ "id": 1, "name": "..." }
```

응답 본문은 멀쩡히 200으로 온다. deprecated는 "작동하지만 권장 안 함"이라고 했던 그대로다. 다만 헤더에 "이 버전 한물갔고, 12월 31일에 끝난다, 자세한 건 이 링크"가 실려 온다.

## 왜 헤더여야 하나

이걸 이메일이나 changelog로 하던 것과 비교하면 차이가 분명하다. 헤더는 모든 응답에 자동으로 붙고, 기계가 읽는다. 클라이언트 SDK가 응답에서 `Sunset` 헤더를 보면 로그에 경고를 찍거나, 모니터링 대시보드에 "30일 뒤 종료될 엔드포인트를 아직 호출 중"이라고 띄울 수 있다. API 게이트웨이가 deprecated 트래픽을 집계할 수도 있다. 사람이 공지를 읽고 기억하는 데 기대지 않는다.

표준이라는 점이 여기서 값을 한다. 내 서버가 RFC 9745·8594로 헤더를 내면, 그 RFC를 아는 어떤 클라이언트 라이브러리든 별도 약속 없이 알아듣는다. 사내 컨벤션으로 `X-API-Deprecated: true` 같은 걸 만들었다면 그건 우리 팀 클라이언트만 안다.

## 정리

`StandardApiVersionDeprecationHandler`는 세 RFC를 한 줄 설정으로 묶는다. 핵심은 핸들러 사용법보다 그 아래 모델이다. deprecation(권장 안 함)과 sunset(종료 예정)을 나누고, 각각을 날짜로 표현하고, Link로 맥락을 잇는다. 두 날짜 형식이 끝내 안 맞춰진 건 표준이 한 번에 깔끔해지지 않는다는 증거이기도 하다.

다음 5부는 RFC 9457, Problem Details다. 에러 응답 포맷이 Boot 4에서 프레임워크 전역 기본이 된 이야기를 한다.

## 참고

- [RFC 9745: The Deprecation HTTP Response Header Field](https://www.rfc-editor.org/rfc/rfc9745.html)
- [RFC 8594: The Sunset HTTP Header Field](https://www.rfc-editor.org/rfc/rfc8594.html)
- [RFC 8288: Web Linking](https://www.rfc-editor.org/rfc/rfc8288.html)
- [API Versioning in Spring (spring.io 블로그)](https://spring.io/blog/2025/09/16/api-versioning-in-spring/)
- [StandardApiVersionDeprecationHandler (Spring Framework 7.0 API)](https://docs.spring.io/spring-framework/docs/current/javadoc-api/org/springframework/web/accept/StandardApiVersionDeprecationHandler.html)
