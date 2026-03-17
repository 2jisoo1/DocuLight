'use strict';

/**
 * Activity Logger — 카테고리별 활동 로그 기록
 * 기존 logger 인스턴스를 래핑하여 일관된 포맷 제공
 *
 * 로그 포맷: [CATEGORY] EVENT key=value key=value ...
 */

let logger = null;

function init(loggerInstance) {
  logger = loggerInstance;
}

function formatDetails(details) {
  return Object.entries(details)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => {
      if (typeof v === 'object') return `${k}=${JSON.stringify(v)}`;
      return `${k}=${v}`;
    })
    .join(' ');
}

function log(category, event, details) {
  if (!logger) return;
  const msg = `[${category}] ${event} ${formatDetails(details)}`;
  logger.info(msg);
}

function logWarn(category, event, details) {
  if (!logger) return;
  const msg = `[${category}] ${event} ${formatDetails(details)}`;
  logger.warn(msg);
}

function logError(category, event, details) {
  if (!logger) return;
  const msg = `[${category}] ${event} ${formatDetails(details)}`;
  logger.error(msg);
}

// 마스킹 유틸: API 키 앞 8자만 표시
function maskKey(key) {
  if (!key || key.length <= 8) return key;
  return key.substring(0, 8) + '...';
}

// 요청에서 사용자 정보 추출
function extractUser(req) {
  if (req.session?.email) return req.session.email;
  if (req.adminSession?.email) return req.adminSession.email;
  if (req.adminSession?.name) return req.adminSession.name;
  if (req.authUser?.email) return req.authUser?.email;
  if (req.authUser?.name) return `apikey(${maskKey(req.authUser.name)})`;
  return 'anonymous';
}

function extractIp(req) {
  return req.ip || req.connection?.remoteAddress || 'unknown';
}

module.exports = {
  init,
  maskKey,
  extractUser,
  extractIp,
  auth:  (event, details) => log('AUTH', event, details),
  doc:   (event, details) => log('DOC', event, details),
  mcp:   (event, details) => log('MCP', event, details),
  admin: (event, details) => log('ADMIN', event, details),
  authWarn:  (event, details) => logWarn('AUTH', event, details),
  authError: (event, details) => logError('AUTH', event, details),
  mcpError:  (event, details) => logError('MCP', event, details),
};
