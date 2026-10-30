/**
 * 主人公のステータス試算レポート（草案データと仕様書の式からの試算。ゲーム内の動作ではない）
 * 武器・防具・敵・魔法の数値を決めるための、基準情報を出す。
 * 使い方: bun scripts/stat_report.js [出力ファイル]   （省略時は標準出力）
 *
 * 前提（試算の約束）:
 *  - 計測値 A〜D は 1〜12.5 の一様乱数: 低=3 / 平均=6.75 / 高=11 のすべて同値で試算する。
 *  - ボーナス値は平均5を、6能力値へ均等に割り振る。
 *  - 攻撃は「持てる最大の重さの武器」の、期待ダメージ（ダイスの全組み合わせの平均）。
 *  - 防御は「持てる最大の重さの防具」の、期待値。回避は 0〜D の乱数の平均（D/2）。
 *  - クリティカル・リトライクリティカルは、仕様書（8.4）のとおり期待値に含める。
 *  - ミス率（器用度）、魔法の威力・回復の式は、仕様書で未決なので、含めない。
 */
const fs = require('fs');
const path = require('path');
const D = f => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'data', f), 'utf8'));
const races = D('races.json').races, jobsAll = D('jobs.json').jobs, C = D('combat.json');
const T = D('damageTable.json').table, EQ = D('equipment.json');

const tb = (w, v) => T[Math.max(1, Math.min(50, Math.floor(w))) - 1][Math.max(1, Math.min(100, Math.floor(v))) - 1];
const dice = (n, m, k) => {
    let d = new Map([[k, 1]]);
    for (let i = 0; i < n; i++) {
        const nd = new Map();
        for (const [s, c] of d) for (let f = 1; f <= m; f++) nd.set(s + f, (nd.get(s + f) || 0) + c);
        d = nd;
    }
    const t = [...d.values()].reduce((a, b) => a + b, 0);
    return [...d].map(([v, c]) => [v, c / t]);
};
const lvBonus = lv => Math.floor(lv * C.levelBonus.maxBonus / C.levelBonus.maxLevel);
const ABIL = ['dex', 'agi', 'str', 'vit', 'intel', 'mnd'];
const abilities = (race, A, B, Cc, Dd) => {
    const base = { dex: A + B, agi: A + Cc, str: B + Dd, vit: B + Cc, intel: Cc + Dd, mnd: A + Dd }, co = races[race].coef;
    const o = {};
    for (const k of ABIL) o[k] = Math.max(1, Math.floor((base[k] + 5 / 6) * co[k]));
    return o;
};
const expTo = (b, lv) => { let s = 0; for (let n = 1; n < lv; n++) s += Math.round(b * Math.pow(n, 1.5)); return s; };

