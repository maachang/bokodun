/**
 * ログイン API: POST /api/login { email, password, keyword? }
 * ブルートフォース・クレデンシャルスタッフィング対策: メールアドレスごと・IP ごとに、連続失敗をロック（lockout.js。423 Locked）。
 * メールアドレスの有無は、応答から分からないようにする（同じメッセージ・同じ時間）。
 * ロックの解除: ロック中（423）は、正しいパスワードと、登録のときのキーワードを、両方入れれば、解除してログインできる（keyword を付けて、もう一度送る）。
 *   キーワードの間違いは、パスワードの再設定と同じ数え方（連続 3 回で、8 時間、キーワードを使う操作が凍結される）。
 */
exports.handler = async function() {
    const web = $loadLib('webAuth.js');
    if ($request.method !== 'POST') return web.fail($response, 405, 'Method Not Allowed');
    const validate = $loadLib('validate.js');
    const result = validate.check($request.body, $loadLib('validates/register.js').login);
    if (!result.valid) { $response.status(400); return { errors: result.errors }; }

    const email = web.userAuth.normalizeEmail(result.data.email);
    const lock = web.userAuth.lockout();
    const targets = [[email, 'login'], [$request.ip, 'login-ip']];
    let locked = null;
    for (const [id, scope] of targets) {
        const st = await lock.check(id, scope);
        if (st.isLocked && (!locked || st.waitSeconds > locked.waitSeconds)) locked = st;
    }
    if (locked) {
        const keyword = String(result.data.keyword ?? '').trim();
        if (!keyword) {   // キーワードがなければ、ロックの案内（keywordUnlock: キーワードで解除できる）
            return web.fail($response, 423, `ログインに失敗した回数が多すぎます。${Math.ceil(locked.waitSeconds / 60)} 分ほど待つか、キーワードを入れて、ロックを解除してください`, { waitSeconds: locked.waitSeconds, keywordUnlock: true });
        }
        const r = web.userAuth.unlockWithKeyword(email, result.data.password, keyword, web.DB_PATH);
        if (!r.ok) return web.fail($response, 401, 'ロックを解除できませんでした。メールアドレス・パスワード・キーワードのどれかが違うか、キーワードの操作が凍結されています（キーワードを 3 回続けて間違えると、8 時間凍結されます）', { keywordUnlock: true });
        for (const [id, scope] of targets) await lock.reset(id, scope);   // 本人と確かめられたので、ロックを解く
        const sid = web.startSession($request, $response, r.user);
        return { ok: true, email: r.user.email, csrfToken: web.csrfToken(sid), unlocked: true };
    }

    const user = web.userAuth.verifyLogin(email, result.data.password, web.DB_PATH);
    if (!user) {
        await lock.recordFailure(email, 'login');
        await lock.recordFailure($request.ip, 'login-ip');
        return web.fail($response, 401, 'メールアドレスまたはパスワードが違います');
    }
    await lock.reset(email, 'login');
    const sid = web.startSession($request, $response, user);
    return { ok: true, email: user.email, csrfToken: web.csrfToken(sid) };
};
