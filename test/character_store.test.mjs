// 冒険者の保存・読み込み（lib/characterStore.js）のテスト。一時ファイルの DB で、スコープ・rev・履歴を確かめる
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const store = require(path.join(process.cwd(), 'lib/characterStore.js'));
const body = (rev, stock) => ({ name: 'テスト', status: 'creating', rev, data: { stock: stock ?? { slots: ['dagger', null, null, null, null, null, null, null, null], melee: 0 } } });

test('冒険者の保存・読み込み', async (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rpgdb-'));
    const db = path.join(dir, 'rpg.db');
    await t.test('最初は、冒険者がいない', () => assert.equal(store.load('u1', db), null));
    await t.test('新規は rev 1 で保存でき、読み込める', () => {
        assert.deepEqual(store.save('u1', body(1), db), { ok: true, rev: 1 });
        const c = store.load('u1', db);
        assert.equal(c.rev, 1);
        assert.equal(c.data.stock.slots[0], 'dagger');
    });
    await t.test('別のユーザーからは見えない', () => assert.equal(store.load('u2', db), null));
    await t.test('rev が違うと断り、合っていれば rev が増える', () => {
        assert.equal(store.save('u1', body(5), db).conflict, true);
        assert.deepEqual(store.save('u1', body(1, { slots: [null, 'fire', null, null, null, null, null, null, null], magic: 1 }), db), { ok: true, rev: 2 });
        assert.equal(store.load('u1', db).data.stock.magic, 1);
    });
    await t.test('送られなかった項目は、前の値のまま残る', () => {
        const b = body(2); b.data = { gold: 10 };
        assert.deepEqual(store.save('u1', b, db), { ok: true, rev: 3 });
        const c = store.load('u1', db);
        assert.equal(c.data.gold, 10);
        assert.equal(c.data.stock.magic, 1);
    });
    await t.test('別のユーザーの新規保存は、他人の冒険者に触れない', () => {
        assert.equal(store.save('u2', body(1), db).ok, true);
        assert.equal(store.load('u1', db).rev, 3);
    });
    await t.test('履歴は、直近 5 回分だけ残る', () => {
        for (let r = 3; r < 12; r++) assert.equal(store.save('u1', body(r), db).ok, true);
        const { Database } = require('bun:sqlite');
        const n = new Database(db).query('SELECT COUNT(*) AS n FROM character_saves WHERE user_id = ?').get('u1').n;
        assert.equal(n, store.KEEP_SAVES);
    });
    fs.rmSync(dir, { recursive: true, force: true });
});
