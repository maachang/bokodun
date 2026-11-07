"""街どうしを結ぶ石畳の街道と、川の石の橋。経路は、費用の最小の道（ダイクストラ）。
  - 幅 3 マス（道の両側 1 マスは、木・草・岩を置かない）。回避: 山道・森林（大森林）・針葉樹の裾野・岩山・雪山・湖・海
  - 川は、費用をかけて渡る（渡るマスは、石の橋にする）。高さはもとの地形のまま（もとの地形は、隣り合う歩ける所の段差が 1 以下）
"""
import heapq
import numpy as np
import terrain as T

ROAD_CH, BRIDGE_CH = 'Á', 'Â'      # paved_road（石畳）・stone_bridge（石の橋）
AVOID = (T.SNOW, T.CONIFER, T.FOREST, T.ROCK, T.SEA)
WATER_COST = 6.0      # 川を渡る 1 マスの費用（橋が長くなりすぎないように）
TURN_COST = 1.5       # 曲がる費用（まっすぐな道にする）
SLOPE_COST = 0.6      # 高さが違う 1 段ごとの費用


def _filter3(a, fn):
    """3×3 の最大・最小（端は、そのまま）"""
    p = np.pad(a, 1, mode='edge')
    stack = [p[dy:dy + a.shape[0], dx:dx + a.shape[1]] for dy in range(3) for dx in range(3)]
    return fn(np.stack(stack), axis=0)


def find_path(t, start, goal, margin=60):
    """start・goal（(y, x)）の間の道の中心線（(y, x) の並び）。経路がなければ None"""
    land, el = t['land'], t['elev'].astype(np.int32)
    H, W = land.shape
    y0, y1 = max(1, min(start[0], goal[0]) - margin), min(H - 2, max(start[0], goal[0]) + margin)
    x0, x1 = max(1, min(start[1], goal[1]) - margin), min(W - 2, max(start[1], goal[1]) + margin)
    sl = (slice(y0, y1 + 1), slice(x0, x1 + 1))
    yy, xx = np.mgrid[sl]
    river = (t['river'][sl] > 0) & ~t['lake'][sl]
    water = t['deep'][sl] | t['shallow'][sl] | t['bridge'][sl] | t['lagoon'][sl]
    bad = ~land[sl] | t['lake'][sl] | np.isin(t['biome'][sl], AVOID) | t['trail'][sl] \
        | t['mtn_bridge'][sl] | t['frozen'][sl] | (water & ~river) | t['oasis']['pond'][sl]
    for ay, ax, ar in t['arenas']: bad |= np.hypot(yy - ay, xx - ax) <= ar + 2   # ボス闘技場のまわりは避ける
    near_end = (np.hypot(yy - start[0], xx - start[1]) <= 9) | (np.hypot(yy - goal[0], xx - goal[1]) <= 9)
    bad |= t['town_mask'][sl] & ~near_end
    e = el[sl]
    ok = ~(_filter3(bad.astype(np.uint8), np.max).astype(bool)) & ((_filter3(e, np.max) - _filter3(e, np.min)) <= 4)
    cost_tile = np.where(water, WATER_COST, 1.0)
    h, w = ok.shape
    s, g = (start[0] - y0, start[1] - x0), (goal[0] - y0, goal[1] - x0)
    DIRS = ((1, 0), (-1, 0), (0, 1), (0, -1))
    dist = {}
    prev = {}
    pq = []
    for d in range(4):
        dist[(s, d)] = 0.0; heapq.heappush(pq, (0.0, s, d))
    end = None
    while pq:
        c, u, d = heapq.heappop(pq)
        if c > dist.get((u, d), 1e18): continue
        if u == g: end = (u, d); break
        for nd, (dy, dx) in enumerate(DIRS):
            v = (u[0] + dy, u[1] + dx)
            if not (0 <= v[0] < h and 0 <= v[1] < w) or not ok[v]: continue
            dz = abs(int(e[v]) - int(e[u]))
            if dz > 1: continue
            nc = c + cost_tile[v] + dz * SLOPE_COST + (TURN_COST if nd != d else 0.0)
            if nc < dist.get((v, nd), 1e18):
                dist[(v, nd)] = nc; prev[(v, nd)] = (u, d); heapq.heappush(pq, (nc, v, nd))
    if end is None: return None
    path = []
    cur = end
    while cur in prev or cur[0] == s:
        path.append((cur[0][0] + y0, cur[0][1] + x0))
        if cur[0] == s and cur not in prev: break
        cur = prev[cur]
    return path[::-1]


def paint(t, obj, elev, path, keep_chars):
    """中心線の幅 3 マスに、石畳（川の上は石の橋）を置く。両側 1 マス（幅 5 の範囲）の、木・草・岩は取り除く。高さは変えない。
    keep_chars: 上書きしない物体の文字（街の壁・門・石畳など）。戻り値: (道のマス数, 橋のマス数)"""
    H, W = obj.shape
    water = t['deep'] | t['shallow'] | t['bridge'] | t['lagoon']
    ground = set()
    for (y, x) in path:
        for dy in range(-1, 2):
            for dx in range(-1, 2): ground.add((y + dy, x + dx))
    n_road = n_bridge = 0
    for (y, x) in ground:
        if chr(obj[y, x]) in keep_chars: continue
        if water[y, x]:
            obj[y, x] = ord(BRIDGE_CH); n_bridge += 1
        else:
            obj[y, x] = ord(ROAD_CH); n_road += 1
    road_cells = ground
    for (y, x) in path:
        for dy in range(-2, 3):
            for dx in range(-2, 3):
                c = (y + dy, x + dx)
                if c in road_cells or not (0 <= c[0] < H and 0 <= c[1] < W): continue
                if water[c] or not t['land'][c] or chr(obj[c]) in keep_chars or chr(obj[c]) in (ROAD_CH, BRIDGE_CH): continue   # 先に作った街道は、消さない
                obj[c] = ord('0')    # 道のわきは、何も置かない
    return n_road, n_bridge
