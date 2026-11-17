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
        const r = auth.createUser('  Taro@Example.COM ', 'correct-horse-1', 'blue-kw-1', db);
        assert.equal(r.ok, true);
        assert.equal(r.user.email, 'taro@example.com');
        id = r.user.id;
        const row = new Database(db).query('SELECT * FROM users').get();
        assert.ok(!JSON.stringify(row).includes('correct-horse-1'));
        assert.equal(row.pw_iter, 2000);
        assert.match(row.pw_hash, /^[0-9a-f]{64}$/);
    });
    await t.test('同じメールアドレスは、大文字小文字が違っても、重複として断る', () => {
        assert.deepEqual(auth.createUser('TARO@example.com', 'another-pass-2', 'kw-other', db), { ok: false, duplicate: true });
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
        const other = auth.createUser('hanako@example.com', 'hanako-pass-4', 'kw-hanako', db).user;
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
    const reg = (o) => ({ email: 'a@example.com', password: '12345678', keyword: 'blue-kw', ...o });
    assert.equal(ok(validates.register, reg({})), true);
    assert.equal(ok(validates.register, reg({ email: 'not-mail' })), false);
    assert.equal(ok(validates.register, reg({ password: '1234567' })), false, '8 文字未満');
    assert.equal(ok(validates.register, reg({ password: 'x'.repeat(129) })), false);
    assert.equal(ok(validates.register, { email: 'a@example.com', password: '12345678' }), false, 'キーワードは必須');
    assert.equal(ok(validates.register, reg({ keyword: 'abc' })), false, 'キーワードは 4 文字以上');
    assert.equal(ok(validates.register, reg({ keyword: 'x'.repeat(65) })), false);
    assert.equal(ok(validates.register, reg({ keyword: '12345678' })), false, 'パスワードと同じキーワードは不可');
    assert.equal(ok(validates.register, reg({ keyword: ' 12345678 ' })), false, '前後の空白を除いて、同じでも不可');
    assert.equal(ok(validates.reset, { email: 'a@example.com', keyword: 'k', next: 'long-enough-1' }), true, '再設定は、キーワードの長さで断らない');
    assert.equal(ok(validates.reset, { email: 'a@example.com', keyword: 'k', next: 'short' }), false);
    assert.equal(ok(validates.changeKeyword, { password: 'p', keyword: 'new-keyword' }), true);
    assert.equal(ok(validates.changeKeyword, { password: 'p', keyword: 'p' }), false);
    assert.equal(ok(validates.login, { email: 'whatever', password: 'p' }), true, 'ログインは、形式で断らない');
    assert.equal(ok(validates.changePassword, { current: 'old', next: 'short' }), false);
    assert.equal(ok(validates.changePassword, { current: 'old', next: 'long-enough-1' }), true);
    assert.equal(ok(validates.deleteAccount, { password: 'p' }), true);
    assert.equal(ok(validates.deleteAccount, {}), false);
});

