import * as THREE from '/js/three.module.js';
import { selfCast } from '/js/selfSpellEffect.js';
import { playBuff, BUFF_STYLES } from '/js/selfBuffEffect.js';

/**
 * 魔法の演出（画像を使わない。ジオメトリ・線・粒だけで、コードで描く）。
 *   play(style, x, z, { radius })      : 着弾・発動の演出（ground 上の点 x, z が中心）
 *   playFall(style, x, z, time)        : 着弾前の落下（メテオ）。time 秒かけて、上空から x, z へ落ちる
 * style: lightning（落雷）/ meteor（メテオ）/ holy（聖なる柱）/ ice_storm / air_storm / quake / purify
 * 草案（見た目は仮。色・数・長さは、ここの定数を直す）。
 */
const rnd = (a, b) => a + Math.random() * (b - a);
const ease = (t) => 1 - Math.pow(1 - t, 3);

export class SpellEffectSystem {
    constructor(scene, particles = null) {
        this.scene = scene;
        this.particles = particles;
        this.list = [];
        this.speed = 1;   // 再生の速さ（selfCast の opt.speed。2 なら、演出の長さが半分になる）
    }

    // 演出 1 つを登録する。life 秒で消える。tick(q, dt): q は 0〜1 の進み。dispose は、消えるときに 1 回
    add(group, life, tick, geos = [], mats = []) {
        this.scene.add(group);
        this.list.push({ group, life: life / this.speed, speed: this.speed, t: 0, tick, geos, mats });
    }

    update(dt) {
        for (let i = this.list.length - 1; i >= 0; i--) {
            const e = this.list[i];
            e.t += dt;
            const q = Math.min(1, e.t / e.life);
            e.tick(q, dt * e.speed);   // 速く再生するときは、演出の中の時間も、同じ倍率で進める
            if (q >= 1) {
                this.scene.remove(e.group);
                for (const g of e.geos) g.dispose();
                for (const m of e.mats) m.dispose();
                this.list.splice(i, 1);
            }
        }
    }

    // 地面の輪（広がりながら消える）。group に足す
    ringMesh(group, color, inner, outer, y = 0.08) {
        const geo = new THREE.RingGeometry(inner, outer, 40);
        geo.rotateX(-Math.PI / 2);
        const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.y = y;
        group.add(mesh);
        return { mesh, geo, mat };
    }

    // 自分に使う魔法（回復・補助）の演出（selfSpellEffect.js）
    selfCast(style, x, z, opt) {
        this.speed = opt?.speed > 0 ? opt.speed : 1;
        try { if (BUFF_STYLES.includes(style)) playBuff(this, style, x, z, opt); else selfCast(this, style, x, z, opt); } finally { this.speed = 1; }
    }

    play(style, x, z, { radius = 3 } = {}) {
        const fn = { lightning: this.lightning, meteor: this.meteorImpact, holy: this.holy, ice_storm: this.iceStorm, air_storm: this.airStorm, quake: this.quake, purify: this.purify }[style];
        if (fn) fn.call(this, x, z, radius);
    }

