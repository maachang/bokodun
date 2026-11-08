// 罠・仕掛け（噛みつく花・針・崩れる床・矢・炎・丸のこ）の毎フレームの更新。GameEngine のメソッド（this は GameEngine。game.js が、クラスの定義のあとで、GameEngine.prototype へ組み込む）。
// 元は public/js/game/updateWorld.js（長すぎて、編集の誤りが増えるため分割した）
import * as THREE from '/js/three.module.js';
import { Projectile } from '/js/projectile.js';

export const updateTrapMethods = {
    updateChompers(dt) {
        if (this.chompers && this.chompers.length > 0) {
            for (const c of this.chompers) {
                c.timer += dt;
                const cycleTime = c.timer % c.cycleDuration;

                // Cycle logic:
                // 0.0 ~ 1.5s: Open (Stay pulled back inside walls)
                // 1.5 ~ 1.65s: Snap shut violently! (Fast clamp)
                // 1.65 ~ 1.95s: Stay tightly closed (Chomp!)
                // 1.95 ~ 2.2s: Slowly retract back into walls
                let progress = 0; // 0 = fully open, 1 = fully closed (meeting at center)
                let snappingThisFrame = false;

                if (cycleTime < 1.5) {
                    progress = 0;
                    c.isCurrentlyDangerous = false;
                } else if (cycleTime < 1.65) {
                    // Lightning fast snap shut
                    const snapProgress = (cycleTime - 1.5) / 0.15;
                    progress = Math.min(1.0, snapProgress);
                    c.isCurrentlyDangerous = true;
                    if (!c.snappedSoundPlayed) {
                        c.snappedSoundPlayed = true;
                        // Play sound if near player with realistic distance attenuation
                        const distToPlayer = Math.hypot(this.player.x - c.x, this.player.z - c.z);
                        const maxAudibleDist = 7.0; // Localized sound: inaudible from distant rooms
                        if (distToPlayer < maxAudibleDist) {
                            const falloff = 1.0 - (distToPlayer / maxAudibleDist);
                            const vol = falloff * falloff; // Quadratic attenuation for natural proximity feeling
                            this.sound.playChomperSnap(vol);
                        }
                    }
                } else if (cycleTime < 1.95) {
                    progress = 1.0;
                    c.isCurrentlyDangerous = true;
                } else {
                    // Retract slowly
                    const retractProgress = (cycleTime - 1.95) / 0.25;
                    progress = Math.max(0, 1.0 - retractProgress);
                    c.isCurrentlyDangerous = false;
                    c.snappedSoundPlayed = false;
                }

                // Position the left and right blades
                const maxSpread = 1.85; // Fully retracted
                const closedSpread = 0.0; // Met at center
                const currentOffset = maxSpread * (1.0 - progress) + closedSpread * progress;

                if (c.isEastWestPassage) {
                    c.leftBlade.position.z = -currentOffset;
                    c.rightBlade.position.z = currentOffset;
                } else {
                    c.leftBlade.position.x = -currentOffset;
                    c.rightBlade.position.x = currentOffset;
                }

                // Check collision with player if dangerous
                if (c.isCurrentlyDangerous) {
                    const distToPlayer = Math.hypot(this.player.x - c.x, this.player.z - c.z);
                    if (distToPlayer < 1.35 && !this.player.isInvincible) {
                        // CHOP! Sliced by chomper!
                        this.sound.playChomperSlice();
                        this.flashDamageScreen();
                        this.particles.spawnBurst(this.player.x, 1.2, this.player.z, 0xdc2626, 24, 6.0); // Gruesome blood burst
                        this.addPopup(`ギロチン切断! -${c.damage}`, '#ef4444');
                        this.playerTakeDamage(c.damage, new THREE.Vector3(0, 0, 0));
                    }
                }
            }
        }
    },

    updatePopSpikes(dt) {
        if (this.popSpikes && this.popSpikes.length > 0) {
            for (const sp of this.popSpikes) {
                sp.timer = (sp.timer + dt) % sp.cycleDuration;
                const cycleTime = sp.timer;

                // Spike cycle timeline:
                // 0.0s ~ 1.3s: Hidden beneath floor (safe traversal window)
                // 1.3s ~ 1.45s: Rapid, violent upward thrust
                // 1.45s ~ 1.95s: Fully extended sharp iron needles (dangerous)
                // 1.95s ~ 2.4s: Retracting steadily back into floor
                let progress = 0; // 0 = retracted, 1 = fully thrust
                if (cycleTime < 1.3) {
                    progress = 0;
                    sp.isCurrentlyDangerous = false;
                    sp.thrustSoundPlayed = false;
                    sp.targetY = sp.retractedY;
                } else if (cycleTime < 1.45) {
                    const snapProgress = (cycleTime - 1.3) / 0.15;
                    progress = Math.min(1.0, snapProgress);
                    sp.targetY = sp.retractedY + (sp.thrustY - sp.retractedY) * progress;
                    sp.isCurrentlyDangerous = true;

                    if (!sp.thrustSoundPlayed) {
                        sp.thrustSoundPlayed = true;
                        // Proximity-based sound
                        const distToPlayer = Math.hypot(this.player.x - sp.x, this.player.z - sp.z);
                        const maxAudibleDist = 7.0;
                        if (distToPlayer < maxAudibleDist) {
                            const falloff = 1.0 - (distToPlayer / maxAudibleDist);
                            this.sound.playSpikeThrust(falloff * falloff);
                        }
                    }
                } else if (cycleTime < 1.95) {
                    progress = 1.0;
                    sp.targetY = sp.thrustY;
                    sp.isCurrentlyDangerous = true;
                } else {
                    const retractProgress = (cycleTime - 1.95) / 0.45;
                    progress = Math.max(0, 1.0 - retractProgress);
                    sp.targetY = sp.retractedY + (sp.thrustY - sp.retractedY) * progress;
                    sp.isCurrentlyDangerous = false;
                }

                // Check collision if player is standing on spikes while dangerous
                if (sp.isCurrentlyDangerous) {
                    const b = sp.bounds;
                    const r = this.player.radius || 0.6;
                    const inTrapZone = (this.player.x >= b.minX - r * 0.3 && this.player.x <= b.maxX + r * 0.3 &&
                                       this.player.z >= b.minZ - r * 0.3 && this.player.z <= b.maxZ + r * 0.3);

                    if (inTrapZone && !this.player.isInvincible) {
                        this.sound.playHurt();
                        this.flashDamageScreen();
                        this.particles.spawnBurst(this.player.x, 0.4, this.player.z, 0xdc2626, 16, 4.0);
                        this.addPopup(`針床串刺し! -${sp.damage}`, '#ef4444');
                        this.playerTakeDamage(sp.damage, new THREE.Vector3(0, 0, 0));
                    }
                }

                // Smooth spike vertical movement
                sp.currentY += (sp.targetY - sp.currentY) * 20 * dt;
                sp.mesh.position.y = sp.currentY;
            }
        }
    },

    updateCrumblingFloors(dt) {
        if (this.crumblingFloors && this.crumblingFloors.length > 0) {
            for (const cf of this.crumblingFloors) {
                const b = cf.bounds;
                const r = this.player.radius || 0.6;
                const onTile = (this.player.x >= b.minX + 0.25 && this.player.x <= b.maxX - 0.25 &&
                                this.player.z >= b.minZ + 0.25 && this.player.z <= b.maxZ - 0.25);

                if (cf.state === 'intact') {
                    if (onTile && !this.player.isFalling) {
                        cf.state = 'shaking';
                        cf.timer = 0;
                        this.sound.playCrumbleRumble();
                        this.addPopup('床が崩れる！', '#f97316');
                    }
                } else if (cf.state === 'shaking') {
                    cf.timer += dt;
                    // Jitter / shake violently before collapse
                    const shakeAmount = 0.08 * (cf.timer / cf.shakeDuration);
                    cf.mesh.position.x = cf.baseX + (Math.random() - 0.5) * shakeAmount;
                    cf.mesh.position.z = cf.baseZ + (Math.random() - 0.5) * shakeAmount;
                    cf.mesh.position.y = 0.08 - (cf.timer / cf.shakeDuration) * 0.06;

                    // Loose pebble particles falling
                    if (Math.random() < 0.3) {
                        this.particles.spawnBurst(cf.baseX + (Math.random() - 0.5) * 1.5, 0.1, cf.baseZ + (Math.random() - 0.5) * 1.5, 0x78716c, 2, 0.8);
                    }

                    if (cf.timer >= cf.shakeDuration) {
                        // Collapse! Drops into dark bottom
                        cf.state = 'falling';
                        cf.timer = 0;
                        cf.velocityY = 1.0;
                        this.sound.playFloorCollapse();
                        this.particles.spawnBurst(cf.baseX, 0.1, cf.baseZ, 0x44403c, 16, 2.5);

                        // If player is still standing on it when it drops: Fall plunge sequence!
                        if (onTile && !this.player.isFalling) {
                            this.triggerPlayerFall(cf);
                        }
                    }
                } else if (cf.state === 'falling') {
                    cf.velocityY += 25 * dt; // Gravity
                    cf.mesh.position.y -= cf.velocityY * dt;

                    if (cf.mesh.position.y <= -8.0) {
                        cf.state = 'fallen';
                        cf.mesh.visible = false;
                        cf.timer = 0;
                    }
                } else if (cf.state === 'fallen') {
                    // Pit is an open empty hole!
                    // If player steps into the open empty hole, they plummet into the pit!
                    if (onTile && !this.player.isFalling) {
                        this.triggerPlayerFall(cf);
                    }

                    cf.timer += dt;
                    if (cf.timer >= cf.respawnTime) {
                        // Reset intact floor slab
                        cf.state = 'intact';
                        cf.mesh.visible = true;
                        cf.mesh.position.set(cf.baseX, 0.08, cf.baseZ);
                        cf.timer = 0;
                        cf.velocityY = 0;
                    }
                }
            }
        }
    },

    updateDartTraps(dt) {
        if (this.dartTraps && this.dartTraps.length > 0) {
            for (const trap of this.dartTraps) {
                if (trap.cooldown > 0) trap.cooldown -= dt;

                const b = trap.bounds;
                const onPlate = (this.player.x >= b.minX && this.player.x <= b.maxX &&
                                 this.player.z >= b.minZ && this.player.z <= b.maxZ);

                if (onPlate) {
                    trap.plateMesh.position.y = trap.platePressedY; // Pressed down
                    if (!trap.isStepped && trap.cooldown <= 0) {
                        trap.isStepped = true;
                        trap.cooldown = 1.2; // Cooldown between dart bursts
                        this.sound.playPlateClick();
                        this.sound.playDartShoot();

                        // Spawn high speed poison dart arrow flying from wall dispenser
                        const dart = new Projectile(
                            trap.shootOriginX,
                            trap.shootOriginZ,
                            trap.dirX,
                            trap.dirZ,
                            false,
                            trap.speed,
                            trap.damage,
                            { type: 'arrow', maxDistance: 25 }
                        );
                        // Subtle green poison tip aura
                        dart.y = 1.3;
                        dart.mesh.position.y = 1.3;
                        this.projectiles.push(dart);
                        this.scene.add(dart.mesh);

                        this.particles.spawnBurst(trap.shootOriginX, 1.3, trap.shootOriginZ, 0x22c55e, 8, 2.5);
                        this.addPopup('カチッ！矢が飛んできた！', '#22c55e');
                    }
                } else {
                    trap.isStepped = false;
                    trap.plateMesh.position.y = trap.plateBaseY;
                }
            }
        }
    },

    updateFireJets(dt) {
        if (this.fireJets && this.fireJets.length > 0) {
            for (const fj of this.fireJets) {
                fj.timer = (fj.timer + dt) % fj.cycleDuration;

                // Cycle: [0.0 ~ activeDuration] = Erupting with roaring fire, rest = Inactive / glowing ember
                if (fj.timer < fj.flameActiveDuration) {
                    fj.isErupting = true;
                    fj.group.visible = true;

                    // Flickering flame scale and light intensity
                    const flameIntensity = 0.9 + Math.random() * 0.25;
                    const flickerX = 1.0 + (Math.random() - 0.5) * 0.12;
                    const flickerY = 1.0 + (Math.random() - 0.5) * 0.15;
                    fj.flamePlanes.forEach(p => {
                        p.scale.set(flickerX, flickerY, 1);
                    });
                    fj.flameLight.intensity = 2.4 * flameIntensity;

                    // Spark embers
                    if (Math.random() < 0.45) {
                        this.particles.spawnBurst(fj.x + (Math.random() - 0.5) * 0.8, 1.8, fj.z + (Math.random() - 0.5) * 0.8, 0xffaa00, 3, 2.0);
                    }

                    // Sound playback (with distance attenuation)
                    if (!fj.soundPlayed) {
                        fj.soundPlayed = true;
                        const distToPlayer = Math.hypot(this.player.x - fj.x, this.player.z - fj.z);
                        const maxAudibleDist = 8.0;
                        if (distToPlayer < maxAudibleDist) {
                            const falloff = 1.0 - (distToPlayer / maxAudibleDist);
                            this.sound.playFlameJet(falloff * falloff);
                        }
                    }

                    // Burn collision with player
                    const b = fj.bounds;
                    const inFlameZone = (this.player.x >= b.minX && this.player.x <= b.maxX &&
                                        this.player.z >= b.minZ && this.player.z <= b.maxZ);

                    if (inFlameZone && !this.player.isInvincible) {
                        this.sound.playHurt();
                        this.flashDamageScreen();
                        this.particles.spawnBurst(this.player.x, 1.2, this.player.z, 0xff3300, 16, 4.0);
                        this.addPopup(`火炎放射! -${fj.damage}`, '#f97316');
                        this.playerTakeDamage(fj.damage, new THREE.Vector3(0, 0, 0));
                    }
                } else {
                    fj.isErupting = false;
                    fj.group.visible = false;
                    fj.flameLight.intensity = 0;
                    fj.soundPlayed = false;
                }
            }
        }
    },

    updateBuzzsaws(dt) {
        if (this.buzzsaws && this.buzzsaws.length > 0) {
            for (const bs of this.buzzsaws) {
                bs.timer += dt * bs.speed;

                // Ping-pong oscillating sweep (-1.0 to 1.0) across corridor (left wall <-> right wall)
                const sweepOffset = Math.sin(bs.timer) * bs.travelDist;

                let curX = bs.baseX;
                let curZ = bs.baseZ;

                if (bs.isEastWest) {
                    // East-West corridor: sweep across North-South (Z axis)
                    curZ += sweepOffset;
                } else {
                    // North-South corridor: sweep across East-West (X axis)
                    curX += sweepOffset;
                }

                bs.group.position.x = curX;
                bs.group.position.z = curZ;

                // Ultra-rapid saw rotation spin around normal
                bs.sawMesh.rotation.z += 25 * dt;

                // Spark sparks flying from rail contact
                if (Math.random() < 0.25) {
                    this.particles.spawnBurst(curX, 0.1, curZ, 0xfacc15, 2, 2.0);
                }

                // Periodic whirring sound if near player
                const distToPlayer = Math.hypot(this.player.x - curX, this.player.z - curZ);
                const maxAudibleDist = 7.0;
                if (distToPlayer < maxAudibleDist && Math.random() < 0.08) {
                    const falloff = 1.0 - (distToPlayer / maxAudibleDist);
                    this.sound.playBuzzsawWhirr(falloff * falloff);
                }

                // Check collision with player
                if (distToPlayer < bs.radius && !this.player.isInvincible) {
                    this.sound.playChomperSlice();
                    this.sound.playHurt();
                    this.flashDamageScreen();
                    this.particles.spawnBurst(this.player.x, 1.0, this.player.z, 0xdc2626, 20, 5.0);
                    this.addPopup(`回転ノコギリ切断! -${bs.damage}`, '#ef4444');
                    this.playerTakeDamage(bs.damage, new THREE.Vector3(0, 0, 0));
                }
            }
        }
    },
};
