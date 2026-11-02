<#
RUNQ read-only reference audit. Run only on a separate, freshly cloned mirror.
Example:
  git clone --mirror https://github.com/vicentektek/showcompiler-hackathon-2026.git C:\RUNQ-AUDIT\runq-mirror.git
  powershell -NoProfile -ExecutionPolicy Bypass -File .\audit-git-refs-readonly.ps1 -RepoPath C:\RUNQ-AUDIT\runq-mirror.git -OutDirectory C:\RUNQ-AUDIT\reports
This script reads Git metadata and writes CSV/JSON reports outside the repository.
No branch deletion, history rewrite, checkout, fetch, push or remote mutation.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$RepoPath,
  [Parameter(Mandatory=$true)][string]$OutDirectory,
  [string]$BaselineTag = 'verified-working-2026-11-02'
)
$ErrorActionPreference = 'Stop'
if (-not (Test-Path -LiteralPath $RepoPath)) { throw "Repository path not found" }
$base = (& git -C $RepoPath rev-parse "refs/tags/$BaselineTag^{commit}" 2>&1)
if ($LASTEXITCODE -ne 0) { throw "Cannot resolve baseline tag: $BaselineTag" }
$base = [string]($base | Select-Object -Last 1)
$rawRefs = @(& git -C $RepoPath for-each-ref --format='%(refname)' refs/heads/ refs/remotes/origin/)
if ($LASTEXITCODE -ne 0) { throw "Cannot inventory Git references" }
$rawRefs = @($rawRefs | Where-Object { $_ -and ($_ -notmatch '/HEAD$') } | Sort-Object -Unique)
if ($rawRefs.Count -eq 0) { throw "No branch refs: use a full mirror clone, not a single-branch checkout" }
$report = foreach ($ref in $rawRefs) {
  $aheadBehind = [string](& git -C $RepoPath rev-list --left-right --count "$base...$ref")
  if ($LASTEXITCODE -ne 0) { throw "Comparison failed: $ref" }
  $parts = @($aheadBehind.Trim() -split '\s+')
  if ($parts.Count -ne 2) { throw "Unexpected rev-list response: $ref" }
  $behind = [int]$parts[0]
  $ahead = [int]$parts[1]
  $state = if ($ahead -eq 0 -and $behind -eq 0) { 'identical' }
           elseif ($ahead -eq 0) { 'ancestor-of-verified' }
           elseif ($behind -eq 0) { 'descendant-of-verified' }
           else { 'diverged-unique-work' }
  $sha = [string](& git -C $RepoPath rev-parse "$ref^{commit}")
  $date = [string](& git -C $RepoPath log -1 --format='%cI' $ref)
  [pscustomobject]@{
    Reference = $ref
    CommitSHA = $sha.Trim()
    LastCommitDate = $date.Trim()
    UniqueCommitsOutsideVerified = $ahead
    MissingCommitsFromVerified = $behind
    Classification = $state
    DeleteApproved = 'NO'
  }
}
New-Item -ItemType Directory -Force -Path $OutDirectory | Out-Null
$csv = Join-Path $OutDirectory 'runq-reference-audit.csv'
$json = Join-Path $OutDirectory 'runq-reference-audit.json'
$report | Export-Csv -NoTypeInformation -Encoding UTF8 -Path $csv
$report | ConvertTo-Json -Depth 5 | Set-Content -Encoding UTF8 -Path $json
$report | Group-Object Classification | Select-Object Name, Count | Format-Table -AutoSize
Write-Host "Baseline commit: $base"
Write-Host "References inspected: $($report.Count)"
Write-Host "Reports: $csv and $json"
Write-Host 'NO branches were deleted or modified.'
