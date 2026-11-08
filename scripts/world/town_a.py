"""A（キュラビッド帝国・雪の連峰の山頂の城塞都市）の中身。D の型（東西の川と橋・南北の大通り・広場と噴水）を使わず、**城塞**の骨格にする。
  - 街の中心に、石の城塞（帝王の城への門つき）。城塞のまわりに、**環状の通り**（幅 2）。環状の通りは、北の通り・南の通りと、つながる
  - 北の通り（全幅）の北側に、神殿・道具屋・武器屋・冒険者ギルド・鍛冶屋・職業訓練所。南の通りの北側に、宿屋。家は、通りに挟まれた区画に、密に
  - 川・橋はない。起伏は、サンプル（city）の高さを土台にする
  - 見た目・施設・街の人は、これまでの A と同じ（雪をかぶった屋根・雪の積もった石畳と大通り・針葉樹。town_d.py の SKIN_SNOW ほか）
"""
import math
from types import SimpleNamespace
import town_heights as TH
import town_d as TD

SOLID = set('WHSIJdNDYCK')
FORT = (16, 23, 11, 16)   # 城塞（x0, x1, y0, y1）。門は、南の壁の真ん中（19, 20）
_F = {f[6]: f for f in TD.FACILITIES_A}   # 立て札の文字 → 施設（建物の文字・扉・links）

_A_ROOM = {'item_shop': 'shop_a', 'weapon_shop': 'shop_a', 'guild_adv': 'guild_adv_a', 'guild_training': 'guild_training_a', 'city_inn': 'city_inn_a'}   # 雪国は、暖炉つきの専用の中（店は shopId を保つ）


def _fac(sign, x0, y0, wid=None):
    f = _F[sign]
    link = dict(f[7])
    key = (link.get('params') or {}).get('shopId') or link['nextMap']
    if key in _A_ROOM: link['nextMap'] = _A_ROOM[key]
    return (f[0], x0, y0, wid or f[3], f[4], f[5], f[6], link)

# 施設: 北の通りの北側（扉の前は、北の通り）と、南の通りの北側（宿屋）
FACILITIES = [_fac('q', 3, 4), _fac('Q', 8, 4), _fac('c', 13, 4), _fac('a', 23, 4), _fac('k', 28, 4), _fac('r', 33, 4), _fac('M', 5, 19)]
HOUSES = ((4, 9), (8, 9), (4, 13), (8, 13), (4, 16), (28, 9), (32, 9), (28, 13), (32, 13), (28, 16), (32, 16),
          (3, 25), (8, 25), (13, 25), (23, 25), (28, 25), (33, 25))   # 通りに挟まれた区画の家（4×3）
NPCS = [('snow_man', 6, 8), ('snow_old_man', 30, 8), ('snow_woman', 12, 22), ('snow_woman', 24, 22), ('snow_old_woman', 3, 15), ('snow_boy', 15, 8), ('snow_girl', 26, 21),
        ('snow_gate_guard', 17, 27), ('snow_gate_guard', 22, 27), ('snow_gate_guard', 18, 17), ('snow_gate_guard', 21, 17)]   # 住民・門番は、sdServer の寒冷地の画像（330〜336）


def _road(g, x0, x1, y0, y1):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            if g[y][x] == 'p': g[y][x] = '='


def _walls_roads_fort(g, w, h, links):
    """外壁・南の門・北の通り・南の通り・環状の通り・南の大通り・西と東の縦の通り・城塞と、その門（帝王の城へ）"""
    for x in range(w): g[0][x] = g[h - 1][x] = 'W'
    for y in range(h): g[y][0] = g[y][w - 1] = 'W'
    g[h - 1][19] = g[h - 1][20] = 'G'
    _road(g, 1, w - 2, 7, 8); _road(g, 1, w - 2, 22, 23)
    for y in range(7, 21):   # 環状の通り（外の長方形 x12〜27・y7〜20 の、幅 2 の枠）
        for x in range(12, 28):
            if not (14 <= x <= 25 and 9 <= y <= 18) and g[y][x] == 'p': g[y][x] = '='
    _road(g, 19, 20, 21, h - 2)
    _road(g, 2, 3, 9, 21); _road(g, w - 4, w - 3, 9, 21)
    x0, x1, y0, y1 = FORT
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1): g[y][x] = 'W'
    for x in (19, 20):
        g[y1][x] = 'C'
        links[f'{x},{y1}'] = {'nextMap': 'castle_a', 'message': '王城に入る', 'back': {'x': x, 'z': y1 + 1, 'angle': 3.14159}}


