"""C（ミレニアム自由都市・砂漠のオアシスの街）の中身。手本は、サンプルの街（city）と D・E の作り。街の中は、この build が丸ごと作る。
  - 自由都市: 王も神殿も置かず、商人ギルド（大きな建物）が街の中心。市場の屋台（city の 1〜4）が広場に並ぶ（施設の選びは、ユーザーに確認していない。変更は指示で）
  - 施設 5 つ: 道具屋・武器屋・宿屋・冒険者ギルド・商人ギルド。中のマップは既存を共有。街の人は既存の NPC を流用
  - オアシス: 街の南東に水の池（水は 0）。まわりにヤシの木
  - 中東風の建物（ネット検索で調べた特徴: 厚い日干しレンガの砂色の壁・平らな屋根と縁・アーチの窓・木の格子 mashrabiya・青緑のタイルのドーム）
  - 砂漠の見た目: 地面は石畳ではなく土（広場 plaza_earth・大通り earth_road・飾りの下は decorFloor 'packedEarth'）。木はヤシ・サボテン。環境は砂漠（霧は薄め）
  - 高低: サンプル（city）の高さを土台に、池の水（0）を重ねる。段差は 1 以下
"""
import town_heights as TH
from town_d import _shop, _to

FACILITIES = [   # (建物の文字, 左上 x, y, 幅, 扉の x（建物の左から）, 扉の文字, 立て札の文字, 出入口 links)
    ('S', 2, 10, 4, 1, 'd', 'q', _shop('item_shop', '道具屋に入る', 'itemShopIcon')),
    ('S', 7, 10, 4, 1, 'd', 'Q', _shop('weapon_shop', '武器屋に入る', 'weaponShopIcon')),
    ('S', 12, 10, 4, 1, 'd', 'a', _to('guild_adv', '冒険者ギルドに入る', 'advGuildIcon')),
    ('I', 12, 2, 4, 1, 'N', 'M', _to('city_inn', '宿屋・酒場に入る', 'innIcon')),
    ('J', 28, 2, 8, 3, 'D', 'c', _to('temple', '神殿に入る', 'templeIcon')),   # 宗教は神殿（ユーザー指定）。ドームの大きな神殿
    ('K', 25, 9, 9, 4, 'd', 'g', _to('guild_merchant_c', '商人ギルドに入る', 'merchantGuildIcon')),   # 商人ギルドは、ほかの 2 倍の幅（街の中心）
]
POND = (27, 35, 20, 25)   # オアシスの池（x0, x1, y0, y1）
STALLS = (('1', 23, 17), ('2', 26, 17), ('3', 15, 17), ('4', 12, 17), ('1', 16, 21), ('3', 22, 21))   # 広場の屋台
PALMS = ((26, 19), (36, 19), (26, 26), (36, 26), (31, 19), (31, 26), (2, 1), (37, 1), (2, 28), (16, 6), (23, 6))   # ヤシ（オアシスのまわりと、街のすみ）
CACTI = ((37, 12), (3, 22), (16, 28))

NPCS = [   # 砂漠の住民（sdServer の画像）。議長は、商人ギルドの前
    ('desert_middle_man', 24, 13), ('desert_woman', 6, 17), ('desert_man', 19, 22),
    ('desert_middle_woman', 14, 15), ('desert_old_man', 5, 13), ('desert_old_woman', 29, 16), ('desert_boy', 9, 22),
    ('desert_girl', 17, 25), ('merchant_man', 22, 15), ('traveler_merchant', 20, 12), ('guard_spear', 17, 27), ('guard_light', 22, 27),
    ('priest_man', 32, 7), ('priest_woman', 35, 7),
]

LEGEND_KEYS = ('S', 'I', 'd', 'N', 'D', 'M', 'Q', 'q', 'a', 'c', 'g', 'w', '1', '2', '3', '4')
SOLID = set('WHSIJKdND1234')
SKIN = {'T': 'palm', 'f': 'cactus', 'v': 'cactus',   # 木はヤシ、花壇の代わりはサボテン
        'p': 'plaza_earth', '=': 'earth_road',   # 地面は石畳ではなく土（ユーザー指示）
        'H': 'mideast_house', 'S': 'mideast_shop', 'I': 'mideast_inn', 'K': 'mideast_guild', 'J': 'mideast_temple'}   # 中東風の建物（砂色の漆喰・平らな屋根・アーチの窓・木の格子・青緑のドーム）


