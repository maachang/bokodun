// 屋根・ドーム・扉・屋内の床・店の看板のテクスチャ。RetroTextureGenerator の静的メソッド（public/js/textures.js が、クラスの定義のあとで、RetroTextureGenerator へ組み込む）。
// 元は public/js/textures.js の RetroTextureGenerator。移しただけで、動きは同じ（ファイルが長すぎて、編集の誤りが増えるため分割した）
import * as THREE from '/js/three.module.js';
import { RetroTextureGenerator } from '/js/textures.js';

// ---- 店のマーク（drawShopMark から分けた、種類ごとの絵。32×32 の枠の中に描く。ctx は、平行移動・拡大を済ませた状態） ----
function drawMarkWeapon(ctx) {
    // 剣（左下の柄から、右上の切っ先へ）
    ctx.fillStyle = '#e5e7eb';
    ctx.strokeStyle = '#374151';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(27, 3); ctx.lineTo(30, 6); ctx.lineTo(15, 21); ctx.lineTo(11, 17);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#b8862b';   // 鍔
    ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.moveTo(8, 15); ctx.lineTo(17, 24); ctx.stroke();
    ctx.strokeStyle = '#5b3a1a';   // 柄
    ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.moveTo(11.5, 20.5); ctx.lineTo(6.5, 25.5); ctx.stroke();
    ctx.fillStyle = '#facc15';     // 柄頭
    ctx.beginPath(); ctx.arc(5, 27, 2.2, 0, Math.PI * 2); ctx.fill();
}

function drawMarkTemple(ctx) {
    // 十字架（金色。濃い縁取りと、左上のハイライト）
    ctx.fillStyle = '#facc15';
    ctx.strokeStyle = '#7c5a10';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(13.5, 3); ctx.lineTo(18.5, 3); ctx.lineTo(18.5, 10); ctx.lineTo(26, 10); ctx.lineTo(26, 15);
    ctx.lineTo(18.5, 15); ctx.lineTo(18.5, 29); ctx.lineTo(13.5, 29); ctx.lineTo(13.5, 15); ctx.lineTo(6, 15);
    ctx.lineTo(6, 10); ctx.lineTo(13.5, 10);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fef9c3';     // ハイライト
    ctx.fillRect(14.6, 4.2, 1.4, 5);
    ctx.fillRect(7.2, 11, 5, 1.4);
}

function drawMarkAdventurer(ctx) {
    // 交差した2本の剣（冒険者ギルド）
    for (const dir of [1, -1]) {
        ctx.save();
        ctx.translate(16, 16); ctx.rotate(dir * Math.PI / 4);
        ctx.fillStyle = '#e5e7eb'; ctx.strokeStyle = '#374151'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(3, -9); ctx.lineTo(3, 6); ctx.lineTo(-3, 6); ctx.lineTo(-3, -9); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#b8862b'; ctx.fillRect(-7, 6, 14, 3);      // 鍔
        ctx.fillStyle = '#5b3a1a'; ctx.fillRect(-1.5, 9, 3, 6);     // 柄
        ctx.fillStyle = '#facc15'; ctx.beginPath(); ctx.arc(0, 16, 2, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    }
}

function drawMarkMage(ctx) {
    // 輝く星と宝珠（魔法ギルド）
    ctx.fillStyle = '#a78bfa'; ctx.strokeStyle = '#4c1d95'; ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
        const r = i % 2 === 0 ? 14 : 5, a = i * Math.PI / 4 - Math.PI / 2;
        ctx.lineTo(16 + Math.cos(a) * r, 16 + Math.sin(a) * r);
    }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#e0f2fe'; ctx.beginPath(); ctx.arc(16, 16, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fef08a'; ctx.fillRect(4, 5, 2, 2); ctx.fillRect(26, 24, 2, 2); ctx.fillRect(25, 5, 2, 2);
}

