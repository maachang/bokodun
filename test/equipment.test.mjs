import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const projectRoot = process.cwd();
const readJson = (f) => JSON.parse(fs.readFileSync(path.join(projectRoot, 'public/data', f), 'utf-8'));
const items = readJson('items.json');
const weaponClasses = readJson('weaponClasses.json');
const playerDef = readJson('player.json');
const enemyDefs = readJson('enemies.json');

// ブラウザ向けの絶対パス import ('/js/xxx.js') を相対パスに読み替えた一時コピーを作ってロードする
async function loadModules() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'equipment-'));
    for (const f of ['game', 'textures', 'entities', 'audio', 'particles', 'slashEffect', 'sdAssetManager', 'three.module']) {
        const src = fs.readFileSync(path.join(projectRoot, `public/js/${f}.js`), 'utf-8').replaceAll("'/js/", "'./");
        fs.writeFileSync(path.join(dir, `${f}.js`), src);
    }
    const { GameEngine } = await import(path.join(dir, 'game.js'));
    const { Monster, Projectile } = await import(path.join(dir, 'entities.js'));
    const { SlashEffectSystem } = await import(path.join(dir, 'slashEffect.js'));
    return { GameEngine, Monster, Projectile, SlashEffectSystem };
}

const tex = new Proxy({}, { get: () => ({}) });
// 初期装備でアイテム ID が入っているスロット番号
const bySlot = (id) => playerDef.equipSlots.indexOf(id);

// DOM・描画に依存しない、戦闘ロジックだけを検証するための模擬ゲーム
function makeGame({ GameEngine }, { mp = 60 } = {}) {
    const g = Object.create(GameEngine.prototype);
    const calls = { popups: [], exp: 0, sounds: [], slashes: [], playerDamage: [] };
    Object.assign(g, {
        player: {
            x: 0, z: 0, angle: 0, radius: 0.6, attackPower: 15, mp, magicCooldown: 0, attackCooldown: 0,
            equipSlots: [...playerDef.equipSlots], meleeSlot: playerDef.meleeSlot, rangedSlot: playerDef.rangedSlot,
            isFalling: false
        },
        keys: { forward: true },
        colliders: [],
        monsters: [], projectiles: [], items, weaponClasses,
        sound: new Proxy({}, { get: (_, name) => (...args) => calls.sounds.push([name, ...args]) }),
        particles: { spawnBurst() {} },
        slashEffects: { spawn: (...args) => calls.slashes.push(args) },
        scene: { add() {} },
        addPopup: (msg) => calls.popups.push(msg),
        playerTakeDamage: (amount) => calls.playerDamage.push(amount),
        notifyEnemyEngaged() {},
        gainExp: (n) => { calls.exp += n; },
        updateEquipHud() {},
    });
    return { g, calls };
}

// angle = 0 のプレイヤーは -z 方向（z が負の側）を向く
const spawn = (M, type, x, z) => new M.Monster(type, x, z, tex, enemyDefs[type]);
// 任意のアイテムを空きスロットに入れて装備する（近接はスロット 7 で突進用、杖・弓はスロット 8 で Space 用になる）
const equip = (g, id) => {
    const slot = weaponClasses[items[id].weaponClass].attack === 'melee' ? 6 : 7;
    g.equipItem(slot, id);
    g.selectSlot(slot);
};
// 前進入力で敵に突進した 1 回分の判定を実行する
const bump = (g, m) => {
    const dx = m.x - g.player.x, dz = m.z - g.player.z;
    g.resolveYsBump(m, dx, dz, Math.hypot(dx, dz));
};

