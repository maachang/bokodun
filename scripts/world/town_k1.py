"""K1（コマチ港町・マカヒキ島の東の海辺の港町）の中身。手本は、E（town_e.py。港・桟橋・岸壁・帆船・サンプル city の高さ）と、K（town_k.py。江戸風の見た目・町人の画像）。
  - 大きさ 36×26。外壁の南の真ん中に門（マカヒキ島の街から来る道）。東は海（港の水）。港の水は、壁の中（E と同じ作り）
  - 骨格: 南北の大通り（門から北まで）・東西の大通り（広場から岸壁まで）。岸壁（石畳）から、桟橋（木の橋）が水の中へ。水の上に、帆船（見た目だけ）。岸壁に、木箱・樽
  - 施設: 道具屋・武器屋（廻船問屋）・宿屋（旅籠）・渡し場（ガリレオ連盟 E の港へ渡し船）。中のマップは K 専用（shop_k・city_inn_k）
  - 住宅は、町家・土蔵・長屋・茶屋（town_k.diversify）。街の人は、K の画像（漁師は sdServer ID 370）。国の代表・貴族は、通りに出さない
  - 高低: サンプル（city）の高さを土台に、港の水（0）・岸壁（1）を重ねる。段差は 1 以下
"""
import town_heights as TH
from town_k import SKIN_EDO, diversify

W_, H_ = 36, 26


def _shop(shop_id, msg, icon): return {'nextMap': 'shop_k', 'params': {'shopId': shop_id}, 'message': msg, 'icon': icon}
def _to(next_map, msg, icon): return {'nextMap': next_map, 'message': msg, 'icon': icon}


# (建物の文字, 左上 x, y, 幅, 扉の x（建物の左から）, 扉の文字, 立て札の文字, 出入口 links)
FACILITIES = [
    ('S', 2, 7, 4, 1, 'd', 'q', _shop('item_shop', '道具屋に入る', 'itemShopIcon')),
    ('I', 7, 7, 4, 1, 'N', 'M', _to('city_inn_k', '旅籠・酒場に入る', 'innIcon')),
    ('S', 20, 7, 4, 1, 'd', 'Q', _shop('weapon_shop', '武器屋に入る', 'weaponShopIcon')),
    ('S', 21, 15, 4, 1, 'd', 'z', _shop('ferry_k1', '渡し場に入る（ガリレオ連盟の港行きの船）', 'ferryIcon')),   # 渡し場（E の港の渡し場の前（27,8）へ。渡し場は店と同じ売り場。shops.json の ferry_k1）
]
HOUSES = ((2, 2), (7, 2), (12, 2), (22, 2), (2, 15), (7, 15), (12, 15), (2, 20), (7, 20), (12, 20), (21, 20))   # 住宅（幅 4・高さ 3。町家・土蔵・長屋・茶屋に変える）

HARBOR = (27, 34, 2, 23)     # 港の水（x0, x1, y0, y1）
QUAY_X = 26                  # 岸壁の列
PIER_ROWS = (5, 11, 17)      # 桟橋の行（x27〜33）
SHIPS = (('L', 31, 8), ('L', 31, 14), ('L', 30, 20), ('l', 29, 3), ('l', 33, 21), ('l', 29, 13), ('l', 33, 9))   # 帆船（大・小）
CRATES = (('R', 26, 3), ('B', 26, 4), ('R', 26, 9), ('B', 26, 14), ('R', 26, 21), ('B', 26, 22))   # 岸壁の木箱・樽
DECOR = ((16, 22, 'e'), (19, 22, 'e'), (16, 9, 'h'), (19, 9, 'h'), (15, 10, 't'), (24, 5, 'e'), (24, 18, 'e'), (1, 10, 'h'))   # 石灯籠・提灯の柱・天水桶

NPCS = [   # 一般の住民（町人）・漁師・船頭・侍。殿様・家老は、街の通りに出ない
    ('fisherman_k', 25, 6), ('fisherman_k', 25, 13), ('fisherman_k', 24, 19), ('ferryman_k', 20, 18),
    ('merchant_man_k', 14, 14), ('merchant_woman_k', 10, 10), ('machi_woman_k', 5, 13), ('machi_man_k', 9, 18), ('child_boy_k', 5, 18),
    ('child_girl_k', 16, 16), ('okappiki_k', 24, 13), ('ronin_k', 5, 24), ('merchant_old_k', 19, 16),
    ('samurai_k', 15, 23), ('samurai_k', 20, 23),
]
SOLID = set('WHSIUYXdNLlRBeht')


