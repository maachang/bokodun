"""K（マカヒキ国）の殿様の城の中。江戸時代の城の御殿（表御殿）を手本に、全面畳・ふすまで区切った部屋が、玄関から奥へ、雁行して連なる。
  手本（江戸城の本丸御殿・二条城の二の丸御殿）: 玄関（車寄）→ 遠侍（控室）→ 式台 → 大広間（上段の間）→ 蘇鉄の間（廊下）→ 黒書院 → 白書院（最奥）。
  表の奥に、大奥（御台所の居所）。台所は、玄関の脇。格式の高い部屋（大広間・黒書院・白書院）は、金の松のふすま。ほかは白いふすま。外の壁は障子
  作り方: 全体を壁で埋め、部屋（床）をくり抜き、部屋と部屋の間の壁を、ふすまに。戸口（ふすまの途切れ）でつなぐ
"""
W, H = 35, 25
# 部屋: 名前 → (x0, y0, x1, y1)（床の範囲。両端を含む）。金の間（GOLD）の壁は、金のふすま
ROOMS = {
    'genkan': (14, 21, 20, 23), 'toozamurai': (3, 18, 12, 23), 'shidai': (14, 17, 20, 19), 'daidokoro': (22, 18, 31, 23),
    'ohiroma': (6, 10, 28, 15), 'hikae_l': (1, 10, 4, 15), 'hikae_r': (30, 10, 33, 15),
    'rouka': (6, 7, 28, 8), 'kuro': (6, 2, 16, 5), 'shiro': (18, 2, 28, 5), 'oku': (30, 2, 33, 8), 'karo_room': (1, 2, 4, 8),
}
GOLD = ('ohiroma', 'kuro', 'shiro')
DOORS = [(13, 22), (17, 20), (13, 18), (21, 18), (17, 16), (5, 12), (29, 12), (17, 9), (11, 6), (23, 6), (29, 7), (5, 7), (17, 4)]   # 戸口（ふすまの途切れ）。玄関・遠侍・式台・台所・大広間・控え・廊下・書院・奥
DAIS = {10: 'a', 11: 'b', 12: 'c'}   # 大広間の上段（北の 3 行・x 12〜22）: a=高さ 0.9・b=0.6・c=0.3


def _rows():
    owner = [[None] * W for _ in range(H)]
    for n, (x0, y0, x1, y1) in ROOMS.items():
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                assert owner[y][x] is None, f'{n}: 部屋が重なる ({x},{y})'
                owner[y][x] = n
    g = [['H'] * W for _ in range(H)]
    for y in range(H):
        for x in range(W):
            if owner[y][x]: g[y][x] = '_'
    for y in range(1, H - 1):   # 部屋と部屋の間の壁を、ふすまに（両側が床）。金の間に面した壁は、金のふすま
        for x in range(1, W - 1):
            if owner[y][x]: continue
            for a, b in (((x - 1, y), (x + 1, y)), ((x, y - 1), (x, y + 1))):
                o1, o2 = owner[a[1]][a[0]], owner[b[1]][b[0]]
                if o1 and o2: g[y][x] = 'G' if (o1 in GOLD or o2 in GOLD) else 'S'
    for x, y in DOORS:
        assert g[y][x] in 'SG', f'戸口 ({x},{y}) が、ふすまではない'
        g[y][x] = '_'
    for y, c in DAIS.items():
        for x in range(12, 23): g[y][x] = c
    g[H - 1][17] = '2'
    return [''.join(r) for r in g]


NPCS = [   # (id, x, y)
    ('daimyo_k', 17, 10), ('karo_k', 14, 11), ('sword_bearer_k', 19, 10),
    ('guard_k', 8, 14), ('guard_k', 26, 14), ('guard_k', 10, 12), ('guard_k', 24, 12),
    ('daimyo_retainer_k', 9, 4), ('daimyo_master_k', 23, 4), ('daimyo_wife_k', 31, 4), ('maid_k', 32, 7),
    ('guard_k', 5, 20), ('guard_k', 10, 22), ('maid_k', 28, 22), ('daimyo_cook_k', 26, 20), ('cook_k', 24, 22),
]


def build(base):
    """base: 元の castle_k（環境・出口などを引き継ぐ）。畳・ふすま・障子の城に作り直す"""
    m = dict(base)
    m['layout'] = _rows()
    m['legend'] = {'_': 'tatami', 'S': 'fusuma_wall', 'G': 'fusuma_gold', 'H': 'shoji_wall', 'a': 'dais_tatami_3', 'b': 'dais_tatami_2', 'c': 'dais_tatami_1', '2': 'castle_exit'}
    m['environment'] = dict(base['environment'], ceilingTexture='woodWall', ambientLight=0xcfc0a0, directionalLight=0xfff0d0, fogColor=0x3a2a1c, skyColor=0x3a2a1c)   # 赤い明かり・レンガの天井をやめる（木の天井・暖かい明かり）
    m['npcs'] = [{'id': i, 'x': x, 'z': y} for i, x, y in NPCS]
    for i, x, y in NPCS: assert m['layout'][y][x] in '_abc', f'{i} ({x},{y}) が床ではない'
    m['spawn'] = {'x': 17, 'z': 22, 'angle': 0}
    return m
