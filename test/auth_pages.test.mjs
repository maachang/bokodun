// 匿名ユーザーなし・原則ユーザー登録: API とページが、ログインを前提にしていること（ソースの確認）
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const read = (f) => fs.readFileSync(path.join(process.cwd(), f), 'utf8');
const apiFiles = fs.readdirSync(path.join(process.cwd(), 'public/api')).filter((f) => f.endsWith('.js'));

test('匿名のセッションを作る API がない', () => {
    for (const f of apiFiles) assert.ok(!/createSession\(/.test(read('public/api/' + f)), `${f}: createSession（匿名セッション）は使わない`);
});

test('冒険者・アカウントの API は、ログイン必須（未ログインは 401）で、状態を変えるものは CSRF を検証する', () => {
    for (const f of ['character.mt.js', 'account.mt.js']) {
        const s = read('public/api/' + f);
        assert.ok(s.includes('web.currentUser('), `${f}: ログイン中のユーザーを見る`);
        assert.ok(s.includes('401'), `${f}: 未ログインは 401`);
        assert.ok(s.includes('web.csrfOk('), `${f}: CSRF の検証`);
    }
    assert.ok(read('public/api/logout.mt.js').includes('web.csrfOk('));
    // ユーザー ID は、リクエストから受け取らない
    for (const f of ['character.mt.js', 'account.mt.js']) assert.ok(!/\$request\.(body|query)\??\.(userId|user_id)/.test(read('public/api/' + f)), `${f}: リクエストの userId を信用しない`);
});

test('ログイン・パスワード変更・削除は、連続失敗のロック（lockout.js）を使う。パスワードは password.js', () => {
    for (const f of ['login.mt.js', 'account.mt.js', 'reset.mt.js']) {
        const s = read('public/api/' + f);
        assert.ok(s.includes('lock.check(') && s.includes('lock.recordFailure(') && s.includes('lock.reset('), `${f}: check・recordFailure・reset`);
        assert.ok(s.includes('423'), `${f}: ロック中は 423`);
    }
    assert.ok(read('lib/userAuth.js').includes("fw('password.js')"));
    assert.ok(read('public/api/login.mt.js').includes('unlockWithKeyword(') && read('public/login.html').includes('kwBox'), 'ロック中は、パスワード＋キーワードで解除できる');
    assert.ok(read('public/api/login.mt.js').includes('startSession('), 'ログイン成功で、セッション ID を発行し直す（固定化攻撃対策）');
    assert.ok(read('lib/webAuth.js').includes('regenerateSession('));
});

test('ゲーム画面は、ログインしていなければ、ログイン画面へ移す。ログイン・登録のページがある', () => {
    const html = read('public/index.html');
    assert.ok(html.includes("/api/me") && html.includes("/login.html"));
    for (const f of ['login.html', 'register.html', 'reset.html']) {
        const s = read('public/' + f);
        assert.ok(s.includes('/jhtml.browser.js') && s.includes('jhtml.api.post') === false && s.includes('api.post('), `${f}: jhtml.api を使う`);
        assert.ok(s.includes('type="password"'));
    }
    assert.ok(read('public/login.html').includes('/api/login') && read('public/register.html').includes('/api/register') && read('public/reset.html').includes('/api/reset'));
    assert.ok(read('public/login.html').includes('/reset.html'), 'ログインから、再設定へ');
    assert.ok(read('public/register.html').includes('name="keyword"'), '登録で、キーワードを決める');
});

test('スキーマ（schema/users.sql）と、検証（validates/register.js）がある', () => {
    assert.ok(/CREATE TABLE IF NOT EXISTS users/.test(read('schema/users.sql')));
    assert.ok(!/password\b\s+TEXT/i.test(read('schema/users.sql')), 'パスワードそのものの列はない（ハッシュだけ）');
    assert.ok(!/keyword\s+TEXT/i.test(read('schema/users.sql')) && read('schema/users.sql').includes('kw_hash'), 'キーワードも、ハッシュだけ');
    const v = require_(path.join(process.cwd(), 'validates/register.js'));
    assert.deepEqual(Object.keys(v).sort(), ['changeKeyword', 'changePassword', 'deleteAccount', 'login', 'register', 'reset']);
});

import { createRequire } from 'node:module';
const require_ = createRequire(import.meta.url);
