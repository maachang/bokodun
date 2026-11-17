// 冒険者の作成（create.html・/api/create・lib/gameRules.js）: 仕様 character-spec 4 章
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const read = (f) => fs.readFileSync(path.join(process.cwd(), f), 'utf8');
const validatePath = path.join(process.env.MAACHANG_HOME ?? '/home/maachang/project/maachang', 'modules/validate/validate.js');
const hasValidate = fs.existsSync(validatePath);

test('サーバー側でも、クライアントと同じ式で検証できる（lib/gameRules.js）', async () => {
    const { R, defs } = await require(path.join(process.cwd(), 'lib/gameRules.js')).load();
    assert.equal(typeof R.validateCreation, 'function');
    assert.equal(Object.keys(defs.races).length, 8);
    const base = R.makeAbilities(defs, 'human', 6, 7, 8, 9, 0);
    assert.equal(R.validateCreation(defs, { race: 'human', a: 6, b: 7, c: 8, d: 9, bonus: 3, abilities: { ...base, str: base.str + 3 }, job: 'fighter' }), null);
    assert.match(R.validateCreation(defs, { race: 'human', a: 6, b: 7, c: 8, d: 9, bonus: 3, abilities: { ...base, str: base.str + 4 }, job: 'fighter' }), /ボーナス値/);
    // 作成で選べる職業は、基本の戦闘職 4 つ
    assert.deepEqual(R.CREATION_JOBS, ['fighter', 'thief', 'sorcerer', 'priest']);
    for (const j of R.CREATION_JOBS) assert.ok(defs.jobs[j].tier === 'base' && defs.jobs[j].type === 'combat', j);
});

test('作成の API: ログイン必須・CSRF・検証・二重確定の防止・確定で保存', () => {
    const s = read('public/api/create.mt.js');
    assert.ok(s.includes('web.currentUser(') && s.includes('401'));
    assert.ok(s.includes('web.csrfOk('));
    assert.ok(s.includes('validateCreation('), 'サーバーでも、能力値の整合を検証する');
    assert.ok(s.includes("cur.status === 'confirmed'") && s.includes('409'), '確定後は、やり直せない（二重確定の防止）');
    assert.ok(s.includes("status: 'confirmed'"));
    assert.ok(!/\$request\.(body|query)\??\.(userId|user_id)/.test(s));
});

test('作成の入力の検証（validates/create.js）と、確定済みの必須項目', { skip: !hasValidate && 'validate.js が見つからない' }, () => {
    const validate = require(validatePath);
    const schema = require(path.join(process.cwd(), 'validates/create.js'));
    const ok = { name: '太郎', race: 'human', job: 'fighter', a: 6, b: 7, c: 8, d: 9, bonus: 5, abilities: { dex: 13 } };
    assert.equal(validate.check(ok, schema).valid, true);
    for (const bad of [{ name: '' }, { name: 'x'.repeat(51) }, { race: 'Bad Race' }, { bonus: 'x' }, { abilities: null }, { a: undefined }]) {
        assert.equal(validate.check({ ...ok, ...bad }, schema).valid, false, JSON.stringify(bad));
    }
    // 確定済みの保存に必要なのは、作成で決まる項目（profile・abilities・jobs）
    const charSchema = require(path.join(process.cwd(), 'validates/character.js'));
    const data = { profile: { name: '太郎', race: 'human', createdAt: '2026-11-18T00:00:00Z' }, abilities: { dex: 13, agi: 14, str: 18, vit: 15, intel: 17, mnd: 15, end: 15 }, jobs: { primary: 'fighter', sub: null, levels: { fighter: 1 }, expStock: 0 } };
    assert.equal(validate.check({ name: '太郎', status: 'confirmed', rev: 1, data }, charSchema).valid, true);
    assert.equal(validate.check({ name: '太郎', status: 'confirmed', rev: 1, data: { ...data, jobs: undefined } }, charSchema).valid, false);
});

test('ゲームの入口: 冒険者が未作成なら、作成の画面へ。作成の画面は、作成済みならゲームへ', () => {
    const idx = read('public/index.html');
    assert.ok(idx.includes('/create.html') && idx.includes("status !== 'confirmed'"));
    const c = read('public/create.html');
    assert.ok(c.includes('/api/create') && c.includes('data-stop') && c.includes('validateCreation'));
    assert.ok(c.includes("status === 'confirmed'") && c.includes("location.replace('/')"), '作成済みは、ゲームへ');
    assert.ok(c.includes('/jhtml.browser.js'));
    assert.ok(read('public/js/game/saveLoad.js').includes("status: 'confirmed'"), '作成後の保存は、確定済み');
    for (const [k, v] of [['MEASURE_MIN', 1], ['MEASURE_MAX', 12.5]]) assert.ok(new RegExp(`${k} = ${v}`).test(read('public/js/game/rules.js')), k);
});
