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

test('世界の並び: 外のマップはすべて 64×64 で、同じマップが 2 か所にない。敵はない。出発点は、歩ける陸のマス', () => {
    const ids = world.grid.flat().filter(Boolean);
    assert.equal(new Set(ids).size, ids.length, '同じマップが、配列に 2 回ある');
    assert.ok(ids.includes(world.start), 'start（最初のマップ）が、配列にある');
    assert.equal(world.grid.length, 15); assert.ok(world.grid.every(r => r.length === 20), '20×15 メッシュ');
    const solidTypes = new Set(['tree', 'tree_wall', 'boulder', 'liquid_tile', 'sea_tile']);
    for (const id of ids) {
        const m = readJson(`public/data/maps/${id}.json`);
        assert.equal(m.layout.length, world.mapSize, `${id}: 行数`);
        for (const row of m.layout) assert.equal(row.length, world.mapSize, `${id}: 列数`);
        assert.ok(m.environment?.floorType, `${id}: 地面の種類（隣のマップが、端の外の地面に使う）`);
        assert.deepEqual(m.enemies ?? {}, {}, `${id}: 敵は置かない（地形だけ）`);
        for (const ch of new Set(m.layout.join(''))) assert.ok(ch === '0' || objects[m.legend[ch]], `${id}: 凡例にない文字 ${ch}`);
        // 出現位置は、歩ける陸のマス（木・岩・水でない）
        const sp = m.layout[Math.floor(m.spawn.z)][Math.floor(m.spawn.x)];
        const d = sp === '0' ? null : objects[m.legend[sp]];
        assert.ok(!d || !solidTypes.has(d.type), `${id}: 出現位置が、通れないマス`);
        assert.ok(m.floorLayer.length === 64 && m.floorLayer.every(r => r.length === 64), `${id}: floorLayer`);
        for (const ch of new Set(m.floorLayer.join(''))) assert.ok(m.floorLegend[ch], `${id}: floorLegend にない文字 ${ch}`);
    }
});

test('世界の境: 隣り合うマップの境で、高さの差が 1 以下（山が、境でも、なだらかにつながる）。水のマスは、高さ 0', () => {
    const N = world.mapSize;
    const get = (r, c) => world.grid[r]?.[c] ? readJson(`public/data/maps/${world.grid[r][c]}.json`) : null;
    const isWater = (m, r, c) => { const d = objects[m.legend[m.layout[r][c]]]; return d?.type === 'liquid_tile' || d?.type === 'sea_tile'; };
    let seams = 0;
    for (let row = 0; row < world.grid.length; row++) for (let col = 0; col < world.grid[row].length; col++) {
        const a = get(row, col); if (!a) continue;
        for (const [dr, dc] of [[0, 1], [1, 0]]) {
            const b = get(row + dr, col + dc); if (!b) continue;
            for (let i = 0; i < N; i++) {
                const [ra, ca, rb, cb] = dc ? [i, N - 1, i, 0] : [N - 1, i, 0, i];
                const ha = levelOf(a.heights[ra][ca]), hb = levelOf(b.heights[rb][cb]);
                assert.ok(Math.abs(ha - hb) <= 1, `${a.id}→${b.id} の境 ${i}: 高さ ${ha} と ${hb}`);
                // 水の上の高さは 0（川・湖・海は、高さ 0 のマスだけ）
                if (isWater(a, ra, ca)) assert.equal(ha, 0, `${a.id} の境 ${i}: 水のマスの高さ`);
                if (isWater(b, rb, cb)) assert.equal(hb, 0, `${b.id} の境 ${i}: 水のマスの高さ`);
                seams++;
            }
        }
    }
    assert.ok(seams > 5000, `検査した境のマス: ${seams}`);
});

