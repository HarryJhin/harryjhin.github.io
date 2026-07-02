---
author: 주진현
pubDatetime: 2026-06-05T09:00:00+09:00
title: "요청이 서비스 경계에서 사라진다: 분산 추적과 OpenTelemetry (Spring 개발자를 위한 클라우드 표준 5)"
featured: false
section: cloud-native
series:
  slug: cloud-native-for-spring
  order: 5
tags:
  - opentelemetry
  - micrometer
  - tracing
  - spring-boot
  - observability
  - cloud-native
description: 메트릭과 로그는 서비스 하나 안에서만 본다. 서비스가 갈라지면 요청 하나가 경계를 넘다가 어디서 끊겼는지 아무도 못 짚는다. Micrometer Tracing이 Observation에서 스팬을 만들고, OpenTelemetry가 그 표준 프로토콜과 Collector를 제공하는 길을 Spring 접점 중심으로 따라간다.
faq:
  - question: "MSA에서 요청 추적이 안 되는 문제는 왜 생기나?"
    answer: "로그와 메트릭이 서비스 단위로 따로 쌓이기 때문이다. 주문 서비스가 결제 서비스를 부르고 결제 서비스가 재고 서비스를 부르면 요청 하나가 파드 여러 개를 거치는데, 각 서비스의 로그·메트릭은 그 요청이 다른 서비스에서 뭘 했는지 모른다. 지연이 어디서 생겼는지 가리키려면 요청 하나를 서비스 경계 너머까지 잇는 식별자가 따로 필요하다. 그 식별자와 흐름을 기록하는 신호가 트레이스다."
  - question: "Micrometer Tracing과 Span이 뭔가?"
    answer: "Micrometer Tracing은 여러 트레이서 구현체를 감싸는 파사드 라이브러리로, Micrometer의 Observation API를 확장해 Observation 하나가 시작되고 끝날 때마다 대응하는 스팬(span)을 만들고 시작·종료·보고까지 처리한다. 스팬은 요청 여정 한 조각의 기록이다. 결제 서비스 안에서 실행된 구간 하나가 스팬 하나가 되고, 이 스팬들이 이어져 요청 전체의 트레이스를 이룬다."
  - question: "OpenTelemetry와 Spring Boot는 어떻게 연결하나?"
    answer: "Spring Boot 4.x는 spring-boot-starter-opentelemetry 스타터를 추가하고 management.opentelemetry.tracing.export.otlp.* 속성에 Collector 주소를 지정하면 된다. 이 endpoint는 보통 Collector가 OTLP를 받는 4318 포트(HTTP)를 가리킨다. 내부적으로는 micrometer-tracing-bridge-otel이 Micrometer Tracing과 OpenTelemetry SDK를 이어, Observation에서 만든 스팬을 OTLP로 내보낸다. 3.x는 속성 이름이 management.otlp.tracing.endpoint로 달라 버전부터 확인해야 한다."
  - question: "Micrometer Tracing은 Spring Cloud Sleuth의 후속인가?"
    answer: "맞다. Micrometer 공식 문서가 그렇게 밝힌다. 2016년 Spring Cloud 팀이 Spring Cloud Sleuth를 만들었고, 이후 Spring 팀이 트레이싱 기능을 Spring Cloud에서 떼어내 별도 프로젝트로 옮겼다. 문서는 이를 Spring에 종속되지 않는, 사실상 Sleuth의 사본이라고 표현한다. 1.0.0 GA는 2022년 11월이었고, Spring Boot Actuator가 지금도 이 라이브러리의 자동 구성을 맡는다."
  - question: "OTel Collector는 무슨 역할을 하나?"
    answer: "앱이 OTLP로 보낸 트레이스·메트릭을 받아 가공하고 원하는 백엔드로 흘려보내는 중간 프록시다. 설정은 receiver·processor·exporter를 각각 정의하고 service.pipelines에서 조합하는 구조라, 같은 OTLP 입력을 트레이스는 Jaeger로 메트릭은 Prometheus로 동시에 내보내는 라우팅이 가능하다. 앱은 Collector 주소 하나만 알면 되고, 백엔드 교체는 Collector 설정만 바꾸면 된다."
