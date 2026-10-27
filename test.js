// Run: node test.js
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const ctx = {};
vm.runInNewContext(fs.readFileSync(__dirname + '/data.js', 'utf8'), ctx);
// vm objects come from another realm; JSON makes them comparable.
const plain = x => JSON.parse(JSON.stringify(x));
const { parseGenizy, parseCatalog, merge, diff, ghParts } = ctx;

const genizy = parseGenizy(`
## Full Game List + Credits
- [Cuphead](https://github.com/web-ports/cuphead/) - Ported by [me](https://github.com/genizy)
- [OMORI](https://github.com/genizy/web-port/tree/main/omori-web-port) - Ported by [me](https://github.com/genizy)
<!--
- [Hidden](https://github.com/x/y)
-->
## Credits:
- [98Corbins](https://98cornbin.netlify.app)
`);
assert.deepStrictEqual(plain(genizy.map(g => g.name)), ['Cuphead', 'OMORI']);

const catalog = parseCatalog(`
| Icon | Meaning |
| :---: | --- |
| ▶ | Opens a playable build |
| Game | Play | Source |
| --- | --- | --- |
| ⭐ OMORI | [▶ site](https://play.example/omori) | [📦 a/b](https://github.com/a/b) |
| Alice | [▶ https://x.github.io/](https://github.com/x/alice) |  |
| Bad | [▶ x](javascript:alert(1)) |  |
`);
assert.deepStrictEqual(plain(catalog.map(g => [g.name, g.play, g.repo])), [
  ['OMORI', 'https://play.example/omori', 'https://github.com/a/b'],
  ['Alice', '', 'https://github.com/x/alice'],
]);

const games = merge([genizy, catalog]);
assert.strictEqual(games.length, 3);
const omori = games.find(g => g.id === 'omori');
assert.strictEqual(omori.play, 'https://play.example/omori');
assert.strictEqual(omori.repo, 'https://github.com/genizy/web-port/tree/main/omori-web-port');

const added = diff({ games: games.slice(0, 2), added: {} }, games, 5);
assert.deepStrictEqual(plain(Object.values(added)), [5]);
assert.deepStrictEqual(plain(diff(null, games, 5)), {});

assert.deepStrictEqual(plain(ghParts('https://github.com/genizy/web-port/tree/main/omori-web-port')),
  { owner: 'genizy', repo: 'web-port', branch: 'main', path: 'omori-web-port' });
assert.deepStrictEqual(plain(ghParts('https://github.com/web-ports/cuphead/')),
  { owner: 'web-ports', repo: 'cuphead', branch: '', path: '' });
assert.strictEqual(ghParts('https://gitlab.com/a/b'), null);

// Optional: parse the live READMEs if they were downloaded next to this file.
for (const [file, parse] of [['genizy.md', parseGenizy], ['carter.md', parseCatalog]]) {
  if (fs.existsSync(file)) console.log(file, parse(fs.readFileSync(file, 'utf8')).length, 'entries');
}
console.log('ok');
