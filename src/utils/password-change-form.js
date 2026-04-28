const { validatePasswordLength, MIN_PASSWORD_LENGTH } = require('./password-validator');

function validatePasswordChangeForm({ current, next, confirm }) {
  if (!current || !next || !confirm) {
    return { ok: false, error: '모든 필드를 입력해주세요.' };
  }
  if (!validatePasswordLength(next)) {
    return { ok: false, error: `새 비밀번호는 최소 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다.` };
  }
  if (next.trim() !== confirm.trim()) {
    return { ok: false, error: '새 비밀번호가 일치하지 않습니다.' };
  }
  return { ok: true };
}

module.exports = { validatePasswordChangeForm };