test('パスワードの再設定（キーワード）: 連続 3 回の間違いで 8 時間凍結。ログインは、凍結中もできる', async (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reset-'));
    const db = path.join(dir, 'rpg.db');
    const HOUR = 3600 * 1000, T0 = Date.UTC(2026, 10, 18, 9, 0, 0);
    const reset = (email, kw, next, at = T0) => auth.resetPasswordWithKeyword(email, kw, next, db, at);
    auth.createUser('reset@example.com', 'original-pass-1', 'secret word', db);
    await t.test('キーワードが合えば、再設定できる（前後の空白は無視。大文字小文字は区別する）', () => {
        assert.deepEqual(reset('Reset@Example.com', ' secret word ', 'second-pass-2'), { ok: true });
        assert.equal(auth.verifyLogin('reset@example.com', 'second-pass-2', db) !== null, true);
        assert.equal(auth.verifyLogin('reset@example.com', 'original-pass-1', db), null);
        assert.deepEqual(reset('reset@example.com', 'SECRET WORD', 'third-pass-3'), { ok: false }, '大文字小文字は区別する');
    });
    await t.test('2 回間違えても、正しければ通り、間違いの回数は 0 に戻る', () => {
        assert.deepEqual(reset('reset@example.com', 'secret word', 'pass-before-9'), { ok: true });   // 前の 1 回の間違いも、成功で 0 に戻る
        reset('reset@example.com', 'bad1', 'x'); reset('reset@example.com', 'bad2', 'x');
        assert.equal(new Database(db).query('SELECT kw_fails FROM users').get().kw_fails, 2);
        assert.deepEqual(reset('reset@example.com', 'secret word', 'fourth-pass-4'), { ok: true });
        assert.equal(new Database(db).query('SELECT kw_fails FROM users').get().kw_fails, 0);
    });
    await t.test('連続 3 回の間違いで、凍結する。凍結中は、正しいキーワードでも断る', () => {
        assert.deepEqual(reset('reset@example.com', 'bad1', 'x'), { ok: false });
        assert.deepEqual(reset('reset@example.com', 'bad2', 'x'), { ok: false });
        assert.deepEqual(reset('reset@example.com', 'bad3', 'x'), { ok: false, frozen: true }, '3 回目で凍結');
        assert.deepEqual(reset('reset@example.com', 'secret word', 'fifth-pass-5', T0 + 7 * HOUR), { ok: false, frozen: true }, '7 時間後も凍結中');
        assert.equal(auth.verifyLogin('reset@example.com', 'fourth-pass-4', db) !== null, true, 'パスワードでのログインは、凍結中もできる');
    });
    await t.test('8 時間たつと、自動で解ける', () => {
        assert.deepEqual(reset('reset@example.com', 'secret word', 'fifth-pass-5', T0 + 8 * HOUR + 1), { ok: true });
        assert.equal(auth.verifyLogin('reset@example.com', 'fifth-pass-5', db) !== null, true);
    });
    await t.test('存在しないメールアドレス・キーワード未設定の古いアカウントは、再設定できない（数えない）', () => {
        assert.deepEqual(reset('nobody@example.com', 'secret word', 'x-pass-12345'), { ok: false });
        const d = new Database(db);
        d.run("INSERT INTO users (id, email, pw_salt, pw_hash, pw_iter, created_at, updated_at) VALUES ('legacy', 'legacy@example.com', 'aa', 'bb', 1, 't', 't')");
        assert.deepEqual(reset('legacy@example.com', 'anything', 'x-pass-12345'), { ok: false });
        assert.equal(d.query("SELECT kw_fails FROM users WHERE id = 'legacy'").get().kw_fails, 0);
    });
    await t.test('キーワードの変更: 現在のパスワードが必要。変えると、古いキーワードは使えない', () => {
        const id = auth.findByEmail('reset@example.com', db).id;
        assert.deepEqual(auth.changeKeyword(id, 'wrong', 'new keyword', db), { ok: false, wrong: true });
        assert.deepEqual(auth.changeKeyword(id, 'fifth-pass-5', 'new keyword', db), { ok: true });
        assert.deepEqual(reset('reset@example.com', 'secret word', 'x-pass-12345'), { ok: false });
        assert.deepEqual(reset('reset@example.com', 'new keyword', 'sixth-pass-6'), { ok: true });
    });
    await t.test('古い users テーブル（キーワードの列がない）にも、列を足す', async () => {
        const old = path.join(dir, 'old.db');
        const d = new Database(old);
        d.run('CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, pw_salt TEXT NOT NULL, pw_hash TEXT NOT NULL, pw_iter INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)');
        d.close();
        assert.equal(auth.findByEmail('x@example.com', old), null);   // ensureTables が、列を足す
        const cols = new Database(old).query('PRAGMA table_info(users)').all().map((c) => c.name);
        for (const c of ['kw_salt', 'kw_hash', 'kw_iter', 'kw_fails', 'reset_frozen_until']) assert.ok(cols.includes(c), c);
    });
    fs.rmSync(dir, { recursive: true, force: true });
});

test('ログインのロックの解除（正しいパスワード＋キーワード）', async (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'unlock-'));
    const db = path.join(dir, 'rpg.db');
    const HOUR = 3600 * 1000, T0 = Date.UTC(2026, 10, 18, 9, 0, 0);
    const unlock = (pw, kw, at = T0) => auth.unlockWithKeyword('lock@example.com', pw, kw, db, at);
    const id = auth.createUser('lock@example.com', 'lock-password-1', 'red fox', db).user.id;
    await t.test('パスワードとキーワードが、両方合えば、本人と認める', () => {
        const r = unlock('lock-password-1', ' red fox ');
        assert.equal(r.ok, true);
        assert.equal(r.user.id, id);
    });
    await t.test('どちらが違っても、同じ失敗。キーワードの間違いは数え、連続 3 回で 8 時間凍結する（再設定と同じ数え方）', () => {
        assert.deepEqual(unlock('wrong-password', 'red fox'), { ok: false }, 'パスワードが違う');
        assert.deepEqual(unlock('lock-password-1', 'bad'), { ok: false }, 'キーワードが違う');
        assert.equal(new Database(db).query('SELECT kw_fails FROM users').get().kw_fails, 1, 'キーワードの間違い 1 回分だけ（パスワードが違っても、キーワードが合っていれば、数えない）');
    });
    await t.test('凍結中は、両方合っていても使えない。ログインのパスワード照合は、できる。8 時間後に解ける', () => {
        unlock('lock-password-1', 'bad2'); unlock('lock-password-1', 'bad3');   // 連続 3 回で凍結
        assert.deepEqual(unlock('lock-password-1', 'red fox', T0 + HOUR), { ok: false });
        assert.deepEqual(auth.resetPasswordWithKeyword('lock@example.com', 'red fox', 'x-pass-12345', db, T0 + HOUR), { ok: false, frozen: true }, '再設定も、同じ凍結');
        assert.equal(auth.verifyLogin('lock@example.com', 'lock-password-1', db).id, id);
        assert.equal(unlock('lock-password-1', 'red fox', T0 + 8 * HOUR + 1).ok, true);
    });
    await t.test('存在しないメールアドレス・キーワード未設定のアカウントは、解除できない', () => {
        assert.deepEqual(auth.unlockWithKeyword('nobody@example.com', 'x', 'y', db), { ok: false });
        new Database(db).run("INSERT INTO users (id, email, pw_salt, pw_hash, pw_iter, created_at, updated_at) VALUES ('legacy2', 'legacy2@example.com', 'aa', 'bb', 1, 't', 't')");
        assert.deepEqual(auth.unlockWithKeyword('legacy2@example.com', 'x', 'y', db), { ok: false });
    });
    fs.rmSync(dir, { recursive: true, force: true });
});