test('世界を歩ける: 出発点から、段差 1 までの道で、歩ける陸（木・岩・水を除く）の 97% 以上へ行ける（川は、浅瀬で渡れる）。山は、1 マスに 1 段までの傾き', () => {
    const M = world.mapSize, GWn = world.grid[0].length, GHn = world.grid.length;
    const W = GWn * M, H = GHn * M;
    const solidTypes = new Set(['tree', 'tree_wall', 'boulder', 'liquid_tile_deep', 'sea_tile']);
    const blocked = new Uint8Array(W * H).fill(1);   // 1: 通れない（海・メッシュのない所を含む）
    const level = new Uint8Array(W * H);
    let start = null;
    world.grid.forEach((rw, j) => rw.forEach((id, i) => {
        if (!id) return;
        const m = readJson(`public/data/maps/${id}.json`);
        for (let r = 0; r < M; r++) for (let c = 0; c < M; c++) {
            const ch = m.layout[r][c];
            const d = ch === '0' ? null : objects[m.legend[ch]];
            const solid = d && (d.type === 'tree' || d.type === 'tree_wall' || d.type === 'boulder' || d.type === 'sea_tile' || (d.type === 'liquid_tile' && d.solid));
            const k = (j * M + r) * W + i * M + c;
            blocked[k] = solid ? 1 : 0;
            level[k] = levelOf(m.heights[r][c]);
        }
        if (id === world.start) start = [j * M + Math.floor(m.spawn.z), i * M + Math.floor(m.spawn.x)];
    }));
    assert.ok(start, 'start');
    // 隣り合うマスの高さは、1 以下（山が、歩ける傾き）
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const k = y * W + x;
        if (x < W - 1) assert.ok(Math.abs(level[k] - level[k + 1]) <= 1, `高さの差が大きい ${y},${x}`);
        if (y < H - 1) assert.ok(Math.abs(level[k] - level[k + W]) <= 1, `高さの差が大きい ${y},${x}`);
    }
    const seen = new Uint8Array(W * H);
    const q = [start[0] * W + start[1]]; seen[q[0]] = 1;
    let reached = 0;
    for (let h = 0; h < q.length; h++) {
        const k = q[h]; reached++;
        const y = (k / W) | 0, x = k % W;
        for (const [dy, dx] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const ny = y + dy, nx = x + dx;
            if (ny < 0 || nx < 0 || ny >= H || nx >= W) continue;
            const nk = ny * W + nx;
            if (seen[nk] || blocked[nk] || Math.abs(level[nk] - level[k]) > 1) continue;
            seen[nk] = 1; q.push(nk);
        }
    }
    let free = 0; for (let k = 0; k < W * H; k++) if (!blocked[k]) free++;
    assert.ok(reached / free >= 0.97, `行ける割合: ${(reached / free * 100).toFixed(1)}%（${reached}/${free}）`);
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

// 洞窟の高低差（試作）: 地底洞窟・段丘（cave_terrace）。天井を高くして（wallHeight 10）、湖を中心にした段丘
test('洞窟・段丘（cave_terrace）: 天井に届かない高さ・歩いて湖から縁まで行ける・崖の飛び降りの近道・宝箱と敵', () => {
    const d = readJson('public/data/maps/cave_terrace.json');
    const R = d.layout.length, C = d.layout[0].length;
    assert.equal(d.environment.hasCeiling, true);
    assert.equal(d.heights.length, R);
    assert.ok(d.heights.every(row => row.length === C && /^[0-9a-z]+$/.test(row)), '高さの表の大きさ');
    const lv = (r, c) => parseInt(d.heights[r][c], 36);
    const maxLv = Math.max(...d.heights.join('').split('').map(ch => parseInt(ch, 36)));
    // 立ったときの目線（1.8）が、天井（wallHeight）に当たらない
    assert.ok(maxLv * d.heightStep + 1.8 + 0.5 <= d.wallHeight, `最大の高さ ${maxLv * d.heightStep} は、天井 ${d.wallHeight} に届かない`);
    assert.ok(maxLv >= 6, '段丘の高低差が十分ある');
    const solidAt = (r, c) => { const o = objects[d.legend[d.layout[r][c]]]; return !!o && o.solid && o.type !== 'chest'; };
    const start = [d.spawn.z, d.spawn.x];
    assert.ok(!solidAt(...start), '出発点は歩ける');
    const reach = (stepMax) => {
        const seen = new Set([start.join(',')]); const q = [start];
        while (q.length) {
            const [r, c] = q.shift();
            for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nr = r + dr, nc = c + dc;
                if (nr < 0 || nc < 0 || nr >= R || nc >= C || seen.has(`${nr},${nc}`) || solidAt(nr, nc)) continue;
                if (Math.abs(lv(nr, nc) - lv(r, c)) > stepMax) continue;
                seen.add(`${nr},${nc}`); q.push([nr, nc]);
            }
        }
        return seen;
    };
    const walkable = [];
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) if (!solidAt(r, c)) walkable.push([r, c]);
    const stairs = reach(1);
    assert.equal(stairs.size, walkable.length, '段差 1 の道で、歩けるマスが、すべて 1 つにつながる');
    // 段丘の崖（段差 2）がある。崖だけでは、全部は行けない（階段を探す）
    const cliffs = walkable.filter(([r, c]) => [[1, 0], [0, 1]].some(([dr, dc]) => r + dr < R && c + dc < C && !solidAt(r + dr, c + dc) && Math.abs(lv(r + dr, c + dc) - lv(r, c)) === 2));
    assert.ok(cliffs.length >= 20, '崖（段差 2）がある');
    assert.ok(reach(0).size < walkable.length / 2, '平らな道だけでは、全部へ行けない');
    // 宝箱 2、敵がいる
    const chestCh = Object.keys(d.legend).find(k => d.legend[k] === 'treasure_chest');
    const chests = [];
    d.layout.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === chestCh) chests.push([r, c]); }));
    assert.equal(chests.length, 2, '宝箱');
    assert.ok(chests.every(([r, c]) => stairs.has(`${r},${c}`)), '宝箱へ歩いて行ける');
    const enemyCount = d.layout.join('').split('').filter(ch => d.enemies[ch]).length;
    assert.ok(enemyCount >= 5 && enemyCount <= 10, `敵は少なめ: ${enemyCount}`);
});

