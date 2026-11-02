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
