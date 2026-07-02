---
author: 주진현
pubDatetime: 2026-06-09T09:00:00+09:00
title: "서비스마다 공통 기반을 또 만든다: Dapr·cert-manager·Backstage (Spring 개발자를 위한 클라우드 표준 9)"
featured: false
section: cloud-native
series:
  slug: cloud-native-for-spring
  order: 9
tags:
  - kubernetes
  - dapr
  - cert-manager
  - backstage
  - cloud-native
description: 배포·관측·메시·스케일을 서비스 하나에 갖춰도, 서비스가 늘면 pub/sub·재시도·TLS·문서를 서비스마다 다시 세우는 반복이 남는다. Dapr는 분산 시스템 기본기를 사이드카로, cert-manager는 TLS 발급·갱신을 자동으로, Backstage는 흩어진 서비스를 개발자 포털 하나로 묶어 이 반복을 없앤다. Spring 앱 입장에서 세 도구가 여는 접점.
faq:
  - question: "Dapr가 뭐고 Spring과 어떻게 쓰나?"
    answer: "Dapr는 pub/sub, 상태 저장, 시크릿, 서비스 호출 같은 분산 시스템 기본기를 사이드카 API로 제공하는 런타임이다. 앱은 각 브로커·스토어의 클라이언트 SDK를 직접 임베드하는 대신 localhost의 Dapr 사이드카를 HTTP나 gRPC로 부른다. 공식 dapr-spring-boot-starter가 이 호출을 DaprMessagingTemplate, KeyValueTemplate 같은 친숙한 Spring 추상으로 감싼다."
  - question: "Dapr는 서비스 메시와 무엇이 다른가?"
    answer: "서비스 메시는 트래픽 라우팅과 mTLS 같은 네트워크 관심사를 사이드카로 뺀다. Dapr는 pub/sub, 상태 관리, 시크릿 호출 같은 애플리케이션 레벨 빌딩 블록을 사이드카로 뺀다. 둘은 다루는 층위가 달라 경쟁하지 않고, 한 클러스터 안에서 각자의 사이드카를 나란히 붙여 함께 쓸 수 있다."
  - question: "cert-manager로 TLS를 어떻게 자동화하나?"
    answer: "cert-manager는 Kubernetes에서 TLS 인증서 발급과 갱신을 CRD로 자동화한다. Issuer나 ClusterIssuer가 Let's Encrypt 같은 ACME 발급처를 정의하고, Certificate가 어떤 도메인의 인증서를 받을지 선언하면 만료 전 갱신까지 컨트롤러가 알아서 처리한다. Spring 서비스는 게이트웨이·인그레스 레벨에서 TLS와 mTLS를 수작업 없이 받고, 인증서 만료로 인한 장애를 걱정할 일이 사라진다."
  - question: "Backstage 개발자 포털이란 무엇인가?"
    answer: "Backstage는 Spotify가 만들어 CNCF에 기증한 개발자 포털이다. 소프트웨어 카탈로그로 모든 서비스의 소유자·의존성·문서를 한곳에 등록하고, 소프트웨어 템플릿(스캐폴더)으로 표준 구조의 새 서비스를 버튼 하나로 만들며, TechDocs로 코드 옆 마크다운 문서를 포털에서 바로 렌더링한다. 서비스가 늘수록 반복되는 수색 작업과 보일러플레이트를 한곳에서 줄이는 도구다."
  - question: "사이드카 패턴이 Spring 앱에 주는 것은?"
    answer: "사이드카 패턴은 분산 시스템 기본기(Dapr)나 통신 정책(서비스 메시)을 애플리케이션 코드 밖으로 뺀다. Spring 앱은 각 브로커·프록시의 클라이언트 로직을 직접 품는 대신 localhost의 사이드카를 부르기만 하면 되고, 인프라 쪽 구현이 바뀌어도 앱 코드는 그대로 남는다. 언어가 섞인 조직일수록 이 이득이 크다."
