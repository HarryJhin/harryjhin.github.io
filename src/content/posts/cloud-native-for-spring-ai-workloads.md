---
author: 주진현
pubDatetime: 2026-06-10T09:00:00+09:00
title: "옆 노드에 GPU가 붙었다: AI 시대의 Spring 앱 (Spring 개발자를 위한 클라우드 표준 10)"
featured: false
section: cloud-native
series:
  slug: cloud-native-for-spring
  order: 10
tags:
  - kubernetes
  - ai
  - kserve
  - spring-ai
  - cloud-native
description: Kubernetes가 AI의 사실상 운영체제가 됐다. KServe·llm-d가 모델을 서빙하고 DRA가 GPU를 할당하는 이 위에서, JVM은 모델을 돌리는 자리가 아니다. Spring AI와 LangChain4j로 그 모델을 호출하는 애플리케이션 층을 맡는다. 아홉 편의 고통을 지나온 자리에서 JVM이 클라우드 네이티브 지도 위에 서는 위치를 확인하며 시리즈를 닫는다.
faq:
  - question: "왜 Kubernetes가 AI의 운영체제로 불리나?"
    answer: "2025 CNCF 연례 설문(2026년 1월 발표)에서 컨테이너 사용자의 82%가 프로덕션에서 Kubernetes를 쓰고, 생성형 AI 모델을 호스팅하는 조직의 66%가 추론의 일부 또는 전부를 Kubernetes 위에서 돌린다고 답했다. CNCF는 이를 'Kubernetes가 AI의 사실상 운영체제가 됐다'고 정리했다. 2025년 11월 출범한 Certified Kubernetes AI Conformance 프로그램과 2026년 3월의 인증 플랫폼 확대도 이 흐름을 뒷받침한다."
  - question: "AI 워크로드 시대에 JVM 백엔드의 역할은?"
    answer: "JVM은 모델 런타임이 아니다. 모델 추론은 보통 Python·CUDA 스택(vLLM 등)이 KServe나 llm-d 위에서 돌린다. JVM은 그 위의 애플리케이션 층인 오케스트레이션, RAG, 비즈니스 로직, API 서비스를 맡아 모델 서버를 네트워크로 호출한다. Spring AI와 LangChain4j가 이 JVM 측 추상을 제공하며, 둘은 같은 Kubernetes 클러스터 안에서 이웃으로 공존한다."
  - question: "Kubernetes에서 AI 모델 서빙(KServe)은 vLLM과 어떻게 다른가?"
    answer: "둘은 경쟁이 아니라 계층 관계다. vLLM은 LLM 추론을 빠르게 돌리는 엔진이고, KServe는 그 엔진을 감싸 서빙하는 플랫폼이다. KServe의 Hugging Face 런타임은 기본 backend로 vLLM을 써서 모델을 서빙하고, 모델 배포·오토스케일·카나리·다중 노드 분산 서빙은 KServe가, 토큰 생성 최적화는 vLLM이 맡는다. 모델이 vLLM에서 미지원이면 표준 Hugging Face backend로 자동 폴백한다."
  - question: "Spring AI와 LangChain4j 차이는 무엇인가?"
    answer: "Spring Boot 스택에 이미 들어와 있고 익숙한 방식으로 모델을 부르고 싶으면 Spring AI(2025년 5월 1.0 GA)가 자연스럽다. 더 많은 공급자(20개 넘는 LLM 공급자, 30개 넘는 임베딩 스토어)를 한 API로 묶고 싶으면 LangChain4j가 폭이 넓다. 둘 다 추론은 vLLM·KServe에 맡기고 JVM 측 추상만 제공한다."
  - question: "GPU 스케줄링 DRA란 무엇인가?"
    answer: "DRA(Dynamic Resource Allocation)가 GPU 같은 특수 하드웨어 할당을 담당한다. DRA의 core는 Kubernetes 1.34(2025년 8월)에서 GA됐고, 이후 버전에서 드라이버와 기능이 계속 더해지는 중이며 일부 서브 기능은 아직 beta 단계다. GPU 노드가 클러스터에 들어오면 DRA가 그 자원을 스케줄링 결정에 반영하고, Spring 서비스 같은 일반 워크로드는 그 옆에서 자원을 나눠 쓰는 이웃이 된다."
---

지난 편 끝에서 나는 클러스터 노드 목록에서 낯선 라벨 하나를 봤다고 썼다. `nvidia.com/gpu`. 다음 주, 그 라벨이 붙은 노드에 실제로 파드가 하나 떴다. 이름은 `llm-inference`. 내 서비스가 있는 네임스페이스는 아니었지만 클러스터는 같았다.

문제는 그다음이었다. 배포 파이프라인이 한 번 돌았는데, 내 결제 서비스 파드 하나가 다른 노드로 재배치됐다. 원인을 찾아보니 GPU 노드 근처의 자원을 그 추론 파드가 크게 잡고 있었고, 스케줄러가 내 워크로드를 밀어낸 거였다. 서비스는 멀쩡히 다시 떴다. 그런데 그 순간 알았다. 이 클러스터에 이제 나와 완전히 다른 방식으로 자원을 쓰는 이웃이 들어왔다는 걸.

