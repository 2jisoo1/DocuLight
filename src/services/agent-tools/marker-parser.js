'use strict';

/**
 * [PLAN]/[OBSERVE]/[SELF_CHECK] 마커 파서 (FR-4, TASK-P3-001)
 *
 * LLM 출력에서 구조화 추론 마커를 추출한다.
 * 마커 순서: [PLAN] → [OBSERVE] → [SELF_CHECK]
 */

const MARKER_NAMES = ['PLAN', 'OBSERVE', 'SELF_CHECK'];

// RE2-호환 선형 시간 패턴: 탐욕적 전방탐색 대신 대안 분기로 종료
const MARKER_RE = /\[(PLAN|OBSERVE|SELF_CHECK)\]([\s\S]*?)(?=\[(PLAN|OBSERVE|SELF_CHECK)\]|$)/g;

/**
 * 텍스트에서 마커 섹션을 파싱하여 { PLAN, OBSERVE, SELF_CHECK } 객체를 반환.
 * 존재하지 않는 마커 키는 결과 객체에 포함되지 않는다.
 *
 * @param {string} text
 * @returns {Record<string, string>}
 */
function parseMarkers(text) {
  if (!text) return {};
  const result = {};
  MARKER_RE.lastIndex = 0;
  let match;
  while ((match = MARKER_RE.exec(text)) !== null) {
    result[match[1]] = match[2].trim();
  }
  return result;
}

/**
 * 텍스트에 특정 마커가 존재하는지 확인.
 *
 * @param {string} text
 * @param {'PLAN'|'OBSERVE'|'SELF_CHECK'} name
 * @returns {boolean}
 */
function hasMarker(text, name) {
  return typeof text === 'string' && text.includes(`[${name}]`);
}

/**
 * 마커와 해당 섹션 내용을 텍스트에서 제거하고 나머지를 반환.
 * 첫 번째 마커 이전의 텍스트(전문)와 마커 사이의 공백은 보존된다.
 * 마지막 마커부터 문자열 끝까지의 내용도 제거된다.
 *
 * @param {string} text
 * @returns {string}
 */
function stripMarkers(text) {
  if (!text) return '';
  MARKER_RE.lastIndex = 0;
  return text.replace(MARKER_RE, '').trim();
}

module.exports = { parseMarkers, hasMarker, stripMarkers, MARKER_NAMES };
