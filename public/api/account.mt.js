/**
 * アカウント API（ログイン中だけ。CSRF 検証つき）
 *   POST /api/account { action: 'password', current, next }  … パスワード変更（成功すると、セッション ID を発行し直す）
 *   POST /api/account { action: 'keyword', password, keyword } … 再設定用のキーワードの変更（現在のパスワードが必要）
 *   POST /api/account { action: 'delete', password }         … アカウント削除（冒険者のデータも、すべて消える）
 * 現在のパスワードの照合の失敗は、ログインと同じく、連続失敗でロックする（lockout.js。scope: account）。
 */
exports.handler = async function() {
    const web = $loadLib('webAuth.js');
    if ($request.method !== 'POST') return web.fail($response, 405, 'Method Not Allowed');
    const u = web.currentUser($request, $response);
    if (!u) return web.fail($response, 401, 'ログインしてください');
    if (!web.csrfOk($request, u.sid)) return web.fail($response, 403, '画面を開き直してください（CSRF）', { csrf: true });

    const validate = $loadLib('validate.js'), schemas = $loadLib('validates/register.js');
    const action = $request.body?.action;
    if (!['password', 'keyword', 'delete'].includes(action)) return web.fail($response, 400, '不明な操作です');
    const result = validate.check($request.body, { password: schemas.changePassword, keyword: schemas.changeKeyword, delete: schemas.deleteAccount }[action]);
    if (!result.valid) { $response.status(400); return { errors: result.errors }; }

    const lock = web.userAuth.lockout(web.DB_PATH);
    const st = await lock.check(u.userId, 'account');
    if (st.isLocked) return web.fail($response, 423, `失敗した回数が多すぎます。${Math.ceil(st.waitSeconds / 60)} 分ほど待ってください`, { waitSeconds: st.waitSeconds });

    const r = action === 'password' ? web.userAuth.changePassword(u.userId, result.data.current, result.data.next, web.DB_PATH)
        : action === 'keyword' ? web.userAuth.changeKeyword(u.userId, result.data.password, result.data.keyword, web.DB_PATH)
        : web.userAuth.deleteUser(u.userId, result.data.password, web.DB_PATH);
    if (!r.ok) {
        await lock.recordFailure(u.userId, 'account');
        return web.fail($response, 400, 'パスワードが違います');   // CSRF（403）と区別する
    }
    await lock.reset(u.userId, 'account');
    if (action === 'delete') {
        $loadLib('session.js').deleteSession($request, $response);
        return { ok: true };
    }
    if (action === 'keyword') return { ok: true };
    const sid = web.startSession($request, $response, { id: u.userId, email: u.email });   // パスワードを変えたら、セッション ID を発行し直す
    return { ok: true, csrfToken: web.csrfToken(sid) };
};
