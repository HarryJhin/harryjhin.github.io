---
author: 주진현
pubDatetime: 2026-06-09T09:00:00+09:00
title: "플랫폼 빌딩 블록: Dapr·cert-manager·Backstage (JVM에서 본 클라우드 네이티브 9)"
featured: false
section: cloud-native
series:
  slug: cncf-from-jvm
  order: 9
tags:
  - kubernetes
  - dapr
  - cert-manager
  - backstage
  - cloud-native
description: 배포·관측·메시·스케일을 갖추고 나면, 여러 서비스를 한 플랫폼으로 묶는 도구가 필요해진다. Dapr는 분산 시스템 기본기를 사이드카로, cert-manager는 TLS를 자동으로, Backstage는 서비스 카탈로그와 스캐폴딩을 개발자 포털로 준다. Spring 앱 입장에서의 접점.
faq:
  - question: "Dapr는 Spring 개발자에게 무엇을 주나?"
    answer: "Dapr는 pub/sub, 상태 저장, 시크릿, 서비스 호출 같은 분산 시스템 기본기를 사이드카 API로 제공한다. 앱은 각 브로커·스토어의 클라이언트 SDK를 임베드하는 대신 localhost의 Dapr 사이드카를 HTTP/gRPC로 부른다. 공식 dapr-spring-boot-starter가 이를 친숙한 Spring 추상으로 감싼다."
  - question: "Dapr는 서비스 메시와 무엇이 다른가?"
    answer: "서비스 메시는 트래픽 라우팅, mTLS 같은 네트워크 관심사를 사이드카로 뺀다. Dapr는 pub/sub, 상태 관리, 시크릿 같은 애플리케이션 레벨 빌딩 블록을 사이드카로 뺀다. 둘은 다른 층위를 다루므로 한 클러스터에서 함께 쓸 수 있다."
  - question: "cert-manager는 무엇을 자동화하나?"
    answer: "Kubernetes에서 TLS 인증서 발급과 갱신을 자동화한다. Certificate, Issuer, ClusterIssuer CRD로 선언하고 ACME(Let's Encrypt) 등과 연동한다. Spring 서비스의 TLS·mTLS를 게이트웨이·인그레스 레벨에서 수작업 없이 처리한다. 2024년 11월 CNCF를 졸업했다."
  - question: "Backstage는 졸업 프로젝트인가?"
    answer: "아니다. Backstage는 CNCF Incubating 단계다(2022년 인큐베이터 합류). Spotify가 만들어 기증한 개발자 포털로, 소프트웨어 카탈로그·템플릿(스캐폴더)·TechDocs를 제공한다. 인큐베이팅 단계지만 채택과 개발 활동이 활발하다."
---

8부까지 오면 한 서비스를 배포하고, 관측하고, 메시로 잇고, 스케일하는 도구가 다 모인다. 그런데 서비스가 수십 개가 되면 새로운 종류의 문제가 생긴다. 모든 서비스가 Kafka 클라이언트를, Redis 클라이언트를, 시크릿 로딩 코드를 각자 품는다. TLS 인증서는 만료 때마다 누가 갱신하는지 아무도 모른다. 새 서비스를 만들 때마다 보일러플레이트를 복붙한다.

이 "서비스가 많아져서 생기는" 문제들을 세 프로젝트가 각자 다룬다. Dapr, cert-manager, Backstage다.

## Dapr: 분산 시스템 기본기를 사이드카로

마이크로서비스가 반복해서 다시 짜는 코드가 있다. pub/sub 발행·구독, 상태 저장, 시크릿 읽기, 다른 서비스 호출. 언어마다, 서비스마다 각 브로커·스토어의 SDK를 임베드한다. Kafka 바꾸면 전부 고친다.

Dapr는 이걸 사이드카로 뺀다. **빌딩 블록**이라 부르는 API 묶음을 사이드카가 제공하고, 앱은 그걸 `localhost`로 부른다. 서비스 호출, pub/sub, 상태 관리, 바인딩, 시크릿, 액터 등 열두 가지가 HTTP나 gRPC API로 노출된다. 앱은 Kafka를 모른다. Dapr 사이드카에 "이 토픽에 발행해줘"라고 할 뿐이고, 뒤에 Kafka가 있는지 Redis가 있는지는 Dapr 컴포넌트 설정이 정한다. 7부 서비스 메시가 네트워크 관심사를 사이드카로 뺐다면, Dapr는 애플리케이션 레벨 관심사를 사이드카로 뺀다.

Spring 개발자에게 반가운 건 공식 통합이 있다는 점이다. `io.dapr.spring:dapr-spring-boot-starter`가 Dapr 호출을 친숙한 Spring 추상으로 감싼다.

```kotlin file="build.gradle.kts"
implementation("io.dapr.spring:dapr-spring-boot-starter")
```

