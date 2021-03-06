---
title: '[Kotlin] Lambda(람다) 함수'
excerpt: '람다 함수는 익명 함수를 정의할 수 있는 기법입니다.'
---

## 개요

람다 함수는 주로 함수를 간단하게 정의하기 위해서 사용합니다.

코틀린에서 람다 함수를 사용하는 이유는 주로 [고차 함수]({{ site.url }}languages/kotlin/high-order-function/) 때문입니다.

## 람다 함수

기존 함수는 아래와 같이 작성합니다.

```kotlin
fun 함수명(매개변수) {본문}
```

람다 함수는 다음과 같이 작성합니다.

```kotlin
{ 매개변수 -> 본문}
```

람다 함수는 이런 특징을 가지고 있습니다.

- `fun` 키워드를 사용하지 않습니다.
- `{ }`로 표현합니다.
- `->` 연산자를 기준으로 왼쪽은 매개변수, 오른쪽은 본문입니다.
- 반환할 때는 `return` 키워드를 사용하지 않으며, 본문의 마지막 줄의 표현식이 반환됩니다.

같은 효과를 지니는 코드 두 개를 직접적으로 비교해보겠습니다.

매개변수 두 개를 더해서 반환하는 일반적인 함수입니다.

```kotlin
fun sum(x: Int, y: Int): Int {
    return x + y
}
```

람다 함수는 이렇게 표현이 가능합니다.

```kotlin
val sum = {x: Int, y: Int -> x + y}
```

이렇게 보통 람다 함수는 변수에 대입하여 초기화를 할 때 많이 사용됩니다.

### 매개변수 0개

매개변수가 0개인 람다함수는 `->` 연산자를 생략할 수 있습니다.

```kotlin
val temp = {println("매개변수 0개 람다함수 호출")}
```

### 매개변수 1개

매개변수가 1개인 람다함수는 `it` 키워드를 사용하여 매개변수를 생략할 수 있습니다.

```kotlin
val temp1 = {num: Int -> println(num)} // 일반 람다 함수
val temp2: (Int) -> Unit = {println(it)} // it 키워드를 사용한 람다 함수
val temp3 = {println(it)} // error
```

매개변수 1개가 있는 람다 함수라는 것을 `(Int) -> Unit`을 통해 알 수 있습니다. 이것은 [함수 타입]({{ site.url }}languages/kotlin/function-types/)이라고 하며, 생략할 수 없습니다.

람다 함수에서 `it` 키워드를 사용하여 매개변수를 가리키는 것은 해당 **매개변수를 식별할 수 있을 때**만 가능합니다.

### 매개변수 타입 생략

[함수 타입]({{ site.url }}languages/kotlin/function-types/)을 사용하면 매개변수의 타입을 추론할 수 있기 때문에 생략할 수 있습니다.

```kotlin
val temp1: (Int, Int) -> Int = {x: Int, y: Int -> x + y} // 일반적인 `함수 타입 = 람다 함수`
val temp2: (Int, Int) -> Int = {x, y -> x + y} // 매개변수의 타입이 생략된 `함수 타입 = 람다 함수`
```

사실 이는 람다 함수만 쓰는 거라면 비효율적인 선언으로, 굳이 함수 타입을 기재할 필요가 없습니다.

```kotlin
val temp3 = {x: Int, y: Int -> x + y} // 함수 타입을 생략한 람다 함수
```