---

지난 편에서 메트릭까지 갖췄다고 안심했다. `/actuator/prometheus`가 열려 있고, Grafana 대시보드에는 p99 지연 그래프가 돌고, 알림 규칙도 걸어뒀다. 그런데 어느 날 주문 API가 느리다는 제보가 들어왔다. 대시보드를 열어보니 주문 서비스의 p99가 확실히 올라 있었다. 딱 거기까지였다. 주문 서비스 안에서 지연이 생긴 건지, 주문 서비스가 부르는 결제 서비스나 재고 서비스가 느려서 덩달아 밀린 건지는 그래프 하나로 안 갈렸다.

로그로 넘어갔다. 세 서비스의 로그를 각각 열어 같은 시간대를 눈으로 맞춰봤다. 주문 서비스 로그의 `주문 처리 시작`과 결제 서비스 로그의 `결제 승인`이 같은 요청을 가리키는 건지 확신이 안 섰다. 요청 ID를 로그 메시지에 손으로 심어뒀다면 몰라도, 기본값으로는 그 둘을 이어줄 실이 없었다.

메트릭은 숫자를 집계하고, 로그는 사건을 개별로 남긴다. "이 요청 하나가 어느 서비스를 거쳐 어디서 지연됐나"는 둘 다 답을 못 준다. 요청 하나의 전체 여정을 하나로 꿰는 세 번째 신호가 필요했다. 트레이스(trace)다.

## 서비스가 하나일 땐 없던 문제

1편 로드맵이 그린 관측성 3부작이 로그, 메트릭, 트레이스였다. 3편에서 로그를 모았고, 4편에서 메트릭을 쌓았다. 이 둘은 사실 서비스가 하나였어도 필요한 일이었다. 로그는 서버 한 대 시절에도 남겼고, CPU 그래프 하나는 그때도 봤다.

트레이스는 다르다. 서비스가 하나면 애초에 필요가 없다. 요청이 프로세스 하나 안에서 끝나니 "어디서 지연됐나"는 스택 트레이스나 프로파일러로 충분하다. 트레이스가 필요해지는 시점은 정확히 서비스가 둘 이상으로 갈라지는 순간이다. 주문, 결제, 재고로 쪼개자마자 요청 하나가 파드 경계를 넘어 흐르기 시작하고, 그 흐름을 보는 도구가 따로 있어야 한다. MSA가 만드는 새 문제이고, 이 편이 처음으로 다루는 문제다.

## Micrometer Tracing: Spring 쪽 창구

Spring 진영에서 이 문제에 먼저 손을 댄 건 2016년 Spring Cloud 팀이 만든 Spring Cloud Sleuth였다. 이후 Spring 팀은 트레이싱 기능을 Spring Cloud에서 떼어내 별도 프로젝트로 옮겼는데, 그게 Micrometer Tracing이다. Micrometer 공식 문서는 이 프로젝트를 "Spring에 종속되지 않는, 사실상 Spring Cloud Sleuth의 사본"이라고 설명한다. 1.0.0 GA는 2022년 11월이었다.

Micrometer Tracing이 하는 일은 두 가지다. 첫째, 인기 있는 여러 트레이서 라이브러리를 감싸는 파사드를 제공해서 벤더 락인 없이 계측 코드를 짤 수 있게 한다. 둘째, Micrometer의 Observation API를 확장한다. `ObservationHandler`에 트레이싱 확장을 붙여서, `Observation` 하나가 쓰일 때마다 대응하는 스팬을 만들고 시작하고 멈추고 보고한다. 4편에서 쓴 Micrometer는 메트릭 레지스트리였다. Observation API는 그 위에 놓여서, 계측을 한 번만 하면 메트릭과 스팬이 같이 나오게 하는 상위 API다.

