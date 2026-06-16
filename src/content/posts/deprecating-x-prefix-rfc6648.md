---
author: 주진현
pubDatetime: 2026-06-16T10:30:00+09:00
title: "X- 헤더는 쓰지 마라? RFC 6648을 다시 읽고 알게 된 것"
featured: false
section: web
tags:
  - rfc
  - http
  - web
  - standards
  - api-design
description: X-Forwarded-For, X-Frame-Options, X-Request-Id. 우리가 매일 쓰는 X- 헤더들이다. RFC 6648은 이 X- 접두사를 폐기했다. 그런데 "X- 쓰지 마라"는 흔한 요약은 절반만 맞다. 비표준 헤더를 만들지 말라는 게 아니라, 이름에 X-를 붙이지 말라는 거다.
faq:
  - question: "HTTP 커스텀 헤더에 X- 접두사를 써도 되나요?"
    answer: "권장하지 않는다. RFC 6648(2012)이 새로 정의하는 파라미터에 X- 접두사 사용을 폐기했다(SHOULD NOT). 비표준 헤더 자체가 금지된 건 아니고, 이름에 X-를 붙이지 말라는 뜻이다. 의미 있는 이름을 쓰거나, 충돌이 걱정되면 조직명 접두사(예: Acme-Trace-Id)를 쓴다."
  - question: "RFC 6648은 무엇을 폐기했나요?"
    answer: "애플리케이션 프로토콜에서 비표준 파라미터를 X- 접두사로 표시하던 관행을 폐기했다. 표준과 비표준을 이름으로 구분하면, 비표준 헤더가 사실상 표준이 됐을 때 이름을 바꿔야 하고 상호운용성이 깨지기 때문이다. 2012년 발행된 BCP 178이다."
  - question: "X-Forwarded-For는 표준 헤더인가요?"
    answer: "아니다. X-Forwarded-For는 비표준이다. 표준은 RFC 7239(2014)가 정의한 Forwarded 헤더다(예: Forwarded: for=192.0.2.43). 다만 X-Forwarded-For가 워낙 널리 쓰여, 표준이 나온 뒤에도 현장의 사실상 기본값으로 남아 있다."
  - question: "X- 접두사 대신 무엇을 쓰나요?"
    answer: "의미 있는 이름을 그대로 쓰되, 충돌이 걱정되면 조직명이나 도메인을 접두사로 붙인다. 예를 들어 Acme-Trace-Id, com.acme.trace-id, 또는 RFC 4288 벤더 트리 스타일인 VND.Acme.trace-id. X-는 비표준이라는 깨질 약속을 이름에 새기므로 피한다."
  - question: "기존 X- 헤더를 전부 바꿔야 하나요?"
    answer: "아니다. RFC 6648은 기존 X- 파라미터의 마이그레이션을 강제하지 않는다. X-Forwarded-For 같은 헤더를 당장 걷어낼 필요는 없다. iCalendar(RFC 5545)의 x-name처럼 X-를 정식 문법으로 규정한 스펙도 그대로 유효하다."
---

`X-Forwarded-For`, `X-Frame-Options`, `X-Request-Id`, `X-Powered-By`. 백엔드를 만지면 매일 보는 헤더들이다. 그리고 어디선가 "이제 `X-` 접두사는 쓰지 말라더라"는 말을 주워듣는다. 나도 그랬다. 머릿속에 "X- = 구식, 금지"라고 박아두고 살았다.

