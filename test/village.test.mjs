import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();
const readJson = (f) => JSON.parse(fs.readFileSync(path.join(projectRoot, f), 'utf-8'));
const village = readJson('public/data/maps/village.json');
const objects = readJson('public/data/objects.json');
const layout = village.layout;

test('村: 24×24 マスで、すべての行の長さが揃っている', () => {
    assert.equal(layout.length, 24);
    for (const row of layout) assert.equal(row.length, 24);
});

test('村: 村長の家の外壁・屋内の床・扉・家具の定義', () => {
    assert.equal(objects.wooden_wall.type, 'block');
    assert.equal(objects.wooden_wall.hasRoof, undefined, '屋根なしの壁（1 マスごとに屋根が付かない）');
    for (const id of ['wood_floor', 'rug']) {
        assert.equal(objects[id].type, 'floor_tile');
        assert.equal(objects[id].solid, false);
        assert.ok(objects[id].ceilingTexture, `${id}: 屋内の床は天井つき`);
    }
    assert.equal(objects.wooden_door.type, 'door');
    assert.ok(objects.wooden_door.floorTexture && objects.wooden_door.ceilingTexture);
    for (const [id, def] of Object.entries(objects)) {
        if (def.type !== 'furniture') continue;
        if (!id.startsWith('flower_bed')) assert.ok(def.floorTexture && def.ceilingTexture, `${id}: 屋内の家具の下にも床と天井`);   // 花壇は屋外
        assert.ok(def.parts.length > 0, id);
        for (const p of def.parts) {
            assert.equal(p.size.length, 3, id);
            assert.equal(p.pos.length, 3, id);
            // 1 マス（4）の中に収まる
            assert.ok(Math.abs(p.pos[0]) + p.size[0] / 2 <= 2 + 1e-9 && Math.abs(p.pos[2]) + p.size[2] / 2 <= 2 + 1e-9, `${id}: パーツがマスからはみ出す`);
        }
        const [cw, cd] = def.collider;
        const [ox, oz] = def.colliderOffset || [0, 0];
        assert.ok(Math.abs(ox) + cw / 2 <= 2 + 1e-9 && Math.abs(oz) + cd / 2 <= 2 + 1e-9, `${id}: 当たり判定がマスからはみ出す`);
    }
});

test('村: スポーンから、家の中のすべての床マス・敷物マスへ歩いて行ける（扉は通れる、家具のマスは通れるものとして数える）', () => {
    const defOf = (r, c) => objects[village.legend[layout[r][c]]];
    const passable = (r, c) => {
        const ch = layout[r][c];
        if (ch === '0') return true;
        const d = defOf(r, c);
        return !!d && (!d.solid || d.type === 'door' || d.type === 'furniture');
    };
    const start = [village.spawn.z, village.spawn.x];
    assert.ok(passable(...start), 'スポーン位置が通れる');
    const seen = new Set([start.join(',')]);
    const queue = [start];
    while (queue.length) {
        const [r, c] = queue.shift();
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nr = r + dr, nc = c + dc;
            if (nr < 0 || nc < 0 || nr >= layout.length || nc >= layout[0].length) continue;
            if (seen.has(`${nr},${nc}`) || !passable(nr, nc)) continue;
            seen.add(`${nr},${nc}`);
            queue.push([nr, nc]);
        }
    }
    const unreachable = [];
    for (let r = 0; r < layout.length; r++) {
        for (let c = 0; c < layout[0].length; c++) {
            const d = defOf(r, c);
            const indoor = d && (d.floorTexture || d.ceilingTexture);
            if (indoor && !seen.has(`${r},${c}`)) unreachable.push(`${r},${c}(${layout[r][c]})`);
        }
    }
    assert.deepEqual(unreachable, []);
});

