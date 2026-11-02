// Shared by the page, build.js and test.js. No DOM here.

const DAY = 864e5;
const CACHE_KEY = 'ports-cache-v2';

const SOURCES = [
  { name: 'genizy/web-port', repo: 'https://github.com/genizy/web-port',
    url: 'https://raw.githubusercontent.com/genizy/web-port/main/README.md', parse: parseGenizy },
  { name: 'Ultimate Catalog of Web Game Ports', repo: 'https://github.com/Carter54git/Ultimate-Catalog-Of-Web-Game-Ports',
    url: 'https://raw.githubusercontent.com/Carter54git/Ultimate-Catalog-Of-Web-Game-Ports/main/README.md', parse: parseCatalog },
];

const item = ([name, play, note]) => ({ id: name, name, play, repo: '', note });

// Official web games, added next to the catalog ports.
const EXTRA_GAMES = [
  ['2048', 'https://play2048.co/'],
  ['Slither.io', 'https://slither.io/'],
  ['Agar.io', 'https://agar.io/'],
  ['Diep.io', 'https://diep.io/'],
  ['Krunker', 'https://krunker.io/'],
  ['Shell Shockers', 'https://shellshock.io/'],
  ['Smash Karts', 'https://smashkarts.io/'],
  ['Territorial.io', 'https://territorial.io/'],
  ['Skribbl.io', 'https://skribbl.io/'],
  ['Paper.io 2', 'https://paper-io.com/'],
  ['Bloxd.io', 'https://bloxd.io/'],
  ['Zombs Royale', 'https://zombsroyale.io/'],
  ['MooMoo.io', 'https://moomoo.io/'],
  ['Venge.io', 'https://venge.io/'],
  ['EV.IO', 'https://ev.io/'],
  ['Wings.io', 'https://wings.io/'],
  ['Powerline.io', 'https://powerline.io/'],
  ['Tank Trouble', 'https://tanktrouble.com/'],
  ['Polytrack', 'https://www.kodub.com/apps/polytrack'],
  ['Minecraft Classic', 'https://classic.minecraft.net/'],
  ['GeoFS Flight Simulator', 'https://www.geo-fs.com/geofs.php'],
  ['Little Alchemy 2', 'https://littlealchemy2.com/'],
  ['Infinite Craft', 'https://neal.fun/infinite-craft/'],
  ['Neal.fun', 'https://neal.fun/'],
  ['A Dark Room', 'https://adarkroom.doublespeakgames.com/'],
  ['Cookie Clicker', 'https://orteil.dashnet.org/cookieclicker/', 'tab'], // its script refuses to run framed
  ['Universal Paperclips', 'https://www.decisionproblem.com/paperclips/index2.html'],
  ['Line Rider', 'https://www.linerider.com/'],
  ['QWOP', 'https://www.foddy.net/Athletics.html'],
  ['Quick, Draw!', 'https://quickdraw.withgoogle.com/'],
  ['Pac-Man (Google Doodle)', 'https://www.google.com/logos/2010/pacman10-i.html'],
  ['Jstris', 'https://jstris.jezevec10.com/'],
  ['TETR.IO', 'https://tetr.io/'],
  ['Minesweeper Online', 'https://minesweeper.online/'],
  ['Solitaire', 'https://www.solitr.com/'],
  ['Sudoku', 'https://sudoku.com/'],
  ['Wordle', 'https://www.nytimes.com/games/wordle/index.html'],
  ['Contexto', 'https://contexto.me/'],
  ['Semantle', 'https://semantle.com/'],
  ['Worldle', 'https://worldle.teuteuf.fr/'],
  ['OpenGuessr', 'https://openguessr.com/'],
  ['Lichess', 'https://lichess.org/'],
  ['Chess.com', 'https://www.chess.com/play/computer'],
].map(([name, play, tab]) => ({ name, play, repo: '', ...(tab && { tab: true }) }));

// shortcut: gn-math.dev "?id=" links answer 200 but open its homepage, not the game.
// Checked 2026-11-02; drop this if they deep-link to games again.
const SOFT_DEAD = /^https?:\/\/gn-math\.dev\//;

