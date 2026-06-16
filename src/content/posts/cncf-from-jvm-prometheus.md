---
author: 주진현
pubDatetime: 2026-06-16T09:50:00+09:00
title: "관측성 ②: Prometheus와 메트릭 (JVM에서 본 클라우드 네이티브 6)"
featured: false
section: cloud-native
series:
  slug: cncf-from-jvm
  order: 6
tags:
  - prometheus
  - micrometer
  - spring-boot
  - observability
  - cloud-native
description: Prometheus는 앱이 메트릭을 밀어 보내길 기다리지 않는다. 직접 긁어간다(pull). Spring Boot Actuator의 /actuator/prometheus를 Prometheus가 스크레이프하고, PromQL로 질의하고, Alertmanager로 알림을 거는 길. 그리고 OTel과 Prometheus가 2026년에 만나는 지점까지.
faq:
  - question: "Prometheus는 메트릭을 어떻게 수집하나?"
    answer: "Pull 모델이다. 앱이 메트릭을 푸시하는 게 아니라, Prometheus가 주기적으로 각 인스턴스의 HTTP 엔드포인트(예: /actuator/prometheus)를 긁어간다(scrape). 데이터는 메트릭 이름과 레이블로 식별되는 시계열로 저장되고 PromQL로 질의한다. pull을 쓰는 이유는 파드가 수시로 뜨고 죽는 환경에서 죽어가는 인스턴스가 메트릭을 다 보냈는지 걱정할 필요 없이, Prometheus가 살아있는 타겟을 발견해 긁으면 되기 때문이다."
  - question: "Spring Boot에서 Prometheus 메트릭을 노출하려면?"
    answer: "micrometer-registry-prometheus 의존성을 추가하면 Actuator가 /actuator/prometheus 엔드포인트를 노출한다. management.endpoints.web.exposure.include로 노출을 켜고, Prometheus의 scrape_config에서 metrics_path를 /actuator/prometheus로 가리키면 된다. Micrometer가 jvm_memory_used_bytes, http_server_requests_seconds_count 같은 메트릭을 만든다."
  - question: "Prometheus와 OpenTelemetry는 어떻게 같이 쓰나?"
    answer: "Prometheus 3.0부터 OTLP를 직접 받을 수 있다. --web.enable-otlp-receiver 플래그로 /api/v1/otlp/v1/metrics 경로의 OTLP 리시버를 켜면, OTel Collector가 보낸 메트릭을 Prometheus에 바로 저장한다. 기본은 비활성이다. 전통적인 scrape 모델과 OTLP 인제스트를 상황에 맞게 섞을 수 있다."
  - question: "Prometheus에서 PromQL로 에러율 알림을 어떻게 거나?"
    answer: "PromQL 표현식을 alert 규칙에 두고 Alertmanager가 통지한다. 예를 들어 sum(rate(http_server_requests_seconds_count{status=~\"5..\"}[5m])) / sum(rate(http_server_requests_seconds_count[5m])) > 0.05을 for: 5m로 평가하고, 규칙이 매칭되면 Prometheus가 Alertmanager로 넘겨 Slack이나 PagerDuty로 보낸다."
---

5부에서 메트릭을 OTLP로 내보내는 데까지 왔다. 그런데 내보낸 메트릭은 어딘가에 쌓이고 질의돼야 쓸모가 있다. 그 종착지로 가장 흔한 게 Prometheus다. CNCF에 Kubernetes 다음 두 번째로 합류한(2016년) 프로젝트이고, 2018년에 졸업한 메트릭의 사실상 표준이다.

Prometheus를 이해하는 첫 단추는 방향이다. 다른 많은 모니터링 도구와 반대로 간다.

## Pull: Prometheus가 긁어간다

대부분의 사람이 처음에 헷갈리는 지점이 여기다. **앱이 Prometheus로 메트릭을 보내는 게 아니다. Prometheus가 앱을 긁어간다.** Pull 모델이다.

각 앱 인스턴스는 메트릭을 HTTP 엔드포인트에 그냥 노출해 둔다. Prometheus가 설정된 주기마다 그 엔드포인트를 방문해 현재 값을 가져간다(scrape). 이 방향이 클라우드 네이티브와 잘 맞는다. 파드가 수시로 뜨고 죽는 환경에서, 죽어가는 파드가 메트릭을 다 보냈는지 걱정할 필요 없이, Prometheus가 살아있는 타겟을 발견해 긁으면 되기 때문이다.

저장 모델은 시계열이다. 메트릭 하나는 **이름 + 레이블(key/value)**로 식별된다. 예를 들어 `http_server_requests_seconds_count{method="GET", status="200"}`는 GET·200 응답의 누적 요청 수다. 이 다차원성을 질의하는 언어가 **PromQL**이다.

메트릭에는 네 가지 기본 타입이 있다.

- **Counter**: 단조 증가만 하는 누적값. 요청 수, 에러 수.
- **Gauge**: 오르내리는 현재값. 힙 사용량, 활성 스레드 수.
- **Histogram**: 관측값을 버킷에 나눠 세는 것. 레이턴시 분포.
- **Summary**: 히스토그램과 비슷하나 분위수를 클라이언트에서 계산.

## Actuator를 Prometheus에 잇기

Spring Boot에서는 의존성 하나면 된다. `micrometer-registry-prometheus`를 런타임 클래스패스에 올리면, Actuator가 Prometheus 포맷의 스크레이프 엔드포인트를 자동 구성한다.

