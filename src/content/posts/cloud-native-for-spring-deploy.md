---
author: 주진현
pubDatetime: 2026-06-02T09:00:00+09:00
title: "로컬에선 되던 앱을 어떻게 올리지: 이미지·Kubernetes·리소스 (Spring 개발자를 위한 클라우드 표준 2)"
featured: false
section: cloud-native
series:
  slug: cloud-native-for-spring
  order: 2
tags:
  - kubernetes
  - spring-boot
  - jvm
  - actuator
  - cloud-native
  - jib
  - buildpacks
  - helm
description: 로컬에서 bootRun은 되는데 이걸 클러스터에 어떻게 올리나. jar를 Jib·Buildpacks로 이미지로 굽고, Helm과 ConfigMap으로 패키징하고, 파드로 띄우는 첫 관문을 따라간다. 그리고 컨테이너 메모리 limit과 JVM 힙이 어긋나 OOMKilled 나는 첫 사고까지 한 편에서 푼다.
faq:
  - question: "Spring Boot 앱을 Dockerfile 없이 컨테이너 이미지로 만드는 법은?"
    answer: "Jib과 Cloud Native Buildpacks 두 길이 있다. Jib(jib-gradle-plugin·jib-maven-plugin)은 Docker 데몬 없이 Gradle·Maven 빌드에서 바로 OCI 이미지를 만들고 레지스트리에 직접 푸시하며 의존성과 클래스를 다른 레이어로 나눈다. Spring Boot 내장 bootBuildImage(Gradle)·build-image(Maven)는 Paketo Buildpacks로 이미지를 굽지만 Docker 데몬이 필요하다. 둘 다 Dockerfile을 손으로 쓰지 않는다."
  - question: "컨테이너 메모리 limit을 걸었는데 JVM이 OOM으로 죽는 이유는?"
    answer: "Kubernetes 메모리 limit은 컨테이너 전체 RSS에 걸리는데 -Xmx나 MaxRAMPercentage는 JVM 힙만 제한하기 때문이다. 메타스페이스, 스레드 스택, JIT 코드 캐시, 다이렉트 버퍼 같은 비힙 메모리가 힙 위에 더 쌓이고, 그 합이 limit을 넘는 순간 커널이 컨테이너를 OOM kill(종료 코드 137)한다. 힙만 보고 limit을 잡으면 사고가 난다."
  - question: "Spring Boot 레이어드 jar가 뭐고 왜 쓰나?"
    answer: "Docker 레이어 캐시를 살리려고 쓴다. Spring Boot는 실행 가능한 jar를 dependencies, spring-boot-loader, snapshot-dependencies, application 네 레이어로 나누고 순서를 layers.idx에 적는다. 잘 안 바뀌는 라이브러리를 아래층, 자주 바뀌는 애플리케이션 코드를 맨 위층에 둬서, 코드만 고친 배포에서 무거운 의존성 레이어는 캐시에서 재사용하고 바뀐 레이어만 다시 만든다."
  - question: "Kubernetes probe와 Spring Boot Actuator health를 어떻게 연결하나?"
    answer: "Spring Boot Actuator가 /actuator/health/liveness와 /actuator/health/readiness를 health group으로 노출하고, Deployment의 livenessProbe·readinessProbe·startupProbe가 이 경로를 httpGet으로 가리킨다. Kubernetes 환경에서 실행되면 이 그룹이 자동 활성화되며 management.endpoint.health.probes.enabled로 켜고 끈다. liveness는 애플리케이션 컨텍스트가 refresh되면 live, readiness는 ApplicationRunner·CommandLineRunner까지 실행되면 ready가 되고, 외부 의존성 체크는 readiness에만 두는 것이 안전하다."
---

1편에서 지도를 그렸다. 그런데 지도만 봐서는 아무 일도 안 일어난다. 로컬에서 `./gradlew bootRun`은 잘 돈다. 문제는 이 앱을 클러스터에 어떻게 올리느냐다. jar 하나 만들어서 넘기면 끝일 줄 알았는데, 그 jar가 파드로 떠서 요청을 받기까지 사이에 낯선 단계가 몇 겹 끼어 있다. 이미지를 굽고, 매니페스트를 쓰고, 설정을 밖으로 빼고, 그러고 나서야 파드가 뜬다. 그리고 뜨자마자 OOM으로 죽는 첫 사고가 기다린다.

