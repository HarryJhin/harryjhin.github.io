---
title: '[Kotlin] 고차 함수(high order function)'
excerpt: '고차 함수는 함수를 매개변수로 전달받거나 반환하는 함수를 의미합니다.'
---

## 개요

일반적인 함수의 매개변수와 반환값은 데이터(숫자, 문자열, 객체 등)입니다.

고차 함수는 데이터가 아닌 **함수를 매개변수나 반환값으로 사용**합니다. 이게 가능한 이유는 **함수를 변수에 대입**할 수 있기 때문입니다(익명 함수나 람다 함수).

## 고차 함수

```kotlin
fun temp1(sum: (Int, Int) -> Int, a: Int, b: Int): Int {
    return sum(a, b)
}

fun temp2(arg: (Int) -> Boolean): () -> String {
    val result = if(arg(10)) {
        "10 이상"
    } else {
        "10 이하"
    }
    return {result}
}

fun main() {
    val result1 = temp1({x, y -> x + y}, 3, 4) // 인수: 람다 함수, 정수 2개
    val result2 = temp2({x -> x >= 10}) // 인수: 람다 함수
    
    println(result1) // 7
    println(result2()) // 10 이상
}
```

먼저, `temp1` 함수를 보면 매개변수가 총 3개 입니다.

- `sum: (Int, Int) -> Int`은 `함수 이름: 함수 타입` 형태로 함수 매개변수입니다.
- `a: Int`, `b: Int`는 정수 매개변수입니다.

`temp1` 함수 호출을 보면 인수로 총 3개를 전달하고 있습니다.

- `{x, y -> x + y}`는 람다 함수로 `sum: (Int, Int) -> Int`에 해당하는 인수입니다.
- `3`, `4`는 각각 `a`, `b`에 해당하는 인수입니다.

`temp1` 함수의 매개변수 `sum`은 람다 함수를 전달받으면서 본문이 `x + y`가 되고, `sum(x, y) = x + y` 형태로 완성됩니다. 따라서 `sum(3, 4)`의 결과는 `7`이 됩니다.

**참고**: 함수의 매개변수 중 람다 함수를 받는 `함수 이름: 함수 타입`은 생략할 수 없습니다.
{: .notice--info}
