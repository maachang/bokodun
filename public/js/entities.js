import * as THREE from '/js/three.module.js';
import { deriveProfile, diveHeight } from '/js/enemyBehavior.js';
import { aiBehaviors } from '/js/monster/aiBehaviors.js';

import { SENSE_DEFAULT_RANGE, SENSE_DEFAULT_ANGLE, SENSE_NEAR_DIST, SENSE_DRAW_SCALE, STEALTH_DRAW_MULT, HIT_FLASH_TIME, HIT_WHITE_TIME, APPEAR_FADE_TIME, STEALTH_FADE_BAND, LOST_TIME, DEATH_FLASH_TIME, DEATH_FALL_END, DEATH_DURATION } from '/js/monster/constants.js';

export class Monster {
    constructor(enemyType, x, z, textures, enemyDef = null) {
        this.type = enemyType;
        this.textures = textures;
        this.x = x;
        this.z = z;
        this.radius = enemyDef?.radius ?? 0.8;
        this.active = true;
        this.id = 'm_' + Math.random().toString(36).substring(2, 9);
        this.iconUrl = '/images/enemies/slime/slime.png';

        // 索敵パラメータ（敵の種類ごとに enemies.json で上書き）
        this.senseRange = SENSE_DEFAULT_RANGE;
        this.senseAngle = SENSE_DEFAULT_ANGLE;
        this.alwaysAware = false;
        this.stealth = 'normal';
        this.deathColor = 0xffffff; // 死亡時の粒子の色（enemies.json の deathColor で上書き）
        this.profile = null;        // 敵の特徴（deriveProfile の結果）
        this.flying = false;        // 空を飛ぶ（川・崖・毒沼に関係なく動き、見えなくても感知する）
        this.shootSpeed = null;     // 遠距離攻撃の弾の速さ・威力（null は、種類ごとの既定）
        this.shootDamage = null;
        this.terrainBlock = null;   // 地上の敵が、その位置へ行けないか（崖・毒沼）を返す関数。game.js が入れる

        if (enemyDef) {
            this.senseRange = enemyDef.senseRange ?? SENSE_DEFAULT_RANGE;
            this.senseAngle = enemyDef.senseAngle ?? SENSE_DEFAULT_ANGLE;
            this.alwaysAware = !!enemyDef.alwaysAware;
            if (enemyDef.stealth in STEALTH_DRAW_MULT) this.stealth = enemyDef.stealth;
            if (enemyDef.deathColor) this.deathColor = new THREE.Color(enemyDef.deathColor).getHex();
            this.name = enemyDef.name || 'モンスター';
            this.maxHp = enemyDef.maxHp || 30;
            this.hp = this.maxHp;
            this.speed = enemyDef.speed ?? 1.5; // 0 を指定した場合は 0（動かない）として扱う
            this.baseSpeed = this.speed;
            this.attackPower = enemyDef.attackPower || 10;
            this.exp = enemyDef.exp || 20;
            this.canShoot = !!enemyDef.canShoot;
            this.shootType = enemyDef.shootType || 'magic';
            this.shootCooldown = enemyDef.shootCooldown || 99999;
            this.shootTimer = this.canShoot ? Math.random() * 2 : 0;
            this.shootRange = enemyDef.shootRange || 15;
            this.maxArrowDistance = enemyDef.maxArrowDistance || 13;
            this.aiType = enemyDef.aiType || (this.canShoot ? 'ranged_maintain' : 'walk_chase');
            // 敵の特徴（飛ぶ・突進・大ジャンプ・遠距離攻撃・群れ・怒り・逃走・回避・再生）を、能力や個別の指定から決める
            this.profile = deriveProfile({ ...enemyDef, id: enemyDef.id ?? enemyType });
            this.aiType = this.profile.aiType;
            this.flying = this.profile.flying;
            if (this.profile.relentless) {   // 狼: 一定の、そこそこ速い速さ。索敵範囲は、ふつうの敵の倍（相当しつこい）
                this.speed = Math.max(this.speed, this.profile.relentless.speed);
                this.baseSpeed = this.speed;
                this.senseRange *= this.profile.relentless.senseScale ?? 1;
            }
            if (this.profile.shoot) {
                const sh = this.profile.shoot;
                this.canShoot = true;
                this.shootType = sh.type;
                this.shootRange = sh.range;
                this.shootCooldown = sh.cooldown;
                this.shootSpeed = sh.speed;
                this.shootDamage = sh.damage;
                if (!enemyDef.canShoot) this.shootTimer = Math.random() * 2;
            }
            
            // texture 未指定で imageFile がある敵は、敵の type（id）をテクスチャキーにして、imageFile から読み込む
            const texKey = enemyDef.texture || (enemyDef.imageFile ? enemyType : 'slime');
            // Explicitly resolve texture with dynamic fallback creation if not pre-initialized
            let textureObj = textures[texKey];
            if (!textureObj) {
                const loader = new THREE.TextureLoader();
                const enemyImgFile = enemyDef.imageFile || `${enemyType}.png`;
                textureObj = loader.load(`/images/enemies/${enemyImgFile}?v=${Date.now()}`);
                textureObj.magFilter = THREE.NearestFilter;
                textureObj.minFilter = THREE.NearestFilter;
                textures[texKey] = textureObj;
            }

            this.spriteMat = new THREE.SpriteMaterial({ map: textureObj, transparent: true });
            this.scale = enemyDef.scale ? [...enemyDef.scale] : [2.2, 2.0, 1];
            this.y = enemyDef.y ?? 1.0;

            // Resolve HUD icon URL dynamically or by map
            const iconMap = {
                goblinArcher: '/images/enemies/demihuman/goblin_archer.png',
                goblin: '/images/enemies/demihuman/goblin_mage.png',
                skeleton: '/images/enemies/undead/skeleton.png',
                mimic: '/images/enemies/golem/mimic.png',
                tarantulaSwamp: '/images/enemies/insect/tarantula_swamp.png',
                parasiteWasp: '/images/enemies/insect/parasite_wasp.png',
                mariaMosquito: '/images/enemies/insect/maria_mosquito.png',
                acidWorm: '/images/enemies/insect/acid_worm.png',
                poisonMoth: '/images/enemies/insect/poison_moth.png',
                poisonToad: '/images/enemies/reptile/poison_toad.png',
                slime: '/images/enemies/slime/slime.png'
            };

            this.iconUrl = iconMap[texKey] || (enemyDef.imageFile ? `/images/enemies/${enemyDef.imageFile}` : `/images/enemies/${enemyType}.png`);
        } else {
            // Fallback for compatibility
            if (enemyType === 'S' || enemyType === 'slime') {
                this.name = 'スライム';
                this.maxHp = 30;
                this.hp = 30;
                this.speed = 1.6;
                this.attackPower = 8;
                this.exp = 15;
                this.shootCooldown = 99999;
                this.canShoot = false;
                this.spriteMat = new THREE.SpriteMaterial({ map: textures.slime, transparent: true });
                this.scale = [2.2, 2.0, 1];
                this.y = 1.0;
                this.iconUrl = '/images/enemies/slime/slime.png';
            } else if (enemyType === 'K' || enemyType === 'skeleton') {
                this.name = 'スケルトン剣士';
                this.maxHp = 60;
                this.hp = 60;
                this.speed = 2.0;
                this.attackPower = 14;
                this.exp = 40;
                this.shootCooldown = 99999;
                this.canShoot = false;
                this.spriteMat = new THREE.SpriteMaterial({ map: textures.skeleton, transparent: true });
                this.scale = [2.4, 2.5, 1];
                this.y = 1.25;
                this.iconUrl = '/images/enemies/undead/skeleton.png';
            } else {
                this.name = 'ゴブリンアーチャー';
                this.maxHp = 45;
                this.hp = 45;
                this.speed = 1.1;
                this.attackPower = 10;
                this.exp = 35;
                this.shootCooldown = 2.2;
                this.shootTimer = Math.random() * 2;
                this.canShoot = true;
                this.shootType = 'arrow';
                this.shootRange = 14;
                this.maxArrowDistance = 13;
                this.spriteMat = new THREE.SpriteMaterial({ map: textures.goblin, transparent: true });
                this.scale = [2.3, 2.6, 1];
                this.y = 1.3;
                this.iconUrl = '/images/enemies/demihuman/goblin_archer.png';
            }
        }

        this.sprite = new THREE.Sprite(this.spriteMat);
        this.sprite.center.set(0.5, 0.0); // Anchor directly to the ground!
        this.sprite.scale.set(this.scale[0], this.scale[1], this.scale[2]);
        this.sprite.position.set(this.x, 0.0, this.z);

        this.knockback = new THREE.Vector3();
        this.hitTimer = 0;

        // 索敵状態: 'unaware'(未発見: 感知距離を超えると描画されない) / 'chase'(発見済み: 常に描画)
        this.state = this.alwaysAware ? 'chase' : 'unaware';
        this.facing = Math.random() * Math.PI * 2; // 正面方向（atan2(dx, dz) 基準）
        this.lostTimer = 0;

        // 死亡演出の状態
        this.deathStarted = false;  // game.js 側で効果音・初期の粒子を出したか
        this.deathTimer = 0;
        this.deathFxTimer = 0;
        this.deathTiltDir = 1;      // 横倒しの向き（1 / -1）

        this.appearAlpha = this.alwaysAware ? 1 : 0; // 現在の透明度（現れるとき 0→1 へフェードイン。ミミックは最初から見える）
        this.spriteMat.opacity = this.appearAlpha;
        this.sprite.visible = this.appearAlpha > 0;
        // 状態異常: 燃焼（毎秒の継続ダメージ）・鈍足（AI の進行速度が落ちる）
        this.burnTimer = 0;
        this.burnDps = 0;
        this.burnTick = 0;
        this.pendingBurn = 0;       // まだ game.js が受け取っていない燃焼ダメージ（倒したときの経験値処理のため game.js 側で takeDamage する）
        this.slowTimer = 0;
        this.slowScale = 1;
        this.stunTimer = 0;         // スタン中（メイスなど）は AI（移動・攻撃・射撃）が止まる

        // Pattern & animation states
        this.aiTimer = Math.random() * 2.0;
        this.baseScaleX = this.scale[0];
        this.baseScaleY = this.scale[1];
        this.baseY = 0.0;
        this.floorY = 0;   // 立っている地面の高さ（起伏のあるマップで、game.js が毎フレーム入れる）
        this.isLeaping = false;
        this.leapVelocityY = 0;
        this.leapTargetDir = { x: 0, z: 0 };
        // 特徴による動きの状態
        this.enraged = false;       // 怒り（体力が半分を切ると、速くなる）
        this.evadeTimer = 2 + Math.random() * 2;   // 回避（横へ跳ぶ）までの時間
        this.diveState = 'approach';   // 飛ぶ敵: approach(接近) / dive(急降下) / climb(上昇)
        this.diveTimer = 0;
        this.diveCooldown = 1.0 + Math.random();
        this.diveDir = { x: 0, z: 0 };
        this.chargeState = 'walk';     // 突進: walk / windup(溜め) / dash(突進) / rest / stun
        this.chargeTimer = 0;
        this.chargeCooldown = 1.0 + Math.random();
        this.chargeDir = { x: 0, z: 0 };
        this.chargeDist = 0;
        this.isDashing = false;        // 突進中（当たると、ダメージ・ノックバックが大きい）
        this.hopRest = 0;              // 大ジャンプの着地後の休み
        this.cloaked = !!this.profile?.ambushHide;   // 猫系・潜る・待ち伏せ: 姿を消している（隠密）
        this.hitScale = 1;             // 攻撃の威力の倍率（猫系の連続攻撃は、1 回が小さい）
        this.catState = 'stalk';       // 猫系: stalk(狙う) / flurry(近くで連続攻撃) / away(離れる)
        this.catTimer = 0;
        this.awayHops = 0;
        this.damageTakenScale = 1;     // 受けるダメージの倍率（イノシシが、突進をよけられて息切れしている間は、大きくなる）
        this.dashHit = false;          // 今回の突進が、プレイヤーに当たったか（game.js が立てる）
        this.summonTimer = 4 + Math.random() * 4;   // 召喚: 次に仲間を呼ぶまで
        this.summonHook = null;        // game.js が入れる: (owner, 種類, 最大数) → 仲間を出す
        this.slamHook = null;          // game.js が入れる: (owner, 位置, 半径, 威力の倍率) → 範囲攻撃を当てる
        this.slamState = 'idle'; this.slamTimer = 0; this.slamCool = 3 + Math.random() * 3; this.slamPos = null; this.slamMesh = null; this.slamScene = null;
        this.blinkState = 'idle'; this.blinkTimer = 3 + Math.random() * 3;   // 瞬間移動
        this.burrowState = 'up'; this.burrowTimer = 0;   // 潜る: up(地上) / under(地中)
        this.untouchable = false;      // 地中にいる間は、攻撃も受けず、ぶつかりもしない
        this.ambushHidden = !!this.profile?.ambushHide;   // 待ち伏せ: 姿を隠して動かない
        this.ambushBoost = 0;          // 不意打ちの威力 1.5 倍の残り時間
        this.fleeing = false;          // 盗んで逃げている
        this.stolenGold = 0;           // 盗んだお金（倒すと、取り返せる）
        this.lastBlocked = false;      // 直前の攻撃を、ガードで防いだか
        this.raptorState = 'climb';    // 猛禽: climb(舞い上がり・旋回) / glide(滑空攻撃) / recover(隙)
        this.raptorTimer = 0;
        this.raptorRecover = 1.8;
        this.rushState = 'chase';      // クマ: chase(近づく) / rush(連打) / recover(間)
        this.rushTimer = 0;
        this.homeX = x;                // 生まれた場所（縄張り・巡回の中心）
        this.homeZ = z;
        this.provokedTimer = 0;        // 攻撃されてから、縄張りの外でも追う時間
        this.idleTimer = 0;
        this.idleTarget = null;
        this.patrolAngle = Math.random() * Math.PI * 2;
    }

