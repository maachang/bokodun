"""K（マカヒキ国）の天守（5 階）と地下（牢・穴蔵）。殿様の城（castle_k）の北西（家老の間）の渡櫓から天守へ、遠侍の隅の階段から地下へ。
設定（ユーザー指示 2026-11-11。この地域だけの特別）: 天守は、めちゃくちゃ狭い。最後に攻め込まれたときに、切腹する場所。1 階は将軍たちの住居。2 階から上は、戦争のための階。
調べた手本（実際の天守。松本城など）: 2 階＝武具・兵の詰所（狭間）／3 階＝火薬・兵糧／4 階＝いちばん広い、城主の最後の間／5 階＝作戦会議・物見。地下＝穴蔵（石積み）・牢・井戸。
  - 1 階 15×11: 将軍たちの住居（廊下の左右に、ふすまで区切った座敷 4 つ。火鉢・箪笥）
  - 2 階 15×11: 武具の蔵（西。武具の架・箱・樽）と、兵の詰所（東。畳・火鉢・卓）。狭間
  - 3 階 13×9: 火薬・兵糧の蔵（樽・米俵・箱）
  - 4 階 11×9: 城主の最後の間（畳・白い幔幕・床の間・段・三方に短刀）。切腹の部屋: 血は描かない（白い幕と、三方だけ）
  - 5 階 9×7: 作戦会議と物見（卓・島の地図・狭間）
  - 地下 25×17: 牢 4 つ・廊下・穴蔵（蔵）・井戸・牢番の詰所（石積み）
作り方: 全体を壁で埋め、区画（部屋・廊下）をくり抜き、区画の間の壁をふすまに（1 階・2 階）。戸口は壁を抜く。家具・窓は、座標で置く（床・壁を、置く前に確かめる）
"""
import copy
import json
import os

MAPS = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'data', 'maps')
PI = 3.14159
FACE = {'n': PI, 's': 0.0, 'e': PI / 2, 'w': -PI / 2}   # 階段から降り立ったときに、向く角度（階段に背を向ける）
STEP = {'n': (0, 1), 's': (0, -1), 'e': (-1, 0), 'w': (1, 0)}   # 階段の方向 d のとき、降り立つマスへの差（階段の反対側）

LEG = {'W': 'wooden_wall', 'S': 'fusuma_wall', '_': 'tatami', '=': 'wood_floor', 'M': 'wall_window_wood', 'U': 'stairs_wood_up', 'D': 'stairs_wood_down',
       'e': 'building_exit', 'X': 'crate', 'B': 'barrel', 'R': 'weapon_rack', 'K': 'sack_pile', 'T': 'table', 'h': 'edo_hibachi', 'g': 'edo_tansu',
       'm': 'edo_manmaku', 'N': 'wall_tokonoma', 'q': 'edo_sanbo', 'c': 'dais_tatami_1', 'a': 'edo_andon', 'z': 'edo_zabuton', 'I': 'island_map'}
LEG_B = {'W': 'rock_wall', 'F': 'brick_floor', 'U': 'stairs_stone_up', 'c': 'cell_door', 'L': 'wall_sconce', 'b': 'barrel_stone', 'K': 'sack_pile_stone',
         'X': 'crate_stone', 'O': 'well', 't': 'table_stone', 'h': 'chair_stone', 's': 'straw_bed'}
ENV_WOOD = {'floorType': 'stone', 'hasCeiling': True, 'ceilingTexture': 'woodWall', 'ambientLight': 15259832, 'directionalLight': 13615264, 'fogColor': 4864552,
            'fogNear': 22, 'fogFar': 70, 'visibility': 1.0, 'skyColor': 4864552}
ENV_STONE = {'floorType': 'stone', 'hasCeiling': True, 'footstep': 'stone', 'ceilingTexture': 'brick', 'ambientLight': 7829367, 'directionalLight': 11184810,
             'fogColor': 1710618, 'fogNear': 8, 'fogFar': 34, 'visibility': 0.75, 'skyColor': 1710618}


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


