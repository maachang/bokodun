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
        p.equip = { armor: null, helm: null, shield: null, ...def.equip };   // 防具（鎧・兜・盾）
        p.inventory = { ...(def.inventory ?? {}) };   // 所持品（道具）: ID → 個数（inventory.js）
        p.magics = [...(def.magics ?? [])];   // 覚えている魔法（呪文の ID）。ストックに入れられるのは、覚えた呪文だけ
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

    // 魔法の消費 MP・失敗率・威力。魔法力の元は、攻撃魔法は知力、回復・補助魔法は精神力（補助は、仕様に定めがないので、回復と同じ）
    spellStat(spell) {
        const ab = this.player.abilities;
        return spell.magicKind === 'attack' ? ab.intel : ab.mnd;
    },
    spellCost(spell) {
        const p = this.player;
        return R.magicCost(this.rules, spell, this.spellStat(spell), p.level, this.rules.jobs[p.job]);
    },
    spellFailRate(spell) {
        const p = this.player;
        return R.magicFailRate(this.rules, spell, this.spellStat(spell), p.level, this.rules.jobs[p.job]);
    },
    // 威力（攻撃魔法は、杖のダイスの結果を足す。回復魔法は、足さない）
    rollSpellPower(spell) {
        const p = this.player, focus = spell.magicKind === 'attack' ? this.getFocusItem() : null;
        const rod = focus?.dice ? R.rollDice(focus.dice.n, focus.dice.m).total : 0;
        return R.rollMagicPower(this.rules, spell, p.level, this.rules.jobs[p.job], rod);
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
        this.particles.spawnBurst(p.x, 1.0, p.z, parseInt(spell.color.slice(1), 16), 14, 3.0);
        this.sound.playHeal?.();
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