    update(dt, player, colliders, projectiles, soundFx, scene, visibility = 1.0) {
        if (!this.active) return;

        this.updateStatus(dt);

        // Knockback decay
        if (this.knockback.lengthSq() > 0.001) {
            this.x += this.knockback.x * dt;
            this.z += this.knockback.z * dt;
            this.knockback.multiplyScalar(Math.max(0, 1 - dt * 10));
        }

        // Hit flash: blink red and visible
        if (this.hitTimer > 0) {
            // 被弾の瞬間は白く光り（ヒットの手応え）、その後は赤みがかって元に戻る
            this.spriteMat.color.setRGB(...(this.hitTimer > HIT_FLASH_TIME - HIT_WHITE_TIME ? [2.5, 2.5, 2.5] : [1, 0.2, 0.2]));
            this.hitTimer -= dt;
            this.sprite.visible = true;
        } else {
            // 状態異常の色: 燃焼=赤み / 鈍足=青み
            const burning = this.burnTimer > 0, slowed = this.slowTimer > 0;
            const en = this.enraged ? 0.7 : 1;   // 怒り: 赤みがかる
            this.spriteMat.color.setRGB(slowed ? 0.6 : 1, (burning ? 0.6 : (slowed ? 0.85 : 1)) * en, (burning ? 0.5 : (slowed ? 1.2 : 1)) * en);
            this.sprite.visible = true;
        }

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

        // スタン中は AI（移動・攻撃・射撃）を止める
        if (this.stunTimer > 0) {
            this.stunTimer -= dt;
            this.sprite.position.set(this.x, this.baseY + this.floorY, this.z);
            return;
        }

        // 鈍足: AI の時間の進みを遅くして、移動・攻撃・射撃・アニメーションをまとめてゆっくりにする
        if (this.slowTimer > 0) dt *= this.slowScale;
        this.shakeX = 0;   // 震え（突進の溜め）は、毎フレーム、溜めの間だけ入れ直す

        // 縄張りのある敵が、プレイヤーを追っていない間の動き: 守る（クマ: 縄張りの中をうろつく）／巡回する（鳥: 範囲を飛び回る）
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
            return;
        }

