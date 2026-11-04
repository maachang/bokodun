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
        // 川（深い水）は、端を横切ってよい。ただし、隣のマップの反対側の端も、同じ位置が深い水（川がつながる）
        const deepAt = (mm, r, c) => { const d = objects[mm.legend[mm.layout[r][c]]]; return d?.type === 'liquid_tile' && d.solid; };
        const nb = (dr, dc) => readJson(`public/data/maps/${world.grid[row + dr][col + dc]}.json`);
        const edgeOk = (r, c, dr, dc, nr, nc) => !solidAt(r, c) || (deepAt(m, r, c) && deepAt(nb(dr, dc), nr, nc));
        for (let i = 1; i < N - 1; i++) {   // 四隅は、ほかの 2 辺の壁と重なるので除く
            if (has(-1, 0)) assert.ok(edgeOk(0, i, -1, 0, N - 1, i), `${id}: 北の端 ${i}`);
            if (has(1, 0)) assert.ok(edgeOk(N - 1, i, 1, 0, 0, i), `${id}: 南の端 ${i}`);
            if (has(0, -1)) assert.ok(edgeOk(i, 0, 0, -1, i, N - 1), `${id}: 西の端 ${i}`);
            if (has(0, 1)) assert.ok(edgeOk(i, N - 1, 0, 1, i, 0), `${id}: 東の端 ${i}`);
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

// 川と橋（草原・高原・山道・南国）: 深い水は通れず、橋は、スポーンから歩いて渡れる
for (const id of ['field_grass', 'field_plateau', 'field_mountain', 'field_lake', 'field_riverside']) {
    test(`${id}: 川（深い水）があり、橋がかかり、スポーンから橋まで歩いて行ける`, () => {
        const m = readJson(`public/data/maps/${id}.json`);
        const lay = m.layout;
        const defOf = (r, c) => objects[m.legend[lay[r][c]]];
        const deep = [], bridge = [];
        for (let r = 0; r < lay.length; r++) for (let c = 0; c < lay[0].length; c++) {
            const d = defOf(r, c);
            if (d?.type === 'liquid_tile' && d.solid) deep.push([r, c]);
            if (d?.texture === 'woodBridge') bridge.push([r, c]);
        }
        assert.ok(deep.length >= 40, `${id}: 川と池の深い水`);
        assert.ok(bridge.length >= 8, `${id}: 橋`);
        const passable = (r, c) => {
            if (lay[r][c] === '0') return true;
            const d = defOf(r, c);
            return !!d && !d.solid && d.type !== 'furniture';
        };
        const seen = new Set([`${m.spawn.z},${m.spawn.x}`]);
        const q = [[m.spawn.z, m.spawn.x]];
        while (q.length) {
            const [r, c] = q.shift();
            for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nr = r + dr, nc = c + dc;
                if (nr < 0 || nc < 0 || nr >= lay.length || nc >= lay[0].length) continue;
                if (seen.has(`${nr},${nc}`) || !passable(nr, nc)) continue;
                seen.add(`${nr},${nc}`); q.push([nr, nc]);
            }
        }
        assert.ok(bridge.every(([r, c]) => seen.has(`${r},${c}`)), `${id}: すべての橋に歩いて行ける`);
    });
}

// 起伏（高さの段 heights）: 山道・砂漠・極寒
const levelOf = (ch) => parseInt(ch, 36);
for (const id of ['field_mountain', 'field_desert', 'field_snow', 'field_grass', 'field_forest', 'field_lake', 'field_tropical', 'field_coast', 'field_tundra', 'field_plateau', 'field_peak', 'field_arid', 'field_volcano', 'field_riverside']) {
    test(`${id}: 高さの表は 64×64。隣へ続く端は、高さ 0（隣とずれない）`, () => {
        const m = readJson(`public/data/maps/${id}.json`);
        assert.equal(m.heights.length, 64);
        for (const row of m.heights) assert.match(row, /^[0-9a-z]{64}$/);
        assert.ok(m.heightStep > 0, `${id}: 段の高さ`);
        assert.ok(m.heights.join('').split('').some(ch => ch !== '0'), `${id}: 起伏がある`);
        let row = -1, col = -1;
        world.grid.forEach((rw, r) => { if (rw.includes(id)) { row = r; col = rw.indexOf(id); } });
        const has = (dr, dc) => !!world.grid[row + dr]?.[col + dc];
        for (let i = 0; i < 64; i++) {
            if (has(-1, 0)) assert.equal(levelOf(m.heights[0][i]), 0, `${id}: 北の端 ${i}`);
            if (has(1, 0)) assert.equal(levelOf(m.heights[63][i]), 0, `${id}: 南の端 ${i}`);
            if (has(0, -1)) assert.equal(levelOf(m.heights[i][0]), 0, `${id}: 西の端 ${i}`);
            if (has(0, 1)) assert.equal(levelOf(m.heights[i][63]), 0, `${id}: 東の端 ${i}`);
        }
    });
}

