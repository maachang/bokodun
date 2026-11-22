// アクセサリ（装備 1 枠）の持つ・着ける・保存・読み込み（public/js/game/accessory.js）のテスト
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { copyGameModules } from './helpers/game.mjs';
import { buildItems } from '../public/js/game/itemDefs.js';
import { effectText } from '../public/js/game/accessory.js';

const D = (f) => JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public/data', f), 'utf-8'));
const playerDef = D('player.json'), equipment = D('equipment.json');
const defs = { combat: D('combat.json'), table: D('damageTable.json').table, jobs: D('jobs.json').jobs, races: D('races.json').races };

async function engine() {
    const dir = copyGameModules('acc-');
    const { GameEngine } = await import(path.join(dir, 'game.js'));
    const g = Object.create(GameEngine.prototype);
    const popups = [];
    g.player = { hp: 1, mp: 1, stamina: 1, exp: 0, level: 1, status: {}, isInvincible: false, gold: 0, stock: [...playerDef.stock], selMelee: playerDef.selMelee, selFocus: playerDef.selFocus, selMagic: playerDef.selMagic };
    g.weaponClasses = D('weaponClasses.json');
    g.items = buildItems(D('items.json'), equipment, D('magic.json'));
    g.sound = { playHurt() {}, playLevelClear() {} };
    g.particles = { spawnBurst() {} };
    g.addPopup = (m) => popups.push(m);
    g.updateEquipHud = () => g.recomputeStats(false);
    g.setRules(defs.combat, defs.table, defs.jobs, defs.races);
    g.setGearDefs(equipment);
    g.applyCharacterDef({ ...playerDef });
    g.getMeleeItem = () => ({ id: 'dagger', weightRange: [1, 8], dice: { n: 1, m: 6, k: 2 }, blunt: false, twoHanded: false });
    g.recomputeStats(true);
    return { g, popups };
}

test('アクセサリの定義', () => {
    const icons = D('icons.json');
    const ids = equipment.accessories.map((a) => a.id);
    assert.equal(new Set(ids).size, ids.length, 'ID の重複なし');
    for (const a of equipment.accessories) {
        assert.ok(['B', 'A', 'S', 'SS', 'SSS'].includes(a.rank), a.id);
        assert.ok(a.effects.length > 0, a.id);
        assert.ok(icons[a.id], `アイコンがない: ${a.id}`);
        for (const e of a.effects) assert.ok(!effectText(e).includes('undefined') && effectText(e) !== e.type, `説明文がない: ${a.id}`);
    }
});

test('持つ・着ける・外す', async (t) => {
    await t.test('持っていないものは着けられない', async () => {
        const { g, popups } = await engine();
        assert.equal(g.player.equip.accessory, null);
        assert.equal(g.equipAccessory('ruby'), false);
        assert.ok(popups.includes('まだ持っていません'));
    });
    await t.test('giveAllAccessories で全部持ち、着ける・外す・未定義は断る', async () => {
        const { g } = await engine();
        g.giveAllAccessories();
        assert.equal(g.player.accessories.length, equipment.accessories.length);
        assert.equal(g.equipAccessory('ruby'), true);
        assert.equal(g.player.equip.accessory, 'ruby');
        assert.equal(g.accessoryEffects()[0].type, 'nullElement');
        assert.equal(g.equipAccessory('no_such'), false);
        assert.equal(g.equipAccessory(null), true);
        assert.deepEqual(g.accessoryEffects(), []);
    });
});

test('保存と読み込み', async (t) => {
    await t.test('持っているアクセサリと着けているアクセサリが、往復で戻る', async () => {
        const { g } = await engine();
        g.player.accessories = ['ruby', 'coral'];
        g.equipAccessory('coral');
        const data = JSON.parse(JSON.stringify(g.buildSaveData()));
        assert.equal(data.equipment.accessory, 'coral');
        assert.deepEqual(data.accessories, ['ruby', 'coral']);
        const { g: g2 } = await engine();
        g2.applySaveData(data);
        assert.deepEqual(g2.player.accessories, ['ruby', 'coral']);
        assert.equal(g2.player.equip.accessory, 'coral');
    });
    await t.test('持っていない・定義にないアクセサリは、捨てる', async () => {
        const { g } = await engine();
        const data = JSON.parse(JSON.stringify(g.buildSaveData()));
        data.accessories = ['ruby', 'no_such'];
        data.equipment.accessory = 'coral';   // 持っていない
        g.applySaveData(data);
        assert.deepEqual(g.player.accessories, ['ruby']);
        assert.equal(g.player.equip.accessory, null);
    });
});

