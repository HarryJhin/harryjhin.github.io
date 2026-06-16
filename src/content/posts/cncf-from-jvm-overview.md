---
author: 주진현
pubDatetime: 2026-06-16T09:00:00+09:00
title: "지도: 2026년 CNCF, JVM 개발자의 입장에서 (JVM에서 본 클라우드 네이티브 1)"
featured: true
section: cloud-native
series:
  slug: cncf-from-jvm
  order: 1
tags:
  - cncf
  - kubernetes
  - cloud-native
  - observability
  - jvm
description: CNCF Graduated 프로젝트는 36개지만, Spring Boot 컨테이너를 Kubernetes에 올리는 JVM 개발자에게 실제로 닿는 건 한 줌이다. 2026년 CNCF의 현재 좌표(K8s 프로덕션 82%, AI-native 전환)를 잡고, 배포·관측·메시·스케일·플랫폼 다섯 층으로 10부작 딥다이브의 지도를 그린다.
faq:
  - question: "2026년 CNCF Graduated 프로젝트는 몇 개인가?"
    answer: "2026년 6월 기준 CNCF Graduated(졸업) 프로젝트는 36개다. Kubernetes·Prometheus·Envoy·etcd부터 OpenTelemetry·Cilium·Istio·Knative·Dapr·KEDA까지 포함된다. 2026년 1월에는 이미지/파일 배포 도구인 Dragonfly가 새로 졸업했다."
  - question: "Spring/JVM 개발자가 CNCF에서 가장 먼저 알아야 할 프로젝트는?"
    answer: "36개 졸업 프로젝트 전부가 아니라 다섯 층으로 묶이는 한 줌이다. 배포·패키징은 Kubernetes·Helm·Argo·Flux, 관측성은 OpenTelemetry·Prometheus, 서비스 메시는 Istio·Linkerd·Cilium, 스케일링은 KEDA·Knative, 플랫폼은 Dapr·cert-manager다. 전체 목록은 본문 '다섯 개의 층'에서 정리한다."
  - question: "컨테이너에 메모리 limit을 걸었는데 Spring Boot/JVM이 OOM으로 죽는 이유는?"
    answer: "컨테이너 메모리 limit과 JVM 힙 크기가 어긋나기 때문이다. JVM이 컨테이너 경계를 제대로 인식하지 못하면 힙이 K8s resources.limits.memory를 넘기고, 커널이 그 파드를 OOM-kill한다. 힙을 절댓값 -Xmx 대신 비율 -XX:MaxRAMPercentage로 두는 설정 디테일은 2부에서 다룬다."
  - question: "2026년 클라우드 네이티브의 가장 큰 흐름은?"
    answer: "AI 워크로드의 Kubernetes 집중이다. 2025 CNCF 연례 설문(2026년 1월 발표)에서 컨테이너 사용자의 82%가 프로덕션에서 Kubernetes를 쓴다고 답했고, CNCF는 'Kubernetes가 AI의 사실상 운영체제가 됐다'고 정리했다. KubeCon NA 2025에서는 Certified Kubernetes AI Conformance 프로그램이 출범했다."
---

처음 Spring Boot 앱을 Kubernetes에 올렸을 때를 기억한다. `Dockerfile` 쓰고, `Deployment` YAML 쓰고, `kubectl apply` 하면 끝인 줄 알았다. 그런데 며칠 안 가서 질문이 쏟아졌다. 헬스체크는 Actuator를 쓰면 되나 K8s probe를 쓰나? 컨테이너 메모리 limit을 1Gi로 줬는데 왜 JVM이 OOM으로 죽지? 로그는 어디서 보고, 메트릭은 Prometheus로 보낸다는데 그건 또 뭐고, 옆 팀은 Istio를 깐다는데 그건 왜 필요한가.

그제서야 알았다. Kubernetes는 입구였다. 그 뒤에 프로젝트 수십 개가 줄지어 서 있는 **재단**이 있었다. CNCF, Cloud Native Computing Foundation.

이 시리즈는 그 재단을 JVM 개발자의 입장에서 통과한다. CNCF 전체를 백과사전식으로 훑지 않는다. Spring Boot 컨테이너 하나를 프로덕션까지 끌고 가는 동안 실제로 손에 닿는 프로젝트만, 닿는 순서대로 따라간다. 1부는 지도를 그린다.

## 먼저, 2026년 CNCF의 좌표

CNCF는 Linux Foundation 산하 재단이다. 2015년에 Kubernetes를 첫 프로젝트로 출범했고, 지금은 거의 800개에 달하는 회원사와 수백 개의 프로젝트를 품고 있다. 프로젝트는 성숙도에 따라 세 단계로 나뉜다.

- **Graduated(졸업)**: 프로덕션 검증이 끝난, 사실상의 표준. 2026년 6월 기준 36개다.
- **Incubating(인큐베이팅)**: 프로덕션 사용처는 있지만 아직 성장 중. Backstage, Kubeflow, KServe가 여기 있다.
- **Sandbox(샌드박스)**: 실험 단계.

