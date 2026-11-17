// 防具（鎧・兜・盾）の装備・積載・被弾の軽減（public/js/game/gear.js）のテスト
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { copyGameModules } from './helpers/game.mjs';
import * as R from '../public/js/game/rules.js';

const D = (f) => JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public/data', f), 'utf-8'));
const playerDef = D('player.json'), equipment = D('equipment.json');
const defs = { combat: D('combat.json'), table: D('damageTable.json').table, jobs: D('jobs.json').jobs, races: D('races.json').races };
const fixed = (v) => () => v;
const withRandom = (fn, f) => { const orig = Math.random; Math.random = fn; try { return f(); } finally { Math.random = orig; } };

async function engine(over = {}) {
    const dir = copyGameModules('gear-');
    const { GameEngine } = await import(path.join(dir, 'game.js'));
    const g = Object.create(GameEngine.prototype);
    const popups = [];
    g.player = { hp: 1, mp: 1, stamina: 1, exp: 0, level: 1, status: {}, isInvincible: false, ...over };
    g.sound = { playHurt() {}, playLevelClear() {} };
    g.particles = { spawnBurst() {} };
    g.addPopup = (m) => popups.push(m);
    g.updateEquipHud = () => g.recomputeStats(false);
    g.flashDamageScreen = () => {};
    g.setRules(defs.combat, defs.table, defs.jobs, defs.races);
    g.setGearDefs(equipment);
    g.applyCharacterDef({ ...playerDef, ...over.def });
    g.getMeleeItem = () => ({ id: 'dagger', weightRange: [1, 8], dice: { n: 1, m: 6, k: 2 }, blunt: false, twoHanded: over.twoHanded ?? false });
    g.recomputeStats(true);
    return { g, popups };
}

test('防具の装備: 持てる重さ・両手武器と盾', async (t) => {
    await t.test('初期装備（革の鎧・革の帽子）の重さは、筋力で持てる最大（範囲内）', async () => {
        const { g } = await engine();
        const parts = g.gearParts();
        assert.deepEqual(parts.map((p) => p.id), ['leather_armor', 'leather_cap']);
        assert.deepEqual(parts.map((p) => p.weight), [14, 8]);   // 鎧 5〜18 → 筋力 14 まで、兜 2〜8 → 8
        assert.equal(g.gearList('shield').length, 5);
    });
    await t.test('筋力で持てない防具は、着けられない（最小の重さが筋力を超える）', async () => {
        const { g, popups } = await engine();
        assert.equal(g.canWear(g.gearDef('armor', 'full_plate')), false);
        assert.equal(g.equipGear('armor', 'full_plate'), false);
        assert.ok(popups.includes('重すぎて装備できない'));
        assert.equal(g.player.equip.armor, 'leather_armor', '変わらない');
        assert.equal(g.equipGear('armor', 'chain_mail'), g.canWear(g.gearDef('armor', 'chain_mail')));
    });
    await t.test('着ける・外す・未定義の ID は断る', async () => {
        const { g } = await engine();
        assert.equal(g.equipGear('shield', 'buckler'), true);
        assert.equal(g.player.equip.shield, 'buckler');
        assert.equal(g.equipGear('shield', null), true);
        assert.equal(g.player.equip.shield, null);
        assert.equal(g.equipGear('shield', 'no_such'), false);
        assert.equal(g.equipGear('weapon', 'x'), false);
    });
    await t.test('両手武器を持っているときは、盾を着けられない', async () => {
        const { g, popups } = await engine({ twoHanded: true });
        assert.equal(g.equipGear('shield', 'buckler'), false);
        assert.ok(popups.includes('両手武器は、盾と同時に装備できない'));
    });
});

test('積載（重量比）と移動速度', async (t) => {
    await t.test('重量合計 ＝ 武器＋鎧＋兜＋盾。重量比 ＝ 合計 ÷ 積載の限界', async () => {
        const { g } = await engine();
        assert.equal(g.totalWeight(), 8 + 14 + 8);   // ダガー（8）・革の鎧（14）・革の帽子（8）
        assert.ok(Math.abs(g.loadRatio() - 30 / R.loadLimit(defs, 14, 1)) < 1e-9);
        assert.ok(Math.abs(g.player.speed - 8.5) < 1e-9, '限界以下なら、速度は下がらない');
    });
    await t.test('限界を超えると、歩く速さ・ダッシュが下がる（下限 60%）。外すと戻る', async () => {
        const { g } = await engine({ def: { abilities: { dex: 14, agi: 14, str: 2, vit: 14, intel: 14, mnd: 14, end: 14 } } });   // 筋力 2: 限界は 8.5
        assert.ok(g.loadRatio() > 1);
        assert.ok(g.player.speed < 8.5);
        assert.ok(g.player.speed >= 8.5 * 0.6 - 1e-9);
        g.player.equip = { armor: null, helm: null, shield: null };
        g.recomputeStats(false);
        assert.ok(g.loadRatio() <= 1 || g.player.speed > 8.5 * 0.6);
    });
});

