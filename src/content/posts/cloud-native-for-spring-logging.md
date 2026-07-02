---
author: 주진현
pubDatetime: 2026-06-03T09:00:00+09:00
title: "떴는데 로그가 파드마다 흩어졌다: 구조화 로깅과 Loki (Spring 개발자를 위한 클라우드 표준 3)"
featured: false
section: cloud-native
series:
  slug: cloud-native-for-spring
  order: 3
tags:
  - logging
  - loki
  - observability
  - spring-boot
  - cloud-native
description: 파드가 세 개면 kubectl logs로 에러 하나를 쫓는 것부터 한계가 온다. 매일 쓰던 Logback 텍스트 로그를 Spring Boot 구조화 로깅으로 JSON으로 바꾸고, 그 로그를 stdout으로 흘려 Loki가 라벨로 수집·조회하게 하는 길을 따라간다. 흩어진 로그를 다시 한곳에 모으는 관측성 첫 편.
faq:
  - question: "Kubernetes에서 Spring Boot 로그가 흩어지는 문제는 어떻게 해결하나?"
    answer: "파드마다 kubectl logs를 치지 말고, 앱이 로그를 stdout으로만 내보내고 수집기가 그걸 중앙으로 모으게 한다. Grafana Alloy 같은 에이전트가 클러스터의 모든 파드 로그를 긁어 Loki로 보내면, 파드가 죽어도 로그는 남고 여러 파드의 로그를 한 화면에서 조회한다. 앱은 로그를 어디에 쌓을지 신경 쓰지 않는다."
  - question: "Spring Boot에서 구조화 로깅(JSON)은 어떻게 설정하나?"
    answer: "Spring Boot 3.4부터 구조화 로깅이 내장돼서, logging.structured.format.console 속성에 포맷 id를 지정하면 콘솔 로그가 JSON으로 나온다. 지원 포맷은 ecs(Elastic Common Schema), gelf(Graylog), logstash 셋이다. 파일 로그는 logging.structured.format.file로 켠다. 별도 인코더 의존성 없이 속성 한 줄로 텍스트 로그가 기계가 읽는 JSON이 된다."
  - question: "Loki는 무엇이고 ELK(Elasticsearch)와 무엇이 다른가?"
    answer: "Loki는 Grafana Labs가 만든 로그 수집·저장 시스템으로, Prometheus에서 영감을 받았다. 핵심 차이는 인덱싱 방식이다. Loki는 로그 본문 전체를 인덱싱하지 않고 각 로그 스트림에 붙은 라벨 집합만 인덱싱한다. ELK의 Elasticsearch가 전문(full-text) 색인을 만드는 것과 대조적이라, 저장 비용이 싸고 운영이 단순한 대신 조회는 라벨로 먼저 좁힌다. 본문 검색은 여전히 된다."
  - question: "LGTM 스택에서 Loki의 역할은?"
    answer: "LGTM은 Grafana Labs의 관측성 스택으로 Loki(로그), Grafana(시각화), Tempo(추적), Mimir(메트릭)의 머리글자다. 이 중 Loki가 로그 신호를 맡아 수집·저장하고, Grafana가 그 위에서 LogQL로 조회·대시보드를 그린다. 로그를 저장하고 라벨로 인덱싱하는 저장소 역할이 Loki의 자리다. 넷 다 Grafana Labs 제품이고 CNCF 프로젝트는 아니다. 참고로 메트릭 계열의 Prometheus는 CNCF를 졸업한 프로젝트다."
---

2편에서 앱을 파드로 띄웠다. 하나로는 불안해서 replica를 3으로 늘렸다. 그때까진 좋았다. 그런데 사용자가 500을 받았다는 제보가 들어오고, 나는 로그를 보려고 습관처럼 `kubectl logs`를 쳤다. 그리고 멈칫했다. 어느 파드지?

```bash
kubectl logs my-service-7d9f8-abcde | grep ERROR
kubectl logs my-service-7d9f8-fghij | grep ERROR
kubectl logs my-service-7d9f8-klmno | grep ERROR
```

파드 세 개를 순서대로 치면서 에러 하나를 찾고 있었다. 그 요청이 어느 파드로 들어갔는지 모르니까. 그러다 파드 하나가 새로 뜨면서 이름이 바뀌면, 방금 외운 이름은 쓸모가 없어진다. 더 나쁜 건, 문제를 낸 파드가 이미 재시작돼 죽어버렸을 때다. 그 파드의 로그는 같이 사라졌다. 나는 없는 로그를 찾겠다고 살아있는 파드만 뒤지고 있었던 셈이다.

매일 쓰던 로그다. `log.info(...)`, `log.error(...)`. SLF4J로 찍고 Logback이 콘솔에 뿌리는, 손에 완전히 익은 그 로그. 로컬에선 IntelliJ 콘솔 한 창에 다 나왔고, 서버 한 대 시절엔 `tail -f app.log` 하나면 됐다. 그게 왜 갑자기 안 보이게 된 걸까.

## 서버 한 대에서 되던 게 왜 안 되나

이유는 로그를 두는 방식이 환경과 안 맞아서다.

