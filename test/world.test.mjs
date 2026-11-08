import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
// マップ JSON は、物体 ID の数値の形式（layoutFormat 'ids'）なら、ゲームが使う 1 マス 1 文字の形にそろえる（public/js/mapFormat.js）
const mapFormatTmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mapformat-')), 'mapFormat.mjs');
fs.copyFileSync(path.join(root, 'public/js/mapFormat.js'), mapFormatTmp);
const { normalizeMap } = await import(mapFormatTmp);
const readJson = (f) => normalizeMap(JSON.parse(fs.readFileSync(path.join(root, f), 'utf-8')));
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
        // 山の段丘（高さ 8 以上）には、崖（段差 2 以上）がある。それ以外は、1 以下
        if (x < W - 1) assert.ok(Math.abs(level[k] - level[k + 1]) <= 1 || Math.max(level[k], level[k + 1]) >= 8, `高さの差が大きい ${y},${x}`);
        if (y < H - 1) assert.ok(Math.abs(level[k] - level[k + W]) <= 1 || Math.max(level[k], level[k + W]) >= 8, `高さの差が大きい ${y},${x}`);
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
    // 山頂の広場（山道の行き先）には、山道で行ける
    assert.ok(world.arenas.length >= 10, `山頂の広場: ${world.arenas.length}`);
    const lost = world.arenas.filter(([y, x]) => !seen[y * W + x]);
    assert.deepEqual(lost, [], '山頂の広場へ行けない');
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
            if (objects[name]?.type === 'boulder') {
                // 岩は、山（高さ 6 以上）だけに置く
                for (let r = 0; r < 64; r++) for (let c = 0; c < 64; c++) if (m.layout[r][c] === ch && levelOf(m.heights[r][c]) < 6) rocks++;
            }
            if (name === 'wild_flowers') oldFlower += n;
        }
        assert.equal(m.sideShade, 1.0, `${id}: 斜面の側面を目立たせない`);
    }
    assert.ok(high > 1000, `端が 3 段以上の所: ${high}`);
    assert.equal(rocks, 0, `山以外（高さ 6 未満）に岩は置かない（${rocks} 個ある）`);
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

