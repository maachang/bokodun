import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PANELS, REGIONS, resolveLayout, regionElementId, applyLayoutToDom } from '../public/js/layout.js';

const projectRoot = process.cwd();
const layoutConfig = JSON.parse(fs.readFileSync(path.join(projectRoot, 'public/data/layout.json'), 'utf-8'));
const indexHtml = fs.readFileSync(path.join(projectRoot, 'public/index.html'), 'utf-8');

test('レイアウトの解決（resolveLayout）', async (t) => {
    const config = {
        active: 'a',
        presets: {
            a: { game: { width: 900 }, panels: { status: 'left', magic: 'overlay-top', hints: 'hidden' } },
            b: { panels: { status: 'bottom' } }
        }
    };
    const regionOf = (r, panel) => r.placements.find(p => p.panel === panel).region;

    await t.test('active のプリセットを使い、書かれていないパネルは既定の領域に置く。並び順はプリセットに書いた順', () => {
        const r = resolveLayout(config);
        assert.equal(r.preset, 'a');
        assert.equal(r.gameWidth, 900);
        assert.deepEqual(r.placements.slice(0, 3).map(p => p.panel), ['status', 'magic', 'hints']);
        assert.equal(regionOf(r, 'magic'), 'overlay-top');
        assert.equal(regionOf(r, 'hints'), 'hidden');
        assert.equal(regionOf(r, 'minimap'), 'right', '未指定は既定の領域');
        assert.equal(r.placements.length, PANELS.length, '全パネルが 1 回ずつ');
        assert.deepEqual(r.warnings, []);
    });

    await t.test('要求されたプリセット（?layout=）が優先される。存在しなければ警告して active へ', () => {
        assert.equal(resolveLayout(config, 'b').preset, 'b');
        const r = resolveLayout(config, 'no_such');
        assert.equal(r.preset, 'a');
        assert.ok(r.warnings.some(w => w.includes('no_such')));
    });

    await t.test('ゲーム画面の幅: 未指定は 800、範囲外は 320〜1600 に収める', () => {
        assert.equal(resolveLayout(config, 'b').gameWidth, 800);
        const wide = resolveLayout({ presets: { x: { game: { width: 99999 } } } }, 'x');
        const narrow = resolveLayout({ presets: { x: { game: { width: 10 } } } }, 'x');
        assert.equal(wide.gameWidth, 1600);
        assert.equal(narrow.gameWidth, 320);
    });

    await t.test('未知のパネル・領域は警告し、領域は既定へ置き換える', () => {
        const r = resolveLayout({ presets: { x: { panels: { status: 'nowhere', ghost: 'left' } } } }, 'x');
        assert.equal(regionOf(r, 'status'), 'left');
        assert.ok(r.warnings.some(w => w.includes('nowhere')));
        assert.ok(r.warnings.some(w => w.includes('ghost')));
        assert.equal(r.placements.length, PANELS.length);
    });

    await t.test('設定が空・壊れていても、既定の配置でパネルがすべて置かれる', () => {
        for (const broken of [{}, null, { presets: {} }]) {
            const r = resolveLayout(broken);
            assert.equal(r.placements.length, PANELS.length);
            assert.equal(r.gameWidth, 800);
        }
    });
});

