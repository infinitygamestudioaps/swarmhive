// UIDIALOG (2026-10-10) test hook for the headless UI tests: the dashboard no longer uses browser confirm() / alert() / prompt()
// (CDP Page.javascriptDialogOpening never fires), it uses the shared dialog of Dashboard/uidialog.js. This sets
// window.UIDIALOG_TEST on every page load, so each dialog answers itself at once (answer true = the primary button, false = Cancel,
// prompt = the text typed into a uiPrompt / the typed YES), and reports every dialog it showed as a console.debug('UIDIALOG {...}').
//   const UID = await require('./uidialog_testhook')(cdp, handlers, { answer: true, prompt: 'YES', onDialog: (d) => dialogs.push(d) });
//   await UID.set(ev, false);   // change the answer from now on (also for later navigations)
// opt.uiMode: 'advanced' (default) | 'simple' | null (leave the view alone) — set before every page load (2026-10-13)
// d = { type: 'confirm'|'alert'|'prompt'|'choice', title, msg (title + body as plain text), danger, typeToConfirm, buttons }
'use strict';
module.exports = async function uidialogHook(cdp, handlers, opt = {}) {
  let cur = { answer: opt.answer === undefined ? true : opt.answer, prompt: opt.prompt == null ? null : opt.prompt }, scriptId = null;
  const install = async () => {
    if (scriptId) { try { await cdp('Page.removeScriptToEvaluateOnNewDocument', { identifier: scriptId }); } catch (e) { } }
    // UI KIT (2026-10-13): the dashboard has a Simple and an Advanced view (Dashboard/ui_kit.js, per browser in localStorage). The tests
    // were written for the full view: every page load starts in Advanced unless the test passes { uiMode: 'simple' } or { uiMode: null } (its own choice)
    const mode = opt.uiMode === undefined ? 'advanced' : opt.uiMode;
    const pre = mode ? `try { localStorage.setItem('swarm.uimode', ${JSON.stringify(mode)}); } catch (e) { }` : '';
    const r = await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `${pre} window.UIDIALOG_TEST = ${JSON.stringify(cur)};` });
    scriptId = r && r.identifier;
  };
  await install();
  handlers.push((m) => {
    if (m.method !== 'Runtime.consoleAPICalled') return;
    const a = m.params.args && m.params.args[0];
    if (a && typeof a.value === 'string' && a.value.startsWith('UIDIALOG ')) { try { if (opt.onDialog) opt.onDialog(JSON.parse(a.value.slice(9))); } catch (e) { } }
  });
  return {
    async set(ev, answer, prompt) {
      cur = { answer, prompt: prompt === undefined ? cur.prompt : prompt };
      await install();
      try { await ev(`(window.UIDIALOG_TEST = ${JSON.stringify(cur)}, true)`); } catch (e) { }
    },
  };
};