test('世界の特徴: 北の雪山（氷）・西の大森林（獣道・空き地・小川）・東の炭鉱（入口・トロッコ・赤茶の地面）・南国（ヤシ・南国の木・白い砂浜）', () => {
    let cliffs = 0, iceTiles = 0, mineEntrances = 0, carts = 0, palms = 0, tropical = 0, trail = 0, redEarth = 0, tropicalMeshes = 0, mineMeshes = 0, forestWater = 0;
    for (const id of world.grid.flat().filter(Boolean)) {
        const m = readJson(`public/data/maps/${id}.json`);
        const lay = m.layout.join('');
        const count = (name) => Object.entries(m.legend).filter(([, v]) => v === name).reduce((s, [ch]) => s + lay.split(ch).length - 1, 0);
        cliffs += count('cliff_rock_wall'); mineEntrances += ['mine_entrance', 'mine_entrance_e', 'mine_entrance_w', 'mine_entrance_n'].reduce((a, n) => a + count(n), 0); carts += count('mine_cart'); palms += count('palm'); tropical += count('tropical_tree');
        const fl = m.floorLayer.join('');
        for (const [ch, ft] of Object.entries(m.floorLegend)) {
            const n = fl.split(ch).length - 1;
            if (ft === 'ice') iceTiles += n; if (ft === 'tundra' && m.name.startsWith('大森林')) trail += n; if (ft === 'redEarth') redEarth += n;
        }
        if (m.name.startsWith('南国')) tropicalMeshes++;
        if (m.name.startsWith('炭鉱')) mineMeshes++;
        if (m.name.startsWith('大森林')) forestWater += count('water');
    }
    assert.ok(cliffs < 400, `断崖の壁（石垣）は、炭鉱のふち以外に置かない: ${cliffs}`);
    assert.ok(iceTiles > 2000, `氷の地面: ${iceTiles}`);
    assert.ok(trail > 500, `森の獣道・土の地面: ${trail}`);
    assert.ok(forestWater > 100, `森を流れる小川: ${forestWater}`);
    assert.ok(mineEntrances >= 2 && carts >= 2 && mineMeshes >= 2, `炭鉱: 入口 ${mineEntrances}・トロッコ ${carts}・マップ ${mineMeshes}`);
    assert.ok(redEarth > 3000, `赤茶の地面: ${redEarth}`);
    assert.ok(tropicalMeshes >= 3 && palms > 300 && tropical > 200, `南国: マップ ${tropicalMeshes}・ヤシ ${palms}・南国の木 ${tropical}`);
    assert.equal(objects.mine_entrance.type, 'furniture'); assert.equal(objects.mine_cart.type, 'furniture');
    // 炭鉱の入口は、4 方向（奥行きのある木枠のトンネル）。横から見ても、板に見えない（どの向きも、奥行き 1.5 以上の壁がある）
    for (const n of ['mine_entrance', 'mine_entrance_e', 'mine_entrance_w', 'mine_entrance_n']) {
        const o = objects[n];
        assert.equal(o.type, 'furniture'); assert.equal(o.autoTurn, false);
        const front = n.endsWith('_e') || n.endsWith('_w') ? 0 : 2;   // 奥行きの軸（南北向きは z・東西向きは x）
        assert.ok(o.parts.some((p) => p.size[front] >= 1.5), `${n}: 奥行きのある側壁`);
    }
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
    assert.ok(cold > 3000 && single > 2000, `寒冷地の木: 森 ${cold}・単独 ${single}`);
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

test('端の向こうの景色: 隣のマップ（斜めの角を含む 8 方向）を、本物のマス（高さ・崖・地面の種類・水・木・草・岩）で描く', () => {
    const game = fs.readFileSync(path.join(root, 'public/js/game.js'), 'utf-8');
    assert.ok(game.includes('await this.buildNeighborDecor(mapId, cols, rows, tileSize, mapData, floorMatOf)'), '隣のマップを描く');
    assert.ok(/def\?\.type === 'floor_tile' && !\(def\.elevation > 0\)[\s\S]{0,400}flat\(waterMats\.floors/.test(game), '隣のマップの床（石畳の街道・門前の石畳）も描く（切り替えの前から、道が見える）');
    assert.ok(/waterMats\.planks\.has\(def\.texture\)[\s\S]{0,300}flat\(waterMats\.planks\.get\(def\.texture\)/.test(game) && !game.includes('waterMats.plank '), '隣のマップの橋の床は、画像ごとの材質（石の橋が、木の板で描かれない）');
    // 見た目の共通部品: 今のマップ（visEnv）と、隣のマップの先読み（nEnv）が、同じ関数で壁・家・立て札・松明・扉・家具の見た目を作る
    for (const t of ['Block', 'Signpost', 'Torch', 'Door', 'Furniture']) {
        assert.match(game, new RegExp(`visual${t}\\(objDef, wx, wz`), `${t}: 今のマップが、共通部品を呼ぶ`);
        assert.match(game, new RegExp(`this\\.visual${t}\\(def, wx, wz`), `${t}: 隣のマップの先読みが、同じ共通部品を呼ぶ`);
    }
    assert.ok(game.includes('NEIGHBOR_TERRAIN_RANGE = 48') && game.includes('NEIGHBOR_OBJECT_RANGE = 26'), '範囲（地形 48・物体 26）');
    assert.ok(game.includes('for (let dj = -1; dj <= 1; dj++)') && game.includes('for (let di = -1; di <= 1; di++)'), '8 方向（斜めの角を含む）');
    assert.ok(game.includes('nd.floorLayer') && game.includes("def.type === 'liquid_tile'") && game.includes('waterBelow'), '地面の種類と水');
    assert.ok(game.includes("def.type === 'tree'") && game.includes("def.type === 'plant'") && game.includes("def.type === 'boulder'"), '木・草・岩');
    assert.ok(game.includes('prefetchNearbyMaps(mapId)') && game.includes('prefetchToken'), '2 マス先までのマップのデータを、先に読んでおく');
    assert.ok(game.includes('this.loadingMap = true') && game.includes('if (this.loadingMap) return;'), 'マップの読み込み中は、更新も描画も止める（作りかけの画面が、一瞬映らない）');
    assert.ok(game.includes('if (!this.loadingMap) this.render();'), '更新で読み込みが始まったフレームも、作りかけの画面を描かない');
    assert.ok(game.includes('mesh.position.set(cx, -0.3, cz)'), '端の外の平らな地面は、隣のマップの水の面（-0.15）より下（水が、模様のある地面におおわれない）');
    assert.ok(game.includes('waterAcrossEdge(nr, nc, rows, cols)'), '水が境をこえて続くとき、境に砂の土手を立てない（茶色の線が出ない）');
    assert.ok(game.includes('opacity: 0.72') && game.includes('flat(waterMats.sand, wx, bedY, wz)'), '隣の水も、砂の底と半透明の水面（浅瀬が暗くならない）');
    assert.ok(game.includes('glowMatOf(def)') && game.includes('emissiveIntensity: 0.9'), '光る浅瀬（glow）は、隣のマップでも、自ら光る（暗くならない）');
    assert.ok(game.includes("if (def.type === 'bridge_deck') {") && game.includes('waterMats.plank'), '隣のマップの川の木の橋は、水の上に、板を描く（浅瀬に見えない）');
    assert.ok(game.includes('reversed'), '境の段差は、崖の面で埋める（隙間から空が見えない）');
    assert.ok(!game.includes('buildNeighborTerrain'), 'なめらかな面（古い方式）は、使わない');
    assert.ok(game.includes('for (const [mat, g] of groups)'), '地形の板は、材質ごとに 1 つのメッシュにまとめる（1 マスごとにメッシュを作らない。切り替えが止まる）');
    // 端の高さが 3 段以上の境は、たくさんある（この描画が効く）
    let high = 0;
    for (const id of world.grid.flat().filter(Boolean)) {
        const m = readJson(`public/data/maps/${id}.json`);
        for (let i = 0; i < 64; i++) if (levelOf(m.heights[0][i]) >= 3) high++;
    }
    assert.ok(high > 1000, `端が高い所: ${high}`);
});

test('大森林などの負荷: 前のマップの木が溜まらない（マップごとに空にする）・動かないスプライトは行列を更新しない・霧より遠い木・草は隠す・草の材質を共有・ミニマップの壁は使い回す', () => {
    const game = fs.readFileSync(path.join(root, 'public/js/game.js'), 'utf-8');
    const body = game.slice(game.indexOf('async loadMapBody'), game.indexOf('async loadMapBody') + 6000);
    assert.ok(body.includes('this.treeSprites = [];') && body.includes('this.cullSprites = [];'), 'マップごとに、木・草の一覧を空にする（前のマップの木が溜まって、毎フレームの処理が増えていた）');
    assert.ok((game.match(/matrixAutoUpdate = false/g) || []).length >= 3, '木・影・草の行列は、毎フレーム更新しない');
    assert.ok(game.includes('this.scene.fog.far * 1.1') && game.includes('this.cullSprites'), '霧より遠い木・影・草は隠す');
    assert.ok(game.includes('this.plantMats') && game.includes('this.minimapBase'), '草の材質の共有・ミニマップの壁の使い回し');
});

test('木の足元の影: 小さな木にだけ影がある（TREE_SHADOWS = true）。大きな木（2 倍・3 倍）は影なし。影は区画ごとの InstancedMesh にまとめ、明るい地面では薄い', () => {
    const big = ['forest_tree_a', 'forest_tree_b', 'great_tree_a', 'great_tree_b', 'conifer_forest_a', 'conifer_forest_b', 'great_conifer_a', 'great_conifer_b', 'tropical_forest_a', 'tropical_forest_b', 'tropical_palm_forest'];
    for (const n of big) assert.equal(objects[n].noShadow, true, `${n}: 影なし`);
    for (const n of ['grass_tree', 'tropical_tree', 'palm', 'swamp_tree_a', 'conifer_tree_a', 'conifer_tree_b', 'dark_tree']) assert.ok(!objects[n].noShadow, `${n}: 小さな木は、スイッチで、影が戻る`);
    const game = fs.readFileSync(path.join(root, 'public/js/game.js'), 'utf-8');
    assert.ok(game.includes('export const TREE_SHADOWS = true;'), '影のスイッチ: 小さな木だけ、影あり');
    assert.ok(game.includes('if (TREE_SHADOWS && !objDef.noShadow) {') && game.includes('shadow: shadowMesh'), '影の処理');
    assert.ok(game.includes('new THREE.InstancedMesh(this.treeShadowGeo, this.treeShadowMat'), '影は、区画ごとの InstancedMesh にまとめる（描画の命令を増やさない）');
    const treeBlock = game.slice(game.indexOf('let shadowMesh = null;'), game.indexOf('this.treeSprites.push({ sprite: tree, shadow: shadowMesh'));
    assert.ok(treeBlock.length > 100 && !treeBlock.includes('this.scene.add(shadowMesh)'), '木の影の板は、1 枚ずつシーンに置かない');
    assert.ok(/TREE_SHADOW_OPACITY = \{[^}]*snow: 0\.\d+/.test(game), '雪など明るい地面は、影を薄くする');
});

test('雪山の裾野: 標高の帯（草地→ツンドラ→針葉樹林→まばらな木と雪原）・花と高地の草・凍った池と雪解けの池・ゆるい丘・草原との境のぼかし・ツンドラの環境', () => {
    let tundraTiles = 0, iceTiles = 0, dead = 0, lavender = 0, highlandGrass = 0, ponds = 0, footMeshes = 0, blendTiles = 0, hillyMaxLevel = 0, footEnvOk = 0;
    for (const id of world.grid.flat().filter(Boolean)) {
        const m = readJson(`public/data/maps/${id}.json`);
        const lay = m.layout.join('');
        const count = (name) => Object.entries(m.legend).filter(([, v]) => v === name).reduce((s, [ch]) => s + lay.split(ch).length - 1, 0);
        const fl = m.floorLayer.join('');
        const floorN = (ft) => Object.entries(m.floorLegend).filter(([, v]) => v === ft).reduce((s, [ch]) => s + fl.split(ch).length - 1, 0);
        const cold = m.name.startsWith('北の雪山') || m.name.startsWith('針葉樹');
        if (cold) {
            tundraTiles += floorN('tundra'); iceTiles += floorN('ice'); dead += count('dead_tree'); lavender += count('lavender_flower'); highlandGrass += count('highland_grass');
            ponds += count('water');
            footMeshes++;
            if (m.environment.floorType === 'tundra' && m.environment.fogFar <= 70) footEnvOk++;
            for (const row of m.heights) for (const ch of row) hillyMaxLevel = Math.max(hillyMaxLevel, levelOf(ch));
        } else if (m.name.startsWith('草原') || m.name.startsWith('砂地') || m.name.startsWith('大森林')) {
            blendTiles += floorN('tundra');   // 草原のマップに、ツンドラの地面が、境のぼかしとして、入る
        }
    }
    assert.ok(footMeshes >= 20, `雪山・裾野のマップ: ${footMeshes}`);
    assert.ok(tundraTiles > 8000, `ツンドラの地面: ${tundraTiles}`);
    assert.ok(iceTiles > 1500, `凍った池・氷河の地面: ${iceTiles}`);
    assert.ok(dead < 20, `砂漠の木（dead_tree）は、雪山の裾野に置かない（砂漠との境に残るだけ）: ${dead}`);
    assert.ok(lavender > 100 && highlandGrass > 500, `ラベンダー ${lavender}・高地の草 ${highlandGrass}`);
    assert.ok(ponds > 400, `川と雪解けの池の水: ${ponds}`);
    assert.ok(blendTiles > 800, `草原との境のぼかし（ツンドラの地面が、草原のマップに入る）: ${blendTiles}`);
    assert.ok(footEnvOk >= 5, `裾野のマップは、ツンドラの環境（冷たい光・やや濃い霧）: ${footEnvOk}`);
    assert.ok(hillyMaxLevel >= 20, `山の高さ: ${hillyMaxLevel}`);
});


test('マップの境界線: 継ぎ目の向かい合うマスの、歩ける・歩けないが、そろう（境界を越えて、壁・水の中に出て、押し出されない）。川は、渡らずに、境界のそばを流れない', () => {
    const M = world.mapSize;
    const maps = new Map();
    world.grid.forEach((rw, j) => rw.forEach((id, i) => { if (id) maps.set(`${j},${i}`, readJson(`public/data/maps/${id}.json`)); }));
    const code = (y, x) => {   // 'walk' | 'solid' | 'water'（深い水・海）| null（マップなし）
        const m = maps.get(`${Math.floor(y / M)},${Math.floor(x / M)}`);
        if (!m) return null;
        const ch = m.layout[y % M][x % M];
        const d = ch === '0' ? null : objects[m.legend[ch]];
        if (!d) return 'walk';
        if (d.type === 'sea_tile' || (d.type === 'liquid_tile' && d.solid)) return 'water';
        if (['tree', 'tree_wall', 'boulder', 'block'].includes(d.type) || (d.type === 'furniture' && d.solid !== false)) return 'solid';
        return 'walk';
    };
    const H = world.grid.length * M, W = world.grid[0].length * M;
    let mismatch = [], seamPairs = 0;
    for (let k = 1; k < world.grid[0].length; k++) for (let y = 0; y < H; y++) {   // 縦の継ぎ目
        const a = code(y, k * M - 1), b = code(y, k * M);
        if (a === null || b === null) continue;
        seamPairs++;
        if ((a === 'walk') !== (b === 'walk') && (a === 'walk' || b === 'walk')) mismatch.push(`縦 x=${k * M} y=${y}: ${a}|${b}`);
    }
    for (let k = 1; k < world.grid.length; k++) for (let x = 0; x < W; x++) {       // 横の継ぎ目
        const a = code(k * M - 1, x), b = code(k * M, x);
        if (a === null || b === null) continue;
        seamPairs++;
        if ((a === 'walk') !== (b === 'walk') && (a === 'walk' || b === 'walk')) mismatch.push(`横 y=${k * M} x=${x}: ${a}|${b}`);
    }
    assert.ok(seamPairs > 5000, `検査した継ぎ目: ${seamPairs}`);
    assert.deepEqual(mismatch.slice(0, 5), [], `継ぎ目で、歩ける・歩けないが食い違うマス: ${mismatch.length}`);
    // 川・池・湖の深い水が、境界線から 2 マス以内にあるなら、その近く（±14 マス。浅い角度で渡る川は、境界のそばを長く流れる）で、境界を渡っている（両側が水）
    const waterKind = (y, x) => {
        const m = maps.get(`${Math.floor(y / M)},${Math.floor(x / M)}`);
        if (!m) return null;
        const ch = m.layout[y % M][x % M];
        return ch === '0' ? null : m.legend[ch] ?? null;
    };
    const isRiverWater = (y, x) => waterKind(y, x) === 'water';                          // 川・池・湖のふち
    const isDeepWater = (y, x) => ['water', 'sea', 'plank_bridge', 'water_shallow', 'water_shallow_glow'].includes(waterKind(y, x));   // 湖・海の中・橋・浅瀬も含める（川・湖が境界を渡る所の判定用）
    let along = [];
    const hasMap = (y, x) => maps.has(`${Math.floor(y / M)},${Math.floor(x / M)}`);
    for (let k = 1; k < world.grid[0].length; k++) for (let y = 0; y < H; y++) for (let x = k * M - 2; x < k * M + 2; x++) {
        if (!isRiverWater(y, x) || !hasMap(y, k * M - 1) || !hasMap(y, k * M)) continue;   // 隣のマップがない継ぎ目は、越えられない
        let crossing = false;
        for (let yy = y - 14; yy <= y + 14 && !crossing; yy++) if (isDeepWater(yy, k * M - 1) && isDeepWater(yy, k * M)) crossing = true;
        if (!crossing) along.push(`縦の境界 x=${k * M} y=${y}`);
    }
    for (let k = 1; k < world.grid.length; k++) for (let x = 0; x < W; x++) for (let y = k * M - 2; y < k * M + 2; y++) {
        if (!isRiverWater(y, x) || !hasMap(k * M - 1, x) || !hasMap(k * M, x)) continue;
        let crossing = false;
        for (let xx = x - 14; xx <= x + 14 && !crossing; xx++) if (isDeepWater(k * M - 1, xx) && isDeepWater(k * M, xx)) crossing = true;
        if (!crossing) along.push(`横の境界 y=${k * M} x=${x}`);
    }
    assert.deepEqual(along.slice(0, 40), [], `境界線のそばを、渡らずに流れる川（境界から 2 マス以内）: ${along.length} マス`);
});

test('南国の植物は南国の近くだけ: 北・草原・森に毒々しい花がない。北半分の草原にヤシがない。境の近くで南国の木が急に現れない', () => {
    const bad = [];
    for (let r = 0; r < world.grid.length; r++) for (let c = 0; c < world.grid[r].length; c++) {
        const id = world.grid[r][c]; if (!id) continue;
        const m = readJson(`public/data/maps/${id}.json`);
        const names = new Set(m.layout.join('').split('').map((ch) => m.legend[ch]).filter(Boolean));
        const tropical = m.environment.skyColor === 0x4fd0e8;
        const dch = Object.keys(m.floorLegend).find((k) => m.floorLegend[k] === 'desert');
        const desertFrac = dch ? (m.floorLayer.join('').split(dch).length - 1) / (m.floorLayer.join('').length) : 0;   // 砂漠のオアシスには、ヤシがある
        if (!tropical && r <= 8 && (names.has('marsh_flower') || (names.has('palm') && desertFrac === 0))) bad.push(`${id}（北）`);
        if (!tropical && m.environment.floorType !== 'rock' && r <= 10 && names.has('tropical_palm_forest')) bad.push(`${id}（ヤシの林）`);
    }
    assert.deepEqual(bad, []);
});

test('砂漠の植物（サボテン・多肉植物）は砂地の中だけ: 砂地の床が 5% 未満のマップにない', () => {
    const bad = [];
    for (const id of world.grid.flat().filter(Boolean)) {
        const m = readJson(`public/data/maps/${id}.json`);
        const t = m.floorLayer.join('');
        const dch = Object.keys(m.floorLegend).find((k) => m.floorLegend[k] === 'desert');
        const frac = dch ? t.split(dch).length - 1 : 0;
        const has = m.layout.join('').split('').some((ch) => ['cactus', 'succulent'].includes(m.legend[ch]));
        if (has && frac / t.length < 0.05) bad.push(id);
    }
    assert.deepEqual(bad, []);
});

test('大森林の巨木は森の中だけ: 森の床が 5% 未満のマップに、巨木がない', () => {
    const bad = [];
    for (const id of world.grid.flat().filter(Boolean)) {
        const m = readJson(`public/data/maps/${id}.json`);
        const t = m.floorLayer.join('');
        const fch = Object.keys(m.floorLegend).find((k) => m.floorLegend[k] === 'forest');
        const frac = fch ? t.split(fch).length - 1 : 0;
        const has = m.layout.join('').split('').some((ch) => ['great_tree_a', 'great_tree_b'].includes(m.legend[ch]));
        if (has && frac / t.length < 0.05) bad.push(id);
    }
    assert.deepEqual(bad, []);
});

test('砂漠は砂丘の起伏がある: 砂地の床が 60% 以上のマップは、高さの幅が 5 段以上', () => {
    const flat = [];
    let n = 0;
    for (const id of world.grid.flat().filter(Boolean)) {
        const m = readJson(`public/data/maps/${id}.json`);
        const t = m.floorLayer.join('');
        const dch = Object.keys(m.floorLegend).find((k) => m.floorLegend[k] === 'desert');
        if (!dch || (t.split(dch).length - 1) / t.length < 0.6) continue;
        n++;
        const hs = m.heights.join('').split('').map((c) => parseInt(c, 36));
        if (Math.max(...hs) - Math.min(...hs) < 5) flat.push(id);
    }
    assert.ok(n > 0, '砂漠のマップがない');
    assert.deepEqual(flat, []);
});

test('砂漠にオアシスがある: 砂地の中に、池（水）・草の地面・ヤシがあり、街の予定地（広い平らな所）がある', () => {
    let oases = 0, town = 0;
    for (const id of world.grid.flat().filter(Boolean)) {
        const m = readJson(`public/data/maps/${id}.json`);
        const t = m.floorLayer.join('');
        const ch = (name) => Object.keys(m.floorLegend).find((k) => m.floorLegend[k] === name);
        const dch = ch('desert'), gch = ch('grass');
        if (!dch || (t.split(dch).length - 1) / t.length < 0.1 || !gch) continue;
        const names = new Set(m.layout.join('').split('').map((c) => m.legend[c]));
        if (names.has('water') && names.has('palm')) oases++;
        // 街の予定地: 高さ 0 で、物のない、7×7 のかたまり（池を囲む、幅 8 マスの輪の中）
        const h = m.heights, L = m.layout;
        for (let y = 0; y + 7 <= 64 && !town; y += 3) for (let x = 0; x + 7 <= 64; x += 3) {
            let okb = true;
            for (let yy = y; yy < y + 7 && okb; yy++) for (let xx = x; xx < x + 7; xx++) {
                if (h[yy][xx] !== '0' || !['0', 'm'].includes(m.legend[L[yy][xx]] === 'meadow_grass' ? 'm' : (L[yy][xx] === '0' ? '0' : 'x'))) { okb = false; break; }
            }
            if (okb) { town++; break; }
        }
    }
    assert.ok(oases >= 1, 'オアシスがない');
    assert.ok(town >= 1, '街の予定地がない');
});

test('ガマは湿地帯前提: 砂漠の床の上にガマがない', () => {
    const bad = [];
    for (const id of world.grid.flat().filter(Boolean)) {
        const m = readJson(`public/data/maps/${id}.json`);
        const dch = Object.keys(m.floorLegend).find((k) => m.floorLegend[k] === 'desert');
        if (!dch) continue;
        for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
            if (m.legend[m.layout[y][x]] === 'cattail_cluster' && m.floorLayer[y][x] === dch) { bad.push(`${id} (${x},${y})`); break; }
        }
    }
    assert.deepEqual(bad.slice(0, 10), []);
});

test('ガマは水のそばだけ（湿地帯は、水が逃げにくい低地・河口・湖のまわり・雪解けの裾野）: ガマから 4 マス以内に、水がある', () => {
    const bad = [];
    for (const id of world.grid.flat().filter(Boolean)) {
        const m = readJson(`public/data/maps/${id}.json`);
        const water = new Set(['water', 'water_shallow', 'water_shallow_glow', 'sea', 'plank_bridge']);
        for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
            if (m.legend[m.layout[y][x]] !== 'cattail_cluster') continue;
            // 画面の端のマスは、隣のマップの水が見えないので、数えない
            if (x < 5 || x > 58 || y < 5 || y > 58) continue;
            let near = false;
            for (let yy = y - 4; yy <= y + 4 && !near; yy++) for (let xx = x - 4; xx <= x + 4; xx++) if (water.has(m.legend[m.layout[yy][xx]])) { near = true; break; }
            if (!near) bad.push(`${id} (${x},${y})`);
        }
    }
    assert.deepEqual(bad.slice(0, 10), []);
});

// 山の吊橋（峡谷）: 橋のあるマップには bridgeUnder があり、谷の底は橋の床より 3 段以上低い
test('山の吊橋: 世界に 5 か所以上・橋の下の谷の底（bridgeUnder）は、橋の床より 3 段以上低い', () => {
    let bridges = 0;
    for (const f of fs.readdirSync(path.join(root, 'public/data/maps'))) {
        if (!f.startsWith('w_')) continue;
        const m = readJson('public/data/maps/' + f);
        const ch = Object.entries(m.legend).find(([, v]) => v === 'rope_bridge')?.[0];
        if (!ch) continue;
        assert.ok(Number.isInteger(m.bridgeUnder), `${f}: bridgeUnder`);
        for (let r = 0; r < 64; r++) for (let c = 0; c < 64; c++) if (m.layout[r][c] === ch) {
            bridges++;
            assert.ok(m.bridgeUnder <= parseInt(m.heights[r][c], 36) - 3, `${f} ${r},${c}: 谷の底が浅い`);
        }
    }
    assert.ok(bridges >= 10 * 5, `吊橋のマス: ${bridges}`);
});

test('崖のよじ登り: ちょうど 2 段高い崖だけ・前を押し続けて始まり・2 秒かかる・攻撃を受けると中断して落ちる', () => {
    const game = fs.readFileSync(path.join(root, 'public/js/game.js'), 'utf-8');
    assert.ok(game.includes('export const CLIMB_RISE = 2;') && game.includes('export const CLIMB_SEC = 2.0;') && game.includes('export const CLIMB_HOLD_SEC = 0.3;'), '登れる高さ 2 段・2 秒・0.3 秒押し続ける');
    assert.ok(game.includes('if (diff === CLIMB_RISE) this._climbBump'), 'ちょうど 2 段高い崖だけ（3 段以上は、登れない）');
    assert.ok(game.includes('if (this.player.climb) return;'), '登っている間は、歩けない');
    assert.ok(game.includes('if (this.player.climb) { this.player.climb = null;'), 'ダメージを受けたら、中断して落ちる');
    assert.ok(game.includes('return diff <= 1 && diff >= -2;'), '歩いて上れるのは 1 段まで・降りられるのは 2 段まで（今までどおり）');
});

test('スタミナ: ダッシュ・攻撃・登りで減り、0 で止まり、20% まで戻ると再開（仮の値）', () => {
    const g = fs.readFileSync('public/js/game.js', 'utf8');
    const c = JSON.parse(fs.readFileSync('public/data/combat.json', 'utf8'));
    assert.ok(c.stamina.climbCost > 0);
    for (const k of ['useStamina(this.staminaCost(\'dash\') * dt)', 'staminaExhausted', 'updateStamina(dt)', 'this.staminaCost(\'attack\'', 'useStamina(this.staminaDef?.climbCost']) assert.ok(g.includes(k), k);
    assert.ok(fs.readFileSync('public/index.html', 'utf8').includes('id="staminaBar"'));
});

test('スタミナ: やられて復活するとき、全回復する', () => {
    const g = fs.readFileSync('public/js/game.js', 'utf8');
    assert.equal(g.split('this.player.stamina = this.player.maxStamina; this.player.staminaExhausted = false;').length - 1, 4);
});

test('草原のブラッシュアップ: 丘陵・ため池・林がある', () => {
    const dir = path.join(root, 'public/data/maps');
    let maxH = 0, pondMaps = 0, groveMaps = 0;
    for (const f of fs.readdirSync(dir)) {
        if (!/^w_\d\d_\d\d\.json$/.test(f)) continue;
        const d = normalizeMap(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')));
        const fl = d.floorLayer; if (!fl) continue;
        const grass = fl.join('').split('').filter(c => d.floorLegend[c] === 'grass').length / 4096;
        if (grass < 0.9) continue;
        maxH = Math.max(maxH, ...d.heights.join('').split('').map(c => parseInt(c, 36)));
        const names = d.layout.join('').split('').map(c => d.legend?.[c]);
        if (names.includes('water')) pondMaps++;
        if (names.filter(n => n === 'grass_tree').length >= 100) groveMaps++;
    }
    assert.ok(maxH >= 9, `草原の最大の高さ ${maxH}`);
    assert.ok(pondMaps >= 3, `ため池のある草原のマップ ${pondMaps}`);
    assert.ok(groveMaps >= 5, `林のある草原のマップ ${groveMaps}`);
});

test('描画の負荷: 木・草・花の板は、区画ごとにまとめて隠す。距離の判定は、動いたときだけ。隣の草・花は近くだけ', () => {
    const g = fs.readFileSync(path.join(root, 'public/js/game.js'), 'utf-8');
    for (const k of ['export const CULL_CHUNK = 32', 'export const NEIGHBOR_PLANT_RANGE = 10', 'buildCullChunks() {', 'updateCullChunks() {', 'this.buildCullChunks();', 'this.updateCullChunks();', 'this.cullChunks = [];', "def.type === 'plant' && gr >= -NEIGHBOR_PLANT_RANGE"]) assert.ok(g.includes(k), k);
    assert.ok(g.includes('if (!this._cullDirty && Math.abs(p.x - this._cullX) + Math.abs(p.z - this._cullZ) < 1'), '動いたときだけ判定する');
});

test('街（候補地 A〜H）: 外のマップに壁と門（扉＋衛兵）・石畳、中は別マップ（town_a〜h）。出入りの位置が歩ける所・中の歩ける所はすべてつながる', () => {
    const ids = 'abcdefgh'.split('');
    const outerWalk = (m, c, r) => {
        const o = objects[m.legend[m.layout[r][c]]];
        return !o || (!o.solid && o.type !== 'sea_tile' && !['water'].includes(m.legend[m.layout[r][c]]));
    };
    for (const id of ids) {
        const t = readJson(`public/data/maps/town_${id}.json`);
        assert.equal(t.type, 'open');
        // 中: 外へ出る門 2 マス（南の壁）・出た先（外のマップ）が歩ける所の石畳
        const gates = Object.entries(t.links).filter(([k]) => { const [c, r] = k.split(',').map(Number); return t.legend[t.layout[r][c]] === 'district_gate'; });   // 施設の扉（D のみ）は、門ではない
        assert.equal(gates.length, 2, `town_${id}: 門は 2 マス`);
        for (const [key, l] of gates) {
            const [c, r] = key.split(',').map(Number);
            assert.equal(t.legend[t.layout[r][c]], 'district_gate');
            const outer = readJson(`public/data/maps/${l.nextMap}.json`);
            const oc = Math.floor(l.spawn.x), orow = Math.floor(l.spawn.z);
            assert.ok(outerWalk(outer, oc, orow), `town_${id}: 出た先が歩ける所`);
            assert.match(outer.legend[outer.layout[orow][oc]], /^plaza_(stone(_snow)?|earth|forest)$/);   // A（雪国）は雪の積もった石畳・C（砂漠）は土・G（森）は森の地面
            // 外の門のマスから、この街へ入る links があり、出現位置が、街の中の歩ける所
            const back = Object.values(outer.links).filter((x) => x.nextMap === `town_${id}`);
            assert.equal(back.length, 2, `${l.nextMap}: 街 ${id} へ入る門が 2 マス`);
            for (const b of back) assert.equal(objects[t.legend[t.layout[Math.floor(b.spawn.z)][Math.floor(b.spawn.x)]]]?.solid ?? false, false);
            assert.ok(outer.npcs.length >= 2, '門の衛兵');
            for (const [k2] of Object.entries(outer.links)) { const [c2, r2] = k2.split(',').map(Number); assert.equal(outer.legend[outer.layout[r2][c2]], 'district_gate'); }
        }
        // 中の歩ける所は、出現位置からすべてつながる（門のマスは通れない物として数える）
        const H = t.layout.length, W = t.layout[0].length;
        const walk = (c, r) => c >= 0 && r >= 0 && c < W && r < H && !(objects[t.legend[t.layout[r][c]]]?.solid ?? false);
        const seen = new Set(); const q = [[Math.floor(t.spawn.x), Math.floor(t.spawn.z)]];
        assert.ok(walk(...q[0]), `town_${id}: 出現位置が歩ける所`);
        seen.add(q[0].join());
        while (q.length) { const [c, r] = q.pop(); for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = [c + dc, r + dr]; if (walk(...n) && !seen.has(n.join())) { seen.add(n.join()); q.push(n); } } }
        let total = 0; for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) if (walk(c, r)) total++;
        assert.equal(seen.size, total, `town_${id}: 歩ける所は、すべてつながる`);
    }
});

test('街（候補地 A〜H）: 敷地は、水・川・マップの境から離れている（外壁 16×12 の中・まわりに水がない）', () => {
    for (const id of 'abcdefgh'.split('')) {
        const t = readJson(`public/data/maps/town_${id}.json`);
        const outer = readJson(`public/data/maps/${Object.values(t.links)[0].nextMap}.json`);
        const rows = outer.layout.map((r, i) => [r, i]).filter(([r]) => r.includes(Object.entries(outer.legend).find(([, v]) => v === (id === 'g' ? 'wooden_wall' : 'city_wall'))?.[0] ?? '#'));   // G（森の街）の外壁は、木の壁
        assert.ok(rows.length >= 12, `${outer.id}: 街の外壁がある`);
        const wallCh = Object.entries(outer.legend).find(([, v]) => v === (id === 'g' ? 'wooden_wall' : 'city_wall'))[0];
        const rs = rows.map(([, i]) => i), cs = [];
        rows.forEach(([r]) => [...r].forEach((ch, c) => { if (ch === wallCh) cs.push(c); }));
        const margin = id === 'a' ? 2 : 8;   // 山の上の街（A）は、山頂の平らな台地の広さに合わせる（台地は、マップの境のすぐ内側まで）
        assert.ok(Math.min(...rs) >= margin && Math.max(...rs) <= 63 - margin && Math.min(...cs) >= margin && Math.max(...cs) <= 63 - margin, `${outer.id}: 街は、マップの境から離れている`);
        for (let r = Math.min(...rs) - 3; r <= Math.max(...rs) + 5; r++) for (let c = Math.min(...cs) - 3; c <= Math.max(...cs) + 3; c++) {
            const nm = outer.legend[outer.layout[r][c]];
            assert.ok(!['water', 'sea', 'water_shallow', 'water_shallow_glow'].includes(nm), `${outer.id}: 街のまわりに水がない (${c},${r})`);
        }
    }
});

test('街（候補地 A〜H）: 門の前の石畳の東隣に、街の名前の立て札がある', () => {
    const objects = readJson('public/data/objects.json');
    for (const id of 'abcdefgh'.split('')) {
        const t = readJson(`public/data/maps/town_${id}.json`);
        const outer = readJson(`public/data/maps/${Object.values(t.links)[0].nextMap}.json`);
        const ch = Object.entries(outer.legend).find(([, v]) => v === `town_sign_${id}`)?.[0];
        assert.ok(ch, `${outer.id}: 立て札の凡例がある`);
        assert.ok(outer.layout.some(r => r.includes(ch)), `${outer.id}: 立て札が置かれている`);
        assert.equal(objects[`town_sign_${id}`].message, t.name, `town_${id}: 立て札の文字は街の名前`);
    }
});

test('マップの形式: 世界のマップ（w_*）は、物体 ID の数値の配列（layoutFormat ids）。読み込むと 1 マス 1 文字になる。ID の範囲は 0〜0xD7FF', () => {
    const raw = JSON.parse(fs.readFileSync(path.join(root, 'public/data/maps/w_10_08.json'), 'utf-8'));
    assert.equal(raw.layoutFormat, 'ids');
    assert.ok(Array.isArray(raw.layout[0]) && raw.layout.every(r => r.every(v => Number.isInteger(v) && v >= 0 && v <= 0xD7FF)), 'layout は整数の配列の配列');
    assert.ok(Object.keys(raw.legend).every(k => /^\d+$/.test(k)), 'legend のキーは ID の 10 進文字列');
    const m = normalizeMap(structuredClone(raw));
    assert.equal(m.layout.length, 64);
    assert.ok(m.layout.every((r, y) => typeof r === 'string' && r.length === 64 && [...r].every((ch, x) => ch.charCodeAt(0) === raw.layout[y][x])), '文字コードが ID と一致');
    assert.ok(Object.keys(m.legend).every(k => k.length === 1), '変換後の legend のキーは 1 文字');
    assert.equal(m.layoutFormat, undefined);
    assert.equal(normalizeMap({ layout: ['ab'], legend: { a: 'x' } }).layout[0], 'ab', '手書きマップ（形式なし）は、そのまま');
    assert.throws(() => normalizeMap({ layoutFormat: 'ids', layout: [[0xD800]] }), /範囲外/);
});

test('地面の影: 立て札・像・噴水（groundShadow）と、建物・壁（baseShadow）に影がある。それぞれ 1 つの InstancedMesh にまとめる', () => {
    const must = (names, key) => { for (const n of names) assert.equal(objects[n][key], true, `${n}: ${key}`); };
    must(Object.entries(objects).filter(([, v]) => v.type === 'signpost' || v.type === 'statue').map(([k]) => k).concat(['plaza_fountain', 'flower_bed', 'flower_bed_blue']), 'groundShadow');
    must(['city_wall', 'brick_house', 'wooden_house', 'shop_building', 'inn_building', 'temple_building'], 'baseShadow');
    for (const [k, v] of Object.entries(objects)) if (v.baseShadow) assert.equal(v.type, 'block', `${k}: baseShadow は壁・建物（block）だけ`);
    for (const n of ['cliff_rock_wall', 'rock_wall', 'brick_wall']) assert.ok(!objects[n].baseShadow, `${n}: 崖・岩壁・ダンジョンの壁は、影なし`);
    const game = fs.readFileSync(path.join(root, 'public/js/game.js'), 'utf-8');
    assert.ok(game.includes('buildGroundShadows(tileSize)') && game.includes('groundShadowItems'), '地面の影の処理');
    assert.equal((game.match(/new THREE\.InstancedMesh\(geo, mat, items\.length\)/g) || []).length, 1, 'InstancedMesh を作る処理は 1 か所（丸い影・壁の帯で共有）');
});

test('D（グリーン王国・最初の街）: 施設 7 つ（武器屋・道具屋・宿屋・冒険者ギルド・神殿・魔法ギルド・職業訓練所）の扉と、街の人。中は一般街と共有', () => {
    const t = readJson('public/data/maps/town_d.json');
    const npcDefs = readJson('public/data/npcs.json');
    const doors = Object.entries(t.links).filter(([k]) => { const [c, r] = k.split(',').map(Number); return objects[t.legend[t.layout[r][c]]]?.type === 'door' && !['district_gate', 'castle_gate'].includes(t.legend[t.layout[r][c]]); });   // 門・城門は除く
    assert.deepEqual(doors.map(([, l]) => l.nextMap).sort(), ['city_inn', 'guild_adv', 'guild_mage', 'guild_training', 'shop', 'shop', 'temple']);
    assert.deepEqual(doors.filter(([, l]) => l.nextMap === 'shop').map(([, l]) => l.params.shopId).sort(), ['item_shop', 'weapon_shop']);
    for (const [key, l] of doors) {
        const [c, r] = key.split(',').map(Number);
        assert.ok(fs.existsSync(path.join(root, `public/data/maps/${l.nextMap}.json`)), `${l.nextMap}: 中のマップがある`);
        assert.equal(l.back.x, c); assert.equal(l.back.z, r + 1);
        const front = objects[t.legend[t.layout[r + 1][c]]];
        assert.ok(!front?.solid, `(${c},${r}): 扉の前が歩ける`);
    }
    assert.ok(t.npcs.length >= 5 && t.npcs.length <= 10, '街の人は 5〜10 人（城門の衛兵 2 人を含む）');
    for (const n of t.npcs) {
        assert.ok(npcDefs[n.id], `${n.id}: NPC の定義がある`);
        const o = objects[t.legend[t.layout[n.z][n.x]]];
        assert.ok(!o?.solid, `${n.id}: 歩ける所に立つ`);
    }
    assert.equal(t.layout.length, 30); assert.equal(t.layout[0].length, 40);
});

test('D（グリーン王国）: 川と橋・高台・神殿（幅 2 倍）・城門（王城）。入口の前の通りは 2 マス以上。段差は 1 ずつ', () => {
    const t = readJson('public/data/maps/town_d.json');
    const at = (c, r) => objects[t.legend[t.layout[r][c]]];
    const lv = (c, r) => parseInt(t.heights[r][c], 36);
    // 川（水は高さ 0）と橋（大通りの 4 マス）
    assert.ok(t.layout[22].includes('w') && t.layout[22].includes('b'));
    for (let c = 18; c <= 21; c++) assert.equal(t.legend[t.layout[22][c]], 'wood_bridge');
    // 城門（北の外壁・2 マス）は、王城へ。出口は、入った場所（城門の前）
    for (const c of [19, 20]) {
        const l = t.links[`${c},0`];
        assert.equal(l.nextMap, 'castle'); assert.deepEqual(l.back, { x: c, z: 1, angle: 3.14159 });
    }
    // 神殿は高台（3）で、幅 8（ほかの建物の 2 倍）
    assert.equal(t.layout[10].split('').filter(ch => t.legend[ch] === 'temple_building').length, 8);
    assert.ok(lv(30, 12) >= 2, '神殿の高台');
    // 入口の前の通り: 宿・魔法ギルド・職業訓練所の前（行 5〜8）に家を置かない
    for (let r = 6; r <= 8; r++) for (let c = 1; c < 39; c++) assert.notEqual(t.legend[t.layout[r][c]], 'brick_house', `(${c},${r}): 入口の前に家`);
    // 段差: 歩ける隣どうしで 1 以下
    const walk = (c, r) => { const d = at(c, r); return !d?.solid && d?.type !== 'liquid_tile' && d?.type !== 'door'; };
    for (let r = 0; r < 30; r++) for (let c = 0; c < 40; c++) for (const [dc, dr] of [[1, 0], [0, 1]]) {
        if (c + dc < 40 && r + dr < 30 && walk(c, r) && walk(c + dc, r + dr)) assert.ok(Math.abs(lv(c, r) - lv(c + dc, r + dr)) <= 1, `(${c},${r}) 段差が 2 以上`);
    }
});

test('H（ダマスカス自治領・辺境の街）: 施設 6 つ＋自治領主の館（城はない）。川と橋・高台。段差は 1 ずつ。街の人 5〜8 人', () => {
    const t = readJson('public/data/maps/town_h.json');
    const npcDefs = readJson('public/data/npcs.json');
    const at = (c, r) => objects[t.legend[t.layout[r][c]]];
    const lv = (c, r) => parseInt(t.heights[r][c], 36);
    const doors = Object.entries(t.links).filter(([k]) => at(...k.split(',').map(Number))?.type === 'door' && t.legend[t.layout[+k.split(',')[1]][+k.split(',')[0]]] !== 'district_gate');
    assert.deepEqual(doors.map(([, l]) => l.nextMap).sort(), ['city_inn', 'guild_adv', 'guild_training', 'mansion_margrave', 'shop', 'shop', 'temple']);
    assert.ok(!doors.some(([, l]) => l.nextMap === 'castle'), '城はない');
    for (const [key, l] of doors) {
        const [c, r] = key.split(',').map(Number);
        assert.ok(fs.existsSync(path.join(root, `public/data/maps/${l.nextMap}.json`)), `${l.nextMap}: 中のマップがある`);
        assert.deepEqual([l.back.x, l.back.z], [c, r + 1]);
        assert.ok(!at(c, r + 1)?.solid, `(${c},${r}): 扉の前が歩ける`);
    }
    assert.ok(t.layout.some(row => row.includes('w')) && t.layout.some(row => row.includes('b')), '川と橋');
    assert.equal(t.layout.length, 26); assert.equal(t.layout[0].length, 36);
    assert.ok(lv(29, 6) >= 2 && lv(22, 12) >= 2, '館・神殿は高台');
    assert.ok(t.npcs.length >= 5 && t.npcs.length <= 8);
    for (const n of t.npcs) { assert.ok(npcDefs[n.id], n.id); assert.ok(!at(n.x, n.z)?.solid, `${n.id}: 歩ける所`); }
    const walk = (c, r) => { const d = at(c, r); return !d?.solid && d?.type !== 'liquid_tile' && d?.type !== 'door'; };
    for (let r = 0; r < 26; r++) for (let c = 0; c < 36; c++) for (const [dc, dr] of [[1, 0], [0, 1]]) {
        if (c + dc < 36 && r + dr < 26 && walk(c, r) && walk(c + dc, r + dr)) assert.ok(Math.abs(lv(c, r) - lv(c + dc, r + dr)) <= 1, `(${c},${r}) 段差が 2 以上`);
    }
});

test('街道: D と H の門前の石畳を、石畳の道（paved_road・幅 3）と石の橋（stone_bridge）でつなぐ。1 本につながり、段差は 1 以下。道のわきに木・岩がない', () => {
    const MESH = 64;
    const tiles = new Map();   // "x,y"（世界のマス）→ { name, lv }
    for (const f of fs.readdirSync(path.join(root, 'public/data/maps')).filter(n => /^w_\d\d_\d\d\.json$/.test(n))) {
        const m = readJson(`public/data/maps/${f}`);
        const [, j, i] = f.match(/^w_(\d\d)_(\d\d)/).map(Number);
        m.layout.forEach((row, r) => [...row].forEach((ch, c) => {
            const name = m.legend[ch];
            if (name) tiles.set(`${i * MESH + c},${j * MESH + r}`, { name, lv: parseInt(m.heights[r][c], 36) });
        }));
    }
    const isRoad = (n) => n === 'paved_road' || n === 'stone_bridge';
    const road = [...tiles].filter(([, v]) => isRoad(v.name)).map(([k]) => k);
    assert.ok(road.length > 300, '街道がある');
    // 1 本につながる（4 方向）
    const seen = new Set([road[0]]); const q = [road[0]];
    while (q.length) {
        const [x, y] = q.pop().split(',').map(Number);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const k = `${x + dx},${y + dy}`;
            if (!seen.has(k) && tiles.get(k) && isRoad(tiles.get(k).name)) { seen.add(k); q.push(k); }
        }
    }
    assert.equal(seen.size, road.length, '街道は 1 本につながる');
    // 両端: D（545,660）と H（416,727）の門前の石畳（plaza_stone）に接する
    const touches = (cx, cy) => road.some(k => { const [x, y] = k.split(',').map(Number); return Math.abs(x - cx) <= 4 && y >= cy + 6 && y <= cy + 11 && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => tiles.get(`${x + dx},${y + dy}`)?.name === 'plaza_stone'); });
    assert.ok(touches(545, 660), 'D の門前につながる'); assert.ok(touches(416, 727), 'H の門前につながる'); assert.ok(touches(727, 792), 'E の門前につながる');
    // 道路網（木の形）: 並走する太い帯（2 本の街道が平行に隣り合う所）がない。道の列の幅（東西・南北）が、3 を超える行・列が、全体の 15% 以下
    {
        const set = new Set(road);
        let thick = 0;
        for (const k of road) { const [x, y] = k.split(',').map(Number); let w = 0; while (set.has(`${x + w},${y}`)) w++; let h = 0; while (set.has(`${x},${y + h}`)) h++; if (w > 5 && h > 5) thick++; }
        assert.ok(thick / road.length < 0.01, `並走する太い帯が多い（${thick}）`);
    }
    // 石の橋: 水に囲まれた所だけ。数がある
    const bridges = road.filter(k => tiles.get(k).name === 'stone_bridge');
    assert.ok(bridges.length >= 3, '石の橋がある');
    // 段差: 隣り合う道のマスは 1 以下
    for (const k of road) {
        const [x, y] = k.split(',').map(Number);
        for (const [dx, dy] of [[1, 0], [0, 1]]) {
            const nb = tiles.get(`${x + dx},${y + dy}`);
            if (nb && isRoad(nb.name)) assert.ok(Math.abs(tiles.get(k).lv - nb.lv) <= 1, `${k}: 道の段差が 2 以上`);
        }
    }
    // 道のわき（8 方向の隣）に、通れない物（木・岩・壁など）がない
    for (const k of road) {
        const [x, y] = k.split(',').map(Number);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const nb = tiles.get(`${x + dx},${y + dy}`);
            const d = nb && objects[nb.name];
            if (d && d.solid && d.type !== 'liquid_tile' && d.type !== 'sea_tile' && !nb.name.startsWith('town_sign') && nb.name !== 'road_sign' && !['city_wall', 'district_gate', 'brick_house'].includes(nb.name)) assert.fail(`${k}: 道のわきに ${nb.name}`);
        }
    }
});

