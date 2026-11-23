// 戦闘・能力値の式（public/js/game/rules.js）のテスト。仕様書（character-spec.md 8 章）の数値例と、同じ結果になるかを確かめる
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as R from '../public/js/game/rules.js';

const D = (f) => JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public', 'data', f), 'utf8'));
const defs = { combat: D('combat.json'), table: D('damageTable.json').table, jobs: D('jobs.json').jobs, races: D('races.json').races };
const spells = D('magic.json').spells, eq = D('equipment.json');
const avg = R.makeAbilities(defs, 'human', 6.75, 6.75, 6.75, 6.75);   // 人間・平均
const near = (a, b, eps = 0.05) => assert.ok(Math.abs(a - b) <= eps, `${a} ≠ ${b}`);
const seq = (...v) => { let i = 0; return () => v[i++ % v.length]; };   // 決まった乱数

test('能力値・HP・MP・移動速度', () => {
    assert.equal(avg.dex, 14);
    assert.equal(avg.str, 14);
    near(R.moveSpeed(defs, 14).walk, 8.5, 0.01);
    near(R.moveSpeed(defs, 14).run, 13.0, 0.01);
    near(R.moveSpeed(defs, 35).walk, 10.6, 0.01);
    const hm = R.maxHpMp(defs, 'human', avg, 1, defs.jobs.fighter);
    assert.equal(hm.hp, (avg.str + avg.vit) + 1);
});

test('ミス率（仕様 8.2 の例）', () => {
    assert.equal(R.missRate(defs, 14, 1), 0.16);
    assert.equal(R.missRate(defs, 14, 99), 0.07);
    assert.equal(R.missRate(defs, 2, 1), 0.28);
    assert.equal(R.missRate(defs, 35, 99), 0.01);
});

test('魔法の失敗率（仕様 8.2c の例。人間・平均、基本職 / 魔法系上位職）', () => {
    const f = (id, lv, job) => R.magicFailRate(defs, spells[id], avg.intel, lv, defs.jobs[job]);
    assert.equal(f('fire', 1, 'fighter'), 19);
    assert.equal(f('explosion', 1, 'fighter'), 28);
    assert.equal(f('fire', 50, 'fighter'), 1);
    assert.equal(f('explosion', 50, 'fighter'), 3);
    assert.equal(f('fire', 1, 'wizard'), 11);
    assert.equal(R.magicFailRate(defs, { weight: 50 }, avg.intel, 1, defs.jobs.fighter), 50);
    assert.equal(R.magicFailRate(defs, { weight: 50 }, avg.intel, 50, defs.jobs.wizard), 3);
});

test('魔法の期待ダメージ（仕様 8.2c の例: ファイア）', () => {
    const e = (lv, job) => R.expectedMagicPower(defs, spells.fire, lv, defs.jobs[job]);
    near(e(1, 'fighter'), 12.4); near(e(50, 'fighter'), 21.0); near(e(99, 'fighter'), 30.9);
    near(e(1, 'wizard'), 12.4); near(e(50, 'wizard'), 33.4); near(e(99, 'wizard'), 55.6);
});

test('魔法の消費 MP・威力のダイス', () => {
    const c = R.magicCost(defs, spells.fire, avg.intel, 1, defs.jobs.fighter);
    assert.ok(c >= 1 && c <= defs.combat.magic.costCeil * Math.round(28 * 0.36));
    assert.equal(R.magicCost(defs, { weight: 1, costType: 'rapid' }, 50, 99, defs.jobs.fighter), 1);   // 最低 1
    // 乱数が 0 → 全部 1 の目（1 ゾロではなく、ダイス 2 個以上でも最小値）、0.99 → 最大の目
    const lo = R.rollMagicPower(defs, spells.fire, 1, defs.jobs.fighter, 0, () => 0);
    const hi = R.rollMagicPower(defs, spells.fire, 1, defs.jobs.fighter, 0, () => 0.99);
    assert.ok(hi > lo);
    assert.equal(R.rollMagicPower(defs, { weight: 24 }, 1, null), 0);   // ダイスのない補助魔法
    const rod = R.rollMagicPower(defs, spells.fire, 1, defs.jobs.fighter, 10, () => 0.5);
    assert.ok(rod > R.rollMagicPower(defs, spells.fire, 1, defs.jobs.fighter, 0, () => 0.5));   // 杖の結果が加算される
});

