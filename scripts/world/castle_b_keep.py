"""B（フランケル聖国）の王の城の中。設定: 神殿が事実上の城で、教皇が事実上の王。城は小さく狭い。王と王子は屑（無能・堕落）で、狭い王城の中でふんぞり返っている。実権は教会側にあり、司祭が王を見張る。衛兵は少ない（聖国の衛兵 guard_b）
  - 1 階 castle_b（31×15）: 狭い玉座の間（王・王子）・玄関・回廊。西に小礼拝室と衛兵詰所、東に会議室（司祭が見張る）と蔵
  - 2 階 castle_b_2f（31×11）: 王の私室（酒樽・酒場の台・寝台）と、王子の私室。間の廊下に、見張りの司祭
  - 地下 castle_b_cellar（25×13）: 王の酒蔵（酒樽がずらり）と、教会に逆らった者を入れる牢 3
  白亜の壁・大理石の床・青い天井の飾りは、聖国の見た目（街の外観・中の壁と同じ）。正体（デーモン）は、物語の終盤まで隠す前提なので、城の中にも、手がかりは置かない
  共通の道具は castle_kit.py
"""
from castle_kit import arrival, finish, grid, make as _make, put

LEG = {'W': 'white_wall', 'F': 'marble_floor', 'u': 'temple_carpet', 'a': 'dais_marble_3', 'b': 'dais_marble_2', 'c': 'dais_marble_1', 'A': 'dais_temple_rug_3',
       'B': 'dais_temple_rug_2', 'C': 'dais_temple_rug_1', 'L': 'wall_sconce_marble', 'R': 'wall_banner_temple', 'N': 'wall_window_curtain_marble',
       'U': 'stairs_marble_up', 'D': 'stairs_marble_down', '2': 'castle_exit', 'T': 'table_marble', 'h': 'chair_marble', 'e': 'bed_marble', 'k': 'bookshelf_marble',
       'X': 'crate_marble', 'V': 'sack_pile_marble', 'P': 'temple_pew', 'g': 'goddess_statue_small', 'Y': 'beer_keg', 'M': 'bar_counter', 'K': 'chandelier_temple_rug'}
LEG_CELLAR = {'W': 'brick_wall', 'F': 'brick_floor', 'U': 'stairs_stone_up', 'G': 'cell_door', 's': 'straw_bed', 'Y': 'beer_keg', 'X': 'crate_stone', 'V': 'sack_pile_stone',
              'L': 'wall_sconce', 'T': 'table_stone', 'h': 'chair_stone'}
ENV = {'floorType': 'stone', 'hasCeiling': True, 'footstep': 'stone', 'ceilingTexture': 'marbleWall', 'ambientLight': 16777215, 'directionalLight': 16773324,
       'fogColor': 15985881, 'fogNear': 24, 'fogFar': 70, 'visibility': 1.0, 'skyColor': 15985881}   # 大神殿（temple_b）と同じ、白い明かり
ENV_CELLAR = {'floorType': 'stone', 'hasCeiling': True, 'footstep': 'stone', 'ceilingTexture': 'brick', 'ambientLight': 7829367, 'directionalLight': 11184810,
              'fogColor': 1710618, 'fogNear': 8, 'fogFar': 34, 'visibility': 0.75, 'skyColor': 1710618}
FLOOR_ALL = '_=FabcABCu'
ST = {'1f': {'U': (7, 8, 'w'), 'D': (3, 13, 's')}, '2f': {'D': (15, 9, 's')}, 'cellar': {'U': (1, 6, 'w')}}


def make(*a, leg=LEG, **k): return _make(*a, leg=leg, floor_chars=FLOOR_ALL, **k)


def _carpet(g, xs, ys):
    for y in ys:
        for x in xs:
            if g[y][x] == 'F': g[y][x] = 'u'


