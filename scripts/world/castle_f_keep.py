"""F（ライアン獣王国）の獣王の城の中。獣人とドワーフの国。岩山をくり抜いた城（岩の壁・灰色の石の床・岩の天井）。
  - 1 階 castle_f（35×17）: 洞窟の玄関ホール → 大広間（獣王・宰相・獣人の貴族 8。フェンリル像）。西に兵舎（コボルトの兵）、東にドワーフの鍛冶場（鍛冶王）。玄関の左右に、獣人の住まいと、ドワーフの住まい
  - 2 階 castle_f_2f（35×11）: 長い廊下に、獣王の私室（大きな藁の寝床）・宰相の書斎・客室 2
  - 坑道 castle_f_mine（29×15）: 鉱山とつながる坑道（トロッコ・松明・鉱石の箱）。4 つの広間を、坑道がつなぐ
  - 闘技場 castle_f_arena（25×19）: 坑道のさらに下。砂の闘技場と、見物の回廊
  設定: 獣王（lion_king）・宰相（fox_chancellor）・獣人の貴族 8（城の中だけ）・鍛冶王（dwarf_king）。兵士はコボルト（sdServer 11）。共通の道具は castle_kit.py
"""
from castle_kit import arrival, finish, grid, make as _make, put

LEG = {'W': 'rock_wall', 'F': 'tower_stone_gray', 'u': 'castle_rug', 'a': 'dais_stone_3', 'b': 'dais_stone_2', 'c': 'dais_stone_1', 'A': 'dais_rug_3', 'B': 'dais_rug_2',
       'C': 'dais_rug_1', 'Z': 'fenrir_statue', 'L': 'wall_sconce', 'R': 'wall_banner_red', 'k': 'bookshelf_stone', 'e': 'bed_stone', 's': 'straw_bed', 'n': 'anvil_stone',
       'S': 'hearth_stone', 'Q': 'weapon_rack_stone', 'X': 'crate_stone', 'Y': 'barrel_stone', 'T': 'table_stone', 'h': 'chair_stone', 'U': 'stairs_stone_up',
       'D': 'stairs_stone_down', '2': 'castle_exit', 'm': 'mine_cart', 'f': 'cave_torch', 'K': 'chandelier_castle_rug', 'd': 'training_dummy_stone', 'q': 'sand_tile'}
ENV = {'floorType': 'stone', 'hasCeiling': True, 'footstep': 'stone', 'ceilingTexture': 'rock', 'ambientLight': 10096512, 'directionalLight': 13615264,
       'fogColor': 2761760, 'fogNear': 14, 'fogFar': 48, 'visibility': 0.9, 'skyColor': 2761760}
ENV_DEEP = dict(ENV, ambientLight=7829367, directionalLight=11184810, fogColor=1710618, fogNear=10, fogFar=40, visibility=0.8, skyColor=1710618)   # 坑道・闘技場: 暗め
FLOOR_ALL = '_=FabcABCuq'
ST = {'1f': {'U': (1, 12, 'w'), 'D': (33, 14, 'e')}, '2f': {'D': (1, 2, 'w')}, 'mine': {'U': (1, 3, 'w'), 'D': (27, 13, 'e')}, 'arena': {'U': (23, 17, 'e')}}


def make(*a, env=ENV, **k): return _make(*a, leg=LEG, floor_chars=FLOOR_ALL, env=env, **k)


def _carpet(g, xs, ys):
    for y in ys:
        for x in xs:
            if g[y][x] == 'F': g[y][x] = 'u'


def _f1():
    areas = {'barracks': ('F', 1, 1, 7, 9), 'great': ('F', 9, 1, 25, 9), 'forge': ('F', 27, 1, 33, 9), 'west': ('F', 1, 11, 11, 15), 'entry': ('F', 13, 11, 21, 15),
             'east': ('F', 23, 11, 33, 15)}
    g = grid(35, 17, areas, [(8, 5), (26, 5), (17, 10), (12, 13), (22, 13)], {'F': 'F'}, part=None)
    for y, ch in ((1, 'a'), (2, 'b'), (3, 'c')):
        for x in range(14, 21): g[y][x] = ch
        for x in (16, 17, 18): g[y][x] = {'a': 'A', 'b': 'B', 'c': 'C'}[ch]
    _carpet(g, (16, 17, 18), list(range(4, 10)) + list(range(11, 16))); _carpet(g, (17,), (10,))
    put(g, {'2': [(17, 16)], 'R': [(12, 0), (17, 0), (22, 0)], 'L': [(10, 0), (24, 0), (8, 3), (26, 3), (12, 10), (22, 10)]}, 'W')
    put(g, {'K': [(17, 4), (17, 9), (17, 13)], 'U': [(1, 12)], 'D': [(33, 14)], 'Z': [(17, 6)]}, 'Fu')
    put(g, {'s': [(2, 2), (6, 2), (2, 7), (6, 7)], 'Q': [(4, 1), (28, 1), (32, 1)], 'T': [(4, 5), (6, 13), (28, 13)], 'h': [(3, 5), (5, 5), (5, 13), (7, 13), (27, 13), (29, 13)],
            'n': [(30, 4)], 'S': [(30, 1)], 'X': [(28, 8), (33, 8), (3, 14), (10, 14), (31, 12)], 'Y': [(28, 6), (10, 12), (24, 12), (25, 12)], 'f': [(10, 9), (24, 9), (14, 15), (20, 15)]}, 'F')
    npcs = [('lion_king', 17, 1), ('fox_chancellor', 15, 2), ('beast_soldier_kobold_gate', 15, 6), ('beast_soldier_kobold_gate', 19, 6), ('beast_soldier_kobold', 3, 8),
            ('beast_soldier_kobold', 5, 3), ('beast_f_a', 4, 13), ('dwarf_king', 29, 5), ('dwarf_man', 26, 14), ('dwarf_woman', 30, 13),
            ('cat_noble_man', 11, 3), ('cat_noble_woman', 11, 5), ('rabbit_noble_man', 23, 3), ('rabbit_noble_woman', 23, 5),
            ('dog_noble_man', 11, 8), ('dog_noble_woman', 13, 8), ('gorilla_noble_man', 21, 8), ('gorilla_noble_woman', 23, 8)]
    lk = {'U': ('castle_f_2f', arrival(*ST['2f']['D']), '階段を上る（2階へ）'), 'D': ('castle_f_mine', arrival(*ST['mine']['U']), '階段を下りる（坑道へ）')}
    return make('castle_f', '獣王の城（ライアン獣王国）', g, ST['1f'], npcs, lk, spawn=arrival(17, 16, 'n'), mtype='open')