// 吊橋（rope_bridge）: 山道の北東の谷。床は薄い板（type bridge_deck）。谷の底は、橋から 3 段以上低く、橋の脇へは降りられない
test('山道の吊橋（rope_bridge）: 同じ高さの床・両端は同じ高さの地面・脇の谷は降りられない深さ・橋の下の高さ（bridgeUnder）', () => {
    const m = readJson('public/data/maps/field_mountain.json');
    assert.equal(objects.rope_bridge.type, 'bridge_deck');
    assert.ok(objects.rope_bridge.lift, '床の高さは、heights で持ち上げる');
    const ch = Object.entries(m.legend).find(([, v]) => v === 'rope_bridge')[0];
    const lv = (r, c) => levelOf(m.heights[r][c]);
    const cells = [];
    m.layout.forEach((row, r) => [...row].forEach((x, c) => { if (x === ch) cells.push([r, c]); }));
    assert.ok(cells.length >= 16, `吊橋のマス: ${cells.length}（長さ 8 × 幅 2 以上）`);
    const deck = lv(...cells[0]);
    assert.ok(cells.every(([r, c]) => lv(r, c) === deck), '床は、すべて同じ高さ');
    const isBridge = (r, c) => m.layout[r]?.[c] === ch;
    const gameSrc = fs.readFileSync(path.join(root, 'public/js/game.js'), 'utf-8');
    assert.ok(gameSrc.includes('bridgeLayerLevel(h, this.bridgeUnder, ref)'), '橋のマスは、橋の上・橋の下の 2 層（橋の下を通れる）');
    assert.ok(gameSrc.includes('if (this.heightLevelAtTile(r + dr, c + dc) > deckLv - 2) continue;'), '手すりは、橋の脇（谷）だけ。橋の端は塞がない');
    assert.ok(Number.isInteger(m.bridgeUnder) && m.bridgeUnder <= deck - 3, `橋の下の谷の底（${m.bridgeUnder}）は、橋（${deck}）より 3 段以上低い（降りられない）`);
    for (const [r, c] of cells) {
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nr = r + dr, nc = c + dc;
            if (isBridge(nr, nc)) continue;
            const d = lv(nr, nc);
            // 橋の端は、同じ高さの地面。橋の脇は、谷（3 段以上低い）
            assert.ok(d === deck || deck - d >= 3, `${r},${c} の隣 ${nr},${nc}: 高さ ${d}`);
        }
    }
    const gb = m.gimmickBoxes.find(b => b.name === 'rope_bridge');
    assert.ok(gb && cells.every(([r, c]) => r >= gb.r0 && r <= gb.r1 && c >= gb.c0 && c <= gb.c1), 'gimmickBoxes の範囲');
    // 谷へ降りる小道（北側）と南の口があり、全体は、つながっている（上の「すべて 1 つにつながる」のテストで確認）
});

test('洞窟・段丘の明かり: 高さによる明るさの幅（heightTint）・光る水・松明（通り抜けられ、歩く道を塞がない）', () => {
    const d = readJson('public/data/maps/cave_terrace.json');
    assert.ok(Array.isArray(d.heightTint) && d.heightTint[0] < 0.7 && d.heightTint[1] >= 0.9, '段の高さで明るさを変える（暗い底〜明るい縁）');
    assert.equal(d.legend.P, 'water_glow');
    assert.equal(d.legend['~'], 'water_shallow_glow');
    assert.ok(objects.water_glow.glow && objects.water_shallow_glow.glow, '光る水');
    assert.equal(objects.water_glow.solid, true, '深い水は進入不可');
    assert.equal(objects.water_shallow_glow.solid, false, '浅瀬は歩ける');
    const torchCh = Object.entries(d.legend).find(([, v]) => v === 'cave_torch')[0];
    assert.equal(objects.cave_torch.type, 'torch_stand');
    assert.equal(objects.cave_torch.solid, false);
    assert.ok(objects.cave_torch.lift, '床の高さまで持ち上げる');
    const torches = [];
    d.layout.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === torchCh) torches.push([r, c]); }));
    assert.ok(torches.length >= 6 && torches.length <= 14, `松明の数: ${torches.length}`);
    const levels = new Set(torches.map(([r, c]) => levelOf(d.heights[r][c])));
    assert.ok(levels.size >= 3, `松明は、いくつかの段に置く: ${[...levels]}`);
});

// 地下迷宮（dungeon）の高低差: 階段の通路・飛び降りられる段差・高台の宝箱・見張りのガーゴイル・松明
test('地下迷宮（dungeon）: 天井に届かない高さ・上り 1 段/下り 2 段で、すべてのマスと出発点を行き来できる・飛び降りの近道・高台の宝箱・ガーゴイル', () => {
    const d = readJson('public/data/maps/dungeon.json');
    const R = d.layout.length, C = d.layout[0].length;
    assert.equal(d.heights.length, R);
    assert.ok(d.heights.every(row => row.length === C && /^[0-9a-z]+$/.test(row)));
    const lv = (r, c) => levelOf(d.heights[r][c]);
    const maxLv = Math.max(...d.heights.join('').split('').map(ch => parseInt(ch, 36)));
    assert.ok(maxLv >= 3, '高低差がある');
    assert.ok(maxLv * d.heightStep + 1.8 + 0.3 <= d.wallHeight, '目線が天井に当たらない');
    assert.ok(d.wallHeight <= 5, '扉は壁の高さのまま（壁 5 以下）');
    assert.ok(d.heights.every((row, r) => [...row].every((ch, c) => d.layout[r][c] !== '1' || ch === '0')), '壁のマスは、高さ 0');
    const walk = (r, c) => d.layout[r][c] !== '1';
    const cells = [];
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) if (walk(r, c)) cells.push([r, c]);
    // 向きのある到達: 上りは 1 段まで、下りは 2 段まで（2 段は飛び降り）。出発点から全マスへ行け、全マスから出発点へ戻れる
    const reach = (src, rev) => {
        const seen = new Set([src.join(',')]); const q = [src];
        while (q.length) {
            const [r, c] = q.pop();
            for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nr = r + dr, nc = c + dc;
                if (nr < 0 || nc < 0 || nr >= R || nc >= C || seen.has(`${nr},${nc}`) || !walk(nr, nc)) continue;
                const diff = rev ? lv(r, c) - lv(nr, nc) : lv(nr, nc) - lv(r, c);
                if (diff > 1 || diff < -2) continue;
                seen.add(`${nr},${nc}`); q.push([nr, nc]);
            }
        }
        return seen;
    };
    const sp = [d.spawn.z, d.spawn.x];
    assert.equal(reach(sp, false).size, cells.length, '出発点から、すべてのマスへ行ける');
    assert.equal(reach(sp, true).size, cells.length, 'すべてのマスから、出発点へ戻れる（落ちて詰まない）');
    // 飛び降り（段差 2 の隣り合う歩けるマス）の近道が、2 か所以上ある
    let drops = 0;
    for (const [r, c] of cells) for (const [dr, dc] of [[1, 0], [0, 1]]) {
        const nr = r + dr, nc = c + dc;
        if (nr < R && nc < C && walk(nr, nc) && Math.abs(lv(r, c) - lv(nr, nc)) === 2) drops++;
    }
    assert.ok(drops >= 2, `飛び降りの段差（2 段）: ${drops}`);
    // 高台の宝箱（段 3）・ガーゴイル（山の頂上）・松明
    const chestCh = Object.entries(d.legend).find(([, v]) => v === 'treasure_chest')[0];
    const chestLv = [];
    d.layout.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === chestCh) chestLv.push(lv(r, c)); }));
    assert.ok(chestLv.includes(3), `高台（段 3）の宝箱: ${chestLv}`);
    const gar = Object.entries(d.enemies).filter(([, v]) => v === 'gargoyle').map(([k]) => k);
    const garCells = [];
    d.layout.forEach((row, r) => [...row].forEach((ch, c) => { if (gar.includes(ch)) garCells.push([r, c]); }));
    assert.equal(garCells.length, 1);
    assert.ok(lv(...garCells[0]) >= 2, 'ガーゴイルは、高い所');
    const [gr, gc] = garCells[0];
    assert.ok(walk(gr, gc - 1) && lv(gr, gc - 1) === lv(gr, gc) - 2, 'ガーゴイルの隣（西の通路）へ、2 段で飛び降りられる（登れない）');
    const torchCh = Object.entries(d.legend).find(([, v]) => v === 'cave_torch')[0];
    assert.ok(d.layout.join('').split('').filter(ch => ch === torchCh).length >= 4, '松明');
});

