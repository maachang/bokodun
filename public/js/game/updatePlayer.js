// プレイヤーの移動・地形の影響・カメラの毎フレームの更新。GameEngine のメソッド（this は GameEngine。game.js が、クラスの定義のあとで、GameEngine.prototype へ組み込む）。
// 元は GameEngine.update の中の段階。移しただけで、動きは同じ（game.js が長すぎて、編集の誤りが増えるため分割した）
import * as THREE from '/js/three.module.js';
import { FOOTSTEP_STRIDE } from '/js/game/constants.js';

const DEBUG_LIFT_MAX = 60;   // デバッグで浮き上がれる、目線の上限（64×64 のマップ全体が見える高さ）

export const updatePlayerMethods = {
    updateDebugCamera(dt) {
        // デバッグ（Shift+U / Shift+D）: 目線だけを浮かせる・沈める（上限 DEBUG_LIFT_MAX・下は地面まで）。当たり判定・移動は、そのまま
        const lift0 = this.player.debugLift || 0;
        if (this.keys.dbgUp) this.player.debugLift = Math.min(DEBUG_LIFT_MAX, lift0 + 25 * dt);
        if (this.keys.dbgDown) this.player.debugLift = Math.max(0, lift0 - 25 * dt);
        this.applyDebugFog();
    },

    // 浮いている間は、霧を遠くへ（上から、地形が霧で消えないように）。戻したら、元の霧に戻す（マップが変わって霧が作り直されたときは、保存を捨てる）
    applyDebugFog() {
        const fog = this.scene.fog;
        if (!fog) return;
        const lifted = (this.player.debugLift || 0) > 0;
        if (lifted && !this._dbgFog) { this._dbgFog = { fog, near: fog.near, far: fog.far }; }
        if (lifted && this._dbgFog) { if (this._dbgFog.fog !== fog) this._dbgFog = { fog, near: fog.near, far: fog.far }; fog.near = 2000; fog.far = 4000; }
        else if (!lifted && this._dbgFog) { if (this._dbgFog.fog === fog) { fog.near = this._dbgFog.near; fog.far = this._dbgFog.far; } this._dbgFog = null; }
    },

    updatePlayerMovement(dt) {
        if (this.keys.turnLeft) this.player.angle += this.player.rotSpeed * dt;
        if (this.keys.turnRight) this.player.angle -= this.player.rotSpeed * dt;
        // Ctrl+矢印キー: 視点の上下（pitch）と、ゆっくりした旋回（狙いの微調整）
        if (this.keys.camUp) this.player.pitch = Math.min(0.6, this.player.pitch + 1.2 * dt);
        if (this.keys.camDown) this.player.pitch = Math.max(-0.6, this.player.pitch - 1.2 * dt);
        this.updateDebugCamera(dt);
        if (this.keys.camLeft) this.player.angle += this.player.rotSpeed * 0.35 * dt;
        if (this.keys.camRight) this.player.angle -= this.player.rotSpeed * 0.35 * dt;

        // Player Move Direction
        const moveDir = new THREE.Vector3();
        if (!this.player.isFalling && !(this.player.status?.paralysis?.t > 0)) {   // 麻痺の間は、動けない
            if (this.keys.forward) moveDir.z -= 1;
            if (this.keys.backward) moveDir.z += 1;
            if (this.keys.left) moveDir.x -= 1;
            if (this.keys.right) moveDir.x += 1;
        }

        let worldMoveX = 0;
        let worldMoveZ = 0;

        if (moveDir.lengthSq() > 0) {
            moveDir.normalize();

            // Check terrain depth and speed penalty/bonus
            let speedMod = 1.0;
            let currentDepth = 0;
            if (this.terrainGrid) {
                for (const t of this.terrainGrid) {
                    if (this.player.x >= t.minX && this.player.x <= t.maxX &&
                        this.player.z >= t.minZ && this.player.z <= t.maxZ) {
                        speedMod = speedMod * (t.slowdown || 1.0) * (t.speedBonus || 1.0);
                        currentDepth = Math.max(currentDepth, t.depth || 0);
                    }
                }
            }

            if (this.player.status?.slow?.t > 0) speedMod *= this.player.status.slow.scale ?? 0.55;   // 鈍足

            // Rotate move direction by player's view angle
            const sin = Math.sin(this.player.angle);
            const cos = Math.cos(this.player.angle);
            const baseSpeed = (this.keys.sprint && ((this.player.debugLift || 0) > 0 || this.useStamina(this.staminaCost('dash') * dt))) ? this.player.runSpeed : this.player.speed;   // 浮いている間（デバッグ）は、走ってもスタミナを使わない
            const moveSpeed = baseSpeed * speedMod;
            worldMoveX = (moveDir.x * cos + moveDir.z * sin) * moveSpeed * dt;
            worldMoveZ = (-moveDir.x * sin + moveDir.z * cos) * moveSpeed * dt;

            const stepFromX = this.player.x;
            const stepFromZ = this.player.z;
            // 速い移動（走る・倍率つき）でも、壁・崖をすり抜けないよう、0.5 以下の長さに分けて動かす
            const moveLen = Math.hypot(worldMoveX, worldMoveZ), steps = Math.max(1, Math.ceil(moveLen / 0.5));
            for (let i = 0; i < steps; i++) this.movePlayer(worldMoveX / steps, worldMoveZ / steps);
            // 足音: 実際に進んだ距離が一定に達するたびに1回鳴らす（壁に押し付けて進めない間は鳴らさない）
            if (!this.player.isFalling) {
                this.footstepDistance = (this.footstepDistance || 0) + Math.hypot(this.player.x - stepFromX, this.player.z - stepFromZ);
                if (this.footstepDistance >= FOOTSTEP_STRIDE) {
                    this.footstepDistance %= FOOTSTEP_STRIDE;
                    // 足音はマップ（空間）ごとに決める。environment.footstep が無いマップ（屋外など）は鳴らさない
                    const footstep = this.mapData?.environment?.footstep;
                    if (footstep) this.sound.playFootstep(footstep);
                }
            }
        }

        // Record last safe position while walking safely on solid ground (not over pitfall hole or liquid hazard)
        if (!this.player.isFalling) {
            let overPit = false;
            if (this.crumblingFloors) {
                for (const cf of this.crumblingFloors) {
                    const b = cf.bounds;
                    if (this.player.x >= b.minX - 0.2 && this.player.x <= b.maxX + 0.2 &&
                        this.player.z >= b.minZ - 0.2 && this.player.z <= b.maxZ + 0.2) {
                        overPit = true;
                        break;
                    }
                }
            }
            if (!overPit) {
                this.player.lastSafePos.x = this.player.x;
                this.player.lastSafePos.z = this.player.z;
            }
        }

        // Handle Falling Pitfall Animation & Plunge Sequence
        if (this.player.isFalling) {
            this.player.fallVelocityY += 28 * dt; // Rapid acceleration into pit
            this.player.fallDepth += this.player.fallVelocityY * dt;

            // Pitch and tilt camera down into the pit
            this.player.pitch = Math.max(-0.6, this.player.pitch - 1.8 * dt);

            // Reached pit bottom (impaled on pit spikes / crash impact)
            if (this.player.fallDepth >= 5.5) {
                this.finishPlayerFall();
            }
        }
        return { worldMoveX, worldMoveZ };
    },

    updateTerrainEffects(dt, worldMoveX, worldMoveZ) {
        let playerFloorDepth = 0;
        let inWater = false;
        const wasInCurrent = this.player.inCurrent;
        this.player.inCurrent = false;
        if (this.terrainGrid) {
            for (const t of this.terrainGrid) {
                if (this.player.x >= t.minX && this.player.x <= t.maxX &&
                    this.player.z >= t.minZ && this.player.z <= t.maxZ) {
                    playerFloorDepth = Math.max(playerFloorDepth, t.depth || 0);
                    if (t.isWater) inWater = true;
                    // 急流: 下流へ流される（壁や崖には、止められる。流されて 3 段以上の崖は降りられない）
                    if (t.current) {
                        const cl = Math.hypot(t.current.x, t.current.z) || 1;
                        this.movePlayer(t.current.x / cl * t.current.speed * dt, t.current.z / cl * t.current.speed * dt);
                        if (!wasInCurrent) this.addPopup('急流に流される！', '#38bdf8');
                        this.player.inCurrent = true;
                    }

                    // 1. Hazard floor damage (Lava / Poison)
                    if (t.damagePerSec && t.damagePerSec > 0) {
                        this.player.hazardTimer = (this.player.hazardTimer || 0) + dt;
                        if (this.player.hazardTimer >= 0.5) {
                            this.player.hazardTimer = 0;
                            const dmg = Math.ceil(t.damagePerSec * 0.5);
                            this.player.hp = Math.max(0, this.player.hp - dmg);
                            if (t.hazardType === 'fire') {
                                this.addPopup(`灼熱! -${dmg}`, '#ef4444');
                                this.particles.spawnBurst(this.player.x, 0.5, this.player.z, 0xff5500, 6, 2.0);
                            } else if (t.hazardType === 'poison') {
                                this.addPopup(`毒! -${dmg}`, '#a855f7');
                                this.particles.spawnBurst(this.player.x, 0.5, this.player.z, 0x8b5cf6, 6, 2.0);
                            }
                        }
                    }

                    // 2. Magic Circle MP Recovery
                    if (t.mpRegenBonus && t.mpRegenBonus > 0) {
                        this.player.mp = Math.min(this.player.maxMp, this.player.mp + t.mpRegenBonus * dt);
                        if (Math.random() < 0.2) {
                            this.particles.spawnBurst(this.player.x, 0.2, this.player.z, 0x38bdf8, 2, 1.0);
                        }
                    }

                    // 3. Spike Trap
                    if (t.isTrap && !t.triggered) {
                        t.triggered = true;
                        this.player.hp = Math.max(0, this.player.hp - t.trapDamage);
                        this.sound.playHurt();
                        this.addPopup(`トラップ! -${t.trapDamage}`, '#dc2626');
                        this.particles.spawnBurst(this.player.x, 0.3, this.player.z, 0xef4444, 12, 3.0);
                        setTimeout(() => { t.triggered = false; }, 1800); // Reset trap after 1.8s
                    }

                    // 4. Dragon Quest Barrier Floor (Damage per step / traversal distance)
                    if (t.isBarrier) {
                        this.player.barrierDistance = (this.player.barrierDistance || 0) + (Math.hypot(worldMoveX, worldMoveZ));
                        if (this.player.barrierDistance >= 1.2) {
                            this.player.barrierDistance = 0;
                            const dmg = t.damagePerStep || 15;
                            this.player.hp = Math.max(0, this.player.hp - dmg);
                            this.sound.playBarrierDamage(); // 8-bit Famicom crunch buzz sound
                            this.addPopup(`バリア! -${dmg}`, '#38bdf8');
                            this.particles.spawnBurst(this.player.x, 0.4, this.player.z, 0x0ea5e9, 16, 4.0);
                            this.flashScreen('rgba(14, 165, 233, 0.45)'); // Electric Blue Flash
                        }
                    }
                }
            }
        }
        return { playerFloorDepth };
    },

    updateCameraAndKnockback(dt, playerFloorDepth) {
        if (this.player.knockback.lengthSq() > 0.001) {
            this.movePlayer(this.player.knockback.x * dt, this.player.knockback.z * dt);
            this.player.knockback.multiplyScalar(Math.max(0, 1 - dt * 10));
        }

        // Camera height with elevation difference (wading in water lowers player's eye height naturally, and falling plummets eye height into pit)
        // 高さのある床（高台の段）の上では目線も上がる。段ごとに急に跳ねないよう、なめらかに追従させる
        if (this.player.climb) this.updateClimb(dt);   // よじ登り中: 目線の高さは、登りの動きで決める
        const targetFloorY = this.getFloorHeight(this.player.x, this.player.z, this.player.heightLevel);
        if (!this.player.climb) this.player.floorY = (this.player.floorY ?? targetFloorY) + (targetFloorY - (this.player.floorY ?? targetFloorY)) * Math.min(1, dt * 10);
        const eyeHeight = 1.8 + (this.player.debugLift || 0) + this.player.floorY - playerFloorDepth - (this.player.isFalling ? this.player.fallDepth : 0);
        this.updateCullChunks();   // 木の描画（近い木は従来どおり・遠い木は切り抜き）と、霧で見えなくなる遠さの木・影・草の非表示（区画ごと。1 マス動いたときだけ）
        this.camera.position.set(this.player.x, eyeHeight, this.player.z);
        this.fitCameraFar();   // 高い所では、描画距離をのばす
        this.camera.rotation.set(0, 0, 0);
        this.camera.rotateY(this.player.angle);
        this.camera.rotateX(this.player.lookDown ? -Math.PI / 2 : this.player.pitch);   // lookDown（Shift+B）: 真下（旋回は、そのまま）

        // カメラの揺れ（強い一撃の手応え）。時間とともに小さくなる
        if (this.cameraShake.time > 0) {
            this.cameraShake.time -= dt;
            const a = this.cameraShake.amp * Math.max(0, this.cameraShake.time / this.cameraShake.duration);
            this.camera.position.x += (Math.random() - 0.5) * 2 * a;
            this.camera.position.y += (Math.random() - 0.5) * 2 * a;
        }
    },
};
