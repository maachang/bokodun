// 所持品（道具）: 持つ・買う・使う・保存（public/js/game/inventory.js）
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { copyGameModules } from './helpers/game.mjs';
import { buildItems } from '../public/js/game/itemDefs.js';
import * as R from '../public/js/game/rules.js';

const require = createRequire(import.meta.url);
const D = (f) => JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public/data', f), 'utf-8'));
const playerDef = D('player.json'), shops = D('shops.json');
const defs = { combat: D('combat.json'), table: D('damageTable.json').table, jobs: D('jobs.json').jobs, races: D('races.json').races };
const validatePath = path.join(process.env.MAACHANG_HOME ?? '/home/maachang/project/maachang', 'modules/validate/validate.js');
const hasValidate = fs.existsSync(validatePath);
const schema = require(path.join(process.cwd(), 'validates/character.js'));
const withRandom = (v, f) => { const o = Math.random; Math.random = () => v; try { return f(); } finally { Math.random = o; } };

async function engine() {
    const dir = copyGameModules('inv-');
    const { GameEngine } = await import(path.join(dir, 'game.js'));
    const g = Object.create(GameEngine.prototype);
    g.player = { hp: 1, mp: 1, stamina: 1, status: {}, gold: 0, stock: [...playerDef.stock], selMelee: playerDef.selMelee, selFocus: playerDef.selFocus, selMagic: playerDef.selMagic };
    g.items = buildItems(D('items.json'), D('equipment.json'), D('magic.json'));
    g.weaponClasses = D('weaponClasses.json');
    g.shops = shops;
    g.staminaDef = defs.combat.stamina;
    g.addPopup = () => {};
    g.updateEquipHud = () => {};
    g.updateUI = () => {};   // 画面の表示（DOM）は、テストでは使わない
    g.setRules(defs.combat, defs.table, defs.jobs, defs.races, 99);
    g.setGearDefs(D('equipment.json'));
    g.applyCharacterDef(playerDef);
    g.recomputeStats(true);
    return g;
}

test('持ち物: 種類 99・各 99 個まで', async () => {
    const g = await engine();
    assert.deepEqual(g.player.inventory, {});
    assert.equal(g.addItem('herb', 5), 5);
    assert.equal(g.itemCount('herb'), 5);
    assert.equal(g.addItem('herb', 200), 94, '99 個まで');
    assert.equal(g.addItem('herb', 1), 0);
    assert.equal(g.removeItem('herb', 100), false, '足りなければ減らせない');
    assert.equal(g.removeItem('herb', 99), true);
    assert.equal('herb' in g.player.inventory, false, '0 個になったら、持ち物から消える');
    for (let i = 0; i < 99; i++) g.player.inventory['dummy' + i] = 1;   // 種類を 99 にする
    assert.equal(g.addItem('potion', 1), 0, '種類が 99 を超えては持てない');
    assert.equal(g.addItem('dummy3', 1), 1, '持っている種類は、個数を増やせる');
});

test('道具屋・神殿で買う: お金が足りなければ断り、買うと持ち物に入る', async () => {
    const g = await engine();
    const good = shops.item_shop.goods.find((x) => x.itemId === 'herb');
    assert.match(g.buyItem(good).message, /お金が足りません/);
    assert.equal(g.itemCount('herb'), 0);
    g.player.gold = 70;
    assert.equal(g.buyItem(good).ok, true);
    assert.equal(g.buyItem(good).ok, true);
    assert.equal(g.player.gold, 70 - good.price * 2);
    assert.equal(g.itemCount('herb'), 2);
    g.player.inventory.herb = 99; g.player.gold = 1000;
    assert.match(g.buyItem(good).message, /これ以上持てません/);
    assert.equal(g.player.gold, 1000, 'お金は減らない');
    // 店のメニュー: 道具は、買える。武器（itemId なし）は、まだ準備中
    const m = g.shopMenu = { shopId: 'item_shop', screen: 'buy', page: 0, index: 0, note: '' };
    g.player.inventory.herb = 0; delete g.player.inventory.herb;
    const i = g.shopMenuChoices().findIndex((c) => c.label.startsWith('ポーション'));
    assert.match(g.shopMenuChoices()[i].label, /所持 0/);
    g.shopMenuChoices()[i].act();
    assert.match(m.note, /ポーションを買いました/);
    assert.match(g.shopMenuChoices()[i].label, /所持 1/);
    g.shopMenu = { shopId: 'weapon_shop', screen: 'buy', page: 0, index: 0, note: '' };
    g.shopMenuChoices()[0].act();
    assert.match(g.shopMenu.note, /準備中/);
});