서버 한 대 시절의 모델은 단순했다. 앱이 파일에 로그를 쌓고(`app.log`), 나는 그 서버에 SSH로 들어가 `tail`이나 `grep`으로 읽었다. 로그가 한 파일에, 한 장소에 있었으니 가능한 일이었다. 위치가 고정돼 있었다.

파드는 그 두 전제를 다 깬다. 인스턴스가 하나가 아니라 여럿이고(그래서 로그가 N갈래로 쪼개진다), 파드는 언제든 죽고 다시 뜬다(그래서 파드 안 파일에 쌓은 로그는 파드와 함께 증발한다). 로그가 여러 곳에 흩어지고, 그나마도 휘발성이 된 것이다. `kubectl logs`가 보여주는 건 살아있는 파드가 지금 기억하는 로그뿐이다.

그러니 방향은 정해진다. 로그를 파드 안에 두면 안 된다. 파드 밖 어딘가로, 죽어도 남는 곳으로, 그리고 흩어진 걸 다시 합칠 수 있는 곳으로 보내야 한다.

## 표준의 답: 구조화해서 stdout으로, 수집기가 모은다

클라우드 네이티브 환경이 이 문제에 답하는 방식은 대체로 한 모양으로 수렴한다. 세 조각이다.

첫째, 앱은 로그를 파일이 아니라 stdout으로 내보낸다. 파드 안에 쌓지 않는다. 어디에 저장할지는 앱이 정하지 않고, 그냥 표준 출력으로 흘려보낸다.

둘째, 그 로그를 기계가 읽기 좋게 구조화한다. 사람 눈에 맞춘 한 줄짜리 텍스트 대신, 필드가 나뉜 JSON으로 찍는다. 나중에 "level이 ERROR이고 특정 traceId를 가진 로그"를 검색기가 정확히 걸러낼 수 있도록.

셋째, 수집기(collector)가 클러스터의 모든 파드에서 이 stdout 로그를 긁어다 중앙 저장소로 보낸다. 파드가 죽어도 이미 밖으로 나간 로그는 남는다. 흩어졌던 N갈래가 한 저장소에서 다시 합쳐진다.

이 저장소 자리에 요즘 자주 오는 게 Grafana Loki다. Loki는 Grafana Labs가 만든, 수평 확장되고 멀티테넌트를 지원하는 로그 수집·저장 시스템이다. 공식 문서가 스스로를 설명하는 한 줄은 "Prometheus에서 영감을 받았다"이다. 여기서 Loki의 성격이 드러난다.

Loki의 핵심 결정은 로그 본문 전체를 인덱싱하지 않는다는 것이다. 대신 각 로그 스트림에 붙은 라벨 집합(예: `region`, `cluster`, `namespace`, `pod`)만 인덱싱한다. 조회할 때는 이 라벨로 먼저 후보 스트림을 좁힌 다음, 그 안에서 본문을 훑는다. 본문 검색이 안 되는 게 아니다. 라벨로 범위를 줄여서 검색을 싸고 빠르게 만드는 구조다.

이 지점이 ELK(Elasticsearch 기반 스택)와 갈리는 결정적 차이다. Elasticsearch는 로그 본문에 전문(full-text) 색인을 만든다. 강력한 대신 인덱스가 무겁고 저장·운영 비용이 크다. Loki는 그 색인을 라벨로만 최소화한다. 그래서 문서 표현대로 "매우 비용 효율적이고 운영이 쉽게" 설계됐다. 뭘 포기하고 뭘 얻는지가 분명한 트레이드오프다.

수집기 쪽에서 Loki가 미는 건 Grafana Alloy다. Alloy를 클러스터에 데몬으로 깔면 파드 로그를 발견해 긁고, 라벨을 붙여 Loki로 밀어 넣는다. 조회는 Grafana에서 한다. Grafana에 Loki를 데이터 소스로 연결하고 Explore 화면에서 LogQL이라는 질의 언어로 로그를 뒤진다. 이제 파드 이름을 외울 필요가 없다. `{app="my-service"} |= "ERROR"` 한 줄이면 세 파드의 ERROR가 한 화면에 모인다.

### LGTM 한 덩어리, 그런데 Loki는 CNCF가 아니다

Loki를 얘기하면 자연스럽게 LGTM이 따라온다. Grafana Labs의 관측성 스택을 부르는 이름이고, 네 제품의 머리글자다.

- L: Loki(로그)
- G: Grafana(시각화·대시보드)
- T: Tempo(분산 추적)
- M: Mimir(메트릭 장기 저장)

로그, 추적, 메트릭이라는 관측성 세 신호에 각각 저장소를 두고, Grafana가 그 위에서 다 같이 조회하는 그림이다. 넷 다 Grafana Labs가 만든 오픈소스다.

