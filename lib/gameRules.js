/**
 * ゲームの式（public/js/game/rules.js）と、定義（public/data/*.json）を、サーバー側で使うための読み込み (lib/gameRules.js)
 * rules.js は、ブラウザと同じ ESM なので、動的 import で読む（lib は素の CommonJS）。サーバーでも、クライアントと同じ式で、検証する。
 */
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

let cache = null;

/** { R: rules.js のモジュール, defs: { combat, table, jobs, races, maxLevel } } */
async function load() {
    if (cache) return cache;
    const dataDir = path.join(process.cwd(), 'public', 'data');
    const read = (f) => JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8'));
    const R = await import(pathToFileURL(path.join(process.cwd(), 'public', 'js', 'game', 'rules.js')).href);
    const jobs = read('jobs.json');
    cache = { R, defs: { combat: read('combat.json'), table: read('damageTable.json').table, jobs: jobs.jobs, races: read('races.json').races, maxLevel: jobs.maxLevel } };
    return cache;
}

module.exports = { load };
