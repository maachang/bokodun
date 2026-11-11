// 街の門の扉の絵（国ごと）: 縦板の扉に、国の雰囲気の違いを付ける。外のマップの街の門（objects.json の gate_*）が使う。
// RetroTextureGenerator の静的メソッド（textures.js が組み込む）。woodDoor（家の木の扉）と同じ 64×128
import * as THREE from '/js/three.module.js';

// 縦板の扉の共通の描き方: planks = 板の色（順に並べる）・band = 横帯の色・rivet = 鋲の色・knob = 取っ手の色・extra = 追加の飾り（ctx）
function drawGateLeaf({ planks, plankW = 16, band, rivet, knob, extra }) {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    for (let x = 0; x < 64; x += plankW) {
        ctx.fillStyle = planks[(x / plankW) % planks.length];
        ctx.fillRect(x, 0, plankW, 128);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
        ctx.fillRect(x, 0, 1, 128);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.fillRect(x + 3, 0, 1, 128);
    }
    if (band) {
        ctx.fillStyle = band;
        ctx.fillRect(0, 22, 64, 8);
        ctx.fillRect(0, 98, 64, 8);
        ctx.fillStyle = rivet;
        for (let x = 6; x < 64; x += 14) { ctx.fillRect(x, 24, 3, 3); ctx.fillRect(x, 100, 3, 3); }
    }
    if (extra) extra(ctx);
    ctx.fillStyle = knob;
    ctx.fillRect(50, 62, 6, 6);
    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    return texture;
}

export const gateTextures = {
    // 鉄の扉（A 雪国・F 獣人とドワーフ）: 黒ずんだ板に、太い鉄の帯と、大きな鋲
    createGateIronTexture() {
        return drawGateLeaf({
            planks: ['#4a4036', '#3e352c', '#52463a'], plankW: 16, band: '#1c1c20', rivet: '#8a8a94', knob: '#9a9aa4',
            extra: (ctx) => { ctx.fillStyle = '#1c1c20'; ctx.fillRect(0, 60, 64, 6); ctx.fillStyle = '#8a8a94'; for (let x = 4; x < 64; x += 10) ctx.fillRect(x, 62, 3, 3); },
        });
    },
    // 白い扉に金の縁（B 聖国・J 魔導国）
    createGateWhiteGoldTexture() {
        return drawGateLeaf({
            planks: ['#f0ece0', '#e6e2d4', '#f4f0e6'], plankW: 32, knob: '#e8c24a',
            extra: (ctx) => {
                ctx.fillStyle = '#d4a84a'; ctx.fillRect(0, 0, 64, 4); ctx.fillRect(0, 124, 64, 4); ctx.fillRect(0, 0, 4, 128); ctx.fillRect(60, 0, 4, 128); ctx.fillRect(30, 0, 4, 128);
                ctx.fillRect(12, 20, 16, 2); ctx.fillRect(36, 20, 16, 2); ctx.fillRect(12, 100, 16, 2); ctx.fillRect(36, 100, 16, 2);
            },
        });
    },
    // 日除け布つきの板の扉（C 砂漠）: 砂色の板に、上に縞の布
    createGateClothTexture() {
        return drawGateLeaf({
            planks: ['#b08a5a', '#a07c50', '#bc9664'], plankW: 16, band: '#6a4a2a', rivet: '#d8c8a0', knob: '#e0c060',
            extra: (ctx) => { for (let x = 0; x < 64; x += 16) { ctx.fillStyle = (x / 16) % 2 ? '#e8e0c8' : '#b8452e'; ctx.fillRect(x, 0, 16, 18); } ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, 18, 64, 2); },
        });
    },
    // 丸太の扉（G 精霊の森・H 辺境）: 太い丸太を縦に並べ、苔と蔦
    createGateLogTexture() {
        return drawGateLeaf({
            planks: ['#5a4630', '#4e3c28', '#664e34', '#46361f'], plankW: 8, knob: '#c8b070',
            extra: (ctx) => { ctx.fillStyle = '#2e5a2a'; for (let i = 0; i < 26; i++) ctx.fillRect(Math.floor((i * 37) % 64), 128 - (i * 11) % 46 - 8, 2 + (i % 3), 6 + (i % 5) * 2); },
        });
    },
    // 白く塗った板の扉（E 南国の港）
    createGateWhiteTexture() {
        return drawGateLeaf({
            planks: ['#ece8dc', '#e2ded0', '#f2eee4'], plankW: 16, band: '#5a7fa0', rivet: '#e8e4d8', knob: '#c8a040',
        });
    },
};
