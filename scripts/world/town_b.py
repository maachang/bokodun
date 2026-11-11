"""B（フランケル聖国・中心の大国。聖地）の中身。D（town_d.py）と同じ作り（サンプル city の高さを土台に、川・橋・高台）で、宗教が最上位の街にする。
  - 設定（ユーザー指定）: 神殿が事実上の城（教皇が事実上の王。正体はデーモンロード。枢機卿・司祭も上位デーモン）。王城はあるが小さく、街の端（北東）。王と王子は王城から出ない。教皇たちは大教会から出ない
  - 街の人: 一般人は少なく、下っ端・中間の聖職者（助祭・修道女）が多い。聖地なので、巡礼の聖職者も多い。司祭・枢機卿・王は、街には出さない
  - 大教会（街の中心の北の高台。幅 16・奥行 4）。中のマップは既存の大神殿（temple）。礼拝堂（temple_town）も 1 つ
  - 施設: 道具屋・武器屋・冒険者ギルド・宿屋（巡礼者の宿）・礼拝堂・大教会。魔法ギルド・職業訓練所は置かない（神の奇跡が最上位のため）
  - 王城: 北の外壁の北東に、城門（2 マス）。中は既存の王城（castle）
"""
# 骨格（作り替え）: 川・橋・東西の大通りをやめた。南の門から大教会の前まで、幅 6 の**参道**が伸び、大教会の前に**巡礼者の広場**（噴水）。西と東へ、横道（壁までは通じない）。
import town_heights as TH
from town_d import _shop, _to

FACILITIES = [   # (建物の文字, 建物の左上 x, y, 幅, 扉の x（建物の左から）, 扉の文字, 立て札の文字, 出入口 links)
    ('S', 3, 11, 4, 1, 'd', 'q', _shop('item_shop', '道具屋に入る', 'itemShopIcon')),
    ('S', 9, 11, 4, 1, 'd', 'Q', _shop('weapon_shop', '武器屋に入る', 'weaponShopIcon')),
    ('S', 15, 11, 4, 1, 'd', 'a', _to('guild_adv', '冒険者ギルドに入る', 'advGuildIcon')),
    ('I', 28, 11, 4, 1, 'N', 'M', _to('city_inn', '巡礼者の宿・酒場に入る', 'innIcon')),
    ('K', 34, 11, 6, 2, 'D', 'k', _to('temple_town', '礼拝堂に入る', 'templeIcon')),
]
CATHEDRAL = (16, 2, 16, 4, 7, 'D', 'c', _to('temple_b', '大教会に入る', 'templeIcon'))   # 左上 x・y・幅・奥行・扉の x（左から）・扉・立て札・links

NPCS = [   # 聖職者が多い（助祭・修道女）。一般人は少し。衛兵
    ('priest_man', 7, 16), ('priest_man', 19, 16), ('priest_man', 33, 16), ('priest_man', 26, 21), ('priest_man', 14, 20),
    ('priest_woman', 12, 15), ('priest_woman', 29, 20), ('priest_woman', 40, 16), ('priest_woman', 20, 26), ('priest_woman', 36, 20),
    ('priest_man', 21, 8), ('priest_woman', 27, 7),   # 大教会の前
    ('town_man', 5, 20), ('town_old_woman', 14, 26), ('town_middle_woman', 38, 26),
    ('guard_b', 21, 33), ('guard_b', 26, 33), ('guard_b', 44, 10),   # 聖国の衛兵（sdServer ID 371。十字軍風）
    ('gate_guard_b', 40, 1), ('gate_guard_b', 45, 1),   # 城門の門番（同じ画像）
]

LEGEND_KEYS = ('S', 'I', 'J', 'd', 'N', 'D', 'M', 'Q', 'q', 'a', 'c', 'w', 'b')
SOLID = set('WHSIJKdNDC')
SKIN_B = {'S': 'white_shop', 'I': 'white_inn', 'H': 'white_house', 'W': 'white_wall', 'K': 'chapel_building', 'k': 'chapel_sign'}   # 聖国の見た目: 白亜の店・宿・家・壁。礼拝堂は、大教会と区別（青い屋根・「礼拝堂」の立て札）


