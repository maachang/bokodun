// ゲームの冒険者 ⇄ 保存データ（public/js/game/saveLoad.js）のテスト。保存データは、サーバーの検証（validates/character.js）を通ること
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { copyGameModules } from './helpers/game.mjs';
import { buildItems } from '../public/js/game/itemDefs.js';

const require = createRequire(import.meta.url);
const D = (f) => JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public/data', f), 'utf-8'));
const playerDef = D('player.json');
const defs = { combat: D('combat.json'), table: D('damageTable.json').table, jobs: D('jobs.json').jobs, races: D('races.json').races };
const validatePath = path.join(process.env.MAACHANG_HOME ?? '/home/maachang/project/maachang', 'modules/validate/validate.js');
const hasValidate = fs.existsSync(validatePath);
const schema = require(path.join(process.cwd(), 'validates/character.js'));

async function engine() {
    const dir = copyGameModules('save-');
    const { GameEngine } = await import(path.join(dir, 'game.js'));
    const g = Object.create(GameEngine.prototype);
    g.player = { hp: 1, mp: 1, stamina: 1, status: {}, gold: 0, stock: [...playerDef.stock], selMelee: playerDef.selMelee, selFocus: playerDef.selFocus, selMagic: playerDef.selMagic };
    g.items = buildItems(D('items.json'), D('equipment.json'), D('magic.json'));
    g.weaponClasses = D('weaponClasses.json');
    g.addPopup = () => {};
    g.updateEquipHud = () => {};
    g.setRules(defs.combat, defs.table, defs.jobs, defs.races, 99);
    g.setGearDefs(D('equipment.json'));
    g.applyCharacterDef(playerDef);
    g.recomputeStats(true);
    g.giveAllEquipment();   // 定義済みの武器・防具を、全部持っている状態（買う仕組みは、test/equip_shop.test.mjs）
    return g;
}

test('保存データは、サーバーの検証を通る', { skip: !hasValidate && 'validate.js が見つからない' }, async () => {
    const validate = require(validatePath);
    const g = await engine();
    const check = (data) => validate.check({ name: '冒険者', status: 'creating', rev: 1, data }, schema);
    const r = check(g.buildSaveData());
    assert.deepEqual(r.errors, []);
    // 変えた状態（職業・装備・端数の MP・所持金・防具なし）でも通る
    g.player.mp = 12.5; g.player.gold = 340; g.player.hp = 7;
    g.player.jobs.levels.sorcerer = 3; g.player.jobs.sub = 'sorcerer'; g.player.jobs.expStock = 77;
    g.player.equip = { armor: 'chain_mail', helm: null, shield: null };
    assert.deepEqual(check(g.buildSaveData()).errors, []);
});

test('保存して読み込むと、冒険者が元に戻る（能力値・職業・防具・HP/MP・所持金・ストック）', async () => {
    const a = await engine();
    a.player.abilities.str = 30; a.player.abilities.intel = 22;
    a.player.jobs = { primary: 'sorcerer', sub: 'fighter', levels: { fighter: 12, sorcerer: 8, apothecary: 4 }, expStock: 123 };
    a.syncJob();
    a.player.equip = { armor: 'chain_mail', helm: 'iron_helm', shield: null };
    a.player.magics.push('high_heal');
    a.setStockSlot(1, 'high_heal');
    a.recomputeStats(true);
    a.player.hp = 9; a.player.mp = 11.7; a.player.gold = 500;
    const saved = JSON.parse(JSON.stringify(a.buildSaveData()));   // サーバーを経由するのと同じ（JSON）

    const b = await engine();   // 初期の冒険者
    assert.equal(b.player.level, 1);
    assert.equal(b.applySaveData(saved), true);
    assert.equal(b.player.abilities.str, 30);
    assert.equal(b.player.abilities.intel, 22);
    assert.deepEqual(b.player.jobs, a.player.jobs);
    assert.equal(b.player.job, 'sorcerer');
    assert.equal(b.player.level, 8);
    assert.deepEqual(b.player.equip, { armor: 'chain_mail', helm: 'iron_helm', shield: null, accessory: null });
    assert.equal(b.player.stock[1], 'high_heal');
    assert.equal(b.player.maxHp, a.player.maxHp);
    assert.equal(b.player.hp, 9);
    assert.equal(b.player.mp, 11, 'MP は、整数で保存される');
    assert.equal(b.player.gold, 500);
});

test('読み込み: 形の合わない項目・定義にない ID は捨てて、初期値のまま', async () => {
    const g = await engine();
    const ok = g.applySaveData({
        profile: { race: 'robot' }, abilities: { str: 99, dex: 'x' }, jobs: { primary: 'no_job', levels: {} },
        gold: -5, equipment: { armor: 'no_armor', helm: 'full_plate', shield: 'buckler' }, vitals: { hp: 0, mp: 5 },
        stock: { slots: ['no_item', 'herb', 'dagger', null, null, null, null, null, null], melee: 0 }
    });
    assert.equal(ok, true);
    assert.equal(g.player.race, 'human');
    assert.equal(g.player.abilities.str, 14);
    assert.equal(g.player.abilities.dex, 14);
    assert.equal(g.player.jobs.primary, 'fighter');
    assert.equal(g.player.gold, 0);
    assert.equal(g.player.equip.armor, null, '定義にない鎧');
    assert.equal(g.player.equip.helm, null, '筋力で持てない兜');
    assert.equal(g.player.equip.shield, 'buckler');
    assert.deepEqual(g.player.stock.slice(0, 3), [null, null, 'dagger'], 'ストックに入れられないもの・定義にないものは空き');
    assert.equal(g.player.hp, 1, 'HP は、最低 1');
    assert.equal(g.applySaveData(null), false);
});

test('読み込み: 両手武器を選んでいて盾の保存があるときは、盾を外す', async () => {
    const g = await engine();
    g.applySaveData({ stock: { slots: ['claymore', null, null, null, null, null, null, null, null], melee: 0 }, abilities: { str: 50 }, equipment: { shield: 'buckler' } });
    assert.equal(g.player.stock[0], 'claymore');
    assert.equal(g.getMeleeItem().twoHanded, true);
    assert.equal(g.player.equip.shield, null);
});
