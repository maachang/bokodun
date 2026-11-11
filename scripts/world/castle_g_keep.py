"""G（デイラミ精霊国）の女王の城の中。エルフと精霊の国。世界樹の中の城（木の壁・生け垣の仕切り・木の床）。争いを好まない国なので、牢はない。
  - 1 階 castle_g（31×19）: 根元の玄関ホール → 謁見の間（女王・宰相）。西に薬草室、東に宰相の間、玄関の左右に守備隊の間と長老の間
  - 2 階 castle_g_2f（31×13）: 樹上の回廊に、書庫・茶の間・客室
  - 梢の庭 castle_g_crown（25×19。空の見える、世界樹のてっぺんの庭）
  - 根の洞窟 castle_g_roots（25×15。地下。精霊の魔法陣がある、世界樹の根の間）
  設定: ハイエルフの女王（elf_queen）・宰相（elf_chancellor）・守備隊（ウッドゴーレム）。女王・宰相は、城の中の屋内だけ（梢の庭には出さない）。共通の道具は castle_kit.py
"""
from castle_kit import arrival, finish, grid, make as _make, put

LEG = {'W': 'wooden_wall', 'H': 'forest_hedge_wall', 'F': 'wood_floor', 'a': 'dais_wood_3', 'b': 'dais_wood_2', 'c': 'dais_wood_1', 'T': 'table', 'h': 'chair', 'k': 'bookshelf',
       'e': 'bed', 'v': 'flower_bed', 'N': 'wall_window_wood', 'L': 'wall_sconce_wood', 'U': 'stairs_wood_up', 'D': 'stairs_wood_down', '2': 'castle_exit',
       'y': 'plaza_forest', 'Z': 'world_tree', 'r': 'fern', 'o': 'bush_flower', 'l': 'lavender_flower', 'p': 'path_flower', 'g': 'conifer_tree_a', 'M': 'magic_circle', 'R': 'rock_wall',
       'f': 'cave_torch', 'X': 'crate'}
ENV = {'floorType': 'forest', 'hasCeiling': True, 'footstep': 'stone', 'ceilingTexture': 'woodWall', 'ambientLight': 12648384, 'directionalLight': 16777184, 'fogColor': 8438656, 'fogNear': 18,
       'fogFar': 60, 'visibility': 0.9, 'skyColor': 8438656}
ENV_SKY = {'floorType': 'forest', 'hasCeiling': False, 'ambientLight': 14742480, 'directionalLight': 16777184, 'fogColor': 11591648, 'fogNear': 24, 'fogFar': 80, 'visibility': 0.9,
           'skyColor': 11591648}   # 梢の庭: 空が見える
ENV_ROOT = dict(ENV, ceilingTexture='rock', ambientLight=6591840, directionalLight=9742474, fogColor=1714720, fogNear=10, fogFar=40, visibility=0.75, skyColor=1714720)   # 根の洞窟
FLOOR_ALL = '_=Fabcy0M'
ST = {'1f': {'U': (11, 17, 's'), 'D': (1, 16, 'w')}, '2f': {'D': (1, 9, 'w'), 'U': (29, 9, 'e')}, 'crown': {'D': (1, 17, 'w')}, 'roots': {'U': (1, 7, 'w')}}


def make(*a, env=ENV, **k): return _make(*a, leg=LEG, floor_chars=FLOOR_ALL, env=env, **k)


def _f1():
    areas = {'throne': ('F', 7, 1, 23, 8), 'herb': ('F', 1, 1, 5, 8), 'chan': ('F', 25, 1, 29, 8), 'root': ('F', 11, 10, 19, 17), 'guard': ('F', 1, 10, 9, 17), 'elder': ('F', 21, 10, 29, 17)}
    g = grid(31, 19, areas, [(6, 4), (24, 4), (15, 9), (10, 13), (20, 13)], {'F': 'F'}, part='H')
    for y, ch in ((1, 'a'), (2, 'b'), (3, 'c')):
        for x in range(12, 19): g[y][x] = ch
    put(g, {'2': [(15, 18)], 'N': [(3, 0), (10, 0), (20, 0), (27, 0), (0, 4), (30, 4), (0, 14), (30, 14), (4, 18), (26, 18)], 'L': [(8, 0), (22, 0), (14, 9), (16, 9)]}, 'WH')
    put(g, {'U': [(11, 17)], 'D': [(1, 16)]}, 'F')
    put(g, {'v': [(2, 2), (4, 2), (2, 6), (4, 6)], 'T': [(27, 4), (5, 13), (25, 13)], 'h': [(26, 4), (28, 4), (4, 13), (6, 13), (24, 13), (26, 13)], 'k': [(26, 7), (28, 7)],
            'e': [(3, 11), (7, 11)]}, 'F')
    npcs = [('elf_queen', 15, 1), ('elf_chancellor', 13, 2), ('elf_soldier_golem', 13, 6), ('elf_soldier_golem', 17, 6), ('elf_soldier_golem', 12, 12), ('elf_soldier_golem', 18, 12),
            ('elf_man_c', 3, 4), ('elf_woman_b', 26, 6), ('elf_guard_man', 4, 15), ('elf_guard_woman', 7, 15), ('elf_woman_a', 24, 15), ('elf_man_a', 28, 12)]
    lk = {'U': ('castle_g_2f', arrival(*ST['2f']['D']), '階段を上る（樹上の回廊へ）'), 'D': ('castle_g_roots', arrival(*ST['roots']['U']), '階段を下りる（根の洞窟へ）')}
    return make('castle_g', '女王の城（デイラミ精霊国。世界樹の中）', g, ST['1f'], npcs, lk, spawn=arrival(15, 18, 'n'), mtype='open')


