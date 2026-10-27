import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const projectRoot = process.cwd();

// entities.js はブラウザ向けの絶対パス import ('/js/three.module.js') を使うため、
// 一時コピーの import を実パスに読み替えてロードする
async function loadMonster() {
    const src = fs.readFileSync(path.join(projectRoot, 'public/js/entities.js'), 'utf-8')
        .replace("'/js/three.module.js'", JSON.stringify(path.join(projectRoot, 'public/js/three.module.js')));
    const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'stealth-')), 'entities.mjs');
    fs.writeFileSync(tmp, src);
    return (await import(tmp)).Monster;
}

const defs = JSON.parse(fs.readFileSync(path.join(projectRoot, 'public/data/enemies.json'), 'utf-8'));
const tex = new Proxy({}, { get: () => ({}) });
const P = (x, z) => ({ x, z, radius: 0.4 });
// facing = 0 は +z 方向（プレイヤーを +z 側に置くと正面）
const make = (Monster, type) => { const m = new Monster(type, 0, 0, tex, defs[type]); m.facing = 0; return m; };
const run = (m, player, visibility, sec, colliders = []) => {
    for (let t = 0; t < sec; t += 0.05) m.update(0.05, player, colliders, [], null, null, visibility);
    return m.state;
};

test('隠密: 敵の索敵（距離・視野角・視線・地形係数・状態遷移）', async (t) => {
    const Monster = await loadMonster();
    const wall = [{ minX: -3, maxX: 3, minZ: 3, maxZ: 4 }];

    await t.test('正面の感知距離内なら、気づいた瞬間に追跡（攻撃）へ移る', () => {
        const m = make(Monster, 'slime');
        assert.equal(run(m, P(0, 7), 1.0, 0.05), 'chase');
    });

    await t.test('感知距離の外では未発見のまま', () => {
        assert.equal(run(make(Monster, 'slime'), P(0, 9), 1.0, 3), 'unaware');
    });

    await t.test('地形の視界係数で感知距離が縮む（湿地 0.6 では 5m で気づかない）', () => {
        assert.equal(run(make(Monster, 'slime'), P(0, 5), 0.6, 3), 'unaware');
        assert.equal(run(make(Monster, 'slime'), P(0, 5), 1.0, 3), 'chase');
    });

    await t.test('背後は気づかないが、近接（2m以内）なら気づく', () => {
        assert.equal(run(make(Monster, 'slime'), P(0, -6), 1.0, 3), 'unaware');
        assert.equal(run(make(Monster, 'slime'), P(0, -1.5), 1.0, 3), 'chase');
    });

    await t.test('壁越しには気づかない', () => {
        assert.equal(run(make(Monster, 'slime'), P(0, 6), 1.0, 3, wall), 'unaware');
    });

    await t.test('被弾したら即追跡', () => {
        const m = make(Monster, 'slime');
        m.takeDamage(1, null);
        assert.equal(m.state, 'chase');
    });

    await t.test('追跡中に見失って 4 秒で未発見に戻る', () => {
        const m = make(Monster, 'slime');
        m.speed = 0; // 位置を固定する（追跡中に壁を越えて視線が通ってしまうのを防ぐ）
        run(m, P(0, 5), 1.0, 2);
        assert.equal(m.state, 'chase');
        assert.equal(run(m, P(0, 5), 1.0, 3, wall), 'chase');
        assert.equal(run(m, P(0, 5), 1.0, 2, wall), 'unaware');
    });

    await t.test('未発見の敵は 感知距離×1.5×視界係数 を超えると描画しない', () => {
        const m = make(Monster, 'slime');
        run(m, P(0, 11), 1.0, 0.1);
        assert.equal(m.sprite.visible, true);
        run(m, P(0, 13), 1.0, 0.1);
        assert.equal(m.sprite.visible, false);
        run(m, P(0, 11), 0.6, 0.1);
        assert.equal(m.sprite.visible, false);
    });

    await t.test('ミミックは常に追跡状態、飛行の敵は待機中もホバー高さを保つ', () => {
        assert.equal(make(Monster, 'mimic').state, 'chase');
        const wasp = make(Monster, 'parasite_wasp');
        run(wasp, P(0, 40), 1.0, 0.2);
        assert.ok(wasp.sprite.position.y > 1);
    });
});

test('隠密: データ定義（視界係数・感知距離）', async (t) => {
    await t.test('全マップの environment に 0〜1 の visibility がある', () => {
        const dir = path.join(projectRoot, 'public/data/maps');
        for (const f of fs.readdirSync(dir).filter(n => n.endsWith('.json'))) {
            const map = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8'));
            const v = map.environment?.visibility;
            assert.ok(typeof v === 'number' && v > 0 && v <= 1, `${f}: environment.visibility が不正 (${v})`);
        }
    });

    await t.test('senseRange / senseAngle は指定する場合に正の数', () => {
        for (const [id, d] of Object.entries(defs)) {
            if (d.senseRange !== undefined) assert.ok(d.senseRange > 0, `${id}: senseRange`);
            if (d.senseAngle !== undefined) assert.ok(d.senseAngle > 0 && d.senseAngle <= 180, `${id}: senseAngle`);
        }
    });
});
