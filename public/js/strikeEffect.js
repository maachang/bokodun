import * as THREE from '/js/three.module.js';

/**
 * 落下系の魔法（爆発火球など）の演出: 地面の予告の輪 → 着弾（onImpact を 1 回呼ぶ）→ 火柱と衝撃波
 * 火柱は fire_pillar の画像（texture）を縦長の板 3 枚で十字に交差させて描く。texture が無い場合は単色
 */
export class StrikeEffectSystem {
    constructor(scene, texture = null) {
        this.scene = scene;
        this.texture = texture;
        this.strikes = [];
    }

    // x, z: 着弾点 / radius: 範囲の半径 / warnTime: 予告の長さ / pillarTime: 火柱の持続 / onImpact: 着弾の瞬間に呼ぶ（ダメージ・効果音など）
    schedule(x, z, { radius = 3, warnTime = 0.3, pillarTime = 0.8, onImpact = null } = {}) {
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
            x, z, radius, warnTime, pillarTime, onImpact,
            t: 0, impacted: false,
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
                this.strikes.splice(i, 1);
            }
        }
    }
}
