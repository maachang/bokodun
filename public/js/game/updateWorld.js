// 世界の仕掛け・水面・弾・マップの端などの毎フレームの更新。GameEngine のメソッド（this は GameEngine。game.js が、クラスの定義のあとで、GameEngine.prototype へ組み込む）。
// 元は GameEngine.update の中の段階。移しただけで、動きは同じ（game.js が長すぎて、編集の誤りが増えるため分割した）
import * as THREE from '/js/three.module.js';
import { Projectile } from '/js/projectile.js';
import { clampToWorld, edgeCrossing } from '/js/world.js';

export const updateWorldMethods = {
    updateDoors(dt) {
        if (this.doors && this.doors.length > 0) {
            for (const d of this.doors) {
                const distToPlayer = Math.hypot(this.player.x - d.x, this.player.z - d.z);
                // Open door when approaching within 2.4 units, close when far away (>3.2 units)
                // 扉が自分の前側（向いている側）にあるときだけ開く。後ろ向きに近づいたり、後ろ移動（S / ↓）中は開かない
                const inFront = (d.x - this.player.x) * -Math.sin(this.player.angle) + (d.z - this.player.z) * -Math.cos(this.player.angle) > 0;
                if (distToPlayer < 2.4 && !d.isOpen && inFront && !this.keys.backward) {
                    d.isOpen = true;
                    d.targetY = d.openY;
                    this.sound.playDoorOpen();
                    this.addPopup('扉が開いた！', '#fef08a');
                    // Disable collider while door is open
                    d.collider.disabled = true;
                } else if (distToPlayer > 3.4 && d.isOpen) {
                    d.isOpen = false;
                    d.targetY = d.baseY;
                    d.collider.disabled = false;
                }

                // Smooth slide animation (raising up into the ceiling)
                d.mesh.position.y += (d.targetY - d.mesh.position.y) * 8 * dt;

                // 行き先つきの扉: 開いた扉のマスの中へ入ったら移動
                if (d.link.nextMap && d.isOpen && !this.keys.backward &&   // 後ろ移動で扉の中へ入っても移動しない
                    
                    Math.abs(this.player.x - d.x) < d.half && Math.abs(this.player.z - d.z) < d.half) {
                    this.sound.playLevelClear();
                    this.addPopup(d.link.message ?? '次のエリアへ', '#fef08a');
                    this.enterMap(d.link.nextMap, d.link);
                    return true;
                }
            }
        }
        return false;
    },

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

    updateChests(dt) {
        let nearChestInteractable = false;
        if (this.chests && this.chests.length > 0) {
            for (const ch of this.chests) {
                // Smooth opening/closing lid rotation
                ch.currentLidAngle += (ch.targetLidAngle - ch.currentLidAngle) * 8 * dt;
                ch.lidPivot.rotation.x = ch.currentLidAngle;

                // Handle Respawn timer if open
                if (ch.isOpen && !ch.isDestroyed) {
                    ch.respawnTimer += dt;
                    if (ch.respawnTimer >= ch.respawnDuration) {
                        // Reclose lid and refill treasure!
                        ch.isOpen = false;
                        ch.targetLidAngle = 0;
                        ch.respawnTimer = 0;
                        if (!ch.group.visible) {
                            ch.group.visible = true; // Make visible again if mimic was defeated
                        }
                        if (ch.collider) {
                            ch.collider.disabled = false;
                        }
                    }
                }

                // Check distance to prompt player interaction
                const distToChest = Math.hypot(this.player.x - ch.x, this.player.z - ch.z);
                if (distToChest < ch.radius + 0.8 && !ch.isOpen && ch.group.visible && this.sameFloorAs(ch.floorY)) {
                    nearChestInteractable = true;
                }
            }
        }
        return { nearChestInteractable };
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

    updateGuidance(nearChestInteractable) {
        let activeSignMessage = null;
        let activeSignIcon = '📜';
        if (nearChestInteractable) {
            activeSignMessage = '【Eキー】宝箱を開ける';
        } else if ((activeSignMessage = this.nearbyNpcSpeech()) !== null) {
            activeSignIcon = '💬';
        } else if (this.signposts && this.signposts.length > 0) {
            for (const s of this.signposts) {
                const distToSign = Math.hypot(this.player.x - s.x, this.player.z - s.z);
                const triggerDist = s.radius || 2.4;
                if (distToSign < triggerDist) {
                    activeSignMessage = s.message;
                    break;
                }
            }
        }
        this.updateSignpostBanner(activeSignMessage, activeSignIcon);
        this.updateCompass();
    },

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

    updateWorldEdge(dt) {
        const worldMap = this.currentMapData;
        if (this.world && worldMap?.layout && !this.nav.busy && this.world.grid?.some(r => r.includes(this.currentMapId))) {
            const ts = worldMap.tileSize || 4;
            const W = worldMap.layout[0].length * ts, D = worldMap.layout.length * ts;
            const cl = clampToWorld(this.world, this.currentMapId, this.player.x, this.player.z, W, D, this.player.radius);
            this.player.x = cl.x; this.player.z = cl.z;
            const cross = edgeCrossing(this.world, this.currentMapId, this.player.x, this.player.z, W, D);
            if (cross && cross.mapId) {
                this.loadMap(cross.mapId, { keepStack: true, edgeBlend: true, spawn: { x: cross.x / ts - 0.5, z: cross.z / ts - 0.5, angle: this.player.angle } });
                return true;
            }
        }
        // 端の移動のあと、空・霧・光の色を、数秒かけて、新しいマップの色にする
        if (this.envBlend) {
            this.envBlend.t += dt;
            const k = Math.min(1, this.envBlend.t / this.envBlend.dur);
            this.applyEnvBlend(k);
            if (k >= 1) this.envBlend = null;
        }
        return false;
    },

    updatePortals(dt) {
        for (const portal of this.portals) {
            if (portal.mesh) portal.mesh.rotation.y += dt * 2;
            const reached = portal.halfSize
                ? Math.abs(this.player.x - portal.x) < portal.halfSize && Math.abs(this.player.z - portal.z) < portal.halfSize   // 門のマス（四角）
                : Math.hypot(this.player.x - portal.x, this.player.z - portal.z) < portal.radius;                                  // 筒のポータル（円）
            if (reached) {
                this.sound.playLevelClear();
                this.addPopup(portal.link.message ?? 'ステージクリア！次のエリアへ', portal.link.color ?? '#38bdf8');
                this.enterMap(portal.link.nextMap, portal.link);
                return true;
            }
        }
        return false;
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
