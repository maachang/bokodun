// 外のマップの世界の並び（public/data/world.json の grid）。
//   grid は、マップ ID の 2 次元配列（上の行が北、右の列が東）。隣のマップは、配列の位置から決まる。
//   外のマップは、すべて mapSize × mapSize マスの固定（端の移動で、出現位置をそのまま引き継ぐため）。
//   配列の外側（隣がない端）には、移動できない。

export const WORLD_DIRS = ['north', 'south', 'west', 'east'];
const DELTA = { north: [-1, 0], south: [1, 0], west: [0, -1], east: [0, 1] };

// マップ ID の位置 { row, col }。世界の配列にないマップ（建物の中など）は null
export function worldCell(world, mapId) {
    if (!world?.grid) return null;
    for (let row = 0; row < world.grid.length; row++) {
        const col = world.grid[row].indexOf(mapId);
        if (col >= 0) return { row, col };
    }
    return null;
}

// 隣のマップ ID。隣がない（配列の外側、または空き）は null
export function worldNeighbor(world, mapId, dir) {
    const cell = worldCell(world, mapId);
    if (!cell || !DELTA[dir]) return null;
    const id = world.grid[cell.row + DELTA[dir][0]]?.[cell.col + DELTA[dir][1]];
    return id || null;
}

// 端を越えたか調べる。位置（x, z はワールド座標）が、マップの外（0〜size の外）に出ていれば、
//   { dir, mapId, x, z }（行き先のマップと、行き先での位置。反対側の端の、同じ位置）。隣がなければ mapId は null
//   マップの中なら null。角を越えたときは、はみ出しの大きいほうの方向を優先する
export function edgeCrossing(world, mapId, x, z, width, depth) {
    let dir = null;
    const over = { north: -z, south: z - depth, west: -x, east: x - width };
    let best = 0;
    for (const d of WORLD_DIRS) {
        if (over[d] > best) { best = over[d]; dir = d; }
    }
    if (!dir) return null;
    const nx = dir === 'west' ? x + width : dir === 'east' ? x - width : x;
    const nz = dir === 'north' ? z + depth : dir === 'south' ? z - depth : z;
    return { dir, mapId: worldNeighbor(world, mapId, dir), x: nx, z: nz };
}

// 隣がない端の外へ出ないよう、位置を、マップの中に収める（隣がある端は、そのまま）。r は、プレイヤーの半径
export function clampToWorld(world, mapId, x, z, width, depth, r) {
    let cx = x, cz = z;
    if (!worldNeighbor(world, mapId, 'west') && cx < r) cx = r;
    if (!worldNeighbor(world, mapId, 'east') && cx > width - r) cx = width - r;
    if (!worldNeighbor(world, mapId, 'north') && cz < r) cz = r;
    if (!worldNeighbor(world, mapId, 'south') && cz > depth - r) cz = depth - r;
    return { x: cx, z: cz };
}
