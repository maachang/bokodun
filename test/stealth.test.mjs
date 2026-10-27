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
// 位置を固定して判定を検証するため、既定では速度 0（AI が動かない）にする。still=false で通常速度
const make = (Monster, type, still = true) => {
    const m = new Monster(type, 0, 0, tex, defs[type]);
    m.facing = 0;
    if (still) m.speed = 0;
    return m;
};
const run = (m, player, visibility, sec, colliders = []) => {
    for (let t = 0; t < sec; t += 0.05) m.update(0.05, player, colliders, [], null, null, visibility);
    return m.state;
};

test('隠密: 敵の索敵（距離・視野角・視線・地形係数・状態遷移・描画）', async (t) => {
    const Monster = await loadMonster();
    const wall = [{ minX: -3, maxX: 3, minZ: 3, maxZ: 4 }];

    await t.test('正面の感知距離内なら、気づいた瞬間に発見済み(chase)になる', () => {
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
        run(m, P(0, 5), 1.0, 2);
        assert.equal(m.state, 'chase');
        assert.equal(run(m, P(0, 5), 1.0, 3, wall), 'chase');
        assert.equal(run(m, P(0, 5), 1.0, 2, wall), 'unaware');
    });

    await t.test('未発見の敵は 感知距離×2.5×視界係数 を超えると描画しない', () => {
        const m = make(Monster, 'slime'); // 感知距離 8 → 草原 20m
        run(m, P(0, 19), 1.0, 1.0);
        assert.equal(m.sprite.visible, true);
        run(m, P(0, 21), 1.0, 1.0);
        assert.equal(m.sprite.visible, false);
        run(m, P(0, 11), 0.6, 1.0);   // 湿地(0.6) → 12m
        assert.equal(m.sprite.visible, true);
        run(m, P(0, 13), 0.6, 1.0);
        assert.equal(m.sprite.visible, false);
    });

    await t.test('隠密性: high は描画距離が半分になり、発見済みでも遠くでは見えない', () => {
        const spider = make(Monster, 'tarantula_swamp'); // 感知12・high → 草原 15m
        run(spider, P(0, 14), 1.0, 1.0);
        assert.equal(spider.sprite.visible, true);
        run(spider, P(0, 16), 1.0, 1.0);
        assert.equal(spider.sprite.visible, false);

        // 発見済み(chase)でも high は遠くで見えない（normal は常に見える）
        spider.takeDamage(1, null);
        assert.equal(spider.state, 'chase');
        run(spider, P(0, 16), 1.0, 1.0);
        assert.equal(spider.sprite.visible, false);
        const slime = make(Monster, 'slime');
        slime.takeDamage(1, null);
        run(slime, P(0, 40), 1.0, 1.0);
        assert.equal(slime.sprite.visible, true);
    });

    await t.test('隠密性: high は描画距離の手前で透明から徐々に見えてくる', () => {
        const spider = make(Monster, 'tarantula_swamp'); // 描画距離 15m、フェード範囲は 9〜15m
        run(spider, P(0, 8), 1.0, 1.0);
        assert.equal(spider.spriteMat.opacity, 1);
        run(spider, P(0, 12), 1.0, 1.0);
        assert.ok(spider.spriteMat.opacity > 0 && spider.spriteMat.opacity < 1);
        const mid = spider.spriteMat.opacity;
        run(spider, P(0, 10), 1.0, 1.0);
        assert.ok(spider.spriteMat.opacity > mid, '近いほど濃い');
    });

    await t.test('隠密性: low は描画距離が広い（スケルトン 感知10 → 草原 35m）', () => {
        const sk = make(Monster, 'skeleton');
        run(sk, P(0, 34), 1.0, 1.0);
        assert.equal(sk.sprite.visible, true);
        run(sk, P(0, 36), 1.0, 1.0);
        assert.equal(sk.sprite.visible, false);
    });

    await t.test('出現: 見える範囲に入った敵は、突然ではなく時間をかけて透明から現れる（フェードイン）', () => {
        const m = make(Monster, 'slime');
        assert.equal(m.spriteMat.opacity, 0, '最初は透明');
        run(m, P(0, 5), 1.0, 0.3);
        assert.ok(m.spriteMat.opacity > 0.3 && m.spriteMat.opacity < 0.7, `半分ほど現れている (${m.spriteMat.opacity})`);
        assert.equal(m.sprite.visible, true);
        run(m, P(0, 5), 1.0, 0.4);
        assert.equal(m.spriteMat.opacity, 1, '約 0.6 秒で完全に現れる');
    });

    await t.test('出現: 見えない範囲へ出る場合も、すぐには消えず徐々に消える（フェードアウト）', () => {
        const m = make(Monster, 'slime');
        m.facing = Math.PI; // プレイヤーに背を向けて、気づかない（未発見のまま）
        run(m, P(0, 5), 1.0, 1.0);
        assert.equal(m.state, 'unaware');
        assert.equal(m.spriteMat.opacity, 1);
        run(m, P(0, 40), 1.0, 0.2);
        assert.ok(m.spriteMat.opacity > 0 && m.spriteMat.opacity < 1, `消えかけ (${m.spriteMat.opacity})`);
        run(m, P(0, 40), 1.0, 1.0);
        assert.equal(m.sprite.visible, false);
    });

    await t.test('出現: ミミックは最初から見える。倒した敵は透明度を引きずらずに死亡演出へ入る', () => {
        assert.equal(make(Monster, 'mimic').appearAlpha, 1);
        const m = make(Monster, 'slime');
        run(m, P(0, 5), 1.0, 0.2); // フェードイン途中
        m.takeDamage(9999, { x: 1, z: 0 });
        assert.equal(m.spriteMat.opacity, 1);
    });

    await t.test('ミミックは常に発見済み状態', () => {
        assert.equal(make(Monster, 'mimic').state, 'chase');
    });

    await t.test('未発見でも AI（移動）は従来どおり距離 18 以内で動く（隠密は描画のみに影響）', () => {
        const m = make(Monster, 'skeleton', false); // 感知距離 10。15m 先は未発見
        m.facing = Math.PI;                  // プレイヤーに背を向ける
        run(m, P(0, 15), 1.0, 1.0);
        assert.equal(m.state, 'unaware');
        assert.ok(m.z > 0.5, `未発見でもプレイヤーへ近づく (z=${m.z})`);
    });
});

