// 港町（E ガリレオ連盟・K1 コマチ港町）は、海に完全に密接している。入口の前（戻り先のマス）は、物・人でふさがない。
// 「港町」は、海に直結して港がある町の総称。海から離れた港町は、何のための港かが分からない（メモリ feedback_port_town_must_touch_sea）。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
const mapFormatTmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mapformat-')), 'mapFormat.mjs');
fs.copyFileSync(path.join(root, 'public/js/mapFormat.js'), mapFormatTmp);
const { normalizeMap } = await import(mapFormatTmp);
const readJson = (f) => normalizeMap(JSON.parse(fs.readFileSync(path.join(root, f), 'utf-8')));
const objects = readJson('public/data/objects.json');
const MESH = 64;
const mapFiles = fs.readdirSync(path.join(root, 'public/data/maps'));

// 世界のマス (x, y) の物体の名前。マップのないメッシュ（海だけ）は、'sea'
const meshCache = new Map();
function tileName(x, y) {
    const j = Math.floor(y / MESH), i = Math.floor(x / MESH), id = `w_${String(j).padStart(2, '0')}_${String(i).padStart(2, '0')}`;
    if (!meshCache.has(id)) meshCache.set(id, mapFiles.includes(id + '.json') ? readJson(`public/data/maps/${id}.json`) : null);
    const m = meshCache.get(id);
    if (!m) return 'sea';
    return m.legend[m.layout[y - j * MESH][x - i * MESH]] ?? '0';
}
// 港の「海」は、深い海（sea）だけ。浅瀬（water_shallow）・砂の陸は、海に数えない（座礁する・壁と海の間に陸が残る）
const isSea = (n) => n === 'sea';

// 街の外観（壁）の位置は、外のマップにある、その街への門（links: nextMap = town_<id>）から割り出す。壁は、半幅 8・半高さ 6（gen: TOWN_HW・TOWN_HH）。門は、南の壁の真ん中の 2 マス
function townWall(id) {
    const gates = [];
    for (const f of mapFiles.filter(n => /^w_\d\d_\d\d\.json$/.test(n))) {
        const m = readJson(`public/data/maps/${f}`);
        const [, j, i] = f.match(/^w_(\d\d)_(\d\d)/).map(Number);
        for (const [k, l] of Object.entries(m.links ?? {})) if (l.nextMap === `town_${id}`) { const [x, y] = k.split(',').map(Number); gates.push([i * MESH + x, j * MESH + y]); }
    }
    assert.ok(gates.length === 2, `${id}: 外のマップに、門が 2 マスある`);
    const px = Math.max(...gates.map(g => g[0])), y1 = gates[0][1];
    return { x0: px - 8, x1: px + 7, y0: y1 - 11, y1 };
}

for (const id of ['e', 'k1']) {
    test(`港町 ${id}: 東の壁のすぐ外が、どの行も深い海（壁と海の間に、陸・浅瀬がない）`, () => {
        const w = townWall(id);
        const gaps = [];
        for (let y = w.y0; y <= w.y1; y++) {
            let g = 0;
            while (!isSea(tileName(w.x1 + 1 + g, y)) && g < 40) g++;
            gaps.push(g);
        }
        assert.ok(Math.max(...gaps) === 0, `${id}: 壁と深い海の間のマス（行ごと）: ${gaps.join(',')}`);
    });
}

// 町の中に港（水・桟橋・船）があるなら、町の外も港（同じ海に、桟橋と船）。K1 の外のマップ
test('港町 k1: 町の外にも港がある。壁の東の海に、桟橋（plank_bridge）が海へ伸び、係留した船が 2 隻以上ある', () => {
    const w = townWall('k1');
    let pier = 0, seaBeside = 0, ships = 0;
    for (let y = w.y0 - 12; y <= w.y1 + 12; y++) for (let x = w.x1 - 10; x <= w.x1 + 20; x++) {
        const n = tileName(x, y);
        if (n === 'ship_small' || n === 'ship_large') ships++;
        if (n === 'plank_bridge') { pier++; if (isSea(tileName(x + 1, y)) || isSea(tileName(x, y + 1)) || isSea(tileName(x, y - 1))) seaBeside++; }
    }
    assert.ok(pier >= 8 && seaBeside >= 8, `桟橋 ${pier} マス（海に面する ${seaBeside}）`);
    assert.ok(ships >= 2, `外の港の船 ${ships} 隻`);
});

// 街の施設の入口の前（戻り先 back のマス）は、歩ける。物・人でふさがない
test('街の施設の入口の前（戻り先）は、物と人でふさがれていない（K・K1 の街）', () => {
    const npcDefs = readJson('public/data/npcs.json');
    for (const id of ['town_k', 'town_k1']) {
        const m = readJson(`public/data/maps/${id}.json`);
        for (const [key, l] of Object.entries(m.links ?? {})) {
            if (!l.back) continue;
            const x = Math.floor(l.back.x), z = Math.floor(l.back.z);
            const d = objects[m.legend[m.layout[z][x]]];
            assert.ok(!d?.solid, `${id} ${key}: 入口の前 (${x},${z}) に、物（${m.legend[m.layout[z][x]]}）がある`);
            for (const n of m.npcs ?? []) assert.ok(Math.hypot(n.x - l.back.x, n.z - l.back.z) > 0.9, `${id} ${key}: 入口の前 (${x},${z}) に、人（${n.id}）が立っている`);
        }
    }
});