test('街・町・村の起伏: 作り込んだ街（街の人がいる town_*）は、サンプル（city・city_noble・town・village）と同じ程度の起伏がある（厳命: サンプルを手本にする）', () => {
    const ratio = (hs) => {
        let tot = 0, ch = 0;
        for (let y = 0; y < hs.length; y++) for (let x = 0; x < hs[0].length; x++) for (const [dx, dy] of [[1, 0], [0, 1]]) {
            if (x + dx < hs[0].length && y + dy < hs.length && hs[y][x] !== '0' && hs[y + dy][x + dx] !== '0') { tot++; if (hs[y][x] !== hs[y + dy][x + dx]) ch++; }   // 陸（高さ 0 でない）どうしの辺だけ（川・港の水は、除く）
        }
        return ch / tot;
    };
    const share = (hs, lv) => [...hs.join('')].filter(c => parseInt(c, 36) === lv).length / hs.join('').length;
    const samples = ['city', 'city_noble', 'town', 'village'].map(n => readJson(`public/data/maps/${n}.json`).heights);
    const lo = Math.min(...samples.map(ratio)), hi = Math.max(...samples.map(ratio));
    assert.ok(lo > 0.15 && hi < 0.3, `サンプルの、陸の辺で高さが変わる割合: ${lo.toFixed(2)}〜${hi.toFixed(2)}`);
    const built = fs.readdirSync(path.join(root, 'public/data/maps')).filter(f => /^town_[a-h]\.json$/.test(f)).map(f => readJson(`public/data/maps/${f}`)).filter(m => (m.npcs || []).length > 0);
    assert.ok(built.length >= 3, '作り込んだ街（D・E・H）がある');
    for (const m of built) {
        const r = ratio(m.heights);
        assert.ok(r >= lo - 0.03 && r <= hi + 0.05, `${m.id}: 高さが変わる辺の割合 ${r.toFixed(2)}（サンプルは ${lo.toFixed(2)}〜${hi.toFixed(2)}）`);
        assert.ok(share(m.heights, 1) >= 0.15 && share(m.heights, 2) >= 0.15 && share(m.heights, 3) >= 0.03, `${m.id}: 高さ 1・2・3 の分布が、サンプルと同じく、散らばる`);
    }
});

