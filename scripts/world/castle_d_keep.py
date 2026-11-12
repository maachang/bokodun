"""D（王城）の 2〜4 階を作る（castle_2f・castle_3f・castle_4f）。1 階（castle）・来賓棟（castle_guest_wing）との階段・扉の位置と、
出現位置・環境（明かり）・links は、今のファイルのものをそのまま引き継ぐ（階段の降り立つマスが変わらない）。
  - 2 階 政務の階: 西に書記局（机の列）と文書庫（書架の列）、中央に議事の間（長机と 3 段の壇）、東に財務院（カウンター）と休憩室
  - 3 階 貴族と学問の階: 北に貴族の執務室 3 と応接室（暖炉）、南に写本室・大図書館（書架と閲覧席）・禁書庫（衛兵）
  - 4 階 王の居住区: 西に王の書斎・浴室と更衣・寝室、中央に回廊（北に接見の間・祈祷室、南に王妃の居間・寝室）、東に控えの間（階段）・侍従・使用人の間
実行: python3 scripts/world/castle_d_keep.py
"""
import json
import os
from castle_kit import MAPS, check_walk, put

W, H = 39, 18
LEG = {'W': 'brick_wall', 'd': 'wooden_door', 'u': 'castle_rug', 'k': 'bookshelf_stone', 't': 'table_stone', 'h': 'chair_stone', 'g': 'cupboard_stone', 's': 'hearth_stone',
       'e': 'bed_stone', 'K': 'chandelier_castle_rug', 'L': 'wall_sconce', 'R': 'wall_banner_red', 'S': 'stairs_stone_down', 'U': 'stairs_stone_up', 'n': 'wall_window_stone',
       'N': 'counter_stone', 'q': 'crate_stone', 'o': 'barrel_stone', 'B': 'bathtub_stone', 'V': 'wash_stand_stone', 'c': 'garderobe_stone', 'p': 'goddess_statue_small',
       'x': 'dais_stone_3', 'y': 'dais_stone_2', 'z': 'dais_stone_1', 'X': 'dais_rug_3', 'Y': 'dais_rug_2', 'Z': 'dais_rug_1', 'w': 'water_barrel_stone'}
FLOOR = '0uxyzXYZ'   # 人・物を置ける床（絨毯の部屋は u、壇は x〜Z）


def blank():
    return [['W'] * W for _ in range(H)]


def room(g, x0, y0, x1, y1, ch='u'):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1): g[y][x] = ch


def line(g, ch, pts, was=FLOOR):
    put(g, {ch: pts}, was)


def row(x0, x1, y): return [(x, y) for x in range(x0, x1 + 1)]


def col(x, y0, y1): return [(x, y) for y in range(y0, y1 + 1)]


def doors(g, pts): put(g, {'d': pts}, 'W')


def walls(g, ch, pts): put(g, {ch: pts}, 'W')


