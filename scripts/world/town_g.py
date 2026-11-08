"""G（デイラミ精霊国・大森林の中心のエルフの街）の中身。D の型（東西の川と橋・南北の大通り・広場と噴水・家の並び）を使わず、森を活かした、街の骨格にする。
  - 世界樹（街の中心。柵の「ロ」で囲う）を、輪の道が囲む。輪から、北（城門）・南（門）・西・東・南西・南東へ、小道が伸びる。小道は、くねくね曲がる
  - 建物は、四角い区画に並べず、小道・輪の道に面して、ばらばらの高さ（行）に置く。家は、小道から離れた、森の中のあちこち
  - 川・橋はない。起伏は、サンプル（city）の高さを土台にし、北の城の高台（2〜3）だけを重ねる
  - 施設・街の人・見た目は、これまでの G と同じ（town_d.py の FACILITIES_G ほかの定義を使う）
"""
import math
import random
from types import SimpleNamespace
import town_heights as TH
import town_d as TD

CX, CY = 19, 14   # 世界樹（街の中心）
SOLID = set('WHSIJdNDYCVKUjL')

# 施設（建物の文字, 左上 x, y, 幅, 扉の x, 扉の文字, 立て札の文字, links）: 扉は南向き。扉の前（扉の 1 つ下の行）は、小道
FACILITIES = [
    ('S', 4, 10, 4, 1, 'd', 'q', TD._remap(TD.FACILITIES[0], shopId='item_shop_g')[7]),
    ('S', 9, 10, 4, 1, 'd', 'Q', TD._remap(TD.FACILITIES[1], shopId='weapon_shop_g')[7]),
    ('S', 28, 10, 4, 1, 'd', 'a', TD._remap(TD.FACILITIES[2], nextMap='guild_adv_g')[7]),
    ('S', 33, 10, 4, 1, 'd', 'm', TD._remap([f for f in TD.FACILITIES if f[6] == 'm'][0], nextMap='guild_mage_g')[7]),
    ('I', 5, 21, 4, 1, 'N', 'M', TD._remap([f for f in TD.FACILITIES if f[6] == 'M'][0], nextMap='city_inn_g')[7]),
    ('S', 22, 6, 3, 1, 'd', 'x', {'nextMap': 'elder_house_g', 'message': '長老の家に入る'}),   # 世界樹のそばの、小さな長老の家
]
HOUSES = ((2, 2), (7, 3), (12, 2), (26, 3), (32, 2), (34, 5), (2, 17), (7, 16), (33, 17), (35, 25), (30, 26), (23, 25), (13, 24), (2, 26))   # 森の中の家（4×3）
NPCS = [
    ('elf_woman_a', 6, 14), ('elf_man_a', 11, 15), ('elf_woman_b', 30, 14), ('elf_man_b', 24, 7), ('elf_woman_c', 12, 22), ('elf_girl', 16, 19),
    ('elf_boy', 25, 18), ('elf_man_c', 34, 15), ('elf_guard_man', 17, 27), ('elf_guard_woman', 22, 27),
    ('elf_soldier_golem', 17, 1), ('elf_soldier_golem', 22, 1),
    ('fairy_wisp', 8, 15), ('fairy_sylph', 30, 18), ('fairy_undine', 33, 15), ('fairy_salamander', 12, 20), ('fairy_gnome', 26, 6), ('fairy_unicorn', 6, 22), ('fairy_pegasus', 20, 22),
]


def _road(g, cells):
    for x, y in cells:
        if g[y][x] == 'p': g[y][x] = '='


def _wavy_vertical(g, y_from, y_to, amp, freq):
    """南北の小道（幅 2）: くねくね曲がる。両端（y_from）では、真ん中（x=19・20）に合わせる"""
    step = 1 if y_to > y_from else -1
    n = abs(y_to - y_from)
    for k, y in enumerate(range(y_from, y_to + step, step)):
        t = min(k, 4) / 4 if k < 4 else 1   # 端から 4 マスは、まっすぐに寄せる
        xc = 19 + amp * math.sin(k * freq) * t
        x0 = int(round(xc))
        _road(g, [(x0, y), (x0 + 1, y)])
        # 隣の行との切れ目をなくす（斜めに曲がるとき、つながるように、前の行の端まで足す）
    return g


