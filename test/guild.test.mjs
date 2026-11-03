import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const readJson = (f) => JSON.parse(fs.readFileSync(path.join(root, f), 'utf-8'));
const objects = readJson('public/data/objects.json');
const npcs = readJson('public/data/npcs.json');
const shops = readJson('public/data/shops.json');
const city = readJson('public/data/maps/city.json');
const slum = readJson('public/data/maps/city_slum.json');
const cityOf = (id) => (id === 'guild_thief' ? slum : city);   // 盗賊ギルドは、どや街
const GUILDS = { guild_adv: ['adv_guild_master', 'adv_clerk_man', 'adv_clerk_woman'], guild_mage: ['mage_guild_master', 'mage_clerk_woman', 'mage_clerk_man'], guild_merchant: ['merchant_master_man', 'merchant_master_woman'], guild_training: ['trainer'], guild_smith: ['dwarf_smith'], guild_thief: ['thief_guild_master', 'thief_guild_leader', 'thief_guild_member'] };

test('ギルド系の建物: 街の扉から入れ、出口で扉の前へ戻る。盗賊ギルドの扉だけ、看板がなく壁と同じ見た目（隠し扉）', () => {
    for (const id of Object.keys(GUILDS)) {
        const m = readJson(`public/data/maps/${id}.json`);
        assert.ok(Object.values(m.legend).some(v => objects[v]?.nextMap === '$back'), `${id}: 出口`);
        const entries = Object.entries(cityOf(id).links).filter(([, l]) => l.nextMap === id);
        assert.equal(entries.length, 1, `${id}: 街の扉は1つ`);
        const [c, r] = entries[0][0].split(',').map(Number);
        assert.equal(objects[cityOf(id).legend[cityOf(id).layout[r][c]]].type, 'door');
    }
    const [tk] = Object.entries(slum.links).find(([, l]) => l.nextMap === 'guild_thief');
    const [tc, tr] = tk.split(',').map(Number);
    assert.equal(slum.legend[slum.layout[tr][tc]], 'thief_door');
    assert.equal(objects.thief_door.texture, objects.shop_building.texture, '壁と同じ見た目');
});

test('ギルド系の建物: 窓口の NPC は建物の中にいて、街の道には残っていない。窓口の人は動かない', () => {
    for (const [id, who] of Object.entries(GUILDS)) {
        const m = readJson(`public/data/maps/${id}.json`);
        const ids = m.npcs.map(n => n.id);
        for (const w of who) {
            assert.ok(npcs[w], `${w}: NPC定義`);
            assert.ok(ids.includes(w), `${id}: ${w}`);
            assert.ok(![city, slum].some(c => c.npcs.some(n => n.id === w) && w !== 'thief_guild_member'), `${w}: 街の道には置かない`);
        }
        const boss = m.npcs[0];
        assert.equal(boss.speed, 0, `${id}: 窓口は動かない`);
    }
});

test('ギルド系の建物: 魔法ギルドは、魔法の店（shops.json の magic_guild）の窓口を開く', () => {
    const m = readJson('public/data/maps/guild_mage.json');
    const k = m.npcs.find(n => n.shopId);
    assert.equal(k.shopId, 'magic_guild');
    assert.equal(shops.magic_guild.keeper, k.id);
});