def f2():
    g = blank()
    room(g, 1, 7, 12, 9); room(g, 26, 7, 37, 9)                  # 西・東の広間
    room(g, 14, 1, 24, 16)                                        # 議事の間
    room(g, 1, 1, 12, 5, '0'); room(g, 1, 11, 12, 16, '0')       # 書記局・文書庫
    room(g, 26, 1, 37, 5, '0'); room(g, 26, 11, 37, 16, '0')     # 財務院・休憩室
    doors(g, [(4, 6), (9, 6), (4, 10), (9, 10), (13, 8), (25, 8), (29, 6), (34, 6), (29, 10), (34, 10)])
    line(g, 'U', [(1, 8)], 'u'); line(g, 'S', [(37, 8)], 'u')
    # 議事の間: 北に壇、中央に長机と椅子の輪
    for y, ch, mid in ((1, 'x', 'X'), (2, 'y', 'Y'), (3, 'z', 'Z')):
        room(g, 16, y, 22, y, ch); g[y][19] = mid
    room(g, 17, 7, 21, 10, 't')
    line(g, 'h', row(17, 21, 6) + row(17, 21, 11) + col(16, 7, 10) + col(22, 7, 10))
    line(g, 'K', [(15, 4), (23, 4), (19, 13), (19, 15)])
    # 書記局: 北に書架、机の列
    line(g, 'k', row(2, 11, 1))
    line(g, 't', [(3, 3), (6, 3), (9, 3)]); line(g, 'h', [(3, 4), (6, 4), (9, 4)])
    # 文書庫: 書架の列
    line(g, 'k', [(x, y) for x in (2, 5, 8, 11) for y in range(12, 16)])
    # 財務院: カウンターと金庫（木箱・樽）・戸棚
    line(g, 'N', row(29, 34, 3)); line(g, 'g', [(30, 1), (32, 1), (34, 1)]); line(g, 'q', [(27, 1), (36, 1), (37, 2)]); line(g, 'o', [(27, 5)])
    # 休憩室: 暖炉と机・水樽
    line(g, 's', [(31, 16)]); line(g, 't', [(28, 13), (34, 13)]); line(g, 'h', [(27, 13), (29, 13), (33, 13), (35, 13)]); line(g, 'w', [(37, 11)]); line(g, 'g', [(26, 16), (36, 16)])
    # 広間の飾り
    line(g, 'K', [(6, 8), (32, 8)])
    walls(g, 'L', [(2, 6), (7, 6), (11, 6), (2, 10), (7, 10), (11, 10), (28, 6), (32, 6), (36, 6), (28, 10), (32, 10), (36, 10), (13, 3), (13, 13), (25, 3), (25, 13)])
    walls(g, 'R', [(15, 0), (23, 0), (19, 0)])
    walls(g, 'n', [(3, 0), (8, 0), (11, 0), (28, 0), (33, 0), (0, 3), (38, 3), (0, 13), (38, 13), (3, 17), (8, 17), (28, 17), (33, 17)])
    npcs = [('adv_clerk_man', 4, 2), ('adv_clerk_woman', 8, 2), ('adv_clerk_woman', 6, 14), ('adv_clerk_man', 4, 12),
            ('adv_clerk_man', 31, 2), ('adv_clerk_woman', 33, 2), ('viscount_man', 35, 5), ('baron_woman', 19, 5), ('elder_man', 15, 13),
            ('maid_head', 31, 14), ('maid', 29, 12), ('servant_man', 33, 8), ('maid', 8, 8)]
    return g, npcs