실제 트레이서 구현으로 연결하려면 브리지 의존성이 필요하다. `micrometer-tracing-bridge-brave`는 Zipkin으로, `micrometer-tracing-bridge-otel`은 OpenTelemetry SDK로 잇는다. Spring Boot Actuator는 이 Micrometer Tracing에 대한 의존성 관리와 자동 구성을 제공한다. `management.tracing.sampling.probability` 하나로 샘플링 비율을 조절하는 것도, 기본 10%인 이 값을 로컬 개발 중엔 100%로 올리는 것도 Actuator가 이미 깔아둔 자리다.

## Span: 요청 여정의 한 조각

스팬은 트레이스를 이루는 최소 단위다. 요청 하나가 주문, 결제, 재고 세 서비스를 거치면 트레이스 하나 안에 스팬이 최소 셋 생기고, 각 스팬이 시작 시각·종료 시각·태그를 들고 서로 부모-자식 관계로 엮인다. 그 트리를 펼치면 요청이 어디서 얼마나 머물렀는지가 그대로 그림이 된다.

Spring에서 스팬을 직접 만드는 방법은 방금 본 Observation API 그대로다. `ObservationRegistry`를 주입받아 `Observation`을 시작하면, Micrometer Tracing이 그 관측 구간을 스팬으로 잡는다.

```java file="OrderService.java"
private final ObservationRegistry registry;

public Order place(OrderRequest req) {
    return Observation.createNotStarted("order.place", registry)
        .lowCardinalityKeyValue("channel", req.channel())
        .observe(() -> doPlace(req)); // 이 실행 구간이 스팬+메트릭으로 같이 잡힘
}
```

낯선 코드가 아니다. 위에서 본 Observation 그대로이고, 여기에 트레이싱 브리지만 붙이면 스팬도 같이 나온다. 계측은 한 번, 신호는 둘이라던 위의 그 얘기가 코드로 확인되는 지점이다.

## OTel: 그 위에 놓인 표준

여기까지는 Spring 안에서 끝나는 이야기다. 그런데 이 스팬을 어디로 보낼지, 어떤 포맷으로 내보낼지는 Spring 바깥의 표준이 정한다. 그 표준이 OpenTelemetry(OTel)다.

OTel은 트레이스·메트릭·로그를 공통 프로토콜인 OTLP(OpenTelemetry Protocol)로 내보내는 규격을 정의한다. 계측은 한 번만 하고 백엔드는 나중에 정한다는 발상이라, Zipkin 쓰다 Jaeger로 옮기든 메트릭 벤더를 바꾸든 계측 코드는 그대로 둔다. 2026년 5월 21일 CNCF를 졸업하면서 사실상의 관측성 표준 자리를 굳혔고, Kubernetes 다음으로 활발한 프로젝트라는 평가도 그때 같이 나왔다.

Spring이 지원하는 트레이서는 크게 둘이다. OpenTelemetry(OTLP로 내보냄)와 OpenZipkin Brave(Zipkin으로 내보냄). 어느 쪽을 골라도 위에서 본 `Observation.createNotStarted().observe()` 코드는 그대로다. 브리지 의존성만 바뀐다.

JVM 앱을 OTel에 연결하는 또 다른 길도 있다. OTel Java agent다. `opentelemetry-javaagent.jar`를 JVM에 붙이면 코드를 한 줄도 안 바꾸고 바이트코드를 런타임에 계측한다.

```bash
java -javaagent:opentelemetry-javaagent.jar -jar my-service.jar
```