test('ダイスと 1 ゾロ', () => {
    assert.deepEqual(R.rollDice(2, 6, () => 0), { total: 2, fumble: true });
    assert.equal(R.rollDice(2, 6, seq(0, 0.5)).fumble, false);
    assert.equal(R.rollDice(1, 6, () => 0).fumble, true);   // 1 個のダイスで 1 が出ても 1 ゾロ
    const dist = R.diceDistribution(2, 6, 1);
    near(dist.reduce((s, [, p]) => s + p, 0), 1, 1e-9);
    near(R.diceExpected({ n: 2, m: 6, k: 1 }, (v) => v), 8, 1e-9);
});

test('攻撃（ダメージ表・1 ゾロ・レベルの加算・クリティカル率）', () => {
    const w = eq.weapons.find((x) => x.id === 'long_sword');
    const hit = R.rollAttack(defs, w, 14, 1, defs.jobs.fighter, () => 0.5);
    assert.equal(hit.damage, R.tableValue(defs, 14, 8 + w.dice.k + 0));   // 2d6 で、乱数 0.5 ならどちらも 4 の目
    assert.deepEqual(R.rollAttack(defs, w, 14, 1, defs.jobs.fighter, () => 0), { damage: 1, fumble: true });
    assert.equal(R.levelBonus(defs, 99, defs.jobs.fighter), 15);
    assert.equal(R.levelBonus(defs, 99, defs.jobs.knight), 25);
    const dag = eq.weapons.find((x) => x.id === 'dagger'), mace = eq.weapons.find((x) => x.id === 'mace');
    assert.equal(R.critRate(defs, defs.jobs.fighter, w, 14, 14), 10);
    assert.equal(R.critRate(defs, defs.jobs.thief, dag, 6, 14), 20);   // シーフ系 × 軽い武器
    assert.equal(R.critRate(defs, defs.jobs.thief, w, 14, 14), 5);     // シーフ系 × 重い武器
    assert.equal(R.critRate(defs, defs.jobs.fighter, mace, 14, 14), 1);   // 鈍器
    // 積載が限界（1）を超えると、全職業でクリティカル率が減る。シーフ系は倍（仮の数値: 超えた分 × 1、シーフ系 × 2）
    assert.equal(R.critRate(defs, defs.jobs.fighter, w, 14, 14, 1), 10, '限界ちょうどは減らない');
    assert.equal(R.critRate(defs, defs.jobs.fighter, w, 14, 14, 0.8), 10, '中央値（0.8）では変わらない');
    assert.equal(R.critRate(defs, defs.jobs.fighter, w, 14, 14, 0.9), 10, '中央値〜1 の間は変わらない');
    assert.ok(Math.abs(R.critRate(defs, defs.jobs.fighter, w, 14, 14, 0.6) - 12.5) < 1e-9, '0.6 で +2.5');
    assert.ok(Math.abs(R.critRate(defs, defs.jobs.fighter, w, 14, 14, 0) - 20) < 1e-9, '0 で +10');
    assert.ok(Math.abs(R.critRate(defs, defs.jobs.thief, dag, 6, 14, 0) - 40) < 1e-9, 'シーフ系は倍（+20）');
    assert.ok(Math.abs(R.critRate(defs, defs.jobs.thief, dag, 6, 14, 0, 1) - 40) < 1e-9, 'シーフ系 Lv1 は 2 倍');
    assert.ok(Math.abs(R.critRate(defs, defs.jobs.thief, dag, 6, 14, 0, 99) - 50) < 1e-9, 'シーフ系 最大レベルは 3 倍（+30）');
    assert.ok(R.critRate(defs, defs.jobs.thief, dag, 6, 14, 0.13, 99) > R.critRate(defs, defs.jobs.thief, dag, 6, 14, 0.13, 1), '同じ重量比なら、高レベルほど高い');
    assert.equal(R.critRate(defs, defs.jobs.fighter, w, 14, 14, 0, 99), 20, 'ファイター系は、レベルで変わらない');
    assert.equal(R.critRate(defs, defs.jobs.fighter, mace, 14, 14, 0.2), 1, '鈍器は上がらない（決定）');
    assert.ok(Math.abs(R.critRate(defs, defs.jobs.fighter, w, 14, 14, 1.3) - 7) < 1e-9, '重量比 1.3 で 30% 減');
    assert.ok(Math.abs(R.critRate(defs, defs.jobs.thief, dag, 6, 14, 1.3) - 8) < 1e-9, 'シーフ系は 60% 減（20 → 8）');
    assert.equal(R.critRate(defs, defs.jobs.fighter, w, 14, 14, 3), 1, '下限 1%');
    assert.equal(R.critRate(defs, defs.jobs.fighter, mace, 14, 14, 1.5), 1, '鈍器は、もともと 1%（下限より下がらない）');
});

