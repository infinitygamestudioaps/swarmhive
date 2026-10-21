# Academy mages (automatic)

An **Academy mage** is a throw-away character that levels from 1 to 40 inside the clan **Academy**.
When it changes class at 40 it **graduates**: the clan gets the Academy reputation, the character leaves,
logs out, and the same account makes the next Academy mage. Nothing needs to be done by hand.

## Start one

1. Dashboard → **Accounts** → **+ Add account**.
2. Login + password (the password is stored encrypted only, like L2Swarm does).
3. Character: **Academy mage (automatic)**. No name, party or role needed.
   Several at once: **Several at once** → tick **Academy mages (automatic)** and paste `login;password` lines.
4. Tick **Log in right away** (or it logs in at the next start).

## What it does by itself

| Step | What happens |
|---|---|
| Character | A random name with digits (e.g. *Nyxara482*), a new **Dark Elven Mystic**. A taken name? It tries the next one. |
| Setup | The dashboard gives it an **approved** class plan (Dark Wizard at 20, Spellhowler at 40), its own plan (📋 Plan), puts it on the clan invite list and switches it **on**. |
| Giran | `.giran`, then it waits at the Giran start next to the clan leader. |
| Academy | The clan leader invites it into the **Academy** (clan level 5 or higher). |
| Adena | The adena givers (Adena page) top it up to 2,000,000. It waits in Giran until it has 900,000. |
| Start kit | 5,000 No-Grade spiritshots at Helvetia. |
| Level 1–20 | Alone, where it fits (board buffs once — they last 12 hours; again only after a death). |
| Level 20 | 1st class change (Dark Wizard) on the board, then **Devotion tunic + stockings, Leather Helmet, Common Staff of Life** (or Atuba Hammer) and 10,000 Blessed D spiritshots, worn at once. |
| Level 20–25 | Ant Nest, the entrance room. |
| Level 25–40 | Ant Nest, the first big room. |
| Level 40 | 2nd class change (Spellhowler) = graduation. It logs out; the account makes the next Academy mage. |

The loop stops by itself when the account has no free character slot (or after 7 characters).

> ⚠ Ant Nest monsters are level 29–35. A level-20 mage there is risky; that is your choice in the plan
> (the steps carry your level override). Change the rooms or levels in `Scripts/data/academy.json` if they die too often.

## Change it

Everything lives in **`Scripts/data/academy.json`** (read live; new characters use the new values):
names, race / class, class plan, how much adena, the buy lists, the hunting rooms, and what happens at the end
(`end.newCharacter: false` = only log out).

## Watch it

- Its party card shows the plan step (📋 Plan).
- `Logs/academy.log` — every step, buy and graduation.
- `Logs/academy_<Name>.json` — its current state; `Logs/academy_manager.json` — the accounts and how many characters each made.
- Stop the loop for one account: `POST /api/academy { "action": "stop", "login": "<login>" }` (resume: `"resume"`).

## Good to know

- The clan must be **level 5** or higher (the Academy) and the clan leader must stand in **Giran** at the start.
- The adena comes from your **givers** (Adena page). Nobody gives = it waits up to 45 minutes, then the plan stops and says why.
- The dashboard server must run (it creates the next characters).
