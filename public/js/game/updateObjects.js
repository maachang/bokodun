// 扉・宝箱・案内の表示・マップの端・ポータルの毎フレームの更新。GameEngine のメソッド（this は GameEngine。game.js が、クラスの定義のあとで、GameEngine.prototype へ組み込む）。
// 元は public/js/game/updateWorld.js（長すぎて、編集の誤りが増えるため分割した）
import { clampToWorld, edgeCrossing } from '/js/world.js';

export const updateObjectMethods = {
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
};
