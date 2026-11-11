"""J（カラー魔導国）の魔導王の城の中。魔法の国の、魔導塔。紫がかった灰色の石の壁（街の外観と同じ）。
  - 1 階 castle_j（29×17）: 玄関 → 魔法陣の大ホール → 玉座の間（大魔導師・宰相）。西に見習いの部屋、東に宰相の間
  - 2 階 castle_j_2f（29×13）: 図書室（書架が並ぶ）／3 階 castle_j_3f（29×13）: 研究室 2（魔法陣・炉）
  - 4 階 castle_j_top（21×17）: 屋上の天文台（空が見える。大きな魔法陣）
  - 地下 castle_j_lab（25×17）: 実験場（魔法陣 3）→ さらに下に castle_j_prison（牢 4）
  設定: 好々爺の大魔導師（mage_archmage_j）・女性の宰相（mage_chancellor_j）・魔導士・研究者・見習い。共通の道具は castle_kit.py
"""
from castle_kit import arrival, finish, grid, make as _make, put

LEG = {'W': 'mage_wall', 'F': 'brick_floor', 'a': 'dais_stone_3', 'b': 'dais_stone_2', 'M': 'magic_circle', 'L': 'wall_sconce', 'N': 'wall_window_stone', 'k': 'bookshelf_stone',
       'T': 'table_stone', 'h': 'chair_stone', 'e': 'bed_stone', 'S': 'stove_stone', 'w': 'water_barrel_stone', 'X': 'crate_stone', 'Y': 'barrel_stone', 'U': 'stairs_stone_up',
       'D': 'stairs_stone_down', '2': 'castle_exit', 'G': 'cell_door', 's': 'straw_bed', 'f': 'cave_torch'}
ENV = {'floorType': 'stone', 'hasCeiling': True, 'footstep': 'stone', 'ceilingTexture': 'brick', 'ambientLight': 10522832, 'directionalLight': 13682943,
       'fogColor': 2762304, 'fogNear': 14, 'fogFar': 48, 'visibility': 0.9, 'skyColor': 2762304}
ENV_DEEP = dict(ENV, ambientLight=7829400, directionalLight=11184895, fogColor=1710640, fogNear=8, fogFar=34, visibility=0.75, skyColor=1710640)
ENV_SKY = {'floorType': 'stone', 'hasCeiling': False, 'ambientLight': 9475520, 'directionalLight': 13158655, 'fogColor': 3157600, 'fogNear': 14, 'fogFar': 50, 'visibility': 0.9,
           'skyColor': 3157600}   # 天文台: 夕暮れから夜の空
FLOOR_ALL = '_=FabM0'
ST = {'1f': {'U': (3, 9, 'w'), 'D': (11, 15, 'w')}, '2f': {'D': (1, 6, 'w'), 'U': (27, 6, 'e')}, '3f': {'D': (1, 9, 'w'), 'U': (27, 9, 'e')}, 'top': {'D': (1, 8, 'w')},
      'lab': {'U': (1, 8, 'w'), 'D': (23, 8, 'e')}, 'prison': {'U': (1, 6, 'w')}}


def make(*a, env=ENV, **k): return _make(*a, leg=LEG, floor_chars=FLOOR_ALL, env=env, **k)


def _stairs(floor, up_to=None, down_to=None, up_msg='', down_msg=''):
    """階の階段のリンク: up_to / down_to = (行き先 ID, 行き先の階の ST のキー, 行き先の階段の種類)"""
    lk = {}
    for kind, dest, msg in (('U', up_to, up_msg), ('D', down_to, down_msg)):
        if dest and kind in ST[floor]: lk[kind] = (dest[0], arrival(*ST[dest[1]][dest[2]]), msg)
    return lk


