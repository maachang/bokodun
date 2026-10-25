import * as THREE from '/js/three.module.js';

export class ParticleSystem {
    constructor(scene) {
        this.scene = scene;
        this.particles = [];
        this.geo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
    }

    /**
     * 着弾・爆発時のレトロスパークエフェクト
     */
    spawnBurst(x, y, z, colorHex, count = 10, speed = 4) {
        const mat = new THREE.MeshBasicMaterial({ color: colorHex });
        for (let i = 0; i < count; i++) {
            const mesh = new THREE.Mesh(this.geo, mat);
            mesh.position.set(x, y, z);
            this.scene.add(mesh);

            // Random spherical explosion velocity
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos((Math.random() * 2) - 1);
            const v = (0.5 + Math.random() * 0.5) * speed;

            this.particles.push({
                mesh,
                vx: Math.sin(phi) * Math.cos(theta) * v,
                vy: Math.sin(phi) * Math.sin(theta) * v + 1.5,
                vz: Math.cos(phi) * v,
                life: 0.35 + Math.random() * 0.15,
                maxLife: 0.5,
                scale: 1.0
            });
        }
    }

    /**
     * 飛び道具が飛んでいる間のトレイル（尾を引く煙・火の粉）
     */
    spawnTrail(x, y, z, colorHex, size = 0.08) {
        const mat = new THREE.MeshBasicMaterial({ color: colorHex });
        const mesh = new THREE.Mesh(this.geo, mat);
        mesh.scale.set(size, size, size);
        mesh.position.set(
            x + (Math.random() - 0.5) * 0.15,
            y + (Math.random() - 0.5) * 0.15,
            z + (Math.random() - 0.5) * 0.15
        );
        this.scene.add(mesh);

        this.particles.push({
            mesh,
            vx: (Math.random() - 0.5) * 0.4,
            vy: (Math.random() - 0.5) * 0.4,
            vz: (Math.random() - 0.5) * 0.4,
            life: 0.25,
            maxLife: 0.25,
            scale: size
        });
    }

    update(dt) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.life -= dt;
            if (p.life <= 0) {
                this.scene.remove(p.mesh);
                this.particles.splice(i, 1);
                continue;
            }

            p.vy -= 9.8 * dt * 0.5; // gentle gravity
            p.mesh.position.x += p.vx * dt;
            p.mesh.position.y += p.vy * dt;
            p.mesh.position.z += p.vz * dt;

            // Shrink as it expires
            const ratio = p.life / p.maxLife;
            p.mesh.scale.setScalar(Math.max(0.01, ratio * p.scale));
        }
    }

    clear() {
        for (const p of this.particles) {
            this.scene.remove(p.mesh);
        }
        this.particles = [];
    }
}
