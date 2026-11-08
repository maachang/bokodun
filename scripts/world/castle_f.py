"""F（ライアン獣王国）の小さな王城の中（castle_f）。D の王城（castle）の部品（凡例）を使い、1 部屋の玉座の間に、フェンリル神獣の像を展示する。
  - 獣王（ライオンの獣人）が玉座に、宰相（狐）がそばに。衛兵が 2 人。獣人の貴族 8 人は、廷臣として城の中（街の通りには出ない）。フェンリル像は、獣王が管理する（ユーザー指定）
  - 像はふつうの像（高さ 4.0）の 2 倍ほどの大きさ（画像は、寝ている狼。幅が広い）
"""
import json
import os

W, H = 25, 15
CASTLE = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'data', 'maps', 'castle.json')


def build():
    c = json.load(open(CASTLE, encoding='utf-8'))
    g = [['0'] * W for _ in range(H)]
    for x in range(W): g[0][x] = g[H - 1][x] = 'W'
    for y in range(H): g[y][0] = g[y][W - 1] = 'W'
    for x, ch in ((6, 'L'), (18, 'L'), (3, 'R'), (21, 'R'), (12, 'R')): g[0][x] = ch   # 壁の燭台・旗
    for x in range(9, 16): g[1][x], g[2][x], g[3][x] = 'a', 'b', 'c'                    # 玉座の段（上が高い）
    for y, ch in ((1, 'A'), (2, 'B'), (3, 'C')):
        for x in (11, 12, 13): g[y][x] = ch
    for y in range(4, H - 1):                                                          # 赤い絨毯（中央）
        for x in (11, 12, 13): g[y][x] = 'u'
    g[8][12] = 'Z'                                                                     # フェンリル像（絨毯の上。ふつうの像の 2 倍ほど）
    for x, y in ((12, 5), (12, 11)): g[y][x] = 'K'                                     # 吊り燭台
    for x, y in ((2, 1), (3, 1), (21, 1), (22, 1)): g[y][x] = 'k'                       # 書棚
    for x, y in ((2, 12), (22, 12)): g[y][x] = 't'
    g[H - 1][12] = '2'                                                                 # 出口（街の城門の前へ戻る）
    legend = {k: c['legend'][k] for k in 'WLRabcABCuKkt2'}
    legend['Z'] = 'fenrir_statue'
    m = {'id': 'castle_f', 'name': '獣王の城（ライアン獣王国）', 'type': c['type'], 'tileSize': c['tileSize'], 'wallHeight': c['wallHeight'],
         'spawn': {'x': 12, 'z': 12, 'angle': 0}, 'environment': c['environment'], 'legend': legend,
         'layout': [''.join(r) for r in g],
         'npcs': [{'id': 'lion_king', 'x': 12, 'z': 1}, {'id': 'fox_chancellor', 'x': 10, 'z': 2},
                  {'id': 'beast_soldier_kobold_gate', 'x': 9, 'z': 6}, {'id': 'beast_soldier_kobold_gate', 'x': 15, 'z': 6},   # 兵士: コボルト（sdServer 11）
                  {'id': 'beast_soldier_kobold', 'x': 9, 'z': 12}, {'id': 'beast_soldier_kobold', 'x': 4, 'z': 7},   # コボルト（sdServer 11）
                  
                  {'id': 'beast_f_a', 'x': 6, 'z': 9}, {'id': 'dwarf_king', 'x': 19, 'z': 9}] + [
                  {'id': i, 'x': x, 'z': z} for i, x, z in (   # 廷臣（獣人の貴族。街には出ない）
                      ('cat_noble_man', 5, 4), ('cat_noble_woman', 7, 4), ('rabbit_noble_man', 17, 4), ('rabbit_noble_woman', 19, 4),
                      ('dog_noble_man', 5, 11), ('dog_noble_woman', 7, 11), ('gorilla_noble_man', 17, 11), ('gorilla_noble_woman', 19, 11))], 'links': {}}
    return m


# ---- 国ごとの城・大教会（統治者が、国で違う）。D の城（castle）の部品で、1 部屋の玉座の間を作る ----
def hall(mid, name, w, h, dais, rulers, guards, extra_npcs=()):
    """玉座の間。dais=(中心 x)・rulers=[(街の人 ID, x, z)]・guards=[(街の人 ID, x, z)]。出口は、下の壁の真ん中"""
    c = json.load(open(CASTLE, encoding='utf-8'))
    g = [['0'] * w for _ in range(h)]
    for x in range(w): g[0][x] = g[h - 1][x] = 'W'
    for y in range(h): g[y][0] = g[y][w - 1] = 'W'
    cx = w // 2
    for x, ch in ((3, 'L'), (w - 4, 'L'), (2, 'R'), (w - 3, 'R'), (cx, 'R')): g[0][x] = ch
    half = 3 if w >= 21 else 2
    for x in range(cx - half, cx + half + 1): g[1][x], g[2][x], g[3][x] = 'a', 'b', 'c'
    for y, ch in ((1, 'A'), (2, 'B'), (3, 'C')):
        for x in (cx - 1, cx, cx + 1): g[y][x] = ch
    for y in range(4, h - 1):
        for x in (cx - 1, cx, cx + 1): g[y][x] = 'u'
    g[h - 1][cx] = '2'
    if h >= 13:
        for y in (5, h - 4): g[y][cx] = 'K'
    legend = {k: c['legend'][k] for k in 'WLRabcABCuK2'}
    m = {'id': mid, 'name': name, 'type': c['type'], 'tileSize': c['tileSize'], 'wallHeight': c['wallHeight'],
         'spawn': {'x': cx, 'z': h - 3, 'angle': 0}, 'environment': c['environment'], 'legend': legend,
         'layout': [''.join(r) for r in g],
         'npcs': [{'id': i, 'x': x, 'z': z} for i, x, z in list(rulers) + list(guards) + list(extra_npcs)], 'links': {}}
    return m


def build_others():
    return [
        # A キュラビッド帝国: 帝王（雪国の若い帝王）と、重装の衛兵
        hall('castle_a', '帝王の城（キュラビッド帝国）', 25, 15, 12, [('emperor_a', 12, 1)],
             [('guard_heavy', 9, 5), ('guard_heavy', 15, 5), ('guard_heavy', 9, 9), ('guard_heavy', 15, 9)]),
        # B フランケル聖国: 狭い城に、愚かな王と王子（実権は教皇にある）。衛兵は少ない
        hall('castle_b', '王の城（フランケル聖国。狭い）', 17, 11, 8, [('king_b', 8, 1), ('prince_b', 6, 2)],
             [('guard_light', 6, 6), ('guard_light', 10, 6)]),
        # G デイラミ精霊国: エルフの女王と宰相
        hall('castle_g', '女王の城（デイラミ精霊国）', 25, 15, 12, [('elf_queen', 12, 1), ('elf_chancellor', 9, 2)],
             [('elf_soldier_golem', 9, 6), ('elf_soldier_golem', 15, 6), ('elf_man_c', 18, 10), ('elf_woman_b', 6, 10)]),
    ]