이 편은 그 "올리는" 경로를 순서대로 따라간다. jar에서 이미지로, 이미지에서 패키징으로, 패키징에서 배포로. 그리고 마지막에 메모리 limit과 JVM 힙이 어긋나는 첫 사고를 푼다.

## jar를 이미지로: Dockerfile은 건너뛴다

많은 JVM 개발자가 여기서 `Dockerfile`부터 손으로 쓴다. `FROM eclipse-temurin`, `COPY app.jar`, `ENTRYPOINT [...]`. 돌긴 돈다. 그런데 이건 Java 빌드 도구가 이미 아는 걸 Docker에게 다시 가르치는 일이다. JVM 생태계에는 Dockerfile을 건너뛰는 길이 둘 있다. Jib과 Cloud Native Buildpacks다. 둘 다 빌드 산출물에서 바로 OCI 이미지를 만든다. 성격이 달라서 같이 보면 선택이 쉬워진다.

### Jib: 데몬 없이 만든다

Jib은 Google이 만든 빌드 플러그인이다. 핵심 한 줄은 이것이다. Docker 데몬 없이 Java 애플리케이션의 OCI 이미지를 만든다. CI 파이프라인에서 Docker-in-Docker를 띄우거나 데몬 소켓을 마운트하는 번거로움이 사라진다. Jib은 레지스트리와 직접 통신해서 이미지를 푸시하니, 빌드 머신에 Docker가 없어도 된다.

레이어링도 알아서 한다. Jib은 의존성과 클래스를 분리해서 여러 레이어로 나눈다. 라이브러리는 잘 안 바뀌고 내 코드는 자주 바뀌니까, 코드만 고쳤을 때 의존성 레이어는 그대로 재사용된다.

```kotlin file="build.gradle.kts"
plugins {
  id("com.google.cloud.tools.jib") version "3.5.3"
}

jib {
  to {
    image = "registry.example.com/my-service:${project.version}"
  }
}
```

```bash
# 레지스트리로 바로 푸시 (데몬 불필요)
./gradlew jib

# 로컬 Docker 데몬으로 빌드 (있을 때)
./gradlew jibDockerBuild
```

Maven이면 `jib-maven-plugin`으로 같은 일을 한다(`jib:build`, `jib:dockerBuild`). Gradle 플러그인과 Maven 플러그인은 버전을 따로 매기니 각자 최신을 확인하는 게 안전하다.

### Buildpacks: Spring Boot가 기본 제공하는 길

다른 길은 Spring Boot에 이미 들어 있다. `bootBuildImage`(Gradle)와 `build-image`(Maven)다. 이건 Cloud Native Buildpacks(CNB)로 이미지를 만든다.

```bash
./gradlew bootBuildImage
```

기본 빌더는 Paketo buildpacks(`paketobuildpacks/builder-noble-java-tiny`)다. JDK 선택, 레이어 구성, 비root 사용자 실행 같은 걸 빌드팩이 알아서 처리한다. Jib과 결정적으로 갈리는 지점은 하나다. Spring 문서가 명시하듯 `bootBuildImage`는 Docker 데몬이 필요하다. 그래서 선택은 대략 이렇게 갈린다.

- 데몬 없는 CI에서 가볍게, 레지스트리 직결이면 Jib
- 빌드팩 생태계(보안 패치 자동 반영, OS 레이어 관리)를 그대로 쓰고 데몬이 있으면 Buildpacks

둘 다 Dockerfile을 안 쓴다는 공통점이 더 크다. `Dockerfile`을 손으로 관리하는 건 이 둘이 안 되는 특수한 경우로 미뤄도 된다.

### 레이어드 jar: 캐시를 살리는 구조

