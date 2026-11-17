// 武器・防具の所持と購入（武器屋。重さを選んで買う）: public/js/game/gear.js・equipShop.js・interact.js
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
const playerDef = D('player.json'), shops = D('shops.json'), equipment = D('equipment.json');
const defs = { combat: D('combat.json'), table: D('damageTable.json').table, jobs: D('jobs.json').jobs, races: D('races.json').races };
const validatePath = path.join(process.env.MAACHANG_HOME ?? '/home/maachang/project/maachang', 'modules/validate/validate.js');
const hasValidate = fs.existsSync(validatePath);
const schema = require(path.join(process.cwd(), 'validates/character.js'));

async function engine() {
    const dir = copyGameModules('eshop-');
    const { GameEngine } = await import(path.join(dir, 'game.js'));
    const g = Object.create(GameEngine.prototype);
    g.player = { hp: 1, mp: 1, stamina: 1, status: {}, gold: 0, stock: [...playerDef.stock], selMelee: playerDef.selMelee, selFocus: playerDef.selFocus, selMagic: playerDef.selMagic };
    g.items = buildItems(D('items.json'), equipment, D('magic.json'));
    g.weaponClasses = D('weaponClasses.json');
    g.shops = shops;
    g.addPopup = () => {};
    g.updateEquipHud = () => {};
    g.updateUI = () => {};
    g.closeShopMenu = () => { g.shopMenu = null; };
    g.renderShopMenu = () => {};   // 画面（DOM）の描画は、テストでは使わない
    g.setRules(defs.combat, defs.table, defs.jobs, defs.races, 99);
    g.setGearDefs(equipment);
    g.applyCharacterDef(playerDef);
    g.recomputeStats(true);
    return g;
}

test('初期に持っている武器・防具と、その重さ', async () => {
    const g = await engine();
    assert.deepEqual(g.player.owned, playerDef.owned);
    assert.equal(g.isOwned('long_sword'), true);
    assert.equal(g.isOwned('claymore'), false);
    assert.equal(g.weaponWeight(g.items.long_sword), 14, '持っている武器は、選んだ重さ');
    assert.equal(g.gearWeight(g.gearDef('armor', 'leather_armor')), 14);
    assert.equal(g.totalWeight() > 0, true);
});

test('持っていない武器・防具は、ストックに入れられず、着けられない', async () => {
    const g = await engine();
    const warn = console.warn; console.warn = () => {};
    try {
        assert.equal(g.setStockSlot(1, 'rapier'), false, '持っていない武器');
        assert.equal(g.setStockSlot(1, 'fists'), true, '素手は、いつでも');
        assert.equal(g.equipGear('shield', 'buckler'), false, '持っていない盾');
    } finally { console.warn = warn; }
    g.player.gold = 1000;
    assert.equal(g.buyEquipment('rapier', 8).ok, true);
    assert.equal(g.setStockSlot(1, 'rapier'), true);
    assert.equal(g.buyEquipment('buckler', g.defaultBuyWeight('buckler')).ok, true);
    assert.equal(g.equipGear('shield', 'buckler'), true);
});

test('価格は、選んだ重さで決まる（重い装備ほど高い）。お金が足りなければ断る', async () => {
    const g = await engine();
    const price = (id, w) => R.equipmentPrice(defs, g.equipDefOf(id).kind, w, g.equipDefOf(id).def.dice);
    assert.equal(g.equipPrice('short_sword', 14), 240, '仕様 8.2d の例');
    assert.equal(g.equipPrice('dagger', 8), 60);
    assert.equal(g.equipPrice('leather_armor', 14), 180);
    assert.ok(g.equipPrice('long_sword', 20) > g.equipPrice('long_sword', 10), '重いほど高い');
    assert.match(g.buyEquipment('rapier', 8).message, /お金が足りません/);
    assert.equal(g.isOwned('rapier'), false);
    g.player.gold = price('rapier', 8);
    const r = g.buyEquipment('rapier', 8);
    assert.equal(r.ok, true);
    assert.equal(g.player.gold, 0);
    assert.equal(g.player.owned.rapier, 8);
    assert.equal(g.buyEquipment('rapier', 8).ok, false, '同じ重さは、すでに持っている');
});

test('重さは、定義の範囲から選ぶ。店は、重さの制限なく売る（筋力で持てない重さも買える）。買い直すと、重さが入れ替わる', async () => {
    const g = await engine();
    g.player.gold = 100000;
    assert.match(g.buyEquipment('rapier', 3).message, /重さは 4〜12/);
    assert.match(g.buyEquipment('rapier', 13).message, /重さは 4〜12/);
    assert.equal(g.buyEquipment('rapier', 4).ok, true);
    assert.equal(g.buyEquipment('rapier', 12).ok, true);
    assert.match(g.buyEquipment('rapier', 6).message, /買い直しました/);
    assert.equal(g.player.owned.rapier, 6);
    // 筋力で持てない: 大剣（重さ 25〜50）。買えるが、装備できない
    assert.equal(g.buyEquipment('claymore', 25).ok, true);
    assert.equal(g.canCarry(g.items.claymore), false);
    assert.equal(g.defaultBuyWeight('claymore'), 25, '筋力で持てなければ、最小の重さ');
    assert.equal(g.defaultBuyWeight('long_sword'), 14, '持てる最大（筋力 14）');
    assert.equal(g.defaultBuyWeight('mace'), 21, '鈍器は筋力の 1.5 倍');
    g.setStockSlot(1, 'claymore'); g.selectSlot(1);
    assert.notEqual(g.player.selMelee, 1, '持てない武器は、選べない');
});

