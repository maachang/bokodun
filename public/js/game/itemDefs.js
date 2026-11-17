// アイテムの定義をそろえる: items.json（消耗品・鍵・素手・呪文の見た目）に、equipment.json の武器（ダイス・重さ）と、magic.json の魔法（重さ・ダイス・種類）を重ねる。
// ゲーム（game.js）とテストが、同じ形のアイテムを使うための部品。画面にも DOM にも触らない。
//   武器: { id, name, kind: 'weapon', weaponClass, category, blunt, twoHanded, weightRange: [最小, 最大], dice, heavy? }
//   呪文: items.json の見た目・効果（type・visual・status など）に、magic.json の weight・costType・dice・price・tier を足す。
//         消費 MP・威力は、式（rules.js）で決まるので、items.json には持たない。

export function buildItems(items, equipment, magic) {
    const out = { ...items };
    for (const w of equipment.weapons) {
        out[w.id] = { id: w.id, name: w.name, kind: 'weapon', weaponClass: w.weaponClass, category: w.category, blunt: !!w.blunt, twoHanded: !!w.twoHanded, weightRange: w.weight, dice: w.dice };
    }
    for (const [id, sp] of Object.entries(magic.spells)) {
        if (!out[id] || out[id].kind !== 'spell') continue;   // 呪文の見た目がまだないもの（回復・補助）は、あとで足す
        out[id] = { ...out[id], weight: sp.weight, costType: sp.costType, dice: sp.dice, price: sp.price, tier: sp.tier };
    }
    return out;
}