def build(w, h, legend, city_legend, links, npcs):
    """B の街の中（layout・heights）を作り、legend・links・npcs に足す。(layout, heights) を返す"""
    assert (w, h) == (48, 36)
    g = [['p'] * w for _ in range(h)]
    for y in range(6, h - 1):   # 参道（南北。幅 6。南の門から、大教会の前まで）
        for x in range(21, 27): g[y][x] = '='
    for y in range(14, 22):     # 巡礼者の広場（大教会の前。参道と交わる）
        for x in range(14, 34): g[y][x] = '='
    for ys, xs in (((14, 15), list(range(2, 14)) + list(range(34, 46))), ((26, 27), list(range(2, 21)) + list(range(27, 46)))):   # 脇の横道（広場・参道から、西と東へ）
        for y in ys:
            for x in xs: g[y][x] = '='
    for x in (23, 24):
        for y in (16, 17): g[y][x] = 'F'
    for x in range(w): g[0][x] = g[h - 1][x] = 'W'
    for y in range(h): g[y][0] = g[y][w - 1] = 'W'
    g[h - 1][23] = g[h - 1][24] = 'G'
    g[0][42] = g[0][43] = 'C'   # 小さな王城の城門（北東）
    for x in (42, 43):
        links[f'{x},0'] = {'nextMap': 'castle_b', 'message': '王城に入る', 'back': {'x': x, 'z': 1, 'angle': 3.14159}}
    for x0, y0 in ((2, 2), (7, 2), (2, 7), (7, 7), (2, 22), (7, 22), (12, 22), (17, 22), (27, 22), (32, 22), (37, 22), (42, 22),
                   (2, 31), (7, 31), (12, 31), (17, 31), (27, 31), (32, 31), (37, 31), (42, 31)):
        for y in range(y0, y0 + 3):
            for x in range(x0, x0 + 4): g[y][x] = 'H'
    for ch, x0, y0, wid, doff, door, sign, link in FACILITIES:
        for y in range(y0, y0 + 3):
            for x in range(x0, x0 + wid):
                assert g[y][x] == 'p', f'B の施設 ({x},{y}): 空きマスではない'
                g[y][x] = ch
        dx, dz = x0 + doff, y0 + 2
        g[dz][dx] = door
        assert g[dz + 1][dx + 1] in 'p=', f'B の立て札 ({dx + 1},{dz + 1}): 空きマスではない'
        g[dz + 1][dx + 1] = sign
        links[f'{dx},{dz}'] = dict(link, back={'x': dx, 'z': dz + 1, 'angle': 3.14159})
    x0, y0, wid, dep, doff, door, sign, link = CATHEDRAL   # 大教会（奥行 4）
    for y in range(y0, y0 + dep):
        for x in range(x0, x0 + wid): g[y][x] = 'J'
    dx, dz = x0 + doff, y0 + dep - 1
    g[dz][dx] = door
    g[dz + 1][dx + 1] = sign
    links[f'{dx},{dz}'] = dict(link, back={'x': dx, 'z': dz + 1, 'angle': 3.14159})
    for x, y, c in ((2, 1, 'T'), (46, 1, 'T'), (13, 17 - 1, 'f'), (35, 16, 'v'), (2, 34, 'T'), (45, 34, 'T'), (10, 20, 'f'), (31, 25, 'v'),
                    (11, 7, 'f'), (36, 7, 'v'), (13, 21, 'T'), (44, 25, 'f'), (4, 25, 'v')):
        assert g[y][x] == 'p', f'B の飾り ({x},{y}): 空きマスではない'
        g[y][x] = c
    legend.update({'C': 'castle_gate'})
    for k in sorted(set(LEGEND_KEYS) | {c for f in FACILITIES for c in (f[0], f[5], f[6])}): legend[k] = city_legend.get(k) or SKIN_B[k]
    for nid, x, z in NPCS:
        assert g[z][x] in 'p=', f'B の NPC {nid} ({x},{z}): 歩ける空きマスではない'
        npcs.append({'id': nid, 'x': x, 'z': z})
    # 高さ: サンプル（city）の高さを土台に、大教会の高台・王城区の高台（北東）を重ねる
    lv = TH.sample_field(w, h, 0, 0)
    fixed = set()
    for (x0_, x1_, y0_, y1_) in ((12, 35, 1, 9), (37, w - 2, 1, 8)):   # 大教会の高台（中央・北）・王城区（北東）
        for y in range(y0_, y1_ + 1):
            for x in range(x0_, x1_ + 1): lv[y][x] = 3 if lv[y][x] >= 2 else 2; fixed.add((x, y))
    walk = [[g[y][x] not in SOLID and g[y][x] != 'w' for x in range(w)] for y in range(h)]
    TH.relax(lv, walk, fixed)
    for ch, x0, y0, wid, doff, door, sign, link in FACILITIES:
        lv[y0 + 2][x0 + doff] = lv[y0 + 3][x0 + doff]
    for x in (42, 43): lv[0][x] = lv[1][x]   # 城門のマスの高さも、門の前のマスと同じ（高台の城門に、段差で落ちて、落下ダメージを受けない）
    lv[CATHEDRAL[1] + CATHEDRAL[3] - 1][CATHEDRAL[0] + CATHEDRAL[4]] = lv[CATHEDRAL[1] + CATHEDRAL[3]][CATHEDRAL[0] + CATHEDRAL[4]]
    for y in range(h):
        for x in range(w):
            if g[y][x] in SOLID or g[y][x] == 'w': continue
            for dx, dz in ((1, 0), (0, 1)):
                xx, yy = x + dx, y + dz
                if xx < w and yy < h and g[yy][xx] not in SOLID and g[yy][xx] != 'w':
                    assert abs(lv[y][x] - lv[yy][xx]) <= 1, f'B の段差 ({x},{y})-({xx},{yy}) が 2 以上'
    legend.update(SKIN_B)   # 聖国の見た目（白亜の壁・家・店・宿。礼拝堂）
    return [''.join(r) for r in g], [''.join(TH.CH36[v] for v in r) for r in lv]
