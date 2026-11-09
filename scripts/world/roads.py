"""街どうしを結ぶ石畳の街道と、川の石の橋。経路は、費用の最小の道（ダイクストラ）。
  - 街道は、1 本の道路網（木の形）として作る。2 つ目以降の街は、すでにある街道のどこからでも分かれてよい（分かれ道）。
    すでにある街道の上は、ほとんど費用がかからず（重ねて使う）、すぐわき（平行に走る）は、費用を上乗せする（並走しない。分かれ道は、街道に直角に近く出る）
  - 幅 3 マス（道の両側 1 マスは、木・草・岩を置かない）。回避: 砂漠・山道・森林（大森林）・針葉樹の裾野・岩山・雪山・湖・海
  - 川は、費用をかけて渡る（渡るマスは、石の橋にする）。高さはもとの地形のまま（もとの地形は、隣り合う歩ける所の段差が 1 以下）
"""
import heapq
import numpy as np
import terrain as T

ROAD_CH, BRIDGE_CH, SIGN_CH = 'Á', 'Â', 'Ã'      # paved_road（石畳）・stone_bridge（石の橋）・road_sign（道しるべの立て札）
AVOID = (T.SNOW, T.CONIFER, T.FOREST, T.ROCK, T.SEA, T.DESERT)   # 砂漠は、石畳を作ってもすぐ砂に埋もれる（ユーザー指定）ので、避ける
WATER_COST = 6.0      # 川を渡る 1 マスの費用（橋が長くなりすぎないように）
TURN_COST = 3.0       # 曲がる費用（まっすぐな道にする。細かい階段状の斜めを避ける）
REUSE_COST = 0.2      # すでにある街道の上を歩く 1 マスの費用（重ねて使う）
PARALLEL_COST = 3.0   # すでにある街道のすぐわき（PARALLEL_RANGE マス以内）の費用の上乗せ（並走させない）
PARALLEL_RANGE = 6
AVOID_ROUGH = (T.SEA,)   # 地形を無視してつなぐ道（rough）: 海だけ避ける（砂漠・山・岩山・雪・針葉樹も通る。ユーザー提案「エルフの街以外は、一旦、砂漠や山を無視してつなぐ」の試し）
ROUGH_DZ = 10         # 地形を無視してつなぐ道（rough）で、隣のマスと許す高さの差（あとで、道の高さをなだらかに直す）
ARENA_COST = 4.0      # 地形を無視してつなぐ道（rough）で、ボス闘技場のまわりの 1 マスの費用の上乗せ
ROUGH_COST = 3.0      # 山・岩山・針葉樹・森林・雪の 1 マスの費用の上乗せ（草原を優先）
TRAIL_COST = 1.0      # すでにある山道の 1 マスの費用（沿って通る）
LOOP_APART = 14       # 循環する道（loop）は、すでにある街道から、このマス以上離す（並走させない）
PENAL_COST = 12.0     # 循環する道（loop）で、すでにある街道を避ける費用の上乗せ
COAST_NEAR = 8        # 海岸線の道（coast）: 海からこのマス以内を、通りやすくする
COAST_COST = 1.0      # 海岸線の道（coast）で、海から COAST_NEAR マスより内陸の 1 マスの費用の上乗せ
COAST_TURN = 15.0     # 海岸線の道（coast）で、曲がる費用（海岸の斜めに合わせた細かい階段を避け、まっすぐな区間にする）
GRASS_COST = 3.0      # 草原を通る道（grass）で、草原以外の 1 マスの費用の上乗せ
SLOPE_COST = 0.6      # 高さが違う 1 段ごとの費用


def _filter3(a, fn):
    """3×3 の最大・最小（端は、そのまま）"""
    p = np.pad(a, 1, mode='edge')
    stack = [p[dy:dy + a.shape[0], dx:dx + a.shape[1]] for dy in range(3) for dx in range(3)]
    return fn(np.stack(stack), axis=0)