여기서 한 가지는 짚고 가는 게 좋다. Loki, Tempo, Mimir는 CNCF 프로젝트가 아니다. Grafana Labs 자사 제품이다. 헷갈리기 쉬운 게, 바로 옆 동네인 메트릭의 Prometheus는 CNCF를 졸업한(Kubernetes에 이어 두 번째로 졸업한) 프로젝트라서다. 그래서 "관측성 = CNCF"라고 뭉뚱그리면 Loki의 소속을 틀리게 안다. 널리 쓰인다는 것과 CNCF 소속이라는 건 별개다. Loki는 CNCF 밖에 있으면서도 로그 저장소 선택지에서 사실상 기본값처럼 자주 거론되는 쪽이다.

## Spring 접점: Logback을 JSON으로 바꾸는 건 속성 한 줄

여기까지 읽으면 걱정이 하나 생긴다. 그럼 우리 앱 로깅을 다 갈아엎어야 하나. logstash-logback-encoder 같은 라이브러리를 물고, `logback-spring.xml`에 인코더를 붙이고, 필드를 손으로 매핑하고. 예전엔 그랬다.

그런데 Spring Boot 3.4부터 구조화 로깅이 프레임워크에 내장됐다. 별도 인코더 의존성 없이, 속성 하나로 콘솔 로그를 JSON으로 바꾼다. 3.4 릴리스 노트가 명시하는 지원 포맷은 셋이다. `ecs`(Elastic Common Schema), `gelf`(Graylog Extended Log Format), `logstash`.

켜는 법은 이게 전부다.

```yaml file="application.yml"
logging:
  structured:
    format:
      console: ecs # 콘솔(stdout)을 ECS JSON으로
```

콘솔용은 `logging.structured.format.console`, 파일용은 `logging.structured.format.file`에 포맷 id를 준다. 우리는 stdout으로 흘려보낼 거니 `console`만 켜면 된다. 이 한 줄로 그동안 익숙하던 텍스트 로그가 한 줄에 JSON 객체 하나씩 찍히는 형태로 바뀐다. 개념적으로는 이런 모양이다(필드 이름은 고른 포맷에 따라 다르다).

```json
{"@timestamp":"2026-06-03T00:00:00Z","log.level":"ERROR","message":"payment failed","log.logger":"com.example.PaymentService","ecs.version":"8.11"}
```

코드는 안 바꾼다. `log.error("payment failed")`는 그대로 두고, 출력 형식만 프레임워크가 JSON으로 만든다. 로컬에서 개발할 땐 사람이 읽는 텍스트로, 배포 프로파일에선 JSON으로. 프로파일별로 이 속성만 갈아끼우면 된다.

한 가지 더. ECS 포맷은 MDC(Mapped Diagnostic Context)에 담긴 키·값을 JSON 객체에 그대로 넣어준다. 이게 왜 중요하냐면, 여기에 요청별 식별자를 얹을 수 있어서다. 지금은 "특정 파드의 ERROR"까지 좁혔지만, 하나의 요청이 여러 서비스를 거칠 때 그 요청 전체를 하나로 꿰는 건 아직 못 한다. 그 실을 꿰는 게 trace id이고, 로그의 MDC에 trace id를 얹어 추적과 로그를 잇는 이야기는 이 시리즈 뒤쪽 추적 편에서 따로 다룬다. 지금은 "구조화하면 그런 확장이 열린다"만 기억해두면 된다.

## 정리

흩어진 로그 문제의 답은 세 조각이었다. 로그를 파드 안 파일이 아니라 stdout으로 내보내고, 사람이 아니라 기계가 읽도록 JSON으로 구조화하고, 수집기(Alloy)가 모든 파드에서 긁어 중앙 저장소(Loki)로 모은다. 그러면 파드가 죽어도 로그는 남고, 파드 이름을 외우는 대신 Grafana에서 LogQL 한 줄로 세 파드의 로그를 한 화면에 모은다. Spring 쪽 진입 비용은 생각보다 작았다. 3.4부터는 `logging.structured.format.console` 속성 한 줄이면 된다.

## 다음 편

로그를 모으고 나니 개별 사건은 잘 보인다. "3시 12분에 결제 서비스가 이 에러를 냈다"까지는 로그로 정확히 짚는다. 그런데 정작 답이 안 나오는 질문이 남는다. 지금 이 시스템 전체가 건강한가? 에러율이 어제보다 오르는 추세인가, 응답 시간의 분포가 어떻게 되나, 트래픽이 어느 시점에 튀었나. 이건 로그 한 줄 한 줄을 아무리 뒤져도 안 보인다. 개별 사건이 아니라 추이와 분포를 보는 눈이 따로 필요하다. 다음 편은 그 눈, 메트릭 이야기다.

## 참고

- [Logging · Spring Boot Reference](https://docs.spring.io/spring-boot/reference/features/logging.html)
- [Structured Logging · Spring Boot Reference](https://docs.spring.io/spring-boot/reference/features/logging.html#features.logging.structured)
- [Spring Boot 3.4 Release Notes · GitHub Wiki](https://github.com/spring-projects/spring-boot/wiki/Spring-Boot-3.4-Release-Notes)
- [Get started with Grafana Loki](https://grafana.com/docs/loki/latest/get-started/)
- [Open Source · Grafana Labs](https://grafana.com/oss/)
- [Prometheus · CNCF Graduated Project](https://www.cncf.io/projects/prometheus/)
