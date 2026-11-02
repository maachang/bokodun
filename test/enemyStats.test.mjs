import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const readJson = (f) => JSON.parse(fs.readFileSync(path.join(root, 'public/data', f), 'utf-8'));
const enemies = readJson('enemies.json');
const ranks = readJson('enemyRanks.json');

// 仕様書 6章「特殊能力」の一覧
const ABILITIES = new Set([
    'fatigue', 'exhaust', 'regen', 'drain', 'lastStand', 'revive', 'armorBreak', 'enrage',
    'poison', 'venom', 'paralysis', 'slow', 'burn', 'curse', 'silence', 'blind',
    'fly', 'burrow', 'teleport', 'charge', 'summon', 'split', 'flee', 'ambush',
    'ranged', 'breath', 'aoe', 'knockback', 'pull', 'reflect', 'barrier', 'evasion',
    'pack', 'rare', 'sticky', 'stealItem'
]);

test('敵のランク・系統・特殊能力・stats が全102体に揃っている', () => {
    const list = Object.entries(enemies);
    assert.equal(list.length, 102);
    for (const [id, e] of list) {
        assert.ok(ranks.ranks[String(e.rank)], `${id}: rank ${e.rank} が表にある`);
        assert.ok(ranks.families[e.family], `${id}: family ${e.family} が表にある`);
        assert.equal(typeof e.boss, 'boolean', `${id}: boss`);
        assert.ok(Array.isArray(e.abilities), `${id}: abilities`);
        const max = e.boss ? 4 : 2;
        assert.ok(e.abilities.length <= max, `${id}: 特殊能力は最大${max}つ（${e.abilities.length}）`);
        for (const a of e.abilities) assert.ok(ABILITIES.has(a), `${id}: 未定義の能力 ${a}`);
        const s = e.stats;
        assert.ok(s && s.hp > 0 && s.exp > 0, `${id}: stats`);
        assert.ok(s.attack.weight >= 1 && s.attack.weight <= 50, `${id}: 攻撃の重さ`);
        assert.equal(s.level, ranks.ranks[String(e.rank)].level, `${id}: level`);
    }
});

test('ボスは27体で、HP倍率が仕様どおり（中ボス3 / 通常5 / 竜・エンペラー級8）', () => {
    const bosses = Object.entries(enemies).filter(([, e]) => e.boss);
    assert.equal(bosses.length, 27);
    assert.equal(bosses.filter(([, e]) => e.stats.hpMul === 3).length, 2);
    assert.equal(bosses.filter(([, e]) => e.stats.hpMul === 8).length, 10);
    assert.equal(bosses.filter(([, e]) => e.stats.hpMul === 5).length, 15);
});

test('攻撃の期待値が、ランクの目標（系統補正後）に近い', () => {
    for (const [id, e] of Object.entries(enemies)) {
        const target = ranks.ranks[String(e.rank)].attack * ranks.families[e.family].attack;
        assert.ok(Math.abs(e.stats.attack.expected - target) <= 0.6, `${id}: ${e.stats.attack.expected} vs ${target}`);
    }
});
