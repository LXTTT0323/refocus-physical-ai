param(
  [string]$OutputDirectory = "dist/skills",
  [string]$VersionLabel = "v2"
)

$ErrorActionPreference = "Stop"

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$skillRoot = Join-Path $repositoryRoot "product-skills"
$outputRoot = Join-Path $repositoryRoot $OutputDirectory
$skillNames = @("task-setup", "context-relevance", "session-summary")

New-Item -ItemType Directory -Force -Path $outputRoot | Out-Null

foreach ($skillName in $skillNames) {
  $source = Join-Path $skillRoot $skillName
  $entrypoint = Join-Path $source "SKILL.md"
  if (-not (Test-Path -LiteralPath $entrypoint)) {
    throw "Missing Skill entrypoint: $entrypoint"
  }

  $archive = Join-Path $outputRoot "$skillName-$VersionLabel.zip"
  if (Test-Path -LiteralPath $archive) {
    Remove-Item -LiteralPath $archive -Force
  }

  # Agent Stack expects SKILL.md at the ZIP root, with referenced files beside it.
  Compress-Archive -Path (Join-Path $source "*") -DestinationPath $archive -CompressionLevel Optimal
}

$skillNames | ForEach-Object {
  $archive = Join-Path $outputRoot "$_-$VersionLabel.zip"
  [pscustomobject]@{
    Skill = $_
    Archive = $archive
    Bytes = (Get-Item -LiteralPath $archive).Length
  }
}
