// 江戸風（K マカヒキ国）のテクスチャ: 町家の壁・神社の壁・ふすま・障子・上段の壁画・格天井・畳。RetroTextureGenerator の静的メソッド（textures.js が組み込む）。
// 元は texturesWalls.js。移しただけで、動きは同じ（ファイルが長すぎて、編集の誤りが増えるため分割した）
import * as THREE from '/js/three.module.js';

export const edoTextures = {
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

    // 神社の社殿の壁（K マカヒキ国）: 朱塗りの板壁。縦の板の継ぎ目と、上下の黒い横木
    createEdoShrineTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#9a2c1e';
        ctx.fillRect(0, 0, 64, 64);
        const reds = ['#c0402c', '#b43a28', '#c84a34', '#a83424'];
        for (let x = 0; x < 64; x += 8) {
            ctx.fillStyle = reds[Math.floor(Math.random() * reds.length)];
            ctx.fillRect(x + 1, 0, 6, 64);
            ctx.fillStyle = 'rgba(60,0,0,0.3)';
            ctx.fillRect(x + 4, 0, 1, 64);
        }
        ctx.fillStyle = '#2a1812';
        ctx.fillRect(0, 0, 64, 4);
        ctx.fillRect(0, 60, 64, 4);
        ctx.fillStyle = '#e8e4dc';   // 足元の白い基壇
        ctx.fillRect(0, 54, 64, 6);
        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        return texture;
    },

    // ふすま・障子の共通の下地（K マカヒキ国の城の中）: 64×64 の canvas と、テクスチャ化
    _edoPanel(draw) {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        draw(ctx);
        const texture = new THREE.CanvasTexture(canvas);
        texture.magFilter = THREE.NearestFilter;
        texture.minFilter = THREE.NearestFilter;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        return texture;
    },

    // 白いふすま: 和紙（うすい灰白）に、黒い木の枠（縁・上下の鴨居と敷居・中央の継ぎ目）と、引き手（小さな丸）
    createFusumaTexture() {
        return this._edoPanel(ctx => {
            ctx.fillStyle = '#ece6d4';
            ctx.fillRect(0, 0, 64, 64);
            for (let i = 0; i < 40; i++) {
                ctx.fillStyle = 'rgba(150,130,100,0.10)';
                ctx.fillRect(Math.floor(Math.random() * 64), Math.floor(Math.random() * 64), 3, 1);
            }
            ctx.fillStyle = '#2a1e16';
            ctx.fillRect(0, 0, 64, 4);
            ctx.fillRect(0, 60, 64, 4);
            ctx.fillRect(0, 0, 2, 64);
            ctx.fillRect(62, 0, 2, 64);
            ctx.fillRect(31, 4, 2, 56);
            ctx.fillStyle = '#6a5a44';
            ctx.fillRect(27, 30, 3, 3);
            ctx.fillRect(34, 30, 3, 3);
        });
    },

    // 金のふすま（金碧障壁画）: 金箔の地に、松の木（黒い幹と緑の枝葉）と、遠くの山、雲（白）
    createFusumaGoldTexture() {
        return this._edoPanel(ctx => {
            ctx.fillStyle = '#d9a93c';
            ctx.fillRect(0, 0, 64, 64);
            for (let y = 4; y < 60; y += 8) {
                for (let x = 2; x < 62; x += 8) {
                    ctx.fillStyle = (x + y) % 16 === 0 ? '#e6bc50' : '#cf9e34';
                    ctx.fillRect(x, y, 7, 7);
                }
            }
            ctx.fillStyle = '#4a7a5a';   // 遠くの山
            ctx.fillRect(0, 44, 22, 3);
            ctx.fillRect(4, 41, 12, 3);
            ctx.fillStyle = '#f4ecd0';   // 雲
            ctx.fillRect(40, 14, 18, 3);
            ctx.fillRect(44, 11, 10, 3);
            ctx.fillStyle = '#241812';   // 松の幹
            ctx.fillRect(30, 30, 4, 30);
            ctx.fillRect(26, 40, 6, 3);
            ctx.fillRect(34, 34, 8, 3);
            ctx.fillStyle = '#2f5a3a';   // 松の葉
            ctx.fillRect(18, 24, 18, 5);
            ctx.fillRect(24, 19, 16, 5);
            ctx.fillRect(36, 30, 14, 4);
            ctx.fillRect(14, 34, 12, 4);
            ctx.fillStyle = '#2a1e16';   // 黒い枠
            ctx.fillRect(0, 0, 64, 4);
            ctx.fillRect(0, 60, 64, 4);
            ctx.fillRect(0, 0, 2, 64);
            ctx.fillRect(62, 0, 2, 64);
        });
    },

    // 障子（城の外の壁）: 白い和紙に、細い格子（組子）。枠は木
    createShojiTexture() {
        return this._edoPanel(ctx => {
            ctx.fillStyle = '#f4f0e2';
            ctx.fillRect(0, 0, 64, 64);
            ctx.fillStyle = '#8a6a44';
            for (let x = 0; x <= 64; x += 16) ctx.fillRect(x, 0, 2, 64);
            for (let y = 0; y <= 64; y += 12) ctx.fillRect(0, y, 64, 2);
            ctx.fillStyle = '#3a2a1c';
            ctx.fillRect(0, 0, 64, 5);
            ctx.fillRect(0, 59, 64, 5);
        });
    },

    // 上段の間の、背後の壁（K マカヒキ国の城）: 金箔の壁に、大きな松の絵（枠・継ぎ目のない壁画）。上の長押（黒い木の横木）と、下の畳寄せ
    createWallGoldPineTexture() {
        return this._edoPanel(ctx => {
            ctx.fillStyle = '#d9a93c';
            ctx.fillRect(0, 0, 64, 64);
            for (let y = 6; y < 58; y += 8) {
                for (let x = 0; x < 64; x += 8) {
                    ctx.fillStyle = (x + y) % 16 === 0 ? '#e6bc50' : '#cf9e34';
                    ctx.fillRect(x, y, 8, 8);
                }
            }
            ctx.fillStyle = '#241812';   // 太い幹と枝
            ctx.fillRect(28, 14, 7, 46);
            ctx.fillRect(14, 30, 16, 4);
            ctx.fillRect(35, 24, 20, 4);
            ctx.fillStyle = '#2f5a3a';   // 松の葉（横に広がる塊）
            ctx.fillRect(6, 24, 22, 6);
            ctx.fillRect(10, 18, 16, 6);
            ctx.fillRect(36, 18, 24, 6);
            ctx.fillRect(40, 12, 16, 6);
            ctx.fillRect(18, 10, 24, 6);
            ctx.fillStyle = '#f4ecd0';   // 霞
            ctx.fillRect(0, 44, 18, 3);
            ctx.fillRect(46, 48, 18, 3);
            ctx.fillStyle = '#2a1e16';   // 長押・畳寄せ
            ctx.fillRect(0, 0, 64, 6);
            ctx.fillRect(0, 58, 64, 6);
        });
    },

    // 神社の格天井: 黒褐色の格子（太い桟）の中に、和紙色の板絵（花鳥の色の点）。64×64 に 2×2 の枡
    createShrineCeilingTexture() {
        return this._edoPanel(ctx => {
            ctx.fillStyle = '#3a2214';
            ctx.fillRect(0, 0, 64, 64);
            const cols = [['#d8c9a0', '#3f7a52', '#b03a2a'], ['#cdbd90', '#2f5a8a', '#d9a93c'], ['#d4c498', '#b03a2a', '#3f7a52'], ['#dccfa8', '#d9a93c', '#2f5a8a']];
            for (let k = 0; k < 4; k++) {
                const x = (k % 2) * 32 + 4, y = Math.floor(k / 2) * 32 + 4;
                ctx.fillStyle = cols[k][0];
                ctx.fillRect(x, y, 24, 24);
                ctx.fillStyle = cols[k][1];
                ctx.fillRect(x + 4, y + 10, 10, 6);
                ctx.fillRect(x + 12, y + 5, 6, 4);
                ctx.fillStyle = cols[k][2];
                ctx.fillRect(x + 14, y + 13, 6, 5);
                ctx.fillRect(x + 6, y + 4, 3, 3);
            }
            ctx.fillStyle = '#5a3420';   // 桟のつや
            ctx.fillRect(0, 0, 64, 2);
            ctx.fillRect(0, 0, 2, 64);
            ctx.fillRect(30, 0, 2, 64);
            ctx.fillRect(0, 30, 64, 2);
        });
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
