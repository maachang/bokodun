// 敵の毎フレームの更新の段階（感知と見え方・縄張りのうろうろ・特性の動き・射撃）。Monster のメソッド（this は Monster。public/js/entities.js が、クラスの定義のあとで、Monster.prototype へ組み込む）。
// 元は Monster.update の中の段階。移しただけで、動きは同じ（長すぎて、編集の誤りが増えるため分割した）
import * as THREE from '/js/three.module.js';
import { SENSE_DRAW_SCALE, STEALTH_DRAW_MULT, STEALTH_FADE_BAND, APPEAR_FADE_TIME } from '/js/monster/constants.js';
import { Projectile } from '/js/entities.js';

export const monsterStageMethods = {
    updateSenses(player, dt, colliders, visibility) {
        const dx = player.x - this.x;
        const dz = player.z - this.z;
        const dist = Math.hypot(dx, dz);
        const dirX = (dist > 0.001) ? dx / dist : 0;
        const dirZ = (dist > 0.001) ? dz / dist : 0;

        this.aiTimer += dt;

        // 索敵: 見える／見えない（描画）の制御のみ。AI（移動・攻撃・射撃）は従来どおり下の距離判定で動く
        this.updateAwareness(dt, dx, dz, dist, player, colliders, visibility);
        // 狼: 見失っても、追跡をやめない
        if (this.profile?.relentless && this.state === 'chase') this.lostTimer = 0;
        // 縄張り・巡回: 追うかどうかは、プレイヤーが、縄張り（生まれた場所のまわり）に入っているかで決まる
        this.provokedTimer = Math.max(0, this.provokedTimer - dt);
        const terr = this.profile?.territory;
        if (terr) {
            const dh = Math.hypot(player.x - this.homeX, player.z - this.homeZ);
            const leash = terr.radius * (terr.leash ?? 1.5);
            if (terr.mode === 'roam') {
                // 住民のようにうろつく（ネズミなど）: 攻撃されている間（provokedTimer）だけ、追う
                if (this.state === 'chase' && (this.provokedTimer <= 0 || dh > leash)) { this.state = 'unaware'; this.lostTimer = 0; }
            } else if (this.state === 'chase') {
                if (dh > leash && !(this.provokedTimer > 0 && dh <= leash * 1.6)) { this.state = 'unaware'; this.lostTimer = 0; }
            } else if (dh <= terr.radius) {
                this.state = 'chase'; this.lostTimer = 0;   // 縄張りに入られた: 攻撃開始
            }
            if (this.state === 'chase') this.lostTimer = 0;
        }
        const drawRange = this.senseRange * SENSE_DRAW_SCALE * visibility * STEALTH_DRAW_MULT[this.stealth];
        // 発見済みの敵は常に描画する。ただし隠密性が高い敵は、発見済みでも描画距離を超えると見えない
        const shown = (this.state === 'chase' && this.stealth !== 'high') || (dist <= drawRange);
        // 隠密性が高い敵は、描画距離の手前で透明から徐々に見えてくる
        const fadeStart = drawRange * (1 - STEALTH_FADE_BAND);
        const targetAlpha = !shown ? 0
            : (this.stealth === 'high' && dist > fadeStart)
                ? Math.min(1, Math.max(0, (drawRange - dist) / (drawRange - fadeStart)))
                : 1;
        // 猫系が隠密で姿を消している間は、ほとんど見えない（攻撃されたとき・近くで攻撃するときは、現れる）
        const cloakAlpha = (this.cloaked && this.hitTimer <= 0) ? 0.04 : targetAlpha;
        // 現れる・消えるときは、目標の透明度へ APPEAR_FADE_TIME かけて滑らかに近づける（突然出てこない）
        const step = dt / (this.cloaked ? 0.25 : APPEAR_FADE_TIME);
        this.appearAlpha += Math.max(-step, Math.min(step, cloakAlpha - this.appearAlpha));
        this.spriteMat.opacity = this.appearAlpha;
        this.sprite.visible = this.appearAlpha > 0.01;
        return { dx, dz, dist, dirX, dirZ, terr };
    },

    updateTerritoryWander(terr, dt, colliders) {
        if (terr && this.state !== 'chase') {
            this.raptorState = 'climb'; this.raptorTimer = 0; this.isDashing = false; this.damageTakenScale = 1;   // 次に狙うときは、また、舞い上がるところから
            const moveTo = (tx, tz, sp) => {
                const ddx = tx - this.x, ddz = tz - this.z, dd = Math.hypot(ddx, ddz);
                if (dd < 0.3) return true;
                const nx = this.x + ddx / dd * sp * dt, nz = this.z + ddz / dd * sp * dt;
                if (!this.checkWallCollision(nx, this.z, colliders)) this.x = nx;
                if (!this.checkWallCollision(this.x, nz, colliders)) this.z = nz;
                return false;
            };
            if (terr.mode === 'patrol') {
                // 巡回: 生まれた場所を中心に、円を描いて飛ぶ
                const R = terr.radius * 0.55;
                this.patrolAngle += dt * (this.speed * 0.9) / Math.max(2, R);
                const H = this.profile.flightHeight ?? 2.0;
                this.baseY += ((H + Math.sin(this.aiTimer * 2.5) * 0.3) - this.baseY) * Math.min(1, dt * 2);
                moveTo(this.homeX + Math.cos(this.patrolAngle) * R, this.homeZ + Math.sin(this.patrolAngle) * R, this.speed * 1.1);
                const flap = 1.0 + Math.sin(this.aiTimer * 9.0) * 0.08;
                this.sprite.scale.set(this.baseScaleX * flap, this.baseScaleY * (2.0 - flap), 1);
            } else {
                // 守る: 縄張りの中を、ゆっくりうろつく（追跡から戻ったときは、中心の方へ戻る）
                this.idleTimer -= dt;
                const roam = terr.mode === 'roam';   // 住民のように、広い範囲を、ふつうの速さでうろつく
                const farFromHome = Math.hypot(this.x - this.homeX, this.z - this.homeZ) > terr.radius * (roam ? 1.0 : 0.5);
                if (!this.idleTarget || this.idleTimer <= 0 || farFromHome) {
                    const a = Math.random() * Math.PI * 2, r = Math.random() * terr.radius * (roam ? 0.9 : 0.4);
                    this.idleTarget = { x: this.homeX + Math.cos(a) * r, z: this.homeZ + Math.sin(a) * r };
                    this.idleTimer = 3 + Math.random() * 3;
                }
                const arrived = moveTo(this.idleTarget.x, this.idleTarget.z, this.speed * (farFromHome ? 0.9 : (roam ? 0.65 : 0.4)));
                if (arrived) this.idleTimer = Math.min(this.idleTimer, 0.5);
                this.baseY = Math.abs(Math.sin(this.aiTimer * 5.0)) * 0.08;
            }
            this.sprite.position.set(this.x, this.baseY + this.floorY, this.z);
            return true;
        }
        return false;
    },

    updateProfileBehaviors(dt, dist, player, scene, colliders, dirX, dirZ) {
        const pr = this.profile;
        // 個性（特殊能力）: 召喚・範囲攻撃・瞬間移動・潜る（追跡状態のとき）
        if (pr && this.state === 'chase') {
            if (pr.summon && this.summonHook) {
                this.summonTimer -= dt;
                if (this.summonTimer <= 0 && dist < 24) { this.summonTimer = pr.summon.every * (0.9 + Math.random() * 0.3); this.summonHook(this, pr.summon.type, pr.summon.max); }
            }
            if (pr.slam && this.slamHook) {
                if (this.slamState === 'idle') {
                    this.slamCool -= dt;
                    if (this.slamCool <= 0 && dist < pr.slam.range) {
                        // プレイヤーの足元に、赤い輪（予兆）を出す。少しあとに、その範囲を攻撃する（輪の外へ出れば、よけられる）
                        this.slamState = 'wind'; this.slamTimer = pr.slam.windup; this.slamPos = { x: player.x, z: player.z };
                        if (scene) {
                            const ring = new THREE.Mesh(new THREE.RingGeometry(pr.slam.radius * 0.9, pr.slam.radius, 40), new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
                            ring.rotation.x = -Math.PI / 2;
                            ring.position.set(player.x, (player.floorY ?? this.floorY) + 0.08, player.z);
                            scene.add(ring); this.slamMesh = ring; this.slamScene = scene;
                        }
                    }
                } else {
                    this.slamTimer -= dt;
                    if (this.slamMesh) this.slamMesh.material.opacity = 0.35 + 0.35 * Math.abs(Math.sin(this.aiTimer * 14));
                    if (this.slamTimer <= 0) {
                        this.slamHook(this, this.slamPos, pr.slam.radius, pr.slam.mult);
                        this.clearSlam();
                        this.slamState = 'idle'; this.slamCool = pr.slam.cool * (0.9 + Math.random() * 0.3);
                    }
                }
            }
            if (pr.blink) {
                if (this.blinkState === 'idle') {
                    this.blinkTimer -= dt;
                    if (this.blinkTimer <= 0 && dist < 16 && dist > 2.5) { this.blinkState = 'wind'; this.blinkTimer = pr.blink.windup; }
                } else {
                    // 予兆: 点滅して、光る。終わると、プレイヤーの背後へ移動する
                    this.blinkTimer -= dt;
                    this.spriteMat.color.setRGB(1.6, 1.2, 2.2);
                    this.spriteMat.opacity = this.appearAlpha * (0.4 + 0.6 * Math.abs(Math.sin(this.aiTimer * 30)));
                    if (this.blinkTimer <= 0) {
                        const a = player.angle ?? 0;
                        const nx = player.x + Math.sin(a) * pr.blink.behind, nz = player.z + Math.cos(a) * pr.blink.behind;
                        if (!this.checkWallCollision(nx, nz, colliders)) { this.x = nx; this.z = nz; }
                        this.blinkState = 'idle'; this.blinkTimer = pr.blink.every * (0.9 + Math.random() * 0.3);
                        this.spriteMat.opacity = this.appearAlpha;
                    }
                }
            }
            if (pr.burrow) {
                const bw = pr.burrow;
                if (this.burrowState === 'up') {
                    this.burrowTimer -= dt;
                    if (this.burrowTimer <= 0 && dist > bw.surface + 1.5) { this.burrowState = 'under'; this.burrowTimer = bw.cool; this.cloaked = true; this.untouchable = true; }
                } else {
                    // 地中: 姿を消し、攻撃も受けず、プレイヤーへ近づく。近くで、飛び出す
                    this.burrowTimer -= dt;
                    const bdx = player.x - this.x, bdz = player.z - this.z, bd = Math.hypot(bdx, bdz) || 1;
                    if (bd > bw.surface * 0.6) { const nx = this.x + bdx / bd * this.speed * bw.speed * dt, nz = this.z + bdz / bd * this.speed * bw.speed * dt; if (!this.checkWallCollisionOnly(nx, this.z, colliders)) this.x = nx; if (!this.checkWallCollisionOnly(this.x, nz, colliders)) this.z = nz; }
                    this.baseY = 0;
                    if (dist <= bw.surface && this.burrowTimer <= 0) {
                        this.burrowState = 'up'; this.burrowTimer = bw.stay; this.cloaked = false; this.untouchable = false;
                        this.hitScale = 1.3; this.ambushBoost = Math.max(this.ambushBoost, 1.0);   // 飛び出しの一撃は、強い
                        this.stun(0.15);
                    }
                    this.sprite.position.set(this.x, this.baseY + this.floorY, this.z);
                    return true;
                }
            }
        }
        if (pr) {
            if (pr.regen && this.hp < this.maxHp && this.hitTimer <= 0) this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.015 * dt);
            if (pr.enrage) {
                const en = this.hp < this.maxHp * 0.5;
                if (en !== this.enraged) { this.enraged = en; this.speed = this.baseSpeed * (en ? 1.35 : 1); }
            }
            // 逃走: 体力が 3 割を切ると、プレイヤーから逃げる
            if (((pr.flee && this.hp < this.maxHp * 0.3) || this.fleeing) && dist < 40 && this.knockback.lengthSq() < 0.1) {
                const nx = this.x - dirX * this.speed * 1.6 * dt, nz = this.z - dirZ * this.speed * 1.6 * dt;
                if (!this.checkWallCollision(nx, this.z, colliders)) this.x = nx;
                if (!this.checkWallCollision(this.x, nz, colliders)) this.z = nz;
                this.baseY = this.flying ? this.baseY : Math.abs(Math.sin(this.aiTimer * 10)) * 0.12;
                this.sprite.position.set(this.x, this.baseY + this.floorY, this.z);
                return true;
            }
            // 回避: 近づかれると、ときどき、横へ素早く跳ぶ
            if (pr.evasion && dist < 7 && dist > 1.2) {
                this.evadeTimer -= dt;
                if (this.evadeTimer <= 0) {
                    this.evadeTimer = 3 + Math.random() * 1.5;
                    const sd = Math.random() < 0.5 ? 1 : -1;
                    this.knockback.set(-dirZ * sd * 9, 0, dirX * sd * 9);
                }
            }
        }
        return false;
    },

    updateShooting(dist, dt, dx, dz, player, projectiles, scene, soundFx) {
        const effectiveShootRange = this.shootRange || 15;
        if (this.canShoot && dist < effectiveShootRange && dist > 1.2) {
            this.shootTimer -= dt;
            if (this.shootTimer <= 0) {
                this.shootTimer = this.shootCooldown;
                const dirX = dx / dist;
                const dirZ = dz / dist;

                const isArrow = (this.shootType === 'arrow');
                const projSpeed = this.shootSpeed ?? (isArrow ? 12 : 8); // Arrows fly fast
                const projDmg = this.shootDamage ?? (isArrow ? 10 : 8);
                const maxDist = isArrow ? (this.maxArrowDistance || 13) : 0;

                const proj = new Projectile(this.x, this.z, dirX, dirZ, false, projSpeed, projDmg, {
                    type: this.shootType || 'magic',
                    maxDistance: maxDist,
                    sourceMonster: this
                });
                // 弾は、この敵の高さ（飛んでいれば、飛んでいる高さ）から出て、プレイヤーの胴の高さへ、上下にも狙いをつける
                const startY = this.floorY + this.baseY + 1.0;
                const targetY = (player.floorY ?? 0) + 1.0;
                const vy = Math.max(-9, Math.min(9, (targetY - startY) / Math.max(0.2, dist / projSpeed)));
                proj.setHeight(startY, vy);
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
    },
};
