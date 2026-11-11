"""C・E・I の議長・女王の屋敷。1 部屋の複製をやめ、国ごとに、1 階・2 階・地下の 3 階建てに作る（共通の道具は castle_kit.py）。
  - C（ミレニアム自由都市）mansion_chairman_c: 砂色の土壁の商人の館。1 階（商談の広間・議長の執務室。暖炉なし）・2 階の私室・地下の金庫室
  - E（ガリレオ連盟）mansion_chairman_e: 大理石の成金の館。1 階（大広間・議長の間・帳場・食堂）・2 階の宝物の間・地下の金庫
  - I（カナロア公国）mansion_duke_i: 青みのある石の湖畔の館。1 階（謁見の間・食堂・厨房）・2 階の女王の私室と書斎・地下の船着き場の倉
  制約（test/world.test.mjs）: C の議長は北の壁の書棚の前・赤い絨毯の上。C に暖炉は置かない。扉の上に絵（icon）は付けない
"""
from castle_kit import arrival, finish, grid, make as _make, put

COMMON = {'W': 'wooden_wall', 'F': 'wood_floor', 'u': 'rug', 'T': 'table', 'h': 'chair', 'e': 'bed', 'k': 'bookshelf', 'g': 'cupboard', 'X': 'crate', 'Y': 'barrel',
          'N': 'wall_window_curtain', 'L': 'wall_sconce_wood', 'K': 'chandelier_mansion_rug', 'U': 'stairs_wood_up', 'D': 'stairs_wood_down', 'E': 'building_exit',
          'S': 'stove', 'w': 'water_barrel', 'c': 'treasure_chest', 'G': 'cell_door'}
ENV = {'floorType': 'stone', 'hasCeiling': True, 'ceilingTexture': 'woodWall', 'ambientLight': 15259832, 'directionalLight': 13615264, 'fogColor': 4864552,
       'fogNear': 22, 'fogFar': 70, 'visibility': 0.9, 'skyColor': 4864552}
ENV_DEEP = dict(ENV, ambientLight=9474192, directionalLight=11184810, fogColor=1710640, fogNear=10, fogFar=40, visibility=0.8, skyColor=1710640, ceilingTexture='brick')
FLOORS = '_=Fu'


def _leg(**kw):
    d = dict(COMMON); d.update(kw); return d


# 国ごとの見た目（壁・床・家具）。C: 土壁と板の床 / E: 白い壁と大理石 / I: 青い石の壁と板の床。地下は、どの国も、煉瓦
LOOK = {
    'c': _leg(W='adobe_wall', N='wall_window_wood'),
    'e': _leg(W='white_wall', F='marble_floor', T='table_marble', h='chair_marble', e='bed_marble', k='bookshelf_marble', g='cupboard_marble', X='crate_marble',
              N='wall_window_curtain_marble', L='wall_sconce_marble', U='stairs_marble_up', D='stairs_marble_down', S='stove_marble', w='water_barrel_marble'),
    'i': _leg(W='lake_wall'),
}
DEEP = {'W': 'brick_wall', 'F': 'brick_floor', 'L': 'wall_sconce', 'U': 'stairs_stone_up', 'T': 'table_stone', 'h': 'chair_stone', 'X': 'crate_stone', 'Y': 'barrel_stone',
        'w': 'water_barrel_stone', 'g': 'cupboard'}
# 階段（x, y, 階段のある壁の側）。1f は上り U（2 階へ）と下り D（地下へ）、2f は下り D（1 階へ）、vault は上り U（1 階へ）
ST = {
    'c': {'1f': {'U': (19, 6, 'e'), 'D': (1, 12, 'w')}, '2f': {'D': (19, 9, 'e')}, 'vault': {'U': (1, 5, 'w')}},
    'e': {'1f': {'U': (1, 8, 'w'), 'D': (21, 12, 'e')}, '2f': {'D': (1, 3, 'w')}, 'vault': {'U': (21, 5, 'e')}},
    'i': {'1f': {'U': (1, 9, 'w'), 'D': (21, 13, 'e')}, '2f': {'D': (1, 9, 'w')}, 'vault': {'U': (21, 5, 'e')}},
}
IDS = {'c': 'mansion_chairman_c', 'e': 'mansion_chairman_e', 'i': 'mansion_duke_i'}
TOWN = {'c': 'town_c', 'e': 'town_e', 'i': 'town_i'}
NAME = {'c': '議長の館（ミレニアム自由都市）', 'e': '議長の館（ガリレオ連盟）', 'i': '女王の館（カナロア公国）'}


