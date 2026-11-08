"""世界の地形: 山・山道・峡谷の橋"""
import numpy as np
from collections import deque
from terrain_base import H, MAX_LEVEL, PEAKS_ROCK, PEAKS_SNOW, ROCK, SNOW, W, _distance, fbm
from terrain_coast import _components, _near_seam


MOUNTAIN_STEP = 6            # 山の段丘の、1 段の高さ（段）。段と段の間は崖（隣のマスの差が 2 以上＝上れない）


TRAIL_PEAKS = []             # build() が、山道の行き先（山頂の広場）を入れる


def _astar4(cost, start, goal, win):
    """4 近傍の A*。cost[y, x] は、そのマスに入る費用（inf は通れない）。win=(y0, y1, x0, x1) の範囲だけ探す"""
    import heapq
    y0, y1, x0, x1 = win
    gy, gx = goal
    INF = 1e18
    dist = {}
    came = {}
    sy_, sx_ = start
    heap = [(0.0, 0.0, sy_, sx_)]
    dist[(sy_, sx_)] = 0.0
    while heap:
        f, g, y, x = heapq.heappop(heap)
        if (y, x) == (gy, gx): break
        if g > dist.get((y, x), INF): continue
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if ny < y0 or ny >= y1 or nx < x0 or nx >= x1: continue
            c = cost[ny, nx]
            if c >= INF: continue
            ng = g + c
            if ng < dist.get((ny, nx), INF):
                dist[(ny, nx)] = ng; came[(ny, nx)] = (y, x)
                h = 0.6 * (abs(ny - gy) + abs(nx - gx))
                heapq.heappush(heap, (ng + h, ng, ny, nx))
    if (gy, gx) not in came and (sy_, sx_) != (gy, gx): return None
    path = [(gy, gx)]
    while path[-1] != (sy_, sx_): path.append(came[path[-1]])
    return path[::-1]


def _zigzag(P, Q, amp, pitch):
    """P から Q へ、主な向き（距離の長いほう）に、pitch マスずつ進みながら、直線から左右に ±amp 折り返す、4 近傍でつながった道"""
    dy, dx = Q[0] - P[0], Q[1] - P[1]
    main = 0 if abs(dy) >= abs(dx) else 1
    pm, pl = (P[0], P[1]) if main == 0 else (P[1], P[0])
    qm, ql = (Q[0], Q[1]) if main == 0 else (Q[1], Q[0])
    sm = 1 if qm >= pm else -1
    span = abs(qm - pm)
    line = lambda m: pl + (ql - pl) * (m - pm) / (qm - pm) if qm != pm else pl
    way = [(pm, pl)]
    n = span // pitch
    for k in range(n):
        m0 = pm + sm * k * pitch
        tgt = int(round(line(m0))) + (amp if k % 2 == 0 else -amp)
        way.append((m0, tgt)); way.append((m0 + sm * pitch, tgt))
    way.append((pm + sm * n * pitch, int(round(line(pm + sm * n * pitch)))))
    way.append((qm, ql))
    cells = [(pm, pl)]
    for (m1, l1), (m2, l2) in zip(way, way[1:]):
        m, l = cells[-1]
        while l != l2: l += 1 if l2 > l else -1; cells.append((m, l))
        while m != m2: m += 1 if m2 > m else -1; cells.append((m, l))
    out = [(m, l) if main == 0 else (l, m) for m, l in cells]
    dedup = [out[0]]
    for c in out[1:]:
        if c != dedup[-1]: dedup.append(c)
    return dedup


