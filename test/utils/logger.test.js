'use strict';

const os = require('os');
const fs = require('fs');
const path = require('path');
const { createLogger, JSONL_CHANNELS } = require('../../src/utils/logger');

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

// 1. Verify exported JSONL_CHANNELS constant
assert(Array.isArray(JSONL_CHANNELS), 'JSONL_CHANNELS must be exported as array');
assert(JSONL_CHANNELS.length === 3, `expected 3 channels, got ${JSONL_CHANNELS.length}`);
assert(JSONL_CHANNELS.includes('app'), "missing channel 'app'");
assert(JSONL_CHANNELS.includes('metrics'), "missing channel 'metrics'");
assert(JSONL_CHANNELS.includes('audit'), "missing channel 'audit'");

// 2. Verify createLogger wires metrics and audit channels
const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doculight-logger-test-'));
const logger = createLogger({ logDir: testDir, logLevel: 'warn' });

assert(logger._channels === JSONL_CHANNELS, 'logger._channels must reference JSONL_CHANNELS');
assert(typeof logger.metrics === 'function', 'logger.metrics must be function');
assert(typeof logger.audit === 'function', 'logger.audit must be function');

console.log('3 channels OK');

// Force exit to release DailyRotateFile handles and setInterval
process.exit(0);