아홉 편에 걸쳐 배포하고 관측하고 메시를 깔고 스케일을 맞추고 플랫폼으로 묶은 건 내 서비스만을 위한 준비였다. 그런데 그 준비가 끝나자마자, 같은 클러스터를 완전히 다른 방식으로 쓰는 워크로드가 옆에 왔다. AI 추론이다. 이 마지막 편은 그 이웃이 누구고, 내 Spring 서비스는 그 옆에서 뭘 하면 되는지를 본다. 그리고 이 지점에서 시리즈를 닫는다.

## 2026년: AI가 Kubernetes로 모였다

먼저 현재를 정확히 보자. 2025 CNCF 연례 설문(2026년 1월 발표)의 그림은 분명하다.

- 컨테이너 사용자의 82%가 프로덕션에서 Kubernetes를 쓴다.
- 생성형 AI 모델을 호스팅하는 조직의 66%가 추론의 일부 또는 전부를 Kubernetes 위에서 돌린다.

CNCF가 "Kubernetes가 AI의 사실상 운영체제"라고 정리한 근거다. 2025년 11월 KubeCon NA에서는 AI 워크로드를 어느 K8s에서나 똑같이 돌리기 위한 **Certified Kubernetes AI Conformance** 프로그램이 출범했고, 2026년 3월엔 인증 플랫폼이 두 배 가까이 늘었다.

그 위에서 모델을 다루는 프로젝트들도 자리를 잡았다.

- **KServe**: 모델 추론 플랫폼. 모델 서빙, 오토스케일, ML/LLM 모델의 카나리 롤아웃을 한다. 2025년 9월 CNCF Incubating으로 합류했다.
- **Kubeflow**: ML 파이프라인·MLOps 플랫폼. Incubating이다.
- **vLLM**: 오픈소스 LLM 추론 엔진. 사실상 표준급으로 쓰인다.
- **llm-d**: vLLM과 Kubernetes 위에 분산 LLM 추론을 올리는 CNCF Sandbox 프로젝트. Red Hat·Google·IBM·NVIDIA 등이 함께 만든다.

하드웨어 쪽도 메워졌다. GPU 같은 특수 자원 할당을 맡는 DRA(Dynamic Resource Allocation)의 core가 Kubernetes 1.34(2025년 8월)에서 GA됐다. 이후 버전에서 드라이버와 기능이 계속 더해지는 중이다(일부 서브 기능은 아직 beta다). 2부에서 메모리 limit을 이야기했는데, 이제 그 옆에 GPU 할당이라는 차원이 하나 더 붙은 셈이다.

여기까지 보면 자연스러운 불안이 든다. 이건 다 Python의 세계 아닌가. 모델은 PyTorch로 짜고 CUDA로 돌린다. JVM은 어디 있나.

## JVM은 모델 런타임이 아니다. 그게 핵심이다

답부터 말하면, JVM은 모델을 돌리는 자리가 아니다. 그 자리는 Python·CUDA 스택이 KServe나 llm-d 위에서 가져간다. 이걸 두고 "JVM은 AI 시대에 밀렸다"고 읽으면 그림을 절반만 본 것이다.

AI 기능을 제품에 넣는다고 해보자. 사용자 질문을 받아, 권한을 확인하고, 사내 문서에서 맥락을 검색하고(RAG), 그걸 모델에 보내 답을 받고, 결과를 후처리해 응답한다. 이 흐름에서 모델 추론은 한 단계다. 나머지 전부, 그러니까 요청 처리, 인증·인가, 데이터 접근, 비즈니스 규칙, 트랜잭션, 오케스트레이션은 애플리케이션 층이다. 그리고 그 층은 지난 20년간 JVM이 가장 잘해온 일이다.

즉 AI 인프라 위에서 JVM의 자리는 모델을 호출하는 애플리케이션이다. 모델 서버는 네트워크 너머에 있고, JVM 서비스가 그걸 부른다. 둘은 같은 Kubernetes 클러스터에서 이웃으로 공존한다. 지난 편 끝에서 본 그 GPU 라벨과, 이 글 서두에서 밀려난 내 파드가 정확히 이 그림이다. 인프라는 자원을 나눠 쓰는 이웃이 됐고, 애플리케이션은 그 이웃을 네트워크로 부른다.

JVM 진영도 이 자리를 비워두지 않았다.

- **Spring AI**: 2025년 5월 1.0 GA, 11월 1.1 GA. LLM 공급자 추상화, RAG와 벡터 스토어, 도구 호출(tool calling), 그리고 MCP 지원까지. Spring 개발자가 익숙한 방식으로 모델을 부른다.
- **LangChain4j**: JVM용 LLM 라이브러리. 20개 넘는 공급자와 30개 넘는 임베딩 스토어를 한 API로 묶는다.

