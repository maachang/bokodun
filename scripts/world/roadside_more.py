"""道に面さない町・村（13〜28 番。ユーザー指示 2026-11-15）の定義と、場所ごとの組み合わせ。道沿いの 12 か所（roadside.py）の続きの番号。
手本・作り方は 12 か所と同じ（村: village.json・町: town.json。外観・中・建物の入れ替え・川と広場・武器屋）。違いは次の 3 点:
  1. 国属が「なし」の場所は、道を通さない。住民・店・宿などは、近隣の国の構成を借りる（look 欄）。国属がある場所は、最寄りの街道から道を通す。
  2. 港町（15・18・21・26）は、町に、海ぞいの水路（横の川）・船・荷を足す（port_decor）。
  3. マカヒキ島（28）は K の見た目（島の土の道は、島の外の道と別）。"""

# (番号, 区分, 借りる国（見た目・住民）, 名前, 世界のマス [行, 列], 追加: road=道を通す・port=港町・none=国属なし)
NEW_SITES = [
    ('13', '村', 'g', 'ジョハー村', (342, 318), dict(none=True)),
    ('14', '町', 'g', 'ハーザンド町', (434, 151), dict(none=True)),
    ('15', '港町', 'g', 'トレヴ港町', (615, 102), dict(none=True)),
    ('16', '村', 'g', 'レッドサン村', (536, 125), dict(none=True)),
    ('17', '村', 'h', 'リレイズ村', (745, 227), dict(none=True)),
    ('18', '港町', 'i', 'キャロティーン港町', (361, 1122), dict(road=True)),
    ('19', '町', 'f', 'ブライアン町', (541, 1128), dict(road=True)),
    ('20', '村', 'f', 'マンダリン村', (625, 1178), dict(road=True)),
    ('21', '港町', 'f', 'モンズ港町', (787, 1132), dict(road=True)),
    ('22', '村', 'f', 'モーリス村', (705, 1178), dict(road=True)),
    ('23', '村', 'h', 'ユリシーズ村', (799, 486), dict(road=True)),
    ('24', '町', 'd', 'ヴァーミリアン町', (577, 481), dict(road=True)),
    ('25', '村', 'c', 'ソロウ村', (357, 610), dict(none=True)),
    ('26', '港町', 'a', 'エネイブル港町', (125, 942), dict(road=True)),
    ('27', '町', 'i', 'ロックソング町', (357, 933), dict(road=True)),
    ('28', '村', 'k', 'カメハメハ村', (747, 168), dict()),
]

# 中の建物の並び（区画ごとの建物, 左右反転）。roadside_layout.py の表に足す
VILLAGE_PLAN = {
    '13': (('pub', 'shop', 'temple'), True), '16': (('shop', 'pub', 'temple'), False), '17': (('temple', 'shop', 'pub'), True),
    '20': (('pub', 'temple', 'shop'), False), '22': (('shop', 'temple', 'pub'), True), '23': (('temple', 'pub', 'shop'), False),
    '25': (('shop', 'pub', 'temple'), True), '28': (('temple', 'shop', 'pub'), False),
}
TOWN_PLAN = {
    '14': (('shop', 'house', 'temple', 'inn'), False), '15': (('house', 'inn', 'shop', 'temple'), True), '18': (('temple', 'house', 'inn', 'shop'), False),
    '19': (('house', 'temple', 'shop', 'inn'), True), '21': (('inn', 'temple', 'house', 'shop'), False), '24': (('temple', 'shop', 'inn', 'house'), True),
    '26': (('shop', 'inn', 'temple', 'house'), False), '27': (('inn', 'house', 'temple', 'shop'), True),
}
WEAPON_SHOP_VILLAGES = {'16', '22', '28'}
WEAPON_SHOP_TOWNS = {'15', '19', '24', '26'}
HOUSE_PLAN = {'13': ('two', 'back'), '16': ('long', 'front'), '17': ('front', 'long'), '20': ('two', 'two'), '22': ('back', 'two'), '23': ('long', 'long'), '25': ('two', 'front'), '28': ('front', 'back')}
# 川と広場: 港町は、真ん中を東西に流れる水路（h）。24 は川の上流（縦の川）
TOWN_RIVER = {'14': 'v', '15': 'h', '18': 'h', '19': 'none', '21': 'h', '24': 'v', '26': 'h', '27': 'none'}
TOWN_PLAZA = {'14': 'well', '15': 'trees', '18': 'fountain', '19': 'trees', '21': 'well', '24': 'fountain', '26': 'well', '27': 'trees'}
VILLAGE_WATER = {'13': 'dry', '16': 'pond', '17': 'dry', '20': 'river', '22': 'dry', '23': 'river', '25': 'dry', '28': 'pond'}

