---
author: 주진현
pubDatetime: 2026-06-14T13:00:00+09:00
title: "RFC란 무엇인가 — 인터넷이 합의에 도달하는 방법"
featured: false
section: web
tags:
  - rfc
  - ietf
  - http
  - web
  - standards
description: HTTP·TCP·TLS·이메일이 전부 RFC다. "Request for Comments"라는 겸손한 이름의 문서가 어떻게 인터넷의 표준이 되는지, 누가 어떻게 만들고, 개발자가 RFC를 직접 읽을 때 알아야 할 최소한을 정리한다.
---

Spring Boot 4 시리즈를 쓰는 내내 RFC 번호가 따라붙었다. 9457, 9745, 8288, 9110. 그런데 막상 "RFC가 뭐냐"고 물으면 한 문장으로 답하기가 의외로 까다롭다. 표준 문서? 제안서? 둘 다 맞으면서 둘 다 아니다.

RFC 하나를 실제로 열어보면 더 헷갈린다. [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html)은 HTTP의 의미론을 정의하는, 우리가 매일 의존하는 핵심 문서다. 그런데 제목 위에는 "Request for Comments" — 코멘트 요청 — 이라고 적혀 있다. 의견 좀 주세요, 라는 이름의 문서가 어떻게 전 세계 웹 서버가 따르는 법이 됐을까.

## 이름이 거짓말을 한다

