# Removes the Basalt shortcuts. Your vault and notes are never touched.
$targets = @(
  (Join-Path ([Environment]::GetFolderPath('StartMenu')) 'Programs\Basalt.lnk'),
  (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Basalt.lnk')
)
foreach ($t in $targets) {
  if (Test-Path $t) { Remove-Item $t -Force; Write-Output "removed: $t" }
}
Write-Output "Shortcuts removed. Your notes are still in the vault folder, untouched."
