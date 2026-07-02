---
author: 주진현
pubDatetime: 2026-06-01T09:00:00+09:00
title: "왜 이 낯선 이름들이 한꺼번에 쏟아지나: Spring 개발자를 위한 클라우드 표준 지도 (Spring 개발자를 위한 클라우드 표준 1)"
featured: true
section: cloud-native
series:
  slug: cloud-native-for-spring
  order: 1
tags:
  - cncf
  - kubernetes
  - cloud-native
  - observability
  - jvm
  - spring
description: Spring 앱을 클라우드로 옮기는 순간 Kubernetes, Prometheus, OpenTelemetry, Istio 같은 낯선 이름이 한꺼번에 쏟아진다. 이 이름들이 왜 생겼고, 왜 CNCF라는 한 재단에 모였고, 내가 이미 아는 Spring(로깅·설정·패키징·MSA)과 어떻게 이어지는지 지도를 그린다.
faq:
  - question: "Spring 개발자가 클라우드 네이티브를 왜 알아야 하나?"
    answer: "배포 대상이 서버 한 대에서 Kubernetes 클러스터로 바뀌면 헬스체크, 메모리 한계, 로그 수집, 서비스 간 통신이 전부 인프라 층의 문제로 옮겨가기 때문이다. 2025 CNCF 설문에서 컨테이너 사용자의 82%가 프로덕션에서 Kubernetes를 쓴다고 답했고, Spring 앱도 그 위에 올라간다."
  - question: "CNCF가 뭐고 Spring과 무슨 상관인가?"
    answer: "CNCF(Cloud Native Computing Foundation)는 Linux Foundation 산하의 벤더 중립 오픈소스 재단으로, Kubernetes·Prometheus·Envoy 같은 클라우드 인프라 프로젝트를 호스팅한다. Spring 앱을 클라우드에 올리면 이 프로젝트들이 배포·관측·통신의 실무 표준이 되므로, Spring 개발자가 만나는 도구 대부분이 결국 이 재단에 모여 있다."
  - question: "2026년 클라우드 표준 중 Spring 개발자에게 실제 닿는 건?"
    answer: "Kubernetes(배포), Helm(패키징), Prometheus·OpenTelemetry(관측), Istio·Linkerd(서비스 메시), KEDA·Knative(스케일링)가 핵심이다. CNCF Graduated 프로젝트 36개 전부가 아니라, Spring Boot 컨테이너가 프로덕션까지 가는 경로에 놓인 한 줌이다. Spring Boot 3의 Observability는 OpenTelemetry에 직접 물린다."
  - question: "LGTM 스택은 CNCF 프로젝트인가?"
    answer: "아니다. LGTM(Loki·Grafana·Tempo·Mimir)은 Grafana Labs가 만든 관측성 스택이라 CNCF가 호스팅하지 않는다. 다만 CNCF 표준인 Prometheus와 OpenTelemetry가 내보내는 데이터를 받아 저장하고 시각화하도록 설계돼 있어, 실무에서는 CNCF 프로젝트와 짝을 이뤄 쓴다."
---

사내 인프라가 Kubernetes로 넘어간다는 공지를 처음 받았을 때, 나는 내 Spring Boot 코드는 그대로일 거라고 생각했다. `jar` 하나 잘 말아서 넘기면 나머지는 플랫폼 팀이 알아서 하겠지. 착각이었다.

며칠 만에 슬랙 채널마다 낯선 단어가 날아다니기 시작했다. Kubernetes, Helm, Prometheus, Grafana, Loki, OpenTelemetry, Istio, Argo, KEDA, cert-manager. 옆 팀은 Istio를 깐다고 하고, 플랫폼 팀은 GitOps로 배포하라 하고, 관측성 팀은 OTel로 계측부터 하라고 했다. 나는 그중 절반이 서로 무슨 관계인지도 몰랐다. 이게 다 하나의 세계에 속한 건지, 아니면 유행하는 도구를 각자 주워 온 건지조차 알 수 없었다.

그 혼란에서 이 시리즈가 시작됐다. 결론부터 말하면, 저 이름들은 흩어진 유행어가 아니다. Spring 앱 하나를 클라우드에 제대로 올리려 할 때 순서대로 마주치게 되는 문제들이고, 그 문제마다 붙는 표준 도구의 이름이다. 1편은 그 지도를 그린다.