test('装備できる重さ・価格（仕様 8.1・8.2d の例）', () => {
    assert.equal(R.equipWeightLimit(defs, 14, false), 14);
    assert.equal(R.equipWeightLimit(defs, 14, true), 21);
    assert.equal(R.equipWeightLimit(defs, 40, true), 50);
    const price = (list, id, kind, wt) => R.equipmentPrice(defs, kind, wt, eq[list].find((x) => x.id === id).dice);
    assert.equal(price('weapons', 'dagger', 'weapon', 8), 60);
    assert.equal(price('weapons', 'short_sword', 'weapon', 14), 240);
    assert.equal(price('weapons', 'mace', 'weapon', 21), 530);
    assert.equal(price('armors', 'leather_armor', 'armor', 14), 180);
    assert.equal(price('helms', 'iron_helm', 'helm', 14), 90);   // 仕様書 8.2d の例（旧: 180）は、式（係数 0.4）に合わせて 90 に直した
});

test('防御・回避・被ダメージ（仕様 8.3）', () => {
    const parts = [{ kind: 'armor', weight: 14, dice: { n: 1, m: 6, k: 2 } }, { kind: 'helm', weight: 8, dice: { n: 1, m: 6, k: 1 } }];
    const d = R.rollDefense(defs, parts, defs.jobs.fighter, () => 0.5);
    const want = 0.6 * R.tableValue(defs, 14, 4 + 2) + 0.2 * R.tableValue(defs, 8, 4 + 1);
    near(d.defense, want, 1e-9);
    assert.equal(R.rollDefense(defs, parts, defs.jobs.paladin, () => 0.5).defense, want * 1.1);
    assert.equal(R.rollDefense(defs, parts, defs.jobs.fighter, () => 0).fumble, true);
    // 被ダメージ ＝ 攻撃 − 防御 − 生命力 ÷ 5 − 回避。最低 1
    const base = { defense: 10, vit: 15, dodge: 8, heavy: false, heavyDodge: false, fumble: false };
    assert.equal(R.damageTaken(defs, 30, base, () => 0.5), 30 - 10 - 3 - 4);
    assert.equal(R.damageTaken(defs, 5, base, () => 0.5), 1);
    assert.equal(R.damageTaken(defs, 30, { ...base, heavy: true }, () => 0.5), 30 - 10 - 3);   // 重装備は、回避が無効
    assert.equal(R.damageTaken(defs, 30, { ...base, heavy: true, heavyDodge: true }, () => 0.5), 30 - 10 - 3 - 4);   // ナイトは有効
    assert.equal(R.damageTaken(defs, 30, { ...base, fumble: true }, () => 0.5), 30 - 10 - 3);   // 防御の 1 ゾロは、回避 0
    near(R.dodgeValue(defs, 14, 1, defs.jobs.fighter), 7.1, 1e-9);
    near(R.dodgeValue(defs, 14, 1, defs.jobs.ninja), 14 * 0.7 + 0.1, 1e-9);
});

test('積載・スタミナ（仕様 8.2e の例）', () => {
    const lim = R.loadLimit(defs, 14, 1);
    near(lim, 56.5, 1e-9);
    assert.equal(R.loadSlowRatio(defs, 0.8), 1);
    near(R.loadSlowRatio(defs, 1.2), 0.9, 1e-9);
    assert.equal(R.loadSlowRatio(defs, 5), 0.6);
    near(R.loadMultiplier(defs, 0.8), 0.92, 1e-9);
    near(R.loadMultiplier(defs, 1.3), 1.6, 1e-9);
    assert.equal(R.loadMultiplier(defs, 9), 3);
    const s = R.staminaStats(defs, avg, 1, 10, 0.8);
    assert.equal(s.max, Math.round((avg.str + avg.end) * 1.5) + 1);
    assert.ok(s.dashCost > 0 && s.attackCost > 0 && s.regen > 0);
});

