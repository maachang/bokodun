/**
 * ユーザー登録 API: POST /api/register { email, password } → 登録して、そのままログイン。
 * 匿名ユーザーはなし。原則ユーザー登録（メールアドレス＋パスワード）。確認メールは、まだ送らない。
 */
exports.handler = async function() {
    const web = $loadLib('webAuth.js');
    if ($request.method !== 'POST') return web.fail($response, 405, 'Method Not Allowed');
    const validate = $loadLib('validate.js');
    const result = validate.check($request.body, $loadLib('validates/register.js').register);
    if (!result.valid) { $response.status(400); return { errors: result.errors }; }

    const r = web.userAuth.createUser(result.data.email, result.data.password, web.DB_PATH);
    if (r.duplicate) return web.fail($response, 409, 'このメールアドレスは、登録できません');   // 登録済みかどうかは、詳しく言わない
    const sid = web.startSession($request, $response, r.user);
    return { ok: true, email: r.user.email, csrfToken: web.csrfToken(sid) };
};
