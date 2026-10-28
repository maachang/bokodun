import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();
const readJson = (f) => JSON.parse(fs.readFileSync(path.join(projectRoot, f), 'utf-8'));
const objects = readJson('public/data/objects.json');
const npcs = readJson('public/data/npcs.json');
const shops = readJson('public/data/shops.json');
const mapDir = path.join(projectRoot, 'public/data/maps');
const maps = Object.fromEntries(fs.readdirSync(mapDir).map(f => [f.replace('.json', ''), readJson(`public/data/maps/${f}`)]));

test('建物の出入り: links の座標は扉・門のマスで、行き先と店の種類と戻る先が正しい', () => {
    let count = 0;
    for (const [id, map] of Object.entries(maps)) {
        for (const [key, link] of Object.entries(map.links ?? {})) {
            count++;
            const [c, r] = key.split(',').map(Number);
            const def = objects[map.legend[map.layout[r][c]]];
            assert.ok(def && ['door', 'gateway', 'portal'].includes(def.type), `${id} ${key}: 扉・門・ポータルのマスではない`);
            assert.ok(link.nextMap === '$back' || maps[link.nextMap], `${id} ${key}: 行き先 ${link.nextMap} がない`);
            if (link.params?.shopId) assert.ok(shops[link.params.shopId], `${id} ${key}: 店の種類 ${link.params.shopId}`);
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
        const entered = Object.values(maps).some(m => Object.values(m.links ?? {}).some(l => l.nextMap === id));
        assert.ok(entered, `${id}: 入口がない`);
    }
});

test('店の種類: 店主の NPC が定義されている。汎用の店マップに店主の置き場がある', () => {
    for (const [id, shop] of Object.entries(shops)) {
        if (id.startsWith('_')) continue;
        assert.ok(shop.name && npcs[shop.keeper], `${id}: 店名・店主`);
    }
    assert.ok(maps.shop.npcs.some(n => n.id === '$shopkeeper'));
});