def _f2():
    areas = {'cor': ('F', 1, 1, 33, 3), 'king': ('F', 1, 5, 13, 9), 'chan': ('F', 15, 5, 21, 9), 'g1': ('F', 23, 5, 27, 9), 'g2': ('F', 29, 5, 33, 9)}
    g = grid(35, 11, areas, [(7, 4), (18, 4), (25, 4), (31, 4)], {'F': 'F'}, part=None)
    _carpet(g, range(2, 33), (2,))
    put(g, {'L': [(14, 7), (22, 7), (28, 7), (10, 4), (20, 4)]}, 'W')
    put(g, {'K': [(9, 2), (17, 2), (25, 2)], 'D': [(1, 2)]}, 'Fu')
    put(g, {'s': [(2, 6), (4, 6), (6, 6)], 'T': [(10, 7), (18, 8)], 'h': [(9, 7), (11, 7), (17, 8), (19, 8)], 'Q': [(12, 5)], 'k': [(15, 6), (15, 8), (21, 6), (21, 8)],
            'e': [(24, 6), (26, 6), (30, 6), (32, 6)]}, 'F')
    lk = {'D': ('castle_f', arrival(*ST['1f']['U']), '階段を下りる（1階へ）')}
    return make('castle_f_2f', '獣王の私室・客室（獣王の城 2階）', g, ST['2f'], [('dwarf_woman', 10, 2), ('beast_c', 22, 2), ('beast_soldier_kobold', 20, 2)], lk, spawn=arrival(*ST['2f']['D']))


def _mine():
    areas = {'a': ('F', 1, 1, 11, 5), 'c1': ('F', 12, 3, 16, 3), 'b': ('F', 17, 1, 27, 5), 'v1': ('F', 6, 6, 6, 8), 'v2': ('F', 22, 6, 22, 8), 'c': ('F', 1, 9, 11, 13),
             'c2': ('F', 12, 11, 16, 11), 'd': ('F', 17, 9, 27, 13)}
    g = grid(29, 15, areas, [], {'F': 'F'}, part=None)
    put(g, {'U': [(1, 3)], 'D': [(27, 13)], 'm': [(3, 2), (20, 12), (8, 12), (24, 2)], 'f': [(2, 1), (10, 1), (18, 1), (26, 1), (2, 13), (10, 13), (18, 13)],
            'X': [(10, 4), (3, 10), (26, 4), (19, 10)], 'Y': [(9, 10), (25, 10)], 'Q': [(11, 12)]}, 'F')
    npcs = [('dwarf_man', 4, 3), ('dwarf_man', 20, 3), ('dwarf_woman', 14, 3), ('beast_a', 5, 11), ('beast_soldier_kobold', 14, 11), ('dwarf_man', 22, 11)]
    lk = {'U': ('castle_f', arrival(*ST['1f']['D']), '階段を上る（1階へ）'), 'D': ('castle_f_arena', arrival(*ST['arena']['U']), '階段を下りる（闘技場へ）')}
    return make('castle_f_mine', '坑道（獣王の城の地下）', g, ST['mine'], npcs, lk, env=ENV_DEEP, spawn=arrival(*ST['mine']['U']))


def _arena():
    g = grid(25, 19, {'ring': ('F', 1, 1, 23, 17)}, [], {'F': 'F'}, part=None)
    for y in range(3, 16):
        for x in range(3, 22): g[y][x] = 'q'
    put(g, {'d': [(7, 6), (17, 6), (7, 12), (17, 12)], 'Q': [(4, 1), (20, 1)], 'f': [(2, 1), (22, 1), (2, 17), (22, 17), (12, 1)]}, 'Fq')
    put(g, {'U': [(23, 17)]}, 'F')
    npcs = [('beast_a', 4, 2), ('beast_b', 9, 1), ('beast_c', 15, 2), ('beast_d', 20, 2), ('beast_f_b', 3, 16), ('beast_f_c', 21, 16), ('beast_soldier_kobold', 11, 9), ('beast_soldier_kobold', 13, 9)]
    lk = {'U': ('castle_f_mine', arrival(*ST['mine']['D']), '階段を上る（坑道へ）')}
    return make('castle_f_arena', '闘技場（獣王の城の地下 2階）', g, ST['arena'], npcs, lk, env=ENV_DEEP, spawn=arrival(*ST['arena']['U']))


def build():
    """獣王の城（1 階 castle_f・2 階・坑道・闘技場）のマップ（list）。先頭が castle_f"""
    return finish([_f1(), _f2(), _mine(), _arena()])
