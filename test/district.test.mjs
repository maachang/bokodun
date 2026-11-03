import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const readJson = (f) => JSON.parse(fs.readFileSync(path.join(root, f), 'utf-8'));
const objects = readJson('public/data/objects.json');
const npcs = readJson('public/data/npcs.json');
const D = Object.fromEntries(['city', 'city_noble', 'city_slum', 'castle'].map(id => [id, readJson(`public/data/maps/${id}.json`)]));
const used = (m) => new Set([...new Set(m.layout.join(''))].map(ch => m.legend?.[ch]));

test('区画: 一般街・貴族街・どや街は、今までの街（64×64）より小さい。王城は貴族街の先', () => {
    for (const id of ['city', 'city_noble', 'city_slum']) {
        const m = D[id];
        assert.ok(m.layout.length * m.layout[0].length < 64 * 64 / 2, `${id}: 小さい`);
        assert.equal(m.type, 'open');
    }
    assert.equal(D.castle.nextMap, 'city_noble');
    assert.ok(Object.values(D.city_noble.links).some(l => l.nextMap === 'castle'), '貴族街に城門');
});

test('区画: 一般街→貴族街、一般街→どや街は、門で行き来でき、出現位置が通れる', () => {
    const gate = (from, to) => Object.entries(D[from].links).filter(([, l]) => l.nextMap === to && l.spawn);
    for (const [a, b] of [['city', 'city_noble'], ['city', 'city_slum']]) {
        assert.ok(gate(a, b).length >= 1 && gate(b, a).length >= 1, `${a}⇔${b}`);
        for (const [key] of gate(a, b)) {
            const [c, r] = key.split(',').map(Number);
            assert.equal(objects[D[a].legend[D[a].layout[r][c]]].type, 'door');
        }
    }
    assert.ok(!Object.values(D.city_noble.links).some(l => l.nextMap === 'city_slum'), '貴族街とどや街は、直接つながらない');
});

test('区画: 盗賊ギルドは、どや街。一般街には、ギルド系は冒険者・魔法・商人・訓練所・鍛冶屋', () => {
    assert.ok(Object.values(D.city_slum.links).some(l => l.nextMap === 'guild_thief'));
    assert.ok(![...used(D.city)].includes('thief_door'));
    const dests = new Set(Object.values(D.city.links).map(l => l.nextMap));
    for (const g of ['guild_adv', 'guild_mage', 'guild_merchant', 'guild_training', 'guild_smith', 'temple']) assert.ok(dests.has(g), g);
});

test('区画: 貴族は貴族街に、一般の住人は一般街にいる（NPC の置き場）', () => {
    const ids = (m) => m.npcs.map(n => n.id);
    for (const n of ['duke_man', 'duke_woman', 'margrave_man', 'marquis_man', 'viscount_man', 'baron_man']) {
        assert.ok(ids(D.city_noble).includes(n), n);
        assert.ok(!ids(D.city).includes(n), `${n}: 一般街にはいない`);
    }
    for (const m of Object.values(D)) for (const n of m.npcs ?? []) assert.ok(npcs[n.id], n.id);
});

test('区画: 貴族街の公爵の屋敷の扉から、屋敷に入れる。入場の条件（requires）は、まだデータに書かない', () => {
    assert.ok(Object.values(D.city_noble.links).some(l => l.nextMap === 'mansion'));
    for (const m of Object.values(D)) for (const l of Object.values(m.links ?? {})) assert.equal(l.requires, undefined, '条件の動作は未実装なので、データには書かない');
});

test('貴族街: 王城（北の城門）に近いほど、高い階級の貴族が住む（公爵 < 辺境伯 < 侯爵 < 子爵 < 男爵 の順に、北から南へ）', () => {
    const z = (id) => D.city_noble.npcs.find(n => n.id === id).z;
    const order = ['duke_man', 'margrave_man', 'marquis_man', 'viscount_man', 'baron_man'].map(z);
    for (let i = 1; i < order.length; i++) assert.ok(order[i] > order[i - 1], `階級の順: ${order}`);
});

test('一般街: 市場に、日よけの屋根つきの露店（野外用）が並ぶ', () => {
    const stalls = [...D.city.layout.join('')].filter(ch => objects[D.city.legend[ch]]?.id === undefined && D.city.legend[ch]?.startsWith('market_stall'));
    assert.ok(stalls.length >= 8, `露店の数: ${stalls.length}`);
    for (const id of Object.keys(objects).filter(k => k.startsWith('market_stall'))) {
        const d = objects[id];
        assert.equal(d.type, 'furniture');
        assert.ok(d.parts.some(p => p.size[0] > 3 && p.size[1] < 0.3 && p.pos[1] > 2), `${id}: 簡易屋根`);
        assert.equal(d.ceilingTexture, undefined, `${id}: 野外なので天井は付けない`);
    }
});

test('どや街: 汚水の水路（毒沼と同じ）が橋で渡れ、怪しい酒場にアサシンとシーフがいる。ならず者がうろつく', () => {
    const slum = D.city_slum, ids = used(slum);
    assert.ok(ids.has('poison_swamp') && ids.has('wood_bridge'));
    assert.ok(objects.poison_swamp.damagePerSec > 0);
    const bar = readJson('public/data/maps/slum_bar.json');
    const barIds = bar.npcs.map(n => n.id);
    assert.ok(barIds.includes('assassin_npc') && barIds.includes('thief_npc'));
    assert.ok(slum.npcs.some(n => n.id === 'thug_npc'));
    assert.ok(Object.values(slum.links).some(l => l.nextMap === 'slum_bar'));
    for (const id of ['assassin_npc', 'thief_npc', 'thug_npc']) assert.ok(fs.existsSync(path.join(root, 'public', npcs[id].texture)), `${id}: 画像`);
});
