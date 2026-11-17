// 冒険者の能力値から、最大 HP・最大 MP・移動速度・スタミナを決める。GameEngine のメソッド（this は GameEngine）。
//   元になるのは、player の race（種族）・abilities（能力値）・job（第一職業）・level（第一職業のレベル）。式は rules.js（仕様: character-spec 2〜8 章）。
//   冒険者の作成画面ができるまでは、初期値は public/data/player.json（人間・平均・ファイター Lv1）。
import * as R from '/js/game/rules.js';
import { TEST_RUN_SPEED_SCALE } from '/js/game/constants.js';

export const characterMethods = {
    // 定義（combat・damageTable・jobs・races）を、式に渡す形にまとめる（読み込み後に 1 回）
    setRules(combat, table, jobs, races) {
        this.rules = { combat, table, jobs, races };
    },

    // 初期の冒険者（player.json の race・abilities・job・level）を反映する
    applyCharacterDef(def) {
        const p = this.player;
        p.race = def.race;
        p.abilities = { ...def.abilities };
        p.job = def.job;
        p.level = def.level ?? 1;
        p.equip = { armor: null, helm: null, shield: null, ...def.equip };   // 防具（鎧・兜・盾）
    },

    // 最大 HP・MP・移動速度・最大スタミナを、能力値・職業・レベルから決め直す。fill が true なら、HP・MP・スタミナを満タンにする（そうでなければ、最大値を超えないように丸める）
    recomputeStats(fill = false) {
        const p = this.player, d = this.rules;
        if (!d || !p.abilities) return;
        const job = d.jobs[p.job];
        const hm = R.maxHpMp(d, p.race, p.abilities, p.level, job);
        const sp = R.moveSpeed(d, p.abilities.agi);
        p.maxHp = hm.hp;
        p.maxMp = hm.mp;
        p.maxStamina = R.staminaStats(d, p.abilities, p.level, 0, this.loadRatio()).max;
        const slow = R.loadSlowRatio(d, this.loadRatio());   // 積載の限界を超えると、歩く速さ・ダッシュが下がる
        p.speed = sp.walk * slow;
        p.runSpeed = sp.run * slow * TEST_RUN_SPEED_SCALE;   // テスト用の倍率を掛けてある
        if (fill) { p.hp = p.maxHp; p.mp = p.maxMp; p.stamina = p.maxStamina; }
        else { p.hp = Math.min(p.hp, p.maxHp); p.mp = Math.min(p.mp, p.maxMp); p.stamina = Math.min(p.stamina, p.maxStamina); }
    },

    // ---- 武器・魔法（式は rules.js）----

    // 武器の重さ。購入時に選べる範囲（weightRange）のうち、筋力で持てる最大（鈍器は 1.5 倍）。重さの選択（購入）ができるまでの仮の決め方
    weaponWeight(item) {
        const [lo, hi] = item.weightRange ?? [1, 1];
        const limit = R.equipWeightLimit(this.rules, this.player.abilities.str, item.blunt);
        return Math.max(lo, Math.min(hi, Math.floor(limit)));
    },

    // 筋力で持てるか（最小の重さが、持てる上限以下）
    canCarry(item) {
        if (!this.rules || !item?.weightRange) return true;
        return item.weightRange[0] <= R.equipWeightLimit(this.rules, this.player.abilities.str, item.blunt);
    },

    // 攻撃 1 回の結果。{ kind, damage }。呪いの間は、ダメージが下がる（curse の scale）
    rollWeaponAttack(weapon, opt = {}) {
        const p = this.player, d = this.rules, ab = p.abilities;
        const r = R.resolveAttack(d, { weapon, weight: this.weaponWeight(weapon), lv: p.level, job: d.jobs[p.job], str: ab.str, dex: ab.dex }, opt);
        const c = p.status?.curse;
        if (c?.t > 0) r.damage = Math.floor(r.damage * (c.scale ?? 0.7));
        return r;
    },

    // 魔法の消費 MP・失敗率・威力（杖・ロッドを持っていれば、杖のダイスの結果を攻撃値に足す）
    spellCost(spell) {
        const p = this.player;
        return R.magicCost(this.rules, spell, p.abilities.intel, p.level, this.rules.jobs[p.job]);
    },
    spellFailRate(spell) {
        const p = this.player;
        return R.magicFailRate(this.rules, spell, p.abilities.intel, p.level, this.rules.jobs[p.job]);
    },
    rollSpellPower(spell) {
        const p = this.player, focus = this.getFocusItem();
        const rod = focus?.dice ? R.rollDice(focus.dice.n, focus.dice.m).total : 0;
        return R.rollMagicPower(this.rules, spell, p.level, this.rules.jobs[p.job], rod);
    }
};
