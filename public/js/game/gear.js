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
        this.setAccessoryDefs(equipment);   // アクセサリ（accessory.js）
    },

    // 種類ごとの定義の一覧（装備の選択画面用）
    gearList(kind) {
        return Object.values(this.gearDefs?.[kind] ?? {});
    },

    gearDef(kind, id) {
        return (id && this.gearDefs?.[kind]?.[id]) || null;
    },

    // 防具の重さ。持っている防具は、購入時に選んだ重さ。それ以外は、筋力で持てる最大（範囲内）
    gearWeight(def) {
        const own = this.player.owned?.[def.id];
        if (own !== undefined) return own;
        const limit = Math.floor(R.equipWeightLimit(this.rules, this.effAbilities().str, false));
        return Math.max(def.weight[0], Math.min(def.weight[1], limit));
    },

    // 筋力で持てるか。持っている防具は、選んだ重さで判定する
    canWear(def) {
        const own = this.player.owned?.[def.id];
        return (own !== undefined ? own : def.weight[0]) <= R.equipWeightLimit(this.rules, this.effAbilities().str, false);
    },

    // ---- 武器・防具の所持と購入（武器屋）----
    isOwned(id) {
        return this.player.owned?.[id] !== undefined;
    },

    // 武器・防具の定義（武器は items、防具は gearDefs）。種類（weapon / armor / helm / shield）と、定義
    equipDefOf(id) {
        if (this.items[id]?.kind === 'weapon') return { kind: 'weapon', def: this.items[id], range: this.items[id].weightRange };
        for (const k of GEAR_KINDS) if (this.gearDefs?.[k]?.[id]) return { kind: k, def: this.gearDefs[k][id], range: this.gearDefs[k][id].weight };
        return null;
    },

    // 購入価格 ＝ 重さ² × 係数 × (ダイスの平均 ÷ 7)（10 単位）。重い装備ほど高い
    equipPrice(id, weight) {
        const e = this.equipDefOf(id);
        return R.equipmentPrice(this.rules, e.kind, weight, e.def.dice);
    },

    // 買うときの重さの初期値（購入で選べる範囲のうち、筋力で持てる最大。持てなければ、最小）
    defaultBuyWeight(id) {
        const [lo, hi] = this.equipDefOf(id).range;
        const limit = Math.floor(R.equipWeightLimit(this.rules, this.effAbilities().str, !!this.equipDefOf(id).def.blunt));
        return Math.max(lo, Math.min(hi, limit));
    },

    // 武器屋で買う（重さを選ぶ）。店は、重さの制限なく売る（筋力で持てない重さも買えるが、装備はできない）。同じものを買い直すと、重さが入れ替わる。{ ok, message }
    buyEquipment(id, weight) {
        const e = this.equipDefOf(id), p = this.player;
        if (!e) return { ok: false, message: '買えません' };
        if (!Number.isInteger(weight) || weight < e.range[0] || weight > e.range[1]) return { ok: false, message: `重さは ${e.range[0]}〜${e.range[1]} から選びます` };
        if (p.owned[id] === weight) return { ok: false, message: `${e.def.name}（重さ ${weight}）は、すでに持っています` };
        const price = this.equipPrice(id, weight);
        if ((p.gold ?? 0) < price) return { ok: false, message: `お金が足りません（${price}G・所持 ${p.gold ?? 0}G）` };
        p.gold -= price;
        const replaced = p.owned[id] !== undefined;
        p.owned[id] = weight;
        // 買い直しで、筋力で持てない重さになった装備は、外れる（選んでいる武器・着けている防具）
        for (const k of ['selMelee', 'selFocus']) if (p[k] !== null && p.stock[p[k]] === id && !this.canCarry(this.items[id])) p[k] = null;
        for (const k of GEAR_KINDS) if (p.equip?.[k] === id && !this.canWear(this.gearDef(k, id))) p.equip = { ...p.equip, [k]: null };
        this.updateEquipHud();
        this.updateUI?.();
        return { ok: true, message: `${e.def.name}（重さ ${weight}）を${replaced ? '買い直しました' : '買いました'}（${price}G）` };
    },

    // デバッグ・テスト用: 定義済みの武器・防具を、全部持っている状態にする（重さは、筋力で持てる最大）
    giveAllEquipment() {
        const ids = [...Object.values(this.items).filter((i) => i.kind === 'weapon' && i.id !== 'fists').map((i) => i.id), ...GEAR_KINDS.flatMap((k) => Object.keys(this.gearDefs[k]))];
        for (const id of ids) delete this.player.owned[id];   // いったん持っていない扱いにして、既定の重さを決める
        for (const id of ids) this.player.owned[id] = this.defaultBuyWeight(id);
    },

    // 防具を着ける・外す（id が null なら外す）。着けられなければ false（理由は、ポップアップに出す）
    equipGear(kind, id) {
        const p = this.player;
        if (!GEAR_KINDS.includes(kind)) return false;
        if (id !== null) {
            const def = this.gearDef(kind, id);
            if (!def) { console.warn(`未定義の${GEAR_NAMES[kind]}です: ${id}`); return false; }
            if (!this.isOwned(id)) { this.addPopup('まだ持っていません', '#f87171'); return false; }   // 持っている防具だけ着けられる
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
        return this.totalWeight() / R.loadLimit(this.rules, this.effAbilities().str, this.player.level);
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
        const guard = p.buffs?.defenseRate;   // プロテクション: 防御値が上がる
        if (guard?.t > 0) def.defense = Math.floor(def.defense * guard.rate);
        const attack = def.fumble ? Math.floor(amount * d.combat.critDamageMultiplier) : amount;
        return R.damageTaken(d, attack, {
            defense: def.defense, vit: this.effAbilities().vit, dodge: R.dodgeValue(d, this.effAbilities().agi, p.level, job),
            heavy: parts.some((g) => g.heavy), heavyDodge: !!job?.heavyDodge, fumble: def.fumble
        });
    }
};