def _f1():
    areas = {'throne': ('F', 8, 1, 20, 6), 'hall': ('F', 3, 8, 25, 12), 'entry': ('F', 11, 14, 17, 15), 'app': ('F', 1, 1, 6, 6), 'chan': ('F', 22, 1, 27, 6)}
    g = grid(29, 17, areas, [(14, 7), (14, 13), (7, 4), (21, 4)], {'F': 'F'}, part=None)
    for y, ch in ((1, 'a'), (2, 'b')):
        for x in range(11, 18): g[y][x] = ch
    for y in (9, 10, 11):
        for x in (13, 14, 15): g[y][x] = 'M'
    put(g, {'2': [(14, 16)], 'L': [(9, 0), (19, 0), (7, 2), (21, 2), (12, 7), (16, 7)],
            'N': [(3, 0), (24, 0), (0, 3), (28, 3), (5, 13), (9, 13), (21, 13), (25, 13), (3, 16), (24, 16)]}, 'W')
    put(g, {'U': [(3, 9)], 'D': [(11, 15)]}, 'F')
    put(g, {'e': [(2, 2), (4, 2), (2, 5), (5, 5)], 'k': [(23, 1), (26, 1)], 'T': [(6, 11), (22, 11), (25, 4)], 'h': [(5, 11), (7, 11), (21, 11), (23, 11), (24, 4)]}, 'F')
    npcs = [('mage_archmage_j', 14, 1), ('mage_chancellor_j', 12, 2), ('guard_light', 10, 5), ('guard_light', 18, 5), ('adv_wizard', 7, 9), ('mage_researcher_woman', 22, 9),
            ('mage_researcher_man', 24, 10), ('mage_apprentice_girl', 3, 3), ('mage_apprentice_boy', 4, 4), ('guard_light', 14, 14)]
    lk = _stairs('1f', ('castle_j_2f', '2f', 'D'), ('castle_j_lab', 'lab', 'U'), '階段を上る（図書室へ）', '階段を下りる（実験場へ）')
    return make('castle_j', '魔導王の城（カラー魔導国。魔導塔）', g, ST['1f'], npcs, lk, spawn=arrival(14, 16, 'n'), mtype='open')


def _library():
    g = grid(29, 13, {'lib': ('F', 1, 1, 27, 11)}, [], {'F': 'F'}, part=None)
    put(g, {'N': [(6, 0), (14, 0), (22, 0), (6, 12), (14, 12), (22, 12)], 'L': [(0, 3), (28, 3), (0, 9), (28, 9)]}, 'W')
    put(g, {'D': [(1, 6)], 'U': [(27, 6)]}, 'F')
    shelves = [(x, y) for y in (2, 4, 8, 10) for x in (4, 8, 12, 16, 20, 24)]
    put(g, {'k': shelves, 'T': [(14, 6), (6, 6), (22, 6)], 'h': [(13, 6), (15, 6), (5, 6), (7, 6), (21, 6), (23, 6)]}, 'F')
    npcs = [('mage_researcher_man', 10, 6), ('mage_researcher_woman', 18, 6), ('mage_apprentice_boy', 5, 8), ('mage_apprentice_girl', 23, 3)]
    lk = _stairs('2f', ('castle_j_3f', '3f', 'D'), ('castle_j', '1f', 'U'), '階段を上る（研究室へ）', '階段を下りる（1階へ）')
    return make('castle_j_2f', '図書室（魔導王の城 2階）', g, ST['2f'], npcs, lk, spawn=arrival(*ST['2f']['D']))


def _labs():
    areas = {'lab1': ('F', 1, 1, 13, 5), 'lab2': ('F', 15, 1, 27, 5), 'cor': ('F', 1, 7, 27, 11)}
    g = grid(29, 13, areas, [(7, 6), (21, 6)], {'F': 'F'}, part=None)
    for y in (2, 3, 4):
        for x in (20, 21, 22): g[y][x] = 'M'
    put(g, {'N': [(7, 0), (21, 0), (6, 12), (14, 12), (22, 12), (0, 9), (28, 9)], 'L': [(14, 3), (14, 6), (4, 6), (24, 6)]}, 'W')
    put(g, {'D': [(1, 9)], 'U': [(27, 9)]}, 'F')
    put(g, {'T': [(4, 3), (10, 3), (17, 3), (25, 3)], 'h': [(4, 4), (10, 4), (17, 4), (25, 4)], 'S': [(7, 1)], 'w': [(12, 5), (2, 5)], 'X': [(1, 1), (27, 1)], 'Y': [(13, 1)]}, 'F')
    npcs = [('mage_researcher_man', 8, 4), ('mage_researcher_woman', 21, 5), ('mage_apprentice_boy', 12, 9), ('adv_mage', 18, 9), ('mage_apprentice_girl', 3, 9)]
    lk = _stairs('3f', ('castle_j_top', 'top', 'D'), ('castle_j_2f', '2f', 'U'), '階段を上る（屋上の天文台へ）', '階段を下りる（図書室へ）')
    return make('castle_j_3f', '研究室（魔導王の城 3階）', g, ST['3f'], npcs, lk, spawn=arrival(*ST['3f']['D']))


