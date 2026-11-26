// 冒険者の能力値から、最大 HP・最大 MP・移動速度・スタミナを決める。GameEngine のメソッド（this は GameEngine）。
//   元になるのは、player の race（種族）・abilities（能力値）・jobs（第一職業とそのレベル。jobs.js）。式は rules.js（仕様: character-spec 2〜8 章）。
//   冒険者の作成画面ができるまでは、初期値は public/data/player.json（人間・平均・ファイター Lv1）。
import * as R from '/js/game/rules.js';
import { TEST_RUN_SPEED_SCALE } from '/js/game/constants.js';

export const characterMethods = {
    // 定義（combat・damageTable・jobs・races）を、式に渡す形にまとめる（読み込み後に 1 回）
    setRules(combat, table, jobs, races, maxLevel = 99) {
        this.rules = { combat, table, jobs, races, maxLevel };
    },

    // 初期の冒険者（player.json の race・abilities・job・level）を反映する
    applyCharacterDef(def) {
        const p = this.player;
        p.race = def.race;
        p.abilities = { ...def.abilities };
        p.jobs = { primary: def.jobs.primary, sub: def.jobs.sub ?? null, levels: { ...def.jobs.levels }, expStock: def.jobs.expStock ?? 0 };   // 職業（第一・サブ・レベル・経験値のストック）
        this.syncJob();   // 戦闘の式が見る player.job・player.level
        p.equip = { armor: null, helm: null, shield: null, accessory: null, ...def.equip };   // 防具（鎧・兜・盾）とアクセサリ
        p.owned = { ...(def.owned ?? {}) };   // 持っている武器・防具: ID → 購入時に決めた重さ（gear.js）
        p.accessories = [...(def.accessories ?? [])];   // 持っているアクセサリの ID（accessory.js）
        p.inventory = { ...(def.inventory ?? {}) };   // 所持品（道具）: ID → 個数（inventory.js）
        p.magics = [...(def.magics ?? [])];   // 覚えている魔法（呪文の ID）。ストックに入れられるのは、覚えた呪文だけ
    },

    // 最大 HP・MP・移動速度・最大スタミナを、能力値・職業・レベルから決め直す。fill が true なら、HP・MP・スタミナを満タンにする（そうでなければ、最大値を超えないように丸める）
    recomputeStats(fill = false) {
        const p = this.player, d = this.rules;
        if (!d || !p.abilities) return;
        const job = d.jobs[p.job];
        const ab = this.effAbilities();   // アクセサリの補正込みの能力値（accessory.js）
        const hm = R.maxHpMp(d, p.race, ab, p.level, job);
        const sp = R.moveSpeed(d, ab.agi);
        p.maxHp = hm.hp;
        p.maxMp = this.accMaxMp(hm.mp);
        p.maxStamina = R.staminaStats(d, ab, p.level, 0, this.loadRatio()).max;
        const slow = R.loadSlowRatio(d, this.loadRatio());   // 積載の限界を超えると、歩く速さ・ダッシュが下がる
        p.speed = sp.walk * slow * this.accSpeedRate();
        p.runSpeed = sp.run * slow * this.accSpeedRate() * TEST_RUN_SPEED_SCALE;   // テスト用の倍率を掛けてある
        if (fill) { p.hp = p.maxHp; p.mp = p.maxMp; p.stamina = p.maxStamina; }
        else { p.hp = Math.min(p.hp, p.maxHp); p.mp = Math.min(p.mp, p.maxMp); p.stamina = Math.min(p.stamina, p.maxStamina); }
    },

    // ---- 武器・魔法（式は rules.js）----

    // 武器の重さ。持っている武器は、購入時に選んだ重さ。持っていないもの（素手など）は、購入で選べる範囲（weightRange）のうち、筋力で持てる最大（鈍器は 1.5 倍）
    weaponWeight(item) {
        const own = this.player.owned?.[item.id];
        if (own !== undefined) return own;
        const [lo, hi] = item.weightRange ?? [1, 1];
        const limit = R.equipWeightLimit(this.rules, this.player.abilities.str, item.blunt);
        return Math.max(lo, Math.min(hi, Math.floor(limit)));
    },

    // 筋力で持てるか。持っている武器は、選んだ重さで判定する。持っていないものは、最小の重さが、持てる上限以下か
    canCarry(item) {
        if (!this.rules || !item?.weightRange) return true;
        const limit = R.equipWeightLimit(this.rules, this.player.abilities.str, item.blunt);
        const own = this.player.owned?.[item.id];
        return (own !== undefined ? own : item.weightRange[0]) <= limit;
    },

    // 攻撃 1 回の結果。{ kind, damage }。呪いの間は、ダメージが下がる（curse の scale）
    // 武器の +値（0〜plusMax）。player.plus: 武器 ID → +値。入手は未決（いまは givePlus でデバッグ用に付ける）
    weaponPlus(id) { return this.player.plus?.[id] ?? 0; },
    // 画面に出す名前。武器は +値があれば「ロングソード+2」
    itemLabel(it) { const n = it.kind === 'weapon' ? this.weaponPlus(it.id) : 0; return n > 0 ? `${it.name}+${n}` : it.name; },
    givePlus(id, n) {
        const max = this.rules.combat.plusMax ?? 3;
        this.player.plus = { ...(this.player.plus ?? {}), [id]: Math.max(0, Math.min(max, n | 0)) };
    },

    rollWeaponAttack(weapon, opt = {}) {
        const p = this.player, d = this.rules, ab = this.effAbilities();
        const r = R.resolveAttack(d, { weapon, weight: this.weaponWeight(weapon), lv: p.level, job: d.jobs[p.job], str: ab.str, dex: ab.dex, loadRatio: this.loadRatio(), plus: this.weaponPlus(weapon.id) }, opt);   // lv は ctx に入っている
        const c = p.status?.curse;
        if (c?.t > 0) r.damage = Math.floor(r.damage * (c.scale ?? 0.7));
        return r;
    },

    // 魔法の消費 MP・失敗率・威力。魔法力の元は、攻撃魔法は知力、回復・補助魔法は精神力（補助は、仕様に定めがないので、回復と同じ）
    spellStat(spell) {
        const ab = this.effAbilities();
        return spell.magicKind === 'attack' ? ab.intel : ab.mnd;
    },
    spellCost(spell) {
        const p = this.player;
        return this.accSpellCost(R.magicCost(this.rules, spell, this.spellStat(spell), p.level, this.rules.jobs[p.job]));
    },
    spellFailRate(spell) {
        const p = this.player;
        return R.magicFailRate(this.rules, spell, this.spellStat(spell), p.level, this.rules.jobs[p.job]);
    },
    // 威力（攻撃魔法は、杖のダイスの結果を足す。回復魔法は、足さない）
    rollSpellPower(spell) {
        const p = this.player, focus = spell.magicKind === 'attack' ? this.getFocusItem() : null;
        const rod = focus?.dice ? R.rollDice(focus.dice.n, focus.dice.m).total : 0;
        return this.accSpellPower(R.rollMagicPower(this.rules, spell, p.level, this.rules.jobs[p.job], rod));
    },

    // 回復魔法が、使う意味のない状態（満タン）なら、その理由。使えるなら null
    selfSpellUseless(spell) {
        const p = this.player;
        if (spell.type !== 'heal') return null;
        if (spell.target === 'stamina') return (p.stamina >= p.maxStamina && !p.staminaExhausted) ? 'スタミナは満タンです' : null;
        return p.hp >= p.maxHp ? 'HPは満タンです' : null;
    },

    // 自分に使う魔法（回復: HP またはスタミナを power だけ回復。補助: 効果を、決まった時間つける）
    castSelfSpell(spell, power) {
        const p = this.player;
        if (spell.type === 'heal' && spell.target === 'stamina') {
            const before = p.stamina;
            p.stamina = Math.min(p.maxStamina, p.stamina + power);
            if (p.staminaExhausted && p.stamina >= p.maxStamina * this.staminaDef.resumeRatio) p.staminaExhausted = false;
            this.addPopup(`スタミナ +${Math.round(p.stamina - before)}`, '#facc15');
        } else if (spell.type === 'heal') {
            const before = p.hp;
            p.hp = Math.min(p.maxHp, p.hp + power);
            this.addPopup(`HP +${Math.round(p.hp - before)}`, '#4ade80');
        } else if (spell.effect) {
            p.buffs = { ...p.buffs, [spell.effect.type]: { t: spell.effect.duration, rate: spell.effect.rate } };   // 同じ効果は、時間をつけ直す
            this.addPopup(`${spell.name}！ ${spell.effect.duration}秒`, '#60a5fa');
        }
        if (spell.style && this.spellEffects) this.spellEffects.selfCast(spell.style, p.x, p.z, { color: spell.color, scale: spell.scale ?? 1 });   // コードで描く演出（selfSpellEffect.js）
        else this.particles.spawnBurst(p.x, 1.0, p.z, parseInt(spell.color.slice(1), 16), 14, 3.0);
        this.sound.playHeal?.();
    },

    // デバッグ・テスト用: 使える魔法を、全部覚えている状態にする
    giveAllMagics() {
        this.player.magics = Object.values(this.items).filter((i) => i.kind === 'spell').map((i) => i.id);
        this.updateEquipHud();
    },

    // ---- 魔法を覚える（魔法ギルドで買う／宝箱などで取得する）----
    isSpellLearned(id) {
        return this.player.magics.includes(id);
    },

    // 魔法を覚える。{ ok, message }
    learnSpell(id) {
        const it = this.items[id];
        if (!it || it.kind !== 'spell') return { ok: false, message: '覚えられません' };
        if (this.isSpellLearned(id)) return { ok: false, message: `${it.name}は、すでに覚えています` };
        this.player.magics.push(id);
        this.updateEquipHud();
        return { ok: true, message: `${it.name}を覚えました` };
    },

    // 魔法ギルドで買う（good = shops.json の goods の 1 件。spellId と price）。買い切りで、売れない
    buySpell(good) {
        const p = this.player;
        if (this.isSpellLearned(good.spellId)) return { ok: false, message: `${good.name}は、すでに覚えています` };
        if ((p.gold ?? 0) < good.price) return { ok: false, message: `お金が足りません（${good.price}G・所持 ${p.gold ?? 0}G）` };
        const r = this.learnSpell(good.spellId);
        if (r.ok) { p.gold -= good.price; this.updateUI?.(); }
        return r.ok ? { ok: true, message: `${good.name}を買って、覚えました（${good.price}G）` } : r;
    }
};
