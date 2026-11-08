import * as THREE from '/js/three.module.js';
import { deriveProfile, diveHeight } from '/js/enemyBehavior.js';
import { aiBehaviors } from '/js/monster/aiBehaviors.js';
import { monsterStageMethods } from '/js/monster/monsterStages.js';
import { monsterInitMethods } from '/js/monster/monsterInit.js';
import { monsterSenseMethods } from '/js/monster/monsterSenses.js';
import { monsterStatusMethods } from '/js/monster/monsterStatus.js';

import { ENEMY_ICON_MAP, SENSE_DEFAULT_RANGE, SENSE_DEFAULT_ANGLE, SENSE_NEAR_DIST, SENSE_DRAW_SCALE, STEALTH_DRAW_MULT, HIT_FLASH_TIME, HIT_WHITE_TIME, APPEAR_FADE_TIME, STEALTH_FADE_BAND, LOST_TIME, DEATH_FLASH_TIME, DEATH_FALL_END, DEATH_DURATION } from '/js/monster/constants.js';

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

        if (enemyDef) this.applyEnemyDef(enemyType, textures, enemyDef);
        else this.applyLegacyDef(enemyType, textures);   // Fallback for compatibility

        this.initBasicState();
        this.initBehaviorState(x, z);
    }

    // 敵の定義（enemies.json）から、能力・感知・特徴・画像を決める（constructor の一部）
    applyEnemyDef(enemyType, textures, enemyDef) {
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
        
        this.resolveSprite(enemyType, textures, enemyDef);
    }

    // 画像（テクスチャ）・スプライトの材質・大きさ・HUD のアイコンを決める（applyEnemyDef の一部）
    resolveSprite(enemyType, textures, enemyDef) {
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

        this.iconUrl = ENEMY_ICON_MAP[texKey] || (enemyDef.imageFile ? `/images/enemies/${enemyDef.imageFile}` : `/images/enemies/${enemyType}.png`);
    }

    // 古い指定（定義が無いとき）の、スライム・スケルトン・ゴブリンアーチャー（constructor の一部）
    applyLegacyDef(enemyType, textures) {
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

        const { dx, dz, dist, dirX, dirZ, terr } = this.updateSenses(player, dt, colliders, visibility);

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
        if (this.updateTerritoryWander(terr, dt, colliders)) return;   // 打ち切り

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
        if (this.updateProfileBehaviors(dt, dist, player, scene, colliders, dirX, dirZ)) return;   // 打ち切り

        // =========================================================================
        // Distinct Movement AI Patterns
        // =========================================================================
        const behave = aiBehaviors[this.aiType] ?? aiBehaviors.walk_chase;
        if (behave) behave.call(this, { colliders, dirX, dirZ, dist, dt, player });

        // Apply vertical position (hopping / leaping height)
        this.sprite.position.y = this.baseY + this.floorY;

        // Projectile shooting logic for Archer / Mage
        this.updateShooting(dist, dt, dx, dz, player, projectiles, scene, soundFx);

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

}


// 部品の Monster のメソッドを、組み込む
Object.assign(Monster.prototype, monsterStageMethods, monsterInitMethods, monsterSenseMethods, monsterStatusMethods);

export { Projectile } from '/js/projectile.js';   // 飛び道具は /js/projectile.js（従来どおり、entities.js からも読める）
