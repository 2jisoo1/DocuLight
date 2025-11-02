# LangChain4j 로 AI 에이전트 개발을 위한 프롬프트 엔지니어링

> **핵심 개념 및 전략 요약**  

---

## 1. 전체 아키텍처 개요

```mermaid
graph TB
    subgraph "비즈니스 레이어"
        BIZ[비즈니스 목표]
    end
    
    subgraph "전략 레이어"
        GOAL[목표 기획<br/>SMART 원칙]
        EVAL[평가 설계<br/>정량/정성]
    end
    
    subgraph "개발 레이어"
        PROMPT[프롬프트 설계<br/>CoT/ReAct/ToT]
        RAG[RAG 시스템<br/>벡터검색+생성]
        CHAIN[자동화 체인<br/>도구통합]
    end
    
    subgraph "운영 레이어"
        TEST[테스트/평가<br/>회귀방지]
        DEVOPS[CI/CD<br/>버전관리]
        GUARD[가드레일<br/>리스크통제]
    end
    
    BIZ --> GOAL
    GOAL --> PROMPT
    GOAL --> EVAL
    
    PROMPT --> RAG
    PROMPT --> CHAIN
    
    RAG --> TEST
    CHAIN --> TEST
    
    TEST --> DEVOPS
    DEVOPS --> GUARD
    
    GUARD -.피드백.-> EVAL
    
    style BIZ fill:#e3f2fd,stroke:#1976d2,stroke-width:3px
    style GUARD fill:#ffcdd2,stroke:#c62828,stroke-width:3px
    style RAG fill:#c8e6c9,stroke:#388e3c,stroke-width:2px
```

---

## 2. 핵심 개념 Top 20

### 2.1 프롬프트 엔지니어링 (Prompt Engineering)

**정의:** LLM에게 원하는 결과를 얻기 위한 입력 설계 기술  
**Why:** 같은 모델도 프롬프트에 따라 성능 300% 차이  
**핵심:** 시스템 메시지 + 컨텍스트 + 사용자 입력 + 출력 형식

### 2.2 Function Calling (함수 호출)

**정의:** LLM이 외부 도구/API를 호출하도록 하는 메커니즘  
**Why:** 실시간 데이터, 정확한 계산, 외부 시스템 연동 필요  
**핵심:** `@Tool` 어노테이션으로 Java 메서드를 LLM에 노출

### 2.3 RAG (Retrieval-Augmented Generation)

**정의:** 외부 지식베이스 검색 + LLM 생성 결합  
**Why:** 환각 방지, 최신 정보 반영, 도메인 특화 답변  
**ROI:** 정확도 60% → 90% 향상, 고객 만족도 35% 증가

```mermaid
flowchart LR
    A[질문] --> B[벡터 검색<br/>코사인 유사도]
    B --> C[Top-K 문서]
    C --> D[컨텍스트 구성]
    D --> E[LLM 생성]
    E --> F[근거있는 답변]
    
    style A fill:#e3f2fd
    style F fill:#c8e6c9,stroke:#388e3c,stroke-width:2px
```

### 2.4 임베딩 (Embedding)

**정의:** 텍스트를 고차원 벡터(숫자 배열)로 변환  
**Why:** 의미 기반 검색 가능 (키워드 아닌 의미로 찾기)  
**모델:** OpenAI `text-embedding-ada-002` (1536차원) / `text-embedding-3-large` (3072차원)

### 2.5 벡터 DB (Vector Database)

**정의:** 임베딩 벡터를 저장하고 유사도 검색하는 DB  
**Why:** 전통적 DB는 의미 검색 불가  
**선택:** 개발(인메모리) → 프로덕션(pgvector/Pinecone/Qdrant)

### 2.6 청킹 (Chunking)

**정의:** 긴 문서를 작은 조각으로 분할  
**Why:** LLM 컨텍스트 한계(4K~200K 토큰), 검색 정확도  
**전략:** 고정길이(500토큰) / 의미기반 / 계층적

### 2.7 Hybrid Search

**정의:** BM25(키워드) + Vector Search(의미) 결합  
**Why:** "VPN-2024-v3.2" 같은 정확한 매칭 필요  
**기법:** RRF (Reciprocal Rank Fusion)

