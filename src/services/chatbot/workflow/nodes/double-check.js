"use strict";

/**
 * Conditional Double-Check Node (FR-5, TASK-P2-001)
 * @module services/chatbot/workflow/nodes/double-check
 *
 * citation < 2 OR self_check_score < threshold 2-factor 트리거.
 * 트리거 시 직전 도구와 다른 도구(list_full_tree + read_section) 강제 사용 메시지 주입.
 *
 * Rationale: Huang 2024 (LLM cannot self-correct reasoning) 회피 — 인용 부족 시
 * 다른 검색 경로를 강제하여 단일 도구 의존성 탈피.
 *
 * 메시지는 SystemMessage로 주입 — user role로 보내면 일부 모델(Qwen 등)이 사용자
 * 발화로 오인하고 finalize 단계에서 마커 텍스트를 그대로 답변에 노출함.
 */

const { SystemMessage } = require("@langchain/core/messages");

/** 내부 마커 — finalize 진입 전 LLM 입력에서 정제. */
const INTERNAL_MARKER_PREFIX = "[DOUBLE_CHECK";

/** self_check_score 임계값 — 이하 시 double-check 트리거 */
const DOUBLE_CHECK_THRESHOLD = 0.6;

/** double-check 트리거 시 강제하는 도구 목록 */
const DEFAULT_FORCED_TOOLS = ["list_full_tree", "read_section"];

/**
 * Conditional Double-Check 노드 (FR-5, TASK-P2-001).
 * 2-factor 트리거: citation_count < 2 OR self_check_score < DOUBLE_CHECK_THRESHOLD.
 * 트리거 시 list_full_tree + read_section 강제 사용 메시지를 주입하고
 * agenticDone=false로 설정해 tool_call 재진입.
 *
 * @param {object} state - AgenticAnnotation 상태
 * @param {number} [state.citation_count=0] - 비-에러 도구 결과 수 (인용 근사)
 * @param {number} [state.self_check_score=1.0] - 품질 점수 [0.0, 1.0]
 * @param {string} [state.last_tool_name=""] - 마지막으로 호출된 도구 이름
 * @param {boolean} [state.double_check_triggered=false] - 이미 실행됨 여부
 * @returns {Partial<import("../state").AgenticAnnotation>}
 */
async function doubleCheckNode(state) {
  const citationCount = state.citation_count ?? 0;
  const selfCheckScore = state.self_check_score ?? 1.0;
  const lastTool = state.last_tool_name ?? "";

  // 동시 트리거 시 양쪽 이유 모두 포함
  const reasons = [];
  if (citationCount < 2) reasons.push("citation<2");
  if (selfCheckScore < DOUBLE_CHECK_THRESHOLD) reasons.push("score<threshold");
  const triggerReason = reasons.join("+");

  const blockClause = lastTool
    ? ` 이전 도구(${lastTool})는 사용하지 마세요.`
    : "";

  const forceContent =
    `[DOUBLE_CHECK trigger=${triggerReason}] ` +
    `인용 수가 부족합니다(citation_count=${citationCount}).` +
    ` ${DEFAULT_FORCED_TOOLS.join(", ")} 도구를 순서대로 사용하세요.` +
    blockClause;

  return {
    messages: [new SystemMessage(forceContent)],
    double_check_triggered: true,
    agenticDone: false,
  };
}

/**
 * double-check 트리거 여부 판단.
 * double_check_triggered=true이면 이미 실행된 것이므로 false.
 *
 * @param {object} state
 * @returns {boolean}
 */
function shouldDoubleCheck(state) {
  if (state.double_check_triggered) return false;
  const citationCount = state.citation_count ?? 0;
  const selfCheckScore = state.self_check_score ?? 1.0;
  return citationCount < 2 || selfCheckScore < DOUBLE_CHECK_THRESHOLD;
}

module.exports = { doubleCheckNode, shouldDoubleCheck, DOUBLE_CHECK_THRESHOLD, DEFAULT_FORCED_TOOLS, INTERNAL_MARKER_PREFIX };