레거시 앱이나 소스를 못 건드리는 상황에 강력하지만, "주문 처리"라는 도메인 단위 스팬처럼 비즈니스 의미를 담은 계측은 agent 혼자로는 안 된다. 그건 Micrometer가 코드 안에서 직접 선언해야 하는 몫이다. 코드를 소유하고 Spring을 깊게 쓴다면 이번 편에서 본 Micrometer 경로가 자연스럽고, 둘을 같이 쓰면 같은 구간을 두 번 계측하는 충돌이 날 수 있으니 보통 하나를 주 경로로 정한다.

## OTLP로 내보내기 (Spring Boot 4.x)

여기서 버전을 조심해야 한다. Spring Boot 4에서 트레이싱 OTLP 설정 속성이 바뀌었기 때문이다.

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

메트릭은 `micrometer-registry-otlp` 의존성으로 OTLP 내보내기를 켜고, 트레이스는 OpenTelemetry 스타터가 OTLP 익스포터를 구성한다. 둘 다 같은 주소(`:4318`)로 보낸다. 그 주소가 바로 Collector다.

## Collector: 한 곳에 모아서 갈라 보낸다

4편 말미에서 다음 편에 만날 거라고 예고했던 그 Collector다. 앱은 OTLP로 딱 한 곳, Collector에만 보낸다. 그 뒤에서 누구에게 보낼지는 Collector 설정이 정한다.

Collector 설정은 receiver, processor, exporter 세 종류의 컴포넌트로 구성된다. Receiver는 신호를 받고, Processor는 가공하고, Exporter는 백엔드로 내보낸다. 이 셋을 정의한 뒤 `service.pipelines`에서 신호별로 조합해야 실제로 켜진다.

```yaml file="otel-collector-config.yaml"
receivers:
  otlp:
    protocols:
      grpc:
        endpoint: 0.0.0.0:4317
      http:
        endpoint: 0.0.0.0:4318

processors:
  memory_limiter:
    check_interval: 5s
    limit_mib: 4000

exporters:
  otlp_grpc/jaeger:
    endpoint: jaeger-server:4317
  prometheus:
    endpoint: 0.0.0.0:8889

service:
  pipelines:
    traces:
      receivers: [otlp]
      processors: [memory_limiter]
      exporters: [otlp_grpc/jaeger]
    metrics:
      receivers: [otlp]
      processors: [memory_limiter]
      exporters: [prometheus]
```

`otlp` 리시버가 4317(gRPC)과 4318(HTTP)로 앱의 OTLP를 받는다. 위에서 쓴 `application.yml`의 `:4318` 주소가 정확히 이 포트를 가리킨다. 받은 신호는 트레이스면 Jaeger로, 메트릭이면 Prometheus가 긁어갈 수 있는 `prometheus` 익스포터 엔드포인트로 갈라진다. 앱 코드는 이 라우팅을 전혀 모른다. 백엔드를 Jaeger에서 Tempo로 바꾸고 싶으면 앱을 다시 배포할 필요 없이 이 파일 한 곳만 고치면 된다.

4편에서 짚었듯 Prometheus 3.0은 OTLP를 직접 받는 기능도 갖췄다(`--web.enable-otlp-receiver`). Collector가 굳이 없어도 되는 경로처럼 보이지만, 실제로는 둘이 배타적이지 않다. Collector는 트레이스·메트릭·로그를 한 입구로 모아 필터링하고 여러 백엔드로 팬아웃하는 역할을 하고, Prometheus의 OTLP 수신은 그 팬아웃 대상 중 하나가 되는 선택지다.

> [!NOTE]
> Profiles라는 네 번째 신호도 2026년 3월 public Alpha로 들어왔다. eBPF 기반 연속 프로파일링을 OTel 규격 안으로 끌어들이는 시도인데, Alpha 단계라 공식적으로도 프로덕션 핵심 워크로드에는 아직 쓰지 말라고 못 박는다.

## 로그와 트레이스가 만나는 지점

