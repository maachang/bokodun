"""K（マカヒキ国）の殿様の城の中。全面が畳で、ふすま（仕切り）で区切られた、狭い部屋が並ぶ（二条城の大広間のような、金の松のふすま・障子の外壁・上段の間）。
  - 上段の間（北の中央）: 金のふすまに囲まれた広間。奥に、畳の壇（3 段）。殿様・家老・守衛
  - 中の 5 部屋・南の 5 部屋: 白いふすまで仕切る。部屋の間は、ふすまの途切れ（戸口）でつなぐ
  - 外の壁は障子。出口は、南の中央（玄関の間）
"""
W, H = 25, 15
FLOOR, DAIS_ROWS = '_', {1: 'a', 2: 'b', 3: 'c'}   # 壇: 北の 3 行（a=高さ 0.9・b=0.6・c=0.3）。x 9〜15


def _rows():
    g = [['_'] * W for _ in range(H)]
    for x in range(W): g[0][x] = 'H'; g[H - 1][x] = 'H'
    for y in range(H): g[y][0] = 'H'; g[y][W - 1] = 'H'
    for x in range(6, 19): g[0][x] = 'G'   # 上段の間の奥の壁: 金のふすま
    for y in range(1, 6): g[y][5] = 'G'; g[y][19] = 'G'   # 上段の間の左右
    for x in range(1, W - 1): g[6][x] = 'S'; g[10][x] = 'S'   # 部屋の列を分ける横の仕切り
    for x in range(5, 20): g[6][x] = 'G'
    for y in (7, 8, 9, 11, 12, 13):
        for x in (5, 10, 14, 19): g[y][x] = 'S'   # 中・南の 5 部屋の、縦の仕切り
    for x in (11, 12, 13): g[6][x] = '_'   # 上段の間の戸口（3 マス）
    for x in (2, 21): g[6][x] = '_'; g[10][x] = '_'   # 左右の部屋の通り抜け
    for x in (7, 12, 17): g[10][x] = '_'   # 中の列から南の列へ
    for y in (3,): g[y][5] = '_'; g[y][19] = '_'   # 上段の間から、左右の控えの間へ
    for y in (8, 12):   # 中・南の列の、部屋どうしの戸口
        for x in (5, 10, 14, 19): g[y][x] = '_'
    for y, c in DAIS_ROWS.items():
        for x in range(9, 16): g[y][x] = c
    g[H - 1][12] = '2'
    return [''.join(r) for r in g]


NPCS = [   # (id, x, y)
    ('daimyo_k', 12, 1), ('karo_k', 9, 2), ('daimyo_wife_k', 15, 2), ('sword_bearer_k', 13, 2),
    ('guard_k', 7, 3), ('guard_k', 17, 3), ('guard_k', 7, 5), ('guard_k', 17, 5),
    ('daimyo_retainer_k', 8, 8), ('daimyo_master_k', 16, 8), ('maid_k', 2, 8), ('daimyo_cook_k', 22, 12), ('maid_k', 2, 3),
]


def build(base):
    """base: 元の castle_k（環境・出口などを引き継ぐ）。畳・ふすま・障子の城に作り直す"""
    m = dict(base)
    m['layout'] = _rows()
    m['legend'] = {'_': 'tatami', 'S': 'fusuma_wall', 'G': 'fusuma_gold', 'H': 'shoji_wall', 'a': 'dais_tatami_3', 'b': 'dais_tatami_2', 'c': 'dais_tatami_1', '2': 'castle_exit'}
    m['npcs'] = [{'id': i, 'x': x, 'z': y} for i, x, y in NPCS]
    for i, x, y in NPCS: assert m['layout'][y][x] in '_abc', f'{i} ({x},{y}) が床ではない'
    m['environment'] = dict(base['environment'], ceilingTexture='woodWall', ambientLight=0xcfc0a0, directionalLight=0xfff0d0, fogColor=0x3a2a1c, skyColor=0x3a2a1c)   # 赤い明かり・レンガの天井をやめる（木の天井・暖かい明かり）
    m['spawn'] = {'x': 12, 'z': 12, 'angle': 0}
    return m
