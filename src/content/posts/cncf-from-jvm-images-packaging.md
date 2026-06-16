---
author: 주진현
pubDatetime: 2026-06-03T09:00:00+09:00
title: "이미지와 패키징: Jib·Buildpacks·Helm (JVM에서 본 클라우드 네이티브 3)"
featured: false
section: cloud-native
series:
  slug: cncf-from-jvm
  order: 3
tags:
  - kubernetes
  - spring-boot
  - jib
  - buildpacks
  - helm
description: Spring Boot 앱을 컨테이너 이미지로 만드는 데 Dockerfile은 필요 없다. Jib과 Cloud Native Buildpacks가 빌드에서 바로 OCI 이미지를 뽑고, 레이어드 jar가 캐시를 살린다. 그 이미지를 Helm 차트로 패키징하고 ConfigMap·Secret을 Spring config에 잇는 길까지.
faq:
  - question: "Spring Boot에서 Dockerfile 없이 컨테이너 이미지를 만들 수 있나?"
    answer: "두 가지 방법이 있다. Jib(jib-maven-plugin/jib-gradle-plugin)은 Docker 데몬 없이 Maven/Gradle 빌드에서 바로 OCI 이미지를 만들고 의존성과 클래스를 다른 레이어로 분리한다. Spring Boot의 bootBuildImage(Gradle)·build-image(Maven)는 Cloud Native Buildpacks(기본 Paketo)로 이미지를 만들지만 Docker 데몬이 필요하다."
  - question: "Spring Boot 레이어드 jar는 왜 쓰나?"
    answer: "Docker 레이어 캐시를 살리기 위해서다. Spring Boot는 jar를 dependencies, spring-boot-loader, snapshot-dependencies, application 네 레이어로 나눈다(layers.idx). 잘 안 바뀌는 라이브러리를 아래층에, 자주 바뀌는 애플리케이션 코드를 맨 위층에 둬서, 코드만 고쳤을 때 라이브러리 레이어는 캐시에서 재사용한다."
  - question: "Kubernetes ConfigMap·Secret을 Spring Boot 설정으로 어떻게 읽나?"
    answer: "ConfigMap·Secret은 환경변수나 볼륨 파일로 주입된다. Spring Boot는 relaxed binding으로 환경변수(SPRING_DATASOURCE_URL→spring.datasource.url)를 읽고, SPRING_APPLICATION_JSON으로 JSON 설정을 병합하며, 볼륨 마운트는 spring.config.import=configtree:/etc/config/로 파일 트리를 프로퍼티로 읽는다. 프로파일은 SPRING_PROFILES_ACTIVE로 켠다."
  - question: "Helm 차트란 무엇이고 Kubernetes 배포에 왜 쓰나?"
    answer: "Helm 차트는 연관된 Kubernetes 리소스를 기술하는 파일 묶음이며, values.yaml로 환경별 차이를 분리한다. Deployment·Service·ConfigMap 같은 매니페스트를 템플릿으로 두고 값만 갈아끼워 dev·staging·prod에 같은 차트를 설치한다. CNCF Graduated 프로젝트로 Kubernetes 매니페스트의 사실상 패키지 매니저다."
---

2부에서 OOMKilled를 풀었으니, 이제 그 컨테이너 이미지를 어떻게 만드느냐로 내려간다. 많은 JVM 개발자가 여기서 `Dockerfile`부터 손으로 쓴다. `FROM eclipse-temurin`, `COPY app.jar`, `ENTRYPOINT [...]`. 돌긴 돈다. 그런데 이건 Java 빌드 도구가 이미 아는 걸 Docker에게 다시 가르치는 일이다.

JVM 생태계에는 Dockerfile을 건너뛰는 길이 둘 있다. Jib과 Cloud Native Buildpacks다. 둘 다 빌드 산출물에서 바로 OCI 이미지를 만든다. 성격이 달라서 같이 보면 선택이 쉬워진다.

## Jib: 데몬 없이 이미지를 만든다

Jib은 Google이 만든 빌드 플러그인이다. 핵심 한 줄은 이것이다. **Docker 데몬 없이** Java 애플리케이션의 OCI 이미지를 만든다.

이게 왜 큰가. CI 파이프라인에서 Docker-in-Docker를 띄우거나 데몬 소켓을 마운트하는 번거로움이 사라진다. Jib은 레지스트리와 직접 통신해서 이미지를 푸시한다. 빌드 머신에 Docker가 없어도 된다.

