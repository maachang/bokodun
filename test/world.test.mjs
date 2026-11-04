import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
const readJson = (f) => JSON.parse(fs.readFileSync(path.join(root, f), 'utf-8'));
async function loadWorldMod() {
    // ブラウザ用の ES モジュール（.js）を、.mjs にコピーして読み込む
    const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'world-')), 'world.mjs');
    fs.copyFileSync(path.join(root, 'public/js/world.js'), tmp);
    return import(tmp);
}
const world = readJson('public/data/world.json');
const objects = readJson('public/data/objects.json');

test('世界の並び: 外のマップはすべて 64×64 で、同じマップが 2 か所にない。端が隣へ続く側は、端が通れる', () => {
    const ids = world.grid.flat().filter(Boolean);
    assert.equal(new Set(ids).size, ids.length, '同じマップが、配列に 2 回ある');
    for (const id of ids) {
        const m = readJson(`public/data/maps/${id}.json`);
        assert.equal(m.layout.length, world.mapSize, `${id}: 行数`);
        for (const row of m.layout) assert.equal(row.length, world.mapSize, `${id}: 列数`);
        assert.ok(m.environment?.floorType, `${id}: 地面の種類（隣のマップが、端の外の地面に使う）`);
        // 隣がある方向の端は、壁や木でふさがない
        const solidAt = (r, c) => { const d = objects[m.legend[m.layout[r][c]]]; return !!d && d.solid; };
        const N = world.mapSize;
        let row = -1, col = -1;
        world.grid.forEach((rw, r) => { if (rw.includes(id)) { row = r; col = rw.indexOf(id); } });
        const has = (dr, dc) => !!world.grid[row + dr]?.[col + dc];
        for (let i = 1; i < N - 1; i++) {   // 四隅は、ほかの 2 辺の壁と重なるので除く
            if (has(-1, 0)) assert.ok(!solidAt(0, i), `${id}: 北の端 ${i}`);
            if (has(1, 0)) assert.ok(!solidAt(N - 1, i), `${id}: 南の端 ${i}`);
            if (has(0, -1)) assert.ok(!solidAt(i, 0), `${id}: 西の端 ${i}`);
            if (has(0, 1)) assert.ok(!solidAt(i, N - 1), `${id}: 東の端 ${i}`);
        }
        // スポーンから、反対の端（隣へ続く側）まで歩いて行ける
        const pass = (r, c) => { const d = objects[m.legend[m.layout[r][c]]]; return m.layout[r][c] === '0' || !d || !d.solid; };
        const enemyCh = new Set(Object.keys(m.enemies || {}));
        const ok = (r, c) => r >= 0 && c >= 0 && r < N && c < N && (enemyCh.has(m.layout[r][c]) || pass(r, c));
        const start = [Math.floor(m.spawn.z), Math.floor(m.spawn.x)];
        const seen = new Set([start.join()]), q = [start];
        while (q.length) {
            const [r, c] = q.shift();
            for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nr = r + dr, nc = c + dc;
                if (!ok(nr, nc) || seen.has(`${nr},${nc}`)) continue;
                seen.add(`${nr},${nc}`); q.push([nr, nc]);
            }
        }
        for (let i = 1; i < N - 1; i++) {
            if (has(0, 1)) assert.ok(seen.has(`${i},${N - 1}`) || !ok(i, N - 1), `${id}: 東の端へ行けない ${i}`);
            if (has(0, -1)) assert.ok(seen.has(`${i},0`) || !ok(i, 0), `${id}: 西の端へ行けない ${i}`);
        }
    }
});

test('世界の並び: 隣のマップは配列の位置で決まり、端を越えると反対側の同じ位置に出る。配列の外側の端は、越えられない', async () => {
    const W = await loadWorldMod();
    const w = { mapSize: 64, grid: [['a', 'b'], ['c', null]] };
    assert.equal(W.worldNeighbor(w, 'a', 'east'), 'b');
    assert.equal(W.worldNeighbor(w, 'a', 'south'), 'c');
    assert.equal(W.worldNeighbor(w, 'a', 'west'), null);
    assert.equal(W.worldNeighbor(w, 'a', 'north'), null);
    assert.equal(W.worldNeighbor(w, 'b', 'south'), null, '空きの隣は、なし');
    assert.equal(W.worldNeighbor(w, 'zzz', 'east'), null, '世界の外のマップ');
    const size = 256;
    // 東の端を越える: b の西の端、同じ z
    assert.deepEqual(W.edgeCrossing(w, 'a', size + 1, 100, size, size), { dir: 'east', mapId: 'b', x: 1, z: 100 });
    // 南の端を越える: c の北の端、同じ x
    assert.deepEqual(W.edgeCrossing(w, 'a', 50, size + 2, size, size), { dir: 'south', mapId: 'c', x: 50, z: 2 });
    // 中にいる間は、何も起きない
    assert.equal(W.edgeCrossing(w, 'a', 10, 10, size, size), null);
    // 隣がない端は、越えようとしても、移動先がない（mapId が null）。位置も、マップの中に収められる
    assert.equal(W.edgeCrossing(w, 'a', -1, 100, size, size).mapId, null);
    assert.deepEqual(W.clampToWorld(w, 'a', -5, 100, size, size, 0.4), { x: 0.4, z: 100 });
    assert.deepEqual(W.clampToWorld(w, 'a', size + 5, 100, size, size, 0.4), { x: size + 5, z: 100 }, '隣がある端は、そのまま');
    assert.deepEqual(W.clampToWorld(w, 'a', 100, -9, size, size, 0.4), { x: 100, z: 0.4 });
});
