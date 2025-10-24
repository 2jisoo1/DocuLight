const fs = require('fs');

/**
 * SSL 인증서 및 키 검증
 */
function validateSSL(sslConfig) {
  const errors = [];

  // 1. 파일 존재 확인
  if (!fs.existsSync(sslConfig.cert)) {
    errors.push(`SSL certificate not found: ${sslConfig.cert}`);
  }

  if (!fs.existsSync(sslConfig.key)) {
    errors.push(`SSL private key not found: ${sslConfig.key}`);
  }

  if (sslConfig.ca && !fs.existsSync(sslConfig.ca)) {
    errors.push(`SSL CA certificate not found: ${sslConfig.ca}`);
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // 2. 파일 읽기 가능 확인
  try {
    fs.readFileSync(sslConfig.cert, 'utf8');
    fs.readFileSync(sslConfig.key, 'utf8');
    if (sslConfig.ca) {
      fs.readFileSync(sslConfig.ca, 'utf8');
    }
  } catch (error) {
    errors.push(`Failed to read SSL files: ${error.message}`);
    return { valid: false, errors };
  }

  // 3. 인증서 형식 검증
  try {
    const certContent = fs.readFileSync(sslConfig.cert, 'utf8');
    const keyContent = fs.readFileSync(sslConfig.key, 'utf8');

    // PEM 형식 확인
    if (!certContent.includes('BEGIN CERTIFICATE')) {
      errors.push('SSL certificate is not in PEM format');
    }

    if (!keyContent.includes('BEGIN PRIVATE KEY') &&
        !keyContent.includes('BEGIN RSA PRIVATE KEY')) {
      errors.push('SSL private key is not in PEM format');
    }

    if (errors.length > 0) {
      return { valid: false, errors };
    }

  } catch (error) {
    errors.push(`SSL validation failed: ${error.message}`);
    return { valid: false, errors };
  }

  return { valid: true, errors: [] };
}

/**
 * SSL 설정 로드
 */
function loadSSLOptions(sslConfig) {
  const options = {
    cert: fs.readFileSync(sslConfig.cert),
    key: fs.readFileSync(sslConfig.key)
  };

  if (sslConfig.ca) {
    options.ca = fs.readFileSync(sslConfig.ca);
  }

  return options;
}

module.exports = { validateSSL, loadSSLOptions };
