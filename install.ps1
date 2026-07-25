# Installs Basalt as a desktop app: Start Menu + Desktop shortcuts with an icon.
# Nothing is copied or written outside this folder and your own shortcuts,
# so "uninstalling" is just deleting them (see uninstall.ps1).
#   .\install.ps1              install
#   .\install.ps1 -NoDesktop   Start Menu only
#
# ASCII only on purpose: PowerShell 5.1 reads .ps1 as ANSI, and a stray
# non-ASCII dash decodes into a smart quote that breaks string parsing.
param([switch]$NoDesktop)

$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$vbs = Join-Path $dir 'basalt.vbs'
$ico = Join-Path $dir 'basalt.ico'

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Warning "Node.js was not found on PATH. Basalt needs it: install from https://nodejs.org"
}
if (-not (Test-Path $ico)) { & (Join-Path $dir 'make-icons.ps1') | Out-Null }

$targets = @(Join-Path ([Environment]::GetFolderPath('StartMenu')) 'Programs\Basalt.lnk')
if (-not $NoDesktop) { $targets += Join-Path ([Environment]::GetFolderPath('Desktop')) 'Basalt.lnk' }

$sh = New-Object -ComObject WScript.Shell
foreach ($t in $targets) {
  $lnk = $sh.CreateShortcut($t)
  $lnk.TargetPath = Join-Path $env:SystemRoot 'System32\wscript.exe'
  $lnk.Arguments = '"' + $vbs + '"'
  $lnk.WorkingDirectory = $dir
  $lnk.IconLocation = "$ico,0"
  $lnk.Description = 'Basalt - local-first markdown vault'
  $lnk.Save()
  Write-Output "installed: $t"
}

Write-Output ""
Write-Output "Basalt is installed. Find it in the Start Menu (search for Basalt)."
Write-Output "Vault folder: C:\Study\Vault - change it by editing the node line in basalt.vbs"
