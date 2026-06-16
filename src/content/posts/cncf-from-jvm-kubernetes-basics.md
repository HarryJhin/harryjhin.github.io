---
author: 주진현
pubDatetime: 2026-06-16T09:10:00+09:00
title: "Kubernetes 기초: Spring Boot 컨테이너를 띄운다는 것 (JVM에서 본 클라우드 네이티브 2)"
featured: false
section: cloud-native
series:
  slug: cncf-from-jvm
  order: 2
tags:
  - kubernetes
  - spring-boot
  - jvm
  - actuator
  - cloud-native
description: 컨테이너에 메모리 limit 1Gi를 줬는데 JVM이 OOMKilled로 죽는다. 힙은 그 안에 들어가는데 왜. Pod·probe·리소스 limit을 Spring Boot Actuator와 container-aware JVM 입장에서 따라가며, 클라우드 네이티브로 넘어온 JVM이 가장 먼저 부딪히는 사고를 푼다.
faq:
  - question: "컨테이너 메모리 limit 안에 JVM 힙이 들어가는데도 왜 OOMKilled가 나나?"
    answer: "Kubernetes 메모리 limit은 컨테이너 전체 RSS(실제 물리 메모리)에 걸리는데, -Xmx나 MaxRAMPercentage는 힙만 제한하기 때문이다. 메타스페이스, 스레드 스택, JIT 코드 캐시, 다이렉트 버퍼 같은 비힙 메모리가 힙 위에 더 쌓이고, 그 합이 limit을 넘으면 커널이 컨테이너를 OOM kill(exit 137)한다. 힙만 보고 limit을 잡으면 사고가 난다."
  - question: "Spring Boot Actuator로 Kubernetes liveness/readiness probe를 어떻게 연결하나?"
    answer: "Actuator는 /actuator/health/liveness와 /actuator/health/readiness를 health group으로 노출한다. Kubernetes 환경에서 실행되면 이 그룹이 자동 활성화되고, management.endpoint.health.probes.enabled로 켜고 끌 수 있다. liveness는 컨텍스트가 refresh되면 live, readiness는 ApplicationRunner·CommandLineRunner까지 실행되면 ready가 된다."
  - question: "Kubernetes liveness와 readiness probe의 차이는?"
    answer: "liveness probe가 실패하면 kubelet이 컨테이너를 죽이고 재시작하고, readiness probe가 실패하면 Service 엔드포인트에서만 빠진다. liveness는 데드락처럼 재시작 외에 답이 없는 상태를, readiness는 트래픽을 잠깐 못 받는 상태를 위한 것이다. 그래서 외부 의존성 체크는 readiness에 둔다."
  - question: "컨테이너에서 JVM 힙은 -Xmx로 박나, MaxRAMPercentage로 두나?"
    answer: "컨테이너에서는 -XX:MaxRAMPercentage 같은 비율 지정이 유리하다. JVM은 UseContainerSupport(현재 JDK에서 Linux 기본 활성)로 cgroup 메모리 limit을 읽는데, 비율로 두면 limit을 바꿔도 힙이 따라 스케일된다. 절댓값 -Xmx는 limit과 따로 놀아서 둘을 매번 같이 맞춰야 한다."
---

1부 끝에서 예고한 첫 사고부터 풀자. Spring Boot 앱을 컨테이너로 만들어 올렸다. 메모리는 넉넉하게 1Gi를 줬다. `-Xmx`는 안 박았으니 JVM이 알아서 하겠거니 했다. 그런데 부하가 좀 붙으니 파드가 죽는다. `kubectl get pod`을 보면 상태가 이렇다.

```text
NAME                     READY   STATUS      RESTARTS   AGE
my-service-7d9f8-abcde   0/1     OOMKilled   3          7m
```

`OOMKilled`. 메모리가 모자라서 커널이 죽였다는 뜻이다. 이상하다. 힙을 1Gi 안에서 쓰는데 왜? 이 질문에 답하려면 Kubernetes가 컨테이너를 어떻게 다루는지, 그리고 JVM이 컨테이너 안에서 자기 한계를 어떻게 인식하는지를 같이 봐야 한다. 그게 이 글이다.

## Pod, Deployment, Service: 세 단어부터

JVM 개발자가 Kubernetes에서 외울 오브젝트는 처음엔 셋이면 된다.

- **Pod**: 컨테이너 한 개(혹은 몇 개)를 묶은 최소 배포 단위. 내 Spring Boot 컨테이너가 사는 집이다.
- **Deployment**: Pod를 몇 개 띄우고, 죽으면 다시 살리고, 새 버전으로 굴려서 교체할지를 선언하는 상위 컨트롤러. 실무에서 직접 만지는 건 거의 Deployment다.
- **Service**: 수시로 죽었다 살아나는 Pod들 앞에 고정 주소를 달아주는 로드밸런서. Pod IP는 바뀌어도 Service 주소는 안 바뀐다.

이 중 Service가 트래픽을 어느 Pod로 보낼지 정할 때 쓰는 신호가 다음 주제인 probe다.

