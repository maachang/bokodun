"""城の中のマップを作る共通の道具（国ごとの城: tenshu_k.py・castle_a_fort.py など）。
区画（部屋・廊下）をくり抜く grid、座標で物を置く put、階段の降り立つマス arrival、マップを組み立てる make、歩いてつながるかを確かめる check_walk。
check_walk は、生成のとき（国ごとの build の最後）に確かめる: 床・階段・戸口・人が、出現位置から、歩いてたどり着けること"""
import json
import os
from collections import deque

MAPS = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'data', 'maps')
PI = 3.14159
FACE = {'n': PI, 's': 0.0, 'e': PI / 2, 'w': -PI / 2}   # 階段から降り立ったときに、向く角度（階段に背を向ける）
STEP = {'n': (0, 1), 's': (0, -1), 'e': (-1, 0), 'w': (1, 0)}   # 階段の方向 d のとき、降り立つマスへの差（階段の反対側）
FLOORS = '_=F'   # 人・物を置ける床の文字（マップごとの凡例は、国ごとに決める。床の文字は、この 3 つに統一）
_OBJ = {}


def objects():
    if not _OBJ: _OBJ.update(json.load(open(os.path.join(MAPS, '..', 'objects.json'), encoding='utf-8')))
    return _OBJ


def grid(w, h, areas, doors, kinds, wall='W', part='S'):
    """区画（名前 → (種類, x0, y0, x1, y1)）をくり抜く。区画の間の壁は part（ふすま）。doors は、壁を抜く戸口"""
    owner = [[None] * w for _ in range(h)]
    for n, (k, x0, y0, x1, y1) in areas.items():
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                assert owner[y][x] is None, f'{n}: 区画が重なる ({x},{y})'
                owner[y][x] = k
    g = [[kinds[owner[y][x]] if owner[y][x] else wall for x in range(w)] for y in range(h)]
    if part:
        for y in range(1, h - 1):
            for x in range(1, w - 1):
                if owner[y][x]: continue
                for a, b in (((x - 1, y), (x + 1, y)), ((x, y - 1), (x, y + 1))):
                    if owner[a[1]][a[0]] and owner[b[1]][b[0]]: g[y][x] = part
    for x, y in doors:
        assert g[y][x] in (part or wall), f'戸口 ({x},{y}) が壁ではない'
        near = [owner[y + dy][x + dx] for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)) if owner[y + dy][x + dx]]
        g[y][x] = kinds['c'] if 'c' in near and kinds['c'] != kinds.get('r') else kinds[near[0]]
    return g


def put(g, items, was):
    """items: {文字: [(x, y), ...]}。置く前に、そこが was（文字の集まり）か確かめる"""
    for ch, ps in items.items():
        for x, y in ps:
            assert g[y][x] in was, f'{ch} を置く ({x},{y}) が {g[y][x]!r}（{was!r} のはず）'
            g[y][x] = ch


def arrival(x, y, d):
    dx, dy = STEP[d]
    return {'x': x + dx, 'z': y + dy, 'angle': FACE[d]}


def make(mid, name, g, stairs, npcs, link_to, leg, env, wall_h=5, spawn=None, mtype='indoor', floor_chars=FLOORS):
    """マップを組み立てる。stairs: {'U': (x, y, d), 'D': (x, y, d)}（無い階段は書かない）。link_to: {'U': (行き先 ID, 行き先の降り立ち)}"""
    rows = [''.join(r) for r in g]
    used = sorted(set(''.join(rows)))
    m = {'id': mid, 'name': name, 'type': mtype, 'tileSize': 4, 'wallHeight': wall_h, 'nextMap': None, 'spawn': spawn,
         'environment': dict(env), 'legend': {c: leg[c] for c in used if c != '0'}, 'enemies': {}, 'layout': rows, 'npcs': [], 'links': {}}
    for ch, (x, y, d) in stairs.items():
        dest, spw, msg = link_to[ch]
        m['links'][f'{x},{y}'] = {'nextMap': dest, 'message': msg, 'dir': d, 'spawn': spw}
    for i, x, y in npcs:
        assert g[y][x] in floor_chars, f'{mid}: {i} ({x},{y}) が床ではない（{g[y][x]!r}）'
        m['npcs'].append({'id': i, 'x': x, 'z': y})
    return m




def check_walk(m):
    """出現位置から歩いて、床すべて・階段と戸口・人に、たどり着けるか。違反の一覧（空なら良い）。通れない物: 壁・家具・壁の飾りなど（床・階段・戸口は通れる）"""
    o = objects()
    L, leg = m['layout'], m['legend']
    h, w = len(L), len(L[0])
    def name(x, y): return leg.get(L[y][x], '0')
    def solid(n): return n != '0' and o.get(n, {}).get('solid') is not False and o.get(n, {}).get('type') not in ('floor_tile', 'stairs', 'door', 'hanging')   # 吊り燭台・松明などは通れる（solid: false）
    sp = (int(m['spawn']['x']), int(m['spawn']['z']))
    if not (0 <= sp[0] < w and 0 <= sp[1] < h) or solid(name(*sp)): return [f'出現位置 {sp} が、マップの外か、通れないマス']
    seen, q = {sp}, deque([sp])
    while q:
        x, y = q.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            a, b = x + dx, y + dy
            if 0 <= a < w and 0 <= b < h and (a, b) not in seen and not solid(name(a, b)): seen.add((a, b)); q.append((a, b))
    bad = [f'床 ({x},{y}) に行けない' for y in range(h) for x in range(w) if o.get(name(x, y), {}).get('type') == 'floor_tile' and (x, y) not in seen]
    for k in m.get('links', {}):
        x, y = map(int, k.split(','))
        if (x, y) not in seen and not any((x + dx, y + dy) in seen for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))): bad.append(f'link {k} に行けない')
    bad += [f"人 {n['id']} ({n['x']},{n['z']}) に行けない" for n in m.get('npcs', []) if (int(n['x']), int(n['z'])) not in seen]
    return bad


def finish(maps):
    """国ごとの build の最後: 全マップを check_walk にかけて、違反があれば止める（生成のときに、つながらない城を作らない）。maps をそのまま返す"""
    for m in maps:
        if m['type'] == 'indoor' or m['id'].startswith(('castle_', 'tenshu_')):
            bad = check_walk(m)
            assert not bad, f"{m['id']}: " + ' / '.join(bad[:6])
    return maps