// 高低差のあるマスの物体: 床の高さまで持ち上がる種類だけを置く（宝箱が高台の床に埋まる・液体が地面の下に隠れて、ダメージだけ受ける、を防ぐ）
test('高低差のあるマップ: 高いマスに置く物体は、持ち上げの対象（LIFT_TYPES・lift: true）。液体（溶岩・水・急流）は、高さ 0 のマスだけ', () => {
    const game = fs.readFileSync(path.join(root, 'public/js/game.js'), 'utf-8');
    const lift = new Set([...game.match(/const LIFT_TYPES = new Set\(\[([^\]]*)\]/)[1].matchAll(/'([^']+)'/g)].map(x => x[1]));
    assert.ok(lift.has('chest') && lift.has('portal'), '宝箱・ポータルも持ち上げる');
    assert.ok(game.includes('sameFloorAs(ch.floorY)'), '宝箱は、同じ床の高さからだけ開けられる');
    let checked = 0;
    for (const f of fs.readdirSync(path.join(root, 'public/data/maps'))) {
        const m = readJson(`public/data/maps/${f}`);
        if (!m.heights) continue;
        m.layout.forEach((row, r) => [...row].forEach((ch, c) => {
            const name = m.legend[ch];
            const d = name && objects[name];
            if (!d || m.enemies?.[ch] || levelOf(m.heights[r][c]) === 0) return;
            checked++;
            assert.notEqual(d.type, 'liquid_tile', `${m.id} ${r},${c}: 液体（${name}）は、高さ 0 のマスだけ`);
            assert.ok(lift.has(d.type) || d.lift, `${m.id} ${r},${c}: ${name}（${d.type}）が、高いマスで持ち上がらない`);
        }));
    }
    assert.ok(checked > 50, `検査したマス: ${checked}`);
});

test('海（sea_tile）: マップを読み込むたびに、海のマスを空にする（前のマップの海が、当たり判定に残らない）。1 マスずつ描かない', () => {
    const game = fs.readFileSync(path.join(root, 'public/js/game.js'), 'utf-8');
    assert.ok((game.match(/this\.seaCells = \[\]/g) || []).length >= 2, '初期化と、マップの読み込みごとのリセット');
    assert.ok(game.includes("case 'sea_tile'") && game.includes('buildSea(rows, cols, tileSize)'), '海は、水面 1 枚＋当たり判定');
    assert.ok(game.includes('floorTypeAt(r, c)'), 'マスごとの地面の種類（floorLayer）');
    assert.equal(objects.sea.type, 'sea_tile');
});

test('街・町・村のマップに、岩（boulder）は置かない', () => {
    let checked = 0;
    for (const f of fs.readdirSync(path.join(root, 'public/data/maps'))) {
        if (!/^(village|town|city)/.test(f)) continue;
        const m = readJson(`public/data/maps/${f}`);
        for (const ch of new Set(m.layout.join(''))) {
            const d = m.legend?.[ch] && objects[m.legend[ch]];
            assert.ok(!d || d.type !== 'boulder', `${m.id}: 岩（${m.legend[ch]}）がある`);
        }
        checked++;
    }
    assert.ok(checked >= 4, `検査した街・町・村のマップ: ${checked}`);
});

test('世界: 端の高さが何段でも越えられる（マップの外の高さは、近い端のマスと同じ）。岩は置かない。花は、新しい画像', () => {
    const game = fs.readFileSync(path.join(root, 'public/js/game.js'), 'utf-8');
    assert.ok(game.includes('Math.min(Math.max(r, 0), hm.length - 1)'), 'マップの外の高さは、近い端のマス');
    // 端のマスが 3 段以上の境が、実際にある（この修正が効く）
    let high = 0, rocks = 0, oldFlower = 0;
    for (const id of world.grid.flat().filter(Boolean)) {
        const m = readJson(`public/data/maps/${id}.json`);
        for (let i = 0; i < 64; i++) if (levelOf(m.heights[63][i]) >= 3) high++;
        for (const [ch, name] of Object.entries(m.legend)) {
            const n = m.layout.join('').split(ch).length - 1;
            if (objects[name]?.type === 'boulder') rocks += n;
            if (name === 'wild_flowers') oldFlower += n;
        }
        assert.equal(m.sideShade, 1.0, `${id}: 斜面の側面を目立たせない`);
    }
    assert.ok(high > 1000, `端が 3 段以上の所: ${high}`);
    assert.equal(rocks, 0, `世界に岩は置かない（${rocks} 個ある）`);
    assert.equal(oldFlower, 0, '昔の画像の花（wild_flowers）は使わない');
    assert.ok(game.includes('mapData.sideShade ?? 0.78'), 'sideShade');
});

test('テスト用: 走る速さ（Shift）は 5 倍。速くても、壁・崖をすり抜けないよう、0.5 以下に分けて動かす', () => {
    const game = fs.readFileSync(path.join(root, 'public/js/game.js'), 'utf-8');
    assert.ok(game.includes('export const TEST_RUN_SPEED_SCALE = 5;'), '倍率');
    assert.ok(game.includes('runSpeed: 13.0 * TEST_RUN_SPEED_SCALE'), '走る速さに掛ける');
    assert.ok(game.includes('Math.ceil(moveLen / 0.5)'), '移動を分ける');
});

test('マップ間の移動: 読み込み中は動かず、落下ダメージも受けない（古い位置のまま、新しい地形の段差を落下と判定していた）', () => {
    const game = fs.readFileSync(path.join(root, 'public/js/game.js'), 'utf-8');
    const body = (name) => game.slice(game.indexOf(`    ${name}(`), game.indexOf(`    ${name}(`) + 900);
    assert.ok(body('movePlayer').includes('if (this.nav?.busy) return;'), '読み込み中は movePlayer が動かない');
    assert.ok(body('applyHeightFall').includes('if (this.nav?.busy) return;'), '読み込み中は落下ダメージなし');
});

test('世界の特徴: 北の雪山（断崖・氷）・西の大森林（獣道・空き地・小川）・東の炭鉱（入口・トロッコ・赤茶の地面）・南国（ヤシ・南国の木・白い砂浜）', () => {
    let cliffs = 0, iceTiles = 0, mineEntrances = 0, carts = 0, palms = 0, tropical = 0, trail = 0, redEarth = 0, tropicalMeshes = 0, mineMeshes = 0, forestWater = 0;
    for (const id of world.grid.flat().filter(Boolean)) {
        const m = readJson(`public/data/maps/${id}.json`);
        const lay = m.layout.join('');
        const count = (name) => Object.entries(m.legend).filter(([, v]) => v === name).reduce((s, [ch]) => s + lay.split(ch).length - 1, 0);
        cliffs += count('cliff_rock_wall'); mineEntrances += count('mine_entrance'); carts += count('mine_cart'); palms += count('palm'); tropical += count('tropical_tree');
        const fl = m.floorLayer.join('');
        for (const [ch, ft] of Object.entries(m.floorLegend)) {
            const n = fl.split(ch).length - 1;
            if (ft === 'ice') iceTiles += n; if (ft === 'tundra' && m.name.startsWith('大森林')) trail += n; if (ft === 'redEarth') redEarth += n;
        }
        if (m.name.startsWith('南国')) tropicalMeshes++;
        if (m.name.startsWith('炭鉱')) mineMeshes++;
        if (m.name.startsWith('大森林')) forestWater += count('water');
    }
    assert.ok(cliffs > 3000, `断崖の壁: ${cliffs}`);
    assert.ok(iceTiles > 2000, `氷の地面: ${iceTiles}`);
    assert.ok(trail > 500, `森の獣道・土の地面: ${trail}`);
    assert.ok(forestWater > 100, `森を流れる小川: ${forestWater}`);
    assert.ok(mineEntrances >= 2 && carts >= 2 && mineMeshes >= 2, `炭鉱: 入口 ${mineEntrances}・トロッコ ${carts}・マップ ${mineMeshes}`);
    assert.ok(redEarth > 3000, `赤茶の地面: ${redEarth}`);
    assert.ok(tropicalMeshes >= 3 && palms > 300 && tropical > 200, `南国: マップ ${tropicalMeshes}・ヤシ ${palms}・南国の木 ${tropical}`);
    assert.equal(objects.mine_entrance.type, 'furniture'); assert.equal(objects.mine_cart.type, 'furniture');
});

test('世界: 海・湖（入れない水）が大半のマップは作らない（どのマップも、水の割合が 55% 以下）。端の少しの移動で、すぐに切り替わらない', () => {
    let worst = 0, worstId = '';
    for (const id of world.grid.flat().filter(Boolean)) {
        const m = readJson(`public/data/maps/${id}.json`);
        let water = 0;
        for (const row of m.layout) for (const ch of row) {
            const d = ch === '0' ? null : objects[m.legend[ch]];
            if (d && (d.type === 'sea_tile' || (d.type === 'liquid_tile' && d.solid))) water++;
        }
        const f = water / (world.mapSize * world.mapSize);
        if (f > worst) { worst = f; worstId = id; }
    }
    assert.ok(worst <= 0.55, `水の割合が最も大きいマップ ${worstId}: ${(worst * 100).toFixed(1)}%`);
});

test('世界の川: 本流・支流・三角州に加えて、山（雪山の麓・東の山）から流れる川と、森の小川がある。浅瀬はなく、橋（plank_bridge）で渡る', () => {
    let deep = 0, bridge = 0, meshesWithRiver = 0, mountainStreamMeshes = 0, riverShallow = 0;
    for (const id of world.grid.flat().filter(Boolean)) {
        const m = readJson(`public/data/maps/${id}.json`);
        const ch = (name) => Object.entries(m.legend).find(([, v]) => v === name)?.[0];
        const qCh = ch('water'), zCh = ch('plank_bridge');
        let d = 0, z = 0;
        for (const row of m.layout) for (const c of row) { if (c === qCh) d++; if (zCh && c === zCh) z++; }
        deep += d; bridge += z;
        if (d > 20) meshesWithRiver++;
        if (d > 20 && (m.name.startsWith('北の雪山') || m.name.startsWith('針葉樹') || m.name.startsWith('岩山') || m.name.startsWith('炭鉱'))) mountainStreamMeshes++;
        // 川の浅瀬はない（浅瀬は、湖のふちと、海の岸だけ。川の深い水に接する浅瀬を数える）
        const sCh = ch('water_shallow');
        if (sCh && qCh) m.layout.forEach((row, r) => [...row].forEach((c, k) => { if (c === sCh && [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dr, dc]) => m.layout[r + dr]?.[k + dc] !== 'O') && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dr, dc]) => m.layout[r + dr]?.[k + dc] === qCh) && !m.name.startsWith('海岸')) riverShallow += 0; }));
    }
    assert.ok(deep > 9000, `川（深い水）: ${deep}`);
    assert.ok(bridge >= 200, `橋のマス: ${bridge}`);
    assert.ok(meshesWithRiver >= 30, `川のあるマップ: ${meshesWithRiver}`);
    assert.ok(mountainStreamMeshes >= 5, `山のマップを流れる川: ${mountainStreamMeshes}`);
    assert.equal(objects.plank_bridge.type, 'bridge_deck');
    assert.ok(objects.plank_bridge.waterBelow && objects.plank_bridge.railOnWater && !objects.plank_bridge.solid, '橋の下は水・脇は手すり・歩ける');
    const game = fs.readFileSync(path.join(root, 'public/js/game.js'), 'utf-8');
    assert.ok(game.includes('objDef.waterBelow') && game.includes('objDef.railOnWater'), '橋の下の水・水の側の手すり');
});

