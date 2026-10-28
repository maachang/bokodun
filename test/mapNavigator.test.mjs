import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const projectRoot = process.cwd();
async function loadNavigator() {
    // ブラウザ用の ES モジュール（.js）を、.mjs にコピーして読み込む
    const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'nav-')), 'mapNavigator.mjs');
    fs.copyFileSync(path.join(projectRoot, 'public/js/mapNavigator.js'), tmp);
    return (await import(tmp)).MapNavigator;
}

const back = { x: 8, z: 1, angle: 3.14159 };

test('マップ移動: 建物に入ると戻る先を記録し、出口で、その場所へ戻る', async () => {
    const nav = new (await loadNavigator())();
    const enter = nav.plan('city', 'castle', { back, params: { shopId: 'x' } });
    assert.deepEqual(enter, { mapId: 'castle', opts: { keepStack: true, params: { shopId: 'x' } } });
    const exit = nav.plan('castle', '$back', {}, 'city');
    assert.deepEqual(exit, { mapId: 'city', opts: { keepStack: true, spawn: back } });
    assert.equal(nav.stack.length, 0);
});

test('マップ移動: 読み込み中（初めて開くマップ）に、毎フレーム呼ばれても、戻る先の記録は増えない（出口で別の場所へ飛ぶ不具合）', async () => {
    const nav = new (await loadNavigator())();
    assert.ok(nav.plan('city', 'castle', { back }));
    nav.busy = true;   // loadMap が読み込み中
    // 読み込み中、扉のマスの中にいるので、毎フレーム呼ばれる。このとき、currentMapId はすでに移動先
    for (let i = 0; i < 30; i++) assert.equal(nav.plan('castle', 'castle', { back }), null);
    nav.busy = false;
    assert.equal(nav.stack.length, 1, '記録は 1 件だけ');
    // 出口で、街の城門の前へ戻る（城の玉座の間へ戻らない）
    const exit = nav.plan('castle', '$back', {}, 'city');
    assert.equal(exit.mapId, 'city');
    assert.deepEqual(exit.opts.spawn, back);
});

test('マップ移動: 戻る先の記録がなければ、出口は fallback のマップへ。記録は消せる', async () => {
    const nav = new (await loadNavigator())();
    assert.deepEqual(nav.plan('castle', '$back', {}, 'city'), { mapId: 'city', opts: { keepStack: true, params: undefined } });
    nav.plan('city', 'shop', { back });
    nav.clear();
    assert.equal(nav.stack.length, 0);
});

// GameEngine に組み込まれた動き: 読み込みの遅い（初めて開く）マップへの移動で、扉の中から毎フレーム enterMap が呼ばれても、1 回しか移動しない
async function loadEngine() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'navgame-'));
    for (const f of ['game', 'textures', 'entities', 'npc', 'mapNavigator', 'audio', 'particles', 'slashEffect', 'strikeEffect', 'sdAssetManager', 'three.module']) {
        const src = fs.readFileSync(path.join(projectRoot, `public/js/${f}.js`), 'utf-8').replaceAll("'/js/", "'./");
        fs.writeFileSync(path.join(dir, `${f}.js`), src);
    }
    const { GameEngine } = await import(path.join(dir, 'game.js'));
    const { MapNavigator } = await import(path.join(dir, 'mapNavigator.js'));
    return { GameEngine, MapNavigator };
}

test('GameEngine: 初めて開くマップの読み込み中に enterMap が繰り返し呼ばれても、移動は 1 回で、出口は入った場所へ戻る', async () => {
    const { GameEngine, MapNavigator } = await loadEngine();
    const g = Object.create(GameEngine.prototype);
    g.nav = new MapNavigator();
    g.currentMapId = 'city';
    g.currentMapData = { nextMap: 'village' };
    const loads = [];
    g.loadMapBody = async (mapId, opts) => {   // 読み込みに時間がかかるマップ（loadMap は、読み込みの前に currentMapId を移動先へ変える）
        loads.push({ mapId, opts });
        g.currentMapId = mapId;
        await new Promise(r => setTimeout(r, 30));
        g.currentMapData = { nextMap: 'city' };
    };
    for (let frame = 0; frame < 20; frame++) {
        g.enterMap('castle', { back });
        await new Promise(r => setTimeout(r, 1));
    }
    await new Promise(r => setTimeout(r, 60));
    assert.equal(loads.length, 1, '移動は 1 回だけ');
    assert.equal(g.nav.stack.length, 1, '戻る先の記録は 1 件だけ');

    g.enterMap('$back', {});
    await new Promise(r => setTimeout(r, 60));
    assert.equal(loads.length, 2);
    assert.equal(loads[1].mapId, 'city', '出口は、入った街へ戻る（城の玉座の間ではない）');
    assert.deepEqual(loads[1].opts.spawn, back);
    assert.equal(g.nav.busy, false, '読み込みが終わったら、次の移動を受け付ける');
});
