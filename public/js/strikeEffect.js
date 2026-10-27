import * as THREE from '/js/three.module.js';

/**
 * 落下系の魔法（爆発火球など）の演出: 地面の予告の輪 → 着弾（onImpact を 1 回呼ぶ）→ 火柱と衝撃波 → 煙
 * 火柱は fire_pillar の画像（texture）を縦長の板 3 枚で十字に交差させて描く。texture が無い場合は単色
 * 煙は火柱が消えた直後から、着弾点の周りに数個の灰色の塊が立ちのぼり、膨らみながら薄くなって消える
 */
export class StrikeEffectSystem {
    constructor(scene, texture = null) {
        this.scene = scene;
        this.texture = texture;
        this.strikes = [];
    }

    // x, z: 着弾点 / radius: 範囲の半径 / warnTime: 予告の長さ / pillarTime: 火柱の持続 / smokeTime: 火柱が消えてからの煙の長さ（0 なら煙なし）
    // onImpact: 着弾の瞬間に呼ぶ（ダメージ・効果音など）
    schedule(x, z, { radius = 3, warnTime = 0.3, pillarTime = 0.8, smokeTime = 0, onImpact = null } = {}) {
        const warn = new THREE.Group();
        warn.position.set(x, 0.06, z);
        const warnMat = new THREE.MeshBasicMaterial({ color: 0xff2200, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false });
        const ringGeo = new THREE.RingGeometry(radius * 0.9, radius, 32);
        ringGeo.rotateX(-Math.PI / 2);
        const fillGeo = new THREE.CircleGeometry(radius * 0.9, 32);
        fillGeo.rotateX(-Math.PI / 2);
        const fillMat = new THREE.MeshBasicMaterial({ color: 0xff4400, transparent: true, opacity: 0.2, side: THREE.DoubleSide, depthWrite: false });
        warn.add(new THREE.Mesh(ringGeo, warnMat), new THREE.Mesh(fillGeo, fillMat));
        this.scene.add(warn);

        this.strikes.push({
            x, z, radius, warnTime, pillarTime, smokeTime, onImpact,
            t: 0, impacted: false, puffs: null,
            warn, warnMat, fillMat, geometries: [ringGeo, fillGeo],
            pillar: null
        });
    }

    // 着弾の瞬間: 予告を消し、火柱（交差する 3 枚の板）と地面の衝撃波リングを出す
    impact(s) {
        this.scene.remove(s.warn);
        s.warnMat.dispose();
        s.fillMat.dispose();
        s.impacted = true;
        if (s.onImpact) s.onImpact();

        const height = 5;
        const width = s.radius * 1.1;
        const pillar = new THREE.Group();
        pillar.position.set(s.x, 0, s.z);

        const mat = new THREE.MeshBasicMaterial({
            map: this.texture || null,
            color: this.texture ? 0xffffff : 0xff6600,
            transparent: true,
            opacity: 1,
            side: THREE.DoubleSide,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });
        const planeGeo = new THREE.PlaneGeometry(width, height);
        for (let i = 0; i < 3; i++) {
            const plane = new THREE.Mesh(planeGeo, mat);
            plane.position.y = height / 2;
            plane.rotation.y = i * Math.PI / 3;
            pillar.add(plane);
        }

        const ringMat = new THREE.MeshBasicMaterial({ color: 0xffdd33, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false });
        const ringGeo = new THREE.RingGeometry(0.6, 0.9, 32);
        ringGeo.rotateX(-Math.PI / 2);
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.y = 0.08;
        pillar.add(ring);

        this.scene.add(pillar);
        s.pillar = { group: pillar, mat, ringMat, ring, planeGeo, ringGeo, height };
    }