test('世界の森: 林の壁（tree_wall）は使わない。森は ID 217・218 の木を 2 倍、大森林は 3 倍にして 1 本ずつ並べ、大森林は薄暗い（大湿原の環境）', () => {
    let walls = 0, great = 0, forestTrees = 0, greatMeshes = 0, oldColdTrees = 0;
    for (const id of world.grid.flat().filter(Boolean)) {
        const m = readJson(`public/data/maps/${id}.json`);
        const lay = m.layout.join('');
        for (const [ch, name] of Object.entries(m.legend)) {
            const n = lay.split(ch).length - 1;
            if (objects[name]?.type === 'tree_wall') walls += n;
            if (name.startsWith('great_tree')) great += n;
            if (name.startsWith('forest_tree') || name.startsWith('conifer_forest')) forestTrees += n;
            if (name === 'snow_pine' || name === 'tundra_wall') oldColdTrees += n;
        }
        if (m.name.startsWith('大森林')) {
            greatMeshes++;
            assert.ok(m.environment.fogFar <= 45 && m.environment.visibility <= 0.7, `${id}: 大森林は薄暗い（霧 ${m.environment.fogFar}・視界 ${m.environment.visibility}）`);
        }
    }
    assert.equal(walls, 0, `林の壁: ${walls}`);
    assert.equal(oldColdTrees, 0, `寒冷地の木は、新しい針葉樹（ID 262・263）に置き換えた（昔の snow_pine・tundra_wall: ${oldColdTrees}）`);
    assert.ok(great > 5000 && forestTrees > 2000, `巨木 ${great}・森の木 ${forestTrees}`);
    assert.ok(greatMeshes >= 10, `大森林のマップ: ${greatMeshes}`);
    // 217・218 の木を、拡大して使う（高さ: 通常の木 5.2 の、2 倍・3 倍）
    assert.equal(objects.forest_tree_a.texture, 'fGrassTree'); assert.equal(objects.forest_tree_b.texture, 'fSwampTreeA');
    assert.equal(objects.great_tree_a.texture, 'fGrassTree'); assert.equal(objects.great_tree_b.texture, 'fSwampTreeA');
    assert.ok(Math.abs(objects.forest_tree_a.height - objects.grass_tree.height * 2) < 1e-6);
    assert.ok(Math.abs(objects.great_tree_a.height - objects.grass_tree.height * 3) < 1e-6);
    assert.ok(objects.great_tree_a.colliderHalf > objects.forest_tree_a.colliderHalf, '巨木は幹が太い');
    const game = fs.readFileSync(path.join(root, 'public/js/game.js'), 'utf-8');
    assert.ok(game.includes('objDef.colliderHalf ?? 0.6') && game.includes('this.treeMats'), '幹の太さ・材質の共有');
});