test('保存データの検証（validates/character.js）', async () => {
    const schema = (await import('../validates/character.js')).default ?? (await import('../validates/character.js'));
    const data = (over) => ({ name: 'a', status: 'confirmed', rev: 1, data: { profile: { name: 'a', race: 'human', createdAt: 'x' }, abilities: {}, jobs: { primary: 'fighter', sub: null, levels: { fighter: 1 }, expStock: 0 }, ...over } });
    const check = (over) => schema.data.custom(data(over).data, data(over));
    assert.equal(check({ equipment: { accessory: 'ruby' }, accessories: ['ruby'] }), true);
    assert.notEqual(check({ equipment: { accessory: 'no_such' } }), true);
    assert.notEqual(check({ accessories: ['ruby', 'ruby'] }), true);
    assert.notEqual(check({ accessories: ['no_such'] }), true);
});

test('効果（能力値・最大MP・速さ・回復・状態異常の無効・呪文）', async (t) => {
    const wear = async (id) => { const { g } = await engine(); g.giveAllAccessories(); return { g, base: await engine(), ok: g.equipAccessory(id) }; };
    await t.test('能力値 +1 は、計算に入り、基本値は変わらない', async () => {
        const { g } = await wear('garnet');
        assert.equal(g.effAbilities().str, g.player.abilities.str + 1);
        assert.equal(g.player.abilities.str, playerDef.abilities.str);
    });
    await t.test('サファイア: 最大MPが 20% 上がる（最低 +10）', async () => {
        const { g, base } = await wear('sapphire');
        assert.ok(g.player.maxMp >= base.g.player.maxMp + 10);
        assert.equal(g.player.maxMp, base.g.player.maxMp + Math.max(10, Math.floor(base.g.player.maxMp * 0.2)));
    });
    await t.test('ペリドット: 歩く速さ・ダッシュが 10% 上がる', async () => {
        const { g, base } = await wear('peridot');
        assert.ok(Math.abs(g.player.speed - base.g.player.speed * 1.1) < 1e-9);
        assert.ok(Math.abs(g.player.runSpeed - base.g.player.runSpeed * 1.1) < 1e-9);
    });
    await t.test('珊瑚: 3 秒ごとに最大HPの 2%（最低 1）回復する', async () => {
        const { g } = await wear('coral');
        g.player.hp = 1;
        g.updateAccessoryRegen(2.9);
        assert.equal(g.player.hp, 1);
        g.updateAccessoryRegen(0.2);
        assert.equal(g.player.hp, 1 + Math.max(1, Math.floor(g.player.maxHp * 0.02)));
    });
    await t.test('アレキサンドライト: HP と MP が回復する', async () => {
        const { g } = await wear('alexandrite');
        g.player.hp = 1; g.player.mp = 0;
        g.updateAccessoryRegen(3);
        assert.equal(g.player.hp, 1 + Math.max(1, Math.floor(g.player.maxHp * 0.03)));
        assert.equal(g.player.mp, Math.max(1, Math.floor(g.player.maxMp * 0.02)));
    });
    await t.test('蛇紋石・トルマリン: 毒・麻痺にならない（ほかは、なる）', async () => {
        const { g } = await wear('serpentine');
        assert.equal(g.applyPlayerStatus('poison', { t: 5 }), false);
        assert.equal(g.player.status.poison, undefined);
        assert.equal(g.applyPlayerStatus('paralysis', { t: 1 }), true);
        g.equipAccessory('tourmaline');
        g.player.status = {};
        assert.equal(g.applyPlayerStatus('paralysis', { t: 1 }), false);
        assert.equal(g.applyPlayerStatus('poison', { t: 5 }), true);
    });
    await t.test('タンザナイト: 消費MPが半分。ジェット: 威力が半分・消費MPが 1/4', async () => {
        const spell = (await engine()).g.items.fire;
        const base = (await engine()).g.spellCost(spell);
        const tz = await wear('tanzanite');
        assert.equal(tz.g.spellCost(spell), Math.max(1, base * 0.5));
        const jt = await wear('jet');
        assert.equal(jt.g.spellCost(spell), Math.max(1, base * 0.25));
        assert.equal(jt.g.accSpellPower(10), 5);
        assert.equal(jt.g.accSpellPower(1), 1, '最低 1');
    });
});
