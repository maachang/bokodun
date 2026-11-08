"""F（ライアン獣王国・山の麓の、獣人とドワーフの街）の中身。D の型（東西の川と橋・南北の大通り）を使わず、**段々の斜面**の街にする。
  - 斜面を、3 段の平らな**テラス**（南の門の段・中の段・北の城の段。高さ 1・2・3 を土台に、サンプルの起伏を重ねる）に分け、段の間は、石の**擁壁**（通れない）。擁壁の 1 か所に、**坂の道**があり、南の段から西端の坂→中の段→東端の坂→北の段と、**つづら折り**に登る（川・橋はない）
  - 北の段の中央に、王城への門（castle_f）。通り・施設・家は、段ごとに並ぶ。見た目・施設・街の人は、これまでの F と同じ（木造の家・針葉樹。town_d.py の SKIN_FOOT ほか）
"""
import town_heights as TH
import town_d as TD

SOLID = set('WHSIJdNDYCK')
WALLS = ((9, 33), (18, 5))   # 擁壁の行 y と、坂の道の x（x, x+1）。北の擁壁（y9）の坂は東端、南の擁壁（y18）の坂は西端
_F = {f[6]: f for f in TD.FACILITIES_F}   # 立て札の文字 → 施設

def _fac(sign, x0, y0):
    f = _F[sign]
    return (f[0], x0, y0, f[3], f[4], f[5], f[6], f[7])

# 施設: 北の段（鍛冶屋・商人ギルド）・中の段（道具屋・武器屋・冒険者ギルド・職業訓練所）・南の段（宿屋）。扉の前は、段の通り
FACILITIES = [_fac('k', 24, 3), _fac('g', 29, 3), _fac('q', 7, 11), _fac('Q', 13, 11), _fac('a', 23, 11), _fac('r', 28, 11), _fac('M', 7, 22)]
HOUSES = ((3, 3), (8, 3), (13, 3), (3, 11), (18, 11), (35, 11), (2, 25), (13, 22), (28, 22), (33, 22), (7, 26), (13, 26), (28, 26), (33, 26))


def _roads_walls(g, w, h, links):
    """外壁・南の門・擁壁と坂の道・各段の通り・城門"""
    for x in range(w): g[0][x] = g[h - 1][x] = 'W'
    for y in range(h): g[y][0] = g[y][w - 1] = 'W'
    g[h - 1][19] = g[h - 1][20] = 'G'
    for wy, rx in WALLS:
        for x in range(1, w - 1): g[wy][x] = '='if rx <= x <= rx + 1 else 'W'
    for y in range(19, h - 1):   # 南の段: 門からの大通りと、坂までの通り
        for x in (19, 20): g[y][x] = '='
    for y in (19, 20):
        for x in range(5, 21): g[y][x] = '='
    for y in (16, 17):           # 中の段: 西の坂から、東の坂まで
        for x in range(5, 35): g[y][x] = '='
    for y in range(1, 9):        # 北の段: 城門からの大通り・東の坂までの通り
        for x in (19, 20): g[y][x] = '='
    for y in (7, 8):
        for x in range(19, 35): g[y][x] = '='
    for y in range(1, 9):        # 東の坂の上（北の段）の道
        for x in (33, 34): g[y][x] = '=' if y >= 7 else g[y][x]
    g[0][19] = g[0][20] = 'C'
    for x in (19, 20):
        links[f'{x},0'] = {'nextMap': 'castle_f', 'message': '王城に入る', 'back': {'x': x, 'z': 1, 'angle': 3.14159}}


