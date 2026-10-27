/**
 * ダメージ表の生成スクリプト（草案）
 * 重さ(1〜50) × 攻撃値(1〜100) → ダメージ の表を public/data/damageTable.json に出力する。
 * 草案の式: ダメージ = max(1, round(攻撃値 × k(重さ)))、k は重さ1で0.3、重さ50で2.0 の直線。
 * バランス調整は、この式を変えて再生成するか、出力した JSON を直接編集して行う。
 * 使い方: bun scripts/genDamageTable.js
 */
const fs = require('fs');
const path = require('path');

const MAX_WEIGHT = 50;
const MAX_VALUE = 100;
const K_MIN = 0.3; // 重さ1 の係数
const K_MAX = 2.0; // 重さ50 の係数

const table = [];
for (let w = 1; w <= MAX_WEIGHT; w++) {
    const k = K_MIN + (K_MAX - K_MIN) * (w - 1) / (MAX_WEIGHT - 1);
    const row = [];
    for (let v = 1; v <= MAX_VALUE; v++) {
        row.push(Math.max(1, Math.round(v * k)));
    }
    table.push(row);
}

const out = {
    _comment: 'ダメージ表（草案）。table[重さ-1][攻撃値-1] = ダメージ。scripts/genDamageTable.js で生成。手編集可。',
    maxWeight: MAX_WEIGHT,
    maxValue: MAX_VALUE,
    table
};
const file = path.join(__dirname, '..', 'public', 'data', 'damageTable.json');
// 1行1重さで出力（差分とブラッシュアップを見やすくする）
const lines = table.map(r => '    ' + JSON.stringify(r));
const text = '{\n  "_comment": ' + JSON.stringify(out._comment) + ',\n  "maxWeight": ' + MAX_WEIGHT +
    ',\n  "maxValue": ' + MAX_VALUE + ',\n  "table": [\n' + lines.join(',\n') + '\n  ]\n}\n';
fs.writeFileSync(file, text);
console.log('written', file);