Jib이든 Buildpacks든 바닥에 깔린 아이디어는 같다. Spring Boot의 레이어드 jar다. Spring Boot는 실행 가능한 jar를 통짜로 두지 않고 네 레이어로 나눈다. jar 안의 `layers.idx`가 이 순서를 정의한다.

1. `dependencies`: 정식 릴리스 의존성
2. `spring-boot-loader`: 부트 로더 코드
3. `snapshot-dependencies`: 스냅샷 의존성
4. `application`: 내 애플리케이션 클래스와 리소스

순서가 핵심이다. 변경 가능성이 낮은 것부터 아래에 깔린다. 라이브러리는 릴리스 사이에 거의 안 바뀌니 아래층, 내 코드는 매 빌드 바뀌니 맨 위층. Docker는 바뀐 레이어와 그 위만 다시 만들고 아래는 캐시에서 가져온다. 코드 한 줄 고친 배포에서 수백 MB 의존성을 매번 다시 푸시하지 않는다. `Dockerfile`을 손으로 쓰면 이 레이어 분리를 직접 설계해야 하는데, Jib과 Buildpacks는 공짜로 준다.

## Helm으로 패키징하고 설정을 밖으로 뺀다

이미지가 생겼다. 이제 Kubernetes에 올릴 차례인데, 그 전에 매니페스트를 어떻게 관리할지부터 정해야 한다. 뒤에서 볼 Deployment, Service, probe, ConfigMap을 환경마다(dev, staging, prod) 복붙하면 금세 관리가 안 된다. 이미지 태그 하나 바꾸려고 YAML 네 군데를 고치게 된다.

Helm이 이걸 패키징한다. CNCF Graduated 프로젝트이고, Kubernetes 매니페스트의 사실상 패키지 매니저다.

> [!NOTE]
> 버전 주의. 2025년 11월에 Helm 4가 나왔다. 6년 만의 첫 메이저 버전이고, 2026년 6월 현재 stable 라인은 4.x다. Helm 3도 별도 라인으로 유지보수된다. 오래된 문서나 블로그가 "Helm 3" 기준인 경우가 많으니, 새로 시작한다면 4.x를 기준으로 잡자.

차트(chart)는 연관된 Kubernetes 리소스 묶음을 기술하는 파일들의 집합이다. 구조는 이렇다.

```text
my-service/
├── Chart.yaml      # 차트 메타데이터 (이름, 버전)
├── values.yaml     # 기본 설정값
├── templates/      # values와 합쳐져 매니페스트가 되는 템플릿
│   ├── deployment.yaml
│   ├── service.yaml
│   └── configmap.yaml
└── charts/         # 의존 차트
```

`templates/`의 Deployment는 값을 직접 박지 않고 `values.yaml`에서 끌어온다.

```yaml file="templates/deployment.yaml"
spec:
  replicas: {{ .Values.replicaCount }}
  template:
    spec:
      containers:
        - name: {{ .Chart.Name }}
          image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
          resources:
            limits:
              memory: {{ .Values.resources.limits.memory }}
```

환경별 차이는 `values.yaml`만 갈아끼우면 된다. prod는 `replicaCount: 5`, dev는 `1`. 클러스터에 설치된 차트 인스턴스 하나를 릴리스(release)라 부르고, `helm install`로 만들고 `helm upgrade`로 새 버전을 올린다. 이미지 태그를 바꾸는 배포가 이제 `values.yaml`의 `tag` 한 줄, 혹은 `helm upgrade --set image.tag=1.2.4`가 된다.

### ConfigMap·Secret을 Spring config에 잇기

설정을 이미지에 굽지 않고 밖에서 주입하는 게 마지막 조각이다. 같은 이미지를 dev와 prod에 똑같이 쓰되 DB 주소만 다르게 하려면 설정이 컨테이너 밖에 있어야 한다. Kubernetes는 ConfigMap과 Secret을 두 방식으로 컨테이너에 넣는다. 환경변수로, 또는 볼륨에 마운트된 파일로. Spring Boot는 양쪽을 다 자연스럽게 읽는다.

