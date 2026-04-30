'use strict';

/**
 * Routing Heuristic Node (FR-7, TASK-P3-002)
 * @module services/chatbot/workflow/nodes/route
 *
 * 사용자 질문 키워드 + 길이 분석으로 첫 도구 후보 0~3개를 *제안*.
 * 한국어(Han)와 영어(Eng) 균형 지원 — 최종 선택은 LLM에 위임.
 * 오류 시 E1 경로: 후보 빈 배열 반환, LLM 자율 선택.
 *
 * Trigger: Agentic Graph 진입 직후, plan 생성 직전.
 * Post-condition: winston에 heuristic_hint:[…] 기록 + LLM 실제 선택과의 일치 여부 기록.
 */

/**
 * 키워드-도구 매핑 테이블 (Han + Eng 균형).
 * 각 항목: { kwHan: string[], kwEng: string[], tools: string[] }
 */
const HEURISTIC_RULES = [
  {
    kwHan: ['목록', '리스트', '전체', '모든', '어떤 문서', '파일 목록'],
    kwEng: ['list', 'all documents', 'full tree', 'show all', 'what documents'],
    tools: ['mcp.list_full_tree', 'mcp.list_documents'],
  },
  {
    kwHan: ['최근', '최신', '새로운', '방금', '업데이트된'],
    kwEng: ['recent', 'latest', 'new', 'updated', 'recently'],
    tools: ['mcp.list_recent'],
  },
  {
    kwHan: ['검색', '찾아', '찾기', '탐색'],
    kwEng: ['search', 'find', 'look for', 'locate'],
    tools: ['mcp.smart_search', 'mcp.search_documents'],
  },
  {
    kwHan: ['요약', '요점', '간략', '개요', '정리'],
    kwEng: ['summarize', 'summary', 'overview', 'brief', 'tldr'],
    tools: ['mcp.summarize_document'],
  },
  {
    kwHan: ['코드', '예제', '예시', '샘플', '코드 블록'],
    kwEng: ['code', 'example', 'sample', 'snippet', 'code block'],
    tools: ['mcp.extract_code_block'],
  },
  {
    kwHan: ['섹션', '절', '단락', '부분'],
    kwEng: ['section', 'paragraph', 'part', 'chapter'],
    tools: ['mcp.extract_section'],
  },
  {
    kwHan: ['어떤', '무엇', '뭐야', '뭐가', '어떻게', '설명', '알려줘', '가르쳐'],
    kwEng: ['what is', 'how to', 'explain', 'describe', 'tell me', 'show me'],
    tools: ['mcp.query_document', 'mcp.search_documents'],
  },
];

/**
 * 한국어 문자 포함 비율 계산 (U+AC00–U+D7A3 한글 범위).
 * @param {string} text
 * @returns {number} 0.0~1.0
 */
function hanRatio(text) {
  const total = text.replace(/\s/g, '').length;
  if (total === 0) return 0;
  const han = (text.match(/[\uAC00-\uD7A3]/g) || []).length;
  return han / total;
}

/**
 * 질문 텍스트에서 첫 도구 후보 0~3개를 추출.
 *
 * @param {string} queryText - 사용자 질문
 * @returns {string[]} 추천 도구 internal name 목록 (최대 3개, 중복 제거)
 */
function computeHints(queryText) {
  if (!queryText || typeof queryText !== 'string') return [];

  const text = queryText.trim();
  if (text.length === 0) return [];

  const lower = text.toLowerCase();
  const isHanDominant = hanRatio(text) > 0.3;

  const matched = new Set();

  for (const rule of HEURISTIC_RULES) {
    const kwList = isHanDominant ? rule.kwHan : rule.kwEng;
    const altList = isHanDominant ? rule.kwEng : rule.kwHan;

    const hitPrimary = kwList.some((kw) => lower.includes(kw.toLowerCase()) || text.includes(kw));
    const hitAlt = altList.some((kw) => lower.includes(kw.toLowerCase()) || text.includes(kw));

    if (hitPrimary || hitAlt) {
      for (const tool of rule.tools) {
        matched.add(tool);
        if (matched.size >= 3) break; // inner: stop adding from this rule once cap reached
      }
    }
    if (matched.size >= 3) break; // outer: stop evaluating further rules
  }

  // 짧은 질문 길이 보완: 키워드 미매칭 + 길이 > 10 → smart_search fallback
  if (matched.size === 0 && text.length > 10) {
    matched.add('mcp.smart_search');
  }

  return Array.from(matched).slice(0, 3);
}

/**
 * Routing Heuristic Node — LangGraph 노드 함수.
 *
 * @param {Object} state - 워크플로우 상태
 * @param {Object} [deps]
 * @param {Object} [deps.logger] - winston 로거 (없으면 no-op)
 * @returns {Object} 업데이트된 상태 (heuristicHints 필드)
 */
function routingHeuristicNode(state, { logger } = {}) {
  try {
    const messages = state.messages || [];
    const last = messages[messages.length - 1];
    const queryText = last
      ? (typeof last === 'string' ? last : last.content || '')
      : '';

    const hints = computeHints(queryText);

    if (logger && typeof logger.info === 'function') {
      logger.info('heuristic_hint', {
        event: 'heuristic_hint',
        hints,
        query_length: queryText.length,
        han_dominant: hanRatio(queryText) > 0.3,
      });
    }

    return {
      heuristicHints: hints,
      currentStep: 'routingHeuristic',
    };
  } catch (_err) {
    // E1: 오류 → 빈 후보, LLM 자율 선택
    return {
      heuristicHints: [],
      currentStep: 'routingHeuristic',
    };
  }
}

/**
 * LLM이 실제 선택한 첫 도구를 휴리스틱 힌트와 비교해 winston에 기록.
 *
 * @param {string[]} hints - computeHints 결과
 * @param {string|null} actualTool - LLM이 실제 선택한 도구 (없으면 null)
 * @param {Object} logger - winston 로거
 */
function recordHintMatch(hints, actualTool, logger) {
  if (!logger || typeof logger.info !== 'function') return;
  logger.info('heuristic_match', {
    event: 'heuristic_match',
    hints,
    actual_tool: actualTool,
    match: actualTool != null && hints.includes(actualTool),
  });
}

module.exports = { routingHeuristicNode, computeHints, hanRatio, recordHintMatch };
