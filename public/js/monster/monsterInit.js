// 敵の初期状態（スプライト・タイマー・状態の変数）。Monster のメソッド（this は Monster。public/js/entities.js が、クラスの定義のあとで、Monster.prototype へ組み込む）。
// 元は Monster.constructor の中の段階。移しただけで、動きは同じ（長すぎて、編集の誤りが増えるため分割した）
import * as THREE from '/js/three.module.js';

export const monsterInitMethods = {
    initBasicState() {
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
    },

    initBehaviorState(x, z) {
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
    },
};
