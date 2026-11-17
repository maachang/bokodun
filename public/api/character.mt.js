/**
 * 冒険者の保存・読み込み API（ログイン中だけ。未ログインは 401）
 *   GET  /api/character → { character: null } か { character: { name, status, rev, data … } }
 *   POST /api/character → body { name, status, rev, data }（ヘッダー X-CSRF-Token が必要）。成功 { ok, rev }、rev 違いは 409、検証エラーは 400
 * user_id は、ログインしたユーザー（users.id）。リクエストで渡された ID は見ない。
 */
const DB_PATH = './data/rpg.db';

exports.handler = async function() {
    const web = $loadLib('webAuth.js');
    const store = $loadLib('characterStore.js');
    const u = web.currentUser($request, $response);   // ログイン中のユーザー（匿名ユーザーはなし）。リクエストの ID は見ない
    if (!u) return web.fail($response, 401, 'ログインしてください');
    const userId = u.userId;

    if ($request.method === 'GET') {
        return { character: store.load(userId, DB_PATH) };
    }
    if ($request.method !== 'POST') {
        $response.status(405);
        return { error: 'Method Not Allowed' };
    }
    if (!web.csrfOk($request, u.sid)) return web.fail($response, 403, '画面を開き直してください（CSRF）', { csrf: true });

    const validate = $loadLib('validate.js');
    const result = validate.check($request.body, $loadLib('validates/character.js'));
    if (!result.valid) {
        $response.status(400);
        return { errors: result.errors };
    }
    const saved = store.save(userId, result.data, DB_PATH);
    if (saved.conflict) {
        $response.status(409);
        return { error: '別の画面で保存されています。読み込み直してください', rev: saved.rev };
    }
    if (saved.invalid) {
        $response.status(400);
        return { error: saved.invalid };
    }
    return { ok: true, rev: saved.rev };
};
