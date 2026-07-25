' Basalt launcher — starts the local server with no console window, then opens
' the app in its own frameless window. Safe to run when Basalt is already open:
' the second server exits immediately (EADDRINUSE) and the window still appears.
Option Explicit
Dim sh, fso, appDir, candidates, browser, p, url
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
appDir = fso.GetParentFolderName(WScript.ScriptFullName)
url = "http://localhost:8088"

' 0 = hidden window, False = don't wait
sh.CurrentDirectory = appDir
sh.Run "cmd /c node """ & appDir & "\server.js""", 0, False

candidates = Array( _
  sh.ExpandEnvironmentStrings("%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"), _
  sh.ExpandEnvironmentStrings("%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"), _
  sh.ExpandEnvironmentStrings("%ProgramFiles%\Google\Chrome\Application\chrome.exe"), _
  sh.ExpandEnvironmentStrings("%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"), _
  sh.ExpandEnvironmentStrings("%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"))

browser = ""
For Each p In candidates
  If browser = "" Then
    If fso.FileExists(p) Then browser = p
  End If
Next

' give the server a moment to bind the port
WScript.Sleep 900

If browser = "" Then
  sh.Run url, 1, False
Else
  sh.Run """" & browser & """ --app=" & url & " --window-size=1280,860", 1, False
End If
