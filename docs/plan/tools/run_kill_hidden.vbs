' Runs kill_process.ps1 without a console window. Used by the "L2Swarm KillProcess" scheduled task (elevated).
' The process to close is named in Logs\kill_request.json; see kill_process.ps1 for the allow list.
here = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
CreateObject("WScript.Shell").Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -File """ & here & "\kill_process.ps1""", 0, True
