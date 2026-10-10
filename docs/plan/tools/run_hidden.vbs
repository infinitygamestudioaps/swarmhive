' Runs l2swarm_ctl.ps1 <action> without a console window. Used by the "L2Swarm ..." scheduled tasks.
' Usage: wscript.exe run_hidden.vbs start|stop|restart|watch
' portable (2026-10-07): l2swarm_ctl.ps1 is next to this file
here = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
a = "watch"
If WScript.Arguments.Count > 0 Then a = WScript.Arguments(0)
CreateObject("WScript.Shell").Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -File """ & here & "\l2swarm_ctl.ps1"" -Action " & a, 0, True