def _walls_and_roads(g, w, h, links):
    """外壁（茂みの壁）・南の門・北の城門・小道・輪の道・世界樹と柵"""
    for x in range(w): g[0][x] = g[h - 1][x] = 'W'
    for y in range(h): g[y][0] = g[y][w - 1] = 'W'
    g[h - 1][19] = g[h - 1][20] = 'G'
    g[0][19] = g[0][20] = 'C'
    for x in (18, 21): g[0][x] = g[h - 1][x] = 'V'   # 門の両脇だけ、木の壁のブロック（扉の向きが決まる）
    for x in (19, 20):
        links[f'{x},0'] = {'nextMap': 'castle_g', 'message': '王城に入る', 'back': {'x': x, 'z': 1, 'angle': 3.14159}}
    for y in range(1, h - 1):   # 輪の道（世界樹のまわり。幅 2）
        for x in range(1, w - 1):
            if 5.0 <= math.hypot(x - CX, y - CY) <= 6.9: g[y][x] = '='
    # 小道: 南（門）・北（城門）は、くねくね。西・東は、輪から、まっすぐ。南西・南東へ、斜めの小道（階段状。幅 2）
    _wavy_vertical(g, h - 2, 19, 2.6, 0.7)
    _wavy_vertical(g, 1, 8, 2.2, 0.8)
    for x in list(range(1, 14)) + list(range(26, w - 1)): _road(g, [(x, 13), (x, 14)])
    for k in range(0, 9):
        _road(g, [(13 - k, 19 + k // 2 + (k > 4)), (14 - k, 19 + k // 2 + (k > 4)), (13 - k, 20 + k // 2 + (k > 4))])
        _road(g, [(26 + k, 19 + k // 2), (25 + k, 19 + k // 2), (26 + k, 20 + k // 2)])
    for x in range(2, 13): _road(g, [(x, 24), (x, 25)])
    for x in range(27, 37): _road(g, [(x, 23), (x, 24)])
    g[CY][CX] = 'Y'   # 世界樹と柵（「ロ」の形）
    for y in range(CY - 1, CY + 2):
        for x in range(CX - 1, CX + 2):
            if (x, y) != (CX, CY): g[y][x] = 'j'


def _buildings(g, links):
    """家（森の中のあちこち）と施設（扉は南向き。扉の前の行・立て札のマスは、歩ける）"""
    for x0, y0 in HOUSES:
        for y in range(y0, y0 + 3):
            for x in range(x0, x0 + 4):
                assert g[y][x] in 'p', f'G の家 ({x0},{y0}) の ({x},{y}) が、空きマスではない: {g[y][x]}'
                g[y][x] = 'H'
    for ch, x0, y0, wid, doff, door, sign, link in FACILITIES:
        for y in range(y0, y0 + 3):
            for x in range(x0, x0 + wid):
                assert g[y][x] in 'p=', f'G の施設 ({x0},{y0}) の ({x},{y}): {g[y][x]}'
                g[y][x] = ch
        dx, dz = x0 + doff, y0 + 2
        g[dz][dx] = door
        assert g[dz + 1][dx] in 'p=' and g[dz + 1][dx + 1] in 'p=', f'G の施設 ({x0},{y0}): 扉の前・立て札のマスが、歩けない'
        g[dz + 1][dx + 1] = sign
        links[f'{dx},{dz}'] = dict(link, back={'x': dx, 'z': dz + 1, 'angle': 3.14159})


def _legend(legend, city_legend):
    legend['C'] = 'castle_gate'; legend['V'] = 'wooden_wall'; legend['Y'] = 'world_tree'; legend['j'] = 'wooden_fence'
    for k in sorted(set(TD.LEGEND_KEYS) | {c for f in FACILITIES for c in (f[0], f[5], f[6])} | {'W', 'G', 'p', '=', 'H', 'T', 'f', 'v'}):
        if k in city_legend: legend[k] = city_legend[k]
    legend.update(TD.SKIN_FOREST)


def _npcs(g, w, h, npcs):
    """街の人: 指定の位置の、いちばん近い、歩ける空きマスへ。置いた一覧（x, z）を返す"""
    taken, out = set(), []
    def free_near(x, z):
        for r in range(0, 8):
            for dz in range(-r, r + 1):
                for dx in range(-r, r + 1):
                    xx, zz = x + dx, z + dz
                    if 1 <= xx < w - 1 and 1 <= zz < h - 1 and g[zz][xx] in 'p=' and (xx, zz) not in taken: return xx, zz
        raise AssertionError(f'G の街の人 ({x},{z}) の近くに、空きマスがない')
    for nid, x, z in NPCS:
        xx, zz = free_near(x, z); taken.add((xx, zz)); out.append((nid, xx, zz)); npcs.append({'id': nid, 'x': xx, 'z': zz})
    return out


def _plants(g, w, h, npc_list):
    """街のすみの巨木（4 本）と、草・シダ・木のばらまき（扉の前・街の人・世界樹のまわりは避ける。木を先に: 木は、まわりが空いた所にだけ置く）"""
    for x, y in ((1, 1), (38, 1), (1, 28), (38, 28)):
        if g[y][x] == 'p': g[y][x] = 'T'
    st = SimpleNamespace(facilities=FACILITIES, g=g, h=h, npc_list=npc_list, w=w,
                         scatter=(('v', 22, 'tree'), ('f', 14, 'tree'), ('z', 70, 'plant'), ('y', 50, 'plant')))
    around = [(x, y) for y in range(CY - 7, CY + 8) for x in range(CX - 7, CX + 8) if g[y][x] == 'p']
    for x, y in around: g[y][x] = '#'   # 世界樹のまわり（輪の道の内側）は、ばらまかない（一時的に別の文字にして避ける）
    TD._build_scatterPlants(st)
    for x, y in around: g[y][x] = 'p'


def _heights(g, w, h):
    """サンプル（city）の高さを土台に、北の城の高台（2〜3）だけを重ねる。扉・城門のマスの高さは、前のマスと同じ。段差は 1 以下"""
    lv = TH.sample_field(w, h, 0, 0)
    fixed = set()
    for y in range(1, 8):
        for x in range(9, 31):
            lv[y][x] = 3 if lv[y][x] >= 2 else 2; fixed.add((x, y))
    TH.relax(lv, [[g[y][x] not in SOLID for x in range(w)] for y in range(h)], fixed)
    for ch, x0, y0, wid, doff, door, sign, link in FACILITIES: lv[y0 + 2][x0 + doff] = lv[y0 + 3][x0 + doff]
    for x in (19, 20): lv[0][x] = lv[1][x]
    for y in range(h):
        for x in range(w):
            if g[y][x] in SOLID: continue
            for dx, dz in ((1, 0), (0, 1)):
                xx, yy = x + dx, y + dz
                if xx < w and yy < h and g[yy][xx] not in SOLID:
                    assert abs(lv[y][x] - lv[yy][xx]) <= 1, f'G の段差 ({x},{y})-({xx},{yy}) が 2 以上'
    return lv


def build(w, h, legend, city_legend, links, npcs):
    """G の街の中（layout・heights）を作り、legend・links・npcs に足す。(layout, heights) を返す"""
    assert (w, h) == (40, 30)
    g = [['p'] * w for _ in range(h)]
    _walls_and_roads(g, w, h, links)
    _buildings(g, links)
    _legend(legend, city_legend)
    npc_list = _npcs(g, w, h, npcs)
    _plants(g, w, h, npc_list)
    lv = _heights(g, w, h)
    return [''.join(r) for r in g], [''.join(TH.CH36[v] for v in r) for r in lv]
