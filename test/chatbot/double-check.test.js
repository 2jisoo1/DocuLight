"use strict";

/**
 * TASK-P2-001 — Conditional Double-Check 단위 테스트
 *
 * DoD 커버 항목:
 *   1. citation<2 트리거 (2-factor 트리거 1)
 *   2. score<threshold 트리거 (2-factor 트리거 2)
 *   3. 두 조건 모두 OK → 트리거 없음
 *   4. 이미 실행됨(double_check_triggered=true) → 재트리거 없음
 *   5. 직전 도구 차단 메시지 포함 + 강제 도구 목록 포함 (회귀 테스트)
 */

const assert = require("assert");
const {
  doubleCheckNode,
  shouldDoubleCheck,
  DOUBLE_CHECK_THRESHOLD,
  DEFAULT_FORCED_TOOLS,
} = require("../../src/services/chatbot/workflow/nodes/double-check");

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

async function test_citation_less_than_2_triggers() {
  const state = {
    citation_count: 1,
    self_check_score: 0.9,
    last_tool_name: "smart_search",
    double_check_triggered: false,
  };
  const result = await doubleCheckNode(state);

  ok("trigger=citation<2 sets double_check_triggered=true", result.double_check_triggered === true);
  ok("trigger=citation<2 sets agenticDone=false", result.agenticDone === false);
  ok(
    "trigger=citation<2 message contains trigger=citation<2",
    Array.isArray(result.messages) &&
      result.messages[0].content.includes("trigger=citation<2")
  );
  ok(
    "trigger=citation<2 message contains forced tools",
    result.messages[0].content.includes("list_full_tree") &&
      result.messages[0].content.includes("read_section")
  );
}

async function test_score_less_than_threshold_triggers() {
  const state = {
    citation_count: 5,
    self_check_score: DOUBLE_CHECK_THRESHOLD - 0.1,
    last_tool_name: "list_documents",
    double_check_triggered: false,
  };
  const result = await doubleCheckNode(state);

  ok("score<threshold sets double_check_triggered=true", result.double_check_triggered === true);
  ok("score<threshold sets agenticDone=false", result.agenticDone === false);
  ok(
    "score<threshold message contains trigger=score<threshold",
    Array.isArray(result.messages) &&
      result.messages[0].content.includes("trigger=score<threshold")
  );
}

async function test_no_trigger_when_both_ok() {
  const state = {
    citation_count: 3,
    self_check_score: DOUBLE_CHECK_THRESHOLD + 0.1,
    double_check_triggered: false,
  };
  const triggered = shouldDoubleCheck(state);
  ok("no trigger when citation>=2 AND score>=threshold", !triggered);
}

async function test_no_retrigger_after_first() {
  const state = {
    citation_count: 0,
    self_check_score: 0.0,
    double_check_triggered: true,
  };
  const triggered = shouldDoubleCheck(state);
  ok("no re-trigger when double_check_triggered=true", !triggered);
}

async function test_forced_tools_block_last_tool() {
  const state = {
    citation_count: 1,
    self_check_score: 0.9,
    last_tool_name: "smart_search",
    double_check_triggered: false,
  };
  const result = await doubleCheckNode(state);
  const content = result.messages[0].content;

  ok(
    "forced tools message includes list_full_tree and read_section",
    content.includes("list_full_tree") && content.includes("read_section")
  );
  ok(
    "forced tools message references blocked last tool (smart_search)",
    content.includes("smart_search")
  );
}

async function test_citation_count_zero_triggers() {
  const state = {
    citation_count: 0,
    self_check_score: 1.0,
    double_check_triggered: false,
  };
  const triggered = shouldDoubleCheck(state);
  ok("citation_count=0 triggers shouldDoubleCheck", triggered);
}

async function test_citation_count_2_no_trigger() {
  const state = {
    citation_count: 2,
    self_check_score: 1.0,
    double_check_triggered: false,
  };
  const triggered = shouldDoubleCheck(state);
  ok("citation_count=2 (boundary) does NOT trigger", !triggered);
}

async function test_score_at_threshold_no_trigger() {
  const state = {
    citation_count: 5,
    self_check_score: DOUBLE_CHECK_THRESHOLD, // 정확히 임계값
    double_check_triggered: false,
  };
  const triggered = shouldDoubleCheck(state);
  ok("score=threshold (boundary) does NOT trigger", !triggered);
}

async function test_both_conditions_trigger_shows_both_reasons() {
  const state = {
    citation_count: 0,
    self_check_score: 0.2,
    last_tool_name: "search_documents",
    double_check_triggered: false,
  };
  const result = await doubleCheckNode(state);
  const content = result.messages[0].content;
  ok(
    "both conditions: message contains citation<2",
    content.includes("citation<2")
  );
  ok(
    "both conditions: message contains score<threshold",
    content.includes("score<threshold")
  );
}

async function test_no_last_tool_omits_block_clause() {
  const state = {
    citation_count: 1,
    self_check_score: 0.9,
    last_tool_name: "", // 빈 문자열
    double_check_triggered: false,
  };
  const result = await doubleCheckNode(state);
  const content = result.messages[0].content;
  ok(
    "empty last_tool_name omits block clause",
    !content.includes("는 사용하지 마세요") || content.includes("()는 사용하지 마세요") === false
  );
  ok(
    "forced tools still present when last_tool_name empty",
    content.includes("list_full_tree") && content.includes("read_section")
  );
}

async function run() {
  console.log("── TASK-P2-001 double-check.test.js ──");

  await test_citation_less_than_2_triggers();
  await test_score_less_than_threshold_triggers();
  await test_no_trigger_when_both_ok();
  await test_no_retrigger_after_first();
  await test_forced_tools_block_last_tool();
  await test_citation_count_zero_triggers();
  await test_citation_count_2_no_trigger();
  await test_score_at_threshold_no_trigger();
  await test_both_conditions_trigger_shows_both_reasons();
  await test_no_last_tool_omits_block_clause();

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error("[FATAL]", err);
  process.exit(1);
});