// 1回の攻撃の期待ダメージ（クリティカル・リトライ込み）
function expected(dmgNormal, p, retry) {
    const R = n => n === 0 ? 0 : p * (C.critDamageMultiplier * dmgNormal + R(n - 1)) + (1 - p) * dmgNormal;
    return (1 - p) * dmgNormal + p * (C.critDamageMultiplier * dmgNormal + R(retry));
}
const MELEE = EQ.weapons.filter(w => !/bow|wand/.test(w.id));
function bestWeapon(a, lv, job, onlyLight) {
    let best = null;
    for (const w of MELEE) {
        if (onlyLight && (w.blunt || w.weight[0] > a.str * C.lightWeaponMaxRatio)) continue;
        const lim = Math.min(50, a.str * (w.blunt ? C.equipWeightMultiplier.blunt : 1));
        if (w.weight[0] > lim) continue;
        const wt = Math.min(lim, w.weight[1], onlyLight ? a.str * C.lightWeaponMaxRatio : 50);
        const light = wt <= a.str * C.lightWeaponMaxRatio;
        if (onlyLight && !light) continue;
        let p = w.blunt ? C.critRate.blunt : (job.thiefFamily ? (light ? C.critRate.thiefFamily : C.critRate.normal * C.critRate.heavyThiefPenaltyFactor) : C.critRate.normal);
        const dn = dice(w.dice.n, w.dice.m, w.dice.k).reduce((s, [v, q]) => s + q * tb(wt, v + lvBonus(lv)), 0);
        const e = expected(dn, p / 100, job.retryCrit || 0);
        if (!best || e > best.e) best = { id: w.id, name: w.name, wt: Math.floor(wt), dn, p, e };
    }
    return best;
}
function gear(a, kind) {
    // kind: 'light' = 回避ありの軽装（heavy でない防具のみ）、'heavy' = 持てる最大の防具（回避なし）
    const parts = [['armors', C.defense.coef.armor], ['helms', C.defense.coef.helm], ['shields', C.defense.coef.shield]];
    let def = 0;
    for (const [key, coef] of parts) {
        let b = 0;
        for (const g of EQ[key]) {
            if (kind === 'light' && g.heavy) continue;
            if (g.weight[0] > a.str) continue;
            const wt = Math.min(a.str, g.weight[1]);
            const v = dice(g.dice.n, g.dice.m, g.dice.k).reduce((s, [x, q]) => s + q * tb(wt, x), 0);
            b = Math.max(b, v);
        }
        def += coef * b;
    }
    return def;
}
function build(raceId, roll, lv, jobId) {
    const r = races[raceId], job = jobsAll[jobId], a = abilities(raceId, roll, roll, roll, roll);
    const hp = Math.round((a.str + a.vit) * r.hpRate) + lv * C.hpMp.hpPerLevel;
    const mp = Math.round((a.intel + a.mnd) * r.mpRate) + lv * C.hpMp.mpPerLevel;
    const w = bestWeapon(a, lv, job), w2 = bestWeapon(a, lv, job, true), dodgeD = a.agi * C.dodge.agiCoef + lv * C.dodge.levelCoef;
    const dl = gear(a, 'light'), dh = gear(a, 'heavy'), vr = a.vit / C.vitReductionDivisor;
    const taken = (atk, def, dodge) => Math.max(1, atk - def - vr - dodge);
    return { a, hp, mp, w, w2, dodgeD, dl, dh, vr, light: atk => taken(atk, dl, dodgeD / 2), heavy: atk => taken(atk, dh, 0) };
}
const f1 = x => (Math.round(x * 10) / 10).toFixed(1);
const out = [];
const P = s => out.push(s);

P('# 主人公ステータス試算レポート（草案データ・仕様書の式からの試算）\n');
P('前提: 計測値は低=3 / 平均=6.75 / 高=11 のすべて同値、ボーナス平均5を均等割り。ミス率・魔法の式は未決のため含めない。\n');

P('## 1. 種族 × 計測値（Lv99・ファイター）\n');
P('| 種族 | 計測 | 器/敏/筋/生/知/精 | HP | MP | 剣類の期待dmg(武器) | 軽装防御 | 重装防御 | 回避D |');
P('|---|---|---|---|---|---|---|---|---|');
for (const rid of Object.keys(races)) for (const [lab, roll] of [['低', 3], ['平均', 6.75], ['高', 11]]) {
    const s = build(rid, roll, 99, 'fighter');
    P(`| ${races[rid].name} | ${lab} | ${ABIL.map(k => s.a[k]).join('/')} | ${s.hp} | ${f1(s.mp)} | ${s.w ? f1(s.w.e) + '（' + s.w.name + ' 重' + s.w.wt + '）' : '装備不可'} | ${f1(s.dl)} | ${f1(s.dh)} | ${f1(s.dodgeD)} |`);
}