def _buildings(g, links):
    for hx, hy in HOUSES:
        for y in range(hy, hy + 3):
            for x in range(hx, hx + 4):
                assert g[y][x] == 'p', f'A の家 ({hx},{hy}) の ({x},{y}): {g[y][x]}'
                g[y][x] = 'H'
    for ch, fx, fy, wid, doff, door, sign, link in FACILITIES:
        for y in range(fy, fy + 3):
            for x in range(fx, fx + wid):
                assert g[y][x] in 'p=', f'A の施設 ({fx},{fy}) の ({x},{y}): {g[y][x]}'
                g[y][x] = ch
        dx, dz = fx + doff, fy + 2
        g[dz][dx] = door
        assert g[dz + 1][dx] in 'p=' and g[dz + 1][dx + 1] in 'p=', f'A の施設 ({fx},{fy}): 扉の前・立て札のマスが、歩けない'
        g[dz + 1][dx + 1] = sign
        links[f'{dx},{dz}'] = dict(link, back={'x': dx, 'z': dz + 1, 'angle': 3.14159})


def _decor_legend_npcs(g, w, h, legend, city_legend, npcs):
    """針葉樹・凡例・街の人（指定の位置の、いちばん近い、歩ける空きマスへ）"""
    for x, y, c in ((1, 1, 'T'), (38, 1, 'T'), (1, 28, 'T'), (38, 28, 'T'), (10, 6, 'f'), (29, 6, 'v'), (16, 5, 'f'), (22, 28, 'f'), (14, 21, 'v'), (25, 21, 'f')):
        if g[y][x] == 'p': g[y][x] = c
    legend['C'] = 'castle_gate'
    for k in sorted(set(TD.LEGEND_KEYS) | {c for f in FACILITIES for c in (f[0], f[5], f[6])} | {'W', 'G', 'p', '=', 'H', 'T', 'f', 'v'}):
        if k in city_legend: legend[k] = city_legend[k]
    legend.update(TD.SKIN_SNOW)
    taken = set()
    for nid, x, z in NPCS:
        pos = next((x + dx, z + dz) for r in range(10) for dz in range(-r, r + 1) for dx in range(-r, r + 1)
                   if 1 <= x + dx < w - 1 and 1 <= z + dz < h - 1 and g[z + dz][x + dx] in 'p=' and (x + dx, z + dz) not in taken)
        taken.add(pos); npcs.append({'id': nid, 'x': pos[0], 'z': pos[1]})


def _heights(g, w, h):
    lv = TH.sample_field(w, h, 0, 0)
    TH.relax(lv, [[g[y][x] not in SOLID for x in range(w)] for y in range(h)], set())
    for ch, fx, fy, wid, doff, door, sign, link in FACILITIES: lv[fy + 2][fx + doff] = lv[fy + 3][fx + doff]
    for x in (19, 20): lv[FORT[3]][x] = lv[FORT[3] + 1][x]   # 城塞の門のマスの高さは、門の前のマスと同じ
    for y in range(h):
        for x in range(w):
            if g[y][x] in SOLID: continue
            for dx, dz in ((1, 0), (0, 1)):
                xx, yy = x + dx, y + dz
                if xx < w and yy < h and g[yy][xx] not in SOLID:
                    assert abs(lv[y][x] - lv[yy][xx]) <= 1, f'A の段差 ({x},{y})-({xx},{yy}) が 2 以上'
    return lv


def build(w, h, legend, city_legend, links, npcs):
    """A の街の中（layout・heights）を作り、legend・links・npcs に足す。(layout, heights) を返す"""
    assert (w, h) == (40, 30)
    g = [['p'] * w for _ in range(h)]
    _walls_roads_fort(g, w, h, links)
    _buildings(g, links)
    _decor_legend_npcs(g, w, h, legend, city_legend, npcs)
    lv = _heights(g, w, h)
    return [''.join(r) for r in g], [''.join(TH.CH36[v] for v in r) for r in lv]