def make(mid, name, g, stairs, npcs, link_to, leg=LEG, env=ENV_WOOD, wall_h=5, spawn=None):
    """マップを組み立てる。stairs: {'U': (x, y, d), 'D': (x, y, d)}（無い階段は書かない）。link_to: {'U': (行き先 ID, 行き先の降り立ち)}"""
    rows = [''.join(r) for r in g]
    used = sorted(set(''.join(rows)))
    m = {'id': mid, 'name': name, 'type': 'indoor', 'tileSize': 4, 'wallHeight': wall_h, 'nextMap': None, 'spawn': spawn,
         'environment': dict(env), 'legend': {c: leg[c] for c in used}, 'enemies': {}, 'layout': rows, 'npcs': [], 'links': {}}
    for ch, (x, y, d) in stairs.items():
        dest, spw, msg = link_to[ch]
        m['links'][f'{x},{y}'] = {'nextMap': dest, 'message': msg, 'dir': d, 'spawn': spw}
    for i, x, y in npcs:
        assert g[y][x] in '_=F', f'{mid}: {i} ({x},{y}) が床ではない（{g[y][x]!r}）'
        m['npcs'].append({'id': i, 'x': x, 'z': y})
    return m


# 階段（x, y, 向き）。向き＝階段のある側の壁（n=北・s=南・e=東・w=西）。降り立つマスは、その反対側
STAIRS = {'1f': {'U': (7, 1, 'n')}, '2f': {'D': (2, 9, 's'), 'U': (13, 1, 'n')}, '3f': {'D': (2, 7, 's'), 'U': (10, 1, 'n')},
          '4f': {'D': (1, 7, 's'), 'U': (9, 1, 'n')}, '5f': {'D': (1, 5, 's')}, 'b': {'U': (1, 7, 'w')}}
CASTLE_DOWN = (2, 23, 's')   # 殿様の城の遠侍の南西の隅: 地下への階段
CASTLE_DOOR = (2, 0)         # 殿様の城の家老の間の北の壁: 渡櫓（天守へ）


def _link(floor_from, kind, dest_id, dest_floor, dest_kind, msg):
    """floor_from の階段 kind から、dest_floor の階段 dest_kind の降り立つマスへ"""
    x, y, d = STAIRS[dest_floor][dest_kind]
    return dest_id, arrival(x, y, d), msg


def _floor_1f():
    kinds = {'r': '_', 'c': '='}
    areas = {'corr': ('c', 6, 1, 8, 9), 'l1': ('r', 1, 1, 4, 4), 'l2': ('r', 1, 6, 4, 9), 'r1': ('r', 10, 1, 13, 4), 'r2': ('r', 10, 6, 13, 9)}
    g = grid(15, 11, areas, [(5, 2), (5, 7), (9, 2), (9, 7)], kinds)
    put(g, {'M': [(2, 0), (12, 0), (0, 3), (0, 8), (14, 3), (14, 8), (3, 10), (11, 10)], 'e': [(7, 10)]}, 'WS')
    put(g, {'U': [(7, 1)], 'h': [(4, 1), (10, 1), (1, 9), (13, 9)], 'g': [(1, 1), (13, 1)], 'z': [(2, 3), (12, 3), (3, 8), (11, 7)]}, '_=')
    npcs = [('daimyo_retainer_k', 3, 3), ('samurai_k', 2, 7), ('maid_k', 11, 3), ('samurai_k', 12, 7)]
    return make('tenshu_k_1f', '天守 1階（将軍たちの住居。マカヒキ国）', g, {'U': STAIRS['1f']['U']}, npcs,
                {'U': _link('1f', 'U', 'tenshu_k_2f', '2f', 'D', '階段を上る（2階へ）')}, spawn={'x': 7, 'z': 9, 'angle': 0})