def find_path(t, start, goal, margin=60, reuse=None, partial=False, rough=False, penal=None, coast=False, grass=False):
    """start・goal（(y, x)）の間の道の中心線（(y, x) の並び）。経路がなければ None。
    start は、1 点または点の集まり（すでにある街道のどこからでも出られる）。reuse: すでにある街道の中心線のマス（重ねて使い、すぐわきは並走させない）"""
    starts = [start] if isinstance(start[0], int) else list(start)
    reuse = reuse or set()
    land, el = t['land'], t['elev'].astype(np.int32)
    H, W = land.shape
    pts = starts + [goal]
    y0, y1 = max(1, min(p[0] for p in pts) - margin), min(H - 2, max(p[0] for p in pts) + margin)
    x0, x1 = max(1, min(p[1] for p in pts) - margin), min(W - 2, max(p[1] for p in pts) + margin)
    sl = (slice(y0, y1 + 1), slice(x0, x1 + 1))
    yy, xx = np.mgrid[sl]
    river = (t['river'][sl] > 0) & ~t['lake'][sl]
    water = t['deep'][sl] | t['shallow'][sl] | t['bridge'][sl] | t['lagoon'][sl]
    bad = ~land[sl] | t['lake'][sl] | np.isin(t['biome'][sl], AVOID_ROUGH if rough else AVOID) | (t['trail'][sl] & ~rough) \
        | t['mtn_bridge'][sl] | (t['frozen'][sl] & ~rough) | (water & ~river) | t['oasis']['pond'][sl]
    arena_m = np.zeros(bad.shape, bool)
    for ay, ax, ar in t['arenas']: arena_m |= np.hypot(yy - ay, xx - ax) <= ar + 2   # ボス闘技場のまわりは避ける（rough: 通れるが、費用を上乗せ。A の街は、山頂の広場の中にある）
    if not rough: bad |= arena_m
    near_end = (np.hypot(yy - goal[0], xx - goal[1]) <= 9)
    for sy, sx in starts: near_end |= np.hypot(yy - sy, xx - sx) <= 9
    bad |= t['town_mask'][sl] & ~near_end
    e = el[sl]
    ok = ~(_filter3(bad.astype(np.uint8), np.max).astype(bool))
    if not rough: ok &= ((_filter3(e, np.max) - _filter3(e, np.min)) <= 4)
    reuse_m = np.zeros(ok.shape, bool)
    for (ry, rx) in reuse:
        if y0 <= ry <= y1 and x0 <= rx <= x1: reuse_m[ry - y0, rx - x0] = True
    ok |= reuse_m
    near_reuse = reuse_m.copy()
    for _ in range(PARALLEL_RANGE): near_reuse = _filter3(near_reuse.astype(np.uint8), np.max).astype(bool)
    cost_tile = np.where(water, WATER_COST, 1.0) + np.where(near_reuse & ~reuse_m, PARALLEL_COST, 0.0)
    cost_tile = np.where(reuse_m, REUSE_COST, cost_tile)
    if rough:   # 山・岩山・針葉樹・森林・雪も通る（地形を、道に沿って少し直す）。山道（すでにある道）は、通りやすい
        cost_tile = cost_tile + np.where(np.isin(t['biome'][sl], (T.SNOW, T.CONIFER, T.FOREST, T.ROCK)), ROUGH_COST, 0.0)
        cost_tile = cost_tile + np.where(arena_m, ARENA_COST, 0.0)
        cost_tile = np.where(t['trail'][sl] & ~reuse_m, np.minimum(cost_tile, TRAIL_COST), cost_tile)
    if penal:   # 循環する道: すでにある街道は、使わない（別の道を通す）。重ならないよう費用を上乗せ
        pm = np.zeros(ok.shape, bool)
        for (ry, rx) in penal:
            if y0 <= ry <= y1 and x0 <= rx <= x1: pm[ry - y0, rx - x0] = True
        for _ in range(LOOP_APART): pm = _filter3(pm.astype(np.uint8), np.max).astype(bool)   # 並走させない: すでにある街道のまわり（LOOP_APART マス）にも、費用を上乗せ
        cost_tile = cost_tile + np.where(pm, PENAL_COST, 0.0)
    if coast:   # 海岸線の道: 海から COAST_NEAR マス以内は、ふつうの費用。それより内陸は、費用を上乗せ（海岸に沿って通る）。海（波打ち際）そのものは、bad と ok の 3×3 判定で、すでに避けている
        sea_m = ~land[sl] | t['deep'][sl] | t['lagoon'][sl] | (t['biome'][sl] == T.SEA)
        for _ in range(COAST_NEAR): sea_m = _filter3(sea_m.astype(np.uint8), np.max).astype(bool)
        cost_tile = cost_tile + np.where(sea_m, 0.0, COAST_COST)
    if grass:   # 草原を通る道: 草原以外（砂漠・岩山・森など。rough で通れる所）は、費用を上乗せ（草原を優先）
        cost_tile = cost_tile + np.where(t['biome'][sl] == T.GRASS, 0.0, GRASS_COST)
    h, w = ok.shape
    g = (goal[0] - y0, goal[1] - x0)
    DIRS = ((1, 0), (-1, 0), (0, 1), (0, -1))
    dist = {}
    prev = {}
    pq = []
    for sy, sx in starts:
        s0 = (sy - y0, sx - x0)
        for d in range(4):
            dist[(s0, d)] = 0.0; heapq.heappush(pq, (0.0, s0, d))
    end = None
    while pq:
        c, u, d = heapq.heappop(pq)
        if c > dist.get((u, d), 1e18): continue
        if u == g: end = (u, d); break
        for nd, (dy, dx) in enumerate(DIRS):
            v = (u[0] + dy, u[1] + dx)
            if not (0 <= v[0] < h and 0 <= v[1] < w) or not ok[v]: continue
            dz = abs(int(e[v]) - int(e[u]))
            if dz > (ROUGH_DZ if rough else 1): continue
            nc = c + cost_tile[v] + dz * SLOPE_COST * (2 if rough else 1) + ((COAST_TURN if coast or grass else TURN_COST) if nd != d and not (reuse_m[u] and reuse_m[v]) else 0.0)
            if nc < dist.get((v, nd), 1e18):
                dist[(v, nd)] = nc; prev[(v, nd)] = (u, d); heapq.heappush(pq, (nc, v, nd))
    if end is None and partial and dist:   # 行けない（砂漠・山・大森林で、道が作れない）: 作れる所まで。目的地にいちばん近い（直線距離）、行ける所を、道の終わりにする
        end = min(dist, key=lambda k: (np.hypot(k[0][0] - g[0], k[0][1] - g[1]), dist[k]))
    if end is None: return None
    path = []
    cur = end
    while True:
        path.append((cur[0][0] + y0, cur[0][1] + x0))
        if cur not in prev: break
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