        // 待ち伏せ: 姿を隠して動かず、近づかれた瞬間に、不意打ちで襲いかかる
        if (this.ambushHidden) {
            if (dist <= (this.profile.ambushHide?.reveal ?? 4.5)) {
                this.ambushHidden = false; this.cloaked = false; this.state = 'chase'; this.lostTimer = 0;
                this.ambushBoost = 1.5; this.hitScale = 1.5;   // 最初の 1.5 秒は、威力 1.5 倍
                this.stun(0.2);
            } else {
                this.sprite.position.set(this.x, this.baseY + this.floorY, this.z);
                return;
            }
        }
        if (this.ambushBoost > 0) { this.ambushBoost -= dt; if (this.ambushBoost <= 0) this.hitScale = 1; }

        // 特徴による動きの変化: 再生・怒り・逃走・回避
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
                    return;
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
                return;
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

        // =========================================================================
        // Distinct Movement AI Patterns
        // =========================================================================
        const behave = aiBehaviors[this.aiType] ?? aiBehaviors.walk_chase;
        if (behave) behave.call(this, { colliders, dirX, dirZ, dist, dt, player });

        // Apply vertical position (hopping / leaping height)
        this.sprite.position.y = this.baseY + this.floorY;

        // Projectile shooting logic for Archer / Mage
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

