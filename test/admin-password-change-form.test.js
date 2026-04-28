const test = require('node:test');
const assert = require('node:assert');
const { validatePasswordChangeForm } = require('../src/utils/password-change-form');

test('validatePasswordChangeForm: 정상 입력 → ok', () => {
  const r = validatePasswordChangeForm({ current: 'oldpass1', next: 'newpass12', confirm: 'newpass12' });
  assert.deepStrictEqual(r, { ok: true });
});

test('validatePasswordChangeForm: current 빈값 → 모든 필드 에러', () => {
  const r = validatePasswordChangeForm({ current: '', next: 'newpass12', confirm: 'newpass12' });
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /모든 필드/);
});

test('validatePasswordChangeForm: next 8자 미만 (trim 후) → 최소 8자 에러', () => {
  const r = validatePasswordChangeForm({ current: 'oldpass1', next: '  abc  ', confirm: '  abc  ' });
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /최소 8자/);
});

test('validatePasswordChangeForm: next ≠ confirm → 일치하지 않음 에러', () => {
  const r = validatePasswordChangeForm({ current: 'oldpass1', next: 'newpass12', confirm: 'different' });
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /일치하지 않/);
});

test('validatePasswordChangeForm: next 공백 padding → trim 후 검증 통과', () => {
  const r = validatePasswordChangeForm({ current: 'oldpass1', next: '  newpass12  ', confirm: '  newpass12  ' });
  assert.deepStrictEqual(r, { ok: true });
});
