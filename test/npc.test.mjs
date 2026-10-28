import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const projectRoot = process.cwd();
const readJson = (f) => JSON.parse(fs.readFileSync(path.join(projectRoot, f), 'utf-8'));
const npcs = readJson('public/data/npcs.json');
const objects = readJson('public/data/objects.json');

async function loadNpc() {
    const src = fs.readFileSync(path.join(projectRoot, 'public/js/npc.js'), 'utf-8')
        .replace("'/js/three.module.js'", JSON.stringify(path.join(projectRoot, 'public/js/three.module.js')));
    const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'npc-')), 'npc.mjs');
    fs.writeFileSync(tmp, src);
    return (await import(tmp)).Npc;
}
const mk = (Npc, over = {}) => new Npc('t', 10, 10, { isTexture: true }, { name: '太郎', lines: ['こんにちは', 'やあ'], radius: 0.4, speed: 1.0, wanderRadius: 3, height: 2, aspect: 0.4, ...over });
const run = (npc, sec, blocked = () => false) => { for (let t = 0; t < sec; t += 0.05) npc.update(0.05, blocked); };

test('村人の定義: 画像が存在し、縦横比が画像と合い、セリフがある', () => {
    for (const [id, def] of Object.entries(npcs)) {
        const file = path.join(projectRoot, 'public', def.texture);
        assert.ok(fs.existsSync(file), `${id}: ${def.texture}`);
        const png = fs.readFileSync(file);
        assert.equal(png.readUInt8(25), 6, `${id}: アルファ付き PNG`);
        const ratio = png.readUInt32BE(16) / png.readUInt32BE(20);
        assert.ok(Math.abs(ratio - def.aspect) < 0.01, `${id}: aspect ${def.aspect} ≠ 画像 ${ratio.toFixed(3)}`);
        assert.ok(def.lines.length >= 1 && def.name && def.height > 0 && def.radius > 0, id);
    }
});

test('村: 村人の配置（定義済みの村人、マップ内、通れない場所に置かない、重ならない）', () => {
    // 村長は、村長の家（別の屋内マップ）の中にいる
    for (const id of ['village', 'village_chief_house']) {
        const map = readJson(`public/data/maps/${id}.json`);
        const seen = [];
        for (const n of map.npcs) {
            assert.ok(npcs[n.id], `未定義の村人: ${n.id}`);
            assert.ok(n.x > 0 && n.z > 0 && n.x < map.layout[0].length - 1 && n.z < map.layout.length - 1, `${id}/${n.id}: マップ内`);
            const d = objects[map.legend[map.layout[n.z][n.x]]];
            assert.ok(map.layout[n.z][n.x] === '0' || (d && !d.solid && d.type !== 'furniture'), `${id}/${n.id}: 通れないマス (${map.layout[n.z][n.x]})`);
            assert.ok(!seen.some(s => s.x === n.x && s.z === n.z), `${id}/${n.id}: 重なり`);
            seen.push(n);
        }
    }
    const village = readJson('public/data/maps/village.json');
    const house = readJson('public/data/maps/village_chief_house.json');
    assert.ok(!village.npcs.some(n => n.id === 'village_chief'), '村長は村の外には出ていない');
    assert.ok(house.npcs.some(n => n.id === 'village_chief'), '村長は村長の家の中');
});

test('村人の動き: 立ち止まり → 生まれた位置の近く（wanderRadius 以内）を歩く → また止まる', async () => {
    const Npc = await loadNpc();
    const npc = mk(Npc);
    let walked = false, maxFar = 0;
    for (let t = 0; t < 120; t += 0.05) {
        npc.update(0.05, () => false);
        if (npc.state === 'walk') walked = true;
        maxFar = Math.max(maxFar, Math.hypot(npc.x - 10, npc.z - 10));
    }
    assert.ok(walked, '歩き出す');
    assert.ok(maxFar > 0.5, `動いた (${maxFar})`);
    assert.ok(maxFar <= 3 + 0.2, `行動範囲内 (${maxFar})`);
});

test('村人の動き: 立てない場所には行かない／行く手をふさがれたら止まる／wanderRadius 0 は動かない', async () => {
    const Npc = await loadNpc();
    // すべて立てない → 動かない
    const stuck = mk(Npc);
    run(stuck, 60, () => true);
    assert.deepEqual([stuck.x, stuck.z], [10, 10]);
    // 東（x が大きい側）が壁
    const wall = (x) => x > 10.5;
    const w = mk(Npc);
    run(w, 200, (x) => wall(x));
    assert.ok(w.x <= 10.5 + 1e-9, `壁の中に入らない (${w.x})`);
    // wanderRadius 0
    const still = mk(Npc, { wanderRadius: 0 });
    run(still, 60);
    assert.deepEqual([still.x, still.z], [10, 10]);
});

