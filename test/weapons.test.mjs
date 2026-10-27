import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const projectRoot = process.cwd();
const weapons = JSON.parse(fs.readFileSync(path.join(projectRoot, 'public/data/weapons.json'), 'utf-8'));
const enemyDefs = JSON.parse(fs.readFileSync(path.join(projectRoot, 'public/data/enemies.json'), 'utf-8'));

// ブラウザ向けの絶対パス import ('/js/xxx.js') を相対パスに読み替えた一時コピーを作ってロードする
async function loadModules() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'weapons-'));
    for (const f of ['game', 'textures', 'entities', 'audio', 'particles', 'sdAssetManager', 'three.module']) {
        const src = fs.readFileSync(path.join(projectRoot, `public/js/${f}.js`), 'utf-8').replaceAll("'/js/", "'./");
        fs.writeFileSync(path.join(dir, `${f}.js`), src);
    }
    const { GameEngine } = await import(path.join(dir, 'game.js'));
    const { Monster, Projectile } = await import(path.join(dir, 'entities.js'));
    return { GameEngine, Monster, Projectile };
}

const tex = new Proxy({}, { get: () => ({}) });
const bySlot = (id) => weapons.findIndex(w => w.id === id);

// DOM・描画に依存しない、武器ロジックだけを検証するための模擬ゲーム
function makeGame({ GameEngine }, { mp = 60, weaponIndex = 0 } = {}) {
    const g = Object.create(GameEngine.prototype);
    const calls = { popups: [], exp: 0, sounds: [] };
    Object.assign(g, {
        player: { x: 0, z: 0, angle: 0, attackPower: 15, mp, magicCooldown: 0, weaponIndex },
        monsters: [], projectiles: [], weapons,
        sound: new Proxy({}, { get: (_, name) => () => calls.sounds.push(name) }),
        particles: { spawnBurst() {} },
        scene: { add() {} },
        addPopup: (msg) => calls.popups.push(msg),
        notifyEnemyEngaged() {},
        gainExp: (n) => { calls.exp += n; },
        updateWeaponHud() {},
    });
    return { g, calls };
}

// angle = 0 のプレイヤーは -z 方向（z が負の側）を向く
const spawn = (M, type, x, z) => new M.Monster(type, x, z, tex, enemyDefs[type]);

test('武器定義（weapons.json）', async (t) => {
    await t.test('4 スロット（ダガー・ファイア・爆発火球・拡散弾）が定義され、必須項目がある', () => {
        assert.deepEqual(weapons.map(w => w.id), ['dagger', 'fire', 'explosion', 'spread']);
        for (const w of weapons) {
            assert.ok(w.name && ['melee', 'fireball', 'explosive', 'spread'].includes(w.type), `${w.id}: type`);
            assert.ok(w.mp >= 0 && w.cooldown > 0, `${w.id}: mp/cooldown`);
            if (w.type === 'melee') assert.ok(w.range > 0 && w.arcDeg > 0 && w.powerScale > 0 && w.randomBonus >= 0, `${w.id}: 近接の項目`);
            else assert.ok(w.damage > 0 && w.speed > 0, `${w.id}: damage/speed`);
            if (w.type === 'explosive') assert.ok(w.blastRadius > 0);
            if (w.type === 'spread') assert.ok(w.count >= 2 && w.spreadDeg > 0);
        }
    });
});

