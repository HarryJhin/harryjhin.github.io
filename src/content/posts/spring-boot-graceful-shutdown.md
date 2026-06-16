---
author: 주진현
pubDatetime: 2026-06-16T10:00:00+09:00
title: "Spring Boot Graceful Shutdown: 요청을 흘리지 않고 죽는 법"
featured: false
section: spring
tags:
  - spring-boot
  - graceful-shutdown
  - kubernetes
  - smartlifecycle
  - jvm
description: "server.shutdown=graceful 한 줄로는 부족하다. SmartLifecycle phase로 못 박힌 종료 순서, 임베디드 서버별 drain 방식, 버전별 기본값 함정, 쿠버네티스 preStop까지 Spring Boot 소스로 직접 확인한 graceful shutdown의 내부."
faq:
  - question: "Spring Boot에서 server.shutdown 기본값은 graceful인가?"
    answer: "버전에 따라 다르다. Spring Boot 3.3 이하는 기본값이 immediate라 server.shutdown=graceful로 직접 켜야 하고, 3.5부터는 기본값이 graceful로 바뀌어 별도 설정 없이 켜져 있다(플립 시점은 3.4 또는 3.5). 구버전 설정 파일을 그대로 들고 오면 동작이 달라질 수 있다."
  - question: "spring.lifecycle.timeout-per-shutdown-phase 기본값은?"
    answer: "Spring Framework 6.2(Spring Boot 3.4) 기준으로 30초에서 10초로 바뀌었다. DefaultLifecycleProcessor 소스가 'The default value is 10000 milliseconds (10 seconds) as of 6.2'로 명시한다. 이 값은 전역 단일 타임아웃이 아니라 같은 phase에 묶인 빈 그룹마다 적용되는 phase별 타임아웃이다."
  - question: "쿠버네티스에서 graceful shutdown만으로 무중단 배포가 되는가?"
    answer: "안 된다. 공식 문서가 'Spring Boot의 graceful shutdown 기간에만 의존하지 말라'고 경고한다. 파드 종료가 병렬로 일어나 이미 종료를 시작한 파드로 트래픽이 잠깐 더 들어오기 때문이다. preStop 훅에 sleep을 넣어 로드밸런서가 라우팅을 끊을 시간을 확보하고, terminationGracePeriodSeconds를 Spring 타임아웃보다 크게 잡아야 한다."
  - question: "Spring Boot 4.x에서 graceful shutdown 관련 변경점은?"
    answer: "임베디드 웹서버 클래스가 spring-boot-tomcat/jetty/reactor-netty 모듈로 분리되고 루트 패키지가 org.springframework.boot.<technology>로 바뀌었다. Servlet 6.1 비호환으로 Undertow 임베디드 지원이 제거됐다(3.x는 4개 서버, 4.x는 3개). graceful phase 상수 값(DEFAULT_PHASE - 1024)은 동일하나 deprecated 처리되고 WebServerApplicationContext.GRACEFUL_SHUTDOWN_PHASE로 이동했다."
---

배포할 때마다 모니터링에 5xx가 잠깐씩 튄다. 트래픽은 정상이고 코드도 멀쩡한데, 롤링 업데이트 순간에만 몇 건씩 실패가 찍힌다. 원인은 대개 하나다. 종료되는 인스턴스가 처리 중이던 요청을 끝내지 못하고 그냥 죽기 때문이다.

Graceful shutdown은 이 문제를 푸는 장치다. 그런데 "그냥 `server.shutdown=graceful` 켜면 된다"는 수준의 설명으로는 운영에서 안 통한다. 어떤 순서로 무엇이 멈추는지, 버전마다 기본값이 어떻게 다른지, 쿠버네티스에서는 왜 이것만으로 부족한지를 알아야 한다. 이 글은 Spring Boot 소스코드와 공식 문서를 직접 뜯어 그 내부를 정리한다.

## Table of contents

## Shutdown과 Graceful Shutdown은 다른 층위다