def _top():
    g = [['0'] * 21 for _ in range(17)]
    for x in range(21): g[0][x] = g[16][x] = 'W'
    for y in range(17): g[y][0] = g[y][20] = 'W'
    for y in range(6, 11):
        for x in range(8, 13): g[y][x] = 'M'
    put(g, {'D': [(1, 8)], 'T': [(3, 3), (17, 3), (3, 13), (17, 13)], 'h': [(4, 3), (16, 3), (4, 13), (16, 13)], 'k': [(10, 1), (10, 15)], 'f': [(2, 1), (18, 1), (2, 15), (18, 15)]}, '0')
    lk = _stairs('top', None, ('castle_j_3f', '3f', 'U'), '', '階段を下りる（研究室へ）')
    return make('castle_j_top', '天文台（魔導王の城の屋上）', g, ST['top'], [('adv_wizard', 12, 4), ('mage_apprentice_girl', 6, 11), ('mage_researcher_man', 15, 11)], lk,
                env=ENV_SKY, spawn=arrival(*ST['top']['D']), mtype='open')


def _lab():
    g = grid(25, 17, {'lab': ('F', 1, 1, 23, 15)}, [], {'F': 'F'}, part=None)
    for cx, cy in ((5, 4), (12, 11), (19, 4)):
        for y in (cy - 1, cy, cy + 1):
            for x in (cx - 1, cx, cx + 1): g[y][x] = 'M'
    put(g, {'L': [(0, 4), (0, 12), (24, 4), (24, 12), (12, 0), (12, 16)]}, 'W')
    put(g, {'U': [(1, 8)], 'D': [(23, 8)]}, 'F')
    put(g, {'T': [(5, 8), (19, 8), (9, 13)], 'h': [(4, 8), (6, 8), (18, 8), (20, 8), (10, 13)], 'X': [(2, 14), (22, 14)], 'Y': [(2, 2), (22, 2)], 'w': [(12, 2)], 'S': [(4, 14)]}, 'F')
    npcs = [('mage_researcher_woman', 8, 4), ('mage_researcher_man', 16, 11), ('mage_apprentice_boy', 12, 7), ('adv_wizard', 21, 6)]
    lk = {'U': ('castle_j', arrival(*ST['1f']['D']), '階段を上る（1階へ）'), 'D': ('castle_j_prison', arrival(*ST['prison']['U']), '階段を下りる（牢へ）')}
    return make('castle_j_lab', '実験場（魔導王の城の地下）', g, ST['lab'], npcs, lk, env=ENV_DEEP, spawn=arrival(*ST['lab']['U']))


def _prison():
    areas = {f'c{i}': ('F', 1 + 5 * i, 1, 4 + 5 * i, 3) for i in range(4)}
    areas.update({'cor': ('F', 1, 5, 22, 7), 'post': ('F', 1, 9, 8, 11)})
    g = grid(24, 13, areas, [(4, 8)], {'F': 'F'}, part=None)
    put(g, {'G': [(2 + 5 * i, 4) for i in range(4)], 'L': [(4, 4), (9, 4), (14, 4), (19, 4)]}, 'W')
    put(g, {'U': [(1, 6)]}, 'F')
    put(g, {'s': [(2, 2), (7, 2), (12, 2), (17, 2)], 'T': [(4, 10)], 'h': [(3, 10), (5, 10)]}, 'F')
    lk = {'U': ('castle_j_lab', arrival(*ST['lab']['D']), '階段を上る（実験場へ）')}
    return make('castle_j_prison', '牢（魔導王の城の地下 2階）', g, ST['prison'], [('gaoler', 6, 10), ('prisoner_thief', 2, 3), ('prisoner_debtor', 12, 3), ('prisoner_thug', 17, 3), ('guard_light', 12, 6)], lk,
                env=ENV_DEEP, spawn=arrival(*ST['prison']['U']))


def build():
    """魔導王の城（1 階 castle_j・図書室・研究室・天文台・実験場・牢）のマップ（list）。先頭が castle_j"""
    return finish([_f1(), _library(), _labs(), _top(), _lab(), _prison()])