레이어링도 알아서 한다. Jib은 애플리케이션을 여러 레이어로 나누되 **의존성과 클래스를 분리한다.** 라이브러리는 잘 안 바뀌고 내 코드는 자주 바뀌니까, 코드만 고쳤을 때 의존성 레이어는 그대로 재사용된다. Docker 베스트 프랙티스를 깊게 몰라도 캐시 효율이 나온다.

Gradle이면 플러그인을 붙이고 태스크를 부른다.

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

Maven이면 `jib-maven-plugin`으로 같은 일을 한다(`jib:build`, `jib:dockerBuild`). 2026년 6월 기준 Gradle 플러그인은 3.5.x, Maven 플러그인도 3.5.x 라인이다. 두 플러그인은 버전이 따로 매겨지니 각자 최신을 확인하면 된다.

## Buildpacks: Spring Boot가 기본 제공하는 길

다른 길은 Spring Boot에 이미 들어 있다. `bootBuildImage`(Gradle)와 `build-image`(Maven)다. 이건 **Cloud Native Buildpacks(CNB)**로 이미지를 만든다.

```bash
./gradlew bootBuildImage
```

기본 빌더는 Paketo buildpacks(`paketobuildpacks/builder-noble-java-tiny`)다. JDK 선택, 레이어 구성, 비root 사용자 실행 같은 걸 빌드팩이 알아서 처리한다. 베이스 이미지나 JVM 옵션을 빌드팩 설정으로 조정한다.

Jib과 결정적으로 갈리는 지점이 하나 있다. **`bootBuildImage`는 Docker 데몬이 필요하다.** Spring 문서가 명시한다. 그래서 선택은 대략 이렇게 갈린다.

- 데몬 없는 CI에서 가볍게, 레지스트리 직결이면 → **Jib**
- 빌드팩 생태계(보안 패치 자동 반영, OS 레이어 관리)를 그대로 쓰고 싶고 데몬이 있으면 → **Buildpacks**

둘 다 Dockerfile을 안 쓴다는 공통점이 더 크다. `Dockerfile`을 손으로 관리하는 건 이 둘이 안 되는 특수한 경우로 미뤄도 된다.

## 레이어드 jar: 캐시를 살리는 구조

Jib이든 Buildpacks든 바닥에 깔린 아이디어는 같다. Spring Boot의 레이어드 jar다.

Spring Boot는 실행 가능한 jar를 통짜로 두지 않고 네 레이어로 나눈다. jar 안의 `layers.idx`가 이 순서를 정의한다.

1. `dependencies` — 정식 릴리스 의존성
2. `spring-boot-loader` — 부트 로더 코드
3. `snapshot-dependencies` — 스냅샷 의존성
4. `application` — 내 애플리케이션 클래스와 리소스

순서가 핵심이다. **변경 가능성이 낮은 것부터 아래에 깔린다.** 라이브러리는 릴리스 사이에 거의 안 바뀌니 아래층, 내 코드는 매 빌드 바뀌니 맨 위층. Docker는 바뀐 레이어와 그 위만 다시 만들고 아래는 캐시에서 가져온다. 코드 한 줄 고친 배포에서 수백 MB 의존성을 매번 다시 푸시하지 않는다.

`Dockerfile`을 손으로 쓰면 이 레이어 분리를 직접 설계해야 한다. Jib과 Buildpacks는 공짜로 준다. 그래서 이 둘을 권하는 것이다.

## Helm: 매니페스트를 패키징한다

이미지가 생겼으니 이제 Kubernetes에 올릴 차례다. 그런데 2부에서 본 Deployment, Service, probe, ConfigMap을 환경마다(dev, staging, prod) 복붙하면 금세 관리가 안 된다. 이미지 태그 하나 바꾸려고 YAML 네 군데를 고친다.

**Helm**이 이걸 패키징한다. CNCF Graduated 프로젝트이고(2020년 5월 졸업), Kubernetes 매니페스트의 사실상 패키지 매니저다.

> [!NOTE]
> 버전 주의. 2025년 11월에 **Helm 4**가 나왔다. 6년 만의 첫 메이저 버전이고, 2026년 6월 현재 stable 라인은 4.x다. Helm 3도 별도 라인으로 유지보수된다. 오래된 문서나 블로그가 "Helm 3" 기준인 경우가 많으니, 새로 시작한다면 4.x를 기준으로 잡자.