        this.sprite.position.x = this.x + (this.shakeX || 0);
        this.sprite.position.z = this.z;
    }

    // 範囲攻撃の予兆（赤い輪）を消す
    clearSlam() {
        if (this.slamMesh) {
            this.slamMesh.parent?.remove(this.slamMesh);
            this.slamMesh.geometry.dispose?.(); this.slamMesh.material.dispose?.();
            this.slamMesh = null;
        }
        this.slamState = 'idle';
    }

    // 壁だけ（崖・毒沼は無視）の判定。地中を進む敵が使う
    checkWallCollisionOnly(x, z, colliders) {
        for (const c of colliders) {
            if (c.disabled) continue;
            if (x >= c.minX - this.radius && x <= c.maxX + this.radius && z >= c.minZ - this.radius && z <= c.maxZ + this.radius) return true;
        }
        return false;
    }

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
    }

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
    }

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
    }

    // 状態異常をかける。新しくかかったとき true（すでにかかっている場合は持続時間を延長するだけ）
    applyStatus(status) {
        if (status.type === 'burn') {
            const fresh = this.burnTimer <= 0;
            this.burnTimer = Math.max(this.burnTimer, status.duration);
            this.burnDps = Math.max(this.burnDps, status.dps);
            if (fresh) this.burnTick = 1.0;
            return fresh;
        }
        if (status.type === 'slow') {
            const fresh = this.slowTimer <= 0;
            this.slowTimer = Math.max(this.slowTimer, status.duration);
            this.slowScale = status.speedScale;
            return fresh;
        }
        return false;
    }

    updateStatus(dt) {
        if (this.burnTimer > 0) {
            this.burnTimer -= dt;
            this.burnTick -= dt;
            while (this.burnTick <= 1e-6) {
                this.pendingBurn += this.burnDps;
                this.burnTick += 1.0;
            }
            if (this.burnTimer <= 0) this.burnDps = 0;
        }
        if (this.slowTimer > 0) {
            this.slowTimer -= dt;
            if (this.slowTimer <= 0) this.slowScale = 1;
        }
    }

    // 魔法の属性 element（fire / ice / holy / none ...）が、この敵に効かないか。無属性（none・未指定）は、いつも効く。
    //   immune に 'elemental' があれば、無属性以外のすべての属性が効かない（ガーゴイル）
    isImmuneTo(element) {
        const im = this.profile?.immune;
        if (!im || im.size === 0 || !element || element === 'none') return false;
        return im.has('elemental') || im.has(element);
    }

    // 燃焼で溜まったダメージを受け取る（game.js が takeDamage して、倒したら経験値を与える）
    consumeBurnDamage() {
        const d = this.pendingBurn;
        this.pendingBurn = 0;
        return d;
    }

    // 一定時間、AI（移動・攻撃・射撃）を止める。長い方を優先する
    stun(seconds) {
        this.stunTimer = Math.max(this.stunTimer, seconds);
    }

    // knockScale: ノックバックの強さの倍率（既定 1.0。大剣・メイスなどが大きくする）
    takeDamage(amount, knockDir, knockScale = 1.0) {
        amount = amount * (this.damageTakenScale ?? 1);
        // 盾持ち: 正面からの近接・矢は、防ぐ（ダメージが減る）。魔法（knockDir.magic）は防げない
        this.lastBlocked = false;
        const gd = this.profile?.guard;
        if (gd && knockDir && !knockDir.magic) {
            const len = Math.hypot(knockDir.x, knockDir.z) || 1;
            const dot = (knockDir.x * Math.sin(this.facing) + knockDir.z * Math.cos(this.facing)) / len;
            if (dot < -Math.cos(gd.arc / 2 * Math.PI / 180)) { amount *= gd.reduction; this.lastBlocked = true; }
        }
        this.hp -= amount;
        this.hitTimer = HIT_FLASH_TIME;
        this.provokedTimer = 8;   // 攻撃されたら、縄張りの外へ逃げられても、しばらく追う
        // 被弾したら状態にかかわらず即追跡
        this.state = 'chase';
        this.lostTimer = 0;
        if (knockDir && !this.profile?.turret) {   // 固定砲台（石像）は、ノックバックしない
            this.knockback.set(knockDir.x * 12 * knockScale, 0, knockDir.z * 12 * knockScale);
        }
        if (this.hp <= 0) {
            this.active = false;
            this.spriteMat.opacity = 1; // 隠密の透明度を引きずらない（死亡演出のフェードは updateDeath が行う）
            // 横倒しの向きは、撃たれた方向（ノックバック）の左右成分で決める。無ければランダム
            this.deathTiltDir = knockDir ? (knockDir.x >= 0 ? 1 : -1) : (Math.random() < 0.5 ? 1 : -1);
        }
        return this.hp <= 0;
    }

    // 死亡演出の更新。終了（スプライトを消してよい）なら true を返す
    //   0〜0.1秒: 白フラッシュ / 0.1〜0.7秒: 横倒し（飛行の敵は先に落下） / 0.7〜1.3秒: 半透明になって消える
    updateDeath(dt) {
        if (this.slamMesh) this.clearSlam();
        this.deathTimer += dt;
        const t = this.deathTimer;
        const mat = this.spriteMat;

        if (t < DEATH_FLASH_TIME) {
            mat.color.setRGB(2.5, 2.5, 2.5);
            return false;
        }
        mat.color.setRGB(1, 1, 1);

        // 倒れる（地面側の足元を支点に回転）。飛行の敵は同時に地面へ落下する
        const p = Math.min(1, (t - DEATH_FLASH_TIME) / (DEATH_FALL_END - DEATH_FLASH_TIME));
        const eased = p * p;
        mat.rotation = this.deathTiltDir * (Math.PI / 2) * eased;
        this.sprite.scale.set(this.baseScaleX, this.baseScaleY * (1.0 - 0.2 * eased), 1);
        this.sprite.position.y = this.baseY * (1.0 - eased) + this.floorY;

        // 半透明になって消える
        if (t > DEATH_FALL_END) {
            mat.opacity = Math.max(0, 1.0 - (t - DEATH_FALL_END) / (DEATH_DURATION - DEATH_FALL_END));
        }
        return t >= DEATH_DURATION;
    }
}