test('被弾の軽減（防御・生命力・回避）', async (t) => {
    await t.test('防具なし・回避なし（乱数 0）は、攻撃 − 生命力 ÷ 5', async () => {
        const { g } = await engine({ def: { equip: { armor: null, helm: null, shield: null } } });
        const r = withRandom(fixed(0), () => g.reduceByDefense(20));   // 回避 0〜D の乱数が 0
        assert.equal(r, Math.floor(20 - 14 / 5));   // 生命力 14 ÷ 5 = 2.8 を引いて、切り捨て = 17
    });
    await t.test('防具の防御が引かれる（ダイスは乱数 0.5、軽装なので回避も効く）', async () => {
        const { g } = await engine();
        const parts = g.gearParts();
        const dr = R.rollDefense(defs, parts, defs.jobs.fighter, fixed(0.5));
        const dodge = R.dodgeValue(defs, 14, 1, defs.jobs.fighter);
        const want = Math.max(1, Math.floor(30 - dr.defense - 14 / 5 - 0.5 * dodge));
        assert.equal(withRandom(fixed(0.5), () => g.reduceByDefense(30)), want);
        assert.ok(want < 30 - 2);
    });
    await t.test('最低 1 ダメージ', async () => {
        const { g } = await engine();
        assert.equal(withRandom(fixed(0.5), () => g.reduceByDefense(1)), 1);
    });
    await t.test('重装備（heavy）を着けていると、回避が無効', async () => {
        const light = await engine({ def: { equip: { armor: 'leather_armor', helm: null, shield: null } } });
        const heavy = await engine({ def: { equip: { armor: 'leather_armor', helm: null, shield: 'buckler' } } });   // 盾は heavy
        assert.equal(heavy.g.gearParts().some((p) => p.heavy), true);
        // 乱数 0.99: 軽装は、回避でほぼ最大まで引かれる。重装備は引かれない（防御の差は、ダイスが乱数 0.99 で最大）
        const a = withRandom(fixed(0.99), () => light.g.reduceByDefense(40));
        const parts = heavy.g.gearParts();
        const dr = R.rollDefense(defs, parts, defs.jobs.fighter, fixed(0.99));
        assert.equal(withRandom(fixed(0.99), () => heavy.g.reduceByDefense(40)), Math.max(1, Math.floor(40 - dr.defense - 14 / 5)));
        assert.ok(a >= 1);
    });
    await t.test('防御で 1 ゾロが出ると、相手の攻撃は必ずクリティカル（1.5 倍）で、回避は 0', async () => {
        const { g } = await engine({ def: { equip: { armor: 'leather_armor', helm: null, shield: null } } });
        const got = withRandom(fixed(0), () => g.reduceByDefense(20));   // 乱数 0: ダイスがすべて 1（1 ゾロ）
        const dr = R.rollDefense(defs, g.gearParts(), defs.jobs.fighter, fixed(0));
        assert.equal(dr.fumble, true);
        assert.equal(got, Math.max(1, Math.floor(30 - dr.defense - 14 / 5)));
    });
    await t.test('敵（source）のある被弾だけ、軽減する。罠・落下（source なし）は、そのまま', async () => {
        const { g } = await engine();
        g.player.hp = 29;
        g.player.knockback = { copy() { return { multiplyScalar() {} }; } };
        g.loadMap = () => {};
        const before = g.player.hp;
        withRandom(fixed(0.5), () => g.playerTakeDamage(10, { x: 0, y: 0, z: 0 }, 1.0, null));
        assert.equal(before - g.player.hp, 10, '罠: そのまま');
        g.player.isInvincible = false;
        g.onPlayerHitBy = () => {};
        const hp1 = g.player.hp;
        withRandom(fixed(0.5), () => g.playerTakeDamage(10, { x: 0, y: 0, z: 0 }, 1.0, { stats: null }));
        assert.ok(hp1 - g.player.hp < 10, '敵: 軽減される');
    });
});

test('敵の攻撃は、攻撃のダイス（stats.attack）を振ってダメージ表に通す', async () => {
    const { g } = await engine();
    const slime = D('enemies.json').slime;
    const mon = { stats: slime.stats, attackPower: slime.stats.attack.expected };
    const a = slime.stats.attack;
    const v = withRandom(fixed(0.5), () => g.monsterAttackValue(mon));
    assert.equal(v, R.tableValue(defs, a.weight, a.dice.n * (1 + Math.floor(0.5 * a.dice.m)) + a.dice.k + R.levelBonus(defs, slime.stats.level, null)));
    assert.equal(g.monsterAttackValue({ stats: null, attackPower: 7 }), 7, 'stats がなければ、固定値');
});

test('敵の遠距離攻撃は、撃つたびに攻撃のダイスを振って、倍率を掛ける（ダイスがなければ固定の威力）', async () => {
    const dir = copyGameModules('shoot-');
    const { Monster } = await import(path.join(dir, 'entities.js'));
    const tex = new Proxy({}, { get: () => ({}) });
    const enemies = D('enemies.json');
    const shootOnce = (id, hook) => {
        const m = new Monster(id, 0, 0, tex, enemies[id]);
        assert.equal(m.canShoot, true, `${id}: 撃つ敵`);
        if (hook) m.attackRollHook = hook;
        m.shootTimer = 0;
        const projectiles = [];
        m.updateShooting(6, 0.1, 6, 0, { floorY: 0 }, projectiles, null, null);
        return { m, damage: projectiles[0]?.damage };
    };
    const archer = shootOnce('goblin_archer', () => 20);
    assert.ok(archer.m.shootMult > 0);
    assert.equal(archer.damage, Math.max(1, Math.floor(20 * archer.m.shootMult)));
    assert.notEqual(shootOnce('goblin_archer', () => 40).damage, archer.damage, '振った攻撃が大きいほど、威力が大きい');
    const fixedShot = shootOnce('goblin_archer', null);   // フックがない（ダイスなし）: 固定の威力
    assert.equal(fixedShot.damage, fixedShot.m.shootDamage ?? 10);
});