JVM 개발자가 외울 건 36개 졸업 프로젝트 전부가 아니다. 그중 워크로드에 직접 닿는 한 줌이다. 다만 그 한 줌을 추리기 전에, 2026년이라는 시점이 왜 특별한지부터 짚어야 한다. 똑같은 Kubernetes라도 올해의 Kubernetes는 작년과 쓰임이 달라졌기 때문이다.

## 2026년, Kubernetes가 AI의 운영체제가 됐다

2026년 1월에 발표된 2025 CNCF 연례 설문이 흐름을 한 문장으로 요약했다. **"Kubernetes가 AI의 사실상 운영체제(de facto operating system for AI)가 됐다."**

수치로 보면 이렇다.

- 컨테이너 사용자의 **82%**가 프로덕션에서 Kubernetes를 쓴다. 2023년 66%에서 올라왔다.
- 생성형 AI 모델을 호스팅하는 조직의 **66%**가 추론(inference)의 일부 또는 전부를 Kubernetes 위에서 돌린다.
- 그런데 아직 초기다. **44%**는 AI/ML을 Kubernetes에서 아예 안 돌리고, 모델을 매일 배포하는 조직은 **7%**뿐이다.

방향은 분명하고 성숙도는 이제 막 시작이라는 얘기다. 2025년 11월 애틀랜타에서 열린 KubeCon NA에서 CNCF는 **Certified Kubernetes AI Conformance** 프로그램을 출범시켰다. AI 워크로드가 어느 K8s에서나 똑같이 돌도록 표준을 박겠다는 신호다. 그 행사가 CNCF 출범 10주년을 겸한 "10th Anniversary Edition"이었다는 것도 상징적이다. 2015년에 컨테이너 오케스트레이터 하나로 시작한 재단이, 10년 만에 AI 인프라의 바닥을 까는 자리에 섰다.

> [!NOTE]
> AI 워크로드의 Kubernetes 집중이 JVM 개발자와 무슨 상관인가 싶을 수 있다. 당장은 적다. 하지만 같은 클러스터에 GPU 노드가 붙고 추론 사이드카가 끼는 순간, 내 Spring 서비스도 그 인프라 위에서 자원을 나눠 쓰는 이웃이 된다. 마지막 10부에서 이 지점을 따로 판다.

## 지도: 다섯 개의 층

졸업 프로젝트 36개를 무작정 나열하면 외울 수가 없다. JVM 워크로드가 프로덕션까지 가는 경로를 따라 다섯 층으로 묶으면 손에 잡힌다.

### 1. 배포와 패키징

Spring 빌드 산출물을 컨테이너 이미지로 만들고, 클러스터에 선언적으로 올리는 층이다.

- **Kubernetes**: 배포 대상 그 자체. Pod·Deployment·Service·probe.
- **Helm**(Graduated): K8s 매니페스트를 차트로 패키징·템플릿화. `values.yaml`로 환경별 설정을 가른다.
- **Argo**·**Flux**(둘 다 Graduated): GitOps. Git 저장소가 곧 배포 상태가 되고, 컨트롤러가 클러스터를 거기에 맞춘다.

### 2. 관측성

배포한 다음 안 보이면 운영이 안 된다. JVM은 특히 관측할 게 많다. 힙, GC, 스레드 풀.

- **OpenTelemetry**(Graduated): 트레이스·메트릭·로그를 한 규격(OTLP)으로 내보내는 표준. Spring Boot 3의 Observability가 여기에 직접 물린다. CNCF에서 Kubernetes 다음으로 활발한 프로젝트이기도 하다.
- **Prometheus**(Graduated): 메트릭 수집·알림의 사실상 표준. Actuator·Micrometer가 노출한 메트릭을 긁어간다.

### 3. 네트워킹과 서비스 메시

서비스가 여러 개가 되는 순간, 그 사이를 흐르는 트래픽을 누가 관리하느냐의 문제가 생긴다.

- **Istio**·**Linkerd**(둘 다 Graduated): 서비스 메시. mTLS 암호화, 트래픽 분할, 재시도를 **애플리케이션 코드를 안 건드리고** 사이드카에서 처리한다. Spring에 회로 차단기를 직접 박던 일의 상당 부분이 인프라로 내려간다.
- **Cilium**(Graduated): eBPF 기반 네트워킹·네트워크 정책·관측성. 파드 아래 커널 층에서 동작한다.

### 4. 스케일링과 서버리스

JVM에는 클라우드 네이티브와 유난히 안 맞는 약점이 하나 있다. 느린 콜드 스타트.

- **KEDA**(Graduated): 이벤트 기반 오토스케일러. Kafka 큐 길이 같은 외부 지표로 파드 수를 0부터 늘린다. Spring Kafka 컨슈머와 잘 맞는다.
- **Knative**(Graduated): scale-to-zero 서버리스. 트래픽 없으면 0으로 줄였다가 요청이 오면 띄운다. 이때 JVM 기동 시간이 그대로 응답 지연이 되는 게 핵심 긴장 지점이다.

### 5. 플랫폼 빌딩 블록

마지막은 여러 서비스를 한 플랫폼으로 묶는 도구들이다.

