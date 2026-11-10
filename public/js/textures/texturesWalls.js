// 壁（レンガ・石・木・街の壁・店と宿屋の壁・土壁）のテクスチャ。RetroTextureGenerator の静的メソッド（public/js/textures.js が、クラスの定義のあとで、RetroTextureGenerator へ組み込む）。
// 元は public/js/textures.js の RetroTextureGenerator。移しただけで、動きは同じ（ファイルが長すぎて、編集の誤りが増えるため分割した）
import * as THREE from '/js/three.module.js';
import { RetroTextureGenerator } from '/js/textures.js';

export const wallTextures = {
    createBrickTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        // Dark mortar
        ctx.fillStyle = '#222026';
        ctx.fillRect(0, 0, 64, 64);

        // Brick color palette
        const brickColors = ['#8f4035', '#a64a3e', '#73332b', '#5c2923'];

        const rows = 8;
        const rowH = 8;
        for (let r = 0; r < rows; r++) {
            const cols = 4;
            const colW = 16;
            const offset = (r % 2 === 0) ? 0 : 8;
            for (let c = -1; c <= cols; c++) {
                const color = brickColors[Math.floor(Math.random() * brickColors.length)];
                ctx.fillStyle = color;
                ctx.fillRect(c * colW + offset + 1, r * rowH + 1, colW - 2, rowH - 2);

                // Add pixel noise
                for (let px = 0; px < 10; px++) {
                    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.15)';
                    ctx.fillRect(
                        c * colW + offset + 2 + Math.floor(Math.random() * (colW - 4)),
                        r * rowH + 2 + Math.floor(Math.random() * (rowH - 4)),
                        1, 1
                    );
                }
            }
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        return texture;
    },

    // レンガ壁に、木の枠の窓（十字の桟つき、ステンドグラスではない普通のガラス）を付けたテクスチャ（村の神殿の窓）
    createBrickWindowTexture() {
        const texture = this.createBrickTexture();
        const ctx = texture.image.getContext('2d');
        ctx.fillStyle = '#4a2f18';              // 木の枠
        ctx.fillRect(18, 12, 28, 38);
        const grad = ctx.createLinearGradient(0, 15, 0, 47);
        grad.addColorStop(0, '#d6ecfa');         // 外の明るい空
        grad.addColorStop(1, '#8fb8d8');
        ctx.fillStyle = grad;
        ctx.fillRect(21, 15, 22, 32);
        ctx.fillStyle = '#4a2f18';              // 十字の桟
        ctx.fillRect(31, 15, 2, 32);
        ctx.fillRect(21, 30, 22, 2);
        ctx.fillStyle = '#6b4423';              // 窓の下の敷居
        ctx.fillRect(16, 50, 32, 3);
        texture.needsUpdate = true;
        return texture;
    },

    // Mossy stacked natural stone wall for Caverns / Caves (緑色の石積み壁)
    createMossyStoneWallTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        // Dark earthy moss mortar base
        ctx.fillStyle = '#1c281e';
        ctx.fillRect(0, 0, 64, 64);

        // Stacked irregular natural fieldstones with mossy greens and slate tones
        const stonePalette = [
            '#3a5338', '#2e442d', '#496544', '#3d4f3b', // Deep moss greens
            '#526b4f', '#627f5e', '#344933', '#253825', // Olive / lichen greens
            '#4a544b', '#576258'                         // Grayish weathered stone tones
        ];

        // Layer irregular stone courses
        const rows = [
            { y: 0, h: 12, stones: [16, 22, 14, 18] },
            { y: 13, h: 10, stones: [20, 16, 20, 14] },
            { y: 24, h: 14, stones: [14, 24, 18, 16] },
            { y: 39, h: 11, stones: [18, 16, 22, 14] },
            { y: 51, h: 13, stones: [22, 18, 16, 16] }
        ];

        rows.forEach(row => {
            let curX = 0;
            row.stones.forEach(sw => {
                const color = stonePalette[Math.floor(Math.random() * stonePalette.length)];
                ctx.fillStyle = color;
                // Rounded natural stone shape (not rectangular brick)
                ctx.fillRect(curX + 1, row.y + 1, sw - 2, row.h - 2);

                // Top highlight (mossy light glint)
                ctx.fillStyle = 'rgba(167, 243, 137, 0.22)';
                ctx.fillRect(curX + 2, row.y + 1, sw - 4, 2);

                // Bottom shadow
                ctx.fillStyle = 'rgba(10, 20, 12, 0.45)';
                ctx.fillRect(curX + 2, row.y + row.h - 2, sw - 4, 1);

                // Natural stone speckle / moss flecks
                for (let k = 0; k < 4; k++) {
                    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(110, 231, 137, 0.3)' : 'rgba(15, 30, 18, 0.4)';
                    ctx.fillRect(curX + 2 + Math.floor(Math.random() * (sw - 4)), row.y + 2 + Math.floor(Math.random() * (row.h - 4)), 1, 1);
                }

                curX += sw;
            });
        });

        // Dangling / creeping vine moss tendrils across gaps
        ctx.fillStyle = '#4ade80';
        for (let i = 0; i < 24; i++) {
            const vx = Math.floor(Math.random() * 62);
            const vy = Math.floor(Math.random() * 62);
            ctx.fillRect(vx, vy, 1, 2);
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        return texture;
    },

    createRockWallTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');

        // Dark volcanic rock base
        ctx.fillStyle = '#262327';
        ctx.fillRect(0, 0, 128, 128);

        // Craggy rock blocks with layered shading
        const rockHues = ['#3d393d', '#4a444c', '#575059', '#322d33', '#68606b'];
        for (let y = 0; y < 128; y += 16) {
            const shift = (y % 32 === 0) ? 0 : 8;
            for (let x = -8; x < 136; x += 24) {
                const w = 22 + (Math.random() * 4 - 2);
                const h = 14;
                ctx.fillStyle = rockHues[Math.floor(Math.random() * rockHues.length)];
                ctx.fillRect(x + shift + 1, y + 1, w - 2, h - 2);

                // Highlight top edge
                ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
                ctx.fillRect(x + shift + 1, y + 1, w - 2, 2);

                // Shadow bottom edge
                ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
                ctx.fillRect(x + shift + 1, y + h - 2, w - 2, 2);

                // Internal rock crack grain
                for (let k = 0; k < 6; k++) {
                    ctx.fillStyle = Math.random() > 0.5 ? '#1f1b20' : '#7d7480';
                    ctx.fillRect(
                        x + shift + 2 + Math.floor(Math.random() * (w - 4)),
                        y + 2 + Math.floor(Math.random() * (h - 4)),
                        2, 2
                    );
                }
            }
        }

        // Deep jagged vertical crevices
        ctx.strokeStyle = '#141216';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(25, 0); ctx.lineTo(32, 40); ctx.lineTo(20, 80); ctx.lineTo(35, 128);
        ctx.moveTo(85, 0); ctx.lineTo(75, 45); ctx.lineTo(90, 95); ctx.lineTo(80, 128);
        ctx.stroke();

        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        return texture;
    },

    // 11. Village Wooden Wall Texture (for rustic timber houses)
    createWoodWallTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        // Dark mortar / timber shadow base
        ctx.fillStyle = '#27170c';
        ctx.fillRect(0, 0, 64, 64);

        // Horizontal rustic wood logs / timber planks
        const logH = 14;
        const colors = ['#8d5b32', '#a0683b', '#7a4e2b', '#946135'];
        for (let y = 1; y < 64; y += 16) {
            ctx.fillStyle = colors[Math.floor(Math.random() * colors.length)];
            ctx.fillRect(0, y, 64, logH);

            // Wood grain streaks
            ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
            ctx.fillRect(0, y + 4, 64, 2);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
            ctx.fillRect(0, y + 1, 64, 2);

            // Timber end joints / nails
            ctx.fillStyle = '#1e1108';
            ctx.fillRect(6, y + 6, 2, 2);
            ctx.fillRect(56, y + 6, 2, 2);
        }

        // Vertical support studs at intervals
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.fillRect(0, 0, 4, 64);
        ctx.fillRect(60, 0, 4, 64);

        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        return texture;
    },

    // 12. Wooden Fence Texture (for village boundaries & pastures)
    createWoodenFenceTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        // Transparent background between fence rails
        ctx.clearRect(0, 0, 64, 64);

        // Vertical fence posts (wooden stakes with pointed tips)
        const postPositions = [6, 26, 46];
        const postW = 10;
        const postColor = '#8c5930';
        const shadowColor = '#5e381b';
        const highlightColor = '#b57843';

        postPositions.forEach(px => {
            // Shadow side
            ctx.fillStyle = shadowColor;
            ctx.fillRect(px, 12, postW, 52);

            // Main post body
            ctx.fillStyle = postColor;
            ctx.fillRect(px + 2, 12, postW - 3, 52);

            // Highlight side
            ctx.fillStyle = highlightColor;
            ctx.fillRect(px + 1, 12, 2, 52);

            // Pointed picket top
            ctx.fillStyle = postColor;
            ctx.beginPath();
            ctx.moveTo(px + postW / 2, 4);
            ctx.lineTo(px, 12);
            ctx.lineTo(px + postW, 12);
            ctx.closePath();
            ctx.fill();

            // Tip highlight & shadow
            ctx.fillStyle = highlightColor;
            ctx.beginPath();
            ctx.moveTo(px + postW / 2, 4);
            ctx.lineTo(px, 12);
            ctx.lineTo(px + postW / 2, 12);
            ctx.closePath();
            ctx.fill();
        });

        // Horizontal wooden cross rails
        const railYs = [22, 44];
        const railH = 7;
        railYs.forEach(ry => {
            // Shadow
            ctx.fillStyle = shadowColor;
            ctx.fillRect(0, ry + railH - 2, 64, 2);

            // Rail body
            ctx.fillStyle = '#9e6738';
            ctx.fillRect(0, ry, 64, railH - 2);

            // Rail highlight
            ctx.fillStyle = '#c58a52';
            ctx.fillRect(0, ry, 64, 2);

            // Fastener nails on each post intersection
            postPositions.forEach(px => {
                ctx.fillStyle = '#22140a';
                ctx.fillRect(px + postW / 2 - 1, ry + railH / 2 - 1, 2, 2);
            });
        });

        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        return texture;
    },

    // 15. City Stone Wall (European fortified city wall / rampart with stone blocks)
    createCityWallTexture(mortar = '#262930', stoneColors = ['#6e7682', '#7b8391', '#5a616d', '#8a93a3', '#646c78']) {   // 引数: 目地の色・石の色（B 聖国は、白い石）
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        // Dark grey mortar
        ctx.fillStyle = mortar;
        ctx.fillRect(0, 0, 64, 64);

        // Ashlar dressed stone blocks (clean European castle/city wall stones)
        const rowH = 16;
        for (let r = 0; r < 4; r++) {
            const shift = (r % 2 === 0) ? 0 : 16;
            for (let c = -1; c < 3; c++) {
                const sx = c * 32 + shift;
                const sy = r * 16;
                ctx.fillStyle = stoneColors[Math.floor(Math.random() * stoneColors.length)];
                ctx.fillRect(sx + 2, sy + 2, 28, 12);

                // Top & left bevel highlight
                ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
                ctx.fillRect(sx + 2, sy + 2, 28, 2);
                ctx.fillRect(sx + 2, sy + 2, 2, 12);

                // Bottom & right shadow
                ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
                ctx.fillRect(sx + 2, sy + 12, 28, 2);
                ctx.fillRect(sx + 28, sy + 2, 2, 12);

                // Micro texture noise
                for (let i = 0; i < 8; i++) {
                    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)';
                    ctx.fillRect(sx + 4 + Math.random() * 22, sy + 4 + Math.random() * 7, 2, 2);
                }
            }
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        return texture;
    },

    // 16. Shop Brick House Wall (with decorative timber beam & storefront window)
    createShopWallTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        // Warm European red/ochre brick base
        ctx.fillStyle = '#221915';
        ctx.fillRect(0, 0, 64, 64);
        const brickColors = ['#a24a38', '#b4533e', '#883e2f', '#964434'];
        for (let r = 0; r < 8; r++) {
            const shift = (r % 2 === 0) ? 0 : 8;
            for (let c = -1; c < 5; c++) {
                ctx.fillStyle = brickColors[Math.floor(Math.random() * brickColors.length)];
                ctx.fillRect(c * 16 + shift + 1, r * 8 + 1, 14, 6);
            }
        }

        // Shop display window (bay window with glass panes & awning)
        // Dark window frame
        ctx.fillStyle = '#2d1b0d';
        ctx.fillRect(12, 22, 40, 32);

        // Glass pane (warm golden interior light reflection)
        ctx.fillStyle = '#ffd166';
        ctx.fillRect(15, 25, 34, 26);

        // Shop items on display silhouette
        ctx.fillStyle = '#7a3b12';
        ctx.fillRect(18, 38, 8, 10); // potion bottle / vase
        ctx.fillRect(30, 40, 14, 8); // bread / goods box
        ctx.fillStyle = '#38bdf8'; // blue magic flask
        ctx.fillRect(20, 34, 4, 6);

        // Window muntin grid bars
        ctx.fillStyle = '#2d1b0d';
        ctx.fillRect(31, 25, 2, 26);
        ctx.fillRect(15, 37, 34, 2);

        // Striped shop awning on top (red and white European canvas)
        for (let x = 8; x < 56; x += 8) {
            ctx.fillStyle = ((x / 8) % 2 === 0) ? '#e11d48' : '#f8fafc';
            ctx.fillRect(x, 14, 8, 8);
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        return texture;
    },

    // 17. Inn Brick House Wall (comfortable tavern/inn with lantern sign)
    createInnWallTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        // Sturdy brown-red brick wall base
        ctx.fillStyle = '#1c1613';
        ctx.fillRect(0, 0, 64, 64);
        const brickColors = ['#8d4633', '#9c4d38', '#773b2c', '#aa543e'];
        for (let r = 0; r < 8; r++) {
            const shift = (r % 2 === 0) ? 0 : 8;
            for (let c = -1; c < 5; c++) {
                ctx.fillStyle = brickColors[Math.floor(Math.random() * brickColors.length)];
                ctx.fillRect(c * 16 + shift + 1, r * 8 + 1, 14, 6);
            }
        }

        // Half-timbered cross beams (European fachwerk)
        ctx.fillStyle = '#3f2512';
        ctx.fillRect(0, 0, 64, 4);
        ctx.fillRect(0, 60, 64, 4);
        ctx.fillRect(0, 0, 4, 64);
        ctx.fillRect(60, 0, 4, 64);

        // Inn double windows with cosy warm yellow tavern light
        ctx.fillStyle = '#28170b';
        ctx.fillRect(10, 20, 20, 24);
        ctx.fillRect(34, 20, 20, 24);

        ctx.fillStyle = '#fbbf24'; // Warm tavern lantern light
        ctx.fillRect(12, 22, 16, 20);
        ctx.fillRect(36, 22, 16, 20);

        // Window curtains & frame
        ctx.fillStyle = '#b91c1c';
        ctx.fillRect(12, 22, 4, 20);
        ctx.fillRect(24, 22, 4, 20);
        ctx.fillRect(36, 22, 4, 20);
        ctx.fillRect(48, 22, 4, 20);

        // Window grid
        ctx.fillStyle = '#28170b';
        ctx.fillRect(19, 22, 2, 20);
        ctx.fillRect(12, 31, 16, 2);
        ctx.fillRect(43, 22, 2, 20);
        ctx.fillRect(36, 31, 16, 2);

        // Hanging wooden tavern sign banner (bed symbol)
        ctx.fillStyle = '#5c3317';
        ctx.fillRect(24, 6, 16, 10);
        ctx.strokeStyle = '#222';
        ctx.strokeRect(24, 6, 16, 10);
        // Moon / star emblem on inn sign
        ctx.fillStyle = '#fef08a';
        ctx.fillRect(30, 8, 4, 4);

        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        return texture;
    },

    // 雪をかぶった屋根（スレートの屋根に、軽く雪が積もっている。瓦の下の縁と、濃い所が見える）
    // 中東風（C: ミレニアム自由都市）: 日干しレンガ・漆喰の砂色の壁、平らな屋根、青緑のタイルのドーム
    createAdobeWallTexture(base = '#d9bd8c', band = '#b8683a', seed = 5150) {
        const canvas = document.createElement('canvas');
        canvas.width = 64; canvas.height = 64;
        const ctx = canvas.getContext('2d');
        const rnd = RetroTextureGenerator.snowRng(seed);
        ctx.fillStyle = base; ctx.fillRect(0, 0, 64, 64);
        for (let i = 0; i < 160; i++) {   // 漆喰のむら（砂色の濃淡）
            ctx.fillStyle = rnd() < 0.5 ? 'rgba(150, 110, 60, 0.18)' : 'rgba(255, 240, 200, 0.2)';
            ctx.fillRect(Math.floor(rnd() * 62), Math.floor(rnd() * 62), 2 + Math.floor(rnd() * 4), 1 + Math.floor(rnd() * 3));
        }
        for (let k = 0; k < 4; k++) {   // 日干しレンガの目地（うっすら）
            ctx.fillStyle = 'rgba(120, 85, 45, 0.16)'; ctx.fillRect(0, 12 + k * 16, 64, 1);
        }
        ctx.fillStyle = band; ctx.fillRect(0, 0, 64, 4);   // 上の縁の帯（赤土色）
        ctx.fillStyle = 'rgba(255, 240, 210, 0.85)';        // 帯の幾何学模様（小さな菱形）
        for (let x = 2; x < 64; x += 8) { ctx.fillRect(x + 2, 1, 2, 2); }
        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter; texture.minFilter = THREE.NearestFilter;
        texture.wrapS = THREE.RepeatWrapping; texture.wrapT = THREE.RepeatWrapping;
        return texture;
    },

    // 神殿の大理石の壁（象牙色の石を積み、継ぎ目と淡い筋、上端に金の帯）
    createMarbleWallTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#e4dfd2';
        ctx.fillRect(0, 0, 64, 64);
        const tones = ['#fbf9f3', '#f6f3ea', '#fefdfa', '#f3f0e6'];
        for (let row = 0; row < 4; row++) {
            const y = row * 16, off = (row % 2) * 16;
            for (let x = -16 + off; x < 64; x += 32) {
                ctx.fillStyle = tones[(row * 2 + (x + 16) / 32) % tones.length | 0];
                ctx.fillRect(x + 1, y + 1, 30, 14);
                ctx.fillStyle = 'rgba(170, 165, 150, 0.18)';   // 大理石の筋
                ctx.fillRect(x + 4, y + 5 + (x & 3), 14, 1);
                ctx.fillRect(x + 12, y + 9, 10, 1);
                ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
                ctx.fillRect(x + 1, y + 1, 30, 1);
            }
        }
        ctx.fillStyle = '#d4a84a';   // 金の帯
        ctx.fillRect(0, 0, 64, 2);
        ctx.fillStyle = '#f3d98a';
        ctx.fillRect(0, 2, 64, 1);
        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        return texture;
    },

    // 江戸風（K マカヒキ国）: 白い漆喰の壁（下の 1/4 は、なまこ壁＝黒い平瓦に白い目地の格子）。上の縁に、黒い横の梁
    createEdoPlasterTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#faf6ea';
        ctx.fillRect(0, 0, 64, 64);
        for (let i = 0; i < 90; i++) {   // 漆喰のむら
            ctx.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.35)' : 'rgba(120,110,90,0.12)';
            ctx.fillRect(Math.random() * 62, Math.random() * 44, 2, 2);
        }
        ctx.fillStyle = '#2a2622';   // 上の黒い梁
        ctx.fillRect(0, 0, 64, 5);
        ctx.fillStyle = '#4a423a';
        ctx.fillRect(0, 5, 64, 1);
        ctx.fillStyle = '#2a2d33';   // なまこ壁（下の帯）: 黒い平瓦 + 白い目地（斜め格子）
        ctx.fillRect(0, 46, 64, 18);
        ctx.fillStyle = '#e8e4d8';
        for (let k = -2; k < 10; k++) {
            ctx.fillRect(k * 8, 46, 2, 18);
        }
        for (let y = 46; y < 64; y += 6) ctx.fillRect(0, y, 64, 2);
        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        return texture;
    },

    // 江戸風（K マカヒキ国）: 黒い板張りの壁（縦板・桟・格子）。町家
    createEdoWoodTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#1e1712';
        ctx.fillRect(0, 0, 64, 64);
        const boards = ['#4a3628', '#413024', '#523c2c', '#3a2b20'];
        for (let x = 0; x < 64; x += 8) {
            ctx.fillStyle = boards[Math.floor(Math.random() * boards.length)];
            ctx.fillRect(x + 1, 0, 6, 64);
            ctx.fillStyle = 'rgba(0,0,0,0.25)';
            ctx.fillRect(x + 4, 0, 1, 64);
        }
        ctx.fillStyle = '#16100c';   // 横の桟
        ctx.fillRect(0, 14, 64, 3);
        ctx.fillRect(0, 46, 64, 3);
        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        return texture;
    },

    // 町家の壁（K マカヒキ国）: 上は黒ずんだ縦板、下は「なまこ壁」（黒い瓦を貼り、白い漆喰の目地を盛り上げる）。1 マスの高さの下 4 割がなまこ
    createEdoMachiyaTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        const boards = ['#4a3628', '#413024', '#523c2c', '#3a2b20'];
        ctx.fillStyle = '#1e1712';
        ctx.fillRect(0, 0, 64, 40);
        for (let x = 0; x < 64; x += 8) {
            ctx.fillStyle = boards[Math.floor(Math.random() * boards.length)];
            ctx.fillRect(x + 1, 0, 6, 40);
            ctx.fillStyle = 'rgba(0,0,0,0.25)';
            ctx.fillRect(x + 4, 0, 1, 40);
        }
        ctx.fillStyle = '#e4dfd0';   // なまこ壁: 白い目地（斜めの格子）の上に、黒い瓦
        ctx.fillRect(0, 40, 64, 24);
        const tiles = ['#2c3036', '#34383e', '#262a30'];
        for (let y = 42; y < 64; y += 8) {
            for (let x = 0; x < 64; x += 8) {
                ctx.fillStyle = tiles[Math.floor(Math.random() * tiles.length)];
                ctx.fillRect(x + 1, y, 6, 6);
            }
        }
        ctx.fillStyle = '#f4f0e4';   // 腰の上の、白い漆喰の帯
        ctx.fillRect(0, 38, 64, 4);
        ctx.fillStyle = '#16100c';
        ctx.fillRect(0, 36, 64, 2);
        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        return texture;
    },

    // 畳（K マカヒキ国の部屋の床）: い草の薄緑の畳が 2 枚（縦に長い）。縁は暗い緑の布。目は細かい縦の線
    createTatamiTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#2f3a22';   // 畳の縁（布）と、畳どうしの隙間
        ctx.fillRect(0, 0, 64, 64);
        const tones = ['#b9c27f', '#aeb874', '#c2ca88', '#b3bd79'];
        for (let k = 0; k < 2; k++) {
            ctx.fillStyle = tones[Math.floor(Math.random() * tones.length)];
            ctx.fillRect(k * 32 + 3, 2, 26, 60);
            ctx.fillStyle = 'rgba(70, 80, 40, 0.18)';   // い草の目
            for (let x = 5; x < 28; x += 3) ctx.fillRect(k * 32 + x, 2, 1, 60);
            ctx.fillStyle = 'rgba(255, 255, 230, 0.12)';
            ctx.fillRect(k * 32 + 4, 3, 24, 2);
        }
        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        return texture;
    },
};
