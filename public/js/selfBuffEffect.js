import * as THREE from '/js/three.module.js';
import { auraCast } from '/js/selfAuraEffect.js';

/**
 * 自分に使う魔法のうち、補助・解除・道具系の演出（画像なし。コードで描く。草案・見た目は仮）。
 *   playBuff(sys, style, x, z, { color, scale })
 * style: unlock（金の鍵が複数、体のまわりを回りながら昇る）/ speedUp（青い「UP」の文字が複数昇る=移動速度アップ）/ trap（解除された罠＝口を開けて平らに広げたトラバサミ＋赤い✕の絵が複数昇る）
 *        enchant・protect（円柱のオーラ。selfAuraEffect.js）
 *        float（大きな鳥の羽の絵が複数、ふわっと昇る=フライ）
 */
const rnd = (a, b) => a + Math.random() * (b - a);
const ease = (t) => 1 - Math.pow(1 - t, 3);
const glow = (color, opacity = 1, extra = {}) => new THREE.MeshBasicMaterial({ color, opacity, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, ...extra });
const clamp01 = (v) => Math.max(0, Math.min(1, v));

// 共通の枠: 足元の輪（広がって消える）を付けて、tick を登録する
function frame(sys, x, z, color, life, build, tick) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    const geos = [], mats = [];
    const ring = sys.ringMesh(group, color, 0.8, 1.0, 0.05);
    geos.push(ring.geo); mats.push(ring.mat);
    const parts = build(group, geos, mats);
    sys.add(group, life, (q) => {
        const k = clamp01(q * 2);
        ring.mesh.scale.setScalar(0.5 + ease(k) * 1.4);
        ring.mat.opacity = 0.9 * (1 - k);
        tick(q, life * q, parts);
    }, geos, mats);
}

let _keyTex = null;
function keyTexture() {   // 鍵の絵（金色・黒い縁取り。大きな輪の頭・軸・歯 3 つ）を、キャンバスで 1 回だけ描く
    if (_keyTex) return _keyTex;
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    g.translate(64, 64); g.rotate(-Math.PI / 4);   // 斜めに寝かせる（右上が頭）
    const draw = (fill, grow) => {
        g.fillStyle = fill;
        g.beginPath(); g.arc(-34, 0, 22 + grow, 0, Math.PI * 2); g.fill();                         // 頭（輪）
        g.fillRect(-14, -5 - grow, 66 + grow, 10 + grow * 2);                                      // 軸
        g.fillRect(30 - grow, 4, 9 + grow * 2, 18 + grow); g.fillRect(44 - grow, 4, 9 + grow * 2, 24 + grow);   // 歯（長さが違う）
        g.fillRect(16 - grow, 4, 9 + grow * 2, 13 + grow);
    };
    draw('#3a2a05', 4); draw('#ffffff', 0);
    g.globalCompositeOperation = 'destination-out';
    g.beginPath(); g.arc(-34, 0, 10, 0, Math.PI * 2); g.fill();                                    // 頭の穴
    _keyTex = new THREE.CanvasTexture(c);
    return _keyTex;
}

let _upTex = null;
function upTexture() {   // 「UP」の文字（太字・黒い縁取り・上向きの三角つき）を、キャンバスで 1 回だけ描く
    if (_upTex) return _upTex;
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = 'bold 66px sans-serif';
    g.lineJoin = 'round'; g.lineWidth = 12; g.strokeStyle = '#06203a'; g.strokeText('UP', 64, 80);
    g.fillStyle = '#ffffff'; g.fillText('UP', 64, 80);
    g.beginPath(); g.moveTo(64, 8); g.lineTo(92, 40); g.lineTo(36, 40); g.closePath();                // 上向きの三角
    g.lineWidth = 8; g.strokeStyle = '#06203a'; g.stroke(); g.fill();
    _upTex = new THREE.CanvasTexture(c);
    return _upTex;
}