def _switchback(path, e, ok, amp=5, pitch=4, min_len=12, max_len=60, min_grade=0.4):
    """つづら折り: 山道の、急な所（直線距離あたりの高さの上がりが min_grade 以上・直線距離 12〜60 マス）を、左右に折り返す道（振れ幅 amp・折り返しの間隔 pitch）に置き換える。
    置き換え先のマスが、すべて通れる（ok）ときだけ。始点・終点は変わらない（つながりは保つ）。登る道の傾きは、約 1/3.5 に下がる"""
    n = len(path); out = []; i = 0
    while i < n:
        done = False
        for j in range(min(n - 1, i + max_len), i + min_len - 1, -1):
            P, Q = path[i], path[j]
            L = abs(P[0] - Q[0]) + abs(P[1] - Q[1])
            if L < min_len or abs(int(e[Q]) - int(e[P])) < min_grade * L: continue
            zz = _zigzag(P, Q, amp, pitch)
            if zz[-1] == Q and all(0 <= a < H and 0 <= b < W and ok[a, b] for a, b in zz):
                out.extend(zz[:-1]); i = j; done = True
                break
        if not done:
            out.append(path[i]); i += 1
    return out


def _mountains(elev, land, biome, blocked, sx, sy):
    """連峰・山脈: 高い所を、段丘（崖で区切られた、広い段）にして、上れない所を作る。段丘のところどころに、ゆるやかな斜面（自然の坂）。
    人が作った山道（4 近傍の A*。等高線に沿って、ジグザグに上る）を、段丘に切り込む（道は、元のなだらかな高さ）。山頂に、広場。
    戻り値: elev, trail（山道のマス）, arenas（山頂の広場 [(y, x, 高さ)]）"""
    Y, X = np.mgrid[0:H, 0:W]
    T0 = np.where(biome == SNOW, 8, 6)
    zone = land & np.isin(biome, [SNOW, ROCK]) & (elev >= T0)
    s_ = elev + (fbm(111, (30, 10, 4)) - 0.5) * 5.0
    q = (T0 + MOUNTAIN_STEP * np.round((s_ - T0) / MOUNTAIN_STEP)).astype(np.int32)
    ramp = fbm(112, (20, 7, 3)) > 0.64                                   # 自然の坂（段丘の、ゆるやかな所）
    near_seam = _near_seam(Y, X, 3)                                        # 隣のマップとの境は、なだらか
    near_seam10 = _near_seam(Y, X, 10)
    d_blk = _distance(blocked)
    use_q = zone & ~ramp & ~near_seam & (d_blk > 3)
    out = np.where(use_q, np.minimum(q, MAX_LEVEL), elev).astype(np.int32)
    # 山頂の広場（山頂ごと）。山頂は、なだらかな高さの、最も高い所
    arenas = []
    for px, py, ph, ps in PEAKS_SNOW + PEAKS_ROCK:
        cy, cx = int(py * sy), int(px * sx)
        if not (0 <= cy < H and 0 <= cx < W): continue
        y0, y1, x0, x1 = max(0, cy - 14), min(H, cy + 15), max(0, cx - 14), min(W, cx + 15)
        sub = np.where(land[y0:y1, x0:x1] & ~near_seam10[y0:y1, x0:x1], elev[y0:y1, x0:x1], -1)   # 広場は、境界線から 10 マス離す
        if sub.max() < 6: continue
        iy, ix = np.unravel_index(np.argmax(sub), sub.shape); ay, ax = y0 + iy, x0 + ix
        arenas.append((int(ay), int(ax), int(elev[ay, ax])))
    # 山道: 麓（草原の低い所）から、山頂の広場へ。先にできた道は、使いやすい（費用が安い）ので、幹と枝になる
    trail = np.zeros((H, W), bool)
    arena_h = {}
    base = np.where(blocked | ~land, 1e18, 1.0)
    ef = elev.astype(np.float32)
    low = land & ~blocked & (elev <= 6)
    lab = _components(low)                                                # 低い所の、つながり。いちばん大きいもの（本土）から、山道を始める
    big = int(np.argmax(np.bincount(lab.ravel())[1:])) + 1
    starts_ok = (lab == big) & (elev <= 3) & ~near_seam
    sy_idx, sx_idx = np.nonzero(starts_ok)
    for ay, ax, ah in sorted(arenas, key=lambda a: -a[0]):                 # 南の山頂から
        d2 = (sy_idx - ay) ** 2 + (sx_idx - ax) ** 2
        k = int(np.argmin(d2)); st = (int(sy_idx[k]), int(sx_idx[k]))
        y0, y1 = max(0, min(st[0], ay) - 60), min(H, max(st[0], ay) + 60)
        x0, x1 = max(0, min(st[1], ax) - 60), min(W, max(st[1], ax) + 60)
        # 費用: 1 マス 1 + 傾き（高さの差）×5。先にできた道は 0.2（使い回す）
        cost = np.full((H, W), 1e18)
        sub_b = base[y0:y1, x0:x1]
        up = np.zeros_like(ef[y0:y1, x0:x1])
        e_sub = ef[y0:y1, x0:x1]
        gy_ = np.abs(np.diff(e_sub, axis=0, prepend=e_sub[:1])); gx_ = np.abs(np.diff(e_sub, axis=1, prepend=e_sub[:, :1]))
        slope = np.maximum(gy_, gx_)
        cs = sub_b * (1.0 + 5.0 * slope)
        cs = np.where(trail[y0:y1, x0:x1], 0.2, cs)
        cost[y0:y1, x0:x1] = cs
        path = _astar4(cost, st, (ay, ax), (y0, y1, x0, x1))
        if path is None: continue
        path = _switchback(path, elev, land & ~blocked)
        for y, x in path: trail[y, x] = True
        for y, x in path:                                                # 広場の高さ: 道が広場（半径 6）に入る最初のマスの、なだらかな高さ（広場と道が、段差 1 以内でつながる）
            if (y - ay) ** 2 + (x - ax) ** 2 <= 36:
                arena_h[(ay, ax)] = int(elev[y, x]); break
    # 近道の山道（輪）: 山道を歩くと遠回りの 2 点（直線で 14〜40 マス・山道の距離が 3 倍以上）を、新しい道で結ぶ。分かれ道・回り道ができる（半分迷路）
    from collections import deque
    def tdist_(src, limit=260):
        d = {src: 0}; q = deque([src])
        while q:
            y, x = q.popleft()
            if d[(y, x)] >= limit: continue
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                n = (y + dy, x + dx)
                if n in d or not (0 <= n[0] < H and 0 <= n[1] < W) or not trail[n]: continue
                d[n] = d[(y, x)] + 1; q.append(n)
        return d
    rng2 = np.random.default_rng(77)
    ty, tx = np.nonzero(trail & (elev >= 3))
    n_loop = 0; dbg = {'c': 0, 'p': 0}
    for k in rng2.permutation(len(ty))[:1500]:
        if n_loop >= 30: break
        a = (int(ty[k]), int(tx[k]))
        dd = tdist_(a)
        cand = [i for i in range(len(ty)) if 10 <= np.hypot(ty[i] - a[0], tx[i] - a[1]) <= 50 and dd.get((int(ty[i]), int(tx[i])), 999) >= 1.6 * np.hypot(ty[i] - a[0], tx[i] - a[1]) + 10]
        dbg['c'] += bool(cand)
        if not cand: continue
        j = cand[int(rng2.integers(len(cand)))]; b = (int(ty[j]), int(tx[j]))
        y0, y1 = max(0, min(a[0], b[0]) - 12), min(H, max(a[0], b[0]) + 12)
        x0, x1 = max(0, min(a[1], b[1]) - 12), min(W, max(a[1], b[1]) + 12)
        e_sub = ef[y0:y1, x0:x1]
        slope = np.maximum(np.abs(np.diff(e_sub, axis=0, prepend=e_sub[:1])), np.abs(np.diff(e_sub, axis=1, prepend=e_sub[:, :1])))
        cs = base[y0:y1, x0:x1] * (1.0 + 5.0 * slope)
        cs = np.where(trail[y0:y1, x0:x1], 6.0, cs)                          # 今の道は高い費用（新しい道を作らせる）
        cost = np.full((H, W), 1e18); cost[y0:y1, x0:x1] = cs
        path = _astar4(cost, a, b, (y0, y1, x0, x1))
        dbg['p'] += path is not None
        if path is None or len(path) > 4 * np.hypot(a[0] - b[0], a[1] - b[1]) + 20: continue
        for y, x in path: trail[y, x] = True
        n_loop += 1
    print('山道の輪', n_loop, dbg, len(ty))
    # 山道の幅 2 マス（右・下を足す）。高さは、なだらかな高さのまま（切り込む）
    t2 = trail.copy()
    t2[:-1, :] |= trail[1:, :]; t2[:, :-1] |= trail[:, 1:]
    t2 &= land & ~blocked
    out = np.where(t2, elev, out)
    # 山頂の広場: 半径 6 を、平らに（なだらかな高さの、頂上の高さ）
    arenas = [(ay, ax, arena_h.get((ay, ax), ah)) for ay, ax, ah in arenas]
    for ay, ax, ah in arenas:
        d = np.hypot(X - ax, Y - ay)
        m = (d <= 6) & land & ~blocked
        out = np.where(m, ah, out)
        trail |= m & (d <= 5)
    # 吊橋の峡谷: 山道どうしを、まっすぐ（9〜18 マス）結ぶ近道。山道を歩くと遠回りの所だけ（山道の輪＝半分迷路）
    out, bridges, bridge_under = _gorge_bridges(out, trail, t2, land, blocked, _near_seam(Y, X, 5))
    return out, trail, arenas, bridges, bridge_under


