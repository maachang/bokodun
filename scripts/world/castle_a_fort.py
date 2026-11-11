"""A（キュラビッド帝国）の帝王の城の中。雪山の中の、ロシア風の石の要塞（クレムリンを手本）。中庭を囲む、四角い作り。
  - 1 階 castle_a（37×21）: 南の門（出口）→ 玄関ホール → 廊下ホール → 玉座の間（北。帝王）。西に書庫・食堂と厨房（大きなペチカ）、東に武器庫・兵舎（守衛）。玄関の左右に衛兵の間
  - 2 階 castle_a_2f（37×13）: 北棟の上。長い回廊に、帝王の私室（寝室・書斎・謁見の小部屋・控え）が並ぶ。回廊の南の扉から、塔へ
  - 塔 castle_a_watch（見張りの塔）・castle_a_bell（鐘楼）、中庭 castle_a_yard（空が見える雪の庭）
  - 地下 castle_a_icehouse（氷室: 氷を貯める蔵）→ さらに下に castle_a_prison（牢 6）
  設定: 若い帝王（emperor_a）と、守衛（sdServer ID 16。キー guard_heavy）。女中・執事・料理人・牢番・囚人は、既存の画像
  共通の道具・つなぎ方の決まりは castle_kit.py（階段は、向きと降り立つマスを座標から割り出す。生成の最後に、歩いてつながることを確かめる）
"""
from castle_kit import PI, arrival, finish, grid, make as _make, put

LEG = {'W': 'brick_wall', 'F': 'brick_floor', 'u': 'castle_rug', 'L': 'wall_sconce', 'R': 'wall_banner_red', 'N': 'wall_window_stone', 'a': 'dais_stone_3',
       'b': 'dais_stone_2', 'c': 'dais_stone_1', 'A': 'dais_rug_3', 'B': 'dais_rug_2', 'C': 'dais_rug_1', 'K': 'chandelier_castle_rug', 'U': 'stairs_stone_up',
       'D': 'stairs_stone_down', '2': 'castle_exit', 'd': 'wooden_door', 'T': 'table_stone', 'h': 'chair_stone', 'S': 'stove_stone', 'X': 'crate_stone',
       'Y': 'barrel_stone', 'Q': 'weapon_rack_stone', 'k': 'bookshelf_stone', 'e': 'bed_stone', 'z': 'kitchen_hearth_stone', 'p': 'prep_table_stone',
       'V': 'sack_pile_stone', 'G': 'cell_door', 's': 'straw_bed', 'I': 'ice', 'O': 'well', 'y': 'plaza_stone_snow', 'o': 'snow_pine'}
ENV = {'floorType': 'stone', 'hasCeiling': True, 'footstep': 'stone', 'ceilingTexture': 'brick', 'ambientLight': 10096512, 'directionalLight': 13615264,
       'fogColor': 2761760, 'fogNear': 14, 'fogFar': 48, 'visibility': 0.9, 'skyColor': 2761760}
ENV_COLD = dict(ENV, ambientLight=7829367, directionalLight=11184810, fogColor=1710618, fogNear=8, fogFar=34, visibility=0.75, skyColor=1710618)   # 地下: 暗く、冷たい
ENV_YARD = {'floorType': 'snow', 'hasCeiling': False, 'ambientLight': 16777215, 'directionalLight': 16777215, 'fogColor': 14674418, 'fogNear': 14, 'fogFar': 48,
            'visibility': 0.85, 'skyColor': 14674418}   # 雪の庭（外のマップの雪の環境と同じ）
FLOOR_ALL = '_=Fabc ABCuIy0'.replace(' ', '')   # 人を置ける床の文字（段・絨毯・氷・雪の石畳・庭の地面を含む）

# 階段（x, y, 向き）。向き＝階段のある側の壁。降り立つのは、反対側のマス
ST = {'1f': {'U1': (1, 2, 'w'), 'U2': (35, 2, 'e'), 'D': (3, 19, 's')}, '2f': {'D1': (1, 9, 'w'), 'D2': (35, 9, 'e')},
      'ice': {'U': (1, 12, 'w'), 'D': (23, 16, 'e')}, 'prison': {'U': (1, 7, 'w')}}
