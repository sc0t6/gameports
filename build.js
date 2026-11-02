// Builds catalog.json: fetches both game lists, checks every link, drops dead ones
// and flags sites that refuse to load inside the player.
// Run: node build.js   (GitHub Actions runs it daily, see .github/workflows/update.yml)
const fs = require('fs');
const vm = require('vm');

const { SOURCES, EXTRA_GAMES, APPS, MOVIES, SOFT_DEAD, merge, classify } = vm.runInNewContext(
  fs.readFileSync(__dirname + '/data.js', 'utf8') + '\n;({ SOURCES, EXTRA_GAMES, APPS, MOVIES, SOFT_DEAD, merge, classify })', {});

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

async function probe(url) {
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(20000) });
    r.body?.cancel().catch(() => {});
    return classify(r.status, Object.fromEntries(r.headers));
  } catch {
    return 'dead';
  }
}

// Removes dead links in place, marks 'tab' ones, returns the items still worth showing.
async function check(label, items) {
  const queue = items.filter(g => g.play);
  const dead = [];
  await Promise.all(Array.from({ length: 24 }, async () => {
    for (let g; (g = queue.shift());) {
      const v = SOFT_DEAD.test(g.play) ? 'dead' : await probe(g.play);
      if (v === 'dead') { dead.push(`${g.name}  ${g.play}`); g.play = ''; }
      if (v === 'tab') g.tab = true;
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