    // ---- 落雷: 上空から地面へ、折れ曲がる光の筋（細かく形が変わって、またたく）。地面に白い閃光と輪 ----
    lightning(x, z, radius) {
        const group = new THREE.Group();
        group.position.set(x, 0, z);
        const top = 14, segs = 16;
        const mat = new THREE.LineBasicMaterial({ color: 0xe8f4ff, transparent: true, opacity: 1, blending: THREE.AdditiveBlending });
        const glowMat = new THREE.LineBasicMaterial({ color: 0x60a5fa, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending });
        const geos = [];
        const bolts = [];
        const build = () => {
            for (const b of bolts) { group.remove(b); }
            bolts.length = 0;
            geos.splice(0).forEach((g) => g.dispose());
            const make = (off, m) => {
                const pts = [];
                for (let i = 0; i <= segs; i++) {
                    const k = i / segs, j = (1 - k) * 0.9 + 0.05;
                    pts.push(new THREE.Vector3(rnd(-1, 1) * j * 1.2 + off, top * (1 - k), rnd(-1, 1) * j * 1.2 + off));
                }
                pts[segs].set(0, 0.05, 0);
                const g = new THREE.BufferGeometry().setFromPoints(pts);
                geos.push(g);
                const line = new THREE.Line(g, m);
                group.add(line);
                bolts.push(line);
            };
            make(0, mat); make(0.12, glowMat); make(-0.12, glowMat);
            // 枝分かれ: 途中から、横へ短く
            const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, rnd(3, 7), 0), new THREE.Vector3(rnd(-2, 2), rnd(1, 3), rnd(-2, 2))]);
            geos.push(g);
            const br = new THREE.Line(g, glowMat); group.add(br); bolts.push(br);
        };
        build();
        const ring = this.ringMesh(group, 0xbfdbfe, 0.2, 0.5);
        const flashGeo = new THREE.CircleGeometry(radius * 0.8, 24); flashGeo.rotateX(-Math.PI / 2);
        const flashMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
        const flash = new THREE.Mesh(flashGeo, flashMat); flash.position.y = 0.07; group.add(flash);
        let acc = 0;
        this.particles?.spawnBurst(x, 0.6, z, 0xbfdbfe, 20, 6);
        this.add(group, 0.55, (q, dt) => {
            acc += dt;
            if (acc > 0.06 && q < 0.7) { acc = 0; build(); }
            const a = q > 0.6 ? 1 - (q - 0.6) / 0.4 : 1;
            mat.opacity = a; glowMat.opacity = 0.8 * a;
            ring.mesh.scale.setScalar(1 + q * (radius / 0.5));
            ring.mat.opacity = 0.9 * (1 - q);
            flashMat.opacity = 0.9 * Math.max(0, 1 - q * 2.5);
        }, [ring.geo, flashGeo, ...geos], [mat, glowMat, ring.mat, flashMat]);
    }

    // ---- メテオ（落下）: 斜め上から、燃える岩が落ちる。尾の火の粉つき ----
    playFall(style, x, z, time) {
        if (style !== 'meteor') return;
        const group = new THREE.Group();
        const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9, 1), new THREE.MeshBasicMaterial({ color: 0xffcf6a }));
        const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(1.25, 1), new THREE.MeshBasicMaterial({ color: 0xff5500, wireframe: true }));
        group.add(core, shell);
        const sx = x + 9, sy = 16, sz = z - 5;
        group.position.set(sx, sy, sz);
        let trail = 0;
        this.add(group, time, (q, dt) => {
            const k = q * q;   // だんだん速く
            group.position.set(sx + (x - sx) * k, sy * (1 - k) + 0.6, sz + (z - sz) * k);
            core.rotation.x += dt * 6; shell.rotation.y += dt * 9;
            trail += dt;
            if (trail > 0.03) { trail = 0; this.particles?.spawnBurst(group.position.x, group.position.y, group.position.z, 0xff8800, 4, 1.5); }
        }, [core.geometry, shell.geometry], [core.material, shell.material]);
    }

    // メテオの着弾: 大きな衝撃波の輪・砂煙の輪・飛び散る岩（粒）。火の玉が立ちのぼる
    meteorImpact(x, z, radius) {
        const group = new THREE.Group();
        group.position.set(x, 0, z);
        const r1 = this.ringMesh(group, 0xffb347, 0.5, 0.9), r2 = this.ringMesh(group, 0xff4d00, 0.3, 0.6, 0.1);
        const ballGeo = new THREE.SphereGeometry(1, 16, 12);
        const ballMat = new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
        const ball = new THREE.Mesh(ballGeo, ballMat); group.add(ball);
        this.particles?.spawnBurst(x, 0.8, z, 0xff6a00, 40, 8);
        this.particles?.spawnBurst(x, 1.2, z, 0x6b5b4a, 30, 5);   // 飛び散る岩・砂
        this.add(group, 1.0, (q) => {
            r1.mesh.scale.setScalar(1 + ease(q) * (radius / 0.9) * 1.6); r1.mat.opacity = 0.9 * (1 - q);
            r2.mesh.scale.setScalar(1 + ease(q) * (radius / 0.6) * 1.1); r2.mat.opacity = 0.8 * (1 - q);
            ball.scale.setScalar(0.4 + ease(q) * radius * 0.7); ball.position.y = 0.4 + q * 2.5; ballMat.opacity = 0.85 * (1 - q);
        }, [r1.geo, r2.geo, ballGeo], [r1.mat, r2.mat, ballMat]);
    }

    // ---- ホーリー: 金白の光の柱。細い光の輪が、のぼっていく ----
    holy(x, z, radius) {
        const group = new THREE.Group();
        group.position.set(x, 0, z);
        const h = 9, geo = new THREE.CylinderGeometry(radius * 0.5, radius * 0.6, h, 24, 1, true);
        const mat = new THREE.MeshBasicMaterial({ color: 0xfff1b8, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
        const col = new THREE.Mesh(geo, mat); col.position.y = h / 2; group.add(col);
        const coreGeo = new THREE.CylinderGeometry(radius * 0.18, radius * 0.18, h, 12, 1, true);
        const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
        const core = new THREE.Mesh(coreGeo, coreMat); core.position.y = h / 2; group.add(core);
        const ground = this.ringMesh(group, 0xffe27a, radius * 0.9, radius);
        const rings = [0, 1, 2].map(() => this.ringMesh(group, 0xfff6cc, radius * 0.5, radius * 0.56, 0.3));
        this.particles?.spawnBurst(x, 1.2, z, 0xfff1b8, 24, 3);
        this.add(group, 1.1, (q) => {
            const up = q < 0.2 ? q / 0.2 : 1, fade = q > 0.65 ? 1 - (q - 0.65) / 0.35 : 1;
            col.scale.set(up, 1, up); core.scale.set(up, 1, up);
            mat.opacity = 0.5 * fade; coreMat.opacity = 0.8 * fade;
            ground.mat.opacity = 0.9 * fade;
            rings.forEach((r, i) => { const p = (q * 1.4 + i / 3) % 1; r.mesh.position.y = 0.3 + p * (h - 1); r.mat.opacity = 0.8 * (1 - p) * fade; });
        }, [geo, coreGeo, ground.geo, ...rings.map((r) => r.geo)], [mat, coreMat, ground.mat, ...rings.map((r) => r.mat)]);
    }

    // ---- エアストーム: 風の竜巻。調べた作りに沿って重ねる: 芯の漏斗 + 外側の大きな漏斗（逆回り・うすい）+ 地面の砂ぼこり + 巻き上げた瓦礫（箱）。
    //   「ハンドミキサー」のように、針金の輪が、軸のまわりを、逆向きに回る（泡立て器の形）。瓦礫は、渦に巻き込まれて、のぼり、外へ飛ぶ（破壊） ----
    airStorm(x, z, radius) {
        this.tornado(x, z, radius, { ring: 0xd9ffe6, funs: [0xeafff2, 0xa6e3bd, 0x8fd1a8], wire: 0xf2fff7, dust: 0xb9ad98, burst: [0xc8f5d8, 0x8a7a64], debris: 'rubble' });
    }

    // ---- アイスストーム: エアストームと同じ作りの竜巻。色は青白く、巻き込まれるのは、瓦礫ではなく、氷の刃（細長い結晶）。地面の砂ぼこりは、白い霜の粒 ----
    iceStorm(x, z, radius) {
        this.tornado(x, z, radius, { ring: 0xbfeaff, funs: [0xf0fbff, 0x9fd8ff, 0x7cc4f5], wire: 0xe6f8ff, dust: 0xdff3ff, burst: [0xbfeaff, 0xe6f8ff], debris: 'ice' });
    }

    // 竜巻の共通の作り（エアストーム・アイスストーム）。o: 色（ring・funs 3 色・wire・dust・burst 2 色）と、巻き込むもの debris（rubble=瓦礫の箱 / ice=氷の刃）
    tornado(x, z, radius, o) {
        const group = new THREE.Group();
        group.position.set(x, 0, z);
        const H = 6.5, rTop = radius * 0.7, rAt = (h) => 0.4 + (rTop - 0.4) * Math.pow(h / H, 0.9);
        const ring = this.ringMesh(group, o.ring, 0.4, 0.7);
        const geos = [ring.geo], mats = [ring.mat];
        const track = (g, m) => { geos.push(g); if (!mats.includes(m)) mats.push(m); };
        // 漏斗: 芯（明るい）・外側 2 枚（大きく、うすい。逆回り）
        const mkFun = (rt, rb, color, op) => {
            const g = new THREE.CylinderGeometry(rt, rb, H, 24, 4, true);
            const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
            const mesh = new THREE.Mesh(g, m); mesh.position.y = H / 2; group.add(mesh); track(g, m);
            return { mesh, m, op };
        };
        const funs = [mkFun(rTop * 0.55, 0.25, o.funs[0], 0.35), mkFun(rTop, 0.4, o.funs[1], 0.2), mkFun(rTop * 1.25, 0.55, o.funs[2], 0.12)];
        // ハンドミキサー: 針金の輪（軸を通る縦の楕円）を、角度をずらして並べた「泡立て器」。2 つが、逆向きに回る
        const wireMat = new THREE.LineBasicMaterial({ color: o.wire, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending });
        mats.push(wireMat);
        const whisks = [];
        for (let w = 0; w < 2; w++) {
            const wg = new THREE.Group();
            for (let k = 0; k < 6; k++) {
                const pts = [];
                for (let i = 0; i <= 36; i++) {
                    const t = (i / 36) * Math.PI * 2, h = H * 0.5 * (1 - Math.cos(t)) * (0.55 + w * 0.2) + 0.2;   // 下から上へ、ふくらんで、また軸へ戻る輪
                    pts.push(new THREE.Vector3(Math.sin(t) * rAt(Math.min(H, h)) * (0.8 + w * 0.2), h, 0));
                }
                const g = new THREE.BufferGeometry().setFromPoints(pts); track(g, wireMat);
                const l = new THREE.Line(g, wireMat); l.rotation.y = (k / 6) * Math.PI; wg.add(l);
            }
            group.add(wg); whisks.push({ wg, dir: w ? -1 : 1, sp: 11 + w * 3 });
        }
        // 地面の砂ぼこり（低く、渦のまわりを回りながら、広がる）
        const dustGeo = new THREE.SphereGeometry(0.28, 6, 6);
        const dustMat = new THREE.MeshBasicMaterial({ color: o.dust, transparent: true, opacity: 0.5, depthWrite: false });
        track(dustGeo, dustMat);
        const dust = [];
        for (let i = 0; i < 40; i++) {
            const m = new THREE.Mesh(dustGeo, dustMat); m.scale.setScalar(rnd(0.8, 2.2)); group.add(m);
            dust.push({ m, a: rnd(0, Math.PI * 2), d: rnd(0.4, 1) * radius, sp: rnd(3, 6), h: rnd(0.1, 1.2) });
        }
        // 瓦礫（箱）: 巻き上げられて、のぼり、外へ飛ばされる
        const ice = o.debris === 'ice';
        const debGeo = ice ? new THREE.OctahedronGeometry(0.2, 0) : new THREE.BoxGeometry(0.28, 0.2, 0.22);
        const debMats = (ice ? [0xf0fbff, 0xbfeaff, 0xd6f1ff] : [0x7a6a55, 0x5b5148, 0x8a7a64]).map((c) => new THREE.MeshBasicMaterial({ color: c }));
        track(debGeo, debMats[0]); mats.push(debMats[1], debMats[2]);
        const deb = [];
        for (let i = 0; i < (ice ? 50 : 38); i++) {
            const m = new THREE.Mesh(debGeo, debMats[i % 3]); if (ice) { const sc = rnd(0.7, 1.5); m.scale.set(sc * 0.5, sc * 2.6, sc * 0.9); } else m.scale.setScalar(rnd(0.7, 2)); group.add(m);
            deb.push({ m, a: rnd(0, Math.PI * 2), h: rnd(0, 0.4), sp: rnd(6, 11), up: rnd(0.35, 0.6), fly: rnd(0.55, 0.9), rot: new THREE.Vector3(rnd(-6, 6), rnd(-6, 6), rnd(-6, 6)) });
        }
        this.particles?.spawnBurst(x, 0.6, z, o.burst[0], 24, 5);
        this.particles?.spawnBurst(x, 0.5, z, o.burst[1], 24, 4);
        this.add(group, 1.8, (q, dt) => {
            const grow = Math.min(1, q / 0.18), fade = q > 0.75 ? 1 - (q - 0.75) / 0.25 : 1;
            ring.mesh.scale.setScalar(1 + ease(q) * (radius / 0.7) * 1.2); ring.mat.opacity = 0.7 * (1 - q);
            funs.forEach((f, i) => { f.mesh.scale.set(grow, 1, grow); f.mesh.rotation.y += dt * (i % 2 ? -8 : 7); f.m.opacity = f.op * fade; });
            wireMat.opacity = 0.95 * fade;
            for (const w of whisks) { w.wg.scale.set(grow, 1, grow); w.wg.rotation.y += dt * w.sp * w.dir; }
            dustMat.opacity = 0.5 * fade;
            for (const d of dust) { d.a += d.sp * dt; const r = d.d * (0.5 + q * 0.7); d.m.position.set(Math.cos(d.a) * r, d.h + q * 0.6, Math.sin(d.a) * r); }
            for (const d of deb) {
                d.a += d.sp * dt; d.h += d.up * dt;
                const h = Math.min(H * 1.1, d.h * H), flung = Math.max(0, q - d.fly) / (1 - d.fly + 0.001);   // 終わりに近づくと、外へ飛ばされる
                const r = rAt(Math.min(H, h)) * 1.05 + flung * radius * 1.4;
                d.m.position.set(Math.cos(d.a) * r, h - flung * flung * 2, Math.sin(d.a) * r);
                d.m.rotation.x += d.rot.x * dt; d.m.rotation.y += d.rot.y * dt; d.m.rotation.z += d.rot.z * dt;
                d.m.visible = flung < 0.95;
            }
        }, geos, mats);
    }

    // ---- アースクエイク: 中心から、ひび割れが放射状に走る。茶色の衝撃波と砂煙 ----
    quake(x, z, radius) {
        const group = new THREE.Group();
        group.position.set(x, 0, z);
        const ring = this.ringMesh(group, 0xc9a26b, 0.6, 1.0), ring2 = this.ringMesh(group, 0x8a6a44, 0.3, 0.6, 0.1);
        const mat = new THREE.LineBasicMaterial({ color: 0x2b1b0e, transparent: true, opacity: 1 });
        const geos = [];
        const cracks = [];
        for (let i = 0; i < 12; i++) {
            const a = (i / 12) * Math.PI * 2 + rnd(-0.15, 0.15), pts = [new THREE.Vector3(0, 0.1, 0)];
            let d = 0, ang = a;
            while (d < radius) { d += rnd(0.4, 0.9); ang += rnd(-0.35, 0.35); pts.push(new THREE.Vector3(Math.cos(ang) * d, 0.1, Math.sin(ang) * d)); }
            const g = new THREE.BufferGeometry().setFromPoints(pts);
            geos.push(g);
            const line = new THREE.Line(g, mat);
            line.scale.setScalar(0.01);
            group.add(line); cracks.push(line);
        }
        this.particles?.spawnBurst(x, 0.5, z, 0x8a6a44, 40, 6);
        this.particles?.spawnBurst(x, 1.0, z, 0xb89b72, 24, 3);   // 砂煙
        this.add(group, 1.3, (q) => {
            const fade = q > 0.6 ? 1 - (q - 0.6) / 0.4 : 1;
            for (const c of cracks) c.scale.setScalar(Math.max(0.01, Math.min(1, q / 0.35)));
            mat.opacity = fade;
            ring.mesh.scale.setScalar(1 + ease(q) * (radius / 1.0) * 1.2); ring.mat.opacity = 0.9 * (1 - q);
            ring2.mesh.scale.setScalar(1 + ease(q) * (radius / 0.6) * 0.8); ring2.mat.opacity = 0.8 * (1 - q);
        }, [ring.geo, ring2.geo, ...geos], [ring.mat, ring2.mat, mat]);
    }

    // ゲームの画面全体（3D の描画の範囲。HUD・パネルは除く）に、色の膜をかける（青透過など）。duration 秒で、入って、消える。画面（DOM）がないとき（テスト）は、何もしない
    screenTint(color = 'rgba(110,170,255,0.38)', duration = 1.4) {
        if (typeof document === 'undefined') return;
        const el = document.createElement('div');
        el.style.cssText = `position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;background:radial-gradient(ellipse at center, rgba(255,255,255,0.18) 0%, ${color} 70%);opacity:0;transition:opacity ${duration * 0.25}s ease-out`;
        const wrap = document.getElementById('gameWrapper'), flash = document.getElementById('damageFlash');
        if (wrap && flash) wrap.insertBefore(el, flash);   // ゲームの画面（3D の描画）だけにかける。HUD・パネルの下になる
        else (wrap || document.body).appendChild(el);
        requestAnimationFrame(() => { el.style.opacity = '1'; });
        setTimeout(() => { el.style.transition = `opacity ${duration * 0.6}s ease-in`; el.style.opacity = '0'; }, duration * 400);
        setTimeout(() => el.remove(), duration * 1100);
    }

    // ---- ピュリフィケーション: 画面全体が青く透けて、白い光の粒が、たくさん、のぼる。青白い輪が、2 回広がる ----
    purify(x, z, radius) {
        this.screenTint();
        const group = new THREE.Group();
        group.position.set(x, 0, z);
        const rings = [0, 1].map((i) => this.ringMesh(group, i ? 0xffffff : 0xa8d4ff, 0.6, 0.85));
        const dotGeo = new THREE.SphereGeometry(0.09, 6, 6);
        const dotMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
        const dots = [];
        for (let i = 0; i < 130; i++) {   // 白い粒を増やす。範囲の外にも、ひろく散らす
            const m = new THREE.Mesh(dotGeo, dotMat), a = rnd(0, Math.PI * 2), d = Math.sqrt(Math.random()) * radius * 1.7;
            m.position.set(Math.cos(a) * d, 0, Math.sin(a) * d);
            m.scale.setScalar(rnd(0.6, 2.2));
            group.add(m); dots.push({ m, sp: rnd(1.2, 3.6), d0: rnd(0, 0.6) });
        }
        this.particles?.spawnBurst(x, 1.0, z, 0xffffff, 40, 3);
        this.add(group, 1.4, (q) => {
            rings.forEach((r, i) => { const p = Math.max(0, Math.min(1, (q - i * 0.25) / 0.6)); r.mesh.scale.setScalar(0.2 + ease(p) * (radius / 0.85)); r.mat.opacity = 0.9 * (1 - p); });
            dotMat.opacity = 0.95 * (q > 0.7 ? 1 - (q - 0.7) / 0.3 : 1);
            for (const d of dots) d.m.position.y = Math.max(0, (q - d.d0 * 0.4) * d.sp * 1.6);
        }, [...rings.map((r) => r.geo), dotGeo], [...rings.map((r) => r.mat), dotMat]);
    }
}
