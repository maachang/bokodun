// 戦闘・魔法・飛び道具・被弾・状態異常・落下・経験値。GameEngine のメソッド（this は GameEngine。game.js が、クラスの定義のあとで、GameEngine.prototype へ組み込む）。
// 元は game.js の GameEngine のメソッド。移しただけで、動きは同じ（game.js が長すぎて、編集の誤りが増えるため分割した）
import * as THREE from '/js/three.module.js';
import { Projectile, Monster } from '/js/entities.js';
import { HIT_FEEDBACK } from '/js/game/constants.js';

export const combatMethods = {
    // Space / F / クリック: 選択中の魔法スロットを使う。呪文は杖・ロッドの補正（威力・消費MP・間隔）を受け、弓は矢を放つ
    useMagic() {
        const item = this.getMagicItem();
        if (!item) return;
        if (this.player.magicCooldown > 0) return;
        if (this.player.status?.paralysis?.t > 0) return;   // 麻痺: 何もできない
        if (item.kind === 'spell' && this.player.status?.silence?.t > 0) {   // 沈黙: 呪文が使えない（弓は使える）
            this.player.magicCooldown = 0.5;
            this.addPopup('沈黙… 魔法が使えない', '#a78bfa');
            return;
        }

        if (item.kind === 'spell') {
            const focus = this.getFocusItem();
            const fcls = focus && this.weaponClasses[focus.weaponClass];
            const powerScale = (fcls?.spellPowerScale ?? 1) * (focus?.powerScale ?? 1);
            const mp = Math.ceil(item.mp * (fcls?.mpScale ?? 1));
            if (mp > 0 && this.player.mp < mp) {
                this.addPopup('MP不足!', '#38bdf8');
                return;
            }
            this.player.mp -= mp;
            this.player.magicCooldown = item.cooldown * (fcls?.cooldownScale ?? 1);
            if (item.type === 'strike') this.castStrike(item, powerScale);
            else this.shootProjectiles(item, powerScale);
        } else {
            const cls = this.weaponClasses[item.weaponClass];
            if (cls?.attack !== 'shoot') return;
            this.player.magicCooldown = cls.cooldown;
            this.shootArrow(item, cls);
        }
    },

    // プレイヤーの弾の、発射の高さを決める。起伏のあるマップでは、目の前（正面の ±25 度）の最も近い敵へ、
    //   上下にも狙いをつける（高い所から、低い所の敵へ撃ち下ろす／低い所から、高い所の敵へ撃ち上げる）。敵がいなければ、水平に飛ぶ
    aimProjectileHeight(p, dirX, dirZ) {
        const y0 = this.getFloorHeight(this.player.x, this.player.z, this.player.heightLevel) + 1.3;
        let vy = 0;
        if (this.heightMap || this.monsters.some(m => m.flying)) {
            let best = null, bestD = 40;
            for (const m of this.monsters) {
                if (!m.active) continue;
                const dx = m.x - this.player.x, dz = m.z - this.player.z;
                const d = Math.hypot(dx, dz);
                if (d < 0.5 || d >= bestD) continue;
                if ((dx * dirX + dz * dirZ) / d < Math.cos(25 * Math.PI / 180)) continue;   // 正面の外
                best = m; bestD = d;
            }
            if (best) {
                const ty = (best.floorY ?? 0) + (best.baseY ?? 0) + 0.9;   // 敵の胴の高さ（飛んでいる敵は、飛んでいる高さ）
                vy = (ty - y0) / (bestD / p.speed);
            }
        }
        p.setHeight(y0, vy);
    },

    // 弓: 重力で落ちる矢を放つ（MP 不要。射程はクラスの range）
    shootArrow(item, cls) {
        const dirX = -Math.sin(this.player.angle);
        const dirZ = -Math.cos(this.player.angle);
        const damage = Math.floor(this.playerAttackPower() * cls.damageScale * (item.powerScale ?? 1) + Math.random() * (item.randomBonus ?? 0));
        const arrow = new Projectile(this.player.x + dirX * 0.8, this.player.z + dirZ * 0.8, dirX, dirZ, true, cls.projectileSpeed, damage, {
            type: 'arrow',
            maxDistance: cls.range
        });
        arrow.label = cls.name;
        this.aimProjectileHeight(arrow, dirX, dirZ);
        this.projectiles.push(arrow);
        this.scene.add(arrow.mesh);
        this.sound.playBowShoot();
    },

    // 飛び道具（ファイア・拡散弾・マジックボルト）: count 発を spreadDeg 間隔の扇状に発射
    shootProjectiles(w, powerScale = 1.0) {
        this.sound.playSpellShoot(w.sound);

        const count = w.count || 1;
        const spreadRad = (w.spreadDeg || 0) * Math.PI / 180;
        let spawnX = this.player.x;
        let spawnZ = this.player.z;

        for (let i = 0; i < count; i++) {
            const angle = this.player.angle + (i - (count - 1) / 2) * spreadRad;
            const dirX = -Math.sin(angle);
            const dirZ = -Math.cos(angle);

            // Spawn fireball slightly ahead of player
            spawnX = this.player.x + dirX * 0.8;
            spawnZ = this.player.z + dirZ * 0.8;

            const fireball = new Projectile(spawnX, spawnZ, dirX, dirZ, true, w.speed, Math.floor(w.damage * powerScale), {
                visual: w.visual,
                status: w.status,
                pierce: w.pierce,
                label: w.name,
                soundKind: w.sound,
                element: w.element
            });
            this.aimProjectileHeight(fireball, dirX, dirZ);
            this.projectiles.push(fireball);
            this.scene.add(fireball.mesh);
        }

        // Muzzle flare effect
        this.particles.spawnBurst(spawnX, 1.3, spawnZ, new THREE.Color(w.visual?.muzzle ?? '#ffaa00').getHex(), 8, 3.0);
    },

    // プレイヤーの弾（魔法・矢）が敵に当たったときの処理: ダメージ・状態異常・効果音・貫通。弾が消費されたら true
    hitMonsterWithProjectile(p, m) {
        const isArrow = (p.type === 'arrow');
        if (isArrow) this.sound.playArrowHit(); else this.sound.playSpellHit(p.soundKind ?? 'fire');
        const hitColor = isArrow ? 0xd4d4d8 : new THREE.Color(p.visual?.hit ?? '#ff5500').getHex();
        this.particles.spawnBurst(p.x, p.y, p.z, hitColor, isArrow ? 8 : 16, isArrow ? 2.5 : 5.0);

        if (!isArrow && m.isImmuneTo(p.element)) {
            // 魔法が効かない敵（ガーゴイルなど）: ダメージ 0・状態異常なし。弾は消える（貫通しない）
            this.addPopup('魔法は効かない!', '#94a3b8', m.x, m.z);
            this.notifyEnemyEngaged(m);
            p.hitMonsters.add(m);
            p.active = false;
            return true;
        }
        const isDead = m.takeDamage(p.damage, { x: p.dirX, z: p.dirZ, magic: !isArrow });
        this.addPopup(m.lastBlocked ? 'ガード!' : `${p.label || 'ファイア'}! -${p.damage}`, m.lastBlocked ? '#94a3b8' : '#f97316', m.x, m.z);
        if (!isDead && p.status && m.applyStatus(p.status)) {
            this.addPopup(p.status.type === 'burn' ? '燃焼!' : '鈍足!', p.status.type === 'burn' ? '#fb923c' : '#7dd3fc', m.x, m.z);
        }
        this.notifyEnemyEngaged(m);
        if (isDead) this.gainExp(m.exp);

        // 貫通: 残り体数があれば弾は消えずに先へ進む（同じ敵に二重ヒットしない）
        p.hitMonsters.add(m);
        p.hitsLeft--;
        if (p.hitsLeft <= 0) p.active = false;
        return !p.active;
    },

    // 燃焼の継続ダメージを受け取って与える（倒したら経験値）
    processBurn(m) {
        const burn = m.consumeBurnDamage();
        if (burn <= 0 || !m.active) return;
        const isDead = m.takeDamage(burn, null);
        this.addPopup(`燃焼 -${burn}`, '#fb923c', m.x, m.z);
        if (isDead) this.gainExp(m.exp);
    },

    // 落下系の魔法（爆発火球）: 前方 targetDistance の地面を狙い（手前に壁があればその直前）、予告の輪 → 着弾の範囲ダメージ → 火柱
    castStrike(spell, powerScale = 1.0) {
        const dirX = -Math.sin(this.player.angle);
        const dirZ = -Math.cos(this.player.angle);

        // 壁・柱など弾を止めるものがあれば、その直前を着弾点にする
        let dist = spell.targetDistance;
        for (let d = 1.0; d <= spell.targetDistance; d += 0.25) {
            const x = this.player.x + dirX * d;
            const z = this.player.z + dirZ * d;
            if (this.colliders.some(c => !c.disabled && c.blocksProjectiles !== false && x >= c.minX && x <= c.maxX && z >= c.minZ && z <= c.maxZ)) {
                dist = Math.max(0.8, d - 0.3);
                break;
            }
        }
        const tx = this.player.x + dirX * dist;
        const tz = this.player.z + dirZ * dist;
        const damage = Math.floor(spell.damage * powerScale);

        this.sound.playStrikeWhistle(spell.warnTime); // 「ぴゅーーーん」（予告の間に鳴る）→ 着弾で「ばーーん」
        this.strikeEffects.schedule(tx, tz, {
            radius: spell.blastRadius,
            warnTime: spell.warnTime,
            pillarTime: spell.pillarTime,
            smokeTime: spell.smokeTime ?? 0,
            onImpact: () => this.blastAt(tx, tz, spell.blastRadius, damage, spell.element)
        });
    },

    // 着弾の範囲ダメージ: 中心から半径 radius 内の敵すべてに damage（ノックバックは中心から外向き）
    blastAt(x, z, radius, damage, element = null) {
        this.sound.playBigExplosion();
        this.particles.spawnBurst(x, 0.8, z, 0xff5500, 40, 7.0);
        this.particles.spawnBurst(x, 1.5, z, 0xffdd33, 24, 4.5);

        for (const m of this.monsters) {
            if (!m.active) continue;
            const dx = m.x - x;
            const dz = m.z - z;
            const dist = Math.hypot(dx, dz);
            if (dist > radius + m.radius) continue;
            const nx = dist > 0.001 ? dx / dist : 0;
            const nz = dist > 0.001 ? dz / dist : 1;
            if (m.isImmuneTo(element)) {   // 魔法が効かない敵: ダメージ 0
                this.addPopup('魔法は効かない!', '#94a3b8', m.x, m.z);
                this.notifyEnemyEngaged(m);
                continue;
            }
            const isDead = m.takeDamage(damage, { x: nx, z: nz });
            this.requestHitStop(HIT_FEEDBACK.hitStop.blast);
            this.addPopup(`爆発! -${damage}`, '#f97316', m.x, m.z);
            this.notifyEnemyEngaged(m);
            if (isDead) this.gainExp(m.exp);
        }
    },

    // 弾が、地面（崖の面・斜面）・吊橋の床にぶつかっているか。吊橋のマスは、弾の高さに近い層を地面とし、
    //   橋の下から上へ撃った弾は、橋の床（厚み）に当たって消える
    projectileHitsGround(p) {
        if (p.y < this.getFloorHeight(p.x, p.z, this.levelOfFloorY(p.y))) return true;
        const ts = this.mapData?.tileSize || 4;
        const r = Math.floor(p.z / ts), c = Math.floor(p.x / ts);
        if (this.bridgeCells?.has(`${r},${c}`)) {
            const deckY = this.heightLevelAtTile(r, c) * this.heightStep;
            if (p.y >= deckY - 0.4 && p.y <= deckY) return true;
        }
        return false;
    },

    // 敵に、ゲーム側の処理（地形・召喚・範囲攻撃）をつなぐ
    attachMonsterHooks(m) {
        m.terrainBlock = (mm, x, z) => this.monsterTerrainBlocked(mm, x, z);   // 地上の敵は、崖・毒沼へ進まない
        m.summonHook = (owner, type, max) => this.summonMinion(owner, type, max);
        m.slamHook = (owner, pos, radius, mult) => this.slamAttack(owner, pos, radius, mult);
    },

    // 召喚: 敵（owner）が、仲間（type）を 1 体、近くに呼ぶ。呼んだ数（生きている手下）が max 以上なら、呼ばない
    summonMinion(owner, type, max) {
        const alive = this.monsters.filter(x => x.active && x.minionOf === owner).length;
        if (alive >= max) return null;
        const def = this.enemyDefinitions?.[type];
        if (!def) return null;
        for (let i = 0; i < 8; i++) {
            const a = Math.random() * Math.PI * 2, r = 2.2 + Math.random() * 1.2;
            const x = owner.x + Math.cos(a) * r, z = owner.z + Math.sin(a) * r;
            if (this.isInsideWall(x, z) || this.monsterTerrainBlocked({ x: owner.x, z: owner.z }, x, z)) continue;
            const m = new Monster(type, x, z, this.textures, { ...def, id: type });
            m.floorY = this.getFloorHeight(x, z);
            m.sprite.position.set(x, m.floorY, z);
            m.minionOf = owner;
            m.state = 'chase'; m.lostTimer = 0; m.appearAlpha = 1; m.spriteMat.opacity = 1;
            this.attachMonsterHooks(m);
            this.monsters.push(m);
            this.scene.add(m.sprite);
            this.particles.spawnBurst(x, m.floorY + 1.0, z, 0xa855f7, 12, 3.0);
            this.addPopup(`${owner.name}が、仲間を呼んだ！`, '#c084fc', owner.x, owner.z);
            return m;
        }
        return null;
    },

    // 範囲攻撃: 予兆の輪（pos を中心に、半径 radius）の中に、プレイヤーがいれば、ダメージを与える
    slamAttack(owner, pos, radius, mult) {
        this.particles.spawnBurst(pos.x, (this.player.floorY ?? 0) + 0.3, pos.z, 0xef4444, 24, 5.0);
        this.sound.playBigExplosion?.();
        const d = Math.hypot(this.player.x - pos.x, this.player.z - pos.z);
        if (d <= radius && !this.player.isFalling) {
            const dmg = Math.max(1, Math.floor(owner.attackPower * mult));
            const k = d > 0.01 ? new THREE.Vector3((this.player.x - pos.x) / d, 0, (this.player.z - pos.z) / d) : new THREE.Vector3(0, 0, 0);
            this.addPopup(`範囲攻撃! -${dmg}`, '#ef4444');
            this.playerTakeDamage(dmg, k, 1.2, owner);
        }
    },

    // 攻撃力（呪いの間は、下がる）
    playerAttackPower() {
        const c = this.player.status?.curse;
        return this.player.attackPower * (c?.t > 0 ? (c.scale ?? 0.7) : 1);
    },

    // プレイヤーを状態異常にする。type: poison / burn / slow / paralysis / silence / curse。すでに同じ状態なら、長いほうの時間にする
    applyPlayerStatus(type, opt = {}) {
        const names = { poison: '毒', burn: '火傷', slow: '鈍足', paralysis: '麻痺', silence: '沈黙', curse: '呪い' };
        const colors = { poison: '#a3e635', burn: '#fb923c', slow: '#60a5fa', paralysis: '#fde047', silence: '#a78bfa', curse: '#c084fc' };
        this.player.status ??= {};
        const cur = this.player.status[type];
        const t = opt.t ?? 4;
        const fresh = !(cur?.t > 0);
        this.player.status[type] = { ...opt, t: Math.max(cur?.t ?? 0, t), tick: cur?.tick ?? 0.5 };
        if (fresh) this.addPopup(`${names[type] ?? type}！`, colors[type] ?? '#ffffff');
        return fresh;
    },

    // 状態異常の経過（毎フレーム）: 毒・火傷は、0.5 秒ごとに継続ダメージ。時間が切れたら、治る
    updatePlayerStatus(dt) {
        const st = this.player.status;
        if (!st) return;
        for (const type of Object.keys(st)) {
            const e = st[type];
            e.t -= dt;
            if (e.t <= 0) { delete st[type]; continue; }
            if ((type === 'poison' || type === 'burn') && e.dps) {
                e.tick -= dt;
                if (e.tick <= 0) {
                    e.tick += 0.5;
                    const dmg = Math.max(1, Math.round(e.dps * 0.5));
                    this.player.hp = Math.max(0, this.player.hp - dmg);
                    this.sound.playHurt?.();
                    this.particles.spawnBurst(this.player.x, (this.player.floorY ?? 0) + 1.0, this.player.z, type === 'poison' ? 0xa3e635 : 0xfb923c, 4, 1.5);
                    if (this.player.hp <= 0) {
                        this.player.status = {};
                        this.addPopup(type === 'poison' ? 'GAME OVER! 毒で力尽きた…' : 'GAME OVER! 火傷で力尽きた…', '#ef4444');
                        setTimeout(() => { this.player.hp = this.player.maxHp; this.player.stamina = this.player.maxStamina; this.player.staminaExhausted = false; this.loadMap(this.currentMapId); }, 1000);
                        return;
                    }
                }
            }
        }
    },

    // 敵の攻撃が当たったとき: その敵の特徴（profile.inflict）に応じて、一定の確率で、状態異常にする。生命力を吸う敵は、与えたダメージの一部を回復する
    onPlayerHitBy(monster, damage) {
        const pr = monster?.profile;
        if (!pr) return;
        // 盗む: お金の一部を盗んで、逃げる（倒すと、取り返せる）
        if (pr.steal && !monster.fleeing && (this.player.gold ?? 0) > 0) {
            const amount = Math.min(this.player.gold, Math.max(5, Math.floor(this.player.gold * 0.2)));
            this.player.gold -= amount; monster.stolenGold += amount; monster.fleeing = true;
            this.addPopup(`ゴールドを盗まれた！ -${amount}G`, '#facc15');
        }
        for (const f of pr.inflict ?? []) {
            if (Math.random() < f.chance) this.applyPlayerStatus(f.type, f);
        }
        if (pr.lifesteal > 0 && damage > 0) monster.hp = Math.min(monster.maxHp, monster.hp + damage * pr.lifesteal);
    },

    updateCombat(dt) {
        undefinedVariableForTest.x = 1;
        // 群れ（pack）: 仲間の 1 体が、プレイヤーを見つけたら、近くの仲間も、すぐ追ってくる
        this.packTimer = (this.packTimer ?? 0) - dt;
        if (this.packTimer <= 0) {
            this.packTimer = 0.5;
            for (const a of this.monsters) {
                if (!a.active || a.state !== 'chase' || !a.profile?.pack) continue;
                for (const b of this.monsters) {
                    if (b === a || !b.active || b.state === 'chase' || !b.profile?.pack) continue;
                    // 狼（relentless）は、追っている間、離れた仲間まで呼び寄せる（逃げると、列になって追ってくる）。縄張りのある敵（クマ・鳥）は、仲間を呼ばない
                    const joinR = a.profile.relentless ? a.profile.relentless.joinRadius : 16;
                    if (b.profile?.territory && b.profile.territory.mode !== 'roam') continue;
                    if (Math.hypot(a.x - b.x, a.z - b.z) < joinR) { b.state = 'chase'; b.lostTimer = 0; }
                }
            }
        }
        for (let i = this.monsters.length - 1; i >= 0; i--) {
            const m = this.monsters[i];
            m.floorY = this.getFloorHeight(m.x, m.z, this.levelOfFloorY(m.floorY));
            m.update(dt, this.player, this.colliders, this.projectiles, this.sound, this.scene, this.visibility ?? 1.0);
            this.processBurn(m);

            // Check collision with player for Ys-style bump attack
            const dx = m.x - this.player.x;
            const dz = m.z - this.player.z;
            const dist = Math.hypot(dx, dz);
            const bumpThreshold = this.player.radius + m.radius;

            // 倒れている最中の敵は攻撃も当たり判定もしない。飛んでいる敵・高低差のある相手とは、高さが合っているときだけ、ぶつかる
            const vDiff = ((m.floorY ?? 0) + (m.baseY ?? 0) + 0.9) - ((this.player.floorY ?? 0) + 0.9);
            if (m.active && !m.untouchable && dist < bumpThreshold && Math.abs(vDiff) < 1.7 && this.player.attackCooldown <= 0) {
                this.resolveYsBump(m, dx, dz, dist);
            }

            if (!m.active) {
                // 死亡演出: 効果音・粒子を出しつつ、倒れて消えるアニメーションが終わってから削除する
                if (!m.deathStarted) {
                    m.deathStarted = true;
                    if (m.stolenGold > 0) { this.player.gold += m.stolenGold; this.addPopup(`ゴールドを取り返した！ +${m.stolenGold}G`, '#facc15'); m.stolenGold = 0; }
                    this.sound.playEnemyDeath();
                    this.particles.spawnBurst(m.x, 1.0, m.z, m.deathColor, 14, 3.5);
                }
                m.deathFxTimer -= dt;
                if (m.deathFxTimer <= 0 && m.deathTimer >= 0.1 && m.deathTimer < 1.2) {
                    m.deathFxTimer = 0.12;
                    this.particles.spawnBurst(m.x, 0.6, m.z, m.deathColor, 3, 2.0);
                }
                if (m.updateDeath(dt)) {
                    this.scene.remove(m.sprite);
                    this.monsters.splice(i, 1);
                }
            }
        }
    },

    // Classic Ys 1 "Half-Offset" Combat resolution
    requestHitStop(seconds) {
        this.hitStop = Math.max(this.hitStop, seconds);
    },

    shakeCamera(amp = HIT_FEEDBACK.shake.amp, duration = HIT_FEEDBACK.shake.duration) {
        this.cameraShake = { time: duration, duration, amp: Math.max(amp, this.cameraShake.time > 0 ? this.cameraShake.amp : 0) };
    },

    // 突進が敵に当たったときの手応え: 打撃音・ヒットストップ・（強い一撃なら）カメラの揺れ
    //   crit=半ずらし会心 / killed=撃破 / heavy=重い武器（大剣・メイス）
    playerHitFeedback({ crit, killed, heavy }) {
        const f = HIT_FEEDBACK;
        this.sound.playEnemyHit(crit || heavy);
        const base = killed ? f.hitStop.kill : (crit ? f.hitStop.crit : f.hitStop.charge);
        this.requestHitStop(base + (heavy ? f.hitStop.heavyBonus : 0));
        if (crit || killed || heavy) this.shakeCamera();
    },

    playerTakeDamage(amount, knockDir, knockScale = 1.0, source = null) {
        if (this.player.isInvincible) return;
        if (source) this.onPlayerHitBy(source, amount);   // 状態異常・生命力吸収
        if (this.player.climb) { this.player.climb = null; this.addPopup('手が離れた！', '#fbbf24'); }   // 登っている間に攻撃を受けたら、中断して、下に落ちる（目線の高さは、なめらかに下がる。落下のダメージはなし）

        this.player.hp = Math.max(0, this.player.hp - amount);
        this.player.isInvincible = true;
        this.player.invincibleTimer = 0.35;
        this.player.knockback.copy(knockDir).multiplyScalar(8 * knockScale);

        this.sound.playHurt();
        this.flashDamageScreen();

        if (this.player.hp <= 0) {
            this.addPopup('GAME OVER! リスポーンします', '#ef4444');
            setTimeout(() => {
                this.player.hp = this.player.maxHp; this.player.stamina = this.player.maxStamina; this.player.staminaExhausted = false;
                this.loadMap(this.currentMapId);
            }, 1000);
        }
    },

    // Trigger falling down the pitfall shaft
    triggerPlayerFall(crumbleObj) {
        if (this.player.isFalling) return;
        this.player.isFalling = true;
        this.player.fallDepth = 0;
        this.player.fallVelocityY = 1.0;
        this.player.fallTrapRef = crumbleObj;

        // Use the last confirmed safe position on solid ground before entering the pit trap
        this.player.fallRespawnPos = {
            x: this.player.lastSafePos.x,
            z: this.player.lastSafePos.z
        };

        this.sound.playFallingScream();
        this.addPopup('うわあああっ！奈落へ転落！', '#ef4444');
    },

    // Impact bottom of the pit, take damage and crawl back out
    finishPlayerFall() {
        if (!this.player.isFalling) return;
        this.player.isFalling = false;

        const dmg = this.player.fallTrapRef?.damage || 35;
        this.player.hp = Math.max(0, this.player.hp - dmg);
        this.sound.playHurt();
        this.sound.playFloorCollapse();
        this.flashDamageScreen();
        this.particles.spawnBurst(this.player.x, 0.2, this.player.z, 0xdc2626, 24, 6.0);
        this.addPopup(`針穴へ墜落！ -${dmg}`, '#ef4444');

        if (this.player.hp <= 0) {
            this.addPopup('GAME OVER! 奈落の底で力尽きた…', '#ef4444');
            setTimeout(() => {
                this.player.hp = this.player.maxHp; this.player.stamina = this.player.maxStamina; this.player.staminaExhausted = false;
                this.player.fallDepth = 0;
                this.player.fallVelocityY = 0;
                this.player.pitch = 0;
                this.loadMap(this.currentMapId);
            }, 1000);
            return;
        }

        // Fade black screen momentarily while crawling back to safety edge
        this.flashScreen('rgba(0, 0, 0, 0.95)');
        setTimeout(() => {
            if (this.player.fallRespawnPos) {
                this.player.x = this.player.fallRespawnPos.x;
                this.player.z = this.player.fallRespawnPos.z;
            }
            // Ensure safe distance from colliders
            const r = this.player.radius || 0.6;
            for (const c of this.colliders) {
                if (c.disabled) continue;
                if (this.player.x >= c.minX - r && this.player.x <= c.maxX + r &&
                    this.player.z >= c.minZ - r && this.player.z <= c.maxZ + r) {
                    // Push out to open side
                    const overlapLeft = (this.player.x + r) - c.minX;
                    const overlapRight = c.maxX - (this.player.x - r);
                    const overlapTop = (this.player.z + r) - c.minZ;
                    const overlapBottom = c.maxZ - (this.player.z - r);
                    const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);
                    if (minOverlap === overlapLeft) this.player.x = c.minX - r - 0.1;
                    else if (minOverlap === overlapRight) this.player.x = c.maxX + r + 0.1;
                    else if (minOverlap === overlapTop) this.player.z = c.minZ - r - 0.1;
                    else this.player.z = c.maxZ + r + 0.1;
                }
            }

            this.player.fallDepth = 0;
            this.player.fallVelocityY = 0;
            this.player.pitch = 0;
            this.addPopup('なんとか穴の縁へ這い上がった！', '#fef08a');
        }, 350);
    },

    // 襲撃者（ambush の住民）が、正体を現す: 住民を消し、同じ姿・同じ位置に、敵（ambush.enemy）を出して、すぐ襲いかからせる。
    //   見た目（絵・大きさ）は、住民のまま。倒すまで、ふつうの住民の姿で襲ってくる
    revealAmbusher(npc) {
        const type = npc.ambush.enemy;
        const def = this.enemyDefinitions?.[type];
        if (!def) return;
        const m = new Monster(type, npc.x, npc.z, this.textures, { ...def, id: type });
        m.spriteMat.map = npc.sprite.material.map;                 // 住民の絵のまま
        m.spriteMat.needsUpdate = true;
        m.sprite.scale.copy(npc.sprite.scale);
        m.baseScaleX = npc.sprite.scale.x; m.baseScaleY = npc.sprite.scale.y;
        m.scale = [npc.sprite.scale.x, npc.sprite.scale.y, 1];
        m.floorY = this.getFloorHeight(npc.x, npc.z);
        m.sprite.position.set(npc.x, m.floorY, npc.z);
        this.attachMonsterHooks(m);
        m.state = 'chase'; m.lostTimer = 0; m.appearAlpha = 1; m.spriteMat.opacity = 1;
        m.provokedTimer = 8;
        m.stun(0.45);   // 正体を現す一瞬の間
        this.monsters.push(m);
        this.scene.add(m.sprite);
        this.scene.remove(npc.sprite);
        const i = this.npcs.indexOf(npc);
        if (i >= 0) this.npcs.splice(i, 1);
        this.addPopup(npc.ambush.line, '#ef4444', npc.x, npc.z);
        this.sound.playHurt?.();
        this.particles.spawnBurst(npc.x, npc.floorY ?? 1.2, npc.z, 0xef4444, 10, 3.0);
    },

    notifyEnemyEngaged(monster) {
        if (!monster) return;
        this.activeEnemyCards = this.activeEnemyCards || [];

        // If monster already exists, remove it first so we can move it to the bottom (most recent)
        const idx = this.activeEnemyCards.findIndex(c => c.monster === monster);
        let cardData;

        if (idx !== -1) {
            cardData = this.activeEnemyCards.splice(idx, 1)[0];
            cardData.timer = 2.5; // Exactly 2.5 seconds display
            cardData.hp = Math.max(0, monster.hp);
        } else {
            cardData = {
                monster: monster,
                name: monster.name || 'モンスター',
                maxHp: monster.maxHp || 30,
                hp: Math.max(0, monster.hp),
                iconUrl: monster.iconUrl || '/images/enemies/slime/slime.png',
                timer: 2.5 // Exactly 2.5 seconds display
            };
        }

        // Add to the front of the array (bottom of the flex-direction: column-reverse stack)
        this.activeEnemyCards.unshift(cardData);

        // Limit stack to maximum 3 cards
        if (this.activeEnemyCards.length > 3) {
            this.activeEnemyCards.pop();
        }
    },

    gainExp(amount) {
        this.player.exp += amount;
        const nextLvExp = this.player.level * 40;
        if (this.player.exp >= nextLvExp) {
            this.player.level++;
            this.player.attackPower += 5;
            this.player.maxHp += 20;
            this.player.hp = this.player.maxHp;
            this.sound.playLevelClear();
            this.addPopup(`LEVEL UP! Lv.${this.player.level}`, '#34d399');
        }
    },
};
