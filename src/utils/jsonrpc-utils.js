/**
 * JSON-RPC 2.0 유틸리티 함수
 * /mcp와 /context에서 공통 사용
 */

/**
 * JSON-RPC 2.0 응답 생성
 */
function createJsonRpcResponse(id, result) {
  return {
    jsonrpc: '2.0',
    id,
    result
  };
}

/**
 * JSON-RPC 2.0 에러 응답 생성
 */
function createJsonRpcError(id, code, message, data = null) {
  const error = {
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message
    }
  };

  if (data) {
    error.error.data = data;
  }

  return error;
}

module.exports = { createJsonRpcResponse, createJsonRpcError };