COMPASS = {(-1, 0): '北', (1, 0): '南', (0, 1): '東', (0, -1): '西'}   # (行の増減, 列の増減) → 方角
COMPASS_ORDER = ('北', '西', '東', '南')


def fork_sign(t, obj, network, junction, towns):
    """分かれ道（junction。街道の中心線 network の上）の道しるべ。方角（地図の北・西・東・南）と、その先の街の名前の文章を作り、
    分かれ道の斜め前（道の外）の空きマスに、立て札（SIGN_CH）を置く。towns: {街の門前のマス: 街の名前}。戻り値: ((行, 列), 文章)"""
    jy, jx = junction
    arms = {}
    LOOK = 10   # 方角は、分かれ道から 10 マス先の道の位置で決める（すぐ先で曲がる道でも、行き先の方向になる）
    for (dy, dx) in COMPASS:
        n = (jy + dy, jx + dx)
        if n not in network: continue
        dist = {junction: 0, n: 1}; queue = [n]; found = []; far = n
        for u in queue:
            if u in towns: found.append(towns[u])
            if dist[u] <= LOOK and dist[u] >= dist[far]: far = u
            for ddy, ddx in COMPASS:
                v = (u[0] + ddy, u[1] + ddx)
                if v in network and v not in dist: dist[v] = dist[u] + 1; queue.append(v)
        vy, vx = far[0] - jy, far[1] - jx
        name = COMPASS[((1 if vy > 0 else -1), 0)] if abs(vy) > abs(vx) else COMPASS[(0, (1 if vx > 0 else -1))]
        if found: arms[name] = '・'.join(sorted(set(arms.get(name, '').split('・') + found) - {''}))
    msg = ' / '.join(f'{d}: {arms[d]}' for d in COMPASS_ORDER if d in arms)
    # 置く場所: 分かれ道のそばの、90 度の曲がり角（＿｜の形）の、外側のすぐわき（道の縁に接する空きマス）
    def free(y, x):
        return t['land'][y, x] and not (t['deep'][y, x] or t['shallow'][y, x] or t['bridge'][y, x]) and chr(obj[y, x]) not in (ROAD_CH, BRIDGE_CH)
    corners = []
    for (y, x) in network:
        if abs(y - jy) + abs(x - jx) > 24: continue
        nb = {d for d in COMPASS if (y + d[0], x + d[1]) in network}
        if len(nb) == 2 and any(d[0] for d in nb) and any(d[1] for d in nb):   # 縦と横の隣が 1 つずつ（直角）
            vy = next(d[0] for d in nb if d[0]); vx = next(d[1] for d in nb if d[1])
            corners.append((abs(y - jy) + abs(x - jx), y, x, -vy, -vx))   # 外側は、腕の反対（-vy, -vx）
    cands = []
    for _, cy, cx, oy, ox in sorted(corners):
        # 道は幅 3（中心線の両側 1 マス）。縁に接するのは、外側へ 2 マスのところ
        cands += [(cy + oy, cx + 2 * ox), (cy + 2 * oy, cx + ox), (cy + 2 * oy, cx + 2 * ox)]
    cands += [(jy + 2 * dy, jx + 2 * dx) for dy, dx in ((1, 1), (1, -1), (-1, 1), (-1, -1))]   # 曲がり角がなければ、分かれ道の斜め
    for y, x in cands:
        if free(y, x):
            obj[y, x] = ord(SIGN_CH)
            return (y, x), msg
    raise AssertionError(f'道しるべを置く空きマスがない {junction}')