## 왜 갑자기 이 많은 이름이 필요해졌나

서버 한 대에 올리던 시절엔 이런 이름들이 필요 없었다. WAR를 톰캣에 얹고, 로그는 파일로 남기고, 모니터링은 서버 CPU 그래프 하나면 충분했다. 헬스체크? 프로세스가 살아 있으면 됐다. 서비스 간 통신? 같은 JVM 안이거나, 잘해야 옆 서버로 HTTP 한 번 쏘는 정도였다.

앱을 여러 개의 파드로 쪼개서 클러스터에 뿌리는 순간, 그 한 대가 조용히 해주던 일들이 전부 밖으로 튀어나온다.

프로세스가 살아 있는 것과 요청을 받을 준비가 된 것이 다른 문제가 된다. 그래서 헬스체크를 누가 어떻게 하느냐를 정해야 한다. 로그는 더 이상 한 파일에 안 쌓이고 파드 수만큼 흩어지므로, 모아서 검색할 무언가가 필요하다. 파드가 언제든 죽고 새로 뜨니, 메트릭을 밖으로 계속 내보내지 않으면 죽은 파드의 상태는 영영 못 본다. 서비스가 여러 개로 갈라지면 그 사이 트래픽을 누가 암호화하고 재시도하고 나눠 보낼지가 새 숙제가 된다.

낯선 이름 하나하나는 이 새 숙제 하나하나에 대한 답이다. Kubernetes는 "파드를 어디에 어떻게 띄울까", Prometheus는 "흩어진 메트릭을 어떻게 긁어올까", OpenTelemetry는 "트레이스와 메트릭을 무슨 규격으로 내보낼까", Istio는 "서비스 사이 트래픽을 코드 안 건드리고 어떻게 다룰까"에 대한 답이다. 문제를 모르는 채 도구 이름만 들으면 폭격이지만, 문제를 먼저 보면 하나씩 자리를 찾는다.

## 이 이름들이 왜 한 재단에 모였나

여기서 CNCF가 나온다. 다만 주인공은 아니다.

CNCF(Cloud Native Computing Foundation)는 Linux Foundation 산하의 벤더 중립 오픈소스 재단이다. 재단 스스로는 "글로벌 기술 인프라의 핵심 컴포넌트를 호스팅한다"고 소개한다. 쉽게 말하면, 위에서 열거한 문제들을 푸는 오픈소스 프로젝트가 특정 회사에 종속되지 않고 공용 표준으로 자라도록 모아두는 곳이다. Kubernetes, Prometheus, Envoy가 여기서 컸다.

내가 이 재단을 굳이 알아야 하는 이유는 재단 자체가 대단해서가 아니라, 내가 클라우드에서 만나는 도구 대부분이 결국 이 우산 아래 있기 때문이다. 어느 클라우드를 쓰든, 어느 회사를 다니든, 배포는 Kubernetes고 메트릭은 Prometheus다. 벤더 중립이라 한 회사가 마음대로 갈아엎을 수 없고, 그래서 실무 표준이 된다. CNCF는 그 표준이 모이고 검증되는 장소일 뿐이다. 나는 이 시리즈에서 재단의 조직도나 프로젝트 등급표를 외우게 하지 않을 것이다. 참고로 프로덕션 검증이 끝난 Graduated 등급이 지금 36개쯤 되는데, 그중 Spring 워크로드에 실제로 손이 닿는 건 한 줌이다. 그 한 줌만 순서대로 만난다.

## 내가 이미 아는 Spring과 어떻게 이어지나

다행인 건, 이 낯선 이름들이 완전히 새 개념을 요구하지 않는다는 점이다. 대부분 내가 Spring에서 이미 하던 일이 인프라 층으로 자리를 옮긴 것에 가깝다.

로깅부터 그렇다. Logback으로 파일에 남기던 로그는, 클러스터에선 표준 출력으로 뱉고 수집기가 모아 검색 가능한 저장소에 쌓는다. 하던 일은 같고 목적지만 바뀐다. 설정도 그렇다. `application.yml` 과 프로파일로 환경을 가르던 걸, ConfigMap과 Secret이라는 클러스터 리소스가 이어받는다. 패키징은 `bootJar` 로 실행 가능한 jar를 만들던 흐름이 컨테이너 이미지를 굽는 단계로 한 겹 확장된다. 마이크로서비스도 마찬가지다. Spring Cloud로 서비스 디스커버리와 회로 차단기를 코드에 박던 일의 상당 부분을, 서비스 메시가 사이드카에서 대신 처리한다.

