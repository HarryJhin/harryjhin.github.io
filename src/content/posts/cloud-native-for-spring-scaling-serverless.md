---
author: 주진현
pubDatetime: 2026-06-07T09:00:00+09:00
title: "트래픽은 출렁이는데 파드 수는 고정: KEDA와 Knative (Spring 개발자를 위한 클라우드 표준 7)"
featured: false
section: cloud-native
series:
  slug: cloud-native-for-spring
  order: 7
tags:
  - kubernetes
  - keda
  - knative
  - jvm
  - serverless
  - cloud-native
description: HPA는 Kafka 컨슈머 랙을 못 본다. KEDA는 그 랙을 신호 삼아 파드를 0에서 늘리고, Knative는 트래픽이 없으면 0으로 줄인다. 둘 다 비용을 아끼지만 JVM에게는 콜드 스타트라는 청구서를 내민다. GraalVM 네이티브, CRaC, AOT 캐시로 그 청구서를 줄이는 길까지 정면으로 본다.
faq:
  - question: "Kubernetes에서 이벤트 기반 오토스케일링(KEDA)은 어떻게 동작하나?"
    answer: "KEDA는 HPA를 대체하지 않고 같이 쓰는 이벤트 기반 오토스케일러다. CPU·메모리만 보던 HPA에 Kafka 컨슈머 랙 같은 외부 이벤트 지표를 공급한다. 0에서 1로 깨우는 스케일은 keda-operator가 직접 처리하고, 1에서 N으로 늘리는 스케일은 HPA에 맡긴다. ScaledObject CRD로 워크로드와 이벤트 소스를 연결하고, minReplicaCount를 0으로 두면 메시지가 없을 때 파드도 0개로 줄어든다."
  - question: "Knative scale-to-zero란 무엇인가?"
    answer: "Knative Serving이 요청 동시성이나 RPS를 보고 오토스케일하다가, 트래픽이 없으면 파드를 0개까지 줄이는 기능이다. 다음 요청이 오면 파드를 새로 띄워 처리하는데, 이 순간을 Knative 문서도 콜드 스타트라 부른다. 트래픽이 없는 동안 컴퓨팅 비용이 전혀 들지 않는다는 게 장점이지만, 대신 첫 요청은 새 파드가 뜨는 시간만큼 늦게 응답받는다."
  - question: "JVM 콜드 스타트를 줄이는 법(GraalVM, CRaC, AOT)은?"
    answer: "네 갈래가 있다. GraalVM 네이티브 이미지는 AOT 컴파일로 수백 ms 만에 기동하고, CRaC는 워밍업된 JVM을 체크포인트했다가 그대로 복원한다. JDK 24부터의 AOT 캐시(Project Leyden)는 클래스 로딩과 링킹을 사전 처리해두고, Spring AOT 처리는 빌드 시점에 최적화된 코드를 생성한다. 넷 다 배타적이지 않고, 전환 비용과 줄어드는 기동 시간의 트레이드오프가 각각 다르다."
  - question: "Spring Boot가 서버리스(KEDA·Knative) 환경에 맞나?"
    answer: "맞는다. 다만 콜드 스타트 대응이 전제다. 일반 JVM으로 띄운 Spring Boot는 기동에 수 초가 걸려 scale-to-zero의 첫 요청 지연이 그대로 사용자에게 드러난다. GraalVM 네이티브 이미지나 CRaC, JDK 24 이상의 AOT 캐시로 기동 시간을 줄이면 그 지연도 함께 줄어든다. KEDA의 Kafka 랙 기반 스케일은 원래 JVM 기동 시간과 무관하게 배치성 워크로드에서 잘 맞는다."
---

지난 편 끝에서 걸린 게 트래픽 그래프였다. 새벽 세 시엔 파드 열 개가 거의 놀고 있었다. 점심 피크가 오면 그 열 개로 요청이 밀렸다. 파드 수는 어제도 오늘도 똑같이 열 개였다. mTLS도 재시도도 이제 인프라가 대신 처리하는데, 파드 개수만은 여전히 사람이 정해둔 숫자에 묶여 있었다.

HPA를 켜면 되는 줄 알았다. CPU 사용률을 보고 파드를 늘리는 그 오토스케일러 말이다. 그런데 우리 주문 컨슈머는 CPU를 거의 안 먹는다. Kafka 토픽에 메시지가 몇만 건 쌓여도 컨슈머 파드는 그저 폴링만 하느라 그래프는 평온하다. HPA 지표로는 뒤에서 뭐가 밀리고 있는지 알 도리가 없었다. 큐가 밀리는 신호는 CPU가 아니라 다른 데서 읽어야 했다.

