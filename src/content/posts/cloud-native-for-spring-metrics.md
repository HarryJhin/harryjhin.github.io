---
author: 주진현
pubDatetime: 2026-06-04T09:00:00+09:00
title: "로그만으론 상태를 못 본다: Micrometer와 Prometheus (Spring 개발자를 위한 클라우드 표준 4)"
featured: false
section: cloud-native
series:
  slug: cloud-native-for-spring
  order: 4
tags:
  - prometheus
  - micrometer
  - spring-boot
  - grafana
  - observability
  - cloud-native
description: 로그로 "이 요청이 실패했다"는 알아도 "지금 시스템이 건강한가"는 안 보인다. Spring Boot Actuator가 Micrometer로 만든 메트릭을 Prometheus가 pull로 긁어가고, PromQL로 추이를 보고 Alertmanager로 알림을 걸고, Grafana에서 로그 옆에 나란히 놓는 길을 따라간다.
faq:
  - question: "Spring Boot 메트릭을 Prometheus로 노출하는 법은?"
    answer: "micrometer-registry-prometheus 의존성을 런타임 클래스패스에 추가하면 Actuator가 /actuator/prometheus 엔드포인트를 자동 구성한다. management.endpoints.web.exposure.include에 prometheus를 넣어 노출을 켜고, Prometheus의 scrape_config에서 metrics_path를 이 경로로 지정하면 스크레이프가 시작된다. 엔드포인트를 열어보면 jvm_memory_used_bytes, http_server_requests_seconds_count 같은 Micrometer가 만든 메트릭이 텍스트 포맷으로 나열돼 있다. Kubernetes에서는 정적 타겟 대신 서비스 디스커버리로 파드를 자동 찾아 스크레이프한다."
  - question: "Micrometer가 뭐고 Actuator와는 무슨 관계인가?"
    answer: "Micrometer는 애플리케이션 메트릭을 위한 파사드 라이브러리다. Actuator가 Micrometer에 대한 의존성 관리와 자동 설정을 제공해서, 클래스패스에 micrometer-registry-{system} 하나만 올리면 그에 맞는 레지스트리가 자동 구성된다. Spring Boot는 클래스패스에서 찾은 구현체마다 레지스트리를 만들어 composite MeterRegistry로 묶으므로, 여러 시스템으로 동시에 내보내는 것도 가능하다. 어디로 보낼지는 이 레지스트리 선택 하나로 갈린다."
  - question: "Prometheus의 pull 모델이란 무엇인가?"
    answer: "앱이 메트릭을 Prometheus로 밀어 보내는 게 아니라, Prometheus가 주기적으로 각 인스턴스의 HTTP 엔드포인트(예: /actuator/prometheus)를 방문해 값을 긁어가는(scrape) 방식이다. 파드가 수시로 뜨고 죽는 환경에서 죽어가는 인스턴스가 메트릭을 다 보냈는지 신경 쓸 필요 없이, Prometheus가 살아있는 타겟만 찾아 긁으면 되는 구조라 잘 맞는다."
  - question: "Grafana로 Spring 메트릭 대시보드는 어떻게 만드나?"
    answer: "Grafana에 Prometheus를 데이터소스로 등록하면, 각 데이터소스가 자기 질의 언어에 맞는 쿼리 에디터를 제공한다. Prometheus는 PromQL 에디터로 패널을 그리고, 이미 등록한 Loki(LogQL)와 같은 화면에 나란히 놓인다. Explore에서는 데이터소스를 넘나들며 특정 서비스의 로그와 메트릭을 함께 확인하고, correlation 기능으로 로그 한 줄에서 같은 서비스의 메트릭으로 바로 건너뛸 수도 있다."
  - question: "Prometheus에서 알림(Alertmanager)은 어떻게 설정하나?"
    answer: "PromQL 표현식을 alert 규칙에 걸고, 조건이 일정 시간 지속되면 Prometheus가 Alertmanager로 알림을 넘기는 구조다. 예를 들어 5xx 비율이 5분간 5%를 넘는 rate() 표현식을 for: 5m 조건과 묶어 alert-rules.yml에 규칙으로 두면, 조건이 실제로 지속될 때만 Alertmanager가 severity 라벨과 annotations를 실어 Slack이나 PagerDuty로 통지를 보낸다."
---

3편에서 LogQL 한 줄로 세 파드의 ERROR를 한 화면에 모았다. `{app="my-service"} |= "ERROR"`. 문제 하나는 확실히 풀렸다. 특정 요청이 실패했다면, 이제 그 로그를 찾는 데 몇 초면 됐다.