    update(dt) {
        for (let i = this.strikes.length - 1; i >= 0; i--) {
            const s = this.strikes[i];
            s.t += dt;

            if (!s.impacted) {
                // 予告: 輪が点滅しながら濃くなる
                const p = Math.min(1, s.t / s.warnTime);
                s.warnMat.opacity = 0.35 + 0.5 * p * (0.6 + 0.4 * Math.sin(s.t * 40));
                if (s.t >= s.warnTime) this.impact(s);
                else continue;
            }

            // 火柱: 最初の 25% で立ち上がり、最後の 30% で消える。衝撃波リングは広がりながら消える
            const q = Math.min(1, (s.t - s.warnTime) / s.pillarTime);
            const pl = s.pillar;
            if (pl) {
                pl.group.scale.y = Math.min(1, q / 0.25) || 0.01;
                pl.mat.opacity = q > 0.7 ? Math.max(0, 1 - (q - 0.7) / 0.3) : 0.85 + 0.15 * Math.sin(s.t * 50);
                pl.ring.scale.setScalar(1 + q * (s.radius / 0.9) * 1.5);
                pl.ringMat.opacity = 0.9 * (1 - q);

                if (q >= 1) {
                    this.scene.remove(pl.group);
                    pl.mat.dispose();
                    pl.ringMat.dispose();
                    pl.planeGeo.dispose();
                    pl.ringGeo.dispose();
                    for (const g of s.geometries) g.dispose();
                    s.pillar = null;
                    if (s.smokeTime > 0) this.startSmoke(s);
                }
            }

            // 煙: 火柱が消えた直後から立ちのぼる。すべての塊が消えたら終了
            if (!s.pillar) {
                if (s.puffs) this.updateSmoke(s, dt);
                if (!s.puffs || s.puffs.length === 0) this.strikes.splice(i, 1);
            }
        }
    }

    // 煙の塊（灰色の球）を、着弾点の周りの範囲内に数個、時間差で出す。各塊は smokeTime 以内に消える
    startSmoke(s) {
        const geo = new THREE.IcosahedronGeometry(0.5, 1);
        s.smokeGeo = geo;
        s.puffs = [];
        const count = 10;
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = Math.sqrt(Math.random()) * s.radius * 0.6;
            const delay = Math.random() * Math.min(0.6, s.smokeTime * 0.3);
            const mat = new THREE.MeshBasicMaterial({ color: 0x4a4a4a, transparent: true, opacity: 0, depthWrite: false });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(s.x + Math.cos(angle) * dist, 0.3, s.z + Math.sin(angle) * dist);
            mesh.visible = false;
            this.scene.add(mesh);
            s.puffs.push({
                mesh, mat, age: 0, delay,
                life: s.smokeTime - delay,
                baseX: mesh.position.x, baseZ: mesh.position.z,
                rise: 1.2 + Math.random() * 0.8,
                startScale: 0.6 + Math.random() * 0.4,
                endScale: 2.0 + Math.random() * 1.0,
                driftX: (Math.random() - 0.5) * 0.8,
                driftZ: (Math.random() - 0.5) * 0.8
            });
        }
    }

    updateSmoke(s, dt) {
        for (let j = s.puffs.length - 1; j >= 0; j--) {
            const f = s.puffs[j];
            f.age += dt;
            if (f.age < f.delay) continue;
            const t = Math.min(1, (f.age - f.delay) / f.life);
            f.mesh.visible = true;
            f.mesh.position.set(f.baseX + f.driftX * t, 0.3 + f.rise * t, f.baseZ + f.driftZ * t);
            f.mesh.scale.setScalar(f.startScale + (f.endScale - f.startScale) * t);
            // 濃い灰色から明るい灰色へ。最初の 20% で現れ、残りでゆっくり薄くなる
            f.mat.color.setRGB(0.29 + 0.3 * t, 0.29 + 0.3 * t, 0.29 + 0.3 * t);
            f.mat.opacity = 0.55 * (t < 0.2 ? t / 0.2 : 1 - (t - 0.2) / 0.8);
            if (t >= 1) {
                this.scene.remove(f.mesh);
                f.mat.dispose();
                s.puffs.splice(j, 1);
            }
        }
        if (s.puffs.length === 0 && s.smokeGeo) {
            s.smokeGeo.dispose();
            s.smokeGeo = null;
        }
    }
}
