import * as THREE from '/js/three.module.js';

/**
 * 自分に使う魔法（回復・補助）の演出。画像を使わず、輪・円柱・球・粒だけで描く（草案。見た目は仮）。
 *   selfCast(sys, style, x, z, { color, scale })
 * style: heal（緑。足元の輪と、立ちのぼる光の粒）/ refresh（黄。らせんを描いて昇る光）/ veil（青。体を包む半球の膜）
 * scale: 大きさ・数の倍率（ハイ〜系は大きくする）
 */
const rnd = (a, b) => a + Math.random() * (b - a);
const ease = (t) => 1 - Math.pow(1 - t, 3);
const add = (mat) => { mat.transparent = true; mat.depthWrite = false; mat.blending = THREE.AdditiveBlending; return mat; };

// 足元の輪（広がって消える）と、昇る輪
// 参考: ICS MEDIA「RPG 風セーブポイント」（二重の光の柱・渦の輪・丸と十字の粒が昇る）。見た目は仮（草案）
// テクスチャは、キャンバスで 1 回だけ作って使い回す（画像ファイルなし）
let _tex = null;
function textures() {
    if (_tex) return _tex;
    const mk = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; return t; };
    _tex = {
        // 丸い光の粒
        orb: mk(64, 64, (g, w, h) => { const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,0.5)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, w, h); }),
        // 十字（回復の印）の火花
        cross: mk(64, 64, (g, w, h) => { const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(w * 0.43, h * 0.08, w * 0.14, h * 0.84); g.fillRect(w * 0.08, h * 0.43, w * 0.84, h * 0.14); g.globalCompositeOperation = 'destination-in'; g.fillStyle = r; g.fillRect(0, 0, w, h); }),
        // 光の柱の縦筋（横に流す）。上下は薄くなる
        streak: mk(256, 64, (g, w, h) => { for (let i = 0; i < 40; i++) { const x = Math.random() * w, ww = 2 + Math.random() * 7; g.fillStyle = `rgba(255,255,255,${0.2 + Math.random() * 0.8})`; g.fillRect(x, 0, ww, h); } const v = g.createLinearGradient(0, 0, 0, h); v.addColorStop(0, 'rgba(0,0,0,1)'); v.addColorStop(0.25, 'rgba(0,0,0,0)'); v.addColorStop(0.8, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,1)'); g.globalCompositeOperation = 'destination-out'; g.fillStyle = v; g.fillRect(0, 0, w, h); }),
        // 足元の渦（弧の欠けた輪）
        swirl: mk(256, 256, (g, w, h) => { g.strokeStyle = 'white'; g.lineCap = 'round'; for (let i = 0; i < 4; i++) { g.lineWidth = 10 - i * 2; g.globalAlpha = 1 - i * 0.2; g.beginPath(); g.arc(w / 2, h / 2, w * (0.46 - i * 0.07), i * 1.1, i * 1.1 + 3.6); g.stroke(); } }),
    };
    return _tex;
}

// 強弱と種類の見分け（草案・仮）。hi: ハイ〜系（scale が大きい）。refresh: 柱なしで、光の粒がらせんに巻いて昇る
//   ヒール（小）: 細く低い柱・粒少なめ・輪 1 つ ／ ハイヒール（大）: 太く高い柱・粒多め・輪 3 つ・長い・画面が光る
//   リフレッシュ: 昇る輪とらせんの粒（小は 2 本・大は 3 本の帯）
function healParams(refresh, hi) {
    if (refresh) return hi ? { pr: 0, ph: 0, n: 48, strands: 3, rings: 4, dur: 2.6, tint: true, size: 1.3, top: 3.6 } : { pr: 0, ph: 0, n: 22, strands: 2, rings: 2, dur: 1.8, tint: false, size: 1, top: 2.4 };
    return hi ? { pr: 0.85, ph: 4.2, n: 36, strands: 0, rings: 3, dur: 2.6, tint: true, size: 1.3, top: 3.6 } : { pr: 0.38, ph: 2.0, n: 12, strands: 0, rings: 1, dur: 1.8, tint: false, size: 1, top: 2.2 };
}

