// 防具（鎧・兜・盾）の装備、積載（重量比）、被弾のときの防御・回避。GameEngine のメソッド（this は GameEngine）。
//   仕様: docs/character-spec.md 8.1（装備できる重さ）・8.2e（積載）・8.3（防御）・8.3b（回避）・8.5（1 ゾロ）。式は rules.js。
//   防具の定義は equipment.json（armors・helms・shields）。player.equip = { armor, helm, shield }（ID または null）。
//   重さは、購入時に選べる範囲（weight）のうち、筋力で持てる最大（購入で選べるようになるまでの仮の決め方。武器と同じ）。
import * as R from '/js/game/rules.js';

export const GEAR_KINDS = ['armor', 'helm', 'shield'];
export const GEAR_NAMES = { armor: '鎧', helm: '兜', shield: '盾' };
const LIST_KEY = { armor: 'armors', helm: 'helms', shield: 'shields' };

export const gearMethods = {
    // 防具の定義（equipment.json）を、種類ごとの ID の表にする
    setGearDefs(equipment) {
        this.gearDefs = {};
        for (const k of GEAR_KINDS) this.gearDefs[k] = Object.fromEntries((equipment[LIST_KEY[k]] ?? []).map((g) => [g.id, g]));
    },

    // 種類ごとの定義の一覧（装備の選択画面用）
    gearList(kind) {
        return Object.values(this.gearDefs?.[kind] ?? {});
    },

    gearDef(kind, id) {
        return (id && this.gearDefs?.[kind]?.[id]) || null;
    },

    // 防具の重さ（筋力で持てる最大。範囲内）
    gearWeight(def) {
        const limit = Math.floor(R.equipWeightLimit(this.rules, this.player.abilities.str, false));
        return Math.max(def.weight[0], Math.min(def.weight[1], limit));
    },

    // 筋力で持てるか（最小の重さが、持てる上限以下）
    canWear(def) {
        return def.weight[0] <= R.equipWeightLimit(this.rules, this.player.abilities.str, false);
    },

    // 防具を着ける・外す（id が null なら外す）。着けられなければ false（理由は、ポップアップに出す）
    equipGear(kind, id) {
        const p = this.player;
        if (!GEAR_KINDS.includes(kind)) return false;
        if (id !== null) {
            const def = this.gearDef(kind, id);
            if (!def) { console.warn(`未定義の${GEAR_NAMES[kind]}です: ${id}`); return false; }
            if (!this.canWear(def)) { this.addPopup('重すぎて装備できない', '#f87171'); return false; }
            if (kind === 'shield' && this.getMeleeItem()?.twoHanded) { this.addPopup('両手武器は、盾と同時に装備できない', '#f87171'); return false; }
        }
        p.equip = { ...p.equip, [kind]: id };
        this.updateEquipHud();
        return true;
    },

    // いま着けている防具（定義・重さ・ダイス・重装備か）
    gearParts() {
        const out = [];
        for (const k of GEAR_KINDS) {
            const def = this.gearDef(k, this.player.equip?.[k]);
            if (def) out.push({ kind: k, id: def.id, weight: this.gearWeight(def), dice: def.dice, heavy: !!def.heavy });
        }
        return out;
    },

    // 重量合計（武器＋鎧＋兜＋盾。道具は含めない）と重量比
    totalWeight() {
        const melee = this.getMeleeItem();
        return this.gearParts().reduce((s, g) => s + g.weight, 0) + (melee ? this.weaponWeight(melee) : 0);
    },
    loadRatio() {
        if (!this.rules || !this.player.abilities) return 0.8;
        return this.totalWeight() / R.loadLimit(this.rules, this.player.abilities.str, this.player.level);
    },

    // 敵の攻撃 1 回の値（防御前）。敵の攻撃のダイス（enemies.json の stats.attack）を振って、ダメージ表に通す。なければ、攻撃力の固定値
    monsterAttackValue(monster) {
        const a = monster.stats?.attack;
        if (!a || !this.rules) return monster.attackPower;
        return R.rollAttack(this.rules, { dice: a.dice }, a.weight, monster.stats.level, null).damage;
    },

    // 被弾の軽減（敵の攻撃・弾・ブレス。罠・落下には使わない）。攻撃 − 防御 − 生命力 ÷ 5 − 回避（最低 1）
    //   防御は、被弾のたびに防具のダイスを振って決める。防御で 1 ゾロが出たら、相手の攻撃は必ずクリティカル（1.5 倍）で、回避は 0
    //   金属製の重装備（heavy）を着けていると、回避は無効（ナイトは有効）
    reduceByDefense(amount) {
        const p = this.player, d = this.rules;
        if (!d || !p.abilities) return amount;
        const job = d.jobs[p.job];
        const parts = this.gearParts();
        const def = parts.length ? R.rollDefense(d, parts, job) : { defense: 0, fumble: false };
        const attack = def.fumble ? Math.floor(amount * d.combat.critDamageMultiplier) : amount;
        return R.damageTaken(d, attack, {
            defense: def.defense, vit: p.abilities.vit, dodge: R.dodgeValue(d, p.abilities.agi, p.level, job),
            heavy: parts.some((g) => g.heavy), heavyDodge: !!job?.heavyDodge, fumble: def.fumble
        });
    }
};
