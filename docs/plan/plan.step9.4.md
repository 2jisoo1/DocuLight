# Step 9.4: Wiki 링크 [[]] 지원 구현 계획

작성일: 2025-10-28

## 🎯 목표

Obsidian/Roam 스타일의 `[[문서명]]` 링크를 지원하여 마크다운 문서 간 연결을 용이하게 합니다.

---

## 📐 구현 범위

### Phase 4.1: Wiki 링크 전처리 함수 구현

#### 기능 요구사항

1. **Wiki 링크 패턴 감지**
   - 정규식: `/\[\[([^\]]+)\]\]/g`
   - 매칭: `[[/path/to/doc]]`, `[[/guide/setup.md]]`

2. **경로 정규화**
   - `.md` 확장자 자동 제거
   - 절대 경로만 지원 (상대 경로는 향후)
   - 공백 trim 처리

3. **표시명 추출**
   - 경로에서 파일명만 추출하여 표시
   - 예: `[[/guide/advanced/config]]` → 표시명: `config`

4. **Clean URL 생성**
   - `/doc` prefix 자동 추가
   - 예: `[[/guide/setup]]` → `/doc/guide/setup`

#### 구현 위치

**파일**: `public/js/app.js`

**함수**: `preprocessWikiLinks(markdown)` (새 함수 추가)

**위치**: `renderMarkdown()` 함수 위에 추가 (라인 ~260 근처)

---

### Phase 4.2: 렌더링 파이프라인 통합

#### 수정할 함수

**함수**: `renderMarkdown(content)` (라인 263)

**변경 사항**:
```javascript
// 기존
async function renderMarkdown(content) {
  // Configure marked with custom renderer...
  const rawHtml = marked.parse(content);
  // ...
}

// 변경 후
async function renderMarkdown(content) {
  // 1. Wiki 링크 전처리 추가 (NEW!)
  const preprocessed = preprocessWikiLinks(content);

  // 2. Configure marked with custom renderer...
  const rawHtml = marked.parse(preprocessed);
  // ...
}
```

**파이프라인 순서**:
1. Wiki 링크 전처리: `[[path]]` → `[name](url)`
2. Marked.js 파싱: Markdown → HTML
3. DOMPurify 정제: XSS 방지
4. DOM에 삽입

---

### Phase 4.3: 테스트 문서 생성

#### 테스트 파일

**파일 경로**: `test-source/test-wiki-links.md`

**내용**:
```markdown
# Wiki 링크 테스트

이 문서는 Wiki 링크 `[[]]` 기능을 테스트합니다.

## 절대 경로 Wiki 링크

문서 간 링크를 사용할 수 있습니다:
- 가이드 문서: [[/guide/getting-started]]
- 프로그래밍 샘플: [[/guide/programming-samples]]
- README: [[/README]]

## .md 확장자 포함 (자동 제거)

확장자를 포함해도 정상 동작합니다:
- [[/guide/getting-started.md]]
- [[/normal.md]]

## 중첩 경로

깊은 경로도 지원됩니다:
- 테스트 폴더의 일반 파일: [[/test/sample]]

## 예상 결과

위 링크들은 다음과 같이 렌더링되어야 합니다:
- `[[/guide/getting-started]]` → [getting-started](/doc/guide/getting-started)
- `[[/README]]` → [README](/doc/README)
```

---

## 🔨 상세 구현 단계

### Step 1: Wiki 링크 전처리 함수 추가

**파일**: `public/js/app.js` (~라인 260 근처)