def _buildings(g, links):
    for hx, hy in HOUSES:
        for y in range(hy, hy + 3):
            for x in range(hx, hx + 4):
                assert g[y][x] == 'p', f'F の家 ({hx},{hy}) の ({x},{y}): {g[y][x]}'
                g[y][x] = 'H'
    for ch, fx, fy, wid, doff, door, sign, link in FACILITIES:
        for y in range(fy, fy + 3):
            for x in range(fx, fx + wid):
                assert g[y][x] == 'p', f'F の施設 ({fx},{fy}) の ({x},{y}): {g[y][x]}'
                g[y][x] = ch
        dx, dz = fx + doff, fy + 2
        g[dz][dx] = door
        assert g[dz + 1][dx] in 'p=' and g[dz + 1][dx + 1] in 'p=', f'F の施設 ({fx},{fy}): 扉の前・立て札のマスが、歩けない'
        g[dz + 1][dx + 1] = sign
        links[f'{dx},{dz}'] = dict(link, back={'x': dx, 'z': dz + 1, 'angle': 3.14159})


def _decor_legend_npcs(g, w, h, legend, city_legend, npcs):
    for x, y, c in ((1, 1, 'T'), (38, 1, 'T'), (1, 10, 'T'), (38, 10, 'T'), (1, 28, 'T'), (38, 28, 'T'), (16, 5, 'f'), (26, 14, 'v'), (16, 14, 'f'), (23, 24, 'v'), (24, 28, 'f')):
        if g[y][x] == 'p': g[y][x] = c
    legend['C'] = 'castle_gate'
    for k in sorted(set(TD.LEGEND_KEYS) | {c for f in FACILITIES for c in (f[0], f[5], f[6])} | {'W', 'G', 'p', '=', 'H', 'T', 'f', 'v'}):
        if k in city_legend: legend[k] = city_legend[k]
    legend.update(TD.SKIN_FOOT)
    taken = set()
    for nid, x, z in TD.NPCS_F:   # 元の位置を目安に、いちばん近い、歩ける空きマスへ
        pos = next((x + dx, z + dz) for r in range(12) for dz in range(-r, r + 1) for dx in range(-r, r + 1)
                   if 1 <= x + dx < w - 1 and 1 <= z + dz < h - 1 and g[z + dz][x + dx] in 'p=' and (x + dx, z + dz) not in taken)
        taken.add(pos); npcs.append({'id': nid, 'x': pos[0], 'z': pos[1]})


def _terrace_base(y):
    return 1 if y >= 19 else 2 if y >= 10 else 3


def _heights(g, w, h):
    """段ごとの土台（1・2・3）に、サンプルの起伏（サンプルの高さ − 1）を重ね、坂の道（擁壁の行）は、段の間をなだらかにつなぐ"""
    sm = TH.sample_field(w, h, 0, 0)
    lv = [[_terrace_base(y) + (sm[y][x] - 1) for x in range(w)] for y in range(h)]
    for wy, rx in WALLS:
        for x in (rx, rx + 1): lv[wy][x] = (_terrace_base(wy + 1) + _terrace_base(wy - 1)) // 2
    TH.relax(lv, [[g[y][x] not in SOLID for x in range(w)] for y in range(h)], set())
    for ch, fx, fy, wid, doff, door, sign, link in FACILITIES: lv[fy + 2][fx + doff] = lv[fy + 3][fx + doff]
    for x in (19, 20):
        lv[0][x] = lv[1][x]; lv[h - 1][x] = lv[h - 2][x]
    for y in range(h):
        for x in range(w):
            if g[y][x] in SOLID: continue
            for dx, dz in ((1, 0), (0, 1)):
                xx, yy = x + dx, y + dz
                if xx < w and yy < h and g[yy][xx] not in SOLID:
                    assert abs(lv[y][x] - lv[yy][xx]) <= 1, f'F の段差 ({x},{y})-({xx},{yy}) が 2 以上'
    return lv


def build(w, h, legend, city_legend, links, npcs):
    """F の街の中（layout・heights）を作り、legend・links・npcs に足す。(layout, heights) を返す"""
    assert (w, h) == (40, 30)
    g = [['p'] * w for _ in range(h)]
    _roads_walls(g, w, h, links)
    _buildings(g, links)
    _decor_legend_npcs(g, w, h, legend, city_legend, npcs)
    lv = _heights(g, w, h)
    return [''.join(r) for r in g], [''.join(TH.CH36[v] for v in r) for r in lv]