def mk(k, floor, g, npcs, up=None, down=None, **kw):
    """floor: '1f'・'2f'・'vault'。階段のリンクは、ST から決める（up = 上の階・down = 下の階の行き先 ID と文）"""
    mid = IDS[k] + ('' if floor == '1f' else '_' + floor)
    leg = dict(LOOK[k]); env = ENV
    if floor == 'vault': leg.update(DEEP); env = ENV_DEEP
    lk = {}
    for kind, dest in (('U', up), ('D', down)):
        if dest:
            did, dfloor, dkind, msg = dest
            lk[kind] = (did, arrival(*ST[k][dfloor][dkind]), msg)
    name = NAME[k] + ('' if floor == '1f' else {'2f': '（2階）', 'vault': '（地下）'}[floor])
    sp = kw.pop('spawn', None) or arrival(*ST[k][floor]['D' if floor == '2f' else 'U'])
    return _make(mid, name, g, ST[k][floor], npcs, lk, leg=leg, env=env, floor_chars=FLOORS, spawn=sp, **kw)


def _first(k, g, npcs, exit_x, down_to_vault=True):
    h = len(g)
    put(g, {'E': [(exit_x, h - 1)]}, 'W')
    m = mk(k, '1f', g, npcs, up=(IDS[k] + '_2f', '2f', 'D', '階段を上る（2階へ）'), down=(IDS[k] + '_vault', 'vault', 'U', '階段を下りる（地下へ）'), spawn={'x': exit_x, 'z': h - 3, 'angle': 0})
    m['nextMap'] = TOWN[k]
    return m