흥미로운 건, 이 라이브러리들이 모델을 직접 돌리지 않는다는 점이다. 추론은 vLLM·KServe에 맡기고, JVM은 그 위에서 검색하고 조립하고 규칙을 건다. 역할 분담이 깔끔하다. Python이 모델을 굴리고, JVM이 그 주위의 제품을 짠다.

## 아홉 편의 고통, 하나의 지도

*Spring 개발자를 위한 클라우드 표준* 시리즈는 CNCF 프로젝트를 등급순으로 훑지 않았다. Spring Boot 컨테이너 하나를 프로덕션까지 끌고 가는 동안 실제로 부딪히는 고통만, 그 고통이 다음 고통을 부르는 순서로 봤다.

이미지를 굽고 파드로 띄우자(2부) 컨테이너 메모리 limit과 JVM 힙이 어긋나 OOMKilled가 났다. 그 사고를 잡고 나니 파드 수만큼 흩어진 로그를 어디서 봐야 하는지가 새 문제였다(3부). 로그를 모으고 나니 "지금 우리 서비스 괜찮아요?"라는 질문에 로그만으론 답을 못 한다는 게 드러났다(4부). 메트릭으로 이상을 잡아도 그 이상이 어느 서비스에서 시작됐는지는 지표 하나로 안 갈렸다(5부). 서비스가 갈라지며 재시도와 mTLS를 서비스마다 복붙하던 반복은 서비스 메시로 인프라에 내렸다(6부). 트래픽은 출렁이는데 파드 수는 고정이라는 문제 앞에서 KEDA와 Knative를 붙였고, 그 대가로 JVM 콜드 스타트라는 가장 날카로운 약점과 정면으로 만났다(7부). 배포만은 여전히 누군가 터미널을 열어야 끝난다는 사실을 GitOps로 지웠다(8부). 그리고 배포·관측·메시·스케일을 서비스가 늘 때마다 다시 세우던 반복을 Dapr·cert-manager·Backstage로 없앴다(9부).

그 사이 관통하는 주제가 하나 있었다. JVM은 클라우드 네이티브보다 먼저 태어났고, 그래서 곳곳에서 마찰을 일으킨다. 힙과 RSS의 어긋남, 느린 콜드 스타트, 파드당 프록시 메모리. 처음엔 이게 JVM의 약점처럼 보였다. 그런데 아홉 편을 쓰고 보니 그 마찰은 약점이라기보다 디테일이 몰리는 자리였다. 안 맞는 두 세계가 만나는 경계마다 실무가 쌓여 있었고, JVM 생태계는 그 경계마다 답을 만들어 왔다. container-aware JVM, CRaC, AOT 캐시, 그리고 이번 편의 Spring AI까지.

그 준비가 끝나자마자 클러스터에 새 이웃이 들어왔다. AI 추론이다. 그런데 이 편에서 본 것처럼 지도 자체는 안 바뀐다. Kubernetes는 여전히 파드를 어디에 띄울지 정하는 자리이고, DRA는 그 결정에 GPU라는 차원 하나를 더했을 뿐이다. 다만 이번엔 내 Spring 서비스가 그 자원을 직접 붙잡는 대신, 모델 서버를 네트워크로 부르는 이웃으로 옆에 선다.

1부에서 나는 슬랙 채널에 낯선 이름이 날아다녔고, 그중 절반이 서로 무슨 관계인지도 몰랐다고 썼다. 아홉 편을 지나며 그 이름들은 더 이상 낯설지 않다. Kubernetes, Prometheus, OpenTelemetry, Istio, KEDA, Argo CD, Dapr, cert-manager, Backstage, 그리고 이제 KServe와 DRA까지. 전부 같은 질문 하나에 대한 답이었다. Spring 앱을 로컬 한 대 밖으로 옮길 때 조용히 사라지던 것들을, 이제 누가 대신 책임지는가. *Spring 개발자를 위한 클라우드 표준* 10부작은 그 질문에 답하며 여기서 끝난다.

## 참고

- [2025 CNCF Annual Cloud Native Survey](https://www.cncf.io/announcements/2026/01/20/kubernetes-established-as-the-de-facto-operating-system-for-ai-as-production-use-hits-82-in-2025-cncf-annual-cloud-native-survey/)
- [KServe · CNCF Project](https://www.cncf.io/projects/kserve/)
- [Kubernetes v1.34 Release](https://kubernetes.io/blog/2025/08/27/kubernetes-v1-34-release/)
- [Kubernetes v1.34: DRA Updates](https://kubernetes.io/blog/2025/09/01/kubernetes-v1-34-dra-updates/)
- [Spring AI 1.1 GA Released](https://spring.io/blog/2025/11/12/spring-ai-1-1-GA-released/)
- [LangChain4j](https://docs.langchain4j.dev/intro/)
