'use strict';

const rateLimit = require('express-rate-limit');

/**
 * Factory for chatbot SSE rate limiter (TASK-P3-007, FR-19/NFR-8).
 * Applies separate limits for anonymous vs authenticated users.
 */
function createChatbotRateLimiter({ anonMax = 10, authedMax = 60, windowMs = 60 * 1000 } = {}) {
  const anonLimiter = rateLimit({
    windowMs,
    max: anonMax,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: { code: 'TOO_MANY_REQUESTS', message: 'Rate limit exceeded. Please slow down.' } }
  });

  const authedLimiter = rateLimit({
    windowMs,
    max: authedMax,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => `authed:${req.apiUser.userId || req.socket.remoteAddress}`,
    message: { error: { code: 'TOO_MANY_REQUESTS', message: 'Rate limit exceeded. Please slow down.' } }
  });

  return (req, res, next) => {
    if (req.apiUser) {
      return authedLimiter(req, res, next);
    }
    return anonLimiter(req, res, next);
  };
}

const chatbotRateLimiter = createChatbotRateLimiter();

module.exports = { chatbotRateLimiter, createChatbotRateLimiter };
