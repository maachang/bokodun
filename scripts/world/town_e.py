"""E（ガリレオ連盟・南国の大きな港）の中身。手本は、サンプルの街（city）と D・H の作り。街の中は、この build が丸ごと作る。
  - 施設 6 つ: 道具屋・武器屋・宿屋・冒険者ギルド・商人ギルド（港の取引）・神殿（サンプル city の施設から、港に合うもの。変更はユーザーに確認）
  - 中のマップは、既存を共有する（shop・city_inn・temple・guild_*）。街の人は、既存の NPC を流用
  - 骨格（作り替え）: 街の中ほどを、**運河**（東の港から、西の壁まで。幅 2）が東西に走り、**橋**（3 本）で、北と南をつなぐ。運河の両岸に、**遊歩道**（石畳）。北岸の北側に店、南に、ギルドと議長の館。神殿は、北の高台
  - 大きな港（ユーザー指定）: 街の東に、水の港（水路）と岸壁（石畳）。岸壁から、桟橋（木の橋）が水の中へ。水の上に、帆船（見た目だけ。船での移動は未実装）。岸壁に、木箱・樽（野外用 crate_out・barrel_out。屋内用は、天井の板が頭の上に浮く）
  - 高低: サンプル（city）の高さを土台にし（town_heights.sample_field）、神殿の高台（2〜3）と、港の水（0）・桟橋（0）を重ねる。段差は 1 以下
"""
import town_heights as TH

def _shop(shop_id, msg, icon): return {'nextMap': 'shop', 'params': {'shopId': shop_id}, 'message': msg, 'icon': icon}
def _to(next_map, msg, icon): return {'nextMap': next_map, 'message': msg, 'icon': icon}

# (建物の文字, 左上 x, y, 幅, 扉の x（建物の左から）, 扉の文字, 立て札の文字, 出入口 links)
FACILITIES = [
    ('S', 2, 7, 4, 1, 'd', 'q', _shop('item_shop', '道具屋に入る', 'itemShopIcon')),
    ('S', 7, 7, 4, 1, 'd', 'Q', _shop('weapon_shop', '武器屋に入る', 'weaponShopIcon')),
    ('I', 12, 7, 4, 1, 'N', 'M', _to('city_inn', '宿屋・酒場に入る', 'innIcon')),
    ('S', 23, 7, 4, 1, 'd', 'a', _to('guild_adv', '冒険者ギルドに入る', 'advGuildIcon')),
    ('S', 2, 19, 4, 1, 'd', 'g', _to('guild_merchant', '商人ギルドに入る', 'merchantGuildIcon')),
    ('H', 2, 24, 8, 3, 'Y', 'x', {'nextMap': 'mansion_chairman_e', 'message': '議長の館に入る'}),   # 議長の館（国のトップの館。ほかの 2 倍の幅。扉の上の絵はなし）
    ('J', 23, 2, 4, 1, 'D', 'c', _to('temple', '神殿に入る', 'templeIcon')),   # 神殿は高台
    ('S', 27, 5, 3, 0, 'd', 'z', {'nextMap': 'town_k1', 'message': '渡し船に乗る（マカヒキ島のコマチ港町へ）', 'spawn': {'x': 22, 'z': 18, 'angle': 3.14159}}),   # 渡し場（扉は西端。立て札を桟橋の入口（29,4）から外す）（港の岸壁の西。マカヒキ島のコマチ港町（K1）へ渡し船。着く所は、コマチ港町の渡し場の前）
]

HARBOR = (30, 38, 2, 27)       # 港の水（x0, x1, y0, y1）
QUAY_X = 29                    # 岸壁の列
PIER_ROWS = (4, 10, 17, 23)    # 桟橋の行（x30〜37）
SHIPS = (('L', 34, 7), ('L', 34, 13), ('L', 34, 20), ('L', 35, 26), ('l', 32, 8), ('l', 31, 14), ('l', 32, 20), ('l', 33, 24), ('l', 36, 5))   # 帆船（大・小）
CRATES = (('X', 29, 3), ('B', 29, 9), ('X', 29, 8), ('B', 29, 19), ('X', 29, 21), ('B', 29, 25))   # 岸壁の木箱・樽

NPCS = [
    ('town_man', 5, 11), ('town_middle_man', 26, 11), ('elder_man', 12, 14), ('child_boy', 15, 17),
    ('traveler_merchant', 26, 15), ('merchant_man', 22, 11), ('guard_spear', 17, 27), ('guard_light', 22, 27),
]

LEGEND_KEYS = ('S', 'I', 'J', 'd', 'N', 'D', 'M', 'Q', 'q', 'a', 'g', 'c', 'w', 'b')   # 渡し場の立て札 'z' は、legend['z'] = 'ferry_sign'
SOLID = set('WHSIJdNDYLlXB')


CANAL = (12, 13)               # 運河の行（x1〜港まで）
BRIDGES = ((8, 9), (19, 20), (25, 26))   # 橋の列（運河の上の木の橋）
DECOR = ((2, 1, 'T'), (15, 1, 'T'), (2, 28, 'T'), (15, 28, 'T'), (27, 28, 'T'), (16, 5, 'f'), (22, 5, 'v'), (16, 17, 'f'), (22, 17, 'v'))
HOUSES = ((7, 19), (12, 19), (12, 24), (24, 19), (24, 24))


