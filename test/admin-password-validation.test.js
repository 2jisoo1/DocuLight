const test = require('node:test');
const assert = require('node:assert');
const { validatePasswordLength } = require('../src/utils/password-validator');

test('validatePasswordLength: trim 후 8자 정확 통과', () => {
  assert.strictEqual(validatePasswordLength('  12345678  '), true);
});

test('validatePasswordLength: trim 후 7자 거부', () => {
  assert.strictEqual(validatePasswordLength('  abcdefg  '), false);
});

test('validatePasswordLength: null/undefined 거부', () => {
  assert.strictEqual(validatePasswordLength(null), false);
  assert.strictEqual(validatePasswordLength(undefined), false);
});

test('validatePasswordLength: 공백만 100자 거부', () => {
  assert.strictEqual(validatePasswordLength(' '.repeat(100)), false);
});

test('validatePasswordLength: 9자 비공백 통과', () => {
  assert.strictEqual(validatePasswordLength('abcdefghi'), true);
});