def end_sign(t, obj, end, goal, name, note):
    """道（partial の経路）の終わり end の、道のわきの空きマスに、立て札を置く。文章: 目的地の方角と、街の名前、この先の地形（note）。戻り値: ((行, 列), 文章)"""
    ey, ex = end
    vy, vx = goal[0] - ey, goal[1] - ex
    d = COMPASS[((1 if vy > 0 else -1), 0)] if abs(vy) > abs(vx) else COMPASS[(0, (1 if vx > 0 else -1))]
    msg = f'{d}: {name}（この先は{note}。石畳の道は、ここまで）'
    def free(y, x):
        return t['land'][y, x] and not (t['deep'][y, x] or t['shallow'][y, x] or t['bridge'][y, x]) and chr(obj[y, x]) not in (ROAD_CH, BRIDGE_CH, '6', '7', '8', '9')
    sy, sx = (1 if vy > 0 else -1 if vy < 0 else 0), (1 if vx > 0 else -1 if vx < 0 else 0)
    cands = [(ey + 2 * sy, ex + 2 * sx), (ey + 2 * sy, ex - 2 * sx), (ey - 2 * sy, ex + 2 * sx)] + [(ey + 2 * a, ex + 2 * b) for a in (-1, 0, 1) for b in (-1, 0, 1) if a or b] + [(ey + 3 * a, ex + 3 * b) for a in (-1, 0, 1) for b in (-1, 0, 1) if a or b]
    for y, x in cands:
        if free(y, x):
            obj[y, x] = ord(SIGN_CH)
            return (y, x), msg
    raise AssertionError(f'道の終わりの立て札を置く空きマスがない {end}')


