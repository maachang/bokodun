"""道沿いの村・町の中の、建物の並びを場所ごとに変える（サンプルが 1 つなので、そのままだと全部同じ並びになる。ユーザー指示 2026-11-14）。

手本は village.json・town.json のまま使い、次の 2 つだけを変える（川と橋・広場・道・外壁・起伏の土台は、サンプルのまま）:
  1. 建物の入れ替え: 同じ大きさの区画の間で、建物（村: 店・神殿・酒場 / 町: 道具屋・神殿・宿・町長の家）を入れ替える。
     扉の向き（北向き・南向き）が違う区画へ移すときは、建物の上下を逆にする。扉・看板・つなぎ先（links）・戻る先（back）も、一緒に動かす。
  2. 左右反転（宿場は対象外）。
場所ごとの組み合わせは、下の表（VILLAGE_PLAN・TOWN_PLAN）。"""
import json

# 村: 区画（建物の左上 x, y）と扉の向き。扉が建物の上の行（'up'・北向き）か、下の行（'down'・南向き）か
V_SLOTS = [(18, 6, 'down'), (6, 15, 'up'), (18, 15, 'up')]
V_ORIG = ('pub', 'shop', 'temple')   # サンプルでの、区画ごとの建物
# 建物（扉が上の行の向きで書く）。signs: (扉からの横ずれ, 看板の文字)
V_BUILD = {
    'shop': dict(rows=['HdH', 'HHH'], door='d', signs=[(-1, 'Q')]),
    'temple': dict(rows=['JAJ', 'JJJ'], door='A', signs=[(-1, 'c')]),
    'pub': dict(rows=['HdH', 'HHH'], door='d', signs=[(-1, 'K'), (1, 'M')]),
}
V_ORIG_DOOR = {'shop': (7, 15), 'temple': (19, 15), 'pub': (19, 7)}   # サンプルでの扉
V_ORIG_SIGNS = [(6, 14), (18, 14), (18, 8), (20, 8)]   # サンプルの看板（消して、置き直す）

# 町: 区画（建物の左上 x, y）。4×3 で、扉は下の行の左から 2 つ目（南向き）
T_SLOTS = [(3, 3), (20, 3), (3, 15), (20, 15)]
T_ORIG = ('shop', 'temple', 'house', 'inn')
T_BUILD = {   # sign: (扉の x からの横ずれ, 文字)
    'shop': dict(rows=['SSSS', 'SSSS', 'SdSS'], door='d', sign=(2, 'q')),
    'temple': dict(rows=['JJJJ', 'JJJJ', 'JDJJ'], door='D', sign=(-2, 'c')),
    'house': dict(rows=['HHHH', 'HHHH', 'HHHH'], door=None, sign=None),
    'inn': dict(rows=['IIII', 'IIII', 'INII'], door='N', sign=(1, 'M')),
}
T_ORIG_DOOR = {'shop': (4, 5), 'temple': (21, 5), 'inn': (21, 17)}
T_ORIG_SIGNS = [(6, 6), (19, 6), (22, 18)]
T_SIGN_BASE = {6: '=', 18: 'p'}   # 看板を消したあとの地面（行ごと。道の石畳・広場）

# 場所ごとの組み合わせ: 場所 id → (区画ごとの建物, 左右反転)
VILLAGE_PLAN = {
    '01': (('pub', 'shop', 'temple'), False),
    '04': (('shop', 'pub', 'temple'), True),
    '06': (('temple', 'shop', 'pub'), False),
    '07': (('pub', 'temple', 'shop'), True),
    '09': (('shop', 'temple', 'pub'), False),
    '12': (('temple', 'pub', 'shop'), True),
}
TOWN_PLAN = {
    '02': (('shop', 'temple', 'house', 'inn'), False),
    '03': (('inn', 'house', 'shop', 'temple'), True),
    '05': (('temple', 'inn', 'house', 'shop'), False),
    '10': (('house', 'shop', 'inn', 'temple'), True),
    '11': (('inn', 'shop', 'temple', 'house'), False),
}


def _flat(hts, xs, y):
    for x in xs: hts[y][x] = '1'


def _put(lay, hts, x0, y0, rows):
    for dy, r in enumerate(rows):
        for dx, c in enumerate(r): lay[y0 + dy][x0 + dx] = c; hts[y0 + dy][x0 + dx] = '1'


