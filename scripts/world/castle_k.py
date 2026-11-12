"""K（マカヒキ国）の殿様の城の中。江戸時代の城の御殿（江戸城の本丸御殿・二条城の二の丸御殿）を手本に、棟が、渡り廊下と中庭でつながる。
  - 表（南）: 玄関 → 式台 → 大広間（北に上段。殿様。上段の背後は、金の壁画の壁（床の間・違い棚）で、戸口なし）。式台の左右に、遠侍（控室）と台所
  - 渡り廊下（木張り）: 大広間の左右を北へ通り、北の縁側（廊下）で、ぐるりとつながる。中庭に面する側は、開いている
  - 中庭: 大広間の北。空が見える白砂の庭（松・池・石灯籠）。南は大広間の壁、北は縁側
  - 奥（北の棟）: 黒書院・白書院（縁側から入る）。東西の端に、大奥（御台所の居所）と、家老の間
  - 床は、部屋が畳、廊下が木張り、中庭が白砂。格式の高い部屋（大広間・黒書院・白書院）の壁は、金の松のふすま。ほかは白いふすま。外の壁は障子
  作り方: 全体を壁で埋め、区画（部屋・廊下・庭）をくり抜き、区画の間の壁を、ふすまに。戸口（ふすまの途切れ）でつなぐ
"""
W, H = 28, 25
# 区画: 名前 → (種類, x0, y0, x1, y1)（両端を含む）。種類: r=部屋（畳）・c=廊下（木張り）・y=中庭（白砂。天井なし）
# 広さの目安: 畳の絵は 1 マスに 2 枚。大広間は 10×6 マス（約 120 畳。二条城の大広間の一の間・二の間が、合わせて 90 畳ほど）。ほかの部屋は、数十畳
AREAS = {
    'genkan': ('r', 11, 21, 16, 23), 'toozamurai': ('r', 2, 18, 9, 23), 'shidai': ('r', 11, 18, 16, 19), 'daidokoro': ('r', 18, 18, 25, 23),
    'ohiroma': ('r', 9, 11, 18, 16), 'corr_w': ('c', 6, 5, 7, 16), 'corr_e': ('c', 20, 5, 21, 16), 'engawa': ('c', 8, 5, 19, 5), 'yard': ('y', 8, 6, 19, 9),
    'hikae_l': ('r', 1, 11, 4, 16), 'hikae_r': ('r', 23, 11, 26, 16), 'karo_room': ('r', 1, 1, 4, 9), 'oku': ('r', 23, 1, 26, 9),
    'kuro': ('r', 9, 1, 13, 3), 'shiro': ('r', 15, 1, 19, 3),
}
GOLD = ('ohiroma', 'kuro', 'shiro')
DOORS = [(13, 20), (10, 22), (10, 19), (17, 19), (13, 17), (6, 17), (20, 17), (8, 15), (19, 15), (5, 13), (22, 13), (5, 7), (22, 7), (11, 4), (17, 4), (14, 2)]   # 戸口（ふすまの途切れ）。大広間の背後（北の壁）には、戸口を付けない
DAIS = {11: 'a', 12: 'b', 13: 'c'}   # 大広間の上段（北の 3 行・x 10〜17）: a=高さ 0.9・b=0.6・c=0.3
GARDEN = {'T': ((10, 7), (18, 8)), 'U': ((9, 9), (19, 6)), 'w': tuple((x, y) for x in range(13, 17) for y in (7, 8)), 'e': ((11, 9), (17, 9))}   # 中庭: 松・梅・池・石灯籠
NPCS = [   # (id, x, y)
    ('daimyo_k', 13, 11), ('karo_k', 10, 12), ('sword_bearer_k', 15, 11),
    ('guard_k', 10, 15), ('guard_k', 17, 15), ('guard_k', 12, 18), ('guard_k', 15, 18), ('guard_k', 4, 20), ('guard_k', 8, 22),
    ('daimyo_retainer_k', 11, 2), ('daimyo_master_k', 17, 2), ('daimyo_wife_k', 24, 4), ('maid_k', 25, 7), ('maid_k', 2, 5),
    ('maid_k', 19, 22), ('daimyo_cook_k', 23, 22), ('cook_k', 21, 20),
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
        for x in range(10, 18): g[y][x] = c
    for c, ps in GARDEN.items():
        for x, y in ps:
            assert g[y][x] == 'y', f'中庭の飾り {c} ({x},{y}): 中庭ではない'
            g[y][x] = c
    for x in range(9, 19):   # 上段の間の背後（大広間の北の壁）: ふすまではなく、金の壁画の壁。殿様（x13）の背後に床の間、その脇に違い棚（書院造り）
        assert g[10][x] == 'G'
        g[10][x] = 'N' if x == 13 else 'D' if x == 14 else 'P'
    for y in range(5, 10):   # 中庭を囲む板の間（北の縁側・東西の廊下の中庭側）は、白砂より 0.3 高くする（段差で、砂地と板の通路を見分ける）
        for x in range(W):
            if g[y][x] == '=': g[y][x] = 'F'
    g[H - 1][13] = '2'
    return [''.join(r) for r in g]


def build(base):
    """base: 元の castle_k（出口などを引き継ぐ）。畳・ふすま・障子・渡り廊下・中庭の城に作り直す"""
    m = dict(base)
    m['layout'] = _rows()
    m['legend'] = {'_': 'tatami', '=': 'wood_floor', 'y': 'garden_sand', 'F': 'wood_floor_raised', 'S': 'fusuma_wall', 'G': 'fusuma_gold', 'H': 'shoji_wall', 'a': 'dais_tatami_3', 'b': 'dais_tatami_2', 'c': 'dais_tatami_1', '2': 'castle_exit', 'P': 'wall_gold', 'N': 'wall_tokonoma', 'D': 'wall_chigaidana',
                   'T': 'pine_k', 'U': 'ume_k', 'w': 'water', 'e': 'edo_lantern'}
    m['decorFloor'] = 'whiteSand'   # 飾り（松・石灯籠）の下の地面
    m['environment'] = dict(base['environment'], hasCeiling=False, floorType='whiteSand', ambientLight=0xdcd0b4, directionalLight=0xfff4dc, fogColor=0xcfdceb, skyColor=0x8fb8e0, fogNear=22, fogFar=70)   # 全面の天井はやめる（中庭は空が見える。部屋と廊下は、床ごとに天井）
    m['npcs'] = [{'id': i, 'x': x, 'z': y} for i, x, y in NPCS]
    for i, x, y in NPCS: assert m['layout'][y][x] in '_=abcF', f'{i} ({x},{y}) が床ではない'
    m['spawn'] = {'x': 13, 'z': 22, 'angle': 0}
    return m
