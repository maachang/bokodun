// BGM（背景音楽）の選曲。マップの種類（ID の接頭辞・type）から、場面の曲を選ぶ。ボス（enemies.json の boss）が近くにいる間は、ボス戦の曲。
//   曲の中身・選曲の規則は public/data/bgm.json（草案・仮）。鳴らす仕組みは、public/js/audio/audioBgm.js。
// 規則（rules）から、マップに合う曲・環境音の名前を選ぶ。上から順に見て、先に当たったもの（なければ null）。BGM（bgm.json）と環境音（ambience.json）で共通
export function pickByRules(rules, mapId, type, name = '') {
    for (const r of rules ?? []) {
        if (r.id && !r.id.includes(mapId)) continue;
        if (r.prefix && !r.prefix.some((p) => mapId.startsWith(p))) continue;
        if (r.regex && !new RegExp(r.regex).test(mapId)) continue;
        if (r.name && !new RegExp(r.name).test(name ?? '')) continue;
        if (r.type && r.type !== type) continue;
        return r.track;
    }
    return null;
}

export const bgmMethods = {
    // マップの場面の曲。規則（bgm.json の rules）は、上から順に見て、先に当たったものを採る。
    // 1 つの規則に書いた条件は、すべて満たしたときに当たる（AND）。条件は、id（一覧のどれか）・prefix（接頭辞のどれか）・regex（ID に合う正規表現）・name（マップ名に合う正規表現）・type（open / indoor）。
    // どれも当たらなければ、屋外は field・屋内は dungeon
    bgmTrackForMap(mapId, type, name = '') {
        const def = this.bgmDef;
        if (!def) return null;
        return pickByRules(def.rules, mapId, type, name) ?? (type === 'indoor' ? 'dungeon' : 'field');
    },

    // 今、鳴らすべき曲。ボスが近くにいるとき（一度鳴らしたら、少し遠ざかるまで続ける）は、ボス戦
    bgmChooseTrack() {
        const def = this.bgmDef;
        if (!def) return null;
        const range = (def.bossRange ?? 30) * (this.bgmCurrent === 'boss' ? 1.3 : 1);   // 境目で、曲が行ったり来たりしないように
        const p = this.player;
        if (this.monsters?.some((m) => m.active && m.isBoss && m.hp > 0 && Math.hypot(m.x - p.x, m.z - p.z) < range)) return 'boss';
        return this.bgmTrackForMap(this.currentMapId ?? '', this.bgmMapType, this.bgmMapName);
    },

    // 毎フレーム呼ぶ。0.5 秒ごとに、曲を選び直して、変わっていたら切り替える
    updateBgm(dt) {
        this.bgmTimer = (this.bgmTimer ?? 0) - dt;
        if (this.bgmTimer > 0 || !this.sound?.playBgm) return;
        this.bgmTimer = 0.5;
        const track = this.bgmChooseTrack();
        if (!track || track === this.bgmCurrent) return;
        this.bgmCurrent = track;
        this.sound.playBgm(track);
    }
};
