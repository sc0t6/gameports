// Builds catalog.json: fetches both game lists, checks every link, drops dead ones
// and flags sites that refuse to load inside the player.
// Run: node build.js   (GitHub Actions runs it daily, see .github/workflows/update.yml)
const fs = require('fs');
const vm = require('vm');

const { SOURCES, EXTRA_GAMES, APPS, MOVIES, SOFT_DEAD, merge, classify, ogImage } = vm.runInNewContext(
  fs.readFileSync(__dirname + '/data.js', 'utf8') + '\n;({ SOURCES, EXTRA_GAMES, APPS, MOVIES, SOFT_DEAD, merge, classify, ogImage })', { URL });

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

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

// -> { verdict: 'dead' | 'tab' | 'ok', img: cover art URL or '' }
async function probe(url) {
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(20000) });
    const verdict = classify(r.status, Object.fromEntries(r.headers));
    let html = '';
    if (verdict !== 'dead' && /html/i.test(r.headers.get('content-type') || '')) html = await head(r);
    else r.body?.cancel().catch(() => {});
    return { verdict, img: ogImage(html, r.url) };
  } catch {
    return { verdict: 'dead', img: '' };
  }
}

// Removes dead links in place, marks 'tab' ones, returns the items still worth showing.
async function check(label, items) {
  const queue = items.filter(g => g.play);
  const dead = [];
  await Promise.all(Array.from({ length: 24 }, async () => {
    for (let g; (g = queue.shift());) {
      const { verdict, img } = SOFT_DEAD.test(g.play) ? { verdict: 'dead' } : await probe(g.play);
      if (verdict === 'dead') { dead.push(`${g.name}  ${g.play}`); g.play = ''; }
      if (verdict === 'tab') g.tab = true;
      if (img) g.img = img;
    }
  }));
  const probed = items.filter(g => g.play).length + dead.length;
  // A network outage would look like everything died; keep the old catalog instead.
  if (dead.length > probed / 2) throw new Error(`${label}: ${dead.length}/${probed} links dead, refusing to write`);
  console.log(`${label}: ${dead.length} dead of ${probed}`);
  if (process.env.VERBOSE) dead.forEach(d => console.log('  dead', d));
  return items.filter(g => g.play || g.repo).map(g => ({ ...g }));
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
    apps: await check('apps', APPS.map(a => ({ ...a }))),
    movies: await check('movies', MOVIES.map(m => ({ ...m }))),
  };
  fs.writeFileSync(__dirname + '/catalog.json', JSON.stringify(catalog));
  const playable = catalog.games.filter(g => g.play).length;
  console.log(`wrote catalog.json: ${catalog.games.length} games (${playable} playable), ${catalog.apps.length} apps, ${catalog.movies.length} movies`);
})().catch(e => { console.error(e.message); process.exitCode = 1; });
