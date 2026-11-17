// ユーザー（lib/userAuth.js）のテスト: 登録・ログイン照合・パスワード変更・アカウント削除（一時ファイルの DB）
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { Database } from 'bun:sqlite';

const require = createRequire(import.meta.url);
const auth = require(path.join(process.cwd(), 'lib/userAuth.js'));
auth.config.iterations = 2000;   // テストでは、反復回数を小さくする（本番は 20 万回）
const store = require(path.join(process.cwd(), 'lib/characterStore.js'));
const validates = require(path.join(process.cwd(), 'validates/register.js'));
const validatePath = path.join(process.env.MAACHANG_HOME ?? '/home/maachang/project/maachang', 'modules/validate/validate.js');
const hasValidate = fs.existsSync(validatePath);

test('ユーザー: 登録・ログイン照合・パスワード変更・削除', async (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'users-'));
    const db = path.join(dir, 'rpg.db');
    let id;
    await t.test('登録できる。メールアドレスは、小文字・前後の空白なしにする。パスワードは、保存しない', () => {
        const r = auth.createUser('  Taro@Example.COM ', 'correct-horse-1', db);
        assert.equal(r.ok, true);
        assert.equal(r.user.email, 'taro@example.com');
        id = r.user.id;
        const row = new Database(db).query('SELECT * FROM users').get();
        assert.ok(!JSON.stringify(row).includes('correct-horse-1'));
        assert.equal(row.pw_iter, 2000);
        assert.match(row.pw_hash, /^[0-9a-f]{64}$/);
    });
    await t.test('同じメールアドレスは、大文字小文字が違っても、重複として断る', () => {
        assert.deepEqual(auth.createUser('TARO@example.com', 'another-pass-2', db), { ok: false, duplicate: true });
    });
    await t.test('ログインの照合: 合っていれば本人、違えば null（存在しないメールも null）', () => {
        assert.equal(auth.verifyLogin('taro@example.com', 'correct-horse-1', db).id, id);
        assert.equal(auth.verifyLogin('TARO@example.com ', 'correct-horse-1', db).id, id);
        assert.equal(auth.verifyLogin('taro@example.com', 'wrong', db), null);
        assert.equal(auth.verifyLogin('nobody@example.com', 'correct-horse-1', db), null);
    });
    await t.test('パスワード変更: 現在のパスワードが違えば断り、合っていれば新しい方でログインできる', () => {
        assert.deepEqual(auth.changePassword(id, 'wrong', 'new-password-3', db), { ok: false, wrong: true });
        assert.equal(auth.verifyLogin('taro@example.com', 'correct-horse-1', db).id, id, '変わらない');
        assert.deepEqual(auth.changePassword(id, 'correct-horse-1', 'new-password-3', db), { ok: true });
        assert.equal(auth.verifyLogin('taro@example.com', 'correct-horse-1', db), null);
        assert.equal(auth.verifyLogin('taro@example.com', 'new-password-3', db).id, id);
        assert.deepEqual(auth.changePassword('no-such-user', 'x', 'y', db), { ok: false, wrong: true });
    });
    await t.test('アカウント削除: パスワードが違えば断る。削除すると、冒険者・セーブ履歴も消え、他のユーザーには触れない', () => {
        const other = auth.createUser('hanako@example.com', 'hanako-pass-4', db).user;
        const body = { name: '冒険者', status: 'creating', rev: 1, data: { gold: 5 } };
        assert.equal(store.save(id, body, db).ok, true);
        assert.equal(store.save(other.id, body, db).ok, true);
        assert.deepEqual(auth.deleteUser(id, 'wrong', db), { ok: false, wrong: true });
        assert.ok(store.load(id, db), 'まだ消えない');
        assert.deepEqual(auth.deleteUser(id, 'new-password-3', db), { ok: true });
        assert.equal(auth.findByEmail('taro@example.com', db), null);
        assert.equal(store.load(id, db), null);
        const d = new Database(db);
        assert.equal(d.query('SELECT COUNT(*) AS n FROM character_saves WHERE user_id = ?').get(id).n, 0);
        assert.ok(store.load(other.id, db), '他のユーザーの冒険者は残る');
        assert.equal(auth.verifyLogin('hanako@example.com', 'hanako-pass-4', db).id, other.id);
    });
    fs.rmSync(dir, { recursive: true, force: true });
});

test('入力の検証（validates/register.js）', { skip: !hasValidate && 'validate.js が見つからない' }, () => {
    const validate = require(validatePath);
    const ok = (schema, body) => validate.check(body, schema).valid;
    assert.equal(ok(validates.register, { email: 'a@example.com', password: '12345678' }), true);
    assert.equal(ok(validates.register, { email: 'not-mail', password: '12345678' }), false);
    assert.equal(ok(validates.register, { email: 'a@example.com', password: '1234567' }), false, '8 文字未満');
    assert.equal(ok(validates.register, { email: 'a@example.com', password: 'x'.repeat(129) }), false);
    assert.equal(ok(validates.register, { email: 'a@example.com' }), false);
    assert.equal(ok(validates.login, { email: 'whatever', password: 'p' }), true, 'ログインは、形式で断らない');
    assert.equal(ok(validates.changePassword, { current: 'old', next: 'short' }), false);
    assert.equal(ok(validates.changePassword, { current: 'old', next: 'long-enough-1' }), true);
    assert.equal(ok(validates.deleteAccount, { password: 'p' }), true);
    assert.equal(ok(validates.deleteAccount, {}), false);
});