def _floor_2f():
    kinds = {'r': '_', 'c': '='}
    areas = {'store': ('c', 1, 1, 6, 9), 'barracks': ('r', 8, 1, 13, 9)}
    g = grid(15, 11, areas, [(7, 5)], kinds, part=None)
    put(g, {'M': [(2, 0), (5, 0), (9, 0), (12, 0), (0, 3), (0, 7), (14, 3), (14, 7), (3, 10), (11, 10)]}, 'W')
    put(g, {'D': [(2, 9)], 'U': [(13, 1)], 'R': [(2, 1), (5, 1), (1, 5)], 'X': [(6, 4), (5, 8)], 'B': [(1, 7), (6, 3)],
            'h': [(10, 5)], 'T': [(11, 3)], 'z': [(9, 6), (12, 6)]}, '_=')
    npcs = [('guard_k', 9, 2), ('guard_k', 12, 7), ('guard_k', 4, 5)]
    return make('tenshu_k_2f', '天守 2階（武具の蔵・兵の詰所。マカヒキ国）', g, STAIRS['2f'], npcs,
                {'D': _link('2f', 'D', 'tenshu_k_1f', '1f', 'U', '階段を下りる（1階へ）'), 'U': _link('2f', 'U', 'tenshu_k_3f', '3f', 'D', '階段を上る（3階へ）')},
                spawn={'x': 2, 'z': 8, 'angle': 0})


def _floor_3f():
    g = grid(13, 9, {'hall': ('c', 1, 1, 11, 7)}, [], {'c': '='}, part=None)
    put(g, {'M': [(3, 0), (9, 0), (0, 4), (12, 4), (6, 8)]}, 'W')
    put(g, {'D': [(2, 7)], 'U': [(10, 1)], 'B': [(1, 1), (2, 1), (1, 2), (11, 3), (11, 4)], 'K': [(5, 4), (8, 5)], 'X': [(1, 5), (11, 6), (9, 6)]}, '=')
    return make('tenshu_k_3f', '天守 3階（火薬・兵糧の蔵。マカヒキ国）', g, STAIRS['3f'], [('guard_k', 6, 6)],
                {'D': _link('3f', 'D', 'tenshu_k_2f', '2f', 'U', '階段を下りる（2階へ）'), 'U': _link('3f', 'U', 'tenshu_k_4f', '4f', 'D', '階段を上る（4階へ）')},
                spawn={'x': 2, 'z': 6, 'angle': 0})


def _floor_4f():
    """城主の最後の間（切腹の部屋）。白い幔幕・床の間・畳の段・三方に短刀。血は描かない"""
    g = grid(11, 9, {'room': ('r', 1, 1, 9, 7)}, [], {'r': '_'}, part=None)
    put(g, {'m': [(2, 0), (8, 0), (0, 3), (0, 5), (10, 3), (10, 5), (3, 8), (7, 8)], 'N': [(5, 0)], 'a': [(3, 0), (7, 0)]}, 'W')
    put(g, {'D': [(1, 7)], 'U': [(9, 1)], 'c': [(4, 2), (5, 2), (6, 2)], 'q': [(5, 4)]}, '_')
    return make('tenshu_k_4f', '天守 4階（城主の最後の間。マカヒキ国）', g, STAIRS['4f'], [],
                {'D': _link('4f', 'D', 'tenshu_k_3f', '3f', 'U', '階段を下りる（3階へ）'), 'U': _link('4f', 'U', 'tenshu_k_5f', '5f', 'D', '階段を上る（5階へ）')},
                spawn={'x': 1, 'z': 6, 'angle': 0})