그런데 다음 회의에서 다른 질문이 나왔다. "지금 우리 서비스 괜찮아요?" 나는 바로 대답하지 못했다. Grafana Explore를 열고 LogQL을 이것저것 돌려봤다. ERROR 로그 개수를 세보고, 최근 5분과 어제 같은 시간대를 눈으로 비교해보려 했다. 그런데 그건 로그를 세는 거지, 지금 이 순간 p99 지연이 오르고 있는지, 에러율이 임계치를 넘어가고 있는지를 보여주는 일은 아니었다. 로그 한 줄은 사건이다. "3시 12분에 이 요청이 500을 받았다"는 정확히 말해준다. 그런데 "지금 추세가 어느 쪽인가"는 사건 하나로는 안 보인다. 사건을 계속 쌓아 계산해야 나오는 값이다.

그 계산을 로그 검색 언어로 매번 하려니 느리고 부정확했다. 필요한 건 처음부터 숫자를 집계해서 들고 있는 저장소였다.

그 저장소가 Prometheus다. CNCF에 Kubernetes 다음 두 번째로 합류한(2016년) 프로젝트이고, 2018년에 졸업한 메트릭의 사실상 표준이다.

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

## Actuator와 Micrometer를 Prometheus에 잇기

2편에서 Actuator를 이미 한 번 썼다. `/actuator/health/liveness`와 `/actuator/health/readiness`로 Kubernetes probe를 만들 때였다. 그런데 Actuator가 들고 있는 건 헬스만이 아니다. 시작할 때부터 메트릭도 같이 모으고 있었다. 그 계측을 실제로 맡는 게 Micrometer다. Spring Boot 공식 문서의 표현을 빌리면 Micrometer는 "애플리케이션 메트릭 파사드"다. Actuator가 이 Micrometer에 대한 의존성 관리와 자동 설정을 제공하고, 클래스패스에 `micrometer-registry-{system}` 하나만 올리면 그에 맞는 레지스트리가 자동 구성된다. 어느 모니터링 시스템으로 보낼지는 이 레지스트리 선택 하나로 갈린다.

Spring Boot에서 Prometheus로 향하는 길도 의존성 하나면 된다. `micrometer-registry-prometheus`를 런타임 클래스패스에 올리면, Actuator가 Prometheus 포맷의 스크레이프 엔드포인트를 자동 구성한다.

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

앞서 본 Micrometer의 `MeterRegistry`가 이 메트릭들을 만든다. Micrometer는 메트릭 이름을 점(`.`)으로 적지만, Prometheus 레지스트리가 스크레이프 시점에 스네이크 케이스로 변환한다. 그래서 코드의 `http.server.requests`가 노출 시점엔 `http_server_requests_seconds_*`가 된다.

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

2편에서 "이 여유를 얼마나 줄지는 결국 관측해서 정한다"고 미뤄뒀던 그 관측이 이거다. `jvm_memory_used_bytes`를 한동안 지켜보면서 실제 RSS와 힙의 관계를 보고 `MaxRAMPercentage`를 조정한다. 추측이 아니라 그래프를 보고.

## Grafana에서 로그 옆에 메트릭을 놓는다

메트릭이 쌓이고 알림까지 걸었으면 이제 볼 차례다. Prometheus 자체에도 조회 UI가 있지만, 3편에서 이미 Loki 로그를 보려고 Grafana를 열어둔 상태였다. 같은 화면에 메트릭도 놓을 수 있을까.

Grafana 공식 문서는 스스로를 이렇게 소개한다. 메트릭·로그·트레이스가 어디에 저장돼 있든 질의하고 시각화하고 알림 걸고 탐색하게 해주는 도구. 그 연결 고리가 데이터소스(data source)다. Prometheus 서버나 Loki 인스턴스처럼 데이터를 들고 있는 저장 백엔드와의 연결 하나하나가 데이터소스이고, Grafana는 이 데이터소스에 질의해서 결과를 대시보드나 Explore에 그린다.

Prometheus를 데이터소스로 등록하면, 3편에서 등록해둔 Loki 옆에 나란히 선다. 각 데이터소스는 자기 질의 언어에 맞는 쿼리 에디터를 갖는다. Loki는 LogQL 에디터, Prometheus는 PromQL 에디터다. 패널 하나엔 PromQL로 그린 p99 지연 그래프를, 그 옆 패널엔 LogQL로 뽑은 ERROR 로그 목록을 놓을 수 있다. Explore에서는 이 둘을 오가며 특정 서비스의 로그와 메트릭을 나란히 확인한다. Grafana는 이 신호 사이를 잇는 correlation 기능도 제공해서, 로그 한 줄에서 같은 서비스의 메트릭으로 바로 건너뛸 수도 있다.

