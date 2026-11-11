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


def build_f():
    """F の獣王の城（岩山をくり抜いた城）: 1 階 castle_f・2 階・坑道・闘技場のマップ（list。castle_f_keep.py）"""
    return __import__('castle_f_keep').build()


def build_others():
    out = _others()
    out[[m['id'] for m in out].index('castle_k')] = __import__('castle_k').build(next(m for m in out if m['id'] == 'castle_k'))   # 殿様の城: 全面畳・ふすまで区切られた狭い部屋（castle_k.py）
    tk = __import__('tenshu_k')   # 殿様の城に、天守（5 階）と地下（牢・穴蔵）をつなぐ（tenshu_k.py）
    tk.attach(next(m for m in out if m['id'] == 'castle_k')); out += tk.build()
    fort = __import__('castle_a_fort').build()   # 帝王の城（雪国）: 中庭を囲む石の要塞（1 階・2 階・塔・中庭・氷室・牢。castle_a_fort.py）
    out[[m['id'] for m in out].index('castle_a')] = fort[0]; out += fort[1:]
    gk = __import__('castle_g_keep').build()   # 女王の城（世界樹の中）: 1 階・2 階・梢の庭・根の洞窟（castle_g_keep.py）
    out[[m['id'] for m in out].index('castle_g')] = gk[0]; out += gk[1:]
    jk = __import__('castle_j_keep').build()   # 魔導王の城（魔導塔）: 1 階・図書室・研究室・天文台・実験場・牢（castle_j_keep.py）
    out[[m['id'] for m in out].index('castle_j')] = jk[0]; out += jk[1:]
    keep = __import__('castle_b_keep').build()   # 王の城（聖国。狭い）: 1 階・2 階・地下の酒蔵と牢（castle_b_keep.py）
    out[[m['id'] for m in out].index('castle_b')] = keep[0]; out += keep[1:]
    return out


def _tatami_hall(m):
    """玉座の間の、空いた床（'0'）を、畳に。壁ぎわの 1 周（廊下）は木張りの床（wood_floor）。絨毯・段の所は、そのまま"""
    w, h = len(m['layout'][0]), len(m['layout'])
    assert '_' not in m['legend'] and 'F' not in m['legend']
    rows = [list(r) for r in m['layout']]
    for y in range(1, h - 1):
        for x in range(1, w - 1):
            if rows[y][x] == '0': rows[y][x] = 'F' if x in (1, w - 2) or y in (1, h - 2) else '_'
    m['layout'] = [''.join(r) for r in rows]
    m['legend']['_'] = 'tatami'; m['legend']['F'] = 'wood_floor'


def _others():
    return [
        # A キュラビッド帝国: 帝王（雪国の若い帝王）と、守衛（sdServer ID 16。キー guard_heavy）
        hall('castle_a', '帝王の城（キュラビッド帝国）', 25, 15, 12, [('emperor_a', 12, 1)],
             [('guard_heavy', 9, 5), ('guard_heavy', 15, 5), ('guard_heavy', 9, 9), ('guard_heavy', 15, 9)]),
        # B フランケル聖国: 狭い城に、愚かな王と王子（玉座に並ぶ）（実権は教皇にある）。衛兵は少ない
        hall('castle_b', '王の城（フランケル聖国。狭い）', 17, 11, 8, [('king_b', 8, 1), ('prince_b', 9, 1)],   # 王と王子は、サンプルの王城（castle: 王 9,1・王子 10,1）と同じく、玉座の段の一番上に並ぶ
             [('guard_b', 6, 6), ('guard_b', 10, 6)]),   # 聖国の衛兵（sdServer ID 371）
        # G デイラミ精霊国: エルフの女王と宰相
        hall('castle_g', '女王の城（デイラミ精霊国）', 25, 15, 12, [('elf_queen', 12, 1), ('elf_chancellor', 9, 2)],
             [('elf_soldier_golem', 9, 6), ('elf_soldier_golem', 15, 6), ('elf_man_c', 18, 10), ('elf_woman_b', 6, 10)]),
        # J カラー魔導国: 大魔導師（好々爺）と、女性の宰相（ウィザード）。衛兵・魔導士・研究者
        hall('castle_j', '魔導王の城（カラー魔導国）', 25, 15, 12, [('mage_archmage_j', 12, 1), ('mage_chancellor_j', 9, 2)],
             [('guard_light', 9, 6), ('guard_light', 15, 6), ('adv_wizard', 18, 10), ('mage_researcher_woman', 6, 10)]),
        # K マカヒキ国: 殿様（江戸風）と、家老。侍が控える
        hall('castle_k', '殿様の城（マカヒキ国）', 25, 15, 12, [('daimyo_k', 12, 1), ('karo_k', 9, 2)],
             [('guard_k', 9, 6), ('guard_k', 15, 6), ('guard_k', 9, 10), ('guard_k', 15, 10), ('daimyo_wife_k', 15, 2), ('daimyo_retainer_k', 6, 5), ('daimyo_master_k', 18, 5), ('sword_bearer_k', 13, 2), ('maid_k', 5, 11), ('daimyo_cook_k', 19, 11)]),
    ]