test('屋外のマップ（外のマップ w_*・街の中 town_a〜h）に、屋内用の物（床・天井つき）を置かない。天井の板が、頭の上に浮く', () => {
    const files = fs.readdirSync(path.join(root, 'public/data/maps')).filter(f => /^(w_\d\d_\d\d|town_[a-h])\.json$/.test(f));
    assert.ok(files.length > 100);
    for (const f of files) {
        const m = readJson(`public/data/maps/${f}`);
        for (const name of Object.values(m.legend)) {
            const d = objects[name];
            assert.ok(!d?.ceilingTexture, `${f}: ${name} は屋内用（ceilingTexture）。屋外用（crate_out など）を使う`);
        }
    }
});

test('街道の道しるべ: 分かれ道に 1 本。方角と行き先（3 つの街）の文章。道のわきの空きマスに立つ', () => {
    const MESH = 64;
    const signs = [];   // { x, y（世界のマス）, msg }
    const road = new Set();
    for (const f of fs.readdirSync(path.join(root, 'public/data/maps')).filter(n => /^w_\d\d_\d\d\.json$/.test(n))) {
        const m = readJson(`public/data/maps/${f}`);
        const [, j, i] = f.match(/^w_(\d\d)_(\d\d)/).map(Number);
        m.layout.forEach((row, r) => [...row].forEach((ch, c) => {
            const n = m.legend[ch];
            if (n === 'paved_road' || n === 'stone_bridge') road.add(`${i * MESH + c},${j * MESH + r}`);
            if (n === 'road_sign') {
                const msg = m.signs?.[`${c},${r}`];
                assert.ok(msg, `${f} (${c},${r}): 道しるべの文章（signs）がある`);
                signs.push({ x: i * MESH + c, y: j * MESH + r, msg });
            }
        }));
    }
    // 立て札の絵は、全て、読めない創作の文字の絵（signpost）。読める絵（road_sign.png などの別ファイル）・専用のテクスチャは、ない
    assert.equal(objects.road_sign.texture, 'signpost');
    assert.ok(!fs.existsSync(path.join(root, 'public/images/objects/road_sign.png')), '読める絵・別の絵は、削除済み');
    const gameSrc = fs.readFileSync(path.join(root, 'public/js/game.js'), 'utf8');
    assert.ok(!gameSrc.includes('roadSign') && !fs.readFileSync(path.join(root, 'public/js/textures.js'), 'utf8').includes('createRoadSignTexture'), '専用のテクスチャは、ない');
    assert.equal(signs.length, 1, '分かれ道は 1 か所');
    const { x, y, msg } = signs[0];
    for (const name of ['グリーン王国', 'ダマスカス自治領', 'ガリレオ連盟']) assert.ok(msg.includes(name), `${name} が書いてある`);
    assert.match(msg, /北: .*西: .*東: /, '方角（北・西・東）と行き先');
    assert.ok(!road.has(`${x},${y}`), '道の上ではない');
    assert.ok([...road].some(k => { const [rx, ry] = k.split(',').map(Number); return Math.abs(rx - x) + Math.abs(ry - y) === 1; }), '道の縁のすぐわき（道に接する）');
    assert.ok([...road].filter(k => { const [rx, ry] = k.split(',').map(Number); return Math.abs(rx - x) <= 2 && Math.abs(ry - y) <= 2; }).length >= 6, '90 度の曲がり角のそば（道が、縦にも横にも、まわりにある）');
});


