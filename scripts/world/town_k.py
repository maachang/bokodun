"""K（マカヒキ国・マカヒキ島。江戸時代風の独自の国）の街の中身。D（town_d.py）と同じ作り（サンプルの高さ・川・橋・高台・城門）で、
施設・街の人・見た目（白い漆喰の壁・黒い板張りの町家・瓦屋根）を変える。
  - 港: 街の南の川（東西）に、船（見た目）。川沿いの「渡し場」（小屋）から、E（ガリレオ連盟）の港へ渡し船で行く（扉＝移動。E の港にも、同じ渡し場）
  - 城: 北の城門から、殿様の城（castle_k）。殿様・家老は、城の中だけ（街の通りには出ない）
  - 街の人の画像は、sdServer の江戸風（ID 344〜364）。侍（samurai_k・samurai_gate_k）と船頭（ferryman_k）だけ、仮の画像のまま
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
SKIN_EDO = {'H': 'edo_house', 'S': 'edo_shop', 'I': 'edo_inn', 'J': 'edo_shrine', 'W': 'edo_wall', 'G': 'edo_gate', 'z': 'ferry_sign'}   # 壁は木の板塀・門は大きな木の門
SHIPS_K = (('L', 12, 22), ('L', 27, 23), ('l', 14, 23), ('l', 25, 22), ('l', 36, 22), ('l', 3, 23))   # 川（港）に浮かぶ船（見た目だけ）


def build_k(w, h, legend, city_legend, links, npcs):
    layout, heights = build(w, h, legend, city_legend, links, npcs, facilities=FACILITIES_K, npc_list=NPCS_K, skin=SKIN_EDO, castle='castle_k')
    g = [list(r) for r in layout]
    for ch, x, y in SHIPS_K:
        assert g[y][x] == 'w', f'K の船 ({x},{y}): 水ではない'
        g[y][x] = ch
    legend.update({'L': 'ship_large', 'l': 'ship_small'})
    return [''.join(r) for r in g], heights
