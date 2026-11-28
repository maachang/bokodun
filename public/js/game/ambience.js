// 環境音の選択。マップの種類（ID の接頭辞・type・マップ名）から、その場の環境音（風・波・鳥・水滴・炎・ざわめき）を選ぶ。
//   中身・規則は public/data/ambience.json（草案・仮）。鳴らす仕組みは、public/js/audio/audioAmbience.js。規則の判定は、BGM と共通（pickByRules）
import { pickByRules } from '/js/game/bgm.js';

export const ambienceMethods = {
    // マップに合う環境音の名前（規則に当たらなければ、屋外は default.open・屋内は default.indoor）
    ambienceForMap(mapId, type, name = '') {
        const def = this.ambDef;
        if (!def) return null;
        return pickByRules(def.rules, mapId, type, name) ?? (type === 'indoor' ? def.default?.indoor : def.default?.open) ?? null;
    },

    // 毎フレーム呼ぶ。0.5 秒ごとに、環境音を選び直して、変わっていたら切り替える（マップを移ったときに、切り替わる）
    updateAmbience(dt) {
        this.ambTimer = (this.ambTimer ?? 0) - dt;
        if (this.ambTimer > 0 || !this.sound?.playAmbience) return;
        this.ambTimer = 0.5;
        const name = this.ambienceForMap(this.currentMapId ?? '', this.bgmMapType, this.bgmMapName);
        if (!name || name === this.ambCurrent) return;
        this.ambCurrent = name;
        this.sound.playAmbience(name);
    }
};