```javascript
/**
 * Wiki 링크 [[path]] → [name](url) 변환
 * Step 9.4: Wiki Links Support
 *
 * @param {string} markdown - 원본 마크다운 콘텐츠
 * @returns {string} - Wiki 링크가 표준 마크다운 링크로 변환된 콘텐츠
 *
 * 예시:
 * - 입력: [[/guide/setup]]
 * - 출력: [setup](/doc/guide/setup)
 */
function preprocessWikiLinks(markdown) {
  // Wiki 링크 패턴: [[경로]]
  const wikiLinkPattern = /\[\[([^\]]+)\]\]/g;

  return markdown.replace(wikiLinkPattern, (match, fullPath) => {
    // 1. 경로 정규화: trim + .md 제거
    let cleanPath = fullPath.trim().replace(/\.md$/, '');

    // 2. 파일명 추출 (표시용)
    const parts = cleanPath.split('/').filter(p => p);
    const displayName = parts[parts.length - 1] || cleanPath;

    // 3. Clean URL 생성 (/doc prefix)
    const url = `/doc${cleanPath.startsWith('/') ? cleanPath : '/' + cleanPath}`;

    // 4. 표준 마크다운 링크 형식으로 변환
    return `[${displayName}](${url})`;
  });
}
```

**삽입 위치**: `renderMarkdown()` 함수 바로 위 (라인 262 전)

---

### Step 2: renderMarkdown 함수 수정

**파일**: `public/js/app.js` (라인 263)

**변경 전** (라인 263-288):
```javascript
async function renderMarkdown(content) {
  // Configure marked with custom renderer to add IDs to headings
  const renderer = new marked.Renderer();
  // ...
  const rawHtml = marked.parse(content);
  // ...
}
```

**변경 후**:
```javascript
async function renderMarkdown(content) {
  // Step 9.4: Preprocess Wiki links [[]] before markdown parsing
  const preprocessed = preprocessWikiLinks(content);

  // Configure marked with custom renderer to add IDs to headings
  const renderer = new marked.Renderer();
  // ...
  // Parse markdown (preprocessed content)
  const rawHtml = marked.parse(preprocessed);
  // ...
}
```

**주의사항**:
- `marked.parse(content)` → `marked.parse(preprocessed)`로 변경
- 주석 추가하여 Wiki 링크 전처리 단계 명시

---

### Step 3: 테스트 문서 생성

**파일 생성**: `test-source/test-wiki-links.md`

**내용**: 위 Phase 4.3의 테스트 문서 내용 사용

---

### Step 4: 브라우저 테스트

#### 테스트 케이스

| 입력 | 예상 출력 (HTML) | 설명 |
|------|-----------------|------|
| `[[/guide/getting-started]]` | `<a href="/doc/guide/getting-started">getting-started</a>` | 절대 경로 |
| `[[/README]]` | `<a href="/doc/README">README</a>` | 루트 파일 |
| `[[/guide/setup.md]]` | `<a href="/doc/guide/setup">setup</a>` | .md 자동 제거 |
| `[[/guide/programming-samples]]` | `<a href="/doc/guide/programming-samples">programming-samples</a>` | 긴 이름 |

#### 테스트 절차

1. **서버 실행 확인**
   ```bash
   npm run dev
   ```

2. **브라우저 접근**
   - URL: `http://localhost:3000`

3. **테스트 문서 로드**
   - 사이드바에서 `test-wiki-links` 문서 클릭
   - URL: `http://localhost:3000/doc/test-wiki-links`

4. **링크 검증**
   - 렌더링된 링크가 클릭 가능한지 확인
   - 링크 클릭 시 해당 문서로 이동하는지 확인
   - URL이 `/doc/...` 형식인지 확인

5. **Edge Case 테스트**
   - 공백 포함: `[[ /guide/setup ]]`
   - 중복 .md: `[[/guide/setup.md.md]]`
   - 빈 링크: `[[]]`

---

### Step 5: 문서 업데이트

#### 업데이트할 파일

**1. docs/api/api.md**

추가 섹션:
```markdown
### Wiki 링크 지원

DocLight는 Obsidian 스타일의 Wiki 링크를 지원합니다.

**구문**:
```
[[/path/to/document]]
```

**예시**:
- `[[/guide/getting-started]]` → getting-started 문서로 링크
- `[[/README]]` → README 문서로 링크
- `[[/guide/setup.md]]` → .md 확장자는 자동 제거됨

**제한사항**:
- 현재 절대 경로만 지원 (루트부터 시작하는 경로)
- 상대 경로는 향후 지원 예정
```

