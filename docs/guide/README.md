# Swarm User Guide

This guide explains the **Swarm** system from the ground up: what it is, how to install it on your own PC with your own accounts, how the
bots think, and how to use every page of the dashboard. It is written for someone who owns **L2Swarm** but has never seen our scripts
or dashboard.

> All screenshots in this guide come from a demo copy of a real running system. Character, party and account names were replaced with
> demo names (party **Aldric**, party **Borin**, party **Gromund**, party **Valerius**, party **Dravik**, solo **Quill**). Phone shots are
> 390 x 844, desktop shots 1440 x 900. Yellow numbered circles point at the controls explained in the text.

The same guide as one page with pictures: open [index.html](index.html) in a browser (works offline, also on a phone).

## Contents

### Part 1 - Getting started
- [Getting started: install, first run, updating, troubleshooting, safety](01-getting-started.md)
- [Concepts: how the swarm works](02-concepts.md)

### Part 2 - The dashboard
- [Dashboard basics: header, tabs, search, confirmations, messages](03-dashboard-basics.md)
- [Command center (search and give any order)](pages/command-center.md)
- [Parties](pages/parties.md)
- [Party status (banner, plain-words member rows, trade lines)](pages/parties-status.md)
- [Character page](pages/character.md)
- [Override menu (Act / Override…: one order, once, to one character)](pages/override.md)
- [Map](pages/map.md)
- [What they do (timeline)](pages/what-they-do.md)
- [Teleports and Giran town routes](pages/teleports.md)
- [Find an NPC (NPC atlas, send a party to any NPC)](pages/find-npc.md)
- [Raid bosses, raid routes and reports](pages/raid-bosses.md)
- [Raid fight area (where the team fights a boss, what it clears first, where it waits)](pages/raid-area.md)
- [Kamaloka](pages/kamaloka.md)
- [Fortresses, castles and sieges](pages/sieges.md)
- [Crystals (soul crystals)](pages/crystals.md)
- [Clan](pages/clan.md)
- [Zones](pages/zones.md)
- [Spots and the full-screen spot editor](pages/spots.md)
- [Rooms (dungeon room walks)](pages/rooms.md)
- [Shape editor (rooms, zones, spots, field areas)](pages/shape-editor.md)
- [Gear](pages/gear.md)
- [Accounts](pages/accounts.md)
- [Plan](pages/plan.md)
- [PC (L2Swarm program, memory, deploy)](pages/pc.md)

### Part 3 - Live views
- [Live views overview](04-live-views.md)
- [Live party view (live map + member cards + exp pop-ups)](pages/live-party.md)
- [Raid live view (raid HUD)](pages/raid-live.md)
- [Raid live view: the live raid block, banner and older details](live/raid-live.md)
- [Kamaloka live view](live/kamaloka-live.md)
- [Siege live view](live/siege-live.md)
- [Party live states: escape box, cast bar, rotation, occupied spots, chosen-spot status, hunting pairs](live/party-live.md)

### Part 4 - Reference
- [Command reference (every command)](05-commands.md)
- [Glossary](06-glossary.md)
- [Page checklist (what this guide covers)](PAGES_CHECKLIST.md)

## Rebuilding this guide

Everything here can be regenerated with one command from the install folder:

```
node docs/guide/tools/make_guide.js
```

It builds an anonymised copy of your own live data, starts a sandbox copy of the dashboard that cannot reach the game, takes every
screenshot with headless Edge or Chrome, regenerates the command reference and `index.html`, and checks that no real name is left.
Details: [tools/README.md](tools/README.md).