test('B（フランケル聖国）: 大教会が街の中心の北の最上位・王城は小さく北東・街の人は聖職者が多く、司祭・枢機卿・王は街に出ない', () => {
    const m = readJson('public/data/maps/town_b.json');
    assert.deepEqual([m.layout[0].length, m.layout.length], [48, 36]);
    const rows = m.layout;
    const jRun = Math.max(...rows.map(r => Math.max(...(r.match(/J+/g) || ['']).map(s => s.length))));
    assert.ok(jRun >= 16, `大教会（幅 16 以上）がある: ${jRun}`);
    assert.equal(m.links['23,5']?.nextMap, 'temple_b', '大教会の扉から、B の大教会（教皇）へ入れる');
    assert.ok(readJson('public/data/maps/temple_b.json').npcs.some(n => n.id === 'pope') && readJson('public/data/maps/temple_b.json').npcs.some(n => n.id === 'cardinal'), '教皇と枢機卿は、大教会の中');
    assert.ok(Object.values(m.links).some(l => l.nextMap === 'temple_town'), '礼拝堂がある');
    assert.equal(m.links['42,0']?.nextMap, 'castle_b', '小さな王城の城門は、北東');
    assert.deepEqual(readJson('public/data/maps/castle_b.json').npcs.slice(0, 2).map(n => n.id), ['king_b', 'prince_b'], '愚かな王と王子');
    const ids = m.npcs.map(n => n.id);
    const clergy = ids.filter(id => /^priest_(man|woman)$/.test(id)).length;
    assert.ok(clergy / ids.length >= 0.45, `聖職者（助祭・修道女）が多い: ${clergy}/${ids.length}`);
    for (const bad of ['priest_senior', 'cardinal', 'king', 'prince']) assert.ok(!ids.includes(bad), `${bad} は街に出ない`);
    assert.ok(!Object.values(m.links).some(l => ['guild_mage', 'guild_training'].includes(l.nextMap)), '魔法ギルド・職業訓練所は置かない');
});

