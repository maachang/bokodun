// 敵の感知（視線・気づく・見失う）と、壁との当たり判定。Monster の静的メソッド（public/js/entities.js が、クラスの定義のあとで、Monster へ組み込む）。
// 元は public/js/entities.js の Monster。移しただけで、動きは同じ（ファイルが長すぎて、編集の誤りが増えるため分割した）
import { SENSE_DRAW_SCALE, LOST_TIME, SENSE_NEAR_DIST } from '/js/monster/constants.js';

export const monsterSenseMethods = {
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
    },

    // 索敵状態の更新（感知距離 = 種類別 senseRange × 地形の視界係数 visibility）。描画の制御にのみ使う
    updateAwareness(dt, dx, dz, dist, player, colliders, visibility) {
        if (this.alwaysAware) {
            this.state = 'chase';
            return;
        }
        const range = this.senseRange * visibility;
        const keepRange = range * SENSE_DRAW_SCALE;
        const toPlayer = Math.atan2(dx, dz);
        // 飛ぶ敵: 上空から見下ろすので、壁や視野角に関係なく、感知距離（の 1.3 倍）に入れば気づく
        if (this.flying) {
            if (dist <= range * 1.3 || (this.state === 'chase' && dist <= keepRange)) {
                this.state = 'chase'; this.lostTimer = 0; this.facing = toPlayer;
            } else if (this.state === 'chase') {
                this.lostTimer += dt;
                if (this.lostTimer >= LOST_TIME) this.state = 'unaware';
            }
            return;
        }

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
                this.state = 'chase';
                this.lostTimer = 0;
            }
        } else {
            // chase: 視線が通り感知圏内にいる間は発見済みを維持。見失って一定時間で未発見に戻る
            const gd = this.profile?.guard;
            if (gd) {   // 盾持ちは、向きを変えるのが遅い（横や背後へ回り込めば、盾で防がれない）
                let d = toPlayer - this.facing;
                d = Math.atan2(Math.sin(d), Math.cos(d));
                const maxTurn = gd.turn * dt;
                this.facing += Math.max(-maxTurn, Math.min(maxTurn, d));
            } else this.facing = toPlayer;
            if (keepSight) {
                this.lostTimer = 0;
            } else {
                this.lostTimer += dt;
                if (this.lostTimer >= LOST_TIME) this.state = 'unaware';
            }
        }
    },

    checkWallCollision(x, z, colliders) {
        // 地上の敵は、崖（上り 2 段以上・下り 3 段以上）や、毒沼・溶岩へは進まない。飛ぶ敵・大ジャンプの空中は、地形に関係なく動ける
        if (this.terrainBlock && !this.flying && !(this.isLeaping && this.baseY > 0.4) && this.terrainBlock(this, x, z)) return true;
        for (const c of colliders) {
            if (c.disabled) continue;
            if (x >= c.minX - this.radius && x <= c.maxX + this.radius &&
                z >= c.minZ - this.radius && z <= c.maxZ + this.radius) {
                return true;
            }
        }
        return false;
    },

    // 壁だけ（崖・毒沼は無視）の判定。地中を進む敵が使う
    checkWallCollisionOnly(x, z, colliders) {
        for (const c of colliders) {
            if (c.disabled) continue;
            if (x >= c.minX - this.radius && x <= c.maxX + this.radius && z >= c.minZ - this.radius && z <= c.maxZ + this.radius) return true;
        }
        return false;
    },
};