function unlock(sys, x, z, c, s) { iconRise(sys, x, z, c, s, keyTexture()); }   // 金の鍵が複数、体のまわりを回りながら昇る
function trap(sys, x, z, c, s) { iconRise(sys, x, z, c, s, trapTexture(), { tint: 0xffffff, n: 8, size: 0.7 }); }   // 解除された罠（開いたトラバサミ）の絵が複数、同じように昇る
function speedUp(sys, x, z, c, s) { iconRise(sys, x, z, c, s, upTexture(), { n: 9 }); }   // 青い「UP」の文字が複数、同じように昇る（スピーディー）

// 絵（tex）を複数、体のまわりをゆっくり回りながら昇らせ、終わり際に火花を散らして消える。絵は、常にこちらを向く
function iconRise(sys, x, z, c, s, tex, { tint = c, n = 12, size = 0.9 } = {}) {   // tint: 絵にかける色（絵に色がついているときは白）／n: 絵の数／size: 絵の大きさ
    frame(sys, x, z, c, 2.2, (g, geos, mats) => {
        const sg = new THREE.OctahedronGeometry(0.06 * s, 0);
        const sm = glow(0xffffff);
        geos.push(sg); mats.push(sm);
        const keyMats = [];
        const keys = Array.from({ length: n }, (_, i) => {
            const m = new THREE.SpriteMaterial({ map: tex, color: tint, transparent: true, depthWrite: false, depthTest: false });
            const sp = new THREE.Sprite(m); g.add(sp); mats.push(m); keyMats.push(m);
            return { sp, a: (i / n) * Math.PI * 2, r: (0.9 + (i % 3) * 0.25) * s, delay: i * 0.05, y0: 0.35 + (i % 4) * 0.3 };   // 数が多いので、半径を 3 段・高さを 4 段に散らす
        });
        const sparks = Array.from({ length: 18 }, () => { const m = new THREE.Mesh(sg, sm); g.add(m); return { m, a: rnd(0, 6.28), v: rnd(1.2, 2.6), y: rnd(0.6, 1.8) * s }; });
        return { keys, sparks, keyMats, s };
    }, (q, t, ps) => {
        const fade = 1 - clamp01((q - 0.65) / 0.35);
        for (const p of ps.keys) {
            const k = clamp01((t - p.delay) / 0.7);
            p.sp.visible = k > 0 && fade > 0;
            const a = p.a + t * 1.3;                       // ゆっくり回る
            p.sp.position.set(Math.cos(a) * p.r, p.y0 + k * 0.9, Math.sin(a) * p.r);
            p.sp.material.rotation = Math.sin(t * 3 + p.a) * 0.2;
            p.sp.scale.setScalar(size * ps.s * ease(clamp01(k * 3)));
        }
        for (const m of ps.keyMats) m.opacity = fade;
        for (const p of ps.sparks) {   // 終わり際に、火花が外へ散る
            const k = clamp01((t - 1.0) / 0.6);
            p.m.visible = k > 0 && k < 1;
            p.m.position.set(Math.cos(p.a) * k * p.v, p.y + k * 0.4, Math.sin(p.a) * k * p.v);
        }
    });
}

