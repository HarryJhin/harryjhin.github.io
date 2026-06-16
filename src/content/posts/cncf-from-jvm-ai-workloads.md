---
author: 주진현
pubDatetime: 2026-06-16T10:30:00+09:00
title: "AI 워크로드 시대의 JVM (JVM에서 본 클라우드 네이티브 10)"
featured: false
section: cloud-native
series:
  slug: cncf-from-jvm
  order: 10
tags:
  - kubernetes
  - ai
  - kserve
  - spring-ai
  - cloud-native
description: 2026년 클라우드 네이티브의 헤드라인은 AI다. Kubernetes가 AI의 사실상 운영체제가 됐고, KServe·llm-d·DRA가 그 위에서 모델을 서빙한다. 그렇다면 모델 런타임이 아닌 JVM의 자리는 어디인가. Spring AI와 LangChain4j가 그리는 애플리케이션 층의 답으로 10부작을 닫는다.
faq:
  - question: "왜 Kubernetes가 AI의 운영체제로 불리나?"
    answer: "2025 CNCF 연례 설문(2026년 1월 발표)에서 컨테이너 사용자의 82%가 프로덕션에서 Kubernetes를 쓰고, 생성형 AI 모델을 호스팅하는 조직의 66%가 추론의 일부 또는 전부를 Kubernetes 위에서 돌린다고 답했다. CNCF는 이를 'Kubernetes가 AI의 사실상 운영체제가 됐다'고 정리했다."
  - question: "AI 워크로드 시대에 JVM의 역할은?"
    answer: "JVM은 모델 런타임이 아니다. 모델 추론은 보통 Python·CUDA 스택(vLLM 등)이 KServe나 llm-d 위에서 돌린다. JVM은 그 위의 애플리케이션 층 — 오케스트레이션, RAG, 비즈니스 로직, API 서비스 — 을 맡아 모델 서버를 네트워크로 호출한다. Spring AI와 LangChain4j가 이 JVM 측 추상을 제공한다."
  - question: "Spring AI와 LangChain4j 중 무엇을 쓰나?"
    answer: "Spring Boot 스택에 이미 들어와 있고 익숙한 방식으로 모델을 부르고 싶으면 Spring AI(2025년 5월 1.0 GA)가 자연스럽다. 더 많은 공급자(20개 넘는 LLM 공급자, 30개 넘는 임베딩 스토어)를 한 API로 묶고 싶으면 LangChain4j가 폭이 넓다. 둘 다 추론은 vLLM·KServe에 맡기고 JVM 측 추상만 제공한다."
  - question: "Kubernetes에서 GPU는 어떻게 할당하나?"
    answer: "DRA(Dynamic Resource Allocation)가 GPU 같은 특수 하드웨어 할당을 담당한다. DRA의 core는 Kubernetes 1.34(2025년 9월)에서 GA됐고 이후 버전에서 드라이버와 기능이 더해지는 중이다. 일부 서브 기능은 아직 beta 단계다."
---

1부에서 약속을 하나 미뤄뒀다. "Kubernetes가 AI의 운영체제가 됐다"는 2026년의 헤드라인을 던지고는, JVM 개발자와 무슨 상관이냐는 질문에 "마지막 10부에서 판다"고 했다. 이제 그 약속을 회수한다. 그리고 이 시리즈를 닫는다.

## 2026년: AI가 Kubernetes로 모였다

먼저 현재를 정확히 보자. 2025 CNCF 연례 설문(2026년 1월 발표)의 그림은 분명하다.

- 컨테이너 사용자의 **82%**가 프로덕션에서 Kubernetes를 쓴다.
- 생성형 AI 모델을 호스팅하는 조직의 **66%**가 추론의 일부 또는 전부를 Kubernetes 위에서 돌린다.

CNCF가 "Kubernetes가 AI의 사실상 운영체제"라고 정리한 근거다. 2025년 11월 KubeCon NA에서는 AI 워크로드를 어느 K8s에서나 똑같이 돌리기 위한 **Certified Kubernetes AI Conformance** 프로그램이 출범했고, 2026년 3월엔 인증 플랫폼이 두 배 가까이 늘었다.

그 위에서 모델을 다루는 프로젝트들도 자리를 잡았다.

- **KServe**: 모델 추론 플랫폼. 모델 서빙, 오토스케일, ML/LLM 모델의 카나리 롤아웃을 한다. 2025년 9월 CNCF Incubating으로 합류했다.
- **Kubeflow**: ML 파이프라인·MLOps 플랫폼. Incubating이다.
- **vLLM**: 오픈소스 LLM 추론 엔진. 사실상 표준급으로 쓰인다.
- **llm-d**: vLLM과 Kubernetes 위에 분산 LLM 추론을 올리는 CNCF Sandbox 프로젝트. Red Hat·Google·IBM·NVIDIA 등이 함께 만든다.

하드웨어 쪽도 메워졌다. GPU 같은 특수 자원 할당을 맡는 **DRA(Dynamic Resource Allocation)**의 core가 Kubernetes 1.34(2025년 9월)에서 GA됐다. 이후 버전에서 드라이버와 기능이 계속 더해지는 중이다(일부 서브 기능은 아직 beta다). 2부에서 메모리 limit을 이야기했는데, 이제 그 옆에 GPU 할당이라는 차원이 하나 더 붙은 셈이다.

여기까지 보면 자연스러운 불안이 든다. 이건 다 Python의 세계 아닌가. 모델은 PyTorch로 짜고 CUDA로 돌린다. JVM은 어디 있나.

## JVM은 모델 런타임이 아니다. 그게 핵심이다