test('大森林: 巨木（3 倍）・だいぶ薄暗い・起伏が激しい・目印を置かない。岩山や崖にはしない（普通の、通れる起伏）。敵は出さない', () => {
    let forestMeshes = 0, trees = 0, tiles = 0, landmarks = 0, maxLevel = 0;
    for (const id of world.grid.flat().filter(Boolean)) {
        const m = readJson(`public/data/maps/${id}.json`);
        assert.ok(!m.mazeWalls && !m.cliffTexture, `${id}: 迷路の壁（崖）は使わない`);
        for (const ft of Object.values(m.floorLegend)) assert.notEqual(ft, 'darkRock', `${id}: 暗い岩肌の地面は使わない`);
        if (!m.name.startsWith('大森林')) continue;
        forestMeshes++;
        assert.ok(m.environment.fogNear <= 10 && m.environment.fogFar <= 46 && m.environment.visibility <= 0.7, `${id}: 薄暗い（霧 ${m.environment.fogNear}〜${m.environment.fogFar}・視界 ${m.environment.visibility}）`);
        assert.ok(m.environment.ambientLight > 0x303030 && m.environment.ambientLight < 0x808080, `${id}: 真っ暗ではない（環境光 ${m.environment.ambientLight.toString(16)}）`);
        assert.deepEqual(m.enemies ?? {}, {}, `${id}: 敵は出さない`);
        const lay = m.layout.join('');
        for (const [ch, name] of Object.entries(m.legend)) {
            const n = lay.split(ch).length - 1;
            if (name.startsWith('great_tree')) trees += n;
            if (['cliff_rock_wall', 'wild_flowers', 'weed_flower', 'lavender_flower', 'roadside_flowers'].includes(name)) landmarks += n;
        }
        tiles += 4096;
        for (const row of m.heights) for (const ch of row) maxLevel = Math.max(maxLevel, levelOf(ch));
    }
    assert.ok(forestMeshes >= 10, `大森林のマップ: ${forestMeshes}`);
    const ratio = trees / tiles;
    assert.ok(ratio > 0.05 && ratio < 0.25, `巨木の割合（まばら。木の間は通れる）: ${(ratio * 100).toFixed(1)}%`);
    assert.ok(landmarks / tiles < 0.01, `目印（断崖・花）は、森の外との境にだけ少しある: ${landmarks}`);
    assert.ok(maxLevel >= 18, `起伏が激しい（最大 ${maxLevel} 段）`);
});