그러다 출처인 [RFC 6648](https://www.rfc-editor.org/rfc/rfc6648.html)을 처음부터 끝까지 읽었다. 내가 외우고 있던 한 줄 요약이 절반만 맞았다는 걸 알았다. 이 문서가 폐기한 건 "비표준 헤더를 만드는 행위"가 아니다. "비표준이라는 사실을 이름에 `X-`로 새겨 넣는 관행"이다. 미묘해 보이지만 실무에서 갈리는 지점이 여기다.

## X-는 원래 좋은 의도였다

표준 파라미터와 비표준 파라미터가 같은 공간에 섞이면 충돌이 난다. 누군가 멋대로 만든 `Priority` 헤더가 돌아다니는데 나중에 표준화 기구가 `Priority`를 정식 정의하면, 둘이 부딪힌다. 그래서 나온 게 분리(segregation) 아이디어다. 비표준은 `X-`로 시작하기로 하자. 그러면 표준 공간은 깨끗하게 보호된다.

뿌리가 깊다. RFC 6648의 부록을 보면 1975년 [RFC 691](https://www.rfc-editor.org/rfc/rfc691)에서 Brian Harvey가 FTP 파라미터에 "정말 로컬한 특이사항에는 앞에 `X`를 붙이자"고 제안한 게 시작이다. 이메일이 [RFC 822](https://www.rfc-editor.org/rfc/rfc822)(1982)에서 이걸 규칙으로 못박았다.

> The prefatory string "X-" will never be used in the names of Extension-fields.

표준 확장 필드는 절대 `X-`로 시작하지 않는다. 그러니 `X-`로 시작하면 그건 사용자 정의 필드다. 깔끔한 약속이다. 이론적으로는.

## 문제는 X-가 너무 잘 됐다는 거다

비표준 헤더 하나가 쓸 만하면 사람들이 따라 쓴다. 따라 쓰는 사람이 많아지면 그게 사실상 표준이 된다. 이름표는 여전히 "비표준"이라고 붙어 있는데 현실은 모두가 의존한다. 이걸 표준화 기구가 정식으로 다듬으려고 하면, 이제 이름을 `X-foo`에서 `foo`로 바꿔야 한다. 그 순간 지옥문이 열린다.

구 구현체는 `X-foo`만 안다. 신 구현체는 `foo`만 안다. 둘이 안 맞물린다. 상호운용성을 지키려면? 신 구현체가 `X-foo`도 영원히 지원하는 수밖에 없다. 결국 비표준 이름이 진짜 표준이 되어버린다. 이름 공간을 둘로 나눈 의미 자체가 증발한다.

RFC 6648은 이게 추측이 아니라 반복된 역사라고 못박는다. HTTP의 `x-gzip`, `x-compress`가 [RFC 2068](https://www.rfc-editor.org/rfc/rfc2068)에서 결국 `gzip`, `compress`와 "동등하게 취급하라"고 명시됐다. 이메일은 RFC 822가 도입한 구분을 [RFC 2822](https://www.rfc-editor.org/rfc/rfc2822)(2001)가 슬그머니 들어냈다.

제일 좋은 예는 RFC 6648 자신은 다루지 않은, 우리가 매일 쓰는 그 헤더다. `X-Forwarded-For`.

## X-Forwarded-For가 증거다

프록시 뒤에 있는 클라이언트의 원래 IP를 알려주려고 누군가 `X-Forwarded-For`를 만들었다. 표준이 아니었다. 그런데 너무 유용하니까 nginx, 로드밸런서, CDN, 프레임워크가 다 따라 썼다. `X-Forwarded-Proto`, `X-Forwarded-Host`까지 한 세트로 굳었다.

10년쯤 지나 IETF가 이걸 표준화한다. [RFC 7239](https://www.rfc-editor.org/rfc/rfc7239.html)(2014), `Forwarded` 헤더다. RFC 6648이 묘사한 시나리오가 글자 그대로 재현된다. 표준화하면서 이름이 바뀌었고(`X-Forwarded-For` → `Forwarded: for=...`), 문법도 더 엄격해졌다. IPv6 주소를 대괄호로 감싸고 따옴표로 묶는다. 구식 `X-Forwarded-For`에는 없던 규칙이다.

RFC 7239는 §7.4에서 전환의 고통을 직접 인정한다.

> removing the X-Forwarded-For header field may cause issues for parties that have not yet implemented support for this new header field.

`X-Forwarded-For`를 떼면 아직 새 헤더를 지원 안 하는 쪽이 깨진다. 그래서 다들 둘 다 보낸다. 표준 `Forwarded`가 나온 지 10년이 넘었는데 지금도 현장의 기본값은 `X-Forwarded-For`다. RFC 6648이 예측한 "`X-` 이름을 영원히 지원하게 된다"가 그대로 일어났다.

한 가지 덧붙이면, RFC 6648 저자 중 한 명인 Mark Nottingham이 RFC 7239의 감사 명단에도 올라 있다. X- 폐기를 주장한 사람이 X- 헤더 표준화의 뒷정리를 거든 셈이다. 그가 왜 그렇게 X-를 싫어했는지 7239가 설명해 준다.

## 그래서 RFC가 실제로 권하는 것

여기서 내 오해가 깨졌다. RFC 6648은 역할별로 권고를 나눠 적는다. 막연히 "쓰지 마라"가 아니다.

| 대상 | 권고 |
|------|------|
| 구현자 (§2) | 이름의 `X-` 유무만으로 파라미터 상태를 가정하거나 자동 처리하지 말 것 (MUST NOT) |
| 새 헤더 만드는 쪽 (§3) | 내가 만드는 모든 파라미터가 언젠가 표준이 될 수 있다고 가정할 것. `X-` 접두사 붙이지 말 것 (SHOULD NOT) |
| 프로토콜 설계자 (§4) | 무제한 등록 공간을 열고, "X- = 비표준"이라고 규정하지 말 것 (MUST NOT) |

내가 줄곧 헷갈렸던 게 §3의 첫 항목이다. "표준 될 만한 것만 X- 빼라"가 아니다. **어차피 뭐가 표준이 될지 너는 모른다**는 게 전제다. `X-Forwarded-For`를 만든 사람도 그게 10년 뒤 IETF 표준이 될 줄 몰랐다. 예측이 안 되니, 새로 만드는 건 그냥 다 처음부터 `X-` 없이 지으라는 거다.

## 핵심 반전: 비표준 헤더는 만들어도 된다

이게 내가 놓쳤던 부분이다. RFC 6648은 서문에서 명시적으로 선을 긋는다(3번 항목). private, local, 실험적, 구현 전용 파라미터를 쓰는 것 자체는 반대하지 않는다. 반대하는 건 그 이름에 `X-`를 붙이는 것뿐이다.

사내 전용 헤더가 필요하면 만들어라. 다만 `X-Internal-Token`이 아니라 그냥 의미 있는 이름을 쓰라는 거다. 충돌이 정말 걱정되면 RFC가 대안도 준다. 조직명이나 도메인을 접두사로 쓰는 방식이다.

```
X-Acme-Trace-Id      (지양)
Acme-Trace-Id        (권장)
com.acme.trace-id    (도메인 역순)
VND.Acme.trace-id    (벤더 트리, RFC 4288 스타일)
```

`X-`는 "나는 비표준이다"라는 거짓 약속을 담는다. 언젠가 깨질 약속이다. 조직명 접두사는 충돌은 막으면서 그 거짓 약속은 안 한다. 표준이 되면 이름 그대로 표준이 되면 그만이다.

## 단, 두 가지 예외

이 RFC를 근거로 기존 코드의 `X-` 헤더를 싹 갈아엎으려는 사람이 있을까 봐 적어둔다. RFC 6648 자신이 두 가지를 분명히 선 긋는다.

하나, 이미 쓰고 있는 `X-` 헤더를 표준 이름으로 마이그레이션하라고 강제하지 않는다(서문 4번). 그건 그 헤더 주인이 알아서 할 문제다. `X-Forwarded-For`를 당장 걷어내야 하는 게 아니다.

둘, `X-`를 명시적으로 규정한 기존 스펙은 무효화하지 않는다(서문 5번). 예를 들어 iCalendar([RFC 5545](https://www.rfc-editor.org/rfc/rfc5545))는 `x-name` 토큰을 정식 문법으로 갖고 있다. 그런 곳의 `X-`는 RFC 6648과 무관하게 유효하다.

## 그래서

처음에 외웠던 "X- 쓰지 마라"는 틀린 요약은 아니었다. 새 헤더를 만들 때 `X-`를 붙일 이유는 이제 없다. 다만 그 한 줄이 가린 게 있었다. 이건 비표준 헤더를 박멸하는 규칙이 아니라, **비표준이라는 꼬리표를 이름에 새기지 말라**는 규칙이다. 꼬리표는 어차피 거짓말이 되니까.

다음에 새 헤더 이름을 지을 때, `X-`를 칠 손가락을 한 번 멈추면 된다. 그게 표준이 될지 안 될지 나는 모른다는 걸 인정하고, 그냥 좋은 이름을 짓는 거다. RFC가 [MUST와 SHOULD를 구분하는 이유](/posts/what-is-rfc/)를 안다면, 여기 `SHOULD NOT`이 왜 `MUST NOT`이 아닌지도 읽힌다. 강제는 아니다. 다만 안 그럴 이유가 없다.

## 참고

- [RFC 6648: Deprecating the "X-" Prefix and Similar Constructs in Application Protocols](https://www.rfc-editor.org/rfc/rfc6648.html)
- [RFC 7239: Forwarded HTTP Extension](https://www.rfc-editor.org/rfc/rfc7239.html)
- [RFC 822: Standard for ARPA Internet Text Messages](https://www.rfc-editor.org/rfc/rfc822) (X- 규칙의 원형)
- [RFC 2822: Internet Message Format](https://www.rfc-editor.org/rfc/rfc2822) (X- 구분 제거)