환경변수 경로는 Spring의 relaxed binding이 받는다. 점을 못 쓰는 환경변수는 언더스코어로 적으면 매핑된다.

```yaml file="deployment.yaml"
env:
  - name: SPRING_PROFILES_ACTIVE
    value: "prod"
  - name: SPRING_DATASOURCE_URL # → spring.datasource.url
    valueFrom:
      configMapKeyRef:
        name: my-config
        key: db-url
  - name: SPRING_DATASOURCE_PASSWORD # → spring.datasource.password
    valueFrom:
      secretKeyRef:
        name: my-secret
        key: db-password
```

볼륨 마운트 경로는 더 깔끔하다. ConfigMap·Secret을 디렉터리로 마운트하고, Spring Boot의 config tree 기능으로 읽는다. 마운트 루트 기준 상대 경로가 key(`/`는 `.`으로 바뀐다), 파일 내용이 value가 된다. 예를 들어 `/etc/config/`를 루트로 잡으면 `/etc/config/spring/datasource/url` 파일이 `spring.datasource.url`이 된다.

```yaml file="application.yml"
spring:
  config:
    import: "optional:configtree:/etc/config/"
```

Secret을 환경변수로 넣으면 `kubectl describe pod`이나 프로세스 환경에 값이 노출될 수 있다. 비밀값은 볼륨 마운트와 configtree 조합이 더 안전한 편이다.

> [!TIP]
> 더 깊은 통합을 원하면 `spring-cloud-kubernetes`가 ConfigMap·Secret을 PropertySource로 자동 로딩하고 변경 시 리로드까지 해준다. 다만 이건 Spring Boot 코어가 아니라 별도 의존성이라, 필요해질 때 그 문서를 따로 보는 걸 권한다.

## 파드로 띄운다: Pod, Deployment, probe

이제 진짜 올린다. JVM 개발자가 Kubernetes에서 처음 외울 오브젝트는 셋이면 된다.

- **Pod**: 컨테이너 한 개(혹은 몇 개)를 묶은 최소 배포 단위. 내 Spring Boot 컨테이너가 사는 집이다.
- **Deployment**: Pod를 몇 개 띄우고, 죽으면 다시 살리고, 새 버전으로 굴려서 교체할지를 선언하는 상위 컨트롤러. 실무에서 직접 만지는 건 거의 Deployment다.
- **Service**: 수시로 죽었다 살아나는 Pod들 앞에 고정 주소를 달아주는 로드밸런서. Pod IP는 바뀌어도 Service 주소는 안 바뀐다.

이 중 Service가 트래픽을 어느 Pod로 보낼지 정할 때 쓰는 신호가 probe다. Kubernetes는 컨테이너 안의 앱이 살아있는지, 트래픽 받을 준비가 됐는지를 스스로 알지 못한다. 프로세스가 떠 있다고 앱이 정상인 건 아니다. 데드락에 걸려도 프로세스는 살아있다. 그래서 앱에게 직접 물어보는 장치가 probe다. 세 종류가 있고, 실패했을 때 반응이 각각 다르다.

- **liveness probe**: "너 살아있냐?" 실패하면 kubelet이 컨테이너를 죽이고 재시작한다. 데드락처럼 재시작 말고는 답이 없는 상태를 위한 것이다.
- **readiness probe**: "트래픽 받을 준비 됐냐?" 실패하면 Service 엔드포인트에서 빠진다. 죽이지는 않는다. 잠깐 바빠서 못 받을 뿐인 상태를 위한 것이다.
- **startup probe**: "다 떴냐?" 이게 성공하기 전까지는 liveness·readiness가 시작되지 않는다. `failureThreshold × periodSeconds`만큼 기동 시간을 벌어준다.

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

이러면 `/actuator/health/liveness`와 `/actuator/health/readiness` 두 엔드포인트가 생긴다. Spring Boot는 이 둘을 `ApplicationAvailability`라는 내부 상태에서 끌어온다. liveness는 애플리케이션 컨텍스트가 refresh되는 순간 live가 되고, readiness는 `ApplicationRunner`·`CommandLineRunner`까지 다 돌고 나면 ready가 된다. 의미가 명확하다. 앱이 자기 내부 상태로 일할 수 있으면 live, 외부 요청까지 받을 준비가 끝나면 ready다.

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

