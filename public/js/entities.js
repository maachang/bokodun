import * as THREE from '/js/three.module.js';
import { deriveProfile, diveHeight } from '/js/enemyBehavior.js';

// 隠密（索敵）仕様の定数
// ※ 索敵状態は「見える／見えない（描画）」の制御にのみ使う。移動・攻撃・射撃の AI は索敵状態に関係なく従来どおり距離で動く
const SENSE_DEFAULT_RANGE = 10;   // 感知距離の既定値（enemies.json の senseRange 未指定時）
const SENSE_DEFAULT_ANGLE = 70;   // 視野角（正面からの半角・度）の既定値（senseAngle 未指定時）
const SENSE_NEAR_DIST = 2.0;      // この距離以内（かつ壁越しでない）なら視野角外でも即気づく
const SENSE_DRAW_SCALE = 2.5;     // 未発見の敵を描画する距離（＝発見済みの維持範囲）= 感知距離 × この倍率 × 地形の視界係数
// 隠密性（stealth）: プレイヤーから見つけやすいかどうか。未発見の敵の描画距離に掛かる倍率
//   low=見つかりやすい / normal=標準 / high=見つかりにくい（発見済みでも遠くでは見えず、描画距離の手前で透明から徐々に見えてくる）
const STEALTH_DRAW_MULT = { low: 1.4, normal: 1.0, high: 0.5 };
const HIT_FLASH_TIME = 0.2;       // 被弾の色変化の長さ（秒）。最初の HIT_WHITE_TIME は白く光り、残りは赤みがかる
const HIT_WHITE_TIME = 0.08;
const APPEAR_FADE_TIME = 0.6;     // 敵が現れる／消えるときに、透明度が 0↔1 へ変化するのにかける時間（秒）。突然出てこず「フワッ」と現れる
const STEALTH_FADE_BAND = 0.4;    // high の敵が透明から見えてくる範囲（描画距離の外側 40% 分）
const LOST_TIME = 4.0;            // 追跡中に見失ってから未発見に戻るまでの時間（秒）

