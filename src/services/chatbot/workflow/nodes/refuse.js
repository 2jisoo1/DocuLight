"use strict";

/**
 * Limited Answer Mode Node (FR-9, TASK-P3-003)
 * @module services/chatbot/workflow/nodes/refuse
 *
 * 예산 초과(FR-8) 또는 태그 재요청 실패(FR-4) 시 한정 답변 모드로 전환.
 * 누적 도구 결과/인용만으로 LLM 1회 호출 후 배너 텍스트를 삽입해 반환.
 * LLM 호출 실패 시(E1) static fallback 메시지로 대체.
 *
 * Idempotent: limited_mode_triggered=true 시 재진입 없음.
 * Post-condition: winston에 limited_mode_triggered:{reason} 기록.
 */

const REFUSE_BANNER_KO =
  "⚠️ 시간/도구 예산 초과로 부분 답변입니다.";
const REFUSE_BANNER_EN =
  "⚠️ Limited answer due to budget cap.";

const STATIC_FALLBACK_MESSAGE =
  "현재까지 수집된 정보만으로 완전한 답변을 드리기 어렵습니다. 잠시 후 다시 시도해 주세요.";

const LIMITED_MODE_PROMPT =
  "[LIMITED_MODE] 지금까지 수집된 도구 결과와 인용만을 사용해 간결하게 답변하세요.";

/**
 * 한정 답변 모드 진입 여부 판단.
 * limited_mode_triggered=true 이면 이미 처리됨.
 *
 * @param {object} state - AgenticAnnotation 상태
 * @param {boolean} [state.limited_mode_triggered]
 * @param {number}  [state.iteration]
 * @param {number}  [state.thinking_budget]
 * @returns {boolean}
 */
function shouldRefuse(state) {
  if (state.limited_mode_triggered) return false;
  const iter = state.iteration ?? 0;
  const budget = state.thinking_budget ?? 10;
  return iter >= budget;
}

/**
 * Limited Answer Mode 노드 (FR-9, TASK-P3-003).
 *
 * @param {object} state - AgenticAnnotation 상태
 * @param {object} [deps]
 * @param {object} [deps.llm]    - { invoke(messages): Promise<string|{content:string}> }
 * @param {object} [deps.logger] - winston 로거
 * @param {string} [deps.lang]   - "ko" | "en" (기본 "ko")
 * @param {string} [deps.reason] - 트리거 사유 문자열 (기본 "budget_exceeded")
 * @returns {Promise<object>} 상태 업데이트 (messages, limited_mode_triggered, agenticDone)
 */
async function refuseNode(state, deps = {}) {
  if (state.limited_mode_triggered) {
    return {};
  }

  const { llm, logger, lang = "ko", reason = "budget_exceeded" } = deps;
  const banner = lang === "en" ? REFUSE_BANNER_EN : REFUSE_BANNER_KO;

  if (logger && typeof logger.warn === "function") {
    logger.warn(`limited_mode_triggered:${reason}`);
  }

  const messages = Array.isArray(state.messages) ? state.messages : [];

  let answerText;

  try {
    if (llm && typeof llm.invoke === "function") {
      const prompt = [
        ...messages,
        { role: "user", content: LIMITED_MODE_PROMPT },
      ];
      const response = await llm.invoke(prompt);

      let content;
      if (typeof response === "string") {
        content = response;
      } else if (response?.content && typeof response.content === "string") {
        content = response.content;
      } else {
        if (logger && typeof logger.warn === "function") {
          logger.warn("limited_mode_llm_unexpected_shape", {
            shape: Object.keys(response ?? {}),
          });
        }
        content = STATIC_FALLBACK_MESSAGE;
      }

      answerText = `${banner}\n\n${content}`;
    } else {
      answerText = `${banner}\n\n${STATIC_FALLBACK_MESSAGE}`;
    }
  } catch (err) {
    // E1: LLM 호출 실패 → static fallback
    if (logger && typeof logger.error === "function") {
      logger.error("limited_mode_llm_invocation_failed", {
        reason,
        error: err.message,
      });
    }
    answerText = `${banner}\n\n${STATIC_FALLBACK_MESSAGE}`;
  }

  return {
    messages: [{ role: "assistant", content: answerText }],
    limited_mode_triggered: true,
    agenticDone: true,
    currentStep: "limited_mode",
  };
}

module.exports = {
  refuseNode,
  shouldRefuse,
  REFUSE_BANNER_KO,
  REFUSE_BANNER_EN,
  STATIC_FALLBACK_MESSAGE,
  LIMITED_MODE_PROMPT,
};
