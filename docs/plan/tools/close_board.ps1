# Close the Community Board window in a hooked (in-game) l2.exe by sending Esc to its main window.
# Called by swarm.js (closeClientBoard) after it used the board (buffs, class change, cabinet) for a character in in-game mode.
# Usage: close_board.ps1 -ProcId <l2.exe pid>   (runs from L2Swarm, so it has the same rights as l2.exe)
param([int]$ProcId)
$p = Get-Process -Id $ProcId -ErrorAction SilentlyContinue
if (-not $p -or $p.MainWindowHandle -eq 0) { exit 0 }
# hook-mode audit 2026-10-07: the pid comes from Logs\client_mode_state.json and may be stale (client gone, pid reused by another
# program) - never post Esc to anything but a game client
if ($p.ProcessName -notmatch '^l2$') { exit 0 }
Add-Type -Namespace W -Name U -MemberDefinition @'
[DllImport("user32.dll")] public static extern bool PostMessage(System.IntPtr hWnd, uint msg, System.IntPtr wParam, System.IntPtr lParam);
'@
$h = $p.MainWindowHandle
$VK_ESCAPE = [IntPtr]0x1B
[void][W.U]::PostMessage($h, 0x0100, $VK_ESCAPE, [IntPtr]0x00010001)          # WM_KEYDOWN
Start-Sleep -Milliseconds 60
[void][W.U]::PostMessage($h, 0x0101, $VK_ESCAPE, [IntPtr]([int64]0xC0010001))  # WM_KEYUP
Add-Content -Path "$PSScriptRoot\..\..\..\Logs\client_mode.log" -Value "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') close_board: sent Esc to l2.exe pid $ProcId"
