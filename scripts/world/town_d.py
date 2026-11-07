"""D（グリーン王国・最初の街）の中身。town_layout（枠）の家の並びの一部を、施設に置き換える。
  - 施設 7 つ: 武器屋・道具屋・宿屋・冒険者ギルド・神殿・魔法ギルド・職業訓練所（ユーザー指定）
  - 中のマップは、一般街（city）と同じものを共有する（shop・city_inn・temple・guild_*）
  - 街の人（NPC）は、一般街の NPC を流用して、少数を置く
  - 施設は 4×3 の建物。南の面（建物の下の段）の、左から 2 つ目に扉。扉の斜め前（右下）に立て札。
"""

# (建物の文字, 建物の左上 x, y, 扉の文字, 立て札の文字, 出入口 links)
def _shop(shop_id, msg, icon): return {'nextMap': 'shop', 'params': {'shopId': shop_id}, 'message': msg, 'icon': icon}
def _to(next_map, msg, icon): return {'nextMap': next_map, 'message': msg, 'icon': icon}

FACILITIES = [
    ('S', 2, 10, 'd', 'q', _shop('item_shop', '道具屋に入る', 'itemShopIcon')),
    ('S', 7, 10, 'd', 'Q', _shop('weapon_shop', '武器屋に入る', 'weaponShopIcon')),
    ('I', 12, 2, 'N', 'M', _to('city_inn', '宿屋・酒場に入る', 'innIcon')),
    ('J', 27, 10, 'D', 'c', _to('temple', '神殿に入る', 'templeIcon')),
    ('S', 32, 10, 'd', 'a', _to('guild_adv', '冒険者ギルドに入る', 'advGuildIcon')),
    ('S', 27, 2, 'd', 'm', _to('guild_mage', '魔法ギルドに入る', 'mageGuildIcon')),
    ('S', 32, 2, 'd', 'r', _to('guild_training', '職業訓練所に入る', 'trainingIcon')),
]

# 街の人（一般街の NPC を流用）。歩ける空きマスに置く
NPCS = [
    ('town_man', 6, 17), ('town_boy', 12, 17), ('town_middle_man', 28, 13), ('junior_merchant_man', 24, 9),
    ('elder_man', 6, 25), ('child_boy', 15, 21), ('guard_spear', 17, 27), ('guard_light', 22, 27),
]

LEGEND_KEYS = ('S', 'I', 'J', 'd', 'N', 'D', 'M', 'Q', 'q', 'a', 'm', 'r', 'c')


def apply(layout, legend, city_legend, links, npcs):
    """layout（文字列の配列）の家を施設に置き換え、legend・links・npcs に足す。layout を返す"""
    g = [list(r) for r in layout]
    for ch, x0, y0, door, sign, link in FACILITIES:
        for y in range(y0, y0 + 3):
            for x in range(x0, x0 + 4):
                assert g[y][x] == 'H', f'D の施設 ({x},{y}): 家のあった場所ではない'
                g[y][x] = ch
        dx, dz = x0 + 1, y0 + 2
        g[dz][dx] = door
        assert g[dz + 1][dx + 1] == 'p', f'D の立て札 ({dx + 1},{dz + 1}): 空きマスではない'
        g[dz + 1][dx + 1] = sign
        links[f'{dx},{dz}'] = dict(link, back={'x': dx, 'z': dz + 1, 'angle': 3.14159})
    for k in LEGEND_KEYS: legend[k] = city_legend[k]
    for nid, x, z in NPCS:
        assert g[z][x] in 'p=', f'D の NPC {nid} ({x},{z}): 歩ける空きマスではない'
        npcs.append({'id': nid, 'x': x, 'z': z})
    return [''.join(r) for r in g]
