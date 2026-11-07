"""D（グリーン王国・最初の街）の中身。街の中は、この build が丸ごと作る（town_layout の枠は使わない）。
  - 施設 7 つ: 武器屋・道具屋・宿屋・冒険者ギルド・神殿・魔法ギルド・職業訓練所（ユーザー指定）
  - 中のマップは、一般街（city）と同じものを共有する（shop・city_inn・temple・guild_*）
  - 街の人（NPC）は、一般街の NPC を流用して、少数を置く
  - 施設の建物は 幅×3。南の面（建物の下の段）に扉。扉の斜め前（右下）に立て札。入口の前の通りは 2 マス以上あける
  - 高低: サンプル（city）の高さを土台にし（town_heights.sample_field）、北の王城区・東の神殿の高台（2〜3）と、川（東西、幅 2・水は 0。橋は大通り 4 マス・脇道 2 マス）を重ねる。段差は 1 ずつ
  - 王城: 北の外壁の城門（2 マス）。中は既存の王城（castle）。出口は入った場所（城門の前）へ戻る
"""
import town_heights as TH

# (建物の文字, 建物の左上 x, y, 幅, 扉の x（建物の左から）, 扉の文字, 立て札の文字, 出入口 links)
def _shop(shop_id, msg, icon): return {'nextMap': 'shop', 'params': {'shopId': shop_id}, 'message': msg, 'icon': icon}
def _to(next_map, msg, icon): return {'nextMap': next_map, 'message': msg, 'icon': icon}

FACILITIES = [
    ('S', 2, 10, 4, 1, 'd', 'q', _shop('item_shop', '道具屋に入る', 'itemShopIcon')),
    ('S', 7, 10, 4, 1, 'd', 'Q', _shop('weapon_shop', '武器屋に入る', 'weaponShopIcon')),
    ('S', 12, 10, 4, 1, 'd', 'a', _to('guild_adv', '冒険者ギルドに入る', 'advGuildIcon')),
    ('I', 12, 2, 4, 1, 'N', 'M', _to('city_inn', '宿屋・酒場に入る', 'innIcon')),
    ('S', 27, 2, 4, 1, 'd', 'm', _to('guild_mage', '魔法ギルドに入る', 'mageGuildIcon')),
    ('S', 32, 2, 4, 1, 'd', 'r', _to('guild_training', '職業訓練所に入る', 'trainingIcon')),
    ('J', 28, 9, 8, 3, 'D', 'c', _to('temple', '神殿に入る', 'templeIcon')),   # 神殿は、ほかの 2 倍の幅（高台）
]

# 街の人（一般街の NPC を流用）。歩ける空きマスに置く
NPCS = [
    ('town_man', 6, 17), ('town_boy', 12, 17), ('town_middle_man', 28, 13), ('junior_merchant_man', 24, 9),
    ('elder_man', 14, 26), ('child_boy', 15, 21), ('guard_spear', 17, 27), ('guard_light', 22, 27),
    ('gate_guard', 17, 1), ('gate_guard', 22, 1),   # 城門の衛兵
]

LEGEND_KEYS = ('S', 'I', 'J', 'd', 'N', 'D', 'M', 'Q', 'q', 'a', 'm', 'r', 'c', 'w', 'b')
SOLID = set('WHSIJdNDC')   # 通れない（段差の確認の対象外）


