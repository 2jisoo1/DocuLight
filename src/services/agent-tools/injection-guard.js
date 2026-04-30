'use strict';

/**
 * TASK-P2-004 — Indirect Prompt Injection 방어 (Δ-10, FR-17, AR-7, DR-6)
 *
 * 도구 결과(tool_result) 내에 삽입된 프롬프트 인젝션 패턴을 탐지한다.
 * citations-adapter 의 wrapAsDocumentBlock 과 함께
 *   wrapAsDocumentBlock(wrapToolResultData(raw))
 * 형태로 사용한다.
 *
 * Public API:
 *   wrapToolResultData(text)       → string   (UNTRUSTED_TOOL_RESULT 래핑, Δ-10 명세)
 *   detectInjectionPatterns(text)  → boolean  (인젝션 의심 패턴 존재 여부)
 *   scanForInjection(text, opts?)  → { clean, matches }
 *   sanitize(text, opts?)          → string
 *   PATTERNS                       → Pattern[] (≥50개)
 */

// ─────────────────────────────────────────────────────────────────────────────
// 패턴 목록 (56개, RE2-compatible linear-time 정규식)
// 카테고리: [OVERRIDE] [ROLE] [LEAK] [JAILBREAK] [CONTEXT] [ESCAPE] [EXEC]
// ─────────────────────────────────────────────────────────────────────────────