def _vault(k, w, rooms_top, rooms_bot, chests, npcs, stock):
    """地下の倉: 廊下（y4〜6）を挟んで、北と南に、小部屋が 2 つずつ。rooms_*: [(x0, x1)]。stock: 各小部屋の中身の物"""
    areas = {'cor': ('F', 1, 4, w - 2, 6)}
    doors = []
    for i, (a, b) in enumerate(rooms_top): areas[f't{i}'] = ('F', a, 1, b, 2); doors.append(((a + b) // 2, 3))
    for i, (a, b) in enumerate(rooms_bot): areas[f'b{i}'] = ('F', a, 8, b, 9); doors.append(((a + b) // 2, 7))
    g = grid(w, 11, areas, doors, {'F': 'F'}, part=None)
    put(g, {'L': [(x, 10) for x in (4, w - 5)] + [(0, 5), (w - 1, 3)]}, 'W')
    ux, uy, _ = ST[k]['vault']['U']
    put(g, {'U': [(ux, uy)]}, 'F')
    for ch, ps in stock.items(): put(g, {ch: ps}, 'F')
    put(g, {'c': chests}, 'F')
    return mk(k, 'vault', g, npcs, up=(IDS[k], '1f', 'D', '階段を上る（1階へ）'))


# ---------------- C: 砂漠の商人の館（暖炉なし）----------------
def _c1f():
    """商談の広間（南）と議長の執務室（北。絨毯の上・北の壁は書棚）。広間の東に 2 階への階段・西に地下への階段"""
    g = grid(21, 15, {'office': ('F', 1, 1, 19, 4), 'hall': ('F', 1, 6, 19, 13)}, [(10, 5)], {'F': 'F'}, part=None)
    for y in range(1, 5):
        for x in range(5, 16): g[y][x] = 'u'
    for y in range(6, 14):
        for x in (9, 10, 11): g[y][x] = 'u'
    put(g, {'k': [(x, 1) for x in range(5, 16)], 'T': [(10, 3), (3, 3), (17, 3)], 'h': [(9, 3), (11, 3), (3, 4), (17, 4)], 'g': [(1, 1), (19, 1)], 'X': [(1, 4), (19, 4)]}, 'Fu')
    put(g, {'T': [(4, 8), (4, 11), (16, 8), (16, 11)], 'h': [(5, 8), (3, 8), (5, 11), (3, 11), (15, 8), (17, 8), (15, 11), (17, 11)], 'X': [(1, 7), (2, 7), (18, 13)], 'g': [(1, 13)], 'Y': [(17, 13)],
            'U': [(19, 6)], 'D': [(1, 12)]}, 'F')
    put(g, {'K': [(10, 9)]}, 'u')
    put(g, {'N': [(3, 14), (6, 14), (14, 14), (17, 14), (0, 8), (0, 10), (20, 9), (20, 11)], 'L': [(8, 14), (12, 14), (0, 6), (20, 7), (4, 0), (16, 0)]}, 'W')
    npcs = [('desert_chairman', 10, 2), ('desert_clerk_man', 8, 6), ('desert_clerk_woman', 12, 6), ('merchant_master_man', 6, 9), ('merchant_master_woman', 14, 12), ('butler', 18, 7), ('maid', 3, 6)]
    return _first('c', g, npcs, 10)


def _c2f():
    """議長の私室（西）・書斎（東）・廊下の回廊"""
    areas = {'bed': ('F', 1, 1, 9, 5), 'study': ('F', 11, 1, 19, 5), 'gal': ('F', 1, 7, 19, 11)}
    g = grid(21, 13, areas, [(10, 3), (5, 6), (15, 6)], {'F': 'F'}, part=None)
    for x in range(2, 19): g[9][x] = 'u'
    put(g, {'e': [(2, 2), (2, 4)], 'g': [(8, 1), (8, 5)], 'T': [(5, 3), (15, 4)], 'h': [(6, 3), (14, 4), (16, 4)], 'k': [(x, 1) for x in range(12, 19)], 'X': [(1, 5), (19, 5)]}, 'F')
    put(g, {'D': [(19, 9)]}, 'F')
    put(g, {'T': [(6, 8), (14, 8)], 'h': [(5, 8), (7, 8), (13, 8), (15, 8)], 'X': [(1, 11), (2, 11)], 'g': [(18, 11), (17, 11)]}, 'F')
    put(g, {'N': [(3, 0), (6, 0), (4, 12), (9, 12), (11, 12), (16, 12), (0, 3), (0, 9)], 'L': [(14, 0), (10, 0), (20, 3), (20, 8)]}, 'W')
    npcs = [('maid_head', 4, 4), ('maid', 14, 9), ('servant_man', 8, 10), ('merchant_woman', 12, 3)]
    return mk('c', '2f', g, npcs, down=('mansion_chairman_c', '1f', 'U', '階段を下りる（1階へ）'))


def _cvault():
    return _vault('c', 21, [(1, 7), (9, 19)], [(1, 9), (11, 19)], [(3, 1), (17, 2)],
                  [('guard_light', 10, 5), ('desert_clerk_man', 5, 2), ('merchant_master_man', 14, 9)],
                  {'X': [(2, 1), (10, 1), (19, 1), (19, 2), (1, 9), (11, 9), (19, 9)], 'Y': [(9, 8), (13, 8), (7, 1)], 'w': [(1, 8)]})


# ---------------- E: 成金の館（大理石）----------------
def _e1f():
    """大広間（南）と、北に、帳場（西）・議長の間（中央）・食堂（東）"""
    areas = {'count': ('F', 1, 1, 4, 5), 'chair': ('F', 6, 1, 16, 5), 'dine': ('F', 18, 1, 21, 5), 'hall': ('F', 1, 7, 21, 13)}
    g = grid(23, 15, areas, [(2, 6), (11, 6), (19, 6)], {'F': 'F'}, part=None)
    for y in range(1, 6):
        for x in range(8, 15): g[y][x] = 'u'
    for y in range(7, 14):
        for x in (10, 11, 12): g[y][x] = 'u'
    put(g, {'k': [(x, 1) for x in range(8, 15)], 'c': [(6, 1), (16, 1), (6, 5), (16, 5)], 'T': [(11, 3)], 'h': [(10, 3), (12, 3)], 'g': [(6, 3), (16, 3)]}, 'Fu')
    put(g, {'T': [(2, 3), (19, 3), (20, 3)], 'h': [(2, 4), (19, 4), (20, 4)], 'X': [(1, 1), (4, 1)], 'k': [(1, 5), (4, 5)], 'S': [(21, 1)], 'w': [(18, 1)]}, 'F')
    put(g, {'K': [(11, 10)], 'T': [(5, 9), (5, 12), (17, 9), (17, 12)], 'h': [(4, 9), (6, 9), (4, 12), (6, 12), (16, 9), (18, 9), (16, 12), (18, 12)], 'c': [(1, 13), (21, 7)], 'X': [(2, 13)],
            'U': [(1, 8)], 'D': [(21, 12)]}, 'Fu')
    put(g, {'N': [(3, 14), (6, 14), (16, 14), (19, 14), (0, 10), (0, 12), (22, 9), (22, 11)], 'L': [(9, 14), (13, 14), (0, 7), (22, 8), (3, 0), (20, 0)]}, 'W')
    npcs = [('chairman_e', 11, 2), ('merchant_clerk_man', 2, 2), ('merchant_clerk_woman', 3, 3), ('senior_merchant_man', 8, 8), ('senior_merchant_woman', 14, 8), ('butler', 19, 2),
            ('maid', 20, 2), ('guard_light', 9, 12), ('guard_light', 13, 12)]
    return _first('e', g, npcs, 11)


def _e2f():
    """宝物の間（北。宝箱が並ぶ）・主の寝室（南西）・帳簿の書斎（南東）"""
    areas = {'tre': ('F', 1, 1, 21, 5), 'bed': ('F', 1, 7, 10, 11), 'study': ('F', 12, 7, 21, 11)}
    g = grid(23, 13, areas, [(5, 6), (16, 6), (11, 9)], {'F': 'F'}, part=None)
    for x in range(2, 21): g[3][x] = 'u'
    put(g, {'c': [(x, 1) for x in range(3, 21, 2)], 'X': [(21, 4), (21, 5)], 'T': [(6, 3), (16, 3)], 'h': [(7, 3), (15, 3)]}, 'Fu')
    put(g, {'e': [(2, 8), (2, 10)], 'g': [(9, 8), (9, 10)], 'k': [(x, 11) for x in range(13, 21)], 'T': [(16, 8)], 'h': [(15, 8), (17, 8)], 'c': [(5, 11)]}, 'F')
    put(g, {'D': [(1, 3)]}, 'Fu')
    put(g, {'N': [(5, 0), (11, 0), (17, 0), (4, 12), (8, 12), (0, 8), (0, 10)], 'L': [(8, 0), (14, 0), (22, 3), (22, 9), (12, 12), (18, 12)]}, 'W')
    npcs = [('merchant_master_man', 10, 3), ('guard_light', 18, 4), ('merchant_clerk_woman', 18, 9), ('maid_head', 4, 9)]
    return mk('e', '2f', g, npcs, down=('mansion_chairman_e', '1f', 'U', '階段を下りる（1階へ）'))


def _evault():
    return _vault('e', 23, [(1, 9), (11, 21)], [(1, 9), (11, 21)], [(2, 1), (4, 1), (6, 1), (13, 1), (15, 1), (17, 1), (19, 1), (3, 9), (5, 9), (13, 9), (15, 9), (17, 9)],
                  [('guard_light', 11, 5), ('guard_light', 17, 5), ('merchant_clerk_man', 6, 2), ('senior_merchant_man', 16, 9)],
                  {'X': [(8, 1), (21, 1), (21, 2), (9, 9), (21, 9)], 'Y': [(1, 9)], 'T': [(7, 9)]})


# ---------------- I: 湖畔の館（青い石）----------------
def _i1f():
    """北に、食堂（西）・謁見の間（中央。女王）・厨房（東）。南は広間"""
    areas = {'dine': ('F', 1, 1, 4, 6), 'aud': ('F', 6, 1, 16, 6), 'kit': ('F', 18, 1, 21, 6), 'hall': ('F', 1, 8, 21, 14)}
    g = grid(23, 16, areas, [(2, 7), (11, 7), (19, 7)], {'F': 'F'}, part=None)
    for y in range(1, 7):
        for x in range(9, 14): g[y][x] = 'u'
    for y in range(8, 15):
        for x in (10, 11, 12): g[y][x] = 'u'
    put(g, {'k': [(6, 1), (16, 1), (6, 6), (16, 6)], 'g': [(6, 3), (16, 3)], 'h': [(8, 2), (14, 2), (9, 6), (13, 6)]}, 'Fu')
    put(g, {'T': [(2, 3), (2, 5)], 'h': [(3, 3), (3, 5)], 'g': [(1, 1)], 'S': [(21, 1)], 'w': [(18, 1)], 'X': [(21, 6), (18, 6)]}, 'F')
    put(g, {'K': [(11, 11)], 'T': [(5, 10), (5, 13), (17, 10), (17, 13)], 'h': [(4, 10), (6, 10), (4, 13), (6, 13), (16, 10), (18, 10), (16, 13), (18, 13)],
            'U': [(1, 9)], 'D': [(21, 13)], 'X': [(1, 14)], 'Y': [(2, 14)]}, 'Fu')
    put(g, {'N': [(3, 15), (6, 15), (16, 15), (19, 15), (0, 11), (0, 13), (22, 10), (22, 12)], 'L': [(9, 15), (13, 15), (0, 8), (22, 9), (3, 0), (20, 0)]}, 'W')
    npcs = [('queen_i', 11, 2), ('butler', 9, 4), ('maid_head', 13, 4), ('guard_light', 10, 9), ('guard_light', 12, 9), ('maid', 3, 4), ('servant_man', 20, 4), ('maid', 19, 3)]
    return _first('i', g, npcs, 11)


def _i2f():
    """女王の私室（西）・書斎（東）・湖が見える露台の回廊（南）"""
    areas = {'bed': ('F', 1, 1, 9, 5), 'study': ('F', 11, 1, 21, 5), 'gal': ('F', 1, 7, 21, 11)}
    g = grid(23, 13, areas, [(10, 3), (5, 6), (16, 6)], {'F': 'F'}, part=None)
    put(g, {'e': [(2, 2), (2, 4)], 'g': [(8, 1), (8, 5)], 'T': [(5, 3)], 'h': [(6, 3)], 'k': [(x, 1) for x in range(13, 21)], 'X': [(21, 5)]}, 'F')
    put(g, {'T': [(16, 4)], 'h': [(15, 4), (17, 4)]}, 'F')
    put(g, {'D': [(1, 9)]}, 'F')
    put(g, {'T': [(8, 8), (14, 8)], 'h': [(7, 8), (9, 8), (13, 8), (15, 8)], 'X': [(21, 11), (20, 11)], 'g': [(1, 11), (2, 11)]}, 'F')
    put(g, {'N': [(3, 0), (6, 0), (3, 12), (6, 12), (10, 12), (14, 12), (18, 12), (0, 8), (0, 10), (22, 8), (22, 10)], 'L': [(11, 0), (21, 0), (0, 3), (22, 3)]}, 'W')
    npcs = [('maid_head', 4, 4), ('maid', 12, 9), ('butler', 18, 9), ('servant_man', 15, 3)]
    return mk('i', '2f', g, npcs, down=('mansion_duke_i', '1f', 'U', '階段を下りる（1階へ）'))


def _ivault():
    return _vault('i', 23, [(1, 9), (11, 21)], [(1, 9), (11, 21)], [(20, 1), (3, 9)],
                  [('servant_man', 12, 5), ('maid', 5, 2), ('guard_light', 16, 9)],
                  {'Y': [(1, 1), (2, 1), (1, 2), (13, 1), (14, 1), (15, 1), (9, 8), (9, 9), (21, 9)], 'X': [(7, 1), (19, 1), (11, 9), (12, 9)], 'w': [(1, 9)]})


def build():
    """C・E・I の館のマップ（list）。1 階の id は mansion_chairman_c・mansion_chairman_e・mansion_duke_i のまま"""
    out = []
    for fns in ((_c1f, _c2f, _cvault), (_e1f, _e2f, _evault), (_i1f, _i2f, _ivault)): out += finish([f() for f in fns])
    return out