def f3():
    g = blank()
    room(g, 1, 7, 37, 9)                                          # 回廊
    for a, b in ((1, 9), (11, 19), (21, 29), (31, 37)): room(g, a, 1, b, 5)   # 執務室 3 と応接室
    for x0, x1 in ((1, 8), (10, 28), (30, 37)): room(g, x0, 11, x1, 16, '0')  # 写本室・大図書館・禁書庫
    doors(g, [(5, 6), (15, 6), (25, 6), (34, 6), (4, 10), (15, 10), (23, 10), (34, 10), (0, 9)])
    line(g, 'S', [(1, 8)], 'u'); line(g, 'U', [(37, 8)], 'u')
    for cx, x0, x1 in ((5, 1, 9), (15, 11, 19), (34, 31, 37)):    # 執務室: 書架・暖炉・机
        line(g, 'k', [(x0 + 1, 1), (x0 + 2, 1), (x1 - 2, 1), (x1 - 1, 1)]); line(g, 's', [(cx, 1)])
        line(g, 't', [(cx, 3)]); line(g, 'h', [(cx, 2)]); line(g, 'K', [(cx, 4)])
    line(g, 's', [(25, 1)]); line(g, 't', [(25, 3)]); line(g, 'h', [(23, 3), (27, 3), (23, 4), (27, 4)]); line(g, 'K', [(25, 4)]); line(g, 'g', [(21, 1), (29, 1)])
    # 写本室
    line(g, 'k', row(2, 7, 16)); line(g, 't', [(3, 13), (6, 13)]); line(g, 'h', [(3, 12), (6, 12), (3, 14), (6, 14)])
    # 大図書館: 書架の壁と閲覧席
    line(g, 'k', [(x, 11) for x in (11, 12, 13, 17, 18, 19, 20, 21, 25, 26, 27)] + row(11, 27, 16))
    line(g, 't', row(13, 15, 13) + row(21, 23, 13)); line(g, 'h', [(13, 12), (15, 12), (13, 14), (15, 14), (21, 12), (23, 12), (21, 14), (23, 14)])
    # 禁書庫: 書架と机・木箱
    line(g, 'k', row(31, 37, 16) + col(37, 11, 15)); line(g, 't', [(33, 13), (34, 13)]); line(g, 'h', [(33, 14), (34, 14)]); line(g, 'q', [(31, 11), (31, 15)])
    walls(g, 'L', [(2, 6), (8, 6), (12, 6), (18, 6), (22, 6), (28, 6), (32, 6), (36, 6), (2, 10), (7, 10), (12, 10), (18, 10), (26, 10), (32, 10), (36, 10), (10, 4), (20, 4), (30, 4), (9, 13), (29, 13)])
    walls(g, 'R', [(10, 2), (20, 2), (30, 2)])
    walls(g, 'n', [(3, 0), (7, 0), (13, 0), (17, 0), (23, 0), (27, 0), (33, 0), (36, 0), (0, 3), (38, 3), (14, 17), (19, 17), (24, 17), (4, 17), (34, 17), (0, 14), (38, 14)])
    npcs = [('baron_man', 7, 3), ('viscount_man', 17, 3), ('baron_woman', 36, 3), ('baron_woman', 22, 3),
            ('butler', 5, 8), ('maid', 14, 8), ('servant_man', 33, 8), ('maid', 22, 9),
            ('mage_clerk_woman', 12, 14), ('mage_clerk_man', 18, 13), ('mage_clerk_woman', 26, 13), ('elder_man', 19, 15), ('adv_clerk_woman', 5, 15), ('guard_spear', 32, 12)]
    return g, npcs