- **Dapr**(Graduated): pub/sub·상태 저장·서비스 호출 같은 분산 시스템 기본기를 사이드카로 제공한다. Spring에서 HTTP/gRPC로 부른다.
- **cert-manager**(Graduated): TLS 인증서 발급·갱신 자동화.
- **Backstage**(Incubating): 개발자 포털. 서비스 카탈로그와 스캐폴딩. 졸업이 아니라 인큐베이팅 단계라는 점은 정확히 알아두자.

## 왜 "JVM 시점"인가

CNCF 입문 글은 많다. 그런데 대부분 언어 중립적이다. "Kubernetes는 컨테이너 오케스트레이터입니다" 같은 설명은 Go 개발자에게나 Node 개발자에게나 똑같다.

JVM은 다르다. 다른 런타임이 안 겪는 마찰을 클라우드 네이티브 환경에서 따로 겪는다.

컨테이너에 메모리 limit을 걸면 JVM이 그 경계를 제대로 인식하느냐는 문제가 따라온다. 힙을 절댓값(`-Xmx`)으로 박을지 비율(`-XX:MaxRAMPercentage`)로 둘지, 그게 K8s `resources.limits.memory`와 어떻게 맞물리는지는 Go 바이너리 띄우는 사람은 신경 쓸 일이 없다. Knative로 scale-to-zero를 하면 JVM 기동 수 초가 그대로 첫 요청 지연이 된다. 관측성도 그렇다. JVM은 GC와 스레드 풀이라는, 다른 런타임에 없는 관측 대상을 갖고 있다.

그래서 이 시리즈는 매 편에서 같은 질문을 던진다. **이 CNCF 프로젝트는 JVM 워크로드에 닿을 때 무엇이 달라지는가.** 일반론은 짧게 깔고, JVM이 실제로 부딪히는 지점에 분량을 쓴다.

솔직히 고백하면, 이 마찰의 절반은 JVM이 클라우드 네이티브보다 먼저 태어난 탓이다. 서버 한 대를 오래 띄워두는 시대에 최적화된 런타임을, 파드를 수시로 죽였다 살리는 환경에 욱여넣는 일이다. 그래서 더 재밌다. 안 맞는 두 세계가 만나는 자리에 실무의 디테일이 몰려 있다.

## 시리즈 로드맵

배포에서 시작해 관측·메시·스케일을 지나 플랫폼과 AI까지, 10부작으로 간다. 각 편은 *CNCF 프로젝트의 원래 목적 → JVM 워크로드와의 접점 → 실제 설정·코드*의 순서를 따른다.

1. **(이 글) 지도**: 2026년 CNCF의 좌표와 다섯 층
2. **Kubernetes 기초**: Pod·Deployment·probe와 Actuator health, 리소스 limit과 container-aware JVM(`MaxRAMPercentage`)
3. **이미지와 패키징**: Jib·Buildpacks로 OCI 이미지 만들기, Helm 차트, ConfigMap/Secret과 Spring profile
4. **GitOps**: Argo CD와 Flux, 선언적 배포 파이프라인
5. **관측성 ① OpenTelemetry**: Spring Boot 3 Observability와 OTel Java agent, OTLP, 그리고 2026년 Alpha에 들어간 Profiles
6. **관측성 ② Prometheus**: Actuator·Micrometer 메트릭 스크레이프와 알림 룰
7. **서비스 메시**: Istio·Linkerd로 mTLS·트래픽 제어, Cilium의 eBPF 네트워킹
8. **스케일링과 서버리스**: KEDA 이벤트 오토스케일과 Knative scale-to-zero, JVM 콜드 스타트 정면 돌파
9. **플랫폼 빌딩 블록**: Dapr 사이드카, cert-manager TLS 자동화, Backstage 개발자 포털
10. **AI 워크로드 시대의 JVM**: Kubernetes 위의 AI(KServe·Kubeflow, DRA GPU 스케줄링)와 그 인프라 위 JVM 서비스의 자리

다음 글은 Kubernetes 기초다. 컨테이너 메모리 limit과 JVM 힙이 어긋나서 파드가 OOM으로 죽는, 가장 흔한 첫 사고부터 손에 잡히는 설정으로 들어간다.

## 참고

- [CNCF Projects](https://www.cncf.io/projects/)
- [2025 CNCF Annual Cloud Native Survey](https://www.cncf.io/announcements/2026/01/20/kubernetes-established-as-the-de-facto-operating-system-for-ai-as-production-use-hits-82-in-2025-cncf-annual-cloud-native-survey/)
- [CNCF Launches Certified Kubernetes AI Conformance Program](https://www.cncf.io/announcements/2025/11/11/cncf-launches-certified-kubernetes-ai-conformance-program-to-standardize-ai-workloads-on-kubernetes/)
- [CNCF Project Velocity 2025](https://www.cncf.io/blog/2026/02/09/what-cncf-project-velocity-in-2025-reveals-about-cloud-natives-future/)
- [OpenTelemetry Profiles Enters Public Alpha](https://opentelemetry.io/blog/2026/profiles-alpha/)
