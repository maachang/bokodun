/**
 * ユーザー（アカウント）の登録・ログイン照合・パスワード変更・削除 (lib/userAuth.js)
 *
 * 匿名ユーザーはなし。原則ユーザー登録（メールアドレス＋パスワード）。テーブル: schema/users.sql。
 *   - パスワードは、password.js（PBKDF2-HMAC-SHA256）でハッシュ化して持つ。照合も password.js（定数時間比較）。
 *   - ログイン・パスワード変更・削除の失敗は、lockout.js で数える（連続失敗でロック）。
 *   - ユーザー固有のデータ（冒険者・セーブ履歴・設定）は、users.id を user_id にして、$db.forUser で触る（BOLA/IDOR 対策）。
 * セッションと CSRF のつなぎは、public/api/*.mt.js 側。ここは、DB の操作だけ（テストしやすいように）。
 */
const rpgDb = require('./rpgDb.js');
const password = rpgDb.fw('password.js');
const crypto = require('crypto');
const dbWrapper = rpgDb.dbWrapper;

const config = { iterations: 200000 };   // password.js の反復回数（上限 20 万回で、約 0.4 秒）。テストだけ、小さくする
const now = () => new Date().toISOString();

/** メールアドレスの正規化（前後の空白を除き、小文字にする） */
function normalizeEmail(s) {
    return String(s ?? '').trim().toLowerCase();
}

function findByEmail(email, dbPath) {
    rpgDb.ensureTables(dbPath);
    return dbWrapper.get('SELECT * FROM users WHERE email = ?', [normalizeEmail(email)], dbPath) ?? null;
}

/** 登録。{ ok: true, user: { id, email } } / { ok: false, duplicate: true }（すでに登録済み） */
function createUser(email, plainPassword, dbPath) {
    rpgDb.ensureTables(dbPath);
    const e = normalizeEmail(email);
    if (findByEmail(e, dbPath)) return { ok: false, duplicate: true };
    const h = password.hash(plainPassword, config.iterations);
    const id = crypto.randomUUID();
    const t = now();
    try {
        dbWrapper.run('INSERT INTO users (id, email, pw_salt, pw_hash, pw_iter, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [id, e, h.salt, h.hash, h.iterations, t, t], dbPath);
    } catch (err) {
        if (/UNIQUE/i.test(String(err.message))) return { ok: false, duplicate: true };   // 同時登録
        throw err;
    }
    return { ok: true, user: { id, email: e } };
}

// ユーザーが見つからないときも、同じ時間をかける（メールアドレスの有無を、応答時間から推測されないように）
let dummyHash = null;
function verifyAgainst(plainPassword, row) {
    if (row) return password.verify(plainPassword, { salt: row.pw_salt, hash: row.pw_hash, iterations: row.pw_iter });
    dummyHash ??= password.hash('dummy-password-for-timing', config.iterations);
    password.verify(plainPassword, dummyHash);
    return false;
}

/** ログインの照合。合っていれば { id, email }、違えば null */
function verifyLogin(email, plainPassword, dbPath) {
    const row = findByEmail(email, dbPath);
    return verifyAgainst(plainPassword, row) ? { id: row.id, email: row.email } : null;
}

function getUser(userId, dbPath) {
    rpgDb.ensureTables(dbPath);
    return dbWrapper.forUser(userId, { ownerColumn: 'id', dbPath }).findById('users', userId, 'id', dbPath) ?? null;
}

/** パスワード変更。{ ok: true } / { ok: false, wrong: true }（現在のパスワードが違う） */
function changePassword(userId, current, next, dbPath) {
    const row = getUser(userId, dbPath);
    if (!row || !verifyAgainst(current, row)) { if (!row) verifyAgainst(current, null); return { ok: false, wrong: true }; }
    const h = password.hash(next, config.iterations);
    dbWrapper.forUser(userId, { ownerColumn: 'id', dbPath }).updateById('users', userId, { pw_salt: h.salt, pw_hash: h.hash, pw_iter: h.iterations, updated_at: now() }, 'id', dbPath);
    return { ok: true };
}

/** アカウント削除（冒険者・セーブ履歴・設定も、すべて消す）。{ ok: true } / { ok: false, wrong: true } */
function deleteUser(userId, plainPassword, dbPath) {
    const row = getUser(userId, dbPath);
    if (!row || !verifyAgainst(plainPassword, row)) { if (!row) verifyAgainst(plainPassword, null); return { ok: false, wrong: true }; }
    const own = dbWrapper.forUser(userId, { dbPath });
    dbWrapper.transaction(() => {
        for (const t of ['character_saves', 'characters']) for (const r of own.find(t, '', [], dbPath)) own.deleteById(t, r.id, 'id', dbPath);
        own.deleteById('user_settings', userId, 'user_id', dbPath);
        dbWrapper.forUser(userId, { ownerColumn: 'id', dbPath }).deleteById('users', userId, 'id', dbPath);
    }, dbPath);
    return { ok: true };
}

// 連続失敗のロック（lockout.js）。失敗回数は、メモリに持つ（再起動で消える。1 プロセスの運用が前提）。
//   lockout.js の SQLite 保存（dbPath を渡す形）は、フレームワークの src/db.js に findById がなく、動かない（modules/auth/lockout.js の不具合）ので使わない。
let lockoutMgr = null;
function lockout() {
    lockoutMgr ??= rpgDb.fw('lockout.js').createLockoutManager({});
    return lockoutMgr;
}

module.exports = { normalizeEmail, findByEmail, createUser, verifyLogin, getUser, changePassword, deleteUser, lockout, config };
