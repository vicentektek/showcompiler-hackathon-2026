# RUNQ AI Battery v1. Execute from the extracted repository root.
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js >=20 is required.' }
if (-not (Test-Path 'src/qa/assistantV3Evaluation.mjs')) {
  throw 'This package must be extracted into the RUNQ Assistant Expert V3 checkout (PR #131), not the older main or October branch.'
}
if (-not (Test-Path 'src/core/agentExpertContext.mjs')) { throw 'The expert assistant files are missing. Use the PR #131 branch.' }
if (-not (Test-Path 'fixtures/qa/runq-ai-independent-v1.json')) { throw 'The independent test corpus is missing. Extract the complete ZIP.' }
if ([string]::IsNullOrWhiteSpace($env:MODEL_API_KEY)) {
  throw 'MODEL_API_KEY is not available in this PowerShell session. Configure the Meta key in the process environment and restart the terminal.'
}
Write-Host 'RUNQ AI Battery: validating offline fixtures and payloads...'
node tools/runq-ai-battery.mjs --dry-run --count 320
if ($LASTEXITCODE -ne 0) { throw 'Offline preflight failed. No paid requests were sent.' }
Write-Host 'RUNQ AI Battery: starting the explicitly authorized Meta-only campaign without local budget caps...'
node tools/runq-ai-battery.mjs --live --count 320
if ($LASTEXITCODE -ne 0) { throw 'Campaign stopped safely. Review the status and generated local report before changing anything.' }