1969년 4월 7일, UCLA 대학원생이던 Steve Crocker가 ARPANET 호스트 간 통신 소프트웨어를 설명하는 메모를 썼다. 이게 [RFC 1](https://www.rfc-editor.org/rfc/rfc1)이다.

그는 이 문서를 "Request for Comments"라고 불렀다. 이유가 재밌다. 너무 단정적으로 들리지 않으려고, 토론을 유도하려고 일부러 겸손한 이름을 골랐다. 당시엔 누가 권위를 가졌는지도 불분명했고, 학생들이 네트워크 설계를 적어 돌리는 분위기였으니까. Crocker 본인은 후에 RFC 1을 "소박하고 완전히 잊어도 좋을 메모"라고 회고했다.

그런데 이 이름이 60년 가까이 살아남았다. 지금 RFC는 더 이상 "코멘트 요청"이 아니다. TCP, IP, HTTP, TLS, DNS, 이메일(SMTP), JSON — 인터넷을 굴리는 거의 모든 프로토콜이 RFC로 정의돼 있다. 이름은 초대장인데, 내용물은 헌법에 가깝다.

이 간극이 RFC를 이해하는 첫 열쇠다. RFC는 **위에서 내려주는 표준이 아니라, 아래에서 합의로 올라온 표준**이다. 그래서 겸손한 이름을 끝내 안 바꿨다.

## "왕도 대통령도 투표도 거부한다"

그럼 합의는 어떻게 이뤄질까. IETF(Internet Engineering Task Force)의 의사결정 철학을 David Clark가 1992년 한 문장으로 박제했다.

> We reject kings, presidents and voting. We believe in rough consensus and running code.
> 우리는 왕도, 대통령도, 투표도 거부한다. 우리는 대략적 합의와 돌아가는 코드를 믿는다.

이게 단순한 슬로건이 아니라 실제 작동 방식이다.

**Rough consensus(대략적 합의)** — 만장일치가 아니다. 한 명이나 소수가 떼써서 전체를 막을 수 없게 하되, 반대 의견은 "그냥 싫다"가 아니라 기술적 근거가 있어야 한다. 워킹그룹은 반대를 정직하게 검토했는지, 기술적 쟁점을 다 다뤘는지를 기준으로 합의 도달 여부를 판단한다. 손 들어 다수결 하는 게 아니다.

**Running code(돌아가는 코드)** — 종이 위 논쟁보다 실제 구현이 이긴다. 두 진영이 싸우면, 둘 다 만들어서 돌려보고 되는 쪽을 택하는 문화다. 이론적 우아함보다 상호운용성이 우선이다.

이 두 원칙이 합쳐지면, RFC는 "권위자가 승인한 것"이 아니라 "여러 사람이 실제로 구현해서 맞물리는 것"이 된다. 표준이 상호운용성을 공짜로 주는 이유가 여기 있다.

## RFC 한 장이 세상에 나오기까지

흐름은 대략 이렇다.

1. **Internet-Draft(I-D)** — 누구든 초안을 제출할 수 있다. 이건 아무 공식 지위가 없다. 작성자가 언제든 바꾸거나 버릴 수 있고, 6개월 지나면 만료된다. "모든 RFC는 한때 I-D였지만, 모든 I-D가 RFC가 되진 않는다."
2. **워킹그룹 + IETF 논의** — 관심 있는 사람들이 메일링 리스트와 회의에서 다듬는다. rough consensus를 향해 간다.
3. **IESG 검토** — Internet Engineering Steering Group이 표준 트랙 진입을 승인한다.
4. **RFC Editor 발행** — 편집·번호 부여 후 영구 발행. 이때 비로소 RFC 번호가 박힌다.

여기서 짚을 게 하나 있다. RFC는 IETF만 만드는 게 아니다. 발행 경로(stream)가 여럿이다 — IETF, IRTF(리서치), IAB(아키텍처), Independent(독립 제출), 그리고 2022년 추가된 Editorial. **다만 표준 트랙 RFC와 BCP를 만드는 건 IETF 스트림뿐이다.** 나머지는 정보 공유나 실험 기록에 가깝다.

## 모든 RFC가 "표준"은 아니다

이게 자주 오해받는 지점이다. RFC 번호가 붙었다고 다 지켜야 하는 표준은 아니다. 범주가 나뉜다.

- **표준 트랙(Standards Track)**: Proposed Standard → (구) Draft Standard → Internet Standard. 우리가 보통 "표준"이라 부르는 것들.
- **BCP(Best Current Practice)**: 운영·절차의 현행 모범 사례. IETF 자체 운영 규칙도 여기 들어간다.
- **Informational**: 정보 제공용. 강제력 없음.
- **Experimental**: 실험적 제안. 써봐도 좋지만 표준은 아님.
- **Historic**: 한물간 것. 더 이상 권장하지 않음.

STD와 BCP는 별도의 하위 시리즈 번호를 따로 갖는다. 그러니 어떤 RFC를 인용하기 전에 그 문서의 **상태(status)부터 확인**하는 습관이 필요하다. Experimental RFC를 "표준이니까 따라야 한다"고 우기면 곤란하다.

## RFC는 절대 수정되지 않는다

처음 알면 좀 놀라는 사실. **한번 번호가 붙어 발행된 RFC는 영원히 그 내용 그대로다.** 오타 하나도 본문을 고치지 않는다.

그럼 틀린 건 어떻게 바로잡나. 세 가지 장치가 있다.

- **Obsoletes(폐기)**: 새 RFC가 옛 RFC를 통째로 대체한다. Spring Boot 4 시리즈에서 다룬 [RFC 9457(Problem Details)](https://www.rfc-editor.org/rfc/rfc9457)이 정확히 이 경우다 — 구 RFC 7807을 obsolete 했다. 7807 문서는 지금도 그대로 읽을 수 있지만, "이건 9457로 대체됨"이라는 딱지가 붙어 있다.
- **Updates(보완)**: 통째 대체까진 아니고, 일부를 추가·수정한다.
- **Errata(정오표)**: 발견된 오류를 본문과 별도로 기록한다.

이 불변성이 불편해 보이지만 실은 인용의 신뢰를 떠받친다. "RFC 2616 섹션 4.2"라고 적으면 10년 뒤에도, 100년 뒤에도 같은 문장을 가리킨다. 문서가 발밑에서 바뀌지 않는다. 학술 논문이 발행 후 수정되지 않는 것과 같은 이유다.

## 개발자가 RFC를 읽을 때: 대문자가 핵심이다

여기가 이 글에서 가장 실용적인 부분이다. RFC를 직접 펼치게 되면 — 그리고 Spring이 RFC 9457로 에러를 낸다는 걸 안 순간 언젠가 펼치게 된다 — 딱 하나만 기억하면 된다.

**대문자로 쓰인 MUST, SHOULD, MAY는 일반 영어가 아니다.**

[RFC 2119](https://www.rfc-editor.org/rfc/rfc2119.html)가 이 키워드들의 의미를 못박았다(후에 [RFC 8174](https://www.rfc-editor.org/rfc/rfc8174.html)와 묶여 BCP 14가 됐다).

| 키워드 | 의미 |
|--------|------|
| `MUST` / `REQUIRED` / `SHALL` | 절대 요구사항. 안 지키면 규격 위반 |
| `MUST NOT` / `SHALL NOT` | 절대 금지 |
| `SHOULD` / `RECOMMENDED` | 따라야 하지만, 충분한 이유가 있으면 예외 가능 |
| `SHOULD NOT` | 피해야 하지만, 정당한 사유가 있으면 예외 가능 |
| `MAY` / `OPTIONAL` | 선택. 구현체 자유 |

핵심은 **대문자일 때만** 이 규범적 의미를 갖는다는 거다. 같은 단어가 소문자 `should`로 적혀 있으면 그냥 평범한 영어, 강제력 없음. RFC 8174가 이걸 명시적으로 못박은 이유는, 사람들이 무심코 쓴 소문자 should를 규범으로 오해하는 사고가 실제로 잦았기 때문이다.

그래서 RFC를 읽을 때 `MUST`와 `SHOULD`를 구분하는 것만으로도 "이건 안 지키면 깨진다 / 이건 권장이라 사정 되면 어겨도 된다"가 갈린다. 라이브러리를 구현하거나 명세 준수 여부를 따질 때 이 한 끗이 전부다.

## 농담도 RFC가 된다

마지막으로, RFC 문화의 인간적인 구석 하나. 매년 만우절이면 진지한 척하는 가짜 RFC가 나온다.

- [RFC 1149](https://www.rfc-editor.org/rfc/rfc1149.html) (1990): "조류를 통한 IP 데이터그램 전송 표준". 전서구(비둘기)에 IP 패킷을 묶어 보내는 프로토콜이다. 놀랍게도 2001년 실제로 구현해서 패킷을 날려보낸 사람들이 있다.
- [RFC 2324](https://www.rfc-editor.org/rfc/rfc2324.html) (1998): "하이퍼텍스트 커피포트 제어 프로토콜(HTCPCP)". 여기서 그 유명한 **HTTP 418 "I'm a teapot"** 상태 코드가 나왔다. 커피를 우리라고 주전자에 요청하면 "나는 찻주전자다"라며 거부하는 코드다.

이게 단순 장난이 아니라, RFC를 만드는 사람들이 누구인지를 보여준다. 익명의 표준위원회가 아니라, 농담할 줄 아는 엔지니어들이 메일링 리스트에서 합의로 굴러가는 시스템이다. 가짜 RFC의 역사는 1973년 [RFC 439](https://www.rfc-editor.org/rfc/rfc439)까지 거슬러 올라간다.

## 그래서

Spring Boot 4가 RFC 9457로 에러 포맷을 표준화했을 때, 우리는 두 가지 선택지를 갖는다. 블로그 글의 해석을 믿거나, 원문을 직접 읽거나.

원문은 생각보다 읽을 만하다. 형식이 정해져 있고, `MUST`/`SHOULD`만 구분하면 절반은 읽힌다. 그리고 그 문서는 누가 시켜서가 아니라 여러 구현자가 실제로 맞물려 돌려본 끝에 합의한 결과다. 1969년 한 대학원생이 "코멘트 좀 주세요"라며 시작한 방식 그대로.

다음에 RFC 번호를 마주치면, 한 번쯤 [rfc-editor.org](https://www.rfc-editor.org/)에서 그 번호를 직접 쳐보길.

## 참고

- [RFC 1 — Host Software (Steve Crocker, 1969)](https://www.rfc-editor.org/rfc/rfc1)
- [RFC 2026 — The Internet Standards Process, Revision 3](https://www.rfc-editor.org/rfc/rfc2026.html)
- [RFC 2119 — Key words for use in RFCs to Indicate Requirement Levels](https://www.rfc-editor.org/rfc/rfc2119.html)
- [RFC 8174 — Ambiguity of Uppercase vs Lowercase in RFC 2119 Key Words](https://www.rfc-editor.org/rfc/rfc8174.html)
- ["Request for Comments" — Wikipedia](https://en.wikipedia.org/wiki/Request_for_Comments)
- [The RFC Editor](https://www.rfc-editor.org/)
