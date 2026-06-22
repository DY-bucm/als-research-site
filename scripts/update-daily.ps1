param(
  [int]$DaysBack = 30,
  [int]$Limit = 12
)

$ErrorActionPreference = "Stop"
$node = "C:\Users\DY\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

if (-not (Test-Path -LiteralPath $node)) {
  $node = "node"
}

& $node ".\scripts\update-feed.mjs" --days $DaysBack --limit $Limit --output "data/items.json"
