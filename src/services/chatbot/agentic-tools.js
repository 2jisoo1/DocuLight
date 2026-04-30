'use strict';

/**
 * Agentic mode (mode B) tool adapter.
 *
 * MCP가 제공하는 read-only 검색/문서 도구 정의를 LangChain tool 형식으로 변환하여
 * agentic-graph의 tool_call 노드에서 사용할 수 있게 한다.
 *
 * 디자인:
 * - 도구 정의(name/description/inputSchema)는 routes/mcp.js의 buildTools()에서 그대로 가져옴 (SSOT).
 * - 핸들러는 services/agent-tools/handlers/*.js를 직접 호출 (HTTP 라우터 우회).
 * - 핸들러가 req.app.locals를 참조하는 경우를 위해 chatbotService가 보관하는
 *   runtimeContext를 fake req로 감싸 전달.
 * - C/U/D 도구는 read-only 정책상 제외.
 */

const { buildTools, sanitizeForToolName } = require('../../routes/mcp');
const handlers = require('../agent-tools/handlers');

/** read-only 정책상 챗봇 agentic 모드에서 노출 금지 도구. */
const EXCLUDED_TOOLS = new Set(['create_document', 'delete_document']);

/**
 * MCP 도구 정의 + 핸들러를 agentic-graph가 요구하는 `{name, definition, execute}` 형식으로 매핑.
 *
 * @param {object} opts
 * @param {object} opts.config - 전역 config 객체
 * @param {object} opts.logger - winston 로거
 * @param {() => object} opts.getRuntimeContext - app.locals 호환 객체를 반환하는 lazy getter
 *   (chatbotService가 attach 후 채워짐 — 빌드 시점엔 빈 객체일 수 있음)
 * @returns {Array<{name: string, definition: object, execute: (input: object) => Promise<any>}>}
 */
function buildAgenticTools({ config, logger, getRuntimeContext }) {
  const prefix = sanitizeForToolName(config?.ui?.title);
  const mcpDefs = buildTools(prefix);

  const tools = [];
  for (const def of mcpDefs) {
    if (EXCLUDED_TOOLS.has(def.name)) continue;

    // wire 이름은 영숫자+언더스코어. mcp.js는 prefix 자체를 sanitize하므로 추가 변환 불필요.
    const wireName = def.name;

    // handler 매핑: prefix 기반 도구는 prefix 부분 제거 후 lookup (mcp.js executeTool과 동일 규칙)
    const handlerKey = def.name.startsWith(prefix + '_')
      ? def.name.slice(prefix.length + 1)
      : def.name;
    const handler = handlers[handlerKey];
    if (typeof handler !== 'function') {
      logger?.warn?.(`[agentic-tools] handler missing for tool="${def.name}" (key="${handlerKey}") — skipped`);
      continue;
    }

    tools.push({
      name: wireName,
      // LangChain/Anthropic-호환 도구 정의. ChatOpenAI는 OpenAI function-calling 형식으로 변환.
      definition: {
        name: wireName,
        description: def.description,
        input_schema: def.inputSchema,
      },
      execute: async (input) => {
        const ctx = getRuntimeContext() || {};
        const fakeReq = { app: { locals: ctx } };
        try {
          const result = await handler(config, logger, input || {}, fakeReq, prefix);
          // MCP handler는 일반적으로 `{content: [{type:'text', text:'...'}]}` 형식 또는 plain object 반환.
          // agentic executeTools는 string 또는 JSON.stringify(object)로 ToolMessage content를 만든다.
          if (result && Array.isArray(result.content)) {
            // text 블록만 추출하여 평문화 (모델 입력 토큰 절감)
            const text = result.content
              .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
              .map((b) => b.text)
              .join('\n');
            return text || JSON.stringify(result);
          }
          return result;
        } catch (err) {
          // 에러는 스택을 노출하지 않고 메시지만 반환 (사용자 노출 위험 차단).
          const msg = err instanceof Error ? err.message : String(err);
          logger?.warn?.(`[agentic-tools] tool "${wireName}" failed: ${msg}`);
          return { error: msg };
        }
      },
    });
  }

  return tools;
}

module.exports = { buildAgenticTools, EXCLUDED_TOOLS };