여기서 흔한 실수 하나. liveness probe가 외부 시스템(DB, 다른 서비스) 상태에 의존하면 안 된다. Spring 문서가 명시적으로 경고하는 지점이다. DB가 잠깐 끊겼다고 liveness가 실패하면 Kubernetes는 앱을 재시작한다. 재시작해도 DB는 여전히 끊겨 있으니 또 죽는다. DB 장애가 앱 재시작 폭풍으로 번진다. 외부 의존성 체크는 readiness에 둬야 한다. 트래픽만 잠깐 안 받으면 되니까.

## 떴다. 그런데 OOMKilled로 죽는다

이미지를 굽고, Helm으로 묶고, 파드로 띄웠다. 메모리는 넉넉하게 1Gi를 줬다. `-Xmx`는 안 박았으니 JVM이 알아서 하겠거니 했다. 그런데 부하가 좀 붙으니 파드가 죽는다.

```text
NAME                     READY   STATUS      RESTARTS   AGE
my-service-7d9f8-abcde   0/1     OOMKilled   3          7m
```

`OOMKilled`. 메모리가 모자라서 커널이 죽였다는 뜻이다. 이상하다. 힙을 1Gi 안에서 쓰는데 왜? 먼저 리소스 선언부터 보자.

```yaml file="deployment.yaml"
resources:
  requests:
    memory: "512Mi"
    cpu: "250m"
  limits:
    memory: "1Gi"
    cpu: "1000m"
```

`requests`와 `limits`는 역할이 다르다. `requests`는 스케줄러가 "이 Pod를 어느 노드에 놓을까"를 정할 때 보는 예약 값이고, `limits`는 kubelet이 "이 컨테이너가 이 이상 못 쓰게" 강제하는 상한이다. 메모리 limit은 커널이 OOM kill로 강제하고, CPU limit은 스로틀링으로 강제한다.

핵심은 메모리 limit이 컨테이너 전체가 실제로 점유한 물리 메모리(RSS)에 걸린다는 점이다. JVM 힙이 아니라. 그런데 `-Xmx`나 `MaxRAMPercentage`는 힙만 제한한다. 둘 사이에 비힙 메모리가 통째로 빠져 있다. JVM이 실제로 먹는 메모리는 힙만이 아니다.

- 힙 (객체)
- 메타스페이스 (클래스 메타데이터)
- 스레드 스택 (스레드 하나당 약 1MB, 톰캣 스레드 수백 개면 수백 MB)
- JIT 코드 캐시
- GC가 쓰는 자체 자료구조
- 다이렉트 바이트 버퍼, 네이티브 라이브러리

이걸 다 합친 게 RSS다. 힙을 limit의 90%로 잡으면, 나머지 비힙이 들어갈 자리가 10%밖에 안 남는다. 부하가 붙어 스레드가 늘고 메타스페이스가 차는 순간 RSS가 1Gi를 넘고, 커널이 컨테이너를 죽인다. 그게 `OOMKilled`, 종료 코드 137이다. 힙은 limit 안에 있었다. 맞다. 그런데 죽었다. 힙만 봤기 때문이다.

### container-aware JVM: cgroup 한계를 읽는 JVM

해법의 절반은 JVM이 컨테이너 한계를 제대로 읽게 하는 것이다. 다행히 요즘 JVM은 이걸 알아서 한다. 현재 JDK는 Linux에서 `UseContainerSupport`가 기본으로 켜져 있다. JVM이 cgroup에 걸린 메모리·CPU 한계를 읽어서, 호스트 전체가 아니라 컨테이너에 할당된 양을 기준으로 자원을 잡는다. JDK 21 기준 `java` 매뉴얼이 이 동작을 명시한다. 컨테이너 인식이 어떻게 도는지 보고 싶으면 이 옵션이 도움이 된다.

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

