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

/** キーワードの正規化（前後の空白だけ除く。大文字小文字は区別する） */
function normalizeKeyword(s) {
    return String(s ?? '').trim();
}

/** メールアドレスの正規化（前後の空白を除き、小文字にする） */
function normalizeEmail(s) {
    return String(s ?? '').trim().toLowerCase();
}

function findByEmail(email, dbPath) {
    rpgDb.ensureTables(dbPath);
    return dbWrapper.get('SELECT * FROM users WHERE email = ?', [normalizeEmail(email)], dbPath) ?? null;
}

const KEYWORD_MAX_FAILS = 3;                       // キーワードを連続して間違えると、再設定を凍結する回数
const RESET_FREEZE_MS = 8 * 60 * 60 * 1000;        // 再設定の凍結の長さ（8 時間。過ぎれば、自動で使える。ログインは、凍結中でもできる）

/** 登録。{ ok: true, user: { id, email } } / { ok: false, duplicate: true }（すでに登録済み）。keyword は、パスワード再設定用（パスワードと同じ文字列は、呼び出し側の検証で断る） */
function createUser(email, plainPassword, keyword, dbPath) {
    rpgDb.ensureTables(dbPath);
    const e = normalizeEmail(email);
    if (findByEmail(e, dbPath)) return { ok: false, duplicate: true };
    const h = password.hash(plainPassword, config.iterations);
    const k = password.hash(normalizeKeyword(keyword), config.iterations);
    const id = crypto.randomUUID();
    const t = now();
    try {
        dbWrapper.run('INSERT INTO users (id, email, pw_salt, pw_hash, pw_iter, kw_salt, kw_hash, kw_iter, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [id, e, h.salt, h.hash, h.iterations, k.salt, k.hash, k.iterations, t, t], dbPath);
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

// キーワードの照合（数え方つき）。連続 3 回間違えると、8 時間凍結する（パスワードの再設定と、ログインのロック解除の、両方が止まる）。正しければ、回数を 0 に戻す。
//   戻り値: 'ok' / 'wrong' / 'frozen'（凍結中、または、いま凍結した）
function checkKeywordCounted(row, kw, dbPath, nowMs) {
    if (row.reset_frozen_until > nowMs) return 'frozen';
    const own = dbWrapper.forUser(row.id, { ownerColumn: 'id', dbPath });
    if (!password.verify(kw, { salt: row.kw_salt, hash: row.kw_hash, iterations: row.kw_iter })) {
        const fails = row.kw_fails + 1;
        const freeze = fails >= KEYWORD_MAX_FAILS;
        own.updateById('users', row.id, { kw_fails: freeze ? 0 : fails, reset_frozen_until: freeze ? nowMs + RESET_FREEZE_MS : 0, updated_at: now() }, 'id', dbPath);
        return freeze ? 'frozen' : 'wrong';
    }
    if (row.kw_fails > 0) own.updateById('users', row.id, { kw_fails: 0, updated_at: now() }, 'id', dbPath);
    return 'ok';
}

/**
 * キーワードでのパスワード再設定（ログインしていない状態で使う）。
 *   キーワードを連続 3 回間違えると、再設定を 8 時間凍結する（ログインは、凍結中でもできる）。正しければ、間違いの回数を 0 に戻す。
 *   戻り値: { ok: true } / { ok: false, frozen: true }（凍結中、または、いま凍結した） / { ok: false }（メールアドレスかキーワードが違う）
 *   呼び出し側は、どの失敗も同じメッセージにする（メールアドレスの有無を、応答から分からないように）。nowMs は、テスト用。
 */
function resetPasswordWithKeyword(email, keyword, nextPassword, dbPath, nowMs = Date.now()) {
    const row = findByEmail(email, dbPath);
    const kw = normalizeKeyword(keyword);
    if (!row || !row.kw_hash) { verifyAgainst(kw, null); return { ok: false }; }   // 存在しない・キーワード未設定（古いアカウント）: 数えない
    const st = checkKeywordCounted(row, kw, dbPath, nowMs);
    if (st !== 'ok') return st === 'frozen' ? { ok: false, frozen: true } : { ok: false };
    const h = password.hash(nextPassword, config.iterations);
    dbWrapper.forUser(row.id, { ownerColumn: 'id', dbPath }).updateById('users', row.id, { pw_salt: h.salt, pw_hash: h.hash, pw_iter: h.iterations, kw_fails: 0, reset_frozen_until: 0, updated_at: now() }, 'id', dbPath);
    return { ok: true };
}

/**
 * ログインのロック（パスワードを連続して間違えたときの一時ロック）の解除。正しいパスワードと、正しいキーワードの、両方が合えば、本人と認める。
 *   キーワードの間違いは、再設定と同じ数え方（連続 3 回で、8 時間凍結。凍結中は、この方法も使えない）。パスワードかキーワードの、どちらが違っても、同じ結果（どちらが違うか、分からないように）。
 *   戻り値: { ok: true, user: { id, email } } / { ok: false }
 */
function unlockWithKeyword(email, plainPassword, keyword, dbPath, nowMs = Date.now()) {
    const row = findByEmail(email, dbPath);
    const kw = normalizeKeyword(keyword);
    if (!row || !row.kw_hash) { verifyAgainst(plainPassword, null); verifyAgainst(kw, null); return { ok: false }; }
    const passOk = verifyAgainst(plainPassword, row);
    const st = checkKeywordCounted(row, kw, dbPath, nowMs);   // パスワードが違っても、キーワードは数える（どちらが違うかを、結果から推測されない）
    return (passOk && st === 'ok') ? { ok: true, user: { id: row.id, email: row.email } } : { ok: false };
}

/** キーワードの変更（現在のパスワードが必要）。{ ok: true } / { ok: false, wrong: true } */
function changeKeyword(userId, currentPassword, newKeyword, dbPath) {
    const row = getUser(userId, dbPath);
    if (!row || !verifyAgainst(currentPassword, row)) { if (!row) verifyAgainst(currentPassword, null); return { ok: false, wrong: true }; }
    const k = password.hash(normalizeKeyword(newKeyword), config.iterations);
    dbWrapper.forUser(userId, { ownerColumn: 'id', dbPath }).updateById('users', userId, { kw_salt: k.salt, kw_hash: k.hash, kw_iter: k.iterations, kw_fails: 0, reset_frozen_until: 0, updated_at: now() }, 'id', dbPath);
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

module.exports = { normalizeEmail, normalizeKeyword, findByEmail, createUser, verifyLogin, getUser, changePassword, changeKeyword, resetPasswordWithKeyword, unlockWithKeyword, deleteUser, lockout, config, KEYWORD_MAX_FAILS, RESET_FREEZE_MS };