test('layout.json と index.html の整合', async (t) => {
    await t.test('全プリセットが警告なしで解決でき、全パネルを有効な領域に割り当てている', () => {
        assert.ok(layoutConfig.presets[layoutConfig.active], 'active のプリセットが存在する');
        for (const name of Object.keys(layoutConfig.presets)) {
            const r = resolveLayout(layoutConfig, name);
            assert.deepEqual(r.warnings, [], `${name}: 警告`);
            assert.equal(r.preset, name);
            const def = layoutConfig.presets[name];
            for (const panel of PANELS) assert.ok(REGIONS.includes(def.panels[panel]), `${name}: ${panel} の領域`);
        }
    });

    await t.test('既定のプリセット: 右の領域は「ミニマップ → 敵の情報」の順（敵の情報はミニマップの下）', () => {
        const r = resolveLayout(layoutConfig);
        const right = r.placements.filter(p => p.region === 'right').map(p => p.panel);
        assert.deepEqual(right, ['minimap', 'enemies']);
    });

    await t.test('index.html に、全パネル・全領域の要素と、パネルの中身の id がある', () => {
        const has = (id) => indexHtml.includes(`id="${id}"`);
        for (const panel of PANELS) assert.ok(has(`panel-${panel}`), `パネル ${panel}`);
        for (const region of REGIONS.filter(r => r !== 'hidden')) assert.ok(has(regionElementId(region)), `領域 ${region}`);
        assert.ok(has('panelStore') && has('gameWrapper'));
        // game.js が参照する中身の id（パネルを動かしても残っていること）
        for (const id of ['levelText', 'hpText', 'hpBar', 'mpText', 'mpBar', 'expText', 'goldText', 'monsterCount',
            'magicHud', 'weaponHud', 'enemyHudList', 'minimapCanvas', 'currentAreaName', 'signpostBanner', 'damageFlash', 'hudOverlay']) {
            assert.ok(has(id), `id=${id}`);
        }
    });

    await t.test('game.js が getElementById で参照する id は、すべて index.html に存在する', () => {
        const game = fs.readFileSync(path.join(projectRoot, 'public/js/game.js'), 'utf-8');
        const ids = [...game.matchAll(/getElementById\('([^']+)'\)/g)].map(m => m[1]);
        assert.ok(ids.length > 5);
        for (const id of new Set(ids)) assert.ok(indexHtml.includes(`id="${id}"`) || ['viewport'].includes(id), `id=${id}`);
    });
});

test('DOM への反映（applyLayoutToDom）', async (t) => {
    // appendChild の順序を記録する最小限の要素
    const makeEl = (id) => ({ id, children: [], appendChild(c) { this.children.push(c.id); c.parent = this.id; } });
    const ids = [...PANELS.map(p => `panel-${p}`), ...REGIONS.filter(r => r !== 'hidden').map(regionElementId)];
    const build = () => { const els = Object.fromEntries(ids.map(id => [id, makeEl(id)])); return { els, get: (id) => els[id] ?? null }; };

    await t.test('パネルが指定の領域へ、書いた順に移る。hidden は動かない。ゲーム画面の幅が設定される', () => {
        const { els, get } = build();
        const wrapper = { style: { props: {}, setProperty(k, v) { this.props[k] = v; } } };
        const resolved = resolveLayout({ presets: { p: { game: { width: 1000 }, panels: { magic: 'left', status: 'left', hints: 'hidden', minimap: 'overlay-top-right' } } } }, 'p');
        applyLayoutToDom(resolved, get, wrapper);

        assert.deepEqual(els['region-left'].children.slice(0, 2), ['panel-magic', 'panel-status'], '書いた順');
        assert.deepEqual(els['overlay-top-right'].children, ['panel-minimap']);
        assert.equal(els['panel-hints'].parent, undefined, 'hidden は動かさない');
        assert.equal(wrapper.style.props['--game-width'], '1000px');
    });

    await t.test('layout.json の全プリセットで、hidden 以外のパネルがちょうど 1 つの領域に入る', () => {
        for (const name of Object.keys(layoutConfig.presets)) {
            const { els, get } = build();
            const resolved = resolveLayout(layoutConfig, name);
            applyLayoutToDom(resolved, get, null);
            const placed = Object.values(els).flatMap(e => e.children);
            const expected = resolved.placements.filter(p => p.region !== 'hidden').map(p => `panel-${p.panel}`);
            assert.deepEqual([...placed].sort(), [...expected].sort(), name);
        }
    });

    await t.test('要素が見つからなくても落ちない', () => {
        const resolved = resolveLayout(layoutConfig);
        assert.doesNotThrow(() => applyLayoutToDom(resolved, () => null, null));
    });
});
