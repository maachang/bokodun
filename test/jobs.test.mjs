// 職業・経験値・職業訓練所（public/js/game/jobs.js・training.js）のテスト
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { copyGameModules } from './helpers/game.mjs';
import * as R from '../public/js/game/rules.js';

const D = (f) => JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public/data', f), 'utf-8'));
const playerDef = D('player.json');
const defs = { combat: D('combat.json'), table: D('damageTable.json').table, jobs: D('jobs.json').jobs, races: D('races.json').races };

async function engine() {
    const dir = copyGameModules('jobs-');
    const { GameEngine } = await import(path.join(dir, 'game.js'));
    const g = Object.create(GameEngine.prototype);
    g.player = { hp: 1, mp: 1, stamina: 1, status: {} };
    g.updateEquipHud = () => {};
    g.setRules(defs.combat, defs.table, defs.jobs, defs.races, D('jobs.json').maxLevel);
    g.setGearDefs(D('equipment.json'));
    g.getMeleeItem = () => ({ weightRange: [1, 8], blunt: false });
    g.applyCharacterDef(playerDef);
    g.recomputeStats(true);
    return g;
}

test('初期の冒険者の職業と、経験値のストック', async () => {
    const g = await engine();
    assert.deepEqual(g.player.jobs, { primary: 'fighter', sub: null, levels: { fighter: 1 }, expStock: 0 });
    assert.equal(g.player.job, 'fighter');
    assert.equal(g.player.level, 1);
    g.gainExp(25);
    assert.equal(g.player.jobs.expStock, 25);
    assert.equal(g.player.level, 1, '経験値を貯めても、レベルは上がらない（訓練所で上げる）');
});

test('レベルアップ: 必要な経験値は round(expBase × n^1.5)。足りなければ断る', async () => {
    const g = await engine();
    assert.equal(g.expCost('fighter'), R.expToNextLevel(defs, 'fighter', 1));
    assert.equal(g.expCost('fighter'), 20);   // expBase 20
    assert.equal(g.levelUpJob('fighter').ok, false);
    g.gainExp(25);
    const r = g.levelUpJob('fighter');
    assert.equal(r.ok, true);
    assert.equal(g.player.jobs.expStock, 5);
    assert.equal(g.player.jobs.levels.fighter, 2);
    assert.equal(g.player.level, 2);
    assert.equal(g.player.maxHp, 28 + 2, '第一職業のレベルで、最大 HP が増える');
    assert.equal(g.expCost('fighter'), Math.round(20 * Math.pow(2, 1.5)));
    assert.equal(g.levelUpJob('wizard').ok, false, '覚えていない職業は上げられない');
    g.player.jobs.levels.fighter = 99;
    assert.equal(g.expCost('fighter'), null, '最大レベル');
    assert.match(g.levelUpJob('fighter').message, /最大/);
});

