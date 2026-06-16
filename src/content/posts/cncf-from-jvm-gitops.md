---
author: 주진현
pubDatetime: 2026-06-16T09:30:00+09:00
title: "GitOps: Argo CD와 Flux (JVM에서 본 클라우드 네이티브 4)"
featured: false
section: cloud-native
series:
  slug: cncf-from-jvm
  order: 4
tags:
  - kubernetes
  - gitops
  - argocd
  - flux
  - cloud-native
description: helm upgrade를 사람이 손으로 치는 한, 클러스터의 실제 상태와 Git의 선언은 언젠가 어긋난다. GitOps는 Git을 단일 진실원으로 두고 컨트롤러가 클러스터를 거기에 맞추게 한다. CNCF Graduated인 Argo CD와 Flux를 JVM 앱 배포 입장에서 비교한다.
faq:
  - question: "GitOps란 무엇이고 핵심 원칙은?"
    answer: "GitOps는 시스템의 원하는 상태를 Git 같은 버전 관리 시스템에 선언하고, 실제 상태를 그 선언과 지속적으로 비교·일치시키는 운영 방식이다. OpenGitOps의 4원칙은 선언적(Declarative), 버전화·불변(Versioned and Immutable), 자동 풀(Pulled Automatically), 지속 조정(Continuously Reconciled)이다."
  - question: "Argo CD와 Flux 중 무엇을 골라야 하나?"
    answer: "둘 다 CNCF Graduated GitOps CD 도구다. Argo CD는 1급 웹 UI와 Application CRD 중심 모델로 시각적 운영과 앱 단위 관리에 강하다. Flux는 CLI-first에 GitOps Toolkit 컨트롤러(source/kustomize/helm)로 구성돼 가볍고 조합적이다. 시각적 대시보드가 중요하면 Argo CD, 클러스터 네이티브한 컨트롤러 조합을 원하면 Flux가 흔한 선택이다."
  - question: "GitOps에서 새 이미지 배포는 어떻게 자동화하나?"
    answer: "CI가 새 이미지를 빌드·푸시하면, 이미지 자동화 도구가 레지스트리를 스캔해 Git 매니페스트의 이미지 태그를 bump하고 커밋한다. Flux는 image-reflector-controller와 image-automation-controller(ImagePolicy로 semver 정책), Argo CD는 별도 컴포넌트인 Argo CD Image Updater를 쓴다. 그러면 컨트롤러가 변경을 reconcile해 클러스터에 적용한다."
  - question: "GitOps는 CI/CD push와 어떻게 다른가(push vs pull)?"
    answer: "전통적 CI/CD 파이프라인은 push다. 빌드가 끝나면 외부 CI가 kubectl apply로 클러스터에 변경을 밀어넣는다. GitOps는 pull이다. 클러스터 안의 에이전트가 Git을 당겨와 스스로 맞춘다. 그래서 클러스터 자격증명을 CI에 넘길 필요가 없어 보안에 유리하다."
  - question: "GitOps의 드리프트(drift) 교정과 self-heal은?"
    answer: "드리프트는 누군가 kubectl edit으로 클러스터를 직접 고쳐 Git 선언과 실제 상태가 어긋난 상태다. GitOps 컨트롤러는 실제 상태를 지속 관찰해 Git 기준으로 되돌린다. Argo CD는 어긋남을 OutOfSync로 표시하고 selfHeal로 교정하며, Flux는 다음 reconcile 주기에 맞춘다."
---

3부에서 `helm upgrade --set image.tag=1.2.4`로 배포하는 데까지 왔다. 그런데 이 명령을 누가 치는가. 사람이다. 그게 문제다.

사람이 손으로 배포하면 두 가지가 샌다. 첫째, 누가 언제 뭘 배포했는지 기록이 흩어진다. 둘째, 급해서 `kubectl edit`으로 클러스터를 직접 고치는 순간 Git의 선언과 실제 상태가 어긋난다. 그 어긋남은 조용하다. 다음 배포 때 누군가의 변경이 소리 없이 덮인다.

GitOps는 이 누수를 막는다. 발상은 단순하다. **Git을 단일 진실원으로 두고, 사람이 클러스터를 만지는 게 아니라 컨트롤러가 Git을 보고 클러스터를 맞춘다.** 배포는 `kubectl apply`가 아니라 `git push`가 된다.

## GitOps의 4원칙

GitOps는 마케팅 용어가 아니라 정의가 있는 개념이다. CNCF는 이렇게 정리한다. "버전 관리 시스템에 선언된 원하는 상태를, 실제 상태와 지속적으로 평가·조정하며 소프트웨어와 인프라를 관리하는 실천."

OpenGitOps 프로젝트(CNCF Sandbox)가 못 박은 4원칙이 본질을 더 잘 보여준다.

