import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();
const readJson = (f) => JSON.parse(fs.readFileSync(path.join(projectRoot, f), 'utf-8'));
const objects = readJson('public/data/objects.json');
const npcs = readJson('public/data/npcs.json');
const shops = readJson('public/data/shops.json');
const items = readJson('public/data/items.json');
const mapDir = path.join(projectRoot, 'public/data/maps');
const maps = Object.fromEntries(fs.readdirSync(mapDir).map(f => [f.replace('.json', ''), readJson(`public/data/maps/${f}`)]));

test('建物の出入り: links の座標は扉・門のマスで、行き先と店の種類と戻る先が正しい', () => {
    let count = 0;
    for (const [id, map] of Object.entries(maps)) {
        for (const [key, link] of Object.entries(map.links ?? {})) {
            count++;
            const [c, r] = key.split(',').map(Number);
            const def = objects[map.legend[map.layout[r][c]]];
            assert.ok(def && ['door', 'gateway', 'portal', 'stairs'].includes(def.type), `${id} ${key}: 扉・門・ポータルのマスではない`);
            assert.ok(link.nextMap === '$back' || maps[link.nextMap], `${id} ${key}: 行き先 ${link.nextMap} がない`);
            if (link.params?.shopId) assert.ok(shops[link.params.shopId], `${id} ${key}: 店の種類 ${link.params.shopId}`);
            if (def.type === 'stairs') continue;   // 階段は、下の専用テストで調べる（戻る先ではなく、行き先での出現位置 spawn を持つ）
            if (link.nextMap === '$back') continue;   // 建物の出口（入ってきた場所へ戻る）は、戻る先の指定は要らない
            // 戻る先は、行き先のマップではなく、このマップの通れるマス
            const b = link.back;
            assert.ok(b, `${id} ${key}: 戻る先（back）がない`);
            assert.ok(b.x > 0 && b.z > 0 && b.x < map.layout[0].length - 1 && b.z < map.layout.length - 1, `${id} ${key}: 戻る先がマップの外`);
            const bd = objects[map.legend[map.layout[b.z][b.x]]];
            assert.ok(map.layout[b.z][b.x] === '0' || (bd && !bd.solid), `${id} ${key}: 戻る先が通れないマス`);
        }
    }
    assert.ok(count >= 4, `links の数: ${count}`);
});

test('建物の出入り: 建物の出口（building_exit）がある屋内マップには、入口の links が必ずある', () => {
    for (const [id, map] of Object.entries(maps)) {
        const hasExit = Object.values(map.legend).some(v => objects[v]?.nextMap === '$back') ||
            Object.values(map.links ?? {}).some(l => l.nextMap === '$back');
        if (!hasExit) continue;
        if (id === 'temple_town') continue;   // 城の無い街の神殿: 街のマップがまだ無いので、入口は未接続（街ができたら、ここを外す）
        const entered = Object.values(maps).some(m => Object.values(m.links ?? {}).some(l => l.nextMap === id));
        assert.ok(entered, `${id}: 入口がない`);
    }
});

test('店の種類: 店主の NPC が定義されている。汎用の店マップに店主の置き場がある', () => {
    for (const [id, shop] of Object.entries(shops)) {
        if (id.startsWith('_')) continue;
        assert.ok(shop.name && npcs[shop.keeper], `${id}: 店名・店主`);
        // itemId を持つ品は、items.json の定義と名前・価格が同じ
        for (const g of shop.goods ?? []) {
            if (!g.itemId) continue;
            assert.ok(items[g.itemId], `${id}: 未定義の itemId ${g.itemId}`);
            assert.equal(g.name, items[g.itemId].name, `${id}/${g.itemId}: 名前`);
            assert.equal(g.price, items[g.itemId].price, `${id}/${g.itemId}: 価格`);
        }
    }
    assert.ok(maps.shop.npcs.some(n => n.id === '$shopkeeper'));
});

// マップの大きさの上限（docs/map-spec.md）。負荷が大きいときは、この値を下げて、マップを分ける
const MAP_MAX_SIZE = 100;

test('マップの大きさ: 全ての行が同じ長さで、縦横とも MAP_MAX_SIZE 以下', () => {
    for (const [id, map] of Object.entries(maps)) {
        const rows = map.layout.length, cols = map.layout[0].length;
        assert.ok(rows <= MAP_MAX_SIZE && cols <= MAP_MAX_SIZE, `${id}: ${cols}x${rows} が上限 ${MAP_MAX_SIZE}x${MAP_MAX_SIZE} を超えている`);
        map.layout.forEach((row, r) => assert.equal(row.length, cols, `${id}: ${r} 行目の長さが ${cols} と違う`));
    }
});

test('階段: 全ての階段のマスに links があり、行き先の spawn が通れるマス。行き先にも、こちらへ戻る階段がある', () => {
    let count = 0;
    for (const [id, map] of Object.entries(maps)) {
        for (let r = 0; r < map.layout.length; r++) for (let c = 0; c < map.layout[r].length; c++) {
            const def = objects[map.legend?.[map.layout[r][c]]];
            if (!def || def.type !== 'stairs') continue;
            count++;
            const link = map.links?.[`${c},${r}`];
            assert.ok(link && maps[link.nextMap], `${id} ${c},${r}: 階段の行き先（links の nextMap）がない`);
            assert.ok(link.spawn, `${id} ${c},${r}: 行き先での出現位置（spawn）がない`);
            const dest = maps[link.nextMap], s = link.spawn;
            assert.ok(s.x > 0 && s.z > 0 && s.x < dest.layout[0].length - 1 && s.z < dest.layout.length - 1, `${id} ${c},${r}: spawn がマップの外`);
            const ch = dest.layout[s.z][s.x], sd = dest.legend?.[ch] && objects[dest.legend[ch]];
            assert.ok(ch === '0' || (sd && !sd.solid && !['stairs', 'door', 'gateway', 'portal', 'furniture', 'block'].includes(sd.type)),
                `${id} ${c},${r}: spawn が通れないマス、または移動のマス（すぐ戻ってしまう）`);
            if (link.dir) assert.ok(['n', 'e', 's', 'w'].includes(link.dir), `${id} ${c},${r}: dir は n/e/s/w`);
            // 行き先のマップに、こちらへ戻る階段がある
            const back = Object.entries(dest.links ?? {}).some(([k, l]) => {
                const [bc, br] = k.split(',').map(Number);
                return l.nextMap === id && objects[dest.legend?.[dest.layout[br][bc]]]?.type === 'stairs';
            });
            assert.ok(back, `${id} ${c},${r}: ${link.nextMap} に、こちらへ戻る階段がない`);
        }
    }
    assert.ok(count >= 2, `階段の数: ${count}`);
});

test('階段: 上りと下りの定義（direction）と、段の見た目に使うテクスチャ', () => {
    for (const [id, def] of Object.entries(objects)) {
        if (def.type !== 'stairs') continue;
        assert.ok(['up', 'down'].includes(def.direction), `${id}: direction`);
        assert.ok(def.texture, `${id}: texture`);
    }
});
