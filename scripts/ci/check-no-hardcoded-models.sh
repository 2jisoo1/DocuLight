#!/usr/bin/env bash
set -euo pipefail

# NFR-5 AC-NFR-5-3: src/ 내 claude-3- 하드코딩 모델 ID 탐지
# 실행 위치: 리포지토리 루트 (CWD = repo root 전제)
# test/ 는 src/ 와 별도 디렉토리이므로 자동 제외됨

if [[ ! -d "src" ]]; then
  echo "ERROR: src/ directory not found. Run from repository root." >&2
  exit 1
fi

FOUND=$(grep -rn 'claude-3-' src/ 2>/dev/null || true)

if [ -z "$FOUND" ]; then
  echo "NONE"
  exit 0
else
  echo "HARDCODED MODEL IDS FOUND:"
  echo "$FOUND"
  exit 1
fi
