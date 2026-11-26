import * as THREE from '/js/three.module.js';
import { auraCast } from '/js/selfAuraEffect.js';

/**
 * 自分に使う魔法のうち、補助・解除・道具系の演出（画像なし。コードで描く。草案・見た目は仮）。
 *   playBuff(sys, style, x, z, { color, scale })
 * style: unlock（金の鍵が複数、体のまわりを回りながら昇る）/ speedUp（青い「UP」の文字が複数昇る=移動速度アップ）/ trap（解除された罠＝開いたトラバサミの絵が複数昇る）
 *        enchant・protect（円柱のオーラ。selfAuraEffect.js）
 *        float（白い光が足元を持ち上げる=フライ）
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
function trap(sys, x, z, c, s) { iconRise(sys, x, z, c, s, trapTexture(), { tint: 0xffffff, n: 4, size: 1.4 }); }   // 解除された罠（開いたトラバサミ）の絵が複数、同じように昇る
function speedUp(sys, x, z, c, s) { iconRise(sys, x, z, c, s, upTexture()); }   // 青い「UP」の文字が複数、同じように昇る（スピーディー）

// 絵（tex）を複数、体のまわりをゆっくり回りながら昇らせ、終わり際に火花を散らして消える。絵は、常にこちらを向く
function iconRise(sys, x, z, c, s, tex, { tint = c, n = 6, size = 0.9 } = {}) {   // tint: 絵にかける色（絵に色がついているときは白）／n: 絵の数／size: 絵の大きさ
    frame(sys, x, z, c, 2.2, (g, geos, mats) => {
        const sg = new THREE.OctahedronGeometry(0.06 * s, 0);
        const sm = glow(0xffffff);
        geos.push(sg); mats.push(sm);
        const keyMats = [];
        const keys = Array.from({ length: n }, (_, i) => {
            const m = new THREE.SpriteMaterial({ map: tex, color: tint, transparent: true, depthWrite: false, depthTest: false });
            const sp = new THREE.Sprite(m); g.add(sp); mats.push(m); keyMats.push(m);
            return { sp, a: (i / n) * Math.PI * 2, r: (0.95 + (i % 2) * 0.3) * s, delay: i * 0.08, y0: 0.5 + (i % 3) * 0.35 };
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
function trapTexture() {   // 解除された罠（口を開けたトラバサミ・中央の板・鎖・煙の渦）を、キャンバスで 1 回だけ描く
    if (_trapTex) return _trapTex;
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    const steel = (grow) => { g.lineJoin = 'round'; g.lineCap = 'round'; return grow; };
    // 台座（楕円）
    g.fillStyle = '#1b2430'; g.beginPath(); g.ellipse(64, 100, 50, 15, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#94a3b8'; g.beginPath(); g.ellipse(64, 98, 46, 12, 0, 0, Math.PI * 2); g.fill();
    // 開いた顎（左右。外へ倒れた半円の弧に、内向きの歯）
    for (const side of [-1, 1]) {
        g.save(); g.translate(64 + side * 32, 96); g.rotate(side * 0.75);
        g.strokeStyle = '#1b2430'; g.lineWidth = 15; g.beginPath(); g.arc(0, 0, 30, Math.PI, Math.PI * 2); g.stroke();
        g.strokeStyle = '#cbd5e1'; g.lineWidth = 9; g.beginPath(); g.arc(0, 0, 30, Math.PI, Math.PI * 2); g.stroke();
        g.fillStyle = '#e2e8f0'; g.strokeStyle = '#1b2430'; g.lineWidth = 2;
        for (let a = Math.PI + 0.25; a < Math.PI * 2 - 0.2; a += 0.36) {   // 歯（三角）
            g.beginPath(); g.moveTo(Math.cos(a - 0.12) * 26, Math.sin(a - 0.12) * 26); g.lineTo(Math.cos(a) * 14, Math.sin(a) * 14); g.lineTo(Math.cos(a + 0.12) * 26, Math.sin(a + 0.12) * 26); g.closePath(); g.fill(); g.stroke();
        }
        g.restore();
    }
    // 中央の踏み板（円）と芯
    g.fillStyle = '#1b2430'; g.beginPath(); g.ellipse(64, 96, 16, 7, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#e2e8f0'; g.beginPath(); g.ellipse(64, 95, 12, 5, 0, 0, Math.PI * 2); g.fill();
    // 鎖（右下へ 3 つの輪）
    g.strokeStyle = '#1b2430'; g.lineWidth = 5;
    for (let i = 0; i < 3; i++) { g.beginPath(); g.ellipse(100 + i * 7, 108 + i * 3, 5, 3.2, 0.3, 0, Math.PI * 2); g.stroke(); }
    // 煙の渦（白い巻き。トラップが無力になったしるし）
    g.strokeStyle = '#1b2430'; g.lineWidth = 11; g.beginPath(); g.moveTo(60, 70); g.bezierCurveTo(48, 54, 80, 50, 70, 34); g.bezierCurveTo(62, 22, 84, 14, 76, 28); g.stroke();
    g.strokeStyle = '#f1f5f9'; g.lineWidth = 6; g.stroke();
    steel(0);
    _trapTex = new THREE.CanvasTexture(c);
    return _trapTex;
}

function float(sys, x, z, c, s) {   // 足元の輪が体を持ち上げるように縮みながら昇り、白い羽の光が舞う
    frame(sys, x, z, c, 2.0, (g, geos, mats) => {
        const rg = new THREE.RingGeometry(0.7 * s, 0.85 * s, 32); rg.rotateX(-Math.PI / 2); const rm = glow(c, 0.8);
        const fg = new THREE.PlaneGeometry(0.1 * s, 0.28 * s); const fm = glow(0xffffff, 0.9);
        geos.push(rg, fg); mats.push(rm, fm);
        const lift = new THREE.Mesh(rg, rm); g.add(lift);
        const fs = Array.from({ length: 18 }, () => { const m = new THREE.Mesh(fg, fm); g.add(m); return { m, a: rnd(0, 6.28), r: rnd(0.3, 1.0) * s, d: rnd(0, 0.6) }; });
        return { lift, fs };
    }, (q, t, ps) => {
        const k = clamp01(t / 1.2);
        ps.lift.position.y = 0.1 + ease(k) * 1.4;
        ps.lift.scale.setScalar(1 - ease(k) * 0.5);
        ps.lift.material.opacity = 0.8 * (1 - clamp01((q - 0.6) / 0.4));
        for (const p of ps.fs) {
            const kk = clamp01((t - p.d) / 1.2);
            p.m.visible = kk > 0 && kk < 1;
            p.m.position.set(Math.cos(p.a + kk * 2) * p.r + Math.sin(kk * 8) * 0.1, 0.2 + kk * 2.2, Math.sin(p.a + kk * 2) * p.r);
            p.m.rotation.set(kk * 5, p.a, kk * 3);
        }
    });
}

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
    fly: { name: 'フライ', style: 'float', color: '#bae6fd', scale: 1, speed: 2 },
};