def _skeleton(g, w, h):
    """外壁・南の門・大通り・港の水と桟橋"""
    for x in range(w): g[0][x] = g[h - 1][x] = 'W'
    for y in range(h): g[y][0] = g[y][w - 1] = 'W'
    g[h - 1][w // 2 - 1] = g[h - 1][w // 2] = 'G'
    for y in range(1, h - 1):
        for x in (w // 2 - 1, w // 2): g[y][x] = '='   # 南北の大通り（門から北まで）
    for y in (11, 12):
        for x in range(1, QUAY_X): g[y][x] = '='       # 東西の大通り（岸壁まで）
    for y in range(1, h - 1): g[y][QUAY_X] = 'P'       # 岸壁（石畳）
    x0, x1, y0, y1 = HARBOR
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1): g[y][x] = 'w'
    for y in PIER_ROWS:
        for x in range(x0, 34): g[y][x] = 'b'


def _place(g, legend, city_legend, links, npcs):
    for hx, hy in HOUSES:
        for y in range(hy, hy + 3):
            for x in range(hx, hx + 4):
                assert g[y][x] == 'p', f'K1 の家 ({x},{y}): 空きマスではない'
                g[y][x] = 'H'
    for ch, fx, fy, wid, doff, door, sign, link in FACILITIES:
        for y in range(fy, fy + 3):
            for x in range(fx, fx + wid):
                assert g[y][x] == 'p', f'K1 の施設 ({x},{y}): 空きマスではない'
                g[y][x] = ch
        dx, dz = fx + doff, fy + 2
        g[dz][dx] = door
        assert g[dz + 1][dx] in 'p=' and g[dz + 1][dx + 1] in 'p=', f'K1 の立て札 ({dx + 1},{dz + 1}): 空きマスではない'
        g[dz + 1][dx + 1] = sign
        links[f'{dx},{dz}'] = dict(link) if 'spawn' in link else dict(link, back={'x': dx, 'z': dz + 1, 'angle': 3.14159})
    diversify(g)   # 住宅（H）→ 土蔵・長屋・茶屋
    for ch, x, y in SHIPS:
        assert g[y][x] == 'w', f'K1 の船 ({x},{y}): 水ではない'
        g[y][x] = ch
    for ch, x, y in CRATES:
        assert g[y][x] == 'P', f'K1 の荷 ({x},{y}): 岸壁ではない'
        g[y][x] = ch
    for x, y, c in DECOR:
        assert g[y][x] in 'p=', f'K1 の飾り ({x},{y}): 空きマスではない'
        g[y][x] = c
    for k in ('S', 'I', 'd', 'N', 'M', 'Q', 'q', 'w', 'b'): legend[k] = city_legend[k]
    legend.update(SKIN_EDO)
    legend.update({'U': 'edo_kura', 'Y': 'edo_nagaya', 'X': 'edo_chaya', 'e': 'edo_lantern', 'h': 'edo_chochin', 't': 'edo_tensui', 'R': 'crate_out', 'B': 'barrel_out', 'L': 'ship_large', 'l': 'ship_small', 'z': 'ferry_sign'})
    for nid, x, z in NPCS:
        assert g[z][x] in 'p=', f'K1 の NPC {nid} ({x},{z}): 歩ける空きマスではない'
        npcs.append({'id': nid, 'x': x, 'z': z})


def _heights(g, w, h):
    """サンプル（city）の高さを土台に、港の水・桟橋（0）と岸壁（1）を重ねる。段差は、歩ける隣どうしで 1 以下"""
    x0, x1, y0, y1 = HARBOR
    lv = TH.sample_field(w, h, 0, 0)
    fixed = set()
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1): lv[y][x] = 0; fixed.add((x, y))
    for y in range(1, h - 1): lv[y][QUAY_X] = 1; fixed.add((QUAY_X, y))   # 岸壁は、水のとなり（高さ 1）
    for ch, fx, fy, wid, doff, door, sign, link in FACILITIES:   # 扉の前の高さをそろえるために固定
        fixed.add((fx + doff, fy + 3))
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
                    assert abs(lv[y][x] - lv[yy][xx]) <= 1, f'K1 の段差 ({x},{y})-({xx},{yy}) が 2 以上'
    return lv


def build(w, h, legend, city_legend, links, npcs):
    """K1 の街の中（layout・heights）を作り、legend・links・npcs に足す。(layout, heights) を返す"""
    assert (w, h) == (W_, H_)
    g = [['p'] * w for _ in range(h)]
    _skeleton(g, w, h)
    _place(g, legend, city_legend, links, npcs)
    lv = _heights(g, w, h)
    return [''.join(r) for r in g], [''.join(TH.CH36[v] for v in r) for r in lv]
