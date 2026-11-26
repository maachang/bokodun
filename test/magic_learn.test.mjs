// 魔法を覚える（魔法ギルドで買う・宝箱などで取得する）・覚えた魔法だけがストックに入る・保存
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { copyGameModules } from './helpers/game.mjs';
import { buildItems } from '../public/js/game/itemDefs.js';

const D = (f) => JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public/data', f), 'utf-8'));
const playerDef = D('player.json'), shops = D('shops.json');
const defs = { combat: D('combat.json'), table: D('damageTable.json').table, jobs: D('jobs.json').jobs, races: D('races.json').races };

async function engine() {
    const dir = copyGameModules('learn-');
    const { GameEngine } = await import(path.join(dir, 'game.js'));
    const g = Object.create(GameEngine.prototype);
    g.player = { hp: 1, mp: 1, stamina: 1, status: {}, gold: 0, stock: [...playerDef.stock], selMelee: playerDef.selMelee, selFocus: playerDef.selFocus, selMagic: playerDef.selMagic };
    g.items = buildItems(D('items.json'), D('equipment.json'), D('magic.json'));
    g.weaponClasses = D('weaponClasses.json');
    g.shops = shops;
    g.addPopup = () => {};
    g.updateEquipHud = () => {};
    g.updateUI = () => {};   // 画面の表示（DOM）は、テストでは使わない
    g.closeShopMenu = () => { g.shopMenu = null; };
    g.setRules(defs.combat, defs.table, defs.jobs, defs.races, 99);
    g.setGearDefs(D('equipment.json'));
    g.applyCharacterDef(playerDef);
    g.recomputeStats(true);
    g.giveAllEquipment();   // 定義済みの武器・防具を、全部持っている状態（買う仕組みは、test/equip_shop.test.mjs）
    return g;
}

test('初期に覚えている魔法と、ストックに入れられる魔法', async () => {
    const g = await engine();
    assert.deepEqual(g.player.magics, ['magic_bolt', 'fire', 'explosion', 'spread']);
    assert.equal(g.isSpellLearned('fire'), true);
    assert.equal(g.isSpellLearned('heal'), false);
    const warn = console.warn; console.warn = () => {};
    try {
        assert.equal(g.setStockSlot(1, 'heal'), false, '覚えていない魔法は、ストックに入れられない');
        assert.equal(g.getSlotItem(1).id, 'long_sword', '中身は変わらない');
        assert.equal(g.setStockSlot(1, 'club'), true, '武器は、覚える必要がない');
    } finally { console.warn = warn; }
    assert.equal(g.learnSpell('heal').ok, true);
    assert.equal(g.setStockSlot(1, 'heal'), true);
    assert.equal(g.learnSpell('heal').ok, false, 'すでに覚えている');
    assert.equal(g.learnSpell('club').ok, false, '呪文ではない');
});

test('魔法ギルドで買う: お金が足りなければ断り、足りれば払って覚える（買い切り）', async () => {
    const g = await engine();
    g.player.job = 'priest';   // 大神殿の魔法は、プリースト系だけが買える
    const heal = shops.temple.goods.find((x) => x.spellId === 'heal');   // ヒール系は、大神殿で売る
    assert.equal(g.buySpell(heal, shops.temple).ok, false);
    assert.match(g.buySpell(heal, shops.temple).message, /お金が足りません/);
    assert.equal(g.isSpellLearned('heal'), false);
    g.player.gold = 300;
    const r = g.buySpell(heal, shops.temple);
    assert.equal(r.ok, true);
    assert.equal(g.player.gold, 300 - heal.price);
    assert.equal(g.isSpellLearned('heal'), true);
    assert.equal(g.buySpell(heal, shops.temple).ok, false, '2 回は買えない');
    assert.equal(g.player.gold, 300 - heal.price, 'お金は減らない');
});

test('店のメニューで、魔法を買える。品揃えは店ごとの goods で決まり、上級は、上位の魔法使い系だけが買える', async () => {
    const g = await engine();
    const m = g.shopMenu = { shopId: 'magic_guild', screen: 'buy', page: 0, index: 0, note: '' };
    g.player.gold = 1000;
    const labels = () => g.shopMenuChoices().map((c) => c.label);
    assert.ok(labels().some((l) => l.startsWith('エナジーヴェール')));
    assert.ok(!labels().some((l) => l.startsWith('ヒール') || l.startsWith('リフレッシュ')), 'ヒール系は、魔法ギルドでは売らない（大神殿）');
    assert.ok(!labels().some((l) => l.startsWith('ファイアーボム') || l.startsWith('ハイヒール') || l.startsWith('ハイ・リフレッシュ')), 'goods に入れていない上級は、売らない');
    const i = labels().findIndex((l) => l.startsWith('エナジーヴェール'));
    g.shopMenuChoices()[i].act();
    assert.match(m.note, /買って、覚えました/);
    assert.ok(labels().find((l) => l.startsWith('エナジーヴェール')).includes('（覚えた）'));
    const magic = D('magic.json').spells;
    for (const gd of shops.magic_guild.goods) if (magic[gd.spellId].tier === 'high') assert.equal(gd.requires?.group, 'highMage', `${gd.spellId}: 店の上級は、上位の魔法使い系の条件つき`);
    for (const gd of shops.temple.goods) if (gd.spellId && magic[gd.spellId].tier === 'high') assert.equal(gd.requires?.group, 'highHoly', `${gd.spellId}: 大神殿の上級は、プリースト系の上位職の条件つき`);
});