그리고 반대편엔 더 근본적인 긴장이 있었다. 트래픽이 없을 때 파드를 0으로 줄여 비용을 아끼는 scale-to-zero다. 매력적이다. 그런데 JVM에겐 이게 함정이다. 0에서 다시 뜰 때, JVM 기동 시간이 그대로 사용자가 기다리는 시간이 되기 때문이다. 이 글은 그 두 축, KEDA와 Knative를 JVM의 콜드 스타트 문제와 함께 본다.

## KEDA: 이벤트로 0에서 늘린다

KEDA는 이벤트 기반 오토스케일러다. 중요한 오해부터 풀면, **KEDA는 HPA를 대체하지 않는다. 같이 쓴다.** CPU·메모리만 보던 HPA에 외부 이벤트 지표를 외부 메트릭으로 공급하는 역할이다.

분업이 명확하다. 0→1과 1→0 스케일은 `keda-operator`가 직접 처리하고, 1→N과 N→1은 HPA에 위임한다. 즉 "놀고 있던 워크로드를 깨우는" 0↔1 구간이 KEDA의 몫이고, 깨어난 다음의 증감은 기존 HPA가 한다.

연결은 `ScaledObject` CRD로 한다. 워크로드(Deployment)와 이벤트 소스(스케일러)를 잇는다. JVM 개발자에게 가장 와닿는 건 Kafka 스케일러다. **컨슈머 랙**(consumer lag)으로 스케일한다.

```yaml file="scaledobject.yaml"
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: order-consumer
spec:
  scaleTargetRef:
    name: order-consumer # Spring Kafka 컨슈머 Deployment
  minReplicaCount: 0 # 메시지 없으면 0으로
  maxReplicaCount: 10
  triggers:
    - type: kafka
      metadata:
        bootstrapServers: kafka:9092
        consumerGroup: order-group
        topic: orders
        lagThreshold: "100" # 파티션당 랙 100 넘으면 늘림
```

`@KafkaListener`로 짠 Spring Kafka 컨슈머가 평소엔 0개로 떠 있다가, 토픽에 메시지가 쌓여 랙이 임계치를 넘으면 파드가 늘어난다. 처리가 끝나 랙이 빠지면 다시 0으로 줄어든다. 배치성 워크로드의 비용 산수가 달라진다. KEDA는 2023년 8월에 CNCF를 졸업했다.

## Knative: 트래픽으로 0까지 줄인다

Knative는 HTTP 트래픽 기준의 서버리스다. Serving이 요청 동시성이나 RPS를 보고 오토스케일하고, 트래픽이 없으면 **scale-to-zero**로 파드를 0까지 줄인다.

```yaml file="knative-service.yaml"
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: report-api
spec:
  template:
    spec:
      containers:
        - image: registry.example.com/report-api:1.0.0
```

이러면 `report-api`는 요청이 없을 때 0개로 떠 있다가, 요청이 오면 파드를 띄워 처리한다. 새 파드를 띄워 요청을 처리하는 이 순간을 Knative 문서도 **콜드 스타트**라고 부른다. Knative는 2025년 10월에 CNCF를 졸업했다.

그리고 여기가 JVM의 약점이 그대로 드러나는 자리다.

## JVM 콜드 스타트를 줄이는 네 가지 방법

scale-to-zero에서 콜드 스타트 비용은 곧 첫 요청 지연이다. Go 바이너리는 수십 ms면 뜬다. JVM은 다르다. 클래스 로딩, 빈 초기화, 그리고 JIT가 데워지기 전까지의 인터프리터 실행. 전통적인 Spring Boot 앱은 기동에 수 초가 걸린다. scale-to-zero를 켜면 그 수 초를 매번 첫 사용자가 기다린다.

그래서 JVM 진영은 이 문제에 답을 여러 개 만들어 왔다. 네 갈래다.

**1. GraalVM 네이티브 이미지.** Spring Boot의 AOT 지원으로, 앱을 독립 실행 네이티브 바이너리로 빌드한다. "네이티브 이미지는 JVM 대비 메모리가 작고 더 빨리 뜬다"고 Spring 문서가 말한다. 수백 ms 기동이 가능해진다. 대신 닫힌 세계(closed-world) 가정 때문에 리플렉션·리소스에 reachability 힌트가 필요하고, 빌드 시간이 길다. Spring AOT가 이 힌트를 자동 생성해주지만, 전환엔 손이 든다.

**2. CRaC(Coordinated Restore at Checkpoint).** OpenJDK 프로젝트다. CRIU 기반으로, **데워진 JVM을 통째로 체크포인트했다가 복원한다.** 다시 부팅하는 게 아니라 멈춰둔 프로세스 이미지를 되살린다. Spring Boot는 3.2부터 지원한다. 두 가지 방식이 있다.