test('攻撃 1 回の結果（ミス・1 ゾロ・クリティカル・リトライ）', () => {
    const w = eq.weapons.find((x) => x.id === 'long_sword');   // 2d6+1
    const ctx = (job) => ({ weapon: w, weight: 14, lv: 1, job: defs.jobs[job], str: 14, dex: 14 });
    const normal = R.tableValue(defs, 14, 8 + w.dice.k);      // ダイスが 4 + 4 のとき
    // 乱数の順: ミス判定（noMiss・forceCrit のときは無し）→ ダイス（2 個）→ クリティカル判定（forceCrit のときは無し）
    assert.deepEqual(R.resolveAttack(defs, ctx('fighter'), {}, seq(0.1)), { kind: 'miss', damage: 0 });
    assert.deepEqual(R.resolveAttack(defs, ctx('fighter'), { noMiss: true }, seq(0.5, 0.5, 0.9)), { kind: 'normal', damage: normal });
    assert.deepEqual(R.resolveAttack(defs, ctx('fighter'), {}, seq(0.9, 0, 0, 0.9)), { kind: 'fumble', damage: 1 });
    assert.deepEqual(R.resolveAttack(defs, ctx('fighter'), {}, seq(0.9, 0.5, 0.5, 0.05)), { kind: 'crit', damage: Math.floor(normal * 1.5) });
    assert.equal(R.resolveAttack(defs, ctx('fighter'), { forceCrit: true }, seq(0.5, 0.5)).kind, 'crit', '必ずクリティカル（ミスもしない）');
    // リトライ（アサシン 2 回。クリティカル率 5%＝重い武器）: 最初のクリティカル → リトライでもクリティカル → 次は外れて通常ダメージ
    const asn = R.resolveAttack(defs, ctx('assassin'), { noMiss: true }, seq(0.5, 0.5, 0.04, 0.5, 0.5, 0.005, 0.5, 0.5, 0.9));   // リトライの率は、5% → 1%（下限）に下がる
    assert.equal(asn.kind, 'crit');
    assert.equal(asn.damage, Math.floor(normal * 1.5) * 2 + normal, 'クリティカル + クリティカル + 通常');
    // リトライのクリティカル率は、1 回ごとに 10 ポイント下がる（最初 30% → 20% → 10%。下限 1%）
    //   シーフ（軽い武器: 20% × 重量比なし）で、最初が 15%（< 20%）で出ても、リトライの率は 10% なので、15% は外れる
    const dag = { id: 'dagger', dice: { n: 1, m: 6, k: 0 }, blunt: false }, dctx = { weapon: dag, weight: 3, lv: 1, job: defs.jobs.thief, str: 14, dex: 14 };
    const dn = R.tableValue(defs, 3, 4);   // 1d6 で乱数 0.5 → 4
    assert.equal(R.resolveAttack(defs, dctx, { noMiss: true }, seq(0.5, 0.15, 0.5, 0.15)).damage, Math.floor(dn * 1.5) + dn, 'リトライの率は 10%: 0.15 は外れて、通常ダメージを足す');
    assert.equal(R.resolveAttack(defs, dctx, { noMiss: true }, seq(0.5, 0.15, 0.5, 0.05)).damage, Math.floor(dn * 1.5) * 2, 'リトライ 0.05（< 10%）はクリティカル');
    // リトライの回数を使い切ったら終わり（ニンジャ 3 回でも、すぐ外れれば 1 回で終わる）
    const ninja = R.resolveAttack(defs, ctx('ninja'), { noMiss: true }, seq(0.5, 0.5, 0.04, 0.5, 0.5, 0.9));
    assert.equal(ninja.damage, Math.floor(normal * 1.5) + normal);
});

