# Creates a ready-to-login L2Swarm config for a new account.
#   powershell -ExecutionPolicy Bypass -File new_account.ps1 -Login mylogin14 [-Character Name]          (hidden prompt for the password)
#   $env:L2S_NEWACCOUNT_PW = '<pw>'; powershell ... new_account.ps1 -Login mylogin14 -PasswordEnv L2S_NEWACCOUNT_PW   (scripts/dashboard)
#   -Password '<pw>' still works but puts the password on the command line, which every process list shows: avoid it.
# The password is encrypted with L2Swarm's own Option.EncryptPassword (the same format as configs saved by the UI),
# so open_account logs in by itself. NOTE: manage_account_config modify Password does NOT work
# (it saves an empty password -> "loaded without login credentials").
# Portable (2026-10-07): paths are relative to the install folder (3 levels above this file). Without -Password the password is read
# from the environment variable named by -PasswordEnv, else asked for with a hidden prompt — it is never written anywhere in plain text.
param(
  [Parameter(Mandatory)] [string] $Login,
  [string] $Password = '',
  [string] $PasswordEnv = '',  # name of an environment variable that holds the password (SETUP.ps1)
  [string] $Character = '',
  [string] $Template = '',     # default: Settings\templates\default.xml, else Settings\Mylogin10.xml
  [string] $Scripts = '',      # script files in <install>\Scripts that start with the account (2026-10-07: mkchar_<login>.js + swarm.js)
  [string] $OutFile = '',      # default: Settings\<Login with a capital first letter>.xml
  # 2026-10-12 (dashboard "Add account", Dashboard/addaccount_api.js): optional, the same fields SETUP.ps1 writes for an account.
  # Empty = the old behaviour (no follow, group / login server from the template).
  [string] $Group = '',        # L2Swarm account-list group, e.g. "Party Tankname"
  [string] $FollowName = '',   # party leader to follow (a member); empty = no follow (a leader)
  [string] $FollowAtk = '',    # 'true' | 'false' (assist the leader's target; healers false); empty = false
  [string] $LoginIp = '',
  [string] $LoginPort = '',
  [string] $ServerId = ''
)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path "$PSScriptRoot\..\..\..").Path
if (-not $Template) { $Template = if (Test-Path "$root\Settings\templates\default.xml") { "$root\Settings\templates\default.xml" } else { "$root\Settings\Mylogin10.xml" } }
if (-not $Password -and $PasswordEnv) { $Password = [Environment]::GetEnvironmentVariable($PasswordEnv) }
if (-not $Password) {
  $sec = Read-Host -AsSecureString "Password for $Login"
  $Password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
}
if (-not $Password) { throw "no password for $Login" }
# 2026-10-07: the PowerShell script-block resolver crashed with StackOverflowException (PowerShell itself resolves assemblies while the
# handler runs -> the handler is called again, endlessly). A compiled resolver with a re-entry guard instead.
if (-not ('L2SwarmResolver' -as [type])) {
  Add-Type -TypeDefinition @'
using System; using System.IO; using System.Reflection;
public static class L2SwarmResolver {
  [ThreadStatic] static bool busy;
  public static void Hook(string dir) {
    AppDomain.CurrentDomain.AssemblyResolve += (s, e) => {
      if (busy) return null;
      busy = true;
      try { var p = Path.Combine(dir, new AssemblyName(e.Name).Name + ".dll"); return File.Exists(p) ? Assembly.LoadFrom(p) : null; }
      finally { busy = false; }
    };
  }
}
'@
}
[L2SwarmResolver]::Hook($root)
$asm = [Reflection.Assembly]::LoadFrom("$root\L2Swarm.exe")
$types = try { $asm.GetTypes() } catch [Reflection.ReflectionTypeLoadException] { $_.Exception.Types | Where-Object { $_ } }
$opt = $types | Where-Object { $_.FullName -eq 'L2Swarm.Services.Option' } | Select-Object -First 1
$bf = [Reflection.BindingFlags]'Public,NonPublic,Static'
$encrypted = $opt.GetMethod('EncryptPassword', $bf).Invoke($null, @($Password))

