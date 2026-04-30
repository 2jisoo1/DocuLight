# NFR-5 AC-NFR-5-3: src\ 내 claude-3- 하드코딩 모델 ID 탐지
# 실행 위치: 리포지토리 루트 (CWD = repo root 전제)
# PowerShell 5.1 / 7(pwsh) 모두 호환

if (-not (Test-Path -Path 'src' -PathType Container)) {
    Write-Error "ERROR: src directory not found. Run from repository root."
    exit 1
}

$files = Get-ChildItem -Path 'src' -Recurse -File -ErrorAction Stop
$found = $files | Select-String -Pattern 'claude-3-' -ErrorAction SilentlyContinue

if (-not $found) {
    Write-Output "NONE"
    exit 0
} else {
    Write-Output "HARDCODED MODEL IDS FOUND:"
    $found | ForEach-Object { Write-Output $_.ToString() }
    exit 1
}
