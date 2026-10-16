' Runs any PowerShell script next to this file without a console window (generic twin of run_hidden.vbs, 2026-10-16).
' Usage: wscript.exe run_hidden_ps.vbs <script.ps1> [args...]      e.g. run_hidden_ps.vbs dashboard_keepalive.ps1
here = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
If WScript.Arguments.Count < 1 Then WScript.Quit 2
cmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File """ & here & "\" & WScript.Arguments(0) & """"
For i = 1 To WScript.Arguments.Count - 1
  cmd = cmd & " " & WScript.Arguments(i)
Next
CreateObject("WScript.Shell").Run cmd, 0, True
