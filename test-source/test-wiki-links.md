# Wiki 링크 테스트

이 문서는 Wiki 링크 `[[]]` 기능을 테스트합니다.

## 절대 경로 Wiki 링크

문서 간 링크를 사용할 수 있습니다:
- 가이드 문서: [[/guide/getting-started]]
- 프로그래밍 샘플: [[/guide/programming-samples]]
- README: [[/README]]
- 일반 파일: [[/normal]]

## .md 확장자 포함 (자동 제거)

확장자를 포함해도 정상 동작합니다:
- [[/guide/getting-started.md]]
- [[/normal.md]]
- [[/README.md]]

## 테스트 폴더 문서

테스트 폴더 내의 문서들:
- [[/test/sample]]
- [[/test/markdown-test]]

## 예상 결과

위 링크들은 다음과 같이 렌더링되어야 합니다:

### 변환 전 (원본)
```
[[/guide/getting-started]]
[[/README]]
[[/normal.md]]
```

### 변환 후 (렌더링)
- `[[/guide/getting-started]]` → [getting-started](/doc/guide/getting-started)
- `[[/README]]` → [README](/doc/README)
- `[[/normal.md]]` → [normal](/doc/normal)

## Edge Cases

### 공백이 있는 경우
- [[ /guide/getting-started ]] (앞뒤 공백)
- [[  /README  ]] (양쪽 공백)

### 중복 확장자
- [[/normal.md.md]] (중복 .md - 한 번만 제거)

### 빈 링크
- [[]] (빈 링크 - 표시명이 없을 수 있음)

## 표준 마크다운 링크와 혼용

표준 마크다운 링크도 정상 동작해야 합니다:
- [표준 링크](/doc/guide/getting-started)
- [[Wiki 링크]](/guide/getting-started)
- 혼합: [[/README]]와 [일반 링크](/doc/normal)

## 결론

모든 Wiki 링크가 클릭 가능한 링크로 변환되고, 해당 문서로 정상적으로 이동해야 합니다.