### 2.8 Re-ranking

**정의:** 초기 검색 결과를 더 정교한 모델로 재정렬  
**Why:** 속도/정확도 트레이드오프 해결  
**방법:** Cross-Encoder (질문+문서 함께 평가)

---

## 3. 고급 프롬프트 기법 4종

### 3.1 Chain-of-Thought (CoT)

**정의:** LLM이 단계별로 사고하도록 유도  
**적용:** "단계별로 생각해서 답하세요"  
**효과:** 수학/논리 문제 정확도 50%→87%

```mermaid
flowchart LR
    A[문제 입력] --> B[Step 1:<br/>문제 이해]
    B --> C[Step 2:<br/>중간 추론]
    C --> D[Step 3:<br/>계산/논리]
    D --> E[Step 4:<br/>최종 답변]
    
    style A fill:#e3f2fd,stroke:#1976d2,stroke-width:2px
    style E fill:#c8e6c9,stroke:#388e3c,stroke-width:2px
```

---

### 3.2 ReAct (Reasoning + Acting)

**정의:** 추론과 행동(도구 사용) 교차 반복  
**적용:** "Thought → Action → Observation → 반복"  
**효과:** 동적 정보 활용, 복잡한 작업 수행

```mermaid
flowchart TD
    A[질문] --> B[Thought:<br/>무엇을 해야 하나?]
    B --> C[Action:<br/>도구 호출]
    C --> D[Observation:<br/>결과 확인]
    D --> E{충분한<br/>정보?}
    E -->|No| B
    E -->|Yes| F[최종 답변]
    
    style A fill:#e3f2fd,stroke:#1976d2,stroke-width:2px
    style F fill:#c8e6c9,stroke:#388e3c,stroke-width:2px
    style E fill:#fff3e0,stroke:#f57c00,stroke-width:2px
```

---

### 3.3 Tree-of-Thoughts (ToT)

**정의:** 여러 해결 경로 탐색 후 최적 선택  
**적용:** 창의적 문제, 다양한 관점 필요 시  
**비용:** LLM 호출 5-10배 증가 (신중히 사용)

```mermaid
graph TD
    A[문제] --> B[경로 1:<br/>접근법 A]
    A --> C[경로 2:<br/>접근법 B]
    A --> D[경로 3:<br/>접근법 C]
    
    B --> B1[중간 결과 1-1]
    B --> B2[중간 결과 1-2]
    
    C --> C1[중간 결과 2-1]
    C --> C2[중간 결과 2-2]
    
    D --> D1[중간 결과 3-1]
    
    B1 --> E[평가 및<br/>최적 경로 선택]
    B2 --> E
    C1 --> E
    C2 --> E
    D1 --> E
    
    E --> F[최종 답변]
    
    style A fill:#e3f2fd,stroke:#1976d2,stroke-width:2px
    style E fill:#fff3e0,stroke:#f57c00,stroke-width:2px
    style F fill:#c8e6c9,stroke:#388e3c,stroke-width:2px
```

---

### 3.4 Reflexion (자기 성찰)

**정의:** LLM이 자신의 답변을 평가하고 개선  
**적용:** 고위험 결정, 정확성 최우선  
**프로세스:** 생성 → 자가평가 → 개선 (최대 3회)

```mermaid
flowchart TD
    A[질문] --> B[초기 답변<br/>생성]
    B --> C[자가 평가:<br/>품질 검증]
    C --> D{기준<br/>통과?}
    D -->|No| E[개선 방향<br/>도출]
    E --> F[답변 재생성]
    F --> C
    D -->|Yes| G[최종 답변]
    
    C -.반복 횟수<br/>체크.-> H{3회<br/>초과?}
    H -->|Yes| G
    H -->|No| D
    
    style A fill:#e3f2fd,stroke:#1976d2,stroke-width:2px
    style G fill:#c8e6c9,stroke:#388e3c,stroke-width:2px
    style D fill:#fff3e0,stroke:#f57c00,stroke-width:2px
    style H fill:#ffcdd2,stroke:#c62828,stroke-width:2px
```

---

## 4. 프롬프트 체인 및 자동화

### 4.1 RunnableChain

