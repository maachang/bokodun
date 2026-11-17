/** ログアウト API: POST /api/logout（CSRF 検証つき）。セッションを消す */
exports.handler = async function() {
    const web = $loadLib('webAuth.js');
    if ($request.method !== 'POST') return web.fail($response, 405, 'Method Not Allowed');
    const u = web.currentUser($request, $response);
    if (u) {
        if (!web.csrfOk($request, u.sid)) return web.fail($response, 403, '画面を開き直してください（CSRF）', { csrf: true });
        $loadLib('session.js').deleteSession($request, $response);
    }
    return { ok: true };
};