const APPS = [
  ['Photopea', 'https://www.photopea.com/', 'Image editor'],
  ['Vectorpea', 'https://www.vectorpea.com/', 'Vector editor'],
  ['miniPaint', 'https://viliusle.github.io/miniPaint/', 'Image editor'],
  ['JS Paint', 'https://jspaint.app/', 'Paint'],
  ['Pixilart', 'https://www.pixilart.com/draw', 'Pixel art'],
  ['Lospec Pixel Editor', 'https://apps.lospec.com/pixel-editor/', 'Pixel art'],
  ['Kleki', 'https://kleki.com/', 'Painting'],
  ['Excalidraw', 'https://excalidraw.com/', 'Whiteboard'],
  ['tldraw', 'https://www.tldraw.com/', 'Whiteboard'],
  ['draw.io', 'https://app.diagrams.net/', 'Diagrams'],
  ['Canva', 'https://www.canva.com/', 'Design'],
  ['BeepBox', 'https://www.beepbox.co/', 'Music maker'],
  ['JummBox', 'https://jummb.us/', 'Music maker'],
  ['Chrome Music Lab', 'https://musiclab.chromeexperiments.com/', 'Music toys'],
  ['Online Sequencer', 'https://onlinesequencer.net/', 'Music maker'],
  ['Learning Synths', 'https://learningsynths.ableton.com/', 'Synth playground'],
  ['AudioMass', 'https://audiomass.co/', 'Audio editor'],
  ['Webamp', 'https://webamp.org/', 'Music player'],
  ['Radio Garden', 'https://radio.garden/', 'World radio'],
  ['OnlineGDB', 'https://www.onlinegdb.com/', 'Code compiler'],
  ['Online Python', 'https://www.online-python.com/', 'Python'],
  ['CodePen', 'https://codepen.io/pen/', 'Web code'],
  ['JSFiddle', 'https://jsfiddle.net/', 'Web code'],
  ['StackBlitz', 'https://stackblitz.com/', 'Web IDE'],
  ['VS Code', 'https://vscode.dev/', 'Code editor'],
  ['Compiler Explorer', 'https://godbolt.org/', 'Compiler'],
  ['regex101', 'https://regex101.com/', 'Regex tester'],
  ['IT Tools', 'https://it-tools.tech/', 'Dev tools'],
  ['TurboWarp', 'https://turbowarp.org/editor', 'Scratch editor'],
  ['Snap!', 'https://snap.berkeley.edu/snap/snap.html', 'Block coding'],
  ['Desmos', 'https://www.desmos.com/calculator', 'Graphing calculator'],
  ['Desmos Scientific', 'https://www.desmos.com/scientific', 'Calculator'],
  ['GeoGebra', 'https://www.geogebra.org/calculator', 'Math'],
  ['Wolfram|Alpha', 'https://www.wolframalpha.com/', 'Answers'],
  ['PhET Simulations', 'https://phet.colorado.edu/en/simulations/browse', 'Science sims'],
  ['Ptable', 'https://ptable.com/', 'Periodic table'],
  ['Wikipedia', 'https://en.wikipedia.org/', 'Encyclopedia'],
  ['keybr', 'https://www.keybr.com/', 'Typing'],
  ['Monkeytype', 'https://monkeytype.com/', 'Typing test'],
  ['Squoosh', 'https://squoosh.app/', 'Image compressor'],
  ['Online Notepad', 'https://onlinenotepad.org/notepad', 'Notes'],
  ['vClock Timer', 'https://vclock.com/timer/', 'Timer'],
  ['v86', 'https://copy.sh/v86/', 'PC emulator'],
  ['Windows 93', 'https://www.windows93.net/', 'Fake OS'],
  ['Windows 96', 'https://windows96.net/', 'Fake OS'],
  ['daedalOS', 'https://dustinbrett.com/', 'Desktop in a tab'],
  ['PCjs', 'https://www.pcjs.org/', 'Old PCs'],
].map(item);

// Free, licensed streaming only.
const MOVIES = [
  ['Tubi', 'https://tubitv.com/', 'Free with ads'],
  ['Pluto TV', 'https://pluto.tv/', 'Free live channels'],
  ['Plex', 'https://watch.plex.tv/', 'Free with ads'],
  ['The Roku Channel', 'https://therokuchannel.roku.com/', 'Free with ads'],
  ['YouTube Movies', 'https://www.youtube.com/feed/storefront', 'Free with ads section'],
  ['Internet Archive', 'https://archive.org/details/feature_films', 'Public-domain films'],
  ['Kanopy', 'https://www.kanopy.com/', 'Free with a library card'],
  ['Hoopla', 'https://www.hoopladigital.com/', 'Free with a library card'],
  ['BBC iPlayer', 'https://www.bbc.co.uk/iplayer', 'UK'],
  ['Channel 4', 'https://www.channel4.com/', 'UK, free'],
  ['ITVX', 'https://www.itv.com/', 'UK, free tier'],
].map(item);

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

// Ids not in the previous catalog get a timestamp; the UI shows them as "new" for 7 days.
function diff(prev, games, now) {
  const added = { ...(prev && prev.added) };
  if (prev) {
    const seen = new Set(prev.games.map(g => g.id));
    for (const g of games) if (!seen.has(g.id)) added[g.id] = now;
  }
  return added;
}

// HTTP check of a link: 'dead', 'tab' (works but refuses to load inside the player) or 'ok'.
// 403/429/503 are usually bot walls (Cloudflare), so they count as alive.
function classify(status, headers) {
  if (!status || status === 404 || status === 410 || (status >= 500 && status !== 503)) return 'dead';
  if ([403, 429, 503].includes(status)) return 'ok';
  const xfo = (headers['x-frame-options'] || '').toLowerCase();
  const fa = /frame-ancestors([^;,]*)/i.exec(headers['content-security-policy'] || '');
  const blocked = /deny|sameorigin/.test(xfo) || (fa && !/(^|\s)(\*|https:)(\s|$)/.test(fa[1]));
  return blocked ? 'tab' : 'ok';
}

// "https://github.com/o/r/tree/branch/sub/dir" -> parts used by the publish methods.
function ghParts(url) {
  const m = /^https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/tree\/([^/]+)\/?(.*?))?\/?(?:[?#].*)?$/.exec(url || '');
  return m && { owner: m[1], repo: m[2], branch: m[3] || '', path: (m[4] || '').replace(/\/$/, '') };
}

function readCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY)); } catch { return null; }
}

// catalog.json is rebuilt daily by build.js; the cache only feeds the "new" tags and offline use.
async function loadCatalog() {
  const prev = readCache();
  try {
    const r = await fetch('catalog.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error(`catalog.json: HTTP ${r.status}`);
    const cat = await r.json();
    cat.added = prev && prev.time === cat.time ? prev.added : diff(prev, cat.games, Date.now());
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(cat)); } catch {}
    return cat;
  } catch (e) {
    if (prev) return { ...prev, error: e.message }; // stale beats nothing
    throw e;
  }
}
