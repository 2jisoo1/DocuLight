'use strict';

/**
 * TASK-P1-015 — tool_use/tool_result 페어링 단위 트리밍 stub
 * REQ-ID: FR-10 (선제), Δ-5
 *
 * Phase 1 역할: Reflexion 트리거 또는 lock timeout 임박 시 즉시 호출하여
 * messages 배열에서 tool_use/tool_result 페어링이 깨진 항목을 0건으로 정규화.
 * 4xx / AbortError 노출 경로를 차단한다.
 *
 * Phase 3 P3-004 인계 인터페이스:
 *   trimMessagesPairwise(messages, {
 *     keepLastN?: number,       // 완전한 페어 중 마지막 N쌍만 보존
 *     maxTokenEstimate?: number // (P3-004 신규) 60k 임계 기반 자동 트리밍
 *   }) → Message[]
 *
 * 구현 주의사항:
 * - tool_use_id 없는 legacy 항목은 보수적으로 보존 (컨텍스트 손실 방지).
 * - 혼합 콘텐츠 메시지(text + tool_use)에서 고아 tool_use 블록만 제거하고
 *   나머지 블록은 유지한다. 결과 콘텐츠가 비어 있으면 메시지 전체를 제거.
 */

/**
 * tool_use/tool_result를 쌍(pair) 단위로 보존/제거하는 트리밍 함수.
 *
 * @param {Object[]|null} messages - Anthropic/LangGraph 메시지 배열
 * @param {Object}  [options]
 * @param {number}  [options.keepLastN=Infinity] - 보존할 완전 페어 최대 수
 * @returns {Object[]} 트리밍된 메시지 배열
 */
function trimMessagesPairwise(messages, { keepLastN = Infinity } = {}) {
  if (keepLastN !== Infinity && (!Number.isInteger(keepLastN) || keepLastN < 0)) {
    throw new TypeError(`keepLastN must be a non-negative integer, got: ${keepLastN}`);
  }
  if (!Array.isArray(messages) || messages.length === 0) return [];

  // Pass 1: tool_use_id 인덱스 구성
  const toolUseIds    = new Set();
  const toolResultIds = new Set();

  for (const msg of messages) {
    for (const block of _contentBlocks(msg)) {
      if (block.type === 'tool_use' && block.id)                toolUseIds.add(block.id);
      if (block.type === 'tool_result' && block.tool_use_id)    toolResultIds.add(block.tool_use_id);
    }
  }

  // 완전한 페어 / 고아 ID 분류
  const completeIds       = new Set([...toolUseIds].filter(id => toolResultIds.has(id)));
  const orphanedUseIds    = new Set([...toolUseIds].filter(id => !toolResultIds.has(id)));
  const orphanedResultIds = new Set([...toolResultIds].filter(id => !toolUseIds.has(id)));

  // keepLastN: 오래된 완전 페어를 제거
  const droppedCompleteIds = new Set();
  if (isFinite(keepLastN) && completeIds.size > keepLastN) {
    const orderedIds = _orderedCompleteIds(messages, completeIds);
    const numToDrop  = orderedIds.length - keepLastN;
    for (let i = 0; i < numToDrop; i++) droppedCompleteIds.add(orderedIds[i]);
  }

  const removeIds = new Set([...orphanedUseIds, ...orphanedResultIds, ...droppedCompleteIds]);
  if (removeIds.size === 0) return messages.slice();

  // Pass 2: 블록 단위 필터
  const result = [];
  for (const msg of messages) {
    const blocks   = _contentBlocks(msg);
    const filtered = blocks.filter(b => !_shouldRemoveBlock(b, removeIds));

    if (filtered.length === 0 && blocks.length > 0) continue; // 메시지 전체 제거
    if (filtered.length === blocks.length) {
      result.push(msg);
    } else {
      result.push({ ...msg, content: filtered });
    }
  }
  return result;
}

// ── 내부 헬퍼 ────────────────────────────────────────────────────────────────

function _contentBlocks(msg) {
  if (!msg || !msg.content) return [];
  return Array.isArray(msg.content) ? msg.content : [];
}

function _shouldRemoveBlock(block, removeIds) {
  if (block.type === 'tool_use'    && block.id             && removeIds.has(block.id))           return true;
  if (block.type === 'tool_result' && block.tool_use_id    && removeIds.has(block.tool_use_id))  return true;
  return false;
}

/** 완전한 페어 ID를 messages 배열에서 첫 등장 순으로 반환 */
function _orderedCompleteIds(messages, completeIds) {
  const seen   = new Set();
  const result = [];
  for (const msg of messages) {
    for (const block of _contentBlocks(msg)) {
      if (block.type === 'tool_use' && block.id && completeIds.has(block.id) && !seen.has(block.id)) {
        seen.add(block.id);
        result.push(block.id);
      }
    }
  }
  return result;
}

module.exports = { trimMessagesPairwise };
