---
author: 주진현
pubDatetime: 2026-06-16T10:00:00+09:00
title: "서비스 메시: Istio·Linkerd, 그리고 Cilium (JVM에서 본 클라우드 네이티브 7)"
featured: false
section: cloud-native
series:
  slug: cncf-from-jvm
  order: 7
tags:
  - kubernetes
  - istio
  - linkerd
  - cilium
  - service-mesh
description: 마이크로서비스마다 Resilience4j로 재시도·회로 차단·mTLS를 박는 건 같은 코드를 N번 쓰는 일이다. 서비스 메시는 이걸 앱 밖 프록시로 내린다. Istio(Envoy·ambient), Linkerd(Rust 프록시), Cilium(eBPF)을 JVM 파드의 사이드카 오버헤드 관점에서 가른다.
faq:
  - question: "서비스 메시는 무엇을 해결하나?"
    answer: "mTLS 암호화, 재시도, 회로 차단, 트래픽 분할 같은 서비스 간 통신 관심사를 애플리케이션 코드 밖의 프록시(데이터 플레인)로 내린다. JVM 입장에선 Resilience4j로 앱마다 박던 로직의 상당 부분을 인프라가 대신 처리하게 되는 것이다. 컨트롤 플레인이 이 프록시들을 설정한다."
  - question: "Istio의 ambient 모드란?"
    answer: "사이드카 없는 데이터 플레인 모드다. 2024년 11월 GA됐다. 파드마다 Envoy 사이드카를 붙이는 대신, 노드마다 L4를 처리하는 ztunnel을 두고 L7 기능은 waypoint 프록시가 맡는다. 파드당 프록시 오버헤드가 사라져서, 메모리가 무거운 JVM 파드에 특히 유리하다."
  - question: "Istio·Linkerd·Cilium은 어떻게 다른가?"
    answer: "Istio는 Envoy 기반으로 기능이 가장 풍부하고 ambient 사이드카리스 모드를 제공한다. Linkerd는 Rust 전용 마이크로 프록시로 가볍다. Cilium은 eBPF로 커널에서 동작해 사이드카 없이 노드 단위로 처리한다. 셋 다 CNCF Graduated이고 데이터 플레인 접근이 다르다."
  - question: "사이드카 프록시는 왜 JVM 파드에 특히 부담인가?"
    answer: "사이드카 프록시는 파드마다 메모리를 추가하는데, JVM 파드는 힙·메타스페이스·스레드 스택으로 이미 메모리가 무겁다. 파드 100개면 프록시 100개의 메모리가 따로 든다. Istio ambient의 ztunnel·waypoint와 Cilium eBPF는 프록시를 파드당이 아니라 노드당으로 내려 이 중복을 줄인다."
  - question: "Istio, Linkerd, Cilium 중 무엇을 골라야 하나?"
    answer: "트래픽 제어가 풍부하고 CRD로 카나리·회로 차단을 선언하고 싶으면 Istio를 고른다(ambient 모드로 파드당 사이드카 부담도 덜 수 있다). 메시를 처음 도입하며 운영 부담을 최소화하려면 Rust 마이크로 프록시 기반의 가벼운 Linkerd가 맞다(단 오픈소스 stable은 상용 BEL로 옮겨갔다). 사이드카 자체를 피하고 eBPF 커널 네트워킹과 Hubble 관측성까지 원하면 Cilium이다."
---

4부에서 GitOps로 배포를 자동화하고 나면, 보통 서비스가 한 개로 끝나지 않는다. 주문 서비스가 결제 서비스를 부르고, 결제가 알림을 부른다. 그 호출마다 똑같은 고민이 붙는다. 상대가 죽었으면 재시도할까, 몇 번? 계속 실패하면 회로를 끊을까? 호출을 암호화(mTLS)할까? 카나리 배포로 10%만 새 버전에 보낼까?

JVM 진영의 답은 보통 Resilience4j였다. 라이브러리로 앱 안에 박는다. 잘 돈다. 그런데 서비스가 열 개면 같은 설정을 열 번 한다. 언어가 섞이면(Java 서비스, Go 서비스) 또 따로 한다. 이 반복이 서비스 메시가 푸는 문제다.

## 메시가 하는 일

서비스 메시는 두 층으로 나뉜다.

