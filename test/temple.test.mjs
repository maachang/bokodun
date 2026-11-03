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

test('神殿: 専用マップ（大神殿は壁の高さ12・天井つき・大理石）に、女神像とステンドグラスと柱がある', () => {
    assert.equal(temple.id, 'temple');
    assert.equal(temple.wallHeight, 12);
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
    assert.equal(doors.length, 1, "街の神殿の扉は1枚（十字架も1つ）");
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

test('神殿: 村にも神殿の建物があり、扉から、村の神殿（temple_village）へ入れる', () => {
    const village = readJson('public/data/maps/village.json');
    const doors = Object.entries(village.links).filter(([, l]) => l.nextMap === 'temple_village');
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

const maps = Object.fromEntries(['temple', 'temple_2f', 'temple_3f', 'temple_town', 'temple_village'].map(id => [id, readJson(`public/data/maps/${id}.json`)]));
const cells = (m) => m.layout.flatMap((row, r) => [...row].map((ch, c) => ({ c, r, def: objects[m.legend[ch]] })));
const statueOf = (m) => cells(m).find(x => x.def?.type === 'statue');

test('神殿の作り分け: 像の大きさは、大神殿が普通の2倍、村が半分（街の神殿は普通）', () => {
    const h = (id) => statueOf(maps[id]).def.height;
    assert.equal(h('temple'), 2 * h('temple_town'));
    assert.equal(h('temple_village') * 2, h('temple_town'));
});

test('神殿の作り分け: 広さは、大神殿 > 街の神殿 > 村の神殿。大神殿だけ階段があり、3階に枢機卿（話すだけ）がいる', () => {
    const area = (id) => maps[id].layout.length * maps[id].layout[0].length;
    assert.ok(area('temple') > area('temple_town') && area('temple_town') > area('temple_village'));
    for (const id of ['temple_town', 'temple_village']) assert.ok(!cells(maps[id]).some(x => x.def?.type === 'stairs'), `${id}: 階段なし`);
    assert.ok(cells(maps.temple).some(x => x.def?.type === 'stairs'));
    const cardinal = maps.temple_3f.npcs.find(n => n.id === 'cardinal');
    assert.ok(cardinal && cardinal.shopId === undefined, '枢機卿は話すだけ');
});

test('神殿の作り分け: 神官の数（大神殿は司祭、街は複数の神官で、受付は普通の神官、村は女性の神官1人）と、店', () => {
    const shops = readJson('public/data/shops.json');
    const keeper = (id) => maps[id].npcs.find(n => n.shopId);
    assert.equal(keeper('temple').id, 'priest_senior');
    assert.equal(keeper('temple_town').id, 'priest_man');
    assert.ok(maps.temple_town.npcs.length >= 3, '街の神殿は、複数の神官');
    assert.equal(keeper('temple_village').id, 'priest_woman');
    assert.equal(maps.temple_village.npcs.length, 1);
    for (const id of ['temple', 'temple_town', 'temple_village']) {
        const k = keeper(id), st = statueOf(maps[id]);
        assert.equal(shops[k.shopId].keeper, k.id, `${id}: 店主`);
        assert.equal(k.x, st.c, `${id}: 像の正面`);
        assert.ok(k.z > st.r && k.z - st.r <= 3, `${id}: 像の手前`);
        assert.equal(k.speed, 0);
    }
});

test('神殿の作り分け: 村の神殿は、レンガ・ステンドグラスなし・絨毯なし。大神殿と街の神殿は、大理石', () => {
    const v = cells(maps.temple_village).map(x => x.def).filter(Boolean);
    assert.ok(v.some(d => d.texture === 'brick'));
    assert.ok(!v.some(d => d.type === 'wall_image' || d.texture === 'marbleWall' || d.texture === 'marbleFloor' || d.floorTexture === 'marbleFloor' || d.ceilingTexture === 'marbleWall' || d.pedestalTexture === 'marbleWall'), '像の台座・床・天井も、大理石にしない');
    assert.ok(!v.some(d => d.pedestalTexture === undefined && d.type === 'statue'), '像の台座の材質を、明示する');
    assert.ok(!Object.values(maps.temple_village.legend).includes('temple_carpet'));
    for (const id of ['temple', 'temple_town']) {
        const d = cells(maps[id]).map(x => x.def).filter(Boolean);
        assert.ok(d.some(x => x.type === 'wall_image') && d.some(x => x.texture === 'marbleWall'), `${id}: ステンドグラスと大理石`);
    }
});