test('冒険者の作成: 能力値の生成・ボーナスの割り振り・検証（仕様 4 章）', () => {
    const base = R.makeAbilities(defs, 'human', 6, 7, 8, 9, 0);   // 器用度 A+B=13、敏捷度 A+C=14、筋力 B+D=16、生命力 B+C=15、知力 C+D=17、精神力 A+D=15、持久力 B+C=15
    assert.deepEqual(base, { dex: 13, agi: 14, str: 16, vit: 15, intel: 17, mnd: 15, end: 15 });
    const elf = R.makeAbilities(defs, 'elf', 12.5, 12.5, 12.5, 12.5, 0);
    assert.equal(elf.str, 15, '25 × 0.6');
    assert.equal(elf.dex, 30, '25 × 1.2');
    assert.equal(R.maxAbility(defs, 'elf', 'str'), 15);
    assert.equal(R.maxAbility(defs, 'human', 'dex'), 25);
    assert.equal(R.maxAbility(defs, 'dwarf', 'str'), 35);
    assert.equal(R.makeAbilities(defs, 'fairy', 1, 1, 1, 1, 0).str, 1, '最小 1（2 × 0.4 = 0.8 → 1）');
    const ok = (o) => ({ race: 'human', a: 6, b: 7, c: 8, d: 9, bonus: 5, abilities: { ...base }, job: 'fighter', ...o });
    assert.equal(R.validateCreation(defs, ok({})), null, '割り振りなしでも通る');
    assert.equal(R.validateCreation(defs, ok({ abilities: { ...base, str: 18, dex: 16 } })), null, '+2 +3 = 5（ボーナス内）');
    assert.match(R.validateCreation(defs, ok({ abilities: { ...base, str: 19, dex: 16 } })), /ボーナス値.*超えて/);
    assert.match(R.validateCreation(defs, ok({ abilities: { ...base, str: 15 } })), /基礎値より小さい/);
    const m = { a: 12.5, b: 12.5, c: 12.5, d: 12.5 }, elfAll = R.makeAbilities(defs, 'elf', 12.5, 12.5, 12.5, 12.5, 0);
    assert.equal(R.validateCreation(defs, ok({ race: 'elf', bonus: 9, ...m, abilities: elfAll })), null, '計測値が最大なら、基礎値が最大値（エルフの筋力 15）');
    assert.match(R.validateCreation(defs, ok({ race: 'elf', bonus: 9, ...m, abilities: { ...elfAll, str: 16 } })), /最大値を超えて/, '種族の最大値は、ボーナスでも超えられない');
    assert.match(R.validateCreation(defs, ok({ race: 'robot' })), /種族/);
    assert.match(R.validateCreation(defs, ok({ a: 0.5 })), /計測値 A/);
    assert.match(R.validateCreation(defs, ok({ d: 13 })), /計測値 D/);
    assert.match(R.validateCreation(defs, ok({ bonus: 0 })), /ボーナス値/);
    assert.match(R.validateCreation(defs, ok({ bonus: 10 })), /ボーナス値/);
    assert.match(R.validateCreation(defs, ok({ job: 'knight' })), /第一職業/, '上位職は、作成では選べない');
    assert.match(R.validateCreation(defs, ok({ abilities: { ...base, cheat: 1 } })), /未知/);
    assert.match(R.validateCreation(defs, ok({ abilities: { ...base, str: 16.5 } })), /不正/);
    assert.match(R.validateCreation(defs, ok({ abilities: null })), /能力値/);
});

test('武器の +値（1 つにつき +5%）と、クリティカル率の上限 50%（リトライは元の率から引いて、上限で頭打ち）', () => {
    const sword = { blunt: false, dice: { n: 1, m: 6, k: 0 } }, blunt = { blunt: true };
    const f = defs.jobs.fighter;
    const base = R.critRate(defs, f, sword, 10, 14);
    assert.equal(R.critRate(defs, f, sword, 10, 14, null, 1, 3), base + 15);
    assert.equal(R.critRate(defs, f, blunt, 10, 14, null, 1, 3), R.critRate(defs, f, blunt, 10, 14));   // 鈍器は、クリティカル率に足さない（重さに付く）
    // 上限: 率 80% でも、乱数 0.6（60%）は外れる（上限 50%）。リトライ（忍者 3 回）は 70→60→50 でも、すべて 50% で判定
    const high = { ...defs, combat: { ...defs.combat, critRate: { ...defs.combat.critRate, normal: 80 } } };
    const ctx = { weapon: sword, weight: 10, lv: 1, job: f, str: 14, dex: 99 };
    assert.equal(R.resolveAttack(high, ctx, { noMiss: true }, seq(0.5, 0.6)).kind, 'normal');
    const nin = { ...f, retryCrit: 3 };
    const r = R.resolveAttack(high, { ...ctx, job: nin }, { noMiss: true }, seq(0.5, 0.4, 0.5, 0.49, 0.5, 0.49, 0.5, 0.49));
    assert.equal(r.kind, 'crit');
});

test('鈍器の +値は、ダメージ表を引く重さを +1 ごとに +10 上げる（鈍器以外は変わらない）', () => {
    const club = { blunt: true, dice: { n: 1, m: 6, k: 0 } }, sword = { blunt: false, dice: { n: 1, m: 6, k: 0 } };
    const run = (w, plus) => R.resolveAttack(defs, { weapon: w, weight: 20, lv: 1, job: defs.jobs.fighter, str: 14, dex: 99, plus }, { noMiss: true, noCrit: true }, seq(0.99)).damage;
    assert.equal(run(club, 0), R.tableValue(defs, 20, 6));
    assert.equal(run(club, 3), R.tableValue(defs, 50, 6));
    assert.equal(run(sword, 3), run(sword, 0));
});