3편에서 구조화 로깅을 켜고 JSON으로 로그를 남겼다. Micrometer Tracing을 쓰면 그 로그에 별도 작업 없이 correlation ID가 붙는다. Spring Boot 공식 문서에 나온 예시를 그대로 옮기면, MDC의 `traceId`가 `803B448A0489F84084905D3093480352`이고 `spanId`가 `3425F23BB2432450`일 때 로그 한 줄에 `[803B448A0489F84084905D3093480352-3425F23BB2432450]`가 자동으로 찍힌다. `logging.pattern.correlation` 속성으로 포맷을 바꿀 수도 있는데, 문서는 Spring Cloud Sleuth 시절 쓰던 포맷으로 되돌리는 예시까지 같이 보여준다.

이게 왜 중요하냐면, 3편의 로그와 이번 편의 트레이스가 여기서 처음으로 이어지기 때문이다. 결제 서비스 로그에서 에러 한 줄을 찾으면, 그 줄에 박힌 traceId로 Jaeger나 Tempo에서 같은 요청의 전체 여정을 바로 펼쳐볼 수 있다. 로그는 사건을, 트레이스는 여정을 보여준다던 이번 편 서두의 구분이 실제로는 traceId 하나로 붙어 있다.

## 정리

메트릭과 로그는 서비스 하나 안의 이야기다. 요청이 서비스 경계를 넘는 순간부터는 트레이스가 있어야 흐름이 보인다. Spring에서 그 창구는 Micrometer Tracing이다. Sleuth의 뒤를 이은 이 라이브러리가 Observation API를 확장해서 스팬을 만들고, `micrometer-tracing-bridge-otel`로 OpenTelemetry SDK에 연결하고, OTLP로 Collector에 내보낸다. Collector는 그 신호를 받아 Jaeger든 Prometheus든 필요한 곳으로 갈라 보낸다. 코드를 못 건드리는 레거시라면 Java agent가 대안이지만, 코드를 소유하고 도메인 단위 스팬을 원한다면 이번 편에서 본 Micrometer 경로가 기본값이다.

## 다음 편

이제 요청 하나가 주문에서 결제로, 결제에서 재고로 넘어가는 흐름이 트레이스 하나로 눈에 보인다. 어디서 지연됐는지, 어느 서비스가 실패를 되돌려줬는지 더 이상 로그를 눈으로 맞춰볼 필요가 없다.

그런데 트레이스를 들여다보다 이상한 걸 발견했다. 결제 서비스를 부르는 `WebClient` 코드에 재시도 로직이 박혀 있고, 타임아웃 값이 하드코딩돼 있고, mTLS 인증서 설정까지 애플리케이션 프로퍼티 파일 어딘가에 흩어져 있었다. 서비스가 셋일 때는 그럭저럭 버텼는데, 이 통신 로직을 서비스마다 복사해 붙이는 걸 계속 반복할 순 없었다. 흐름은 보이는데, 그 흐름을 이루는 통신 하나하나를 여전히 애플리케이션 코드가 떠안고 있었다.

다음 편은 그 짐을 코드 밖으로 내리는 서비스 메시다.

## 참고

- [OpenTelemetry Has Graduated · OpenTelemetry Blog](https://opentelemetry.io/blog/2026/otel-graduates/)
- [OpenTelemetry Profiles Enters Public Alpha](https://opentelemetry.io/blog/2026/profiles-alpha/)
- [Tracing support · Micrometer Reference](https://docs.micrometer.io/tracing/reference/)
- [Tracing · Spring Boot Reference](https://docs.spring.io/spring-boot/reference/actuator/tracing.html)
- [Micrometer Observation API](https://docs.micrometer.io/micrometer/reference/observation.html)
- [Configuration · OpenTelemetry Collector](https://opentelemetry.io/docs/collector/configuration/)
- [opentelemetry-java-instrumentation (Java agent)](https://github.com/open-telemetry/opentelemetry-java-instrumentation)
