"""F（ライアン獣王国）の小さな王城の中（castle_f）。D の王城（castle）の部品（凡例）を使い、1 部屋の玉座の間に、フェンリル神獣の像を展示する。
  - 獣王（ライオンの獣人）が玉座に、宰相（狐）がそばに。衛兵が 2 人。フェンリル像は、獣王が管理する（ユーザー指定）
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
                  {'id': 'guard_heavy', 'x': 9, 'z': 6}, {'id': 'guard_heavy', 'x': 15, 'z': 6},
                  {'id': 'beast_f_a', 'x': 6, 'z': 9}, {'id': 'dwarf_king', 'x': 19, 'z': 9}], 'links': {}}
    return m