1. **선언적(Declarative)** — 원하는 상태를 선언으로 표현한다. "이렇게 해라"가 아니라 "이런 상태여야 한다".
2. **버전화·불변(Versioned and Immutable)** — 그 선언은 버전 히스토리를 남기며 불변으로 저장된다. Git이 이걸 공짜로 준다.
3. **자동 풀(Pulled Automatically)** — 에이전트가 선언을 자동으로 가져간다. 누가 밀어넣는 게 아니다.
4. **지속 조정(Continuously Reconciled)** — 에이전트가 실제 상태를 계속 관찰하고 선언 상태로 되돌린다.

3번과 4번이 전통적 CI/CD 파이프라인과 갈리는 지점이다. 파이프라인은 푸시다. 빌드 끝나면 외부에서 클러스터로 `kubectl apply`를 밀어넣는다. GitOps는 풀이다. 클러스터 안의 에이전트가 Git을 당겨와서 스스로 맞춘다. 그래서 클러스터 자격증명을 CI에 넘길 필요가 없고(보안 이점), 누가 클러스터를 직접 고쳐도 다음 조정 주기에 되돌려진다(드리프트 교정).

이 일을 하는 대표 도구가 둘이다. 둘 다 CNCF Graduated다.

## Argo CD: 애플리케이션 중심, UI 우선

Argo CD는 "Kubernetes를 위한 선언적 GitOps CD 도구"다. Argo 프로젝트의 일부이고(Argo는 2022년 12월 졸업, CD·Workflows·Rollouts·Events 네 서브프로젝트를 가진다), 2026년 6월 기준 3.4.x 라인이다.

중심 개념은 `Application` CRD다. "어떤 환경에 배포된 애플리케이션 인스턴스를 나타내는 Kubernetes 리소스"다. 하나 선언해보면 이렇다.

```yaml file="application.yaml"
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: my-service
  namespace: argocd
spec:
  source:
    repoURL: https://github.com/myorg/my-service-deploy
    path: charts/my-service
    targetRevision: main
  destination:
    server: https://kubernetes.default.svc
    namespace: production
  syncPolicy:
    automated:
      selfHeal: true # 클러스터가 손으로 바뀌면 Git 상태로 되돌림
      prune: true # Git에서 지운 리소스는 클러스터에서도 제거
```

이 `Application`이 가리키는 Git 경로(여기선 Helm 차트)를 Argo CD가 계속 본다. Git이 바뀌면 동기화(sync)하고, 실제 상태가 선언과 다르면 `OutOfSync`로 표시한다. `selfHeal`을 켜면 누가 `kubectl edit`으로 손댄 드리프트를 Git 기준으로 되돌린다.

Argo CD의 강점은 **1급 웹 UI**다. 애플리케이션이 어떤 리소스 트리로 펼쳐지는지, 무엇이 sync됐고 무엇이 어긋났는지를 화면으로 본다. 운영자가 여럿이고 배포 상태를 시각적으로 공유해야 하는 조직에서 이게 크다. 앱이 많아지면 한 앱이 다른 앱들을 만드는 app-of-apps나 `ApplicationSet`으로 묶는다.

## Flux: 툴킷 컨트롤러의 조합

Flux는 같은 일을 다른 철학으로 한다. "Kubernetes 클러스터를 Git 같은 설정 소스와 계속 동기화하고, 새 코드가 배포될 때 설정 갱신을 자동화하는 도구"다. 2022년 11월 졸업했고 2026년 6월 기준 2.8.x 라인이다.

Flux는 단일 앱이 아니라 **GitOps Toolkit**, 즉 컨트롤러 묶음이다. 기본 넷이 역할을 나눈다.

- **source-controller** — Git·OCI·Helm 저장소에서 artifact를 가져온다.
- **kustomize-controller** — `Kustomization`이 가리키는 매니페스트를 클러스터에 reconcile한다.
- **helm-controller** — `HelmRelease`를 reconcile한다(install/upgrade/rollback).
- **notification-controller** — 인바운드 웹훅과 아웃바운드 알림을 잇는다.

선언은 소스와 적용을 분리한다. Git 저장소를 `GitRepository`로 미러링하고, 그걸 `Kustomization`(혹은 Helm이면 `HelmRelease`)으로 클러스터에 푼다.

```yaml file="flux-config.yaml"
apiVersion: source.toolkit.fluxcd.io/v1
kind: GitRepository
metadata:
  name: my-service
  namespace: flux-system
spec:
  interval: 1m
  url: https://github.com/myorg/my-service-deploy
  ref:
    branch: main
---
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: my-service
  namespace: flux-system
spec:
  interval: 10m
  sourceRef:
    kind: GitRepository
    name: my-service
  path: ./overlays/production
  prune: true
```

Flux는 CLI(`flux`) 우선이고 기본 웹 UI가 없다. 가볍고, 모든 게 Kubernetes 리소스라 GitOps로 Flux 자신까지 관리하기 좋다. 컨트롤러를 필요한 만큼만 켜는 조합적 성격이 강하다.

