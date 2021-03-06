---
title: "PowerToys #1 : 항상 위(Always on Top)"
excerpt: "어떤 창을 모든 창 위에 위치하도록 하는 기능"
---

**Always on Top**은 어떤 창을 모든 창 위에 위치하도록 고정하는 기능입니다.

![Always_on_Top](../../../assets/images/Always_on_Top.png)

## 설정

| 설정                                                                                  | 설명                                      |
| ------------------------------------------------------------------------------------- | ----------------------------------------- |
| [활성화 바로 가기](#활성화-바로-가기-키)                                              | 창을 고정하거나 해제하기 위한 단축키 지정 |
| [게임 모드가 켜져 있을 때 활성화하지 않음](#게임-모드가-켜져-있을-때-활성화하지-않음) | 게임하는 중에는 고정 기능 유지 여부       |
| [색](#색)                                                                             | 강조 테두리의 색 지정                     |
| [테두리 두께](#테두리-두께px)                                                         | 강조 테두리의 두께(px) 지정               |
| [소리 내기](#소리-내기)                                                               | 기능이 작동할 때마다 경고음 발생 여부     |
| [제외된 앱](#제외된-앱)                                                               | 이 유틸리티를 작동시키지 않을 앱 목록     |

## 활성화

### 활성화 바로 가기 키

창을 고정하거나 고정을 해제하기 위한 키보드 단축키를 지정합니다.

기본은 `Win` + `Ctrl` + `T` 입니다.

### 게임 모드가 켜져 있을 때 활성화하지 않음

게임 중이라면 **Always on Top** 기능을 중지합니다.

게임을 하면서 공략을 보거나 메신저를 이용할 때 창 전환으로 작업을 이어나가지만, 이 옵션이 `off`라면 계속 보면서 진행이 가능합니다.

## 모양 및 동작

색, 테두리 두께, 효과음 등을 조정합니다.

### 고정된 창 주위에 테두리 표시

창을 고정하면 고정된 창 테두리에 테두리를 표시합니다.

#### 색

고정된 창 테두리의 색을 지정합니다.

옵션은 두 가지가 있습니다.

- 사용자 지정 색
- Windows 기본값

#### 테두리 두께(px)

강조 테두리의 두께를 픽셀 단위로 지정합니다.

### 사운드

사용자가 이 기능이 활성화된 것을 인식할 수 있도록 작은 경고음을 재생합니다.

## 제외된 앱

이 기능을 적용시키지 않을 프로그램을 작성합니다.

예를 들어, 메모장(`Notepad`)을 제외하고자 한다면 `Notepad.exe`를 추가하면 됩니다.
