import * as THREE from '/js/three.module.js';
import { textures } from '/js/selfSpellEffect.js';

/**
 * 体のまわりに円柱状のオーラが立ちのぼる演出（エンチャント・プロテクション）。画像なし。草案・見た目は仮。
 * 足元の光の円盤（同心円と渦）／交差するらせんの網目／縦の光の筋／小さな光の粒 で構成する。
 *   enchant: 炎のように揺らぐ網目＋昇る火の粉（攻撃力アップ）
 *   protect: 細かく密な網目＋横の帯が重なる障壁（防御力アップ）。最後に、きらめいて消える
 *   auraCast(sys, style, x, z, color, scale)
 */
const rnd = (a, b) => a + Math.random() * (b - a);
const ease = (t) => 1 - Math.pow(1 - t, 3);
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const glow = (color, opacity = 1, extra = {}) => new THREE.MeshBasicMaterial({ color, opacity, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, ...extra });

class Helix extends THREE.Curve {   // 円柱にまとわりつく、らせんの線
    constructor(r, h, turns, a0, dir) { super(); this.r = r; this.h = h; this.turns = turns; this.a0 = a0; this.dir = dir; }
    getPoint(t, out = new THREE.Vector3()) {
        const a = this.a0 + this.dir * this.turns * Math.PI * 2 * t;
        return out.set(Math.cos(a) * this.r, t * this.h, Math.sin(a) * this.r);
    }
}

const NORMAL = { blending: THREE.NormalBlending };   // 網目・輪は、地面の色と混ざらないように、通常の合成（色の違いを出す）
const SET = {
    enchant: { strands: 3, turns: 1.2, r: 0.85, h: 2.7, bands: 0, fiery: true, embers: 26, dur: 2.4, tube: 0.045 },
    protect: { strands: 5, turns: 0.9, r: 0.95, h: 2.4, bands: 4, fiery: false, embers: 10, dur: 2.6, tube: 0.022 },
};

