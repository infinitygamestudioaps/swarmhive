// Shared loader for swarm.config.json (portable install, 2026-10-07). Used by Dashboard/server.js and the node tools.
//   const SC = require('./swarm_config');           // from docs/plan/tools
//   const SC = require('../docs/plan/tools/swarm_config');   // from Dashboard
//   SC.ROOT            install folder (config "paths.root", else the folder that holds docs\plan\tools)
//   SC.ROOT_FWD        same with forward slashes (for paths embedded in generated L2Swarm scripts)
//   SC.cfg             the parsed config ({} when the file is missing -> every value falls back to the old defaults)
//   SC.mcpUrl, SC.dashboardPort, SC.mainLeader, SC.accounts (enabled ones), SC.partyOf {character: party leader}, SC.parties [leaders]
'use strict';
const fs = require('fs');
const path = require('path');

const BASE = path.resolve(__dirname, '..', '..', '..');
function readCfg(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')); } catch (e) { return null; }
}
const fileCfg = readCfg(path.join(BASE, 'swarm.config.json'));
const cfg = fileCfg || {};
const ROOT = (cfg.paths && cfg.paths.root) ? path.resolve(cfg.paths.root) : BASE;

const accounts = (Array.isArray(cfg.accounts) ? cfg.accounts : []).filter(a => a && a.login && a.enabled !== false);
const mainLeader = cfg.mainLeader || 'Tank1';
const partyOf = {};
accounts.forEach(a => { if (a.character) partyOf[a.character] = a.party || a.character; });
const parties = [...new Set(Object.values(partyOf))];

module.exports = {
  ROOT,
  ROOT_FWD: ROOT.replace(/\\/g, '/'),
  CONFIG_FILE: path.join(BASE, 'swarm.config.json'),
  hasConfig: !!fileCfg,
  cfg,
  mcpPort: (cfg.mcp && +cfg.mcp.port) || 8083,
  mcpUrl: 'http://127.0.0.1:' + ((cfg.mcp && +cfg.mcp.port) || 8083),
  dashboardPort: (cfg.dashboard && +cfg.dashboard.port) || 8090,
  mainLeader,
  clanLeader: cfg.clanLeader || 'Dagger1',
  accounts,
  partyOf,
  parties,
  server: Object.assign({ loginIp: '149.56.28.81', loginPort: 2106, serverId: 3, gameIp: '149.56.28.81', gamePort: 7778 }, cfg.server || {}),
  l2Client: (cfg.paths && cfg.paths.l2Client) || 'C:\\Lineage2\\system\\l2.exe',
  reload() { return readCfg(path.join(BASE, 'swarm.config.json')); },
};
