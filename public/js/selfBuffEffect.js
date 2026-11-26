import * as THREE from '/js/three.module.js';
import { auraCast } from '/js/selfAuraEffect.js';

/**
 * 自分に使う魔法のうち、補助・解除・道具系の演出（画像なし。コードで描く。草案・見た目は仮）。
 *   playBuff(sys, style, x, z, { color, scale })
 * style: buff（上向きの矢印が昇る=攻撃力アップ）/ guard（盾の板が体のまわりを回る=防御アップ）/ haste（風の筋が回る=移動速度アップ）
 *        cleanse（紫の毒の粒が抜けて、白く昇る=毒の回復）/ unlock（金の鍵が複数、体のまわりを回りながら昇る）/ trap（赤い罠の紋様が回って消える）
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

function buff(sys, x, z, c, s) {   // 上向きの矢印（円錐）が、体のまわりから昇る
    frame(sys, x, z, c, 1.8, (g, geos, mats) => {
        const geo = new THREE.ConeGeometry(0.16 * s, 0.4 * s, 4); const mat = glow(c, 1, { blending: THREE.NormalBlending });
        geos.push(geo); mats.push(mat);
        return Array.from({ length: 14 }, (_, i) => {
            const m = new THREE.Mesh(geo, mat); g.add(m);
            return { m, a: (i / 14) * Math.PI * 2, r: rnd(0.7, 1.1) * s, delay: (i % 7) * 0.12 };
        });
    }, (q, t, ps) => {
        for (const p of ps) {
            const k = clamp01((t - p.delay) / 1.0);
            p.m.visible = k > 0 && k < 1;
            p.m.position.set(Math.cos(p.a) * p.r, 0.2 + k * 2.4, Math.sin(p.a) * p.r);
            p.m.material.opacity = 1 - k * 0.8;
        }
    });
}

function guard(sys, x, z, c, s) {   // 盾の板が、体のまわりを回りながら現れ、最後に外へ散る
    frame(sys, x, z, c, 2.2, (g, geos, mats) => {
        const geo = new THREE.BoxGeometry(0.55 * s, 0.8 * s, 0.05); const mat = glow(c, 0.85, { blending: THREE.NormalBlending });
        geos.push(geo); mats.push(mat);
        return Array.from({ length: 6 }, (_, i) => {
            const m = new THREE.Mesh(geo, mat); g.add(m);
            return { m, a: (i / 6) * Math.PI * 2 };
        });
    }, (q, t, ps) => {
        const k = ease(clamp01(t / 0.5)), out = clamp01((q - 0.7) / 0.3);
        for (const p of ps) {
            const a = p.a + t * 3.2, r = (1.3 * k + out * 1.6) * s;
            p.m.position.set(Math.cos(a) * r, 1.0, Math.sin(a) * r);
            p.m.rotation.y = -a + Math.PI / 2;
            p.m.scale.setScalar(Math.max(0.01, k * (1 - out)));
        }
    });
}

function haste(sys, x, z, c, s) {   // 風の筋（細い線）が、らせんを描いて足元を駆け上がる
    frame(sys, x, z, c, 1.6, (g, geos, mats) => {
        const geo = new THREE.BoxGeometry(0.04, 0.04, 0.9 * s); const mat = glow(c, 1, { blending: THREE.NormalBlending });
        geos.push(geo); mats.push(mat);
        return Array.from({ length: 16 }, (_, i) => {
            const m = new THREE.Mesh(geo, mat); g.add(m);
            return { m, a: (i / 16) * Math.PI * 2, y: rnd(0.1, 1.8), v: rnd(5, 8) };
        });
    }, (q, t, ps) => {
        const fade = 1 - clamp01((q - 0.6) / 0.4);
        for (const p of ps) {
            const a = p.a + t * p.v, r = 1.0 * s * (0.8 + 0.2 * Math.sin(t * 4 + p.y));
            p.m.position.set(Math.cos(a) * r, p.y + t * 0.3, Math.sin(a) * r);
            p.m.rotation.y = -a;           // 筋は、円の接線の向き
            p.m.material.opacity = fade;
        }
    });
}

function cleanse(sys, x, z, c, s) {   // 紫の毒の粒が、体から外へ抜けて薄れ、そのあと白い光が昇る
    frame(sys, x, z, c, 1.8, (g, geos, mats) => {
        const geo = new THREE.OctahedronGeometry(0.15 * s, 0);
        const bad = glow(c, 1, { blending: THREE.NormalBlending }), good = glow(0xffffff);
        geos.push(geo); mats.push(bad, good);
        return Array.from({ length: 30 }, (_, i) => {
            const m = new THREE.Mesh(geo, i < 18 ? bad : good); g.add(m);
            return { m, poison: i < 18, a: rnd(0, Math.PI * 2), r: rnd(0.2, 0.5), tr: rnd(1.4, 2.2) * s, delay: rnd(0, 0.4) };
        });
    }, (q, t, ps) => {
        for (const p of ps) {
            const k = clamp01((t - p.delay) / (p.poison ? 0.8 : 1.1));
            p.m.visible = k > 0 && k < 1;
            if (p.poison) p.m.position.set(Math.cos(p.a) * (p.r + k * p.tr), 1.0 + k * 0.6, Math.sin(p.a) * (p.r + k * p.tr));
            else p.m.position.set(Math.cos(p.a + k * 4) * p.r * 1.6, 0.1 + k * 2.4, Math.sin(p.a + k * 4) * p.r * 1.6);
            p.m.scale.setScalar(1 - k * 0.5);
        }
    });
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

function unlock(sys, x, z, c, s) {   // 金の鍵が複数、体のまわりを回りながら昇り、終わり際に火花を散らして消える（鍵は、常にこちらを向く絵）
    frame(sys, x, z, c, 2.2, (g, geos, mats) => {
        const sg = new THREE.OctahedronGeometry(0.06 * s, 0);
        const sm = glow(0xffffff);
        geos.push(sg); mats.push(sm);
        const keyMats = [];
        const keys = Array.from({ length: 6 }, (_, i) => {
            const m = new THREE.SpriteMaterial({ map: keyTexture(), color: c, transparent: true, depthWrite: false, depthTest: false });
            const sp = new THREE.Sprite(m); g.add(sp); mats.push(m); keyMats.push(m);
            return { sp, a: (i / 6) * Math.PI * 2, r: (0.95 + (i % 2) * 0.3) * s, delay: i * 0.08, y0: 0.5 + (i % 3) * 0.35 };
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
            p.sp.scale.setScalar(0.9 * ps.s * ease(clamp01(k * 3)));
        }
        for (const m of ps.keyMats) m.opacity = fade;
        for (const p of ps.sparks) {   // 終わり際に、火花が外へ散る
            const k = clamp01((t - 1.0) / 0.6);
            p.m.visible = k > 0 && k < 1;
            p.m.position.set(Math.cos(p.a) * k * p.v, p.y + k * 0.4, Math.sin(p.a) * k * p.v);
        }
    });
}

function trap(sys, x, z, c, s) {   // 赤い罠の紋様（二重の輪と十字）が足元で回って、はじけて消える
    frame(sys, x, z, c, 1.4, (g, geos, mats) => {
        const mat = glow(c, 0.9); mats.push(mat);
        const bar = new THREE.BoxGeometry(2.0 * s, 0.03, 0.08); geos.push(bar);
        const ring = new THREE.RingGeometry(0.7 * s, 0.8 * s, 32); ring.rotateX(-Math.PI / 2); geos.push(ring);
        const marks = new THREE.Group();
        for (const r of [0, Math.PI / 2, Math.PI / 4, -Math.PI / 4]) { const b = new THREE.Mesh(bar, mat); b.rotation.y = r; marks.add(b); }
        marks.add(new THREE.Mesh(ring, mat));
        marks.position.y = 0.1; g.add(marks);
        return { marks, mat };
    }, (q, t, ps) => {
        ps.marks.rotation.y = t * 2.5;
        ps.marks.scale.setScalar(0.5 + ease(clamp01(t / 0.4)) * 0.6 + clamp01((q - 0.7) / 0.3) * 0.8);
        ps.mat.opacity = 0.9 * (1 - clamp01((q - 0.7) / 0.3));
    });
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

const STYLES = { buff, guard, haste, cleanse, unlock, trap, float,
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
    speedy: { name: 'スピーディー', style: 'haste', color: '#22d3ee', scale: 1, speed: 2 },
    unlock: { name: 'アンロック', style: 'unlock', color: '#facc15', scale: 1, speed: 1 },
    trap: { name: 'トラップ', style: 'trap', color: '#ef4444', scale: 1, speed: 2 },
    fly: { name: 'フライ', style: 'float', color: '#bae6fd', scale: 1, speed: 2 },
};