TOWER_DOORS = {'castle_a_watch': (6, 12), 'castle_a_bell': (30, 12)}   # 2 階の回廊の、南の壁の扉
YARD_DOOR = (26, 20)   # 1 階の、東の衛兵の間の南の壁の扉（中庭へ）


def make(*a, **k): return _make(*a, leg=LEG, floor_chars=FLOOR_ALL, **k)


def _carpet(g, xs, ys):
    for y in ys:
        for x in xs:
            if g[y][x] == 'F': g[y][x] = 'u'


def _f1():
    areas = {'entry': ('F', 14, 15, 22, 19), 'guard_w': ('F', 9, 15, 12, 19), 'guard_e': ('F', 24, 15, 27, 19), 'hall': ('F', 9, 11, 27, 13),
             'throne': ('F', 9, 1, 27, 9), 'library': ('F', 1, 1, 7, 9), 'dining': ('F', 1, 11, 7, 19), 'armoury': ('F', 29, 1, 35, 9), 'barracks': ('F', 29, 11, 35, 19)}
    doors = [(13, 17), (23, 17), (18, 14), (18, 10), (8, 5), (8, 12), (28, 5), (28, 12)]
    g = grid(37, 21, areas, doors, {'F': 'F'}, part=None)
    for y, ch in ((1, 'a'), (2, 'b'), (3, 'c')):   # 玉座の段（上が高い）と、その中央の絨毯
        for x in range(14, 23): g[y][x] = ch
        for x in (17, 18, 19): g[y][x] = {'a': 'A', 'b': 'B', 'c': 'C'}[ch]
    _carpet(g, (17, 18, 19), range(4, 10)); _carpet(g, (18,), (10,)); _carpet(g, (17, 18, 19), range(11, 14)); _carpet(g, (18,), (14,)); _carpet(g, (17, 18, 19), range(15, 20))
    put(g, {'2': [(18, 20)], 'd': [(26, 20)], 'N': [(9, 0), (27, 0), (31, 0), (33, 0), (0, 4), (0, 15), (36, 4), (36, 15), (16, 20), (20, 20), (10, 20), (3, 20), (32, 20)],
            'R': [(14, 0), (18, 0), (22, 0)], 'L': [(11, 0), (25, 0), (12, 10), (24, 10), (12, 14), (24, 14)]}, 'W')
    put(g, {'K': [(18, 6), (18, 12), (18, 17)], 'S': [(10, 1), (26, 1), (15, 15), (21, 15)], 'U': [(1, 2), (35, 2)], 'D': [(3, 19)]}, 'Fu')
    put(g, {'k': [(3, 1), (5, 1), (7, 1), (1, 6), (1, 8)], 'T': [(4, 5), (5, 15), (32, 14), (25, 16)], 'h': [(3, 5), (5, 5), (4, 15), (6, 15), (31, 14), (33, 14), (26, 16)],
            'p': [(2, 14), (6, 12)], 'z': [(2, 11)], 'Y': [(1, 19), (35, 12), (11, 18)], 'X': [(31, 4), (34, 4), (7, 17)], 'V': [(33, 18)],
            'Q': [(30, 1), (33, 1), (30, 8), (33, 8), (35, 6), (10, 16)], 'e': [(30, 18), (32, 18), (34, 18), (30, 16)]}, 'F')
    npcs = [('emperor_a', 18, 1), ('guard_heavy', 15, 5), ('guard_heavy', 21, 5), ('guard_heavy', 14, 12), ('guard_heavy', 22, 12), ('guard_heavy', 11, 17),
            ('guard_heavy', 25, 18), ('guard_heavy', 32, 16), ('guard_heavy', 32, 3), ('inn_cook', 3, 13), ('maid', 5, 17), ('servant_man', 4, 7), ('maid_head', 20, 17)]
    lk = {'U1': ('castle_a_2f', arrival(*ST['2f']['D1']), '階段を上る（2階の西へ）'), 'U2': ('castle_a_2f', arrival(*ST['2f']['D2']), '階段を上る（2階の東へ）'),
          'D': ('castle_a_icehouse', arrival(*ST['ice']['U']), '階段を下りる（氷室へ）')}
    m = make('castle_a', '帝王の城（キュラビッド帝国）', g, ST['1f'], npcs, lk, env=ENV, spawn=arrival(18, 20, 's'), mtype='open')
    m['links'][f'{YARD_DOOR[0]},{YARD_DOOR[1]}'] = {'nextMap': 'castle_a_yard', 'message': '中庭に出る', 'back': {'x': YARD_DOOR[0], 'z': YARD_DOOR[1] - 1, 'angle': 0}}
    return m


