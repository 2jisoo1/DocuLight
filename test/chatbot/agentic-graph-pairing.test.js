/**
 * TASK-P1-001: Agentic LangGraph — tool_use / tool_result 페어링 무결성 테스트
 * Run: node test/chatbot/agentic-graph-pairing.test.js
 * Expected stdout: tool_use/tool_result pairing OK
 */

"use strict";

const { createAgenticGraph, validateToolPairing } = require("../../src/services/chatbot/workflow/agentic-graph");
const { AIMessage, HumanMessage, ToolMessage } = require("@langchain/core/messages");

let allPassed = true;

function check(label, cond) {
  if (!cond) {
    console.error(`  ✗ ${label}`);
    allPassed = false;
  } else {
    console.log(`  ✓ ${label}`);
  }
}

// --- validateToolPairing 단위 테스트 ---

// 케이스 1: 빈 메시지 — 페어링 없음 → true
check(
  "빈 메시지 배열 — 페어링 위반 없음",
  validateToolPairing([])
);

// 케이스 2: tool_use + 대응 tool_result → true
{
  const ai = new AIMessage({
    content: "",
    tool_calls: [{ id: "id-a", name: "read_document", args: { path: "/a.md" } }],
  });
  const tool = new ToolMessage({ content: "내용", tool_call_id: "id-a", name: "read_document" });
  check(
    "tool_use + 대응 tool_result → 페어링 유효",
    validateToolPairing([ai, tool])
  );
}

// 케이스 3: tool_use만 있고 tool_result 없음 → false
{
  const ai = new AIMessage({
    content: "",
    tool_calls: [{ id: "id-b", name: "read_document", args: { path: "/b.md" } }],
  });
  check(
    "tool_use만 존재하고 tool_result 없음 → 페어링 위반",
    !validateToolPairing([ai])
  );
}

// 케이스 4: 여러 tool_use + 모두 대응 → true
{
  const ai = new AIMessage({
    content: "",
    tool_calls: [
      { id: "id-c1", name: "list_documents", args: {} },
      { id: "id-c2", name: "read_document", args: { path: "/c.md" } },
    ],
  });
  const t1 = new ToolMessage({ content: "[]", tool_call_id: "id-c1", name: "list_documents" });
  const t2 = new ToolMessage({ content: "내용", tool_call_id: "id-c2", name: "read_document" });
  check(
    "다중 tool_use + 모두 tool_result 대응 → 페어링 유효",
    validateToolPairing([ai, t1, t2])
  );
}

// 케이스 5: 다중 중 일부 누락 → false
{
  const ai = new AIMessage({
    content: "",
    tool_calls: [
      { id: "id-d1", name: "list_documents", args: {} },
      { id: "id-d2", name: "read_document", args: { path: "/d.md" } },
    ],
  });
  const t1 = new ToolMessage({ content: "[]", tool_call_id: "id-d1", name: "list_documents" });
  // id-d2 누락
  check(
    "다중 tool_use 중 하나 누락 → 페어링 위반",
    !validateToolPairing([ai, t1])
  );
}

// --- 엔드-투-엔드: 그래프 실행 후 메시지 페어링 검증 ---

async function runE2E() {
  let callCount = 0;
  const mockLlm = {
    invoke: async () => {
      callCount++;
      if (callCount === 1) {
        // tool_call 1: 두 도구 호출 반환
        return new AIMessage({
          content: "",
          tool_calls: [
            { id: "e2e-1", name: "list_documents", args: { path: "/" } },
            { id: "e2e-2", name: "read_document", args: { path: "/intro.md" } },
          ],
        });
      }
      // tool_call 2+: 도구 호출 없음 → agenticDone=true → finalize 진입
      return new AIMessage({ content: "두 문서를 확인했습니다." });
    },
  };

  const tools = [
    {
      name: "list_documents",
      definition: {},
      execute: async () => ({ files: ["intro.md"] }),
    },
    {
      name: "read_document",
      definition: {},
      execute: async () => "소개 내용입니다.",
    },
  ];

  const graph = createAgenticGraph({ llm: mockLlm, tools, config: { chatbot: { agentic: { classifyEnabled: false } } } });
  const result = await graph.invoke(
    { messages: [new HumanMessage("문서 내용 알려줘")] },
    { configurable: { thread_id: "pairing-e2e" } }
  );

  // 그래프 흐름: analyze → tool_call(1) → observe → self_check → tool_call(2)
  //             → observe → self_check(done) → finalize
  // LLM 호출: tool_call 1회 + tool_call 1회 + finalize 1회 = 3회
  const pairing = validateToolPairing(result.messages);
  check("E2E: 그래프 실행 후 모든 tool_use에 tool_result 대응", pairing);
  check("E2E: LLM 호출 ≥ 2회 완료 (tool_call + finalize)", callCount >= 2);
  check("E2E: iteration 추적됨", typeof result.iteration === "number");
  check("E2E: agenticDone=true (정상 종료)", result.agenticDone === true);
}

runE2E()
  .then(() => {
    console.log(`\n${"=".repeat(50)}`);
    if (allPassed) {
      console.log("tool_use/tool_result pairing OK");
      console.log("PASS");
      process.exit(0);
    } else {
      console.log("FAIL: 페어링 검증 실패");
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error("ERROR:", err.message);
    process.exit(1);
  });