먼저 용어를 분리하자. Shutdown은 `ApplicationContext.close()`가 호출되면서 일어나는 종료 과정 전체다. 빈이 소멸되고 리소스가 닫힌다. 트리거는 보통 SIGTERM이고, `SpringApplication`이 등록해 둔 JVM shutdown hook이 이를 받아 컨텍스트 close를 호출한다.

Graceful shutdown은 그 종료 과정 안의 한 단계다. 임베디드 웹서버가 신규 요청은 거부하되, 이미 처리 중인 요청은 유예 시간(grace period) 동안 끝까지 처리하도록 만드는 메커니즘이다. 핵심 차이는 처리 중인 요청을 어떻게 대하느냐에 있다. 일반 종료는 그냥 끊고, graceful은 기다린다.

Spring Boot 2.3에서 도입됐고, 공식 문서는 이렇게 정의한다. "graceful shutdown은 애플리케이션 컨텍스트를 닫는 과정의 일부로 일어나며, `SmartLifecycle` 빈을 멈추는 가장 이른 단계에서 수행된다."

이 "가장 이른 단계"라는 표현이 모호하다. 정확히 무엇이 먼저고 무엇이 나중인지는 소스를 봐야 드러난다.

## 종료 순서를 결정하는 두 개의 Lifecycle

Spring Boot에서 웹서버는 별개의 `SmartLifecycle` 빈 두 개로 관리된다. 하나는 실제 서버를 켜고 끄는 빈, 다른 하나는 graceful drain만 담당하는 빈이다. 둘의 phase 값이 종료 순서를 가른다.

소스에서 직접 확인한 값이다(`v3.3.0` 기준).

```java
// WebServerGracefulShutdownLifecycle
public static final int SMART_LIFECYCLE_PHASE = SmartLifecycle.DEFAULT_PHASE - 1024;

// WebServerStartStopLifecycle
public int getPhase() {
    return WebServerGracefulShutdownLifecycle.SMART_LIFECYCLE_PHASE - 1024;
}
```

`SmartLifecycle.DEFAULT_PHASE`는 `Integer.MAX_VALUE`다. 그래서 graceful drain은 `MAX-1024`, 실제 서버 stop은 `MAX-2048`에 놓인다.

`SmartLifecycle`의 종료 규칙은 "phase가 높은 빈부터 멈춘다"이다(시작은 반대로 낮은 phase부터). `MAX-1024`가 `MAX-2048`보다 크니까, drain이 먼저 끝나고 그 다음에 서버가 실제로 닫힌다. 우리가 기대하는 바로 그 순서다. 신규 요청을 막고, in-flight 요청을 다 처리하고, 그제서야 커넥터를 닫는다.

두 빈 사이의 1024라는 간격은 의도된 여유 공간이다. 사용자가 직접 만든 `SmartLifecycle` 빈을 이 사이에 끼워 넣어 종료 순서를 제어하라고 비워둔 것이다.

그리고 `stop`은 콜백을 받는 비동기 형태다.

```java
@Override
public void stop(Runnable callback) {
    this.running = false;
    this.webServer.shutDownGracefully((result) -> callback.run());
}
```

drain이 끝나야 `callback.run()`이 호출되고, 그래야 다음 phase로 넘어간다. Spring은 웹서버가 "다 비웠다"고 알려줄 때까지 종료를 진행하지 않는다.

## "신규 요청 거부"는 서버마다 방식이 다르다

graceful의 원리는 같아도 신규 요청을 어떻게 막느냐는 임베디드 서버마다 구현이 다르다. 세 서버의 `GracefulShutdown` 소스를 모두 열어 비교했다.

세 서버 모두 공통 패턴을 따른다. 전용 종료 스레드(`tomcat-shutdown`, `jetty-shutdown`, `netty-shutdown`)를 띄우고, `Commencing graceful shutdown. Waiting for active requests to complete` 로그를 남긴 뒤, 활성 요청이 0이 될 때까지 폴링한다. 끝나면 `IDLE`, 타임아웃에 걸려 중단되면 `REQUESTS_ACTIVE`를 콜백한다.

차이는 두 군데뿐이다. 신규 요청을 막는 방법과 폴링 간격.