## 그래서 무엇을 고르나

솔직히 말하면 둘 다 잘 만들어졌고, 대부분의 팀에서 결정은 취향과 운영 모델의 문제다. 검증 가능한 차이만 추리면 이렇다.

| | Argo CD | Flux |
|---|---|---|
| 모델 | `Application` CRD 중심(앱=배포 단위) | 툴킷 컨트롤러 + `GitRepository`/`Kustomization`/`HelmRelease` |
| 아키텍처 | 중앙 컨트롤 플레인(API 서버 + repository 서버 + Application 컨트롤러)이 앱을 reconcile | 툴킷 컨트롤러들이 클러스터 안에서 각자 reconcile |
| 멀티클러스터·테넌시 | 단일 인스턴스가 외부 클러스터를 등록해 hub-and-spoke로 관리 | 네임스페이스 + Kubernetes RBAC로 테넌트 격리(`--no-cross-namespace-refs`) |
| UI | 1급 웹 대시보드 | CLI 우선, 기본 UI 없음 |
| 이미지 자동화 | 별도 컴포넌트(Argo CD Image Updater) | 툴킷 일부(image controller, 기본 미설치) |
| 성숙도 | CNCF Graduated | CNCF Graduated |

대략의 기준. 배포 상태를 화면으로 보고 여러 운영자가 시각적으로 다뤄야 하면 Argo CD가 편하다. 모든 걸 Kubernetes 리소스로 두고 컨트롤러를 조합하는 클러스터 네이티브한 운영을 원하면 Flux가 맞는다.

## JVM 앱의 배포가 GitOps에 얹히는 자리

마지막으로 우리 Spring Boot 앱이 이 흐름에 어떻게 끼는지 보자. 전체 사이클은 이렇다.

1. 코드를 고쳐 푸시한다.
2. CI가 3부의 Jib·Buildpacks로 이미지를 빌드해 레지스트리에 푸시한다(`my-service:1.2.4`).
3. 배포 저장소의 매니페스트에서 이미지 태그를 `1.2.4`로 bump한다.
4. Argo CD·Flux가 그 변경을 보고 클러스터를 reconcile한다.

3번을 사람이 하면 또 손이 들어간다. 그래서 이미지 자동화가 있다. CI가 새 이미지를 푸시하면 도구가 레지스트리를 스캔해 매니페스트의 태그를 자동으로 올리고 Git에 커밋한다.

- **Flux**: `image-reflector-controller`가 레지스트리를 스캔하고, `image-automation-controller`가 `ImagePolicy`(semver 정책)에 따라 매니페스트를 패치해 커밋한다. 부트스트랩 때 이 컨트롤러들을 추가로 켜야 한다.
- **Argo CD**: 별도 컴포넌트인 Argo CD Image Updater가 같은 일을 한다. 다만 공식 문서가 스스로 "under active development"이며 비핵심 환경에서 테스트해 보길 권한다고 적어 둔다. Flux의 GA 툴킷 컨트롤러와 달리 성숙도 면에서 같은 수준으로 두긴 이르다.

여기까지 오면 배포에서 사람의 손이 거의 빠진다. 개발자는 코드를 푸시하고, 나머지는 이미지 빌드 → 태그 bump → reconcile로 자동으로 흐른다. 2부의 probe가 새 파드의 정상 여부를 판정하고, 어긋나면 롤아웃이 멈춘다.

## 정리

GitOps는 "배포를 `git push`로 만드는" 운영 모델이다. Git이 단일 진실원이 되고, 클러스터 안의 컨트롤러가 그 선언을 풀로 당겨 지속적으로 맞춘다. 사람이 클러스터를 직접 고쳐도 되돌려지고, 누가 뭘 배포했는지는 Git 히스토리에 남는다.

도구는 Argo CD(UI·앱 중심)와 Flux(CLI·툴킷 조합) 둘 다 CNCF Graduated이고, 선택은 대체로 운영 취향이다. 어느 쪽이든 JVM 앱 입장에서 얻는 건 같다. 손배포가 사라진다.

다음 5부부터는 관측성으로 넘어간다. 배포가 자동으로 흐르기 시작하면, 그 다음 질문은 항상 "그래서 지금 잘 돌고 있나"가 되기 때문이다. OpenTelemetry부터다.

## 참고

- [GitOps — CNCF Glossary](https://glossary.cncf.io/gitops/)
- [OpenGitOps Principles v1.0.0](https://github.com/open-gitops/documents/blob/v1.0.0/PRINCIPLES.md)
- [Argo CD Documentation](https://argo-cd.readthedocs.io/en/stable/)
- [Flux Documentation](https://fluxcd.io/flux/)
- [Flux Image Update Automation Guide](https://fluxcd.io/flux/guides/image-update/)