test('村人のセリフ: 近づくと出る（離れるまで同じセリフ）。遠いと出ない', async () => {
    const Npc = await loadNpc();
    const npc = mk(Npc);
    assert.equal(npc.speechFor({ x: 30, z: 30 }), null);
    const first = npc.speechFor({ x: 10, z: 11 });
    assert.match(first, /^太郎「(こんにちは|やあ)」$/);
    for (let i = 0; i < 20; i++) assert.equal(npc.speechFor({ x: 10, z: 11 }), first, '近くにいる間は同じ');
    assert.equal(npc.speechFor({ x: 30, z: 30 }), null);
    assert.notEqual(npc.currentLine, 'x');
});

// ゲーム側（GameEngine）: 村人が立てない場所の判定、プレイヤーとの衝突、セリフ
async function loadGame() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'npcgame-'));
    for (const f of ['game', 'textures', 'entities', 'npc', 'mapNavigator', 'audio', 'particles', 'slashEffect', 'strikeEffect', 'sdAssetManager', 'three.module']) {
        const src = fs.readFileSync(path.join(projectRoot, `public/js/${f}.js`), 'utf-8').replaceAll("'/js/", "'./");
        fs.writeFileSync(path.join(dir, `${f}.js`), src);
    }
    const { GameEngine } = await import(path.join(dir, 'game.js'));
    const { Npc } = await import(path.join(dir, 'npc.js'));
    return { GameEngine, Npc };
}

test('ゲーム: 村人は壁・水・プレイヤー・ほかの村人の位置に立たない。プレイヤーは村人を通り抜けられない', async (t) => {
    const { GameEngine, Npc } = await loadGame();
    const def = { name: '太郎', lines: ['やあ'], radius: 0.45, speed: 1, wanderRadius: 0, height: 2, aspect: 0.4 };
    const make = (x, z) => new Npc('t', x, z, { isTexture: true }, def);
    const g = Object.create(GameEngine.prototype);
    g.colliders = [{ minX: 20, maxX: 24, minZ: 0, maxZ: 40 }];
    g.terrainGrid = [{ minX: 0, maxX: 8, minZ: 0, maxZ: 8, depth: 0.35 }, { minX: 8, maxX: 12, minZ: 0, maxZ: 4, depth: 0 }];
    g.player = { x: 30, z: 30, radius: 0.4, angle: 0 };
    const a = make(14, 14), b = make(14.5, 14);
    g.npcs = [a, b];
    g.monsters = [];

    await t.test('壁・水（depth>0）・プレイヤー・ほかの村人の近くは立てない。何もなければ立てる', () => {
        assert.equal(g.isNpcBlocked(a, 19.8, 10, 0.45), true, '壁');
        assert.equal(g.isNpcBlocked(a, 4, 4, 0.45), true, '水');
        assert.equal(g.isNpcBlocked(a, 10, 2, 0.45), false, '深さ 0 の床は立てる');
        assert.equal(g.isNpcBlocked(a, 30.5, 30, 0.45), true, 'プレイヤー');
        assert.equal(g.isNpcBlocked(a, 14.6, 14, 0.45), true, 'ほかの村人（自分は除く）');
        assert.equal(g.isNpcBlocked(a, 14, 14, 0.45), true, 'b が近くにいる');
        assert.equal(g.isNpcBlocked(a, 15, 25, 0.45), false);
    });

    await t.test('プレイヤーは村人に向かって進んでも、村人の円の縁で止まる（通り抜けられない）', () => {
        g.npcs = [make(14, 10)];
        g.player.x = 14; g.player.z = 13;
        g.depenetrateFromWalls = () => {};
        g.isInsideWall = () => false;
        for (let i = 0; i < 20; i++) g.movePlayer(0, -0.2);
        const d = Math.hypot(g.player.x - 14, g.player.z - 10);
        assert.ok(d >= (0.4 + 0.45) * 0.8 - 1e-9, `村人に重ならない (${d})`);
        assert.ok(g.player.z > 10, '向こう側へ抜けていない');
    });

    await t.test('セリフ: 近い村人のセリフを返し、いなければ null', () => {
        g.npcs = [make(14, 10)];
        g.player.x = 14; g.player.z = 12;
        assert.equal(g.nearbyNpcSpeech(), '太郎「やあ」');
        g.player.x = 40; g.player.z = 40;
        assert.equal(g.nearbyNpcSpeech(), null);
    });
});
