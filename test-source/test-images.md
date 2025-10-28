# 이미지 렌더링 테스트

이 문서는 다양한 이미지 경로 패턴의 렌더링을 테스트합니다.

## 1. 절대 경로 - DocLight 내부 이미지

DocLight 애플리케이션 아이콘:

![DocLight Icon](/images/icon.png)

테스트 이미지 (test-source/images에서 제공):

![Test Image](/images/test-absolute.png)

> **참고**: 절대 경로 이미지는 `/images/` 경로로 제공됩니다.

---

## 2. 외부 URL - Placeholder 이미지

### 작은 이미지 (150x150)

![Placeholder 150x150](https://via.placeholder.com/150)

### 중간 이미지 (300x200, 파란색 배경)

![Placeholder 300x200](https://via.placeholder.com/300x200/3498db/ffffff?text=DocLight+Test)

### 큰 이미지 (500x300, 회색 배경)

![Large Placeholder](https://via.placeholder.com/500x300/95a5a6/ffffff?text=Large+Image)

> **참고**: 외부 URL 이미지는 인터넷 연결이 필요합니다.

---

## 3. 제목 속성 포함

hover 시 제목이 표시되어야 합니다:

![Icon with Title](/images/icon.png "DocLight Application Icon - Hover to see this title")

![External with Title](https://via.placeholder.com/200 "External Placeholder Image")

> **참고**: 이미지 위에 마우스를 올리면 제목이 tooltip으로 표시됩니다.

---

## 4. 존재하지 않는 이미지

이 이미지는 존재하지 않아야 합니다 (alt 텍스트만 표시):

![Missing Image - This should show as alt text](nonexistent-image.png)

![Another Missing](../missing/image.jpg)

> **참고**: 이미지를 찾을 수 없으면 broken image 아이콘과 alt 텍스트가 표시됩니다.

---

## 5. 다양한 크기의 이미지

### 작은 이미지 (50x50)

작은 아이콘: ![Small](https://via.placeholder.com/50/e74c3c/ffffff?text=S)

### 중간 이미지 (200x200)

중간 크기: ![Medium](https://via.placeholder.com/200/3498db/ffffff?text=Medium)

### 큰 이미지 (600x400)

큰 배너: ![Large Banner](https://via.placeholder.com/600x400/2ecc71/ffffff?text=Large+Banner+Image)

---

## 6. 인라인 이미지

텍스트 중간에 작은 이미지를 삽입할 수 있습니다: ![inline](https://via.placeholder.com/24) 이렇게 말이죠.

또 다른 예: 여기 ![icon](/images/icon.png) DocLight 아이콘이 있습니다.

---

## 7. 연속된 여러 이미지

![Image 1](https://via.placeholder.com/100/e74c3c/ffffff?text=1)
![Image 2](https://via.placeholder.com/100/3498db/ffffff?text=2)
![Image 3](https://via.placeholder.com/100/2ecc71/ffffff?text=3)
![Image 4](https://via.placeholder.com/100/f39c12/ffffff?text=4)

---

## 테스트 체크리스트

### 기본 렌더링
- [ ] 절대 경로 이미지 표시 (`/images/icon.png`)
- [ ] 외부 URL 이미지 표시 (placeholder)
- [ ] 다양한 크기 이미지 정상 렌더링

### 속성
- [ ] alt 텍스트 설정됨
- [ ] title 속성 hover 시 표시
- [ ] loading="lazy" 속성 (성능 최적화)

### Edge Cases
- [ ] 존재하지 않는 이미지 처리 (broken image)
- [ ] 인라인 이미지 렌더링
- [ ] 연속된 여러 이미지

### 성능
- [ ] 이미지 lazy loading 동작
- [ ] 외부 이미지 로딩 시간 적절
- [ ] 큰 이미지도 페이지 레이아웃 깨지지 않음

---

## 예상 결과

- ✅ 모든 절대 경로 이미지 정상 표시
- ✅ 외부 URL 이미지 정상 표시
- ✅ alt/title 속성 정상 동작
- ⚠️ 존재하지 않는 이미지는 broken image 아이콘
- ✅ 다양한 크기 이미지 모두 렌더링

---

## 결론

DocLight의 마크다운 이미지 렌더링이 정상적으로 작동하는지 종합 검증합니다.
