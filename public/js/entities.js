import * as THREE from '/js/three.module.js';

// 隠密（索敵）仕様の定数
const SENSE_DEFAULT_RANGE = 10;   // 感知距離の既定値（enemies.json の senseRange 未指定時）
const SENSE_DEFAULT_ANGLE = 70;   // 視野角（正面からの半角・度）の既定値（senseAngle 未指定時）
const SENSE_NEAR_DIST = 2.0;      // この距離以内（かつ壁越しでない）なら視野角外でも即気づく
const SENSE_DRAW_SCALE = 1.5;     // 未発見の敵を描画する距離 = 感知距離 × この倍率 × 地形の視界係数
const ALERT_TIME = 0;             // 警戒（気づき始め）の時間（秒）。0 なら気づいた瞬間に追跡・攻撃へ移る
const LOST_TIME = 4.0;            // 追跡中に見失ってから未発見に戻るまでの時間（秒）

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

        // 索敵パラメータ（敵の種類ごとに enemies.json で上書き）
        this.senseRange = SENSE_DEFAULT_RANGE;
        this.senseAngle = SENSE_DEFAULT_ANGLE;
        this.alwaysAware = false;

        if (enemyDef) {
            this.senseRange = enemyDef.senseRange ?? SENSE_DEFAULT_RANGE;
            this.senseAngle = enemyDef.senseAngle ?? SENSE_DEFAULT_ANGLE;
            this.alwaysAware = !!enemyDef.alwaysAware;
            this.name = enemyDef.name || 'モンスター';
            this.maxHp = enemyDef.maxHp || 30;
            this.hp = this.maxHp;
            this.speed = enemyDef.speed || 1.5;
            this.baseSpeed = this.speed;
            this.attackPower = enemyDef.attackPower || 10;
            this.exp = enemyDef.exp || 20;
            this.canShoot = !!enemyDef.canShoot;
            this.shootType = enemyDef.shootType || 'magic';
            this.shootCooldown = enemyDef.shootCooldown || 99999;
            this.shootTimer = this.canShoot ? Math.random() * 2 : 0;
            this.shootRange = enemyDef.shootRange || 15;
            this.maxArrowDistance = enemyDef.maxArrowDistance || 13;
            this.aiType = enemyDef.aiType || (this.canShoot ? 'ranged_maintain' : 'walk_chase');
            
            const texKey = enemyDef.texture || 'slime';
            // Explicitly resolve texture with dynamic fallback creation if not pre-initialized
            let textureObj = textures[texKey];
            if (!textureObj) {
                const loader = new THREE.TextureLoader();
                const enemyImgFile = enemyDef.imageFile || `${enemyType}.png`;
                textureObj = loader.load(`/images/enemies/${enemyImgFile}?v=${Date.now()}`);
                textureObj.magFilter = THREE.NearestFilter;
                textureObj.minFilter = THREE.NearestFilter;
                textures[texKey] = textureObj;
            }

            this.spriteMat = new THREE.SpriteMaterial({ map: textureObj, transparent: true });
            this.scale = enemyDef.scale ? [...enemyDef.scale] : [2.2, 2.0, 1];
            this.y = enemyDef.y ?? 1.0;

            // Resolve HUD icon URL dynamically or by map
            const iconMap = {
                goblinArcher: '/images/enemies/goblin_archer.png',
                goblin: '/images/enemies/goblin_mage.png',
                skeleton: '/images/enemies/skeleton_char.png',
                mimic: '/images/enemies/mimic_char.png',
                tarantulaSwamp: '/images/enemies/tarantula_swamp.png',
                parasiteWasp: '/images/enemies/parasite_wasp.png',
                mariaMosquito: '/images/enemies/maria_mosquito.png',
                acidWorm: '/images/enemies/acid_worm.png',
                poisonMoth: '/images/enemies/poison_moth.png',
                poisonToad: '/images/enemies/poison_toad.png',
                slime: '/images/enemies/slime_char.png'
            };

            this.iconUrl = iconMap[texKey] || (enemyDef.imageFile ? `/images/enemies/${enemyDef.imageFile}` : `/images/enemies/${enemyType}.png`);
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

        // 索敵状態: 'unaware'(未発見) → 'alert'(警戒) → 'chase'(追跡)
        this.state = this.alwaysAware ? 'chase' : 'unaware';
        this.facing = Math.random() * Math.PI * 2; // 正面方向（atan2(dx, dz) 基準）
        this.alertTimer = 0;
        this.lostTimer = 0;

        // Pattern & animation states
        this.aiTimer = Math.random() * 2.0;
        this.baseScaleX = this.scale[0];
        this.baseScaleY = this.scale[1];
        this.baseY = 0.0;
        this.isLeaping = false;
        this.leapVelocityY = 0;
        this.leapTargetDir = { x: 0, z: 0 };
    }

    update(dt, player, colliders, projectiles, soundFx, scene, visibility = 1.0) {
        if (!this.active) return;

        // Knockback decay
        if (this.knockback.lengthSq() > 0.001) {
            this.x += this.knockback.x * dt;
            this.z += this.knockback.z * dt;
            this.knockback.multiplyScalar(Math.max(0, 1 - dt * 10));
        }

        // Hit flash: blink red and visible
        if (this.hitTimer > 0) {
            this.hitTimer -= dt;
            this.spriteMat.color.setHex(0xff3333);
            this.sprite.visible = true;
        } else {
            this.spriteMat.color.setHex(0xffffff);
            this.sprite.visible = true;
        }

        const dx = player.x - this.x;
        const dz = player.z - this.z;
        const dist = Math.hypot(dx, dz);
        const dirX = (dist > 0.001) ? dx / dist : 0;
        const dirZ = (dist > 0.001) ? dz / dist : 0;

        this.aiTimer += dt;

        // 索敵: 未発見・警戒の間は AI（移動・攻撃・射撃）を動かさず、静止姿勢で待機する
        this.updateAwareness(dt, dx, dz, dist, player, colliders, visibility);
        if (this.state !== 'chase') {
            this.applyIdlePose();
            this.sprite.position.set(this.x, this.baseY, this.z);
            this.sprite.visible = (dist <= this.senseRange * SENSE_DRAW_SCALE * visibility);
            return;
        }

        // =========================================================================
        // Distinct Movement AI Patterns
        // =========================================================================
        switch (this.aiType) {
            case 'stationary': {
                // Pattern 1: Turret / Stationary (does not move, only attacks if in range)
                break;
            }

            case 'ranged_maintain': {
                // Pattern 2: Archer / Mage (Maintains ideal shooting distance)
                // If player is too close (< 4.5), backs away slowly; if too far (> 11), approaches
                if (dist < 18 && this.knockback.lengthSq() < 0.1) {
                    let moveSpeed = 0;
                    let targetDirX = 0;
                    let targetDirZ = 0;

                    if (dist < 4.5) {
                        // Back away
                        targetDirX = -dirX;
                        targetDirZ = -dirZ;
                        moveSpeed = this.speed * 0.85;
                    } else if (dist > 10.5) {
                        // Approach shooting range
                        targetDirX = dirX;
                        targetDirZ = dirZ;
                        moveSpeed = this.speed;
                    } else {
                        // Strafe sideways slightly for evasive rhythm
                        const strafeDir = Math.sin(this.aiTimer * 1.5) > 0 ? 1 : -1;
                        targetDirX = -dirZ * strafeDir;
                        targetDirZ = dirX * strafeDir;
                        moveSpeed = this.speed * 0.45;
                    }

                    if (moveSpeed > 0) {
                        const nextX = this.x + targetDirX * moveSpeed * dt;
                        const nextZ = this.z + targetDirZ * moveSpeed * dt;
                        if (!this.checkWallCollision(nextX, this.z, colliders)) this.x = nextX;
                        if (!this.checkWallCollision(this.x, nextZ, colliders)) this.z = nextZ;
                    }
                }
                break;
            }

            case 'bounce_leap': {
                // Pattern 3: Slime (Poyo-poyo gelatin squish animation, hops towards player, leaps to attack when close)
                if (dist < 18 && this.knockback.lengthSq() < 0.1) {
                    const isCloseToPlayer = (dist < 5.0 && dist > 0.8);

                    if (this.isLeaping) {
                        // Currently in air
                        this.leapVelocityY -= 14 * dt; // Gravity
                        this.baseY += this.leapVelocityY * dt;

                        // Fly forward towards target
                        const leapSpeed = isCloseToPlayer ? (this.speed * 2.2) : (this.speed * 1.4);
                        const nextX = this.x + this.leapTargetDir.x * leapSpeed * dt;
                        const nextZ = this.z + this.leapTargetDir.z * leapSpeed * dt;
                        if (!this.checkWallCollision(nextX, this.z, colliders)) this.x = nextX;
                        if (!this.checkWallCollision(this.x, nextZ, colliders)) this.z = nextZ;

                        // Air stretch animation
                        this.sprite.scale.set(this.baseScaleX * 0.85, this.baseScaleY * 1.25, 1);

                        // Land on ground
                        if (this.baseY <= 0) {
                            this.baseY = 0;
                            this.isLeaping = false;
                            this.leapVelocityY = 0;
                            // Splat squash on landing
                            this.sprite.scale.set(this.baseScaleX * 1.35, this.baseScaleY * 0.65, 1);
                        }
                    } else {
                        // On ground: squish & prepare next hop
                        const hopInterval = isCloseToPlayer ? 0.65 : 1.1; // Hops faster when close
                        const squishCycle = (this.aiTimer % hopInterval) / hopInterval;

                        // Poyo-poyo gelatin breathing rhythm
                        const squishX = 1.0 + Math.sin(this.aiTimer * 6.0) * 0.12;
                        const squishY = 1.0 - Math.sin(this.aiTimer * 6.0) * 0.12;
                        this.sprite.scale.set(this.baseScaleX * squishX, this.baseScaleY * squishY, 1);

                        if (squishCycle > 0.88) {
                            // Initiate jump / leap attack!
                            this.isLeaping = true;
                            this.leapVelocityY = isCloseToPlayer ? 4.2 : 3.0; // Higher tackle leap when close
                            this.leapTargetDir = { x: dirX, z: dirZ };
                        }
                    }
                } else {
                    // Idle breathing when far away
                    const idleSquish = 1.0 + Math.sin(this.aiTimer * 3.0) * 0.06;
                    this.sprite.scale.set(this.baseScaleX * idleSquish, this.baseScaleY * (2.0 - idleSquish), 1);
                }
                break;
            }

            case 'hop_pounce': {
                // Pattern 4: Frog / Mimic (Crouches down, then springs forward with violent pounce attacks)
                if (dist < 18 && this.knockback.lengthSq() < 0.1) {
                    const isAttackDistance = (dist < 6.5 && dist > 0.8);

                    if (this.isLeaping) {
                        // High springing pounce arc
                        this.leapVelocityY -= 16 * dt; // Strong gravity
                        this.baseY += this.leapVelocityY * dt;

                        const pounceSpeed = isAttackDistance ? (this.speed * 2.5) : (this.speed * 1.6);
                        const nextX = this.x + this.leapTargetDir.x * pounceSpeed * dt;
                        const nextZ = this.z + this.leapTargetDir.z * pounceSpeed * dt;
                        if (!this.checkWallCollision(nextX, this.z, colliders)) this.x = nextX;
                        if (!this.checkWallCollision(this.x, nextZ, colliders)) this.z = nextZ;

                        // Spring stretch
                        this.sprite.scale.set(this.baseScaleX * 0.9, this.baseScaleY * 1.2, 1);

                        if (this.baseY <= 0) {
                            this.baseY = 0;
                            this.isLeaping = false;
                            this.leapVelocityY = 0;
                            // Heavy impact land
                            this.sprite.scale.set(this.baseScaleX * 1.25, this.baseScaleY * 0.8, 1);
                        }
                    } else {
                        // Crouch and wind-up on ground
                        const hopInterval = isAttackDistance ? 0.75 : 1.25;
                        const chargeCycle = (this.aiTimer % hopInterval) / hopInterval;

                        // Squats down in anticipation
                        const squatAmount = 1.0 - Math.min(0.3, chargeCycle * 0.35);
                        this.sprite.scale.set(this.baseScaleX * (2.0 - squatAmount), this.baseScaleY * squatAmount, 1);

                        if (chargeCycle > 0.9) {
                            // POUNCE!
                            this.isLeaping = true;
                            this.leapVelocityY = isAttackDistance ? 5.2 : 3.8;
                            this.leapTargetDir = { x: dirX, z: dirZ };
                        }
                    }
                }
                break;
            }

            case 'stalker_spider': {
                // Pattern 5: Jumping Spider / Tarantula (Quiet stalk -> sudden high-speed sprint -> freeze pause)
                // 3 phases: 0.0~1.4s Stalking (slow, low footsteps), 1.4~2.2s Sudden Sprint (rapid charge), 2.2~3.2s Freeze Standstill
                if (dist < 20 && this.knockback.lengthSq() < 0.1) {
                    const cyclePeriod = 3.2;
                    const phaseTime = this.aiTimer % cyclePeriod;

                    let moveSpeed = 0;
                    if (phaseTime < 1.4) {
                        // Phase 1: Slow deliberate crawl / stalking (quietly closes in)
                        moveSpeed = this.speed * 0.45;
                        // Twitching creep
                        const creepScaleX = 1.0 + Math.sin(this.aiTimer * 10) * 0.05;
                        this.sprite.scale.set(this.baseScaleX * creepScaleX, this.baseScaleY, 1);
                        this.baseY = Math.abs(Math.sin(this.aiTimer * 6.0)) * 0.06;
                    } else if (phaseTime < 2.2) {
                        // Phase 2: Sudden explosive sprint (like jumping spider darting forward!)
                        moveSpeed = this.speed * 2.3;
                        // Flatten down for aerodynamic speed sprint
                        this.sprite.scale.set(this.baseScaleX * 1.15, this.baseScaleY * 0.85, 1);
                        this.baseY = 0.02;
                    } else {
                        // Phase 3: Total Freeze / Stillness (rearing up, analyzing prey)
                        moveSpeed = 0;
                        // Rigid high posture
                        this.sprite.scale.set(this.baseScaleX * 0.92, this.baseScaleY * 1.08, 1);
                        this.baseY = 0.0;
                    }

                    if (moveSpeed > 0 && dist > 0.8) {
                        const nextX = this.x + dirX * moveSpeed * dt;
                        const nextZ = this.z + dirZ * moveSpeed * dt;
                        if (!this.checkWallCollision(nextX, this.z, colliders)) this.x = nextX;
                        if (!this.checkWallCollision(this.x, nextZ, colliders)) this.z = nextZ;
                    }
                }
                break;
            }

            case 'flying_chase': {
                // Pattern 6: Flying insect chase (Parasite Wasp / Maria Mosquito)
                // Hovers in mid-air (Y: 1.2m ~ 1.9m) with high-speed wing-buzzing flutter, darting toward player
                if (dist < 20 && this.knockback.lengthSq() < 0.1) {
                    // Wing vibration flutter scale
                    const wingBuzz = 1.0 + Math.sin(this.aiTimer * 38.0) * 0.12;
                    this.sprite.scale.set(this.baseScaleX * wingBuzz, this.baseScaleY, 1);

                    // Hover height floating sinusoidally
                    const hoverBaseY = (this.scale[1] > 2.0) ? 1.5 : 1.3;
                    this.baseY = hoverBaseY + Math.sin(this.aiTimer * 5.0) * 0.35;

                    if (dist > 0.8) {
                        // Darting erratic flight: main chase vector + high-frequency lateral swoops
                        const lateralDirX = -dirZ;
                        const lateralDirZ = dirX;
                        const wobble = Math.sin(this.aiTimer * 8.0) * 0.6;

                        const vx = (dirX + lateralDirX * wobble) * this.speed;
                        const vz = (dirZ + lateralDirZ * wobble) * this.speed;

                        const nextX = this.x + vx * dt;
                        const nextZ = this.z + vz * dt;
                        if (!this.checkWallCollision(nextX, this.z, colliders)) this.x = nextX;
                        if (!this.checkWallCollision(this.x, nextZ, colliders)) this.z = nextZ;
                    }
                }
                break;
            }

            case 'flying_ranged': {
                // Pattern 7: Flying Ranged Moth (Poison Moth)
                // Glides gracefully high in the air (Y: 1.5m ~ 2.2m), maintains medium distance, casts poison spores
                if (dist < 20 && this.knockback.lengthSq() < 0.1) {
                    // Slow majestic wing flap
                    const flap = 1.0 + Math.sin(this.aiTimer * 7.0) * 0.18;
                    this.sprite.scale.set(this.baseScaleX * flap, this.baseScaleY * (2.0 - flap), 1);

                    // High altitude floating
                    this.baseY = 1.6 + Math.sin(this.aiTimer * 3.5) * 0.4;

                    // Maintain comfortable distance around 6.0 ~ 11.0m
                    let moveSpeed = 0;
                    let targetX = 0;
                    let targetZ = 0;

                    if (dist < 5.0) {
                        // Retreat backwards while in air
                        targetX = -dirX;
                        targetZ = -dirZ;
                        moveSpeed = this.speed * 0.9;
                    } else if (dist > 11.0) {
                        // Close in
                        targetX = dirX;
                        targetZ = dirZ;
                        moveSpeed = this.speed;
                    } else {
                        // Circling / strafing orbit
                        const circleDir = (Math.sin(this.aiTimer * 0.8) > 0) ? 1 : -1;
                        targetX = -dirZ * circleDir;
                        targetZ = dirX * circleDir;
                        moveSpeed = this.speed * 0.55;
                    }

                    if (moveSpeed > 0) {
                        const nextX = this.x + targetX * moveSpeed * dt;
                        const nextZ = this.z + targetZ * moveSpeed * dt;
                        if (!this.checkWallCollision(nextX, this.z, colliders)) this.x = nextX;
                        if (!this.checkWallCollision(this.x, nextZ, colliders)) this.z = nextZ;
                    }
                }
                break;
            }

            case 'worm_burrow': {
                // Pattern 8: Acid Worm (Writhing segmented serpentine undulating movement, close-range toxic mist)
                if (dist < 18 && this.knockback.lengthSq() < 0.1) {
                    // Serpentine undulating squirm / S-curve body distortion
                    const wriggleX = 1.0 + Math.sin(this.aiTimer * 9.0) * 0.22;
                    const wriggleY = 1.0 - Math.sin(this.aiTimer * 9.0) * 0.15;
                    this.sprite.scale.set(this.baseScaleX * wriggleX, this.baseScaleY * wriggleY, 1);

                    // Slithers along ground with vertical head bobbing
                    this.baseY = Math.abs(Math.sin(this.aiTimer * 4.5)) * 0.18;

                    // Creeps slowly toward player to get into toxic breath range (< 5.0m)
                    if (dist > 2.2) {
                        const crawlSpeed = 1.4;
                        const nextX = this.x + dirX * crawlSpeed * dt;
                        const nextZ = this.z + dirZ * crawlSpeed * dt;
                        if (!this.checkWallCollision(nextX, this.z, colliders)) this.x = nextX;
                        if (!this.checkWallCollision(this.x, nextZ, colliders)) this.z = nextZ;
                    }
                }
                break;
            }

            case 'walk_chase':
            default: {
                // Constant walking pursuit (Skeleton / Melee warrior)
                if (dist < 18 && dist > 1.0 && this.knockback.lengthSq() < 0.1) {
                    const nextX = this.x + dirX * this.speed * dt;
                    const nextZ = this.z + dirZ * this.speed * dt;

                    if (!this.checkWallCollision(nextX, this.z, colliders)) this.x = nextX;
                    if (!this.checkWallCollision(this.x, nextZ, colliders)) this.z = nextZ;

                    // Footstep bobbing
                    this.baseY = Math.abs(Math.sin(this.aiTimer * 8.0)) * 0.12;
                }
                break;
            }
        }

        // Apply vertical position (hopping / leaping height)
        this.sprite.position.y = this.baseY;

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

    // 壁(colliders)に遮られず、このモンスターからプレイヤーが見えるか
    hasLineOfSight(px, pz, dist, colliders) {
        const steps = Math.ceil(dist / 0.4);
        for (let i = 1; i < steps; i++) {
            const t = i / steps;
            const x = this.x + (px - this.x) * t;
            const z = this.z + (pz - this.z) * t;
            for (const c of colliders) {
                if (c.disabled) continue;
                if (x >= c.minX && x <= c.maxX && z >= c.minZ && z <= c.maxZ) return false;
            }
        }
        return true;
    }

    // 索敵状態の更新（感知距離 = 種類別 senseRange × 地形の視界係数 visibility）
    updateAwareness(dt, dx, dz, dist, player, colliders, visibility) {
        if (this.alwaysAware) {
            this.state = 'chase';
            return;
        }
        const range = this.senseRange * visibility;
        const keepRange = range * SENSE_DRAW_SCALE;
        const toPlayer = Math.atan2(dx, dz);

        let sees = false;
        let keepSight = false;
        if (dist <= keepRange) {
            const los = this.hasLineOfSight(player.x, player.z, dist, colliders);
            if (los) {
                keepSight = true;
                // 固定砲台は視野角を問わず、視線が通れば気づく
                let diff = Math.abs(toPlayer - this.facing) % (Math.PI * 2);
                if (diff > Math.PI) diff = Math.PI * 2 - diff;
                const inFov = (this.aiType === 'stationary') || diff <= this.senseAngle * Math.PI / 180;
                sees = (dist <= range && inFov) || (dist <= SENSE_NEAR_DIST);
            }
        }

        if (this.state === 'unaware') {
            if (sees) {
                if (ALERT_TIME > 0) {
                    this.state = 'alert';
                    this.alertTimer = ALERT_TIME;
                } else {
                    this.state = 'chase';
                    this.lostTimer = 0;
                }
            }
        } else if (this.state === 'alert') {
            this.facing = toPlayer;
            if (!sees) {
                this.state = 'unaware';
            } else {
                this.alertTimer -= dt;
                if (this.alertTimer <= 0) {
                    this.state = 'chase';
                    this.lostTimer = 0;
                }
            }
        } else {
            // chase: 視線が通り感知圏内にいる間は追跡を継続。見失って一定時間で未発見に戻る
            this.facing = toPlayer;
            if (keepSight) {
                this.lostTimer = 0;
            } else {
                this.lostTimer += dt;
                if (this.lostTimer >= LOST_TIME) this.state = 'unaware';
            }
        }
    }

    // 未発見・警戒中の待機姿勢（目立つ動きを抑える）
    applyIdlePose() {
        this.isLeaping = false;
        this.leapVelocityY = 0;
        const breath = 1.0 + Math.sin(this.aiTimer * 1.2) * 0.015;
        this.sprite.scale.set(this.baseScaleX * breath, this.baseScaleY, 1);
        if (this.aiType === 'flying_chase') {
            this.baseY = (this.scale[1] > 2.0) ? 1.5 : 1.3;
        } else if (this.aiType === 'flying_ranged') {
            this.baseY = 1.6;
        } else {
            this.baseY = 0;
        }
    }

    checkWallCollision(x, z, colliders) {
        for (const c of colliders) {
            if (c.disabled) continue;
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
        // 被弾したら状態にかかわらず即追跡
        this.state = 'chase';
        this.lostTimer = 0;
        if (knockDir) {
            this.knockback.set(knockDir.x * 12, 0, knockDir.z * 12);
        }
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
        } else if (this.type === 'poison_breath') {
            // Acid Worm Toxic Breath / Poison Mist cloud
            this.color = 0x84cc16;
            this.trailColor = 0xa3e635;
            this.lifeTime = 0.9; // Short-lived close-range lingering mist
            const mistGeo = new THREE.DodecahedronGeometry(0.42, 1);
            const mistMat = new THREE.MeshBasicMaterial({ color: 0x4ade80, wireframe: true });
            this.aura = new THREE.Mesh(mistGeo, mistMat);
            this.mesh.add(this.aura);
        } else if (this.type === 'poison_dust') {
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
