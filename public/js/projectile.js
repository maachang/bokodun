// 飛び道具（矢・魔法・敵の弾）。元は entities.js（長すぎて、編集の誤りが増えるため分割した）。entities.js からも、従来どおり読める（再公開）
import * as THREE from '/js/three.module.js';

export class Projectile {
    constructor(x, z, dirX, dirZ, isPlayer = false, speed = 9, damage = 10, options = {}) {
        this.x = x;
        this.y = 1.3;
        this.z = z;
        this.startX = x;
        this.startZ = z;
        this.dirX = dirX;
        this.dirZ = dirZ;
        this.isPlayer = isPlayer;
        this.speed = speed;
        this.damage = damage;
        this.type = options.type || (isPlayer ? 'player_fireball' : 'magic');
        this.maxDistance = options.maxDistance || 0; // 0 means unlimited by distance (timed life)
        this.sourceMonster = options.sourceMonster || null;
        this.visual = options.visual || null;        // 見た目（呪文の visual 定義: 形・色・大きさ）
        this.status = options.status || null;        // 命中した敵に与える状態異常（燃焼・鈍足）
        this.label = options.label || null;          // 命中時のポップアップに出す名前
        this.soundKind = options.soundKind || null;  // 命中時の効果音の種類（fire / ice / bolt）
        this.element = options.element || null;      // 魔法の属性（fire / ice / none ...）。属性が効かない敵（ガーゴイル）の判定に使う
        this.hitsLeft = options.pierce || 1;         // 貫通できる残り体数（1=貫通しない）
        this.hitMonsters = new Set();                // 貫通中に、すでに当たった敵（二重ヒットしない）
        this.radius = (this.type === 'arrow') ? 0.25 : 0.45;
        this.active = true;
        this.lifeTime = (this.type === 'arrow') ? 2.0 : 3.5;
        this.trailTimer = 0;
        this.isDropping = false;
        this.dropVelocityY = 0;

        // Group containing projectile 3D geometry
        this.mesh = new THREE.Group();

        this.buildMesh();

        this.mesh.position.set(this.x, this.y, this.z);
    }