test('回復道具: 重さ＋ダイスをダメージ表に通した分だけ回復。満タンなら使わない（減らない）', async () => {
    const g = await engine();
    g.addItem('herb', 2); g.addItem('mana_drop', 1); g.addItem('stamina_herb', 1);
    const e = g.items.herb.effect;
    const want = R.tableValue(defs, e.weight, e.dice.n * (1 + Math.floor(0.5 * e.dice.m)) + e.dice.k);   // 乱数 0.5
    assert.equal(g.useItem('herb').message, 'HPは満タンです');
    assert.equal(g.itemCount('herb'), 2);
    g.player.hp = 3;
    const r = withRandom(0.5, () => g.useItem('herb'));
    assert.equal(r.ok, true);
    assert.equal(g.player.hp, Math.min(g.player.maxHp, 3 + want));
    assert.equal(g.itemCount('herb'), 1);
    // MP・スタミナ
    g.player.mp = 2; g.player.stamina = 2; g.player.staminaExhausted = true; g.player.staminaPause = 5;
    assert.equal(withRandom(0.5, () => g.useItem('mana_drop')).ok, true);
    assert.ok(g.player.mp > 2);
    assert.equal(withRandom(0.5, () => g.useItem('stamina_herb')).ok, true);
    assert.ok(g.player.stamina > 2 && g.player.staminaPause === 0, '回復停止も、打ち消す');
    assert.equal(g.player.staminaExhausted, false);
});

test('薬師・医術師のレベルで、回復道具の効果が増える', async () => {
    const g = await engine();
    assert.equal(g.healItemRate(), 1);
    g.player.jobs.levels.apothecary = 50;
    assert.equal(g.healItemRate(), 1.5);
    g.player.jobs.levels.physician = 20;
    assert.ok(Math.abs(g.healItemRate() - 1.6) < 1e-9, '薬師 Lv × 1% ＋ 医術師 Lv × 0.5%');
    g.addItem('potion', 2); g.player.hp = 1; g.player.maxHp = 1000;
    const e = g.items.potion.effect, base = R.tableValue(defs, e.weight, e.dice.n * (1 + Math.floor(0.5 * e.dice.m)) + e.dice.k);
    withRandom(0.5, () => g.useItem('potion'));
    assert.equal(g.player.hp, 1 + Math.floor(base * 1.6));
});

test('状態異常を治す道具・疲労回復の香・使えない道具', async () => {
    const g = await engine();
    g.addItem('antidote', 1); g.addItem('paralysis_cure', 1); g.addItem('rest_incense', 1); g.addItem('revive_potion', 1); g.addItem('return_stone', 1); g.addItem('key', 1);
    assert.equal(g.useItem('antidote').message, '毒にかかっていません');
    assert.equal(g.itemCount('antidote'), 1, '効果がなければ、減らない');
    g.player.status = { poison: { t: 3, dps: 2 }, paralysis: { t: 2 } };
    assert.equal(g.useItem('antidote').ok, true);
    assert.equal(g.player.status.poison, undefined);
    assert.equal(g.useItem('paralysis_cure').ok, true);
    assert.equal(g.player.status.paralysis, undefined);
    assert.equal(g.itemCount('antidote'), 0);
    // 疲労回復の香: 20 秒間、自然回復が 2 倍
    g.player.stamina = 5; g.player.staminaPause = 0; g.player.staminaExhausted = false;
    g.updateStamina(1); const normal = g.player.stamina - 5;
    g.player.stamina = 5; g.player.buffs = undefined;
    assert.equal(g.useItem('rest_incense').ok, true);
    assert.equal(g.player.buffs.staminaRegenRate.t, 20);
    g.updateStamina(1);
    assert.ok(Math.abs((g.player.stamina - 5) - normal * 2) < 1e-6, '自然回復が 2 倍');
    g.updateStamina(25);
    assert.ok(!(g.player.buffs.staminaRegenRate.t > 0), '20 秒で切れる');
    // まだ使えないもの
    for (const id of ['revive_potion', 'return_stone', 'key']) { assert.equal(g.useItem(id).ok, false, id); assert.equal(g.itemCount(id), 1, `${id}: 減らない`); }
    assert.equal(g.useItem('no_such').ok, false);
    assert.equal(g.useItem('herb').ok, false, '持っていない');
});

test('所持品の保存・読み込み（サーバーの検証を通る。不正な項目は捨てる）', { skip: !hasValidate && 'validate.js が見つからない' }, async () => {
    const validate = require(validatePath);
    const a = await engine();
    a.addItem('herb', 7); a.addItem('antidote', 2);
    const saved = JSON.parse(JSON.stringify(a.buildSaveData()));
    assert.deepEqual(saved.inventory, { herb: 7, antidote: 2 });
    assert.deepEqual(validate.check({ name: '冒険者', status: 'creating', rev: 1, data: saved }, schema).errors, []);
    const b = await engine();
    b.applySaveData(saved);
    assert.deepEqual(b.player.inventory, { herb: 7, antidote: 2 });
    const c = await engine();
    c.applySaveData({ inventory: { herb: 5, dagger: 1, no_such: 2, potion: 100, antidote: 0, key: 1 } });
    assert.deepEqual(c.player.inventory, { herb: 5, key: 1 }, '道具・鍵だけ。定義にない・個数が範囲外は捨てる');
});
