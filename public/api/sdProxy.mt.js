/**
 * sdServer プロキシ API
 * sdServer (http://localhost:3000) への画像取得・ギャラリー取得・画像生成リクエストを中継
 */
exports.handler = async function() {
    const action = $request.getQuery('action', '') || '';

    // 1. 画像バイナリプロキシ: /api/sdProxy?action=image&path=/uploads/xxx.png
    if (action === 'image') {
        const imagePath = $request.getQuery('path', '');
        if (!imagePath || !imagePath.startsWith('/uploads/')) {
            $response.status(400);
            return { error: 'Invalid path' };
        }
        try {
            const resp = await fetch(`http://127.0.0.1:3000${imagePath}`);
            if (!resp.ok) {
                $response.status(resp.status);
                return { error: 'Failed to fetch image from sdServer' };
            }
            const buf = await resp.arrayBuffer();
            $response.setHeader('Content-Type', resp.headers.get('content-type') || 'image/png');
            $response.setHeader('Cache-Control', 'public, max-age=86400');
            return new Uint8Array(buf);
        } catch (e) {
            $response.status(500);
            return { error: e.message };
        }
    }

    // 2. ギャラリー画像一覧取得: /api/sdProxy?action=list&groupTag=xxx&limit=50
    if (action === 'list') {
        const groupTag = $request.getQuery('groupTag', '');
        const limit = $request.getQuery('limit', '30');
        const offset = $request.getQuery('offset', '0');
        try {
            const url = `http://127.0.0.1:3000/api/images?limit=${limit}&offset=${offset}&groupTag=${encodeURIComponent(groupTag)}`;
            const resp = await fetch(url);
            const data = await resp.json();
            return data;
        } catch (e) {
            $response.status(500);
            return { success: false, error: e.message };
        }
    }

    // 3. サーバー情報 & テーマ取得: /api/sdProxy?action=config
    if (action === 'config') {
        try {
            const resp = await fetch('http://127.0.0.1:3000/api/config');
            const data = await resp.json();
            return data;
        } catch (e) {
            $response.status(500);
            return { success: false, error: e.message };
        }
    }

    // 4. 画像生成タスク作成: POST /api/sdProxy?action=generate
    if (action === 'generate' && $request.method === 'POST') {
        try {
            const body = $request.body || {};
            const resp = await fetch('http://127.0.0.1:3000/api/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: typeof body === 'string' ? body : JSON.stringify(body)
            });
            const data = await resp.json();
            return data;
        } catch (e) {
            $response.status(500);
            return { success: false, error: e.message };
        }
    }

    // 5. 生成ステータス確認 / キャンセル: /api/sdProxy?action=status&taskId=xxx
    if (action === 'status') {
        const taskId = $request.getQuery('taskId', '');
        try {
            const resp = await fetch(`http://127.0.0.1:3000/api/generate?taskId=${encodeURIComponent(taskId)}`);
            const data = await resp.json();
            return data;
        } catch (e) {
            $response.status(500);
            return { success: false, error: e.message };
        }
    }

    return { success: true, message: 'sdProxy endpoint ready' };
};
