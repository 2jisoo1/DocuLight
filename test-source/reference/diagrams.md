# Mermaid Diagrams

Mermaid를 이용한 다양한 다이어그램 예제입니다.

## 플로우차트 (Flowchart)

사용자 로그인 프로세스:

```mermaid
flowchart TD
    Start([시작]) --> Input[사용자 입력]
    Input --> Validate{입력 검증}
    Validate -->|유효| Auth[인증 확인]
    Validate -->|무효| Error1[에러: 입력 오류]
    Auth -->|성공| Session[세션 생성]
    Auth -->|실패| Error2[에러: 인증 실패]
    Session --> Dashboard[대시보드로 이동]
    Error1 --> End([종료])
    Error2 --> End
    Dashboard --> End
```

## 시퀀스 다이어그램 (Sequence Diagram)

API 호출 흐름:

```mermaid
sequenceDiagram
    participant Client
    participant API Gateway
    participant Auth Service
    participant Database
    
    Client->>API Gateway: POST /api/login
    API Gateway->>Auth Service: Validate credentials
    Auth Service->>Database: Query user
    Database-->>Auth Service: User data
    Auth Service-->>API Gateway: Auth token
    API Gateway-->>Client: 200 OK + token
    
    Client->>API Gateway: GET /api/data (with token)
    API Gateway->>Auth Service: Verify token
    Auth Service-->>API Gateway: Token valid
    API Gateway->>Database: Fetch data
    Database-->>API Gateway: Data
    API Gateway-->>Client: 200 OK + data
```

## 클래스 다이어그램 (Class Diagram)

문서 관리 시스템:

```mermaid
classDiagram
    class Document {
        -String id
        -String title
        -String content
        -Date createdAt
        -Date updatedAt
        +save()
        +delete()
        +render()
    }
    
    class Folder {
        -String id
        -String name
        -List~Document~ documents
        -List~Folder~ subfolders
        +addDocument(doc)
        +removeDocument(id)
        +addFolder(folder)
        +listContents()
    }
    
    class User {
        -String id
        -String name
        -String email
        -Role role
        +authenticate()
        +hasPermission(resource)
    }
    
    class Permission {
        -String resource
        -String action
        +check(user)
    }
    
    Folder "1" --> "*" Document : contains
    Folder "1" --> "*" Folder : contains
    User "1" --> "*" Permission : has
    Document "1" --> "1" User : ownedBy
```

## 상태 다이어그램 (State Diagram)

문서 라이프사이클:

```mermaid
stateDiagram-v2
    [*] --> Draft: 생성
    Draft --> Review: 검토 요청
    Draft --> Archived: 취소
    
    Review --> Approved: 승인
    Review --> Rejected: 거절
    Review --> Draft: 수정 요청
    
    Approved --> Published: 발행
    Published --> Deprecated: 폐기 예정
    Deprecated --> Archived: 아카이브
    
    Rejected --> Draft: 재작성
    Rejected --> Archived: 취소
    
    Archived --> [*]
```

## ER 다이어그램 (Entity Relationship)

데이터베이스 스키마:

```mermaid
erDiagram
    USER ||--o{ DOCUMENT : creates
    USER ||--o{ FOLDER : owns
    USER {
        int id PK
        string name
        string email
        string role
        datetime created_at
    }
    
    FOLDER ||--o{ DOCUMENT : contains
    FOLDER ||--o{ FOLDER : contains
    FOLDER {
        int id PK
        string name
        int parent_id FK
        int owner_id FK
        datetime created_at
    }
    
    DOCUMENT {
        int id PK
        string title
        text content
        int folder_id FK
        int author_id FK
        datetime created_at
        datetime updated_at
    }
    
    DOCUMENT ||--o{ TAG : has
    TAG {
        int id PK
        string name
    }
```

## 간트 차트 (Gantt Chart)

프로젝트 일정:

```mermaid
gantt
    title DocLight 개발 일정
    dateFormat  YYYY-MM-DD
    section Phase 1
    보일러플레이팅           :done,    phase0, 2025-10-23, 1d
    ZIP 처리 구현           :done,    phase1, 2025-10-23, 1d
    트리 확장/축소          :done,    phase2, 2025-10-23, 1d
    에러 처리 강화          :done,    phase3, 2025-10-23, 1d
    
    section Phase 2
    단위 테스트            :active,  test1, 2025-10-24, 2d
    통합 테스트            :         test2, after test1, 2d
    E2E 테스트             :         test3, after test2, 2d
    
    section Phase 4
    Docker 컨테이너화      :         deploy1, after test3, 1d
    CI/CD 파이프라인       :         deploy2, after deploy1, 1d
    프로덕션 배포          :         deploy3, after deploy2, 1d
```

## 파이 차트 (Pie Chart)

프로젝트 진행률:

```mermaid
pie title 개발 진행 상황
    "완료" : 45
    "진행 중" : 25
    "예정" : 30
```

## Git 그래프 (Git Graph)

브랜치 전략:

```mermaid
gitGraph
    commit id: "Initial commit"
    commit id: "Add boilerplate"
    branch develop
    checkout develop
    commit id: "Implement ZIP handling"
    commit id: "Add tree expansion"
    branch feature/error-handling
    checkout feature/error-handling
    commit id: "Add error handler"
    commit id: "Add retry logic"
    checkout develop
    merge feature/error-handling
    commit id: "Phase 1 complete"
    checkout main
    merge develop tag: "v0.1.0"
```

## 타임라인 (Timeline)

```mermaid
timeline
    title DocLight 개발 마일스톤
    section 2025-10
        23일 : Phase 0 보일러플레이팅
             : Phase 1 핵심 기능 구현
             : 테스트 완료
    section 2025-11
        Week 1 : Phase 2 자동화 테스트
        Week 2 : Phase 4 배포 준비
        Week 3 : 프로덕션 릴리스
        Week 4 : Phase 3 UX 개선
```
