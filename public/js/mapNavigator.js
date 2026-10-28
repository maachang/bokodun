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
        return { mapId: nextMap, opts: { keepStack: true, params: link.params } };
    }
}
