"""C（ミレニアム自由都市・砂漠のオアシスの街）の中身。手本は、サンプルの街（city）と D・E の作り。街の中は、この build が丸ごと作る。
  - 骨格（2026-11-08。街ごとの骨格を変える）: 大通りをやめて、中央の広場（噴水と屋台）から、細い路地が、くいちがう高さで枝分かれする、市場の路地の街。家は、路地に挟まれて密。
  - 自由都市: 王も神殿も置かず、商人ギルド（大きな建物）が街の中心。市場の屋台（city の 1〜4）が広場に並ぶ（施設の選びは、ユーザーに確認していない。変更は指示で）
  - 施設 5 つ: 道具屋・武器屋・宿屋・冒険者ギルド・商人ギルド。中のマップは既存を共有。街の人は既存の NPC を流用
  - オアシス: 街の南東に水の池（水は 0）。まわりにヤシの木
  - 中東風の建物（ネット検索で調べた特徴: 厚い日干しレンガの砂色の壁・平らな屋根と縁・アーチの窓・木の格子 mashrabiya・青緑のタイルのドーム）
  - 砂漠の見た目: 地面は石畳ではなく土（広場 plaza_earth・大通り earth_road・飾りの下は decorFloor 'packedEarth'）。木はヤシ・サボテン。環境は砂漠（霧は薄め）
  - 高低: サンプル（city）の高さを土台に、池の水（0）を重ねる。段差は 1 以下
"""
import town_heights as TH
from town_d import _shop, _to

FACILITIES = [   # (建物の文字, 左上 x, y, 幅, 扉の x（建物の左から）, 扉の文字, 立て札の文字, 出入口 links)。扉は南向き。扉の前の行は、広場か路地
    ('S', 3, 11, 4, 1, 'd', 'q', _shop('item_shop', '道具屋に入る', 'itemShopIcon')),
    ('S', 8, 11, 4, 1, 'd', 'Q', _shop('weapon_shop', '武器屋に入る', 'weaponShopIcon')),
    ('S', 29, 12, 4, 1, 'd', 'a', _to('guild_adv', '冒険者ギルドに入る', 'advGuildIcon')),
    ('I', 21, 21, 4, 1, 'N', 'M', _to('city_inn_c', '宿屋・酒場に入る', 'innIcon')),
    ('U', 3, 3, 8, 3, 'Y', 'x', {'nextMap': 'mansion_chairman_c', 'message': '議長の館に入る'}),   # 議長の館（扉の上の絵は、なし。H の自治領主の館と同じ。店・ギルドの絵を流用しない）
    ('J', 28, 3, 8, 3, 'D', 'c', _to('temple', '神殿に入る', 'templeIcon')),   # 宗教は神殿（ユーザー指定）。ドームの大きな神殿
    ('K', 16, 9, 9, 4, 'd', 'g', _to('guild_merchant_c', '商人ギルドに入る', 'merchantGuildIcon')),   # 商人ギルドは、広場の北に、広場へ向かって建つ（街の中心）
]
HOUSES = ((3, 18), (8, 18), (2, 22), (7, 22), (3, 26), (14, 20), (14, 26), (28, 26), (33, 17), (31, 8), (24, 26))   # 路地に挟まれた、密な家（4×3）
POND = (28, 35, 20, 25)   # オアシスの池（x0, x1, y0, y1）
PLAZA = (14, 25, 12, 18)  # 中央の広場（x0, x1, y0, y1）。噴水と、市場の屋台
STALLS = (('1', 15, 13), ('2', 18, 17), ('3', 22, 13), ('4', 24, 17), ('1', 15, 17), ('3', 24, 13), ('2', 10, 16), ('4', 31, 17))   # 広場と路地の屋台
PALMS = ((27, 19), (36, 19), (27, 26), (36, 26), (31, 19), (31, 26), (1, 1), (38, 1), (1, 28), (38, 28), (13, 7), (26, 7))   # ヤシ（オアシスのまわりと、街のすみ）
CACTI = ((37, 15), (13, 28), (37, 9))

NPCS = [   # 砂漠の住民（sdServer の画像）。市場の路地と広場に。護衛は、砂漠の街の護衛（sdServer 329）
    ('desert_middle_man', 20, 12), ('desert_woman', 6, 14), ('desert_man', 19, 22), ('desert_middle_woman', 17, 15), ('desert_old_man', 5, 15),
    ('desert_old_woman', 29, 16), ('desert_boy', 10, 19), ('desert_girl', 17, 25), ('merchant_man', 22, 15), ('traveler_merchant', 21, 13),
    ('desert_guard', 17, 27), ('desert_guard', 22, 27), ('priest_man', 32, 6), ('priest_woman', 35, 6),
]

LEGEND_KEYS = ('S', 'I', 'd', 'N', 'D', 'M', 'Q', 'q', 'a', 'c', 'g', 'w', '1', '2', '3', '4')
SOLID = set('WHSIJKUYdND1234')
SKIN = {'W': 'adobe_wall',   # 街の壁は、石ではなく土壁（砂色の漆喰・日干しレンガ）
        'T': 'palm', 'f': 'cactus', 'v': 'cactus',   # 木はヤシ、花壇の代わりはサボテン
        'p': 'plaza_earth', '=': 'earth_road',   # 地面は石畳ではなく土（ユーザー指示）
        'H': 'mideast_house', 'S': 'mideast_shop', 'I': 'mideast_inn', 'K': 'mideast_guild', 'J': 'mideast_temple', 'U': 'mideast_mansion', 'Y': 'mansion_door', 'x': 'chairman_sign'}   # 中東風の建物（砂色の漆喰・平らな屋根・アーチの窓・木の格子・青緑のドーム）


