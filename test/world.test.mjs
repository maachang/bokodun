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
for (const id of ['field_mountain', 'field_desert', 'field_snow', 'field_grass', 'field_forest', 'field_lake', 'field_tropical', 'field_coast', 'field_tundra', 'field_plateau', 'field_peak', 'field_arid', 'field_volcano', 'field_riverside', 'field_swamp']) {
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

test('なだらかな地域（崖のある 山道・高原・岩山の頂・乾燥地帯 以外）: 隣り合うマスの段差は 1 まで', () => {
    for (const id of ['field_desert', 'field_snow', 'field_grass', 'field_forest', 'field_lake', 'field_tropical', 'field_coast', 'field_tundra', 'field_volcano', 'field_riverside', 'field_swamp']) {
        const md = readJson(`public/data/maps/${id}.json`), h = md.heights, gb = md.gimmickBoxes || [];
        for (let r = 0; r < 64; r++) for (let c = 0; c < 64; c++) {
            if (gb.some(b => r >= b.r0 && r <= b.r1 && c >= b.c0 && c <= b.c1)) continue;   // ピラミッドや塔の段の壁（3 段分）は、わざと登れない（gimmickBoxes）
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
for (const id of ['field_mountain', 'field_desert', 'field_snow', 'field_grass', 'field_forest', 'field_lake', 'field_tropical', 'field_coast', 'field_tundra', 'field_plateau', 'field_peak', 'field_arid', 'field_volcano', 'field_riverside', 'field_swamp']) {
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

test('高原・岩山の頂・乾燥地帯・山道: 崖（段差 2 以上）がある。ただし、上り口（坂）もあって、全体はつながっている', () => {
    for (const id of ['field_plateau', 'field_peak', 'field_arid', 'field_mountain']) {
        const h = readJson(`public/data/maps/${id}.json`).heights;
        let cliffs = 0;
        for (let r = 0; r < 63; r++) for (let c = 0; c < 63; c++) {
            if (Math.abs(levelOf(h[r][c]) - levelOf(h[r][c + 1])) >= 2 || Math.abs(levelOf(h[r][c]) - levelOf(h[r + 1][c])) >= 2) cliffs++;
        }
        assert.ok(cliffs >= 25, `${id}: 崖のマス ${cliffs}`);
    }
});

test('湿地帯（field_swamp）: 広い毒沼があり、板道が毒沼の上にかかり、毒沼を踏まずに歩いて回れる。毒は、継続ダメージ', () => {
    const m = readJson('public/data/maps/field_swamp.json');
    const poisonCh = Object.entries(m.legend).filter(([, v]) => v === 'poison_swamp').map(([k]) => k);
    const plankCh = Object.entries(m.legend).filter(([, v]) => v === 'wood_bridge').map(([k]) => k);
    const count = (chs) => m.layout.join('').split('').filter(ch => chs.includes(ch)).length;
    assert.ok(count(poisonCh) >= 400, `毒沼のマス: ${count(poisonCh)}`);
    assert.ok(count(plankCh) >= 20, `板道のマス: ${count(plankCh)}`);
    assert.ok(objects.poison_swamp.damagePerSec > 0 && objects.poison_swamp.hazardType === 'poison');
    // 毒沼は、高さ 0（沼の底）。小島（高まり）は、1 段以上ある
    const lv = (r, c) => parseInt(m.heights[r][c], 36);
    let maxLv = 0;
    for (let r = 0; r < 64; r++) for (let c = 0; c < 64; c++) {
        if (poisonCh.includes(m.layout[r][c])) assert.equal(lv(r, c), 0, `毒沼は高さ 0: ${r},${c}`);
        maxLv = Math.max(maxLv, lv(r, c));
    }
    assert.ok(maxLv >= 3, `小島の高まり: ${maxLv}`);
});

test('どや街（city_slum）: 高低差・毒の沼・うろつく大ねずみ・立ちんぼの女性。歩けるマスは、段差 1 までの道で、すべて、スポーンからつながり、扉・ゲートにも行ける', () => {
    const m = readJson('public/data/maps/city_slum.json');
    const enemies = readJson('public/data/enemies.json');
    const lay = m.layout;
    const R = lay.length, C = lay[0].length;
    const lv = (r, c) => parseInt(m.heights[r][c], 36);
    assert.equal(m.heights.length, R);
    assert.ok(m.heights.every(row => row.length === C), '高さの表の大きさ');
    assert.ok(m.heights.join('').split('').some(ch => ch >= '2'), '高低差がある');
    const poison = Object.entries(m.legend).filter(([, v]) => v === 'poison_swamp').map(([k]) => k);
    assert.ok(lay.join('').split('').filter(ch => poison.includes(ch)).length >= 30, '毒の沼');
    // 毒の沼・橋は高さ 0
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) if (poison.includes(lay[r][c])) assert.equal(lv(r, c), 0, `毒の沼は高さ 0: ${r},${c}`);
    // 大ねずみは、住民のようにうろつく（roam）。攻撃されたときだけ追う
    assert.equal(enemies.giant_rat.territory.mode, 'roam');
    const ratCh = Object.entries(m.enemies).filter(([, v]) => v === 'giant_rat').map(([k]) => k);
    assert.ok(lay.join('').split('').filter(ch => ratCh.includes(ch)).length >= 5, '大ねずみが、複数いる');
    assert.ok(m.npcs.filter(n => n.id === 'street_woman').length >= 4, '立ちんぼの女性');
    // 歩ける道
    const enemyCh = new Set(Object.keys(m.enemies));
    const pass = (r, c) => { if (lay[r][c] === '0' || enemyCh.has(lay[r][c])) return true; const d = objects[m.legend[lay[r][c]]]; return !d || (!d.solid && d.type !== 'furniture' && !d.damagePerSec); };
    const seen = new Set([`${m.spawn.z},${m.spawn.x}`]);
    const q = [[m.spawn.z, m.spawn.x]];
    while (q.length) {
        const [r, c] = q.shift();
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nr = r + dr, nc = c + dc;
            if (nr < 0 || nc < 0 || nr >= R || nc >= C || seen.has(`${nr},${nc}`) || !pass(nr, nc)) continue;
            if (Math.abs(lv(nr, nc) - lv(r, c)) > 1) continue;
            seen.add(`${nr},${nc}`); q.push([nr, nc]);
        }
    }
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) if (pass(r, c)) assert.ok(seen.has(`${r},${c}`), `歩ける所へ行けない: ${r},${c}`);
    for (const k of Object.keys(m.links)) {
        const [x, z] = k.split(',').map(Number);
        assert.ok(seen.has(`${z},${x}`) || seen.has(`${z + 1},${x}`) || seen.has(`${z - 1},${x}`), `扉・ゲート ${k} へ行ける`);
        assert.equal(lv(z, x), 0, `扉・ゲートは高さ 0: ${k}`);
    }
});

test('全マップ: 住民（NPC）と敵は、毒沼・溶岩などのダメージ床の上に置かれない（置かれると、そこから動けない）', () => {
    const dir = path.join(root, 'public/data/maps');
    for (const f of fs.readdirSync(dir).filter(n => n.endsWith('.json'))) {
        const m = readJson(`public/data/maps/${f}`);
        const hazard = (r, c) => { const d = objects[m.legend?.[m.layout[r]?.[c]]]; return !!d && d.damagePerSec > 0; };
        for (const n of m.npcs || []) assert.ok(!hazard(Math.floor(n.z), Math.floor(n.x)), `${f}: ${n.id} が、ダメージ床の上 (${n.x},${n.z})`);
        const enemyCh = new Set(Object.keys(m.enemies || {}));
        for (let r = 0; r < m.layout.length; r++) for (let c = 0; c < m.layout[0].length; c++) {
            if (enemyCh.has(m.layout[r][c]) && m.legend?.[m.layout[r][c]]) assert.fail(`${f}: 敵の文字 ${m.layout[r][c]} が、飾りの文字と衝突`);
        }
    }
});

// 村・町・街・貴族街の起伏: 高さがついても、歩ける所は、起伏がないときと同じだけ行ける。扉・看板・噴水・橋は高さ 0。建物は平らな土台
for (const id of ['village', 'town', 'city', 'city_noble', 'city_slum', 'castle_courtyard', 'temple_cloister']) {
    test(`${id}: 高低差があっても、歩ける範囲が変わらない。扉・看板・噴水・出入口は高さ 0。屋根つきの建物は、同じ高さの土台`, () => {
        const m = readJson(`public/data/maps/${id}.json`);
        const lay = m.layout, R = lay.length, C = lay[0].length;
        const lv = (r, c) => parseInt(m.heights[r][c], 36);
        assert.equal(m.heights.length, R);
        assert.ok(m.heights.every(row => /^[0-9a-z]+$/.test(row) && row.length === C));
        assert.ok(m.heights.join('').split('').some(ch => ch !== '0'), '起伏がある');
        const enemyCh = new Set(Object.keys(m.enemies || {}));
        const defOf = (r, c) => objects[m.legend[lay[r][c]]];
        const pass = (r, c) => { if (lay[r][c] === '0' || enemyCh.has(lay[r][c])) return true; const d = defOf(r, c); return !d || (!d.solid && d.type !== 'furniture' && !d.damagePerSec); };
        const bfs = (useHeights) => {
            const seen = new Set([`${m.spawn.z},${m.spawn.x}`]);
            const q = [[m.spawn.z, m.spawn.x]];
            while (q.length) {
                const [r, c] = q.shift();
                for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                    const nr = r + dr, nc = c + dc;
                    if (nr < 0 || nc < 0 || nr >= R || nc >= C || seen.has(`${nr},${nc}`) || !pass(nr, nc)) continue;
                    if (useHeights && Math.abs(lv(nr, nc) - lv(r, c)) > 1) continue;
                    seen.add(`${nr},${nc}`); q.push([nr, nc]);
                }
            }
            return seen;
        };
        assert.equal(bfs(true).size, bfs(false).size, `${id}: 起伏で、行けなくなった所がある`);
        for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
            const d = defOf(r, c);
            if (d && !d.lift && ['door', 'signpost', 'fountain', 'portal', 'liquid_tile', 'gateway'].includes(d.type)) assert.equal(lv(r, c), 0, `${id}: ${d.type} は高さ 0 (${r},${c})`);
        }
        for (const k of Object.keys(m.links || {})) { const [x, z] = k.split(',').map(Number); if (defOf(z, x)?.lift) continue; assert.equal(lv(z, x), 0, `${id}: 出入口 ${k} は高さ 0`); }
        // 屋根つきの建物（つながったブロック）は、同じ高さ
        const roofed = (r, c) => { const d = defOf(r, c); return d?.type === 'block' && d.hasRoof; };
        const seen = new Set();
        for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
            if (!roofed(r, c) || seen.has(`${r},${c}`)) continue;
            const st = [[r, c]]; seen.add(`${r},${c}`); const hs = new Set();
            while (st.length) {
                const [a, b] = st.pop(); hs.add(lv(a, b));
                for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                    const x = a + dr, y = b + dc;
                    if (x >= 0 && y >= 0 && x < R && y < C && roofed(x, y) && !seen.has(`${x},${y}`)) { seen.add(`${x},${y}`); st.push([x, y]); }
                }
            }
            assert.equal(hs.size, 1, `${id}: 建物 (${r},${c}) の土台の高さがそろっていない: ${[...hs]}`);
        }
    });
}

