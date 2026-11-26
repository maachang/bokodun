// 効果が決まった魔法（キュアー系・エンチャント・プロテクション・スピーディー・フライ。2026-11-26 草案）の効果のテスト
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { copyGameModules } from './helpers/game.mjs';
import { buildItems } from '../public/js/game/itemDefs.js';

const D = (f) => JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public/data', f), 'utf-8'));
const playerDef = D('player.json'), equipment = D('equipment.json');
const defs = { combat: D('combat.json'), table: D('damageTable.json').table, jobs: D('jobs.json').jobs, races: D('races.json').races };

async function engine() {
    const dir = copyGameModules('sup-');
    const { GameEngine } = await import(path.join(dir, 'game.js'));
    const g = Object.create(GameEngine.prototype);
    const popups = [];
    g.player = { hp: 10, mp: 99, stamina: 1, exp: 0, level: 10, status: {}, isInvincible: false, gold: 0, stock: [...playerDef.stock], selMelee: playerDef.selMelee, selFocus: playerDef.selFocus, selMagic: playerDef.selMagic };
    g.weaponClasses = D('weaponClasses.json');
    g.items = buildItems(D('items.json'), equipment, D('magic.json'));
    g.sound = { playHurt() {}, playLevelClear() {}, playHeal() {} };
    g.particles = { spawnBurst() {} };
    g.spellEffects = null;
    g.addPopup = (m) => popups.push(m);
    g.updateEquipHud = () => g.recomputeStats(false);
    g.setRules(defs.combat, defs.table, defs.jobs, defs.races);
    g.setGearDefs(equipment);
    g.applyCharacterDef({ ...playerDef });
    g.recomputeStats(true);
    g.player.hp = 10;
    return { g, popups };
}

test('魔法が、ゲームで使える（usable）', async () => {
    const { g } = await engine();
    for (const id of ['cure', 'recovery', 'cure_poison', 'enchant', 'protection', 'speedy', 'fly']) assert.equal(g.items[id]?.kind, 'spell', `${id} が使える`);
    for (const id of ['unlock', 'trap']) assert.equal(g.items[id], undefined, `${id} は、宝箱の装置が未実装なので使えない`);
});

test('キュアー・リカバリー: HP を回復する', async () => {
    const { g } = await engine();
    g.player.hp = 1;
    g.castSelfSpell(g.items.cure, 5);
    assert.equal(g.player.hp, 6);
    g.castSelfSpell(g.items.recovery, 100);
    assert.equal(g.player.hp, g.player.maxHp, '最大 HP を超えない');
});

test('キュアーポイズン: 毒を治す。毒でないときは、MP を使わずに断る', async () => {
    const { g } = await engine();
    const sp = g.items.cure_poison;
    assert.equal(g.selfSpellUseless(sp), '毒にかかっていません');
    g.player.status = { poison: { t: 10, dps: 1 } };
    assert.equal(g.selfSpellUseless(sp), null);
    g.castSelfSpell(sp, 0);
    assert.equal(g.player.status.poison, undefined);
});

test('エンチャント: 武器の攻撃が 1.25 倍になる（時間がある間だけ。魔法の威力は上がらない）', async () => {
    const { g } = await engine();
    const dagger = { id: 'dagger', weightRange: [1, 8], dice: { n: 1, m: 6, k: 2 }, blunt: false, twoHanded: false };
    const seq = () => { let i = 0; const v = [0.99, 0.5, 0.3, 0.7]; return () => v[i++ % v.length]; };
    const orig = Math.random;
    try {
        Math.random = seq(); const base = g.rollWeaponAttack(dagger, { noMiss: true, noCrit: true }).damage;
        g.castSelfSpell(g.items.enchant, 0);
        assert.equal(g.player.buffs.attackRate.rate, 1.25);
        assert.equal(g.player.buffs.attackRate.t, 60);
        Math.random = seq(); const up = g.rollWeaponAttack(dagger, { noMiss: true, noCrit: true }).damage;
        assert.equal(up, Math.floor(base * 1.25));
        const bolt = g.items.magic_bolt;   // 攻撃魔法は、エンチャントで強くならない
        Math.random = seq(); const spellUp = g.rollSpellPower(bolt);
        g.player.buffs.attackRate.t = 0;
        Math.random = seq(); assert.equal(g.rollSpellPower(bolt), spellUp, '魔法の威力は、エンチャントの有無で変わらない');
        g.player.buffs.attackRate.t = 0;   // 切れたら、元に戻る
        Math.random = seq(); assert.equal(g.rollWeaponAttack(dagger, { noMiss: true, noCrit: true }).damage, base);
    } finally { Math.random = orig; }
});

test('プロテクション: 被弾の防御値が、1.25 倍になる（受けるダメージが減る）', async () => {
    const { g } = await engine();
    g.gearParts = () => [{ id: 'x', kind: 'armor', dice: { n: 2, m: 6, k: 5 }, weight: 30 }];   // 防御が十分ある鎧
    const orig = Math.random;
    try {
        Math.random = () => 0.5; const before = g.reduceByDefense(30);
        g.castSelfSpell(g.items.protection, 0);
        assert.equal(g.player.buffs.defenseRate.rate, 1.25);
        Math.random = () => 0.5; const after = g.reduceByDefense(30);
        assert.ok(after < before, `防御アップで、受けるダメージは減る（${before} → ${after}）`);
    } finally { Math.random = orig; }
});

test('スピーディー: 重ね掛けはせず、かけ直すと時間が戻る', async () => {
    const { g } = await engine();
    g.castSelfSpell(g.items.speedy, 0);
    assert.equal(g.player.buffs.moveSpeedRate.rate, 1.3);
    g.player.buffs.moveSpeedRate.t = 3;
    g.castSelfSpell(g.items.speedy, 0);
    assert.equal(g.player.buffs.moveSpeedRate.t, 30);
    assert.equal(g.player.buffs.moveSpeedRate.rate, 1.3, '倍率は重ならない');
});

test('フライ: 浮遊する。基本 30 秒に、レベル × 0.5 秒を足す。切れたら降りる', async () => {
    const { g } = await engine();
    assert.equal(g.isFloating(), false);
    g.player.level = 10;
    g.castSelfSpell(g.items.fly, 0);
    assert.equal(g.player.buffs.fly.t, 35);
    assert.equal(g.isFloating(), true);
    g.player.buffs.fly.t = 0;
    assert.equal(g.isFloating(), false);
});