답부터 말하면, JVM은 모델을 돌리는 자리가 아니다. 그 자리는 Python·CUDA 스택이 KServe나 llm-d 위에서 가져간다. 이걸 두고 "JVM은 AI 시대에 밀렸다"고 읽으면 그림을 절반만 본 것이다.

AI 기능을 제품에 넣는다고 해보자. 사용자 질문을 받아, 권한을 확인하고, 사내 문서에서 맥락을 검색하고(RAG), 그걸 모델에 보내 답을 받고, 결과를 후처리해 응답한다. 이 흐름에서 **모델 추론은 한 단계**다. 나머지 전부 — 요청 처리, 인증·인가, 데이터 접근, 비즈니스 규칙, 트랜잭션, 오케스트레이션 — 는 애플리케이션 층이다. 그리고 그 층은 지난 20년간 JVM이 가장 잘해온 일이다.

즉 AI 인프라 위에서 JVM의 자리는 **모델을 호출하는 애플리케이션**이다. 모델 서버는 네트워크 너머에 있고, JVM 서비스가 그걸 부른다. 둘은 같은 Kubernetes 클러스터에서 이웃으로 공존한다. 1부 NOTE에서 "같은 클러스터에 GPU 노드가 붙고 추론 사이드카가 끼는 순간, 내 Spring 서비스도 그 인프라 위에서 자원을 나눠 쓰는 이웃이 된다"고 했던 게 이거다.

JVM 진영도 이 자리를 비워두지 않았다.

- **Spring AI**: 2025년 5월 1.0 GA, 11월 1.1 GA. LLM 공급자 추상화, RAG와 벡터 스토어, 도구 호출(tool calling), 그리고 MCP 지원까지. Spring 개발자가 익숙한 방식으로 모델을 부른다.
- **LangChain4j**: JVM용 LLM 라이브러리. 20개 넘는 공급자와 30개 넘는 임베딩 스토어를 한 API로 묶는다.

흥미로운 건, 이 라이브러리들이 모델을 직접 돌리지 않는다는 점이다. 추론은 vLLM·KServe에 맡기고, JVM은 그 위에서 검색하고 조립하고 규칙을 건다. 역할 분담이 깔끔하다. Python이 모델을 굴리고, JVM이 그 주위의 제품을 짠다.

## 다섯 층을 돌아보며

*JVM에서 본 클라우드 네이티브* 시리즈는 Spring Boot 컨테이너 하나를 프로덕션까지 끌고 가는 동안 닿는 것만, 닿는 순서대로 봤다. CNCF를 백과사전식으로 훑지 않겠다고 1부에서 말한 대로다. 다섯 층이었다.

배포(2~4부)에서 컨테이너 메모리와 JVM 힙이 어긋나 OOMKilled가 나는 자리를 풀고, 이미지를 Dockerfile 없이 만들고, GitOps로 손배포를 없앴다. 관측(5~6부)에서 OpenTelemetry로 계측을 백엔드에서 떼어내고 Prometheus로 측정해 추측을 그래프로 바꿨다. 메시(7부)에서 Resilience4j를 인프라로 내리되 사이드카 오버헤드가 메모리 무거운 JVM에 겹친다는 걸 봤다. 스케일(8부)에서 콜드 스타트라는 JVM의 가장 날카로운 약점과, 그걸 깎는 GraalVM·CRaC·AOT 캐시를 봤다. 플랫폼(9부)에서 Dapr·cert-manager·Backstage로 여러 서비스를 한 플랫폼으로 묶었다.

관통하는 주제가 하나 있었다. JVM은 클라우드 네이티브보다 먼저 태어났고, 그래서 곳곳에서 마찰을 일으킨다. 힙과 RSS의 어긋남, 느린 콜드 스타트, 파드당 프록시 메모리. 처음엔 이게 JVM의 약점처럼 보인다.

그런데 시리즈를 다 쓰고 보니 생각이 좀 다르다. 그 마찰은 약점이라기보다 **디테일이 몰리는 자리**였다. 안 맞는 두 세계가 만나는 경계마다 실무가 쌓여 있었고, JVM 생태계는 그 경계마다 답을 만들어 왔다. container-aware JVM, CRaC, AOT 캐시, Spring AI. 다른 런타임이 안 겪는 문제를 겪는다는 건, 다른 런타임이 안 만드는 도구를 만든다는 뜻이기도 하다.

AI 시대에도 그 자리는 안 사라진다. 모델은 Python이 돌리겠지만, 그 모델을 제품으로 만드는 애플리케이션 층은 여전히 누군가 짜야 한다. JVM은 거기 있다. 클라우드 네이티브의 한복판에서, 모델 서버의 이웃으로.

이걸로 *JVM에서 본 클라우드 네이티브* 10부작을 닫는다. 다음에 Spring 서비스를 클러스터에 올릴 때, 이 지도가 한 장 펼쳐져 있길.

## 참고

- [2025 CNCF Annual Cloud Native Survey](https://www.cncf.io/announcements/2026/01/20/kubernetes-established-as-the-de-facto-operating-system-for-ai-as-production-use-hits-82-in-2025-cncf-annual-cloud-native-survey/)
- [KServe — CNCF Project](https://www.cncf.io/projects/kserve/)
- [Kubernetes v1.34: DRA Updates](https://kubernetes.io/blog/2025/09/01/kubernetes-v1-34-dra-updates/)
- [Spring AI 1.1 GA Released](https://spring.io/blog/2025/11/12/spring-ai-1-1-GA-released/)
- [LangChain4j](https://docs.langchain4j.dev/intro/)