// 死亡演出の時間配分（秒）: 白フラッシュ → 横倒し → 半透明で消える
const DEATH_FLASH_TIME = 0.1;
const DEATH_FALL_END = 0.7;
const DEATH_DURATION = 1.3;

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
        this.cloaked = false;          // 猫系: 姿を消している（隠密）
        this.hitScale = 1;             // 攻撃の威力の倍率（猫系の連続攻撃は、1 回が小さい）
        this.catState = 'stalk';       // 猫系: stalk(狙う) / flurry(近くで連続攻撃) / away(離れる)
        this.catTimer = 0;
        this.awayHops = 0;
        this.damageTakenScale = 1;     // 受けるダメージの倍率（イノシシが、突進をよけられて息切れしている間は、大きくなる）
        this.dashHit = false;          // 今回の突進が、プレイヤーに当たったか（game.js が立てる）
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

        // 特徴による動きの変化: 再生・怒り・逃走・回避
        const pr = this.profile;
        if (pr) {
            if (pr.regen && this.hp < this.maxHp && this.hitTimer <= 0) this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.015 * dt);
            if (pr.enrage) {
                const en = this.hp < this.maxHp * 0.5;
                if (en !== this.enraged) { this.enraged = en; this.speed = this.baseSpeed * (en ? 1.35 : 1); }
            }
            // 逃走: 体力が 3 割を切ると、プレイヤーから逃げる
            if (pr.flee && this.hp < this.maxHp * 0.3 && dist < 18 && this.knockback.lengthSq() < 0.1) {
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
        switch (this.aiType) {
            case 'stationary': {
                // Pattern 1: Turret / Stationary (does not move, only attacks if in range)
                break;
            }

            case 'ranged_maintain': {
                // Pattern 2: Archer / Mage (Maintains ideal shooting distance)
                // If player is too close (< 4.5), backs away slowly; if too far (> 11), approaches
                if (dist < 18 && this.knockback.lengthSq() < 0.1) {
                    let moveSpeed = 0;
                    let targetDirX = 0;
                    let targetDirZ = 0;

                    if (dist < 4.5) {
                        // Back away
                        targetDirX = -dirX;
                        targetDirZ = -dirZ;
                        moveSpeed = this.speed * 0.85;
                    } else if (dist > 10.5) {
                        // Approach shooting range
                        targetDirX = dirX;
                        targetDirZ = dirZ;
                        moveSpeed = this.speed;
                    } else {
                        // Strafe sideways slightly for evasive rhythm
                        const strafeDir = Math.sin(this.aiTimer * 1.5) > 0 ? 1 : -1;
                        targetDirX = -dirZ * strafeDir;
                        targetDirZ = dirX * strafeDir;
                        moveSpeed = this.speed * 0.45;
                    }

                    if (moveSpeed > 0) {
                        const nextX = this.x + targetDirX * moveSpeed * dt;
                        const nextZ = this.z + targetDirZ * moveSpeed * dt;
                        if (!this.checkWallCollision(nextX, this.z, colliders)) this.x = nextX;
                        if (!this.checkWallCollision(this.x, nextZ, colliders)) this.z = nextZ;
                    }
                }
                break;
            }

            case 'bounce_leap': {
                // Pattern 3: Slime (Poyo-poyo gelatin squish animation, hops towards player, leaps to attack when close)
                if (dist < 18 && this.knockback.lengthSq() < 0.1) {
                    const isCloseToPlayer = (dist < 5.0 && dist > 0.8);

                    if (this.isLeaping) {
                        // Currently in air
                        this.leapVelocityY -= 14 * dt; // Gravity
                        this.baseY += this.leapVelocityY * dt;

                        // Fly forward towards target
                        const leapSpeed = isCloseToPlayer ? (this.speed * 2.2) : (this.speed * 1.4);
                        const nextX = this.x + this.leapTargetDir.x * leapSpeed * dt;
                        const nextZ = this.z + this.leapTargetDir.z * leapSpeed * dt;
                        if (!this.checkWallCollision(nextX, this.z, colliders)) this.x = nextX;
                        if (!this.checkWallCollision(this.x, nextZ, colliders)) this.z = nextZ;

                        // Air stretch animation
                        this.sprite.scale.set(this.baseScaleX * 0.85, this.baseScaleY * 1.25, 1);

                        // Land on ground
                        if (this.baseY <= 0) {
                            this.baseY = 0;
                            this.isLeaping = false;
                            this.leapVelocityY = 0;
                            // Splat squash on landing
                            this.sprite.scale.set(this.baseScaleX * 1.35, this.baseScaleY * 0.65, 1);
                        }
                    } else {
                        // On ground: squish & prepare next hop
                        const hopInterval = isCloseToPlayer ? 0.65 : 1.1; // Hops faster when close
                        const squishCycle = (this.aiTimer % hopInterval) / hopInterval;

                        // Poyo-poyo gelatin breathing rhythm
                        const squishX = 1.0 + Math.sin(this.aiTimer * 6.0) * 0.12;
                        const squishY = 1.0 - Math.sin(this.aiTimer * 6.0) * 0.12;
                        this.sprite.scale.set(this.baseScaleX * squishX, this.baseScaleY * squishY, 1);

                        if (squishCycle > 0.88) {
                            // Initiate jump / leap attack!
                            this.isLeaping = true;
                            this.leapVelocityY = isCloseToPlayer ? 4.2 : 3.0; // Higher tackle leap when close
                            this.leapTargetDir = { x: dirX, z: dirZ };
                        }
                    }
                } else {
                    // Idle breathing when far away
                    const idleSquish = 1.0 + Math.sin(this.aiTimer * 3.0) * 0.06;
                    this.sprite.scale.set(this.baseScaleX * idleSquish, this.baseScaleY * (2.0 - idleSquish), 1);
                }
                break;
            }

            case 'hop_pounce': {
                // Pattern 4: Frog / Mimic (Crouches down, then springs forward with violent pounce attacks)
                if (dist < 18 && this.knockback.lengthSq() < 0.1) {
                    const isAttackDistance = (dist < 6.5 && dist > 0.8);

                    if (this.isLeaping) {
                        // High springing pounce arc
                        this.leapVelocityY -= 16 * dt; // Strong gravity
                        this.baseY += this.leapVelocityY * dt;

                        const pounceSpeed = isAttackDistance ? (this.speed * 2.5) : (this.speed * 1.6);
                        const nextX = this.x + this.leapTargetDir.x * pounceSpeed * dt;
                        const nextZ = this.z + this.leapTargetDir.z * pounceSpeed * dt;
                        if (!this.checkWallCollision(nextX, this.z, colliders)) this.x = nextX;
                        if (!this.checkWallCollision(this.x, nextZ, colliders)) this.z = nextZ;

                        // Spring stretch
                        this.sprite.scale.set(this.baseScaleX * 0.9, this.baseScaleY * 1.2, 1);

                        if (this.baseY <= 0) {
                            this.baseY = 0;
                            this.isLeaping = false;
                            this.leapVelocityY = 0;
                            // Heavy impact land
                            this.sprite.scale.set(this.baseScaleX * 1.25, this.baseScaleY * 0.8, 1);
                        }
                    } else {
                        // Crouch and wind-up on ground
                        const hopInterval = isAttackDistance ? 0.75 : 1.25;
                        const chargeCycle = (this.aiTimer % hopInterval) / hopInterval;

                        // Squats down in anticipation
                        const squatAmount = 1.0 - Math.min(0.3, chargeCycle * 0.35);
                        this.sprite.scale.set(this.baseScaleX * (2.0 - squatAmount), this.baseScaleY * squatAmount, 1);

                        if (chargeCycle > 0.9) {
                            // POUNCE!
                            this.isLeaping = true;
                            this.leapVelocityY = isAttackDistance ? 5.2 : 3.8;
                            this.leapTargetDir = { x: dirX, z: dirZ };
                        }
                    }
                }
                break;
            }

            case 'stalker_spider': {
                // Pattern 5: Jumping Spider / Tarantula (Quiet stalk -> sudden high-speed sprint -> freeze pause)
                // 3 phases: 0.0~1.4s Stalking (slow, low footsteps), 1.4~2.2s Sudden Sprint (rapid charge), 2.2~3.2s Freeze Standstill
                if (dist < 20 && this.knockback.lengthSq() < 0.1) {
                    const cyclePeriod = 3.2;
                    const phaseTime = this.aiTimer % cyclePeriod;

                    let moveSpeed = 0;
                    if (phaseTime < 1.4) {
                        // Phase 1: Slow deliberate crawl / stalking (quietly closes in)
                        moveSpeed = this.speed * 0.45;
                        // Twitching creep
                        const creepScaleX = 1.0 + Math.sin(this.aiTimer * 10) * 0.05;
                        this.sprite.scale.set(this.baseScaleX * creepScaleX, this.baseScaleY, 1);
                        this.baseY = Math.abs(Math.sin(this.aiTimer * 6.0)) * 0.06;
                    } else if (phaseTime < 2.2) {
                        // Phase 2: Sudden explosive sprint (like jumping spider darting forward!)
                        moveSpeed = this.speed * 2.3;
                        // Flatten down for aerodynamic speed sprint
                        this.sprite.scale.set(this.baseScaleX * 1.15, this.baseScaleY * 0.85, 1);
                        this.baseY = 0.02;
                    } else {
                        // Phase 3: Total Freeze / Stillness (rearing up, analyzing prey)
                        moveSpeed = 0;
                        // Rigid high posture
                        this.sprite.scale.set(this.baseScaleX * 0.92, this.baseScaleY * 1.08, 1);
                        this.baseY = 0.0;
                    }

                    if (moveSpeed > 0 && dist > 0.8) {
                        const nextX = this.x + dirX * moveSpeed * dt;
                        const nextZ = this.z + dirZ * moveSpeed * dt;
                        if (!this.checkWallCollision(nextX, this.z, colliders)) this.x = nextX;
                        if (!this.checkWallCollision(this.x, nextZ, colliders)) this.z = nextZ;
                    }
                }
                break;
            }

            case 'flying_chase': {
                // Pattern 6: Flying insect chase (Parasite Wasp / Maria Mosquito)
                // Hovers in mid-air (Y: 1.2m ~ 1.9m) with high-speed wing-buzzing flutter, darting toward player
                if (dist < 20 && this.knockback.lengthSq() < 0.1) {
                    // Wing vibration flutter scale
                    const wingBuzz = 1.0 + Math.sin(this.aiTimer * 38.0) * 0.12;
                    this.sprite.scale.set(this.baseScaleX * wingBuzz, this.baseScaleY, 1);

                    // Hover height floating sinusoidally
                    const hoverBaseY = (this.scale[1] > 2.0) ? 1.5 : 1.3;
                    this.baseY = hoverBaseY + Math.sin(this.aiTimer * 5.0) * 0.35;

                    if (dist > 0.8) {
                        // Darting erratic flight: main chase vector + high-frequency lateral swoops
                        const lateralDirX = -dirZ;
                        const lateralDirZ = dirX;
                        const wobble = Math.sin(this.aiTimer * 8.0) * 0.6;

                        const vx = (dirX + lateralDirX * wobble) * this.speed;
                        const vz = (dirZ + lateralDirZ * wobble) * this.speed;

                        const nextX = this.x + vx * dt;
                        const nextZ = this.z + vz * dt;
                        if (!this.checkWallCollision(nextX, this.z, colliders)) this.x = nextX;
                        if (!this.checkWallCollision(this.x, nextZ, colliders)) this.z = nextZ;
                    }
                }
                break;
            }

            case 'flying_ranged': {
                // Pattern 7: Flying Ranged Moth (Poison Moth)
                // Glides gracefully high in the air (Y: 1.5m ~ 2.2m), maintains medium distance, casts poison spores
                if (dist < 20 && this.knockback.lengthSq() < 0.1) {
                    // Slow majestic wing flap
                    const flap = 1.0 + Math.sin(this.aiTimer * 7.0) * 0.18;
                    this.sprite.scale.set(this.baseScaleX * flap, this.baseScaleY * (2.0 - flap), 1);

                    // High altitude floating
                    this.baseY = (this.profile?.flightHeight ?? 1.6) + Math.sin(this.aiTimer * 3.5) * 0.4;

                    // Maintain comfortable distance around 6.0 ~ 11.0m
                    let moveSpeed = 0;
                    let targetX = 0;
                    let targetZ = 0;

                    if (dist < 5.0) {
                        // Retreat backwards while in air
                        targetX = -dirX;
                        targetZ = -dirZ;
                        moveSpeed = this.speed * 0.9;
                    } else if (dist > 11.0) {
                        // Close in
                        targetX = dirX;
                        targetZ = dirZ;
                        moveSpeed = this.speed;
                    } else {
                        // Circling / strafing orbit
                        const circleDir = (Math.sin(this.aiTimer * 0.8) > 0) ? 1 : -1;
                        targetX = -dirZ * circleDir;
                        targetZ = dirX * circleDir;
                        moveSpeed = this.speed * 0.55;
                    }

                    if (moveSpeed > 0) {
                        const nextX = this.x + targetX * moveSpeed * dt;
                        const nextZ = this.z + targetZ * moveSpeed * dt;
                        if (!this.checkWallCollision(nextX, this.z, colliders)) this.x = nextX;
                        if (!this.checkWallCollision(this.x, nextZ, colliders)) this.z = nextZ;
                    }
                }
                break;
            }

            case 'flying_dive': {
                // 飛ぶ敵（近接）: 高い所を飛んで近づき、プレイヤーの頭上から急降下で襲いかかり、また上昇する。
                //   高い所にいる間は、当たらない（近接の攻撃が届かない）。魔法・弓で撃ち落とせる
                if (dist < 26 && this.knockback.lengthSq() < 0.1) {
                    const H = this.profile?.flightHeight ?? 2.0;
                    const flap = 1.0 + Math.sin(this.aiTimer * 14.0) * 0.1;
                    this.sprite.scale.set(this.baseScaleX * flap, this.baseScaleY * (2.0 - flap), 1);
                    const hover = H + Math.sin(this.aiTimer * 3.0) * 0.3;
                    const moveBy = (vx, vz) => {
                        const nx = this.x + vx * dt, nz = this.z + vz * dt;
                        if (!this.checkWallCollision(nx, this.z, colliders)) this.x = nx;
                        if (!this.checkWallCollision(this.x, nz, colliders)) this.z = nz;
                    };
                    if (this.diveState === 'approach') {
                        this.baseY += (hover - this.baseY) * Math.min(1, dt * 3);
                        if (dist > 6.5) moveBy(dirX * this.speed, dirZ * this.speed);
                        else moveBy(-dirZ * this.speed * 0.6, dirX * this.speed * 0.6);   // 頭上を旋回
                        this.diveCooldown -= dt;
                        if (this.diveCooldown <= 0 && dist < 9) {
                            this.diveState = 'dive'; this.diveTimer = 0;
                            this.diveDir = { x: dirX, z: dirZ };
                            this.diveFrom = this.baseY;
                            this.diveSpeed = Math.min(16, Math.max(this.speed * 2.2, dist / 0.6));   // 発見した位置へ、急降下の間に届く速さ
                        }
                    } else if (this.diveState === 'dive') {
                        // 急降下: 発見したときのプレイヤーの方向へ、速く進みながら、プレイヤーの胴の高さまで降りる
                        this.diveTimer += dt;
                        const t = this.diveTimer / 0.7;
                        const pFloor = player.floorY ?? this.floorY;
                        const low = Math.max(0, pFloor - this.floorY) + 0.1;   // プレイヤーの足元の高さ（この敵から見た）
                        this.baseY = diveHeight(this.diveFrom ?? H, low, t);
                        moveBy(this.diveDir.x * this.diveSpeed, this.diveDir.z * this.diveSpeed);
                        if (this.diveTimer >= 0.7) { this.diveState = 'climb'; this.diveTimer = 0; }
                    } else {
                        // 上昇: プレイヤーから離れながら、元の高さへ戻る
                        this.diveTimer += dt;
                        this.baseY += (hover - this.baseY) * Math.min(1, dt * 2.5);
                        moveBy(-this.diveDir.x * this.speed * 0.9, -this.diveDir.z * this.speed * 0.9);
                        if (this.diveTimer >= 1.1) { this.diveState = 'approach'; this.diveCooldown = 1.6 + Math.random() * 1.2; }
                    }
                }
                break;
            }

            case 'raptor_dive': {
                // 猛禽（鷹など）: 獲物（プレイヤー）を見つけると、まず高く舞い上がり（上空で、プレイヤーのまわりを旋回して、狙う）、
                //   飛び出す瞬間のプレイヤーの方向へ、滑空して、速い速さで突っ込む（途中で曲がらないので、横へよければ、よけられる）。
                //   よけられると、低い所で、隙ができる（被ダメージが増え、近接で反撃できる）。当たったときは、すぐ舞い上がる
                const rp = this.profile?.raptor ?? { high: 5, wait: 1.5, glideSpeed: 14, glideTime: 0.9, recover: 1.8, hitRecover: 0.6, vulnerable: 1.5 };
                if (dist < 40 && this.knockback.lengthSq() < 0.1) {
                    const flapRate = this.raptorState === 'climb' ? 16 : 9;
                    const flap = 1.0 + Math.sin(this.aiTimer * flapRate) * 0.1;
                    this.sprite.scale.set(this.baseScaleX * flap, this.baseScaleY * (2.0 - flap), 1);
                    const moveBy = (vx, vz) => {
                        const nx = this.x + vx * dt, nz = this.z + vz * dt;
                        if (!this.checkWallCollision(nx, this.z, colliders)) this.x = nx;
                        if (!this.checkWallCollision(this.x, nz, colliders)) this.z = nz;
                    };
                    const pFloor = Math.max(0, (player.floorY ?? this.floorY) - this.floorY);
                    if (this.raptorState === 'climb') {
                        // 舞い上がり、上空で旋回して狙う
                        this.isDashing = false; this.damageTakenScale = 1;
                        const high = rp.high + pFloor;
                        this.baseY += Math.min(high - this.baseY, 4.5 * dt);
                        if (dist > 10) moveBy(dirX * this.speed * 1.6, dirZ * this.speed * 1.6);
                        else if (dist < 6) moveBy(-dirX * this.speed, -dirZ * this.speed);
                        else moveBy(-dirZ * this.speed * 0.9, dirX * this.speed * 0.9);   // 旋回
                        if (this.baseY >= high - 0.4) {
                            this.raptorTimer += dt;
                            if (this.raptorTimer >= rp.wait && dist < 16) {   // 狙い定めて、滑空へ
                                this.raptorState = 'glide'; this.raptorTimer = 0; this.dashHit = false;
                                this.glideDir = { x: dirX, z: dirZ };
                                this.glideFrom = this.baseY;
                                this.glideSpeed = Math.max(rp.glideSpeed, dist / (rp.glideTime * 0.75));   // 発見した位置の少し先まで届く速さ
                            }
                        }
                    } else if (this.raptorState === 'glide') {
                        this.isDashing = true;
                        this.raptorTimer += dt;
                        const t = this.raptorTimer / rp.glideTime;
                        const low = pFloor + 0.2;
                        this.baseY = diveHeight(this.glideFrom, low, Math.min(1, t * 1.15));   // 滑空: 高い所から、プレイヤーの高さまで、滑るように降りる
                        moveBy(this.glideDir.x * this.glideSpeed, this.glideDir.z * this.glideSpeed);
                        this.sprite.scale.set(this.baseScaleX * 1.15, this.baseScaleY * 0.8, 1);   // 翼をたたんで、細く
                        if (this.raptorTimer >= rp.glideTime) {
                            this.isDashing = false;
                            this.raptorState = 'recover'; this.raptorTimer = 0;
                            // よけられた（当たらなかった）: 低い所で隙。当たった: すぐ舞い上がる
                            this.damageTakenScale = this.dashHit ? 1 : rp.vulnerable;
                            this.raptorRecover = this.dashHit ? rp.hitRecover : rp.recover;
                        }
                    } else {
                        // 隙: 低い所で、ゆっくり向きを直し、体勢を立て直す
                        this.raptorTimer += dt;
                        const low = pFloor + (this.dashHit ? 0.8 : 0.3);
                        this.baseY += (low - this.baseY) * Math.min(1, dt * 4);
                        moveBy(-this.glideDir.x * this.speed * 0.3, -this.glideDir.z * this.speed * 0.3);
                        if (this.raptorTimer >= this.raptorRecover) { this.raptorState = 'climb'; this.raptorTimer = 0; this.damageTakenScale = 1; }
                    }
                } else {
                    this.isDashing = false;
                }
                break;
            }

            case 'charge_dash': {
                // 突進する敵（イノシシなど）: 近づく → 立ち止まって溜める（ブルブル震えて地面を蹴る）→ ロケットスタートで、一直線に猪突猛進（途中で曲がらず、
                //   プレイヤーを突き抜けて攻撃）→ 壁にぶつかるとスタン。よけられる（当たらずに突き抜ける）と、息切れして、長く動けず、受けるダメージが増える（弱い）
                this.isDashing = (this.chargeState === 'dash');
                const ch = this.profile?.charge ?? { windup: 0.9, dash: 12, speed: 3.2, stun: 1.3, rest: 0.8, vulnerable: 1 };
                const moveBy = (vx, vz) => {
                    const nx = this.x + vx * dt, nz = this.z + vz * dt;
                    let blocked = false;
                    if (!this.checkWallCollision(nx, this.z, colliders)) this.x = nx; else blocked = true;
                    if (!this.checkWallCollision(this.x, nz, colliders)) this.z = nz; else blocked = true;
                    return blocked;
                };
                if (dist < 22 && this.knockback.lengthSq() < 0.1) {
                    this.chargeCooldown -= dt;
                    if (this.chargeState === 'walk') {
                        this.damageTakenScale = 1;
                        if (dist > 1.0) {
                            moveBy(dirX * this.speed * 0.9, dirZ * this.speed * 0.9);
                            this.baseY = Math.abs(Math.sin(this.aiTimer * 8.0)) * 0.1;
                        }
                        if (this.chargeCooldown <= 0 && dist < 12 && dist > 3.5) { this.chargeState = 'windup'; this.chargeTimer = ch.windup; }
                    } else if (this.chargeState === 'windup') {
                        // 溜め（攻撃体制）: 立ち止まり、ブルブルと震えて、地面を蹴る。攻撃の予告
                        this.chargeTimer -= dt;
                        this.shakeX = Math.sin(this.aiTimer * 60) * 0.12;   // ブルブル震える（最後に、位置へ足す）
                        this.baseY = Math.abs(Math.sin(this.aiTimer * 22.0)) * 0.12;
                        this.sprite.scale.set(this.baseScaleX * (1 + Math.sin(this.aiTimer * 34) * 0.07), this.baseScaleY * (1 - Math.sin(this.aiTimer * 34) * 0.07), 1);
                        if (this.chargeTimer <= 0) {
                            this.chargeState = 'dash'; this.chargeDist = 0; this.isDashing = true; this.dashHit = false;
                            this.chargeDir = { x: dirX, z: dirZ };   // 溜めが終わった瞬間の、プレイヤーの方向へ（途中で曲がらない）
                        }
                    } else if (this.chargeState === 'dash') {
                        this.isDashing = true;
                        // ロケットスタート: 走り出しの最初の 3 マスは、さらに速い
                        const v = this.speed * ch.speed * (this.chargeDist < 3 ? 1.5 : 1);
                        const before = { x: this.x, z: this.z };
                        const blocked = moveBy(this.chargeDir.x * v, this.chargeDir.z * v);
                        this.chargeDist += Math.hypot(this.x - before.x, this.z - before.z);
                        this.baseY = Math.abs(Math.sin(this.aiTimer * 16.0)) * 0.15;
                        this.sprite.scale.set(this.baseScaleX * 1.1, this.baseScaleY * 0.92, 1);
                        if (blocked) { this.chargeState = 'stun'; this.chargeTimer = ch.stun; this.isDashing = false; this.damageTakenScale = ch.vulnerable ?? 1; }   // 壁・崖にぶつかって、目を回す
                        else if (this.chargeDist >= ch.dash) {
                            this.chargeState = 'rest'; this.isDashing = false;
                            // 当たらずに突き抜けた（よけられた）: 息切れして、長く動けず、被ダメージが増える。当てたときは、すぐ立て直す
                            if (this.dashHit) { this.chargeTimer = 0.8; this.damageTakenScale = 1; }
                            else { this.chargeTimer = ch.rest ?? 0.8; this.damageTakenScale = ch.vulnerable ?? 1; }
                        }
                    } else if (this.chargeState === 'stun' || this.chargeState === 'rest') {
                        this.chargeTimer -= dt;
                        this.baseY = 0;
                        if (this.chargeState === 'stun') this.sprite.scale.set(this.baseScaleX * 0.95, this.baseScaleY * 1.0, 1);
                        else this.sprite.scale.set(this.baseScaleX * 1.05, this.baseScaleY * 0.93, 1);   // 息切れ（うなだれる）
                        if (this.chargeTimer <= 0) { this.chargeState = 'walk'; this.chargeCooldown = 1.4 + Math.random(); this.damageTakenScale = 1; }
                    }
                } else {
                    this.isDashing = false;
                }
                break;
            }

            case 'big_hop': {
                // 大きく跳ぶ敵（兎など）: 1 回の跳躍が、とても遠い。着地して少し休み、また跳ぶ。近づくと、プレイヤーの頭上へ飛び込む
                if (dist < 24 && this.knockback.lengthSq() < 0.1) {
                    const hp = this.profile?.hop ?? { range: 4.5, height: 0.9, rest: 0.26 };
                    const G = 18;
                    if (this.isLeaping) {
                        this.leapVelocityY -= G * dt;
                        this.baseY += this.leapVelocityY * dt;
                        const nx = this.x + this.leapTargetDir.x * this.leapSpeed * dt, nz = this.z + this.leapTargetDir.z * this.leapSpeed * dt;
                        if (!this.checkWallCollision(nx, this.z, colliders)) this.x = nx;
                        if (!this.checkWallCollision(this.x, nz, colliders)) this.z = nz;
                        this.sprite.scale.set(this.baseScaleX * 0.88, this.baseScaleY * 1.2, 1);
                        if (this.baseY <= 0) {
                            this.baseY = 0; this.isLeaping = false; this.leapVelocityY = 0;
                            this.hopRest = (hp.rest ?? 0.26) * (0.8 + Math.random() * 0.4);   // 着地して、すぐ次の跳躍（速いリズム）
                            this.sprite.scale.set(this.baseScaleX * 1.3, this.baseScaleY * 0.7, 1);
                        }
                    } else {
                        this.hopRest -= dt;
                        const squash = 1 + Math.sin(this.aiTimer * 8) * 0.04;
                        this.sprite.scale.set(this.baseScaleX * squash, this.baseScaleY * (2 - squash), 1);
                        if (this.hopRest <= 0 && dist > 0.8) {
                            // 跳ぶ距離: プレイヤーまでの距離（上限 hop.range）。滞空時間から、水平の速さを決める
                            const hopDist = Math.min(hp.range, Math.max(2.5, dist));
                            const vy = Math.sqrt(2 * G * hp.height);   // hp.height は、跳ぶ高さ（頂点）
                            const airtime = 2 * vy / G;
                            this.isLeaping = true;
                            this.leapVelocityY = vy;
                            this.leapSpeed = hopDist / airtime;
                            this.leapTargetDir = { x: dirX, z: dirZ };
                        }
                    }
                }
                break;
            }

            case 'cat_ambush': {
                // 猫系: 攻撃体制（追跡状態）に入ると、隠密で姿を消し、低く・長く跳んで近づく（不意打ち）。近くでは、姿を現し、噛みつき・ひっかきを
                //   素早く何度も繰り出す（1 回の威力は小さい）。しばらくすると、跳んで離れて、また姿を消す（しつこく攻撃せず、ヒットアンドアウェイ）
                const ct = this.profile?.cat ?? { range: 11, height: 0.8, rest: 0.3, flurry: 1.0, flurryScale: 0.55, away: 7, cool: 2.5 };
                const G = 18;
                if (this.state !== 'chase' || dist > 28) { this.cloaked = false; this.hitScale = 1; this.catState = 'stalk'; break; }
                const hopTo = (tx, tz, distance) => {
                    const vy = Math.sqrt(2 * G * ct.height), airtime = 2 * vy / G;
                    this.isLeaping = true; this.leapVelocityY = vy;
                    this.leapSpeed = distance / airtime; this.leapTargetDir = { x: tx, z: tz };
                };
                if (this.isLeaping) {
                    this.leapVelocityY -= G * dt;
                    this.baseY += this.leapVelocityY * dt;
                    const nx = this.x + this.leapTargetDir.x * this.leapSpeed * dt, nz = this.z + this.leapTargetDir.z * this.leapSpeed * dt;
                    if (!this.checkWallCollision(nx, this.z, colliders)) this.x = nx;
                    if (!this.checkWallCollision(this.x, nz, colliders)) this.z = nz;
                    this.sprite.scale.set(this.baseScaleX * 1.12, this.baseScaleY * 0.85, 1);   // 低く、伸びて跳ぶ
                    if (this.baseY <= 0) {
                        this.baseY = 0; this.isLeaping = false; this.leapVelocityY = 0;
                        this.hopRest = ct.rest * (0.8 + Math.random() * 0.4);
                        this.sprite.scale.set(this.baseScaleX * 1.1, this.baseScaleY * 0.82, 1);
                    }
                } else {
                    this.hopRest -= dt;
                    if (this.catState === 'stalk') {
                        this.cloaked = true; this.hitScale = 1;
                        this.sprite.scale.set(this.baseScaleX, this.baseScaleY * 0.88, 1);   // 低く構える
                        if (this.hopRest <= 0) {
                            if (dist < 3.4) { this.catState = 'flurry'; this.catTimer = ct.flurry; this.cloaked = false; this.hitScale = ct.flurryScale; }
                            else hopTo(dirX, dirZ, Math.min(ct.range, Math.max(2.4, dist - 1.0)));
                        }
                    } else if (this.catState === 'flurry') {
                        // 近くで、噛みつき・ひっかき。相手にまとわりつく
                        this.cloaked = false; this.hitScale = ct.flurryScale;
                        this.catTimer -= dt;
                        const touch = (this.radius + (player.radius ?? 0.4)) * 0.85;   // ぶつかる（攻撃が当たる）距離まで寄る
                        if (dist > touch) {
                            const nx = this.x + dirX * Math.max(this.speed * 1.6, 3.0) * dt, nz = this.z + dirZ * Math.max(this.speed * 1.6, 3.0) * dt;
                            if (!this.checkWallCollision(nx, this.z, colliders)) this.x = nx;
                            if (!this.checkWallCollision(this.x, nz, colliders)) this.z = nz;
                        }
                        const claw = 1 + Math.sin(this.aiTimer * 40) * 0.12;   // ひっかきの素早い動き
                        this.sprite.scale.set(this.baseScaleX * claw, this.baseScaleY * (2 - claw), 1);
                        this.baseY = Math.abs(Math.sin(this.aiTimer * 20)) * 0.18;
                        if (this.catTimer <= 0) { this.catState = 'away'; this.awayHops = 2; this.hitScale = 1; this.cloaked = true; this.hopRest = 0; }
                    } else {
                        // 離れる: 跳んで離れて、姿を消す。しばらくして、また狙う
                        this.cloaked = true; this.hitScale = 1;
                        if (this.hopRest <= 0) {
                            if (this.awayHops > 0) { hopTo(-dirX, -dirZ, ct.away); this.awayHops--; }
                            else { this.catState = 'stalk'; this.hopRest = ct.cool * (0.8 + Math.random() * 0.5); }
                        }
                    }
                }
                break;
            }

            case 'bear_rush': {
                // クマ: 近づくと（攻撃を始めると）、ラッシュ（連打）。1 回の威力は小さいが、回数が多い。連打のあとは、少し間を置き、また連打する
                const rs = this.profile?.rush ?? { flurry: 2.6, flurryScale: 0.5, cool: 1.2 };
                if (dist < 20 && this.knockback.lengthSq() < 0.1) {
                    const touch = (this.radius + (player.radius ?? 0.4)) * 0.85;
                    const step = (sp) => {
                        const nx = this.x + dirX * sp * dt, nz = this.z + dirZ * sp * dt;
                        if (!this.checkWallCollision(nx, this.z, colliders)) this.x = nx;
                        if (!this.checkWallCollision(this.x, nz, colliders)) this.z = nz;
                    };
                    if (this.rushState === 'chase') {
                        this.hitScale = 1;
                        if (dist > touch) step(this.speed);
                        this.baseY = Math.abs(Math.sin(this.aiTimer * 7.0)) * 0.1;
                        if (dist <= touch + 0.6) { this.rushState = 'rush'; this.rushTimer = rs.flurry; this.hitScale = rs.flurryScale; }
                    } else if (this.rushState === 'rush') {
                        this.hitScale = rs.flurryScale;
                        this.rushTimer -= dt;
                        if (dist > touch) step(this.speed * 1.4);   // 連打の間、相手にまとわりつく
                        const claw = 1 + Math.sin(this.aiTimer * 30) * 0.1;   // 両手の連打
                        this.sprite.scale.set(this.baseScaleX * claw, this.baseScaleY * (2 - claw), 1);
                        this.baseY = Math.abs(Math.sin(this.aiTimer * 16)) * 0.12;
                        if (this.rushTimer <= 0) { this.rushState = 'recover'; this.rushTimer = rs.cool; this.hitScale = 1; }
                    } else {
                        this.hitScale = 1;
                        this.rushTimer -= dt;
                        this.baseY = 0;
                        if (this.rushTimer <= 0) this.rushState = 'chase';
                    }
                }
                break;
            }

            case 'pack_chase': {
                // 狼: 一定の速さで、どこまでも追ってくる。近づいても、止まらず、まとわりつく（攻撃は、ぶつかる）
                if (dist < 60 && this.knockback.lengthSq() < 0.1) {
                    if (dist > 0.9) {
                        const nx = this.x + dirX * this.speed * dt, nz = this.z + dirZ * this.speed * dt;
                        if (!this.checkWallCollision(nx, this.z, colliders)) this.x = nx;
                        if (!this.checkWallCollision(this.x, nz, colliders)) this.z = nz;
                    }
                    this.baseY = Math.abs(Math.sin(this.aiTimer * 11.0)) * 0.14;
                    this.sprite.scale.set(this.baseScaleX * (1 + Math.sin(this.aiTimer * 11) * 0.04), this.baseScaleY * (1 - Math.sin(this.aiTimer * 11) * 0.04), 1);
                }
                break;
            }

            case 'worm_burrow': {
                // Pattern 8: Acid Worm (Writhing segmented serpentine undulating movement, close-range toxic mist)
                if (dist < 18 && this.knockback.lengthSq() < 0.1) {
                    // Serpentine undulating squirm / S-curve body distortion
                    const wriggleX = 1.0 + Math.sin(this.aiTimer * 9.0) * 0.22;
                    const wriggleY = 1.0 - Math.sin(this.aiTimer * 9.0) * 0.15;
                    this.sprite.scale.set(this.baseScaleX * wriggleX, this.baseScaleY * wriggleY, 1);

                    // Slithers along ground with vertical head bobbing
                    this.baseY = Math.abs(Math.sin(this.aiTimer * 4.5)) * 0.18;

                    // Creeps slowly toward player to get into toxic breath range (< 5.0m)
                    if (dist > 2.2) {
                        const crawlSpeed = this.speed;
                        const nextX = this.x + dirX * crawlSpeed * dt;
                        const nextZ = this.z + dirZ * crawlSpeed * dt;
                        if (!this.checkWallCollision(nextX, this.z, colliders)) this.x = nextX;
                        if (!this.checkWallCollision(this.x, nextZ, colliders)) this.z = nextZ;
                    }
                }
                break;
            }

            case 'walk_chase':
            default: {
                // Constant walking pursuit (Skeleton / Melee warrior)
                if (dist < 18 && dist > 1.0 && this.knockback.lengthSq() < 0.1) {
                    const nextX = this.x + dirX * this.speed * dt;
                    const nextZ = this.z + dirZ * this.speed * dt;

                    if (!this.checkWallCollision(nextX, this.z, colliders)) this.x = nextX;
                    if (!this.checkWallCollision(this.x, nextZ, colliders)) this.z = nextZ;

                    // Footstep bobbing
                    this.baseY = Math.abs(Math.sin(this.aiTimer * 8.0)) * 0.12;
                }
                break;
            }
        }

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
            this.facing = toPlayer;
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
        this.hp -= amount;
        this.hitTimer = HIT_FLASH_TIME;
        this.provokedTimer = 8;   // 攻撃されたら、縄張りの外へ逃げられても、しばらく追う
        // 被弾したら状態にかかわらず即追跡
        this.state = 'chase';
        this.lostTimer = 0;
        if (knockDir) {
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