def _f2():
    areas = {'lib': ('F', 1, 1, 9, 5), 'tea': ('F', 11, 1, 19, 5), 'guest': ('F', 21, 1, 29, 5), 'gal': ('F', 1, 7, 29, 11)}
    g = grid(31, 13, areas, [(5, 6), (15, 6), (25, 6)], {'F': 'F'}, part='H')
    put(g, {'N': [(3, 12), (9, 12), (15, 12), (21, 12), (27, 12), (0, 9), (30, 9), (5, 0), (15, 0), (25, 0)], 'L': [(10, 6), (20, 6)]}, 'WH')
    put(g, {'D': [(1, 9)], 'U': [(29, 9)]}, 'F')
    put(g, {'k': [(2, 1), (4, 1), (6, 1), (8, 1)], 'T': [(15, 3), (5, 4)], 'h': [(14, 3), (16, 3), (4, 4), (6, 4)], 'e': [(22, 2), (24, 2), (26, 2), (28, 2)], 'v': [(12, 2), (18, 4)]}, 'F')
    lk = {'D': ('castle_g', arrival(*ST['1f']['U']), '階段を下りる（1階へ）'), 'U': ('castle_g_crown', arrival(*ST['crown']['D']), '階段を上る（梢の庭へ）')}
    return make('castle_g_2f', '樹上の回廊（女王の城 2階）', g, ST['2f'], [('elf_woman_c', 6, 3), ('elf_man_b', 10, 9), ('elf_girl', 20, 8), ('elf_boy', 22, 9)], lk, spawn=arrival(*ST['2f']['D']))


def _crown():
    g = [['0'] * 25 for _ in range(19)]
    for x in range(25): g[0][x] = g[18][x] = 'H'
    for y in range(19): g[y][0] = g[y][24] = 'H'
    for x in range(1, 24): g[9][x] = 'y'
    for y in range(1, 18): g[y][12] = 'y'
    put(g, {'Z': [(12, 9)]}, 'y')
    put(g, {'D': [(1, 17)]}, '0')
    put(g, {'g': [(3, 3), (21, 3), (3, 15), (21, 14), (8, 12)], 'r': [(5, 7), (19, 7), (8, 16), (16, 16)], 'o': [(6, 11), (18, 11), (14, 3), (10, 3)], 'l': [(4, 7), (20, 12), (15, 15)],
            'p': [(8, 5), (16, 5), (10, 13), (14, 13)]}, '0')
    lk = {'D': ('castle_g_2f', arrival(*ST['2f']['U']), '階段を下りる（樹上の回廊へ）')}
    return make('castle_g_crown', '梢の庭（女王の城。世界樹のてっぺん）', g, ST['crown'], [('elf_girl', 6, 9), ('elf_boy', 18, 9), ('elf_woman_c', 14, 12)], lk, env=ENV_SKY, spawn=arrival(*ST['crown']['D']), mtype='open')


def _roots():
    areas = {'a': ('y', 1, 1, 9, 13), 'c': ('y', 10, 6, 12, 8), 'b': ('y', 13, 1, 23, 13)}
    g = grid(25, 15, areas, [], {'y': 'y'}, wall='R', part=None)
    for y in (6, 7, 8):
        for x in (17, 18, 19): g[y][x] = 'M'
    put(g, {'U': [(1, 7)]}, 'y')
    put(g, {'f': [(2, 1), (8, 1), (14, 1), (22, 1), (2, 13), (8, 13), (14, 13), (22, 13)], 'v': [(5, 3), (5, 11)], 'X': [(21, 11), (15, 11)]}, 'y')
    lk = {'U': ('castle_g', arrival(*ST['1f']['D']), '階段を上る（1階へ）')}
    return make('castle_g_roots', '根の洞窟（女王の城の地下。精霊の魔法陣）', g, ST['roots'], [('elf_man_a', 8, 5), ('elf_woman_a', 20, 4)], lk, env=ENV_ROOT, spawn=arrival(*ST['roots']['U']))


def build():
    """女王の城（1 階 castle_g・2 階・梢の庭・根の洞窟）のマップ（list）。先頭が castle_g"""
    return finish([_f1(), _f2(), _crown(), _roots()])
