// 戦闘・能力値の式（仕様: docs/character-spec.md の 2〜8 章。定数: public/data/combat.json）。
// 画面にも DOM にも触らない、式だけの部品。呼び出し側が、定義（defs）を渡す。ブラウザでもテスト（bun）でも、同じものを使う。
//   defs = { combat: combat.json, table: damageTable.json の table, jobs: jobs.json の jobs, races: races.json の races }
//   job = jobs.json の 1 職業（なければ、基本職の値）。乱数は rng（0 以上 1 未満を返す関数。省略時は Math.random）。
// 試算ツール scripts/stat_report.js と、同じ結果になる（test/rules.test.mjs が、仕様の例で確かめる）。

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const ABILITY_KEYS = ['dex', 'agi', 'str', 'vit', 'intel', 'mnd', 'end'];

// ---- ダイスとダメージ表 ----

/** ダメージ表[重さ 1〜50][攻撃値 1〜100]（範囲外は端に丸める） */
export function tableValue(defs, weight, value) {
    return defs.table[clamp(Math.floor(weight), 1, 50) - 1][clamp(Math.floor(value), 1, 100) - 1];
}

/** n 個の m 面ダイスを振る。{ total: 合計（固定値 k を含めない）, fumble: すべて 1 か } */
export function rollDice(n, m, rng = Math.random) {
    let total = 0, ones = 0;
    for (let i = 0; i < n; i++) {
        const f = 1 + Math.floor(rng() * m);
        total += f;
        if (f === 1) ones++;
    }
    return { total, fumble: n > 0 && ones === n };
}

/** n 個の m 面ダイス＋k の、出る値と確率の一覧 [[値, 確率], …] */
export function diceDistribution(n, m, k) {
    let d = new Map([[k, 1]]);
    for (let i = 0; i < n; i++) {
        const next = new Map();
        for (const [s, c] of d) for (let f = 1; f <= m; f++) next.set(s + f, (next.get(s + f) || 0) + c);
        d = next;
    }
    const sum = [...d.values()].reduce((a, b) => a + b, 0);
    return [...d].map(([v, c]) => [v, c / sum]);
}

/** ダイスの結果ごとに f(値) を求めた、期待値（ダメージ表を通した期待ダメージなどに使う） */
export function diceExpected(dice, f) {
    return diceDistribution(dice.n, dice.m, dice.k).reduce((s, [v, p]) => s + p * f(v), 0);
}

// ---- 職業レベルの加算・ミス ----

/** 攻撃値に足す、第一職業レベルの加算（Lv99 で最大。基本職 15、上位職は jobs.json の levelBonusMax） */
export function levelBonus(defs, lv, job) {
    const c = defs.combat.levelBonus;
    return Math.floor(lv * ((job && job.levelBonusMax) || c.maxBonus) / c.maxLevel);
}

/** ミス率（0〜1）。実効器用度 ＝ 器用度 ＋ floor(Lv ÷ 10) */
export function missRate(defs, dex, lv) {
    const m = defs.combat.miss;
    return Math.max(m.min, m.base - (dex + Math.floor(lv / m.dexLevelDivisor))) / 100;
}

// ---- 能力値・HP・MP・移動速度 ----

/** 作成時の計測値 A〜D（1〜12.5）から、種族係数をかけた能力値を出す（character-spec 4 章。bonus は 6 能力値へ均等割り） */
export function makeAbilities(defs, raceId, a, b, c, d, bonus = 5) {
    const base = { dex: a + b, agi: a + c, str: b + d, vit: b + c, intel: c + d, mnd: a + d, end: b + c };
    const coef = defs.races[raceId].coef, out = {};
    for (const k of ABILITY_KEYS) out[k] = Math.max(1, Math.floor((base[k] + bonus / 6) * coef[k]));
    return out;
}

/** 最大 HP・最大 MP（種族の倍率あり） */
export function maxHpMp(defs, raceId, ab, lv, job) {
    const r = defs.races[raceId], c = defs.combat.hpMp;
    return {
        hp: Math.round((ab.str + ab.vit) * r.hpRate) + lv * (job?.hpPerLevel ?? c.hpPerLevel),
        mp: Math.round((ab.intel + ab.mnd) * r.mpRate) + lv * (job?.mpPerLevel ?? c.mpPerLevel)
    };
}

/** 歩く速さ・ダッシュの速さ（重さによる減速は、loadSlowRatio を、かける） */
export function moveSpeed(defs, agi) {
    const m = defs.combat.moveSpeed, walk = m.base + agi * m.agiCoef;
    return { walk, run: walk * m.runRatio };
}

// ---- 積載・スタミナ ----

