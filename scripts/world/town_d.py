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


def build(w, h, legend, city_legend, links, npcs, facilities=None, npc_list=None, skin=None, castle=True, tree_center=False, scatter=None, gate_flank=None):
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
    if gate_flank:   # 門の両脇だけ、壁のブロック（門の扉は、ブロックの壁にはさまれて、向きが決まる。茂みの壁の板は、壁と数えない）
        for x in (18, 21): g[0][x] = g[h - 1][x] = 'V'
        legend['V'] = gate_flank
    if tree_center:   # 街の中心の噴水の代わりに、世界樹（G）。木は 1 本（19,14）で、残りは広場
        for x in (19, 20):
            for y in (14, 15): g[y][x] = 'p'
        g[14][19] = 'Y'
        for x, y in ((20, 14), (19, 15), (20, 15)): g[y][x] = 'j'   # 世界樹のまわりの柵（入れない。大通りの両脇の列は通れる）
    if castle: g[0][19] = g[0][20] = 'C'   # 城門（castle は、中の王城のマップ名。True なら共通の castle。G は、城を置かない）
    for x in ((19, 20) if castle else ()):
        links[f'{x},0'] = {'nextMap': castle if isinstance(castle, str) else 'castle', 'message': '王城に入る', 'back': {'x': x, 'z': 1, 'angle': 3.14159}}
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
    if castle: legend.update({'C': 'castle_gate'})
    if tree_center: legend['Y'] = 'world_tree'; legend['j'] = 'wooden_fence'
    for k in set(LEGEND_KEYS) | {c for f in facilities for c in (f[0], f[5], f[6])}:   # 施設の建物・扉・立て札の文字も（サンプルの凡例にない文字は、skin が決める）
        if k in city_legend: legend[k] = city_legend[k]
    if skin: legend.update(skin)   # 見た目の差し替え（雪国: 雪をかぶった屋根・石畳など）
    for nid, x, z in npc_list:
        assert g[z][x] in 'p=', f'D の NPC {nid} ({x},{z}): 歩ける空きマスではない'
        npcs.append({'id': nid, 'x': x, 'z': z})
    if scatter:   # 森の街: 草・シダ・木を、空きマスにばらまく（決まった乱数。扉の前・街の人・広場の中心・立て札は避ける。木は、まわりが空きマスで、間をあける）
        import random
        rnd = random.Random(20261108)
        keep = {(x, z) for _, x, z in npc_list}
        for ch, x0, y0, wid, doff, door, sign, link in facilities:
            dx, dz = x0 + doff, y0 + 2
            keep |= {(dx, dz + 1), (dx, dz + 2), (dx + 1, dz + 1), (dx - 1, dz + 1), (dx + 1, dz + 2)}
        for x in range(16, 24):
            for y in range(11, 19): keep.add((x, y))
        free = [(x, y) for y in range(2, h - 2) for x in range(2, w - 2) if g[y][x] == 'p' and (x, y) not in keep]
        rnd.shuffle(free)
        trees = []
        for ch, count, kind in scatter:
            put = 0
            for x, y in free:
                if put >= count: break
                if g[y][x] != 'p': continue
                if kind == 'tree':
                    if any(abs(x - tx) + abs(y - ty) < 4 for tx, ty in trees): continue
                    if any(g[y + dy][x + dx] not in 'p=' for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1))): continue
                    trees.append((x, y))
                g[y][x] = ch; put += 1
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
    return build(w, h, legend, city_legend, links, npcs, facilities=FACILITIES_A, npc_list=NPCS_A, skin=SKIN_SNOW, castle='castle_a')


# ---- F（ライアン獣王国。山の麓の、獣人とドワーフの街）: D と同じ作りで、施設・街の人・見た目を変える ----
def _remap(f, **kw):   # 施設の出入口 links の差し替え（店の種類・ギルドのマップ）
    link = dict(f[7])
    if 'shopId' in kw: link['params'] = {'shopId': kw['shopId']}
    if 'nextMap' in kw: link['nextMap'] = kw['nextMap']
    return f[:7] + (link,)