def f4():
    g = blank()
    room(g, 14, 7, 30, 9); room(g, 1, 7, 12, 9)                  # 回廊・王の前廊（浴室・更衣）
    room(g, 1, 1, 12, 5); room(g, 1, 11, 12, 16)                 # 王の書斎・寝室
    room(g, 14, 1, 24, 5); room(g, 26, 1, 30, 5)                 # 接見の間・祈祷室
    room(g, 14, 11, 22, 16); room(g, 24, 11, 30, 16)             # 王妃の居間・寝室
    room(g, 32, 5, 37, 12); room(g, 32, 1, 37, 3); room(g, 32, 14, 37, 16)   # 控えの間・侍従の間・使用人の間
    doors(g, [(6, 6), (6, 10), (13, 8), (18, 6), (28, 6), (18, 10), (27, 10), (31, 8), (34, 4), (34, 13)])
    line(g, 'S', [(37, 8)])
    # 王の前廊: 浴槽・洗面台・衣装棚
    line(g, 'B', [(2, 7), (3, 7), (2, 9), (3, 9)]); line(g, 'V', [(8, 7), (9, 7)]); line(g, 'c', [(11, 7), (11, 9)])
    # 書斎
    line(g, 'k', row(1, 11, 1) + col(1, 2, 4)); line(g, 't', [(6, 3)]); line(g, 'h', [(7, 3)]); line(g, 'K', [(4, 3)])
    # 寝室
    line(g, 'e', [(3, 12), (4, 12)]); line(g, 'g', [(10, 16), (11, 16)]); line(g, 'c', [(12, 12)]); line(g, 'K', [(6, 13)]); line(g, 't', [(9, 14)]); line(g, 'h', [(8, 14), (10, 14)])
    # 接見の間: 壇
    for y, ch, mid in ((1, 'x', 'X'), (2, 'y', 'Y'), (3, 'z', 'Z')):
        room(g, 16, y, 22, y, ch); g[y][19] = mid
    line(g, 'K', [(19, 5), (15, 4), (23, 4)])
    # 祈祷室
    line(g, 'p', [(28, 1)]); line(g, 'h', [(27, 3), (29, 3), (27, 4), (29, 4)])
    # 王妃の居間
    line(g, 's', [(18, 16)]); line(g, 'k', [(14, 16), (15, 16), (21, 16), (22, 16)]); line(g, 't', [(18, 14)]); line(g, 'h', [(17, 14), (19, 14)]); line(g, 'K', [(18, 12)])
    # 王妃の寝室
    line(g, 'e', [(26, 14), (27, 14)]); line(g, 'g', [(24, 16), (25, 16)]); line(g, 'c', [(30, 12), (30, 14)]); line(g, 'V', [(24, 12)]); line(g, 'K', [(27, 12)])
    # 侍従の間・使用人の間
    line(g, 'e', [(33, 1), (35, 1), (37, 1)]); line(g, 'g', [(33, 16), (36, 16)]); line(g, 'e', [(36, 14), (37, 14)])
    line(g, 'K', [(16, 8), (22, 8), (28, 8)])
    walls(g, 'L', [(16, 6), (20, 6), (23, 6), (26, 6), (30, 6), (16, 10), (20, 10), (24, 10), (30, 10), (13, 3), (13, 13), (25, 3), (23, 13), (4, 6), (9, 6), (4, 10), (9, 10)])
    walls(g, 'R', [(15, 0), (23, 0), (19, 0), (31, 3), (31, 13)])
    walls(g, 'n', [(3, 0), (9, 0), (28, 0), (35, 0), (0, 3), (0, 13), (38, 3), (38, 15), (4, 17), (9, 17), (18, 17), (27, 17), (34, 17)])
    npcs = [('guard_spear', 33, 6, True), ('guard_spear', 33, 10, True), ('butler', 23, 9, True), ('butler', 16, 4), ('maid_head', 17, 9), ('maid', 15, 13), ('maid', 21, 13),
            ('maid', 34, 2), ('servant_man', 35, 15), ('maid', 5, 8), ('maid', 9, 13), ('guard_spear', 29, 8, True)]
    return g, npcs


def build():
    out = []
    for mid, fn in (('castle_2f', f2), ('castle_3f', f3), ('castle_4f', f4)):
        path = os.path.join(MAPS, mid + '.json')
        m = json.load(open(path, encoding='utf-8'))   # 出現位置・環境・links・名前は、今のものを引き継ぐ
        g, npcs = fn()
        for y in range(H):   # 本棚・戸棚の前に窓は置かない（窓の隣が書架・戸棚なら、ただの壁にする）
            for x in range(W):
                if g[y][x] == 'n' and any(0 <= x + dx < W and 0 <= y + dy < H and g[y + dy][x + dx] in 'kg' for dx, dy in ((0, 1), (0, -1), (1, 0), (-1, 0))): g[y][x] = 'W'
        rows = [''.join(r) for r in g]
        used = sorted(set(''.join(rows)))
        m['layout'] = rows
        m['legend'] = {c: LEG[c] for c in used if c != '0'}
        m['npcs'] = []
        for n in npcs:
            i, x, z = n[:3]
            assert g[z][x] in FLOOR, f'{mid}: {i} ({x},{z}) が床ではない（{g[z][x]!r}）'
            d = {'id': i, 'x': x, 'z': z}
            if len(n) > 3: d.update({'speed': 0, 'wanderRadius': 0})
            m['npcs'].append(d)
        bad = check_walk(m)
        assert not bad, f'{mid}: ' + ' / '.join(bad[:8])
        for k in m['links']:
            x, z = map(int, k.split(','))
            assert m['legend'].get(rows[z][x], '').startswith('stairs') or (z, x) == (9, 0) or rows[z][x] in 'Wd', f'{mid}: link {k}'
        out.append((path, m))
    for path, m in out:
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(m, f, ensure_ascii=False, indent=2); f.write('\n')
        print('wrote', path)


if __name__ == '__main__':
    build()
