// マップ JSON の形式の変換（ブラウザ・テスト共通）。
//   形式 'ids'（世界の自動生成マップ w_*）: layout は、1 マスを物体 ID（整数）で持つ行の配列（[[48, 49, ...], ...]）。
//     legend のキーは、物体 ID の 10 進文字列（{ "49": "water", ... }）。1 文字で表さないので、物体の種類の数に上限がない。
//   形式 なし（手書きマップ）: layout は 1 マス 1 文字の文字列の配列、legend のキーは 1 文字。
//   ゲーム側（game.js）は後者の形を前提にしているので、読み込み時に、'ids' を後者へ直す（ID は文字コードとして 1 文字にする）。
//   物体 ID の範囲は 0〜0xD7FF（サロゲート領域を避ける）。

export const MAX_OBJECT_ID = 0xD7FF;

// マップ JSON を、ゲームが使う形（1 マス 1 文字）にそろえる。'ids' 形式でなければ、そのまま返す
export function normalizeMap(m) {
    if (!m || m.layoutFormat !== 'ids') return m;
    const ch = (id) => {
        if (!Number.isInteger(id) || id < 0 || id > MAX_OBJECT_ID) throw new Error(`物体 ID が範囲外: ${id}`);
        return String.fromCharCode(id);
    };
    m.layout = m.layout.map(row => row.map(ch).join(''));
    if (m.legend) m.legend = Object.fromEntries(Object.entries(m.legend).map(([k, v]) => [ch(Number(k)), v]));
    delete m.layoutFormat;
    return m;
}

// マップ JSON を取得して、ゲームが使う形にそろえる
export async function fetchMap(mapId) {
    const res = await fetch(`/data/maps/${mapId}.json`);
    if (!res.ok) throw new Error(`マップを取得できない: ${mapId} (${res.status})`);
    return normalizeMap(await res.json());
}