FACILITIES_F = [(_remap(f, shopId='item_shop_f') if f[6] == 'q' else _remap(f, shopId='weapon_shop_f') if f[6] == 'Q' else _remap(f, nextMap='city_inn_f') if f[6] == 'M' else _remap(f, nextMap='guild_adv_f') if f[6] == 'a' else _remap(f, nextMap='guild_training_f') if f[6] == 'r' else f)
                for f in FACILITIES if f[6] not in ('m', 'c')] + [   # 魔法ギルド・神殿は置かない（神殿の品は、道具屋 item_shop_f が売る）。ギルドは、獣人の複製のマップ
    ('S', 27, 2, 4, 1, 'd', 'k', _to('guild_smith_f', '鍛冶屋に入る', 'smithIcon')),   # 鍛冶屋（鉱山の国。店員は獣人）
    ('S', 28, 9, 4, 1, 'd', 'g', _to('guild_merchant_f', '商人ギルドに入る', 'merchantGuildIcon')),   # 商人ギルド（猫の獣人のギルド長）
]
NPCS_F = [   # 兵士は、コボルト（sdServer 11）だけ（ウッドゴーレムは、エルフの国）。獣人（一般）とドワーフ。貴族・獣王・宰相・フェンリル像は、王城（castle_f）の中
    ('dwarf_smith', 28, 6), ('beast_a', 6, 17), ('beast_f_a', 12, 17), ('dwarf_man', 28, 13), ('beast_b', 24, 9),
    ('dwarf_woman', 14, 26), ('beast_f_b', 15, 21), ('beast_soldier_kobold', 17, 27), ('beast_soldier_kobold', 22, 27),
    ('dwarf_man', 30, 15), ('beast_f_a', 34, 12), ('beast_c', 8, 21), ('beast_f_c', 33, 21), ('dwarf_woman', 10, 21),
    ('beast_a', 36, 14), ('beast_d', 21, 21), ('beast_f_d', 5, 21),   # 貴族は、街に出ない（城の中の廷臣）
    ('beast_soldier_kobold_gate', 17, 1), ('beast_soldier_kobold_gate', 22, 1),
]
SKIN_FOOT = {   # 山の麓の見た目: 木造の家（獣人の家）・針葉樹
    'H': 'wooden_house', 'T': 'conifer_tree_a', 'f': 'conifer_tree_b', 'v': 'conifer_tree_a',
}


def build_f(w, h, legend, city_legend, links, npcs):
    return build(w, h, legend, city_legend, links, npcs, facilities=FACILITIES_F, npc_list=NPCS_F, skin=SKIN_FOOT, castle='castle_f')


# ---- G（デイラミ精霊国。大森林の中心の、エルフと精霊の街）: D と同じ作りで、街の中心に世界樹 ----
FACILITIES_G = [(_remap(f, shopId='item_shop_g') if f[6] == 'q' else _remap(f, shopId='weapon_shop_g') if f[6] == 'Q' else _remap(f, nextMap='city_inn_g') if f[6] == 'M' else _remap(f, nextMap='guild_adv_g') if f[6] == 'a' else _remap(f, nextMap='guild_mage_g') if f[6] == 'm' else f)
                for f in FACILITIES if f[6] not in ('r', 'c')] + [
    ('S', 23, 10, 3, 1, 'd', 'x', _to('elder_house_g', '長老の家に入る', 'templeIcon')),   # 世界樹のそばの、小さな長老の家（長老たちは、この中にいる）
]   # 職業訓練所・神殿は置かない（神殿の品は道具屋 item_shop_g が売る。冒険者ギルド・魔法ギルドは、長老一族の複製のマップ）
NPCS_G = [   # エルフの住民と、世界樹を管理する長老（世界樹のそば）
    ('elf_woman_a', 6, 17), ('elf_man_a', 12, 17), ('elf_woman_b', 28, 13), ('elf_man_b', 24, 9),
    ('elf_woman_c', 14, 26), ('elf_girl', 15, 21), ('elf_boy', 24, 21), ('elf_man_c', 30, 15),
    ('elf_guard_man', 17, 27), ('elf_guard_woman', 22, 27), ('elf_soldier_golem', 17, 1), ('elf_soldier_golem', 22, 1),   # 兵士は、エルフの守備隊（sdServer 327・328）と、ウッドゴーレム（sdServer 51。城門の番）
    ('fairy_wisp', 8, 15), ('fairy_sylph', 30, 21), ('fairy_undine', 33, 15), ('fairy_salamander', 12, 21),   # 妖精（敵キャラの妖精系。精霊国では、街に出る・おとなしい）
    ('fairy_gnome', 26, 6), ('fairy_unicorn', 6, 21), ('fairy_pegasus', 20, 24),
]
SKIN_FOREST = {   # 森の街: 石畳でなく森の地面・大通りは土の道・外壁は茂みの壁・建物は木造・木は森の木
    'p': 'plaza_forest', '=': 'dirt_road', 'W': 'forest_hedge_wall',
    'H': 'wooden_house', 'S': 'wooden_house_window', 'I': 'wooden_house_window',
    'T': 'great_tree_a', 'f': 'forest_tree_b', 'v': 'forest_tree_a',
    'z': 'grass_tuft', 'y': 'fern', 'x': 'elder_sign',
}
SCATTER_G = (('z', 70, 'plant'), ('y', 50, 'plant'), ('v', 22, 'tree'), ('f', 14, 'tree'))   # 草・シダ・木（広場のまわりと、街のあちこち）


def build_g(w, h, legend, city_legend, links, npcs):
    return build(w, h, legend, city_legend, links, npcs, facilities=FACILITIES_G, npc_list=NPCS_G, skin=SKIN_FOREST, castle='castle_g', tree_center=True, scatter=SCATTER_G, gate_flank='wooden_wall')