let _trapTex = null;
function trapTexture() {   // 解除された罠（口を開けて平らに広げたトラバサミ。楕円の輪・ギザギザの歯・中央の踏み板・赤い✕）を、キャンバスで 1 回だけ描く
    if (_trapTex) return _trapTex;
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    const cx = 64, cy = 80, rx = 54, ry = 25, th = 24;   // 輪の中心・半径（横・縦）と、歯の高さ
    const ink = '#101a17', dark = '#3b4a45', mid = '#5b6b66', light = '#8fa19b';
    g.lineJoin = 'round'; g.lineCap = 'round';
    const teeth = (from, to) => {   // 歯: 輪の線の上に、三角を並べる
        for (let a = from; a < to; a += 0.2) {
            const px = cx + Math.cos(a) * rx, py = cy + Math.sin(a) * ry;
            g.beginPath(); g.moveTo(px - 6.5, py + 1); g.lineTo(px + 0.5, py - th); g.lineTo(px + 7, py + 1); g.closePath();
            g.fillStyle = mid; g.fill(); g.strokeStyle = ink; g.lineWidth = 2; g.stroke();
        }
    };
    teeth(Math.PI + 0.1, Math.PI * 2 - 0.05);              // 奥の歯
    g.strokeStyle = ink; g.lineWidth = 15; g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); g.stroke();   // 輪（縁取り）
    g.strokeStyle = dark; g.lineWidth = 10; g.stroke();
    g.strokeStyle = light; g.lineWidth = 2; g.beginPath(); g.ellipse(cx, cy - 1, rx - 1, ry - 1, 0, Math.PI * 1.1, Math.PI * 1.9); g.stroke();   // 上のふちの照り
    // 中央の踏み板と、輪の左右の蝶番をつなぐ軸
    g.strokeStyle = ink; g.lineWidth = 8; g.beginPath(); g.moveTo(cx - rx, cy + 2); g.lineTo(cx + rx, cy - 2); g.stroke();
    g.strokeStyle = mid; g.lineWidth = 4; g.stroke();
    g.fillStyle = ink; g.beginPath(); g.ellipse(cx, cy, 24, 12, -0.04, 0, Math.PI * 2); g.fill();
    g.fillStyle = mid; g.beginPath(); g.ellipse(cx, cy - 1, 21, 9.5, -0.04, 0, Math.PI * 2); g.fill();
    g.fillStyle = light; g.beginPath(); g.ellipse(cx - 3, cy - 3, 12, 3.5, -0.04, 0, Math.PI * 2); g.fill();
    teeth(0.05, Math.PI - 0.05);                           // 手前の歯（板の前にかぶる）
    for (const side of [-1, 1]) {                          // 蝶番（丸いびょう）
        g.fillStyle = ink; g.beginPath(); g.arc(cx + side * rx, cy, 6.5, 0, Math.PI * 2); g.fill();
        g.fillStyle = light; g.beginPath(); g.arc(cx + side * rx, cy - 0.5, 3.2, 0, Math.PI * 2); g.fill();
    }
    // 赤い✕（罠の解除のしるし）を、絵の上に重ねる（踏み板が見えるように、細く小さめ）（黒い縁取り→赤）
    g.lineCap = 'round';
    for (const [w, col] of [[13, '#2a0a0a'], [7, '#ef4444']]) {
        g.strokeStyle = col; g.lineWidth = w; g.beginPath();
        g.moveTo(40, 52); g.lineTo(88, 100); g.moveTo(88, 52); g.lineTo(40, 100); g.stroke();
    }
    _trapTex = new THREE.CanvasTexture(c);
    return _trapTex;
}

