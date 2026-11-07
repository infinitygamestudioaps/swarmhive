'use strict';
// PLUSLOCK-2026-11-04 (owner, furious: "NEVER FUCKING ever take the +++ weapons from warehouse!!!! ... Dont touch my + up weapons NEVER unless
// I tell you to ... Never touch my plused equipment unless i tell you to."): requirement docs/requirements/gear.md R6.
// Every AUTOMATIC gear source (gear-up, distributors, Upgrade page presets / plans, item jobs, the bank, the runner) skips every enchanted piece
// (+1 and up) that is not in the character's OWN bag. Only a piece the owner picked himself in the UI (ownerPick: true, set by a tap on that
// exact piece) may move. The same rule lives in Scripts_dev/swarm.js block PLUSLOCK-PURE.
/** item { src: bag|wh|clan|char|shop|craft, enchant } -> true when it must NOT be used automatically */
function plusLocked(item, ownerPick) {
  const it = item || {}, e = Number(it.enchant) || 0, src = String(it.src || 'bag');
  if (e < 1) return false;
  if (src === 'bag' || src === 'shop' || src === 'craft') return false;       // the character's own bag / something new
  return !(ownerPick === true || it.ownerPick === true);
}
const plusLockWhy = (item) => `${(item && item.name) || 'item'} +${Number((item && item.enchant) || 0)}: plused equipment is never touched unless you pick it yourself`;
module.exports = { plusLocked, plusLockWhy };