def _f2():
    areas = {'wend': ('F', 1, 1, 7, 5), 'bed': ('F', 9, 1, 17, 5), 'aud': ('F', 19, 1, 27, 5), 'study': ('F', 29, 1, 35, 5), 'gal': ('F', 1, 7, 35, 11)}
    g = grid(37, 13, areas, [(4, 6), (13, 6), (23, 6), (32, 6)], {'F': 'F'}, part=None)
    _carpet(g, range(2, 35), (9,))
    put(g, {'d': [(6, 12), (30, 12)], 'N': [(3, 12), (14, 12), (22, 12), (33, 12), (3, 0), (13, 0), (23, 0), (0, 9), (36, 9)],
            'R': [(10, 12), (18, 12), (26, 12)], 'L': [(8, 6), (28, 6), (18, 6)]}, 'W')
    put(g, {'K': [(9, 9), (18, 9), (27, 9)], 'D': [(1, 9), (35, 9)]}, 'Fu')
    put(g, {'S': [(4, 1)], 'e': [(10, 1), (12, 1)], 'k': [(30, 1), (32, 1), (34, 1)], 'T': [(23, 3), (31, 4), (5, 4)], 'h': [(22, 3), (24, 3), (30, 4), (32, 4)], 'X': [(16, 4)]}, 'F')
    npcs = [('maid_head', 14, 8), ('maid', 11, 3), ('butler', 31, 3), ('guard_heavy', 10, 8), ('guard_heavy', 26, 8), ('maid', 24, 8)]
    lk = {'D1': ('castle_a', arrival(*ST['1f']['U1']), '階段を下りる（1階へ）'), 'D2': ('castle_a', arrival(*ST['1f']['U2']), '階段を下りる（1階へ）')}
    m = make('castle_a_2f', '帝王の居室（帝王の城 2階）', g, ST['2f'], npcs, lk, env=ENV, spawn=arrival(*ST['2f']['D1']))
    for tid, (x, y) in TOWER_DOORS.items():
        m['links'][f'{x},{y}'] = {'nextMap': tid, 'message': '見張りの塔へ' if tid.endswith('watch') else '鐘楼へ', 'back': {'x': x, 'z': y - 1, 'angle': 0}}
    return m


def _tower(mid, name, furn, npcs):
    g = grid(11, 9, {'room': ('F', 1, 1, 9, 7)}, [], {'F': 'F'}, part=None)
    put(g, {'2': [(5, 8)], 'N': [(8, 0), (0, 3), (10, 3), (2, 8), (8, 8)], 'L': [(0, 6), (10, 6)]}, 'W')
    put(g, furn, 'F')
    return make(mid, name, g, {}, npcs, {}, env=ENV, spawn={'x': 5, 'z': 6, 'angle': 0})


def _yard():
    g = [['0'] * 25 for _ in range(19)]
    for x in range(25): g[0][x] = g[18][x] = 'W'
    for y in range(19): g[y][0] = g[y][24] = 'W'
    for x in range(1, 24): g[9][x] = 'y'
    for y in range(1, 18): g[y][12] = 'y'
    for x, y in ((6, 4), (7, 4), (8, 4), (6, 5), (7, 5), (8, 5), (16, 13), (17, 13), (18, 13), (16, 14), (17, 14), (18, 14)): g[y][x] = 'I'   # 凍った池
    put(g, {'2': [(12, 18)]}, 'W')
    put(g, {'O': [(12, 8)], 'o': [(2, 2), (22, 2), (2, 16), (22, 16), (5, 8), (19, 10), (9, 15), (15, 3)]}, '0y')
    return make('castle_a_yard', '中庭（帝王の城。雪の庭）', g, {}, [('guard_heavy', 10, 9), ('guard_heavy', 14, 9), ('servant_man', 20, 14)], {}, env=ENV_YARD,
                spawn={'x': 12, 'z': 16, 'angle': 0}, mtype='open')


