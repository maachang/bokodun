import * as THREE from '/js/three.module.js';

export class SDAssetManager {
    constructor() {
        this.cache = new Map();
    }

    /**
     * sdServerから画像を取得してTHREE.CanvasTextureを生成（背景透過はsdServer側で処理済み）
     * @param {string} imagePath sdServerの/uploads/xxx.png
     * @returns {Promise<THREE.CanvasTexture>}
     */
    async loadTexture(imagePath) {
        const cacheKey = imagePath;
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