# 国ごとの中の部屋・店の品・門の衛兵・住民の見た目（roadside.py の表に足す）。書いていない国（D・H）は、サンプルのまま
ROOMS = {
    'g': {'village_pub': 'city_inn_g', 'town_pub': 'city_inn_g'},
    'k': {'shop': 'shop_k', 'village_pub': 'city_inn_k', 'town_pub': 'city_inn_k'},
}
SHOP_ID = {'g': {'item_shop': 'item_shop_g', 'weapon_shop': 'weapon_shop_g'}}
GUARD = {'g': 'elf_guard_man', 'c': 'desert_guard', 'k': 'samurai_gate_k'}
NPC_SKIN = {
    'g': {'villager_man': 'elf_man_a', 'villager_woman': 'elf_woman_a', 'child_boy': 'elf_boy', 'child_girl': 'elf_girl', 'elder_man': 'elf_man_c', 'elder_woman': 'elf_woman_c',
          'merchant_man': 'elf_man_b', 'merchant_woman': 'elf_woman_b', 'town_man': 'elf_man_a', 'town_woman': 'elf_woman_a', 'town_boy': 'elf_boy', 'town_girl': 'elf_girl',
          'town_old_woman': 'elf_woman_c', 'town_old_man': 'elf_man_c', 'town_middle_man': 'elf_man_b', 'town_middle_woman': 'elf_woman_b'},
    'c': {'villager_man': 'desert_man', 'villager_woman': 'desert_woman', 'child_boy': 'desert_boy', 'child_girl': 'desert_girl', 'elder_man': 'desert_old_man', 'elder_woman': 'desert_old_woman',
          'town_man': 'desert_man', 'town_woman': 'desert_woman', 'town_boy': 'desert_boy', 'town_girl': 'desert_girl', 'town_old_woman': 'desert_old_woman', 'town_old_man': 'desert_old_man',
          'town_middle_man': 'desert_middle_man', 'town_middle_woman': 'desert_middle_woman'},
    'i': {'villager_man': 'merchant_man', 'villager_woman': 'merchant_woman', 'town_man': 'merchant_man', 'town_woman': 'merchant_woman', 'town_middle_man': 'merchant_man', 'town_middle_woman': 'merchant_woman'},
    'k': {'villager_man': 'machi_man_k', 'villager_woman': 'machi_woman_k', 'child_boy': 'child_boy_k', 'child_girl': 'child_girl_k', 'elder_man': 'merchant_old_k', 'elder_woman': 'merchant_old_k',
          'merchant_man': 'merchant_man_k', 'merchant_woman': 'merchant_woman_k', 'town_man': 'machi_man_k', 'town_woman': 'machi_woman_k', 'town_boy': 'child_boy_k', 'town_girl': 'child_girl_k',
          'town_old_woman': 'merchant_old_k', 'town_old_man': 'merchant_old_k', 'town_middle_man': 'machi_man_k', 'town_middle_woman': 'machi_woman_k'},
}

# 港町ごとの水路の船（x。y は水路の行 10）と岸の荷（文字, x, y）。橋の列（5・6・12〜15・21・22）は避ける。4 か所を、同じ見た目にしない
PORT_DECOR = {
    '15': dict(ships=(2, 8, 17), crates=(('6', 7, 9), ('7', 8, 9), ('6', 9, 9), ('7', 9, 11), ('6', 10, 11), ('7', 3, 9), ('6', 18, 11))),
    '18': dict(ships=(3, 11, 17, 24), crates=(('6', 8, 9), ('7', 9, 9), ('6', 17, 9), ('7', 19, 9), ('6', 8, 11), ('7', 19, 11))),
    '21': dict(ships=(2, 7, 9, 19, 25), crates=(('6', 18, 9), ('7', 19, 9), ('6', 20, 9), ('7', 24, 11), ('6', 25, 11), ('7', 2, 11), ('6', 8, 11), ('7', 23, 9))),
    '26': dict(ships=(9, 18), crates=(('6', 8, 9), ('7', 10, 9), ('6', 9, 11), ('7', 17, 9), ('6', 18, 11), ('7', 19, 11), ('6', 20, 9), ('7', 7, 11))),
}


def port_decor(lay, legend, sid):
    """港町: 水路（真ん中の横の川）に船、岸に荷（箱と樽）を置く（場所ごとに違う。凡例は、使っていない文字で）"""
    for ch in '567':
        assert ch not in legend and not any(ch in r for r in lay), f'港町の飾りの文字 {ch} が使われている'
    legend.update({'5': 'ship_small', '6': 'crate_out', '7': 'barrel_out'})   # 屋外用（床・天井なし。屋内用だと天井の板が空に浮く）
    d = PORT_DECOR[sid]
    for x in d['ships']:
        if lay[10][x] == 'w': lay[10][x] = '5'
    for ch, x, y in d['crates']:
        if lay[y][x] in 'p=': lay[y][x] = ch