**정의:** 여러 프롬프트 단계를 파이프라인으로 연결  
**Why:** 복잡한 작업을 모듈화, 재사용  
**설계 원칙:**

- 단일 책임 (각 단계 = 1개 기능)
- 명시적 인터페이스 (입출력 명확)
- 오류 처리 및 폴백

```mermaid
flowchart LR
    A[입력] --> B[Step 1:<br/>전처리]
    B --> C[Step 2:<br/>의도 분류]
    C --> D[Step 3:<br/>컨텍스트 구성]
    D --> E[Step 4:<br/>LLM 생성]
    E --> F[Step 5:<br/>후처리]
    F --> G[최종 출력]
    
    B -.오류 발생.-> H[Fallback 1]
    D -.오류 발생.-> I[Fallback 2]
    E -.오류 발생.-> J[Fallback 3]
    
    H --> G
    I --> G
    J --> G
    
    style A fill:#e3f2fd,stroke:#1976d2,stroke-width:2px
    style G fill:#c8e6c9,stroke:#388e3c,stroke-width:2px
    style H fill:#ffcdd2,stroke:#c62828,stroke-width:1px,stroke-dasharray: 5 5
    style I fill:#ffcdd2,stroke:#c62828,stroke-width:1px,stroke-dasharray: 5 5
    style J fill:#ffcdd2,stroke:#c62828,stroke-width:1px,stroke-dasharray: 5 5
```

---

### 4.2 분기 (Branching)

**정의:** 입력/결과에 따라 다른 처리 경로 선택  
**유형:**

- 의도 기반 (문의/불만/칭찬)
- 데이터 소스 (사내DB vs API)
- 신뢰도 기반 (확신도 > 0.9 즉시 답변)

```mermaid
flowchart TD
    A[사용자 입력] --> B[의도 분류기]
    
    B --> C{의도 유형}
    
    C -->|문의| D[FAQ 검색<br/>경로]
    C -->|불만| E[고객센터<br/>에스컬레이션]
    C -->|칭찬| F[감사 메시지<br/>+ 피드백 저장]
    
    D --> G{신뢰도<br/>체크}
    G -->|>0.9| H[즉시 답변]
    G -->|<0.9| I[RAG 검색<br/>+ 정밀 답변]
    
    E --> J[담당자 배정<br/>+ 티켓 생성]
    F --> K[표준 응답]
    
    H --> L[최종 출력]
    I --> L
    J --> L
    K --> L
    
    style A fill:#e3f2fd,stroke:#1976d2,stroke-width:2px
    style C fill:#fff3e0,stroke:#f57c00,stroke-width:2px
    style G fill:#fff3e0,stroke:#f57c00,stroke-width:2px
    style L fill:#c8e6c9,stroke:#388e3c,stroke-width:2px
```

---

### 4.3 메모리 관리

**단기:** 최근 N개 메시지 (ChatMemory)  
**장기:** RAG + 벡터DB (사용자 선호도, 과거 이력)  
**전략:** 슬라이딩 윈도우 → 요약 → RAG 통합

```mermaid
flowchart TB
    subgraph "단기 메모리 (ChatMemory)"
        A[대화 시작] --> B[메시지 1]
        B --> C[메시지 2]
        C --> D[메시지 3]
        D --> E[메시지 N]
        
        E --> F{메시지 수<br/>> 임계값?}
        F -->|Yes| G[슬라이딩 윈도우:<br/>오래된 메시지 제거]
        F -->|No| H[계속 저장]
        
        G --> I[요약 생성<br/>LLM 호출]
    end
    
    subgraph "장기 메모리 (RAG)"
        I --> J[요약을<br/>벡터DB 저장]
        J --> K[임베딩 생성]
        K --> L[벡터 인덱스<br/>업데이트]
        
        M[사용자 프로필] --> L
        N[과거 대화 이력] --> L
        O[선호도 데이터] --> L
    end
    
    subgraph "검색 및 활용"
        P[새로운 질문] --> Q[관련 기억<br/>벡터 검색]
        L --> Q
        Q --> R[컨텍스트 구성]
        H --> R
        R --> S[LLM 응답 생성]
    end
    
    style A fill:#e3f2fd,stroke:#1976d2,stroke-width:2px
    style F fill:#fff3e0,stroke:#f57c00,stroke-width:2px
    style L fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px
    style S fill:#c8e6c9,stroke:#388e3c,stroke-width:2px
```