let _featherTex = null;
function featherTexture() {   // 大きな鳥の羽（白。軸のゆるい曲線・先の丸い幅広の羽の面・縁の階段状の切れ込み・軸の隙間）を、キャンバスで 1 回だけ描く
    if (_featherTex) return _featherTex;
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    const P = [[10, 120], [24, 70], [56, 34], [114, 10]];                 // 軸の曲線（根元は左下、先は右上）
    const at = (t) => { const u = 1 - t; return [u * u * u * P[0][0] + 3 * u * u * t * P[1][0] + 3 * u * t * t * P[2][0] + t * t * t * P[3][0], u * u * u * P[0][1] + 3 * u * u * t * P[1][1] + 3 * u * t * t * P[2][1] + t * t * t * P[3][1]]; };
    const edge = (side, W) => {   // side: 1=右下の広い側 / -1=左上の狭い側。縁に、階段状の切れ込み（のこぎり刃）
        const pts = [];
        for (let i = 0; i <= 60; i++) {
            const t = i / 60, u = Math.max(0, (t - 0.12) / 0.88);
            let w = W * Math.pow(Math.sin(u * Math.PI / 2), 0.75);
            const e = Math.max(0, (u - 0.9) / 0.1); w *= Math.sqrt(Math.max(0, 1 - e * e));            // 先は丸く
            w *= 1 - 0.32 * ((t * (side > 0 ? 3.4 : 2.6)) % 1) * (u > 0.2 && u < 0.88 ? 1 : 0);          // 切れ込み
            const [x0, y0] = at(Math.max(0, t - 0.01)), [x1, y1] = at(Math.min(1, t + 0.01));
            let nx = -(y1 - y0), ny = x1 - x0; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
            const [x, y] = at(t); pts.push([x + nx * w * side * -1, y + ny * w * side * -1]);
        }
        return pts;
    };
    const right = edge(1, 27), left = edge(-1, 15);
    const shape = () => { g.beginPath(); g.moveTo(...left[0]); for (const q of left) g.lineTo(...q); for (const q of right.slice().reverse()) g.lineTo(...q); g.closePath(); };
    g.lineJoin = 'round'; g.lineCap = 'round';
    g.lineWidth = 5; g.strokeStyle = '#6f8aa3'; shape(); g.stroke();                  // 縁取り（白でも見えるように）
    const gr = g.createLinearGradient(10, 120, 114, 10); gr.addColorStop(0, '#e8eef5'); gr.addColorStop(0.5, '#ffffff'); gr.addColorStop(1, '#f4f8fc');
    g.fillStyle = gr; shape(); g.fill();
    g.strokeStyle = '#6f8aa3'; g.lineWidth = 2.6; g.beginPath();                         // 軸（面の中を通る隙間の線。根元は長く出る）
    for (let i = 0; i <= 50; i++) { const [x, y] = at(i / 50 * 0.92); if (i) g.lineTo(x, y); else g.moveTo(x, y); }
    g.stroke();
    _featherTex = new THREE.CanvasTexture(c);
    return _featherTex;
}

function float(sys, x, z, c, s) { iconRise(sys, x, z, c, s, featherTexture(), { tint: 0xffffff, n: 8, size: 0.9 }); }   // 大きな軽そうな羽が複数、ふわっと昇る（フライ）

const STYLES = { unlock, speedUp, trap, float,
    enchant: (sys, x, z, c, s) => auraCast(sys, 'enchant', x, z, c, s),     // 円柱のオーラ（selfAuraEffect.js）
    protect: (sys, x, z, c, s) => auraCast(sys, 'protect', x, z, c, s) };
export const BUFF_STYLES = Object.keys(STYLES);

export function playBuff(sys, style, x, z, { color = '#ffffff', scale = 1 } = {}) {
    STYLES[style]?.(sys, x, z, parseInt(color.slice(1), 16), scale);
}

// 効果の処理が未決（magic.json で usable:false）の魔法の演出。エフェクトテスト用（ゲームの魔法としては使わない）。色・大きさは仮
export const PENDING_SPELL_FX = {   // 色は magic.json の fx.color（2026-11-26 草案）と同じ。長さは半分（speed: 2。2026-11-26 ユーザー「長すぎるので半分ぐらい」）。形は style（heal・refresh は selfSpellEffect.js の回復系で、色違い。ほかは上の関数）
    cure: { name: 'キュアー', style: 'heal', color: '#f8fafc', scale: 1, speed: 2 },
    recovery: { name: 'リカバリー', style: 'refresh', color: '#f9a8d4', scale: 1.5, speed: 2 },
    cure_poison: { name: 'キュアーポイズン', style: 'heal', color: '#c084fc', scale: 1, speed: 2 },
    enchant: { name: 'エンチャント', style: 'enchant', color: '#ef4444', scale: 1, speed: 2 },
    protection: { name: 'プロテクション', style: 'protect', color: '#3b82f6', scale: 1, speed: 2 },
    speedy: { name: 'スピーディー', style: 'speedUp', color: '#38bdf8', scale: 1, speed: 1 },
    unlock: { name: 'アンロック', style: 'unlock', color: '#facc15', scale: 1, speed: 1 },
    trap: { name: 'トラップ', style: 'trap', color: '#94a3b8', scale: 1, speed: 1 },
    fly: { name: 'フライ', style: 'float', color: '#ffffff', scale: 1, speed: 1 },
};