def flatten(elev, path, pinned=None):
    """道の中心線の高さを、隣どうしで 1 以下の段差のなだらかな坂にして（もとの高さになるべく近く）、道の幅 3 マスに、その高さを敷き、
    まわりの地形を、隣どうしの段差 1 以下でなだらかにつなぐ（山の斜面を、道に沿って少し削る・盛る）。pinned: 直さないマス（水・海・橋のまわり。水の高さは 0 のまま）。
    戻り値: 直したマス数"""
    H, W = elev.shape
    before = elev.copy()
    h = [int(elev[c]) for c in path]
    for i in range(1, len(h)): h[i] = min(max(h[i], h[i - 1] - 1), h[i - 1] + 1)
    for i in range(len(h) - 2, -1, -1): h[i] = min(max(h[i], h[i + 1] - 1), h[i + 1] + 1)
    for (y, x), v in zip(path, h):
        for dy in range(-1, 2):
            for dx in range(-1, 2):
                yy, xx = y + dy, x + dx
                if 0 <= yy < H and 0 <= xx < W and not (pinned is not None and pinned[yy, xx]): elev[yy, xx] = v
    ys, xs = [c[0] for c in path], [c[1] for c in path]
    y0, y1, x0, x1 = max(0, min(ys) - 60), min(H, max(ys) + 61), max(0, min(xs) - 60), min(W, max(xs) + 61)
    sub = elev[y0:y1, x0:x1].astype(np.int32)
    fixed = pinned[y0:y1, x0:x1].copy() if pinned is not None else np.zeros(sub.shape, bool)
    fixed[0, :] = fixed[-1, :] = fixed[:, 0] = fixed[:, -1] = True   # 範囲の端は、直さない
    for _ in range(400):   # 隣どうしの段差 1 以下になるまで、直さないマス以外を、隣に合わせる
        p_ = np.pad(sub, 1, mode='edge')
        nb = np.stack([p_[:-2, 1:-1], p_[2:, 1:-1], p_[1:-1, :-2], p_[1:-1, 2:]])
        lo, hi = nb.max(axis=0) - 1, nb.min(axis=0) + 1
        new = np.where(lo <= hi, np.clip(sub, lo, hi), hi)
        new = np.where(fixed, sub, new)
        if (new == sub).all(): break
        sub = new
    elev[y0:y1, x0:x1] = sub.astype(elev.dtype)
    return int((elev != before).sum())


def merge_parallel(t, obj, elev, keep_chars, max_gap=2, span=3):
    """近くで並行して進む 2 本の道（間のすきま max_gap マス以下）を、1 本の道に統合する（すきまを石畳で埋める）。すきまが、道の向き（span マス前後）に続くところだけ（曲がり角・分かれ道は、埋めない）。
    すきまのマスは、両側の石畳との高さの差が 1 以下のところだけ。水・橋・keep_chars（街の壁・門・立て札など）は、埋めない。戻り値: 埋めたマス数"""
    H, W = obj.shape
    road = np.isin(obj, [ord(ROAD_CH), ord(BRIDGE_CH)])
    water = t['deep'] | t['shallow'] | t['bridge'] | t['lagoon'] | ~t['land']
    keep = np.isin(obj, [ord(c) for c in keep_chars]) | np.isin(obj, [ord(BRIDGE_CH)])
    e = elev.astype(np.int32)
    fill = np.zeros((H, W), bool)
    for axis in (1, 0):   # 1: 横のすきま（縦に並ぶ道）・0: 縦のすきま
        r = road if axis == 1 else road.T
        ee = e if axis == 1 else e.T
        h, w = r.shape
        for g in range(1, max_gap + 1):
            # 行ごと: x に、すきま（g マスの道でないマス）があり、左右に道
            ok = np.zeros((h, w), bool)
            for x in range(1, w - g):
                left, right = r[:, x - 1], r[:, x + g]
                gapfree = ~r[:, x:x + g].any(axis=1)
                ok[:, x] = left & right & gapfree & (np.abs(ee[:, x - 1] - ee[:, x + g]) <= 1 + g)
            # すきまが、縦（道の向き）に続く: 前後 span 行のうち、ほとんど（2 * span + 1 のうち 2 * span 以上）で、同じ形
            run = np.zeros((h, w), np.int32)
            for d in range(-span, span + 1):
                run += np.roll(ok, d, axis=0).astype(np.int32)
            ok &= run >= 2 * span
            for x in range(1, w - g):
                cols = ok[:, x]
                if not cols.any(): continue
                for k in range(g):
                    xx = x + k
                    good = cols & ~(water[:, xx] if axis == 1 else water.T[:, xx]) & ~(keep[:, xx] if axis == 1 else keep.T[:, xx]) \
                        & (np.abs(ee[:, xx] - ee[:, x - 1]) <= 1) & (np.abs(ee[:, xx] - ee[:, x + g]) <= 1)
                    if axis == 1: fill[:, xx] |= good
                    else: fill[xx, :] |= good
    obj[fill & ~road] = ord(ROAD_CH)
    return int(fill.sum())


