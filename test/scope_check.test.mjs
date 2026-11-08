// 未定義の変数の検査（scripts/scope_check.mjs）: public/js 以下の全ファイルで、宣言されていない名前を使っていない。
// 長いファイルを分割・移動したときの、変数の取りこぼし（例: 移した先で nrows が未定義）を、描画を実行しなくても見つける（描画のコードは、テストでは実行されないため）
import { test } from 'bun:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { root, jsFiles, undefinedNames } from '../scripts/scope_check.mjs';

test('未定義の変数の検査: public/js の全ファイルに、宣言されていない名前がない', () => {
    const bad = [];
    for (const f of jsFiles()) {
        const names = [...undefinedNames(fs.readFileSync(path.join(root, f), 'utf8'))];
        if (names.length) bad.push(`${f}: ${names.join(', ')}`);
    }
    assert.deepEqual(bad, []);
});

test('未定義の変数の検査: 取りこぼしのある例を、確かに見つける（検査そのものの確認）', () => {
    assert.deepEqual([...undefinedNames('export const m = { f(n) { const ncols = 1; return nrows + ncols + n; } };')], ['nrows']);
    assert.deepEqual([...undefinedNames("import { a } from '/x.js'; export class C { m(p) { const q = a + p; return [q, window.x, Math.max(q, 1)]; } }")], []);
});
