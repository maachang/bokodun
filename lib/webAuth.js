/**
 * ログインの、セッションと CSRF のつなぎ (lib/webAuth.js)。public/api/*.mt.js から使う（$loadLib('webAuth.js')）。
 *   $request・$response は、呼び出し側から引数で受ける（lib は、注入された変数を使えない）。
 *   セッション（session.js）に userId・email を持たせる。有効期限は conf/session.json（60 分）。使うたびに、期限と Cookie を延ばす。
 *   CSRF トークンは、セッション ID から決まる（csrf.js）。状態を変える API（保存・パスワード変更・削除・ログアウト）は、ヘッダー X-CSRF-Token を検証する。
 */
const DB_PATH = './data/rpg.db';
const rpgDb = require('./rpgDb.js');
const sessionMod = rpgDb.fw('session.js');
const csrf = rpgDb.fw('csrf.js');
const userAuth = require('./userAuth.js');

// セッションの Cookie と期限を延ばす
function touch(sid, data, $response) {
    sessionMod.setSession(sid, data);   // 期限の延長
    const conf = sessionMod.getConf();
    const opts = { maxAge: conf.timeoutMin * 60, path: '/', sameSite: conf.sameSite, httpOnly: conf.httpOnly };
    if (conf.secure === true) opts.secure = true;
    $response.setCookie(conf.cookieName, sid, opts);
}

/** ログイン中のユーザー { userId, email, sid }。未ログイン・期限切れ・削除済みなら null */
function currentUser($request, $response) {
    const session = sessionMod.getSession($request);
    const userId = session?.data?.userId;
    if (!userId) return null;
    const user = userAuth.getUser(userId, DB_PATH);
    if (!user) { sessionMod.deleteSession($request, $response); return null; }   // アカウントが削除されている
    touch(session.sid, session.data, $response);
    return { userId, email: user.email, sid: session.sid };
}

/** ログインを始める（セッション固定化攻撃対策で、セッション ID を発行し直す）。新しいセッション ID を返す */
function startSession($request, $response, user) {
    const s = sessionMod.regenerateSession($request, $response);
    touch(s.sid, { userId: user.id, email: user.email }, $response);
    return s.sid;
}

function csrfToken(sid) {
    return csrf.generateToken(sid);
}

/** 状態を変える API の CSRF 検証（ヘッダー X-CSRF-Token） */
function csrfOk($request, sid) {
    return csrf.verify(sid, $request.getHeader('x-csrf-token') ?? '') === true;
}

/** 失敗の応答（status と JSON）。呼び出し側は、これを return する */
function fail($response, status, error, extra = {}) {
    $response.status(status);
    return { error, ...extra };
}

module.exports = { DB_PATH, currentUser, startSession, csrfToken, csrfOk, fail, userAuth };