/** 積載の限界 ＝ 筋力 × 4 ＋ Lv × 0.5 */
export function loadLimit(defs, str, lv) {
    return str * defs.combat.load.strCoef + lv * defs.combat.load.levelCoef;
}

/** 限界を超えたときの、歩く速さの倍率（1 以下。下限あり） */
export function loadSlowRatio(defs, ratio) {
    const l = defs.combat.load;
    return Math.max(l.minSpeedRatio, 1 - Math.max(0, ratio - 1) * l.overSlowPer);
}

/** 重量比による、スタミナの消費の倍率 m */
export function loadMultiplier(defs, ratio) {
    const s = defs.combat.stamina;
    return ratio <= 1 ? s.loadMulUnder.base + s.loadMulUnder.slope * ratio : Math.min(s.loadMulOver.max, 1 + (ratio - 1) * s.loadMulOver.slope);
}

/** スタミナの、最大値・ダッシュの消費/秒・攻撃 1 回の消費（武器の重さ）・自然回復/秒 */
export function staminaStats(defs, ab, lv, weaponWeight, ratio) {
    const s = defs.combat.stamina, m = loadMultiplier(defs, ratio), endDiv = 1 + ab.end * s.enduranceDivisor;
    return {
        max: Math.round((ab.str + ab.end) * s.baseCoef) + lv * s.perLevel,
        dashCost: s.dashCost * m / endDiv,
        attackCost: weaponWeight * s.attackCoef * m / endDiv,
        regen: (ab.end * s.regenEnd + lv * s.regenLevel) / (ratio > 1 ? m : 1)
    };
}

// ---- 武器の装備・攻撃 ----

/** 装備できる重さの上限（鈍器は 1.5 倍。最大 50） */
export function equipWeightLimit(defs, str, blunt) {
    return Math.min(50, str * (blunt ? defs.combat.equipWeightMultiplier.blunt : defs.combat.equipWeightMultiplier.normal));
}

/** 攻撃 1 回の通常ダメージ（クリティカル前）。{ damage, fumble }。1 ゾロは、1 ダメージ（fumble.attackDamage） */
export function rollAttack(defs, weapon, weight, lv, job, rng = Math.random) {
    const r = rollDice(weapon.dice.n, weapon.dice.m, rng);
    if (r.fumble) return { damage: defs.combat.fumble.attackDamage, fumble: true };
    return { damage: tableValue(defs, weight, r.total + weapon.dice.k + levelBonus(defs, lv, job)), fumble: false };
}

/** クリティカル率（%）。シーフ系は軽い武器（重さ ≤ 筋力 × 0.5）のとき高い。鈍器は全職業で低い */
export function critRate(defs, job, weapon, weight, str) {
    const c = defs.combat.critRate;
    if (weapon.blunt) return c.blunt;
    if (!job?.thiefFamily) return c.normal;
    return weight <= str * defs.combat.lightWeaponMaxRatio ? c.thiefFamily : c.normal * c.heavyThiefPenaltyFactor;
}

/**
 * 攻撃 1 回の結果（ミス → 1 ゾロ → クリティカル → リトライクリティカル の順）。{ kind: 'miss' | 'fumble' | 'normal' | 'crit', damage }
 *   ctx = { weapon, weight, lv, job, str, dex }。forceCrit は、必ずクリティカル（ミスもしない。「半ずらし」の無傷クリティカル）。noMiss は、ミスの判定をしない（弓など）。
 *   クリティカルのダメージは、ダメージ判定の 1.5 倍。リトライ（職業ごとの回数）は、その都度ダメージ判定をして合算する。出なければ、通常ダメージを加えて終わる。
 */
export function resolveAttack(defs, ctx, { forceCrit = false, noMiss = false } = {}, rng = Math.random) {
    const { weapon, weight, lv, job, str, dex } = ctx;
    if (!forceCrit && !noMiss && rng() < missRate(defs, dex, lv)) return { kind: 'miss', damage: 0 };
    const first = rollAttack(defs, weapon, weight, lv, job, rng);
    if (first.fumble) return { kind: 'fumble', damage: first.damage };
    const p = critRate(defs, job, weapon, weight, str);
    if (!forceCrit && rng() * 100 >= p) return { kind: 'normal', damage: first.damage };
    const mult = defs.combat.critDamageMultiplier;
    let total = Math.floor(first.damage * mult);
    for (let i = 0; i < (job?.retryCrit || 0); i++) {
        const r = rollAttack(defs, weapon, weight, lv, job, rng);
        if (!r.fumble && rng() * 100 < p) total += Math.floor(r.damage * mult);
        else { total += r.damage; break; }
    }
    return { kind: 'crit', damage: total };
}

// ---- 防御・回避 ----

