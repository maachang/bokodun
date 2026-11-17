/** ログイン状態 API: GET /api/me → { authenticated, email, csrfToken }。ゲーム画面が、起動時に見る（未ログインなら、ログイン画面へ） */
exports.handler = async function() {
    const web = $loadLib('webAuth.js');
    const u = web.currentUser($request, $response);
    if (!u) return { authenticated: false };
    return { authenticated: true, email: u.email, csrfToken: web.csrfToken(u.sid) };
};
