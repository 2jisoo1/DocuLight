---
title: DocLight MCP 도구명 동적화 완료 보고서
project: DocLight
date: 2026-03-29
type: completion
---

# 완료 보고서

## 1. 요약
| 항목 | 값 |
|------|-----|
| 프로젝트 | DocLight |
| 계획 문서 | `docs/plan/light/plan.2026-03-29_mcp-tool-name-dynamic.md` |
| 총 Phase 수 | 2 |
| 완료된 Phase | 2 |
| 총 개선 반복 횟수 | 2회 (1차: 73점 → 수정 → 2차: 87점) |

## 2. 변경 파일
| 파일 | 변경 유형 | 설명 |
|------|----------|------|
| `src/routes/mcp.js` | 수정 | `sanitizeForToolName()`, `buildTools(prefix)`, 동적 case, serverInfo, instructions |
| `src/services/mcp/project-resolver-service.js` | 수정 | `formatAsMarkdown()`에 prefix 옵션 추가 |
| `test/test-mcp-tools.js` | 수정 | 동적 도구명 탐지로 업데이트 |

## 3. 구현 상세

### Phase 1: prefix 유틸리티 + TOOLS 동적 빌더
- `DEFAULT_MCP_PREFIX` 상수 + `sanitizeForToolName(title)` 함수 추가
  - 공백 → `_`, 비영숫자 제거, fallback `'DocuLight'`
- `const TOOLS = [...]` → `function buildTools(prefix) { return [...] }` 변환
- 도구명 3개 + 설명문 교차참조 5곳을 template literal로 동적화

### Phase 2: 라우터 핸들러 동적화
- `createMcpRouter()` 내 매 요청마다 `sanitizeForToolName(config.ui?.title)`로 prefix 계산
- `requiresReadAuth(toolName, prefix)` — 보호 도구 목록 동적화
- `executeTool(..., prefix)` — switch-case 내 동적 case 라벨 (`case prefix + '_get_config':`)
- `serverInfo.name` → `prefix`, `instructions` → `${prefix}_smart_search`
- `project-resolver-service.js`의 `formatAsMarkdown()` 출력에도 동적 prefix 적용

## 4. 코드 재사용
| 항목 | 값 |
|------|-----|
| 재사용된 기존 패턴 | `req.app.locals.config` 접근 패턴 |
| 방지된 중복 코드 | `DEFAULT_MCP_PREFIX` 상수화로 fallback 문자열 중복 제거 |

## 5. Phase별 평가 점수
| Phase | 제목 | 최종 점수 | 반복 횟수 |
|-------|------|-----------|-----------|
| 1 | prefix 유틸리티 + TOOLS 동적 빌더 | 87점 | 2회 |
| 2 | 라우터 핸들러 동적화 | 87점 | 2회 |

> 이 점수는 lite 기준(90점/4기준/2인)이며, plan-driven-coder-v2 기준(95점/7기준/4인)과 직접 비교할 수 없습니다.

## 6. 특이사항
- JavaScript의 switch-case는 런타임 표현식을 지원하므로 `case prefix + '_get_config':` 패턴으로 최소 변경 달성
- `list_full_tree`가 `requiresReadAuth()` 보호 목록에 누락된 기존 버그 발견 — 이번 변경 범위 밖이므로 미수정
- 테스트 파일의 하드코딩 도구명을 동적 탐지(`endsWith('_get_config')`)로 변경하여 어떤 `ui.title`에서도 동작 보장