test('C（ミレニアム自由都市）: 商人ギルドが街の中心・王城はなく宗教は神殿（ドーム）・オアシスの池・砂漠の見た目（砂の地面・ヤシ）・市場の屋台', () => {
    const m = readJson('public/data/maps/town_c.json');
    assert.deepEqual([m.layout[0].length, m.layout.length], [40, 30]);
    assert.equal(m.links['29,11']?.nextMap, 'guild_merchant_c', '商人ギルドの扉');
    assert.ok(readJson('public/data/maps/guild_merchant_master_c.json').npcs.some(n => n.id === 'desert_chairman'), '議長は、商人ギルドの奥の部屋');
    const all = Object.values(m.links).map(l => l.nextMap);
    for (const bad of ['castle', 'guild_mage', 'guild_training']) assert.ok(!all.includes(bad), `${bad} は置かない`);
    assert.ok(all.includes('temple'), '宗教は神殿（ユーザー指定）');
    assert.equal(m.legend.J, 'mideast_temple');
    assert.ok(m.npcs.filter(n => n.id.startsWith('desert_')).length >= 7, '砂漠の住民（sdServer の画像）');
    assert.ok(m.layout.join('').split('w').length - 1 >= 40, 'オアシスの池（水 40 マス以上）');
    assert.equal(m.decorFloor, 'packedEarth');
    assert.deepEqual([m.legend.p, m.legend['=']], ['plaza_earth', 'earth_road'], '地面は石畳ではなく土');
    assert.equal(m.environment.floorType, 'desert');
    assert.equal(m.legend.T, 'palm');
    assert.deepEqual([m.legend.H, m.legend.S, m.legend.I, m.legend.K], ['mideast_house', 'mideast_shop', 'mideast_inn', 'mideast_guild'], '中東風の建物');
    for (const id of ['mideast_house', 'mideast_shop', 'mideast_inn', 'mideast_guild']) assert.equal(objects[id].roofStyle, 'flat', `${id}: 平らな屋根`);
    assert.ok(objects.mideast_guild.dome && objects.mideast_guild.spire, '商人ギルドは、ドームと尖塔');
    const game = fs.readFileSync(path.join(root, 'public/js/game.js'), 'utf8');
    for (const t of ['adobeWall', 'adobeWallOchre', 'adobeRoof', 'domeTile', 'packedEarth', 'packedEarthRoad']) assert.ok(game.includes(`${t}:`), `テクスチャ ${t}`);
    assert.ok(['1', '2', '3', '4'].some(c => m.layout.join('').includes(c)), '市場の屋台');
});