컨테이너에서는 비율 쪽이 운영하기 편하다. `MaxRAMPercentage`는 컨테이너에 할당된 메모리의 몇 %를 힙 최대치로 쓸지를 정한다. limit을 1Gi에서 2Gi로 올려도 매니페스트의 메모리 값만 고치면 힙이 알아서 따라온다. `-Xmx`는 매니페스트와 JVM 옵션 두 군데를 매번 동기화해야 한다.

비율을 얼마로 둘지는 비힙이 얼마나 필요한가에 달렸다. 스레드 많고 클래스 많은 전형적인 웹 앱이라면 힙을 limit의 70~75% 선에 두고, 나머지를 비힙에 양보하는 데서 시작해 실제 RSS를 보며 조정하는 게 보통이다. 정답 숫자는 없다. 앱마다 비힙 프로파일이 다르기 때문이다. 그래서 다음 단계가 "추측 말고 측정"이고, 그 측정 도구가 뒤에 올 관측성 편이다.

> [!TIP]
> JDK 버전도 점검 대상이다. 2025년 9월에 JDK 25가 LTS로 나왔고, 그 전 LTS는 JDK 21이다. 오래된 JDK일수록 컨테이너 인식이 부실하다. 클라우드 네이티브로 갈 거라면 베이스 이미지의 JDK부터 올리는 게 첫 단추다.

## 정리

로컬에서 되던 앱을 클러스터에 올리는 길은 한 줄로 요약된다. jar를 Jib이나 Buildpacks로 이미지로 굽고(레이어드 jar가 캐시를 살린다), Helm으로 매니페스트를 패키징하고, 설정은 ConfigMap·Secret으로 컨테이너 밖에 두고, Deployment로 파드를 띄우고, probe를 Actuator health에 잇는다. Dockerfile을 손으로 쓸 일은 대체로 없다.

그리고 첫 사고 OOMKilled의 정체는 단순했다. Kubernetes는 컨테이너 전체 메모리를 보는데, 나는 힙만 봤다. 그 틈에 비힙이 끼어서 limit을 넘겼다. 그래서 컨테이너의 JVM은 두 가지를 같이 챙긴다. cgroup 한계를 읽게 하고(`UseContainerSupport`, 비율 기반 힙), 힙과 비힙을 합친 RSS가 limit 안에 들어오도록 여유를 남기는 것. 이 여유를 얼마나 줄지는 결국 관측해서 정한다.

## 다음 편

앱은 떴다. 이제 로그를 보려고 `kubectl logs`를 친다. 그런데 파드가 세 개면 로그도 세 갈래로 흩어져 있고, 파드가 죽으면 그 로그는 같이 사라진다. 방금 500 에러를 낸 요청이 어느 파드에서 났는지조차 한눈에 안 보인다. 다음 편은 이 흩어진 로그를 구조화 로깅과 수집기로 다시 한곳에 모으는 이야기다.

## 참고

- [Jib · GoogleContainerTools](https://github.com/GoogleContainerTools/jib)
- [Packaging OCI Images · Spring Boot Gradle Plugin](https://docs.spring.io/spring-boot/gradle-plugin/packaging-oci-image.html)
- [Efficient Container Images · Spring Boot Reference](https://docs.spring.io/spring-boot/reference/packaging/container-images/efficient-images.html)
- [Charts · Helm Docs](https://helm.sh/docs/topics/charts/)
- [External Application Properties · Spring Boot Reference](https://docs.spring.io/spring-boot/reference/features/external-config.html)
- [Configure Liveness, Readiness and Startup Probes · Kubernetes](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/)
- [Resource Management for Pods and Containers · Kubernetes](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/)
- [Kubernetes Probes · Spring Boot Reference](https://docs.spring.io/spring-boot/reference/actuator/endpoints.html)
- [Application Availability · Spring Boot Reference](https://docs.spring.io/spring-boot/reference/features/spring-application.html)
- [java Command (JDK 21) · Oracle](https://docs.oracle.com/en/java/javase/21/docs/specs/man/java.html)
- [JDK 25 · OpenJDK Project](https://openjdk.org/projects/jdk/25/)
