/**
 * IP 주소 매칭 유틸리티
 */

/**
 * IP 주소를 숫자로 변환
 */
function ipToNumber(ip) {
  const parts = ip.split('.').map(Number);
  return (parts[0] << 24) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

/**
 * CIDR 표기법 매칭
 * 예: 192.168.1.0/24
 */
function matchCIDR(ip, cidr) {
  const [network, bits] = cidr.split('/');
  const mask = -1 << (32 - parseInt(bits));

  const ipNum = ipToNumber(ip);
  const networkNum = ipToNumber(network);

  return (ipNum & mask) === (networkNum & mask);
}

/**
 * 와일드카드 패턴 매칭
 * 예: 10.0.1.* → 10.0.1.0-255
 * 예: 10.0.100-200.* → 10.0.100.0-255 ~ 10.0.200.0-255
 */
function matchWildcard(ip, pattern) {
  const ipParts = ip.split('.').map(Number);
  const patternParts = pattern.split('.');

  for (let i = 0; i < 4; i++) {
    const ipPart = ipParts[i];
    const patternPart = patternParts[i];

    // 와일드카드
    if (patternPart === '*') {
      continue;
    }

    // 범위 (예: 100-200)
    if (patternPart.includes('-')) {
      const [min, max] = patternPart.split('-').map(Number);
      if (ipPart < min || ipPart > max) {
        return false;
      }
      continue;
    }

    // 정확한 매칭
    if (ipPart !== Number(patternPart)) {
      return false;
    }
  }

  return true;
}

/**
 * IP 주소가 허용된 패턴에 매칭되는지 확인
 */
function isIpAllowed(ip, allowPatterns) {
  // allowPatterns가 없으면 모든 IP 허용
  if (!allowPatterns || allowPatterns.length === 0) {
    return true;
  }

  // IPv6를 IPv4로 변환 (::ffff:192.168.1.1 → 192.168.1.1)
  const ipv4 = ip.replace(/^::ffff:/, '');

  // IPv6 주소는 별도 처리 필요 (향후 확장)
  if (ipv4.includes(':')) {
    // 현재는 IPv6 로컬호스트만 허용
    return ipv4 === '::1' && allowPatterns.includes('::1');
  }

  // 각 패턴과 매칭 시도
  for (const pattern of allowPatterns) {
    // 정확한 매칭
    if (pattern === ipv4) {
      return true;
    }

    // CIDR 표기법
    if (pattern.includes('/')) {
      if (matchCIDR(ipv4, pattern)) {
        return true;
      }
    }

    // 와일드카드 패턴
    if (pattern.includes('*') || pattern.match(/\d+-\d+/)) {
      if (matchWildcard(ipv4, pattern)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * IP 패턴 유효성 검증
 */
function validateIpPattern(pattern) {
  // IPv4 정확한 주소
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(pattern)) {
    return true;
  }

  // CIDR 표기법
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\/\d{1,2}$/.test(pattern)) {
    return true;
  }

  // 와일드카드 패턴
  if (/^[\d\-*]+\.[\d\-*]+\.[\d\-*]+\.[\d\-*]+$/.test(pattern)) {
    return true;
  }

  // IPv6 (단순 체크)
  if (pattern.includes(':')) {
    return true;
  }

  return false;
}

module.exports = { isIpAllowed, validateIpPattern };
