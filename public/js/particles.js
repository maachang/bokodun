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

    /**
     * 噴水の吹き出し水しぶき・シャバシャバ飛沫パーティクル
     */
    spawnWaterSpurt(x, y, z, count = 3) {
        const waterColors = [0x38bdf8, 0x7dd3fc, 0xbae6fd, 0xffffff, 0x0284c7];
        for (let i = 0; i < count; i++) {
            const color = waterColors[Math.floor(Math.random() * waterColors.length)];
            const mat = new THREE.MeshBasicMaterial({ color: color });
            const mesh = new THREE.Mesh(this.geo, mat);
            // Distinct visible water drops (0.09 ~ 0.15 size)
            const size = 0.09 + Math.random() * 0.06;
            mesh.scale.set(size, size, size);
            mesh.position.set(
                x + (Math.random() - 0.5) * 0.25,
                y,
                z + (Math.random() - 0.5) * 0.25
            );
            this.scene.add(mesh);

            // Arc upwards in a beautiful umbrella spray shape
            const angle = Math.random() * Math.PI * 2;
            const spreadSpeed = 0.8 + Math.random() * 1.4;
            this.particles.push({
                mesh,
                vx: Math.cos(angle) * spreadSpeed,
                vy: 2.8 + Math.random() * 1.6, // Vigorous upward jet
                vz: Math.sin(angle) * spreadSpeed,
                life: 0.65 + Math.random() * 0.35,
                maxLife: 1.0,
                scale: size
            });
        }
    }

    /**
     * プレイヤーが噴水に触れた時のシャバシャバ水しぶきバースト
     */
    spawnWaterSplash(x, y, z, count = 20) {
        const waterColors = [0x0284c7, 0x38bdf8, 0x7dd3fc, 0xffffff];
        for (let i = 0; i < count; i++) {
            const color = waterColors[Math.floor(Math.random() * waterColors.length)];
            const mat = new THREE.MeshBasicMaterial({ color: color });
            const mesh = new THREE.Mesh(this.geo, mat);
            const size = 0.08 + Math.random() * 0.07;
            mesh.scale.set(size, size, size);
            mesh.position.set(
                x + (Math.random() - 0.5) * 0.6,
                y,
                z + (Math.random() - 0.5) * 0.6
            );
            this.scene.add(mesh);

            const angle = Math.random() * Math.PI * 2;
            const speed = 1.2 + Math.random() * 2.4;
            this.particles.push({
                mesh,
                vx: Math.cos(angle) * speed,
                vy: 2.0 + Math.random() * 2.2, // Pop up visibly
                vz: Math.sin(angle) * speed,
                life: 0.45 + Math.random() * 0.25,
                maxLife: 0.7,
                scale: size
            });
        }
    }

    /**
     * 溶岩からふわっと立ち上る熱気・火の粉
     */
    spawnHeatEmber(x, y, z) {
        const colors = [0xff5500, 0xff8800, 0xffaa33, 0xffdd66];
        const color = colors[Math.floor(Math.random() * colors.length)];
        const mat = new THREE.MeshBasicMaterial({ color: color });
        const mesh = new THREE.Mesh(this.geo, mat);
        const size = 0.05 + Math.random() * 0.05;
        mesh.scale.set(size, size, size);
        mesh.position.set(
            x + (Math.random() - 0.5) * 2.8,
            y + 0.1,
            z + (Math.random() - 0.5) * 2.8
        );
        this.scene.add(mesh);

        this.particles.push({
            mesh,
            vx: (Math.random() - 0.5) * 0.3,
            vy: 0.8 + Math.random() * 0.9, // Rises upward
            vz: (Math.random() - 0.5) * 0.3,
            life: 0.8 + Math.random() * 0.6,
            maxLife: 1.4,
            scale: size,
            noGravity: true
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

            if (!p.noGravity) {
                p.vy -= 9.8 * dt * 0.5; // gentle gravity
            }
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
