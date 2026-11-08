// 水面のアニメーションと、飛び道具の毎フレームの更新。GameEngine のメソッド（this は GameEngine。game.js が、クラスの定義のあとで、GameEngine.prototype へ組み込む）。
// 元は public/js/game/updateWorld.js（長すぎて、編集の誤りが増えるため分割した）
import * as THREE from '/js/three.module.js';

export const updateFlowMethods = {
    updateLiquidSurfaces(dt) {
        if (this.waterMeshes && this.waterMeshes.length > 0) {
            const time = this.clock.getElapsedTime();
            this.textures.water.offset.x = (time * 0.08) % 1;
            this.textures.water.offset.y = (time * 0.05) % 1;
            this.textures.shallowWater.offset.x = (time * 0.05) % 1;
            this.textures.shallowWater.offset.y = (time * 0.07) % 1;
            this.textures.lava.offset.x = (time * 0.03) % 1;
            this.textures.lava.offset.y = (time * 0.02) % 1;
            this.textures.poisonSwamp.offset.x = (time * 0.02) % 1;
            this.textures.poisonSwamp.offset.y = (time * 0.03) % 1;
            if (this.textures.fountainWater) {
                this.textures.fountainWater.offset.x = (time * 0.09) % 1;
                this.textures.fountainWater.offset.y = (time * 0.07) % 1;
            }

            // 松明の光: 光だまり・光の輪が、ゆらゆらと、明るさを変える
            for (const tg of this.torchGlows) {
                const f = 0.85 + 0.15 * Math.sin(time * 9 + tg.phase) * Math.sin(time * 3.7 + tg.phase * 1.7);
                tg.pool.material.opacity = tg.poolOpacity * f;
                tg.halo.material.opacity = tg.haloOpacity * f;
                tg.flame.scale.set(1, 0.9 + 0.2 * f, 1);
            }

            // Animate shimmering rising heat haze & smoke wisps above lava
            if (this.heatHazePlanes && this.heatHazePlanes.length > 0) {
                for (let i = 0; i < this.heatHazePlanes.length; i++) {
                    const h = this.heatHazePlanes[i];
                    // Cycle position within a natural heat shimmer layer (rising up to 0.40 units above surface)
                    const cycle = ((time * 0.7 + h.phase) % 2.0) / 2.0; // 0.0 -> 1.0
                    
                    // Rising Y movement: noticeable heat shimmering layer above surface
                    h.sprite.position.y = h.baseY + cycle * 0.40;

                    // Lateral swaying shimmer (wavy hot air distortion)
                    const sway = Math.sin(time * 3.5 + h.phase) * 0.15;
                    h.sprite.position.x = h.baseX + sway;

                    // Expand horizontally as heat wafts across the lava surface
                    const scaleFactor = 1.0 + cycle * 0.3;
                    h.sprite.scale.set(h.baseScale * scaleFactor, h.baseScale * 0.55 * scaleFactor, 1);

                    // Soft fade in on magma surface, gently fades out around 0.4 units height
                    let alpha = Math.sin(cycle * Math.PI) * 0.70;
                    h.sprite.material.opacity = Math.max(0, alpha);

                    // Periodically spawn floating ember particle
                    if (Math.random() < 0.015) {
                        this.particles.spawnHeatEmber(h.tileX, h.baseY, h.tileZ);
                    }
                }
            }

            // Animate fountain spurts and player water splash interaction (シャバシャバ演出)
            if (this.fountains && this.fountains.length > 0) {
                for (const f of this.fountains) {
                    // Continuous fountain water spurting from central spout (rich, visible spray)
                    this.particles.spawnWaterSpurt(f.x, f.topY, f.z, 2);

                    // Check player touching or walking near the fountain rim
                    const distToPlayer = Math.hypot(this.player.x - f.x, this.player.z - f.z);
                    if (f.splashCooldown > 0) f.splashCooldown -= dt;

                    // If player is right next to the fountain basin (<= radius + 0.6) and moving, trigger splash & sound
                    const isMoving = (this.keys.forward || this.keys.backward || this.keys.left || this.keys.right);
                    if (distToPlayer <= f.radius + 0.65 && isMoving && f.splashCooldown <= 0) {
                        f.splashCooldown = 0.18; // Throttle splash triggers
                        this.sound.playWaterSplash();
                        this.particles.spawnWaterSplash(this.player.x, f.surfaceY + 0.1, this.player.z, 16);
                        if (Math.random() < 0.3) {
                            this.addPopup('シャバシャバ！', '#38bdf8', this.player.x, this.player.z);
                        }
                    }
                }
            }
        }
    },

    updateProjectiles(dt) {
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles[i];
            p.update(dt, this.colliders, this.particles);

            // 起伏のあるマップ: 弾が、地面（崖の面・斜面）にぶつかったら消える
            if (this.heightMap && p.active && this.projectileHitsGround(p)) {
                p.active = false;
                this.particles.spawnBurst(p.x, p.y, p.z, p.color ?? 0xb08d58, 8, 2.5);
            }

            if (p.isPlayer) {
                // Check player fireball hit monster
                for (const m of this.monsters) {
                    if (!m.active || m.untouchable || p.hitMonsters.has(m)) continue;
                    const distM = Math.hypot(m.x - p.x, m.z - p.z);
                    // 起伏のあるマップでは、高さも合っているときだけ当たる（敵の胴の高さ ±1.6）
                    if ((this.heightMap || m.flying) && Math.abs(p.y - ((m.floorY ?? 0) + (m.baseY ?? 0) + 0.9)) > 1.6) continue;
                    if (distM < m.radius + p.radius) {
                        if (this.hitMonsterWithProjectile(p, m)) break;
                    }
                }
            } else {
                // Check enemy projectile (arrow or magic) hit player
                const distP = Math.hypot(this.player.x - p.x, this.player.z - p.z);
                const pFloor = this.player.floorY ?? 0;
                if (distP < this.player.radius + p.radius && p.y >= pFloor - 0.3 && p.y <= pFloor + 2.4) {   // 高さが合っているときだけ当たる
                    this.playerTakeDamage(p.damage, new THREE.Vector3(p.dirX, 0, p.dirZ), 1.0, p.sourceMonster ?? null);
                    if (p.sourceMonster) {
                        this.notifyEnemyEngaged(p.sourceMonster);
                    }
                    if (p.type === 'arrow') {
                        this.sound.playArrowHit();
                        this.particles.spawnBurst(p.x, p.y, p.z, 0xd4d4d8, 8, 2.5);
                    } else if (p.type === 'poison_breath') {
                        this.sound.playExplosion();
                        this.particles.spawnBurst(p.x, p.y, p.z, 0x84cc16, 20, 3.5);
                        this.addPopup(`猛毒ブレス被弾! -${p.damage}`, '#a3e635');
                    } else if (p.type === 'breath_fire') {
                        this.sound.playExplosion();
                        this.particles.spawnBurst(p.x, p.y, p.z, 0xff6a00, 20, 3.5);
                        this.addPopup(`炎のブレス被弾! -${p.damage}`, '#fb923c');
                    } else if (p.type === 'fire_bolt') {
                        this.sound.playExplosion();
                        this.particles.spawnBurst(p.x, p.y, p.z, 0xff6a00, 12, 3.0);
                        this.addPopup(`火球被弾! -${p.damage}`, '#fb923c');
                    } else if (p.type === 'poison_dust') {
                        this.sound.playExplosion();
                        this.particles.spawnBurst(p.x, p.y, p.z, 0xd946ef, 16, 3.0);
                        this.addPopup(`毒鱗粉被弾! -${p.damage}`, '#e879f9');
                    } else {
                        this.sound.playExplosion();
                        this.particles.spawnBurst(p.x, p.y, p.z, 0xd946ef, 14, 4.0);
                    }
                    p.active = false;
                }
            }

            if (!p.active) {
                this.scene.remove(p.mesh);
                this.projectiles.splice(i, 1);
            }
        }
    },
};
