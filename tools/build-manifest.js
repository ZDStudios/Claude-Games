#!/usr/bin/env node
'use strict';

/*
 * Builds manifest.json, the machine-readable catalogue of the ZD Studios game library
 * for AI agents. Run it from anywhere:
 *
 *     node tools/build-manifest.js          (or: npm run manifest)
 *
 * It reads the library's own data (GAME_INFO, MULTIPLAYER, FEATURED, EXTERNAL_GAMES in index.html and the
 * GAMES list in mini-arcade.html), analyses every game file for its tech and code facts, and writes
 * manifest.json next to index.html. Run it again after adding, removing or updating a game.
 *
 * It does not use the Discrete Mode names on purpose (that mode is a disguise for the human-facing page).
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const BASE = 'https://games.zdstudios.network/';
const REPO = 'ZDStudios/Claude-Games';
const BRANCH = 'main';
const SELF_FILES = new Set(['index.html', 'mini-arcade.html']);

const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

/* ---------- pull a JS literal (object / array) out of the page source ---------- */
function extractLiteral(src, name) {
  const m = new RegExp('(?:const|let|var)\\s+' + name + '\\s*=\\s*').exec(src);
  if (!m) throw new Error('Could not find ' + name);
  let i = m.index + m[0].length;
  const open = src[i], close = open === '{' ? '}' : open === '[' ? ']' : null;
  if (!close) throw new Error(name + ' is not an object or array literal');
  let depth = 0, j = i, str = null;
  for (; j < src.length; j++) {
    const c = src[j], n = src[j + 1];
    if (str) {
      if (c === '\\') { j++; continue; }
      if (c === str) str = null;
      continue;
    }
    if (c === '/' && n === '/') { while (j < src.length && src[j] !== '\n') j++; continue; }
    if (c === '/' && n === '*') { j = src.indexOf('*/', j + 2) + 1; continue; }
    if (c === '"' || c === "'" || c === '`') { str = c; continue; }
    if (c === open) depth++;
    else if (c === close && --depth === 0) { j++; break; }
  }
  return vm.runInNewContext('(' + src.slice(i, j) + ')');
}

/* ---------- per-file analysis ---------- */
const lineEndings = s => {
  const crlf = (s.match(/\r\n/g) || []).length, lf = (s.match(/\n/g) || []).length - crlf;
  return crlf && lf ? 'mixed' : crlf ? 'CRLF' : 'LF';
};

