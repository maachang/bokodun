/**
 * 冒険者の保存・読み込み API
 *   GET  /api/character → { character: null } か { character: { name, status, rev, data … } }
 *   POST /api/character → body { name, status, rev, data }。成功 { ok, rev }、rev 違いは 409、検証エラーは 400
 * user_id は、匿名セッション（session.js）に持たせた値を使う。リクエストで渡された ID は見ない。
 */
const DB_PATH = './data/rpg.db';

// セッションから user_id を決める（なければ、セッションと一緒に作る。乱数は crypto）
function currentUserId() {
    const sessionMod = $loadLib('session.js');
    let session = sessionMod.getSession($request);
    if (!session) session = sessionMod.createSession($response, {});
    if (!session.data.userId) {
        session.data.userId = $require('crypto').randomUUID();
        sessionMod.setSession(session.sid, session.data);
    }
    return session.data.userId;
}

exports.handler = async function() {
    const store = $loadLib('characterStore.js');
    const userId = currentUserId();

    if ($request.method === 'GET') {
        return { character: store.load(userId, DB_PATH) };
    }
    if ($request.method !== 'POST') {
        $response.status(405);
        return { error: 'Method Not Allowed' };
    }

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
