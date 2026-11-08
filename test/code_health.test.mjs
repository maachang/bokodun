// コードの健康診断（scripts/code_health.mjs・docs/code-health.md）: 長いファイル・長い関数を、目標値に近づけ続ける
//  1. 目標値を超えるものは、負債台帳（scripts/codeHealth.debt.json）に、計画（plan）つきで載っていること。台帳にない超過は、新しい違反（失敗）
//  2. 台帳の値は増やせない（今より悪くしない）。分割して小さくなったら、台帳の値を下げる
//  3. 目標を満たしたものは、台帳から外す（外し忘れも、失敗）。台帳は、解消するための一覧であって、目こぼしの一覧ではない
import { test } from 'bun:test';
import assert from 'node:assert/strict';
import { TARGET, TODO_PLAN, violations, readLedger } from '../scripts/code_health.mjs';

test('コードの健康診断: 目標を超える新しいファイル・関数がない（超えるものは、計画つきで台帳に載っている）', () => {
    const v = violations(), l = readLedger();
    const problems = [];
    for (const [k, x] of Object.entries(v.files)) if (!l.files[k]) problems.push(`新しい違反（ファイル）: ${k}（${x.lines} 行・${Math.round(x.bytes / 1000)}KB）。目標は ${TARGET.fileLines} 行・${TARGET.fileBytes / 1000}KB。分割する（台帳に足すのは、理由と計画を書いたときだけ）`);
    for (const [k, x] of Object.entries(v.funcs)) if (!l.funcs[k]) problems.push(`新しい違反（関数）: ${k}（${x.lines} 行）。目標は ${TARGET.funcLines} 行`);
    assert.deepEqual(problems, []);
});

test('コードの健康診断: 負債台帳の値は増えていない（今より悪くしない）。計画が書かれている', () => {
    const v = violations(), l = readLedger();
    const problems = [];
    for (const [k, x] of Object.entries(l.files)) {
        const now = v.files[k];
        if (now && (now.lines > x.lines || now.bytes > x.bytes)) problems.push(`悪化（ファイル）: ${k} ${now.lines} 行・${now.bytes}B > 台帳 ${x.lines} 行・${x.bytes}B`);
        if (!x.plan || x.plan === TODO_PLAN) problems.push(`計画が未記入: ${k}`);
    }
    for (const [k, x] of Object.entries(l.funcs)) {
        const now = v.funcs[k];
        if (now && now.lines > x.lines) problems.push(`悪化（関数）: ${k} ${now.lines} 行 > 台帳 ${x.lines} 行`);
        if (!x.plan || x.plan === TODO_PLAN) problems.push(`計画が未記入: ${k}`);
    }
    assert.deepEqual(problems, []);
});

test('コードの健康診断: 解消した負債は、台帳から外してある（`bun scripts/code_health.mjs --tighten`）。台帳の値は、今の値まで下げてある', () => {
    const v = violations(), l = readLedger();
    const problems = [];
    for (const k of Object.keys(l.files)) if (!v.files[k]) problems.push(`解消済み（外す）: ${k}`);
    for (const k of Object.keys(l.funcs)) if (!v.funcs[k]) problems.push(`解消済み（外す）: ${k}`);
    for (const [k, x] of Object.entries(l.files)) if (v.files[k] && (v.files[k].lines < x.lines || v.files[k].bytes < x.bytes)) problems.push(`小さくなった（台帳の値を下げる）: ${k}`);
    for (const [k, x] of Object.entries(l.funcs)) if (v.funcs[k] && v.funcs[k].lines < x.lines) problems.push(`小さくなった（台帳の値を下げる）: ${k}`);
    assert.deepEqual(problems, []);
});