def _icehouse():
    areas = {'i1': ('I', 1, 1, 11, 9), 'i2': ('I', 13, 1, 23, 9), 'corr': ('F', 1, 11, 23, 13), 'cellar': ('F', 1, 15, 23, 17)}
    g = grid(25, 19, areas, [(6, 10), (18, 10), (12, 14)], {'I': 'I', 'F': 'F'}, part=None)
    put(g, {'U': [(1, 12)], 'D': [(23, 16)]}, 'FI')
    put(g, {'Y': [(2, 1), (3, 1), (2, 2), (10, 1), (14, 1), (22, 8)], 'X': [(1, 8), (2, 8), (13, 8), (22, 1)], 'V': [(11, 5), (15, 5)]}, 'I')
    put(g, {'Y': [(3, 15), (5, 15), (9, 17), (15, 15), (19, 17)], 'X': [(7, 16), (13, 17), (21, 15)], 'V': [(17, 16)], 'L': [(6, 14), (18, 14), (12, 10)]}, 'FW')
    lk = {'U': ('castle_a', arrival(*ST['1f']['D']), '階段を上る（1階へ）'), 'D': ('castle_a_prison', arrival(*ST['prison']['U']), '階段を下りる（牢へ）')}
    return make('castle_a_icehouse', '氷室（帝王の城の地下）', g, ST['ice'], [('servant_man', 5, 5), ('guard_heavy', 12, 12), ('maid', 18, 16)], lk, env=ENV_COLD,
                spawn=arrival(*ST['ice']['U']))


def _prison():
    areas = {f'c{i}': ('I', 1 + 4 * i, 1, 3 + 4 * i, 4) for i in range(6)}
    areas.update({'corr': ('F', 1, 6, 23, 8), 'post': ('F', 1, 10, 11, 13), 'cold': ('I', 13, 10, 23, 13)})
    g = grid(25, 15, areas, [(6, 9), (18, 9)], {'I': 'I', 'F': 'F'}, part=None)
    put(g, {'G': [(2 + 4 * i, 5) for i in range(6)], 'L': [(4, 5), (12, 5), (20, 5), (12, 9), (0, 12)]}, 'W')
    put(g, {'U': [(1, 7)]}, 'F')
    put(g, {'s': [(2, 2), (6, 2), (10, 2), (14, 2), (18, 2), (22, 2)]}, 'I')
    put(g, {'T': [(4, 11)], 'h': [(3, 11), (5, 11)], 'Y': [(10, 13)], 'X': [(1, 13)]}, 'F')
    put(g, {'X': [(14, 13), (22, 10)], 'Y': [(22, 13), (14, 10)]}, 'I')
    npcs = [('gaoler', 7, 11), ('guard_heavy', 12, 7), ('prisoner_thief', 2, 3), ('prisoner_thug', 10, 3), ('prisoner_debtor', 18, 3), ('prisoner_noble', 22, 3)]
    lk = {'U': ('castle_a_icehouse', arrival(*ST['ice']['D']), '階段を上る（氷室へ）')}
    return make('castle_a_prison', '牢（帝王の城の地下 2階）', g, ST['prison'], npcs, lk, env=ENV_COLD, spawn=arrival(*ST['prison']['U']))


def build():
    """帝王の城（1 階 castle_a・2 階・塔 2・中庭・氷室・牢）のマップ（list）。先頭が castle_a"""
    watch = _tower('castle_a_watch', '見張りの塔（帝王の城）', {'Q': [(3, 1), (7, 1)], 'T': [(5, 4)], 'h': [(4, 4), (6, 4)], 'S': [(8, 6)]}, [('guard_heavy', 5, 2), ('guard_heavy', 2, 5)])
    bell = _tower('castle_a_bell', '鐘楼（帝王の城）', {'k': [(3, 1), (4, 1)], 'T': [(7, 4)], 'h': [(6, 4)], 'S': [(8, 1)]}, [('servant_man', 3, 5)])
    return finish([_f1(), _f2(), watch, bell, _yard(), _icehouse(), _prison()])
