// 敵の状態異常（燃焼・鈍足）・スタン・被ダメージ・死亡の演出。Monster の静的メソッド（public/js/entities.js が、クラスの定義のあとで、Monster へ組み込む）。
// 元は public/js/entities.js の Monster。移しただけで、動きは同じ（ファイルが長すぎて、編集の誤りが増えるため分割した）
import { HIT_FLASH_TIME, DEATH_FLASH_TIME, DEATH_FALL_END, DEATH_DURATION } from '/js/monster/constants.js';

export const monsterStatusMethods = {
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
    },

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
    },

    // 魔法の属性 element（fire / ice / holy / none ...）が、この敵に効かないか。無属性（none・未指定）は、いつも効く。
    //   immune に 'elemental' があれば、無属性以外のすべての属性が効かない（ガーゴイル）
    isImmuneTo(element) {
        const im = this.profile?.immune;
        if (!im || im.size === 0 || !element || element === 'none') return false;
        return im.has('elemental') || im.has(element);
    },

    // 燃焼で溜まったダメージを受け取る（game.js が takeDamage して、倒したら経験値を与える）
    consumeBurnDamage() {
        const d = this.pendingBurn;
        this.pendingBurn = 0;
        return d;
    },

    // 一定時間、AI（移動・攻撃・射撃）を止める。長い方を優先する
    stun(seconds) {
        this.stunTimer = Math.max(this.stunTimer, seconds);
    },

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
    },

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
    },
};
