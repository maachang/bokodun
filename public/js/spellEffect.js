import * as THREE from '/js/three.module.js';

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
    }

    // 演出 1 つを登録する。life 秒で消える。tick(q, dt): q は 0〜1 の進み。dispose は、消えるときに 1 回
    add(group, life, tick, geos = [], mats = []) {
        this.scene.add(group);
        this.list.push({ group, life, t: 0, tick, geos, mats });
    }

    update(dt) {
        for (let i = this.list.length - 1; i >= 0; i--) {
            const e = this.list[i];
            e.t += dt;
            const q = Math.min(1, e.t / e.life);
            e.tick(q, dt);
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

    // ---- アイスストーム: 氷の輪が広がり、氷片が舞って回る。地面が凍って白くなる ----
    iceStorm(x, z, radius) {
        const group = new THREE.Group();
        group.position.set(x, 0, z);
        const ring = this.ringMesh(group, 0xbfeaff, 0.5, 0.8);
        const frostGeo = new THREE.CircleGeometry(radius, 32); frostGeo.rotateX(-Math.PI / 2);
        const frostMat = new THREE.MeshBasicMaterial({ color: 0xcdeeff, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false });
        const frost = new THREE.Mesh(frostGeo, frostMat); frost.position.y = 0.05; group.add(frost);
        const shardGeo = new THREE.OctahedronGeometry(0.22, 0);
        const shardMat = new THREE.MeshBasicMaterial({ color: 0xe6f8ff, transparent: true, opacity: 0.95 });
        const shards = [];
        for (let i = 0; i < 40; i++) {
            const m = new THREE.Mesh(shardGeo, shardMat);
            const a = rnd(0, Math.PI * 2), d = rnd(0.3, 1) * radius;
            const sh = { m, a, d, h: rnd(0.3, 2.8), w: rnd(1.5, 3.5) * (Math.random() < 0.5 ? -1 : 1), s: rnd(0.5, 1.4) };
            m.scale.set(sh.s, sh.s * 2.2, sh.s);
            group.add(m); shards.push(sh);
        }
        this.particles?.spawnBurst(x, 1.0, z, 0xbfeaff, 24, 5);
        this.add(group, 1.2, (q, dt) => {
            const fade = q > 0.7 ? 1 - (q - 0.7) / 0.3 : 1;
            ring.mesh.scale.setScalar(1 + ease(q) * (radius / 0.8) * 1.3); ring.mat.opacity = 0.9 * (1 - q);
            frostMat.opacity = 0.4 * fade; shardMat.opacity = 0.95 * fade;
            for (const s of shards) { s.a += s.w * dt; s.m.position.set(Math.cos(s.a) * s.d, s.h + q * 0.8, Math.sin(s.a) * s.d); s.m.rotation.y += dt * 5; }
        }, [ring.geo, frostGeo, shardGeo], [ring.mat, frostMat, shardMat]);
    }

    // ---- エアストーム: 薄い緑白の刃の板が、らせんを描いてのぼる。地面の風の輪 ----
    airStorm(x, z, radius) {
        const group = new THREE.Group();
        group.position.set(x, 0, z);
        const ring = this.ringMesh(group, 0xc8f5d8, 0.4, 0.7);
        const geo = new THREE.PlaneGeometry(1.4, 0.12);
        const mat = new THREE.MeshBasicMaterial({ color: 0xd9ffe6, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
        const bl = [];
        for (let i = 0; i < 36; i++) {
            const m = new THREE.Mesh(geo, mat);
            const b = { m, a: rnd(0, Math.PI * 2), h: rnd(0, 1), sp: rnd(4, 7), s: rnd(0.8, 1.6) };
            m.scale.setScalar(b.s);
            group.add(m); bl.push(b);
        }
        this.particles?.spawnBurst(x, 0.6, z, 0xd9ffe6, 20, 4);
        this.add(group, 1.2, (q, dt) => {
            const fade = q > 0.7 ? 1 - (q - 0.7) / 0.3 : Math.min(1, q / 0.1);
            mat.opacity = 0.8 * fade;
            ring.mesh.scale.setScalar(1 + ease(q) * (radius / 0.7) * 1.2); ring.mat.opacity = 0.7 * (1 - q);
            for (const b of bl) {
                b.a += b.sp * dt;
                const y = ((b.h + q * 1.2) % 1) * 3.5, r = radius * (0.25 + 0.75 * (y / 3.5));   // 上にいくほど広がる渦
                b.m.position.set(Math.cos(b.a) * r, y, Math.sin(b.a) * r);
                b.m.rotation.y = -b.a;
            }
        }, [ring.geo, geo], [ring.mat, mat]);
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

    // ---- ピュリフィケーション: 金白の輪が、2 回広がる。光の粒が、のぼる ----
    purify(x, z, radius) {
        const group = new THREE.Group();
        group.position.set(x, 0, z);
        const rings = [0, 1].map(() => this.ringMesh(group, 0xfff1b8, 0.6, 0.85));
        const dotGeo = new THREE.SphereGeometry(0.09, 6, 6);
        const dotMat = new THREE.MeshBasicMaterial({ color: 0xfffbe0, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
        const dots = [];
        for (let i = 0; i < 30; i++) {
            const m = new THREE.Mesh(dotGeo, dotMat), a = rnd(0, Math.PI * 2), d = Math.sqrt(Math.random()) * radius;
            m.position.set(Math.cos(a) * d, 0, Math.sin(a) * d);
            group.add(m); dots.push({ m, sp: rnd(1.5, 3.2), d0: rnd(0, 0.5) });
        }
        this.add(group, 1.2, (q) => {
            rings.forEach((r, i) => { const p = Math.max(0, Math.min(1, (q - i * 0.25) / 0.6)); r.mesh.scale.setScalar(0.2 + ease(p) * (radius / 0.85)); r.mat.opacity = 0.9 * (1 - p); });
            dotMat.opacity = 0.95 * (q > 0.7 ? 1 - (q - 0.7) / 0.3 : 1);
            for (const d of dots) d.m.position.y = Math.max(0, (q - d.d0 * 0.4) * d.sp * 1.4);
        }, [...rings.map((r) => r.geo), dotGeo], [...rings.map((r) => r.mat), dotMat]);
    }
}
