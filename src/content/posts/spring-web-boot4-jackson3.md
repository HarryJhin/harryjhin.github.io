---
author: 주진현
pubDatetime: 2026-01-21T09:00:00+09:00
title: "Spring Boot 4 Jackson 3 마이그레이션: 직렬화 엔진이 바뀐 자리 (Spring Web 다시 읽기 2)"
section: spring
tags:
  - spring-boot-4
  - spring-framework-7
  - jackson
  - json
  - migration
description: Spring Boot 4의 Jackson 2 → 3 마이그레이션 가이드. 패키지 대이주(com.fasterxml.jackson → tools.jackson)는 눈에 보이는 변화일 뿐, 진짜 위험은 컴파일은 통과하는데 JSON 출력이 달라지는 default 동작 변경이다. 좌표·JsonMapper·바뀐 기본값·@JacksonComponent rename·Page 역직렬화·마이그레이션 타임라인을 GitHub 이슈 근거와 코드로 따라간다.
faq:
  - question: "Spring Boot 4에서 날짜가 숫자 타임스탬프에서 ISO 문자열로 바뀐 이유는?"
    answer: "Jackson 3가 SerializationFeature.WRITE_DATES_AS_TIMESTAMPS 기본값을 true에서 false로 바꿨기 때문이다(jackson-databind #4845). 옛 동작이 필요하면 JsonMapperBuilderCustomizer로 다시 enable 하거나, spring.jackson.use-jackson2-defaults=true로 Jackson 2 기본값에 맞춘다."
  - question: "Jackson 2에서 Jackson 3로 어떻게 마이그레이션하나?"
    answer: "패키지·Maven 좌표를 com.fasterxml.jackson에서 tools.jackson으로 교체하고(jackson-core #793, 단 jackson-annotations만 옛 좌표 유지), Jackson2ObjectMapperBuilder 대신 JsonMapper.builder()를 쓰고, 바뀐 기본값(날짜·enum·null 처리)을 점검한다. spring-boot-properties-migrator로 프로퍼티 변경을 진단할 수 있다."
  - question: "@JsonComponent가 Spring Boot 4에서 컴파일되지 않는 이유는?"
    answer: "Boot 4에서 @JsonComponent가 @JacksonComponent로, @JsonMixin이 @JacksonMixin으로 rename됐다. Jackson에 특화됐고 JSON에 국한되지 않음을 명확히 하려는 변경으로, 지원 클래스들도 Json 접두어가 Jackson으로 바뀌었다."
  - question: "Spring Boot 4에서 Page 응답이 역직렬화되지 않는 이유는?"
    answer: "Spring Data의 PageModule이 PageImpl 직렬화기만 등록하고 역직렬화기는 추가하지 않아, 다른 서비스의 페이지 응답을 받는 쪽에서 Page 인터페이스를 생성하지 못해 깨진다. 기존 OpenFeign PageJacksonModule은 Jackson 2 모듈이라 Jackson 3에 등록되지 않는다. 근본 원인은 종종 null→primitive 불일치이며, 필드를 Integer/Long 래퍼로 바꾸고 PagedModel이나 전용 DTO로 받는 것이 안전하다."
  - question: "catch(IOException)으로 잡던 Jackson 직렬화 예외가 더 이상 잡히지 않는다?"
    answer: "Jackson 3에서 JsonProcessingException의 부모가 IOException(checked)에서 RuntimeException(unchecked)으로 바뀌었기 때문이다(jackson-databind #2177). catch(IOException) 블록은 더 이상 이 예외를 잡지 못하고 그대로 전파된다."
---

직렬화 엔진이 바뀌는 건 라이브러리 버전 올림 중에 제일 조용하면서 제일 무서운 종류다. `ObjectMapper`는 모든 REST 응답이 지나가는 길목인데, 그 기본 동작이 바뀌면 컴파일러는 아무 말도 안 한다. 빌드는 초록불, 테스트도 대충 통과, 그런데 운영에 올리고 나서 프론트엔드가 "날짜 포맷이 왜 바뀌었냐"고 물어온다.

Boot 4는 기본 JSON 엔진을 Jackson 2에서 Jackson 3로 바꿨다. Jackson 3.0.0은 2025년 10월 3일에 나왔다. 2.0 이후 12년 만의 첫 메이저 버전이고, 그래서 깨지는 변경이 많다. 이 글은 그 변화를 세 층위로 나눠 본다. 좌표(보이는 변화), JsonMapper(구조 변화), 그리고 바뀐 default(안 보이는 변화).

