/**
 * ログイン API: POST /api/login { email, password }
 * ブルートフォース・クレデンシャルスタッフィング対策: メールアドレスごと・IP ごとに、連続失敗をロック（lockout.js。423 Locked）。
 * メールアドレスの有無は、応答から分からないようにする（同じメッセージ・同じ時間）。
 */
exports.handler = async function() {
    const web = $loadLib('webAuth.js');
    if ($request.method !== 'POST') return web.fail($response, 405, 'Method Not Allowed');
    const validate = $loadLib('validate.js');
    const result = validate.check($request.body, $loadLib('validates/register.js').login);
    if (!result.valid) { $response.status(400); return { errors: result.errors }; }

    const email = web.userAuth.normalizeEmail(result.data.email);
    const lock = web.userAuth.lockout();
    for (const [id, scope] of [[email, 'login'], [$request.ip, 'login-ip']]) {
        const st = await lock.check(id, scope);
        if (st.isLocked) return web.fail($response, 423, `ログインに失敗した回数が多すぎます。${Math.ceil(st.waitSeconds / 60)} 分ほど待ってください`, { waitSeconds: st.waitSeconds });
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
