/**
 * 画面レイアウトの組み立て
 *
 * ゲーム画面の周囲（枠外: top / left / right / bottom）と、ゲーム画面の上（overlay-*）に、パネルを並べる。
 * どのパネルをどの領域に置くかは public/data/layout.json のプリセットで決める。
 *   - "active" のプリセットが使われる。URL の ?layout=プリセット名 で一時的に切り替えられる
 *   - 領域内の並び順は、プリセットの panels に書いた順
 *   - "hidden" を指定したパネルは表示しない
 *   - プリセットに書かれていないパネルは、既定の領域（DEFAULT_PANELS）に置く
 *   - ゲーム画面の幅は game.width（高さは 4:3 で自動）
 */

export const PANELS = ['status', 'magic', 'weapon', 'enemies', 'minimap', 'areaNav', 'hints', 'effectTest'];
export const REGIONS = ['top', 'left', 'right', 'bottom', 'overlay-top', 'overlay-top-right', 'overlay-bottom-left', 'overlay-bottom-right', 'hidden'];

// プリセットに書かれていない（または不正な指定の）パネルの既定の領域
const DEFAULT_PANELS = {
    status: 'left',
    magic: 'left',
    weapon: 'left',
    enemies: 'right',
    minimap: 'right',
    areaNav: 'top',
    hints: 'bottom',
    effectTest: 'right'
};
const DEFAULT_WIDTH = 800;
const MIN_WIDTH = 320;
const MAX_WIDTH = 1600;

/**
 * 設定とプリセット名から、実際に使うレイアウトを決める（DOM に依存しない）
 * @returns {{ preset: string, gameWidth: number, placements: Array<{panel: string, region: string}>, warnings: string[] }}
 */
export function resolveLayout(config, requestedPreset = null) {
    const warnings = [];
    const presets = (config && config.presets) || {};
    const names = Object.keys(presets);

    let preset = null;
    for (const candidate of [requestedPreset, config && config.active, names[0]]) {
        if (candidate && presets[candidate]) { preset = candidate; break; }
        if (candidate) warnings.push(`プリセットが見つかりません: ${candidate}`);
    }

    const def = preset ? presets[preset] : {};
    const placements = [];
    const seen = new Set();

    for (const [panel, region] of Object.entries(def.panels || {})) {
        if (!PANELS.includes(panel)) { warnings.push(`未知のパネルです: ${panel}`); continue; }
        if (seen.has(panel)) continue;
        seen.add(panel);
        if (REGIONS.includes(region)) {
            placements.push({ panel, region });
        } else {
            warnings.push(`未知の領域です（${panel}: ${region}）。既定の ${DEFAULT_PANELS[panel]} に置きます`);
            placements.push({ panel, region: DEFAULT_PANELS[panel] });
        }
    }
    for (const panel of PANELS) {
        if (!seen.has(panel)) placements.push({ panel, region: DEFAULT_PANELS[panel] });
    }

    let width = Number(def.game && def.game.width);
    if (!Number.isFinite(width)) width = DEFAULT_WIDTH;
    const gameWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(width)));

    return { preset, gameWidth, placements, warnings };
}

// 領域名 → 領域の要素の id（枠外は region-xxx、画面内は overlay-xxx 自体が id）
export function regionElementId(region) {
    return region.startsWith('overlay-') ? region : `region-${region}`;
}

/**
 * 決めたレイアウトを DOM に反映する。getEl(id) で要素を取得する（テストでは差し替える）
 * 'hidden' のパネルは動かさない（パネル置き場に残り、表示されない）
 */
export function applyLayoutToDom(resolved, getEl, gameWrapper) {
    if (gameWrapper) gameWrapper.style.setProperty('--game-width', `${resolved.gameWidth}px`);
    for (const { panel, region } of resolved.placements) {
        if (region === 'hidden') continue;
        const el = getEl(`panel-${panel}`);
        const target = getEl(regionElementId(region));
        if (!el || !target) continue;
        target.appendChild(el);
    }
}

/**
 * layout.json を読み込み、プリセットを選んで画面に反映する
 * プリセットの選び方: URL の ?layout= → layout.json の "active" → 先頭のプリセット
 */
export async function applyLayout({ url = '/data/layout.json' } = {}) {
    let config = null;
    try {
        const res = await fetch(url);
        config = await res.json();
    } catch (e) {
        console.error('レイアウト設定を読み込めませんでした（既定の配置を使います）:', e);
    }
    const requested = new URLSearchParams(window.location.search).get('layout');
    const resolved = resolveLayout(config || {}, requested);
    for (const w of resolved.warnings) console.warn('[layout]', w);

    applyLayoutToDom(resolved, (id) => jhtml.$(id), jhtml.$('gameWrapper'));
    return resolved;
}
