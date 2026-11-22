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

/** クリティカル率（%）。シーフ系は軽い武器（重さ ≤ 筋力 × 0.5）のとき高い。鈍器は全職業で低い。
 *  積載（loadRatio。省略は、補正なし）: 1 を超えると全職業で減る（シーフ系は倍。下限は critLoad.floor か、元の率の小さいほう）。
 *  中央値（critLoad.light.median）より軽いと上がる（重量比 0 で +maxBonus ポイント。シーフ系は 2 倍（Lv1）〜 thiefMulMax 倍（最大レベル）。鈍器は対象外） */
export function critRate(defs, job, weapon, weight, str, loadRatio = null, lv = 1) {
    const c = defs.combat.critRate;
    let base;
    if (weapon.blunt) base = c.blunt;
    else if (!job?.thiefFamily) base = c.normal;
    else base = weight <= str * defs.combat.lightWeaponMaxRatio ? c.thiefFamily : c.normal * c.heavyThiefPenaltyFactor;
    const L = defs.combat.critLoad;
    if (!L || loadRatio == null) return base;
    const thiefMul = job?.thiefFamily ? L.thiefMul : 1;
    if (loadRatio < L.light.median) {
        if (weapon.blunt) return base;
        // シーフ系の、軽いほうの倍率は、レベルで 2（Lv1）→ thiefMulMax（最大レベル）に伸びる（紙防具のシーフが、高レベルで高くなる）
        const mul = job?.thiefFamily ? L.thiefMul + (L.light.thiefMulMax - L.thiefMul) * Math.min(1, Math.max(0, lv - 1) / (defs.combat.levelBonus.maxLevel - 1)) : 1;
        return base + L.light.maxBonus * (1 - Math.max(0, loadRatio) / L.light.median) * mul;
    }
    if (loadRatio <= 1) return base;
    const cut = Math.min(1, (loadRatio - 1) * L.perOver * thiefMul);
    return Math.max(Math.min(L.floor, base), base * (1 - cut));
}

/**
 * 攻撃 1 回の結果（ミス → 1 ゾロ → クリティカル → リトライクリティカル の順）。{ kind: 'miss' | 'fumble' | 'normal' | 'crit', damage }
 *   ctx = { weapon, weight, lv, job, str, dex, loadRatio }。noCrit は、クリティカルにしない（ブラックダイヤモンドの追加判定）。forceCrit は、必ずクリティカル（ミスもしない。「半ずらし」は 2026-11-23 になしにしたため、ゲームからは、いまは使わない）。noMiss は、ミスの判定をしない（弓など）。
 *   クリティカルのダメージは、ダメージ判定の 1.5 倍。リトライ（職業ごとの回数）は、その都度ダメージ判定をして合算する。リトライのクリティカル率は、1 回ごとに critRetryDrop ポイントずつ下がる（最初 30% なら、リトライは 20%、次は 10%。下限は 1% か、元の率の小さいほう）。出なければ、通常ダメージを加えて終わる。
 */