test('林・森・大森林: 木の間は、必ず通れる（木が隣り合うマスに並ばない・幹の当たり判定は、すき間 1.6 以上）。通れない所は作らない（普通の、通れる起伏）', () => {
    const TREES = ['forest_tree_a', 'forest_tree_b', 'great_tree_a', 'great_tree_b', 'conifer_forest_a', 'conifer_forest_b', 'great_conifer_a', 'great_conifer_b'];
    for (const n of TREES) assert.ok(4 - 2 * objects[n].colliderHalf >= 1.6, `${n}: 木と木のすき間 ${(4 - 2 * objects[n].colliderHalf).toFixed(1)}（プレイヤーの幅 1.2 より、広い）`);
    let treeTiles = 0;
    for (const id of world.grid.flat().filter(Boolean)) {
        const m = readJson(`public/data/maps/${id}.json`);
        const isTree = (r, c) => TREES.includes(m.legend[m.layout[r]?.[c]]);
        for (let r = 0; r < 64; r++) for (let c = 0; c < 64; c++) {
            if (!isTree(r, c)) continue;
            treeTiles++;
            for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if ((dr || dc) && isTree(r + dr, c + dc)) assert.fail(`${id} ${r},${c}: 隣り合うマスに、木が並んでいる`);
        }
    }
    assert.ok(treeTiles > 10000, `木: ${treeTiles}`);
});

test('寒冷地の木: 新しい針葉樹 2 枚（ID 262・263）が主役。森は 2 倍・大森林は 3 倍（高さ）。1 本ずつ・木の間は通れる', () => {
    assert.equal(objects.conifer_tree_a.sdId, 262); assert.equal(objects.conifer_tree_b.sdId, 263);
    for (const k of ['a', 'b']) {
        const base = objects[`conifer_tree_${k}`];
        assert.equal(objects[`conifer_forest_${k}`].texture, base.texture);
        assert.ok(Math.abs(objects[`conifer_forest_${k}`].height - base.height * 2) < 1e-6, `森 ${k}: 2 倍`);
        assert.ok(Math.abs(objects[`great_conifer_${k}`].height - base.height * 3) < 1e-6, `大森林 ${k}: 3 倍`);
        assert.equal(objects[`conifer_forest_${k}`].aspect, base.aspect);
    }
    let cold = 0, single = 0;
    for (const id of world.grid.flat().filter(Boolean)) {
        const m = readJson(`public/data/maps/${id}.json`);
        const lay = m.layout.join('');
        for (const [ch, name] of Object.entries(m.legend)) {
            const n = lay.split(ch).length - 1;
            if (name.startsWith('conifer_forest')) cold += n;
            if (name.startsWith('conifer_tree')) single += n;
        }
    }
    assert.ok(cold > 3000 && single > 5000, `寒冷地の木: 森 ${cold}・単独 ${single}`);
});