function threeVersion(src) {
  let m;
  if ((m = /three\.js r(\d{2,3})/i.exec(src))) return 'r' + m[1];
  if ((m = /three@0\.(\d{2,3})\.\d+/.exec(src))) return 'r' + m[1];
  if ((m = /\bREVISION\s*[:=]\s*["'](\d{2,3})["']/.exec(src))) return 'r' + m[1];
  // three.js publishes its revision as window.__THREE__ = <constant>; trace that constant back to its string value
  if ((m = /__THREE__\s*=\s*([\w$]+)/.exec(src))) {
    const v = m[1].replace(/\$/g, '\\$');
    const d = new RegExp('(?:var|const|let|,)\\s*' + v + '\\s*=\\s*["\'](\\d{2,3})["\']').exec(src);
    if (d) return 'r' + d[1];
  }
  return null;
}

function externalResources(src) {
  const found = new Map();
  const add = (kind, url) => {
    let host; try { host = new URL(url).host; } catch (e) { return; }
    if (/(^|\.)w3\.org$|^github\.com$|wikipedia\.org$|^discourse\.threejs\.org$/.test(host)) return;
    found.set(kind + '|' + host, { kind, host });
  };
  let m;
  const rx = [
    ['script', /<script[^>]+src=["'](https?:\/\/[^"']+)/gi],
    ['stylesheet-or-font', /<link[^>]+href=["'](https?:\/\/[^"']+)/gi],
    ['module-import', /import\(\s*["'`](https?:\/\/[^"'`]+)/g],
    ['import-map', /"(?:three|three\/addons\/)"\s*:\s*"(https?:\/\/[^"]+)/g],
    ['fetch', /fetch\(\s*["'`](https?:\/\/[^"'`]+)/g],
    ['multiplayer-server', /\burl:\s*["'](https:\/\/mp\.zdstudios\.network)/g],
  ];
  for (const [kind, re] of rx) while ((m = re.exec(src))) add(kind, m[1]);
  // the multiplayer server is one resource, however it is referenced
  const list = [...found.values()].filter(e => e.host !== 'mp.zdstudios.network');
  if ([...found.values()].some(e => e.host === 'mp.zdstudios.network')) list.push({ kind: 'multiplayer-server', host: 'mp.zdstudios.network' });
  return list.sort((a, b) => (a.host + a.kind).localeCompare(b.host + b.kind));
}

function persistenceKeys(src) {
  const keys = new Set(); let m;
  const rx = [/(?:local|session)Storage\.(?:get|set|remove)Item\(\s*["'`]([\w.:-]{3,40})["'`]/g,
              /(?:SAVE_KEY|SAVEKEY|STORAGE_KEY|SAVE|KEY)\s*=\s*["'`]([\w.:-]{3,40})["'`]/g];
  for (const re of rx) while ((m = re.exec(src))) keys.add(m[1]);
  ['zd.discreet', 'zd.discreetTip', 'fbh_device', 'ideaLast', '__gag_test', 'wforge_t'].forEach(k => keys.delete(k));
  return [...keys].sort().slice(0, 10);
}

function analyse(file) {
  const src = read(file);
  const three = /\bTHREE\.[A-Za-z]|from ['"]three['"]|three@\d|\bWebGLRenderer\b/.test(src);
  const rawGL = !three && /getContext\(\s*["'](?:webgl2?|experimental-webgl)["']/.test(src);
  const canvas2d = /getContext\(\s*["']2d["']/.test(src);
  const ext = externalResources(src);
  const needsNetworkToRun = ext.some(e => ['script', 'module-import', 'import-map'].includes(e.kind) && e.host !== 'mp.zdstudios.network')
    && !/(three\.js r\d+|bundled so the game runs fully offline|inlined: https)/i.test(src);
  const rendering = [];
  if (three) rendering.push('three.js' + (threeVersion(src) ? ' ' + threeVersion(src) : ''));
  if (rawGL) rendering.push('WebGL (hand-written)');
  if (canvas2d && !three) rendering.push('Canvas 2D');
  if (!rendering.length) rendering.push('DOM / CSS');
  const libs = [];
  if (/RAPIER|rapier3d/i.test(src)) libs.push('Rapier physics (WASM, bundled)');
  if (/peerjs/i.test(src)) libs.push('PeerJS (WebRTC)');
  const net = [];
  if (/mp\.zdstudios\.network/.test(src)) net.push('ZD Studios multiplayer server (mp.zdstudios.network)');
  if (/peerjs/i.test(src)) net.push('WebRTC peer-to-peer via PeerJS public broker');
  let modified = null, commit = null;
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%cI %h', '--', file], { cwd: ROOT, encoding: 'utf8' }).trim().split(' ');
    modified = out[0] || null; commit = out[1] || null;
  } catch (e) { /* not a git checkout: leave unset */ }
  const titleM = /<title>([^<]*)<\/title>/i.exec(src);
  return {
    page_title: titleM ? titleM[1].trim() : null,
    code: {
      language: 'HTML + CSS + JavaScript, one standalone file',
      entry: file,
      size_bytes: Buffer.byteLength(src, 'utf8'),
      lines: src.split('\n').length,
      line_endings: lineEndings(src),
      rendering,
      libraries: libs,
      audio: /AudioContext/.test(src) ? 'Web Audio API' : null,
      networking: net,
      save_data: persistenceKeys(src).length ? { storage: 'browser localStorage', keys: persistenceKeys(src) } : null,
      input: [/touchstart|pointer:\s*coarse|ontouchstart/.test(src) ? 'touch' : null, /requestPointerLock/.test(src) ? 'pointer-lock mouse' : null, /getGamepads/.test(src) ? 'gamepad' : null, 'keyboard + mouse'].filter(Boolean),
      fonts_embedded: /@font-face\s*\{[^}]*url\(["']?data:font/.test(src),
      works_offline: !needsNetworkToRun,
      external_resources: ext,
      discrete_mode_integrated: /data-zd-discreet/.test(src),
    },
    last_changed: modified, last_commit: commit,
  };
}

/* ---------- gather the library's own data ---------- */
const indexSrc = read('index.html');
const GAME_INFO = extractLiteral(indexSrc, 'GAME_INFO');
const MULTIPLAYER = extractLiteral(indexSrc, 'MULTIPLAYER');
const FEATURED = extractLiteral(indexSrc, 'FEATURED');
const EXTERNAL = extractLiteral(indexSrc, 'EXTERNAL_GAMES');

const files = fs.readdirSync(ROOT).filter(f => /\.html?$/i.test(f) && !SELF_FILES.has(f.toLowerCase())).sort();
const rank = f => { const i = FEATURED.indexOf(f.toLowerCase()); return i === -1 ? FEATURED.length : i; };
const ordered = files.slice().sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));

const modesOf = key => {
  const m = MULTIPLAYER[key] || {};
  return { single_player: !!m.single || (!m.online && !m.local), online_multiplayer: !!m.online, local_multiplayer: !!m.local };
};

const games = ordered.map(file => {
  const info = GAME_INFO[file.toLowerCase()] || {};
  const a = analyse(file);
  return {
    id: file.replace(/\.html?$/i, ''),
    title: info.title || a.page_title || file,
    tagline: info.tagline || null,
    description: info.desc || null,
    genre: info.genre || null,
    emoji: info.emoji || null,
    play: { url: BASE + file, ...modesOf(file.toLowerCase()) },
    origin: {
      section: info.community ? 'suggested-by-the-public' : 'main-library',
      author: info.author || null,
      credit: info.credit || null,
    },
    source: {
      file,
      raw_url: `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${file}`,
      github_url: `https://github.com/${REPO}/blob/${BRANCH}/${file}`,
    },
    page_title: a.page_title,
    code: a.code,
    last_changed: a.last_changed,
    last_commit: a.last_commit,
  };
});

const external = EXTERNAL.map(url => {
  const info = GAME_INFO[url.toLowerCase()] || {};
  return {
    id: 'mow-town',
    title: info.title || url,
    tagline: info.tagline || null,
    description: info.desc || null,
    genre: info.genre || null,
    emoji: info.emoji || null,
    play: { url, ...modesOf(url.toLowerCase()) },
    origin: { section: 'main-library', author: info.author || null, credit: info.credit || null, hosted_externally: true },
    source: null,
    code: { note: 'Hosted on its own site, so its source is not in this repository. Observed on the live page: three.js r128 loaded from cdnjs, and the ZD Studios multiplayer SDK.' },
  };
});

const arcadeSrc = read('mini-arcade.html');
const arcade = [];
{
  const body = /var GAMES = \[([\s\S]*?)\n\];/.exec(arcadeSrc);
  const unq = s => vm.runInNewContext("'" + s + "'");
  const re = /\{\s*id:'([^']+)',\s*name:'([^']+)',\s*em:'((?:[^'\\]|\\.)*)',\s*desc:'((?:[^'\\]|\\.)*)'/g; let m;
  while (body && (m = re.exec(body[1]))) arcade.push({ id: m[1], name: m[2], emoji: unq(m[3]), description: unq(m[4]) });
}
const arcadeAnalysis = analyse('mini-arcade.html');

const manifest = {
  schema_version: 1,
  generated_at: new Date().toISOString(),
  name: 'ZD Studios Game Library',
  description: 'A growing collection of free browser games. No installs, no accounts. Every game is a single standalone HTML file that runs in the browser. Games were built with heavy use of AI plus a lot of human direction and effort.',
  urls: {
    library: BASE,
    manifest: BASE + 'manifest.json',
    llms_txt: BASE + 'llms.txt',
    game_list_api: BASE + 'api/games',
    repository: `https://github.com/${REPO}`,
    mini_arcade: BASE + 'mini-arcade.html',
  },
  for_ai_agents: {
    summary: 'This manifest is the machine-readable catalogue of the whole library. Everything an agent needs about each game (what it is, how to play it, how it is built, where its source is) is in the games array.',
    how_to_use: [
      'To let a user play a game, give them the game.play.url link; it opens in a new browser tab.',
      'To read or modify a game, fetch game.source.raw_url; each game is one self-contained HTML file with inline CSS and JavaScript.',
      'game.code lists the rendering engine, libraries, networking, save data and external resources found in that file.',
      'play.single_player / online_multiplayer / local_multiplayer match the badges on the library page.',
      'origin.section "suggested-by-the-public" means the game was built from an idea sent in through the feedback box; origin.credit says who to credit.',
    ],
    notes: [
      'If the library home page shows an "Under maintenance" notice, the library is temporarily closed. The individual game URLs still work.',
      'Online multiplayer needs the ZD Studios multiplayer server (mp.zdstudios.network); the games fall back to offline modes where they have them.',
      'Games work on PC (keyboard and mouse). Many are not designed for mobile.',
      'This file is regenerated from the repository with: node tools/build-manifest.js',
    ],
  },
  repository_conventions: {
    one_game_per_file: 'Each game is a single .html file at the repo root. index.html is the library launcher and mini-arcade.html is a bundle of small arcade games.',
    adding_a_game: 'Drop the .html file at the repo root and push to main. /api/games lists it automatically. Optionally add an entry to GAME_INFO (plus FEATURED / MULTIPLAYER) in index.html for a custom card.',
    deployment: 'Pushing to main auto-deploys to games.zdstudios.network (Express static server, server.js). GitHub Pages copy redirects to it.',
    offline_policy: 'Libraries and fonts are inlined so games run without internet; CDNs are kept only as fallbacks. Only the multiplayer SDK is loaded from the ZD Studios server.',
    library_features: ['search and filters by player mode', 'a "Got a game idea?" / feedback box with replies chat (ZD Studios Feedback Hub)', 'seasonal themes and a maintenance mode, controlled by true/false flags at the top of index.html', 'Discrete Mode, an alternate disguised view of the page'],
  },
  stats: {
    games_in_repo: games.length,
    games_total_including_external: games.length + external.length,
    suggested_by_the_public: games.filter(g => g.origin.section === 'suggested-by-the-public').length,
    with_online_multiplayer: [...games, ...external].filter(g => g.play.online_multiplayer).length,
    with_local_multiplayer: [...games, ...external].filter(g => g.play.local_multiplayer).length,
  },
  games: [...games, ...external],
  mini_arcade: {
    url: BASE + 'mini-arcade.html',
    description: 'One page with several classic arcade games on a canvas. High scores are saved in the browser.',
    games: arcade,
    code: arcadeAnalysis.code,
    source: { file: 'mini-arcade.html', raw_url: `https://raw.githubusercontent.com/${REPO}/${BRANCH}/mini-arcade.html` },
  },
};

fs.writeFileSync(path.join(ROOT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`manifest.json written: ${games.length} games in the repo + ${external.length} external, ${arcade.length} mini-arcade games`);