---

## 5. 테스트 및 평가

### 5.1 회귀 테스트 (Regression Test)

**정의:** 프롬프트 변경 시 기존 기능 검증  
**구성:** 50-100개 테스트 케이스 (Golden Set)  
**자동화:** CI/CD 통합, 통과율 < 95% 배포 차단

```mermaid
flowchart TD
    A[프롬프트<br/>변경 커밋] --> B[자동 테스트<br/>트리거]
    
    B --> C[Golden Set<br/>로드]
    C --> D[테스트 케이스<br/>실행]
    
    D --> E[TC 1:<br/>일반 문의]
    D --> F[TC 2:<br/>복잡한 질문]
    D --> G[TC 3:<br/>엣지 케이스]
    D --> H[TC N:<br/>...]
    
    E --> I[결과 수집<br/>및 비교]
    F --> I
    G --> I
    H --> I
    
    I --> J{통과율<br/>계산}
    
    J --> K{>= 95%?}
    K -->|Yes| L[배포 승인]
    K -->|No| M[배포 차단]
    
    M --> N[실패 케이스<br/>분석 리포트]
    N --> O[개발자<br/>알림]
    
    L --> P[프로덕션<br/>배포]
    
    style A fill:#e3f2fd,stroke:#1976d2,stroke-width:2px
    style K fill:#fff3e0,stroke:#f57c00,stroke-width:2px
    style L fill:#c8e6c9,stroke:#388e3c,stroke-width:2px
    style M fill:#ffcdd2,stroke:#c62828,stroke-width:2px
    style P fill:#c8e6c9,stroke:#388e3c,stroke-width:2px
```

---

### 5.2 평가 지표

**정량 지표:**

- 정확도 (Accuracy): 정답 일치 비율
- Recall@K: Top-K에 정답 포함 비율
- MRR (Mean Reciprocal Rank): 정답 순위의 역수 평균

**정성 지표:**

- 사실성 (Factuality): 환각 없음
- 완전성 (Completeness): 모든 정보 포함
- 근거 충실도: 검색 문서 기반 답변

```mermaid
graph TB
    subgraph "정량 지표 (Quantitative)"
        A[LLM 응답] --> B[정확도<br/>Accuracy]
        A --> C[Recall@K]
        A --> D[MRR]
        
        B --> B1[정답 일치율<br/>85-95%]
        C --> C1[Top-3 정답 포함<br/>90-98%]
        D --> D1[평균 순위<br/>1.2-2.0]
    end
    
    subgraph "정성 지표 (Qualitative)"
        A --> E[사실성<br/>Factuality]
        A --> F[완전성<br/>Completeness]
        A --> G[근거 충실도<br/>Faithfulness]
        
        E --> E1[환각 없음<br/>98%+]
        F --> F1[정보 누락 없음<br/>90%+]
        G --> G1[검색 문서 기반<br/>95%+]
    end
    
    subgraph "종합 평가"
        B1 --> H[최종 점수<br/>산출]
        C1 --> H
        D1 --> H
        E1 --> H
        F1 --> H
        G1 --> H
        
        H --> I{임계값<br/>통과?}
        I -->|Yes| J[배포 가능]
        I -->|No| K[개선 필요]
    end
    
    style A fill:#e3f2fd,stroke:#1976d2,stroke-width:2px
    style I fill:#fff3e0,stroke:#f57c00,stroke-width:2px
    style J fill:#c8e6c9,stroke:#388e3c,stroke-width:2px
    style K fill:#ffcdd2,stroke:#c62828,stroke-width:2px
```

---

### 5.3 LLM-as-a-Judge

**정의:** 별도 LLM이 답변 품질 평가  
**장점:** 사람 평가 비용 1/100, 확장 가능  
**주의:** 평가 LLM도 환각 가능 (다중 검증 필요)