## 1층: 패키지 대이주

가장 먼저 막히는 건 import다. Jackson 3는 전체 패키지 계층을 갈아엎었다([jackson-core #793](https://github.com/FasterXML/jackson-core/issues/793)).

```
com.fasterxml.jackson.*   →   tools.jackson.*
```

Maven groupId도 같이 바뀐다. `com.fasterxml.jackson.core` 같은 좌표가 `tools.jackson.core`로 간다. 12년 묵은 패키지명을 통째로 옮기는 큰 결정이라, 단순 sed 치환으로는 안 끝나는 예외가 하나 있다.

`jackson-annotations`만 옛 좌표에 남는다. `@JsonProperty`, `@JsonIgnore` 같은 애너테이션은 여전히 `com.fasterxml.jackson.annotation` 패키지에, 2.x 버전으로 머문다. 이유는 호환성이다. 수많은 라이브러리가 이 애너테이션에 의존하고 있어서, 여기까지 바꾸면 생태계가 두 동강 난다. 그래서 Jackson 3 코드베이스 안에서도 애너테이션만 이름이 다르다.

import를 정리하다 보면 이 비대칭 때문에 한 번씩 헷갈린다. databind는 `tools.jackson.databind.ObjectMapper`인데 애너테이션은 `com.fasterxml.jackson.annotation.JsonProperty`. 같은 Jackson인데 패키지 뿌리가 다르다.

핵심 클래스 이름도 손봤다. `JsonFactory`는 `TokenStreamFactory`가 됐다. 스트리밍 API를 쓰는 코드라면 이런 rename을 하나씩 마주친다.

## 2층: ObjectMapper에서 JsonMapper로

Jackson 3는 불변성(immutability)을 진지하게 받아들였다. 구성이 끝난 매퍼는 더 못 바꾼다. 그래서 진입점이 `ObjectMapper`에서 빌더 기반의 `JsonMapper`로 옮겨갔다.

```java
// Jackson 3
JsonMapper mapper = JsonMapper.builder()
    .enable(SerializationFeature.INDENT_OUTPUT)
    .build();   // build() 이후로는 불변
```

모듈이 필요하면 빌더의 `addModules(...)`로 등록하고 `build()`로 닫는다. Jackson 2.10부터도 빌더 스타일은 있었다. 다만 그땐 하위 호환 때문에 "진짜 불변"을 보장하진 못했다. 3.0은 빌더로 만든 객체의 불변성을 못 박았다. 한 번 `build()` 하면 그 매퍼는 thread-safe하고, 재구성 메서드 호출로 상태가 새는 일이 없다.

여기서 Spring 사용자가 가장 먼저 잃는 건 `Jackson2ObjectMapperBuilder`다. Jackson 3용 대체 클래스가 없다. Spring은 Jackson이 제공하는 `JsonMapper.builder()`, 바이너리 포맷이면 `CBORMapper.builder()`를 직접 쓰라고 안내한다. 커스텀 `ObjectMapper`를 빈으로 등록해 쓰던 프로젝트라면 이 설정 코드를 다시 써야 한다. Spring Boot에서의 정석 방법은 뒤에서 다룬다.

## 3층: 바뀐 default: 진짜 함정

여기가 이 글에서 제일 중요하다. import는 IDE가 잡아주고, JsonMapper 전환은 컴파일러가 막아준다. 그런데 기본값 변경은 아무도 안 막아준다. 코드는 그대로인데 JSON만 달라진다.

Jackson 3가 손본 기본값 중 웹 직렬화에 직접 영향을 주는 것들:

| 설정 | Jackson 2 | Jackson 3 | 결과 |
|------|-----------|-----------|------|
| `WRITE_DATES_AS_TIMESTAMPS` | true | **false** | `java.time` 값이 숫자 타임스탬프 → ISO-8601 문자열 |
| `WRITE_DURATIONS_AS_TIMESTAMPS` | true | **false** | `Duration`이 숫자 → ISO-8601(`PT1H`) |
| `DateTimeFeature.ONE_BASED_MONTHS` | false | **true** | `YearMonth`·`MonthDay`의 월이 0-based → 1-based |
| `FAIL_ON_NULL_FOR_PRIMITIVES` | false | **true** | JSON `null`을 primitive에 넣으면 예외 |
| `READ/WRITE_ENUMS_USING_TO_STRING` | false | **true** | enum이 `name()` → `toString()` 기준 |
| `DEFAULT_VIEW_INCLUSION` | true | **false** | `@JsonView` 없는 필드의 뷰 노출 규칙 변화 |
| `FAIL_ON_TRAILING_TOKENS` | false | **true** | 본문 뒤 쓰레기 토큰을 더 엄격히 거부 |

제일 눈에 띄는 건 첫 줄이다. `LocalDateTime`을 그냥 던졌을 때:

```json
// Jackson 2 기본
"createdAt": 1718409600.000000000

// Jackson 3 기본
"createdAt": "2026-06-15T09:00:00"
```

사실 이건 대부분의 팀이 Jackson 2 시절에 `WRITE_DATES_AS_TIMESTAMPS`를 직접 꺼서 이미 쓰던 동작이다. Jackson 3는 그 "다들 끄던 설정"을 기본으로 만들었다([jackson-databind #4845](https://github.com/FasterXML/jackson-databind/issues/4845)). 방향은 맞다. 그런데 타임스탬프 숫자에 의존하던 클라이언트가 한 군데라도 있으면 그쪽이 깨진다.

`ONE_BASED_MONTHS=true`는 더 미묘하다([jackson-databind #5065](https://github.com/FasterXML/jackson-databind/issues/5065)). Jackson 2는 `YearMonth`의 월을 0-based(1월이 0)로 직렬화하던 레거시 동작이 있었는데, 3.0이 이걸 1-based로 바로잡았다. 고쳐진 게 맞지만, 그 0-based 출력을 그대로 저장해둔 데이터가 있으면 역직렬화에서 한 달씩 어긋난다. "버그가 수정됐다"가 곧 "내 데이터가 안전하다"는 아니다.

enum도 조용한 지뢰다. `READ/WRITE_ENUMS_USING_TO_STRING`이 켜지면서([jackson-databind #4566](https://github.com/FasterXML/jackson-databind/pull/4566)·[#4567](https://github.com/FasterXML/jackson-databind/pull/4567)), `toString()`을 오버라이드한 enum은 직렬화 결과가 바뀐다. `name()`으로 나가던 `"ACTIVE"`가 `toString()` 구현에 따라 `"활성"`이 돼버릴 수 있다.

### 예외 계층도 바뀌었다

default는 아니지만 같은 결의 함정이다. `JsonProcessingException`의 부모가 `RuntimeException`으로 바뀌었다([jackson-databind #2177](https://github.com/FasterXML/jackson-databind/issues/2177)). checked였던 예외가 unchecked가 됐다는 뜻이다.

기존에 이렇게 짠 코드는:

```java
try {
    return mapper.writeValueAsString(dto);
} catch (JsonProcessingException e) {   // 이제 unchecked
    throw new SerializationException(e);
}
```

문법적으로는 계속 컴파일되지만, `throws JsonProcessingException`을 시그니처에 달아 호출자에게 처리를 강제하던 설계는 의미를 잃는다. 예외 처리 흐름을 재점검해야 하는 자리다.

## Spring 통합: 컨버터 rename과 커스터마이저 교체

Framework 7은 HTTP 메시지 컨버터의 이름을 정리했다. `MappingJackson2HttpMessageConverter`는 `JacksonJsonHttpMessageConverter`로, Smile 포맷용은 `JacksonSmileHttpMessageConverter`로 바뀌었다. 구 클래스는 7.0부터 deprecated다. 새 컨버터는 Jackson 3의 `JsonMapper`를 쓰고, `SmartHttpMessageConverter`를 구현해서 직렬화 힌트를 온전히 지원한다.

Boot 쪽 애너테이션도 rename됐다. `@JsonComponent`가 `@JacksonComponent`로, `@JsonMixin`이 `@JacksonMixin`으로 바뀌었다. 커스텀 직렬화기를 빈으로 등록하거나 mixin을 쓰던 코드라면 여기서 컴파일이 깨진다. "Jackson 전용이고 JSON에만 묶이지 않는다"를 이름으로 분명히 한 변경이라, 지원 클래스들도 `Json` 접두어가 `Jackson`으로 일괄 교체됐다.

커스터마이징 훅도 갈아탔다. Boot 3의 `Jackson2ObjectMapperBuilderCustomizer` 자리에 Boot 4는 `JsonMapperBuilderCustomizer`를 놓았다(`org.springframework.boot.jackson.autoconfigure`). 역할은 같다. 자동 구성된 `JsonMapper.Builder`에 끼어들어 설정을 손보는 콜백이다.

```java
@Bean
JsonMapperBuilderCustomizer jacksonCustomizer() {
    return builder -> builder
        .enable(SerializationFeature.INDENT_OUTPUT)
        .enable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);  // 옛 숫자 타임스탬프로 되돌릴 때
}
```

`SerializationFeature.WRITE_DATES_AS_TIMESTAMPS`를 다시 켜면 3장에서 본 날짜 포맷 변화를 Jackson 2 동작으로 동결한다. 이 방식의 장점은 Spring Boot가 깔아둔 자동 구성을 살린 채 일부만 조정한다는 데 있다. `@Primary`로 `JsonMapper`를 통째로 바꾸면 자동 구성이 전부 꺼진다. 모듈 자동 등록, 프로퍼티 연동까지 같이 날아간다. 정말 전체를 장악할 게 아니면 커스터마이저 쪽이 안전하다.

기본값을 하나씩 되돌리는 게 번거로우면 한 방에 묶는 스위치가 있다. `spring.jackson.use-jackson2-defaults=true`를 주면 자동 구성된 `JsonMapper`가 Boot 3.x의 Jackson 2 기본값에 최대한 맞춰진다. 마이그레이션 첫 단계에서 직렬화 동작을 통째로 동결해두고, 이후 릴리스에서 프로퍼티를 빼며 Jackson 3 기본값으로 옮겨가는 전환 경로로 쓰기 좋다.

하나 더 알아둘 동작 변화가 있다. Boot 4는 classpath에 있는 Jackson 모듈을 전부 감지해 자동 등록한다. Boot 3는 "잘 알려진" 모듈만 등록했는데, 4는 전수 등록으로 바뀌었다. 의도치 않은 모듈이 끼어들어 직렬화가 달라지면 `spring.jackson.find-and-add-modules=false`로 끌 수 있다.

## 받는 쪽의 함정: Page 응답 역직렬화

마이그레이션 중 가장 자주 막히는 실전 에러 하나를 짚고 넘어가자. 페이지네이션 응답(`Page<T>`)을 다른 서비스에서 받아 역직렬화할 때 깨진다.

원인은 비대칭이다. Spring Data의 `PageModule`은 `PageImpl`을 직렬화하는 법만 등록한다. 그래서 내 서비스가 `Page`를 JSON으로 내보낼 땐 멀쩡하다. 그런데 다른 서비스의 페이지 응답을 받는 쪽이 되면, Jackson 3는 `Page`라는 인터페이스를 보고 어떻게 인스턴스를 만들지 몰라 즉시 실패한다. 역직렬화기가 없기 때문이다.

옛날 해법도 안 통한다. Stack Overflow에 흔한 OpenFeign `PageJacksonModule`은 `com.fasterxml.jackson.databind.Module`을 상속한 Jackson 2 모듈이라, Jackson 3의 `tools.jackson` `ObjectMapper`에는 아예 등록되지 않는다. 컴파일조차 안 된다.

게다가 진짜 근본 원인은 한 겹 더 깊은 곳에 있는 경우가 많다. 상위 서비스가 `number`·`size`·`totalElements` 같은 메타 필드에 `null`을 실어 보내는데, 받는 클래스가 그 필드를 `int`·`long` primitive로 받으면, 3층에서 본 `FAIL_ON_NULL_FOR_PRIMITIVES=true` 때문에 `null`을 primitive에 못 넣어 터진다. "Page를 못 만든다"는 표면 에러 밑에 null-to-primitive 불일치가 깔려 있는 것이다.

그래서 안전한 대응은 두 가지다. 페이지 메타 필드를 `Integer`·`Long` 래퍼 타입으로 받아 `null`을 흡수하고, `Page` 인터페이스를 직접 받기보다 `PagedModel`이나 전용 DTO로 받는다. 이건 Jackson 3 자체 버그라기보다 Spring Data Commons의 구멍(직렬화는 되는데 역직렬화는 비어 있음)에 가깝고, 마이그레이션 PR에서 페이지 응답을 소비하는 클라이언트가 있다면 반드시 짚어야 한다.

## 마이그레이션 타임라인

Spring은 Jackson 2를 한 번에 끊지 않는다. Framework 7은 Jackson 3를 기본으로 두되 Jackson 2 지원을 병행한다. 다만 끝이 정해져 있다.

- **7.0**: Jackson 3 기본, Jackson 2 deprecated (둘 다 동작)
- **7.1**: Jackson 2 자동 감지(autodetection) 비활성화
- **7.2**: Jackson 2 지원 제거

Boot 4로 올라가도 Jackson 2를 당장 버릴 필요는 없다. Jackson 2와 3를 한동안 같이 쓸 수도 있다. 이때 설정 프로퍼티가 갈린다. Jackson 3는 `spring.jackson.*`을 그대로 쓰고, Jackson 2 쪽 설정은 `spring.jackson2.*`로 옮겨야 한다. Jackson 3 안에서도 일부 프로퍼티 경로가 재배치됐다. Jackson 2 `JsonParser.Feature`에 대응하는 `JsonReadFeature`가 있는 경우 `spring.jackson.parser.*`가 `spring.jackson.json.read.*`로 옮겨갔고, 대응이 `JsonReadFeature`가 아닌 경우엔 `JsonMapperBuilderCustomizer`로 프로그래밍 방식으로 설정한다. 이런 프로퍼티 변경은 `spring-boot-properties-migrator` 모듈을 의존성에 잠깐 넣으면 시작 시점에 진단·임시 변환을 해주니, 마이그레이션 초기에 붙여두면 "왜 내 설정이 안 먹나"를 빠르게 잡는다. Jackson 2에 의존하는 transitive 라이브러리들은 계속 관리·지원된다. 그래서 현실적인 전략은 두 단계다. 먼저 Boot 4로 올리되 직렬화 동작을 동결(바뀐 default를 명시적으로 옛값에 고정)하고, 그다음 릴리스에서 Jackson 3 기본값으로 하나씩 풀어가는 식이다.

## 정리

Jackson 3 마이그레이션을 "import 바꾸는 작업"으로 잡으면 가장 위험한 부분을 통째로 놓친다. `tools.jackson`으로의 이주와 `JsonMapper` 전환은 도구가 막아주는 변화고, 진짜로 운영을 깨는 건 `WRITE_DATES_AS_TIMESTAMPS`, `ONE_BASED_MONTHS`, enum `toString` 같은 소리 없는 기본값 변경이다. 마이그레이션 PR을 올리기 전에, 핵심 응답 DTO의 직렬화 결과를 Jackson 2와 3에서 각각 찍어 diff부터 떠보는 걸 권한다.

다음 3부는 네이티브 API 버저닝이다. `ApiVersionStrategy`로 손코딩하던 `/v1`을 어떻게 걷어내는지 본다.

## 참고

- [Introducing Jackson 3 support in Spring](https://spring.io/blog/2025/10/07/introducing-jackson-3-support-in-spring/)
- [Spring Boot 4.0 Migration Guide — Upgrading Jackson](https://github.com/spring-projects/spring-boot/wiki/Spring-Boot-4.0-Migration-Guide)
- [Jackson Release 3.0 (FasterXML wiki) — Config default changes](https://github.com/FasterXML/jackson/wiki/Jackson-Release-3.0)
- 근거 이슈: 패키지 rename [jackson-core #793](https://github.com/FasterXML/jackson-core/issues/793) · 예외 계층 [jackson-databind #2177](https://github.com/FasterXML/jackson-databind/issues/2177) · 날짜 기본값 [#4845](https://github.com/FasterXML/jackson-databind/issues/4845) · 월 1-based [#5065](https://github.com/FasterXML/jackson-databind/issues/5065) · enum [#4566](https://github.com/FasterXML/jackson-databind/pull/4566)·[#4567](https://github.com/FasterXML/jackson-databind/pull/4567)
- [JacksonJsonHttpMessageConverter (Spring Framework 7.0 API)](https://docs.spring.io/spring-framework/docs/current/javadoc-api/org/springframework/http/converter/json/JacksonJsonHttpMessageConverter.html)
- [JsonMapperBuilderCustomizer (Spring Boot 4.0 API)](https://docs.spring.io/spring-boot/api/java/org/springframework/boot/jackson/autoconfigure/JsonMapperBuilderCustomizer.html)
- [JSON :: Spring Boot Reference](https://docs.spring.io/spring-boot/reference/features/json.html)
