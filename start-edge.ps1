$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Port = if ($env:PORT) { [int]$env:PORT } else { 5173 }
$Url = "http://127.0.0.1:$Port/"
$Node = "C:\Users\DY\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

if (-not (Test-Path -LiteralPath $Node)) {
  $NodeCommand = Get-Command node -ErrorAction SilentlyContinue
  if (-not $NodeCommand) {
    Write-Host "未找到 Node.js。请先安装 Node.js，或在 Codex 中使用内置运行时。"
    Read-Host "按回车退出"
    exit 1
  }
  $Node = $NodeCommand.Source
}

function Test-PortOpen {
  param([int]$PortNumber)
  try {
    $client = [System.Net.Sockets.TcpClient]::new()
    $async = $client.BeginConnect("127.0.0.1", $PortNumber, $null, $null)
    $ok = $async.AsyncWaitHandle.WaitOne(500)
    if ($ok) {
      $client.EndConnect($async)
      $client.Close()
      return $true
    }
    $client.Close()
    return $false
  } catch {
    return $false
  }
}

if (-not (Test-PortOpen -PortNumber $Port)) {
  Start-Process -FilePath $Node -ArgumentList @("scripts\serve.mjs") -WorkingDirectory $Root -WindowStyle Minimized
  Start-Sleep -Seconds 2
}

if (-not (Test-PortOpen -PortNumber $Port)) {
  Write-Host "网站服务启动失败，请检查端口 $Port 是否被占用。"
  Read-Host "按回车退出"
  exit 1
}

$EdgePaths = @(
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:LocalAppData\Microsoft\Edge\Application\msedge.exe"
)

$Edge = $EdgePaths | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if ($Edge) {
  Start-Process -FilePath $Edge -ArgumentList $Url
} else {
  Start-Process $Url
}

Write-Host "ALS 网站已启动：$Url"
