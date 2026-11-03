import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const readJson = (f) => JSON.parse(fs.readFileSync(path.join(root, f), 'utf-8'));
const objects = readJson('public/data/objects.json');
const castle = readJson('public/data/maps/castle.json');

test('飾り: 天井から吊るす飾り（hanging）と壁の飾り（wall_deco）は、箱形のパーツを持つ', () => {
    const list = Object.entries(objects).filter(([, o]) => ['hanging', 'wall_deco'].includes(o.type));
    assert.ok(list.length >= 4, `飾りの数: ${list.length}`);
    for (const [id, o] of list) {
        assert.ok(o.parts?.length >= 3, `${id}: parts`);
        for (const p of o.parts) assert.ok(p.size?.length === 3 && p.pos?.length === 3 && p.color, `${id}: パーツの形式`);
        if (o.type === 'hanging') {
            assert.equal(o.solid, false, `${id}: 通り抜けられる`);
            assert.equal(o.fromCeiling, true, `${id}: 天井から`);
            assert.ok(o.parts.every(p => p.pos[1] < 0), `${id}: 天井より下`);
        }
    }
});

test('飾り: 王城に、シャンデリア・壁の燭台・旗があり、壁の飾りは、通れる隣のマスに面している', () => {
    const used = new Set(castle.layout.join(''));
    const types = [...used].map(ch => objects[castle.legend[ch]]?.type);
    assert.ok(types.includes('hanging') && types.includes('wall_deco'));
    const ids = [...used].map(ch => castle.legend[ch]);
    assert.ok(ids.includes('wall_sconce') && ids.includes('wall_banner_red'));
    castle.layout.forEach((row, r) => [...row].forEach((ch, c) => {
        if (objects[castle.legend[ch]]?.type !== 'wall_deco') return;
        const open = [[0, -1], [1, 0], [0, 1], [-1, 0]].some(([dx, dz]) => {
            const n = castle.layout[r + dz]?.[c + dx];
            const t = n && objects[castle.legend[n]];
            return n && (!t || !['block', 'door', 'wall_image', 'wall_deco'].includes(t.type));
        });
        assert.ok(open, `壁の飾り ${c},${r}: 開いた隣のマスがない`);
    }));
});

test('飾り: game.js に hanging と wall_deco の描画がある', () => {
    const src = fs.readFileSync(path.join(root, 'public/js/game.js'), 'utf-8');
    assert.match(src, /case 'hanging':/);
    assert.match(src, /case 'wall_deco':/);
});