```kotlin file="build.gradle.kts"
runtimeOnly("io.micrometer:micrometer-registry-prometheus")
```

```yaml file="application.yml"
management:
  endpoints:
    web:
      exposure:
        include: health, prometheus # 기본은 미노출이라 명시 필요
```

이러면 `/actuator/prometheus`가 열린다. 들여다보면 이런 텍스트가 나온다.

```text
# HELP jvm_memory_used_bytes The amount of used memory
# TYPE jvm_memory_used_bytes gauge
jvm_memory_used_bytes{area="heap",id="G1 Eden Space"} 1.34217728E8
http_server_requests_seconds_count{method="GET",status="200",uri="/api/orders"} 2048.0
http_server_requests_seconds_sum{method="GET",status="200",uri="/api/orders"} 41.7
```

5부에서 본 Micrometer의 `MeterRegistry`가 이 메트릭들을 만든다. Micrometer는 메트릭 이름을 점(`.`)으로 적지만, Prometheus 레지스트리가 스크레이프 시점에 스네이크 케이스로 변환한다. 그래서 코드의 `http.server.requests`가 노출 시점엔 `http_server_requests_seconds_*`가 된다.

Prometheus 쪽 설정은 이 경로를 가리키기만 하면 된다.

```yaml file="prometheus.yml"
scrape_configs:
  - job_name: "spring"
    metrics_path: "/actuator/prometheus"
    static_configs:
      - targets: ["my-service:8080"]
```

실제 Kubernetes에선 `static_configs` 대신 서비스 디스커버리로 파드를 자동 발견하지만, 원리는 같다.

## PromQL과 알림

쌓인 메트릭을 질의하는 게 PromQL이다. 몇 가지 예를 보자. 표현식은 표준 함수 조합이고, 메트릭 이름은 위에서 본 Micrometer 노출명을 쓴다.

```promql
# 최근 5분 평균 요청 레이턴시(초)
rate(http_server_requests_seconds_sum[5m])
  / rate(http_server_requests_seconds_count[5m])

# heap 영역 사용량 합계
sum(jvm_memory_used_bytes{area="heap"})
```

운영에서 진짜 쓰는 건 알림이다. 알림 규칙을 Prometheus에 두고, 실제 통지(Slack, PagerDuty)는 **Alertmanager**가 맡는다.

```yaml file="alert-rules.yml"
groups:
  - name: spring-app
    rules:
      - alert: HighErrorRate
        expr: |
          sum(rate(http_server_requests_seconds_count{status=~"5.."}[5m]))
            / sum(rate(http_server_requests_seconds_count[5m])) > 0.05
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "5xx 비율이 5분간 5%를 넘었다"
```

2부에서 "힙 여유를 얼마나 줄지는 관측해서 정한다"고 했던 그 관측이 이거다. `jvm_memory_used_bytes`를 한동안 지켜보면서 실제 RSS와 힙의 관계를 보고 `MaxRAMPercentage`를 조정한다. 추측이 아니라 그래프를 보고.

## 2026년, Prometheus가 OTLP를 받는다

5부 OTel과 6부 Prometheus가 따로 노는 것 같지만, 2026년 현재 둘은 만난다. **Prometheus 3.0부터 OTLP를 직접 받을 수 있다.**

```bash
prometheus --web.enable-otlp-receiver
```

이 플래그를 켜면 `/api/v1/otlp/v1/metrics` 경로로 OTLP 메트릭을 받아 바로 저장한다. 기본은 비활성이다. 그러면 5부에서 구성한 OTel Collector가 Prometheus로 메트릭을 OTLP로 흘려보낼 수 있다. 전통적인 scrape(Prometheus가 긁기)와 push(Collector가 OTLP로 보내기)를 상황에 맞게 섞는다.

> [!NOTE]
> Prometheus 3.0은 UTF-8 메트릭 이름도 지원한다. OTel 메트릭 이름의 점(`.`)을 강제로 언더스코어로 바꾸지 않고 그대로 저장·질의할 수 있게 된 것이다. OTel과 Prometheus의 네이밍 관습 충돌을 줄이려는 방향이다. 2026년 6월 현재 Prometheus는 3.x 라인이다.

## 정리

Prometheus는 pull로 메트릭을 긁어간다. Spring에서는 `micrometer-registry-prometheus` 하나로 `/actuator/prometheus`가 열리고, Prometheus가 그걸 스크레이프해 시계열로 쌓는다. PromQL로 질의하고 Alertmanager로 알림을 건다. 2부에서 미룬 "측정해서 정하기"가 실제로 이뤄지는 자리다.

2026년의 변화로, Prometheus는 이제 OTLP도 직접 받는다. 5부의 OTel과 6부의 Prometheus를 한 파이프라인으로 잇는 길이 더 매끄러워졌다.

여기까지가 한 앱을 관측하는 이야기다. 다음 7부는 서비스가 여러 개가 됐을 때, 그 사이를 흐르는 트래픽을 앱 코드 밖에서 다루는 서비스 메시로 넘어간다.

## 참고

- [Overview — Prometheus](https://prometheus.io/docs/introduction/overview/)
- [Metric Types — Prometheus](https://prometheus.io/docs/concepts/metric_types/)
- [Metrics — Spring Boot Reference](https://docs.spring.io/spring-boot/reference/actuator/metrics.html)
- [OpenTelemetry Support — Prometheus](https://prometheus.io/docs/guides/opentelemetry/)
- [Prometheus 3.0 Announcement](https://prometheus.io/blog/2024/11/14/prometheus-3-0/)
