// Builds catalog.json: fetches both game lists, checks every link, drops dead ones,
// flags sites that refuse to load inside the player, and finds cover art for each game.
// Run: node build.js   (GitHub Actions runs it daily, see .github/workflows/update.yml)
const fs = require('fs');
const vm = require('vm');

const { SOURCES, EXTRA_GAMES, APPS, MOVIES, SOFT_DEAD, merge, keyOf, classify, ogImage, pageIcon } = vm.runInNewContext(
  fs.readFileSync(__dirname + '/data.js', 'utf8') + '\n;({ SOURCES, EXTRA_GAMES, APPS, MOVIES, SOFT_DEAD, merge, keyOf, classify, ogImage, pageIcon })', { URL });

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const BOT = 'ports-catalog/1.0 (https://github.com/sc0t6/gameports)'; // Wikipedia asks API users to identify themselves

// Cover art per game id ('' = none found). Kept between runs so a daily build only looks up new games.
const ART_FILE = __dirname + '/art.json';
const art = fs.existsSync(ART_FILE) ? JSON.parse(fs.readFileSync(ART_FILE, 'utf8')) : {};

// Reads only up to </head>; some game pages are huge.
async function head(r) {
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let s = '';
  while (s.length < 3e5 && !/<\/head>/i.test(s)) {
    const { done, value } = await reader.read();
    if (done) break;
    s += dec.decode(value, { stream: true });
  }
  reader.cancel().catch(() => {});
  return s;
}

// -> { verdict: 'dead' | 'tab' | 'ok', img: preview image, icon: site icon }
async function probe(url) {
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(20000) });
    const verdict = classify(r.status, Object.fromEntries(r.headers));
    let html = '';
    if (verdict !== 'dead' && /html/i.test(r.headers.get('content-type') || '')) html = await head(r);
    else r.body?.cancel().catch(() => {});
    return { verdict, img: ogImage(html, r.url), icon: pageIcon(html, r.url) };
  } catch {
    return { verdict: 'dead', img: '', icon: '' };
  }
}

// Site icons only mean something on a site that is the thing itself (an app, or an official game site);
// on port hosts they are the engine's or host's logo.
const ownSite = new Set(EXTRA_GAMES.map(g => g.play));

// Removes dead links in place, marks 'tab' ones, sets img, returns the items still worth showing.
async function check(label, items, preferIcon) {
  const queue = items.filter(g => g.play);
  const dead = [];
  await Promise.all(Array.from({ length: 24 }, async () => {
    for (let g; (g = queue.shift());) {
      const { verdict, img, icon } = SOFT_DEAD.test(g.play) ? { verdict: 'dead' } : await probe(g.play);
      if (verdict === 'dead') { dead.push(`${g.name}  ${g.play}`); g.play = ''; continue; }
      if (verdict === 'tab') g.tab = true;
      const pic = preferIcon ? icon || img : img || (ownSite.has(g.play) ? icon : '');
      if (pic) g.img = pic;
    }
  }));
  const probed = items.filter(g => g.play).length + dead.length;
  // A network outage would look like everything died; keep the old catalog instead.
  if (dead.length > probed / 2) throw new Error(`${label}: ${dead.length}/${probed} links dead, refusing to write`);
  console.log(`${label}: ${dead.length} dead of ${probed}`);
  if (process.env.VERBOSE) dead.forEach(d => console.log('  dead', d));
  return items.filter(g => g.play || g.repo).map(g => ({ ...g }));
}

async function getJSON(url) {
  const r = await fetch(url, { headers: { 'user-agent': BOT }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// Steam store art, only for an exact name match. Prefers the portrait cover, which crops well to a square.
async function steamArt(q) {
  const j = await getJSON(`https://store.steampowered.com/api/storesearch/?term=${encodeURIComponent(q)}&l=english&cc=US`);
  const hit = (j.items || []).find(i => keyOf(i.name) === keyOf(q));
  if (!hit) return '';
  const base = `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${hit.id}/`;
  const tall = await fetch(base + 'library_600x900.jpg', { method: 'HEAD', signal: AbortSignal.timeout(15000) }).then(r => r.ok, () => false);
  return base + (tall ? 'library_600x900.jpg' : 'header.jpg');
}

// Wikipedia cover art, only from an article about a game whose title matches the name.
async function wikiArt(q) {
  const j = await getJSON('https://en.wikipedia.org/w/api.php?action=query&format=json&generator=search&gsrlimit=5'
    + `&gsrsearch=${encodeURIComponent(q + ' video game')}&prop=pageimages|description&piprop=thumbnail&pithumbsize=400&pilicense=any&redirects=1`);
  const pages = Object.values((j.query && j.query.pages) || {}).sort((a, b) => a.index - b.index);
  const hit = pages.find(p => p.thumbnail && /game/i.test(p.description || '') && keyOf(clean(p.title)) === keyOf(q));
  return hit ? hit.thumbnail.source : '';
}

// "Bendy and The Ink Machine (3)" -> "Bendy and The Ink Machine", "Pizza Tower 1.1.0" -> "Pizza Tower"
const clean = name => name.replace(/\s*[([].*?[)\]]/g, '').replace(/\s+v?\d+(\.\d+)+$/i, '').trim();

async function addArt(games) {
  // One preview image shared by several games is the host's banner, not the game's.
  const uses = {};
  for (const g of games) if (g.img) uses[g.img] = (uses[g.img] || 0) + 1;
  for (const g of games) if (uses[g.img] >= 3) delete g.img;

  const queue = games.filter(g => !g.img);
  let failed = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    for (let g; (g = queue.shift());) {
      if (!(g.id in art)) {
        const q = clean(g.name);
        try { art[g.id] = q ? (await steamArt(q)) || (await wikiArt(q)) : ''; }
        catch { failed++; continue; } // not cached, so the next run tries again
      }
      if (art[g.id]) g.img = art[g.id];
    }
  }));
  const sorted = Object.fromEntries(Object.entries(art).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(ART_FILE, JSON.stringify(sorted, null, 1));
  console.log(`art: ${games.filter(g => g.img).length}/${games.length} games have art, ${failed} lookups failed`);
}

(async () => {
  const lists = await Promise.all(SOURCES.map(async s => {
    const r = await fetch(s.url);
    if (!r.ok) throw new Error(`${s.name}: HTTP ${r.status}`);
    return s.parse(await r.text());
  }));
  const catalog = {
    time: Date.now(),
    games: await check('games', merge([...lists, EXTRA_GAMES])),
    apps: await check('apps', APPS.map(a => ({ ...a })), true),
    movies: await check('movies', MOVIES.map(m => ({ ...m })), true),
  };
  await addArt(catalog.games);
  fs.writeFileSync(__dirname + '/catalog.json', JSON.stringify(catalog));
  const playable = catalog.games.filter(g => g.play).length;
  console.log(`wrote catalog.json: ${catalog.games.length} games (${playable} playable), ${catalog.apps.length} apps, ${catalog.movies.length} movies`);
})().catch(e => { console.error(e.message); process.exitCode = 1; });