$fileName = $Login.Substring(0, 1).ToUpper() + $Login.Substring(1)
$dst = if ($OutFile) { $OutFile } else { "$root\Settings\$fileName.xml" }
if (Test-Path $dst) { throw "$dst already exists" }
$x = New-Object Xml.XmlDocument; $x.PreserveWhitespace = $true; $x.LoadXml([IO.File]::ReadAllText($Template))
$o = $x.DocumentElement
$o.SelectSingleNode('Name').InnerText = $Login.ToLower()
$o.SelectSingleNode('Password').InnerText = $encrypted
$o.SelectSingleNode('SelectedCharacter').InnerText = $Character
foreach ($k in 'ActiveFollow', 'FollowAtk') { $n = $o.SelectSingleNode($k); if ($n) { $n.InnerText = 'false' } }
$fn = $o.SelectSingleNode('FollowName'); if ($fn) { $fn.InnerText = '' }
if ($FollowName) {
  $n = $o.SelectSingleNode('ActiveFollow'); if ($n) { $n.InnerText = 'true' }
  if ($fn) { $fn.InnerText = $FollowName }
  $n = $o.SelectSingleNode('FollowAtk'); if ($n) { $n.InnerText = $(if ($FollowAtk -eq 'true') { 'true' } else { 'false' }) }
}
foreach ($kv in @(@('Group', $Group), @('LoginServerIP', $LoginIp), @('LoginServerPort', $LoginPort))) {
  if (-not $kv[1]) { continue }
  $n = $o.SelectSingleNode($kv[0])
  if (-not $n) { $n = $x.CreateElement($kv[0]); [void]$o.AppendChild($n) }
  $n.InnerText = $kv[1]
}
if ($ServerId) { $n = $o.SelectSingleNode('SelectedServer/id'); if ($n) { $n.InnerText = $ServerId } }
# L2EXE-2026-10-28 (tester Vykaax: "I have the path in swarm.config.json, but it doesn't seem to write it to new char profiles"): an empty
# <L2ExePath> takes swarm.config.json "l2Client" (only when that file exists), so "Open in game" works without editing the profile by hand
try {
  $cli = ''; try { $cli = [string](([IO.File]::ReadAllText("$root\swarm.config.json") | ConvertFrom-Json).l2Client) } catch { }
  if ($cli -and (Test-Path $cli)) {
    $n = $o.SelectSingleNode('L2ExePath')                                 # every template has the node; never append one (3.10 checks the element order)
    if ($n -and -not $n.InnerText.Trim()) { $n.InnerText = $cli }
  }
} catch { }
# L2Swarm 3.8.14 validates the file: an EMPTY LastLoadedUtc fails (same fix as SETUP.ps1, 2026-10-10)
$n = $o.SelectSingleNode('LastLoadedUtc'); if ($n -and -not $n.InnerText.Trim()) { $n.InnerText = '2000-01-01T00:00:00Z' }
$sl = $o.SelectSingleNode('ScriptsList'); if ($sl) { while ($sl.HasChildNodes) { [void]$sl.RemoveChild($sl.FirstChild) } }
# NEW ENGINE (2026-10-13, the default): -Scripts swarm.js becomes agent2.js for a character the brain drives (Scripts\data\brain_host.json,
# rule in engine_mode.ps1); never the other way round (the dashboard's "+ Add account" already decided for a character it adds to the roster)
$scriptList = @($Scripts -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
if ($Character -and ($scriptList -icontains 'swarm.js')) {
  . "$PSScriptRoot\engine_mode.ps1"
  $rosterNames = @(); try { $rc = [IO.File]::ReadAllText("$root\swarm.config.json") | ConvertFrom-Json; $rosterNames = @($rc.accounts | Where-Object { $_.login -and $_.character -and $_.enabled -ne $false } | ForEach-Object { [string]$_.character }) } catch { }
  if ((Test-BrainChar (Read-BrainHost $root) $Character $rosterNames) -eq $true) { $scriptList = Convert-EngineScripts $scriptList $true; "new engine: $Character runs Scripts\agent2.js instead of swarm.js (Scripts\data\brain_host.json)" }
}
foreach ($sc in $scriptList) {
  if (-not $sl) { break }
  $e = $x.CreateElement('Script')
  foreach ($kv in @(@('IsEnabled', 'true'), @('guid', [guid]::NewGuid().ToString()), @('Name', $sc), @('Path', "$root\Scripts\$sc"))) { $c = $x.CreateElement($kv[0]); $c.InnerText = $kv[1]; [void]$e.AppendChild($c) }
  [void]$sl.AppendChild($e)
}
$sw = New-Object IO.StreamWriter($dst, $false, (New-Object Text.UTF8Encoding $true)); $x.Save($sw); $sw.Close()
"created $dst (login $($Login.ToLower()), character '$Character')"
"Next: open_account config_path=$dst -> it logs in. Without a character: start a script with"
"  Send.NewCharacter(); Send.CharacterCreate(name, race, sex, classId, STR,DEX,CON,INT,WIT,MEN, 0,0,0)"
"  race: 0 Human, 1 Elf, 2 Dark Elf, 3 Orc, 4 Dwarf, 5 Kamael. classId: 0 H.Fighter, 10 H.Mystic, 18 E.Fighter, 25 E.Mystic,"
"  31 DE.Fighter, 38 DE.Mystic, 44 Orc Fighter, 49 Orc Mystic, 53 Dwarf Fighter, 123 Kamael M, 124 Kamael F"