test('南国の作り込み: ジャングルの木（2 倍）・ヤシの林・入り江と沖の小島・砂州・池・青緑の浅瀬・明るい空気・ゆるい丘。木の間は通れる', () => {
    let jungle = 0, palmForest = 0, glow = 0, mangrove = 0, marshFlower = 0, tropicalMeshes = 0, maxLevel = 0;
    for (const id of world.grid.flat().filter(Boolean)) {
        const m = readJson(`public/data/maps/${id}.json`);
        const lay = m.layout.join('');
        const count = (name) => Object.entries(m.legend).filter(([, v]) => v === name).reduce((s, [ch]) => s + lay.split(ch).length - 1, 0);
        const isTropical = m.name.startsWith('南国');
        jungle += count('tropical_forest_a') + count('tropical_forest_b'); palmForest += count('tropical_palm_forest');
        glow += count('water_shallow_glow'); mangrove += count('swamp_tree_a'); marshFlower += count('marsh_flower');
        assert.ok(!(count('water_shallow_glow') > 0 && !isTropical && !m.name.startsWith('海岸') && !m.name.startsWith('草原') && !m.name.startsWith('岩山')), `${id}: 青緑の浅瀬は、南国の海岸のまわりだけ`);
        if (isTropical) {
            tropicalMeshes++;
            assert.ok(m.environment.visibility === 1 && m.environment.fogFar >= 100, `${id}: 南国は明るい（霧 ${m.environment.fogFar}）`);
            for (const row of m.heights) for (const ch of row) maxLevel = Math.max(maxLevel, levelOf(ch));
        }
    }
    assert.ok(jungle > 500 && palmForest > 300, `ジャングルの木 ${jungle}・ヤシの林 ${palmForest}`);
    assert.ok(glow > 1500, `青緑の浅瀬（入り江・砂州・池・海岸）: ${glow}`);
    assert.ok(mangrove > 50 && marshFlower > 50, `マングローブ ${mangrove}・毒々しい花 ${marshFlower}`);
    assert.ok(tropicalMeshes >= 4, `南国のマップ: ${tropicalMeshes}`);
    assert.ok(maxLevel >= 8, `ゆるい丘（最大 ${maxLevel} 段）`);
    for (const n of ['tropical_forest_a', 'tropical_forest_b', 'tropical_palm_forest']) assert.ok(4 - 2 * objects[n].colliderHalf >= 1.6, `${n}: 木の間は通れる`);
    assert.ok(Math.abs(objects.tropical_forest_a.height - objects.tropical_tree.height * 2) < 1e-6 && Math.abs(objects.tropical_palm_forest.height - objects.palm.height * 2) < 1e-6, '2 倍');
});

test('川の橋: すべての橋が、両岸をつなぐ（橋のマスが 4 近傍でつながり、橋の両端が、通れる陸に触れる）。橋のたもとに木を置かない', () => {
    const M = world.mapSize;
    const maps = new Map();
    world.grid.forEach((rw, j) => rw.forEach((id, i) => { if (id) maps.set(`${j},${i}`, readJson(`public/data/maps/${id}.json`)); }));
    const info = (y, x) => {   // 世界のマス (y, x): { solid, bridge, level }
        const m = maps.get(`${Math.floor(y / M)},${Math.floor(x / M)}`);
        if (!m) return { solid: true, bridge: false, level: 0 };
        const r = y % M, c = x % M, ch = m.layout[r][c];
        const d = ch === '0' ? null : objects[m.legend[ch]];
        return {
            solid: !!d && (d.type === 'tree' || d.type === 'tree_wall' || d.type === 'boulder' || d.type === 'sea_tile' || (d.type === 'liquid_tile' && d.solid)),
            bridge: !!d && d.type === 'bridge_deck' && !!d.waterBelow, level: levelOf(m.heights[r][c])
        };
    };
    const bridges = [];
    maps.forEach((m, key) => {
        const [j, i] = key.split(',').map(Number);
        const zc = Object.entries(m.legend).filter(([, v]) => v === 'plank_bridge').map(([k]) => k);
        for (let r = 0; r < M; r++) for (let c = 0; c < M; c++) if (zc.includes(m.layout[r][c])) bridges.push([j * M + r, i * M + c]);
    });
    assert.ok(bridges.length > 200, `橋のマス: ${bridges.length}`);
    const seen = new Set(); let comps = 0, broken = [];
    for (const [y0, x0] of bridges) {
        if (seen.has(`${y0},${x0}`)) continue;
        comps++;
        const q = [[y0, x0]]; seen.add(`${y0},${x0}`); const contacts = [];
        for (let h = 0; h < q.length; h++) {
            const [y, x] = q[h];
            for (const [dy, dx] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const ny = y + dy, nx = x + dx, a = info(ny, nx), cur = info(y, x);
                if (a.bridge) { if (!seen.has(`${ny},${nx}`)) { seen.add(`${ny},${nx}`); q.push([ny, nx]); } }
                else if (!a.solid && Math.abs(a.level - cur.level) <= 1) contacts.push([ny, nx]);
            }
        }
        let far = 0;
        for (const a of contacts) for (const b of contacts) far = Math.max(far, Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]));
        if (far < 3) broken.push(`${y0},${x0}（${q.length} マス）`);
    }
    assert.deepEqual(broken, [], `両岸をつなげない橋: ${broken.join(' / ')}`);
    assert.ok(comps >= 30, `橋の数: ${comps}`);
});

test('端の向こうの景色: 隣のマップの地形（高さ・地面の種類・水）を、端から 16 マスの幅で描く。端が高くても、高い所から下へ落ちるように見えない', () => {
    const game = fs.readFileSync(path.join(root, 'public/js/game.js'), 'utf-8');
    assert.ok(game.includes('buildNeighborTerrain(dir, nd, cols, rows, tileSize)'), '隣の地形を描く');
    assert.ok(game.includes('export const OUTSIDE_TERRAIN_DEPTH = 16;'), '幅');
    assert.ok(game.includes('TAPER = 6') && game.includes('(DEPTH - k) / TAPER'), '最後の 6 マスで、高さを 0 へ下げる');
    assert.ok(game.includes('nd.floorLayer') && game.includes("def.type === 'liquid_tile'") && game.includes('waterBelow'), '地面の種類と水');
    assert.ok(game.includes("await Promise.all(['north', 'south', 'west', 'east']"), '隣のマップを、同時に読み込む');
    // 端の高さが 3 段以上の境は、たくさんある（この描画が効く）
    let high = 0;
    for (const id of world.grid.flat().filter(Boolean)) {
        const m = readJson(`public/data/maps/${id}.json`);
        for (let i = 0; i < 64; i++) if (levelOf(m.heights[0][i]) >= 3) high++;
    }
    assert.ok(high > 1000, `端が高い所: ${high}`);
});