def _gorge_bridges(out, trail, t2, land, blocked, near_seam):
    """山道の、まっすぐで同じ高さの所（5〜8 マス）に、峡谷（山道を横切る、幅 14 の溝。床はマップごとの bridgeUnder）と、吊橋（幅 2）をかける。
    橋でないと、その山道は渡れない（溝の両脇は、崖）。戻り値: out（溝の床・橋の高さを反映）, bridges（橋の床のマス）, bridge_under（{(マップ行, マップ列): 谷の底の高さ}）"""
    bridges = np.zeros((H, W), bool)
    gorge = np.zeros((H, W), bool)
    near_b = np.zeros((H, W), bool)
    deck = {}
    ok_cell = land & ~blocked & ~near_seam & ~t2
    ys, xs = np.nonzero(trail)
    rng = np.random.default_rng(31)
    n_bridge = 0
    LAT = list(range(-6, 0)) + list(range(2, 8))
    for k in rng.permutation(len(ys)):
        if n_bridge >= 60: break
        y, x = int(ys[k]), int(xs[k])
        if out[y, x] < 8 or near_b[y, x]: continue
        done = False
        for dy, dx in ((0, 1), (1, 0)):
            py, px = dx, dy
            for ln in (7, 6, 5, 8):
                if not (0 <= y + dy * (ln + 1) + py * 7 < H and 0 <= x + dx * (ln + 1) + px * 7 < W and y + py * -6 >= 0 and x + px * -6 >= 0): continue
                band = [(y + dy * i + py * o, x + dx * i + px * o) for i in range(0, ln + 2) for o in (0, 1)]
                if not all(trail[a] or t2[a] for a in band): continue
                hs = [int(out[a]) for a in band]
                if max(hs) - min(hs) > 1: continue
                D = min(hs)
                if D < 8: continue
                lat = [(y + dy * i + py * o, x + dx * i + px * o) for i in range(1, ln + 1) for o in LAT]
                if not all(ok_cell[a] and not gorge[a] for a in lat): continue
                for a in lat: gorge[a] = True
                for i in range(1, ln + 1):
                    for o in (0, 1):
                        c = (y + dy * i + py * o, x + dx * i + px * o); bridges[c] = True; deck[c] = D; gorge[c] = True
                y0, y1, x0, x1 = max(0, y - 14), min(H, y + 15), max(0, x - 14), min(W, x + 15)
                near_b[y0:y1, x0:x1] = True
                n_bridge += 1; done = True
                break
            if done: break
    M = 64
    under = {}
    for (a, b), D in deck.items():
        key = (a // M, b // M); under[key] = min(under.get(key, 99), max(0, D - 4))
    gy, gx = np.nonzero(gorge)
    for a, b in zip(gy, gx): out[a, b] = under[(a // M, b // M)]
    for (a, b), D in deck.items(): out[a, b] = D
    print('吊橋', n_bridge)
    return out, bridges, under