```mermaid
flowchart TD
    A[평가 대상<br/>LLM 응답] --> B[Judge LLM<br/>초기화]
    
    B --> C[평가 프롬프트<br/>구성]
    
    C --> D[Judge 1:<br/>사실성 평가]
    C --> E[Judge 2:<br/>완전성 평가]
    C --> F[Judge 3:<br/>유해성 평가]
    
    D --> G[점수: 1-5<br/>+ 근거]
    E --> H[점수: 1-5<br/>+ 근거]
    F --> I[점수: 1-5<br/>+ 근거]
    
    G --> J[교차 검증<br/>Cross-validation]
    H --> J
    I --> J
    
    J --> K{일관성<br/>체크}
    
    K -->|불일치| L[사람 평가<br/>에스컬레이션]
    K -->|일치| M[최종 점수<br/>집계]
    
    M --> N{기준<br/>충족?}
    
    N -->|Yes| O[통과]
    N -->|No| P[재작업 필요]
    
    L --> Q[사람 평가<br/>결과]
    Q --> R[Judge 모델<br/>재훈련 피드백]
    
    style A fill:#e3f2fd,stroke:#1976d2,stroke-width:2px
    style K fill:#fff3e0,stroke:#f57c00,stroke-width:2px
    style N fill:#fff3e0,stroke:#f57c00,stroke-width:2px
    style O fill:#c8e6c9,stroke:#388e3c,stroke-width:2px
    style P fill:#ffcdd2,stroke:#c62828,stroke-width:2px
    style L fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px
```
---

## 6. 리스크 및 가드레일

### 6.1 5대 LLM 리스크

1. **환각 (Hallucination)** → RAG로 해결
2. **프롬프트 인젝션** → 입력 검증
3. **편향/유해 발언** → 출력 필터
4. **도구 오남용** → 권한 제어
5. **PII 유출** → 마스킹 처리

### 6.2 가드레일 (Guardrails)

**정의:** 입력/출력을 검증하고 제어하는 안전장치  
**구조:**

```
사용자 입력
  ↓
[입력 가드레일] ← 인젝션/PII 차단
  ↓
LLM 처리
  ↓
[출력 가드레일] ← 환각/유해성 검증
  ↓
최종 응답
```

**OWASP LLM Top 10 (2025):**

1. Prompt Injection (최고 위험)
2. Sensitive Information Disclosure
3. Supply Chain Vulnerabilities

---

## 7. DevOps 및 운영 전략

### 7.1 프롬프트 버전 관리

```bash
prompts/
├── customer_service_v1.0.0.txt
├── customer_service_v1.1.0.txt  # 면책 문구 추가
└── customer_service_v2.0.0.txt  # RAG 통합
```

### 7.2 CI/CD 파이프라인

```mermaid
flowchart LR
    A[코드<br/>커밋] --> B[자동<br/>테스트]
    B --> C{통과?}
    C -->|No| D[배포<br/>차단]
    C -->|Yes| E[Canary<br/>5%]
    E --> F{성능?}
    F -->|개선| G[100%<br/>배포]
    F -->|악화| H[롤백]
    
    style G fill:#c8e6c9
    style H fill:#ffcdd2
```

### 7.3 A/B 테스트

- 신규 프롬프트 10-50% 트래픽 할당
- 최소 N=1000 샘플 수집
- 통계적 유의성 검정 (p-value < 0.05)
- 승자 결정 → 100% 배포

---

## 8. 핵심 용어 치트시트

|용어|한 줄 설명|CTO가 알아야 할 이유|
|:--|:--|:--|
|**Temperature**|창의성 조절 (0=결정적, 1=창의적)|비용/품질 트레이드오프|
|**토큰**|LLM 처리 단위 (~0.75 단어)|비용 직결 (GPT-4: $0.03/1K 토큰)|
|**컨텍스트 윈도우**|모델이 한번에 처리 가능한 토큰 수|GPT-4: 128K, Claude: 200K|
|**Few-shot**|예시를 프롬프트에 포함|정확도 20-30% 향상|
|**Zero-shot**|예시 없이 작업 수행|범용성 높지만 정확도 낮음|
|**Streaming**|응답을 토큰 단위로 실시간 전송|UX 개선 (체감 속도 50% 빠름)|
|**HNSW**|고속 벡터 검색 알고리즘|검색 속도 10-100배 향상|
|**Cross-Encoder**|질문+문서 함께 평가|Re-ranking 정확도 15% 향상|
