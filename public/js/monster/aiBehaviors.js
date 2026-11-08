// 敵の行動（AI の型ごとの動き）。種類（this.aiType）ごとの動き。Monster.update が、種類に応じて呼ぶ（呼び出し側が .call(this, t) で渡すので、this は Monster。t は、その場の情報）。
// 元は public/js/entities.js の Monster.update の switch の case。移しただけで、動きは同じ（ファイルが長すぎて、編集の誤りが増えるため分割した）
import { diveHeight } from '/js/enemyBehavior.js';

export const aiBehaviors = {
    stationary(t) {
        // Pattern 1: Turret / Stationary (does not move, only attacks if in range)
    },

    ranged_maintain(t) {
        const { colliders, dirX, dirZ, dist, dt } = t;
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
    },

    bounce_leap(t) {
        const { colliders, dirX, dirZ, dist, dt } = t;
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
    },

    hop_pounce(t) {
        const { colliders, dirX, dirZ, dist, dt } = t;
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
    },

    stalker_spider(t) {
        const { colliders, dirX, dirZ, dist, dt } = t;
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
    },

    flying_chase(t) {
        const { colliders, dirX, dirZ, dist, dt } = t;
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
    },

    flying_ranged(t) {
        const { colliders, dirX, dirZ, dist, dt } = t;
        // Pattern 7: Flying Ranged Moth (Poison Moth)
        // Glides gracefully high in the air (Y: 1.5m ~ 2.2m), maintains medium distance, casts poison spores
        if (dist < 20 && this.knockback.lengthSq() < 0.1) {
            // Slow majestic wing flap
            const flap = 1.0 + Math.sin(this.aiTimer * 7.0) * 0.18;
            this.sprite.scale.set(this.baseScaleX * flap, this.baseScaleY * (2.0 - flap), 1);

            // High altitude floating
            this.baseY = (this.profile?.flightHeight ?? 1.6) + Math.sin(this.aiTimer * 3.5) * 0.4;

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
    },

    flying_dive(t) {
        const { colliders, dirX, dirZ, dist, dt, player } = t;
        // 飛ぶ敵（近接）: 高い所を飛んで近づき、プレイヤーの頭上から急降下で襲いかかり、また上昇する。
        //   高い所にいる間は、当たらない（近接の攻撃が届かない）。魔法・弓で撃ち落とせる
        if (dist < 26 && this.knockback.lengthSq() < 0.1) {
            const H = this.profile?.flightHeight ?? 2.0;
            const flap = 1.0 + Math.sin(this.aiTimer * 14.0) * 0.1;
            this.sprite.scale.set(this.baseScaleX * flap, this.baseScaleY * (2.0 - flap), 1);
            const hover = H + Math.sin(this.aiTimer * 3.0) * 0.3;
            const moveBy = (vx, vz) => {
                const nx = this.x + vx * dt, nz = this.z + vz * dt;
                if (!this.checkWallCollision(nx, this.z, colliders)) this.x = nx;
                if (!this.checkWallCollision(this.x, nz, colliders)) this.z = nz;
            };
            if (this.diveState === 'approach') {
                this.baseY += (hover - this.baseY) * Math.min(1, dt * 3);
                if (dist > 6.5) moveBy(dirX * this.speed, dirZ * this.speed);
                else moveBy(-dirZ * this.speed * 0.6, dirX * this.speed * 0.6);   // 頭上を旋回
                this.diveCooldown -= dt;
                if (this.diveCooldown <= 0 && dist < 9) {
                    this.diveState = 'dive'; this.diveTimer = 0;
                    this.diveDir = { x: dirX, z: dirZ };
                    this.diveFrom = this.baseY;
                    this.diveSpeed = Math.min(16, Math.max(this.speed * 2.2, dist / 0.6));   // 発見した位置へ、急降下の間に届く速さ
                }
            } else if (this.diveState === 'dive') {
                // 急降下: 発見したときのプレイヤーの方向へ、速く進みながら、プレイヤーの胴の高さまで降りる
                this.diveTimer += dt;
                const t = this.diveTimer / 0.7;
                const pFloor = player.floorY ?? this.floorY;
                const low = Math.max(0, pFloor - this.floorY) + 0.1;   // プレイヤーの足元の高さ（この敵から見た）
                this.baseY = diveHeight(this.diveFrom ?? H, low, t);
                moveBy(this.diveDir.x * this.diveSpeed, this.diveDir.z * this.diveSpeed);
                if (this.diveTimer >= 0.7) { this.diveState = 'climb'; this.diveTimer = 0; }
            } else {
                // 上昇: プレイヤーから離れながら、元の高さへ戻る
                this.diveTimer += dt;
                this.baseY += (hover - this.baseY) * Math.min(1, dt * 2.5);
                moveBy(-this.diveDir.x * this.speed * 0.9, -this.diveDir.z * this.speed * 0.9);
                if (this.diveTimer >= 1.1) { this.diveState = 'approach'; this.diveCooldown = 1.6 + Math.random() * 1.2; }
            }
        }
    },

    raptor_dive(t) {
        const { colliders, dirX, dirZ, dist, dt, player } = t;
        // 猛禽（鷹など）: 獲物（プレイヤー）を見つけると、まず高く舞い上がり（上空で、プレイヤーのまわりを旋回して、狙う）、
        //   飛び出す瞬間のプレイヤーの方向へ、滑空して、速い速さで突っ込む（途中で曲がらないので、横へよければ、よけられる）。
        //   よけられると、低い所で、隙ができる（被ダメージが増え、近接で反撃できる）。当たったときは、すぐ舞い上がる
        const rp = this.profile?.raptor ?? { high: 5, wait: 1.5, glideSpeed: 14, glideTime: 0.9, recover: 1.8, hitRecover: 0.6, vulnerable: 1.5 };
        if (dist < 40 && this.knockback.lengthSq() < 0.1) {
            const flapRate = this.raptorState === 'climb' ? 16 : 9;
            const flap = 1.0 + Math.sin(this.aiTimer * flapRate) * 0.1;
            this.sprite.scale.set(this.baseScaleX * flap, this.baseScaleY * (2.0 - flap), 1);
            const moveBy = (vx, vz) => {
                const nx = this.x + vx * dt, nz = this.z + vz * dt;
                if (!this.checkWallCollision(nx, this.z, colliders)) this.x = nx;
                if (!this.checkWallCollision(this.x, nz, colliders)) this.z = nz;
            };
            const pFloor = Math.max(0, (player.floorY ?? this.floorY) - this.floorY);
            if (this.raptorState === 'climb') {
                // 舞い上がり、上空で旋回して狙う
                this.isDashing = false; this.damageTakenScale = 1;
                const high = rp.high + pFloor;
                this.baseY += Math.min(high - this.baseY, 4.5 * dt);
                if (dist > 10) moveBy(dirX * this.speed * 1.6, dirZ * this.speed * 1.6);
                else if (dist < 6) moveBy(-dirX * this.speed, -dirZ * this.speed);
                else moveBy(-dirZ * this.speed * 0.9, dirX * this.speed * 0.9);   // 旋回
                if (this.baseY >= high - 0.4) {
                    this.raptorTimer += dt;
                    if (this.raptorTimer >= rp.wait && dist < 16) {   // 狙い定めて、滑空へ
                        this.raptorState = 'glide'; this.raptorTimer = 0; this.dashHit = false;
                        this.glideDir = { x: dirX, z: dirZ };
                        this.glideFrom = this.baseY;
                        this.glideSpeed = Math.max(rp.glideSpeed, dist / (rp.glideTime * 0.75));   // 発見した位置の少し先まで届く速さ
                    }
                }
            } else if (this.raptorState === 'glide') {
                this.isDashing = true;
                this.raptorTimer += dt;
                const t = this.raptorTimer / rp.glideTime;
                const low = pFloor + 0.2;
                this.baseY = diveHeight(this.glideFrom, low, Math.min(1, t * 1.15));   // 滑空: 高い所から、プレイヤーの高さまで、滑るように降りる
                moveBy(this.glideDir.x * this.glideSpeed, this.glideDir.z * this.glideSpeed);
                this.sprite.scale.set(this.baseScaleX * 1.15, this.baseScaleY * 0.8, 1);   // 翼をたたんで、細く
                if (this.raptorTimer >= rp.glideTime) {
                    this.isDashing = false;
                    this.raptorState = 'recover'; this.raptorTimer = 0;
                    // よけられた（当たらなかった）: 低い所で隙。当たった: すぐ舞い上がる
                    this.damageTakenScale = this.dashHit ? 1 : rp.vulnerable;
                    this.raptorRecover = this.dashHit ? rp.hitRecover : rp.recover;
                }
            } else {
                // 隙: 低い所で、ゆっくり向きを直し、体勢を立て直す
                this.raptorTimer += dt;
                const low = pFloor + (this.dashHit ? 0.8 : 0.3);
                this.baseY += (low - this.baseY) * Math.min(1, dt * 4);
                moveBy(-this.glideDir.x * this.speed * 0.3, -this.glideDir.z * this.speed * 0.3);
                if (this.raptorTimer >= this.raptorRecover) { this.raptorState = 'climb'; this.raptorTimer = 0; this.damageTakenScale = 1; }
            }
        } else {
            this.isDashing = false;
        }
    },

    charge_dash(t) {
        const { colliders, dirX, dirZ, dist, dt } = t;
        // 突進する敵（イノシシなど）: 近づく → 立ち止まって溜める（ブルブル震えて地面を蹴る）→ ロケットスタートで、一直線に猪突猛進（途中で曲がらず、
        //   プレイヤーを突き抜けて攻撃）→ 壁にぶつかるとスタン。よけられる（当たらずに突き抜ける）と、息切れして、長く動けず、受けるダメージが増える（弱い）
        this.isDashing = (this.chargeState === 'dash');
        const ch = this.profile?.charge ?? { windup: 0.9, dash: 12, speed: 3.2, stun: 1.3, rest: 0.8, vulnerable: 1 };
        const moveBy = (vx, vz) => {
            const nx = this.x + vx * dt, nz = this.z + vz * dt;
            let blocked = false;
            if (!this.checkWallCollision(nx, this.z, colliders)) this.x = nx; else blocked = true;
            if (!this.checkWallCollision(this.x, nz, colliders)) this.z = nz; else blocked = true;
            return blocked;
        };
        if (dist < 22 && this.knockback.lengthSq() < 0.1) {
            this.chargeCooldown -= dt;
            if (this.chargeState === 'walk') {
                this.damageTakenScale = 1;
                if (dist > 1.0) {
                    moveBy(dirX * this.speed * 0.9, dirZ * this.speed * 0.9);
                    this.baseY = Math.abs(Math.sin(this.aiTimer * 8.0)) * 0.1;
                }
                if (this.chargeCooldown <= 0 && dist < 12 && dist > 3.5) { this.chargeState = 'windup'; this.chargeTimer = ch.windup; }
            } else if (this.chargeState === 'windup') {
                // 溜め（攻撃体制）: 立ち止まり、ブルブルと震えて、地面を蹴る。攻撃の予告
                this.chargeTimer -= dt;
                this.shakeX = Math.sin(this.aiTimer * 60) * 0.12;   // ブルブル震える（最後に、位置へ足す）
                this.baseY = Math.abs(Math.sin(this.aiTimer * 22.0)) * 0.12;
                this.sprite.scale.set(this.baseScaleX * (1 + Math.sin(this.aiTimer * 34) * 0.07), this.baseScaleY * (1 - Math.sin(this.aiTimer * 34) * 0.07), 1);
                if (this.chargeTimer <= 0) {
                    this.chargeState = 'dash'; this.chargeDist = 0; this.isDashing = true; this.dashHit = false;
                    this.chargeDir = { x: dirX, z: dirZ };   // 溜めが終わった瞬間の、プレイヤーの方向へ（途中で曲がらない）
                }
            } else if (this.chargeState === 'dash') {
                this.isDashing = true;
                // ロケットスタート: 走り出しの最初の 3 マスは、さらに速い
                const v = this.speed * ch.speed * (this.chargeDist < 3 ? 1.5 : 1);
                const before = { x: this.x, z: this.z };
                const blocked = moveBy(this.chargeDir.x * v, this.chargeDir.z * v);
                this.chargeDist += Math.hypot(this.x - before.x, this.z - before.z);
                this.baseY = Math.abs(Math.sin(this.aiTimer * 16.0)) * 0.15;
                this.sprite.scale.set(this.baseScaleX * 1.1, this.baseScaleY * 0.92, 1);
                if (blocked) { this.chargeState = 'stun'; this.chargeTimer = ch.stun; this.isDashing = false; this.damageTakenScale = ch.vulnerable ?? 1; }   // 壁・崖にぶつかって、目を回す
                else if (this.chargeDist >= ch.dash) {
                    this.chargeState = 'rest'; this.isDashing = false;
                    // 当たらずに突き抜けた（よけられた）: 息切れして、長く動けず、被ダメージが増える。当てたときは、すぐ立て直す
                    if (this.dashHit) { this.chargeTimer = 0.8; this.damageTakenScale = 1; }
                    else { this.chargeTimer = ch.rest ?? 0.8; this.damageTakenScale = ch.vulnerable ?? 1; }
                }
            } else if (this.chargeState === 'stun' || this.chargeState === 'rest') {
                this.chargeTimer -= dt;
                this.baseY = 0;
                if (this.chargeState === 'stun') this.sprite.scale.set(this.baseScaleX * 0.95, this.baseScaleY * 1.0, 1);
                else this.sprite.scale.set(this.baseScaleX * 1.05, this.baseScaleY * 0.93, 1);   // 息切れ（うなだれる）
                if (this.chargeTimer <= 0) { this.chargeState = 'walk'; this.chargeCooldown = 1.4 + Math.random(); this.damageTakenScale = 1; }
            }
        } else {
            this.isDashing = false;
        }
    },

    big_hop(t) {
        const { colliders, dirX, dirZ, dist, dt } = t;
        // 大きく跳ぶ敵（兎など）: 1 回の跳躍が、とても遠い。着地して少し休み、また跳ぶ。近づくと、プレイヤーの頭上へ飛び込む
        if (dist < 24 && this.knockback.lengthSq() < 0.1) {
            const hp = this.profile?.hop ?? { range: 4.5, height: 0.9, rest: 0.26 };
            const G = 18;
            if (this.isLeaping) {
                this.leapVelocityY -= G * dt;
                this.baseY += this.leapVelocityY * dt;
                const nx = this.x + this.leapTargetDir.x * this.leapSpeed * dt, nz = this.z + this.leapTargetDir.z * this.leapSpeed * dt;
                if (!this.checkWallCollision(nx, this.z, colliders)) this.x = nx;
                if (!this.checkWallCollision(this.x, nz, colliders)) this.z = nz;
                this.sprite.scale.set(this.baseScaleX * 0.88, this.baseScaleY * 1.2, 1);
                if (this.baseY <= 0) {
                    this.baseY = 0; this.isLeaping = false; this.leapVelocityY = 0;
                    this.hopRest = (hp.rest ?? 0.26) * (0.8 + Math.random() * 0.4);   // 着地して、すぐ次の跳躍（速いリズム）
                    this.sprite.scale.set(this.baseScaleX * 1.3, this.baseScaleY * 0.7, 1);
                }
            } else {
                this.hopRest -= dt;
                const squash = 1 + Math.sin(this.aiTimer * 8) * 0.04;
                this.sprite.scale.set(this.baseScaleX * squash, this.baseScaleY * (2 - squash), 1);
                if (this.hopRest <= 0 && dist > 0.8) {
                    // 跳ぶ距離: プレイヤーまでの距離（上限 hop.range）。滞空時間から、水平の速さを決める
                    const hopDist = Math.min(hp.range, Math.max(2.5, dist));
                    const vy = Math.sqrt(2 * G * hp.height);   // hp.height は、跳ぶ高さ（頂点）
                    const airtime = 2 * vy / G;
                    this.isLeaping = true;
                    this.leapVelocityY = vy;
                    this.leapSpeed = hopDist / airtime;
                    this.leapTargetDir = { x: dirX, z: dirZ };
                }
            }
        }
    },

    cat_ambush(t) {
        const { colliders, dirX, dirZ, dist, dt, player } = t;
        // 猫系: 攻撃体制（追跡状態）に入ると、隠密で姿を消し、低く・長く跳んで近づく（不意打ち）。近くでは、姿を現し、噛みつき・ひっかきを
        //   素早く何度も繰り出す（1 回の威力は小さい）。しばらくすると、跳んで離れて、また姿を消す（しつこく攻撃せず、ヒットアンドアウェイ）
        const ct = this.profile?.cat ?? { range: 11, height: 0.8, rest: 0.3, flurry: 1.0, flurryScale: 0.55, away: 7, cool: 2.5 };
        const G = 18;
        if (this.state !== 'chase' || dist > 28) { this.cloaked = false; this.hitScale = 1; this.catState = 'stalk'; return; }
        const hopTo = (tx, tz, distance) => {
            const vy = Math.sqrt(2 * G * ct.height), airtime = 2 * vy / G;
            this.isLeaping = true; this.leapVelocityY = vy;
            this.leapSpeed = distance / airtime; this.leapTargetDir = { x: tx, z: tz };
        };
        if (this.isLeaping) {
            this.leapVelocityY -= G * dt;
            this.baseY += this.leapVelocityY * dt;
            const nx = this.x + this.leapTargetDir.x * this.leapSpeed * dt, nz = this.z + this.leapTargetDir.z * this.leapSpeed * dt;
            if (!this.checkWallCollision(nx, this.z, colliders)) this.x = nx;
            if (!this.checkWallCollision(this.x, nz, colliders)) this.z = nz;
            this.sprite.scale.set(this.baseScaleX * 1.12, this.baseScaleY * 0.85, 1);   // 低く、伸びて跳ぶ
            if (this.baseY <= 0) {
                this.baseY = 0; this.isLeaping = false; this.leapVelocityY = 0;
                this.hopRest = ct.rest * (0.8 + Math.random() * 0.4);
                this.sprite.scale.set(this.baseScaleX * 1.1, this.baseScaleY * 0.82, 1);
            }
        } else {
            this.hopRest -= dt;
            if (this.catState === 'stalk') {
                this.cloaked = true; this.hitScale = 1;
                this.sprite.scale.set(this.baseScaleX, this.baseScaleY * 0.88, 1);   // 低く構える
                if (this.hopRest <= 0) {
                    if (dist < 3.4) { this.catState = 'flurry'; this.catTimer = ct.flurry; this.cloaked = false; this.hitScale = ct.flurryScale; }
                    else hopTo(dirX, dirZ, Math.min(ct.range, Math.max(2.4, dist - 1.0)));
                }
            } else if (this.catState === 'flurry') {
                // 近くで、噛みつき・ひっかき。相手にまとわりつく
                this.cloaked = false; this.hitScale = ct.flurryScale;
                this.catTimer -= dt;
                const touch = (this.radius + (player.radius ?? 0.4)) * 0.85;   // ぶつかる（攻撃が当たる）距離まで寄る
                if (dist > touch) {
                    const nx = this.x + dirX * Math.max(this.speed * 1.6, 3.0) * dt, nz = this.z + dirZ * Math.max(this.speed * 1.6, 3.0) * dt;
                    if (!this.checkWallCollision(nx, this.z, colliders)) this.x = nx;
                    if (!this.checkWallCollision(this.x, nz, colliders)) this.z = nz;
                }
                const claw = 1 + Math.sin(this.aiTimer * 40) * 0.12;   // ひっかきの素早い動き
                this.sprite.scale.set(this.baseScaleX * claw, this.baseScaleY * (2 - claw), 1);
                this.baseY = Math.abs(Math.sin(this.aiTimer * 20)) * 0.18;
                if (this.catTimer <= 0) { this.catState = 'away'; this.awayHops = 2; this.hitScale = 1; this.cloaked = true; this.hopRest = 0; }
            } else {
                // 離れる: 跳んで離れて、姿を消す。しばらくして、また狙う
                this.cloaked = true; this.hitScale = 1;
                if (this.hopRest <= 0) {
                    if (this.awayHops > 0) { hopTo(-dirX, -dirZ, ct.away); this.awayHops--; }
                    else { this.catState = 'stalk'; this.hopRest = ct.cool * (0.8 + Math.random() * 0.5); }
                }
            }
        }
    },

    bear_rush(t) {
        const { colliders, dirX, dirZ, dist, dt, player } = t;
        // クマ: 近づくと（攻撃を始めると）、ラッシュ（連打）。1 回の威力は小さいが、回数が多い。連打のあとは、少し間を置き、また連打する
        const rs = this.profile?.rush ?? { flurry: 2.6, flurryScale: 0.5, cool: 1.2 };
        if (dist < 20 && this.knockback.lengthSq() < 0.1) {
            const touch = (this.radius + (player.radius ?? 0.4)) * 0.85;
            const step = (sp) => {
                const nx = this.x + dirX * sp * dt, nz = this.z + dirZ * sp * dt;
                if (!this.checkWallCollision(nx, this.z, colliders)) this.x = nx;
                if (!this.checkWallCollision(this.x, nz, colliders)) this.z = nz;
            };
            if (this.rushState === 'chase') {
                this.hitScale = 1;
                if (dist > touch) step(this.speed);
                this.baseY = Math.abs(Math.sin(this.aiTimer * 7.0)) * 0.1;
                if (dist <= touch + 0.6) { this.rushState = 'rush'; this.rushTimer = rs.flurry; this.hitScale = rs.flurryScale; }
            } else if (this.rushState === 'rush') {
                this.hitScale = rs.flurryScale;
                this.rushTimer -= dt;
                if (dist > touch) step(this.speed * 1.4);   // 連打の間、相手にまとわりつく
                const claw = 1 + Math.sin(this.aiTimer * 30) * 0.1;   // 両手の連打
                this.sprite.scale.set(this.baseScaleX * claw, this.baseScaleY * (2 - claw), 1);
                this.baseY = Math.abs(Math.sin(this.aiTimer * 16)) * 0.12;
                if (this.rushTimer <= 0) { this.rushState = 'recover'; this.rushTimer = rs.cool; this.hitScale = 1; }
            } else {
                this.hitScale = 1;
                this.rushTimer -= dt;
                this.baseY = 0;
                if (this.rushTimer <= 0) this.rushState = 'chase';
            }
        }
    },

    pack_chase(t) {
        const { colliders, dirX, dirZ, dist, dt } = t;
        // 狼: 一定の速さで、どこまでも追ってくる。近づいても、止まらず、まとわりつく（攻撃は、ぶつかる）
        if (dist < 60 && this.knockback.lengthSq() < 0.1) {
            if (dist > 0.9) {
                const nx = this.x + dirX * this.speed * dt, nz = this.z + dirZ * this.speed * dt;
                if (!this.checkWallCollision(nx, this.z, colliders)) this.x = nx;
                if (!this.checkWallCollision(this.x, nz, colliders)) this.z = nz;
            }
            this.baseY = Math.abs(Math.sin(this.aiTimer * 11.0)) * 0.14;
            this.sprite.scale.set(this.baseScaleX * (1 + Math.sin(this.aiTimer * 11) * 0.04), this.baseScaleY * (1 - Math.sin(this.aiTimer * 11) * 0.04), 1);
        }
    },

    worm_burrow(t) {
        const { colliders, dirX, dirZ, dist, dt } = t;
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
                const crawlSpeed = this.speed;
                const nextX = this.x + dirX * crawlSpeed * dt;
                const nextZ = this.z + dirZ * crawlSpeed * dt;
                if (!this.checkWallCollision(nextX, this.z, colliders)) this.x = nextX;
                if (!this.checkWallCollision(this.x, nextZ, colliders)) this.z = nextZ;
            }
        }
    },

    walk_chase(t) {
        const { colliders, dirX, dirZ, dist, dt } = t;
        // Constant walking pursuit (Skeleton / Melee warrior)
        if (dist < 18 && dist > 1.0 && this.knockback.lengthSq() < 0.1) {
            const nextX = this.x + dirX * this.speed * dt;
            const nextZ = this.z + dirZ * this.speed * dt;

            if (!this.checkWallCollision(nextX, this.z, colliders)) this.x = nextX;
            if (!this.checkWallCollision(this.x, nextZ, colliders)) this.z = nextZ;

            // Footstep bobbing
            this.baseY = Math.abs(Math.sin(this.aiTimer * 8.0)) * 0.12;
        }
    },
};
