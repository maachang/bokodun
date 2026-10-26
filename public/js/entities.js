import * as THREE from '/js/three.module.js';

export class Monster {
    constructor(enemyType, x, z, textures, enemyDef = null) {
        this.type = enemyType;
        this.textures = textures;
        this.x = x;
        this.z = z;
        this.radius = enemyDef?.radius ?? 0.8;
        this.active = true;
        this.id = 'm_' + Math.random().toString(36).substring(2, 9);
        this.iconUrl = '/images/enemies/slime_char.png';

        if (enemyDef) {
            this.name = enemyDef.name || 'モンスター';
            this.maxHp = enemyDef.maxHp || 30;
            this.hp = this.maxHp;
            this.speed = enemyDef.speed || 1.5;
            this.attackPower = enemyDef.attackPower || 10;
            this.exp = enemyDef.exp || 20;
            this.canShoot = !!enemyDef.canShoot;
            this.shootType = enemyDef.shootType || 'magic';
            this.shootCooldown = enemyDef.shootCooldown || 99999;
            this.shootTimer = this.canShoot ? Math.random() * 2 : 0;
            this.shootRange = enemyDef.shootRange || 15;
            this.maxArrowDistance = enemyDef.maxArrowDistance || 13;
            
            const texKey = enemyDef.texture || 'slime';
            this.spriteMat = new THREE.SpriteMaterial({ map: textures[texKey] || textures.slime, transparent: true });
            this.scale = enemyDef.scale ? [...enemyDef.scale] : [2.2, 2.0, 1];
            this.y = enemyDef.y ?? 1.0;

            if (texKey === 'goblinArcher') {
                this.iconUrl = '/images/enemies/goblin_archer.png';
            } else if (texKey === 'goblin') {
                this.iconUrl = '/images/enemies/goblin_mage.png';
            } else if (texKey === 'skeleton') {
                this.iconUrl = '/images/enemies/skeleton_char.png';
            } else {
                this.iconUrl = '/images/enemies/slime_char.png';
            }
        } else {
            // Fallback for compatibility
            if (enemyType === 'S' || enemyType === 'slime') {
                this.name = 'スライム';
                this.maxHp = 30;
                this.hp = 30;
                this.speed = 1.6;
                this.attackPower = 8;
                this.exp = 15;
                this.shootCooldown = 99999;
                this.canShoot = false;
                this.spriteMat = new THREE.SpriteMaterial({ map: textures.slime, transparent: true });
                this.scale = [2.2, 2.0, 1];
                this.y = 1.0;
                this.iconUrl = '/images/enemies/slime_char.png';
            } else if (enemyType === 'K' || enemyType === 'skeleton') {
                this.name = 'スケルトン剣士';
                this.maxHp = 60;
                this.hp = 60;
                this.speed = 2.0;
                this.attackPower = 14;
                this.exp = 40;
                this.shootCooldown = 99999;
                this.canShoot = false;
                this.spriteMat = new THREE.SpriteMaterial({ map: textures.skeleton, transparent: true });
                this.scale = [2.4, 2.5, 1];
                this.y = 1.25;
                this.iconUrl = '/images/enemies/skeleton_char.png';
            } else {
                this.name = 'ゴブリンアーチャー';
                this.maxHp = 45;
                this.hp = 45;
                this.speed = 1.1;
                this.attackPower = 10;
                this.exp = 35;
                this.shootCooldown = 2.2;
                this.shootTimer = Math.random() * 2;
                this.canShoot = true;
                this.shootType = 'arrow';
                this.shootRange = 14;
                this.maxArrowDistance = 13;
                this.spriteMat = new THREE.SpriteMaterial({ map: textures.goblin, transparent: true });
                this.scale = [2.3, 2.6, 1];
                this.y = 1.3;
                this.iconUrl = '/images/enemies/goblin_archer.png';
            }
        }

        this.sprite = new THREE.Sprite(this.spriteMat);
        this.sprite.center.set(0.5, 0.0); // Anchor directly to the ground!
        this.sprite.scale.set(this.scale[0], this.scale[1], this.scale[2]);
        this.sprite.position.set(this.x, 0.0, this.z);

        this.knockback = new THREE.Vector3();
        this.hitTimer = 0;
    }