function drawMarkMerchant(ctx) {
    // 金貨の山（商人ギルド）
    ctx.strokeStyle = '#7c5a10'; ctx.lineWidth = 1.3;
    for (const [cx, cy] of [[16, 25], [16, 19], [16, 13]]) {
        ctx.fillStyle = '#b8862b'; ctx.beginPath(); ctx.ellipse(cx, cy + 2, 11, 4, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#facc15'; ctx.beginPath(); ctx.ellipse(cx, cy, 11, 4, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    ctx.fillStyle = '#fef9c3'; ctx.fillRect(10, 11.5, 4, 1.2);
}

function drawMarkSmith(ctx) {
    // 金床と火花（鍛冶屋）
    ctx.fillStyle = '#4b5563'; ctx.strokeStyle = '#111827'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(3, 12); ctx.lineTo(8, 9); ctx.lineTo(28, 9); ctx.lineTo(28, 14); ctx.lineTo(21, 14); ctx.lineTo(21, 21); ctx.lineTo(26, 26); ctx.lineTo(26, 29); ctx.lineTo(6, 29); ctx.lineTo(6, 26); ctx.lineTo(11, 21); ctx.lineTo(11, 14); ctx.lineTo(8, 14); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#9ca3af'; ctx.fillRect(9, 10, 18, 1.6);
    ctx.fillStyle = '#fb923c'; ctx.fillRect(14, 4, 2.4, 2.4); ctx.fillRect(19, 2, 2, 2); ctx.fillRect(10, 3, 2, 2);
}

function drawMarkTraining(ctx) {
    // 的と矢（職業訓練所）
    for (const [r, c] of [[14, '#ef4444'], [10.5, '#f9fafb'], [7, '#ef4444'], [3.5, '#f9fafb']]) {
        ctx.fillStyle = c; ctx.strokeStyle = '#374151'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(16, 16, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    ctx.strokeStyle = '#5b3a1a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(16, 16); ctx.lineTo(28, 4); ctx.stroke();
    ctx.fillStyle = '#f9fafb'; ctx.fillRect(26, 2, 4, 3);
}

function drawMarkThief(ctx) {
    // 短剣と鍵穴（盗賊ギルド）
    ctx.fillStyle = '#9ca3af'; ctx.strokeStyle = '#111827'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(16, 2); ctx.lineTo(20, 14); ctx.lineTo(16, 18); ctx.lineTo(12, 14); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#374151'; ctx.fillRect(8, 18, 16, 3); ctx.strokeRect(8, 18, 16, 3);
    ctx.fillStyle = '#7f1d1d'; ctx.fillRect(14, 21, 4, 8);
    ctx.fillStyle = '#facc15'; ctx.beginPath(); ctx.arc(16, 30, 1.6, 0, Math.PI * 2); ctx.fill();
}

function drawMarkInn(ctx) {
    // ベッドと月（宿屋）
    ctx.fillStyle = '#8b5a2b'; ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 1.4;
    ctx.fillRect(3, 14, 3, 14); ctx.strokeRect(3, 14, 3, 14);          // 頭側の板
    ctx.fillRect(4, 20, 25, 4); ctx.strokeRect(4, 20, 25, 4);          // 枠
    ctx.fillStyle = '#e8e0d0'; ctx.fillRect(7, 15, 8, 5);              // 枕
    ctx.fillStyle = '#6a8adf'; ctx.fillRect(14, 16, 14, 5);            // 掛け布
    ctx.fillRect(26, 24, 3, 4); ctx.fillStyle = '#facc15';
    ctx.beginPath(); ctx.arc(24, 8, 5, 0, Math.PI * 2); ctx.fill();    // 月
    ctx.fillStyle = '#1f2937'; ctx.beginPath(); ctx.arc(26, 7, 4.2, 0, Math.PI * 2); ctx.fill();
}

function drawMarkBar(ctx) {
    // ジョッキ（酒場）
    ctx.fillStyle = '#f59e0b'; ctx.strokeStyle = '#7c2d12'; ctx.lineWidth = 1.5;
    ctx.fillRect(6, 10, 15, 18); ctx.strokeRect(6, 10, 15, 18);
    ctx.beginPath(); ctx.arc(24, 18, 4.5, -Math.PI / 2, Math.PI / 2); ctx.stroke();
    ctx.fillStyle = '#fef3c7'; ctx.beginPath(); ctx.arc(9, 9, 3.5, 0, Math.PI * 2); ctx.arc(14, 7, 4, 0, Math.PI * 2); ctx.arc(19, 9, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fcd34d'; ctx.fillRect(8, 14, 2, 11);
}

function drawMarkItem(ctx) {
    // 薬びん（三角フラスコ: 細い首と栓、裾の広い瓶に緑の薬と泡。丸い赤だとグローブに見えるので、形と色を変えた）
    ctx.strokeStyle = '#374151';
    ctx.lineWidth = 1.6;
    ctx.fillStyle = '#e0f2fe';     // ガラス
    ctx.beginPath();
    ctx.moveTo(13, 6); ctx.lineTo(13, 13); ctx.lineTo(5, 26); ctx.lineTo(7, 29);
    ctx.lineTo(25, 29); ctx.lineTo(27, 26); ctx.lineTo(19, 13); ctx.lineTo(19, 6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#22c55e';     // 薬（下のほう）
    ctx.beginPath();
    ctx.moveTo(10.5, 19); ctx.lineTo(21.5, 19); ctx.lineTo(27, 26); ctx.lineTo(25, 29);
    ctx.lineTo(7, 29); ctx.lineTo(5, 26);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#bbf7d0';     // 薬の水面と泡
    ctx.fillRect(10.5, 19, 11, 2);
    ctx.beginPath(); ctx.arc(13, 24, 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(18.5, 26, 1.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath();               // 外形
    ctx.moveTo(13, 6); ctx.lineTo(13, 13); ctx.lineTo(5, 26); ctx.lineTo(7, 29);
    ctx.lineTo(25, 29); ctx.lineTo(27, 26); ctx.lineTo(19, 13); ctx.lineTo(19, 6);
    ctx.closePath();
    ctx.stroke();
    ctx.fillStyle = '#b45309';     // 栓
    ctx.fillRect(12, 2, 8, 5);
    ctx.strokeRect(12, 2, 8, 5);
}

const SHOP_MARK_DRAWERS = { weapon: drawMarkWeapon, temple: drawMarkTemple, adventurer: drawMarkAdventurer, mage: drawMarkMage, merchant: drawMarkMerchant, smith: drawMarkSmith, training: drawMarkTraining, thief: drawMarkThief, inn: drawMarkInn, bar: drawMarkBar, item: drawMarkItem };   // 店の種類 → 描く関数（ない種類は、item = 薬びん）

export const roofDoorTextures = {
    // 10. Heavy Dungeon Iron/Wood Door
    createDoorTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        // Dark aged oak background
        ctx.fillStyle = '#452b16';
        ctx.fillRect(0, 0, 64, 64);

        // Stone/Iron Frame Border
        ctx.strokeStyle = '#27190d';
        ctx.lineWidth = 3;
        ctx.strokeRect(1, 1, 62, 62);

        // Vertical wood planks
        ctx.strokeStyle = '#2b1b0e';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(16, 0); ctx.lineTo(16, 64);
        ctx.moveTo(32, 0); ctx.lineTo(32, 64);
        ctx.moveTo(48, 0); ctx.lineTo(48, 64);
        ctx.stroke();

        // Horizontal Iron reinforcement bands
        const bands = [12, 34, 52];
        bands.forEach(by => {
            ctx.fillStyle = '#1e2229';
            ctx.fillRect(2, by, 60, 6);
            ctx.fillStyle = '#64748b'; // Highlight
            ctx.fillRect(2, by, 60, 1);
            // Iron rivets / bolts
            for (let rx = 8; rx <= 56; rx += 12) {
                ctx.fillStyle = '#cbd5e1';
                ctx.fillRect(rx, by + 2, 2, 2);
            }
        });

        // Golden Brass Keyhole / Door Knocker Ring in center
        ctx.fillStyle = '#d97706';
        ctx.fillRect(44, 28, 4, 8);
        ctx.fillStyle = '#fef08a';
        ctx.fillRect(44, 28, 4, 2);
        ctx.fillStyle = '#0f0a05';
        ctx.fillRect(45, 31, 2, 3); // Keyhole

        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        return texture;
    },

    // 13. Village Roof Texture (thatched / red-brown tile roof)
    createVillageRoofTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        // Terracotta / Cedar shingle tiles
        ctx.fillStyle = '#5c2c16';
        ctx.fillRect(0, 0, 64, 64);

        const rowH = 10;
        const tileColors = ['#9c4927', '#b55831', '#853e20', '#a84e2a'];
        for (let y = 0; y < 64; y += rowH) {
            const shift = ((y / rowH) % 2 === 0) ? 0 : 8;
            for (let x = -8; x < 64; x += 16) {
                ctx.fillStyle = tileColors[Math.floor(Math.random() * tileColors.length)];
                ctx.fillRect(x + shift + 1, y + 1, 14, rowH - 2);

                // Shingle highlights & shadow
                ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
                ctx.fillRect(x + shift + 1, y + 1, 14, 2);
                ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
                ctx.fillRect(x + shift + 1, y + rowH - 2, 14, 1);
            }
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        return texture;
    },

    // 18. City Slate Blue Roof Texture (French/German Parisian blue slate roofs)
    createCityRoofTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        // Dark navy slate base
        ctx.fillStyle = '#1e2430';
        ctx.fillRect(0, 0, 64, 64);

        // Blue-grey slate shingles
        const rowH = 8;
        const slateColors = ['#334155', '#3f4f66', '#2b384a', '#475569'];
        for (let y = 0; y < 64; y += rowH) {
            const shift = ((y / rowH) % 2 === 0) ? 0 : 8;
            for (let x = -8; x < 64; x += 16) {
                ctx.fillStyle = slateColors[Math.floor(Math.random() * slateColors.length)];
                ctx.fillRect(x + shift + 1, y + 1, 14, rowH - 2);

                // Top highlight
                ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
                ctx.fillRect(x + shift + 1, y + 1, 14, 1);
                // Bottom shadow
                ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
                ctx.fillRect(x + shift + 1, y + rowH - 2, 14, 1);
            }
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        return texture;
    },

    createAdobeRoofTexture() {   // 平らな屋根（踏み固めた土・漆喰）
        const canvas = document.createElement('canvas');
        canvas.width = 64; canvas.height = 64;
        const ctx = canvas.getContext('2d');
        const rnd = RetroTextureGenerator.snowRng(8821);
        ctx.fillStyle = '#c9a56e'; ctx.fillRect(0, 0, 64, 64);
        for (let i = 0; i < 220; i++) {
            ctx.fillStyle = rnd() < 0.5 ? 'rgba(130, 95, 50, 0.25)' : 'rgba(245, 225, 175, 0.3)';
            ctx.fillRect(Math.floor(rnd() * 62), Math.floor(rnd() * 62), 1 + Math.floor(rnd() * 3), 1 + Math.floor(rnd() * 3));
        }
        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter; texture.minFilter = THREE.NearestFilter;
        texture.wrapS = THREE.RepeatWrapping; texture.wrapT = THREE.RepeatWrapping;
        return texture;
    },

    createDomeTileTexture() {   // ドームの、青緑（ターコイズ）のタイル。白と紺の幾何学模様
        const canvas = document.createElement('canvas');
        canvas.width = 64; canvas.height = 64;
        const ctx = canvas.getContext('2d');
        const rnd = RetroTextureGenerator.snowRng(3131);
        ctx.fillStyle = '#1f9aa0'; ctx.fillRect(0, 0, 64, 64);
        for (let y = 0; y < 64; y += 8) for (let x = 0; x < 64; x += 8) {
            ctx.fillStyle = rnd() < 0.5 ? '#2bb0b4' : '#178288'; ctx.fillRect(x + 1, y + 1, 6, 6);   // タイルの濃淡
        }
        ctx.fillStyle = '#f4efe0';   // 白い菱形の列
        for (let x = 0; x < 64; x += 16) { ctx.fillRect(x + 7, 16, 2, 2); ctx.fillRect(x + 6, 17, 4, 0); ctx.fillRect(x + 7, 40, 2, 2); }
        ctx.fillStyle = '#14335f';   // 紺の帯
        ctx.fillRect(0, 30, 64, 2); ctx.fillRect(0, 54, 64, 2);
        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter; texture.minFilter = THREE.NearestFilter;
        texture.wrapS = THREE.RepeatWrapping; texture.wrapT = THREE.RepeatWrapping;
        return texture;
    },

    createSnowRoofTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64; canvas.height = 64;
        const ctx = canvas.getContext('2d');
        const rnd = RetroTextureGenerator.snowRng(20261108);
        ctx.fillStyle = '#1e2430'; ctx.fillRect(0, 0, 64, 64);
        const rowH = 8, slate = ['#334155', '#3f4f66', '#2b384a', '#475569'];
        for (let y = 0; y < 64; y += rowH) {
            const shift = ((y / rowH) % 2 === 0) ? 0 : 8;
            for (let x = -8; x < 64; x += 16) {
                ctx.fillStyle = slate[Math.floor(rnd() * slate.length)];
                ctx.fillRect(x + shift + 1, y + 1, 14, rowH - 2);
                ctx.fillStyle = 'rgba(0, 0, 0, 0.4)'; ctx.fillRect(x + shift + 1, y + rowH - 2, 14, 1);
            }
        }
        // 雪: 瓦の上の段ごとに、白い雪が、ふくらんで積もる（下の縁は、少し青い影）。全体の 6 割ほど
        for (let y = 0; y < 64; y += rowH) {
            for (let x = 0; x < 64; x += 2) {
                const h = Math.floor(2 + rnd() * 5 + 1.5 * Math.sin((x + y) / 6));
                ctx.fillStyle = '#f3f7fb'; ctx.fillRect(x, y, 2, Math.min(rowH - 1, h));
                ctx.fillStyle = '#c9d8e8'; ctx.fillRect(x, y + Math.min(rowH - 1, h), 2, 1);
            }
        }
        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter; texture.minFilter = THREE.NearestFilter;
        texture.wrapS = THREE.RepeatWrapping; texture.wrapT = THREE.RepeatWrapping;
        return texture;
    },

    // 家の中の板張りの床（明るい木目の縦板）
    createWoodFloorTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#2a1a0e';
        ctx.fillRect(0, 0, 64, 64);
        const tones = ['#a8764a', '#b9855a', '#98683f', '#c0905f'];
        for (let x = 0; x < 64; x += 16) {
            ctx.fillStyle = tones[(x / 16 + 1) % tones.length];
            ctx.fillRect(x + 1, 0, 14, 64);
            ctx.fillStyle = 'rgba(0, 0, 0, 0.14)';
            ctx.fillRect(x + 5, 0, 1, 64);
            ctx.fillRect(x + 10, 0, 1, 64);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.10)';
            ctx.fillRect(x + 2, 0, 1, 64);
            // 板の継ぎ目
            ctx.fillStyle = '#2a1a0e';
            ctx.fillRect(x + 1, ((x / 16) * 23) % 56 + 6, 14, 1);
        }
        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        return texture;
    },

    // 神殿の大理石の床（象牙色と薄い灰色の市松、淡い筋、金の細い縁）
    createMarbleFloorTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        for (let gy = 0; gy < 2; gy++) for (let gx = 0; gx < 2; gx++) {
            ctx.fillStyle = (gx + gy) % 2 === 0 ? '#fcfaf4' : '#ecebe8';
            ctx.fillRect(gx * 32, gy * 32, 32, 32);
            ctx.fillStyle = 'rgba(160, 156, 146, 0.16)';
            ctx.fillRect(gx * 32 + 5, gy * 32 + 8 + gx * 6, 18, 1);
            ctx.fillRect(gx * 32 + 14, gy * 32 + 20, 12, 1);
        }
        ctx.fillStyle = 'rgba(190, 160, 80, 0.55)';   // 金の目地
        ctx.fillRect(31, 0, 2, 64);
        ctx.fillRect(0, 31, 64, 2);
        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        return texture;
    },

    // 家の中の敷物（赤地に金の縁取りと菱形の模様）
    createRugTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#7a1f24';
        ctx.fillRect(0, 0, 64, 64);
        ctx.fillStyle = '#d4a84a';
        ctx.fillRect(2, 2, 60, 2);
        ctx.fillRect(2, 60, 60, 2);
        ctx.fillRect(2, 2, 2, 60);
        ctx.fillRect(60, 2, 2, 60);
        ctx.fillStyle = '#4a1216';
        ctx.fillRect(8, 8, 48, 48);
        ctx.fillStyle = '#b8863a';
        for (let i = 0; i < 4; i++) {
            const cx = 32, cy = 32, d = 22 - i * 6;
            ctx.beginPath();
            ctx.moveTo(cx, cy - d);
            ctx.lineTo(cx + d, cy);
            ctx.lineTo(cx, cy + d);
            ctx.lineTo(cx - d, cy);
            ctx.closePath();
            if (i % 2 === 0) ctx.fill();
            else { ctx.fillStyle = '#4a1216'; ctx.fill(); ctx.fillStyle = '#b8863a'; }
        }
        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        return texture;
    },

    // 家の木の扉（縦板に鉄の帯と取っ手）
    createWoodDoorTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        const tones = ['#8a5a30', '#7a4e28', '#96653a', '#6e4624'];
        for (let x = 0; x < 64; x += 16) {
            ctx.fillStyle = tones[(x / 16) % tones.length];
            ctx.fillRect(x, 0, 16, 128);
            ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
            ctx.fillRect(x, 0, 1, 128);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
            ctx.fillRect(x + 3, 0, 1, 128);
        }
        ctx.fillStyle = '#2b2b30';
        ctx.fillRect(0, 22, 64, 8);
        ctx.fillRect(0, 98, 64, 8);
        ctx.fillStyle = '#555560';
        for (let x = 6; x < 64; x += 20) { ctx.fillRect(x, 24, 3, 3); ctx.fillRect(x, 100, 3, 3); }
        ctx.fillStyle = '#d4a84a';
        ctx.fillRect(50, 62, 6, 6);
        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        return texture;
    },

    // 店のマーク（32×32 の枠の中に描く）: weapon = 剣、item = 薬びん。立て札の板と、扉の上のアイコンで共通に使う
    drawShopMark(ctx, kind, x, y, size) {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(size / 32, size / 32);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        (SHOP_MARK_DRAWERS[kind] ?? SHOP_MARK_DRAWERS.item)(ctx);
        ctx.restore();
    },

    // 扉の上に出す、店のアイコン（丸い札の中に、店のマーク）
    createShopIconTexture(kind) {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#1f2937';
        ctx.beginPath(); ctx.arc(32, 32, 30, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(32, 32, 28, 0, Math.PI * 2); ctx.stroke();
        RetroTextureGenerator.drawShopMark(ctx, kind, 12, 12, 40);
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        return texture;
    },

    // 店の立て札: 細い柱の上に、横長の板が乗った T 型のシンプルな看板（板に店のマークを描く）
    createShopSignTexture(kind) {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 96;
        const ctx = canvas.getContext('2d');

        // 柱（板の下から、地面まで）
        ctx.fillStyle = '#6b4423';
        ctx.fillRect(28, 28, 8, 68);
        ctx.fillStyle = '#8a5a2e';
        ctx.fillRect(28, 28, 3, 68);
        ctx.fillStyle = '#4a2f18';
        ctx.fillRect(34, 28, 2, 68);

        // 板（柱の上に横長に乗せる）
        ctx.fillStyle = '#4a2f18';
        ctx.fillRect(2, 2, 60, 30);
        ctx.fillStyle = '#c8955a';
        ctx.fillRect(4, 4, 56, 26);
        ctx.fillStyle = '#dcae74';
        ctx.fillRect(4, 4, 56, 4);
        ctx.fillStyle = '#9a6a38';
        ctx.fillRect(4, 26, 56, 4);

        // 店のマーク
        RetroTextureGenerator.drawShopMark(ctx, kind, 18, 3, 28);

        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;   // 板の色を、そのまま出す
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        return texture;
    },
};
