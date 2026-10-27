// Pure data logic (no DOM) so test.js can run it in Node.

const DAY = 864e5;
const CACHE_KEY = 'ports-cache-v1';

const SOURCES = [
  { name: 'genizy/web-port', repo: 'https://github.com/genizy/web-port',
    url: 'https://raw.githubusercontent.com/genizy/web-port/main/README.md', parse: parseGenizy },
  { name: 'Ultimate Catalog of Web Game Ports', repo: 'https://github.com/Carter54git/Ultimate-Catalog-Of-Web-Game-Ports',
    url: 'https://raw.githubusercontent.com/Carter54git/Ultimate-Catalog-Of-Web-Game-Ports/main/README.md', parse: parseCatalog },
];

// Only sites that allow being embedded in an iframe.
const APPS = [
  ['Photopea', 'https://www.photopea.com/', 'Image editor'],
  ['Excalidraw', 'https://excalidraw.com/', 'Whiteboard'],
  ['tldraw', 'https://www.tldraw.com/', 'Whiteboard'],
  ['JS Paint', 'https://jspaint.app/', 'Paint'],
  ['Desmos', 'https://www.desmos.com/calculator', 'Graphing calculator'],
  ['GeoGebra', 'https://www.geogebra.org/calculator', 'Math'],
  ['BeepBox', 'https://www.beepbox.co/', 'Music maker'],
  ['Squoosh', 'https://squoosh.app/', 'Image compressor'],
  ['OnlineGDB', 'https://www.onlinegdb.com/', 'Code compiler'],
  ['v86', 'https://copy.sh/v86/', 'PC emulator'],
].map(([name, play, note]) => ({ id: name, name, play, repo: '', note }));

function link(cell) {
  const m = /\]\((https?:\/\/[^)\s]+)\)/.exec(cell);
  return m ? m[1] : '';
}

// genizy README: "- [Name](url) - Ported by ..." between "Full Game List" and "Credits".
function parseGenizy(md) {
  const list = (md.split('## Full Game List')[1] || '').split('## Credits')[0].replace(/<!--[\s\S]*?-->/g, '');
  return [...list.matchAll(/^- \[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/gm)]
    .map(([, name, repo]) => ({ name, play: '', repo }));
}

// Catalog README: "| Game | Play | Source |" tables, one per letter.
function parseCatalog(md) {
  return md.split('\n').flatMap(line => {
    const cells = line.split('|').slice(1, -1).map(c => c.trim());
    if (cells.length !== 3 || cells[0] === 'Game' || /^:?-+/.test(cells[0])) return [];
    let play = link(cells[1]), repo = link(cells[2]);
    // A few rows put the GitHub repo in the Play column.
    if (/^https?:\/\/github\.com\//.test(play)) { repo = repo || play; play = ''; }
    return play || repo ? [{ name: cells[0].replace(/^⭐\s*/, ''), play, repo }] : [];
  });
}

const keyOf = name => name.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

function merge(lists) {
  const map = new Map();
  for (const g of lists.flat()) {
    const id = keyOf(g.name);
    const old = map.get(id);
    if (!old) map.set(id, { id, ...g });
    else { old.play = old.play || g.play; old.repo = old.repo || g.repo; }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// Ids not in the previous fetch get a timestamp; the UI shows them as "new" for 7 days.
function diff(prev, games, now) {
  const added = { ...(prev && prev.added) };
  if (prev) {
    const seen = new Set(prev.games.map(g => g.id));
    for (const g of games) if (!seen.has(g.id)) added[g.id] = now;
  }
  return added;
}

// "https://github.com/o/r/tree/branch/sub/dir" -> parts used by the publish methods.
function ghParts(url) {
  const m = /^https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/tree\/([^/]+)\/?(.*?))?\/?(?:[?#].*)?$/.exec(url || '');
  return m && { owner: m[1], repo: m[2], branch: m[3] || '', path: (m[4] || '').replace(/\/$/, '') };
}

function readCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY)); } catch { return null; }
}

async function loadGames(force) {
  const cache = readCache();
  if (!force && cache && Date.now() - cache.time < DAY) return cache;
  try {
    const lists = await Promise.all(SOURCES.map(async s => {
      const r = await fetch(s.url, { cache: 'no-store' });
      if (!r.ok) throw new Error(`${s.name}: HTTP ${r.status}`);
      return s.parse(await r.text());
    }));
    const games = merge(lists);
    const now = Date.now();
    const next = { time: now, games, added: diff(cache, games, now) };
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(next)); } catch {}
    return next;
  } catch (e) {
    if (cache) return { ...cache, error: e.message }; // stale beats nothing
    throw e;
  }
}
