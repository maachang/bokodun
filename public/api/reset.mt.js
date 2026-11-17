/**
 * パスワードの再設定 API（未ログインで使う）: POST /api/reset { email, keyword, next }
 * メールを送らないので、登録のときに決めた「キーワード」で、本人を確かめる。
 *   - キーワードを連続 3 回間違えると、そのアカウントの再設定を 8 時間凍結する（ログインは、凍結中もできる）。8 時間たてば、自動で使える。
 *   - メールアドレスの有無・凍結中かどうかは、応答から分からないようにする（失敗は、すべて同じメッセージ）。
 *   - 総当たり対策: メールアドレスごと・IP ごとに、連続失敗をロック（lockout.js。423 Locked）。
 * 成功しても、ログインはしない（新しいパスワードで、ログインし直す）。
 */
exports.handler = async function() {
    const web = $loadLib('webAuth.js');
    if ($request.method !== 'POST') return web.fail($response, 405, 'Method Not Allowed');
    const validate = $loadLib('validate.js');
    const result = validate.check($request.body, $loadLib('validates/register.js').reset);
    if (!result.valid) { $response.status(400); return { errors: result.errors }; }

    const email = web.userAuth.normalizeEmail(result.data.email);
    const lock = web.userAuth.lockout(web.DB_PATH);
    for (const [id, scope] of [[email, 'reset'], [$request.ip, 'reset-ip']]) {
        const st = await lock.check(id, scope);
        if (st.isLocked) return web.fail($response, 423, `失敗した回数が多すぎます。${Math.ceil(st.waitSeconds / 60)} 分ほど待ってください`, { waitSeconds: st.waitSeconds });
    }
    const r = web.userAuth.resetPasswordWithKeyword(email, result.data.keyword, result.data.next, web.DB_PATH);
    if (!r.ok) {
        await lock.recordFailure(email, 'reset');
        await lock.recordFailure($request.ip, 'reset-ip');
        return web.fail($response, 400, '再設定できませんでした。メールアドレスかキーワードが違うか、再設定が凍結されています（キーワードを 3 回続けて間違えると、8 時間凍結されます）');
    }
    await lock.reset(email, 'reset');
    return { ok: true };
};
