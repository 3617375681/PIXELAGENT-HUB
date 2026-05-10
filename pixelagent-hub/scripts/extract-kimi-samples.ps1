$ErrorActionPreference = 'Stop'
$zips = @(Get-ChildItem -LiteralPath 'D:\Downloads' -Filter 'Kimi_Agent*.zip' -File | Sort-Object Length -Descending)
$zipPath = $zips[0].FullName
$dest = 'D:\PycharmProjects\PIXELAGENT-HUB\pixelagent-hub\_ref_kimi_extracted'
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [IO.Compression.ZipFile]::OpenRead($zipPath)
$names = @(
  'app/src/components/AgentFlow.tsx',
  'app/src/components/effects/DataPacket.tsx',
  'app/src/components/effects/ParticleEffect.tsx',
  'app/src/hooks/useWorkflow.ts',
  'app/src/pages/Home.tsx',
  'app/src/types/agent.ts'
)
try {
  foreach ($n in $names) {
    $e = $zip.GetEntry($n)
    if (-not $e) { Write-Host "MISSING $n"; continue }
    $outPath = Join-Path $dest ($n -replace '/', [char]92)
    $dir = Split-Path $outPath -Parent
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    $stream = $e.Open()
    try {
      $fs = [IO.File]::Create($outPath)
      try { $stream.CopyTo($fs) } finally { $fs.Dispose() }
    } finally { $stream.Dispose() }
    Write-Host "OK $n"
  }
} finally {
  $zip.Dispose()
}
Write-Host "Done -> $dest"