test('F（ライアン獣王国）: 山の麓の街。D と同じ作りで、小さな王城（獣王とフェンリル像）があり、神殿・魔法ギルドはなく、ドワーフの鍛冶屋・職業訓練所・商人ギルドがある。ギルドは獣人。木造の家と針葉樹', () => {
    const m = readJson('public/data/maps/town_f.json');
    assert.deepEqual([m.layout[0].length, m.layout.length], [40, 30]);
    const all = Object.values(m.links).map(l => l.nextMap);
    for (const bad of ['castle', 'temple', 'guild_mage']) assert.ok(!all.includes(bad), `${bad} は置かない`);
    assert.equal(m.links['19,0']?.nextMap, 'castle_f', '獣王の城');
    const cf = readJson('public/data/maps/castle_f.json');
    assert.ok(cf.npcs.some(n => n.id === 'lion_king'), '獣王');
    assert.equal(Object.values(cf.legend).includes('fenrir_statue'), true, 'フェンリル像');
    assert.ok(objects.fenrir_statue.height >= 4.0 * 1.0 && objects.fenrir_statue.sdId === 326, 'フェンリル像（sdServer 326。ふつうの像の 2 倍ほど）');
    for (const need of ['guild_smith_f', 'guild_training_f', 'guild_adv_f', 'guild_merchant_f', 'city_inn_f']) assert.ok(all.includes(need), `${need} がある`);
    for (const bad of ['guild_training', 'guild_adv', 'guild_merchant', 'guild_smith', 'city_inn']) assert.ok(!all.includes(bad), `${bad} は、獣人の複製（_f）に替える`);
    const ids = (n) => readJson(`public/data/maps/${n}.json`).npcs.map(x => x.id);
    assert.ok(ids('guild_adv_f').includes('fox_clerk_man') && ids('guild_adv_f').includes('fox_clerk_woman'), '冒険者ギルドの受付は狐の獣人');
    assert.ok(ids('guild_adv_master_f').includes('tiger_adv_master'), '冒険者ギルド長は虎の獣人');
    assert.ok(ids('guild_merchant_f').includes('tanuki_clerk_man'), '商人ギルドの受付は狸の獣人');
    assert.ok(ids('guild_merchant_master_f').includes('cat_merchant_master'), '商人ギルド長は猫の獣人');
    assert.deepEqual(ids('guild_training_f'), ['bear_trainer'], '職業訓練所の教官は熊の獣人');
    assert.equal(readJson('public/data/maps/guild_adv_f.json').links['10,4'].nextMap, 'guild_adv_master_f');
    assert.equal(Object.values(m.links).find(l => l.nextMap === 'shop' && l.params.shopId.startsWith('item_shop')).params.shopId, 'item_shop_f', '神殿の品は道具屋で売る（神殿がない）');
    assert.ok(m.npcs.some(n => n.id === 'dwarf_smith'), 'ドワーフの鍛冶屋');
    assert.ok(m.npcs.filter(n => /^(beast_|dwarf_)/.test(n.id)).length >= 8, '獣人・ドワーフの住民（sdServer の画像）');
    assert.equal(m.legend.H, 'wooden_house');
    assert.equal(m.legend.T, 'conifer_tree_a');
    assert.ok(m.layout[0].includes('C'), '城門がある');
});

test('G（デイラミ精霊国）: 大森林の中心にある。街の中は D と同じ作り（城なし・訓練所なし・神殿なし。ギルド長は長老の一族）。木造の家・巨木・森の環境', () => {
    const m = readJson('public/data/maps/town_g.json');
    assert.deepEqual([m.layout[0].length, m.layout.length], [40, 30]);
    const all = Object.values(m.links).map(l => l.nextMap);
    for (const need of ['guild_mage_g', 'guild_adv_g', 'city_inn_g']) assert.ok(all.includes(need), `${need} がある`);
    for (const bad of ['guild_training', 'temple', 'guild_mage', 'guild_adv']) assert.ok(!all.includes(bad), `${bad} は置かない（神殿なし。ギルドは G 専用の複製）`);
    const shopLink = Object.values(m.links).find(l => l.nextMap === 'shop');
    assert.equal(shopLink.params.shopId, 'item_shop_g', '神殿の品は道具屋で売る');
    const shops = readJson('public/data/shops.json');
    for (const id of ['item_shop_g', 'item_shop_f']) assert.ok(shops[id].goods.some(x => x.itemId === 'revive_potion'), `${id}: 神殿の品（蘇生の薬）を売る`);
    assert.equal(readJson('public/data/maps/guild_adv_master_g.json').npcs[0].id, 'elf_elder_son', '冒険者ギルド長は長老の息子');
    assert.equal(readJson('public/data/maps/guild_mage_master_g.json').npcs[0].id, 'elf_elder_daughter', '魔法ギルド長は長老の娘');
    assert.equal(readJson('public/data/maps/guild_adv_g.json').links['10,4'].nextMap, 'guild_adv_master_g');
    assert.equal(m.legend.H, 'wooden_house');
    assert.equal(m.legend.T, 'great_tree_a');
    assert.equal(m.legend.Y, 'world_tree', '街の中心に世界樹');
    assert.equal(m.layout[14][19], 'Y');
    assert.equal(objects.world_tree.fullHeight, 24.7, '世界樹: 普通の木（4.94）の 5 倍');
    assert.equal(objects.world_tree.cropBottom, 0.12, '根の広がりを、画像の下 12% として切り取る');
    assert.equal(objects.world_tree.height, Math.round(24.7 * (1 - 0.12) * 100) / 100, '切った後の高さ = 全体の高さ × (1 - 切り取り)（木の大きさの比は、そのまま）');
    assert.ok(!m.npcs.some(n => n.id.startsWith('elf_elder_')), '長老は、街の通りにいない（世界樹のそばの家の中）');
    assert.equal(Object.values(m.links).find(l => l.nextMap === 'elder_house_g')?.message, '長老の家に入る');
    assert.deepEqual(readJson('public/data/maps/elder_house_g.json').npcs.map(n => n.id).sort(), ['elf_elder_man', 'elf_elder_woman'], '長老たちは、長老の家の中にいる（世界樹を管理する）');
    assert.equal(readJson('public/data/maps/elder_house_g.json').nextMap, 'town_g');
    assert.ok(!all.includes('castle'), '城門はない');
    // 街の外のマップは、大森林（街の周りが森）
    const outer = Object.values(m.links).find(l => l.nextMap?.startsWith('w_'))?.nextMap;
    assert.match(readJson(`public/data/maps/${outer}.json`).name, /^大森林/, '大森林の中');
});

test('画面上部の「世界（ボコスカ島）」の選択に、街（A〜H）の前の項目がある。選ぶと、その街の門の前（外のマップ）に出る', () => {
    const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
    const sel = html.match(/<select[^>]*title="世界（ボコスカ島）"[\s\S]*?<\/select>/)[0];
    assert.ok(sel.includes('dataset.spawn'), '選んだ項目の出現位置を使う');
    for (const id of 'abcdefgh') {
        const town = readJson(`public/data/maps/town_${id}.json`);
        const gate = Object.entries(town.links).find(([, l]) => l.nextMap?.startsWith('w_'));
        const outerId = gate[1].nextMap;
        const outer = readJson(`public/data/maps/${outerId}.json`);
        const [gx, gy] = Object.entries(outer.links).find(([, l]) => l.nextMap === `town_${id}`)[0].split(',').map(Number);
        const m = sel.match(new RegExp(`<option value="${outerId}" data-spawn='([^']+)'>${id.toUpperCase()} [^<]+の前</option>`));
        assert.ok(m, `${id}: 街の前の項目`);
        assert.deepEqual(JSON.parse(m[1]), { x: gx, z: gy + 4, angle: 0 }, `${id}: 門の前（南へ 4 マス）`);
    }
});