def build(w, h, legend, city_legend, links, npcs):
    """C の街の中（layout・heights）を作り、legend・links・npcs に足す。(layout, heights) を返す"""
    assert (w, h) == (40, 30)
    g = [['p'] * w for _ in range(h)]
    for y in range(1, h - 1):   # 大通り（南北）・東西の通り・噴水
        for x in range(18, 22): g[y][x] = '='
    for y in range(14, 17):
        for x in range(1, w - 1): g[y][x] = '='
    for x in (19, 20):
        for y in (14, 15): g[y][x] = 'F'
    x0, x1, y0, y1 = POND   # オアシスの池
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1): g[y][x] = 'w'
    for x in range(w): g[0][x] = g[h - 1][x] = 'W'
    for y in range(h): g[y][0] = g[y][w - 1] = 'W'
    g[h - 1][19] = g[h - 1][20] = 'G'
    for hx, hy in ((2, 2), (7, 2), (2, 18), (7, 18), (2, 24), (7, 24), (12, 24), (27, 28 - 1)):
        if hy + 3 >= h - 1: continue
        for y in range(hy, hy + 3):
            for x in range(hx, hx + 4): g[y][x] = 'H'
    for ch, fx, fy, wid, doff, door, sign, link in FACILITIES:
        for y in range(fy, fy + 3):
            for x in range(fx, fx + wid):
                assert g[y][x] == 'p', f'C の施設 ({x},{y}): 空きマスではない'
                g[y][x] = ch
        dx, dz = fx + doff, fy + 2
        g[dz][dx] = door
        assert g[dz + 1][dx + 1] == 'p', f'C の立て札 ({dx + 1},{dz + 1}): 空きマスではない'
        g[dz + 1][dx + 1] = sign
        links[f'{dx},{dz}'] = dict(link, back={'x': dx, 'z': dz + 1, 'angle': 3.14159})
    for ch, x, y in STALLS:
        assert g[y][x] == 'p', f'C の屋台 ({x},{y}): 空きマスではない'
        g[y][x] = ch
    for (x, y) in PALMS:
        assert g[y][x] == 'p', f'C のヤシ ({x},{y}): 空きマスではない'
        g[y][x] = 'T'
    for (x, y) in CACTI:
        assert g[y][x] == 'p', f'C のサボテン ({x},{y}): 空きマスではない'
        g[y][x] = 'f'
    for k in (set(LEGEND_KEYS) - {'K'}) | {'T', 'f', 'v', 'F', 'G', 'W', 'p', '=', 'H'}: legend[k] = city_legend[k]
    legend.update(SKIN)
    for nid, x, z in NPCS:
        assert g[z][x] in 'p=', f'C の NPC {nid} ({x},{z}): 歩ける空きマスではない'
        npcs.append({'id': nid, 'x': x, 'z': z})
    lv = TH.sample_field(w, h, 0, 0)
    fixed = set()
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1): lv[y][x] = 0; fixed.add((x, y))
    walk = [[g[y][x] not in SOLID and g[y][x] != 'w' for x in range(w)] for y in range(h)]
    TH.relax(lv, walk, fixed)
    for ch, fx, fy, wid, doff, door, sign, link in FACILITIES:
        lv[fy + 2][fx + doff] = lv[fy + 3][fx + doff]
    for y in range(h):
        for x in range(w):
            if g[y][x] in SOLID or g[y][x] == 'w': continue
            for dx, dz in ((1, 0), (0, 1)):
                xx, yy = x + dx, y + dz
                if xx < w and yy < h and g[yy][xx] not in SOLID and g[yy][xx] != 'w':
                    assert abs(lv[y][x] - lv[yy][xx]) <= 1, f'C の段差 ({x},{y})-({xx},{yy}) が 2 以上'
    return [''.join(r) for r in g], [''.join(TH.CH36[v] for v in r) for r in lv]