| 서버 | 신규 요청 차단 방식 | in-flight 대기 | 폴링 간격 |
|---|---|---|---|
| Tomcat | `connector.pause()` (네트워크 레이어 수락 중단) | `isActive()` 폴링 | 50ms |
| Jetty | `connector.shutdown()` (커넥터별 Future) | `activeRequests > 0` 폴링 | 100ms |
| Reactor Netty | `server.disposeNow(...)` (Reactor Netty 위임) | dispose 위임 | 50ms (abort 감지) |
| Undertow | 신규 연결은 받되 즉시 503 응답 | (문서 기준) | — |

Undertow만 동작 철학이 다르다. Tomcat, Jetty, Netty는 아예 네트워크 레이어에서 신규 요청을 안 받는데, Undertow는 연결은 수락하고 503 Service Unavailable로 응답한다. 로드밸런서 입장에서 보면 "조용히 안 받는" 쪽과 "받아서 거절하는" 쪽의 차이라, 앞단 헬스체크 설정에 영향을 줄 수 있다.

> [!NOTE]
> 흔히 도는 "Tomcat은 `ContextClosedEvent` 리스너로 graceful을 처리한다"는 설명은 틀렸다. 실제 트리거는 `SmartLifecycle.stop(callback)`이고, drain은 `connector.pause()` 다음에 50ms 폴링으로 활성 요청을 기다리는 방식이다.

## 설정값, 그리고 버전이 파놓은 함정

설정 자체는 단순하다.

```yaml file="application.yml"
server:
  shutdown: graceful          # 활성/비활성
spring:
  lifecycle:
    timeout-per-shutdown-phase: 30s   # phase별 유예 시간
```

문제는 이 두 값의 기본값이 버전에 따라 다르다는 점이다. 여기서 사고가 난다.

`server.shutdown` 기본값부터 보자. 공식 문서를 버전별로 직접 비교했다.

| Spring Boot | 문서 표현 | `server.shutdown` 기본값 |
|---|---|---|
| 2.7 / 3.0 / 3.3 | "graceful shutdown is *supported*… To *enable*, set `server.shutdown=graceful`" | `immediate` (직접 켜야 함) |
| 3.5 / 4.1 | "graceful shutdown is *enabled by default*… To *disable*, set `server.shutdown=immediate`" | `graceful` (기본 활성) |

3.3까지는 명시적으로 켜야 했고, 3.5부터는 기본으로 켜져 있다(플립 시점은 3.4 또는 3.5). 3.3에서 잘 돌던 설정 파일을 그대로 들고 와서 "왜 3.5에서 동작이 다르지?" 하는 경우가 여기서 나온다. 반대로 구버전인데 `server.shutdown`을 안 적어두면 graceful은 꺼진 채로 운영된다.

`timeout-per-shutdown-phase`의 기본값도 바뀌었다. `DefaultLifecycleProcessor` 소스에서 확인한 값이다.

- Spring Framework 6.1 이하 (Boot 3.3 이하): 30초
- Spring Framework 6.2 이상 (Boot 3.4 이상): 10초

소스 javadoc이 명시한다. "The default value is 10000 milliseconds (10 seconds) as of 6.2." 30초를 가정하고 쿠버네티스 grace period를 잡아뒀다면, 3.4로 올리는 순간 유예 시간이 10초로 줄어든 걸 모르고 지나칠 수 있다.

이 값은 전역 단일 타임아웃이 아니라 phase별 타임아웃이라는 점도 중요하다. 같은 phase에 묶인 빈 그룹마다 따로 적용된다.

## graceful은 웹서버만의 일이 아니다

여기서부터가 대부분의 글이 빠뜨리는 부분이다. HTTP 요청만 잘 처리하고 끝나는 게 아니다. 그 요청이 백그라운드 스레드풀에 작업을 던졌거나, Kafka 컨슈머가 메시지를 처리 중이라면 그것들도 정리돼야 한다.

스레드풀부터. `ThreadPoolTaskExecutor`와 `ThreadPoolTaskScheduler`의 부모인 `ExecutorConfigurationSupport`는 Spring Framework 6.1부터 `SmartLifecycle`이다. 종료 시 작업 완료를 기다릴지는 두 프로퍼티로 정한다.

