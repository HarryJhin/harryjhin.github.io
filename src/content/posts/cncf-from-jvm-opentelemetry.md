---
author: 주진현
pubDatetime: 2026-06-16T09:40:00+09:00
title: "관측성 ①: OpenTelemetry와 Micrometer (JVM에서 본 클라우드 네이티브 5)"
featured: false
section: cloud-native
series:
  slug: cncf-from-jvm
  order: 5
tags:
  - opentelemetry
  - micrometer
  - spring-boot
  - observability
  - cloud-native
description: 2부에서 "추측 말고 측정하라"고 했다. 그 측정의 표준이 OpenTelemetry다. 2026년 5월 졸업한 OTel이 트레이스·메트릭·로그를 한 규격으로 묶고, Spring 진영에서는 Micrometer가 그 입구가 된다. 코드 안 건드리는 Java agent와 코드에 박는 Micrometer, 두 갈래를 JVM 입장에서 가른다.
faq:
  - question: "OpenTelemetry란 무엇이고 언제 CNCF를 졸업했나?"
    answer: "OpenTelemetry(OTel)는 트레이스·메트릭·로그 같은 텔레메트리를 수집·처리·내보내는 방식을 표준화하는 프로젝트다. OTLP라는 공통 프로토콜과 Collector를 제공한다. CNCF는 2026년 5월 21일 OTel의 졸업을 발표했고, Kubernetes에 이어 두 번째로 높은 프로젝트 velocity를 기록했다."
  - question: "Spring Boot에서 OTel을 쓸 때 Java agent와 Micrometer 중 무엇을 쓰나?"
    answer: "OTel Java agent는 -javaagent로 붙여 코드 변경 없이 바이트코드를 계측한다. 레거시나 코드를 못 건드리는 앱에 좋다. Micrometer는 인프로세스 라이브러리로 Observation API를 통해 비즈니스 단위 계측을 직접 짜고 Spring과 1급으로 통합된다. 코드를 소유하고 도메인 단위 스팬·메트릭을 원하면 Micrometer가 낫다. 둘을 같이 쓰면 이중 계측이 날 수 있다."
  - question: "Spring Boot에서 트레이스를 OTLP로 내보내려면?"
    answer: "Spring Boot 4.x 기준 OpenTelemetry 스타터를 추가하고, management.opentelemetry.tracing.export.otlp.endpoint 속성에 Collector 주소를 지정한다. 엔드포인트는 보통 Collector의 OTLP/HTTP 포트인 4318(/v1/traces)을 가리킨다. 3.x는 속성 이름이 달라 버전 확인이 필요하다."
---

2부에서 힙 비율을 얼마로 둘지 묻고는 "추측 말고 측정해서 정하라"고 미뤘다. 이제 그 측정 이야기다. 그런데 측정에는 함정이 하나 있다. 도구마다 포맷이 다르면, 백엔드를 바꿀 때마다 계측 코드를 다시 짜야 한다. Zipkin 쓰다 Jaeger로 가면 계측을 갈아엎고, 메트릭 벤더 바꾸면 또 갈아엎는다.

OpenTelemetry는 이 락인을 깬다. 계측은 한 번만 하고, 어디로 보낼지는 나중에 정한다. 2026년 5월에 CNCF를 졸업하면서 사실상의 관측성 표준 자리를 굳혔다. Kubernetes 다음으로 활발한 프로젝트라는 평가도 그때 같이 나왔다.

## OTel이 표준화하는 것

OpenTelemetry(줄여서 OTel)가 묶는 건 세 가지 신호다.

- **트레이스(traces)**: 한 요청이 서비스들을 거쳐 가는 경로. 어디서 느려졌는지.
- **메트릭(metrics)**: 수치의 시계열. 요청 수, 레이턴시, 힙 사용량.
- **로그(logs)**: 시점별 이벤트 기록.

이 셋을 **OTLP(OpenTelemetry Protocol)**라는 공통 프로토콜로 내보낸다. 그리고 **Collector**라는 중간 프록시가 그걸 받아서 가공하고 원하는 백엔드로 흘려보낸다. 앱은 OTLP로 Collector에 한 번 보내고, "Jaeger로도 보내고 Prometheus로도 보내라"는 라우팅은 Collector 설정에서 한다. 앱 코드는 백엔드를 모른다. 그게 핵심이다.

여기에 최근 네 번째 신호가 합류하는 중이다. **프로파일(profiles)**이다. 2026년 3월에 public Alpha로 들어갔다. eBPF 기반으로 시스템 전체를 낮은 오버헤드로 연속 프로파일링한다는 발상인데, Alpha 단계라 공식적으로도 프로덕션 핵심 워크로드에는 쓰지 말라고 못 박는다. 방향은 흥미롭지만 아직 지켜볼 단계다.

## 두 갈래: agent냐 in-process냐

JVM 앱을 OTel에 연결하는 길은 크게 둘이다. 이 선택이 의외로 중요하다.

**첫째, OTel Java agent.** `opentelemetry-javaagent.jar`를 JVM에 붙인다.

```bash
java -javaagent:opentelemetry-javaagent.jar -jar my-service.jar
```

코드를 한 줄도 안 바꾼다. agent가 바이트코드를 런타임에 주입해서 HTTP 서버, JDBC, Kafka 클라이언트 같은 걸 알아서 계측한다. 레거시 앱이나 소스를 못 건드리는 상황, 운영팀이 일괄로 계측을 붙이고 싶을 때 강력하다.