    update(dt, player, colliders, projectiles, soundFx, scene) {
        if (!this.active) return;

        // Knockback decay
        if (this.knockback.lengthSq() > 0.001) {
            this.x += this.knockback.x * dt;
            this.z += this.knockback.z * dt;
            this.knockback.multiplyScalar(Math.max(0, 1 - dt * 10));
        }

        // Hit flash
        if (this.hitTimer > 0) {
            this.hitTimer -= dt;
            this.spriteMat.color.setHex(0xff3333);
        } else {
            this.spriteMat.color.setHex(0xffffff);
        }

        const dx = player.x - this.x;
        const dz = player.z - this.z;
        const dist = Math.hypot(dx, dz);

        // Simple chase behavior if in range
        if (dist < 18 && dist > 1.0 && this.knockback.lengthSq() < 0.1) {
            const dirX = dx / dist;
            const dirZ = dz / dist;
            const nextX = this.x + dirX * this.speed * dt;
            const nextZ = this.z + dirZ * this.speed * dt;

            // Check collision with walls
            if (!this.checkWallCollision(nextX, this.z, colliders)) {
                this.x = nextX;
            }
            if (!this.checkWallCollision(this.x, nextZ, colliders)) {
                this.z = nextZ;
            }
        }

        // Projectile shooting logic for Archer / Mage
        const effectiveShootRange = this.shootRange || 15;
        if (this.canShoot && dist < effectiveShootRange && dist > 1.2) {
            this.shootTimer -= dt;
            if (this.shootTimer <= 0) {
                this.shootTimer = this.shootCooldown;
                const dirX = dx / dist;
                const dirZ = dz / dist;

                const isArrow = (this.shootType === 'arrow');
                const projSpeed = isArrow ? 12 : 8; // Arrows fly fast
                const projDmg = isArrow ? 10 : 8;
                const maxDist = isArrow ? (this.maxArrowDistance || 13) : 0;

                const proj = new Projectile(this.x, this.z, dirX, dirZ, false, projSpeed, projDmg, {
                    type: this.shootType || 'magic',
                    maxDistance: maxDist,
                    sourceMonster: this
                });
                projectiles.push(proj);
                if (scene) scene.add(proj.mesh);

                if (soundFx) {
                    if (isArrow) {
                        soundFx.playBowShoot();
                    } else {
                        soundFx.playShoot(false);
                    }
                }
            }
        }

        this.sprite.position.x = this.x;
        this.sprite.position.z = this.z;
    }

    checkWallCollision(x, z, colliders) {
        for (const c of colliders) {
            if (x >= c.minX - this.radius && x <= c.maxX + this.radius &&
                z >= c.minZ - this.radius && z <= c.maxZ + this.radius) {
                return true;
            }
        }
        return false;
    }

    takeDamage(amount, knockDir) {
        this.hp -= amount;
        this.hitTimer = 0.2;
        this.knockback.set(knockDir.x * 12, 0, knockDir.z * 12);
        if (this.hp <= 0) {
            this.active = false;
        }
        return this.hp <= 0;
    }
}

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
        this.radius = (this.type === 'arrow') ? 0.25 : 0.45;
        this.active = true;
        this.lifeTime = (this.type === 'arrow') ? 2.0 : 3.5;
        this.trailTimer = 0;
        this.isDropping = false;
        this.dropVelocityY = 0;

        // Group containing projectile 3D geometry
        this.mesh = new THREE.Group();

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
            const yaw = Math.atan2(-dirX, -dirZ);
            this.mesh.rotation.y = yaw;
        } else if (this.isPlayer) {
            // Player Fireball: Bright Orange Core + Yellow Flame Aura
            this.color = 0xff6600;
            this.trailColor = 0xffaa00;
            const coreGeo = new THREE.SphereGeometry(0.25, 8, 8);
            const coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
            const core = new THREE.Mesh(coreGeo, coreMat);

            const auraGeo = new THREE.DodecahedronGeometry(0.38, 1);
            const auraMat = new THREE.MeshBasicMaterial({ color: 0xff4400, wireframe: true });
            this.aura = new THREE.Mesh(auraGeo, auraMat);

            this.mesh.add(core);
            this.mesh.add(this.aura);
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

        this.mesh.position.set(this.x, this.y, this.z);
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

        // Aura spin for magic/fireball
        if (this.aura) {
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