def add_hearth(m, x, y, kind='hearth'):
    """暖炉（kind: hearth＝木の部屋用・hearth_stone＝石の部屋用）を、床のマス (x, y)（北の壁ぎわ）に置く（雪国 A の建物の中。1 部屋に 1 つ）"""
    ch = next((k for k, v in m['legend'].items() if v == kind), None) or 's'
    assert ch not in m['legend'] or m['legend'][ch] == kind, f"{m['id']}: 暖炉の文字 {ch} が使用中"
    assert m['layout'][y][x] in 'F0', f"{m['id']}: 暖炉の位置 ({x},{y}) が床ではない"
    row = m['layout'][y]; m['layout'][y] = row[:x] + ch + row[x + 1:]
    m['legend'][ch] = kind
    return m


def strip_hearth(m):
    """暖炉（hearth）を、書棚か食器棚に替える（砂漠の国には、暖炉を置かない。調理用の炉・かまど・台所の炉は、残す）"""
    rev = {v: k for k, v in m['legend'].items()}
    repl = rev.get('bookshelf') or rev.get('cupboard')
    for ch in [k for k, v in m['legend'].items() if v == 'hearth']:
        m['layout'] = [r.replace(ch, repl) for r in m['layout']]
        m['legend'].pop(ch)
    return m


def _chairman_mansion(mid, name, town, chairman_id, no_hearth):
    """議長の館（1 階）。H の自治領主の館（辺境伯の屋敷 mansion_margrave）を複製し、主を議長（chairman_id）に替える。
    辺境伯の 2 階への階段は、なくす（共通の 2 階は、辺境伯の屋敷に戻る作りのため）。礼拝堂・家令の部屋・食料庫は、共通のまま。
    議長の位置は、赤い絨毯の上の、北の壁（暖炉か書棚）の前（元の辺境伯は、東寄りの端）"""
    m = json.load(open(os.path.join(os.path.dirname(CASTLE), 'mansion_margrave.json'), encoding='utf-8'))
    m['id'] = mid; m['name'] = name; m['nextMap'] = town
    rows = [list(r) for r in m['layout']]
    assert rows[1][12] == 'U'
    rows[1][12] = 'F'
    m['layout'] = [''.join(r) for r in rows]
    m['links'].pop('12,1', None)
    if no_hearth: strip_hearth(m)   # 砂漠の国は、暖炉を置かない
    for n in m['npcs']:
        if n['id'] == 'margrave_man': n['id'] = chairman_id; n['x'] = 6; n['z'] = 2
    return m


def build_mansion_c():
    """C（ミレニアム自由都市）の議長の館。主は砂漠の議長（desert_chairman）。暖炉なし"""
    return _chairman_mansion('mansion_chairman_c', '議長の館（ミレニアム自由都市）', 'town_c', 'desert_chairman', True)


def build_mansion_i():
    """I（カナロア公国）の館（id は mansion_duke_i のまま）。主は大湖の公国女王（queen_i。屋敷の中だけ）"""
    return _chairman_mansion('mansion_duke_i', '女王の館（カナロア公国）', 'town_i', 'queen_i', False)


def build_mansion_e():
    """E（ガリレオ連盟）の議長の館。主は金の亡者の議長（chairman_e）"""
    return _chairman_mansion('mansion_chairman_e', '議長の館（ガリレオ連盟）', 'town_e', 'chairman_e', False)
