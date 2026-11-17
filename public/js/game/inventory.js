// 所持品（道具）: 持つ・買う・使う。GameEngine のメソッド（this は GameEngine）。
//   仕様: docs/item-spec.md 1 章（所持品: 種類 99・各 99 個まで）・5 章（最小セット: 回復量は、重さ＋ダイスをダメージ表に通す）。データは items.json の consumable・key。
//   player.inventory = { アイテム ID: 個数 }（保存データの inventory と同じ形）。
//   使うのは「道具」ダイアログから（失敗しない）。自動使用（item-spec 4 章）・預かり・売却は、仕様が未決なので、まだない。
//   武器・防具の所持（持っているものだけ装備できる）は、まだない（いまは、定義済みの全部から選べる）。
import * as R from '/js/game/rules.js';

export const MAX_KINDS = 99;   // 持てる種類
export const MAX_COUNT = 99;   // 1 種類ごとの個数

export const inventoryMethods = {
    itemCount(id) {
        return this.player.inventory[id] ?? 0;
    },

    // 持ち物に足す。実際に足せた個数を返す（種類・個数の上限まで）
    addItem(id, n = 1) {
        const inv = this.player.inventory;
        if (!(id in inv) && Object.keys(inv).length >= MAX_KINDS) return 0;
        const added = Math.max(0, Math.min(n, MAX_COUNT - (inv[id] ?? 0)));
        if (added > 0) inv[id] = (inv[id] ?? 0) + added;
        return added;
    },

    // 持ち物から減らす。足りなければ false
    removeItem(id, n = 1) {
        const inv = this.player.inventory;
        if ((inv[id] ?? 0) < n) return false;
        inv[id] -= n;
        if (inv[id] <= 0) delete inv[id];
        return true;
    },

    // 道具屋・神殿で買う（good = shops.json の goods の 1 件。itemId と price）。{ ok, message }
    buyItem(good) {
        const p = this.player, it = this.items[good.itemId];
        if (!it) return { ok: false, message: '買えません' };
        if (this.itemCount(good.itemId) >= MAX_COUNT) return { ok: false, message: `${it.name}は、これ以上持てません（${MAX_COUNT} 個まで）` };
        if (!(good.itemId in p.inventory) && Object.keys(p.inventory).length >= MAX_KINDS) return { ok: false, message: `持てる種類が、いっぱいです（${MAX_KINDS} 種類まで）` };
        if ((p.gold ?? 0) < good.price) return { ok: false, message: `お金が足りません（${good.price}G・所持 ${p.gold ?? 0}G）` };
        p.gold -= good.price;
        this.addItem(good.itemId, 1);
        this.updateUI?.();   // 所持金の表示
        return { ok: true, message: `${it.name}を買いました（${good.price}G・所持 ${this.itemCount(good.itemId)} 個）` };
    },

    // 回復道具の効果の倍率（薬師・医術師のレベルで増える。jobs.json の healItemRatePerLevel。魔法のヒールには掛けない）
    healItemRate() {
        let rate = 1;
        for (const [id, lv] of Object.entries(this.player.jobs.levels)) rate += lv * (this.rules.jobs[id]?.healItemRatePerLevel ?? 0);
        return rate;
    },

    // 回復量（重さ＋ダイスを、ダメージ表に通す。道具にレベル加算はない）× 薬師・医術師の倍率
    rollHealAmount(effect) {
        const r = R.rollDice(effect.dice.n, effect.dice.m);
        return Math.floor(R.tableValue(this.rules, effect.weight, r.total + effect.dice.k) * this.healItemRate());
    },

    // 道具を使う。使えた（効果が出た）ときだけ、1 個減る。{ ok, message }
    useItem(id) {
        const it = this.items[id], p = this.player, e = it?.effect;
        if (!it || !e || this.itemCount(id) < 1) return { ok: false, message: '使えません' };
        const done = (message) => { this.removeItem(id, 1); this.updateEquipHud(); this.updateUI?.(); return { ok: true, message }; };   // 一時停止中（ダイアログ）も、HP などの表示を更新する
        switch (e.type) {
            case 'heal_hp': {
                if (p.hp >= p.maxHp) return { ok: false, message: 'HPは満タンです' };
                const before = p.hp; p.hp = Math.min(p.maxHp, p.hp + this.rollHealAmount(e));
                return done(`${it.name}を使いました（HP +${Math.round(p.hp - before)}）`);
            }
            case 'heal_mp': {
                if (p.mp >= p.maxMp) return { ok: false, message: 'MPは満タンです' };
                const before = p.mp; p.mp = Math.min(p.maxMp, p.mp + this.rollHealAmount(e));
                return done(`${it.name}を使いました（MP +${Math.round(p.mp - before)}）`);
            }
            case 'heal_stamina': {   // 回復停止（敵の攻撃）も打ち消す
                if (p.stamina >= p.maxStamina && !p.staminaExhausted) return { ok: false, message: 'スタミナは満タンです' };
                const before = p.stamina; p.stamina = Math.min(p.maxStamina, p.stamina + this.rollHealAmount(e));
                p.staminaPause = 0;
                if (p.staminaExhausted && p.stamina >= p.maxStamina * this.staminaDef.resumeRatio) p.staminaExhausted = false;
                return done(`${it.name}を使いました（スタミナ +${Math.round(p.stamina - before)}）`);
            }
            case 'regen_boost':   // 疲労回復の香: 一定時間、スタミナの自然回復が増える。回復遅延も打ち消す
                p.buffs = { ...p.buffs, staminaRegenRate: { t: e.duration, rate: e.rate } };
                if (e.cureRegenDelay) p.staminaPause = 0;
                return done(`${it.name}を使いました（${e.duration}秒間、スタミナの回復が ${e.rate} 倍）`);
            case 'cure_poison': case 'cure_venom':   // 猛毒の状態は、まだない（毒だけ）
                if (!(p.status?.poison?.t > 0)) return { ok: false, message: '毒にかかっていません' };
                delete p.status.poison;
                return done(`${it.name}を使いました（毒が治りました）`);
            case 'cure_paralysis':
                if (!(p.status?.paralysis?.t > 0)) return { ok: false, message: '麻痺していません' };
                delete p.status.paralysis;
                return done(`${it.name}を使いました（麻痺が治りました）`);
            case 'revive': return { ok: false, message: '戦闘不能のときに使う道具です（いまは使えません）' };
            case 'return_town': return { ok: false, message: '帰還の機能は、まだありません' };
            default: return { ok: false, message: 'いまは使えません' };
        }
    }
};