test('定義ファイル（items.json / weaponClasses.json / player.json）', async (t) => {
    await t.test('武器クラス 8 種が定義され、attack ごとの必須項目がある', () => {
        assert.deepEqual(Object.keys(weaponClasses), ['bare_hands', 'dagger', 'sword', 'greatsword', 'mace', 'staff', 'magic_rod', 'bow']);
        for (const [id, c] of Object.entries(weaponClasses)) {
            assert.ok(c.name && ['melee', 'shoot', 'cast'].includes(c.attack), `${id}: attack`);
            if (c.attack === 'melee') {
                // range / arcDeg は突進の判定範囲ではなく、斬撃エフェクトの大きさ・広がりの目安
                assert.ok(c.range > 0 && c.arcDeg > 0 && c.cooldown > 0 && c.damageScale > 0 && c.knockback > 0 && c.stun >= 0, `${id}: 近接の項目`);
                assert.ok(['light', 'heavy'].includes(c.sound), `${id}: sound`);
                assert.ok(['slash', 'thrust', 'smash', 'punch'].includes(c.effect?.shape) && /^#[0-9a-f]{6}$/i.test(c.effect.color) && c.effect.duration > 0, `${id}: effect`);
            } else if (c.attack === 'shoot') {
                assert.ok(c.range > 0 && c.cooldown > 0 && c.damageScale > 0 && c.projectileSpeed > 0, `${id}: 弓の項目`);
            } else {
                assert.ok(c.spellPowerScale > 0, `${id}: spellPowerScale`);
            }
        }
    });

    await t.test('アイテム: 武器は weaponClass を持ち、杖・ロッドは実在する呪文を束ねる。呪文は発射の項目を持つ', () => {
        for (const [id, it] of Object.entries(items)) {
            assert.equal(it.id, id, `${id}: id がキーと一致`);
            assert.ok(it.name && ['weapon', 'spell'].includes(it.kind), `${id}: kind`);
            if (it.kind === 'weapon') {
                const cls = weaponClasses[it.weaponClass];
                assert.ok(cls, `${id}: 未定義の weaponClass ${it.weaponClass}`);
                if (cls.attack === 'cast') assert.equal(items[it.spell]?.kind, 'spell', `${id}: 束ねる呪文`);
            } else {
                assert.ok(['fireball', 'explosive', 'spread'].includes(it.type), `${id}: type`);
                assert.ok(it.mp >= 0 && it.cooldown > 0 && it.damage > 0 && it.speed > 0, `${id}: 呪文の項目`);
                if (it.type === 'explosive') assert.ok(it.blastRadius > 0);
                if (it.type === 'spread') assert.ok(it.count >= 2 && it.spreadDeg > 0);
            }
        }
    });

    await t.test('初期装備は 8 スロット。突進用は近接武器、Space 用は杖・弓で、空きは null', () => {
        assert.equal(playerDef.equipSlots.length, 8);
        for (const id of playerDef.equipSlots) assert.ok(id === null || items[id]?.kind === 'weapon', `装備できない: ${id}`);
        assert.equal(weaponClasses[items[playerDef.equipSlots[playerDef.meleeSlot]].weaponClass].attack, 'melee');
        assert.ok(['cast', 'shoot'].includes(weaponClasses[items[playerDef.equipSlots[playerDef.rangedSlot]].weaponClass].attack));
    });
});

test('装備の切り替え', async (t) => {
    const M = await loadModules();

    await t.test('スロットを選ぶと、クラスに応じて突進用（近接）か Space 用（杖・弓）に装備され、両方が同時に有効', () => {
        const { g } = makeGame(M);
        assert.equal(g.getMeleeItem().id, 'dagger');
        assert.equal(g.getRangedItem().id, 'apprentice_staff');
        equip(g, 'iron_sword');
        assert.equal(g.getMeleeItem().id, 'iron_sword');
        assert.equal(g.getRangedItem().id, 'apprentice_staff', '突進用を変えても Space 用は変わらない');
        equip(g, 'short_bow');
        assert.equal(g.getRangedItem().id, 'short_bow');
        assert.equal(g.getMeleeItem().id, 'iron_sword');
    });

    await t.test('空きスロットを選んでも何も変わらない。範囲外も無視', () => {
        const { g } = makeGame(M);
        g.selectSlot(5);
        g.selectSlot(99);
        assert.equal(g.player.meleeSlot, playerDef.meleeSlot);
        assert.equal(g.player.rangedSlot, playerDef.rangedSlot);
    });

    await t.test('Tab は空きを飛ばして、直前に選んだスロットから順送りに選ぶ（最後の次は先頭）', () => {
        const { g } = makeGame(M);
        g.cycleSlot();   // 1(ダガー)→2(見習いの杖)
        assert.equal(g.getRangedItem().id, 'apprentice_staff');
        g.cycleSlot();   // 3 爆裂の杖
        assert.equal(g.getRangedItem().id, 'blast_staff');
        g.cycleSlot();   // 4 散弾の杖
        assert.equal(g.getRangedItem().id, 'scatter_staff');
        g.cycleSlot();   // 5〜8 は空き → 先頭のダガー
        assert.equal(g.getMeleeItem().id, 'dagger');
    });

    await t.test('デバッグ用の装備変更: equipItem で差し替え・空にできる。呪文や不正な指定は失敗する。装備中スロットを差し替えると装備が外れる', () => {
        const { g } = makeGame(M);
        const warn = console.warn; console.warn = () => {};
        try {
            assert.equal(g.equipItem(6, 'iron_mace'), true);
            assert.equal(g.getSlotItem(6).id, 'iron_mace');
            assert.equal(g.equipItem(6, null), true);
            assert.equal(g.getSlotItem(6), null);
            assert.equal(g.equipItem(99, 'fire'), false);
            assert.equal(g.equipItem(0, 'no_such_item'), false);
            assert.equal(g.equipItem(0, 'fire'), false, '呪文はスロットに入れられない');
            assert.equal(g.getSlotItem(0).id, 'dagger', '失敗した指定でスロットは変わらない');

            assert.equal(g.equipItem(0, null), true); // 突進用に装備中のスロットを空にする
            assert.equal(g.player.meleeSlot, null);
            assert.equal(g.getMeleeItem().id, 'fists', '未装備は素手');
        } finally { console.warn = warn; }
    });
});

test('近接武器は突進攻撃に効く', async (t) => {
    const M = await loadModules();
    // 突進で敵（スケルトン HP60・半径 0.8）に当てて、与えたダメージを返す
    const charge = (weaponId, { x = 0, z = -1.2 } = {}) => {
        const { g, calls } = makeGame(M);
        if (weaponId) equip(g, weaponId);
        const m = spawn(M, 'skeleton', x, z);
        g.monsters.push(m);
        bump(g, m);
        return { g, calls, m, damage: m.maxHp - m.hp };
    };
    const samples = (id) => Array.from({ length: 30 }, () => charge(id).damage);

    await t.test('クラスごとのダメージ倍率: 素手 < ダガー < 剣 < メイス < 大剣', () => {
        const [fists, dagger, sword, mace, great] = ['fists', 'dagger', 'iron_sword', 'iron_mace', 'iron_greatsword'].map(samples);
        assert.ok(Math.max(...fists) < Math.min(...dagger));
        assert.ok(Math.max(...dagger) < Math.min(...sword));
        assert.ok(Math.max(...sword) < Math.min(...mace));
        assert.ok(Math.max(...mace) < Math.min(...great));
    });

    await t.test('突進の連続ヒット間隔は、クラスの cooldown になる（大剣は遅く、ダガーは速い）', () => {
        assert.equal(charge('dagger').g.player.attackCooldown, weaponClasses.dagger.cooldown);
        assert.equal(charge('iron_greatsword').g.player.attackCooldown, weaponClasses.greatsword.cooldown);
        assert.ok(weaponClasses.greatsword.cooldown > weaponClasses.dagger.cooldown);
    });

    await t.test('突進が当たるとクラスの斬撃エフェクトが出る（ダガー=突き、剣=弧、メイス=衝撃波、素手=閃光）', () => {
        for (const [id, shape] of [['dagger', 'thrust'], ['iron_sword', 'slash'], ['iron_mace', 'smash'], ['fists', 'punch']]) {
            const { calls } = charge(id);
            assert.equal(calls.slashes.length, 1, `${id}: エフェクトが 1 回出る`);
            assert.equal(calls.slashes[0][5].shape, shape);
        }
    });

    await t.test('メイスは強いノックバックと一定時間のスタン、剣はスタンしない', () => {
        const mace = charge('iron_mace').m;
        const sword = charge('iron_sword').m;
        assert.ok(mace.stunTimer > 0 && mace.stunTimer <= weaponClasses.mace.stun);
        assert.equal(sword.stunTimer, 0);
        assert.ok(mace.knockback.length() > sword.knockback.length());
    });

    await t.test('半ずらし会心にも武器が効く（プレイヤーは無傷・ダメージは倍率つき）', () => {
        const { calls, damage } = charge('iron_greatsword', { x: 0.5, z: -1.2 });
        assert.equal(calls.playerDamage.length, 0, '会心ではプレイヤーは被弾しない');
        assert.ok(calls.popups.some(p => p.includes('半ずらし会心')));
        assert.ok(damage >= Math.floor(15 * 1.5 * weaponClasses.greatsword.damageScale));
        assert.equal(calls.slashes.length, 1);
    });

    await t.test('立ち止まっている間は攻撃せず、被弾する（エフェクトも出ない）', () => {
        const { g, calls } = makeGame(M);
        g.keys.forward = false;
        const m = spawn(M, 'skeleton', 0, -1.2);
        g.monsters.push(m);
        bump(g, m);
        assert.equal(m.hp, m.maxHp);
        assert.equal(calls.slashes.length, 0);
        assert.equal(calls.playerDamage.length, 1);
    });

    await t.test('スタン中の敵は AI が止まり、解けたら動く', () => {
        const s = spawn(M, 'skeleton', 0, -10);
        s.stun(1.0);
        const z0 = s.z;
        for (let i = 0; i < 10; i++) s.update(0.05, { x: 0, z: 0, radius: 0.4 }, [], [], null, null, 1.0);
        assert.equal(s.z, z0);
        for (let i = 0; i < 30; i++) s.update(0.05, { x: 0, z: 0, radius: 0.4 }, [], [], null, null, 1.0);
        assert.ok(s.z > z0, 'スタンが解けたら動く');
    });
});

test('Space / F / クリックは杖・ロッド・弓（遠距離）専用', async (t) => {
    const M = await loadModules();

    await t.test('近接武器だけでは Space で何も起きない（杖を外した場合）', () => {
        const { g } = makeGame(M);
        g.equipItem(1, null); // Space 用の杖を外す
        g.useRanged();
        assert.equal(g.projectiles.length, 0);
        assert.equal(g.player.mp, 60);
        assert.equal(g.player.magicCooldown, 0);
        assert.equal(g.getMeleeItem().id, 'dagger', '突進用の近接武器はそのまま');
    });

    await t.test('杖・ロッドは束ねた呪文を撃つ（MP は呪文のもの）', () => {
        const fire = makeGame(M);
        fire.g.useRanged();
        assert.equal(fire.g.projectiles.length, 1);
        assert.equal(fire.g.projectiles[0].damage, 25);
        assert.equal(fire.g.player.mp, 50);
        assert.equal(fire.g.player.magicCooldown, 0.35);
        fire.g.useRanged(); // クールダウン中
        assert.equal(fire.g.projectiles.length, 1);

        const rod = makeGame(M);
        equip(rod.g, 'magic_rod');
        rod.g.useRanged();
        assert.equal(rod.g.projectiles[0].damage, 8);
        assert.equal(rod.g.player.mp, 56, '低 MP');
        assert.equal(rod.g.player.magicCooldown, 0.2, '連射向き');
    });

    await t.test('MP不足なら呪文を撃てない', () => {
        const { g, calls } = makeGame(M, { mp: 5 });
        g.useRanged();
        assert.equal(g.projectiles.length, 0);
        assert.equal(g.player.mp, 5);
        assert.ok(calls.popups.includes('MP不足!'));
    });

    await t.test('散弾の杖: 3 発が ±12° の扇状に飛び、MP20を消費する', () => {
        const { g } = makeGame(M);
        g.selectSlot(bySlot('scatter_staff'));
        g.useRanged();
        assert.equal(g.projectiles.length, 3);
        assert.equal(g.player.mp, 40);
        const angles = g.projectiles.map(p => Math.atan2(-p.dirX, -p.dirZ) * 180 / Math.PI).sort((a, b) => a - b);
        assert.ok(Math.abs(angles[0] + 12) < 1e-6 && Math.abs(angles[1]) < 1e-6 && Math.abs(angles[2] - 12) < 1e-6, angles.join(','));
        assert.ok(g.projectiles.every(p => p.damage === 15 && !p.explosive));
    });

    await t.test('爆裂の杖: 爆発弾を発射し、着弾で半径内の敵すべてにダメージ（範囲外は無傷）', () => {
        const { g, calls } = makeGame(M);
        g.selectSlot(bySlot('blast_staff'));
        g.useRanged();
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

    await t.test('弓: MP不要で、重力で落ちる矢（射程はクラスの range）を放つ', () => {
        const { g, calls } = makeGame(M, { mp: 0 });
        equip(g, 'short_bow');
        g.useRanged();
        assert.equal(g.projectiles.length, 1);
        const a = g.projectiles[0];
        assert.equal(a.type, 'arrow');
        assert.equal(a.maxDistance, weaponClasses.bow.range);
        assert.ok(a.damage >= 21 && a.damage <= 23, `攻撃力15×1.4＋乱数0〜2 (${a.damage})`);
        assert.equal(g.player.mp, 0);
        assert.equal(g.player.magicCooldown, weaponClasses.bow.cooldown);
        assert.ok(calls.sounds.some(([n]) => n === 'playBowShoot'));
    });

    await t.test('爆発弾は壁に当たると hitWall になる（爆発のきっかけ）', () => {
        const wall = [{ minX: -1, maxX: 1, minZ: -6, maxZ: -5 }];
        const p = new M.Projectile(0, -4, 0, -1, true, 14, 35, { explosive: true, blastRadius: 3 });
        for (let i = 0; i < 20 && !p.hitWall; i++) p.update(0.05, wall, null);
        assert.equal(p.hitWall, true);
        assert.equal(p.active, false);
    });
});

test('生きている敵は障害物（プレイヤーは突き抜けられない）', async (t) => {
    const M = await loadModules();
    // プレイヤー半径 0.6・スケルトン半径 0.8 → 縁は (0.6+0.8)*0.8 = 1.12
    const EDGE = (0.6 + 0.8) * 0.8;

    await t.test('敵に向かって進み続けても、敵の縁より中へは入れない（突進の判定距離 1.4 は満たす）', () => {
        const { g } = makeGame(M);
        const m = spawn(M, 'skeleton', 0, -3);
        g.monsters.push(m);
        for (let i = 0; i < 60; i++) g.movePlayer(0, -0.2);
        const d = Math.hypot(g.player.x - m.x, g.player.z - m.z);
        assert.ok(d >= EDGE - 1e-6, `縁の内側に入っていない (d=${d})`);
        assert.ok(d < 0.6 + 0.8, '突進の判定距離（半径の和）より近く、攻撃が成立する');
    });

    await t.test('敵に斜めにぶつかると、縁に沿って横へ滑る', () => {
        const { g } = makeGame(M);
        const m = spawn(M, 'skeleton', 0, -3);
        g.monsters.push(m);
        for (let i = 0; i < 60; i++) g.movePlayer(0.05, -0.2);
        assert.ok(g.player.x > 0.5, `横へ滑って進む (x=${g.player.x})`);
        const d = Math.hypot(g.player.x - m.x, g.player.z - m.z);
        assert.ok(d >= EDGE - 1e-6);
    });

    await t.test('倒れている最中（active=false）の敵は障害物にならず、通り抜けられる', () => {
        const { g } = makeGame(M);
        const m = spawn(M, 'skeleton', 0, -3);
        m.active = false;
        g.monsters.push(m);
        for (let i = 0; i < 30; i++) g.movePlayer(0, -0.2);
        assert.ok(g.player.z < -4, `通過した (z=${g.player.z})`);
    });

    await t.test('すでに重なっている敵から離れる方向の移動は妨げられない', () => {
        const { g } = makeGame(M);
        const m = spawn(M, 'skeleton', 0, -0.3); // 敵のほうから重なってきた
        g.monsters.push(m);
        g.movePlayer(0, 0.3);
        assert.ok(Math.abs(g.player.z - 0.3) < 1e-9, '後ろへ離れられる');
    });
});

test('斬撃エフェクト（SlashEffectSystem）', async (t) => {
    const M = await loadModules();

    for (const shape of ['slash', 'thrust', 'smash', 'punch']) {
        await t.test(`${shape}: 生成されてシーンに追加され、時間経過で消えて破棄される`, () => {
            const added = [], removed = [];
            const scene = { add: (o) => added.push(o), remove: (o) => removed.push(o) };
            const fx = new M.SlashEffectSystem(scene);
            fx.spawn(0, 0, 0, 2.6, 70, { shape, color: '#ffffff', size: 1, duration: 0.2, tiltDeg: -35, sweepDeg: 70 });
            assert.equal(added.length, 1);
            assert.equal(fx.effects.length, 1);

            fx.update(0.1);
            const e = fx.effects[0];
            assert.ok(e.material.opacity > 0 && e.material.opacity < 1, '半分経過で半透明');
            fx.update(0.11);
            assert.equal(fx.effects.length, 0);
            assert.equal(removed.length, 1);
        });
    }
});