def _floor_5f():
    g = grid(9, 7, {'room': ('c', 1, 1, 7, 5)}, [], {'c': '='}, part=None)
    put(g, {'M': [(2, 0), (6, 0), (0, 2), (0, 4), (8, 2), (8, 4), (2, 6), (6, 6)], 'I': [(4, 0)]}, 'W')
    put(g, {'D': [(1, 5)], 'T': [(4, 3)]}, '=')
    return make('tenshu_k_5f', '天守 5階（作戦会議・物見。マカヒキ国）', g, STAIRS['5f'], [('guard_k', 6, 4), ('daimyo_retainer_k', 6, 2)],
                {'D': _link('5f', 'D', 'tenshu_k_4f', '4f', 'U', '階段を下りる（4階へ）')}, spawn={'x': 1, 'z': 4, 'angle': 0})


def _basement():
    """地下: 牢 4 つ（北）・廊下・穴蔵（南西）・井戸・牢番の詰所。穴蔵は石積み"""
    areas = {'c1': ('F', 1, 1, 4, 5), 'c2': ('F', 7, 1, 10, 5), 'c3': ('F', 13, 1, 16, 5), 'c4': ('F', 19, 1, 23, 5), 'corr': ('F', 1, 7, 23, 7),
             'store': ('F', 1, 9, 10, 15), 'well': ('F', 13, 9, 17, 15), 'post': ('F', 19, 9, 23, 15)}
    g = grid(25, 17, areas, [(5, 8), (15, 8), (21, 8)], {'F': 'F'}, part=None)
    put(g, {'c': [(2, 6), (8, 6), (14, 6), (21, 6)], 'L': [(5, 3), (11, 3), (17, 3)]}, 'W')
    put(g, {'U': [(1, 7)], 's': [(2, 2), (8, 2), (14, 2), (21, 2)], 'b': [(1, 9), (2, 9), (1, 10)], 'K': [(8, 10), (9, 14)], 'X': [(5, 14), (1, 14)],
            'O': [(15, 12)], 't': [(21, 12)], 'h': [(22, 12)]}, 'F')
    npcs = [('gaoler', 21, 11), ('guard_k', 20, 7), ('prisoner_thief', 3, 3), ('prisoner_thug', 9, 3), ('prisoner_debtor', 15, 3)]
    x, y, d = CASTLE_DOWN
    return make('castle_k_basement', '地下（牢・穴蔵。殿様の城。マカヒキ国）', g, STAIRS['b'], npcs,
                {'U': ('castle_k', arrival(x, y, d), '階段を上る（殿様の城へ）')}, leg=LEG_B, env=ENV_STONE, spawn=arrival(*STAIRS['b']['U']))


def attach(k):
    """殿様の城（castle_k）に、天守への戸口（家老の間の北の壁）と、地下への階段（遠侍の南西の隅）をつなぐ"""
    rows = [list(r) for r in k['layout']]
    cx, cy = CASTLE_DOOR
    assert rows[cy][cx] == 'H', f'castle_k の戸口 {CASTLE_DOOR} が壁ではない'
    rows[cy][cx] = 'o'
    sx, sy, sd = CASTLE_DOWN
    assert rows[sy][sx] == '_', f'castle_k の階段 {CASTLE_DOWN} が畳ではない'
    rows[sy][sx] = 'v'
    k['layout'] = [''.join(r) for r in rows]
    k['legend'].update({'o': 'wooden_door', 'v': 'stairs_wood_down'})   # 'e' は中庭の石灯籠が使っている
    k['links'] = dict(k.get('links') or {})
    k['links'][f'{cx},{cy}'] = {'nextMap': 'tenshu_k_1f', 'message': '渡櫓から天守へ', 'back': {'x': cx, 'z': cy + 1, 'angle': PI}}
    bx, by, bd = STAIRS['b']['U']
    k['links'][f'{sx},{sy}'] = {'nextMap': 'castle_k_basement', 'message': '階段を下りる（地下の牢・穴蔵へ）', 'dir': sd, 'spawn': arrival(bx, by, bd)}
    return k


def build():
    """天守 1〜5 階と地下のマップ（list）"""
    return [_floor_1f(), _floor_2f(), _floor_3f(), _floor_4f(), _floor_5f(), _basement()]
