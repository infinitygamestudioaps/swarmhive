// OFFLINE TEST of DLRETRY-2026-10-27 (tester log, Windows curl: "curl: (56) schannel: failed to read data from server: SEC_E_DECRYPT_FAILURE"
// twice, then "Resuming transfer from byte position ..."): release/src/update.ps1 downloads the release zip in a bounded loop (6 tries, back-off),
// resumes the partial file, and checks the finished zip against the release asset's size + SHA-256 digest. TLS is never weakened.
//   node docs/plan/tools/test_update_download.js   (exit code 1 when a check fails)
// Part B runs the real download block of update.ps1 (Windows PowerShell 5.1 + curl.exe) against a local HTTP server that breaks the
// connection in the middle of the first two transfers; it is skipped when powershell.exe / curl.exe are not there.
const fs = require('fs'), path = require('path'), os = require('os'), http = require('http'), crypto = require('crypto'), cp = require('child_process');
const ROOT = path.join(__dirname, '..', '..', '..');
// in the source tree it is release/src/update.ps1, in the published package it sits at the root (like test_engine_default.js G)
const PS1 = [path.join(ROOT, 'release', 'src', 'update.ps1'), path.join(ROOT, 'update.ps1')].find(p => fs.existsSync(p)) || path.join(ROOT, 'release', 'src', 'update.ps1');
const src = fs.readFileSync(PS1, 'utf8');
let fails = 0; const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) fails++; };
const a = src.indexOf('# DLRETRY-2026-10-27'), b = src.indexOf('Say ("  download complete and checked', a);
const B = a >= 0 && b > a ? src.slice(a, src.indexOf('\n', b) + 1) : '';
// A) static
check(!!B, 'A1 the DLRETRY download block is there');
check(/for \(\$try = 1; \$try -le 6 -and -not \$ok; \$try\+\+\)/.test(B) && /\$waits = @\(2, 4, 8, 16, 30\)/.test(B) && /Start-Sleep -Seconds \$w/.test(B), 'A2 bounded loop: 6 tries, back-off 2/4/8/16/30 s');
check(/'-C', '-'/.test(B) && /'--speed-limit', '1024', '--speed-time', '60'/.test(B), 'A3 every try resumes the partial file; a stalled transfer is broken off and resumed');
check(/if \(\$cver -ge \[version\]'7\.71'\) \{ \$cargs = @\('--retry-all-errors'\) \+ \$cargs \}/.test(B), 'A4 --retry-all-errors only where curl knows it (7.71+; old Windows 10 curl 7.55 would refuse the option)');
check(/\$asset\.digest/.test(B) && /Get-FileHash -LiteralPath \$Zip -Algorithm SHA256/.test(B) && /\$wantSize -gt 0 -and \$len -lt \$wantSize/.test(B), 'A5 the zip is checked against the release asset size + SHA-256 digest');
const code = src.split(/\r?\n/).map(l => l.replace(/(^|\s)#.*$/, '')).join('\n');   // code only (comments may name the options)
check(!/--insecure|\s-k\s|'-k'|TrustAllCerts|ServerCertificateValidationCallback/.test(code), 'A6 TLS is never weakened (no -k / --insecure / certificate callback)');
check(/--ssl-no-revoke/.test(B) && /REVOCATION\|0x80092012\|0x80092013/.test(B), 'A7 --ssl-no-revoke only after a revocation-server error');
check(/\$ErrorActionPreference = 'Continue'/.test(B), 'A8 captured curl stderr runs with Continue (PowerShell 5.1 + Stop would throw on it)');
let ps = ''; try { ps = cp.execFileSync('where', ['powershell.exe'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split(/\r?\n/)[0].trim(); } catch (e) { ps = ''; }
if (ps) {
  const out = cp.spawnSync(ps, ['-NoProfile', '-Command', `$e=$null;$t=$null;[void][System.Management.Automation.Language.Parser]::ParseFile('${PS1.replace(/'/g, "''")}',[ref]$t,[ref]$e);if($e.Count){$e|%{$_.ToString()};exit 1}`], { encoding: 'utf8' });
  check(out.status === 0, 'A9 update.ps1 parses in Windows PowerShell 5.1' + (out.status ? ': ' + out.stdout : ''));
} else console.log('skip A9 (no powershell.exe)');
// B) the real block against a server that breaks the first two transfers
let curlOk = false; try { cp.execFileSync('curl.exe', ['--version'], { stdio: 'ignore' }); curlOk = true; } catch (e) { }
if (!ps || !curlOk || !B) { console.log('skip B (needs powershell.exe + curl.exe)'); finish(); }
else {
  const body = crypto.randomBytes(3 * 1024 * 1024), sha = crypto.createHash('sha256').update(body).digest('hex');
  let n = 0; const ranges = [];
  const srv = http.createServer((req, res) => {
    n++; const m = /bytes=(\d+)-/.exec(req.headers.range || ''); const from = m ? Number(m[1]) : 0; ranges.push(from);
    if (from >= body.length) { res.writeHead(416, { 'Content-Range': `bytes */${body.length}` }); return res.end(); }
    res.writeHead(m ? 206 : 200, Object.assign({ 'Content-Length': body.length - from, 'Accept-Ranges': 'bytes' }, m ? { 'Content-Range': `bytes ${from}-${body.length - 1}/${body.length}` } : {}));
    if (n <= 2) { res.write(body.subarray(from, from + 700 * 1024)); setTimeout(() => req.socket.destroy(), 50); }   // breaks off mid-transfer (like the schannel read error)
    else res.end(body.subarray(from));
  });
  srv.listen(0, '127.0.0.1', () => {
    const port = srv.address().port, dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dlretry_')), zip = path.join(dir, 'pkg.zip'), script = path.join(dir, 'dl.ps1');
    const run = (digest, cb) => {
      try { fs.unlinkSync(zip); } catch (e) { }
      n = 0; ranges.length = 0;
      fs.writeFileSync(script, `$ErrorActionPreference = 'Stop'\nfunction Say($m, $c = 'Gray') { Write-Host $m }\n$Repo = 'test/test'; $ref = 'v0'; $tok = $null; $hdr = @{}\n$Zip = '${zip.replace(/'/g, "''")}'\n$url = 'http://127.0.0.1:${port}/pkg.zip'\n`
        + `$asset = [pscustomobject]@{ name = 'SwarmKit-v0.zip'; size = ${body.length}; digest = '${digest}'; browser_download_url = $url }\n` + B + '\nexit 0\n');
      const p = cp.spawn(ps, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script], { stdio: ['ignore', 'pipe', 'pipe'] });
      try { require('os').setPriority(p.pid, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch (e) { }
      let o = ''; p.stdout.on('data', d => { o += d; }); p.stderr.on('data', d => { o += d; });
      const kill = setTimeout(() => { try { p.kill(); } catch (e) { } }, 120000);
      p.on('close', (code) => { clearTimeout(kill); cb(code, o); });
    };
    run('sha256:' + sha, (code, o) => {
      const got = fs.existsSync(zip) ? fs.readFileSync(zip) : Buffer.alloc(0);
      check(code === 0 && got.length === body.length && crypto.createHash('sha256').update(got).digest('hex') === sha, `B1 two broken transfers -> resumed to the whole file, SHA-256 checked (exit ${code}, ${got.length} bytes, ${n} requests)`);
      check(ranges.length >= 3 && ranges[0] === 0 && ranges.slice(1).some(r => r > 0), `B2 the retries RESUME from the partial file (requests from bytes ${ranges.join(', ')})`);
      check(/download complete and checked: \d+ MB, SHA-256 matches the release/.test(o), 'B3 says the download was checked');
      run('sha256:' + '0'.repeat(64), (code2, o2) => {
        check(code2 === 1 && !fs.existsSync(zip) && /sha256 differs from the release digest/.test(o2), `B4 a file that does not match the release digest is deleted and the update stops (exit ${code2})`);
        srv.close(); try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { }
        finish();
      });
    });
  });
}
function finish() { console.log(fails ? `\n${fails} FAILED` : '\nALL OK'); process.exit(fails ? 1 : 0); }
