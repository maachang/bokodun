// アイテムの定義をそろえる: items.json（消耗品・鍵・素手・呪文の見た目）に、equipment.json の武器（ダイス・重さ）と、magic.json の魔法（重さ・ダイス・種類）を重ねる。
// ゲーム（game.js）とテストが、同じ形のアイテムを使うための部品。画面にも DOM にも触らない。
//   武器: { id, name, kind: 'weapon', weaponClass, category, blunt, twoHanded, weightRange: [最小, 最大], dice, heavy? }
//   呪文: items.json の見た目・効果（type・visual・status など）に、magic.json の weight・costType・dice・price・tier・magicKind（攻撃・回復・補助）・target（スタミナ回復）・effect（補助の効果と時間）を足す。
//         消費 MP・威力は、式（rules.js）で決まるので、items.json には持たない。

export function buildItems(items, equipment, magic) {
    const out = { ...items };
    for (const w of equipment.weapons) {
        out[w.id] = { id: w.id, name: w.name, kind: 'weapon', weaponClass: w.weaponClass, category: w.category, blunt: !!w.blunt, twoHanded: !!w.twoHanded, weightRange: w.weight, dice: w.dice };
    }
    for (const [id, sp] of Object.entries(magic.spells)) {
        if (!out[id] || out[id].kind !== 'spell') continue;   // items.json に見た目のない魔法は入れない
        if (sp.usable === false) continue;   // 登録だけの魔法（効果が未決）は、ゲームで使えるものにしない（magic.json の usable）
        out[id] = { ...out[id], magicKind: sp.kind, weight: sp.weight, costType: sp.costType, dice: sp.dice, price: sp.price, tier: sp.tier, target: sp.target, effect: sp.effect };   // magicKind: attack / heal / support（item.kind は、呪文なら spell）
    }
    return out;
}

// アイコンの画像タグ（HTML 文字列）。アイコンのないアイテム（素手など）は、空き（同じ幅）にして、名前の位置をそろえる。id は、アイテム・武器・防具の ID（英数字と _ のみ）
export function iconTag(game, id, px = 24) {
    if (!id || !game.iconIds?.has(id)) return `<span class="ic" style="width:${px}px;height:${px}px"></span>`;
    return `<img class="ic" src="/images/icons/${id}.png" alt="" width="${px}" height="${px}" style="width:${px}px;height:${px}px">`;
}
