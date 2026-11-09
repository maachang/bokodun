// 高低差・当たり判定・プレイヤーの移動・よじ登り・落下。GameEngine のメソッド（this は GameEngine。game.js が、クラスの定義のあとで、GameEngine.prototype へ組み込む）。
// 元は game.js の GameEngine のメソッド。移しただけで、動きは同じ（game.js が長すぎて、編集の誤りが増えるため分割した）
import * as THREE from '/js/three.module.js';
import { bridgeLayerLevel, groundStepOk } from '/js/enemyBehavior.js';
import { CLIMB_HOLD_SEC, CLIMB_RISE, CLIMB_SEC, effectPower } from '/js/game/constants.js';

export const movementMethods = {
    // マス (行 r, 列 c) の高さの段（起伏のないマップは 0。マップの外は 0）
    //   マップの外のマスは、いちばん近い端のマスの高さ（端を越えるとき、段差にならない。連続した高さの世界で、端の高さが 3 段以上でも、越えられる）
    heightLevelAtTile(r, c) {
        const hm = this.heightMap;
        if (!hm) return 0;
        const rr = Math.min(Math.max(r, 0), hm.length - 1);
        return hm[rr][Math.min(Math.max(c, 0), hm[rr].length - 1)] ?? 0;
    },

    // マス (行 r, 列 c) の、地形（地面・崖の面）の高さの段。吊橋のマスは、橋の下の谷の底（bridgeUnder）の高さ
    terrainLevelAtTile(r, c) {
        return this.bridgeCells?.has(`${r},${c}`) ? this.bridgeUnder : this.heightLevelAtTile(r, c);
    },

    // ワールド座標 (x, z) の高さの段。
    //   ref: 動く者の、今の高さの段（省略可）。吊橋のマスは、層が 2 つ（橋の上＝heights の値・橋の下＝bridgeUnder）で、ref に近いほうの層を返す
    heightLevelAt(x, z, ref) {
        if (!this.heightMap) return 0;
        const ts = this.mapData?.tileSize || 4;
        const r = Math.floor(z / ts), c = Math.floor(x / ts);
        const h = this.heightLevelAtTile(r, c);
        if (this.bridgeCells?.has(`${r},${c}`)) return bridgeLayerLevel(h, this.bridgeUnder, ref);
        return h;
    },

    // 床の高さ（ワールドの y）から、高さの段（吊橋の層を選ぶ ref に使う）
    levelOfFloorY(floorY) {
        return (floorY ?? 0) / (this.heightStep || 1);
    },

    // プレイヤーが、壁（木・岩・海などの当たり判定）に重なっていたら、近くの空いている所（中心から外へ 0.5 ずつ広げて探す）へ動かす
    pushPlayerOutOfWalls() {
        if (!this.isInsideWall(this.player.x, this.player.z)) return;
        const ts = this.mapData?.tileSize || 4;
        const maxX = (this.mapData?.layout?.[0]?.length ?? 0) * ts, maxZ = (this.mapData?.layout?.length ?? 0) * ts;
        for (let d = 0.5; d <= 20; d += 0.5) {
            for (let k = 0; k < 16; k++) {
                const a = k * Math.PI / 8;
                const x = this.player.x + Math.cos(a) * d, z = this.player.z + Math.sin(a) * d;
                if (x < 0 || z < 0 || x > maxX || z > maxZ) continue;
                if (!this.isInsideWall(x, z)) { this.player.x = x; this.player.z = z; return; }
            }
        }
    },

    tryStartClimb(dirX, dirZ) {
        const now = performance.now();
        const h = this.climbHold;
        if (!h || now - h.last > 150 || h.dirX !== dirX || h.dirZ !== dirZ) this.climbHold = { since: now, last: now, dirX, dirZ };
        else h.last = now;
        if (now - this.climbHold.since < CLIMB_HOLD_SEC * 1000) return;
        if (this.player.staminaExhausted) return;   // スタミナ切れは、登れない
        const cur = this.player.heightLevel ?? this.heightLevelAt(this.player.x, this.player.z);
        const r = this.player.radius;
        // 崖の縁（2 段高くなる所）を探し、その先の、上に立つ位置を決める
        let d = 0, found = false;
        for (; d <= 3; d += 0.1) {
            if (this.heightLevelAt(this.player.x + dirX * (r + d), this.player.z + dirZ * (r + d), cur) - cur === CLIMB_RISE) { found = true; break; }
        }
        if (!found) return;
        const tx = this.player.x + dirX * (r + d + r + 0.5), tz = this.player.z + dirZ * (r + d + r + 0.5);
        if (this.heightLevelAt(tx, tz, cur) - cur !== CLIMB_RISE || this.isInsideWall(tx, tz)) return;   // 上に立てない（壁・木・段が、続く）ときは、登らない
        this.player.climb = { t: 0, sx: this.player.x, sz: this.player.z, tx, tz, fromLv: cur, toLv: cur + CLIMB_RISE, fromY: cur * this.heightStep, toY: (cur + CLIMB_RISE) * this.heightStep };
        this.climbHold = null;
        this.useStamina(this.staminaDef?.climbCost ?? 15);   // 登りの消費（仮）
    },

    updateClimb(dt) {
        const c = this.player.climb;
        c.t += dt;
        const T = c.t, rise = c.toY - c.fromY;
        // 高さの進み方（0〜1）: ①0〜0.35 秒: ジャンプして縁に手をかける（0 → 0.55）②0.35〜1.0 秒: 腕で引き上げる（0.55 → 0.75。ゆっくり）③1.0〜1.6 秒: 足をひっかけて、体を縁の上へ（0.75 → 1.0）④1.6〜2.0 秒: 縁の上に立つ（前へ進む）
        const ease = (x) => x * x * (3 - 2 * x);
        let p;
        if (T < 0.35) p = 0.55 * (1 - (1 - T / 0.35) ** 2);
        else if (T < 1.0) p = 0.55 + 0.2 * ease((T - 0.35) / 0.65);
        else if (T < 1.6) p = 0.75 + 0.25 * ease((T - 1.0) / 0.6);
        else p = 1;
        const sway = (T > 0.35 && T < 1.6) ? Math.sin(T * 14) * 0.03 : 0;   // 腕で引き上げる間の、わずかな揺れ
        this.player.floorY = c.fromY + rise * p + sway;
        if (T >= 1.6) {   // 縁の上に立つ位置へ、なめらかに進む
            const k = Math.min(1, (T - 1.6) / (CLIMB_SEC - 1.6));
            this.player.x = c.sx + (c.tx - c.sx) * ease(k);
            this.player.z = c.sz + (c.tz - c.sz) * ease(k);
        }
        if (T >= CLIMB_SEC) {
            this.player.x = c.tx; this.player.z = c.tz;
            this.player.heightLevel = c.toLv;
            this.player.floorY = c.toY;
            this.player.climb = null;
        }
    },

    isInsideWall(x, z) {
        const r = this.player.radius;
        for (const c of this.colliders) {
            if (c.disabled) continue;
            if (x >= c.minX - r && x <= c.maxX + r && z >= c.minZ - r && z <= c.maxZ + r) return true;
        }
        return false;
    },

    // すでに壁の中にいる（めり込んだ）場合に、最も近い壁の外側の縁へ出す。通常の移動は壁に入る位置を事前に止めるので、
    // めり込みは押し戻しなど想定外の原因で起きる。放っておくと、どの方向へも動けなくなる
    depenetrateFromWalls() {
        const r = this.player.radius;
        const EPS = 0.001; // 判定は境界を含む（<=）ので、縁のわずかに外へ出す
        for (let i = 0; i <= this.colliders.length; i++) {
            const c = this.colliders.find(c => !c.disabled &&
                this.player.x >= c.minX - r && this.player.x <= c.maxX + r &&
                this.player.z >= c.minZ - r && this.player.z <= c.maxZ + r);
            if (!c) return;
            const exits = [
                { d: this.player.x - (c.minX - r), x: c.minX - r - EPS },
                { d: (c.maxX + r) - this.player.x, x: c.maxX + r + EPS },
                { d: this.player.z - (c.minZ - r), z: c.minZ - r - EPS },
                { d: (c.maxZ + r) - this.player.z, z: c.maxZ + r + EPS }
            ];
            const best = exits.reduce((a, b) => (b.d < a.d ? b : a));
            if (best.x !== undefined) this.player.x = best.x;
            else this.player.z = best.z;
        }
    },

    // 村人が、その位置に立てないか（壁・家具などの当たり判定、水、プレイヤー、ほかの村人）
    // その位置にある、高さのある床の高さ（なければ 0）
    //   refLevel: 動く者の今の高さの段（吊橋の層を選ぶ。省略は橋の上）
    getFloorHeight(x, z, refLevel) {
        let h = this.heightMap ? this.heightLevelAt(x, z, refLevel) * this.heightStep : 0;
        for (const t of this.raisedFloors ?? []) {
            if (x >= t.minX && x <= t.maxX && z >= t.minZ && z <= t.maxZ) h = Math.max(h, t.height);
        }
        return h;
    },

    isNpcBlocked(self, x, z, radius) {
        // 起伏のあるマップ: 村人も、崖（上り 2 段以上・下り 3 段以上）へは、進まない
        if (this.heightMap && self && !groundStepOk((px, pz) => this.heightLevelAt(px, pz, this.levelOfFloorY(self.floorY)), self.x, self.z, x, z)) return true;
        for (const c of this.colliders) {
            if (c.disabled) continue;
            if (x >= c.minX - radius && x <= c.maxX + radius && z >= c.minZ - radius && z <= c.maxZ + radius) return true;
        }
        for (const t of this.terrainGrid) {
            if (t.depth > 0 && x >= t.minX && x <= t.maxX && z >= t.minZ && z <= t.maxZ) return true;
        }
        if (Math.hypot(x - this.player.x, z - this.player.z) < radius + this.player.radius + 0.3) return true;
        for (const n of this.npcs) {
            if (n !== self && Math.hypot(x - n.x, z - n.z) < radius + n.radius + 0.2) return true;
        }
        return false;
    },

    movePlayer(dx, dz) {
        // マップの読み込み中は、動かない。読み込み中も、ゲームの時間は進み、新しい地形の高さが先に入るため、古い位置のまま動くと、
        //   段差を落下と判定して、落下ダメージを受けていた（マップ間の移動）
        if (this.nav?.busy) return;
        if (this.player.climb) return;   // 崖をよじ登っている間は、歩けない
        this._climbBump = null;
        if ((this.player.debugLift || 0) > 0) {   // デバッグで浮いている間（Shift+U）: 通れない所（壁・崖・敵）を無視して、そのまま進む。高さの記録は、そのマスに合わせる（降りたとき、落下にしない）
            this.player.x += dx; this.player.z += dz;
            if (this.heightMap) this.player.heightLevel = this.heightLevelAt(this.player.x, this.player.z, this.player.heightLevel);
            return;
        }
        this.depenetrateFromWalls();
        const prevX = this.player.x;
        const prevZ = this.player.z;
        const nextX = this.player.x + dx;
        const nextZ = this.player.z + dz;
        const r = this.player.radius;

        // X collision
        let canMoveX = true;
        for (const c of this.colliders) {
            if (c.disabled) continue;
            if (nextX >= c.minX - r && nextX <= c.maxX + r &&
                this.player.z >= c.minZ - r && this.player.z <= c.maxZ + r) {
                canMoveX = false;
                break;
            }
        }
        // 起伏: 2 段以上高い所へは、歩いて上れない（崖）。1 段までの段差は上れる。
        //   降りるのは、1 段は普通に、2 段は飛び降りて（ダメージ）降りられる。3 段以上の高さからは、降りられない（崖の縁で止まる）
        const climbOk = (x, z, dirX, dirZ) => {
            if (!this.heightMap) return true;
            const cur = this.player.heightLevel ?? this.heightLevelAt(this.player.x, this.player.z);
            const diff = this.heightLevelAt(x + dirX * r, z + dirZ * r, cur) - cur;   // 吊橋のマスは、今の高さに近い層（橋の上・橋の下）へ進む
            if (diff === CLIMB_RISE) this._climbBump = { dirX, dirZ };   // ちょうど 2 段高い崖: 前へ押し続けると、よじ登れる
            return diff <= 1 && diff >= -2;
        };
        if (canMoveX && !climbOk(nextX, this.player.z, Math.sign(dx), 0)) canMoveX = false;
        if (canMoveX) this.player.x = nextX;

        // Z collision
        let canMoveZ = true;
        for (const c of this.colliders) {
            if (c.disabled) continue;
            if (this.player.x >= c.minX - r && this.player.x <= c.maxX + r &&
                nextZ >= c.minZ - r && nextZ <= c.maxZ + r) {
                canMoveZ = false;
                break;
            }
        }
        if (canMoveZ && !climbOk(this.player.x, nextZ, 0, Math.sign(dz))) canMoveZ = false;
        if (canMoveZ) this.player.z = nextZ;
        // 起伏: 2 段以上低い所へ降りたら、落下（高さに応じたダメージ）
        if (this.heightMap) {
            const prev = this.player.heightLevel ?? this.heightLevelAt(this.player.x, this.player.z);
            const lv = this.heightLevelAt(this.player.x, this.player.z, prev);
            if (prev - lv >= 2) this.applyHeightFall(prev - lv);
            this.player.heightLevel = lv;
        }

        if (this._climbBump && !this.player.climb) this.tryStartClimb(this._climbBump.dirX, this._climbBump.dirZ);
        else if (!this._climbBump) this.climbHold = null;

        // 生きている敵は障害物（突き抜けられない）。敵に近づく方向の移動だけ、敵の円の縁まで押し戻して横へ滑らせる。
        // 突進の攻撃判定（距離 player.radius + m.radius 未満）が成立するよう、縁は攻撃判定の距離より内側（80%）にする。
        // すでに重なっている敵から離れる方向の移動は妨げない。倒れている最中（active=false）の敵は障害物にしない
        for (const m of [...this.monsters, ...(this.npcs ?? [])]) {
            if (!m.active) continue;
            const minDist = (r + m.radius) * 0.8;
            const cx = this.player.x - m.x;
            const cz = this.player.z - m.z;
            const d = Math.hypot(cx, cz);
            if (d >= minDist) continue;
            const prevD = Math.hypot(prevX - m.x, prevZ - m.z);
            if (d >= prevD) continue;
            // 押し戻した位置が壁に重なる場合は、押し戻さず動く前の位置に留まる（壁にめり込んで動けなくなるのを防ぐ）
            const pushedX = d > 0.0001 ? m.x + cx / d * minDist : prevX;
            const pushedZ = d > 0.0001 ? m.z + cz / d * minDist : prevZ;
            if (this.isInsideWall(pushedX, pushedZ)) {
                this.player.x = prevX;
                this.player.z = prevZ;
            } else {
                this.player.x = pushedX;
                this.player.z = pushedZ;
            }
        }
    },

    resolveYsBump(monster, dx, dz, dist) {
        // 装備中の近接武器（未装備なら素手）のクラスが、突進攻撃のダメージ・間隔・ノックバック・スタン・エフェクトを決める
        const weapon = this.getMeleeItem();
        const cls = (weapon && this.weaponClasses[weapon.weaponClass]) || null;
        const damageScale = (cls ? cls.damageScale : 1.0) * (weapon?.powerScale ?? 1);
        const randomBonus = weapon?.randomBonus ?? 3;
        this.player.attackCooldown = cls ? cls.cooldown : 0.22; // Quick hit intervals for "bokosuka"

        // Player forward vector
        const pFwdX = -Math.sin(this.player.angle);
        const pFwdZ = -Math.cos(this.player.angle);

        // Vector to monster
        const nx = dx / (dist || 0.001);
        const nz = dz / (dist || 0.001);

        // Dot product: player facing enemy?
        const dotFront = pFwdX * nx + pFwdZ * nz;

        // Cross product 2D: determine how much the player is offset from center
        const cross = Math.abs(pFwdX * nz - pFwdZ * nx);

        // Player is actively pressing move key to attack/charge forward
        const isPlayerMovingForward = (this.keys.forward && !this.player.isFalling && !this.player.staminaExhausted);   // スタミナ切れは、攻撃できない（歩行・防御は可）

        // Ys 1 "Half-offset" rule:
        // Attack only occurs if player is actively moving forward!
        // If player is standing still, player does NOT attack, and enemy gets a free hit.
        const isHalfOffset = (isPlayerMovingForward && dotFront > 0.4 && cross >= 0.25);
        const isCharging = (isPlayerMovingForward && dotFront > 0.6);

        // 武器クラスの効果（ノックバック・スタン・斬撃エフェクト）を、突進が当たった敵に適用する
        const applyWeaponEffects = (isDead, crit) => {
            if (!cls) return;
            if (cls.stun > 0 && !isDead) monster.stun(cls.stun);
            this.slashEffects.spawn(cls.range, cls.arcDeg, cls.effect, effectPower(crit, isDead));
        };
        const knockScale = cls ? cls.knockback : 1.0;
        const heavySound = cls ? cls.sound === 'heavy' : false;

        if ((isHalfOffset || isCharging)) this.useStamina(this.staminaCost('attack', weapon?.weight ?? 10));   // 攻撃 1 回の消費（当たっても外れても）

        if (isHalfOffset) {
            // CRITICAL HALF-OFFSET HIT: Player takes 0 damage, monster takes full + bonus damage!
            const damage = Math.floor(this.playerAttackPower() * 1.5 * damageScale + Math.random() * 5);
            this.sound.playAttack(true);
            const isDead = monster.takeDamage(damage, { x: nx, z: nz }, knockScale);
            applyWeaponEffects(isDead, true);
            this.playerHitFeedback({ crit: true, killed: isDead, heavy: heavySound });
            this.particles.spawnBurst(monster.x, 1.2, monster.z, 0xfbbf24, 12, 4.0);
            this.addPopup(monster.lastBlocked ? 'ガード!' : `半ずらし会心! -${damage}`, monster.lastBlocked ? '#94a3b8' : '#fbbf24', monster.x, monster.z);
            this.notifyEnemyEngaged(monster);

            if (isDead) this.gainExp(monster.exp);
        } else if (isCharging) {
            // Normal charge: Mutual damage (player takes half, enemy takes standard)
            const pDmg = Math.floor(this.playerAttackPower() * damageScale + Math.random() * randomBonus);
            if (monster.isDashing) monster.dashHit = true;   // 突進が当たった（よけられていない）
            const mDmg = Math.floor(monster.attackPower * 0.5 * (monster.isDashing ? 1.5 : 1) * (monster.hitScale ?? 1));

            this.sound.playAttack(heavySound);
            const isDead = monster.takeDamage(pDmg, { x: nx, z: nz }, knockScale);
            applyWeaponEffects(isDead, false);
            this.playerHitFeedback({ crit: false, killed: isDead, heavy: heavySound });
            this.playerTakeDamage(mDmg, new THREE.Vector3(-nx, 0, -nz), 1.0, monster);
            this.addPopup(monster.lastBlocked ? 'ガード!' : `ボコッ! -${pDmg}`, monster.lastBlocked ? '#94a3b8' : '#ffffff', monster.x, monster.z);
            this.notifyEnemyEngaged(monster);

            if (isDead) this.gainExp(monster.exp);
        } else {
            // Enemy hits player (player is standing still, stopped, or backing away)
            if (monster.isDashing) monster.dashHit = true;   // 突進が当たった（よけられていない）
            const mDmg = Math.max(1, Math.floor(monster.attackPower * (monster.isDashing ? 1.5 : 1) * (monster.hitScale ?? 1)));   // 突進中は、威力が 1.5 倍。猫系の連続攻撃は、1 回が小さい
            this.playerTakeDamage(mDmg, new THREE.Vector3(-nx, 0, -nz), monster.isDashing ? 2.0 : 1.0, monster);   // 突進は、大きく吹き飛ばす
            this.notifyEnemyEngaged(monster);
        }
    },

    // 高い所から落ちたときのダメージ（levels: 落ちた段の数。1 段の段差は、落下にしない）
    applyHeightFall(levels) {
        if (this.nav?.busy) return;   // マップ間の移動中は、ダメージなし
        const dmg = Math.round((levels - 1) * this.fallDamagePerLevel);
        if (dmg <= 0) return;
        this.player.hp = Math.max(0, this.player.hp - dmg);
        this.sound.playHurt();
        this.flashDamageScreen();
        this.particles.spawnBurst(this.player.x, this.player.floorY ?? 0, this.player.z, 0xb08d58, 16, 4.0);
        this.addPopup(`高所から落下！ -${dmg}`, '#ef4444');
        if (this.player.hp <= 0) {
            this.addPopup('GAME OVER! 崖から落ちて力尽きた…', '#ef4444');
            setTimeout(() => {
                this.player.hp = this.player.maxHp; this.player.stamina = this.player.maxStamina; this.player.staminaExhausted = false;
                this.loadMap(this.currentMapId);
            }, 1500);
        }
    },

    // 地上の敵が、(x, z) へ進めないか: 崖（上り 2 段以上・下り 3 段以上）、毒沼・溶岩などのダメージ床
    monsterTerrainBlocked(m, x, z) {
        if (this.heightMap && !groundStepOk((px, pz) => this.heightLevelAt(px, pz, this.levelOfFloorY(m.floorY)), m.x, m.z, x, z)) return true;
        for (const t of this.terrainGrid) {
            if (t.damagePerSec > 0 && x >= t.minX && x <= t.maxX && z >= t.minZ && z <= t.maxZ) return true;
        }
        return false;
    },

    // プレイヤーが、高さ floorY の物と、同じ床にいるか（高台の宝箱を、崖の下から開けない）。段差 1 段までは、同じ床（隣のマスの階段の 1 段目から、など）。2 段以上は、別の床
    sameFloorAs(floorY) {
        return Math.abs((this.player.floorY ?? 0) - (floorY ?? 0)) <= (this.heightStep ?? 1) * 1.1;
    },
};