test('どや街の襲撃者: ふつうの住民と同じ見た目・セリフで、話しかけると、襲いかかる（ambush）。敵の定義がある', () => {
    const npcs = readJson('public/data/npcs.json');
    const enemies = readJson('public/data/enemies.json');
    const m = readJson('public/data/maps/city_slum.json');
    const amb = Object.entries(npcs).filter(([, d]) => d.ambush);
    assert.ok(amb.length >= 3, '襲撃者の種類');
    for (const [id, d] of amb) {
        assert.ok(enemies[d.ambush.enemy], `${id}: 敵 ${d.ambush.enemy}`);
        assert.ok(d.ambush.line && d.lines.length >= 1, `${id}: セリフ`);
        // 見た目は、ふつうの住民（同じ絵）と同じ
        assert.ok(Object.entries(npcs).some(([k, o]) => !o.ambush && o.texture === d.texture && o.height === d.height), `${id}: ふつうの住民と同じ絵・大きさ`);
    }
    const placed = m.npcs.filter(n => npcs[n.id]?.ambush);
    assert.ok(placed.length >= 3, `どや街の襲撃者: ${placed.length}`);
});

test('猫（NPC）: 村・町・街・貴族街・どや街にいる。寝ている猫は動かず（speed 0・wanderRadius 0）、ほかの猫は歩き回る', () => {
    const npcs = readJson('public/data/npcs.json');
    const sleepers = Object.entries(npcs).filter(([id]) => /cat_sleep$/.test(id));
    const walkers = Object.entries(npcs).filter(([id]) => /^(black_)?cat_walk/.test(id));
    assert.ok(sleepers.length >= 2 && walkers.length >= 4);
    for (const [id, d] of sleepers) assert.ok(d.speed === 0 && d.wanderRadius === 0, `${id}: 寝ている猫は動かない`);
    for (const [id, d] of walkers) assert.ok(d.speed > 0 && d.wanderRadius > 0, `${id}: 歩く猫は動く`);
    for (const [, d] of Object.entries(npcs).filter(([id]) => /cat_/.test(id))) assert.ok(fs.existsSync(path.join(root, 'public', d.texture)), d.texture);
    for (const id of ['village', 'town', 'city', 'city_noble', 'city_slum']) {
        const m = readJson(`public/data/maps/${id}.json`);
        const cats = m.npcs.filter(n => /cat_/.test(n.id));
        assert.ok(cats.filter(n => /sleep/.test(n.id)).length >= 1, `${id}: 寝ている猫`);
        assert.ok(cats.filter(n => /walk/.test(n.id)).length >= 2, `${id}: 歩く猫`);
    }
});