def merge_loop(t, path, set_c, near_r):
    """循環する道の、街道のすぐわき（near_r マス以内）を 10 マス超続く区間を切り捨て、両端を街道につなぐ（2 本を 1 つにして、途中で分岐）。戻り値: (新しい経路, 分岐の数)"""
    near = [any((y + dy, x + dx) in set_c for dy in range(-near_r, near_r + 1) for dx in range(-near_r, near_r + 1)) for (y, x) in path]
    keep_i = [True] * len(path); joins = []
    i = 20
    while i < len(path) - 20:
        if not near[i]: i += 1; continue
        j = i
        while j < len(path) - 20 and near[j]: j += 1
        if j - i > 10:
            for q in range(i, j): keep_i[q] = False
            joins += [path[i - 1], path[j]]
        i = j
    if not joins: return path, 0
    nearest = lambda p_: min(set_c, key=lambda c: abs(c[0] - p_[0]) + abs(c[1] - p_[1]))
    parts = [path[q] for q in range(len(path)) if keep_i[q]]
    for p_ in joins:
        link = find_path(t, p_, nearest(p_), margin=60, reuse=set_c) or find_path(t, p_, nearest(p_), margin=60, reuse=set_c, rough=True)   # 通常の探索で行けない所（火山の裾など）は、山・坂を通る方式で、街道につなぐ
        if link: parts += link
    return parts, len(joins)


def fix_steps(elev, obj, t, hi=8):
    """道の地ならし（flatten）のあとに残った、高さの差 2 以上の段（どちらも hi 未満＝崖でない所）を、高いほうを下げて、1 以下にする。
    道・橋・水のマスは動かさない（高いほうが道なら、低いほうを上げる）。崖（hi 以上）は、そのまま。戻り値: 直したマス数"""
    keep = np.isin(obj, [ord(ROAD_CH), ord(BRIDGE_CH)]) | t['deep'] | t['shallow'] | t['bridge'] | t['lagoon'] | ~t['land']
    n = 0
    for _ in range(40):
        changed = 0
        for ax in (0, 1):
            for sl_a, sl_b in (((slice(1, None), slice(None)), (slice(None, -1), slice(None))), ((slice(None), slice(1, None)), (slice(None), slice(None, -1)))):
                if ax == 1 and sl_a[1] == slice(None): continue
                if ax == 0 and sl_a[0] == slice(None): continue
                a, b = elev[sl_a], elev[sl_b]; ka, kb = keep[sl_a], keep[sl_b]
                for (x, y, kx, ky) in ((a, b, ka, kb), (b, a, kb, ka)):   # x が高いほう
                    bad = (x - y > 1) & (x < hi) & (y < hi)
                    lower = bad & ~kx
                    x[lower] = (y + 1)[lower]; changed += int(lower.sum())
                    raise_ = bad & kx & ~ky & (x - y > 1)
                    y[raise_] = (x - 1)[raise_]; changed += int(raise_.sum())
        n += changed
        if not changed: break
    return n
