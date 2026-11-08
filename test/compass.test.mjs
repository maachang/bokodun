import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PANELS, resolveLayout } from '../public/js/layout.js';
import { gameSource } from './helpers/game.mjs';

// game.js は three.js を読み込むので、方角の関数だけを、ソースから取り出して試す
const src = gameSource();
const m = src.match(/export const COMPASS_NAMES = (\[.*?\]);\nexport function compassDirection\(angle\) \{([\s\S]*?)\n\}/);
const compassDirection = new Function('angle', `const COMPASS_NAMES = ${m[1]};${m[2]}`);

test('方角: 向き（angle）から、大体の方向（8 方向）。0 = 北・-π/2 = 東・π = 南・π/2 = 西', () => {
    const P = Math.PI;
    const cases = [[0, '北'], [-P / 4, '北東'], [-P / 2, '東'], [-3 * P / 4, '南東'], [P, '南'], [-P, '南'], [3 * P / 4, '南西'], [P / 2, '西'], [P / 4, '北西'], [2 * P, '北'], [-2 * P, '北'], [0.3, '北'], [-0.5, '北東'], [P / 2 + 0.2, '西']];
    for (const [a, name] of cases) assert.equal(compassDirection(a), name, `angle ${a}`);
});

test('方角の表示: パネル compass（既定は、ゲーム画面の右上＝overlay-top）。ページにも、毎フレーム呼ぶ更新がある', () => {
    assert.ok(PANELS.includes('compass'));
    const layout = JSON.parse(fs.readFileSync('public/data/layout.json', 'utf8'));
    for (const name of Object.keys(layout.presets)) {
        const r = resolveLayout(layout, name);
        assert.equal(r.placements.find(p => p.panel === 'compass').region, 'overlay-top', `${name}: 方角は、画面の上（右）`);
    }
    const html = fs.readFileSync('public/index.html', 'utf8');
    assert.match(html, /id="panel-compass"[\s\S]*?id="compassText"/);
    assert.match(src, /this\.updateSignpostBanner\(activeSignMessage, activeSignIcon\);\n\s+this\.updateCompass\(\);/);
});