test('死亡演出: 白フラッシュ → 横倒し → 半透明で消える', async (t) => {
    const Monster = await loadMonster();

    await t.test('致命傷で active=false になり、約1.3秒かけて演出が終わる', () => {
        const m = make(Monster, 'slime');
        assert.equal(m.takeDamage(9999, { x: 1, z: 0 }), true);
        assert.equal(m.active, false);
        assert.equal(m.deathTiltDir, 1);

        assert.equal(m.updateDeath(0.05), false);
        assert.ok(m.spriteMat.color.r > 1, '最初の 0.1 秒は白く光る');

        m.updateDeath(0.35); // t = 0.4
        assert.equal(m.spriteMat.color.r, 1);
        assert.ok(Math.abs(m.spriteMat.rotation) > 0 && Math.abs(m.spriteMat.rotation) < Math.PI / 2, '倒れている途中');

        m.updateDeath(0.3);  // t = 0.7
        assert.ok(Math.abs(Math.abs(m.spriteMat.rotation) - Math.PI / 2) < 1e-6, '0.7 秒で 90° 横倒し');

        assert.equal(m.updateDeath(0.3), false); // t = 1.0
        assert.ok(m.spriteMat.opacity > 0 && m.spriteMat.opacity < 1, '半透明で消えていく');
        assert.equal(m.updateDeath(0.31), true); // t > 1.3
    });

    await t.test('撃たれた方向で横倒しの向きが変わる', () => {
        const m = make(Monster, 'slime');
        m.takeDamage(9999, { x: -1, z: 0 });
        assert.equal(m.deathTiltDir, -1);
    });

    await t.test('飛行の敵は倒れながら地面へ落下する', () => {
        const m = make(Monster, 'parasite_wasp');
        run(m, P(0, 5), 1.0, 0.3); // 発見済みにしてホバー
        assert.ok(m.baseY > 0.5); // ホバー高さ（1.3 ± 0.35 で上下動する）
        m.takeDamage(9999, { x: 1, z: 0 });
        for (let i = 0; i < 20; i++) m.updateDeath(0.03); // t = 0.6
        assert.ok(m.sprite.position.y < m.baseY * 0.5);
    });
});

test('敵の速度: enemies.json の speed が反映される', async (t) => {
    const Monster = await loadMonster();

    await t.test('speed は敵ごとに指定でき、0 は 0 として扱われる', () => {
        const m = new Monster('slime', 0, 0, tex, { ...defs.slime, speed: 0 });
        assert.equal(m.speed, 0);
        const w = new Monster('slime', 0, 0, tex, { ...defs.slime, speed: 4.2 });
        assert.equal(w.speed, 4.2);
        const d = new Monster('slime', 0, 0, tex, { ...defs.slime, speed: undefined });
        assert.equal(d.speed, 1.5);
    });

    await t.test('ワームの這う速さは speed に従う（固定値ではない）', () => {
        const move = (speed) => {
            const m = new Monster('acid_worm', 0, 0, tex, { ...defs.acid_worm, speed });
            for (let i = 0; i < 20; i++) m.update(0.05, P(0, 10), [], [], null, null, 1.0);
            return m.z;
        };
        const slow = move(1.0);
        const fast = move(3.0);
        assert.ok(fast > slow * 2, `速いほど遠くへ進む (slow=${slow}, fast=${fast})`);
    });

    await t.test('飛行の敵（ワスプ・蚊）はスライムより速い', () => {
        assert.ok(defs.parasite_wasp.speed > defs.slime.speed * 2);
        assert.ok(defs.maria_mosquito.speed > defs.parasite_wasp.speed);
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

    await t.test('stealth は low / normal / high のいずれか（未指定は normal）', () => {
        for (const [id, d] of Object.entries(defs)) {
            if (d.stealth !== undefined) assert.ok(['low', 'normal', 'high'].includes(d.stealth), `${id}: stealth`);
        }
    });

    await t.test('全ての敵に deathColor（#rrggbb）がある', () => {
        for (const [id, d] of Object.entries(defs)) {
            assert.match(d.deathColor ?? '', /^#[0-9a-fA-F]{6}$/, `${id}: deathColor`);
        }
    });

    await t.test('senseRange / senseAngle は指定する場合に正の数', () => {
        for (const [id, d] of Object.entries(defs)) {
            if (d.senseRange !== undefined) assert.ok(d.senseRange > 0, `${id}: senseRange`);
            if (d.senseAngle !== undefined) assert.ok(d.senseAngle > 0 && d.senseAngle <= 180, `${id}: senseAngle`);
        }
    });
});
