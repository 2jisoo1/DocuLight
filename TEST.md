# DocLight 테스트 가이드

## Phase 1 테스트

### 사전 준비

#### 1. 의존성 설치
```bash
npm install
```

#### 2. 설정 파일 생성
```bash
cp config.example.json5 config.json5
```

`config.json5` 편집:
```json5
{
  docsRoot: "/tmp/doclight-test",
  apiKey: "test-key-12345",
  maxUploadMB: 10,
  port: 3000,
  excludes: [
    "**/.git/",
    "**/.DS_Store",
    "**/node_modules/"
  ],
  logDir: "./logs",
  logLevel: "info"
}
```

#### 3. 테스트 문서 디렉터리 생성
```bash
mkdir -p /tmp/doclight-test
mkdir -p /tmp/doclight-test/guide
mkdir -p /tmp/doclight-test/reference
mkdir -p /tmp/doclight-test/guide/advanced
```

#### 4. 테스트 파일 생성
```bash
# 루트 README
cat > /tmp/doclight-test/README.md << 'EOF'
# DocLight Test Documentation

This is a test documentation set for DocLight.

## Features

- Markdown rendering
- Tree navigation
- Mermaid diagrams
EOF

# 가이드 파일들
cat > /tmp/doclight-test/guide/getting-started.md << 'EOF'
# Getting Started

Welcome to DocLight!

## Installation

1. Install dependencies
2. Configure settings
3. Start server
EOF

cat > /tmp/doclight-test/guide/advanced/configuration.md << 'EOF'
# Advanced Configuration

## Options

- docsRoot
- apiKey
- maxUploadMB
EOF

# 레퍼런스
cat > /tmp/doclight-test/reference/api.md << 'EOF'
# API Reference

## Endpoints

### GET /api/tree
Returns directory structure

### GET /api/raw
Returns raw markdown content
EOF
```

---

## Phase 1.1: ZIP 파일 처리 테스트

### 테스트 1: 기본 ZIP 업로드 및 해제

```bash
# 1. 서버 시작
npm run dev

# 2. 테스트 ZIP 파일 생성
cd /tmp
mkdir test-zip
echo "# Test File 1" > test-zip/file1.md
echo "# Test File 2" > test-zip/file2.md
mkdir test-zip/subdir
echo "# Nested File" > test-zip/subdir/nested.md
zip -r test.zip test-zip/

# 3. ZIP 업로드
curl -X POST \
  -H "X-API-Key: test-key-12345" \
  -F "file=@test.zip" \
  "http://localhost:3000/api/upload?path=/"

# 4. 확인
ls -la /tmp/doclight-test/test-zip/
cat /tmp/doclight-test/test-zip/file1.md
cat /tmp/doclight-test/test-zip/subdir/nested.md
```

**예상 결과**:
- ✅ ZIP 파일이 자동으로 압축 해제됨
- ✅ 디렉터리 구조 유지됨
- ✅ 로그에 압축 해제 정보 기록됨

### 테스트 2: 경로 탐색 공격 차단

```bash
# 1. 악의적인 ZIP 파일 생성
cd /tmp
mkdir malicious-zip
echo "malicious content" > malicious-zip/test.md
cd malicious-zip
ln -s ../../../etc/passwd evil-link
cd ..
zip -r malicious.zip malicious-zip/

# 2. 업로드 시도
curl -X POST \
  -H "X-API-Key: test-key-12345" \
  -F "file=@malicious.zip" \
  "http://localhost:3000/api/upload?path=/"

# 3. 로그 확인
tail -f logs/doclight-*.log
```

**예상 결과**:
- ✅ ../ 경로가 포함된 파일은 스킵됨
- ✅ 로그에 경고 메시지 기록됨
- ✅ 루트 디렉터리 외부 파일 생성 차단됨

### 테스트 3: 대용량 ZIP 파일

```bash
# 1. 대용량 파일 생성 (5MB)
dd if=/dev/zero of=/tmp/large-file.md bs=1M count=5

# 2. ZIP으로 압축
zip /tmp/large.zip /tmp/large-file.md

# 3. 업로드
curl -X POST \
  -H "X-API-Key: test-key-12345" \
  -F "file=@/tmp/large.zip" \
  "http://localhost:3000/api/upload?path=/"
```

**예상 결과**:
- ✅ 업로드 성공 (maxUploadMB 이하)
- ✅ 압축 해제 성공
- ✅ 로그에 파일 크기 기록됨

---

## Phase 1.2: 디렉터리 트리 확장/축소 테스트

### 테스트 1: 기본 확장/축소

**수동 테스트** (브라우저):

1. 서버 실행
```bash
npm run dev
```

2. 브라우저에서 http://localhost:3000 접속

3. 테스트 시나리오:
   - [ ] 루트 디렉터리 목록 표시 확인
   - [ ] `guide` 디렉터리 클릭
   - [ ] ▶ 아이콘이 ▼로 변경 확인
   - [ ] 하위 파일/디렉터리 표시 확인
   - [ ] `guide` 디렉터리 다시 클릭
   - [ ] ▼ 아이콘이 ▶로 변경 확인
   - [ ] 하위 항목 숨김 확인

**예상 결과**:
- ✅ 디렉터리 클릭 시 확장/축소 동작
- ✅ 아이콘 애니메이션 작동
- ✅ 부드러운 전환 효과

### 테스트 2: 중첩된 디렉터리 탐색

**수동 테스트**:

1. `guide` 디렉터리 확장
2. `advanced` 서브디렉터리 확장
3. `configuration.md` 파일 클릭
4. 문서 내용 표시 확인

**예상 결과**:
- ✅ 깊은 중첩 구조 정상 표시
- ✅ 들여쓰기가 레벨에 따라 증가
- ✅ 파일 클릭 시 내용 렌더링