export class Projectile {
    constructor(x, z, dirX, dirZ, isPlayer = false, speed = 9, damage = 10, options = {}) {
        this.x = x;
        this.y = 1.3;
        this.z = z;
        this.startX = x;
        this.startZ = z;
        this.dirX = dirX;
        this.dirZ = dirZ;
        this.isPlayer = isPlayer;
        this.speed = speed;
        this.damage = damage;
        this.type = options.type || (isPlayer ? 'player_fireball' : 'magic');
        this.maxDistance = options.maxDistance || 0; // 0 means unlimited by distance (timed life)
        this.sourceMonster = options.sourceMonster || null;
        this.visual = options.visual || null;        // 見た目（呪文の visual 定義: 形・色・大きさ）
        this.status = options.status || null;        // 命中した敵に与える状態異常（燃焼・鈍足）
        this.label = options.label || null;          // 命中時のポップアップに出す名前
        this.soundKind = options.soundKind || null;  // 命中時の効果音の種類（fire / ice / bolt）
        this.element = options.element || null;      // 魔法の属性（fire / ice / none ...）。属性が効かない敵（ガーゴイル）の判定に使う
        this.hitsLeft = options.pierce || 1;         // 貫通できる残り体数（1=貫通しない）
        this.hitMonsters = new Set();                // 貫通中に、すでに当たった敵（二重ヒットしない）
        this.radius = (this.type === 'arrow') ? 0.25 : 0.45;
        this.active = true;
        this.lifeTime = (this.type === 'arrow') ? 2.0 : 3.5;
        this.trailTimer = 0;
        this.isDropping = false;
        this.dropVelocityY = 0;

        // Group containing projectile 3D geometry
        this.mesh = new THREE.Group();

        if (this.type === 'arrow') {
            // Realistic 3D Arrow: Shaft, Metal Tip, and Fletching
            this.color = 0xd4d4d8;
            this.trailColor = 0xa1a1aa;

            // Arrow shaft (Cylinder lying horizontally along flight direction)
            const shaftGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.7, 6);
            const shaftMat = new THREE.MeshLambertMaterial({ color: 0x8b5a2b });
            const shaft = new THREE.Mesh(shaftGeo, shaftMat);
            shaft.rotation.x = Math.PI / 2; // Lie along Z axis
            this.mesh.add(shaft);

            // Metal arrowhead tip (Cone pointing forward)
            const tipGeo = new THREE.ConeGeometry(0.06, 0.16, 6);
            const tipMat = new THREE.MeshLambertMaterial({ color: 0xe4e4e7 });
            const tip = new THREE.Mesh(tipGeo, tipMat);
            tip.rotation.x = -Math.PI / 2; // Point forward along -Z
            tip.position.z = -0.42;
            this.mesh.add(tip);

            // Fletching feathers at the back
            const fletchGeo = new THREE.BoxGeometry(0.12, 0.08, 0.14);
            const fletchMat = new THREE.MeshLambertMaterial({ color: 0xdc2626 }); // Red fletching feathers
            const fletch = new THREE.Mesh(fletchGeo, fletchMat);
            fletch.position.z = 0.28;
            this.mesh.add(fletch);

            // Rotate entire arrow to face heading direction
            const yaw = Math.atan2(-dirX, -dirZ);
            this.mesh.rotation.y = yaw;
        } else if (this.type === 'poison_breath') {
            // Acid Worm Toxic Breath / Poison Mist cloud
            this.color = 0x84cc16;
            this.trailColor = 0xa3e635;
            this.lifeTime = 0.9; // Short-lived close-range lingering mist
            const mistGeo = new THREE.DodecahedronGeometry(0.42, 1);
            const mistMat = new THREE.MeshBasicMaterial({ color: 0x4ade80, wireframe: true });
            this.aura = new THREE.Mesh(mistGeo, mistMat);
            this.mesh.add(this.aura);
        } else if (this.type === 'breath_fire') {
            // 炎のブレス（ドラゴン・ドラゴンフライなど）: 赤橙の炎の塊
            this.color = 0xff6a00;
            this.trailColor = 0xffb347;
            this.lifeTime = 1.4;
            const fireGeo = new THREE.DodecahedronGeometry(0.5, 1);
            const fireMat = new THREE.MeshBasicMaterial({ color: 0xff7a1a, wireframe: true });
            this.aura = new THREE.Mesh(fireGeo, fireMat);
            this.mesh.add(this.aura);
            this.mesh.add(new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffe08a })));
        } else if (this.type === 'fire_bolt') {
            // 火の連射（ガーゴイルなど）: 小さめの火の玉。遠くまで飛ぶ
            this.color = 0xff5a10;
            this.trailColor = 0xffa940;
            this.lifeTime = 3.2;
            this.radius = 0.4;
            const boltGeo = new THREE.DodecahedronGeometry(0.34, 1);
            const boltMat = new THREE.MeshBasicMaterial({ color: 0xff6a1a, wireframe: true });
            this.aura = new THREE.Mesh(boltGeo, boltMat);
            this.mesh.add(this.aura);
            this.mesh.add(new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffe08a })));
        } else if (this.type === 'poison_dust') {
            // Poison Moth Spores / Toxic Dust Cluster
            this.color = 0xd946ef;
            this.trailColor = 0xa855f7;
            this.lifeTime = 2.5;
            const sporeGeo = new THREE.SphereGeometry(0.22, 6, 6);
            const sporeMat = new THREE.MeshBasicMaterial({ color: 0xf472b6 });
            const spore = new THREE.Mesh(sporeGeo, sporeMat);

            const dustRingGeo = new THREE.TorusGeometry(0.32, 0.05, 4, 8);
            const dustRingMat = new THREE.MeshBasicMaterial({ color: 0xa855f7 });
            this.aura = new THREE.Mesh(dustRingGeo, dustRingMat);

            this.mesh.add(spore);
            this.mesh.add(this.aura);
        } else if (this.isPlayer) {
            // プレイヤーの魔法弾: 見た目は呪文の visual で決まる（orb=火球 / crystal=氷の礫 / bolt=細長い光弾）。未指定は従来の火球
            const v = this.visual || {};
            const hex = (c, def) => new THREE.Color(c ?? def).getHex();
            this.color = hex(v.aura, '#ff6600');
            this.trailColor = hex(v.trail, '#ffaa00');
            const coreMat = new THREE.MeshBasicMaterial({ color: hex(v.core, '#ffffff') });
            const auraMat = new THREE.MeshBasicMaterial({ color: hex(v.aura, '#ff4400'), wireframe: true });
            let coreGeo, auraGeo;
            if (v.shape === 'crystal') {
                coreGeo = new THREE.OctahedronGeometry(0.22);
                auraGeo = new THREE.OctahedronGeometry(0.34);
            } else if (v.shape === 'bolt') {
                coreGeo = new THREE.BoxGeometry(0.08, 0.08, 0.7);
                auraGeo = new THREE.BoxGeometry(0.16, 0.16, 0.9);
                this.mesh.rotation.y = Math.atan2(-dirX, -dirZ); // 長い軸を進行方向へ向ける
                this.noSpin = true;                               // 細長い光弾は回転させない
            } else {
                coreGeo = new THREE.SphereGeometry(0.25, 8, 8);
                auraGeo = new THREE.DodecahedronGeometry(0.38, 1);
            }
            const core = new THREE.Mesh(coreGeo, coreMat);
            this.aura = new THREE.Mesh(auraGeo, auraMat);
            this.mesh.add(core);
            this.mesh.add(this.aura);
            if (v.size) this.mesh.scale.setScalar(v.size);
        } else {
            // Enemy Dark Magic: Violet / Magenta Energy Sphere
            this.color = 0xa855f7;
            this.trailColor = 0xec4899;
            const coreGeo = new THREE.SphereGeometry(0.24, 8, 8);
            const coreMat = new THREE.MeshBasicMaterial({ color: 0xfae8ff });
            const core = new THREE.Mesh(coreGeo, coreMat);

            const ringGeo = new THREE.TorusGeometry(0.36, 0.06, 6, 12);
            const ringMat = new THREE.MeshBasicMaterial({ color: 0x9333ea });
            this.aura = new THREE.Mesh(ringGeo, ringMat);

            this.mesh.add(core);
            this.mesh.add(this.aura);
        }

        this.mesh.position.set(this.x, this.y, this.z);
    }

    // 高さを決める。y: 発射時の高さ、vy: 上下の速さ（負は下向き。起伏のあるマップで、下にいる敵へ飛ばす）
    setHeight(y, vy = 0) {
        this.y = y;
        this.vy = vy;
        this.mesh.position.y = y;
    }

    update(dt, colliders, particles) {
        this.lifeTime -= dt;
        if (this.lifeTime <= 0) {
            this.active = false;
            return;
        }

        const traveledDist = Math.hypot(this.x - this.startX, this.z - this.startZ);

        // Arrow ballistic drop / maximum effective range logic
        if (this.type === 'arrow' && this.maxDistance > 0) {
            // When reaching 75% of max distance, arrow starts to lose kinetic energy & dip downwards
            if (traveledDist >= this.maxDistance * 0.75) {
                this.isDropping = true;
                this.dropVelocityY += 12 * dt; // Gravity acceleration
                this.y -= this.dropVelocityY * dt;
                this.mesh.position.y = this.y;

                // Tilt arrow tip downwards naturally
                const pitchAngle = Math.min(Math.PI / 3, (this.dropVelocityY / 6));
                this.mesh.rotation.x = pitchAngle;

                // Hit ground when dropping below Y=0.08
                if (this.y <= 0.08 || traveledDist >= this.maxDistance) {
                    this.active = false;
                    // Spawn small dust / dirt flecks when hitting ground
                    if (particles) {
                        particles.spawnBurst(this.x, 0.05, this.z, 0x78716c, 6, 1.5);
                    }
                    return;
                }
            }
        }

        // Horizontal Movement
        this.x += this.dirX * this.speed * dt;
        this.z += this.dirZ * this.speed * dt;
        this.mesh.position.x = this.x;
        this.mesh.position.z = this.z;
        if (this.vy) {   // 上下にも進む（高い所から、低い所の敵へ）
            this.y += this.vy * dt;
            this.mesh.position.y = this.y;
        }

        // Aura spin for magic/fireball
        if (this.aura && !this.noSpin) {
            this.aura.rotation.x += dt * 8;
            this.aura.rotation.y += dt * 10;
        }

        // Emit particle trail
        this.trailTimer += dt;
        const trailInterval = (this.type === 'arrow') ? 0.08 : 0.04;
        if (this.trailTimer >= trailInterval && particles) {
            this.trailTimer = 0;
            const trailSize = (this.type === 'arrow') ? 0.04 : 0.09;
            particles.spawnTrail(this.x, this.y, this.z, this.trailColor, trailSize);
        }

        // Check wall collision (skip colliders that do not block projectiles like water/low barriers)
        for (const c of colliders) {
            if (c.blocksProjectiles === false) continue;
            if (this.x >= c.minX && this.x <= c.maxX &&
                this.z >= c.minZ && this.z <= c.maxZ) {
                this.active = false;
                if (particles) {
                    const burstCount = (this.type === 'arrow') ? 5 : 12;
                    const burstSpeed = (this.type === 'arrow') ? 1.5 : 3.5;
                    particles.spawnBurst(this.x, this.y, this.z, this.color, burstCount, burstSpeed);
                }
                break;
            }
        }
    }
}