/** @type {Array<{id: string, category: string, re: RegExp, description: string}>} */
const PATTERNS = [
  // ── [OVERRIDE] 지시 재정의 ────────────────────────────────────────────────
  { id: 'OV-01', category: 'OVERRIDE', re: /ignore\s+(all\s+)?previous\s+instructions?/i,        description: 'ignore previous instructions' },
  { id: 'OV-02', category: 'OVERRIDE', re: /disregard\s+(all\s+)?previous\s+instructions?/i,     description: 'disregard previous instructions' },
  { id: 'OV-03', category: 'OVERRIDE', re: /forget\s+(all\s+)?previous\s+instructions?/i,        description: 'forget previous instructions' },
  { id: 'OV-04', category: 'OVERRIDE', re: /override\s+(your\s+)?(instructions?|rules?|prompt)/i,description: 'override instructions/rules' },
  { id: 'OV-05', category: 'OVERRIDE', re: /do\s+not\s+follow\s+(your\s+)?(instructions?|rules?)/i, description: 'do not follow instructions' },
  { id: 'OV-06', category: 'OVERRIDE', re: /새\s*지시\s*사항/,                                    description: '새 지시 사항 (Korean override)' },
  { id: 'OV-07', category: 'OVERRIDE', re: /이전\s*지시\s*를?\s*무시/,                            description: '이전 지시 무시 (Korean)' },
  { id: 'OV-08', category: 'OVERRIDE', re: /system\s*prompt\s*override/i,                        description: 'system prompt override' },
  { id: 'OV-09', category: 'OVERRIDE', re: /new\s+instructions?\s*:/i,                           description: 'new instructions:' },
  { id: 'OV-10', category: 'OVERRIDE', re: /IMPORTANT\s*:\s*ignore\b/i,                          description: 'IMPORTANT: ignore …' },

  // ── [ROLE] 역할·페르소나 변경 ─────────────────────────────────────────────
  // RL-01: "you are now a helpful assistant" 등 benign 문장 false-positive 방지.
  // "helpful"처럼 형용사가 개입한 경우도 lookahead 로 포괄 처리.
  { id: 'RL-01', category: 'ROLE', re: /you\s+are\s+now\s+(?!(?:a\s+)?(?:\w+\s+)*assistant\b)/i, description: 'you are now [role]' },
  { id: 'RL-02', category: 'ROLE', re: /act\s+as\s+(?!(?:a\s+|an\s+)?(?:assistant|search|tool)\b)/i, description: 'act as [role]' },
  { id: 'RL-03', category: 'ROLE', re: /pretend\s+(you\s+are|to\s+be)\s+/i,                     description: 'pretend you are …' },
  { id: 'RL-04', category: 'ROLE', re: /roleplay\s+as\s+/i,                                     description: 'roleplay as …' },
  { id: 'RL-05', category: 'ROLE', re: /your\s+new\s+(role|persona|identity)\s+is\s+/i,         description: 'your new role/persona is …' },
  { id: 'RL-06', category: 'ROLE', re: /당신은\s*이제\s*(해커|악성|무제한)/,                      description: '당신은 이제 [악성 역할] (Korean)' },
  { id: 'RL-07', category: 'ROLE', re: /switch\s+(to\s+)?(developer|admin|root)\s+mode/i,       description: 'switch to developer/admin mode' },
  { id: 'RL-08', category: 'ROLE', re: /enter\s+(unrestricted|jailbreak|DAN)\s+mode/i,          description: 'enter unrestricted/jailbreak mode' },

  // ── [LEAK] 시스템 프롬프트 누출 유도 ─────────────────────────────────────
  { id: 'LK-01', category: 'LEAK', re: /print\s+(your\s+)?(system|initial)\s+prompt/i,          description: 'print system/initial prompt' },
  { id: 'LK-02', category: 'LEAK', re: /reveal\s+(your\s+)?(system|initial)\s+prompt/i,         description: 'reveal system/initial prompt' },
  { id: 'LK-03', category: 'LEAK', re: /show\s+(me\s+)?(your\s+)?(system\s+)?instructions?/i,  description: 'show (your) system instructions' },
  { id: 'LK-04', category: 'LEAK', re: /repeat\s+(your\s+)?(instructions?|prompt)\s+(back|verbatim)/i, description: 'repeat instructions verbatim' },
  { id: 'LK-05', category: 'LEAK', re: /what\s+(is|are)\s+your\s+(system\s+)?instructions?/i,  description: 'what are your (system) instructions' },
  { id: 'LK-06', category: 'LEAK', re: /시스템\s*프롬프트\s*(를)?\s*(출력|공개|보여)/,           description: '시스템 프롬프트 출력/공개 (Korean)' },

  // ── [JAILBREAK] 탈옥·제한 우회 ───────────────────────────────────────────
  { id: 'JB-01', category: 'JAILBREAK', re: /DAN\s+(mode|jailbreak)/i,                          description: 'DAN mode/jailbreak' },
  { id: 'JB-02', category: 'JAILBREAK', re: /\bDAN\b.{0,30}\bcan\b.{0,30}\banything\b/i,        description: 'DAN can do anything' },
  { id: 'JB-03', category: 'JAILBREAK', re: /jailbreak\s+(mode|enabled|activated)/i,            description: 'jailbreak mode/enabled' },
  { id: 'JB-04', category: 'JAILBREAK', re: /without\s+(any\s+)?(restrictions?|limitations?|filters?)/i, description: 'without restrictions/filters' },
  { id: 'JB-05', category: 'JAILBREAK', re: /bypass\s+(safety|content|moderation)\s+(filter|check|policy)/i, description: 'bypass safety filter/check' },
  { id: 'JB-06', category: 'JAILBREAK', re: /제한\s*(없이|을\s*무시|을\s*우회)/,                 description: '제한 없이/무시/우회 (Korean)' },
  { id: 'JB-07', category: 'JAILBREAK', re: /unlock\s+(hidden|true|full)\s+(capabilities|mode|access)/i, description: 'unlock hidden/true capabilities' },
  { id: 'JB-08', category: 'JAILBREAK', re: /developer\s+mode\s+(enabled|on|activated)/i,       description: 'developer mode enabled' },
  { id: 'JB-09', category: 'JAILBREAK', re: /god\s+mode\s+(enabled|on|activated)/i,             description: 'god mode enabled' },
  { id: 'JB-10', category: 'JAILBREAK', re: /training\s+mode\s+(off|disabled)/i,                description: 'training mode off/disabled' },

  // ── [CONTEXT] 컨텍스트 조작 ───────────────────────────────────────────────
  { id: 'CX-01', category: 'CONTEXT', re: /\[SYSTEM\]\s*:/i,                                    description: '[SYSTEM]: injection' },
  { id: 'CX-02', category: 'CONTEXT', re: /\[ASSISTANT\]\s*:/i,                                 description: '[ASSISTANT]: injection' },
  { id: 'CX-03', category: 'CONTEXT', re: /\[USER\]\s*:/i,                                      description: '[USER]: injection' },
  { id: 'CX-04', category: 'CONTEXT', re: /<\s*system\s*>/i,                                    description: '<system> tag injection' },
  { id: 'CX-05', category: 'CONTEXT', re: /<\s*\/\s*system\s*>/i,                               description: '</system> tag injection' },
  // CX-06: 개행 포함 대화 형식 인젝션 방어. [\s\S]{0,300} 으로 멀티라인 지원.
  { id: 'CX-06', category: 'CONTEXT', re: /Human\s*:[\s\S]{0,300}?Assistant\s*:/i,              description: 'H/A turn-format injection (multiline)' },
  { id: 'CX-07', category: 'CONTEXT', re: /<<SYS>>/i,                                           description: '<<SYS>> Llama-style injection' },
  { id: 'CX-08', category: 'CONTEXT', re: /\[INST\]/i,                                          description: '[INST] Llama-style injection' },
  { id: 'CX-09', category: 'CONTEXT', re: /\|\s*im_start\s*\|/i,                                description: '|im_start| injection' },
  { id: 'CX-10', category: 'CONTEXT', re: /<\|im_start\|>/i,                                    description: '<|im_start|> injection' },
  { id: 'CX-11', category: 'CONTEXT', re: /컨텍스트\s*초기화/,                                   description: '컨텍스트 초기화 (Korean)' },

  // ── [ESCAPE] 경계 탈출 ────────────────────────────────────────────────────
  { id: 'ES-01', category: 'ESCAPE', re: /---\s*END\s+OF\s+(DOCUMENT|DATA|CONTENT)\s*---/i,     description: '--- END OF DOCUMENT --- injection' },
  { id: 'ES-02', category: 'ESCAPE', re: /\[END\s+OF\s+(DOCUMENT|DATA|CONTENT)\]/i,             description: '[END OF DOCUMENT] injection' },
  { id: 'ES-03', category: 'ESCAPE', re: /---\s*BEGIN\s+INSTRUCTIONS?\s*---/i,                  description: '--- BEGIN INSTRUCTIONS --- injection' },
  { id: 'ES-04', category: 'ESCAPE', re: /\[INSTRUCTIONS?\s+START\]/i,                          description: '[INSTRUCTIONS START] injection' },
  { id: 'ES-05', category: 'ESCAPE', re: /<\/?(tool_result|tool_use)\b/i,                       description: '</tool_result> escape injection' },
  { id: 'ES-06', category: 'ESCAPE', re: /<\/UNTRUSTED_TOOL_RESULT>/i,                          description: '</UNTRUSTED_TOOL_RESULT> escape' },

  // ── [EXEC] 코드·명령 실행 유도 ───────────────────────────────────────────
  { id: 'EX-01', category: 'EXEC', re: /execute\s+the\s+following\s+(command|code|script)/i,    description: 'execute the following command/code' },
  { id: 'EX-02', category: 'EXEC', re: /run\s+this\s+(command|code|script)\s*:/i,              description: 'run this command/code:' },
  { id: 'EX-03', category: 'EXEC', re: /eval\s*\(/i,                                            description: 'eval() invocation' },
  { id: 'EX-04', category: 'EXEC', re: /os\.system\s*\(/i,                                     description: 'os.system() invocation' },
  { id: 'EX-05', category: 'EXEC', re: /subprocess\.(run|Popen|call)\s*\(/i,                   description: 'subprocess.run/Popen/call() invocation' },
];

// DoD 보증: 패턴 배열이 50개 이상인지 모듈 로드 시점에 검증.
// 이 guard는 의도적 production 동작 — 리팩토링으로 패턴이 삭제되면 서버가 기동 불가하여
// 조용한 보안 퇴행을 방지한다.
if (PATTERNS.length < 50) {
  throw new Error(`[injection-guard] PATTERNS must have ≥50 entries, got ${PATTERNS.length}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// wrapToolResultData  (Δ-10 명세, FR-17)
// ─────────────────────────────────────────────────────────────────────────────

const _OPEN_TAG  = '<UNTRUSTED_TOOL_RESULT>';
const _CLOSE_TAG = '</UNTRUSTED_TOOL_RESULT>';

/**
 * 도구 결과 텍스트를 UNTRUSTED_TOOL_RESULT 태그로 래핑한다 (Δ-10 명세).
 * 사용 패턴: `wrapAsDocumentBlock(wrapToolResultData(rawText))`
 *
 * @param {string} text - 직렬화된 도구 결과
 * @returns {string}
 */
function wrapToolResultData(text) {
  const safe = typeof text === 'string' ? text : String(text ?? '');
  return `${_OPEN_TAG}\n${safe}\n${_CLOSE_TAG}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// detectInjectionPatterns  (계획 명세 시그니처)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 텍스트에 인젝션 의심 패턴이 존재하는지 여부를 반환한다.
 * 세부 매칭 정보가 필요하면 scanForInjection 을 사용한다.
 *
 * @param {string} text
 * @returns {boolean}  true = 인젝션 패턴 발견
 */
function detectInjectionPatterns(text) {
  return !scanForInjection(text).clean;
}

// ─────────────────────────────────────────────────────────────────────────────
// scanForInjection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {object} Match
 * @property {string} patternId
 * @property {string} category
 * @property {string} description
 * @property {string} matchedText  - 매칭된 원문 (최대 120자)
 * @property {number} index        - 매칭 시작 위치 (첫 번째 발생)
 */

/**
 * @typedef {object} ScanResult
 * @property {boolean} clean
 * @property {Match[]} matches
 */

/**
 * 텍스트에서 인젝션 패턴을 스캔한다.
 *
 * 동작 특성: 패턴당 첫 번째 발생만 matches 에 보고한다.
 * 모든 발생을 제거하려면 sanitize 를 사용한다.
 *
 * @param {string}   text
 * @param {object}   [opts]
 * @param {string[]} [opts.skipCategories]
 * @param {object}   [opts.logger]
 * @returns {ScanResult}
 */
function scanForInjection(text, { skipCategories = [], logger } = {}) {
  if (typeof text !== 'string') {
    logger?.warn('[injection-guard] scanForInjection received non-string input; returning clean');
    return { clean: true, matches: [] };
  }

  /** @type {Match[]} */
  const matches = [];

  for (const p of PATTERNS) {
    if (skipCategories.includes(p.category)) continue;
    // No global flag on module-level literals; text.match returns first occurrence.
    const m = text.match(p.re);
    if (m) {
      matches.push({
        patternId:   p.id,
        category:    p.category,
        description: p.description,
        matchedText: m[0].slice(0, 120),
        index:       m.index,
      });
    }
  }

  if (matches.length > 0) {
    logger?.warn(
      `[injection-guard] ${matches.length} injection pattern(s) found: ` +
      matches.map(m => m.patternId).join(', ')
    );
  }

  return { clean: matches.length === 0, matches };
}

// ─────────────────────────────────────────────────────────────────────────────
// sanitize
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 텍스트에서 인젝션 패턴을 치환하여 정제된 문자열을 반환한다.
 * 패턴당 모든 발생을 치환한다 (global replace).
 *
 * @param {string}   text
 * @param {object}   [opts]
 * @param {string}   [opts.replacement]     - 치환 문자열 (기본 '[INJECTION REDACTED]')
 * @param {string[]} [opts.skipCategories]
 * @param {object}   [opts.logger]
 * @returns {string}
 */
function sanitize(text, { replacement = '[INJECTION REDACTED]', skipCategories = [], logger } = {}) {
  if (typeof text !== 'string') {
    // 계약상 string 반환; 비문자열 입력은 빈 문자열로 강제 변환.
    logger?.warn('[injection-guard] sanitize received non-string input; returning empty string');
    return '';
  }

  let out = text;
  for (const p of PATTERNS) {
    if (skipCategories.includes(p.category)) continue;
    out = out.replace(new RegExp(p.re.source, p.re.flags.replace('g', '') + 'g'), replacement);
  }

  if (out !== text) {
    logger?.info('[injection-guard] sanitized injection pattern(s) from text');
  }
  return out;
}

module.exports = {
  PATTERNS,
  wrapToolResultData,
  detectInjectionPatterns,
  scanForInjection,
  sanitize,
};