### 테스트 3: 상태 유지 (IndexedDB)

**수동 테스트**:

1. 여러 디렉터리 확장
2. 파일 클릭하여 문서 열람
3. 페이지 새로고침 (F5)
4. 확장 상태 유지 확인
5. 마지막 열람한 문서 표시 확인

**예상 결과**:
- ✅ 확장된 디렉터리 상태 유지
- ✅ 마지막 열람 문서 자동 로드
- ✅ IndexedDB에 상태 저장 확인

**IndexedDB 확인**:
```javascript
// 브라우저 개발자 도구 Console에서 실행
const request = indexedDB.open('doclight', 1);
request.onsuccess = (event) => {
  const db = event.target.result;
  const tx = db.transaction('treeState', 'readonly');
  const store = tx.objectStore('treeState');
  const getAll = store.getAll();
  getAll.onsuccess = () => {
    console.log('Tree State:', getAll.result);
  };
};
```

### 테스트 4: 다중 디렉터리 동시 확장

**수동 테스트**:

1. `guide` 디렉터리 확장
2. `reference` 디렉터리 확장
3. 두 디렉터리 모두 확장 상태 유지 확인
4. 각각 독립적으로 축소 가능 확인

**예상 결과**:
- ✅ 여러 디렉터리 동시 확장 가능
- ✅ 각 디렉터리 독립적으로 제어 가능

### 테스트 5: 에러 처리

**수동 테스트**:

1. 권한 없는 디렉터리 생성
```bash
mkdir /tmp/doclight-test/forbidden
chmod 000 /tmp/doclight-test/forbidden
```

2. 브라우저에서 `forbidden` 디렉터리 클릭

**예상 결과**:
- ✅ 에러 메시지 표시
- ✅ 로그에 에러 기록
- ✅ 다른 디렉터리는 정상 동작

---

## API 테스트

### GET /api/tree

```bash
# 1. 루트 조회
curl http://localhost:3000/api/tree

# 2. 특정 경로 조회
curl http://localhost:3000/api/tree?path=guide

# 3. 중첩 경로 조회
curl http://localhost:3000/api/tree?path=guide/advanced
```

### GET /api/raw

```bash
# Markdown 원문 조회
curl http://localhost:3000/api/raw?path=README.md
```

### POST /api/upload (인증 필요)

```bash
# 파일 업로드
curl -X POST \
  -H "X-API-Key: test-key-12345" \
  -F "file=@test.md" \
  "http://localhost:3000/api/upload?path=/"

# ZIP 업로드
curl -X POST \
  -H "X-API-Key: test-key-12345" \
  -F "file=@test.zip" \
  "http://localhost:3000/api/upload?path=/"
```

### DELETE /api/entry (인증 필요)

```bash
# 파일 삭제
curl -X DELETE \
  -H "X-API-Key: test-key-12345" \
  "http://localhost:3000/api/entry?path=test.md"

# 디렉터리 삭제
curl -X DELETE \
  -H "X-API-Key: test-key-12345" \
  "http://localhost:3000/api/entry?path=test-dir"
```

### GET /api/download/file (인증 필요)

```bash
curl -H "X-API-Key: test-key-12345" \
  -O \
  "http://localhost:3000/api/download/file?path=README.md"
```

### GET /api/download/dir (인증 필요)

```bash
curl -H "X-API-Key: test-key-12345" \
  -O \
  "http://localhost:3000/api/download/dir?path=guide"
```

---

## 로그 확인

```bash
# 실시간 로그 모니터링
tail -f logs/doclight-*.log

# 에러 로그만 확인
grep ERROR logs/doclight-*.log

# 업로드 로그 확인
grep UPLOAD logs/doclight-*.log

# ZIP 압축 해제 로그 확인
grep "ZIP extraction" logs/doclight-*.log
```

---

## 테스트 체크리스트

### Phase 1.1: ZIP 처리
- [ ] ZIP 파일 업로드 및 자동 해제
- [ ] 경로 탐색 공격 차단 (../ 포함)
- [ ] 대용량 ZIP 파일 처리
- [ ] 중첩 디렉터리 구조 유지
- [ ] 압축 해제 결과 로깅

### Phase 1.2: 트리 확장/축소
- [ ] 디렉터리 클릭 시 확장/축소
- [ ] 아이콘 변경 (▶/▼)
- [ ] 하위 항목 동적 로딩
- [ ] IndexedDB 상태 저장
- [ ] 페이지 새로고침 후 상태 복원
- [ ] 중첩 디렉터리 탐색
- [ ] 들여쓰기 레벨별 표시
- [ ] 다중 디렉터리 동시 확장
- [ ] 에러 처리 및 표시

---

## 성능 테스트

### 대용량 디렉터리

```bash
# 많은 파일 생성
for i in {1..100}; do
  echo "# Test File $i" > /tmp/doclight-test/file$i.md
done

# 많은 디렉터리 생성
for i in {1..50}; do
  mkdir -p /tmp/doclight-test/dir$i
  echo "# Content" > /tmp/doclight-test/dir$i/file.md
done
```

**확인 사항**:
- [ ] 트리 로딩 시간 < 2초
- [ ] 디렉터리 확장 시간 < 500ms
- [ ] 메모리 사용량 안정적
- [ ] UI 반응성 유지

---

## 정리

```bash
# 테스트 파일 정리
rm -rf /tmp/doclight-test
rm -rf /tmp/test-zip /tmp/malicious-zip
rm -f /tmp/test.zip /tmp/malicious.zip /tmp/large.zip /tmp/large-file.md

# 로그 정리
rm -f logs/doclight-*.log
```

---

**작성일**: 2025-10-23
**테스트 버전**: Phase 1 (1.1 + 1.2)
