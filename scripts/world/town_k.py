"""K（マカヒキ国・マカヒキ島。江戸時代風の独自の国）の街の中身。D（town_d.py）と同じ作り（サンプルの高さ・川・橋・高台・城門）で、
施設・街の人・見た目（白い漆喰の壁・黒い板張りの町家・瓦屋根）を変える。
  - 港: 街の南の川（東西）に、船（見た目）。川沿いの「渡し場」（小屋）から、E（ガリレオ連盟）の港へ渡し船で行く（扉＝移動。E の港にも、同じ渡し場）
  - 城: 北の城門から、殿様の城（castle_k）。殿様・家老は、城の中だけ（街の通りには出ない）
  - 街の人の画像は、sdServer の江戸風（ID 344〜364）。船頭（ferryman_k）だけ、仮の画像のまま（侍・門番は ID 365）
"""
from town_d import FACILITIES, _to, build

# 渡し場: 川沿いの小屋（幅 4）。扉の前（13,21）から、川の船着き場。E の港の渡し場の前（27,8）へ、渡し船で行く（back は付けない: 片道ずつの移動）
FERRY_K = ('S', 12, 18, 4, 1, 'd', 'z', {'nextMap': 'town_e', 'message': '渡し船に乗る（ガリレオ連盟の港へ）', 'spawn': {'x': 27, 'z': 8, 'angle': 3.14159}})
_K_ROOM = {'item_shop': 'shop_k', 'weapon_shop': 'shop_k', 'guild_adv': 'guild_adv_k', 'guild_training': 'guild_training_k', 'city_inn': 'city_inn_k', 'temple': 'shrine_k'}   # K 専用の中（畳・木張り。interior_k.py。店は shopId を保つ）


def _k_fac(f):
    link = dict(f[7])
    key = (link.get('params') or {}).get('shopId') or link['nextMap']
    if key in _K_ROOM: link['nextMap'] = _K_ROOM[key]
    if f[6] == 'c': link['message'] = '神社に入る'
    return f[:7] + (link,)


FACILITIES_K = [_k_fac(f) for f in FACILITIES if f[6] != 'm'] + [FERRY_K]
NPCS_K = [   # 一般の住民（町人）・侍・船頭。殿様・家老は、城（castle_k）の中
    ('machi_man_k', 6, 17), ('merchant_woman_k', 28, 13), ('samurai_k', 24, 9), ('merchant_man_k', 15, 21), ('machi_woman_k', 6, 25),
    ('samurai_k', 17, 27), ('samurai_k', 22, 27), ('samurai_gate_k', 17, 1), ('samurai_gate_k', 22, 1), ('ferryman_k', 12, 21),
    ('merchant_old_k', 34, 12), ('machi_woman_k', 8, 21), ('okappiki_k', 33, 21), ('machi_woman_k', 10, 21),
    ('ronin_k', 36, 14), ('child_girl_k', 21, 21), ('child_boy_k', 5, 21), ('machi_woman_k', 30, 15),
]
SKIN_EDO = {'H': 'edo_house', 'S': 'edo_shop', 'I': 'edo_inn', 'J': 'edo_shrine', 'W': 'edo_wall', 'G': 'edo_gate', 'z': 'ferry_sign', 'p': 'plaza_dirt', '=': 'dirt_road', 'P': 'plaza_stone', 'C': 'edo_castle_gate'}   # 地面は土（広場 plaza_dirt・通り dirt_road）。石畳（P）は城門前・橋のたもと・神社の参道だけ。壁は木の板塀・門は大きな木の門
SHIPS_K = (('L', 12, 22), ('L', 27, 23), ('l', 14, 23), ('l', 25, 22), ('l', 36, 22), ('l', 3, 23))   # 川（港）に浮かぶ船（見た目だけ）

HOUSE_KINDS = ('H', 'U', 'H', 'Y', 'X')   # 町家の並びの変化: 町家・土蔵・町家・長屋・茶屋（建物ごとに順に）


def diversify(g):
    """住宅（H）の建物（つながった H）を、順に、土蔵（U）・長屋（Y）・茶屋（X）に替える（建物の形・扉・施設は、そのまま）"""
    seen, n = set(), 0
    for y in range(len(g)):
        for x in range(len(g[0])):
            if g[y][x] != 'H' or (x, y) in seen: continue
            st, comp = [(x, y)], []
            seen.add((x, y))
            while st:
                cx, cy = st.pop(); comp.append((cx, cy))
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if 0 <= ny < len(g) and 0 <= nx < len(g[0]) and g[ny][nx] == 'H' and (nx, ny) not in seen: seen.add((nx, ny)); st.append((nx, ny))
            k = HOUSE_KINDS[n % len(HOUSE_KINDS)]; n += 1
            for cx, cy in comp: g[cy][cx] = k
    return g


DECOR_K = {'e': ((17, 6), (22, 12), (17, 13), (22, 5)), 'h': ((17, 9), (22, 9), (17, 3), (22, 17)), 'k': ((23, 7),), 'V': ((16, 0), (17, 0), (22, 0), (23, 0)), 'O': ((31, 13),), 'g': ((30, 12),), 'K': ((32, 12),), 't': ((6, 5), (11, 5), (9, 21), (13, 21), (30, 17), (30, 5))}   # 街並みの飾り: 石灯籠・提灯の柱・高札場・天水桶（広場 p の上）
DECOR_OBJ = {'e': 'edo_lantern', 'h': 'edo_chochin', 'k': 'edo_kousatsu', 't': 'edo_tensui', 'V': 'edo_yagura', 'O': 'edo_torii', 'g': 'komainu_k_w', 'K': 'komainu_k_e'}


def decorate(g):
    assert g[12][32] == 'c' and g[12][33] == 'P'; g[12][32] = 'P'; g[12][33] = 'c'   # 神社の入口（31, 11）の左右に狛犬を置くので、神社の看板を 1 つ東へ
    for ch, ps in DECOR_K.items():
        for x, y in ps:
            assert g[y][x] in ('W' if ch == 'V' else 'pP'), f'K の飾り {ch} ({x},{y}): 広場ではない'
            g[y][x] = ch
    return g


STONE_ROWS = ((1, 16, 23), (2, 16, 23), (27, 16, 23), (28, 16, 23), (12, 27, 36), (21, 5, 8), (21, 17, 22), (21, 31, 34), (24, 5, 8), (24, 17, 22), (24, 31, 34))   # (行, 開始 x, 終了 x): 城門の前・南門の前・神社の参道・橋のたもと


def build_k(w, h, legend, city_legend, links, npcs):
    layout, heights = build(w, h, legend, city_legend, links, npcs, facilities=FACILITIES_K, npc_list=NPCS_K, skin=SKIN_EDO, castle='castle_k')
    g = [list(r) for r in layout]
    for ch, x, y in SHIPS_K:
        assert g[y][x] == 'w', f'K の船 ({x},{y}): 水ではない'
        g[y][x] = ch
    for y, x0, x1 in STONE_ROWS:   # 石畳を残す所（土の地面の上の、要所）
        for x in range(x0, x1 + 1):
            if g[y][x] in 'p=': g[y][x] = 'P'
    diversify(g); decorate(g)
    legend.update({c: o for c, o in DECOR_OBJ.items()})
    legend.update({'L': 'ship_large', 'l': 'ship_small', 'U': 'edo_kura', 'Y': 'edo_nagaya', 'X': 'edo_chaya'})
    return [''.join(r) for r in g], heights