test('武器の切り替え・攻撃', async (t) => {
    const M = await loadModules();

    await t.test('切り替え: 範囲外は無視、順送りは最後で先頭へ戻る', () => {
        const { g } = makeGame(M, { weaponIndex: 1 });
        g.setWeapon(9);
        assert.equal(g.player.weaponIndex, 1);
        g.setWeapon(0);
        assert.equal(g.player.weaponIndex, 0);
        g.player.weaponIndex = weapons.length - 1;
        g.cycleWeapon();
        assert.equal(g.player.weaponIndex, 0);
    });

    await t.test('ダガー: MP不要で、前方の射程・扇形内の敵だけを斬る', () => {
        const { g } = makeGame(M, { mp: 0, weaponIndex: bySlot('dagger') });
        const front = spawn(M, 'skeleton', 0, -1.8);
        const frontSide = spawn(M, 'skeleton', -1.0, -1.8);  // 約 29°（扇形 ±50° 内）
        const wide = spawn(M, 'skeleton', -2.0, -0.7);       // 約 71°（扇形外）
        const far = spawn(M, 'skeleton', 0, -6.0);           // 射程外
        const behind = spawn(M, 'skeleton', 0, 1.8);         // 背後
        g.monsters.push(front, frontSide, wide, far, behind);

        g.useWeapon();
        assert.ok(front.hp < front.maxHp, '正面は当たる');
        assert.ok(frontSide.hp < frontSide.maxHp, '扇形内は当たる');
        for (const m of [wide, far, behind]) assert.equal(m.hp, m.maxHp, '扇形外・射程外・背後は当たらない');
        assert.equal(g.player.mp, 0);
        assert.equal(g.player.magicCooldown, 0.4);
    });

    await t.test('MP不足なら発射せず、クールダウン中は連射できない', () => {
        const { g, calls } = makeGame(M, { mp: 5, weaponIndex: bySlot('fire') });
        g.useWeapon();
        assert.equal(g.projectiles.length, 0);
        assert.equal(g.player.mp, 5);
        assert.ok(calls.popups.includes('MP不足!'));

        g.player.mp = 60;
        g.useWeapon();
        assert.equal(g.projectiles.length, 1);
        assert.equal(g.player.mp, 50);
        g.useWeapon(); // クールダウン中
        assert.equal(g.projectiles.length, 1);
    });

    await t.test('拡散弾: 3 発が ±12° の扇状に飛び、MP20を消費する', () => {
        const { g } = makeGame(M, { weaponIndex: bySlot('spread') });
        g.useWeapon();
        assert.equal(g.projectiles.length, 3);
        assert.equal(g.player.mp, 40);
        const angles = g.projectiles.map(p => Math.atan2(-p.dirX, -p.dirZ) * 180 / Math.PI).sort((a, b) => a - b);
        assert.ok(Math.abs(angles[0] + 12) < 1e-6 && Math.abs(angles[1]) < 1e-6 && Math.abs(angles[2] - 12) < 1e-6, angles.join(','));
        assert.ok(g.projectiles.every(p => p.damage === 15 && !p.explosive));
    });

    await t.test('爆発火球: 爆発弾として発射し、着弾で半径内の敵すべてにダメージ（範囲外は無傷）', () => {
        const { g, calls } = makeGame(M, { weaponIndex: bySlot('explosion') });
        g.useWeapon();
        assert.equal(g.projectiles.length, 1);
        const p = g.projectiles[0];
        assert.ok(p.explosive && p.blastRadius === 3.0 && p.damage === 35);
        assert.equal(g.player.mp, 40);

        // 爆発位置 = 弾の位置から進行方向の逆へ 0.6 戻した点
        p.x = 0; p.z = -10; p.dirX = 0; p.dirZ = -1;
        const near = spawn(M, 'slime', 0, -9.4);
        const edge = spawn(M, 'slime', 2.5, -9.4);
        const outside = spawn(M, 'slime', 8, -9.4);
        near.hp = 1; // 倒せる
        g.monsters.push(near, edge, outside);

        g.explodeAt(p);
        assert.equal(p.active, false);
        assert.equal(near.active, false, '範囲内で倒れる');
        assert.ok(calls.exp > 0, '経験値が入る');
        assert.equal(edge.hp, edge.maxHp - 35);
        assert.equal(outside.hp, outside.maxHp);

        const hpAfter = edge.hp;
        g.explodeAt(p); // 二重爆発しない
        assert.equal(edge.hp, hpAfter);
    });

    await t.test('爆発弾は壁に当たると hitWall になる（爆発のきっかけ）', () => {
        const wall = [{ minX: -1, maxX: 1, minZ: -6, maxZ: -5 }];
        const p = new M.Projectile(0, -4, 0, -1, true, 14, 35, { explosive: true, blastRadius: 3 });
        for (let i = 0; i < 20 && !p.hitWall; i++) p.update(0.05, wall, null);
        assert.equal(p.hitWall, true);
        assert.equal(p.active, false);
    });
});