## probe 세 가지, 그리고 Actuator

Kubernetes는 컨테이너 안의 앱이 살아있는지, 트래픽 받을 준비가 됐는지를 스스로 알지 못한다. 프로세스가 떠 있다고 앱이 정상인 건 아니다. 데드락에 걸려도 프로세스는 살아있다. 그래서 앱에게 직접 물어보는 장치가 probe다. 세 종류가 있고, 실패했을 때 Kubernetes의 반응이 각각 다르다.

- **liveness probe**: "너 살아있냐?" 실패하면 **kubelet이 컨테이너를 죽이고 재시작한다.** 데드락처럼 재시작 말고는 답이 없는 상태를 위한 것이다.
- **readiness probe**: "트래픽 받을 준비 됐냐?" 실패하면 **Service 엔드포인트에서 빠진다.** 죽이지는 않는다. 잠깐 바빠서 못 받을 뿐인 상태를 위한 것이다.
- **startup probe**: "다 떴냐?" 이게 성공하기 전까지는 liveness·readiness가 **시작되지 않는다.** `failureThreshold × periodSeconds`만큼 기동 시간을 벌어준다.

세 번째가 JVM에게 특히 중요하다. JVM 앱은 기동이 느리다. 클래스 로딩, 빈 초기화, 커넥션 풀 준비까지 수 초에서 수십 초가 걸린다. startup probe 없이 liveness만 걸어두면, 아직 뜨는 중인 앱을 Kubernetes가 "안 살아있다"고 판단해 죽인다. 그리고 다시 뜨는 중에 또 죽인다. 부팅 루프다. startup probe로 기동 예산을 충분히 준 다음에야 liveness가 넘겨받게 해야 한다.

이 probe들을 Spring Boot는 Actuator로 바로 노출한다. 직접 health 엔드포인트를 짤 필요가 없다.

```yaml file="application.yml"
management:
  endpoint:
    health:
      probes:
        enabled: true # Kubernetes 환경이면 자동 활성, 명시도 가능
      show-details: always
  health:
    livenessstate:
      enabled: true
    readinessstate:
      enabled: true
```

이러면 두 엔드포인트가 생긴다.

- `/actuator/health/liveness`
- `/actuator/health/readiness`

Spring Boot는 이 둘을 `ApplicationAvailability`라는 내부 상태에서 끌어온다. **liveness는 애플리케이션 컨텍스트가 refresh되는 순간 "live"가 되고, readiness는 `ApplicationRunner`·`CommandLineRunner`까지 다 돌고 나면 "ready"가 된다.** 의미가 명확하다. 앱이 자기 내부 상태로 일할 수 있으면 live, 외부 요청까지 받을 준비가 끝나면 ready다.

Deployment YAML에서는 이렇게 가리킨다.

```yaml file="deployment.yaml"
livenessProbe:
  httpGet:
    path: /actuator/health/liveness
    port: 8080
  failureThreshold: 3
  periodSeconds: 10
readinessProbe:
  httpGet:
    path: /actuator/health/readiness
    port: 8080
  failureThreshold: 3
  periodSeconds: 10
startupProbe:
  httpGet:
    path: /actuator/health/readiness
    port: 8080
  failureThreshold: 30
  periodSeconds: 5 # 30 × 5 = 최대 150초 기동 허용
```

여기서 흔한 실수 하나. **liveness probe가 외부 시스템(DB, 다른 서비스) 상태에 의존하면 안 된다.** Spring 문서가 명시적으로 경고하는 지점이다. DB가 잠깐 끊겼다고 liveness가 실패하면 Kubernetes는 앱을 재시작한다. 재시작해도 DB는 여전히 끊겨 있으니 또 죽는다. DB 장애가 앱 재시작 폭풍으로 번진다. 외부 의존성 체크는 readiness에 둬야 한다. 트래픽만 잠깐 안 받으면 되니까.

## 왜 컨테이너 limit 안의 JVM이 OOMKilled되나

OOMKilled의 원인은 메모리 limit이 컨테이너 전체 RSS에 걸리는데 `-Xmx`는 힙만 제한하기 때문이다. 둘 사이에 빠진 비힙 메모리가 limit을 넘기면 커널이 컨테이너를 죽인다. 이제 서두의 사고로 돌아간다. 먼저 리소스 선언부터.

```yaml file="deployment.yaml"
resources:
  requests:
    memory: "512Mi"
    cpu: "250m"
  limits:
    memory: "1Gi"
    cpu: "1000m"
```

`requests`와 `limits`는 역할이 다르다.

- **requests**: 스케줄러가 "이 Pod를 어느 노드에 놓을까"를 정할 때 보는 값. 예약이다.
- **limits**: kubelet이 "이 컨테이너가 이 이상 못 쓰게" 강제하는 상한. 메모리 limit은 커널이 OOM kill로 강제하고, CPU limit은 스로틀링으로 강제한다.

