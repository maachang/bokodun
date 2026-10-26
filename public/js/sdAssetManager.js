import * as THREE from '/js/three.module.js';

export class SDAssetManager {
    constructor() {
        this.cache = new Map();
    }

    /**
     * sdServerから画像を取得し、背景（黒または白）を自動透過処理してTHREE.CanvasTextureを生成
     * @param {string} imagePath sdServerの/uploads/xxx.png
     * @param {string} removeBg 'black' | 'white' | 'none'
     * @returns {Promise<THREE.CanvasTexture>}
     */
    async loadTexture(imagePath, removeBg = 'none') {
        const cacheKey = `${imagePath}_${removeBg}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        const proxyUrl = `/api/sdProxy?action=image&path=${encodeURIComponent(imagePath)}`;
        const img = new Image();
        img.crossOrigin = 'anonymous';

        await new Promise((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = (e) => reject(new Error('Failed to load image: ' + imagePath));
            img.src = proxyUrl;
        });

        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        if (removeBg && removeBg !== 'none') {
            const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imgData.data;
            const w = canvas.width;
            const h = canvas.height;

            // Sample corner pixels to detect dominant background color (supports #ff00ff magenta, black, etc.)
            const corners = [
                0, // (0,0)
                (w - 1) * 4, // (w-1, 0)
                ((h - 1) * w) * 4, // (0, h-1)
                ((h - 1) * w + (w - 1)) * 4 // (w-1, h-1)
            ];

            let refR = 0, refG = 0, refB = 0;
            for (const c of corners) {
                refR += data[c];
                refG += data[c + 1];
                refB += data[c + 2];
            }
            refR /= 4; refG /= 4; refB /= 4;

            // Check if corner is magenta (#ff00ff family)
            const isMagentaBg = (refR > 120 && refB > 100 && refG < refR * 0.85);

            if (isMagentaBg) {
                // マゼンタ背景: 背景色(コーナー平均)との色距離で判定し、紫・ピンク等の体色は巻き込まない
                // 1) 外周からのフラッドフィル（背景色に近い連結領域）
                // 2) 背景色にほぼ一致する内部孤立ピクセル（骨の隙間・脇・脚の間）も透過
                const nearBg = (pIdx, tol) => {
                    const dr = data[pIdx] - refR;
                    const dg = data[pIdx + 1] - refG;
                    const db = data[pIdx + 2] - refB;
                    return (dr * dr + dg * dg + db * db) <= tol * tol;
                };
                const visited = new Uint8Array(w * h);
                const queue = [];
                for (let x = 0; x < w; x++) {
                    queue.push(x, 0);
                    queue.push(x, h - 1);
                }
                for (let y = 0; y < h; y++) {
                    queue.push(0, y);
                    queue.push(w - 1, y);
                }
                let head = 0;
                while (head < queue.length) {
                    const qx = queue[head++];
                    const qy = queue[head++];
                    const idx = qy * w + qx;
                    if (visited[idx]) continue;
                    visited[idx] = 1;
                    const pIdx = idx * 4;
                    if (!nearBg(pIdx, 60)) continue;
                    data[pIdx + 3] = 0;
                    if (qx > 0 && !visited[idx - 1]) queue.push(qx - 1, qy);
                    if (qx < w - 1 && !visited[idx + 1]) queue.push(qx + 1, qy);
                    if (qy > 0 && !visited[idx - w]) queue.push(qx, qy - 1);
                    if (qy < h - 1 && !visited[idx + w]) queue.push(qx, qy + 1);
                }
                for (let i = 0; i < w * h; i++) {
                    if (data[i * 4 + 3] !== 0 && nearBg(i * 4, 32)) data[i * 4 + 3] = 0;
                }
                ctx.putImageData(imgData, 0, 0);
            } else {
                // Exterior flood-fill so black clothing/robes inside stay solid!
                const visited = new Uint8Array(w * h);
                const queue = [];

                for (let x = 0; x < w; x++) {
                    queue.push(x, 0);
                    queue.push(x, h - 1);
                }
                for (let y = 0; y < h; y++) {
                    queue.push(0, y);
                    queue.push(w - 1, y);
                }

                let head = 0;
                while (head < queue.length) {
                    const qx = queue[head++];
                    const qy = queue[head++];
                    const idx = qy * w + qx;
                    if (visited[idx]) continue;
                    visited[idx] = 1;

                    const pIdx = idx * 4;
                    const r = data[pIdx];
                    const g = data[pIdx + 1];
                    const b = data[pIdx + 2];

                    let isMatch = false;
                    if (removeBg === 'white') {
                        isMatch = (r > 225 && g > 225 && b > 225);
                    } else {
                        // Black / dark background
                        const lum = r * 0.299 + g * 0.587 + b * 0.114;
                        isMatch = (lum < 42);
                    }

                    if (isMatch) {
                        data[pIdx + 3] = 0;
                        if (qx > 0 && !visited[idx - 1]) queue.push(qx - 1, qy);
                        if (qx < w - 1 && !visited[idx + 1]) queue.push(qx + 1, qy);
                        if (qy > 0 && !visited[idx - w]) queue.push(qx, qy - 1);
                        if (qy < h - 1 && !visited[idx + w]) queue.push(qx, qy + 1);
                    }
                }
                ctx.putImageData(imgData, 0, 0);
            }
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        this.cache.set(cacheKey, texture);
        return texture;
    }

    /**
     * sdServerからギャラリー画像一覧を取得
     */
    async fetchGallery(groupTag = '', limit = 30) {
        const res = await fetch(`/api/sdProxy?action=list&groupTag=${encodeURIComponent(groupTag)}&limit=${limit}`);
        return await res.json();
    }

    /**
     * sdServerの生成設定・サーバー一覧を取得
     */
    async fetchConfig() {
        const res = await fetch(`/api/sdProxy?action=config`);
        return await res.json();
    }

    /**
     * 新規画像生成リクエストを送信
     */
    async startGeneration(payload) {
        const res = await fetch('/api/sdProxy?action=generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        return await res.json();
    }

    /**
     * 生成ステータスをポーリング確認
     */
    async checkStatus(taskId) {
        const res = await fetch(`/api/sdProxy?action=status&taskId=${encodeURIComponent(taskId)}`);
        return await res.json();
    }
}
