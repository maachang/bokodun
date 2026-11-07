"""H（ダマスカス自治領・辺境の街）の中身。手本は、一般街（city）と貴族街（city_noble）。街の中は、この build が丸ごと作る。
  - 施設 7 つ: 道具屋・武器屋・宿屋・神殿・冒険者ギルド・職業訓練所（ユーザー指定）＋ 自治領主の館（城はなく、最高権力者が住む館）
  - 中のマップは、既存を共有する（shop・city_inn・temple・guild_*。館は mansion_margrave＝辺境伯の屋敷）
  - 街の人（NPC）は、一般街・町の NPC を流用して、少数を置く
  - 高低: 東の街区（2）・館の高台（3）・神殿の高台（3）。川（南北・幅 1、水は 0）に橋（東西の通りと、南の脇道）。段差は 1 ずつ
  - 入口の前の通りは 2 マス（一般街と同じ。扉の前の立て札の段が、東西の通り）
"""

def _shop(shop_id, msg, icon): return {'nextMap': 'shop', 'params': {'shopId': shop_id}, 'message': msg, 'icon': icon}
def _to(next_map, msg, icon=None): return dict({'nextMap': next_map, 'message': msg}, **({'icon': icon} if icon else {}))

# (建物の文字, 左上 x, y, 幅, 扉の x（建物の左から）, 扉の文字, 立て札の文字（なし: None）, 出入口 links)
FACILITIES = [
    ('S', 2, 3, 4, 1, 'd', 'Q', _shop('weapon_shop', '武器屋に入る', 'weaponShopIcon')),
    ('S', 7, 3, 4, 1, 'd', 'q', _shop('item_shop', '道具屋に入る', 'itemShopIcon')),
    ('S', 21, 3, 4, 1, 'd', 'a', _to('guild_adv', '冒険者ギルドに入る', 'advGuildIcon')),
    ('H', 26, 3, 8, 3, 'Y', None, _to('mansion_margrave', '自治領主の館に入る')),   # 館は、ほかの 2 倍の幅（高台）
    ('I', 2, 10, 4, 1, 'N', 'M', _to('city_inn', '宿屋・酒場に入る', 'innIcon')),
    ('S', 7, 10, 4, 1, 'd', 'r', _to('guild_training', '職業訓練所に入る', 'trainingIcon')),
    ('J', 21, 10, 4, 1, 'D', 'c', _to('temple', '神殿に入る', 'templeIcon')),   # 神殿は高台
]

NPCS = [
    ('town_man', 5, 8), ('junior_merchant_man', 13, 14), ('elder_man', 23, 8), ('child_boy', 12, 16),
    ('town_middle_man', 28, 14), ('guard_spear', 16, 24), ('guard_light', 19, 24),
]

LEGEND_KEYS = ('S', 'I', 'J', 'd', 'N', 'D', 'M', 'Q', 'q', 'a', 'r', 'c', 'w', 'b')
SOLID = set('WHSIJdNDY')


def build(w, h, legend, city_legend, links, npcs):
    """H の街の中（layout・heights）を作り、legend・links・npcs に足す。(layout, heights) を返す"""
    assert (w, h) == (36, 26)
    g = [['p'] * w for _ in range(h)]
    lv = [[1] * w for _ in range(h)]
    # 段差: 東の街区（2）・館の高台（3）・神殿の高台（3）
    for y in range(1, 16):
        for x in range(20, w - 1): lv[y][x] = 2
    for y in range(1, 8):
        for x in range(25, w - 1): lv[y][x] = 3
    for y in range(9, 14):
        for x in range(21, 27): lv[y][x] = 3
    # 大通り（南北）・東西の通り（幅 2）・噴水
    for y in range(1, h - 1):
        for x in range(16, 20): g[y][x] = '='
    for ys in ((6, 7), (13, 14)):
        for y in ys:
            for x in range(1, w - 1): g[y][x] = '='
    for x in (17, 18):
        for y in (10, 11): g[y][x] = 'F'
    # 川（南北・幅 1。水は 0）と橋（東西の通り・南の脇道）
    for y in range(1, h - 1):
        g[y][15] = 'b' if y in (6, 7, 13, 14, 21, 22) else 'w'
        lv[y][15] = 0
    # 外壁と南の門
    for x in range(w): g[0][x] = g[h - 1][x] = 'W'; lv[0][x] = lv[h - 1][x] = 0
    for y in range(h): g[y][0] = g[y][w - 1] = 'W'; lv[y][0] = lv[y][w - 1] = 0
    g[h - 1][17] = g[h - 1][18] = 'G'
    # 家（施設以外）
    for x0, y0 in ((28, 10), (2, 17), (7, 17), (21, 17), (26, 17), (31, 17)):
        for y in range(y0, y0 + 3):
            for x in range(x0, x0 + 4): g[y][x] = 'H'
    # 施設
    for ch, x0, y0, wid, doff, door, sign, link in FACILITIES:
        for y in range(y0, y0 + 3):
            for x in range(x0, x0 + wid):
                assert g[y][x] == 'p', f'H の施設 ({x},{y}): 空きマスではない'
                g[y][x] = ch
        dx, dz = x0 + doff, y0 + 2
        g[dz][dx] = door
        if sign:
            assert g[dz + 1][dx + 1] in 'p=', f'H の立て札 ({dx + 1},{dz + 1}): 空きマスではない'
            g[dz + 1][dx + 1] = sign
        links[f'{dx},{dz}'] = dict(link, back={'x': dx, 'z': dz + 1, 'angle': 3.14159})
    # 木・花壇
    for x, y, c in ((2, 1, 'T'), (13, 1, 'T'), (2, 23, 'T'), (13, 23, 'T'), (33, 23, 'T'), (20, 10, 'v'), (20, 11, 'f'), (12, 11, 'f'), (13, 11, 'v')):
        assert g[y][x] == 'p', f'H の飾り ({x},{y}): 空きマスではない'
        g[y][x] = c
    legend['Y'] = 'mansion_door'
    for k in LEGEND_KEYS: legend[k] = city_legend[k]
    for nid, x, z in NPCS:
        assert g[z][x] in 'p=', f'H の NPC {nid} ({x},{z}): 歩ける空きマスではない'
        npcs.append({'id': nid, 'x': x, 'z': z})
    # 段差は、歩ける隣どうしで 1 以下
    for y in range(h):
        for x in range(w):
            if g[y][x] in SOLID or g[y][x] == 'w': continue
            for dx, dz in ((1, 0), (0, 1)):
                xx, yy = x + dx, y + dz
                if xx < w and yy < h and g[yy][xx] not in SOLID and g[yy][xx] != 'w':
                    assert abs(lv[y][x] - lv[yy][xx]) <= 1, f'H の段差 ({x},{y})-({xx},{yy}) が 2 以上'
    return [''.join(r) for r in g], [''.join(str(v) for v in r) for r in lv]