function healLike(sys, style, x, z, color, scale) {
    const T = textures();
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    const geos = [], mats = [];
    const refresh = style === 'refresh';
    const hi = scale > 1.2;
    const P = healParams(refresh, hi);
    const DUR = P.dur;
    const sc0 = hi ? 1.5 : 1;

    // 足元の渦の輪（回りながら広がる）と、広がって消える／昇る輪
    const swGeo = new THREE.RingGeometry(0.2, 1, 48);
    const swMat = add(new THREE.MeshBasicMaterial({ color, map: T.swirl, opacity: 0.9, side: THREE.DoubleSide }));
    const swirl = new THREE.Mesh(swGeo, swMat); swirl.rotation.x = -Math.PI / 2; swirl.position.y = 0.04; group.add(swirl);
    geos.push(swGeo); mats.push(swMat);
    const swGeo2 = new THREE.PlaneGeometry(2, 2);
    const swirl2 = new THREE.Mesh(swGeo2, swMat); swirl2.rotation.x = -Math.PI / 2; swirl2.position.y = 0.05; group.add(swirl2);
    geos.push(swGeo2);
    const rings = [];
    for (let i = 0; i < P.rings; i++) {
        const r = sys.ringMesh(group, i % 2 ? 0xffffff : color, 0.85 * sc0, 1.0 * sc0, 0.06);
        r.mesh.visible = false; geos.push(r.geo); mats.push(r.mat); rings.push({ ...r, delay: 0.1 + i * (refresh ? 0.28 : 0.22) });
    }

    // 光の柱（ヒール系のみ。外と内の二重。筋を逆向きに流す）
    let outer = null, inner = null, outerMat = null, innerMat = null, outerTex = null, innerTex = null;
    if (P.pr > 0) {
        const pGeo = new THREE.CylinderGeometry(P.pr, P.pr, P.ph, 40, 1, true);
        outerTex = T.streak.clone(); outerTex.needsUpdate = true; outerTex.repeat.set(2, 1);
        innerTex = T.streak.clone(); innerTex.needsUpdate = true; innerTex.repeat.set(3, 1);
        outerMat = add(new THREE.MeshBasicMaterial({ color, map: outerTex, side: THREE.DoubleSide, opacity: 0 }));
        innerMat = add(new THREE.MeshBasicMaterial({ color: 0xffffff, map: innerTex, side: THREE.DoubleSide, opacity: 0 }));
        outer = new THREE.Mesh(pGeo, outerMat); inner = new THREE.Mesh(pGeo, innerMat);
        group.add(outer, inner);
        geos.push(pGeo); mats.push(outerMat, innerMat);
    }

    // 昇る粒（丸と十字）。リフレッシュは、帯ごとに等間隔で、らせんに巻いて昇る
    const parts = [];
    for (let i = 0; i < P.n; i++) {
        const cross = !refresh && i % 3 === 0;
        const m = add(new THREE.SpriteMaterial({ map: cross ? T.cross : T.orb, color: cross ? 0xffffff : color, opacity: 0 }));
        const sp = new THREE.Sprite(m); group.add(sp); mats.push(m);
        const strand = refresh ? i % P.strands : 0;
        parts.push({ sp, m, cross, strand, r: (refresh ? 0.75 + (hi ? 0.2 : 0) : rnd(0.25, 0.95)) * sc0,
            a: refresh ? (strand / P.strands) * Math.PI * 2 : rnd(0, Math.PI * 2),
            delay: refresh ? (i / P.n) * 0.9 : rnd(0, 0.7), life: refresh ? 1.1 : rnd(0.9, 1.5), top: refresh ? P.top : rnd(0.7, 1.2) * P.top,
            spin: refresh ? 6.5 : rnd(-1.2, 1.2), size: (cross ? rnd(0.28, 0.42) : rnd(0.16, 0.3)) * P.size * (refresh ? 1.2 : 1) });
    }

    sys.add(group, DUR, (q, dt) => {
        const t = q * DUR;
        const up = ease(Math.min(1, t / 0.35)), fade = q < 0.7 ? 1 : 1 - (q - 0.7) / 0.3;
        if (outer) {
            const pulse = 0.85 + Math.sin(t * 8) * 0.15;
            outer.scale.set(1, up, 1); inner.scale.set(0.9, up, 0.9);
            outer.position.y = inner.position.y = P.ph * up / 2;
            outerTex.offset.x += dt * 0.35; innerTex.offset.x -= dt * 0.5;
            outerMat.opacity = (hi ? 0.6 : 0.4) * fade * pulse; innerMat.opacity = (hi ? 0.8 : 0.5) * fade * pulse;
        }
        const sc = (0.9 + ease(Math.min(1, t / 0.5)) * 0.5) * sc0;
        swirl.scale.setScalar(sc); swirl2.scale.setScalar(sc * 0.75);
        swirl.rotation.z -= dt * (refresh ? 4.5 : 2.2); swirl2.rotation.z += dt * (refresh ? 6 : 3.0);
        swMat.opacity = 0.9 * fade;
        for (const r of rings) {
            const k = Math.max(0, Math.min(1, (t - r.delay) / 0.9));
            r.mesh.visible = k > 0 && k < 1;
            r.mesh.scale.setScalar(refresh ? 0.9 + k * 0.2 : 0.4 + ease(k) * 1.4);
            r.mesh.position.y = refresh ? 0.06 + k * P.top : 0.06;   // リフレッシュの輪は、昇る
            r.mat.opacity = 0.9 * (1 - k);
        }
        for (const s of parts) {
            const k = Math.max(0, Math.min(1, (t - s.delay) / s.life));
            s.sp.visible = k > 0 && k < 1;
            const a = s.a + k * s.spin;
            const rr = s.r * (refresh ? 1 - k * 0.15 : 1 - k * 0.25);
            s.sp.position.set(Math.cos(a) * rr, 0.1 + s.top * (refresh ? k : Math.pow(k, 1.6)), Math.sin(a) * rr);
            s.m.opacity = Math.min(1, k * 6) * (1 - Math.pow(k, 3)) * (s.cross ? 1 + Math.sin(t * 20 + s.a * 5) * 0.3 : 1);
            s.sp.scale.setScalar(s.size * (s.cross ? 1 : 1 - k * 0.4));
            if (s.cross) s.m.rotation = k * 3;
        }
    }, geos, mats);
    if (P.tint) sys.screenTint?.(refresh ? 'rgba(250,204,21,0.12)' : 'rgba(74,222,128,0.14)', 0.6);   // ハイ〜系は、画面がうっすら光る
}