test('職業を覚える・第一職業とサブ職業の変更', async () => {
    const g = await engine();
    const ids = g.learnableJobs();
    assert.ok(ids.includes('sorcerer') && ids.includes('apothecary'), '基本職は覚えられる');
    assert.ok(!ids.includes('knight') && !ids.includes('fighter'), '上位職は条件が要る。覚えたものは出ない');
    assert.equal(g.learnJob('knight').ok, false);
    assert.equal(g.learnJob('sorcerer').ok, true);
    assert.equal(g.player.jobs.levels.sorcerer, 1);
    g.player.jobs.levels.fighter = 20;
    assert.ok(g.learnableJobs().includes('knight') && g.learnableJobs().includes('spellsword') === false, 'ナイトは、ファイター Lv20 で覚えられる（魔法戦士は、ソーサラー Lv20 も必要）');
    g.player.jobs.levels.sorcerer = 20;
    assert.ok(g.learnableJobs().includes('spellsword'));
    // 第一職業: 戦闘職だけ。変えると、HP・MP が変わる
    assert.equal(g.learnJob('knight').ok, true);
    const hp0 = g.player.maxHp;
    assert.equal(g.setPrimaryJob('knight').ok, true);
    assert.equal(g.player.job, 'knight');
    assert.equal(g.player.level, 1, '上位職は Lv1 から');
    assert.equal(g.player.maxHp, 28 + 1 * 2, '上位職は HP +2 / Lv');
    assert.ok(g.player.maxHp !== hp0);
    assert.equal(g.learnJob('apothecary').ok, true);
    assert.equal(g.setPrimaryJob('apothecary').ok, false, '非戦闘職は、第一職業にできない');
    assert.equal(g.setPrimaryJob('wizard').ok, false, '覚えていない職業');
    // サブ: 覚えた職業のうち、第一以外
    assert.equal(g.setSubJob('knight').ok, false, '第一職業は、サブにできない');
    assert.equal(g.setSubJob('apothecary').ok, true);
    assert.equal(g.player.jobs.sub, 'apothecary');
    assert.equal(g.setPrimaryJob('fighter').ok, true);
    assert.equal(g.setSubJob(null).ok, true);
    assert.equal(g.player.jobs.sub, null);
    g.setSubJob('sorcerer'); g.setPrimaryJob('sorcerer');
    assert.equal(g.player.jobs.sub, null, 'サブと同じ職業を第一にしたら、サブを外す');
});

test('訓練所のメニュー（画面の遷移と、操作の結果）', async () => {
    const g = await engine();
    g.shops = { training: { name: '職業訓練所', keeper: 'trainer', training: true } };
    g.closeShopMenu = () => { g.shopMenu = null; };
    const m = g.shopMenu = { shopId: 'training', screen: 'top', index: 0, note: '' };
    const labels = () => g.trainingChoices(m).map((c) => c.label);
    assert.deepEqual(labels(), ['レベルを上げる', '職業を覚える', '第一職業を変える', 'サブ職業を決める', 'やめる']);
    g.trainingChoices(m)[0].act();   // レベルを上げる
    assert.equal(m.screen, 'levelup');
    assert.match(labels()[0], /ファイター　Lv\.1.*必要 20/);
    g.trainingChoices(m)[0].act();
    assert.match(m.note, /経験値が足りません/);
    g.gainExp(30);
    g.trainingChoices(m)[0].act();
    assert.equal(g.player.level, 2);
    assert.match(m.note, /Lv\.2/);
    assert.match(g.trainingTitle(m), /レベルを上げる　経験値のストック 10/);
    g.trainingChoices(m).at(-1).act();   // もどる
    assert.equal(m.screen, 'top');
    g.trainingChoices(m)[1].act();   // 職業を覚える
    assert.ok(labels().some((l) => l.startsWith('ソーサラー（基本職・戦闘）')));
    const sorcerer = g.trainingChoices(m).findIndex((c) => c.label.startsWith('ソーサラー'));
    g.trainingChoices(m)[sorcerer].act();
    assert.equal(g.player.jobs.levels.sorcerer, 1);
    assert.ok(!labels().some((l) => l.startsWith('ソーサラー')), '覚えたものは、一覧から消える');
    m.screen = 'sub';
    assert.ok(labels().some((l) => l.startsWith('ソーサラー')) && labels()[0].startsWith('なし'));
    g.trainingChoices(m).find((c) => c.label.startsWith('ソーサラー')).act();
    assert.equal(g.player.jobs.sub, 'sorcerer');
});

test('訓練所の教官（4 つのマップ）に、訓練所の店が結びついている', () => {
    const shops = D('shops.json'), npcs = D('npcs.json');
    for (const [map, shopId] of [['guild_training', 'training'], ['guild_training_a', 'training'], ['guild_training_k', 'training'], ['guild_training_f', 'training_f']]) {
        const m = D(`maps/${map}.json`);
        const keeper = m.npcs.find((n) => n.shopId);
        assert.equal(keeper?.shopId, shopId, map);
        assert.equal(shops[shopId].training, true);
        assert.equal(shops[shopId].keeper, keeper.id, `${map}: 店主`);
        assert.equal(npcs[keeper.id].name.startsWith('職業訓練所の教官'), true);
    }
});