pub/sub은 `DaprMessagingTemplate`, 상태 저장은 Spring Data의 `KeyValueTemplate`·`CrudRepository`로 쓴다. 브로커 SDK를 직접 다루는 대신 Spring 관용구로 분산 기본기를 쓰는 셈이다. 다만 이 Spring Boot 통합은 공식이긴 해도 문서상 아직 alpha 단계라, 프로덕션 도입 전엔 성숙도를 따져봐야 한다. Dapr 자체는 2024년 11월에 CNCF를 졸업했고, 2026년 6월 현재 1.18 라인이다(이 릴리스의 워크플로 검증 기능은 상용 벤더 Diagrid가 기여했다).

## cert-manager: TLS를 자동으로

다음은 인증서다. 서비스가 많아지면 TLS 인증서 관리가 조용한 부채가 된다. 누가 발급했고 언제 만료되는지, 갱신은 누가 하는지. 깜빡하면 어느 날 인증서 만료로 장애가 난다.

cert-manager는 Kubernetes에서 인증서 발급·갱신을 자동화한다. CRD로 선언한다.

```yaml file="certificate.yaml"
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    privateKeySecretRef:
      name: letsencrypt-account
    solvers:
      - http01:
          ingress:
            class: nginx
---
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: my-service-tls
spec:
  secretName: my-service-tls
  issuerRef:
    name: letsencrypt
    kind: ClusterIssuer
  dnsNames:
    - my-service.example.com
```

`Issuer`·`ClusterIssuer`가 인증서를 어디서 받을지(예: Let's Encrypt ACME) 정하고, `Certificate`가 무엇을 발급받을지 선언한다. 만료 전 갱신도 cert-manager가 알아서 한다. Spring 서비스 입장에선 TLS·mTLS가 게이트웨이·인그레스 레벨에서 수작업 없이 붙는다. 7부에서 메시가 mTLS를 깔 때도 그 뒤에서 인증서를 대주는 게 보통 cert-manager다. 2024년 11월에 졸업했고 1.20 라인이다.

## Backstage: 흩어진 서비스를 한 포털로

마지막은 사람의 문제다. 서비스가 수십 개면 "이 서비스 누가 만들었지, 문서는 어디, API는 뭐지"가 매번 수색 작업이 된다. 새 서비스를 만들 때마다 표준 구조를 처음부터 세운다.

Backstage는 개발자 포털이다. Spotify가 만들어 CNCF에 기증했다. 세 축이 있다.

- **소프트웨어 카탈로그**: 모든 서비스를 한곳에 등록. 각 서비스가 `catalog-info.yaml`로 자신을 기술한다. 누구 소유, 어디 의존, 문서는 어디.
- **소프트웨어 템플릿(스캐폴더)**: 표준 구조의 새 서비스를 버튼 하나로 생성. "Spring Boot 마이크로서비스" 템플릿을 만들어두면 새 서비스가 같은 골격으로 시작한다.
- **TechDocs**: 코드 옆 마크다운 문서를 포털에서 렌더링.

> [!IMPORTANT]
> 성숙도를 정확히 알아두자. Backstage는 **Graduated가 아니라 Incubating**이다(2022년 인큐베이터 합류). 다만 인큐베이팅이라고 인기가 적은 건 아니다. CNCF 프로젝트 중에서도 채택과 개발 활동이 꾸준히 활발한 축이다. "졸업했나"와 "많이 쓰나"는 다른 질문이다.

Spring 서비스가 많은 조직이라면, Backstage 카탈로그에 서비스를 등록하고 표준 Spring Boot 템플릿으로 새 서비스를 찍어내는 흐름이 보일러플레이트와 수색 작업을 같이 줄인다.

## 정리

세 도구는 "서비스가 많아져서" 생기는 서로 다른 문제를 푼다. Dapr는 반복되는 분산 기본기를 사이드카로 빼고(Spring은 공식 스타터로 받는다), cert-manager는 TLS 발급·갱신을 자동화하며, Backstage는 흩어진 서비스를 한 포털로 묶는다. 성숙도는 Dapr·cert-manager가 Graduated, Backstage가 Incubating이다.

여기까지가 1부에서 그린 다섯 층, 배포·관측·메시·스케일·플랫폼이다. 마지막 10부는 이 지도 전체가 2026년에 놓인 더 큰 맥락, AI 워크로드의 시대로 한 발 물러선다. 그 인프라 위에서 JVM은 어디에 서는지로 시리즈를 닫는다.

## 참고

- [Building Blocks — Dapr Docs](https://docs.dapr.io/concepts/building-blocks-concept/)
- [Dapr Spring Boot Integration](https://docs.dapr.io/developing-applications/sdks/java/spring-boot/)
- [cert-manager Documentation](https://cert-manager.io/docs/)
- [Backstage — CNCF Project](https://www.cncf.io/projects/backstage/)
- [Backstage Software Catalog](https://backstage.io/docs/features/software-catalog/)