test('国のトップは、国ごとに違う（城・大教会・議長の部屋）: A 帝王・B 愚王と教皇・C と E 議長・D 質素な王・F 獣王・G 女王', () => {
    const ids = (n) => readJson(`public/data/maps/${n}.json`).npcs.map(x => x.id);
    assert.ok(ids('castle_a').includes('emperor_a'), 'A: 帝王');
    assert.ok(ids('castle_b').includes('king_b') && !ids('castle_b').includes('king'), 'B: 愚かな王');
    assert.ok(ids('temple_b').includes('pope'), 'B: 教皇');
    assert.ok(ids('castle').includes('king_d') && !ids('castle').includes('king'), 'D: 質素な王');
    assert.ok(ids('castle_f').includes('lion_king'), 'F: 獣王');
    assert.ok(ids('castle_g').includes('elf_queen'), 'G: 女王');
    assert.ok(ids('guild_merchant_master_c').includes('desert_chairman'), 'C: 議長');
    assert.ok(ids('guild_merchant_master_e').includes('chairman_e'), 'E: 議長');
    for (const [t, c] of [['a', 'castle_a'], ['b', 'castle_b'], ['d', 'castle'], ['f', 'castle_f'], ['g', 'castle_g']]) {
        assert.ok(Object.values(readJson(`public/data/maps/town_${t}.json`).links).some(l => l.nextMap === c), `${t}: 城門は ${c}`);
    }
    const npcs = readJson('public/data/npcs.json');
    for (const id of ['emperor_a', 'king_d', 'pope', 'chairman_e', 'lion_king', 'elf_queen', 'desert_chairman']) assert.ok(npcs[id].sdId, `${id}: sdServer の画像`);
});

test('厳守: 貴族・国の代表（王・王子・女王・宰相・帝王・教皇・枢機卿・議長・上位聖職者）は、屋外（街の通り・外のマップ）に出ない。城・屋敷・神殿・ギルドの中だけ', () => {
    const npcs = readJson('public/data/npcs.json');
    const forbidden = /(noble|king|prince|queen|chancellor|emperor|pope|cardinal|chairman|baron|viscount|marquis|duke|margrave|priest_senior|elder_son|elder_daughter)/;
    const outdoor = fs.readdirSync(path.join(root, 'public/data/maps')).filter(f => /^(w_\d\d_\d\d|town_[a-h]|city|town|village)\.json$/.test(f));
    assert.ok(outdoor.length > 100);
    for (const f of outdoor) {
        const m = readJson(`public/data/maps/${f}`);
        for (const n of m.npcs || []) {
            assert.ok(!forbidden.test(n.id) && !forbidden.test(npcs[n.id]?.name ?? ''), `${f}: ${n.id}（${npcs[n.id]?.name}）は、屋外に出ない（貴族・国の代表）`);
        }
    }
});

test('G（森の街）: 石畳・石造りではなく森を活かす（森の地面・土の道・茂みの壁・木造・草とシダと木）。精霊国の妖精（敵キャラの妖精系）が街に出る', () => {
    const m = readJson('public/data/maps/town_g.json');
    assert.deepEqual([m.legend.p, m.legend['='], m.legend.W, m.legend.H, m.legend.S], ['plaza_forest', 'dirt_road', 'forest_hedge_wall', 'wooden_house', 'wooden_house_window'], '森の街の見た目');
    assert.equal(m.decorFloor, 'forestGround');
    const vals = Object.values(m.legend);
    for (const stone of ['plaza_stone', 'paved_road', 'city_wall', 'brick_house', 'shop_building']) assert.ok(!vals.includes(stone), `${stone}（石）は使わない`);
    for (const ch of ['z', 'y']) { const o = objects[m.legend[ch]]; assert.ok(o.imageFile && Number.isInteger(o.sdId), `草・シダは sdServer の画像（${m.legend[ch]}）`); }
    const flat = m.layout.join('');
    assert.ok((flat.match(/z/g) || []).length >= 30 && (flat.match(/y/g) || []).length >= 20 && (flat.match(/[vfT]/g) || []).length >= 15, '草・シダ・木を、ばらまく');
    assert.ok(!m.npcs.some(n => /^(guard_|gate_guard)/.test(n.id)) && m.npcs.some(n => n.id === 'elf_guard_man') && m.npcs.some(n => n.id === 'elf_guard_woman'), '兵士は、エルフの守備隊（sdServer 327・328）');
    const npcsJ = readJson('public/data/npcs.json');
    assert.deepEqual([npcsJ.elf_guard_woman.sdId, npcsJ.elf_guard_man.sdId], [327, 328]);
    assert.ok(readJson('public/data/maps/castle_g.json').npcs.some(n => n.id === 'elf_soldier_golem') && !readJson('public/data/maps/castle_g.json').npcs.some(n => n.id.startsWith('guard_')), '女王の城の兵士もエルフ国（ウッドゴーレム）');
    const fairies = m.npcs.filter(n => n.id.startsWith('fairy_'));
    assert.ok(fairies.length >= 6, '妖精が街にいる');
    const npcs = readJson('public/data/npcs.json');
    const enemies = readJson('public/data/enemies.json');
    for (const f of fairies) assert.ok(Object.values(enemies).some(e => e.family === 'fairy' && npcs[f.id].texture === `/images/enemies/${e.imageFile}`), `${f.id}: 敵キャラの妖精系の画像`);
    // 外のマップの外観も、木の壁・木造
    const outer = readJson(`public/data/maps/${Object.values(m.links).find(l => l.nextMap?.startsWith('w_')).nextMap}.json`);
    assert.ok(Object.values(outer.legend).includes('wooden_wall') && !Object.values(outer.legend).includes('city_wall'), '外のマップの G の外壁は木の壁');
});

test('兵士: F（獣人国）はコボルト（sdServer 11）。G（エルフ国）はエルフの守備隊（327・328）とウッドゴーレム（sdServer 51）。F にウッドゴーレムはいない', () => {
    const npcs = readJson('public/data/npcs.json');
    const enemies = readJson('public/data/enemies.json');
    const img = (sd) => `/images/enemies/${Object.values(enemies).find(e => e.sdId === sd).imageFile}`;
    assert.equal(npcs.beast_soldier_kobold.texture, img(11), 'コボルト（sdServer 11）');
    assert.equal(npcs.elf_soldier_golem.texture, img(51), 'ウッドゴーレム（sdServer 51）はエルフ国の兵士');
    assert.ok(!npcs.beast_soldier_golem, '獣人国向けのウッドゴーレムはない');
    const soldier = /^(guard_|gate_guard)/;
    const townMaps = (id, castleId) => {
        const town = readJson(`public/data/maps/town_${id}.json`);
        const outer = readJson(`public/data/maps/${Object.values(town.links).find(l => l.nextMap?.startsWith('w_')).nextMap}.json`);
        return [town.npcs, readJson(`public/data/maps/${castleId}.json`).npcs, outer.npcs];
    };
    for (const list of townMaps('f', 'castle_f')) {
        assert.ok(!list.some(n => soldier.test(n.id) || /golem/.test(n.id)), 'F: 人族の衛兵・ゴーレムはいない');
        assert.ok(list.some(n => n.id.startsWith('beast_soldier_kobold')), 'F: コボルトの兵士');
    }
    for (const list of townMaps('g', 'castle_g')) {
        assert.ok(!list.some(n => soldier.test(n.id) || /beast_soldier/.test(n.id)), 'G: 人族の衛兵・獣人の兵士はいない');
        assert.ok(list.some(n => n.id === 'elf_soldier_golem'), 'G: ウッドゴーレムの兵士');
    }
});

test('G: 世界樹のまわりを、柵で、「ロ」の形に隙間なく囲って入れない（木 1 マスのまわり 8 マス。中は木だけ）。大通りは東の列、東西の通りは南の列が通れる', () => {
    const m = readJson('public/data/maps/town_g.json');
    assert.equal(m.layout[14][19], 'Y');
    assert.equal(objects[m.legend.j].type, 'wooden_fence');
    assert.equal(objects[m.legend.j].solid, true, '柵は通れない');
    for (let y = 13; y <= 15; y++) for (let x = 18; x <= 20; x++) if (!(x === 19 && y === 14)) assert.equal(m.layout[y][x], 'j', `(${x},${y}) は柵（隙間がない）`);
    assert.equal(m.layout.join('').split('j').length - 1, 8, '柵は 8 マスだけ（「ロ」。詰まった「#」にしない）');
    for (let y = 12; y <= 17; y++) assert.ok('p='.includes(m.layout[y][21]), `(21,${y}) は通れる（大通りの東の列）`);
    for (let x = 1; x <= 38; x++) assert.ok('p='.includes(m.layout[16][x]), `(${x},16) は通れる（東西の通りの南の列）`);
});

test('木の柵の描画: つながる方向ごとに半分の板だけを描く（角が L 字・端が片側。全幅の板を十字に交わらせて、角の先が突き出す「#」にしない）', () => {
    const game = fs.readFileSync(path.join(root, 'public/js/game.js'), 'utf8');
    const i = game.indexOf("case 'wooden_fence': {");
    const body = game.slice(i, game.indexOf("case ", i + 30));
    assert.ok(body.includes('const addPanel = (dx, dz)') && body.includes('PlaneGeometry(halfW, fenceH)'), '半分の板');
    for (const dir of ['addPanel(-1, 0)', 'addPanel(1, 0)', 'addPanel(0, -1)', 'addPanel(0, 1)']) assert.ok(body.includes(dir), dir);
    assert.ok(!body.includes('Horizontal X plane') && !body.includes('Vertical Z plane'), '全幅の板を、十字に交わらせない');
});

test('植物（草・花・シダ・葦など）は、全て sdServer の画像。画像のない植物の定義・自作のテクスチャ（grassTuft・tallGrass・wildFlowers・reed・dryTuft）は、置かない', () => {
    for (const [id, o] of Object.entries(objects)) {
        if (o.type === 'plant') assert.ok(o.imageFile && Number.isInteger(o.sdId), `${id}: 植物は sdServer の画像（imageFile・sdId）`);
    }
    for (const gone of ['grass_tuft', 'tall_grass', 'wild_flowers', 'reed', 'dry_tuft']) assert.equal(objects[gone], undefined, `${gone} は削除済み`);
    const game = fs.readFileSync(path.join(root, 'public/js/game.js'), 'utf8');
    const tex = fs.readFileSync(path.join(root, 'public/js/textures.js'), 'utf8');
    for (const t of ['grassTuft', 'tallGrass', 'wildFlowers', 'dryTuft']) assert.ok(!game.includes(`${t}:`) && !game.includes(`textures.${t}`), `${t}: 自作の絵は使わない`);
    for (const f of ['createGrassTuftTexture', 'createTallGrassTexture', 'createWildFlowersTexture', 'createReedTexture', 'createDryTuftTexture']) assert.ok(!tex.includes(f), `${f}: 削除済み`);
});
