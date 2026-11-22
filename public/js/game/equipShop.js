// 武器屋での買い物（重さを選んで買う）のメニュー。GameEngine のメソッド（this は GameEngine）。店のメニュー（interact.js）の 1 画面（screen: 'weight'）。
//   仕様: docs/character-spec.md 8.2d（購入時に重さを選ぶ。重い装備ほど高い。店は、重さの制限なく売る）。買う処理は gear.js の buyEquipment。
export const equipShopMethods = {
    // 買う装備の説明（ダイス・重さの範囲・いま選んでいる重さで、装備できるか）
    equipShopInfo(m) {
        const e = this.equipDefOf(m.good.equipId), d = e.def.dice;
        const dice = `${d.n}d${d.m}${d.k ? '+' + d.k : ''}`;
        const limit = Math.floor(this.rules ? this.effAbilities().str * (e.def.blunt ? 1.5 : 1) : 0);
        return `<div style="margin:6px 0;color:#94a3b8">${e.def.name}（${e.def.category ?? ''}）　${e.kind === 'weapon' ? '攻撃' : '防御'} ${dice}　重さ ${e.range[0]}〜${e.range[1]}　いま持てる重さ ${limit} まで${this.isOwned(m.good.equipId) ? `　（持っている: 重さ ${this.player.owned[m.good.equipId]}）` : ''}</div>`;
    },

    equipShopChoices(m) {
        const id = m.good.equipId, e = this.equipDefOf(id), [lo, hi] = e.range;
        const move = (d) => () => { m.weight = Math.max(lo, Math.min(hi, m.weight + d)); m.note = ''; };
        const carry = this.effAbilities().str * (e.def.blunt ? 1.5 : 1) >= m.weight;
        return [
            { label: `買う　重さ ${m.weight}　${this.equipPrice(id, m.weight)}G${carry ? '' : '　（筋力が足りず、装備はできません）'}`, act: () => { m.note = this.buyEquipment(id, m.weight).message; } },
            { label: '重さを 1 増やす（→）', act: move(1) },
            { label: '重さを 1 減らす（←）', act: move(-1) },
            { label: '重さを 5 増やす', act: move(5) },
            { label: '重さを 5 減らす', act: move(-5) },
            { label: 'もどる', act: () => { m.screen = 'buy'; m.index = 0; m.note = ''; } }
        ];
    }
};