def _lane(g, x0, x1, y0, y1):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            if g[y][x] == 'p': g[y][x] = '='


def _layout(g, w, h):
    """外壁・門・広場・噴水・市場の路地（細い路地が、くいちがう高さで枝分かれする。大通りはない）・オアシスの池"""
    for x in range(w): g[0][x] = g[h - 1][x] = 'W'
    for y in range(h): g[y][0] = g[y][w - 1] = 'W'
    g[h - 1][19] = g[h - 1][20] = 'G'
    for x in (19, 20):
        for y in (14, 15): g[y][x] = 'F'
    # 南の路地（門から広場へ。2 度、ずれる）・南の枝（宿屋の前）・西へ（途中で、段違いに）・北西へ（議長の館）・北東へ（神殿）・東へ
    _lane(g, 19, 20, 25, 28); _lane(g, 18, 19, 22, 24); _lane(g, 19, 20, 19, 21)
    _lane(g, 18, 26, 24, 25)
    _lane(g, 9, 13, 14, 15); _lane(g, 8, 9, 14, 17); _lane(g, 2, 8, 16, 17); _lane(g, 2, 7, 14, 15)
    _lane(g, 12, 13, 16, 27)   # 西の家々の間の、縦の路地（南へ。行き止まり）
    _lane(g, 14, 15, 7, 11); _lane(g, 3, 15, 6, 7)
    _lane(g, 25, 26, 7, 11); _lane(g, 26, 36, 6, 7)
    _lane(g, 26, 36, 15, 16); _lane(g, 36, 37, 10, 16)
    x0, x1, y0, y1 = POND
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1): g[y][x] = 'w'


def _buildings(g, links):
    for hx, hy in HOUSES:
        for y in range(hy, hy + 3):
            for x in range(hx, hx + 4):
                assert g[y][x] in 'p', f'C の家 ({hx},{hy}) の ({x},{y}) が、空きマスではない: {g[y][x]}'
                g[y][x] = 'H'
    for ch, fx, fy, wid, doff, door, sign, link in FACILITIES:
        for y in range(fy, fy + 3):
            for x in range(fx, fx + wid):
                assert g[y][x] in 'p=', f'C の施設 ({fx},{fy}) の ({x},{y}): {g[y][x]}'
                g[y][x] = ch
        dx, dz = fx + doff, fy + 2
        g[dz][dx] = door
        assert g[dz + 1][dx] in 'p=' and g[dz + 1][dx + 1] in 'p=', f'C の施設 ({fx},{fy}): 扉の前・立て札のマスが、歩けない'
        g[dz + 1][dx + 1] = sign
        links[f'{dx},{dz}'] = dict(link, back={'x': dx, 'z': dz + 1, 'angle': 3.14159})


def _decor_and_npcs(g, w, h, legend, city_legend, npcs):
    """屋台・ヤシ・サボテン・凡例・街の人（指定の位置の、いちばん近い、歩ける空きマスへ）"""
    for ch, x, y in STALLS:
        if g[y][x] in 'p=': g[y][x] = ch
    for x, y in PALMS:
        if g[y][x] == 'p': g[y][x] = 'T'
    for x, y in CACTI:
        if g[y][x] == 'p': g[y][x] = 'f'
    for k in sorted((set(LEGEND_KEYS) - {'K', 'U', 'Y', 'x'}) | {'T', 'f', 'v', 'F', 'G', 'W', 'p', '=', 'H'}): legend[k] = city_legend[k]
    legend.update(SKIN)
    taken = set()
    for nid, x, z in NPCS:
        pos = next((x + dx, z + dz) for r in range(10) for dz in range(-r, r + 1) for dx in range(-r, r + 1)
                   if 1 <= x + dx < w - 1 and 1 <= z + dz < h - 1 and g[z + dz][x + dx] in 'p=' and (x + dx, z + dz) not in taken)
        taken.add(pos); npcs.append({'id': nid, 'x': pos[0], 'z': pos[1]})


def _heights(g, w, h):
    lv = TH.sample_field(w, h, 0, 0)
    fixed = set()
    x0, x1, y0, y1 = POND
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1): lv[y][x] = 0; fixed.add((x, y))
    TH.relax(lv, [[g[y][x] not in SOLID and g[y][x] != 'w' for x in range(w)] for y in range(h)], fixed)
    for ch, fx, fy, wid, doff, door, sign, link in FACILITIES: lv[fy + 2][fx + doff] = lv[fy + 3][fx + doff]
    for y in range(h):
        for x in range(w):
            if g[y][x] in SOLID or g[y][x] == 'w': continue
            for dx, dz in ((1, 0), (0, 1)):
                xx, yy = x + dx, y + dz
                if xx < w and yy < h and g[yy][xx] not in SOLID and g[yy][xx] != 'w':
                    assert abs(lv[y][x] - lv[yy][xx]) <= 1, f'C の段差 ({x},{y})-({xx},{yy}) が 2 以上'
    return lv


def build(w, h, legend, city_legend, links, npcs):
    """C の街の中（layout・heights）を作り、legend・links・npcs に足す。(layout, heights) を返す"""
    assert (w, h) == (40, 30)
    g = [['p'] * w for _ in range(h)]
    _layout(g, w, h)
    _buildings(g, links)
    _decor_and_npcs(g, w, h, legend, city_legend, npcs)
    lv = _heights(g, w, h)
    return [''.join(r) for r in g], [''.join(TH.CH36[v] for v in r) for r in lv]
