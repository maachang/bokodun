// マカヒキ島: 木の橋（plank_bridge）は、渡れる橋か、海へ伸びる桟橋だけ。渡った先のない、中途半端な橋を作らない。
// 橋の 1 かたまり（4 方向でつながった橋のマス）は、「歩ける陸に接する端が 2 つ以上（両岸）」か、「海（sea）に接する（桟橋）」のどちらか。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
const mapFormatTmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mapformat-')), 'mapFormat.mjs');
fs.copyFileSync(path.join(root, 'public/js/mapFormat.js'), mapFormatTmp);
const { normalizeMap } = await import(mapFormatTmp);
const readJson = (f) => normalizeMap(JSON.parse(fs.readFileSync(path.join(root, f), 'utf-8')));
const MESH = 64;
const ISLAND = { j: [11, 13], i: [1, 3] };   // マカヒキ島のメッシュ（0 始まりの行・列）

const names = new Map();   // "x,y"（世界のマス）→ 物体の名前
for (let j = ISLAND.j[0] - 1; j <= ISLAND.j[1] + 1; j++) for (let i = ISLAND.i[0] - 1; i <= ISLAND.i[1] + 1; i++) {
    const f = `public/data/maps/w_${String(j).padStart(2, '0')}_${String(i).padStart(2, '0')}.json`;
    if (!fs.existsSync(path.join(root, f))) continue;
    const m = readJson(f);
    m.layout.forEach((row, r) => [...row].forEach((ch, c) => names.set(`${i * MESH + c},${j * MESH + r}`, m.legend[ch] ?? '0')));
}
const nameAt = (x, y) => names.get(`${x},${y}`) ?? 'sea';
const isWater = (n) => n === 'sea' || n === 'water' || n === 'water_shallow';
const isBridge = (n) => n === 'plank_bridge';

test('島の木の橋: どのかたまりも、両端が陸に着く（海へ伸びる桟橋は、先が海）。川の水の中で終わる橋がない', () => {
    const tiles = [...names].filter(([, n]) => isBridge(n)).map(([k]) => k);
    assert.ok(tiles.length > 0, '島に橋がある（K → K1 の道の橋・K1 の桟橋）');
    const nbrs = (k) => { const [x, y] = k.split(',').map(Number); return [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => `${x + dx},${y + dy}`); };
    const bfs = (from, set) => {   // 橋のかたまりの中で、from から最も遠いマスと、距離
        const dist = new Map([[from, 0]]), q = [from]; let last = from;
        while (q.length) { const u = q.shift(); last = u; for (const v of nbrs(u)) if (set.has(v) && !dist.has(v)) { dist.set(v, dist.get(u) + 1); q.push(v); } }
        return last;
    };
    const seen = new Set(), bad = [];
    for (const start of tiles) {
        if (seen.has(start)) continue;
        const comp = new Set([start]), stack = [start]; seen.add(start);
        while (stack.length) for (const v of nbrs(stack.pop())) if (!seen.has(v) && isBridge(names.get(v))) { seen.add(v); comp.add(v); stack.push(v); }
        const a = bfs(start, comp), b = bfs(a, comp);   // かたまりの両端（最も遠い 2 マス）
        for (const end of comp.size === 1 ? [a] : [a, b]) {
            const around = nbrs(end).filter(k => !comp.has(k)).map(k => nameAt(...k.split(',').map(Number)));
            const onLand = around.some(n => !isWater(n)), onSea = around.includes('sea');
            if (!(onLand || onSea)) bad.push(`端 ${end}（周り: ${around.join(',')}）`);
        }
    }
    assert.deepEqual(bad, [], `川の水の中で終わる橋: ${bad.join(' / ')}`);
});