관측성은 가장 깔끔하게 이어지는 지점이다. Spring Boot 3의 Observability는 OpenTelemetry 규격에 직접 물리도록 설계돼 있어서, Micrometer가 노출한 메트릭을 Prometheus가 긁어가고 트레이스는 OTLP로 흘려보낸다. 내가 새로 배우는 게 아니라, Actuator에서 이미 켜던 스위치가 클러스터 밖의 표준과 맞물리는 것이다.

물론 이어지기만 하고 끝나면 시리즈가 필요 없다. JVM은 다른 런타임이 안 겪는 마찰을 여기서 따로 겪는다. 컨테이너 메모리 limit과 힙 크기가 어긋나 파드가 OOM으로 죽고, Knative로 scale-to-zero를 하면 JVM 기동 몇 초가 그대로 첫 요청 지연이 된다. 매 편에서 나는 같은 질문을 던질 것이다. 이 표준 도구가 Spring 워크로드에 닿을 때 무엇이 달라지는가.

## 시리즈 로드맵: 고통이 이어지는 순서로

이 시리즈는 프로젝트를 알파벳 순이나 등급 순으로 나열하지 않는다. Spring 앱을 클라우드에 올리다 보면 문제가 문제를 부른다. 앞 편에서 해결한 일이 다음 편의 새 고통을 만든다. 그 연쇄를 그대로 목차로 삼았다.

1. (이 글) 지도: 낯선 이름들이 왜 쏟아지고, 왜 한 재단에 모였고, Spring과 어떻게 잇는가
2. 올리기: 컨테이너 이미지를 굽고 Kubernetes에 파드로 띄운다. 그런데 메모리 limit과 JVM 힙이 어긋난다
3. 로그가 흩어진다: 파드 수만큼 흩어진 로그를 구조화 로깅과 Loki로 다시 한곳에 모은다
4. 상태가 안 보인다: Prometheus로 메트릭을 긁고 Grafana로 본다. Actuator가 뱉던 숫자가 대시보드가 된다
5. 요청이 경계를 넘는다: 서비스가 갈라지자 요청 하나가 여러 파드를 통과한다. 분산 추적과 OpenTelemetry로 흐름을 잇는다
6. 트래픽을 누가 지키나: mTLS, 재시도, 트래픽 분할을 코드 밖 서비스 메시로 내린다
7. 부하가 오르내린다: KEDA 이벤트 오토스케일과 Knative scale-to-zero, 그리고 JVM 콜드 스타트라는 정면 충돌
8. 배포를 손으로 못 한다: GitOps로 Git 저장소를 배포 상태의 단일 근원으로 삼는다
9. 플랫폼으로 묶는다: Dapr 사이드카, cert-manager TLS 자동화, Backstage 개발자 포털
10. AI가 옆에 온다: 같은 클러스터에 AI 워크로드가 붙을 때 내 Spring 서비스의 자리

각 편은 표준 도구의 원래 목적을 짧게 깔고, Spring 워크로드에 닿을 때 부딪히는 지점에 분량을 쓴다. 일반론은 이미 인터넷에 넘친다. 내가 채우고 싶은 건 JVM이 실제로 걸려 넘어지는 자리다.

## 다음 편

지도는 여기까지다. 솔직히 지도만 봐서는 아무 일도 안 일어난다. 낯선 이름들을 실제로 만나는 건 앱을 올리는 순간부터다. 이미지를 굽고 파드로 띄우자마자, 컨테이너 메모리 limit을 1Gi로 줬는데 JVM이 그 경계를 못 알아보고 OOM으로 죽는 첫 사고가 기다린다. 다음 편은 거기서 시작한다.

## 참고

- [CNCF: Who We Are](https://www.cncf.io/about/who-we-are/)
- [CNCF Projects](https://www.cncf.io/projects/)
- [2025 CNCF Annual Cloud Native Survey](https://www.cncf.io/announcements/2026/01/20/kubernetes-established-as-the-de-facto-operating-system-for-ai-as-production-use-hits-82-in-2025-cncf-annual-cloud-native-survey/)
- [Spring Boot Observability](https://docs.spring.io/spring-boot/reference/actuator/observability.html)
- [Grafana LGTM Stack](https://grafana.com/oss/)