test('魔法の購入条件（requires.group）: その店の jobGroups の職業でないと買えない（場所や条件で、買えるものが変わる仕組み）', async () => {
    const g = await engine();
    const shop = shops.magic_guild, temple = shops.temple;
    const good = (id) => shop.goods.find((x) => x.spellId === id) ?? temple.goods.find((x) => x.spellId === id);
    const inShop = (id) => (shop.goods.some((x) => x.spellId === id) ? shop : temple);
    g.player.gold = 5000;
    assert.equal(good('magic_bolt').requires, undefined, '既存の売り物は、条件なし');
    g.player.job = 'fighter';
    assert.match(g.buySpell(good('enchant'), inShop('enchant')).message, /魔法使い系の職業でないと買えません/);
    assert.equal(g.isSpellLearned('enchant'), false);
    assert.equal(g.player.gold, 5000, '買えないときは、お金は減らない');
    assert.match(g.buySpell(good('cure'), inShop('cure')).message, /プリースト系の職業でないと買えません/, 'ヒール系は、大神殿で、プリースト系だけ');
    g.player.job = 'sorcerer';
    assert.equal(g.buySpell(good('enchant'), inShop('enchant')).ok, true);
    assert.equal(g.buySpell(good('cure'), inShop('cure')).ok, false, 'ソーサラーは、プリースト系ではない');
    g.player.job = 'priest';
    assert.equal(g.buySpell(good('cure'), inShop('cure')).ok, true, 'プリーストは、一番低いランクで、ヒール系の初級を買える');
    assert.match(g.buySpell(good('recovery'), inShop('recovery')).message, /プリースト系の上位職/, '上級は、プリースト系の上位職だけ');
    g.player.job = 'bishop';
    assert.equal(g.buySpell(good('recovery'), inShop('recovery')).ok, true);
    // 店ごとに jobGroups を変えれば、同じ売り物でも買える職業が変わる（魔法王国など）
    g.player.job = 'fighter';
    assert.equal(g.buySpell(good('protection'), { ...shop, jobGroups: { ...shop.jobGroups, mage: ['fighter'] } }).ok, true);
    for (const sh of [shop, temple]) for (const gd of sh.goods) if (gd.requires) assert.ok(sh.jobGroups[gd.requires.group] && sh.groupNames[gd.requires.group], `${gd.spellId}: 条件の group が、店に定義されている`);
});

test('宝箱などで取得する（lootTable の spell）。保存・読み込みで、覚えた魔法が戻る', async () => {
    const a = await engine();
    const r = a.learnSpell('high_heal');
    assert.equal(r.ok, true);
    a.setStockSlot(1, 'high_heal');
    const saved = JSON.parse(JSON.stringify(a.buildSaveData()));
    assert.ok(saved.magics.includes('high_heal'));
    const b = await engine();
    assert.equal(b.isSpellLearned('high_heal'), false);
    b.applySaveData(saved);
    assert.equal(b.isSpellLearned('high_heal'), true);
    assert.equal(b.player.stock[1], 'high_heal');
    // 覚えていない魔法がストックにある保存データは、その枠を空きにする
    const c = await engine();
    c.applySaveData({ magics: ['fire'], stock: { slots: [null, 'heal', 'fire', null, null, null, null, null, null], magic: 2 } });
    assert.deepEqual(c.player.magics, ['fire']);
    assert.equal(c.player.stock[1], null);
    assert.equal(c.player.stock[2], 'fire');
});

test('ヒール系（magic.json の kind が heal）は、魔法ギルドではなく、大神殿で売る', () => {
    const magic = D('magic.json').spells;
    const heals = Object.keys(magic).filter((k) => magic[k].kind === 'heal');
    assert.ok(heals.length >= 7);
    for (const id of heals) {
        assert.ok(shops.temple.goods.some((x) => x.spellId === id), `${id}: 大神殿で売る`);
        assert.ok(!shops.magic_guild.goods.some((x) => x.spellId === id), `${id}: 魔法ギルドでは売らない`);
    }
});
