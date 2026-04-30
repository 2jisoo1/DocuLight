/**
 * Agentic LangGraph Graph Builder (FR-1, TASK-P1-001)
 * @module services/chatbot/workflow/agentic-graph
 *
 * ReAct + Reflexion 하이브리드 에이전틱 챗봇 워크플로우.
 *
 * 그래프 흐름:
 *   START → analyze → tool_call → observe → self_check
 *                                              ├── (done) → finalize → END
 *                                              ├── (iter ≥ reflexionThreshold) → reflexion → tool_call
 *                                              └── (iter < threshold) → tool_call
 *
 * Reflexion(Shinn 2023) 트리거 기본값: iter ≥ 4.
 * iter 3에서 no-progress 감지 시 보조 Reflexion 트리거 가능.
 */

"use strict";

const { StateGraph, START, END, MemorySaver } = require("@langchain/langgraph");
const { ToolMessage, AIMessage, SystemMessage } = require("@langchain/core/messages");
const { AgenticAnnotation } = require("./state");
const { isReadOnlyTool } = require("../../agent-tools/registry");
const { BudgetController } = require("../../agent-tools/budget");
const { trimMessagesPairwise } = require("../../agent-tools/messages-trim");
const { doubleCheckNode, shouldDoubleCheck } = require("./nodes/double-check");
const { classifyByKeywords } = require("./nodes/classify");
const { SYSTEM_PROMPT, withSystemPromptAppend } = require("./prompts");

/**
 * AIMessage에서 tool_use 블록을 추출.
 * LangChain 형식(tool_calls 배열)과 Anthropic raw content 블록 형식 모두 지원.
 * 두 형식이 동시에 존재하면 LangChain tool_calls 우선 (LangChain 정규화 메시지 기준).
 *
 * @param {object} response - LLM 응답 (AIMessage 또는 동등 객체)
 * @returns {Array<{id: string, name: string, input: object}>}
 */
function extractToolCalls(response) {
  // LangChain 표준 형식 (LangChain이 정규화)
  if (Array.isArray(response.tool_calls) && response.tool_calls.length > 0) {
    return response.tool_calls.map((tc) => ({
      id: tc.id,
      name: tc.name,
      input: tc.args ?? tc.input ?? {},
    }));
  }
  // Anthropic raw content 블록 형식 (비정규화 메시지 또는 raw SDK 응답)
  if (Array.isArray(response.content)) {
    return response.content
      .filter((block) => block.type === "tool_use")
      .map((block) => ({
        id: block.id,
        name: block.name,
        input: block.input ?? {},
      }));
  }
  return [];
}

/**
 * 메시지 배열에서 tool_use / tool_result 페어링 무결성 검증.
 * 미매칭 tool_use(id)가 있으면 false. Reflexion 진입 전 필수 호출.
 *
 * @param {Array} messages - LangChain 메시지 배열
 * @returns {boolean}
 */
function validateToolPairing(messages) {
  const pendingIds = new Set();

  for (const msg of messages) {
    const type = typeof msg._getType === "function" ? msg._getType() : null;

    if (type === "ai") {
      // LangChain tool_calls
      for (const tc of msg.tool_calls ?? []) {
        pendingIds.add(tc.id);
      }
      // Anthropic raw content 블록
      if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === "tool_use") pendingIds.add(block.id);
        }
      }
    } else if (type === "tool") {
      pendingIds.delete(msg.tool_call_id);
    } else if (type === "human" && Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block.type === "tool_result") pendingIds.delete(block.tool_use_id);
      }
    }
  }

  return pendingIds.size === 0;
}

/**
 * Agentic 워크플로우 그래프 생성 (FR-1).
 * 6-노드 ReAct + Reflexion 토폴로지:
 * analyze → tool_call → observe → self_check → {finalize|reflexion|tool_call}
 *
 * @param {object} deps
 * @param {object} deps.llm - LLM 인스턴스 (invoke 메서드 보유)
 * @param {Array<{name: string, definition: object, execute: Function}>} [deps.tools=[]]
 * @param {object} [deps.retriever] - VectorStore Retriever (Phase 2 이후 사용)
 * @param {object} [deps.config={}]
 * @param {object} [deps.logger]
 * @param {object} [deps.checkpointer]
 * @returns {import("@langchain/langgraph").CompiledStateGraph}
 */