test('ピラミッド: 砂漠に、段のあるピラミッド（1 段ずつ高く、歩いて上れる）と入口の扉。中の墓所は、入口から、すべての宝箱へ歩いて行ける', () => {
    const d = readJson('public/data/maps/field_desert.json');
    const lv = (r, c) => parseInt(d.heights[r][c], 36);
    const pc = Object.entries(d.legend).filter(([, v]) => v === 'pyramid_stone').map(([k]) => k);
    assert.ok(pc.length >= 1);
    const cells = [];
    for (let r = 0; r < 64; r++) for (let c = 0; c < 64; c++) if (pc.includes(d.layout[r][c])) cells.push([r, c]);
    assert.ok(cells.length >= 100, `ピラミッドの石の段: ${cells.length} マス`);
    const top = Math.max(...cells.map(([r, c]) => lv(r, c)));
    assert.ok(top >= 6, `ピラミッドの高さ（段）: ${top}`);
    // 入口の扉（高さ 0）と、扉からの出入口の定義
    const doorCh = Object.entries(d.legend).find(([, v]) => v === 'pyramid_door')[0];
    let door = null;
    for (let r = 0; r < 64; r++) for (let c = 0; c < 64; c++) if (d.layout[r][c] === doorCh) door = [r, c];
    assert.ok(door && lv(door[0], door[1]) >= 10, '入口の扉は、頂上にある');
    assert.ok(objects[d.legend[doorCh]].lift, '頂上の扉は、高さだけ持ち上げる（lift）');
    const link = d.links[`${door[1]},${door[0]}`];
    assert.equal(link.nextMap, 'pyramid');
    // 登る仕掛け: 段の壁（3 段分）は登れず、各段の 1 か所の階段だけで、頂上の扉の前まで行ける。階段は、4 か所（地面→1 段目→2 段目→3 段目→頂上）
    const solidAt = (r, c) => { const o = objects[d.legend[d.layout[r][c]]]; return !!o && o.solid && o.type !== 'floor_tile'; };
    const reach = (stepMax) => {
        const seen = new Set(['34,34']); const q = [[34, 34]];
        while (q.length) {
            const [r, c] = q.shift();
            for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nr = r + dr, nc = c + dc;
                if (nr < 0 || nc < 0 || nr >= 64 || nc >= 64 || seen.has(`${nr},${nc}`) || solidAt(nr, nc)) continue;
                if (lv(nr, nc) - lv(r, c) > stepMax) continue;
                seen.add(`${nr},${nc}`); q.push([nr, nc]);
            }
        }
        return seen;
    };
    assert.ok(reach(1).has(`${door[0] + 1},${door[1]}`), '地面から、階段だけで、頂上の扉の前まで行ける');
    assert.ok(!reach(0).has(`${door[0] + 1},${door[1]}`), '段の壁は、登れない');
    let stairs = 0;
    for (const [r, c] of cells) { const l = lv(r, c); if (l % 3 !== 0) stairs++; }
    assert.equal(stairs, 8, '階段の切り込み（4 か所 × 2 マス）');
    // 中の墓所
    const m = readJson('public/data/maps/pyramid.json');
    assert.equal(m.type, 'indoor');
    const exit = Object.entries(m.links).find(([, v]) => v.nextMap === '$back');
    assert.ok(exit, '出口');
    const enemyCh = new Set(Object.keys(m.enemies));
    const pass = (r, c) => { if (m.layout[r][c] === '0' || enemyCh.has(m.layout[r][c])) return true; const o = objects[m.legend[m.layout[r][c]]]; return !!o && (!o.solid || o.type === 'chest' || o.type === 'door') || (o?.type === 'furniture'); };
    const seen = new Set([`${m.spawn.z},${m.spawn.x}`]);
    const q = [[m.spawn.z, m.spawn.x]];
    while (q.length) {
        const [r, c] = q.shift();
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nr = r + dr, nc = c + dc;
            if (nr < 0 || nc < 0 || nr >= m.layout.length || nc >= m.layout[0].length || seen.has(`${nr},${nc}`) || !pass(nr, nc)) continue;
            seen.add(`${nr},${nc}`); q.push([nr, nc]);
        }
    }
    const chests = [];
    for (let r = 0; r < m.layout.length; r++) for (let c = 0; c < m.layout[0].length; c++) if (m.legend[m.layout[r][c]] === 'treasure_chest') chests.push([r, c]);
    assert.ok(chests.length >= 3);
    assert.ok(chests.every(([r, c]) => seen.has(`${r},${c}`)), 'すべての宝箱に歩いて行ける');
    const [ex, ez] = exit[0].split(',').map(Number);
    assert.ok(seen.has(`${ez},${ex}`), '出口に行ける');
    assert.ok([...enemyCh].length >= 2);
});

