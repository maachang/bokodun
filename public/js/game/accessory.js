// アクセサリ（装備 1 枠）。GameEngine のメソッド（this は GameEngine）。
//   仕様: docs/item-spec.md 8 章。定義は equipment.json の accessories（石の名前だけ・ランク・effects）。
//   player.equip.accessory = ID または null。player.accessories = 持っているアクセサリの ID の配列（重さはない）。
//   入手（店・宝箱）は未決。いまは giveAllAccessories（デバッグ用）で持つ。
//   効果（effects）の働きは、段階的に実装する。ここは、持つ・着ける・説明の文だけ。

const STAT_NAMES = { dex: '器用度', agi: '敏捷度', str: '筋力', vit: '生命力', intel: '知力', mnd: '精神力', end: '持久力' };
const ELEM_NAMES = { fire: '炎', ice: '氷', thunder: '雷', holy: '聖', dark: '闇', poison: '毒' };
const STATUS_NAMES = { poison: '毒', paralysis: '麻痺' };

// 効果 1 つの説明文（装備の選択画面用）
export function effectText(e) {
    const el = () => (e.elements.length >= Object.keys(ELEM_NAMES).length ? '全部' : e.elements.map((x) => ELEM_NAMES[x]).join('・')) + '属性';
    switch (e.type) {
        case 'stat': return Object.entries(e.stats).map(([k, v]) => `${STAT_NAMES[k]} +${v}`).join('、');
        case 'immuneStatus': return `${STATUS_NAMES[e.status]}を無効`;
        case 'regen': return `${e.intervalSec}秒ごとに最大HP ${e.hpPct}%${e.mpPct ? `・最大MP ${e.mpPct}%` : ''}回復`;
        case 'speed': return `歩く速さ +${e.pct}%`;
        case 'attackElement': return `攻撃に${el()}が付く`;
        case 'guardElement': return `${el()}のダメージ -${e.reducePct}%`;
        case 'nullElement': return `${el()}のダメージを無効`;
        case 'maxMp': return `最大MP +${e.pct}%`;
        case 'spellCost': return `呪文の消費MP ×${e.rate}`;
        case 'spellPower': return `呪文の威力 ×${e.rate}`;
        case 'float': return '絶えず浮遊（地面のダメージを受けない）';
        case 'chargeAttackRate': return `突進攻撃が ${e.rate} 倍`;
        default: return e.type;
    }
}

export const accessoryMethods = {
    // 定義（equipment.json の accessories）を、ID の表にする
    setAccessoryDefs(equipment) {
        this.accDefs = Object.fromEntries((equipment.accessories ?? []).map((a) => [a.id, a]));
    },

    accessoryList() {
        return Object.values(this.accDefs ?? {});
    },

    accessoryDef(id) {
        return (id && this.accDefs?.[id]) || null;
    },

    hasAccessory(id) {
        return !!this.player.accessories?.includes(id);
    },

    // 着けているアクセサリの効果の一覧（なければ空）
    accessoryEffects() {
        return this.accessoryDef(this.player.equip?.accessory)?.effects ?? [];
    },

    // 着けているアクセサリの、type ごとの効果（例: 'stat'）
    accEffectsOf(type) {
        return this.accessoryEffects().filter((e) => e.type === type);
    },

    // 能力値（装備の補正込み）。計算には、これを使う。保存・訓練・表示の基本値は player.abilities（アクセサリの補正は含まない）。上限は 50
    effAbilities() {
        const base = this.player.abilities;
        const out = { ...base };
        for (const e of this.accEffectsOf('stat')) for (const [k, v] of Object.entries(e.stats)) if (k in out) out[k] = Math.min(50, out[k] + v);
        return out;
    },

    // 最大MP・歩く速さの倍率（recomputeStats が使う）
    accMaxMp(maxMp) {
        return this.accEffectsOf('maxMp').reduce((m, e) => m + Math.max(e.min ?? 0, Math.floor(maxMp * e.pct / 100)), maxMp);
    },
    accSpeedRate() {
        return this.accEffectsOf('speed').reduce((r, e) => r + e.pct / 100, 1);
    },

    // 呪文の消費MP・威力への倍率（最低 1）
    accSpellCost(cost) {
        return this.accEffectsOf('spellCost').reduce((c, e) => Math.max(1, c * e.rate), cost);
    },
    accSpellPower(power) {
        return this.accEffectsOf('spellPower').reduce((v, e) => Math.max(1, Math.floor(v * e.rate)), power);
    },

    // 状態異常を無効にするか（毒・麻痺。猛毒は毒の無効では防がない）
    isStatusImmune(type) {
        return this.accEffectsOf('immuneStatus').some((e) => e.status === type);
    },

    // 一定時間ごとの回復（珊瑚・アレキサンドライト）。updateStamina から、毎フレーム呼ぶ
    updateAccessoryRegen(dt) {
        const p = this.player;
        for (const e of this.accEffectsOf('regen')) {
            p.accRegenT = (p.accRegenT ?? 0) + dt;
            if (p.accRegenT < e.intervalSec) continue;
            p.accRegenT -= e.intervalSec;
            if (p.hp > 0) p.hp = Math.min(p.maxHp, p.hp + Math.max(e.min ?? 1, Math.floor(p.maxHp * e.hpPct / 100)));
            if (e.mpPct) p.mp = Math.min(p.maxMp, p.mp + Math.max(e.min ?? 1, Math.floor(p.maxMp * e.mpPct / 100)));
        }
        if (!this.accEffectsOf('regen').length) p.accRegenT = 0;
    },

    // 説明文（ランク・効果。暫定の数値には「暫定」を添える）
    accessoryInfo(def) {
        return `${def.rank}　${def.effects.map(effectText).join('、')}${def.provisional ? '（暫定）' : ''}`;
    },

    // 着ける・外す（id が null なら外す）。持っていなければ false
    equipAccessory(id) {
        if (id !== null) {
            if (!this.accessoryDef(id)) { console.warn(`未定義のアクセサリです: ${id}`); return false; }
            if (!this.hasAccessory(id)) { this.addPopup('まだ持っていません', '#f87171'); return false; }
        }
        this.player.equip = { ...this.player.equip, accessory: id };
        this.recomputeStats?.();   // 能力値・最大MP・速さに効くものがあるため
        this.updateEquipHud();
        return true;
    },

    // デバッグ・テスト用: 定義済みのアクセサリを、全部持っている状態にする（入手の仕組みは未決）
    giveAllAccessories() {
        this.player.accessories = this.accessoryList().map((a) => a.id);
    }
};