3편에서 짚은 LGTM(Loki·Grafana·Tempo·Mimir)이 이 지점에서 실감 난다. 각 저장소가 신호별로 나뉘어 있어도, 보는 자리는 Grafana 하나다.

## 다음 편을 위한 복선: Prometheus가 OTLP도 받는다

메트릭 파이프라인을 Micrometer와 Prometheus로 다 채웠다고 생각했는데, 하나가 더 있다. 다음 편에서 다룰 분산 추적은 OpenTelemetry(OTel)라는 표준을 쓴다. 그런데 이 둘, Prometheus와 OTel이 따로 놀지 않는다. **Prometheus 3.0부터 OTLP를 직접 받을 수 있다.**

```bash
prometheus --web.enable-otlp-receiver
```

이 플래그를 켜면 `/api/v1/otlp/v1/metrics` 경로로 OTLP 메트릭을 받아 바로 저장한다. 기본은 비활성이다. 그러면 다음 편에서 만날 OTel Collector가 Prometheus로 메트릭을 OTLP로 흘려보내는 것도 가능해진다. 전통적인 scrape(Prometheus가 긁기)와 push(Collector가 OTLP로 보내기)를 상황에 맞게 섞는다.

> [!NOTE]
> Prometheus 3.0은 UTF-8 메트릭 이름도 지원한다. OTel 메트릭 이름의 점(`.`)을 강제로 언더스코어로 바꾸지 않고 그대로 저장·질의할 수 있게 된 것이다. OTel과 Prometheus의 네이밍 관습 충돌을 줄이려는 방향이다. 2026년 6월 현재 Prometheus는 3.x 라인이다.

## 정리

Prometheus는 pull로 메트릭을 긁어간다. Spring에서는 `micrometer-registry-prometheus` 하나로 `/actuator/prometheus`가 열리고, Prometheus가 그걸 스크레이프해 시계열로 쌓는다. PromQL로 질의하고 Alertmanager로 알림을 건다. 2편에서 미뤄둔 "측정해서 정하기"가 실제로 이뤄지는 자리가 여기다. 그리고 Grafana에서는 이 메트릭을 3편의 Loki 로그 옆에 나란히 놓는다. 각 신호는 다른 저장소에 쌓이지만, 보는 자리는 하나다.

## 다음 편

그런데 이 편의 메트릭도, 3편의 로그도 결국 한 서비스 안의 이야기다. `http_server_requests_seconds_count`는 내 서비스가 받은 요청을 센 것이지, 그 요청이 다른 서비스를 몇 번 더 거쳤는지는 말해주지 않는다.

지금 이 시리즈에서 다루는 앱도 사실 하나다. 그런데 실제 운영에서는 앱이 계속 쪼개진다. 주문 서비스가 결제 서비스를 부르고, 결제 서비스가 다시 재고 서비스를 부르는 식으로. 요청 하나가 파드 여러 개, 서비스 경계 여러 개를 넘어 흐른다. 그 흐름 어딘가에서 지연이 튀거나 에러가 나면, 메트릭은 "내 서비스에서 에러율이 올랐다"까지만 말해준다. 그 에러가 다음 서비스에서 시작됐는지, 내 서비스가 원인인지는 메트릭 혼자로는 못 가른다. 로그도 마찬가지다. 서비스마다 따로 쌓이니, 요청 하나를 서비스 경계 너머까지 이어 보는 실이 없다.

그 실이 트레이스다. 다음 편은 분산 추적과 OpenTelemetry로, 요청 하나가 여러 서비스 경계를 넘는 동안 어디서 끊기는지를 잇는다.

## 참고

- [Overview · Prometheus](https://prometheus.io/docs/introduction/overview/)
- [Metric Types · Prometheus](https://prometheus.io/docs/concepts/metric_types/)
- [Metrics · Spring Boot Reference](https://docs.spring.io/spring-boot/reference/actuator/metrics.html)
- [OpenTelemetry Support · Prometheus](https://prometheus.io/docs/guides/opentelemetry/)
- [Prometheus 3.0 Announcement](https://prometheus.io/blog/2024/11/14/prometheus-3-0/)
- [About Grafana](https://grafana.com/docs/grafana/latest/introduction/)
- [Data sources · Grafana](https://grafana.com/docs/grafana/latest/datasources/)