def _f1():
    areas = {'throne': ('F', 7, 1, 23, 6), 'gal': ('F', 7, 8, 23, 9), 'entry': ('F', 13, 11, 17, 13), 'chapel': ('F', 1, 1, 5, 6), 'guard': ('F', 1, 8, 5, 13),
             'council': ('F', 25, 1, 29, 6), 'store': ('F', 25, 8, 29, 13)}
    g = grid(31, 15, areas, [(15, 7), (15, 10), (6, 3), (24, 3), (6, 9), (24, 9)], {'F': 'F'}, part=None)
    for y, ch in ((1, 'a'), (2, 'b'), (3, 'c')):
        for x in range(12, 19): g[y][x] = ch
        for x in (14, 15, 16): g[y][x] = {'a': 'A', 'b': 'B', 'c': 'C'}[ch]
    for ys in (range(4, 8), range(8, 10), range(10, 14)): _carpet(g, (14, 15, 16), ys)
    put(g, {'2': [(15, 14)], 'R': [(11, 0), (15, 0), (19, 0)], 'L': [(9, 0), (21, 0), (6, 5), (24, 5), (10, 7)],
            'N': [(3, 0), (27, 0), (0, 3), (30, 3), (0, 10), (30, 10), (3, 14), (27, 14), (9, 14), (21, 14)]}, 'W')
    put(g, {'K': [(15, 5), (15, 9), (15, 12)], 'U': [(7, 8)], 'D': [(3, 13)]}, 'Fu')
    put(g, {'g': [(3, 1)], 'P': [(2, 3), (4, 3), (2, 5), (4, 5)], 'T': [(3, 11), (27, 3)], 'h': [(2, 11), (4, 11), (26, 3), (28, 3)], 'k': [(29, 1), (26, 1)],
            'X': [(28, 9), (29, 9), (28, 12), (26, 12)], 'V': [(29, 11)]}, 'F')
    npcs = [('king_b', 14, 1), ('prince_b', 15, 1), ('guard_b', 12, 5), ('guard_b', 18, 5), ('guard_b', 2, 9), ('priest_man', 26, 5), ('priest_man', 28, 5),
            ('priest_woman', 3, 2), ('butler', 10, 9), ('maid', 20, 9)]
    lk = {'U': ('castle_b_2f', arrival(*ST['2f']['D']), '階段を上る（2階の私室へ）'), 'D': ('castle_b_cellar', arrival(*ST['cellar']['U']), '階段を下りる（酒蔵・牢へ）')}
    return make('castle_b', '王の城（フランケル聖国。狭い）', g, ST['1f'], npcs, lk, env=ENV, spawn=arrival(15, 14, 'n'), mtype='open')


def _f2():
    areas = {'king': ('F', 1, 1, 12, 9), 'cor': ('F', 14, 1, 16, 9), 'prince': ('F', 18, 1, 29, 9)}
    g = grid(31, 11, areas, [(13, 5), (17, 5)], {'F': 'F'}, part=None)
    _carpet(g, (15,), range(1, 10))
    put(g, {'N': [(6, 0), (24, 0), (0, 5), (30, 5), (6, 10), (24, 10)], 'L': [(13, 2), (17, 2), (13, 8), (17, 8)]}, 'W')
    put(g, {'D': [(15, 9)]}, 'Fu')
    put(g, {'e': [(2, 2), (4, 2), (28, 2)], 'M': [(8, 1)], 'Y': [(10, 1), (11, 1), (12, 3), (19, 1), (20, 1)], 'T': [(7, 6), (24, 6)], 'h': [(6, 6), (8, 6), (23, 6), (25, 6)],
            'k': [(1, 8), (26, 8)]}, 'F')
    npcs = [('maid', 6, 4), ('maid', 24, 4), ('maid_head', 22, 8), ('priest_man', 15, 6), ('butler', 10, 8)]
    lk = {'D': ('castle_b', arrival(*ST['1f']['U']), '階段を下りる（1階へ）')}
    return make('castle_b_2f', '王と王子の私室（王の城 2階）', g, ST['2f'], npcs, lk, env=ENV, spawn=arrival(*ST['2f']['D']))


def _cellar():
    areas = {'wine': ('F', 1, 1, 11, 11), 'cor': ('F', 13, 1, 15, 11), 'c1': ('F', 17, 1, 23, 3), 'c2': ('F', 17, 5, 23, 7), 'c3': ('F', 17, 9, 23, 11)}
    g = grid(25, 13, areas, [(12, 6)], {'F': 'F'}, part=None)
    put(g, {'G': [(16, 2), (16, 6), (16, 10)], 'L': [(12, 3), (12, 9), (12, 1)]}, 'W')
    put(g, {'U': [(1, 6)]}, 'F')
    put(g, {'Y': [(2, 1), (4, 1), (6, 1), (8, 1), (10, 1), (2, 10), (4, 10), (6, 10), (8, 10), (10, 10)], 'X': [(10, 6), (10, 5)], 'V': [(6, 5)], 's': [(22, 2), (22, 6), (22, 10)],
            'T': [(14, 9)], 'h': [(14, 10)]}, 'F')
    npcs = [('gaoler', 14, 6), ('priest_man', 14, 3), ('prisoner_noble', 18, 2), ('prisoner_debtor', 18, 6), ('prisoner_thief', 18, 10)]
    lk = {'U': ('castle_b', arrival(*ST['1f']['D']), '階段を上る（1階へ）')}
    return make('castle_b_cellar', '酒蔵と牢（王の城の地下）', g, ST['cellar'], npcs, lk, leg=LEG_CELLAR, env=ENV_CELLAR, spawn=arrival(*ST['cellar']['U']))


def build():
    """王の城（1 階 castle_b・2 階・地下）のマップ（list）。先頭が castle_b"""
    return finish([_f1(), _f2(), _cellar()])