/**
 * messages 배열에서 가장 최근 HumanMessage의 텍스트 본문을 추출.
 * - string 메시지, BaseMessage(string content), BaseMessage(array content blocks) 모두 지원.
 * - 비-human 메시지(AIMessage, ToolMessage)는 건너뜀 — 체크포인트 재개 시 tail이
 *   이전 턴의 AIMessage일 수 있으므로 역방향 스캔으로 안전성 확보.
 *
 * @param {Array} messages - LangChain 메시지 배열
 * @returns {string} 추출된 텍스트 (없으면 빈 문자열)
 */
/**
 * 내부 마커가 포함된 메시지를 LLM 입력에서 제거.
 * `[SELF_CHECK]`, `[DOUBLE_CHECK ...]`는 reflexion/double-check 노드가 주입한 시스템
 * 지시문 — finalize 단계에선 의미가 없을 뿐만 아니라, 모델이 그대로 답변에 echo할
 * 위험이 있으므로 사용자에게 노출되지 않도록 사전 정제.
 *
 * @param {Array} messages
 * @returns {Array}
 */
function stripInternalMarkers(messages) {
  return messages.filter((msg) => {
    const c = typeof msg === "string" ? msg : msg?.content;
    if (typeof c !== "string") return true;
    return !c.includes("[SELF_CHECK]") && !c.includes("[DOUBLE_CHECK");
  });
}

function extractLastHumanText(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (typeof msg === "string") return msg;
    const type = typeof msg?._getType === "function" ? msg._getType() : null;
    if (type !== null && type !== "human") continue; // AIMessage/ToolMessage 건너뜀
    const c = msg?.content;
    if (typeof c === "string") return c;
    if (Array.isArray(c)) {
      const text = c
        .filter((b) => b && (b.type === "text" || typeof b.text === "string"))
        .map((b) => b.text ?? "")
        .join(" ")
        .trim();
      if (text) return text;
    }
  }
  return "";
}

