"""国力のランクに合わせた、街の通りの人（NPC）の追加（街の規模。国力の段階の下限: S 20・A 16・B 12・C 8。2026-11-09。仕様書 43-100）。
  すでに下限を超える街（B・F・C・A）と、独自の国（G・J）は、そのまま。足りない街（D・E・H・I）だけ、一般の住民（女性・子供を中心に）を足す。
  位置は、広場・大通りの歩ける所（まわり 3×3 が石畳）で、既存の NPC・出入口から離れた所を、機械的に選んだ値（再現は、スクリプトで可能）。貴族・国の代表は、置かない
"""
EXTRA = {
    'd': [('town_woman', 37, 4), ('town_girl', 37, 25), ('town_old_woman', 2, 6), ('town_middle_woman', 12, 6), ('child_girl', 17, 12), ('merchant_woman', 37, 14)],
    'e': [('town_woman', 15, 3), ('town_girl', 2, 3), ('town_old_woman', 2, 17), ('town_middle_woman', 8, 5)],
    'h': [('town_woman', 2, 21)],
    'i': [('town_woman', 23, 3), ('town_girl', 37, 3), ('town_old_woman', 30, 5), ('town_middle_woman', 37, 17), ('child_girl', 17, 19), ('merchant_woman', 19, 6), ('junior_merchant_woman', 22, 9), ('elder_woman', 19, 15)],
}


def add(town_id, npcs):
    """街の NPC 一覧（npcs）に、その街の追加分を足す（すでに同じ ID・位置があれば足さない）"""
    for nid, x, z in EXTRA.get(town_id, ()):
        if not any(n['x'] == x and n['z'] == z for n in npcs): npcs.append({'id': nid, 'x': x, 'z': z})