```yaml file="application.yml"
spring:
  task:
    execution:
      shutdown:
        await-termination: true
        await-termination-period: 30s
    scheduling:
      shutdown:
        await-termination: true
        await-termination-period: 30s
```

소스에서 확인한 기본값은 둘 다 `awaitTermination = false`, `awaitTerminationPeriod = null`이다. 기본 상태로는 스레드풀이 진행 중인 작업을 안 기다리고 멈춘다는 뜻이다. `@Async`로 던진 작업이 종료 때 잘리는 게 싫다면 명시적으로 켜야 한다.

스레드풀의 phase는 `Integer.MAX_VALUE / 2`다(`ExecutorConfigurationSupport.DEFAULT_PHASE`, 소스 확인). Kafka의 `@KafkaListener` 컨테이너는 `MessageListenerContainer`가 `SmartLifecycle`을 상속하고, 기본 phase는 `Integer.MAX_VALUE - 100`이다.

이 값들을 종료 순서(높은 phase 먼저)로 줄 세우면 전체 그림이 나온다.

```text
컨텍스트 close 시작
  │
  ├─ (MAX-100)   Kafka 리스너 컨테이너 stop
  ├─ (MAX-1024)  웹서버 graceful drain  ← 신규 HTTP 거부 + in-flight 완료
  ├─ (MAX-2048)  웹서버 실제 stop (커넥터 닫힘)
  ├─ (MAX/2)     TaskExecutor / TaskScheduler 스레드풀 stop
  │
  └─ 모든 SmartLifecycle stop 후
       └─ 빈 destroy 단계 (@PreDestroy / DisposableBean)
            └─ HikariCP DataSource.close() (커넥션 풀 종료)
```

`@PreDestroy`와 `DisposableBean`이 가장 나중이라는 건 소스로 확정된다. `AbstractApplicationContext.doClose()`가 `lifecycleProcessor.onClose()`(SmartLifecycle stop)를 먼저 호출하고, 그 다음에 `destroyBeans()`를 부른다. 코드 주석도 명시한다. "Stop all Lifecycle beans, to avoid delays during individual destruction."

HikariCP는 `SmartLifecycle`이 아니다. `Closeable`을 구현한 일반 빈이라, phase 기반 stop이 아니라 맨 마지막 destroy 단계에서 `close()`로 풀이 닫힌다. 그래서 DB 커넥션은 웹 요청과 백그라운드 작업이 전부 끝난 뒤에야 회수된다. 순서상 합리적이다. 요청이 아직 DB를 쓰고 있는데 풀을 먼저 닫아버리면 안 되니까.

## Readiness 상태와 종료의 미묘한 자기모순

쿠버네티스 환경이라면 한 겹 더 있다. Spring Boot는 종료가 시작되는 순간 readiness 상태를 자동으로 바꾼다.

`ServletWebServerApplicationContext.doClose()` 소스를 보면 명확하다.

```java
@Override
protected void doClose() {
    if (isActive()) {
        AvailabilityChangeEvent.publish(this, ReadinessState.REFUSING_TRAFFIC);
    }
    super.doClose();   // ← 여기서 graceful shutdown이 돌아간다
    ...
}
```

`super.doClose()`를 부르기 직전에 `REFUSING_TRAFFIC`을 발행한다. graceful drain이 시작되기도 전에 "나 이제 트래픽 안 받아"라는 상태로 전환된다(리액티브 컨텍스트도 동일).

`ReadinessState`는 `ACCEPTING_TRAFFIC`과 `REFUSING_TRAFFIC` 두 값뿐이고, `LivenessState`는 `CORRECT`와 `BROKEN`이다. 공식 문서의 종료 단계 표가 이 흐름을 그대로 보여준다.

| 종료 단계 | Liveness | Readiness | HTTP 서버 |
|---|---|---|---|
| Running | CORRECT | ACCEPTING_TRAFFIC | 요청 수락 (종료 요청 들어옴) |
| Graceful shutdown | CORRECT | REFUSING_TRAFFIC | 신규 요청 거부, in-flight 처리 |
| Shutdown complete | N/A | N/A | 서버 종료됨 |

