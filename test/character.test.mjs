// 冒険者の能力値から、最大 HP・MP・移動速度・スタミナを決める（public/js/game/character.js）のテスト
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { copyGameModules } from './helpers/game.mjs';

const D = (f) => JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public/data', f), 'utf-8'));
const playerDef = D('player.json');

async function engine() {
    const dir = copyGameModules('character-');
    const { GameEngine } = await import(path.join(dir, 'game.js'));
    const g = Object.create(GameEngine.prototype);
    g.player = { hp: 1, mp: 1, stamina: 1, exp: 0, level: 1, attackPower: 15, status: {} };
    g.sound = { playLevelClear() {} };
    g.addPopup = () => {};
    g.setRules(D('combat.json'), D('damageTable.json').table, D('jobs.json').jobs, D('races.json').races);
    g.setGearDefs(D('equipment.json'));
    g.getMeleeItem = () => ({ id: 'dagger', weightRange: [1, 8], dice: { n: 1, m: 6, k: 2 }, blunt: false });   // 初期の近接武器（ダガー）
    g.applyCharacterDef(playerDef);
    return g;
}

test('初期の冒険者（人間・平均・ファイター Lv1）の、最大 HP・MP・移動速度・スタミナ', async () => {
    const g = await engine();
    g.recomputeStats(true);
    const p = g.player;
    assert.equal(p.race, 'human');
    assert.equal(p.job, 'fighter');
    assert.equal(p.maxHp, 14 + 14 + 1);        // (筋力＋生命力) × 1 ＋ Lv × 1
    assert.equal(p.maxMp, 14 + 14 + 0.5);      // (知力＋精神力) × 1 ＋ Lv × 0.5（端数は、そのまま持つ。表示は切り捨て）
    assert.equal(p.maxStamina, 43);            // (筋力＋持久力) × 1.5 ＋ Lv
    assert.ok(Math.abs(p.speed - 8.5) < 1e-9);
    assert.ok(Math.abs(p.runSpeed - 13.005 * 5) < 1e-9);   // ダッシュ。テスト用の倍率（5）を掛けてある
    assert.equal(p.hp, p.maxHp);
    assert.equal(p.mp, p.maxMp);
    assert.equal(p.stamina, 43);
});

test('レベルを上げると、最大値が式どおりに増え、満タンになる', async () => {
    const g = await engine();
    g.recomputeStats(true);
    g.player.level = 10;
    g.player.hp = 3;
    g.recomputeStats(false);   // 満タンにしない（最大値を超えないように丸めるだけ）
    assert.equal(g.player.maxHp, 28 + 10);
    assert.equal(g.player.hp, 3);
    g.gainExp(100000);         // レベルアップ → 満タン
    assert.equal(g.player.level, 11);
    assert.equal(g.player.maxHp, 28 + 11);
    assert.equal(g.player.hp, g.player.maxHp);
});

test('敏捷度・種族・上位職で、値が変わる', async () => {
    const g = await engine();
    g.player.abilities.agi = 35;
    g.recomputeStats(true);
    assert.ok(Math.abs(g.player.speed - 10.6) < 1e-9);
    g.player.abilities.agi = 14; g.player.race = 'dwarf'; g.player.job = 'wizard'; g.player.level = 20;
    g.recomputeStats(true);
    const dwarf = D('races.json').races.dwarf;
    assert.equal(g.player.maxHp, Math.round(28 * dwarf.hpRate) + 20 * 2);          // 上位職は HP +2 / Lv
    assert.equal(g.player.maxMp, Math.round(28 * dwarf.mpRate) + 20 * 1.5);        // ウィザードは MP +1.5 / Lv
});

test('スタミナの消費・回復は、冒険者の持久力とレベルから決まる', async () => {
    const g = await engine();
    g.staminaDef = D('combat.json').stamina;
    g.recomputeStats(true);
    const base = g.staminaCost('dash');
    g.player.abilities.end = 30;
    assert.ok(g.staminaCost('dash') < base, '持久力が高いほど、消費が減る');
    g.player.stamina = 10; g.player.staminaPause = 0; g.player.staminaExhausted = false;
    g.updateStamina(1);
    assert.ok(Math.abs(g.player.stamina - (10 + 30 * 0.3 + 1 * 0.05)) < 1e-9);
});

test('呪いの間は、攻撃のダメージが下がる（scale）', async () => {
    const g = await engine();
    g.recomputeStats(true);
    const w = { id: 'long_sword', weightRange: [10, 25], dice: { n: 2, m: 6, k: 1 }, blunt: false };
    const orig = Math.random; Math.random = () => 0.5;
    try {
        const normal = g.rollWeaponAttack(w).damage;
        g.player.status = { curse: { t: 5, scale: 0.5 } };
        assert.equal(g.rollWeaponAttack(w).damage, Math.floor(normal * 0.5));
    } finally { Math.random = orig; }
});