차트(chart)는 "연관된 Kubernetes 리소스 묶음을 기술하는 파일들의 집합"이다. 구조는 이렇다.

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

환경별 차이는 `values.yaml`만 갈아끼우면 된다. prod는 `replicaCount: 5`, dev는 `1`. 클러스터에 설치된 차트 인스턴스 하나를 **릴리스(release)**라 부르고, `helm install`로 만들고 `helm upgrade`로 새 버전을 올린다. 한 차트를 같은 클러스터에 여러 번 설치할 수도 있다(릴리스 이름만 다르게).

이미지 태그를 바꾸는 배포가 이제 `values.yaml`의 `tag` 한 줄, 혹은 `helm upgrade --set image.tag=1.2.4`가 된다. 이 "Git에 있는 선언이 곧 배포 상태"라는 감각이 다음 4부 GitOps로 이어진다.

## ConfigMap·Secret을 Spring config에 잇기

ConfigMap과 Secret으로 설정을 이미지에 굽지 않고 밖에서 주입한다. 이게 마지막 조각이다. 같은 이미지를 dev와 prod에 똑같이 쓰되 DB 주소만 다르게 하려면 설정이 컨테이너 밖에 있어야 한다.

Kubernetes는 ConfigMap과 Secret을 두 방식으로 컨테이너에 넣는다. **환경변수**로, 또는 **볼륨에 마운트된 파일**로. Spring Boot는 양쪽을 다 자연스럽게 읽는다.

**환경변수 경로**는 Spring의 relaxed binding이 받는다. 점을 못 쓰는 환경변수는 언더스코어로 적으면 매핑된다.

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

`SPRING_APPLICATION_JSON` 환경변수에 JSON을 통째로 넘겨 Environment에 병합하는 방법도 있다.

**볼륨 마운트 경로**는 더 깔끔하다. ConfigMap·Secret을 디렉터리로 마운트하고, Spring Boot의 config tree 기능으로 읽는다. 마운트 루트 기준 상대 경로가 key(`/`는 `.`으로 바뀐다), 파일 내용이 value가 된다. 예를 들어 `/etc/config/`를 루트로 잡으면 `/etc/config/spring/datasource/url` 파일이 `spring.datasource.url`이 된다.

```yaml file="application.yml"
spring:
  config:
    import: "optional:configtree:/etc/config/"
```

Secret을 환경변수로 넣으면 `kubectl describe pod`이나 프로세스 환경에 값이 노출될 수 있다. 볼륨 마운트 + configtree가 비밀값에는 더 안전한 편이다.

> [!TIP]
> 더 깊은 통합을 원하면 `spring-cloud-kubernetes`가 ConfigMap·Secret을 PropertySource로 자동 로딩하고 변경 시 리로드까지 해준다. 다만 이건 Spring Boot 코어가 아니라 별도 의존성이라, 필요해질 때 그 문서를 따로 보는 걸 권한다.

## 정리

Dockerfile은 JVM 개발자에게 대체로 불필요한 중간 단계다. Jib(데몬 없이, 레지스트리 직결)이나 Buildpacks(Spring Boot 내장, 데몬 필요)가 레이어드 jar 위에서 캐시 효율 좋은 이미지를 뽑아준다. 그 이미지를 Helm 차트로 묶으면 환경별 배포가 값 파일 교체로 줄고, 설정은 ConfigMap·Secret으로 컨테이너 밖에 둔다.

여기까지가 "한 번 배포하는" 이야기다. 다음 4부는 이걸 "Git 커밋이 곧 배포가 되도록" 자동화하는 GitOps다. Argo CD와 Flux로 들어간다.

## 참고

- [Jib — GoogleContainerTools](https://github.com/GoogleContainerTools/jib)
- [Packaging OCI Images — Spring Boot Gradle Plugin](https://docs.spring.io/spring-boot/gradle-plugin/packaging-oci-image.html)
- [Efficient Container Images — Spring Boot Reference](https://docs.spring.io/spring-boot/reference/packaging/container-images/efficient-images.html)
- [Charts — Helm Docs](https://helm.sh/docs/topics/charts/)
- [External Application Properties — Spring Boot Reference](https://docs.spring.io/spring-boot/reference/features/external-config.html)
