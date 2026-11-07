"""E（ガリレオ連盟・南国の大きな港）の中身。手本は、サンプルの街（city）と D・H の作り。街の中は、この build が丸ごと作る。
  - 施設 6 つ: 道具屋・武器屋・宿屋・冒険者ギルド・商人ギルド（港の取引）・神殿（サンプル city の施設から、港に合うもの。変更はユーザーに確認）
  - 中のマップは、既存を共有する（shop・city_inn・temple・guild_*）。街の人は、既存の NPC を流用
  - 大きな港（ユーザー指定）: 街の東に、水の港（水路）と岸壁（石畳）。岸壁から、桟橋（木の橋）が水の中へ。水の上に、帆船（見た目だけ。船での移動は未実装）。岸壁に、木箱・樽
  - 高低: サンプル（city）の高さを土台にし（town_heights.sample_field）、神殿の高台（2〜3）と、港の水（0）・桟橋（0）を重ねる。段差は 1 以下
"""
import town_heights as TH

def _shop(shop_id, msg, icon): return {'nextMap': 'shop', 'params': {'shopId': shop_id}, 'message': msg, 'icon': icon}
def _to(next_map, msg, icon): return {'nextMap': next_map, 'message': msg, 'icon': icon}

# (建物の文字, 左上 x, y, 幅, 扉の x（建物の左から）, 扉の文字, 立て札の文字, 出入口 links)
FACILITIES = [
    ('S', 2, 3, 4, 1, 'd', 'q', _shop('item_shop', '道具屋に入る', 'itemShopIcon')),
    ('S', 7, 3, 4, 1, 'd', 'Q', _shop('weapon_shop', '武器屋に入る', 'weaponShopIcon')),
    ('I', 12, 3, 4, 1, 'N', 'M', _to('city_inn', '宿屋・酒場に入る', 'innIcon')),
    ('S', 23, 3, 4, 1, 'd', 'a', _to('guild_adv', '冒険者ギルドに入る', 'advGuildIcon')),
    ('S', 2, 10, 4, 1, 'd', 'g', _to('guild_merchant', '商人ギルドに入る', 'merchantGuildIcon')),
    ('J', 23, 10, 4, 1, 'D', 'c', _to('temple', '神殿に入る', 'templeIcon')),   # 神殿は高台
]

HARBOR = (30, 38, 2, 27)       # 港の水（x0, x1, y0, y1）
QUAY_X = 29                    # 岸壁の列
PIER_ROWS = (4, 10, 17, 23)    # 桟橋の行（x30〜37）
SHIPS = (('L', 34, 7), ('L', 34, 13), ('L', 34, 20), ('L', 35, 26), ('l', 32, 8), ('l', 31, 14), ('l', 32, 20), ('l', 33, 24), ('l', 36, 5))   # 帆船（大・小）
CRATES = (('X', 29, 3), ('B', 29, 9), ('X', 29, 11), ('B', 29, 19), ('X', 29, 21), ('B', 29, 25))   # 岸壁の木箱・樽

NPCS = [
    ('town_man', 5, 8), ('town_middle_man', 26, 8), ('elder_man', 12, 9), ('child_boy', 15, 17),
    ('traveler_merchant', 26, 15), ('merchant_man', 27, 12), ('guard_spear', 17, 27), ('guard_light', 22, 27),
]

LEGEND_KEYS = ('S', 'I', 'J', 'd', 'N', 'D', 'M', 'Q', 'q', 'a', 'g', 'c', 'w', 'b')
SOLID = set('WHSIJdNDLlXB')


def build(w, h, legend, city_legend, links, npcs):
    """E の街の中（layout・heights）を作り、legend・links・npcs に足す。(layout, heights) を返す"""
    assert (w, h) == (40, 30)
    g = [['p'] * w for _ in range(h)]
    # 大通り（南北）・東西の通り（幅 2。岸壁まで）・噴水
    for y in range(1, h - 1):
        for x in range(18, 22): g[y][x] = '='
    for ys in ((6, 7), (14, 15)):
        for y in ys:
            for x in range(1, QUAY_X + 1): g[y][x] = '='
    for x in (19, 20):
        for y in (10, 11): g[y][x] = 'F'
    # 港: 水（w）・桟橋（b）
    x0, x1, y0, y1 = HARBOR
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1): g[y][x] = 'w'
    for y in PIER_ROWS:
        for x in range(x0, 38): g[y][x] = 'b'
    # 外壁・南の門
    for x in range(w): g[0][x] = g[h - 1][x] = 'W'
    for y in range(h): g[y][0] = g[y][w - 1] = 'W'
    g[h - 1][19] = g[h - 1][20] = 'G'
    # 家（施設以外）
    for hx, hy in ((2, 18), (7, 18), (12, 18), (23, 18), (2, 24), (7, 24), (12, 24), (23, 24)):
        for y in range(hy, hy + 3):
            for x in range(hx, hx + 4): g[y][x] = 'H'
    # 施設
    for ch, fx, fy, wid, doff, door, sign, link in FACILITIES:
        for y in range(fy, fy + 3):
            for x in range(fx, fx + wid):
                assert g[y][x] == 'p', f'E の施設 ({x},{y}): 空きマスではない'
                g[y][x] = ch
        dx, dz = fx + doff, fy + 2
        g[dz][dx] = door
        assert g[dz + 1][dx + 1] in 'p=', f'E の立て札 ({dx + 1},{dz + 1}): 空きマスではない'
        g[dz + 1][dx + 1] = sign
        links[f'{dx},{dz}'] = dict(link, back={'x': dx, 'z': dz + 1, 'angle': 3.14159})
    # 船（水の上）・岸壁の木箱と樽・木・花壇
    for ch, x, y in SHIPS:
        assert g[y][x] == 'w', f'E の船 ({x},{y}): 水ではない'
        g[y][x] = ch
    for ch, x, y in CRATES:
        assert g[y][x] == 'p', f'E の荷 ({x},{y}): 空きマスではない'
        g[y][x] = ch
    for x, y, c in ((2, 1, 'T'), (15, 1, 'T'), (2, 28, 'T'), (15, 28, 'T'), (27, 28, 'T'), (22, 9, 'v'), (22, 12, 'f'), (16, 9, 'f'), (16, 12, 'v')):
        assert g[y][x] == 'p', f'E の飾り ({x},{y}): 空きマスではない'
        g[y][x] = c
    legend.update({'X': 'crate', 'B': 'barrel', 'L': 'ship_large', 'l': 'ship_small'})
    for k in LEGEND_KEYS: legend[k] = city_legend[k]
    for nid, x, z in NPCS:
        assert g[z][x] in 'p=', f'E の NPC {nid} ({x},{z}): 歩ける空きマスではない'
        npcs.append({'id': nid, 'x': x, 'z': z})
    # 高さ: サンプル（city）の高さを土台にして、港の水・桟橋（0）と神殿の高台を重ねる。段差は、歩ける隣どうしで 1 以下
    lv = TH.sample_field(w, h, 0, 0)
    fixed = set()
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1): lv[y][x] = 0; fixed.add((x, y))
    for y in range(y0, y1 + 1): lv[y][QUAY_X] = 1; fixed.add((QUAY_X, y))   # 岸壁は、水のとなり（高さ 1）
    for y in range(9, 14):
        for x in range(22, 27): lv[y][x] = 3 if lv[y][x] >= 2 else 2; fixed.add((x, y))   # 神殿の高台
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
    return [''.join(r) for r in g], [''.join(TH.CH36[v] for v in r) for r in lv]