- **데이터 플레인**: 실제 트래픽을 처리하는 프록시들. 보통 각 파드 옆에 사이드카로 붙는다.
- **컨트롤 플레인**: 그 프록시들을 설정하는 두뇌.

핵심은 사이드카 프록시가 **파드가 주고받는 모든 트래픽을 가로챈다**는 점이다. 그 길목에서 mTLS를 걸고, 재시도하고, 트래픽을 나눈다. **앱 코드는 한 줄도 안 바뀐다.** Istio 문서의 표현을 빌리면, 서비스에 아무 변경도 하지 않고 트래픽을 제어한다. Resilience4j로 앱마다 짜던 회로 차단·재시도가 프록시 설정으로 내려가는 것이다.

대표 구현이 셋이다. 모두 CNCF Graduated인데, 접근이 꽤 다르다.

## Istio: 기능이 가장 두껍다

Istio는 데이터 플레인으로 **Envoy** 프록시를 쓴다. 기능이 가장 풍부하고, 트래픽 제어를 CRD로 선언한다.

- `VirtualService`: 요청을 어떤 서비스로 어떻게 라우팅할지.
- `DestinationRule`: 로드밸런싱, TLS 모드, **회로 차단** 설정. 프록시 레벨에서 건다.
- `Gateway`: 메시 가장자리의 인바운드·아웃바운드 트래픽.

```yaml file="canary.yaml"
apiVersion: networking.istio.io/v1
kind: VirtualService
metadata:
  name: order-service
spec:
  hosts: ["order-service"]
  http:
    - route:
        - destination: { host: order-service, subset: v1 }
          weight: 90
        - destination: { host: order-service, subset: v2 }
          weight: 10 # 새 버전에 10%만
```

이런 카나리 배포를 앱 코드 없이 YAML로 한다. mTLS는 `PeerAuthentication`으로 켜고, 최근엔 Kubernetes의 표준 **Gateway API**도 1급으로 받아들였다. Istio는 2023년 7월에 CNCF를 졸업했고, 2026년 6월 현재 1.30 라인이다.

가장 주목할 변화는 **ambient 모드**다. 2024년 11월에 GA됐다. 기존엔 파드마다 Envoy 사이드카를 붙였는데, ambient는 그걸 없앤다. 대신 노드마다 L4를 처리하는 **ztunnel**(zero-trust tunnel)을 두고, L7 기능(라우팅, 인가, 복원력)은 **waypoint** 프록시가 맡는다. 파드당 프록시가 사라진다. 이게 왜 중요한지는 마지막 절에서 JVM과 엮어 보자.

## Linkerd: 가볍지만, 짚어야 할 변화

Linkerd는 다른 길을 간다. Envoy 대신 **Rust로 만든 전용 마이크로 프록시**(`linkerd2-proxy`)를 쓴다. 범용 프록시가 아니라 메시 전용으로 깎아서, 가볍고 단순하다. 메시를 처음 도입하는 팀이 운영 부담 적게 시작하기 좋은 선택지였다. CNCF를 졸업한 첫 서비스 메시이기도 하다(2021년).

다만 2026년에 Linkerd를 고려한다면 릴리스 모델 변화를 알아야 한다. **2.15부터(2024년 2월) 오픈소스 stable 릴리스 제공이 중단됐다.** stable 빌드는 이제 상용인 Buoyant Enterprise for Linkerd(BEL)로 배포되고, 오픈소스로는 주간 `edge-*` 릴리스가 계속 나온다. 실제로 GitHub 릴리스를 보면 최근 태그가 전부 `edge-*`다(이 글 작성 시점 기준 `edge-26.6.2`).

