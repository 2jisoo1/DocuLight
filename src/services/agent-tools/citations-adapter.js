'use strict';

/**
 * TASK-P2-002 / TASK-P3-009 — Citations API + FR-21 어댑터 (Δ-2 + Δ-10 결합)
 * REQ-IDs: FR-6, FR-21
 *
 * MCP tool_result → Anthropic Citations API document block 변환.
 * Δ-10: 모든 도구 결과를 UNTRUSTED_TOOL_RESULT 태그로 래핑하여
 *       indirect injection 격리를 보장한다.
 *
 * 비 Anthropic provider에서는 어댑터 우회 — 표준 tool_result 형식 그대로 반환.
 */

const { inspect } = require('util');

const UNTRUSTED_TAG  = 'UNTRUSTED_TOOL_RESULT';
const DATA_OPEN_TAG  = '<tool_result_data>';
const DATA_CLOSE_TAG = '</tool_result_data>';

// ── _sanitizeAttr ─────────────────────────────────────────────────────────

/**
 * XML/HTML 속성 인젝션 방어: 따옴표·꺽쇠·제어문자를 밑줄로 치환.
 * UNTRUSTED_TOOL_RESULT 태그 속성에 외부 값 삽입 시 필수.
 *
 * @param {string} val
 * @returns {string}
 */
function _sanitizeAttr(val) {
  return String(val).replace(/["'<>&\n\r\t]/g, '_');
}

// ── _serialize ────────────────────────────────────────────────────────────

/**
 * 도구 결과를 문자열로 직렬화.
 *   - 빈 값(null/undefined/'')   → "(empty)" + warn
 *   - NaN                        → "(empty)" + warn
 *   - string                     → 그대로 반환
 *   - object (정상)               → JSON.stringify(,, 2)
 *   - object (circular)          → util.inspect 폴백 + warn
 *
 * @param {string|object|null|undefined} result
 * @param {object} [logger]
 * @returns {string}
 */
function _serialize(result, logger) {
  if (result === null || result === undefined || result === '') {
    logger?.warn('[citations-adapter] empty tool_result, substituting (empty)');
    return '(empty)';
  }
  if (typeof result === 'number' && Number.isNaN(result)) {
    logger?.warn('[citations-adapter] NaN tool_result, substituting (empty)');
    return '(empty)';
  }
  if (typeof result === 'string') return result;
  try {
    return JSON.stringify(result, null, 2);
  } catch (_) {
    logger?.warn('[citations-adapter] JSON.stringify failed (circular), using util.inspect');
    return inspect(result, { depth: 4, maxArrayLength: 100 });
  }
}

// ── buildWrapped ──────────────────────────────────────────────────────────

/**
 * Δ-10 injection guard: 직렬화된 도구 결과를 UNTRUSTED_TOOL_RESULT 태그로 래핑.
 * name·toolUseId는 속성 인젝션 방어를 위해 _sanitizeAttr 처리 후 삽입.
 *
 * 출력 구조:
 *   <UNTRUSTED_TOOL_RESULT name="{sanitized}" tool_use_id="{sanitized}">
 *   <tool_result_data>{data}</tool_result_data>
 *   </UNTRUSTED_TOOL_RESULT>
 *
 * @param {string} name        - 도구 이름
 * @param {string} toolUseId   - tool_use_id
 * @param {string} data        - 직렬화된 결과 문자열
 * @returns {{ wrapped: string, dataOffset: number }}
 *   dataOffset: `data`가 시작되는 wrapped 내 char 오프셋
 */
function buildWrapped(name, toolUseId, data) {
  const safeName = _sanitizeAttr(name);
  const safeId   = _sanitizeAttr(toolUseId);
  const open     = `<${UNTRUSTED_TAG} name="${safeName}" tool_use_id="${safeId}">\n${DATA_OPEN_TAG}`;
  const close    = `${DATA_CLOSE_TAG}\n</${UNTRUSTED_TAG}>`;
  return {
    wrapped:    open + data + close,
    dataOffset: open.length,
  };
}

// ── buildCustomContent ────────────────────────────────────────────────────

/**
 * TASK-P3-009 — grounding 정밀화: 텍스트를 단락 단위 content block 배열로 분할.
 *
 * Citations API custom_content 필드에 공급하면 모델이 단락 수준의 정밀한
 * start_char/end_char 오프셋으로 인용할 수 있다.
 *
 * 분할 기준: 연속 2개 이상의 개행(\n{2,}).
 * 전체 공백만 있는 단락은 제거하며, 비어있으면 단일 빈 블록을 반환한다.
 *
 * @param {string} text - 분할할 원본 텍스트 (직렬화된 tool result. UNTRUSTED 래핑 전 값)
 * @returns {{ type: 'text', text: string }[]}
 */
function buildCustomContent(text) {
  if (typeof text !== 'string') {
    throw new TypeError('[citations-adapter] buildCustomContent: text must be a string');
  }
  const paragraphs = text.split(/\n{2,}/).map(p => p.trim()).filter(p => p.length > 0);
  if (paragraphs.length === 0) return [{ type: 'text', text: '' }];
  return paragraphs.map(p => ({ type: 'text', text: p }));
}

// ── wrapToolResult ────────────────────────────────────────────────────────

/**
 * tool_result를 Anthropic Citations API user-role content block으로 변환.
 *
 * @param {{ tool_use_id: string, name: string, result: string|object }} toolResult
 * @param {{ provider?: string, logger?: object, preciseGrounding?: boolean }} [opts]
 *   preciseGrounding: true 시 document block에 custom_content 배열 추가(단락 분할 grounding).
 * @returns {object[]} content block 배열
 *   - Anthropic: [{ type:'document', source:{type:'text',data:...}, citations:{enabled:true} }]
 *   - 기타:      [{ type:'tool_result', tool_use_id, content }]
 * @throws {TypeError} tool_use_id 또는 name 이 falsy일 때
 */
function wrapToolResult({ tool_use_id, name, result }, { provider = 'anthropic', logger, preciseGrounding = false } = {}) {
  if (!tool_use_id || !name) {
    throw new TypeError('[citations-adapter] tool_use_id and name are required');
  }

  if (provider !== 'anthropic') {
    if (result === null || result === undefined) {
      logger?.warn(`[citations-adapter] non-anthropic empty tool_result for tool_use_id=${tool_use_id}`);
    }
    let content;
    if (result === null || result === undefined) {
      content = '';
    } else if (typeof result === 'string') {
      content = result;
    } else {
      try { content = JSON.stringify(result); }
      catch (_) { content = String(result); }
    }
    return [{ type: 'tool_result', tool_use_id, content }];
  }

  const data = _serialize(result, logger);
  const { wrapped } = buildWrapped(name, tool_use_id, data);

  const block = {
    type:      'document',
    source:    { type: 'text', data: wrapped },
    citations: { enabled: true },
  };

  if (preciseGrounding) {
    // data (래핑 전 직렬화 값)를 전달하여 XML envelope 텍스트가 custom_content에 노출되지 않도록 한다.
    block.custom_content = buildCustomContent(data);
  }

  return [block];
}

module.exports = { wrapToolResult, buildWrapped, buildCustomContent, _serialize, _sanitizeAttr };