def arrange(lay, hts, links, npcs, kind, sid):
    """建物を入れ替える。lay・hts は文字の 2 次元リスト（その場で書き換える）、links は辞書（作り直す）。
    戻り値: 町長の家の区画（x0, y0。町のみ）または None"""
    plan = (VILLAGE_PLAN if kind == '村' else TOWN_PLAN)[sid]
    order = plan[0]
    old = dict(links)
    keep = {}
    if kind == '村':
        orig_doors = {f'{x},{y}' for x, y in V_ORIG_DOOR.values()}
        keep = {k: v for k, v in old.items() if k not in orig_doors}   # 村長の家など、動かさない出入口
        by = {b: old[f'{x},{y}'] for b, (x, y) in V_ORIG_DOOR.items()}
        for x, y in V_ORIG_SIGNS: lay[y][x] = '0'
        for (x0, y0, side), b in zip(V_SLOTS, order):
            spec = V_BUILD[b]
            rows = spec['rows'] if side == 'up' else spec['rows'][::-1]
            _put(lay, hts, x0, y0, rows)
            dy = 0 if side == 'up' else 1
            door = (x0 + 1, y0 + dy)
            out = y0 - 1 if side == 'up' else y0 + 2   # 扉の外の行
            for x in range(x0 - 1, x0 + 4): _flat(hts, [x], out)
            for dx, ch in spec['signs']: lay[out][door[0] + dx] = ch; hts[out][door[0] + dx] = '0'   # 看板のマスも高さ 0（サンプルと同じ）
            hts[door[1]][door[0]] = hts[out][door[0]] = '0'   # 扉と、扉の外の 1 マスは高さ 0（サンプルと同じ。扉は持ち上げない）
            lk = json.loads(json.dumps(by[b]))
            lk['back'] = {'x': door[0], 'z': out, 'angle': 0 if side == 'up' else 3.14159}
            keep[f'{door[0]},{door[1]}'] = lk
        links.clear(); links.update(keep)
        return None
    orig_doors = {f'{x},{y}' for x, y in T_ORIG_DOOR.values()}
    keep = {k: v for k, v in old.items() if k not in orig_doors}
    by = {b: old[f'{x},{y}'] for b, (x, y) in T_ORIG_DOOR.items()}
    for x, y in T_ORIG_SIGNS: lay[y][x] = T_SIGN_BASE[y]
    mayor = None
    for (x0, y0), b in zip(T_SLOTS, order):
        spec = T_BUILD[b]
        _put(lay, hts, x0, y0, spec['rows'])
        out = y0 + 3
        for x in range(x0 - 1, x0 + 5): _flat(hts, [x], out)
        if b == 'house': mayor = (x0, y0)
        if spec['door']:
            door = (x0 + 1, y0 + 2)
            if spec['sign']: sx = door[0] + spec['sign'][0]; lay[out][sx] = spec['sign'][1]; hts[out][sx] = '0'
            hts[door[1]][door[0]] = hts[out][door[0]] = '0'
            lk = json.loads(json.dumps(by[b]))
            lk['back'] = {'x': door[0], 'z': out, 'angle': 3.14159}
            keep[f'{door[0]},{door[1]}'] = lk
    links.clear(); links.update(keep)
    return mayor


def nudge_npcs(lay, npcs):
    """建物・看板・柵の上に立つ NPC を、近くの空き（'0' か広場・道）へずらす"""
    free = set('0p=D')
    for n in npcs:
        if lay[n['z']][n['x']] in free: continue
        for d in (1, -1, 2, -2, 3, -3):
            if 0 < n['x'] + d < len(lay[0]) - 1 and lay[n['z']][n['x'] + d] in free: n['x'] += d; break


def mirror(lay, hts, links, npcs, spawn):
    """左右反転（その場で）。links のキー・戻る先の x、NPC の x、出現位置の x も反転する。向き（0・π）は変わらない"""
    w = len(lay[0])
    for r in lay: r.reverse()
    for r in hts: r.reverse()
    new = {}
    for k, v in links.items():
        x, y = map(int, k.split(','))
        if 'back' in v: v['back']['x'] = w - 1 - v['back']['x']
        new[f'{w - 1 - x},{y}'] = v
    links.clear(); links.update(new)
    for n in npcs: n['x'] = w - 1 - n['x']
    spawn['x'] = w - 1 - spawn['x']


# 村の武器屋: 村によって、あったり無かったりする（ユーザー指示 2026-11-14）。南西の小さな家（2×2）を、3×2 の武器屋にする
WEAPON_SHOP_VILLAGES = {'04', '06', '09'}


def add_weapon_shop(lay, hts, links):
    """南西の小さな家（x 2〜3・y 15〜16）を、武器屋（x 2〜4）に替える。扉は上の行（北向き）・看板 R は扉の左外"""
    x0, y0 = 2, 15
    _put(lay, hts, x0, y0, ['HdH', 'HHH'])
    door, out = (x0 + 1, y0), y0 - 1
    for x in range(x0 - 1, x0 + 4): _flat(hts, [x], out)
    lay[out][door[0] - 1] = 'R'; lay[out][door[0]] = '0'
    hts[door[1]][door[0]] = hts[out][door[0]] = hts[out][door[0] - 1] = '0'
    links[f'{door[0]},{door[1]}'] = {'nextMap': 'shop', 'params': {'shopId': 'weapon_shop'}, 'message': '武器屋に入る', 'icon': 'weaponShopIcon',
                                     'back': {'x': door[0], 'z': out, 'angle': 0}}


_DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz'


def relax_heights(m, objects):
    """隣り合う歩けるマスの高さの差を、1 以内にする（2 段以上の落下ダメージを出さない）。差が 2 以上なら、高い側を、低い側 +1 まで下げる。
    扉・看板・水のマスは低いまま（動かさない）。建物・壁など、歩けないマスは、対象外。戻り値: 下げたマスの数"""
    lay, hts = m['layout'], [list(r) for r in m['heights']]
    h, w = len(lay), len(lay[0])
    def walk(c):
        if c in '0 ': return True
        d = objects.get(m['legend'].get(c, ''))
        return not (d and d.get('solid'))
    ok = [[walk(lay[y][x]) for x in range(w)] for y in range(h)]
    n = 0
    changed = True
    while changed:
        changed = False
        for y in range(h):
            for x in range(w):
                if not ok[y][x]: continue
                for dx, dy in ((1, 0), (0, 1), (-1, 0), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if not (0 <= nx < w and 0 <= ny < h and ok[ny][nx]): continue
                    a, b = int(hts[y][x], 36), int(hts[ny][nx], 36)
                    if a - b >= 2: hts[y][x] = _DIGITS[b + 1]; n += 1; changed = True
    m['heights'] = [''.join(r) for r in hts]
    return n