test('買い直して、筋力で持てない重さになった装備は、外れる', async () => {
    const g = await engine();
    g.player.gold = 100000;
    assert.equal(g.player.selMelee, 0);   // ダガー
    assert.equal(g.buyEquipment('dagger', 8).ok, false, '同じ重さ');
    assert.equal(g.getMeleeItem().id, 'dagger');
    g.selectSlot(1);                      // ロングソード（重さ 14）を選ぶ
    assert.equal(g.player.selMelee, 1);
    g.buyEquipment('long_sword', 20);     // 筋力 14 で持てない重さに買い直す
    assert.equal(g.player.selMelee, null, '選んでいた武器が外れる（素手になる）');
    g.buyEquipment('leather_armor', 14);
    assert.equal(g.player.equip.armor, 'leather_armor');
    g.player.abilities.str = 5;
    g.buyEquipment('leather_armor', 18);
    assert.equal(g.player.equip.armor, null, '着けていた防具が外れる');
});

test('武器屋のメニュー: 品を選ぶ → 重さを選ぶ画面 → 買う。←→ で重さを変える', async () => {
    const g = await engine();
    g.player.gold = 5000;
    const m = g.shopMenu = { shopId: 'weapon_shop', screen: 'buy', page: 0, index: 0, note: '' };
    const labels = () => g.shopMenuChoices().map((c) => c.label);
    assert.ok(labels().some((l) => l.startsWith('ショートソード　重さ 5〜15')));
    assert.ok(labels().some((l) => l.includes('（持っている）')), '持っているものは、印が付く');
    const i = labels().findIndex((l) => l.startsWith('レイピア'));
    g.shopMenuChoices()[i].act();
    assert.equal(m.screen, 'weight');
    assert.equal(m.weight, 12, '既定は、持てる最大（範囲の上限が 12）');
    assert.match(g.shopMenuChoices()[0].label, /買う　重さ 12　\d+G/);
    g.shopMenuKey({ code: 'ArrowLeft', preventDefault() {} });   // 重さを 1 減らす
    assert.equal(m.weight, 11);
    g.shopMenuKey({ code: 'ArrowRight', preventDefault() {} });
    g.shopMenuKey({ code: 'ArrowRight', preventDefault() {} });
    assert.equal(m.weight, 12, '上限で止まる');
    g.shopMenuChoices()[4].act();   // 重さを 5 減らす
    assert.equal(m.weight, 7);
    g.shopMenuChoices()[0].act();   // 買う
    assert.match(m.note, /レイピア（重さ 7）を買いました/);
    assert.equal(g.player.owned.rapier, 7);
    g.shopMenuChoices().at(-1).act();   // もどる
    assert.equal(m.screen, 'buy');
    assert.ok(g.equipShopInfo({ good: { equipId: 'rapier' } }).includes('持っている: 重さ 7'));
});

test('武器屋の品揃え（shops.json）は、定義済みの武器・防具。持てない重さの品は、装備できない印が出る', async () => {
    for (const sid of ['weapon_shop', 'weapon_shop_f', 'weapon_shop_g']) {
        for (const g of shops[sid].goods) {
            assert.ok(['weapon', 'armor', 'helm', 'shield'].includes(g.kind), `${sid}: kind`);
            const list = { weapon: equipment.weapons, armor: equipment.armors, helm: equipment.helms, shield: equipment.shields }[g.kind];
            assert.ok(list.some((x) => x.id === g.equipId), `${sid}: ${g.equipId} は ${g.kind} の定義にある`);
        }
    }
    const g = await engine();
    g.shopMenu = { shopId: 'weapon_shop', screen: 'weight', good: { equipId: 'claymore' }, weight: 30, index: 0, note: '' };
    assert.match(g.shopMenuChoices()[0].label, /筋力が足りず、装備はできません/);
});

test('持っている武器・防具の保存・読み込み（サーバーの検証を通る。不正な項目は捨てる）', { skip: !hasValidate && 'validate.js が見つからない' }, async () => {
    const validate = require(validatePath);
    const a = await engine();
    a.player.gold = 10000;
    a.buyEquipment('rapier', 9); a.buyEquipment('chain_mail', 20);
    const saved = JSON.parse(JSON.stringify(a.buildSaveData()));
    assert.equal(saved.owned.rapier, 9);
    assert.deepEqual(validate.check({ name: '冒険者', status: 'creating', rev: 1, data: saved }, schema).errors, []);
    const b = await engine();
    b.applySaveData(saved);
    assert.equal(b.player.owned.chain_mail, 20);
    assert.deepEqual(b.player.owned, a.player.owned);
    // 検証: 定義にない・範囲外は断る
    const bad = (owned) => validate.check({ name: '冒険者', status: 'creating', rev: 1, data: { owned } }, schema).errors.map((e) => e.message).join('/');
    assert.match(bad({ no_such: 5 }), /定義にない/);
    assert.match(bad({ rapier: 13 }), /重さが範囲外/);
    assert.match(bad({ rapier: 2.5 }), /重さが範囲外/);
    // 読み込み: 不正な項目を捨てる。持っていない武器がストックにあれば空き、防具が持っていなければ外す
    const c = await engine();
    c.applySaveData({ owned: { rapier: 99, no_such: 3, dagger: 8, fists: 1 }, stock: { slots: ['rapier', 'dagger', null, null, null, null, null, null, null], melee: 1 }, equipment: { armor: 'leather_armor' } });
    assert.deepEqual(c.player.owned, { dagger: 8 });
    assert.deepEqual(c.player.stock.slice(0, 2), [null, 'dagger']);
    assert.equal(c.player.equip.armor, null, '持っていない防具は外れる');
});