이게 좋다 나쁘다를 단정할 일은 아니다. BEL의 무료 조건은 직원 수로 갈린다. **직원 50명 미만 기업은 프로덕션을 포함해 규모·용도 무관 무료**로 쓸 수 있고(지원은 제외), **직원 50명 이상 기업은 비프로덕션 평가만 무료**이며 프로덕션 사용엔 유료 라이선스가 필요하다([Buoyant 공식 FAQ](https://docs.buoyant.io/buoyant-enterprise-linkerd/latest/faq/)). 여기서 '프로덕션 사용'은 고객 트래픽이나 매출·비즈니스에 직결된 트래픽을 처리하는 경우를 말한다. 다만 "오픈소스 stable을 받아 프로덕션에 올린다"는 과거 가정이 더는 그대로 통하지 않는다는 건 선택 전에 알아야 한다.

## Cilium: 사이드카가 아예 없다

Cilium은 발상이 다르다. 사이드카를 붙이는 게 아니라, **eBPF로 커널 안에서** 네트워킹을 처리한다. IP·TCP·UDP 같은 네트워크 처리는 eBPF 데이터패스가 커널에서 하고, HTTP·gRPC·Kafka 같은 L7은 파드마다가 아니라 **노드마다 있는 Envoy**가 파싱한다.

그래서 Cilium은 태생적으로 사이드카리스다. 네트워크 정책, 그리고 Hubble을 통한 L3~L7 관측성을 같이 제공한다. "사이드카 없는 서비스 메시"를 개척한 프로젝트로 평가받고, 2023년 10월에 졸업했다. 2026년 6월 현재 1.19 라인이다.

## JVM 파드 입장에서: 사이드카 오버헤드

이제 이 글을 JVM과 엮는 지점이다. 서비스 메시의 기능 자체는 언어 중립적이다. mTLS와 재시도는 Java 파드든 Go 파드든 똑같이 적용된다. 그런데 **비용은 언어 중립적이지 않다.**

사이드카 프록시는 파드마다 메모리와 약간의 레이턴시를 추가한다. 문제는 2부에서 본 것처럼 JVM 파드가 이미 메모리가 무겁다는 점이다. 힙에 비힙(메타스페이스, 스레드 스택, 코드 캐시)까지 얹은 위에, 사이드카 프록시 메모리가 또 올라간다. 파드 100개면 프록시 100개의 메모리가 따로 든다. 메모리가 빠듯한 JVM 워크로드에서 이 중복은 생각보다 아프다.

그래서 2024~2026년의 사이드카리스 흐름이 JVM에 특히 반갑다. Istio ambient의 ztunnel·waypoint, Cilium의 eBPF는 프록시를 파드당이 아니라 노드당으로 내린다. 파드 100개가 한 노드의 프록시를 공유하면, 파드마다 지던 프록시 메모리가 사라진다. 무거운 런타임을 굴리는 입장에선 이 모델이 메모리 산수를 크게 바꾼다.

> [!TIP]
> 구체적인 레이턴시·메모리 수치는 워크로드와 버전에 크게 좌우되니, 도입 전엔 자기 트래픽으로 직접 벤치마크하는 걸 권한다. 여기서 말하는 건 방향이다. "파드당 프록시"가 "노드당 프록시"로 바뀌면 메모리 무거운 런타임일수록 이득이 크다는 것.

## 정리

서비스 메시는 mTLS·재시도·회로 차단·트래픽 분할을 앱 코드 밖 프록시로 내린다. Resilience4j로 서비스마다 박던 걸 인프라가 대신한다. Istio(Envoy·기능 풍부·ambient), Linkerd(Rust·가벼움·상용 전환), Cilium(eBPF·사이드카리스) 셋 다 CNCF Graduated이고 접근이 다르다.

JVM 입장에서 결정적인 변수는 사이드카 오버헤드다. 메모리 무거운 JVM 파드에 파드당 프록시를 얹는 건 비싸다. 그래서 ambient·eBPF 같은 사이드카리스 모델이 JVM 워크로드에 특히 유리하다.

다음 8부는 스케일링이다. 메시까지 깔고 나면 다음 질문은 "이걸 얼마나, 언제 늘리고 줄이나"가 된다. KEDA의 이벤트 오토스케일과 Knative의 scale-to-zero, 그리고 JVM이 가장 약한 콜드 스타트 문제로 들어간다.

## 참고

- [Traffic Management — Istio](https://istio.io/latest/docs/concepts/traffic-management/)
- [Ambient Mesh Reaches GA — Istio Blog](https://istio.io/latest/blog/2024/ambient-reaches-ga/)
- [Announcing Linkerd 2.15 — Buoyant](https://linkerd.io/2024/02/21/announcing-linkerd-2.15/)
- [Cilium Graduation — CNCF](https://www.cncf.io/announcements/2023/10/11/cloud-native-computing-foundation-announces-cilium-graduation/)
- [Service Mesh — Cilium Docs](https://docs.cilium.io/en/stable/network/servicemesh/)
