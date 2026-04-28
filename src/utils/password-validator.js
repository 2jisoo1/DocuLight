const MIN_PASSWORD_LENGTH = 8;

function validatePasswordLength(pw, minLength = MIN_PASSWORD_LENGTH) {
  if (typeof pw !== 'string') return false;
  return pw.trim().length >= minLength;
}

module.exports = { validatePasswordLength, MIN_PASSWORD_LENGTH };