---

지난 편 끝에서 나는 배포 자동화가 지운 손이 다른 자리에서 다시 필요해졌다고 썼다. 그 자리가 어딘지는 다음 날 바로 확인했다. 새 결제 서비스를 하나 얹는데, Kafka 컨슈머 연결 코드부터 다시 짰다. 재시도 횟수도 타임아웃 값도 옆 서비스 코드를 열어서 그대로 베꼈다. TLS 인증서는 발급 신청을 넣고 승인을 기다렸고, 다 붙이고 나니 이 서비스에 무슨 API가 있냐는 질문이 팀 채널에 세 개나 밀려 있었다.

서비스 하나였으면 그러려니 했을 반복이다. 그런데 열 번째, 스무 번째 서비스에서도 똑같은 일이 벌어졌다. 배포는 GitOps가 자동으로 흘려보내는데, 정작 그 배포 대상이 되는 서비스의 기반은 여전히 서비스마다 손으로 쌓고 있었다.

이 반복을 세 프로젝트가 각자 다른 층에서 잘라낸다. Dapr는 pub/sub·상태·시크릿 같은 분산 시스템 기본기를, cert-manager는 TLS 발급·갱신을, Backstage는 서비스 카탈로그와 문서를 맡는다.

## Dapr: 분산 시스템 기본기를 사이드카로

마이크로서비스가 반복해서 다시 짜는 코드가 있다. pub/sub 발행·구독, 상태 저장, 시크릿 읽기, 다른 서비스 호출. 언어마다, 서비스마다 각 브로커·스토어의 SDK를 임베드한다. Kafka를 바꾸면 전부 고친다.

Dapr는 이걸 사이드카로 뺀다. **빌딩 블록**이라 부르는 API 묶음을 사이드카가 제공하고, 앱은 그걸 `localhost`로 부른다. 서비스 호출, pub/sub, 상태 관리, 바인딩, 시크릿, 액터 등 열두 가지가 HTTP나 gRPC API로 노출된다. 앱은 Kafka를 모른다. Dapr 사이드카에 "이 토픽에 발행해줘"라고 할 뿐이고, 뒤에 Kafka가 있는지 Redis가 있는지는 Dapr 컴포넌트 설정이 정한다. 6부 서비스 메시가 네트워크 관심사를 사이드카로 뺐다면, Dapr는 애플리케이션 레벨 관심사를 사이드카로 뺀다.

Spring 개발자에게 반가운 건 공식 통합이 있다는 점이다. `io.dapr.spring:dapr-spring-boot-starter`가 Dapr 호출을 친숙한 Spring 추상으로 감싼다.

```kotlin file="build.gradle.kts"
implementation("io.dapr.spring:dapr-spring-boot-starter")
```

pub/sub은 `DaprMessagingTemplate`, 상태 저장은 Spring Data의 `KeyValueTemplate`·`CrudRepository`로 쓴다. 브로커 SDK를 직접 다루는 대신 Spring 관용구로 분산 기본기를 쓰는 셈이다. 다만 이 Spring Boot 통합은 공식이긴 해도 문서상 아직 alpha 단계라, 프로덕션 도입 전엔 직접 검증부터 해야 한다. Dapr 자체는 2024년 11월에 CNCF를 졸업했고, 2026년 6월 현재 1.18 라인이다(이 릴리스의 워크플로 검증 기능은 상용 벤더 Diagrid가 기여했다).

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