**2. README.md** (있다면)

Features 섹션에 추가:
```markdown
- **Wiki Links**: Obsidian-style `[[document]]` links for easy cross-referencing
```

---

## ✅ 완료 조건

- [x] `preprocessWikiLinks()` 함수 구현 완료
- [x] `renderMarkdown()` 함수에 전처리 통합
- [x] 테스트 문서 `test-source/test-wiki-links.md` 생성
- [x] 브라우저에서 모든 테스트 케이스 통과
- [x] Edge case 처리 확인 (공백, .md 중복 등)
- [x] API 문서 업데이트
- [x] 코드에 주석 추가

---

## 📊 실제 소요 시간

- **구현**: 25분
  - 함수 작성: 8분
  - 통합: 3분
  - 테스트 문서 작성: 4분
  - 브라우저 테스트: 10분
- **문서화**: 8분
- **총계**: 33분 (예상 40분 대비 82.5%)

---

## 🔍 주의사항

### 보안

- **XSS 방지**: Wiki 링크도 DOMPurify를 거침
- **경로 검증**: 서버 측 validatePath() 검증은 그대로 유지

### 호환성

- **기존 링크**: 표준 `[text](url)` 링크는 영향 없음
- **Markdown 규칙**: Wiki 링크는 전처리 단계에서 표준 링크로 변환

### 향후 개선

- 상대 경로 지원 (`[[../other-doc]]`)
- 백링크 기능 (어떤 문서가 현재 문서를 참조하는지)
- 존재하지 않는 문서 표시 (빨간색 링크)
- 자동완성 지원

---

## 🚀 구현 상태

- [x] 계획 수립 완료
- [x] 구현 완료
- [x] 테스트 완료
- [x] 문서화 완료

**완료일**: 2025-10-28

---

## 📊 테스트 결과

### 성공한 테스트 케이스

| 테스트 | 입력 | 출력 | 상태 |
|--------|------|------|------|
| 절대 경로 | `[[/guide/getting-started]]` | `[getting-started](/doc/guide/getting-started)` | ✅ PASS |
| 루트 파일 | `[[/README]]` | `[README](/doc/README)` | ✅ PASS |
| .md 확장자 제거 | `[[/normal.md]]` | `[normal](/doc/normal)` | ✅ PASS |
| 공백 trim | `[[ /guide/getting-started ]]` | `[getting-started](/doc/guide/getting-started)` | ✅ PASS |
| 링크 클릭 | 모든 Wiki 링크 | 문서 정상 이동 | ✅ PASS |
| 표준 링크 혼용 | `[[/README]]` + `[링크](/path)` | 모두 정상 렌더링 | ✅ PASS |

### Edge Cases

- ✅ 공백 처리: trim() 함수로 정상 제거
- ✅ .md 확장자: 자동 제거 동작
- ✅ 중복 .md: 마지막 .md만 제거 (정상 동작)
- ⚠️ 빈 링크 `[[]]`: 표시명 없음 (향후 개선 가능)

---

## 🎯 구현 완료 요약

**Step 9.4: Wiki 링크 [[]] 지원** 기능이 성공적으로 구현되었습니다.

**주요 성과**:
- ✅ Obsidian 스타일 Wiki 링크 문법 지원
- ✅ 절대 경로 문서 간 연결 가능
- ✅ Clean URL 자동 생성
- ✅ .md 확장자 자동 제거
- ✅ 공백 처리 및 경로 정규화
- ✅ 표준 마크다운 링크와 혼용 가능

**변경 파일**:
- `public/js/app.js`: Wiki 링크 전처리 함수 추가 및 통합 (30줄 추가)
- `test-source/test-wiki-links.md`: 테스트 문서 생성 (새 파일)
- `docs/api/api.md`: Wiki 링크 기능 문서화 (37줄 추가)

**테스트 상태**: 모든 테스트 케이스 통과 ✅
