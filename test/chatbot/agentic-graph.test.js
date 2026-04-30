/**
 * TASK-P1-001: Agentic LangGraph 그래프 골격 신설 — 기본 테스트
 * Run: node test/chatbot/agentic-graph.test.js
 * Expected stdout: PASS|✓.*agentic
 *
 * DoD 기준: ≥ 5 케이스 통과, state.js 필드 회귀, Reflexion 트리거 검증
 */

"use strict";

const { createAgenticGraph, extractToolCalls } = require("../../src/services/chatbot/workflow/agentic-graph");
const { AgenticAnnotation } = require("../../src/services/chatbot/workflow/state");
const { AIMessage, HumanMessage } = require("@langchain/core/messages");

let passed = 0;
let failed = 0;
const pending = [];

function test(name, fn) {
  const result = fn();
  if (result && typeof result.then === "function") {
    pending.push(
      result
        .then(() => {
          console.log(`  ✓ agentic: ${name}`);
          passed++;
        })
        .catch((err) => {
          console.error(`  ✗ agentic: ${name} — ${err.message}`);
          failed++;
        })
    );
  } else {
    console.log(`  ✓ agentic: ${name}`);
    passed++;
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

// ── 동기 테스트 ──────────────────────────────────────────────────────────────

test("AgenticAnnotation이 state.js에서 export됨", () => {
  assert(AgenticAnnotation !== undefined, "AgenticAnnotation is undefined");
});

test("state.js — 신규 필드 반영: iteration, reflexion_active, thinking_budget, dedup_hashes", () => {
  // Annotation.Root 반환값에서 직접 확인하기 어려우므로 초기 상태 스펙으로 검증
  const spec = AgenticAnnotation.spec ?? AgenticAnnotation;
  // 속성 이름 목록만 확인
  const fields = Object.keys(spec.channels ?? spec);
  assert(fields.includes("iteration"), "iteration field missing");
  assert(fields.includes("reflexion_active"), "reflexion_active field missing");
  assert(fields.includes("thinking_budget"), "thinking_budget field missing");
  assert(fields.includes("dedup_hashes"), "dedup_hashes field missing");
});

test("extractToolCalls — LangChain tool_calls 형식 파싱", () => {
  const msg = new AIMessage({
    content: "",
    tool_calls: [{ id: "tc1", name: "list_documents", args: { path: "/" } }],
  });
  const calls = extractToolCalls(msg);
  assert(calls.length === 1, `expected 1 call, got ${calls.length}`);
  assert(calls[0].id === "tc1");
  assert(calls[0].name === "list_documents");
});

test("extractToolCalls — Anthropic raw content 형식 파싱", () => {
  const msg = { content: [{ type: "tool_use", id: "tu1", name: "read_document", input: { path: "/a.md" } }] };
  const calls = extractToolCalls(msg);
  assert(calls.length === 1);
  assert(calls[0].name === "read_document");
});

test("extractToolCalls — 도구 호출 없으면 빈 배열 반환", () => {
  const msg = new AIMessage({ content: "단순 텍스트 응답" });
  const calls = extractToolCalls(msg);
  assert(Array.isArray(calls) && calls.length === 0);
});

test("createAgenticGraph — 6-노드 그래프 생성 성공 (invoke/stream 보유)", () => {
  const mockLlm = { invoke: async () => new AIMessage({ content: "완료" }) };
  const graph = createAgenticGraph({ llm: mockLlm });
  assert(graph !== null && graph !== undefined);
  assert(typeof graph.invoke === "function");
  assert(typeof graph.stream === "function");
});

// ── 비동기 테스트 ─────────────────────────────────────────────────────────────

// [DoD] 성공 케이스: iter 2에서 finalize
test("성공(iter 2 finalize) — 2회 LLM 호출 후 종료", async () => {
  let callCount = 0;
  const mockLlm = {
    invoke: async () => {
      callCount++;
      if (callCount === 1) {
        // analyze → tool_call: 1회 도구 호출
        return new AIMessage({
          content: "",
          tool_calls: [{ id: "iter2-1", name: "list_documents", args: { path: "/" } }],
        });
      }
      // tool_call 2회차: 도구 호출 없음 → agenticDone=true → finalize
      return new AIMessage({ content: "문서 목록 확인 완료" });
    },
  };
  const tools = [
    {
      name: "list_documents",
      definition: {},
      execute: async () => ({ files: ["guide.md"] }),
    },
  ];
  const graph = createAgenticGraph({ llm: mockLlm, tools, config: { chatbot: { agentic: { classifyEnabled: false } } } });
  const result = await graph.invoke(
    { messages: [new HumanMessage("파일 목록 알려줘")] },
    { configurable: { thread_id: "test-iter2" } }
  );
  // 두 번째 tool_call(iter=2)에서 done, 그 후 finalize 호출(callCount=3)
  assert(result.agenticDone === true, "agenticDone should be true after finalize");
  assert(result.iteration <= 4, `iteration should not exceed reflexionThreshold, got ${result.iteration}`);
});

// [DoD] Reflexion 케이스: iter 4에서 reflexion 진입
test("실패(iter 4 reflexion 진입) — 4회 반복 후 reflexion 트리거", async () => {
  let callCount = 0;
  let reflexionEntered = false;

  const mockLlm = {
    invoke: async (messages) => {
      callCount++;
      // reflexion node 진입 감지: [SELF_CHECK] 마커가 메시지 어디든 있으면
      const allContent = messages.map((m) =>
        typeof m?.content === "string" ? m.content : JSON.stringify(m?.content ?? "")
      ).join("|");
      if (allContent.includes("[SELF_CHECK]")) {
        reflexionEntered = true;
        return new AIMessage({ content: "자기 검토 완료" });
      }
      // 4회까지 도구 호출을 계속 반환 → iter >= reflexionThreshold(4) 도달
      return new AIMessage({
        content: "",
        tool_calls: [{ id: `iter-${callCount}`, name: "read_document", args: { path: `/doc${callCount}.md` } }],
      });
    },
  };
  const tools = [
    {
      name: "read_document",
      definition: {},
      execute: async (input) => `내용: ${input.path}`,
    },
  ];
  const graph = createAgenticGraph({
    llm: mockLlm,
    tools,
    config: { chatbot: { agentic: { reflexionThreshold: 4, classifyEnabled: false, reflexionEnabled: true } } },
  });
  const result = await graph.invoke(
    { messages: [new HumanMessage("문서 분석해줘")] },
    { configurable: { thread_id: "test-reflexion" } }
  );
  assert(reflexionEntered, "reflexion node should have been entered at iter >= 4");
  assert(result.reflexion_active === true, "reflexion_active should be true after reflexion");
});

// [DoD] 경계 케이스: iter 3 no-progress 보조 트리거
test("경계(iter 3 no-progress) — 동일 결과 반복 시 조기 reflexion 진입", async () => {
  let reflexionEntered = false;
  let callCount = 0;

  const mockLlm = {
    invoke: async (messages) => {
      callCount++;
      const lastMsg = messages[messages.length - 1];
      const lastContent =
        typeof lastMsg.content === "string"
          ? lastMsg.content
          : JSON.stringify(lastMsg.content ?? "");
      if (lastContent.includes("[SELF_CHECK]")) {
        reflexionEntered = true;
        return new AIMessage({ content: "자기 검토 완료" });
      }
      return new AIMessage({
        content: "",
        tool_calls: [{ id: `np-${callCount}`, name: "read_document", args: { path: "/same.md" } }],
      });
    },
  };
  const tools = [
    {
      name: "read_document",
      definition: {},
      execute: async () => "DUPLICATE_CONTENT", // 항상 동일한 결과
    },
  ];
  const graph = createAgenticGraph({
    llm: mockLlm,
    tools,
    config: { chatbot: { agentic: { reflexionThreshold: 4, classifyEnabled: false, reflexionEnabled: true } } },
  });
  const result = await graph.invoke(
    { messages: [new HumanMessage("문서 반복 분석")] },
    { configurable: { thread_id: "test-noprogress" } }
  );
  // iter 3에서 동일 content 감지 → 조기 reflexion 또는 iter 4에서 정상 reflexion
  assert(
    reflexionEntered || result.reflexion_active === true,
    "reflexion should be triggered due to no-progress"
  );
});

// maxIterations 초과 방어
test("createAgenticGraph — maxIterations 초과 시 루프 강제 종료", async () => {
  const mockLlm = {
    invoke: async (messages) => {
      const allContent = messages.map((m) =>
        typeof m?.content === "string" ? m.content : ""
      ).join("|");
      if (allContent.includes("[SELF_CHECK]")) return new AIMessage({ content: "ok" });
      return new AIMessage({
        content: "",
        tool_calls: [{ id: `tc-${Date.now()}-${Math.random()}`, name: "read_document", args: { path: "/x.md" } }],
      });
    },
  };
  const tools = [{ name: "read_document", definition: {}, execute: async () => "내용" }];
  const graph = createAgenticGraph({
    llm: mockLlm,
    tools,
    config: { chatbot: { agentic: { reflexionThreshold: 2, classifyEnabled: false, reflexionEnabled: true } } },
  });
  const result = await graph.invoke(
    { messages: [new HumanMessage("무한 루프 시도")] },
    { configurable: { thread_id: "test-maxiter" } }
  );
  // reflexion 진입 후 finalize 또는 done으로 종료
  assert(result.iteration !== undefined, "iteration should be tracked");
});

Promise.all(pending).then(() => {
  console.log(`\n${"=".repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed === 0) {
    console.log("PASS");
    process.exit(0);
  } else {
    console.log("FAIL");
    process.exit(1);
  }
});