def build(w, h, legend, city_legend, links, npcs, facilities=None, npc_list=None, skin=None):
    """D の街の中（layout・heights）を作り、legend・links・npcs に足す。(layout, heights) を返す。
    A（雪国）も、同じ作り（サンプルの高さを土台に、川・橋・高台・城門）で、施設・街の人・見た目（skin: 凡例の文字 → 物体の名前を上書き）だけを変える"""
    facilities = facilities or FACILITIES
    npc_list = npc_list or NPCS
    assert (w, h) == (40, 30)
    g = [['p'] * w for _ in range(h)]
    lv = None   # 高さは、街を作り終えてから（サンプルの高さを土台にして、川・高台を重ねる）
    # 大通り（南北・東西）・広場・噴水
    for y in range(1, h - 1):
        for x in range(18, 22): g[y][x] = '='
    for y in range(14, 17):
        for x in range(1, w - 1): g[y][x] = '='
    for x in (19, 20):
        for y in (14, 15): g[y][x] = 'F'
    # 川（東西・幅 2）。水の高さは 0。橋: 大通り 4 マス・脇道 2 マス
    for y in (22, 23):
        for x in range(1, w - 1):
            g[y][x] = 'b' if (18 <= x <= 21 or x in (6, 7, 32, 33)) else 'w'
    # 外壁・南の門・北の城門
    for x in range(w): g[0][x] = g[h - 1][x] = 'W'
    for y in range(h): g[y][0] = g[y][w - 1] = 'W'
    g[h - 1][19] = g[h - 1][20] = 'G'
    g[0][19] = g[0][20] = 'C'
    for x in (19, 20):
        links[f'{x},0'] = {'nextMap': 'castle', 'message': '王城に入る', 'back': {'x': x, 'z': 1, 'angle': 3.14159}}
    # 家（施設以外）
    for x0, y0 in ((2, 2), (7, 2), (2, 18), (7, 18), (27, 18), (32, 18), (2, 25), (7, 25), (27, 25), (32, 25)):
        for y in range(y0, y0 + 3):
            for x in range(x0, x0 + 4): g[y][x] = 'H'
    # 施設
    for ch, x0, y0, wid, doff, door, sign, link in facilities:
        for y in range(y0, y0 + 3):
            for x in range(x0, x0 + wid):
                assert g[y][x] == 'p', f'D の施設 ({x},{y}): 空きマスではない'
                g[y][x] = ch
        dx, dz = x0 + doff, y0 + 2
        g[dz][dx] = door
        assert g[dz + 1][dx + 1] == 'p', f'D の立て札 ({dx + 1},{dz + 1}): 空きマスではない'
        g[dz + 1][dx + 1] = sign
        links[f'{dx},{dz}'] = dict(link, back={'x': dx, 'z': dz + 1, 'angle': 3.14159})
    # 木・花壇
    for x, y, c in ((2, 1, 'T'), (37, 1, 'T'), (16, 18, 'T'), (23, 18, 'T'), (2, 28, 'T'), (37, 28, 'T'), (16, 6, 'f'), (23, 6, 'v'),
                    (26, 12, 'f'), (37, 12, 'v'), (15, 17, 'f'), (24, 17, 'v')):
        assert g[y][x] == 'p', f'D の飾り ({x},{y}): 空きマスではない'
        g[y][x] = c
    legend.update({'C': 'castle_gate'})
    for k in set(LEGEND_KEYS) | {c for f in facilities for c in (f[0], f[5], f[6])}: legend[k] = city_legend[k]   # 施設の建物・扉・立て札の文字も
    if skin: legend.update(skin)   # 見た目の差し替え（雪国: 雪をかぶった屋根・石畳など）
    for nid, x, z in npc_list:
        assert g[z][x] in 'p=', f'D の NPC {nid} ({x},{z}): 歩ける空きマスではない'
        npcs.append({'id': nid, 'x': x, 'z': z})
    # 高さ: サンプル（city）の高さを土台にして、川（0）と高台（王城区・神殿）を重ねる。段差は、歩ける隣どうしで 1 以下
    lv = TH.sample_field(w, h, 0, 0)
    fixed = set()
    for y in (22, 23):
        for x in range(1, w - 1): lv[y][x] = 0; fixed.add((x, y))
    for (x0, x1, y0, y1) in ((1, w - 2, 3, 7), (26, w - 2, 9, 12)):   # 王城区（北）・神殿の高台（東）: 2〜3 の起伏のある高台
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1): lv[y][x] = 3 if lv[y][x] >= 2 else 2; fixed.add((x, y))
    walk = [[g[y][x] not in SOLID and g[y][x] != 'w' for x in range(w)] for y in range(h)]
    TH.relax(lv, walk, fixed)
    for ch, x0, y0, wid, doff, door, sign, link in facilities:   # 扉のマスの高さは、扉の前のマスと同じ（段差なく入れる）
        lv[y0 + 2][x0 + doff] = lv[y0 + 3][x0 + doff]
    for y in range(h):
        for x in range(w):
            if g[y][x] in SOLID or g[y][x] == 'w': continue
            for dx, dz in ((1, 0), (0, 1)):
                xx, yy = x + dx, y + dz
                if xx < w and yy < h and g[yy][xx] not in SOLID and g[yy][xx] != 'w':
                    assert abs(lv[y][x] - lv[yy][xx]) <= 1, f'D の段差 ({x},{y})-({xx},{yy}) が 2 以上'
    return [''.join(r) for r in g], [''.join(TH.CH36[v] for v in r) for r in lv]


# ---- A（キュラビッド帝国。雪国）: D と同じ作りで、施設・街の人・見た目を変える ----
FACILITIES_A = [f for f in FACILITIES if f[6] != 'm'] + [
    ('S', 27, 2, 4, 1, 'd', 'k', _to('guild_smith', '鍛冶屋に入る', 'smithIcon')),   # 魔法ギルドの代わりに、鍛冶屋（寒い国の、鉄と火）
]
NPCS_A = [
    ('town_man', 6, 17), ('town_old_woman', 12, 17), ('town_middle_woman', 28, 13), ('junior_merchant_woman', 24, 9),
    ('elder_woman', 6, 25), ('child_boy', 15, 21), ('guard_spear', 17, 27), ('guard_light', 22, 27),
    ('gate_guard', 17, 1), ('gate_guard', 22, 1),
]
SKIN_SNOW = {   # 雪国の見た目: 雪をかぶった屋根（軽く）・雪の積もった石畳と大通り
    'H': 'brick_house_snow', 'S': 'shop_building_snow', 'I': 'inn_building_snow', 'J': 'temple_building_snow',
    'p': 'plaza_stone_snow', '=': 'paved_road_snow',
    'T': 'conifer_tree_a', 'f': 'conifer_tree_b', 'v': 'conifer_tree_a',   # 木は針葉樹（花壇の代わりも、針葉樹）
}


def build_a(w, h, legend, city_legend, links, npcs):
    return build(w, h, legend, city_legend, links, npcs, facilities=FACILITIES_A, npc_list=NPCS_A, skin=SKIN_SNOW)