test('なだらかな地域（山道以外のすべて）: 隣り合うマスの段差は 1 まで', () => {
    for (const id of ['field_desert', 'field_snow', 'field_grass', 'field_forest', 'field_lake', 'field_tropical', 'field_coast', 'field_tundra', 'field_plateau', 'field_peak', 'field_arid', 'field_volcano', 'field_riverside']) {
        const h = readJson(`public/data/maps/${id}.json`).heights;
        for (let r = 0; r < 64; r++) for (let c = 0; c < 64; c++) {
            if (c < 63) assert.ok(Math.abs(levelOf(h[r][c]) - levelOf(h[r][c + 1])) <= 1, `${id}: ${r},${c}`);
            if (r < 63) assert.ok(Math.abs(levelOf(h[r][c]) - levelOf(h[r + 1][c])) <= 1, `${id}: ${r},${c}`);
        }
    }
});

test('山道: スポーンから、段差 1 までの道をたどって、すべての橋と、東の端・南の端へ行ける（崖を通らずに）', () => {
    const m = readJson('public/data/maps/field_mountain.json');
    const lay = m.layout;
    const defOf = (r, c) => objects[m.legend[lay[r][c]]];
    const enemyCh = new Set(Object.keys(m.enemies || {}));
    const pass = (r, c) => { if (lay[r][c] === '0' || enemyCh.has(lay[r][c])) return true; const d = defOf(r, c); return !!d && !d.solid && d.type !== 'furniture'; };
    const lv = (r, c) => levelOf(m.heights[r][c]);
    const seen = new Set([`${m.spawn.z},${m.spawn.x}`]);
    const q = [[m.spawn.z, m.spawn.x]];
    while (q.length) {
        const [r, c] = q.shift();
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nr = r + dr, nc = c + dc;
            if (nr < 0 || nc < 0 || nr >= 64 || nc >= 64 || seen.has(`${nr},${nc}`) || !pass(nr, nc)) continue;
            if (Math.abs(lv(nr, nc) - lv(r, c)) > 1) continue;
            seen.add(`${nr},${nc}`); q.push([nr, nc]);
        }
    }
    const bridges = [];
    for (let r = 0; r < 64; r++) for (let c = 0; c < 64; c++) if (defOf(r, c)?.texture === 'woodBridge') bridges.push([r, c]);
    assert.ok(bridges.length > 0 && bridges.every(([r, c]) => seen.has(`${r},${c}`)), 'すべての橋に歩いて行ける');
    assert.ok([...seen].some(k => k.endsWith(',63')), '東の端（岩山の頂へ）に着く');
    assert.ok([...seen].some(k => k.startsWith('63,')), '南の端（湖畔へ）に着く');
    // 崖（段差 2 以上）が、実際にある
    let cliffs = 0;
    for (let r = 0; r < 63; r++) for (let c = 0; c < 63; c++) {
        if (Math.abs(lv(r, c) - lv(r, c + 1)) >= 2 || Math.abs(lv(r, c) - lv(r + 1, c)) >= 2) cliffs++;
    }
    assert.ok(cliffs >= 30, `崖のマス: ${cliffs}`);
});

// 落ちても詰まない: 段差 1 までの道でつながらない、小さな窪み（落ちたら上れない穴）が、ない
for (const id of ['field_mountain', 'field_desert', 'field_snow', 'field_grass', 'field_forest', 'field_lake', 'field_tropical', 'field_coast', 'field_tundra', 'field_plateau', 'field_peak', 'field_arid', 'field_volcano', 'field_riverside']) {
    test(`${id}: 歩けるマスは、段差 1 までの道で、すべて 1 つにつながる（崖から落ちても、歩いて戻れる）`, () => {
        const m = readJson(`public/data/maps/${id}.json`);
        const lay = m.layout;
        const enemyCh = new Set(Object.keys(m.enemies || {}));
        const pass = (r, c) => { if (lay[r][c] === '0' || enemyCh.has(lay[r][c])) return true; const d = objects[m.legend[lay[r][c]]]; return !d || (!d.solid && d.type !== 'furniture' && !d.damagePerSec); };   // 溶岩などのダメージ床は、歩く道に数えない
        const lv = (r, c) => parseInt(m.heights[r][c], 36);
        const seen = new Set();
        const sizes = [];
        for (let r = 0; r < 64; r++) for (let c = 0; c < 64; c++) {
            if (seen.has(`${r},${c}`) || !pass(r, c)) continue;
            const q = [[r, c]]; seen.add(`${r},${c}`); let n = 0;
            while (q.length) {
                const [a, b] = q.pop(); n++;
                for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                    const x = a + dr, y = b + dc;
                    if (x < 0 || y < 0 || x >= 64 || y >= 64 || seen.has(`${x},${y}`) || !pass(x, y)) continue;
                    if (Math.abs(lv(x, y) - lv(a, b)) > 1) continue;
                    seen.add(`${x},${y}`); q.push([x, y]);
                }
            }
            sizes.push(n);
        }
        assert.deepEqual(sizes.length, 1, `${id}: 分かれた領域の大きさ ${sizes.sort((a, b) => b - a).slice(0, 6)}`);
    });
}
