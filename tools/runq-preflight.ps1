<#
RUNQ local preflight for Windows / PowerShell 5.1+.
Offline by default: never reads or prints provider keys and never makes paid requests.
Run from any directory: powershell -ExecutionPolicy Bypass -File .\tools\runq-preflight.ps1 -RunTests -StartServer
#>
param(
 [switch]$RunTests,
 [switch]$StartServer,
 [int]$Port = 5173
)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $root
$failed = $false
function Check($label, $passed, $detail='') {
 if($passed) { Write-Host "[PASS] $label $detail" -ForegroundColor Green }
 else { Write-Host "[FAIL] $label $detail" -ForegroundColor Red; $script:failed=$true }
}
Write-Host "RUNQ Windows preflight (offline; no secrets, no provider calls)"
Write-Host "Project: $root"
try {
 # Git worktree add <path> origin/<branch> intentionally creates a detached HEAD.
 # In this state Git reports no branch name. Coerce to an empty string before Trim().
 $branch = [string](& git branch --show-current 2>$null)
 $branchOk = ($LASTEXITCODE -eq 0)
 $branch = $branch.Trim()
 $head = [string](& git rev-parse --short HEAD 2>$null)
 $headOk = ($LASTEXITCODE -eq 0)
 $head = $head.Trim()
 $label = if($branch.Length -gt 0) { $branch } else { '(detached HEAD)' }
 Check 'Git checkout' ($branchOk -and $headOk -and $head.Length -gt 0) "$label @ $head"
 if($branch.Length -eq 0) {
  Write-Host '[INFO] Detached HEAD is normal for a worktree created from origin/<branch>; tests and server may run.'
 } elseif($branch -ne 'integration/runq-demo-2026-10-30' -and
    $branch -ne 'feat/runq-v15-agent-qa-visual-freeze-2026-10-29' -and
    $branch -ne 'fix/runq-v14-agent-audit-2026-10-29') {
  Write-Warning 'Checkout differs from the RC1 candidate / baseline. Do NOT switch branches with uncommitted changes.'
 }
 $dirty = @(git status --porcelain 2>$null)
 if($dirty.Count -gt 0) { Write-Warning 'Uncommitted changes exist; this script will NOT reset or overwrite them.' }
} catch { Check 'Git checkout' $false $_.Exception.Message }
foreach($file in @('AGENTS.md','package.json','index.html','tools/dev-server.mjs',
 'src/ui/app.mjs','src/ui/runq-workstation-v14.mjs','src/ui/runq-agent-ui.mjs',
 'src/core/browserAudio.mjs','src/core/rehearsalAutopilot.mjs')) {
 Check "Required file: $file" (Test-Path -LiteralPath (Join-Path $root $file))
}
try {
 $nodeVersion = (& node --version 2>$null)
 $major = [int](($nodeVersion -replace '^v','').Split('.')[0])
 Check 'Node.js >=20' ($LASTEXITCODE -eq 0 -and $major -ge 20) "$nodeVersion"
} catch { Check 'Node.js >=20' $false 'Install Node 20+ and reopen PowerShell' }
try {
 $npmVersion = (& npm --version 2>$null)
 Check 'npm available' ($LASTEXITCODE -eq 0) "$npmVersion"
} catch { Check 'npm available' $false 'npm was not found' }
$archiveDependency = Join-Path $root 'node_modules\libarchive.js'
if(-not (Test-Path -LiteralPath $archiveDependency)) {
 Write-Warning 'Optional RAR/7z import engine missing. Run npm install before testing compressed audio imports.'
} else { Check 'Local RAR/7z import dependency' $true }
if($RunTests -and -not $failed) {
 Write-Host 'Running OFFLINE syntax and test suite. This does not call Meta, Baseten or Modal.'
 & npm run check:syntax
 Check 'Syntax validation' ($LASTEXITCODE -eq 0)
 & npm test
 Check 'Unit/integration tests' ($LASTEXITCODE -eq 0)
}
if($failed) {
 Write-Host 'Preflight failed. Review the first FAIL above. No project data was changed.' -ForegroundColor Red
 exit 1
}
if(-not $StartServer) {
 Write-Host 'Preflight OK. To start locally, rerun with -StartServer.'
 exit 0
}
if($Port -lt 1024 -or $Port -gt 65535) { throw 'Port must be 1024–65535.' }
function PortFree([int]$candidate) {
 $listener = $null
 try {
  $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback,$candidate)
  $listener.Start()
  return $true
 } catch { return $false }
 finally { if($null -ne $listener) { $listener.Stop() } }
}
$chosen = $Port
if(-not (PortFree $chosen)) {
 if(PortFree 5174) { $chosen=5174 }
 elseif(PortFree 5180) { $chosen=5180 }
 else { throw 'Ports 5173, 5174 and 5180 are occupied. Close other RUNQ servers or pick -Port.' }
 Write-Warning "Requested port is occupied. Using $chosen instead."
}
$env:PORT = [string]$chosen
Write-Host "Open http://127.0.0.1:${chosen}/ in Chrome or Edge. Press Ctrl+C to stop." -ForegroundColor Cyan
& npm run dev
exit $LASTEXITCODE