function createAgenticGraph({ llm, tools = [], retriever, config = {}, logger, checkpointer, streamCallbacks }) {
  const memoryCheckpointer = checkpointer || new MemorySaver();
  const agenticCfg = config.chatbot?.agentic ?? {};
  const reflexionThreshold = agenticCfg.reflexionThreshold ?? 4;
  const toolTimeoutMs = agenticCfg.toolTimeoutMs ?? 30000;
  // Pre-flight classify: chitchat은 도구 루프 우회. 기본 활성, 명시적 false로 비활성.
  const classifyEnabled = agenticCfg.classifyEnabled !== false;
  // double_check / reflexion은 SystemMessage / 마커 주입 의존이라 OpenAI-호환 LLM(Qwen 등)에서
  // 400("System message must be at the beginning") 또는 마커 echo 위험이 있음. 기본 비활성.
  const doubleCheckEnabled = agenticCfg.doubleCheckEnabled === true;
  const reflexionEnabled = agenticCfg.reflexionEnabled === true;
  // 시스템 프롬프트: state.messages에 누적하지 않고 LLM invoke 시점에만 첫 위치에 prepend.
  // (OpenAI-호환 LLM은 system을 첫 메시지에만 허용 + checkpointer 오염 방지).
  const systemPromptText = withSystemPromptAppend(agenticCfg.systemPrompt || SYSTEM_PROMPT, config);
  const systemMessage = new SystemMessage(systemPromptText);
  const withSystem = (msgs) => {
    const arr = msgs || [];
    const firstType = typeof arr[0]?._getType === "function" ? arr[0]._getType() : null;
    return firstType === "system" ? arr : [systemMessage, ...arr];
  };
  // OpenAI function-calling 형식으로 변환 (Qwen/OpenAI-호환 endpoint 표준).
  // Anthropic 모델 사용 시 LangChain이 자동 변환 처리.
  const toolDefs = tools
    .map((t) => t.definition)
    .filter(Boolean)
    .map((d) => ({
      type: 'function',
      function: {
        name: d.name,
        description: d.description,
        parameters: d.input_schema || { type: 'object', properties: {} },
      },
    }));
  // bindTools 사용 가능 시 빌드 시점 1회 바인딩 (LangChain 표준).
  const llmWithTools = (typeof llm.bindTools === 'function' && toolDefs.length > 0)
    ? llm.bindTools(toolDefs)
    : llm;
  // 빌드 시점 1회 인덱스 구축 (per M-2 개선)
  const toolIndex = Object.fromEntries(tools.map((t) => [t.name, t]));

  // FR-8: 예산 컨트롤러 — thread_id별 격리 (H-1: 동시 요청 간 오염 방지)
  const budgetOpts = {
    maxIterations:   agenticCfg.maxIterations  ?? undefined,
    maxToolCalls:    agenticCfg.maxToolCalls   ?? undefined,
    wallClockMs:     agenticCfg.wallClockMs    ?? undefined,
    maxInputTokens:  agenticCfg.maxInputTokens ?? undefined,
    maxOutputTokens: agenticCfg.maxOutputTokens ?? undefined,
    logger,
  };
  /** @type {Map<string, import("../../agent-tools/budget").BudgetController>} */
  const budgetRegistry = new Map();
  const getBudget = (cfg) => budgetRegistry.get(cfg?.configurable?.thread_id ?? 'default');

  // ── 노드 1: analyze ──────────────────────────────────────────────────────
  // 초기 쿼리 분석. 그래프 진입 전 상태를 초기화하고 tool_call로 위임.
  // 실제 LLM 분석은 tool_call 노드에서 수행 (ReAct 패턴).
  const analyzeNode = async (state, cfg) => {
    logger?.debug("[AgenticGraph] analyze — initializing agentic state");
    // FR-8: thread_id별 BudgetController 생성 + 체크포인트 dedup 복원 (H-1 수정)
    const threadId = cfg?.configurable?.thread_id ?? 'default';
    const bc = new BudgetController(budgetOpts);
    bc.restoreDedupHashes(state.dedup_hashes ?? {});
    budgetRegistry.set(threadId, bc);
    return {
      iteration: 0,
      reflexion_active: false,
      agenticDone: false,
      agenticToolCalls: [],
      dedup_hashes: {},
      // TASK-P2-001: 새 턴 진입 시 double-check 상태 초기화 (이전 턴 오염 방지)
      double_check_triggered: false,
      citation_count: 0,
      self_check_score: 1.0,
      last_tool_name: "",
    };
  };

  // ── 노드 1.5: classify (Pre-flight) ───────────────────────────────────────
  // 사용자 질의를 chitchat / summary / question / unknown으로 분류.
  // chitchat은 도구 루프 우회 → finalize 직행으로 응답 시간/비용 절감.
  // 키워드 기반 동기 분류만 사용 (LLM 호출 추가 없음 — 분류 자체가 latency 원인이면 안 됨).
  const classifyNode = async (state) => {
    logger?.debug("[AgenticGraph] classify — pre-flight query classification (keyword)");
    const userInput = extractLastHumanText(state.messages || []);
    if (!userInput) {
      return { queryType: "unknown", confidence: 0 };
    }
    const result = classifyByKeywords(userInput);
    return {
      queryType: result.queryType,
      confidence: result.confidence,
    };
  };

  // classify 이후 라우팅: 고신뢰(≥0.8) chitchat만 finalize 직행, 그 외는 tool_call.
  // 짧은 입력의 §6 기본 분기(confidence 0.6)는 RAG 우회를 막기 위해 fast-path 제외.
  const classifyRouter = (state) => {
    if (state.queryType === "chitchat" && (state.confidence ?? 0) >= 0.8) {
      logger?.debug("[AgenticGraph] classify_router — chitchat fast-path → finalize");
      return "finalize";
    }
    logger?.debug(`[AgenticGraph] classify_router — ${state.queryType}/${state.confidence} → tool_call`);
    return "tool_call";
  };

  // ── 노드 2: tool_call ─────────────────────────────────────────────────────
  // LLM에 도구 정의를 전달하여 다음 행동(tool 호출 또는 종료)을 결정.
  // LLM이 tool_calls를 반환하면 즉시 실행; 반환하지 않으면 agenticDone=true.
  const toolCallNode = async (state, cfg) => {
    logger?.debug(`[AgenticGraph] tool_call — iteration ${(state.iteration ?? 0) + 1}`);
    // bindTools를 통해 도구 정보가 LLM에 바인딩됨 — invoke 옵션 추가 불필요.
    const response = await llmWithTools.invoke(withSystem(state.messages));
    const toolCalls = extractToolCalls(response);

    // FR-8 H-2: 토큰 사용량 기록 및 예산 초과 확인
    const bc = getBudget(cfg);
    if (bc && response.usage_metadata) {
      const tokenCheck = bc.recordTokens(
        response.usage_metadata.input_tokens ?? 0,
        response.usage_metadata.output_tokens ?? 0
      );
      if (tokenCheck.exceeded) {
        logger?.warn(`[AgenticGraph] tool_call — budget exceeded: ${tokenCheck.type}`);
        return {
          messages: [response],
          agenticToolCalls: [],
          agenticDone: true,
          iteration: (state.iteration ?? 0) + 1,
          dedup_hashes: bc.getDedupHashes(),
        };
      }
    }

    const newMessages = [response];
    const clearedCalls = [];

    if (toolCalls.length > 0) {
      const toolResults = await executeTools(toolCalls, toolIndex, toolTimeoutMs, logger, bc);
      newMessages.push(...toolResults);
    }

    return {
      messages: newMessages,
      agenticToolCalls: clearedCalls, // 실행 완료 후 큐 비움
      agenticDone: toolCalls.length === 0,
      iteration: (state.iteration ?? 0) + 1,
    };
  };

  // ── 노드 3: observe ───────────────────────────────────────────────────────
  // tool_call 결과를 관찰·기록. FR-8 예산 초과 시 agenticDone=true 설정.
  // TASK-P2-001: citation_count / last_tool_name 갱신.
  const observeNode = async (state, cfg) => {
    logger?.debug("[AgenticGraph] observe");
    const bc = getBudget(cfg);

    // TASK-P2-001: 유효 JSON + 비-에러 ToolMessage 수를 citation_count 근사값으로 사용.
    // 비-JSON 콘텐츠나 null 콘텐츠는 인용으로 카운트하지 않음 (보수적 측정).
    const allMsgs = state.messages ?? [];
    const toolMsgs = allMsgs.filter(
      (m) => typeof m._getType === "function" && m._getType() === "tool"
    );
    const citationCount = toolMsgs.filter((m) => {
      if (m.content == null) return false;
      try {
        const parsed = JSON.parse(m.content);
        return !parsed.error && !parsed.blocked;
      } catch {
        // 비-JSON 응답은 인용으로 인정하지 않음
        return false;
      }
    }).length;
    const lastToolMsg = toolMsgs[toolMsgs.length - 1];
    const lastToolName = lastToolMsg?.name ?? "";

    if (bc) {
      // FR-8: iteration 예산 확인
      const iterCheck = bc.checkIterations(state.iteration ?? 0);
      if (iterCheck.exceeded) {
        logger?.warn("[AgenticGraph] observe — budget exceeded: iterations");
        return {
          agenticDone: true,
          dedup_hashes: bc.getDedupHashes(),
          citation_count: citationCount,
          last_tool_name: lastToolName,
        };
      }

      // FR-8: wall-clock 예산 확인
      const clockCheck = bc.checkWallClock();
      if (clockCheck.exceeded) {
        logger?.warn("[AgenticGraph] observe — budget exceeded: wall_clock");
        return {
          agenticDone: true,
          dedup_hashes: bc.getDedupHashes(),
          citation_count: citationCount,
          last_tool_name: lastToolName,
        };
      }

      // dedup 상태를 LangGraph state에 동기화
      return {
        dedup_hashes: bc.getDedupHashes(),
        citation_count: citationCount,
        last_tool_name: lastToolName,
      };
    }

    return { citation_count: citationCount, last_tool_name: lastToolName };
  };

  // ── 노드 4: self_check ────────────────────────────────────────────────────
  // 경량 체크포인트 노드. no-progress 감지 시 self_check_score 하향 설정.
  // 실제 라우팅은 addConditionalEdges(selfCheckRouter)가 담당.
  const selfCheckNode = (state) => {
    logger?.debug(`[AgenticGraph] self_check — iter=${state.iteration ?? 0} done=${state.agenticDone}`);
    // no-progress 감지 시 self_check_score를 낮춰 TASK-P2-001 double-check 트리거 지원
    if (detectNoProgress(state.messages)) {
      return { self_check_score: 0.4 };
    }
    return {};
  };

  // self_check 이후 라우팅 결정 함수 (addConditionalEdges에 전달)
  const selfCheckRouter = (state) => {
    if (state.agenticDone) {
      // TASK-P2-001: finalize 전에 double-check 필요 여부 판단 (비활성 시 스킵)
      if (doubleCheckEnabled && shouldDoubleCheck(state)) return "double_check";
      return "finalize";
    }

    const iter = state.iteration ?? 0;

    // reflexion 비활성 시 항상 tool_call 또는 finalize (이터 한도 도달 시).
    if (!reflexionEnabled) {
      return iter >= reflexionThreshold ? "finalize" : "tool_call";
    }

    // reflexion 완료 후 재진입 시 무한 루프 방지: 두 번째 초과는 finalize로 강제 종료
    if (state.reflexion_active && iter >= reflexionThreshold) return "finalize";

    if (iter >= reflexionThreshold) return "reflexion";

    // iter === (reflexionThreshold - 1)에서 no-progress 보조 트리거 (iter 3 경계 케이스)
    if (iter === reflexionThreshold - 1 && detectNoProgress(state.messages)) {
      logger?.debug("[AgenticGraph] self_check — no-progress at iter 3, early reflexion");
      return "reflexion";
    }

    return "tool_call";
  };

  // ── 노드 5: reflexion ─────────────────────────────────────────────────────
  // Reflexion(Shinn 2023) self-critique. 진입 전 tool_use/tool_result 페어링 검증.
  const reflexionNode = async (state) => {
    logger?.debug("[AgenticGraph] reflexion — self-critique");

    // DoD 필수: Reflexion 진입 시 미페어링 항목을 0건으로 정규화 (TASK-P1-015)
    const sanitizedMessages = trimMessagesPairwise(state.messages);
    if (sanitizedMessages.length !== state.messages.length ||
        !validateToolPairing(sanitizedMessages)) {
      logger?.warn("[AgenticGraph] reflexion — pairing violation detected; sanitized before self-critique");
    }

    // reflexion은 비활성 default. 활성 시에도 SELF_CHECK는 system 첫 위치에 합쳐서 호출.
    const reflexionSystem = new SystemMessage(
      `${systemPromptText}\n\n[SELF_CHECK] 지금까지의 도구 호출 결과를 검토하고, 답변에 부족한 점이나 개선할 접근법을 간단히 서술하세요.`
    );
    const critique = await llm.invoke([reflexionSystem, ...sanitizedMessages]);

    return {
      messages: [critique],
      reflexion_active: true,
      agenticDone: false,
    };
  };

  // ── 노드 6: finalize ──────────────────────────────────────────────────────
  // 수집된 tool_result 컨텍스트를 바탕으로 최종 답변 생성.
  // streamCallbacks에 thread_id별 onToken이 등록되어 있으면 토큰 단위 스트리밍.
  // 클라이언트는 누적 덮어쓰기 방식이므로 매 청크마다 누적된 content 전체를 전달.
  const finalizeNode = async (state, cfg) => {
    const threadId = cfg?.configurable?.thread_id ?? 'default';
    const onToken = streamCallbacks?.get(threadId);
    const canStream = typeof llm.stream === "function" && typeof onToken === "function";

    // 내부 시스템 마커가 LLM 입력에 포함되면 모델이 마커를 그대로 echo할 수 있음.
    // finalize 직전에 정제하여 사용자 노출 방지 (이중 방어).
    const sanitizedMessages = stripInternalMarkers(state.messages || []);

    let accumulated = "";
    let finalMessage = null;

    if (canStream) {
      logger?.debug("[AgenticGraph] finalize — streaming final answer");
      try {
        const stream = await llm.stream(withSystem(sanitizedMessages));
        for await (const chunk of stream) {
          const piece = typeof chunk?.content === "string" ? chunk.content : "";
          if (piece) {
            accumulated += piece;
            try {
              // Bandwidth: O(n²) wire cost — frontend uses overwrite-style update,
              // so we must send the accumulated prefix per chunk. Acceptable for
              // local Qwen on loopback; consider delta + frontend `+=` for WAN.
              onToken(accumulated);
            } catch (cbErr) {
              logger?.warn(`[AgenticGraph] finalize onToken callback error: ${cbErr?.message || cbErr}`);
            }
          }
          finalMessage = chunk;
        }
      } catch (streamErr) {
        // 스트리밍 실패 시 invoke 폴백 (네트워크 끊김 등)
        // 폴백 결과를 onToken으로 1회 발송 — 클라이언트 빈 응답 방지.
        logger?.warn(`[AgenticGraph] finalize stream failed, falling back to invoke: ${streamErr?.message || streamErr}`);
        finalMessage = await llm.invoke(withSystem(sanitizedMessages));
        accumulated = typeof finalMessage?.content === "string" ? finalMessage.content : "";
        if (accumulated) {
          try { onToken(accumulated); } catch (_) { /* swallow */ }
        }
      }
    } else {
      logger?.debug("[AgenticGraph] finalize — generating final answer (non-streaming)");
      finalMessage = await llm.invoke(withSystem(sanitizedMessages));
      accumulated = typeof finalMessage?.content === "string" ? finalMessage.content : "";
    }

    // 프로토타입 보존: spread는 AIMessage(Chunk) 인스턴스를 plain object로 만들어
    // downstream `instanceof AIMessage` / `_getType()` 체크를 깨뜨림. 제자리 변경.
    if (finalMessage && typeof finalMessage === "object") {
      finalMessage.content = accumulated;
    } else {
      finalMessage = new AIMessage({ content: accumulated });
    }

    // H-1: 요청 완료 후 budgetRegistry 정리 (정상 종료 경로)
    budgetRegistry.delete(threadId);

    return {
      messages: [finalMessage],
      agenticDone: true,
    };
  };

  // ── 그래프 조립 ───────────────────────────────────────────────────────────
  const workflow = new StateGraph(AgenticAnnotation)
    .addNode("analyze", analyzeNode)
    .addNode("tool_call", toolCallNode)
    .addNode("observe", observeNode)
    .addNode("self_check", selfCheckNode)
    .addNode("reflexion", reflexionNode)
    // TASK-P2-001: double_check 노드 추가
    .addNode("double_check", doubleCheckNode)
    .addNode("finalize", finalizeNode)
    .addEdge(START, "analyze");

  if (classifyEnabled) {
    workflow
      .addNode("classify", classifyNode)
      .addEdge("analyze", "classify")
      .addConditionalEdges("classify", classifyRouter);
  } else {
    workflow.addEdge("analyze", "tool_call");
  }

  workflow
    .addEdge("tool_call", "observe")
    .addEdge("observe", "self_check")
    .addConditionalEdges("self_check", selfCheckRouter)
    .addEdge("reflexion", "tool_call")
    // TASK-P2-001: double_check 완료 후 tool_call로 재진입 (강제 도구 사용)
    .addEdge("double_check", "tool_call")
    .addEdge("finalize", END);

  const compiled = workflow.compile({ checkpointer: memoryCheckpointer });
  // finalize 외 경로(에러)에서 BudgetController 누수 방지용 cleanup API.
  // chatbot-service가 finally에서 호출하여 thread별 자원을 해제.
  compiled.cleanupThread = (threadId) => {
    if (threadId != null) budgetRegistry.delete(threadId);
  };
  return compiled;
}