P('\n## 2. 戦闘職（基本職・上位職）× レベル（人間・平均）\n');
P('第一職業のレベルで戦闘能力が決まる（仕様書 6章）。上位職の初期レベル・HPの引き継ぎは未決のため、「第一職業が Lv◯」として並べる。\n');
P('期待dmg/回 はクリティカル・リトライ込み。「最強」は鈍器を含めて最も期待dmgが高い武器、「軽い武器」は重さが筋力の半分以下の非鈍器の最強（シーフ系はこの条件のときだけクリティカル率20%＋リトライが効く）。\n');
P('| 職業 | 階層 | Lv | HP | MP | 最強武器（重さ）クリ率% | 期待dmg/回 | 軽い武器の最強（重さ）クリ率% | 期待dmg/回 | リトライ | Lv→累計経験値 |');
P('|---|---|---|---|---|---|---|---|---|---|---|');
const combat = Object.entries(jobsAll).filter(([, j]) => j.type === 'combat');
for (const [jid, j] of combat) for (const lv of [1, 20, 50, 99]) {
    const s = build('human', 6.75, lv, jid);
    P(`| ${j.name} | ${j.tier === 'base' ? '基本' : '上位'} | ${lv} | ${s.hp} | ${f1(s.mp)} | ${s.w ? s.w.name + '（' + s.w.wt + '）' + s.w.p + '%' : '-'} | ${s.w ? f1(s.w.e) : '-'} | ${s.w2 ? s.w2.name + '（' + s.w2.wt + '）' + s.w2.p + '%' : '-'} | ${s.w2 ? f1(s.w2.e) : '-'} | ${j.retryCrit || 0} | ${expTo(j.expBase, lv).toLocaleString()} |`);
}

P('\n## 3. 被ダメージ（人間・平均・Lv別）: 敵の攻撃力ごとの、1発のダメージと耐えられる回数\n');
P('軽装 = 回避あり（heavy でない防具のみ）、重装 = 持てる最大の防具（回避なし）。敵の攻撃力ごとに「ダメージ(耐えられる回数)」。\n');
const ATK = [10, 20, 40, 80, 150];
P('| Lv | 装備 | 防御 | HP | ' + ATK.map(x => '攻撃' + x).join(' | ') + ' |');
P('|---|---|---|---|' + ATK.map(() => '---').join('|') + '|');
for (const lv of [1, 20, 50, 99]) {
    const s = build('human', 6.75, lv, 'fighter');
    for (const [lab, fn, df] of [['軽装', s.light, s.dl], ['重装', s.heavy, s.dh]])
        P(`| ${lv} | ${lab} | ${f1(df)} | ${s.hp} | ` + ATK.map(x => `${f1(fn(x))}（${Math.floor(s.hp / fn(x))}回）`).join(' | ') + ' |');
}

P('\n## 4. 上位職の差（仕様書で定義されている範囲）\n');
P('| 職業 | 取得条件 | expBase | クリ率（軽い武器） | リトライ | Lv99の累計経験値 |');
P('|---|---|---|---|---|---|');
for (const [jid, j] of combat)
    P(`| ${j.name} | ${j.requires.length ? j.requires.map(q => jobsAll[q.job].name + 'Lv' + q.level).join('＋') : '-'} | ${j.expBase} | ${j.thiefFamily ? C.critRate.thiefFamily : C.critRate.normal} | ${j.retryCrit || 0} | ${expTo(j.expBase, 99).toLocaleString()} |`);

P('\n## 5. このレポートから見える、決める必要がある点\n');
P('- 上位職は、仕様書上、基本職と「HP・MPの伸び」「攻撃・防御の式」が同じ。差は、取得条件・必要経験値・リトライクリティカル・シーフ系の指定だけ（魔法職の上位職の効果は魔法の式が未決）。');
P('- 上位職の初期レベル、基本職のレベルの引き継ぎ、取得後のHP・MPの扱いが未決。');
P('- 魔法職（ソーサラー・プリースト系）は、MPだけで、魔法の威力・回復の式が未決なので、強さを試算できない。');
P('- ミス率（器用度）の式が未決のため、攻撃の期待ダメージは、ミス率ぬきの値。');

const text = out.join('\n') + '\n';
if (process.argv[2]) fs.writeFileSync(process.argv[2], text); else process.stdout.write(text);
