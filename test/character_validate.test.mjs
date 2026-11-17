// 冒険者の保存データの検証（validates/character.js）と、保存のテーブル定義（schema/rpg.sql）のテスト
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { Database } from 'bun:sqlite';

const require = createRequire(import.meta.url);
const root = process.cwd();
const validatePath = path.join(process.env.MAACHANG_HOME ?? '/home/maachang/project/maachang', 'modules/validate/validate.js');
const hasValidate = fs.existsSync(validatePath);
const schema = require(path.join(root, 'validates/character.js'));
const validate = hasValidate ? require(validatePath) : null;

// 確定済みの冒険者の、正しい保存データ
const good = () => ({
    name: 'テスト', status: 'confirmed', rev: 1,
    data: {
        profile: { name: 'テスト', race: 'human', createdAt: '2026-11-15T14:32:00Z' },
        abilities: { dex: 12, agi: 13, str: 14, vit: 15, intel: 11, mnd: 10, end: 12 },
        jobs: { primary: 'fighter', sub: 'sorcerer', levels: { fighter: 12, sorcerer: 5 }, expStock: 0 },
        vitals: { hp: 96, mp: 40 }, gold: 1240, exp: 3580,
        inventory: { fists: 1 },
        equipment: { weapon: { id: 'dagger', weight: 5 }, armor: 'leather_armor', helm: null, shield: null, accessory: null },
        stock: { slots: ['dagger', null, null, 'fire', 'magic_staff', null, null, null, null], melee: 0, focus: 4, magic: 3 },
        magics: ['fire', 'magic_bolt'], autoUse: {},
        quest: { current: { id: 'herb_01', acceptedAt: 100, place: '城下町の宿屋', progress: 3 }, done: [] },
        world: { gameTime: 5000, chests: { 'city:chest_1': 4000 }, bosses: {} },
        guild: { lastId: 'city_guild', storage: {} }, playTime: 3600
    }
});
const check = (body) => validate.check(body, schema);
const errOf = (body) => check(body).errors.map(e => e.message).join(' / ');

test('冒険者の保存データの検証', { skip: !hasValidate && 'validate.js が見つからない' }, async (t) => {
    await t.test('正しいデータは通る', () => {
        const r = check(good());
        assert.deepEqual(r.errors, []);
        assert.equal(r.valid, true);
    });
    await t.test('作成中は、中身が一部でもよい', () => {
        const r = check({ name: 'テスト', status: 'creating', rev: 1, data: { profile: good().data.profile, creation: { a: 3, b: 4, c: 5, d: 6, bonus: 4 } } });
        assert.deepEqual(r.errors, []);
    });
    await t.test('確定済みで、必要な項目が欠けると断る', () => {
        const b = good(); delete b.data.abilities;
        assert.match(errOf(b), /abilities/);
    });
    await t.test('未知のキー・範囲外・定義にない ID・重複を断る', () => {
        const cases = [
            [b => { b.data.cheat = 1; }, /未知のキー/],
            [b => { b.data.abilities.str = 51; }, /abilities\.str/],
            [b => { b.data.jobs.levels.fighter = 100; }, /レベルが範囲外/],
            [b => { b.data.jobs.sub = 'fighter'; }, /サブ職業/],
            [b => { b.data.inventory.no_such_item = 1; }, /定義にない/],
            [b => { b.data.inventory.fists = 100; }, /個数が範囲外/],
            [b => { b.data.equipment.armor = 'dagger'; }, /定義にない/],
            [b => { b.data.equipment.weapon.weight = 99; }, /重さ/],
            [b => { b.data.stock.slots.push(null); }, /9 枠/],
            [b => { b.data.stock.slots[1] = 'dagger'; }, /重複/],
            [b => { b.data.stock.slots[5] = 'explosion'; }, /覚えていない/],
            [b => { b.data.stock.slots[5] = 'herb'; }, /入れられない/],
            [b => { b.data.stock.slots[5] = 'no_such'; }, /入れられない/],
            [b => { b.data.stock.melee = 3; }, /選択中の枠/],
            [b => { b.data.stock.focus = 0; }, /選択中の枠/],
            [b => { b.data.stock.magic = 4; }, /選択中の枠/],
            [b => { b.data.stock.weapon = 0; }, /未知のキー/],
            [b => { b.data.profile.race = 'robot'; }, /種族/],
            [b => { b.data.world.chests = { '../x': 1 }; }, /キーの形式/],
            [b => { b.data.quest.current.acceptedAt = -1; }, /日時/],
            [b => { b.data.gold = 1.5; }, /所持金/],
            [b => { b.rev = 0; }, /rev/],
            [b => { b.status = 'dead'; }, /状態/]
        ];
        for (const [mutate, re] of cases) {
            const b = good(); mutate(b);
            assert.match(errOf(b), re, String(mutate));
        }
    });
    await t.test('data が大きすぎると断る', () => {
        const b = good(); b.data.world.chests = Object.fromEntries(Array.from({ length: 4900 }, (_, i) => [`m${i}:chest_${'x'.repeat(60)}`.slice(0, 80), 1]));
        assert.match(errOf(b), /大きすぎ|件数/);
    });
});

test('schema/rpg.sql（SQLite）', async (t) => {
    const db = new Database(':memory:');
    db.exec(fs.readFileSync(path.join(root, 'schema/rpg.sql'), 'utf8'));
    const now = new Date().toISOString();

    await t.test('3 つのテーブルができ、2 回流しても落ちない', () => {
        db.exec(fs.readFileSync(path.join(root, 'schema/rpg.sql'), 'utf8'));
        const names = db.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r => r.name);
        assert.deepEqual(names, ['character_saves', 'characters', 'user_settings']);
    });
    await t.test('JSON でない data・不正な status は断る。同じユーザーに複数の行を持てる（人数はアプリ側の制限）', () => {
        const ins = (data, status = 'creating') => db.run("INSERT INTO characters (user_id, name, status, data, created_at, updated_at) VALUES ('u1', 'a', ?, ?, ?, ?)", [status, data, now, now]);
        assert.throws(() => ins('これはJSONではない'));
        assert.throws(() => ins('{}', 'dead'));
        ins('{}'); ins('{}');
        assert.equal(db.query("SELECT COUNT(*) AS n FROM characters WHERE user_id = 'u1'").get().n, 2);
    });
    await t.test('既定値: schema_version=1・rev=1・level=1', () => {
        const r = db.query("SELECT schema_version, rev, level FROM characters LIMIT 1").get();
        assert.deepEqual({ ...r }, { schema_version: 1, rev: 1, level: 1 });
    });
    await t.test('履歴・設定の表も、JSON でない data を断る', () => {
        assert.throws(() => db.run("INSERT INTO character_saves (user_id, character_id, rev, schema_version, data, saved_at) VALUES ('u1', 1, 1, 1, 'x', ?)", [now]));
        assert.throws(() => db.run("INSERT INTO user_settings (user_id, data, updated_at) VALUES ('u1', 'x', ?)", [now]));
        db.run("INSERT INTO user_settings (user_id, data, updated_at) VALUES ('u1', '{\"keys\":{}}', ?)", [now]);
    });
});
