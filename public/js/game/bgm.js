// BGM（背景音楽）の選曲。マップの種類（ID の接頭辞・type）から、場面の曲を選ぶ。ボス（enemies.json の boss）が近くにいる間は、ボス戦の曲。
//   曲の中身・選曲の規則は public/data/bgm.json（草案・仮）。鳴らす仕組みは、public/js/audio/audioBgm.js。
export const bgmMethods = {
    // マップの場面の曲（規則の接頭辞が先に当たったもの。なければ、屋外は field・屋内は dungeon）
    bgmTrackForMap(mapId, type) {
        const def = this.bgmDef;
        if (!def) return null;
        for (const r of def.rules ?? []) if (r.prefix.some((p) => mapId.startsWith(p))) return r.track;
        return type === 'indoor' ? 'dungeon' : 'field';
    },

    // 今、鳴らすべき曲。ボスが近くにいるとき（一度鳴らしたら、少し遠ざかるまで続ける）は、ボス戦
    bgmChooseTrack() {
        const def = this.bgmDef;
        if (!def) return null;
        const range = (def.bossRange ?? 30) * (this.bgmCurrent === 'boss' ? 1.3 : 1);   // 境目で、曲が行ったり来たりしないように
        const p = this.player;
        if (this.monsters?.some((m) => m.active && m.isBoss && m.hp > 0 && Math.hypot(m.x - p.x, m.z - p.z) < range)) return 'boss';
        return this.bgmTrackForMap(this.currentMapId ?? '', this.bgmMapType);
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
