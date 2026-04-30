"use strict";

/**
 * TASK-P3-003 — 한정 답변 모드 재시도 + fallback 단위 테스트
 *
 * DoD 커버 항목:
 *   1. llm 미제공 → static fallback + 배너 반환
 *   2. llm 호출 실패(E1) → static fallback + 배너 반환
 *   3. llm 정상 응답 → 배너 + llm 답변 결합
 *   4. limited_mode_triggered=true → idempotent (빈 반환)
 *   5. shouldRefuse: iteration >= thinking_budget → true
 *   6. shouldRefuse: limited_mode_triggered=true → false
 *   7. agenticDone=true, limited_mode_triggered=true 반환 확인
 *   8. korean 배너 기본 적용 + english 배너 선택
 */

const assert = require("assert");
const {
  refuseNode,
  shouldRefuse,
  REFUSE_BANNER_KO,
  REFUSE_BANNER_EN,
  STATIC_FALLBACK_MESSAGE,
} = require("../../src/services/chatbot/workflow/nodes/refuse");

let passed = 0;
let failed = 0;

function ok(label, cond, detail) {
  if (cond) {
    console.log(`✓ ${label}`);
    passed++;
  } else {
    console.error(`✗ ${label}${detail ? ` — ${detail}` : ""}`);
    failed++;
  }
}

// ── test 1: no llm → static fallback ─────────────────────────────────────────
async function test_static_fallback_when_no_llm() {
  const state = { messages: [], iteration: 10, thinking_budget: 8 };
  const result = await refuseNode(state, { reason: "budget_exceeded" });

  ok(
    "static fallback message returned when llm unavailable",
    typeof result.messages[0].content === "string" &&
      result.messages[0].content.includes(STATIC_FALLBACK_MESSAGE)
  );
  ok(
    "banner included in static fallback output",
    result.messages[0].content.includes(REFUSE_BANNER_KO)
  );
}

// ── test 2: llm throws → static fallback ─────────────────────────────────────
async function test_static_fallback_on_llm_error() {
  const state = { messages: [], iteration: 5, thinking_budget: 5 };
  const throwingLlm = {
    invoke: async () => { throw new Error("API timeout"); },
  };
  const result = await refuseNode(state, { llm: throwingLlm, reason: "api_error" });

  ok(
    "static fallback returned on llm E1 error",
    result.messages[0].content.includes(STATIC_FALLBACK_MESSAGE)
  );
  ok(
    "agenticDone=true on llm failure",
    result.agenticDone === true
  );
}

// ── test 3: llm succeeds → banner + llm answer ────────────────────────────────
async function test_llm_success_combines_banner_and_answer() {
  const state = { messages: [{ role: "user", content: "질문" }] };
  const okLlm = {
    invoke: async () => "이것은 한정 답변입니다.",
  };
  const result = await refuseNode(state, { llm: okLlm, reason: "iteration_budget" });

  ok(
    "llm success: banner prepended to answer",
    result.messages[0].content.startsWith(REFUSE_BANNER_KO)
  );
  ok(
    "llm success: answer content included",
    result.messages[0].content.includes("한정 답변입니다")
  );
}

// ── test 4: idempotent ────────────────────────────────────────────────────────
async function test_idempotent_when_already_triggered() {
  const state = { limited_mode_triggered: true, messages: [] };
  const result = await refuseNode(state, {});

  ok(
    "returns empty object when limited_mode_triggered=true",
    Object.keys(result).length === 0
  );
}

// ── test 5: shouldRefuse iteration >= budget ──────────────────────────────────
async function test_should_refuse_when_budget_exceeded() {
  ok(
    "shouldRefuse=true when iteration >= thinking_budget",
    shouldRefuse({ iteration: 10, thinking_budget: 10 })
  );
  ok(
    "shouldRefuse=true when iteration > thinking_budget",
    shouldRefuse({ iteration: 11, thinking_budget: 10 })
  );
  ok(
    "shouldRefuse=false when iteration < thinking_budget",
    !shouldRefuse({ iteration: 9, thinking_budget: 10 })
  );
}

