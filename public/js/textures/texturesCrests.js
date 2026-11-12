// 国の紋章の盾（街の門の真ん中に掲げる）のテクスチャ。RetroTextureGenerator に組み込む。
// 盾の形は、ボコスカ島の全国共通。地色・縁・紋章だけが、国ごとに違う（街だけに付け、町の門には付けない）。
import * as THREE from '/js/three.module.js';

const GOLD = '#e0b43c', SILVER = '#d3dad6';

// 国ごとの盾（ground: 地色、edge: 縁の色、draw: 紋章。盾の中は 48×60 の座標。中心は x = 24）
const CRESTS = {
    d: {   // グリーン王国: 緑の地に金の縁・金の王冠と麦の穂
        ground: '#2f7a3c', edge: GOLD,
        draw(ctx) {
            ctx.fillStyle = GOLD;
            ctx.beginPath(); ctx.moveTo(13, 30); ctx.lineTo(13, 16); ctx.lineTo(19, 24); ctx.lineTo(24, 13); ctx.lineTo(29, 24); ctx.lineTo(35, 16); ctx.lineTo(35, 30); ctx.closePath(); ctx.fill();
            ctx.fillRect(13, 30, 22, 5);
            ctx.fillStyle = '#c93a3a'; for (const x of [18, 24, 30]) { ctx.beginPath(); ctx.arc(x, 32.5, 1.6, 0, 7); ctx.fill(); }
            ctx.strokeStyle = '#e9d27a'; ctx.lineWidth = 1.4;   // 麦の穂（王冠の下）
            for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(24, 50); ctx.quadraticCurveTo(24 + s * 8, 46, 24 + s * 11, 39); ctx.stroke(); for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.ellipse(24 + s * (7 + k * 1.6), 45 - k * 2.6, 1.4, 2.4, s * 0.6, 0, 7); ctx.fillStyle = '#e9d27a'; ctx.fill(); } }
        },
    },
    b: {   // フランケル聖国: 白地に金の縁・金の十字と光の輪
        ground: '#f3f0e4', edge: GOLD,
        draw(ctx) {
            ctx.strokeStyle = GOLD; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.arc(24, 28, 16, 0, 7); ctx.stroke();   // 光輪
            ctx.fillStyle = GOLD; ctx.fillRect(21, 12, 6, 34); ctx.fillRect(13, 21, 22, 6);   // 十字
        },
    },
    g: {   // デイラミ精霊国: 深い緑の地に銀の縁・世界樹（根と枝が、輪になる）
        ground: '#1d4a2c', edge: SILVER,
        draw(ctx) {
            ctx.strokeStyle = SILVER; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(24, 29, 18, 0, 7); ctx.stroke();   // 輪
            ctx.fillStyle = '#7a5a36'; ctx.fillRect(22, 27, 4, 14);   // 幹
            ctx.strokeStyle = '#7a5a36'; ctx.lineWidth = 1.6;   // 根
            for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(24, 40); ctx.quadraticCurveTo(24 + s * 5, 44, 24 + s * 11, 43); ctx.stroke(); }
            ctx.fillStyle = '#6fcf7a';   // 葉の冠
            for (const [x, y, r] of [[24, 19, 10], [15, 25, 7], [33, 25, 7]]) { ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); }
            ctx.fillStyle = '#b9f0c0'; ctx.beginPath(); ctx.arc(21, 16, 3, 0, 7); ctx.fill();
        },
    },
    a: {   // キュラビッド帝国: 藍色の地に銀の縁・雪の結晶と山の稜線
        ground: '#27386b', edge: SILVER,
        draw(ctx) {
            ctx.strokeStyle = '#eaf3ff'; ctx.lineWidth = 1.6;
            for (let k = 0; k < 3; k++) { const a = k * Math.PI / 3; ctx.beginPath(); ctx.moveTo(24 - Math.cos(a) * 12, 23 - Math.sin(a) * 12); ctx.lineTo(24 + Math.cos(a) * 12, 23 + Math.sin(a) * 12); ctx.stroke(); }
            for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3, x = 24 + Math.cos(a) * 8, y = 23 + Math.sin(a) * 8; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a + 0.9) * 4, y + Math.sin(a + 0.9) * 4); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a - 0.9) * 4, y + Math.sin(a - 0.9) * 4); ctx.stroke(); }
            ctx.fillStyle = '#dfe8f4'; ctx.beginPath(); ctx.moveTo(8, 50); ctx.lineTo(18, 37); ctx.lineTo(23, 43); ctx.lineTo(30, 33); ctx.lineTo(40, 50); ctx.closePath(); ctx.fill();
        },
    },
    c: {   // ミレニアム自由都市: 砂色の地に金の縁・三日月と秤
        ground: '#c9a35a', edge: GOLD,
        draw(ctx) {
            ctx.fillStyle = '#fff3c4'; ctx.beginPath(); ctx.arc(24, 21, 11, 0, 7); ctx.fill();
            ctx.fillStyle = '#c9a35a'; ctx.beginPath(); ctx.arc(28, 19, 10, 0, 7); ctx.fill();   // 三日月
            ctx.strokeStyle = '#5a3a16'; ctx.lineWidth = 1.6;   // 秤
            ctx.beginPath(); ctx.moveTo(24, 33); ctx.lineTo(24, 49); ctx.moveTo(14, 37); ctx.lineTo(34, 37); ctx.moveTo(10, 49); ctx.lineTo(38, 49); ctx.stroke();
            for (const x of [14, 34]) { ctx.beginPath(); ctx.moveTo(x, 37); ctx.lineTo(x - 4, 44); ctx.moveTo(x, 37); ctx.lineTo(x + 4, 44); ctx.stroke(); ctx.beginPath(); ctx.arc(x, 44, 4, 0, Math.PI); ctx.stroke(); }
        },
    },
    e: {   // ガリレオ連盟: 紺の地に白の縁・帆船と錨
        ground: '#1c3f6e', edge: '#f1f4f7',
        draw(ctx) {
            ctx.fillStyle = '#f1f4f7'; ctx.beginPath(); ctx.moveTo(24, 10); ctx.lineTo(35, 29); ctx.lineTo(24, 29); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.moveTo(22, 12); ctx.lineTo(22, 29); ctx.lineTo(13, 29); ctx.closePath(); ctx.fill();   // 帆
            ctx.fillStyle = '#8a5a2c'; ctx.beginPath(); ctx.moveTo(11, 31); ctx.lineTo(37, 31); ctx.lineTo(32, 37); ctx.lineTo(16, 37); ctx.closePath(); ctx.fill();   // 船体
            ctx.strokeStyle = '#f1f4f7'; ctx.lineWidth = 1.6;   // 錨
            ctx.beginPath(); ctx.moveTo(24, 40); ctx.lineTo(24, 51); ctx.moveTo(20, 43); ctx.lineTo(28, 43); ctx.stroke(); ctx.beginPath(); ctx.arc(24, 47, 6, 0.1, Math.PI - 0.1); ctx.stroke(); ctx.beginPath(); ctx.arc(24, 39.5, 1.5, 0, 7); ctx.stroke();
        },
    },
    f: {   // ライアン獣王国: 赤茶の地に鉄色の縁・獅子の頭とツルハシ
        ground: '#7a3a22', edge: '#a3a9ae',
        draw(ctx) {
            ctx.strokeStyle = '#c8ccd0'; ctx.lineWidth = 1.8;   // 交差したツルハシ（頭の下）
            for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(24 - s * 12, 51); ctx.lineTo(24 + s * 12, 37); ctx.stroke(); ctx.beginPath(); ctx.arc(24 + s * 12, 41, 5, s > 0 ? -2.2 : -0.9, s > 0 ? -0.9 : 2.2 - 1.3); ctx.stroke(); }
            ctx.fillStyle = '#b8651f'; ctx.beginPath(); ctx.arc(24, 24, 14, 0, 7); ctx.fill();   // たてがみ
            ctx.fillStyle = '#e0aa5c'; ctx.beginPath(); ctx.arc(24, 25, 9, 0, 7); ctx.fill();   // 顔
            ctx.fillStyle = '#e0aa5c'; for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(24 + s * 8, 14, 3, 0, 7); ctx.fill(); }   // 耳
            ctx.fillStyle = '#2a1408'; ctx.fillRect(19, 22, 3, 3); ctx.fillRect(26, 22, 3, 3); ctx.fillRect(22, 28, 4, 3);   // 目と鼻
        },
    },
    i: {   // カナロア公国: 水色の地に白の縁・水滴と波
        ground: '#2f7fb8', edge: '#f1f6fa',
        draw(ctx) {
            ctx.fillStyle = '#f1f9ff'; ctx.beginPath(); ctx.moveTo(24, 10); ctx.quadraticCurveTo(36, 26, 36, 31); ctx.arc(24, 31, 12, 0, Math.PI); ctx.quadraticCurveTo(12, 26, 24, 10); ctx.fill();   // 水滴
            ctx.fillStyle = '#8fd0f0'; ctx.beginPath(); ctx.arc(20, 31, 3, 0, 7); ctx.fill();
            ctx.strokeStyle = '#f1f9ff'; ctx.lineWidth = 1.8;   // 波
            for (const y of [44, 50]) { ctx.beginPath(); ctx.moveTo(8, y); for (let x = 8; x <= 40; x += 8) ctx.quadraticCurveTo(x + 4, y - 4, x + 8, y); ctx.stroke(); }
        },
    },
    j: {   // カラー魔導国: 紫の地に金の縁・星と魔法陣
        ground: '#4a2a7a', edge: GOLD,
        draw(ctx) {
            ctx.strokeStyle = GOLD; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(24, 29, 17, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.arc(24, 29, 13.5, 0, 7); ctx.stroke();   // 魔法陣の円
            ctx.fillStyle = '#ffe28a'; ctx.beginPath();   // 五芒星
            for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? 6 : 13; ctx.lineTo(24 + Math.cos(a) * r, 29 + Math.sin(a) * r); }
            ctx.closePath(); ctx.fill();
        },
    },
};

export const crestTextures = {
    // 国の紋章の盾（透明な背景）。id: CRESTS のキー（国の ID）
    createCrestTexture(id) {
        const spec = CRESTS[id];
        const canvas = document.createElement('canvas');
        canvas.width = 48; canvas.height = 60;
        const ctx = canvas.getContext('2d');
        const shield = () => { ctx.beginPath(); ctx.moveTo(3, 3); ctx.lineTo(45, 3); ctx.lineTo(45, 32); ctx.quadraticCurveTo(45, 52, 24, 58); ctx.quadraticCurveTo(3, 52, 3, 32); ctx.closePath(); };
        shield(); ctx.fillStyle = spec.edge; ctx.fill();   // 縁
        ctx.save(); ctx.translate(24, 31); ctx.scale(0.86, 0.86); ctx.translate(-24, -31);
        shield(); ctx.fillStyle = spec.ground; ctx.fill(); ctx.clip();   // 地
        ctx.restore();
        ctx.save(); ctx.translate(24, 31); ctx.scale(0.86, 0.86); ctx.translate(-24, -31); spec.draw(ctx); ctx.restore();
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        return texture;
    },
};