// 補助: 体を包む球状の防壁。足元から輪が広がり、六角の網目の殻が、まばゆく光りながら立ち上がって、脈打つ。
//   外側に衝撃波の輪を 2 つ飛ばし、光の筋が昇る。最後は、殻が細かく砕けて消える
function veil(sys, x, z, color, scale) {
    const group = new THREE.Group();
    group.position.set(x, 1.0, z);
    const geos = [], mats = [];
    const R = 1.9 * scale;
    const gGeo = new THREE.IcosahedronGeometry(R, 2);
    const wGeo = new THREE.IcosahedronGeometry(R * 1.02, 2);
    const glass = add(new THREE.MeshBasicMaterial({ color, opacity: 0.22, side: THREE.DoubleSide }));
    const net = add(new THREE.MeshBasicMaterial({ color: 0xe8f6ff, opacity: 0.9, wireframe: true }));
    const inner = add(new THREE.MeshBasicMaterial({ color, opacity: 0.4, side: THREE.BackSide }));
    const shell = new THREE.Mesh(gGeo, glass), netMesh = new THREE.Mesh(wGeo, net), core = new THREE.Mesh(gGeo, inner);
    group.add(shell, netMesh, core);
    geos.push(gGeo, wGeo); mats.push(glass, net, inner);
    // 足元の輪と、外へ飛ぶ衝撃波
    const waves = [];
    for (let i = 0; i < 3; i++) {
        const r = sys.ringMesh(group, i === 0 ? 0xffffff : color, 0.9 * scale, 1.15 * scale, -0.95);
        geos.push(r.geo); mats.push(r.mat); waves.push({ ...r, delay: i * 0.22 });
    }
    // 昇る光の筋
    const beamGeo = new THREE.CylinderGeometry(0.04, 0.04, 3.4, 4);
    const beamMat = add(new THREE.MeshBasicMaterial({ color: 0xffffff, opacity: 0.8 }));
    geos.push(beamGeo); mats.push(beamMat);
    const beams = [];
    for (let i = 0; i < 18; i++) {
        const m = new THREE.Mesh(beamGeo, beamMat); group.add(m);
        beams.push({ m, a: rnd(0, Math.PI * 2), r: rnd(0.5, 1.0) * R, delay: rnd(0, 0.6) });
    }
    sys.add(group, 2.6, (q, dt) => {
        const t = q * 2.6;
        const rise = ease(Math.min(1, t / 0.45));                 // 0.45 秒で立ち上がる
        const pulse = 1 + Math.sin(t * 9) * 0.025 * (1 - q);      // 脈打つ
        const flash = Math.max(0, 1 - t / 0.35);                  // 立ち上がりの閃光
        const fade = q < 0.72 ? 1 : 1 - (q - 0.72) / 0.28;        // 終わり際に消える
        const s = (0.2 + rise * 0.8) * pulse * (q > 0.72 ? 1 + (q - 0.72) * 1.2 : 1);   // 消えるときは、少し膨らむ
        shell.scale.setScalar(s); netMesh.scale.setScalar(s); core.scale.setScalar(s * 0.98);
        netMesh.rotation.y = t * 0.8; netMesh.rotation.x = t * 0.3;
        glass.opacity = (0.22 + flash * 0.5) * fade;
        net.opacity = (0.55 + Math.sin(t * 12) * 0.25 + flash * 0.4) * fade;
        inner.opacity = (0.3 + flash * 0.5) * fade;
        for (const w of waves) {
            const k = Math.max(0, Math.min(1, (t - w.delay) / 0.8));
            w.mesh.visible = k > 0 && k < 1;
            w.mesh.scale.setScalar(0.6 + ease(k) * 2.6);
            w.mat.opacity = 0.95 * (1 - k);
        }
        for (const b of beams) {
            const k = ((t - b.delay) / 1.2) % 1;
            const on = t > b.delay && fade > 0.05;
            b.m.visible = on;
            b.m.position.set(Math.cos(b.a) * b.r * s, -1 + k * 3.4, Math.sin(b.a) * b.r * s);
            b.m.scale.y = 0.4 + Math.sin(k * Math.PI);
        }
    }, geos, mats);
    sys.screenTint?.('rgba(120,190,255,0.18)', 0.6);   // 立ち上がりに、画面がうっすら青く光る
}

export function selfCast(sys, style, x, z, { color = '#4ade80', scale = 1 } = {}) {
    const c = parseInt(color.slice(1), 16);
    if (style === 'veil') veil(sys, x, z, c, scale);
    else healLike(sys, style, x, z, c, scale);
}