핵심은 메모리 limit이 **컨테이너 전체가 실제로 점유한 물리 메모리(RSS)**에 걸린다는 점이다. JVM 힙이 아니라. 그런데 `-Xmx`나 `MaxRAMPercentage`는 **힙만** 제한한다. 둘 사이에 비힙 메모리가 통째로 빠져 있다.

JVM이 실제로 먹는 메모리는 힙만이 아니다.

- 힙 (객체)
- 메타스페이스 (클래스 메타데이터)
- 스레드 스택 (스레드 하나당 약 1MB, 톰캣 스레드 수백 개면 수백 MB)
- JIT 코드 캐시
- GC가 쓰는 자체 자료구조
- 다이렉트 바이트 버퍼, 네이티브 라이브러리

이걸 다 합친 게 RSS다. 힙을 limit의 90%로 잡으면, 나머지 비힙이 들어갈 자리가 10%밖에 안 남는다. 부하가 붙어 스레드가 늘고 메타스페이스가 차는 순간 RSS가 1Gi를 넘고, 커널이 컨테이너를 죽인다. 그게 `OOMKilled`, 종료 코드 137이다.

힙은 limit 안에 있었다. 맞다. 그런데 죽었다. 힙만 봤기 때문이다.

## container-aware JVM: cgroup 한계를 읽는 JVM

해법의 절반은 JVM이 컨테이너 한계를 제대로 읽게 하는 것이다. 다행히 요즘 JVM은 이걸 알아서 한다.

현재 JDK는 Linux에서 **`UseContainerSupport`가 기본으로 켜져 있다.** JVM이 cgroup에 걸린 메모리·CPU 한계를 읽어서, 호스트 전체가 아니라 컨테이너에 할당된 양을 기준으로 자원을 잡는다. JDK 21 기준 `java` 매뉴얼이 이 동작을 명시한다. 컨테이너 인식이 어떻게 도는지 보고 싶으면 이 옵션이 도움이 된다.

```text
-Xlog:os+container=trace
```

그 위에서 힙을 잡는 방식이 갈린다.

```text
# 절댓값: limit을 바꿀 때마다 이 숫자도 같이 바꿔야 함
-Xmx768m

# 비율: limit이 바뀌면 힙이 따라 스케일됨
-XX:MaxRAMPercentage=70.0 -XX:InitialRAMPercentage=70.0
```

컨테이너에서는 비율 쪽이 운영하기 편하다. `MaxRAMPercentage`는 컨테이너에 할당된 메모리의 몇 %를 힙 최대치로 쓸지를 정한다. limit을 1Gi에서 2Gi로 올려도 매니페스트의 메모리 값만 고치면 힙이 알아서 따라온다. `-Xmx`는 두 군데(매니페스트와 JVM 옵션)를 매번 동기화해야 한다.

비율을 얼마로 둘지는 비힙이 얼마나 필요한가에 달렸다. 스레드 많고 클래스 많은 전형적인 웹 앱이라면 힙을 limit의 70~75% 선에 두고, 나머지를 비힙에 양보하는 데서 시작해 실제 RSS를 보며 조정하는 게 보통이다. 정답 숫자는 없다. 앱마다 비힙 프로파일이 다르기 때문이다. 그래서 다음 단계가 "추측 말고 측정"이고, 그 측정 도구가 5부·6부의 관측성이다.

> [!TIP]
> JDK 버전도 점검 대상이다. 2025년 9월에 JDK 25가 LTS로 나왔고, 그 전 LTS는 JDK 21이다. 오래된 JDK일수록 컨테이너 인식이 부실하다. 클라우드 네이티브로 갈 거라면 베이스 이미지의 JDK부터 올리는 게 첫 단추다.

## 정리

OOMKilled 사고의 정체는 단순하다. Kubernetes는 컨테이너 전체 메모리를 보는데, 나는 힙만 봤다. 그 틈에 비힙이 끼어서 limit을 넘겼다.

그래서 컨테이너의 JVM은 두 가지를 같이 챙겨야 한다. JVM이 cgroup 한계를 읽게 하고(`UseContainerSupport`, 비율 기반 힙), 힙과 비힙을 합친 RSS가 limit 안에 들어오도록 여유를 남기는 것. 이 여유를 얼마나 줄지는 결국 관측해서 정한다.

다음 글은 이 컨테이너 이미지를 어떻게 만드느냐다. `Dockerfile`을 손으로 쓰는 것 말고, Jib과 Buildpacks로 Spring 빌드에서 바로 OCI 이미지를 뽑고 Helm으로 패키징하는 길로 간다.

## 참고

- [Configure Liveness, Readiness and Startup Probes — Kubernetes](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/)
- [Resource Management for Pods and Containers — Kubernetes](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/)
- [Kubernetes Probes — Spring Boot Reference](https://docs.spring.io/spring-boot/reference/actuator/endpoints.html)
- [Application Availability — Spring Boot Reference](https://docs.spring.io/spring-boot/reference/features/spring-application.html)
- [java Command (JDK 21) — Oracle](https://docs.oracle.com/en/java/javase/21/docs/specs/man/java.html)