def _water_and_roads(g, w, h):
    """外壁・南の門・運河と橋・遊歩道・大通り・港の水と桟橋"""
    for x in range(w): g[0][x] = g[h - 1][x] = 'W'
    for y in range(h): g[y][0] = g[y][w - 1] = 'W'
    g[h - 1][19] = g[h - 1][20] = 'G'
    for y in range(1, h - 1):
        for x in (19, 20): g[y][x] = '='   # 大通り（門から北まで。運河は橋で渡る）
    for ys in ((10, 11), (14, 15)):   # 運河の両岸の遊歩道（港の岸壁まで）
        for y in ys:
            for x in range(1, QUAY_X + 1): g[y][x] = '='
    x0, x1, y0, y1 = HARBOR
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1): g[y][x] = 'w'
    for y in CANAL:
        for x in range(1, x1 + 1): g[y][x] = 'w'
        for bx in [b for br in BRIDGES for b in br]: g[y][bx] = 'b'
    for y in PIER_ROWS:
        for x in range(x0, 38): g[y][x] = 'b'


def _buildings_and_decor(g, legend, city_legend, links, npcs):
    for hx, hy in HOUSES:
        for y in range(hy, hy + 3):
            for x in range(hx, hx + 4):
                assert g[y][x] == 'p', f'E の家 ({x},{y}): 空きマスではない'
                g[y][x] = 'H'
    for ch, fx, fy, wid, doff, door, sign, link in FACILITIES:
        for y in range(fy, fy + 3):
            for x in range(fx, fx + wid):
                assert g[y][x] == 'p', f'E の施設 ({x},{y}): 空きマスではない'
                g[y][x] = ch
        dx, dz = fx + doff, fy + 2
        g[dz][dx] = door
        assert g[dz + 1][dx] in 'p=' and g[dz + 1][dx + 1] in 'p=', f'E の立て札 ({dx + 1},{dz + 1}): 空きマスではない'
        g[dz + 1][dx + 1] = sign
        links[f'{dx},{dz}'] = dict(link) if 'spawn' in link else dict(link, back={'x': dx, 'z': dz + 1, 'angle': 3.14159})
    for ch, x, y in SHIPS:
        assert g[y][x] == 'w', f'E の船 ({x},{y}): 水ではない'
        g[y][x] = ch
    for ch, x, y in CRATES:
        assert g[y][x] == 'p', f'E の荷 ({x},{y}): 空きマスではない'
        g[y][x] = ch
    for x, y, c in DECOR:
        assert g[y][x] == 'p', f'E の飾り ({x},{y}): 空きマスではない'
        g[y][x] = c
    legend.update({'X': 'crate_out', 'B': 'barrel_out', 'L': 'ship_large', 'l': 'ship_small'})
    for k in LEGEND_KEYS: legend[k] = city_legend[k]
    legend['Y'] = 'mansion_door'; legend['x'] = 'chairman_sign'; legend['z'] = 'ferry_sign'   # 議長の館の扉・立て札
    for nid, x, z in NPCS:
        assert g[z][x] in 'p=', f'E の NPC {nid} ({x},{z}): 歩ける空きマスではない'
        npcs.append({'id': nid, 'x': x, 'z': z})


def _heights(g, w, h):
    """サンプル（city）の高さを土台に、水・橋（0）・岸（1）・神殿の高台を重ねる。段差は、歩ける隣どうしで 1 以下"""
    x0, x1, y0, y1 = HARBOR
    lv = TH.sample_field(w, h, 0, 0)
    fixed = set()
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1): lv[y][x] = 0; fixed.add((x, y))
    for y in range(y0, y1 + 1):
        if y not in CANAL: lv[y][QUAY_X] = 1; fixed.add((QUAY_X, y))   # 岸壁は、水のとなり（高さ 1）
    for y in CANAL:
        for x in range(1, x1 + 1): lv[y][x] = 0; fixed.add((x, y))
        for x in range(1, QUAY_X + 1):
            for by in (CANAL[0] - 1, CANAL[1] + 1): lv[by][x] = 1; fixed.add((x, by))   # 運河の岸
    for y in range(1, 6):
        for x in range(22, 28): lv[y][x] = 3 if lv[y][x] >= 2 else 2; fixed.add((x, y))   # 神殿の高台
    walk = [[g[y][x] not in SOLID and g[y][x] != 'w' for x in range(w)] for y in range(h)]
    TH.relax(lv, walk, fixed)
    for ch, fx, fy, wid, doff, door, sign, link in FACILITIES:   # 扉のマスの高さは、扉の前のマスと同じ
        lv[fy + 2][fx + doff] = lv[fy + 3][fx + doff]
    for y in range(h):
        for x in range(w):
            if g[y][x] in SOLID or g[y][x] == 'w': continue
            for dx, dz in ((1, 0), (0, 1)):
                xx, yy = x + dx, y + dz
                if xx < w and yy < h and g[yy][xx] not in SOLID and g[yy][xx] != 'w':
                    assert abs(lv[y][x] - lv[yy][xx]) <= 1, f'E の段差 ({x},{y})-({xx},{yy}) が 2 以上'
    return lv


def build(w, h, legend, city_legend, links, npcs):
    """E の街の中（layout・heights）を作り、legend・links・npcs に足す。(layout, heights) を返す"""
    assert (w, h) == (40, 30)
    g = [['p'] * w for _ in range(h)]
    _water_and_roads(g, w, h)
    _buildings_and_decor(g, legend, city_legend, links, npcs)
    lv = _heights(g, w, h)
    return [''.join(r) for r in g], [''.join(TH.CH36[v] for v in r) for r in lv]