- `-Dspring.context.checkpoint=onRefresh`: 컨텍스트 refresh 시점에 자동 체크포인트. 기동을 앞당기지만 완전히 데워진 상태는 아니다.
- 실행 중인 JVM에 `jcmd`로 on-demand 체크포인트: 충분히 워밍업한 뒤 찍으면, 복원된 JVM이 곧바로 데워진 성능을 낸다.

**3. AOT 캐시(Project Leyden).** 최신 JDK의 흐름이다. JEP 483이 JDK 24에 들어오면서, 로딩·링킹된 클래스를 캐시해 재사용한다. JEP 483이 든 Spring PetClinic 3.2.0 측정에서 기동이 4.486초(JDK 23)에서 2.604초(JDK 24, AOT 캐시 사용)로, 약 42% 줄었다. JDK 25는 여기에 단일 단계 명령(`-XX:AOTCacheOutput`) 같은 사용성 개선을 더했다. GraalVM의 닫힌 세계 제약 없이 일반 JVM에서 기동을 줄이는 길이라 매력적이다.

**4. Spring AOT 처리.** 빌드 시점에 코드를 분석해 최적화된 버전을 생성한다. 위의 네이티브 이미지가 기대는 토대이면서, 일반 JVM 실행에서도 시작을 거든다.

이 넷은 배타적이지 않다. GraalVM이 가장 공격적이지만 전환 비용이 크고, AOT 캐시는 가장 점진적이라 JDK만 올려도 일부 효과를 본다. CRaC는 워밍업까지 보존한다는 점에서 독특하다. 어느 걸 고를지는 "콜드 스타트를 얼마나 줄여야 하는가"와 "전환에 얼마를 쓸 수 있는가"의 함수다.

> [!NOTE]
> 7부에서 콜드 스타트가 이렇게 중요한 건, 이게 JVM이 클라우드 네이티브와 부딪히는 가장 날카로운 지점이라서다. 1부에서 "오래 띄워두는 시대에 최적화된 런타임을 수시로 죽였다 살리는 환경에 넣는 일"이라고 했는데, scale-to-zero가 그 충돌을 가장 극적으로 드러낸다. 그래서 JVM 생태계가 가장 활발히 답을 내놓는 영역이기도 하다.

## 정리

스케일링에는 두 방향이 있다. KEDA는 Kafka 랙 같은 이벤트로 0에서 늘리고(Spring Kafka 컨슈머와 잘 맞는다), Knative는 트래픽이 없으면 0으로 줄인다. 둘 다 비용을 아끼지만, scale-to-zero는 JVM의 콜드 스타트를 첫 요청 지연으로 노출한다.

그 지연을 줄이는 길이 GraalVM 네이티브, CRaC, AOT 캐시, Spring AOT다. 무거운 런타임을 가볍게 깨우는 이 도구들이, JVM을 클라우드 네이티브에서 쓸 만하게 만드는 핵심 기술이다.

## 다음 편

이제 트래픽이 출렁여도 파드 수가 알아서 따라온다. 새벽엔 컨슈머가 0으로 잦아들고, 피크 때는 랙을 보고 스스로 늘어난다. Knative 서비스는 요청이 없으면 조용히 사라졌다가 필요할 때 다시 뜬다. 스케일은 이제 사람 손을 안 탄다.

그런데 배포 명령어를 다시 들여다보다 걸렸다. ScaledObject를 고치든, Knative Service의 이미지 태그를 올리든, 결국 누군가 터미널을 열고 `helm upgrade --set image.tag=1.2.4` 같은 명령을 손으로 친다. 오늘은 내가 쳤고 어제는 다른 팀원이 쳤다. 누가 언제 뭘 배포했는지는 슬랙 로그를 뒤져야 알 수 있다. 스케일은 자동이 됐다. 그런데 이 모든 배포를 아직 사람이 손으로 `helm upgrade`를 친다.

다음 편은 그 손을 걷어내는 GitOps다.

## 참고

- [KEDA Concepts](https://keda.sh/docs/latest/concepts/)
- [Knative Autoscaling: Scale to Zero](https://knative.dev/docs/serving/autoscaling/scale-to-zero/)
- [GraalVM Native Images · Spring Boot Reference](https://docs.spring.io/spring-boot/reference/packaging/native-image/introducing-graalvm-native-images.html)
- [Checkpoint and Restore (CRaC) · Spring Boot Reference](https://docs.spring.io/spring-boot/reference/packaging/checkpoint-restore.html)
- [JEP 483: Ahead-of-Time Class Loading & Linking](https://openjdk.org/jeps/483)
