// マップ間の移動（扉・門・建物の出入り）の記録と、移動中の二重実行の防止。
//   マップの読み込みは非同期で、初めて開くマップは数フレームかかる。その間も、プレイヤーは古いマップの扉のマスの中にいるので、
//   移動の処理が毎フレーム呼ばれてしまう。移動中（busy）は新しい移動を受け付けず、戻る先の記録（stack）が増えないようにする
export class MapNavigator {
    constructor() {
        this.stack = [];     // 建物に入る前の { mapId, spawn }（出口で、ここへ戻る）
        this.busy = false;   // マップの読み込み中
    }

    clear() {
        this.stack = [];
    }

    // 移動先を決める。移動中なら null（何もしない）。
    //   nextMap が '$back' なら、記録の一番上へ戻る（記録がなければ fallbackMap へ）。link.back があれば、今のマップと戻る位置を記録する
    //   link.spawn があれば、行き先での出現位置にする（階段: 上り下りの行き先を、双方の links で明示する）
    //   戻り値: { mapId, opts }（loadMap に渡す）
    plan(currentMapId, nextMap, link = {}, fallbackMap = null) {
        if (this.busy) return null;
        if (nextMap === '$back') {
            const back = this.stack.pop();
            if (back) return { mapId: back.mapId, opts: { keepStack: true, spawn: back.spawn } };
            nextMap = fallbackMap;   // 戻る先がなければ、マップの次のマップへ
        } else if (link.back) {
            this.stack.push({ mapId: currentMapId, spawn: link.back });
        }
        const opts = { keepStack: true, params: link.params };
        if (link.spawn) opts.spawn = link.spawn;   // 階段など: 行き先マップでの出現位置を、link で指定する（戻る先の記録は使わない）
        return { mapId: nextMap, opts };
    }
}

// 階段の向き（上る・下りる方向）。dir（n/e/s/w）の指定があればそれ。なければ、通れる隣マスが1つだけのとき、その反対側（行き止まりの壁へ向かう）。それ以外は北
//   isSolid(列, 行) は、そのマスが壁・家具などで通れないとき true。戻り値: 'n' | 'e' | 's' | 'w'
export const STAIRS_DIRS = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };
export function stairsFacing(isSolid, c, r, dir) {
    if (dir && STAIRS_DIRS[dir]) return dir;
    const OPPOSITE = { n: 's', e: 'w', s: 'n', w: 'e' };
    const open = Object.entries(STAIRS_DIRS).filter(([, [dx, dz]]) => !isSolid(c + dx, r + dz)).map(([k]) => k);
    return open.length === 1 ? OPPOSITE[open[0]] : 'n';
}
