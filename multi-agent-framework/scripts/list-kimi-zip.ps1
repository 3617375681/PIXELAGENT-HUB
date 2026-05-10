$ErrorActionPreference = 'Stop'
$zips = @(Get-ChildItem -LiteralPath 'D:\Downloads' -Filter 'Kimi_Agent*.zip' -File)
if ($zips.Count -eq 0) {
  Write-Host 'ZIP_NOT_FOUND'
  exit 1
}
Write-Host '--- candidates ---'
$zips | Sort-Object Length -Descending | ForEach-Object { Write-Host ($_.Length.ToString() + ' ' + $_.FullName) }
$ordered = @($zips | Sort-Object Length -Descending)
$target = $ordered[0]
Write-Host ('Using bytes=' + $target.Length + ' path=' + $target.FullName)
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [IO.Compression.ZipFile]::OpenRead($target.FullName)
try {
  $zip.Entries | Select-Object -First 200 -ExpandProperty FullName
} finally {
  $zip.Dispose()
}
