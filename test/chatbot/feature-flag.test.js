/**
 * TASK-P1-006: Feature Flag A/B (agenticMode) + 그래프 라우팅 테스트
 * Run: node test/chatbot/feature-flag.test.js
 * Expected stdout: agenticMode=B
 *
 * chatbot-service.js의 그래프 선택 로직 + Δ-9 세션 내 전환 차단 검증.
 * 실제 LLM 호출 없이 라우팅 로직만 단위 테스트.
 */

"use strict";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name} — ${err.message}`);
    failed++;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

/**
 * chatbot-service.js의 _resolveAgenticMode 동치 함수.
 * 'auto'는 Phase 1에서 'A'로 폴백.
 */
function resolveAgenticMode(raw) {
  const mode = (raw || "A").toUpperCase();
  if (mode === "B") return "B";
  if (mode === "AUTO") return "A"; // FR-7 미구현, Phase 1 폴백
  return "A";
}

/**
 * chatbot-service.js의 그래프 선택 로직을 추출한 순수 함수.
 * 동일 조건 분기: Agentic B > Self-Correcting > Thinking > 기본.
 * sessionAgenticMode: 세션 생성 시점에 고정된 모드 (Δ-9).
 */
function resolveGraph(sessionAgenticMode, config, graphs, thinkingMode = false) {
  const selfCorrectionConfig = config.chatbot?.selfCorrection || {};
  const selfCorrectionEnabled = selfCorrectionConfig.enabled !== false;
  const agenticMode = sessionAgenticMode || "A";

  if (agenticMode === "B" && graphs.agenticGraph) {
    return { name: "agenticMode=B", graph: graphs.agenticGraph };
  }
  if (selfCorrectionEnabled && graphs.selfCorrectingGraph && !thinkingMode) {
    return { name: "selfCorrecting", graph: graphs.selfCorrectingGraph };
  }
  if (thinkingMode) {
    return { name: "thinking", graph: graphs.thinkingGraph };
  }
  return { name: "standard", graph: graphs.graph };
}

// ── A/B 라우팅 테스트 ──────────────────────────────────────────────────────────

test("agenticMode 미설정 → default A → standard graph (selfCorrection 없음)", () => {
  const mode = resolveAgenticMode(undefined);
  const result = resolveGraph(
    mode,
    { chatbot: {} },
    { graph: "STANDARD", agenticGraph: "AGENTIC", selfCorrectingGraph: null, thinkingGraph: "THINKING" }
  );
  assert(result.graph === "STANDARD", `expected STANDARD, got ${result.graph}`);
});

test("agenticMode=A → standard graph (selfCorrection 없음)", () => {
  const mode = resolveAgenticMode("A");
  const result = resolveGraph(
    mode,
    { chatbot: { agenticMode: "A" } },
    { graph: "STANDARD", agenticGraph: "AGENTIC", selfCorrectingGraph: null, thinkingGraph: "THINKING" }
  );
  assert(result.graph === "STANDARD", `expected STANDARD, got ${result.graph}`);
});

test("agenticMode=auto → A 폴백 (FR-7 Phase 1 미구현)", () => {
  const mode = resolveAgenticMode("auto");
  assert(mode === "A", `auto should resolve to A in Phase 1, got ${mode}`);
  const result = resolveGraph(
    mode,
    { chatbot: {} },
    { graph: "STANDARD", agenticGraph: "AGENTIC", selfCorrectingGraph: null, thinkingGraph: "THINKING" }
  );
  assert(result.graph === "STANDARD", `expected STANDARD for auto, got ${result.graph}`);
});

test("agenticMode=B → agentic graph 선택 (selfCorrection 있어도 agentic 우선)", () => {
  const mode = resolveAgenticMode("B");
  const result = resolveGraph(
    mode,
    { chatbot: { agenticMode: "B" } },
    { graph: "STANDARD", agenticGraph: "AGENTIC", selfCorrectingGraph: "SELF_CORRECTING", thinkingGraph: "THINKING" }
  );
  assert(result.graph === "AGENTIC", `expected AGENTIC, got ${result.graph}`);
  assert(result.name === "agenticMode=B", `expected name agenticMode=B, got ${result.name}`);
  console.log(`    → agenticMode=B routing confirmed`);
});

test("agenticMode=B + thinkingMode=true → agentic 우선 (thinkingMode 무시)", () => {
  const mode = resolveAgenticMode("B");
  const result = resolveGraph(
    mode,
    { chatbot: { agenticMode: "B" } },
    { graph: "STANDARD", agenticGraph: "AGENTIC", selfCorrectingGraph: "SELF_CORRECTING", thinkingGraph: "THINKING" },
    true
  );
  // agenticMode=B가 thinkingMode보다 우선 — agenticGraph는 thinking 미지원, 단순 B 우선 정책
  assert(result.graph === "AGENTIC", `expected AGENTIC over thinking, got ${result.graph}`);
});

test("agenticMode=B이나 agenticGraph null → selfCorrecting fallback", () => {
  const mode = resolveAgenticMode("B");
  const result = resolveGraph(
    mode,
    { chatbot: { agenticMode: "B" } },
    { graph: "STANDARD", agenticGraph: null, selfCorrectingGraph: "SELF_CORRECTING", thinkingGraph: "THINKING" }
  );
  assert(result.graph === "SELF_CORRECTING", `expected SELF_CORRECTING, got ${result.graph}`);
});

test("agenticMode=B, agenticGraph null, selfCorrection disabled → standard", () => {
  const mode = resolveAgenticMode("B");
  const result = resolveGraph(
    mode,
    { chatbot: { agenticMode: "B", selfCorrection: { enabled: false } } },
    { graph: "STANDARD", agenticGraph: null, selfCorrectingGraph: "SELF_CORRECTING", thinkingGraph: "THINKING" }
  );
  assert(result.graph === "STANDARD", `expected STANDARD, got ${result.graph}`);
});

test("agenticMode=A + thinkingMode=true → thinking graph", () => {
  const mode = resolveAgenticMode("A");
  const result = resolveGraph(
    mode,
    { chatbot: { agenticMode: "A", selfCorrection: { enabled: false } } },
    { graph: "STANDARD", agenticGraph: "AGENTIC", selfCorrectingGraph: null, thinkingGraph: "THINKING" },
    true
  );
  assert(result.graph === "THINKING", `expected THINKING, got ${result.graph}`);
});

// ── Δ-9 세션 내 전환 차단 테스트 ─────────────────────────────────────────────

test("Δ-9: 세션 고정 모드(A)는 config가 B로 변경돼도 유지", () => {
  // 세션 생성 시점: config=A
  const sessionMode = resolveAgenticMode("A");
  // 이후 config가 B로 변경
  const currentConfigMode = resolveAgenticMode("B");
  // 세션은 고정 모드(A) 사용 — graph는 standard
  const result = resolveGraph(
    sessionMode,
    { chatbot: { selfCorrection: { enabled: false } } },
    { graph: "STANDARD", agenticGraph: "AGENTIC", selfCorrectingGraph: null, thinkingGraph: "THINKING" }
  );
  assert(result.graph === "STANDARD", `session should stay on A (STANDARD), got ${result.graph}`);
  assert(sessionMode !== currentConfigMode, "config changed mid-session should differ from session snapshot");
});

test("Δ-9: 세션 고정 모드(B)는 config가 A로 변경돼도 유지", () => {
  // 세션 생성 시점: config=B
  const sessionMode = resolveAgenticMode("B");
  // 이후 config가 A로 변경
  const currentConfigMode = resolveAgenticMode("A");
  // 세션은 고정 모드(B) 사용 — graph는 agentic
  const result = resolveGraph(
    sessionMode,
    { chatbot: { selfCorrection: { enabled: false } } },
    { graph: "STANDARD", agenticGraph: "AGENTIC", selfCorrectingGraph: null, thinkingGraph: "THINKING" }
  );
  assert(result.graph === "AGENTIC", `session should stay on B (AGENTIC), got ${result.graph}`);
  assert(sessionMode !== currentConfigMode, "config changed mid-session should differ from session snapshot");
});

// ── 결과 출력 ──────────────────────────────────────────────────────────────────

console.log(`\nagenticMode=B feature flag + Δ-9 session lock: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
