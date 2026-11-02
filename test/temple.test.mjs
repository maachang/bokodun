import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const readJson = (f) => JSON.parse(fs.readFileSync(path.join(root, f), 'utf-8'));
const objects = readJson('public/data/objects.json');
const temple = readJson('public/data/maps/temple.json');
const city = readJson('public/data/maps/city.json');
const tex = fs.readFileSync(path.join(root, 'public/js/game.js'), 'utf-8');

test('画像のオブジェクト（像・壁の画像）: 画像ファイルがあり、縦横比と高さが決まっている', () => {
    const list = Object.entries(objects).filter(([, o]) => ['statue', 'wall_image'].includes(o.type));
    assert.ok(list.length >= 5, `像・壁の画像の数: ${list.length}`);
    for (const [id, o] of list) {
        assert.ok(fs.existsSync(path.join(root, 'public/images/objects', o.imageFile)), `${id}: 画像 ${o.imageFile}`);
        assert.ok(o.aspect > 0 && o.height > 0, `${id}: aspect / height`);
        assert.ok(Number.isInteger(o.sdId), `${id}: sdId（sdServer の画像ID）`);
    }
});

test('神殿: 専用マップ（壁の高さ6・天井つき・大理石）に、女神像とステンドグラスと柱がある', () => {
    assert.equal(temple.id, 'temple');
    assert.equal(temple.wallHeight, 6);
    assert.equal(temple.environment.hasCeiling, true);
    const used = new Set(temple.layout.join(''));
    const defs = [...used].map(ch => objects[temple.legend[ch]]).filter(Boolean);
    assert.ok(defs.some(d => d.type === 'statue'), '女神像');
    assert.ok(defs.filter(d => d.type === 'wall_image').length >= 3, 'ステンドグラス');
    assert.ok(defs.some(d => d.type === 'furniture' && d.parts?.length), '柱');
    // 壁の画像は、通れる隣のマスがある面に付く（壁の中に埋もれていない）
    temple.layout.forEach((row, r) => [...row].forEach((ch, c) => {
        if (objects[temple.legend[ch]]?.type !== 'wall_image') return;
        const open = [[0, -1], [1, 0], [0, 1], [-1, 0]].some(([dx, dz]) => {
            const n = temple.layout[r + dz]?.[c + dx];
            const t = n && objects[temple.legend[n]];
            return n && (!t || !['block', 'door', 'wall_image'].includes(t.type));
        });
        assert.ok(open, `ステンドグラス ${c},${r}: 開いた隣のマスがない`);
    }));
});

test('神殿: 街の神殿の扉から入れて、神殿の出口で、街の扉の前へ戻る', () => {
    const doors = Object.entries(city.links).filter(([, l]) => l.nextMap === 'temple');
    assert.ok(doors.length >= 1);
    for (const [key, l] of doors) {
        const [c, r] = key.split(',').map(Number);
        assert.equal(objects[city.legend[city.layout[r][c]]].type, 'door', `${key}: 扉`);
        assert.ok(l.back, `${key}: 戻る先`);
    }
    assert.ok(Object.values(temple.legend).some(id => objects[id]?.nextMap === '$back'), '神殿の出口');
});

test('神殿: 大理石のテクスチャが game.js に登録されている', () => {
    assert.match(tex, /marbleWall: RetroTextureGenerator\.createMarbleWallTexture/);
    assert.match(tex, /marbleFloor: RetroTextureGenerator\.createMarbleFloorTexture/);
});

test('神殿: 村にも神殿の建物があり、扉から、同じ神殿のマップへ入れる', () => {
    const village = readJson('public/data/maps/village.json');
    const doors = Object.entries(village.links).filter(([, l]) => l.nextMap === 'temple');
    assert.equal(doors.length, 1);
    const [c, r] = doors[0][0].split(',').map(Number);
    assert.equal(objects[village.legend[village.layout[r][c]]].type, 'door');
    assert.equal(village.legend.D, 'dirt_road', '村の土の道の凡例は、そのまま');
});

test('神殿: 司祭は女神像の前に立って動かず、店（取引）を開く。下っ端（修道女・助祭）は話すだけ', () => {
    const shops = readJson('public/data/shops.json');
    const npcs = temple.npcs;
    const statue = temple.layout.flatMap((row, r) => [...row].map((ch, c) => ({ ch, c, r })))
        .find(({ ch }) => objects[temple.legend[ch]]?.type === 'statue');
    const senior = npcs.find(n => n.id === 'priest_senior');
    assert.equal(senior.shopId, 'temple');
    assert.ok(shops.temple && shops.temple.keeper === 'priest_senior' && shops.temple.goods.length >= 1);
    assert.equal(senior.speed, 0);
    assert.equal(senior.wanderRadius, 0);
    assert.equal(senior.x, statue.c, '司祭は、像の正面（同じ列）');
    assert.ok(senior.z > statue.r && senior.z - statue.r <= 3, '司祭は、像の手前（南）');
    for (const n of npcs.filter(n => n.id !== 'priest_senior')) assert.equal(n.shopId, undefined, `${n.id}: 下っ端は店を開かない`);
    for (const g of shops.temple.goods) assert.equal(g.price, readJson('public/data/items.json')[g.itemId].price, `${g.itemId}: 価格`);
});
