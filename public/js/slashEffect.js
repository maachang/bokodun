import * as THREE from '/js/three.module.js';

/**
 * 近接攻撃の斬撃エフェクト（短時間だけ出る 3D の板・メッシュ）
 * 形・色・大きさ・長さは weaponClasses.json の effect で定義する（shape: slash / thrust / smash / punch）
 */
export class SlashEffectSystem {
    constructor(scene) {
        this.scene = scene;
        this.effects = [];
    }

    // x, z: プレイヤー位置 / angle: プレイヤーの向き / range・arcDeg: 攻撃範囲 / effect: クラスの effect 定義
    spawn(x, z, angle, range, arcDeg, effect) {
        const shape = effect.shape || 'slash';
        const size = effect.size ?? 1.0;
        const duration = effect.duration ?? 0.2;
        const material = new THREE.MeshBasicMaterial({
            color: new THREE.Color(effect.color || '#ffffff'),
            transparent: true,
            opacity: 1,
            side: THREE.DoubleSide,
            depthWrite: false
        });

        // ローカル座標の -Z がプレイヤーの前方（カメラと同じ向き）、y=0 が目の少し下
        const group = new THREE.Group();
        group.position.set(x, 1.4, z);
        group.rotation.y = angle;

        let geometry;
        let mesh;
        let apply;

        if (shape === 'thrust') {
            // 前方へ突き出る細い棘
            geometry = new THREE.ConeGeometry(0.1 * size, range * 0.5, 8);
            geometry.rotateX(-Math.PI / 2);
            mesh = new THREE.Mesh(geometry, material);
            apply = (p) => { mesh.position.set(0, -0.2, -(0.6 + p * range * 0.6)); };
        } else if (shape === 'smash') {
            // 地面に広がる衝撃波のリング
            geometry = new THREE.RingGeometry(0.25, 0.5, 24);
            geometry.rotateX(-Math.PI / 2);
            mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(0, -1.3, -range * 0.7);
            apply = (p) => { mesh.scale.setScalar(1 + p * range * size); };
        } else if (shape === 'punch') {
            // 小さな閃光
            geometry = new THREE.SphereGeometry(0.18 * size, 8, 8);
            mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(0, -0.2, -range);
            apply = (p) => { mesh.scale.setScalar(0.6 + p * 0.8); };
        } else {
            // slash: 正面から見た三日月型の弧（tiltDeg で傾き、sweepDeg だけ回転しながら消える）
            const radius = range * 0.5 * size;
            const theta = Math.max(50, arcDeg) * Math.PI / 180;
            geometry = new THREE.RingGeometry(radius * 0.8, radius, 24, 1, Math.PI / 2 - theta / 2, theta);
            mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(0, -0.1, -range * 0.6);
            const tilt = (effect.tiltDeg ?? 0) * Math.PI / 180;
            const sweep = (effect.sweepDeg ?? 60) * Math.PI / 180;
            apply = (p) => {
                mesh.rotation.z = tilt + sweep * (0.5 - p);
                mesh.scale.setScalar(0.8 + p * 0.4);
            };
        }

        apply(0);
        group.add(mesh);
        this.scene.add(group);
        this.effects.push({ group, geometry, material, apply, duration, t: 0 });
    }

    update(dt) {
        for (let i = this.effects.length - 1; i >= 0; i--) {
            const e = this.effects[i];
            e.t += dt;
            const p = Math.min(1, e.t / e.duration);
            e.apply(p);
            e.material.opacity = 1 - p;
            if (p >= 1) {
                this.scene.remove(e.group);
                e.geometry.dispose();
                e.material.dispose();
                this.effects.splice(i, 1);
            }
        }
    }
}