export function auraCast(sys, style, x, z, color, scale = 1) {
    const o = SET[style], T = textures(), s = scale;
    const light = new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.4).getHex();   // 薄い同系色（白は使わない）
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    const geos = [], mats = [];

    // 足元の光の円盤: 薄い円・同心円 2 本・渦
    const disc = new THREE.CircleGeometry(1.15 * s, 40); disc.rotateX(-Math.PI / 2);
    const discMat = glow(color, 0.18); const discM = new THREE.Mesh(disc, discMat); discM.position.y = 0.03; group.add(discM);
    geos.push(disc); mats.push(discMat);
    const rings = [[1.0, 1.15], [0.62, 0.68]].map(([a, b]) => {
        const g = new THREE.RingGeometry(a * s, b * s, 48); g.rotateX(-Math.PI / 2);
        const m = glow(light, 0.9, NORMAL); const mesh = new THREE.Mesh(g, m); mesh.position.y = 0.05; group.add(mesh);
        geos.push(g); mats.push(m); return { m };
    });
    const swG = new THREE.PlaneGeometry(2.4 * s, 2.4 * s); swG.rotateX(-Math.PI / 2);
    const swM = glow(color, 0.9, { map: T.swirl }); const swirl = new THREE.Mesh(swG, swM); swirl.position.y = 0.06; group.add(swirl);
    geos.push(swG); mats.push(swM);

    // 交差するらせんの網目（右巻きと左巻きを重ねる）。高さ方向に伸びて立ち上がる
    const lattice = new THREE.Group(); group.add(lattice);
    const tubeMat = glow(color, 0.95, NORMAL); mats.push(tubeMat);
    const coreMat = glow(light, 0.85, NORMAL); mats.push(coreMat);
    for (const dir of [1, -1]) {
        for (let i = 0; i < o.strands; i++) {
            const g = new THREE.TubeGeometry(new Helix(o.r * s, o.h, o.turns, (i / o.strands) * Math.PI * 2, dir), 56, o.tube, 4, false);
            lattice.add(new THREE.Mesh(g, i % 2 ? tubeMat : coreMat)); geos.push(g);
        }
    }
    // 横の帯（プロテクション）: 円柱を取り巻く細い輪が、重なって立つ
    const bandMeshes = [];
    for (let i = 0; i < o.bands; i++) {
        const g = new THREE.TorusGeometry(o.r * s, 0.02, 4, 48); g.rotateX(Math.PI / 2);
        const m = glow(light, 0.8, NORMAL); mats.push(m);
        const mesh = new THREE.Mesh(g, m); group.add(mesh); geos.push(g); bandMeshes.push({ mesh, m, k: (i + 0.5) / o.bands });
    }
    // 縦の光の筋（円柱の面）。炎は、筋を濃く速く流す
    const cg = new THREE.CylinderGeometry(o.r * s * 0.98, o.r * s * 0.98, o.h, 40, 1, true);
    const tex = T.streak.clone(); tex.needsUpdate = true; tex.repeat.set(o.fiery ? 3 : 4, 1);
    const cm = glow(color, o.fiery ? 0.7 : 0.3, { map: tex }); mats.push(cm);
    const cyl = new THREE.Mesh(cg, cm); group.add(cyl); geos.push(cg);

    // 小さな光の粒（円柱のまわりを昇る）。炎は、火の粒を多く
    const parts = [];
    for (let i = 0; i < o.embers; i++) {
        const m = new THREE.SpriteMaterial({ map: T.orb, color: i % 3 ? color : light, opacity: 0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
        const sp = new THREE.Sprite(m); group.add(sp); mats.push(m);
        parts.push({ sp, m, a: rnd(0, 6.28), r: rnd(0.4, 1.05) * s, delay: rnd(0, 0.9), life: rnd(0.9, 1.5), top: o.h * rnd(0.7, 1.15), size: rnd(0.14, o.fiery ? 0.3 : 0.22) * s });
    }

    sys.add(group, o.dur, (q, dt) => {
        const t = q * o.dur, up = ease(clamp01(t / 0.5)), fade = q < 0.72 ? 1 : 1 - (q - 0.72) / 0.28;
        const flick = o.fiery ? 0.75 + Math.random() * 0.25 : 0.9 + Math.sin(t * 6) * 0.1;
        lattice.scale.set(1, Math.max(0.01, up), 1); lattice.rotation.y += dt * (o.fiery ? 1.8 : 0.9);
        cyl.scale.set(1, Math.max(0.01, up), 1); cyl.position.y = o.h * up / 2; tex.offset.x += dt * (o.fiery ? 0.9 : 0.3);
        tubeMat.opacity = 0.95 * fade * flick; coreMat.opacity = 0.85 * fade * flick; cm.opacity = (o.fiery ? 0.7 : 0.3) * fade * flick;
        // 足元
        swirl.rotation.y -= dt * 1.6; swM.opacity = 0.9 * fade; discMat.opacity = 0.18 * fade;
        const pulse = 1 + Math.sin(t * 7) * 0.03;
        rings.forEach((r, i) => { r.m.opacity = (i ? 0.7 : 0.9) * fade; });
        discM.scale.setScalar(pulse);
        // 横の帯: 下から上へ順に光り、昇っていく
        for (const b of bandMeshes) {
            const k = ((t * 0.6 + b.k) % 1);
            b.mesh.position.y = k * o.h * up; b.mesh.scale.setScalar(1 + Math.sin(k * Math.PI) * 0.04);
            b.m.opacity = Math.sin(k * Math.PI) * 0.85 * fade;
        }
        for (const p of parts) {
            const k = clamp01((t - p.delay) / p.life);
            p.sp.visible = k > 0 && k < 1;
            const a = p.a + k * (o.fiery ? 2.5 : 1.2);
            p.sp.position.set(Math.cos(a) * p.r, 0.1 + p.top * Math.pow(k, o.fiery ? 1.3 : 1), Math.sin(a) * p.r);
            p.m.opacity = Math.min(1, k * 6) * (1 - Math.pow(k, 3)) * fade;
            p.sp.scale.setScalar(p.size * (1 - k * 0.4));
        }
    }, geos, mats);
}