test('村: 家の中に部屋が複数ある（扉で仕切られた床の領域が 5 つ以上）', () => {
    const indoor = (r, c) => {
        const d = objects[village.legend[layout[r][c]]];
        return !!d && d.type !== 'door' && !!(d.floorTexture || d.ceilingTexture);
    };
    const seen = new Set();
    let rooms = 0;
    for (let r = 0; r < layout.length; r++) {
        for (let c = 0; c < layout[0].length; c++) {
            if (!indoor(r, c) || seen.has(`${r},${c}`)) continue;
            rooms++;
            const stack = [[r, c]];
            seen.add(`${r},${c}`);
            while (stack.length) {
                const [cr, cc] = stack.pop();
                for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                    const nr = cr + dr, nc = cc + dc;
                    if (nr < 0 || nc < 0 || nr >= layout.length || nc >= layout[0].length) continue;
                    if (seen.has(`${nr},${nc}`) || !indoor(nr, nc)) continue;
                    seen.add(`${nr},${nc}`);
                    stack.push([nr, nc]);
                }
            }
        }
    }
    assert.ok(rooms >= 5, `部屋の数: ${rooms}`);
});

// 村・街: 川（深い水は通れない）を橋で渡れる。花壇は通れない、草は見た目だけ
for (const id of ['village', 'city']) {
    test(`${id}: 川は橋でしか渡れない。草は当たり判定なし、花壇は通れない`, () => {
        const map = readJson(`public/data/maps/${id}.json`);
        const lay = map.layout;
        const defOf = (r, c) => objects[map.legend[lay[r][c]]];
        const passable = (r, c) => {
            if (lay[r][c] === '0') return true;
            const d = defOf(r, c);
            return !!d && !d.solid && d.type !== 'furniture';   // 家具（花壇）・深い水・壁は通れない。草や床は通れる
        };
        // 草・野の花は当たり判定を持たない（solid にも collider にもならない）
        for (const [ch, objId] of Object.entries(map.legend)) {
            const d = objects[objId];
            if (d.type === 'plant') {
                assert.equal(d.solid, undefined, `${id}:${ch} 草は solid にしない`);
                assert.ok(d.count > 0 && d.scale.length === 2);
            }
        }
        // 川（深い水）があり、橋（wood_bridge）が、それをまたいでいる
        const deep = [], bridges = [];
        for (let r = 0; r < lay.length; r++) {
            for (let c = 0; c < lay[0].length; c++) {
                const d = defOf(r, c);
                if (d?.type === 'liquid_tile' && d.solid) deep.push([r, c]);
                if (d?.texture === 'woodBridge') bridges.push([r, c]);
            }
        }
        assert.ok(deep.length >= 10, `${id}: 川の深い水域`);
        assert.ok(bridges.length >= 1, `${id}: 橋`);
        const bfs = (blocked) => {
            const start = [map.spawn.z, map.spawn.x];
            const seen = new Set([start.join(',')]);
            const queue = [start];
            while (queue.length) {
                const [r, c] = queue.shift();
                for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                    const nr = r + dr, nc = c + dc;
                    if (nr < 0 || nc < 0 || nr >= lay.length || nc >= lay[0].length) continue;
                    const k = `${nr},${nc}`;
                    if (seen.has(k) || !passable(nr, nc) || blocked.has(k)) continue;
                    seen.add(k);
                    queue.push([nr, nc]);
                }
            }
            return seen;
        };
        // 一番北の橋の、北側の岸へ: 橋を渡れば行け、橋をすべて塞ぐと行けない（川が区画を分けている）
        const top = bridges.reduce((a, b) => (b[0] < a[0] ? b : a));
        const north = `${top[0] - 1},${top[1]}`;
        assert.ok(passable(top[0] - 1, top[1]), `${id}: 橋の北側は通れる`);
        assert.ok(bfs(new Set()).has(north), `${id}: 橋を渡れば北側へ行ける`);
        assert.ok(!bfs(new Set(bridges.map(b => b.join(',')))).has(north), `${id}: 橋以外では川を渡れない`);
        // スポーンの上に飾り（草や花壇）が置かれていない
        assert.equal(lay[map.spawn.z][map.spawn.x] === '0' || defOf(map.spawn.z, map.spawn.x)?.type === 'floor_tile', true, `${id}: スポーンの位置`);
    });
}

test('街: 飾り（花壇・草）の下は石畳（decorFloor）', () => {
    const city = readJson('public/data/maps/city.json');
    assert.equal(city.decorFloor, 'pavedRoad');
});