그런데 같은 문서에 결정적인 한 줄이 붙어 있다. graceful shutdown 단계에서 "HTTP probe도 트래픽을 받지 않게 되므로, availability 상태를 외부에서 바로 읽을 수 없다(the availability states are not readily available externally)."

이게 자기모순처럼 보이는 지점이다. 앱은 내부적으로 "나 REFUSING_TRAFFIC이야"라고 상태를 바꿨는데, 정작 그걸 알려줄 readiness probe(`/actuator/health/readiness`) 자체가 graceful 단계에선 응답을 못 한다. 쿠버네티스가 probe를 찔러봐도 상태 변화를 제때 못 읽는다. readiness probe 전파만 믿고 무중단을 기대하면 깨진다.

이 probe들은 쿠버네티스 환경이 감지되면 자동 활성화되고, 아니면 `management.endpoint.health.probes.enabled=true`로 켤 수 있다.

## 쿠버네티스에서 진짜로 요청을 안 흘리려면

앞 절의 자기모순이 곧 "graceful shutdown만으로는 부족하다"의 근거다. 공식 문서(Kubernetes Container Lifecycle)가 직접 경고한다. "Spring Boot의 graceful shutdown 기간에만 의존하지 말라."

근본 원인은 종료가 병렬로 일어난다는 데 있다. 파드가 삭제될 때 shutdown hook, 서비스 등록 해제, 로드밸런서에서 인스턴스 제거가 동시에 진행된다. 그래서 이미 종료를 시작한 파드로 트래픽이 잠깐 더 들어오는 창이 생긴다.

해법은 `preStop` 훅으로 sleep을 넣어 그 창을 메우는 것이다.

```yaml file="pod.yaml"
spec:
  terminationGracePeriodSeconds: 45
  containers:
    - name: app
      lifecycle:
        preStop:
          sleep:
            seconds: 10      # K8s 1.32+ 네이티브 sleep
```

쿠버네티스 1.32 미만이라면 `exec`로 푼다.

```yaml file="pod.yaml"
preStop:
  exec:
    command: ["sh", "-c", "sleep 10"]
```

sleep 길이는 "가장 오래 걸리는 in-flight 요청 처리 시간 이상"으로 잡는다. 동작 순서는 이렇다. preStop 훅이 먼저 끝나기를 기다린 뒤에야 컨테이너에 SIGTERM이 전달되고, 그제서야 graceful shutdown이 시작된다. 그 사이에 로드밸런서는 이 파드를 라우팅 대상에서 빼는 작업을 마친다.

타임아웃 정합성도 맞춰야 한다. 쿠버네티스는 SIGTERM 후 `terminationGracePeriodSeconds`(기본 30초)만큼 기다리고, 그 안에 안 죽으면 SIGKILL로 강제 종료한다. `spring.lifecycle.timeout-per-shutdown-phase`를 30초 넘게 키웠다면 `terminationGracePeriodSeconds`도 같이 늘려야 한다. 안 그러면 graceful로 요청을 비우는 도중에 SIGKILL이 날아와서, 정작 지키려던 in-flight 요청이 잘린다.

> [!TIP]
> 부등식 하나로 외우면 된다. `terminationGracePeriodSeconds ≥ preStop sleep + timeout-per-shutdown-phase + 여유`.

## Spring Boot 4.x에서 바뀐 것

4.x로 올릴 계획이라면 세 가지를 알아둬야 한다. 전부 마이그레이션 가이드와 소스로 확인한 내용이다.

모듈이 쪼개졌다. 4.0부터 웹서버 클래스가 기술별 모듈로 이동했다. 3.x의 `org.springframework.boot.web.embedded.tomcat.TomcatWebServer`는 4.x에서 `org.springframework.boot.tomcat.TomcatWebServer`가 된다. 마이그레이션 가이드의 규칙은 "모든 모듈은 `spring-boot-<technology>`, 각 모듈의 루트 패키지는 `org.springframework.boot.<technology>`"다. 임베디드 서버를 직접 다루는 코드가 있다면 import가 깨진다.