test('塔（field_peak・field_volcano・field_grass）: 段の壁（3 段分）は登れず、各段の階段だけで頂上の宝箱へ行ける。敵は段ごと。敵のマスにも床', () => {
    for (const id of ['field_peak', 'field_volcano', 'field_grass']) {
        const d = readJson(`public/data/maps/${id}.json`);
        const lv = (r, c) => parseInt(d.heights[r][c], 36);
        const fl = d.enemyFloor.floor;
        assert.ok(objects[fl] && objects[fl].type === 'floor_tile', `${id}: 床の定義`);
        const flCh = Object.entries(d.legend).find(([, v]) => v === fl)[0];
        const chestCh = Object.entries(d.legend).find(([, v]) => v === 'treasure_chest')[0];
        const cells = [], chests = [];
        for (let r = 0; r < 64; r++) for (let c = 0; c < 64; c++) {
            const ch = d.layout[r][c];
            if (ch === flCh || d.enemyFloor.chars.includes(ch) || ch === chestCh) cells.push([r, c]);
            if (ch === chestCh) chests.push([r, c]);
        }
        assert.equal(chests.length, 2, `${id}: 頂上の宝箱`);
        assert.ok(d.enemyFloor.chars.length >= 3 && d.enemyFloor.chars.every(ch => d.enemies[ch]), `${id}: 敵`);
        const solidAt = (r, c) => { const o = objects[d.legend[d.layout[r][c]]]; return !!o && o.solid && o.type !== 'floor_tile' && o.type !== 'chest'; };
        const start = cells.reduce((a, b) => lv(...a) <= lv(...b) ? a : b);
        const reach = (stepMax) => {
            const seen = new Set([start.join(',')]); const q = [start];
            while (q.length) {
                const [r, c] = q.shift();
                for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                    const nr = r + dr, nc = c + dc;
                    if (nr < 0 || nc < 0 || nr >= 64 || nc >= 64 || seen.has(`${nr},${nc}`)) continue;
                    if (solidAt(nr, nc) || lv(nr, nc) - lv(r, c) > stepMax) continue;
                    seen.add(`${nr},${nc}`); q.push([nr, nc]);
                }
            }
            return seen;
        };
        const top = Math.max(...cells.map(([r, c]) => lv(r, c)));
        const base = Math.min(...cells.map(([r, c]) => lv(r, c)));
        assert.ok(top - base >= 6, `${id}: 塔の高さ ${top - base}`);
        const near = (set, r, c) => set.has(`${r},${c}`);
        // 階段（段差 1）で、頂上の宝箱へ行ける。段差 0 だけでは行けない（登れない壁）
        const up = reach(1), flat = reach(0);
        assert.ok(chests.every(([r, c]) => near(up, r, c)), `${id}: 階段で、頂上の宝箱へ行ける`);
        assert.ok(chests.every(([r, c]) => !near(flat, r, c)), `${id}: 壁は、登れない`);
        const gb = d.gimmickBoxes[0];
        assert.ok(cells.every(([r, c]) => r >= gb.r0 && r <= gb.r1 && c >= gb.c0 && c <= gb.c1), `${id}: gimmickBoxes の範囲`);
    }
});