    // 飛び道具の 3D の形（矢・毒の息・炎の息・炎の矢。それ以外は buildMeshMagic）
    buildMesh() {
        if (this.type === 'arrow') {
            // Realistic 3D Arrow: Shaft, Metal Tip, and Fletching
            this.color = 0xd4d4d8;
            this.trailColor = 0xa1a1aa;

            // Arrow shaft (Cylinder lying horizontally along flight direction)
            const shaftGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.7, 6);
            const shaftMat = new THREE.MeshLambertMaterial({ color: 0x8b5a2b });
            const shaft = new THREE.Mesh(shaftGeo, shaftMat);
            shaft.rotation.x = Math.PI / 2; // Lie along Z axis
            this.mesh.add(shaft);

            // Metal arrowhead tip (Cone pointing forward)
            const tipGeo = new THREE.ConeGeometry(0.06, 0.16, 6);
            const tipMat = new THREE.MeshLambertMaterial({ color: 0xe4e4e7 });
            const tip = new THREE.Mesh(tipGeo, tipMat);
            tip.rotation.x = -Math.PI / 2; // Point forward along -Z
            tip.position.z = -0.42;
            this.mesh.add(tip);

            // Fletching feathers at the back
            const fletchGeo = new THREE.BoxGeometry(0.12, 0.08, 0.14);
            const fletchMat = new THREE.MeshLambertMaterial({ color: 0xdc2626 }); // Red fletching feathers
            const fletch = new THREE.Mesh(fletchGeo, fletchMat);
            fletch.position.z = 0.28;
            this.mesh.add(fletch);

            // Rotate entire arrow to face heading direction
            const yaw = Math.atan2(-this.dirX, -this.dirZ);
            this.mesh.rotation.y = yaw;
        } else if (this.type === 'poison_breath') {
            // Acid Worm Toxic Breath / Poison Mist cloud
            this.color = 0x84cc16;
            this.trailColor = 0xa3e635;
            this.lifeTime = 0.9; // Short-lived close-range lingering mist
            const mistGeo = new THREE.DodecahedronGeometry(0.42, 1);
            const mistMat = new THREE.MeshBasicMaterial({ color: 0x4ade80, wireframe: true });
            this.aura = new THREE.Mesh(mistGeo, mistMat);
            this.mesh.add(this.aura);
        } else if (this.type === 'breath_fire') {
            // 炎のブレス（ドラゴン・ドラゴンフライなど）: 赤橙の炎の塊
            this.color = 0xff6a00;
            this.trailColor = 0xffb347;
            this.lifeTime = 1.4;
            const fireGeo = new THREE.DodecahedronGeometry(0.5, 1);
            const fireMat = new THREE.MeshBasicMaterial({ color: 0xff7a1a, wireframe: true });
            this.aura = new THREE.Mesh(fireGeo, fireMat);
            this.mesh.add(this.aura);
            this.mesh.add(new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffe08a })));
        } else if (this.type === 'fire_bolt') {
            // 火の連射（ガーゴイルなど）: 小さめの火の玉。遠くまで飛ぶ
            this.color = 0xff5a10;
            this.trailColor = 0xffa940;
            this.lifeTime = 3.2;
            this.radius = 0.4;
            const boltGeo = new THREE.DodecahedronGeometry(0.34, 1);
            const boltMat = new THREE.MeshBasicMaterial({ color: 0xff6a1a, wireframe: true });
            this.aura = new THREE.Mesh(boltGeo, boltMat);
            this.mesh.add(this.aura);
            this.mesh.add(new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffe08a })));
        } else {
            this.buildMeshMagic();
        }
    }

    // 飛び道具の 3D の形（毒の粉・プレイヤーの魔法・敵の魔法。buildMesh の続き）
    buildMeshMagic() {
        if (this.type === 'poison_dust') {
            // Poison Moth Spores / Toxic Dust Cluster
            this.color = 0xd946ef;
            this.trailColor = 0xa855f7;
            this.lifeTime = 2.5;
            const sporeGeo = new THREE.SphereGeometry(0.22, 6, 6);
            const sporeMat = new THREE.MeshBasicMaterial({ color: 0xf472b6 });
            const spore = new THREE.Mesh(sporeGeo, sporeMat);

            const dustRingGeo = new THREE.TorusGeometry(0.32, 0.05, 4, 8);
            const dustRingMat = new THREE.MeshBasicMaterial({ color: 0xa855f7 });
            this.aura = new THREE.Mesh(dustRingGeo, dustRingMat);

            this.mesh.add(spore);
            this.mesh.add(this.aura);
        } else if (this.isPlayer) {
            // プレイヤーの魔法弾: 見た目は呪文の visual で決まる（orb=火球 / crystal=氷の礫 / bolt=細長い光弾）。未指定は従来の火球
            const v = this.visual || {};
            const hex = (c, def) => new THREE.Color(c ?? def).getHex();
            this.color = hex(v.aura, '#ff6600');
            this.trailColor = hex(v.trail, '#ffaa00');
            const coreMat = new THREE.MeshBasicMaterial({ color: hex(v.core, '#ffffff') });
            const auraMat = new THREE.MeshBasicMaterial({ color: hex(v.aura, '#ff4400'), wireframe: true });
            let coreGeo, auraGeo;
            if (v.shape === 'crystal') {
                coreGeo = new THREE.OctahedronGeometry(0.22);
                auraGeo = new THREE.OctahedronGeometry(0.34);
            } else if (v.shape === 'bolt') {
                coreGeo = new THREE.BoxGeometry(0.08, 0.08, 0.7);
                auraGeo = new THREE.BoxGeometry(0.16, 0.16, 0.9);
                this.mesh.rotation.y = Math.atan2(-this.dirX, -this.dirZ); // 長い軸を進行方向へ向ける
                this.noSpin = true;                               // 細長い光弾は回転させない
            } else {
                coreGeo = new THREE.SphereGeometry(0.25, 8, 8);
                auraGeo = new THREE.DodecahedronGeometry(0.38, 1);
            }
            const core = new THREE.Mesh(coreGeo, coreMat);
            this.aura = new THREE.Mesh(auraGeo, auraMat);
            this.mesh.add(core);
            this.mesh.add(this.aura);
            if (v.size) this.mesh.scale.setScalar(v.size);
        } else {
            // Enemy Dark Magic: Violet / Magenta Energy Sphere
            this.color = 0xa855f7;
            this.trailColor = 0xec4899;
            const coreGeo = new THREE.SphereGeometry(0.24, 8, 8);
            const coreMat = new THREE.MeshBasicMaterial({ color: 0xfae8ff });
            const core = new THREE.Mesh(coreGeo, coreMat);

            const ringGeo = new THREE.TorusGeometry(0.36, 0.06, 6, 12);
            const ringMat = new THREE.MeshBasicMaterial({ color: 0x9333ea });
            this.aura = new THREE.Mesh(ringGeo, ringMat);

            this.mesh.add(core);
            this.mesh.add(this.aura);
        }
    }

    // 高さを決める。y: 発射時の高さ、vy: 上下の速さ（負は下向き。起伏のあるマップで、下にいる敵へ飛ばす）
    setHeight(y, vy = 0) {
        this.y = y;
        this.vy = vy;
        this.mesh.position.y = y;
    }

    update(dt, colliders, particles) {
        this.lifeTime -= dt;
        if (this.lifeTime <= 0) {
            this.active = false;
            return;
        }

        const traveledDist = Math.hypot(this.x - this.startX, this.z - this.startZ);

        // Arrow ballistic drop / maximum effective range logic
        if (this.type === 'arrow' && this.maxDistance > 0) {
            // When reaching 75% of max distance, arrow starts to lose kinetic energy & dip downwards
            if (traveledDist >= this.maxDistance * 0.75) {
                this.isDropping = true;
                this.dropVelocityY += 12 * dt; // Gravity acceleration
                this.y -= this.dropVelocityY * dt;
                this.mesh.position.y = this.y;

                // Tilt arrow tip downwards naturally
                const pitchAngle = Math.min(Math.PI / 3, (this.dropVelocityY / 6));
                this.mesh.rotation.x = pitchAngle;

                // Hit ground when dropping below Y=0.08
                if (this.y <= 0.08 || traveledDist >= this.maxDistance) {
                    this.active = false;
                    // Spawn small dust / dirt flecks when hitting ground
                    if (particles) {
                        particles.spawnBurst(this.x, 0.05, this.z, 0x78716c, 6, 1.5);
                    }
                    return;
                }
            }
        }

        // Horizontal Movement
        this.x += this.dirX * this.speed * dt;
        this.z += this.dirZ * this.speed * dt;
        this.mesh.position.x = this.x;
        this.mesh.position.z = this.z;
        if (this.vy) {   // 上下にも進む（高い所から、低い所の敵へ）
            this.y += this.vy * dt;
            this.mesh.position.y = this.y;
        }

        // Aura spin for magic/fireball
        if (this.aura && !this.noSpin) {
            this.aura.rotation.x += dt * 8;
            this.aura.rotation.y += dt * 10;
        }

        // Emit particle trail
        this.trailTimer += dt;
        const trailInterval = (this.type === 'arrow') ? 0.08 : 0.04;
        if (this.trailTimer >= trailInterval && particles) {
            this.trailTimer = 0;
            const trailSize = (this.type === 'arrow') ? 0.04 : 0.09;
            particles.spawnTrail(this.x, this.y, this.z, this.trailColor, trailSize);
        }

        // Check wall collision (skip colliders that do not block projectiles like water/low barriers)
        for (const c of colliders) {
            if (c.blocksProjectiles === false) continue;
            if (this.x >= c.minX && this.x <= c.maxX &&
                this.z >= c.minZ && this.z <= c.maxZ) {
                this.active = false;
                if (particles) {
                    const burstCount = (this.type === 'arrow') ? 5 : 12;
                    const burstSpeed = (this.type === 'arrow') ? 1.5 : 3.5;
                    particles.spawnBurst(this.x, this.y, this.z, this.color, burstCount, burstSpeed);
                }
                break;
            }
        }
    }
}