Undertow가 빠졌다. 4.0은 Servlet 6.1을 요구하는데 Undertow가 아직 호환되지 않아, 임베디드 서버 지원과 Undertow 스타터가 통째로 제거됐다. 3.x는 임베디드 서버가 4개(Undertow 포함), 4.x는 3개다. graceful shutdown 문서에서 Undertow의 503 동작 설명도 4.1에선 사라졌다.

graceful phase 상수는 값은 같되 위치가 바뀌었다. `WebServerGracefulShutdownLifecycle.SMART_LIFECYCLE_PHASE`는 여전히 `DEFAULT_PHASE - 1024`지만 4.0부터 `@Deprecated(forRemoval = true)`로 마킹됐고, `WebServerApplicationContext.GRACEFUL_SHUTDOWN_PHASE`로 대체됐다. 동작은 동일하다. `timeout-per-shutdown-phase` 기본값 10초는 4.x(Spring Framework 7.x)에서도 유지된다.

## 실제로 동작하는지 확인하는 법

설정만 넣고 "됐겠지" 하면 안 된다. graceful은 켜졌다고 믿었는데 안 켜진 경우가 흔하다. 검증은 의외로 쉽다. 로그가 다 말해준다.

처리 시간이 긴 엔드포인트에 요청을 하나 보내고, 그 요청이 처리되는 동안 프로세스에 SIGTERM을 보낸다(`kill -TERM <pid>`). graceful이 켜져 있으면 로그에 정확히 이렇게 찍힌다.

```text
Commencing graceful shutdown. Waiting for active requests to complete
...
Graceful shutdown complete
```

유예 시간 안에 요청이 안 끝나면 다른 로그가 나온다.

```text
Graceful shutdown aborted with one or more requests still active
```

이 메시지는 콜백 결과가 `IDLE`이 아니라 `REQUESTS_ACTIVE`로 떨어졌다는 뜻이다. `timeout-per-shutdown-phase`가 실제 처리 시간보다 짧다는 신호다. 이 로그가 보이면 타임아웃을 늘리거나, 그렇게 오래 걸리는 요청 자체를 손봐야 한다. 그리고 보낸 요청이 5xx 없이 정상 응답으로 끝나는지 확인한다. 끝나면 drain이 제대로 동작한 것이다.

## 자주 밟는 함정

> [!WARNING]
> - **IDE에서 종료하면 graceful이 안 도는 것처럼 보인다.** IntelliJ의 stop 버튼이 SIGTERM 대신 다른 신호를 보내면 graceful이 트리거되지 않는다. 공식 문서도 경고하는 부분이다. "프로덕션에선 되는데 로컬에선 안 된다"의 흔한 정체다.
> - **`kill -9`는 graceful을 통째로 건너뛴다.** SIGKILL은 JVM이 가로챌 수 없다. shutdown hook도, graceful도 없이 즉사한다. 쿠버네티스의 SIGKILL(grace period 초과 시)도 마찬가지다.
> - **구버전에서 `server.shutdown`을 안 적으면 graceful은 꺼져 있다.** 3.3 이하는 기본값이 `immediate`다.
> - **timeout과 K8s grace period 불일치.** Spring 쪽 유예 시간만 늘리고 `terminationGracePeriodSeconds`를 안 늘리면, 늘린 의미가 없어진다. SIGKILL이 먼저 온다.

## 마무리

graceful shutdown은 체크박스 하나가 아니라 순서의 문제다. 신규 요청을 막고, in-flight를 비우고, 그 다음에 스레드풀과 커넥션 풀을 정리하는 일련의 순서가 phase 값으로 못 박혀 있다. 쿠버네티스에서는 그 순서 앞에 preStop sleep이라는 한 칸이 더 필요하다. 이 두 가지(`server.shutdown=graceful`과 preStop 훅)를 같이 맞추지 않으면, 배포 그래프의 5xx는 사라지지 않는다.