// ── 내부 헬퍼 ────────────────────────────────────────────────────────────────

/**
 * tool_use 블록 목록을 실행하고 ToolMessage 배열 반환.
 * 도구별 타임아웃(toolTimeoutMs) 적용. non-Error 예외 안전 직렬화(M-3 수정).
 * FR-8: budget 인자 제공 시 dedup·path canonicalization·tool_call 예산 검사 수행.
 */
async function executeTools(toolCalls, toolIndex, toolTimeoutMs, logger, budget) {
  const results = [];
  for (const call of toolCalls) {
    // FR-3 이중 방어: registry 단계 + tool_call 진입 단계 (TASK-P1-003)
    if (!isReadOnlyTool(call.name)) {
      throw new Error(`Blocked: tool "${call.name}" is not read-only (C/U/D operation)`);
    }

    // FR-8: 예산 검사 (dedup + path canonicalization + tool_call count)
    if (budget) {
      const check = budget.checkToolCall(call.name, call.input ?? {});
      if (!check.allowed) {
        const msg = check.reason === 'dedup'
          ? `Duplicate tool call blocked: ${call.name}`
          : `Budget exceeded: ${check.reason}`;
        logger?.debug(`[AgenticGraph] tool blocked: ${call.name} reason=${check.reason}`);
        results.push(
          new ToolMessage({ content: JSON.stringify({ blocked: true, reason: check.reason, message: msg }), tool_call_id: call.id, name: call.name })
        );
        continue;
      }
    }

    let content;
    const tool = toolIndex[call.name];
    if (tool) {
      let timeoutHandle;
      try {
        const result = await Promise.race([
          Promise.resolve(tool.execute(call.input)),
          new Promise((_, reject) => {
            timeoutHandle = setTimeout(
              () => reject(new Error(`tool timeout: ${call.name}`)),
              toolTimeoutMs
            );
          }),
        ]);
        content = typeof result === "string" ? result : JSON.stringify(result);
      } catch (err) {
        // non-Error 값 안전 직렬화 (M-3 수정)
        const msg = err instanceof Error ? err.message : String(err);
        content = JSON.stringify({ error: msg });
        logger?.warn(`[AgenticGraph] tool execution error: ${call.name} — ${msg}`);
      } finally {
        if (timeoutHandle) clearTimeout(timeoutHandle);
      }
    } else {
      content = JSON.stringify({ error: `Unknown tool: ${call.name}` });
    }
    results.push(
      new ToolMessage({ content, tool_call_id: call.id, name: call.name })
    );
  }
  return results;
}

/**
 * 최근 메시지에서 도구 호출 후 신규 정보가 없는지(no-progress) 감지.
 * 단순 휴리스틱: 마지막 2개 ToolMessage content가 동일하면 no-progress.
 */
function detectNoProgress(messages) {
  const toolMsgs = messages.filter(
    (m) => typeof m._getType === "function" && m._getType() === "tool"
  );
  if (toolMsgs.length < 2) return false;
  const last = toolMsgs[toolMsgs.length - 1].content;
  const prev = toolMsgs[toolMsgs.length - 2].content;
  return last === prev;
}

module.exports = { createAgenticGraph, extractToolCalls, validateToolPairing, doubleCheckNode };