// ── test 6: shouldRefuse blocked by flag ─────────────────────────────────────
async function test_should_refuse_false_when_already_triggered() {
  ok(
    "shouldRefuse=false when limited_mode_triggered=true",
    !shouldRefuse({ limited_mode_triggered: true, iteration: 99, thinking_budget: 1 })
  );
}

// ── test 7: state fields on success ──────────────────────────────────────────
async function test_state_fields_on_success() {
  const state = { messages: [] };
  const result = await refuseNode(state, { reason: "tag_retry_failed" });

  ok("limited_mode_triggered=true in result", result.limited_mode_triggered === true);
  ok("agenticDone=true in result", result.agenticDone === true);
  ok("currentStep='limited_mode'", result.currentStep === "limited_mode");
}

// ── test 8: english banner ────────────────────────────────────────────────────
async function test_english_banner_when_lang_en() {
  const state = { messages: [] };
  const result = await refuseNode(state, { lang: "en", reason: "budget_exceeded" });

  ok(
    "english banner applied when lang=en",
    result.messages[0].content.includes(REFUSE_BANNER_EN)
  );
  ok(
    "korean banner absent when lang=en",
    !result.messages[0].content.includes(REFUSE_BANNER_KO)
  );
}

// ── test 9: default shouldRefuse uses thinking_budget=10 fallback ─────────────
async function test_should_refuse_uses_default_budget() {
  ok(
    "shouldRefuse=true with default budget(10) when iteration=10",
    shouldRefuse({ iteration: 10 })
  );
  ok(
    "shouldRefuse=false with default budget(10) when iteration=9",
    !shouldRefuse({ iteration: 9 })
  );
}

// ── test 10: logger.warn called with correct format ────────────────────────────
async function test_logger_warn_called_with_reason() {
  const state = { messages: [] };
  let warnMsg = null;
  const spyLogger = {
    warn: (msg) => { warnMsg = msg; },
    error: () => {},
  };
  await refuseNode(state, { logger: spyLogger, reason: "tag_retry_failed" });

  ok(
    "logger.warn called with limited_mode_triggered:reason format",
    warnMsg === "limited_mode_triggered:tag_retry_failed"
  );
}

// ── test 11: llm unexpected response shape falls back ─────────────────────────
async function test_unexpected_llm_response_shape_falls_back() {
  const state = { messages: [] };
  const unexpectedLlm = {
    invoke: async () => ({ text: "unexpected shape" }),
  };
  let warnCalled = false;
  const spyLogger = {
    warn: () => { warnCalled = true; },
    error: () => {},
  };
  const result = await refuseNode(state, { llm: unexpectedLlm, logger: spyLogger });

  ok(
    "unexpected llm shape falls back to static fallback",
    result.messages[0].content.includes(STATIC_FALLBACK_MESSAGE)
  );
  ok(
    "unexpected shape triggers logger.warn",
    warnCalled
  );
}

// ── test 12: llm error path logs via logger.error ─────────────────────────────
async function test_llm_error_logs_via_logger_error() {
  const state = { messages: [] };
  const throwingLlm = {
    invoke: async () => { throw new Error("rate limit"); },
  };
  let errorLogged = false;
  const spyLogger = {
    warn: () => {},
    error: () => { errorLogged = true; },
  };
  const result = await refuseNode(state, { llm: throwingLlm, logger: spyLogger, reason: "api_error" });

  ok(
    "llm error still returns static fallback",
    result.messages[0].content.includes(STATIC_FALLBACK_MESSAGE)
  );
  ok(
    "logger.error called on LLM invocation failure",
    errorLogged
  );
}

// ── run ───────────────────────────────────────────────────────────────────────
async function run() {
  console.log("── TASK-P3-003 refuse.test.js ──");

  await test_static_fallback_when_no_llm();
  await test_static_fallback_on_llm_error();
  await test_llm_success_combines_banner_and_answer();
  await test_idempotent_when_already_triggered();
  await test_should_refuse_when_budget_exceeded();
  await test_should_refuse_false_when_already_triggered();
  await test_state_fields_on_success();
  await test_english_banner_when_lang_en();
  await test_should_refuse_uses_default_budget();
  await test_logger_warn_called_with_reason();
  await test_unexpected_llm_response_shape_falls_back();
  await test_llm_error_logs_via_logger_error();

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error("[FATAL]", err);
  process.exit(1);
});
