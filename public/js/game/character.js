// 冒険者の能力値から、最大 HP・最大 MP・移動速度・スタミナを決める。GameEngine のメソッド（this は GameEngine）。
//   元になるのは、player の race（種族）・abilities（能力値）・job（第一職業）・level（第一職業のレベル）。式は rules.js（仕様: character-spec 2〜8 章）。
//   冒険者の作成画面ができるまでは、初期値は public/data/player.json（人間・平均・ファイター Lv1）。
import * as R from '/js/game/rules.js';
import { TEST_RUN_SPEED_SCALE } from '/js/game/constants.js';

const TEMP_LOAD_RATIO = 0.8;   // 仮: 重量比。武器・防具の重さがゲームにつながるまで、「適正な装備」（0.8）で計算する

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
    },

    // いまの重量比（仮の固定値）
    loadRatio() {
        return TEMP_LOAD_RATIO;
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
        p.speed = sp.walk;
        p.runSpeed = sp.run * TEST_RUN_SPEED_SCALE;   // テスト用の倍率を掛けてある
        if (fill) { p.hp = p.maxHp; p.mp = p.maxMp; p.stamina = p.maxStamina; }
        else { p.hp = Math.min(p.hp, p.maxHp); p.mp = Math.min(p.mp, p.maxMp); p.stamina = Math.min(p.stamina, p.maxStamina); }
    }
};