`Issuer`·`ClusterIssuer`가 인증서를 어디서 받을지(예: Let's Encrypt ACME) 정하고, `Certificate`가 무엇을 발급받을지 선언한다. 만료 전 갱신도 cert-manager가 알아서 한다. Spring 서비스 입장에선 TLS·mTLS가 게이트웨이·인그레스 레벨에서 수작업 없이 붙는다. 6부에서 메시가 mTLS를 깔 때도 그 뒤에서 인증서를 대주는 게 보통 cert-manager다. 2024년 11월에 졸업했고 1.20 라인이다.

## Backstage: 흩어진 서비스를 한 포털로

마지막은 사람의 문제다. 서비스가 수십 개면 "이 서비스 누가 만들었지, 문서는 어디, API는 뭐지"가 매번 수색 작업이 된다. 새 서비스를 만들 때마다 표준 구조를 처음부터 세운다.

Backstage는 개발자 포털이다. Spotify가 만들어 CNCF에 기증했다. 세 축이 있다.

- **소프트웨어 카탈로그**: 모든 서비스를 한곳에 등록. 각 서비스가 `catalog-info.yaml`로 자신을 기술한다. 누구 소유, 어디 의존, 문서는 어디.
- **소프트웨어 템플릿(스캐폴더)**: 표준 구조의 새 서비스를 버튼 하나로 생성. "Spring Boot 마이크로서비스" 템플릿을 만들어두면 새 서비스가 같은 골격으로 시작한다.
- **TechDocs**: 코드 옆 마크다운 문서를 포털에서 렌더링.

Backstage를 도입할 가치가 있는지는 CNCF 단계표가 아니라 실무에서 이미 표준처럼 쓰이고 있는가로 판단하는 게 맞다. Spotify가 사내에서 쓰던 걸 오픈소스로 풀고 CNCF에 기증한 뒤, 여러 조직이 개발자 포털의 기본 선택지로 채택했고 개발 활동도 꾸준하다. 서비스가 흩어질수록 카탈로그 하나로 다 모아두는 이 접근이 아쉬워지는 순간이 늘어난다는 뜻이다.

Spring 서비스가 많은 조직이라면, Backstage 카탈로그에 서비스를 등록하고 표준 Spring Boot 템플릿으로 새 서비스를 찍어내는 흐름이 보일러플레이트와 수색 작업을 같이 줄인다.

## 정리

세 도구는 "서비스가 많아져서" 생기는 서로 다른 문제를 푼다. Dapr는 반복되는 분산 기본기를 사이드카로 빼고(Spring은 공식 스타터로 받는다), cert-manager는 TLS 발급·갱신을 자동화하며, Backstage는 흩어진 서비스를 한 포털로 묶는다. 세 도구를 고를 기준은 CNCF 등급이 아니라, 지금 우리 조직이 겪는 반복을 실제로 없애주는가다.

## 다음 편

여기까지 오면 1부에서 그린 다섯 층, 배포·관측·메시·스케일·플랫폼이 다 채워진다. 새 서비스를 붙일 때 pub/sub도, TLS도, 카탈로그 등록도 더는 매번 손으로 하지 않는다.

플랫폼은 섰다. 그런데 얼마 전 클러스터 노드 목록을 보다가 낯선 라벨을 하나 발견했다. 옆 노드에 GPU가 붙어 있었다. AI 추론 워크로드가 같은 클러스터에 들어온 것이다. 지금까지 쌓은 배포·관측·메시·스케일·플랫폼 도구가 이 낯선 워크로드 앞에서도 그대로 통하는지, 아니면 다른 층이 새로 필요한지부터 확인해야 했다.

마지막 10편은 이 질문에서 시작한다. AI 워크로드 시대에 이 지도 전체가 어떻게 바뀌고, 그 위에서 JVM은 어디에 서는지로 시리즈를 닫는다.

## 참고

- [Building Blocks · Dapr Docs](https://docs.dapr.io/concepts/building-blocks-concept/)
- [Dapr Spring Boot Integration](https://docs.dapr.io/developing-applications/sdks/java/spring-boot/)
- [cert-manager Documentation](https://cert-manager.io/docs/)
- [Backstage · CNCF Project](https://www.cncf.io/projects/backstage/)
- [Backstage Software Catalog](https://backstage.io/docs/features/software-catalog/)
