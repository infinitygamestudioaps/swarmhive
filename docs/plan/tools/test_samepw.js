// test_samepw.js - requirement engine.md R3 (owner 2026-10-31: "ADD Them and create the characters I don't want to do this manually", the 20
// academy accounts mylogin82-20): Accounts -> Several at once has ONE password field; a line without ';' is a login or a range ("mylogin82-20") and gets
// that password in the browser (Dashboard/addaccount.js bulkExpand). The password is never stored by the page: the field is emptied after Add.
const fs = require('fs'), path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'Dashboard', 'addaccount.js'), 'utf8');
let ok = 0, bad = 0; const check = (c, m) => { if (c) { ok++; console.log('ok   ' + m); } else { bad++; console.log('FAIL ' + m); } };
const i = SRC.indexOf('function bulkExpand(text, pw) {'), j = SRC.indexOf('\n  }\n', i);
check(i > 0 && j > i, 'bulkExpand exists');
const bulkExpand = new Function(SRC.slice(i, j + 4) + '\nreturn bulkExpand;')();
const PW = 'x;Y!!1';
const r = bulkExpand('mylogin82-20', PW).split('\n');
check(r.length === 20 && r[0] === 'mylogin82;' + PW && r[19] === 'mylogin101;' + PW, 'mylogin82-20 -> 20 lines mylogin82;pw ... mylogin101;pw');
check(bulkExpand('mylogin82-mylogin84', PW).split('\n').join('|') === `mylogin82;${PW}|mylogin83;${PW}|mylogin84;${PW}`, 'mylogin82-mylogin84 works too');
check(bulkExpand('a1 b2,c3', PW).split('\n').length === 3, 'several logins on one line (space / comma)');
check(bulkExpand('mylogin5;own;Doombringer1', PW) === 'mylogin5;own;Doombringer1', 'a full line keeps its own password');
check(bulkExpand('# note\nigs1', PW) === `# note\nigs1;${PW}`, '# lines stay');
check(bulkExpand('mylogin82-20', '') === 'mylogin82-20', 'no shared password = text unchanged (the server then says the line needs a password)');
check(bulkExpand('mylogin82-500', PW).split('\n').length === 1, 'a range above 200 is not expanded');
check(/id="aaBPw"[^>]*type="password"|type="password" id="aaBPw"/.test(SRC), 'the field is a password field');
check(/if \(id\('aaBPw'\)\) id\('aaBPw'\)\.value = ''/.test(SRC), 'the field is emptied after Add');
check(!/localStorage[^\n]*aaBPw|aaBPw[^\n]*localStorage/.test(SRC), 'the password is never kept in browser storage');
console.log(`samepw: ${ok} ok, ${bad} failed`);
process.exit(bad ? 1 : 0);