export function resolveAttack(defs, ctx, { forceCrit = false, noMiss = false, noCrit = false } = {}, rng = Math.random) {
    const { weapon, weight, lv, job, str, dex, loadRatio } = ctx;
    if (!forceCrit && !noMiss && rng() < missRate(defs, dex, lv)) return { kind: 'miss', damage: 0 };
    const first = rollAttack(defs, weapon, weight, lv, job, rng);
    if (first.fumble) return { kind: 'fumble', damage: first.damage };
    const p = critRate(defs, job, weapon, weight, str, loadRatio, lv);
    if (noCrit || (!forceCrit && rng() * 100 >= p)) return { kind: 'normal', damage: first.damage };
    const mult = defs.combat.critDamageMultiplier;
    let total = Math.floor(first.damage * mult);
    for (let i = 0; i < (job?.retryCrit || 0); i++) {
        const r = rollAttack(defs, weapon, weight, lv, job, rng);
        const pr = Math.max(Math.min(defs.combat.critLoad?.floor ?? 1, p), p - (defs.combat.critRetryDrop ?? 0) * (i + 1));   // リトライごとに、率が下がる（1 回目 −10・2 回目 −20 ポイント。下限 1%）
        if (!r.fumble && rng() * 100 < pr) total += Math.floor(r.damage * mult);
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

// ---- 職業のレベルと経験値 ----

/** 職業のレベル n → n+1 に必要な経験値 ＝ round(expBase × n^1.5)（character-spec 6 章） */
export function expToNextLevel(defs, jobId, lv) {
    return Math.round(defs.jobs[jobId].expBase * Math.pow(lv, 1.5));
}

/** 職業を覚える条件を、満たしているか。levels は { 職業 ID: レベル }（requires の職業が、すべて必要なレベル以上） */
export function jobRequirementsMet(defs, jobId, levels) {
    return defs.jobs[jobId].requires.every((r) => (levels[r.job] ?? 0) >= r.level);
}

// ---- 冒険者の作成（character-spec 4 章）----

export const CREATION_JOBS = ['fighter', 'thief', 'sorcerer', 'priest'];   // 作成のときに選べる第一職業（基本の戦闘職。仕様に定めがないので、基本職の 4 つ）
export const MEASURE_MIN = 1, MEASURE_MAX = 12.5, MEASURE_STEP = 0.5;      // 計測値 A〜D の範囲と、止めたときの刻み（刻みは仮）

/** 種族ごとの、能力値の最大値 ＝ 25 × 係数（切り捨て） */
export function maxAbility(defs, raceId, key) {
    return Math.floor(25 * defs.races[raceId].coef[key] + 1e-9);
}

/**
 * 作成の入力の検証。エラーなら、メッセージ（文字列）。問題なければ null。
 *   input = { race, a, b, c, d（計測値）, bonus（1〜9）, abilities（割り振り後の能力値）, job }
 *   能力値 ＝ 計測値から決まる基礎値（2 つの計測値の合計 × 種族係数、切り捨て、最小 1）＋ 割り振ったボーナス。
 *   割り振りの合計は、ボーナス値以内。各能力値は、種族の最大値を超えない。サーバー（作成 API）でも、同じ検証をする（計測値の止め操作は、クライアントの値を信用する）。
 */
export function validateCreation(defs, input) {
    const { race, a, b, c, d, bonus, abilities, job } = input;
    if (!defs.races[race]) return '種族が不正です';
    for (const [k, v] of Object.entries({ a, b, c, d })) {
        if (typeof v !== 'number' || !(v >= MEASURE_MIN && v <= MEASURE_MAX)) return `計測値 ${k.toUpperCase()} は ${MEASURE_MIN}〜${MEASURE_MAX} です`;
    }
    if (!Number.isInteger(bonus) || bonus < 1 || bonus > 9) return 'ボーナス値は 1〜9 です';
    if (!CREATION_JOBS.includes(job) || !defs.jobs[job]) return '第一職業が不正です';
    if (!abilities || typeof abilities !== 'object') return '能力値が不正です';
    const base = makeAbilities(defs, race, a, b, c, d, 0);
    let used = 0;
    for (const k of ABILITY_KEYS) {
        const v = abilities[k];
        if (!Number.isInteger(v)) return `能力値 ${k} が不正です`;
        const add = v - base[k];
        if (add < 0) return `能力値 ${k} が、基礎値より小さいです`;
        if (v > maxAbility(defs, race, k)) return `能力値 ${k} が、種族の最大値を超えています`;
        used += add;
    }
    if (Object.keys(abilities).some((k) => !ABILITY_KEYS.includes(k))) return '能力値に、未知の項目があります';
    if (used > bonus) return `ボーナス値（${bonus}）を超えて割り振っています`;
    return null;
}
