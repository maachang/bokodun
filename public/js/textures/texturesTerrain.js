// 地面（草・砂・雪・氷・沼・崖・道・石畳）のテクスチャ。RetroTextureGenerator の静的メソッド（public/js/textures.js が、クラスの定義のあとで、RetroTextureGenerator へ組み込む）。
// 元は public/js/textures.js の RetroTextureGenerator。移しただけで、動きは同じ（ファイルが長すぎて、編集の誤りが増えるため分割した）
import * as THREE from '/js/three.module.js';
import { RetroTextureGenerator } from '/js/textures.js';

export const terrainTextures = {
    createStoneFloorTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#2d2e33';
        ctx.fillRect(0, 0, 64, 64);

        for (let x = 0; x < 64; x += 16) {
            for (let y = 0; y < 64; y += 16) {
                ctx.strokeStyle = '#1a1b1e';
                ctx.lineWidth = 1;
                ctx.strokeRect(x, y, 16, 16);

                const tone = Math.floor(Math.random() * 20);
                ctx.fillStyle = `rgb(${45 + tone}, ${46 + tone}, ${51 + tone})`;
                ctx.fillRect(x + 1, y + 1, 14, 14);

                for (let i = 0; i < 8; i++) {
                    ctx.fillStyle = Math.random() > 0.5 ? '#4b4d54' : '#222326';
                    ctx.fillRect(x + 2 + Math.floor(Math.random() * 12), y + 2 + Math.floor(Math.random() * 12), 1, 1);
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

    createGrassTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        const greens = ['#2b5c2a', '#346d32', '#3e823b', '#254e24', '#499b45'];
        for (let x = 0; x < 64; x += 4) {
            for (let y = 0; y < 64; y += 4) {
                ctx.fillStyle = greens[Math.floor(Math.random() * greens.length)];
                ctx.fillRect(x, y, 4, 4);
            }
        }

        // Little flowers or light grass blades
        for (let i = 0; i < 20; i++) {
            ctx.fillStyle = Math.random() > 0.3 ? '#74d66f' : '#ffd54f';
            const rx = Math.floor(Math.random() * 62);
            const ry = Math.floor(Math.random() * 62);
            ctx.fillRect(rx, ry, 2, 2);
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        return texture;
    },

    createSandTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        // Warm sand base
        const sandTones = ['#d4b26f', '#c9a55e', '#deb878', '#bfa054', '#ecd295'];
        for (let x = 0; x < 64; x += 4) {
            for (let y = 0; y < 64; y += 4) {
                ctx.fillStyle = sandTones[Math.floor(Math.random() * sandTones.length)];
                ctx.fillRect(x, y, 4, 4);
            }
        }

        // Dune ripple lines & coarse sand grains
        for (let y = 8; y < 64; y += 16) {
            ctx.fillStyle = 'rgba(139, 105, 45, 0.25)';
            ctx.fillRect(0, y, 64, 2);
            ctx.fillStyle = 'rgba(255, 245, 200, 0.3)';
            ctx.fillRect(0, y - 1, 64, 1);
        }

        for (let i = 0; i < 30; i++) {
            ctx.fillStyle = Math.random() > 0.5 ? '#9e7939' : '#fff3cd';
            const rx = Math.floor(Math.random() * 63);
            const ry = Math.floor(Math.random() * 63);
            ctx.fillRect(rx, ry, 1, 1);
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        return texture;
    },

    // 2b. Swamp Ground (Damp Peat, Decaying Roots & Mossy Earth - Safe solid ground)
    createSwampGroundTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        // Dark earthy peat and damp swamp mud palette
        const groundColors = ['#1a1510', '#241b12', '#2c2217', '#362a1c', '#202619', '#2a331f'];
        for (let x = 0; x < 64; x += 4) {
            for (let y = 0; y < 64; y += 4) {
                ctx.fillStyle = groundColors[Math.floor(Math.random() * groundColors.length)];
                ctx.fillRect(x, y, 4, 4);
            }
        }

        // Dark moss patches (olive green / swamp damp moss)
        const mossColors = ['#334125', '#3d4d29', '#28361e'];
        for (let i = 0; i < 18; i++) {
            const mx = Math.floor(Math.random() * 56);
            const my = Math.floor(Math.random() * 56);
            const mw = 4 + Math.floor(Math.random() * 6);
            const mh = 4 + Math.floor(Math.random() * 6);
            ctx.fillStyle = mossColors[Math.floor(Math.random() * mossColors.length)];
            ctx.fillRect(mx, my, mw, mh);
        }

        // Organic decaying roots and tangled twigs across the damp mud
        ctx.strokeStyle = '#150f0a';
        ctx.lineWidth = 1;
        ctx.beginPath();
        // Root strand 1
        ctx.moveTo(4, 20); ctx.lineTo(18, 26); ctx.lineTo(34, 22); ctx.lineTo(48, 28);
        // Root strand 2
        ctx.moveTo(16, 52); ctx.lineTo(32, 44); ctx.lineTo(54, 50);
        ctx.stroke();

        // Tiny damp soil flecks & dead leaf remnants
        ctx.fillStyle = '#473620';
        ctx.fillRect(10, 14, 2, 2);
        ctx.fillRect(42, 38, 2, 2);
        ctx.fillRect(52, 10, 2, 2);
        ctx.fillStyle = '#1c2414';
        ctx.fillRect(24, 50, 2, 2);
        ctx.fillRect(36, 12, 2, 2);

        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        return texture;
    },

    // 3. Ice / Frozen Surface
    createIceTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        // Pale crystalline whites and icy cyans
        const iceColors = ['#dbeafe', '#bfdbfe', '#93c5fd', '#e0f2fe', '#bae6fd'];
        for (let x = 0; x < 64; x += 4) {
            for (let y = 0; y < 64; y += 4) {
                ctx.fillStyle = iceColors[Math.floor(Math.random() * iceColors.length)];
                ctx.fillRect(x, y, 4, 4);
            }
        }
        // Sharp frozen surface fractures / cracks
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(8, 12); ctx.lineTo(24, 28); ctx.lineTo(20, 48);
        ctx.moveTo(38, 4); ctx.lineTo(44, 24); ctx.lineTo(58, 36);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(59, 130, 246, 0.4)';
        ctx.strokeRect(4, 4, 56, 56);

        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        return texture;
    },

    // 5. Cobblestone Path
    createCobblestonePathTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        // Earth / dirt grout
        ctx.fillStyle = '#3f362a';
        ctx.fillRect(0, 0, 64, 64);

        // Smooth cobblestones
        const stoneTones = ['#75716b', '#8a857e', '#615d57', '#9c968d', '#54504a'];
        for (let r = 0; r < 4; r++) {
            const shift = (r % 2 === 0) ? 0 : 8;
            for (let c = -1; c < 5; c++) {
                const sx = c * 16 + shift;
                const sy = r * 16;
                ctx.fillStyle = stoneTones[Math.floor(Math.random() * stoneTones.length)];
                ctx.fillRect(sx + 2, sy + 2, 12, 12);

                // Top highlight
                ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
                ctx.fillRect(sx + 3, sy + 3, 10, 2);
                // Bottom shadow
                ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
                ctx.fillRect(sx + 3, sy + 11, 10, 2);
            }
        }

        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        return texture;
    },

    // 14. Village Dirt Road Texture
    createDirtRoadTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        // Warm earthy brown base
        ctx.fillStyle = '#6e543c';
        ctx.fillRect(0, 0, 64, 64);

        // Earth noise & small stones
        const dirtTones = ['#5a432e', '#7c6147', '#4d3926', '#876c52'];
        for (let i = 0; i < 90; i++) {
            ctx.fillStyle = dirtTones[Math.floor(Math.random() * dirtTones.length)];
            const rx = Math.floor(Math.random() * 63);
            const ry = Math.floor(Math.random() * 63);
            ctx.fillRect(rx, ry, 2, 2);
        }

        // Pebble stones scattered on dirt road
        for (let i = 0; i < 18; i++) {
            ctx.fillStyle = '#9e9182';
            const px = Math.floor(Math.random() * 62);
            const py = Math.floor(Math.random() * 62);
            ctx.fillRect(px, py, 2, 2);
            ctx.fillStyle = '#3a2d22';
            ctx.fillRect(px, py + 2, 2, 1);
        }

        // Wagon wheel rut impressions
        ctx.fillStyle = 'rgba(40, 28, 18, 0.45)';
        ctx.fillRect(14, 0, 6, 64);
        ctx.fillRect(44, 0, 6, 64);

        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        return texture;
    },

    createPackedEarthTexture(road = false) {   // 砂漠の街の、踏み固めた土の地面（広場）／往来の多い道（少し濃く、わだち）
        const canvas = document.createElement('canvas');
        canvas.width = 64; canvas.height = 64;
        const ctx = canvas.getContext('2d');
        const rnd = RetroTextureGenerator.snowRng(road ? 9091 : 9090);
        ctx.fillStyle = road ? '#b58f5a' : '#c4a06a'; ctx.fillRect(0, 0, 64, 64);
        for (let i = 0; i < 260; i++) {   // 土のむら・小石
            const d = rnd();
            ctx.fillStyle = d < 0.4 ? 'rgba(120, 85, 45, 0.28)' : d < 0.8 ? 'rgba(235, 210, 160, 0.3)' : 'rgba(90, 65, 40, 0.5)';
            ctx.fillRect(Math.floor(rnd() * 63), Math.floor(rnd() * 63), 1 + Math.floor(rnd() * 3), 1 + Math.floor(rnd() * 2));
        }
        if (road) { ctx.fillStyle = 'rgba(100, 70, 40, 0.3)'; ctx.fillRect(0, 18, 64, 3); ctx.fillRect(0, 42, 64, 3); }   // 荷車のわだち
        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter; texture.minFilter = THREE.NearestFilter;
        texture.wrapS = THREE.RepeatWrapping; texture.wrapT = THREE.RepeatWrapping;
        return texture;
    },

    // 雪が積もった石畳（広場）: 石の上や目地に、雪が積もっている。石の頭が、ところどころ見える
    createSnowCobbleTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64; canvas.height = 64;
        const ctx = canvas.getContext('2d');
        const rnd = RetroTextureGenerator.snowRng(7777);
        ctx.fillStyle = '#cdd8e3'; ctx.fillRect(0, 0, 64, 64);   // 目地は、雪
        const tones = ['#9aa3ad', '#aab3bd', '#8a939d', '#b4bcc6', '#7f8892'];
        for (let r = 0; r < 4; r++) {
            const shift = (r % 2 === 0) ? 0 : 8;
            for (let c = -1; c < 5; c++) {
                const sx = c * 16 + shift, sy = r * 16;
                ctx.fillStyle = tones[Math.floor(rnd() * tones.length)];
                ctx.fillRect(sx + 2, sy + 2, 12, 12);
                // 雪: 石の上に、まだらに（約 6 割。白い）
                for (let k = 0; k < 7; k++) {
                    ctx.fillStyle = rnd() < 0.7 ? '#f4f8fc' : '#e3ebf3';
                    ctx.fillRect(sx + 2 + Math.floor(rnd() * 10), sy + 2 + Math.floor(rnd() * 10), 2 + Math.floor(rnd() * 4), 2 + Math.floor(rnd() * 3));
                }
                ctx.fillStyle = 'rgba(70, 90, 120, 0.25)'; ctx.fillRect(sx + 3, sy + 11, 10, 2);   // 石の下の影（青）
            }
        }
        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter; texture.minFilter = THREE.NearestFilter;
        texture.wrapS = THREE.RepeatWrapping; texture.wrapT = THREE.RepeatWrapping;
        return texture;
    },

    // 雪の積もった大通り（舗装路）: 人が通るので、石が多く見え、雪は、目地と端に残る
    createSnowPavedTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64; canvas.height = 64;
        const ctx = canvas.getContext('2d');
        const rnd = RetroTextureGenerator.snowRng(4242);
        ctx.fillStyle = '#dbe5ef'; ctx.fillRect(0, 0, 64, 64);
        const colors = ['#88929e', '#9ba5b2', '#76808c', '#a6b0bd', '#6d7782'];
        for (let r = 0; r < 8; r++) {
            const shift = (r % 2 === 0) ? 0 : 8;
            for (let c = -1; c < 5; c++) {
                const sx = c * 16 + shift, sy = r * 8;
                ctx.fillStyle = colors[Math.floor(rnd() * colors.length)];
                ctx.fillRect(sx + 1, sy + 1, 14, 6);
                ctx.fillStyle = 'rgba(255, 255, 255, 0.25)'; ctx.fillRect(sx + 1, sy + 1, 14, 1);
                if (rnd() < 0.5) { ctx.fillStyle = '#f2f6fa'; ctx.fillRect(sx + 1 + Math.floor(rnd() * 8), sy + 1, 3 + Math.floor(rnd() * 5), 2 + Math.floor(rnd() * 2)); }   // 雪のまだら
            }
        }
        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter; texture.minFilter = THREE.NearestFilter;
        texture.wrapS = THREE.RepeatWrapping; texture.wrapT = THREE.RepeatWrapping;
        return texture;
    },

    // 19. European Paver Road (Paved stone plaza / street)
    createPavedRoadTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        // Dark stone mortar
        ctx.fillStyle = '#2d3339';
        ctx.fillRect(0, 0, 64, 64);

        // Elegant European interlocking paver stones (fan / herringbone style blocks)
        const paverColors = ['#88929e', '#9ba5b2', '#76808c', '#a6b0bd', '#6d7782'];
        const blockW = 16;
        const blockH = 8;

        for (let r = 0; r < 8; r++) {
            const shift = (r % 2 === 0) ? 0 : 8;
            for (let c = -1; c < 5; c++) {
                const sx = c * blockW + shift;
                const sy = r * blockH;
                ctx.fillStyle = paverColors[Math.floor(Math.random() * paverColors.length)];
                ctx.fillRect(sx + 1, sy + 1, blockW - 2, blockH - 2);

                // Sunlit bevel edge
                ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
                ctx.fillRect(sx + 1, sy + 1, blockW - 2, 1);
                ctx.fillRect(sx + 1, sy + 1, 1, blockH - 2);

                // Shadow bevel edge
                ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
                ctx.fillRect(sx + 1, sy + blockH - 2, blockW - 2, 1);
                ctx.fillRect(sx + blockW - 2, sy + 1, 1, blockH - 2);
            }
        }

        // Center drainage curb line (European street gutter)
        ctx.fillStyle = 'rgba(20, 24, 30, 0.35)';
        ctx.fillRect(30, 0, 4, 64);

        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        return texture;
    },

    // 外のマップの地面（雪・森の落ち葉・岩の地面・白い砂・乾いた草）: 基本色に、色違いの斑点を散らす（毎回同じ模様）
    // 自然の岩肌（断崖）: レンガのような規則正しい並びではなく、不ぞろいにひび割れた岩の面。継ぎ目なく並ぶ
    //   tones: 岩の面の色（複数）、crack: ひびの色
    createCliffTexture(tones, crack, seedStart = 2024) {
        const S = 128;
        const canvas = document.createElement('canvas');
        canvas.width = S; canvas.height = S;
        const ctx = canvas.getContext('2d');
        let seed = seedStart;
        const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
        // 岩の面の中心点（縦に長く割れた岩の面になるよう、縦方向を縮めて距離を測る）
        const pts = [];
        for (let i = 0; i < 14; i++) pts.push({ x: rnd() * S, y: rnd() * S, tone: tones[Math.floor(rnd() * tones.length)], shade: 0.8 + rnd() * 0.4 });
        const img = ctx.createImageData(S, S);
        const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
        const crk = hex(crack);
        for (let y = 0; y < S; y++) {
            for (let x = 0; x < S; x++) {
                let d1 = 1e9, d2 = 1e9, best = null;
                for (const p of pts) {
                    let dx = Math.abs(x - p.x); if (dx > S / 2) dx = S - dx;
                    let dy = Math.abs(y - p.y); if (dy > S / 2) dy = S - dy;
                    const d = Math.hypot(dx * 1.0, dy * 0.4);
                    if (d < d1) { d2 = d1; d1 = d; best = p; } else if (d < d2) d2 = d;
                }
                const edge = d2 - d1;   // 小さいほど、面と面の境目（ひび）
                const base = hex(best.tone);
                // 岩の面の上側を明るく、下側を暗く、ざらつきを足す
                const lit = best.shade * (1 + (((best.y - y + S * 1.5) % S) / S - 0.5) * 0.18) + (rnd() - 0.5) * 0.12;
                let r = base[0] * lit, g = base[1] * lit, b = base[2] * lit;
                if (edge < 1.0) { r = crk[0]; g = crk[1]; b = crk[2]; }
                else if (edge < 2.4) { const k = 0.75 + (edge - 1.0) / 1.4 * 0.25; r *= k; g *= k; b *= k; }
                const i = (y * S + x) * 4;
                img.data[i] = Math.max(0, Math.min(255, r)); img.data[i + 1] = Math.max(0, Math.min(255, g)); img.data[i + 2] = Math.max(0, Math.min(255, b)); img.data[i + 3] = 255;
            }
        }
        ctx.putImageData(img, 0, 0);
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        return texture;
    },

    // 砂漠の地面: 明るい金色の砂に、風がつくる波状の筋（砂紋）と、まばらな小石。継ぎ目なく並ぶ
    createDesertSandTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#e6c882';
        ctx.fillRect(0, 0, 64, 64);
        let seed = 777;
        const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
        const tones = ['#edd391', '#dfbf78', '#f2dc9e', '#d9b86f'];
        ctx.globalAlpha = 0.4;
        for (let x = 0; x < 64; x += 4) {
            for (let y = 0; y < 64; y += 4) {
                ctx.fillStyle = tones[Math.floor(rnd() * tones.length)];
                ctx.fillRect(x, y, 4, 4);
            }
        }
        ctx.globalAlpha = 1;
        // 砂紋（波の筋）: 暗い筋の上に明るい筋を重ねる。周期は 64 を割り切るので継ぎ目が出ない
        for (let band = 0; band < 2; band++) {
            const base = band * 32 + 10;
            const phase = band * 1.7;
            for (let x = 0; x < 64; x++) {
                const y = Math.round(base + 4 * Math.sin((x / 64) * Math.PI * 2 + phase));
                ctx.fillStyle = 'rgba(170, 125, 55, 0.16)';
                ctx.fillRect(x, y, 1, 1);
                ctx.fillStyle = 'rgba(255, 246, 215, 0.5)';
                ctx.fillRect(x, y - 1, 1, 1);
            }
        }
        // まばらな小石と砂粒
        for (let i = 0; i < 7; i++) {
            ctx.fillStyle = '#b08d58';
            ctx.fillRect(Math.floor(rnd() * 62), Math.floor(rnd() * 62), 2, 1);
        }
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        return texture;
    },

    createSpeckleFloorTexture(base, tones, count = 90) {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = base;
        ctx.fillRect(0, 0, 64, 64);
        let seed = 12345;
        const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
        for (let x = 0; x < 64; x += 4) {
            for (let y = 0; y < 64; y += 4) {
                ctx.fillStyle = tones[Math.floor(rnd() * tones.length)];
                ctx.globalAlpha = 0.45;
                ctx.fillRect(x, y, 4, 4);
            }
        }
        ctx.globalAlpha = 1;
        for (let i = 0; i < count; i++) {
            ctx.fillStyle = tones[Math.floor(rnd() * tones.length)];
            ctx.fillRect(Math.floor(rnd() * 63), Math.floor(rnd() * 63), 2, 1);
        }
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        return texture;
    },
};
