"""K（マカヒキ国）の殿様の城の中。江戸時代の城の御殿（江戸城の本丸御殿・二条城の二の丸御殿）を手本に、棟が、渡り廊下と中庭でつながる。
  - 表（南）: 玄関 → 式台 → 大広間（北に上段。殿様。上段の背後は、金のふすまの壁で、戸口なし）。式台の左右に、遠侍（控室）と台所
  - 渡り廊下（木張り）: 大広間の左右を北へ通り、北の縁側（廊下）で、ぐるりとつながる。中庭に面する側は、開いている
  - 中庭: 大広間の北。空が見える白砂の庭（松・池・石灯籠）。南は大広間の壁、北は縁側
  - 奥（北の棟）: 黒書院・白書院（縁側から入る）。東西の端に、大奥（御台所の居所）と、家老の間
  - 床は、部屋が畳、廊下が木張り、中庭が白砂。格式の高い部屋（大広間・黒書院・白書院）の壁は、金の松のふすま。ほかは白いふすま。外の壁は障子
  作り方: 全体を壁で埋め、区画（部屋・廊下・庭）をくり抜き、区画の間の壁を、ふすまに。戸口（ふすまの途切れ）でつなぐ
"""
W, H = 41, 29
# 区画: 名前 → (種類, x0, y0, x1, y1)（両端を含む）。種類: r=部屋（畳）・c=廊下（木張り）・y=中庭（白砂。天井なし）
AREAS = {
    'genkan': ('r', 17, 24, 23, 27), 'toozamurai': ('r', 4, 20, 15, 27), 'shidai': ('r', 17, 20, 23, 22), 'daidokoro': ('r', 25, 20, 36, 27),
    'ohiroma': ('r', 9, 11, 31, 18), 'corr_w': ('c', 6, 5, 7, 18), 'corr_e': ('c', 33, 5, 34, 18), 'engawa': ('c', 8, 5, 32, 5), 'yard': ('y', 8, 6, 32, 9),
    'hikae_l': ('r', 1, 11, 4, 17), 'hikae_r': ('r', 36, 11, 39, 17), 'karo_room': ('r', 1, 1, 4, 9), 'oku': ('r', 36, 1, 39, 9),
    'kuro': ('r', 9, 1, 19, 3), 'shiro': ('r', 21, 1, 31, 3),
}
GOLD = ('ohiroma', 'kuro', 'shiro')
DOORS = [(20, 23), (16, 26), (16, 21), (24, 21), (20, 19), (8, 16), (32, 16), (5, 14), (35, 14), (5, 7), (35, 7), (14, 4), (26, 4), (20, 2), (6, 19), (34, 19)]   # 戸口（ふすまの途切れ）。大広間の背後（北の壁）には、戸口を付けない
DAIS = {11: 'a', 12: 'b', 13: 'c'}   # 大広間の上段（北の 3 行・x 15〜25）: a=高さ 0.9・b=0.6・c=0.3
GARDEN = {'T': ((11, 7), (29, 8), (21, 6)), 'w': tuple((x, y) for x in range(23, 28) for y in (7, 8)), 'e': ((14, 9), (28, 9), (10, 6))}   # 中庭: 松・池・石灯籠
NPCS = [   # (id, x, y)
    ('daimyo_k', 20, 11), ('karo_k', 16, 12), ('sword_bearer_k', 22, 11),
    ('guard_k', 11, 15), ('guard_k', 29, 15), ('guard_k', 12, 17), ('guard_k', 28, 17), ('guard_k', 18, 21), ('guard_k', 22, 21), ('guard_k', 8, 23), ('guard_k', 12, 25),
    ('daimyo_retainer_k', 14, 2), ('daimyo_master_k', 26, 2), ('daimyo_wife_k', 37, 4), ('maid_k', 38, 7), ('maid_k', 2, 5),
    ('maid_k', 30, 26), ('daimyo_cook_k', 32, 24), ('cook_k', 28, 22),
]


def _rows():
    owner = [[None] * W for _ in range(H)]
    for n, (k, x0, y0, x1, y1) in AREAS.items():
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                assert owner[y][x] is None, f'{n}: 区画が重なる ({x},{y})'
                owner[y][x] = n
    ch = {'r': '_', 'c': '=', 'y': 'y'}
    g = [['H'] * W for _ in range(H)]
    for y in range(H):
        for x in range(W):
            if owner[y][x]: g[y][x] = ch[AREAS[owner[y][x]][0]]
    for y in range(1, H - 1):   # 区画と区画の間の壁を、ふすまに（両側が床）。金の間に面した壁は、金のふすま
        for x in range(1, W - 1):
            if owner[y][x]: continue
            for a, b in (((x - 1, y), (x + 1, y)), ((x, y - 1), (x, y + 1))):
                o1, o2 = owner[a[1]][a[0]], owner[b[1]][b[0]]
                if o1 and o2: g[y][x] = 'G' if (o1 in GOLD or o2 in GOLD) else 'S'
    for x, y in DOORS:
        assert g[y][x] in 'SG', f'戸口 ({x},{y}) が、ふすまではない'
        g[y][x] = '_'
    for y, c in DAIS.items():
        for x in range(15, 26): g[y][x] = c
    for c, ps in GARDEN.items():
        for x, y in ps:
            assert g[y][x] == 'y', f'中庭の飾り {c} ({x},{y}): 中庭ではない'
            g[y][x] = c
    g[H - 1][20] = '2'
    return [''.join(r) for r in g]


def build(base):
    """base: 元の castle_k（出口などを引き継ぐ）。畳・ふすま・障子・渡り廊下・中庭の城に作り直す"""
    m = dict(base)
    m['layout'] = _rows()
    m['legend'] = {'_': 'tatami', '=': 'wood_floor', 'y': 'garden_sand', 'S': 'fusuma_wall', 'G': 'fusuma_gold', 'H': 'shoji_wall', 'a': 'dais_tatami_3', 'b': 'dais_tatami_2', 'c': 'dais_tatami_1', '2': 'castle_exit',
                   'T': 'tree', 'w': 'water', 'e': 'edo_lantern'}
    m['decorFloor'] = 'whiteSand'   # 飾り（松・石灯籠）の下の地面
    m['environment'] = dict(base['environment'], hasCeiling=False, floorType='whiteSand', ambientLight=0xdcd0b4, directionalLight=0xfff4dc, fogColor=0xcfdceb, skyColor=0x8fb8e0, fogNear=22, fogFar=70)   # 全面の天井はやめる（中庭は空が見える。部屋と廊下は、床ごとに天井）
    m['npcs'] = [{'id': i, 'x': x, 'z': y} for i, x, y in NPCS]
    for i, x, y in NPCS: assert m['layout'][y][x] in '_=abc', f'{i} ({x},{y}) が床ではない'
    m['spawn'] = {'x': 20, 'z': 26, 'angle': 0}
    return m
