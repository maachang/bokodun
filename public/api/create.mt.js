/**
 * 冒険者の作成（確定）API（ログイン中だけ）: POST /api/create { name, race, job, a, b, c, d, bonus, abilities }
 *   確定すると、やり直せない（作成済みなら 409。二重確定の防止は、サーバー側）。確定までは、何度でも振り直せる（保存しない）。
 *   能力値は、計測値・種族・ボーナスから、サーバーでも検証する（計測値の止め操作は、クライアントの値を信用する。character-spec 4 章）。
 *   保存するのは、profile・abilities・jobs（第一職業 Lv1）。ほかの項目は、ゲームの読み込みのときに、初期値で補う。
 */
exports.handler = async function() {
    const web = $loadLib('webAuth.js');
    if ($request.method !== 'POST') return web.fail($response, 405, 'Method Not Allowed');
    const u = web.currentUser($request, $response);
    if (!u) return web.fail($response, 401, 'ログインしてください');
    if (!web.csrfOk($request, u.sid)) return web.fail($response, 403, '画面を開き直してください（CSRF）', { csrf: true });

    const validate = $loadLib('validate.js');
    const result = validate.check($request.body, $loadLib('validates/create.js'));
    if (!result.valid) { $response.status(400); return { errors: result.errors }; }
    const b = result.data;

    const { R, defs } = await $loadLib('gameRules.js').load();
    const msg = R.validateCreation(defs, b);
    if (msg) return web.fail($response, 400, msg);

    const store = $loadLib('characterStore.js');
    const cur = store.load(u.userId, web.DB_PATH);
    if (cur && cur.status === 'confirmed') return web.fail($response, 409, 'すでに冒険者を作成済みです（確定後は、やり直せません）');
    const data = {
        profile: { name: b.name, race: b.race, createdAt: new Date().toISOString() },
        abilities: b.abilities,
        jobs: { primary: b.job, sub: null, levels: { [b.job]: 1 }, expStock: 0 }
    };
    const saved = store.save(u.userId, { name: b.name, status: 'confirmed', rev: cur ? cur.rev : 1, data }, web.DB_PATH);
    if (!saved.ok) return web.fail($response, 409, '別の画面で保存されています。読み込み直してください');
    return { ok: true };
};
