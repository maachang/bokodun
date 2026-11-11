import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { gameSource } from './helpers/game.mjs';

const root = process.cwd();
const readJson = (f) => JSON.parse(fs.readFileSync(path.join(root, f), 'utf-8'));
const objects = readJson('public/data/objects.json');
const temple = readJson('public/data/maps/temple.json');
const city = readJson('public/data/maps/city.json');
const tex = gameSource();

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

test('神殿の作り分け: 広さは、大神殿 > 街の神殿 > 村の神殿。大神殿は3階建て・街の神殿は2階建て・村の神殿は1階。3階に枢機卿（話すだけ）がいる', () => {
    const area = (id) => maps[id].layout.length * maps[id].layout[0].length;
    assert.ok(area('temple') > area('temple_town') && area('temple_town') > area('temple_village'));
    assert.ok(!cells(maps.temple_village).some(x => x.def?.type === 'stairs'), '村の神殿: 階段なし（1階だけ）');
    assert.ok(cells(maps.temple_town).some(x => x.def?.type === 'stairs'), '街の神殿: 2階への階段');
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

test('大神殿: 1階は広い1つの空間と、扉でつながる部屋（厨房・懺悔室・聖具室）。2階は通路と神官たちの個室', () => {
    const rooms = ['temple_kitchen', 'temple_refectory', 'temple_confession', 'temple_sacristy'];
    for (const id of rooms) {
        const link = Object.entries(temple.links).find(([, l]) => l.nextMap === id);
        assert.ok(link, `${id}: 1階の扉`);
        const [c, r] = link[0].split(',').map(Number);
        assert.equal(objects[temple.legend[temple.layout[r][c]]].type, 'door');
        const m = readJson(`public/data/maps/${id}.json`);
        assert.ok(Object.values(m.legend).some(v => objects[v]?.nextMap === '$back'), `${id}: 出口`);
        assert.ok(m.npcs.length >= 1, `${id}: 神官`);
        assert.ok(!Object.values(m.legend).some(v => objects[v]?.type === 'wall_image'), `${id}: ステンドグラスはない（広間だけ）`);
    }
    assert.ok(Object.values(readJson('public/data/maps/temple_confession.json').legend).includes('confession_grille'), '懺悔室の格子窓');
    const f2 = readJson('public/data/maps/temple_2f.json');
    const doors = f2.layout.join('').split('').filter(ch => objects[f2.legend[ch]]?.type === 'door').length;
    assert.ok(doors >= 6, `2階: 個室の扉 ${doors}`);
    assert.ok(Object.values(f2.legend).includes('bed_marble'), '2階: 個室のベッド');
    assert.ok(f2.npcs.length >= 5, '2階: 神官たち');
});

test('神殿の部屋の割り振り: 村は広間の端の扉から寝室と厨房、街は1階に食堂と厨房・2階に個室と寝室', () => {
    const v = maps.temple_village, t = maps.temple_town;
    assert.ok(['temple_village_bedroom', 'temple_village_kitchen'].every(id => Object.values(v.links).some(l => l.nextMap === id)));
    for (const [key] of Object.entries(v.links)) {
        const [c, r] = key.split(',').map(Number);
        assert.ok(c === 0 || c === v.layout[0].length - 1, `${key}: 広間の端（左右の壁）の扉`);
        assert.equal(objects[v.legend[v.layout[r][c]]].type, 'door');
    }
    assert.ok(Object.values(t.links).some(l => l.nextMap === 'temple_town_dining') && Object.values(t.links).some(l => l.nextMap === 'temple_town_2f'));
    const ids = (id) => new Set(Object.values(readJson(`public/data/maps/${id}.json`).legend));
    assert.ok(ids('temple_town_dining').has('table_marble') && ids('temple_town_dining').has('stove_marble'), '食堂と厨房');
    const f2 = readJson('public/data/maps/temple_town_2f.json');
    assert.ok(f2.layout.join('').split('').filter(ch => f2.legend[ch] === 'bed_marble').length >= 6, '2階: ベッド（個室・寝室）');
    assert.ok(ids('temple_village_kitchen').has('stove_stone') && ids('temple_village_bedroom').has('bed_stone'));
});

test('大神殿（グレードアップ）: 聖堂＋食堂・厨房・懺悔室・聖具室、西の扉の回廊・医務室・客室・施し所、地下納骨堂。回廊から会議室・図書室・宝物庫', () => {
    const dests = new Set(Object.values(temple.links).map(l => l.nextMap));
    for (const id of ['temple_kitchen', 'temple_refectory', 'temple_confession', 'temple_sacristy', 'temple_cloister', 'temple_infirmary', 'temple_guesthouse', 'temple_almonry', 'temple_crypt', 'temple_2f']) assert.ok(dests.has(id), `聖堂の扉・階段: ${id}`);
    const cloister = readJson('public/data/maps/temple_cloister.json');
    assert.equal(cloister.type, 'open', '回廊は、屋根のない中庭');
    const cd = new Set(Object.values(cloister.links).map(l => l.nextMap));
    for (const id of ['temple_chapter_house', 'temple_library', 'temple_treasury']) assert.ok(cd.has(id), `回廊から: ${id}`);
    assert.ok(Object.values(cloister.legend).includes('plaza_fountain'), '回廊の庭の噴水');
    // 聖堂の西の壁は回廊などへ、東の壁は食堂・厨房・懺悔室・聖具室へ（修道院の、聖堂と回廊の関係）
    const side = (id) => Number(Object.entries(temple.links).find(([, l]) => l.nextMap === id)[0].split(',')[0]);
    for (const id of ['temple_cloister', 'temple_infirmary', 'temple_guesthouse', 'temple_almonry']) assert.equal(side(id), 0, `${id}: 西の壁`);
    for (const id of ['temple_kitchen', 'temple_refectory', 'temple_confession', 'temple_sacristy']) assert.equal(side(id), 20, `${id}: 東の壁`);
    const crypt = readJson('public/data/maps/temple_crypt.json');
    assert.ok(Object.values(crypt.legend).includes('sarcophagus_stone') && crypt.layout.join('').split('').filter(ch => crypt.legend[ch] === 'sarcophagus_stone').length >= 6, '納骨堂の石棺');
    const library = readJson('public/data/maps/temple_library.json');
    assert.ok(library.layout.join('').split('').filter(ch => library.legend[ch] === 'bookshelf_marble').length >= 6, '図書室の本棚');
    assert.ok(readJson('public/data/maps/temple_infirmary.json').layout.join('').split('').filter(ch => objects[readJson('public/data/maps/temple_infirmary.json').legend[ch]]?.type === 'furniture' && readJson('public/data/maps/temple_infirmary.json').legend[ch] === 'bed_marble').length >= 6, '医務室のベッド');
});

test('B の大教会の回廊・宝物庫は専用で、宝物庫の守衛は B の衛兵（ID 371）。共有の宝物庫の守衛は、重装衛兵のまま', () => {
    const rd = id => readJson(`public/data/maps/${id}.json`);
    assert.ok(Object.values(rd('temple_b').links).some(l => l.nextMap === 'temple_cloister_b'), 'B の大教会 → B 専用の回廊');
    assert.ok(Object.values(rd('temple_cloister_b').links).some(l => l.nextMap === 'temple_treasury_b'), '回廊 → B 専用の宝物庫');
    assert.ok(rd('temple_treasury_b').npcs.some(n => n.id === 'guard_b') && !rd('temple_treasury_b').npcs.some(n => n.id === 'guard_spear'), 'B の宝物庫の守衛');
    assert.ok(rd('temple_treasury').npcs.some(n => n.id === 'guard_spear'), '共有の宝物庫の守衛');
});