/** 防具 1 回の被弾分の防御。parts = [{ kind: 'armor'|'helm'|'shield', weight, dice }]。部位ごとにダイスを振り、係数で合算する。{ defense, fumble（どれかが 1 ゾロ）} */
export function rollDefense(defs, parts, job, rng = Math.random) {
    let sum = 0, fumble = false;
    for (const p of parts) {
        const r = rollDice(p.dice.n, p.dice.m, rng);
        if (r.fumble) fumble = true;
        sum += defs.combat.defense.coef[p.kind] * tableValue(defs, p.weight, r.total + p.dice.k);
    }
    return { defense: sum * (job?.defenseRate || 1), fumble };
}

/** 回避値 D ＝ 敏捷度 × 0.5（ニンジャ 0.7）＋ Lv × 0.1 */
export function dodgeValue(defs, agi, lv, job) {
    const d = defs.combat.dodge;
    return agi * (job?.dodgeAgiCoef ?? d.agiCoef) + lv * d.levelCoef;
}

/**
 * 被ダメージ。攻撃 − 防御 − 生命力 ÷ 5 − 回避（0〜D の乱数）。最低 1。
 * heavy（金属製の重装備）を着けているときは、回避は無効（ナイトは有効）。防御で 1 ゾロが出たときも、回避は 0。
 */
export function damageTaken(defs, attack, { defense, vit, dodge, heavy, heavyDodge, fumble }, rng = Math.random) {
    const useDodge = !fumble && (!heavy || heavyDodge);
    const dodged = useDodge ? rng() * dodge : 0;
    return Math.max(defs.combat.defense.minDamage, Math.floor(attack - defense - vit / defs.combat.vitReductionDivisor - dodged));
}

// ---- 魔法 ----

const mj = (defs, job, k, d) => (job && job['magic' + k]) ?? d;

/** 魔法力 M ＝ 知力（回復・スタミナ回復は精神力）＋ Lv × 係数 */
export function magicPower(defs, stat, lv, job) {
    return stat + lv * mj(defs, job, 'LevelCoef', defs.combat.magic.levelCoef);
}

/** 魔法の攻撃値に足す、第一職業レベルの加算 */
export function magicBonus(defs, lv, job) {
    return Math.floor(lv * mj(defs, job, 'BonusMax', defs.combat.magic.bonusMax) / defs.combat.levelBonus.maxLevel);
}

/** 消費 MP ＝ max(1, round(基本消費 × clamp(重さ ÷ (M × 2), 下限, 3))）。基本消費 ＝ round(重さ × 種類の係数) */
export function magicCost(defs, spell, stat, lv, job) {
    const c = defs.combat.magic, M = magicPower(defs, stat, lv, job);
    const base = Math.round(spell.weight * c.costCoef[spell.costType]);
    const mul = Math.min(c.costCeil, Math.max(mj(defs, job, 'CostFloor', c.costFloor), spell.weight / (M * c.costDivisor)));
    return Math.max(1, Math.round(base * mul));
}

/** 発動の失敗率（%）。重い魔法ほど高く、魔法力が高いほど低い */
export function magicFailRate(defs, spell, stat, lv, job) {
    const c = defs.combat.magic, f = c.fail, M = magicPower(defs, stat, lv, job);
    return clamp(Math.round((spell.weight / (M * c.costDivisor) - f.offset) * f.scale * mj(defs, job, 'FailRate', 1)), f.min, f.max);
}

/** 魔法の威力（回復魔法は回復量）。杖を持っていれば、杖のダイスの結果（rodRoll）を攻撃値に足す。ダイスのない補助魔法は 0 */
export function rollMagicPower(defs, spell, lv, job, rodRoll = 0, rng = Math.random) {
    if (!spell.dice) return 0;
    const r = rollDice(spell.dice.n, spell.dice.m, rng);
    return tableValue(defs, spell.weight, r.total + spell.dice.k + magicBonus(defs, lv, job) + rodRoll);
}

/** 魔法の期待ダメージ（試算・表示用） */
export function expectedMagicPower(defs, spell, lv, job) {
    return spell.dice ? diceExpected(spell.dice, (v) => tableValue(defs, spell.weight, v + magicBonus(defs, lv, job))) : 0;
}

/** 購入価格の目安: 重さ² × 係数 × (ダイスの平均 ÷ 7) を、10 単位に丸める（武器・防具） */
export function equipmentPrice(defs, kind, weight, dice) {
    const p = defs.combat.equipmentPrice, avg = dice.n * (dice.m + 1) / 2 + dice.k;
    return Math.round(weight * weight * p[kind] * (avg / p.diceDivisor) / p.round) * p.round;
}