**둘째, Micrometer.** Spring 진영의 인프로세스 계측 라이브러리다. 코드 안에서 직접 계측을 선언한다. agent와 달리 JVM 옵션이 필요 없고, 무엇보다 비즈니스 단위 계측을 내가 짤 수 있다. "주문 처리"라는 도메인 스팬을 만들고 싶으면 agent로는 안 되고 Micrometer로 한다.

둘을 같이 쓰면 같은 걸 두 번 계측하는 충돌이 날 수 있다. 보통 하나를 주 경로로 정한다. 코드를 소유하고 Spring을 깊게 쓴다면 Micrometer 쪽이 자연스럽다.

## Micrometer: 한 번 계측해서 둘을 얻는다

Micrometer의 핵심은 **Observation API**다. 슬로건이 명확하다. "한 번 계측하면 여러 결과를 얻는다." `Observation` 하나를 만들면 거기서 메트릭과 트레이스가 같이 나온다. 둘을 따로 계측할 필요가 없다.

```java file="OrderService.java"
private final ObservationRegistry registry;

public Order place(OrderRequest req) {
    return Observation.createNotStarted("order.place", registry)
        .lowCardinalityKeyValue("channel", req.channel())
        .observe(() -> doPlace(req)); // 이 안의 실행이 스팬+메트릭으로 잡힘
}
```

메트릭 쪽은 `MeterRegistry`가 facade다. Actuator가 Micrometer를 자동 구성해서, 힙·GC·스레드·HTTP 요청 같은 기본 메트릭을 별도 코드 없이 수집한다. 트레이스 쪽은 **Micrometer Tracing**(옛 Spring Cloud Sleuth)이 맡는데, 실제 트레이싱 구현으로는 브리지를 통해 OTel이나 Brave에 연결한다. OTel로 가려면 `micrometer-tracing-bridge-otel`을 붙인다.

## OTLP로 내보내기 (Spring Boot 4.x)

계측했으면 내보내야 한다. 여기서 버전을 조심해야 한다. Spring Boot 4에서 트레이싱 OTLP 설정 속성이 바뀌었기 때문이다.

> [!WARNING]
> Spring Boot 4.x와 3.x의 트레이싱 OTLP 속성이 다르다. 4.x는 `management.opentelemetry.tracing.export.otlp.*`를 쓰고 `spring-boot-starter-opentelemetry` 스타터를 추가한다. 3.x는 `management.otlp.tracing.endpoint`였다. 오래된 블로그를 그대로 따라 하면 4.x에서 안 먹는다. 이 시리즈는 4.x(2026년 6월 현재 4.1 라인)를 기준으로 쓴다.

```yaml file="application.yml"
management:
  opentelemetry:
    tracing:
      export:
        otlp:
          endpoint: "http://otel-collector:4318/v1/traces"
  otlp:
    metrics:
      export:
        url: "http://otel-collector:4318/v1/metrics"
  tracing:
    sampling:
      probability: 1.0 # 개발 중엔 전량, 운영에선 낮춰서
```

메트릭은 `micrometer-registry-otlp` 의존성으로 OTLP 내보내기를 켜고, 트레이스는 OpenTelemetry 스타터가 OTLP 익스포터를 구성한다. 둘 다 같은 Collector(`:4318`)로 보내고, 그 앞단에서 어디로 흘릴지는 Collector가 정한다.

여기까지가 "앱에서 신호를 뽑아 OTLP로 내보내는" 절반이다. 나머지 절반, 즉 그 메트릭을 실제로 저장하고 질의하고 알림을 거는 일은 다음 6부 Prometheus다.

## 정리

OpenTelemetry는 계측과 백엔드를 분리한다. OTLP로 한 번 내보내면, Jaeger든 Prometheus든 어떤 도구로 보낼지는 Collector가 정한다. 벤더 락인이 사라진다.

JVM에서는 두 갈래가 있다. 코드 안 건드리는 Java agent, 코드에 박는 Micrometer. Spring을 깊게 쓴다면 Micrometer의 Observation API로 한 번 계측해 메트릭과 트레이스를 같이 얻고, `micrometer-tracing-bridge-otel`로 OTel에 연결한 뒤 OTLP로 내보내는 길이 가장 매끄럽다. 단, Spring Boot 4의 바뀐 속성을 쓰는 걸 잊지 말자.

다음 글은 그 메트릭이 흘러가는 가장 흔한 종착지, Prometheus다. Actuator가 노출하는 메트릭을 어떻게 긁고 PromQL로 질의하고 알림을 거는지로 들어간다.

## 참고

- [OpenTelemetry Has Graduated — OpenTelemetry Blog](https://opentelemetry.io/blog/2026/otel-graduates/)
- [OpenTelemetry Profiles Enters Public Alpha](https://opentelemetry.io/blog/2026/profiles-alpha/)
- [Micrometer Observation API](https://docs.micrometer.io/micrometer/reference/observation.html)
- [Tracing — Spring Boot Reference](https://docs.spring.io/spring-boot/reference/actuator/tracing.html)
- [opentelemetry-java-instrumentation (Java agent)](https://github.com/open-telemetry/opentelemetry-java-instrumentation)
