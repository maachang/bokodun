"""世界の地形: 海岸の形・南国の海岸・池・砂漠の拡張"""
import numpy as np
from PIL import Image, ImageDraw
from terrain_base import CONIFER, DESERT, GH, GRASS, GW, H, MESH, SEA, SNOW, TROPICAL, W, _distance, _fill_holes, _largest, _mesh_frac, _mode_filter, box_mean, fbm


def _reshape_coast(land, lake, biome, max_water=0.5):
    """海や湖が大半のマップを、なくす。水（海・湖）が max_water を超えるメッシュは、陸に近い海から順に陸にして、水の割合を下げる
    （海岸線が、外へ広がる）。広がる距離は、メッシュごとに決めて、メッシュの間でなめらかにつなぐ（双一次補間）。
    陸のないメッシュには広げず、その手前で、なだらかに 0 にする（まっすぐな切れ目を作らない）。"""
    land0 = land.copy()
    frac0 = _mesh_frac(land0)
    active = np.kron(frac0 > 0, np.ones((MESH, MESH), bool))                      # 陸のあるメッシュ（タイルの範囲）
    ramp = np.clip((_distance(~active) - 3) / 22.0, 0, 1).astype(np.float32)     # 空のメッシュに近いほど 0
    dland = _distance(land0).astype(np.float32)
    noise_d = (fbm(55, (40, 14, 5)) - 0.5) * 12
    thr_grid = np.zeros((GH, GW), np.float32)
    land_new = land0
    for _ in range(40):
        thr_tile = np.asarray(Image.fromarray(thr_grid).resize((W, H), Image.BILINEAR))
        land_new = land0 | ((dland + noise_d) <= thr_tile * ramp)
        water = (~land_new) | lake
        wf = _mesh_frac(water)
        viol = (wf > max_water) & (frac0 > 0)
        if not viol.any(): break
        thr_grid[viol] += 3
    land = land_new
    # 角を丸める
    land = box_mean(land.astype(np.float32), 5) > 0.5
    # 広げても陸が少ししかないメッシュは、なくす
    f = _mesh_frac(land)
    for j in range(GH):
        for i in range(GW):
            if 0 < f[j, i] < 0.15:
                land[j * MESH:(j + 1) * MESH, i * MESH:(i + 1) * MESH] = False
    land = land & np.kron(_mesh_frac(land) > 0, np.ones((MESH, MESH), bool))
    lake = lake & land
    # 新しい陸の地形: いちばん近い陸の種類（4 近傍へ、1 マスずつ広げる。向きの偏りを避けるため、マスごとにランダムな順で見る）
    b = biome.copy(); known = (biome != SEA) & land
    b[~known] = 255
    pick = (np.random.default_rng(5).integers(0, 4, size=(H, W))).astype(np.int8)
    dirs = [(1, 0), (-1, 0), (0, 1), (0, -1)]
    for _ in range(120):
        if known[land].all(): break
        nbs = [(np.roll(np.roll(b, dy, 0), dx, 1), np.roll(np.roll(known, dy, 0), dx, 1)) for dy, dx in dirs]
        newb = b.copy(); newk = known.copy()
        for k in range(4):
            for d in range(4):
                nb, nk = nbs[d]
                take = land & ~newk & nk & (((pick + k) % 4) == d)
                newb[take] = nb[take]; newk |= take
        b, known = newb, newk
    b[~land] = SEA
    b[land & (b == 255)] = GRASS
    smooth = _mode_filter(np.where(land, b, GRASS).astype(np.uint8), 8, 25)   # 広げた所の、縞（1 方向に伸びた筋）を、なだらかに
    new_land = land & ~land0
    b = np.where(new_land, smooth, b)
    b[~land] = SEA
    return land, lake, b.astype(np.uint8)


def _shape_coast(land, lake, biome, max_water=0.5):
    """海岸線に、入り江（湾）と岬・半島を作る（43-55）。海岸線を、大きな周期のノイズで、内へ最大 8 マス・外へ最大 12 マス動かす。
    陸のないメッシュには広げない（その手前でなだらかに 0）。水が max_water を超えるメッシュは、そのメッシュの動きを、外へ寄せて、直す。新しい陸の地形は、近い陸の地形。"""
    frac0 = _mesh_frac(land)
    active = np.kron(frac0 > 0, np.ones((MESH, MESH), bool))
    ramp = np.clip((_distance(~active) - 3) / 14.0, 0, 1).astype(np.float32)
    d_in = _distance(~land).astype(np.float32)              # 陸の内側へ、海岸からの距離
    d_out = _distance(land).astype(np.float32)              # 海の側へ、海岸からの距離
    signed = np.where(land, d_in, -d_out)                   # 陸: 正・海: 負
    coast_n = fbm(56, (70, 26, 8)); coast_n2 = fbm(57, (30, 11, 4))
    move = (coast_n - 0.5) * 2 * 16 + (coast_n2 - 0.5) * 2 * 4       # 負: 内へ（入り江）、正: 外へ（岬）
    move = np.clip(move, -8, 12)
    bias_grid = np.zeros((GH, GW), np.float32)
    new_land = land
    for _ in range(30):
        bias = np.asarray(Image.fromarray(bias_grid).resize((W, H), Image.BILINEAR))
        new_land = ((signed + (move + bias) * ramp) > 0) & active
        new_land = box_mean(new_land.astype(np.float32), 5) > 0.5
        wf = _mesh_frac((~new_land) | lake)
        viol = (wf > max_water) & (frac0 > 0)
        if not viol.any(): break
        bias_grid[viol] += 2
    new_land = _fill_holes(_largest(new_land | (land & (d_in >= 9))))   # 陸が、ちぎれない・内陸の穴を作らない
    lake = lake & new_land
    # 新しい陸の地形: いちばん近い陸の種類
    known = land & new_land
    b = np.where(known, biome, 255).astype(np.uint8)
    pick = (np.random.default_rng(6).integers(0, 4, size=(H, W))).astype(np.int8)
    dirs = [(1, 0), (-1, 0), (0, 1), (0, -1)]
    for _ in range(40):
        if known[new_land].all(): break
        nbs = [(np.roll(np.roll(b, dy, 0), dx, 1), np.roll(np.roll(known, dy, 0), dx, 1)) for dy, dx in dirs]
        newb = b.copy(); newk = known.copy()
        for k in range(4):
            for d in range(4):
                nb, nk = nbs[d]
                take = new_land & ~newk & nk & (((pick + k) % 4) == d)
                newb[take] = nb[take]; newk |= take
        b, known = newb, newk
    b[new_land & (b == 255)] = GRASS
    b[~new_land] = SEA
    return new_land, lake, b.astype(np.uint8)


def _tropical_coast(land, biome):
    """南国の海岸を作り込む。入り江（ラグーン）2 つ（陸を削って、浅い青緑の水に）・沖の小島 3 つ（陸を足す）・小島へ歩いて渡れる砂州（浅瀬）・内陸の池。
    戻り値: land, biome, lagoon（入り江・砂州・池のふち＝歩ける浅瀬）, pond（池の深い所）"""
    rng = np.random.default_rng(88)
    trop = land & (biome == TROPICAL)
    lagoon = np.zeros((H, W), bool); pond = np.zeros((H, W), bool)
    if trop.sum() < 2000: return land, biome, lagoon, pond
    dsea = _distance(~land)
    ys, xs = np.nonzero(trop & (dsea <= 2))
    cy_c, cx_c = np.nonzero(trop)[0].mean(), np.nonzero(trop)[1].mean()
    south = ys > np.median(ys)                                   # 南側の海岸
    ys, xs = ys[south], xs[south]
    order = np.argsort(xs); ys, xs = ys[order], xs[order]
    def anchor(q):
        i = int(len(xs) * q); return int(xs[i]), int(ys[i])
    Y, X = np.mgrid[0:H, 0:W].astype(np.float32)
    noise_e = (fbm(97, (12, 5, 2)) - 0.5) * 0.35
    def ellipse(cx, cy, rx, ry): return ((X - cx) / rx) ** 2 + ((Y - cy) / ry) ** 2 + noise_e < 1.0
    # 入り江: 海岸から、内陸（南国の中心）へ向かって、くぼませる
    for q in (0.28, 0.68):
        ax, ay = anchor(q)
        dx, dy = cx_c - ax, cy_c - ay; L = np.hypot(dx, dy) or 1
        cx, cy = ax + dx / L * 12, ay + dy / L * 12
        e = ellipse(cx, cy, 16, 11)
        lagoon |= e & (land | ~land)
    # 沖の小島と砂州（浅瀬）: 海岸から外へ
    active_mesh = _mesh_frac(land) > 0
    islets = []
    for q in (0.12, 0.48, 0.86):
        ax, ay = anchor(q)
        dx, dy = ax - cx_c, ay - cy_c; L = np.hypot(dx, dy) or 1
        # 小島は、陸のあるメッシュの中に置く（海だけのメッシュに、小さな島だけのマップを、作らない）。届かなければ、海岸に近づける
        for dist in range(26, 7, -2):
            cx, cy = ax + dx / L * dist, ay + dy / L * dist
            pts = [(int(cx + a), int(cy + b)) for a in (-10, 0, 10) for b in (-8, 0, 8)]
            if all(0 <= x_ < W and 0 <= y_ < H and active_mesh[y_ // MESH, x_ // MESH] for x_, y_ in pts): break
        else:
            continue
        islets.append((cx, cy, ax, ay))
    land = land & ~lagoon
    for cx, cy, ax, ay in islets:
        isle = ellipse(cx, cy, 8, 6)
        land = land | isle
        biome = np.where(isle & ~land | isle, TROPICAL, biome)
        # 砂州: 海岸から小島へ、幅 3 マスの浅瀬
        bar = Image.new('L', (W, H), 0); ImageDraw.Draw(bar).line([(ax, ay), (cx, cy)], fill=255, width=3)
        bar = (np.asarray(bar) > 0) & ~land
        lagoon |= bar
    # 入り江は、浅瀬（歩ける）。入り江のまわりの陸も、南国
    biome = np.where(land & (biome == SEA), TROPICAL, biome)
    # 内陸の池: 南国の内陸（海から 22 マス以上）に、4 つ
    Yg, Xg = np.mgrid[0:H, 0:W]
    inland = np.argwhere(land & (biome == TROPICAL) & (_distance(~land) >= 22) & ~_near_seam(Yg, Xg, 10))
    if len(inland):
        picks = inland[rng.choice(len(inland), size=min(4, len(inland)), replace=False)]
        for py, px in picks:
            rx, ry = rng.uniform(4.5, 7), rng.uniform(3.5, 5.5)
            e = ellipse(px, py, rx, ry)
            ring = ellipse(px, py, rx + 1.8, ry + 1.8) & ~e
            pond |= e & land; lagoon |= ring & land
    return land, biome, lagoon, pond


def _avoid_seams(path, margin):
    """川の道筋（点の並び）を、マップの境界線（64 マスごと）から、margin マス以上離す。
    境界を越えて、隣のマップへ続く（渡っている）所は、そのまま。境界のそばを、渡らずに流れる所だけ、境界から離す（境界のすぐ隣が川だと、
    境界を越えた人が、川の中に出て、押し出されて、向こう岸へ渡ってしまうため）"""
    pts = [list(p) for p in path]
    n = len(pts)
    for axis, size, count in ((0, W, GW), (1, H, GH)):
        for k in range(1, count):
            sline = k * MESH
            for i in range(n):
                v = pts[i][axis]
                if abs(v - sline) >= margin: continue
                lo, hi = max(0, i - 6), min(n - 1, i + 6)
                prev = np.mean([pts[j][axis] for j in range(lo, i + 1)]); nxt = np.mean([pts[j][axis] for j in range(i, hi + 1)])
                a, b = np.sign(prev - sline), np.sign(nxt - sline)
                if a != 0 and a == b: pts[i][axis] = sline + a * margin   # 前後とも、同じ側: 渡っていない → 境界から離す
    return [tuple(p) for p in pts]


def _near_seam(mask_y, mask_x, dist):
    """(y, x) が、マップの境界線（64 マスごと）から、dist マス以内か"""
    return ((mask_x % MESH) < dist) | ((mask_x % MESH) >= MESH - dist) | ((mask_y % MESH) < dist) | ((mask_y % MESH) >= MESH - dist)


def _grass_ponds(land, biome):
    """草原の、ため池。小さい池（深い水）と、浅いふち。川・海・山から離して、点々と置く（43-54）。戻り値: pond, ring"""
    rng = np.random.default_rng(93)
    Y, X = np.mgrid[0:H, 0:W].astype(np.float32)
    band = land & (biome == GRASS) & (_distance(~land) >= 16) & ~_near_seam(Y.astype(int), X.astype(int), 12) & (Y > 330)
    cand = np.argwhere(band)
    pond = np.zeros((H, W), bool); ring = np.zeros((H, W), bool)
    if len(cand) == 0: return pond, ring
    noise_e = (fbm(94, (12, 5, 2)) - 0.5) * 0.5
    picks = []
    for _ in range(3000):
        y, x = cand[rng.integers(len(cand))]
        if all((y - py) ** 2 + (x - px) ** 2 > 70 ** 2 for py, px in picks): picks.append((y, x))
        if len(picks) >= 14: break
    for py, px in picks:
        rx, ry = rng.uniform(3.5, 6.5), rng.uniform(3.0, 5.5)
        e = ((X - px) / rx) ** 2 + ((Y - py) / ry) ** 2 + noise_e < 1.0
        ring_e = ((X - px) / (rx + 1.6)) ** 2 + ((Y - py) / (ry + 1.6)) ** 2 + noise_e < 1.0
        pond |= e & land; ring |= (ring_e & ~e) & land
    return pond, ring


def _foothill_ponds(land, biome):
    """雪山の裾野（雪・針葉樹の地形の、南側の帯）に、小さな池を置く。半分は凍った池（氷の地面。歩ける）、半分は雪解けの池（深い水＋浅いふち）。
    戻り値: pond（深い水）, ring（浅いふち）, frozen（凍った池＝氷の地面にする所）"""
    rng = np.random.default_rng(91)
    Y, X = np.mgrid[0:H, 0:W].astype(np.float32)
    band = land & np.isin(biome, [SNOW, CONIFER]) & (Y > 250) & (Y < 390) & (_distance(~land) >= 12) & ~_near_seam(Y.astype(int), X.astype(int), 10)   # 池は、境界線から離す
    cand = np.argwhere(band)
    pond = np.zeros((H, W), bool); ring = np.zeros((H, W), bool); frozen = np.zeros((H, W), bool)
    if len(cand) == 0: return pond, ring, frozen
    noise_e = (fbm(98, (12, 5, 2)) - 0.5) * 0.4
    picks = []
    for _ in range(400):
        y, x = cand[rng.integers(len(cand))]
        if all((y - py) ** 2 + (x - px) ** 2 > 45 ** 2 for py, px in picks): picks.append((y, x))
        if len(picks) >= 12: break
    for n, (py, px) in enumerate(picks):
        rx, ry = rng.uniform(4.5, 8), rng.uniform(3.5, 6)
        e = ((X - px) / rx) ** 2 + ((Y - py) / ry) ** 2 + noise_e < 1.0
        ring_e = ((X - px) / (rx + 1.8)) ** 2 + ((Y - py) / (ry + 1.8)) ** 2 + noise_e < 1.0
        if n % 2 == 0: frozen |= ring_e & land                          # 凍った池: 氷の地面（歩ける）
        else: pond |= e & land; ring |= (ring_e & ~e) & land            # 雪解けの池
    return pond, ring, frozen


def _components(mask):
    """True の所の、連結成分の番号（4 近傍。1 から）"""
    lab = np.zeros((H, W), np.int32); n = 0
    for y0, x0 in zip(*np.nonzero(mask)):
        if lab[y0, x0]: continue
        n += 1; st = [(y0, x0)]; lab[y0, x0] = n
        while st:
            y, x = st.pop()
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                yy, xx = y + dy, x + dx
                if 0 <= yy < H and 0 <= xx < W and mask[yy, xx] and not lab[yy, xx]: lab[yy, xx] = n; st.append((yy, xx))
    return lab


def _expand_desert_north(land, biome, reach=22):
    """砂漠を、北（上）へ広げる。草原の地形のうち、砂漠のすぐ北（reach マス以内。ゆらぎあり）を、砂漠にする。雪・森・岩山・海には、広げない"""
    n = (fbm(71, (30, 10, 4)) - 0.5) * 2.0                         # -1〜1
    R = np.clip(reach * (0.65 + 0.55 * n), 0, reach * 1.2)          # 列ごと・場所ごとの、広げる量（ゆらぎ）
    out = biome.copy()
    d = np.full(W, 10 ** 6, np.int32)                                # 各列の、すぐ南にある砂漠までの距離
    for y in range(H - 1, -1, -1):
        d = np.where(biome[y] == DESERT, 0, np.minimum(d + 1, 10 ** 6))
        grow = (biome[y] == GRASS) & land[y] & (d <= R[y])
        out[y] = np.where(grow, DESERT, out[y])
    return out


def _harbor_inlet(land, biome, towns, tid='e', gap=0, w_top=26, w_sea=28, w_mouth=66, r_corner=10, past=70):
    """港町（E）の東に、街のすぐ横から海になる湾をのばす（ユーザー指示「街の右横は、すぐ海」「海の出口の浅瀬・小島は、船の通行の邪魔になるので、全部海に」）。
    西の岸は、街の壁の東（gap マス先）から、ほぼまっすぐ（±1 のゆらぎ）。東の岸は、幅 w_top → w_sea へ広がる。北の角は丸い。南は、海岸・出口の浅瀬・小島・砂州（海岸の先 past マス）を、すべて海にして、沖へ通す。
    land（陸の真偽）と biome を、その場で書きかえる（水にした所は、海）。戻り値: (掘ったマス数, 湾と航路の真偽。浅瀬・小島にしない所の印)"""
    H_, W_ = land.shape
    site = next((s_ for s_ in towns if s_['id'] == tid), None)
    if site is None: return 0, np.zeros((H_, W_), bool)
    cy, cx = site['y'], site['x']
    x_w = cx + 8 + gap                       # 西の岸（街の壁の東端は、中心 + 8）
    y_top = cy - 12
    xc = x_w + w_top // 2
    y, run = cy + 20, 0
    while y < H_ - 1 and run < 12:           # 海岸（中心線が、本物の海に出る行）: 内陸の池・湖・入り江（陸の中の水）では止まらない
        run = run + 1 if not land[y, min(W_ - 1, xc)] else 0
        y += 1
    y_end = min(H_ - 1, y - 12 + past)
    y_mouth = y - 12 - 2                     # 出口が開き始める行（海岸のあたり）
    carved = 0
    mask = np.zeros((H_, W_), bool)
    for yy in range(y_top, y_end + 1):
        t = min(1.0, max(0.0, (yy - y_top) / max(1, (y - 12) - y_top)))
        x0 = x_w                                 # 西の岸は、壁のすぐ東から、まっすぐ（隙間をつくらない）
        x1 = x_w + int(w_top + (w_sea - w_top) * t) + int(round(2.0 * np.sin(yy / 11.0)))
        if yy >= y_mouth:                                                # 出口（海岸から先）は、東へ大きく開く: 浅瀬・小島・砂州を、すべて海にする
            ramp = min(1.0, (yy - y_mouth) / 8.0)
            x1 = max(x1, x_w + int(w_sea + (w_mouth - w_sea) * ramp))
        for xx in range(x0, x1 + 1):
            if not (0 <= xx < W_): continue
            dy = y_top + r_corner - yy                                   # 北の東の角だけ丸くする（西の角は、壁のすぐ横まで、四角のまま）
            if dy > 0:
                if xx > x1 - r_corner and np.hypot(xx - (x1 - r_corner), dy) > r_corner: continue
            if land[yy, xx]: carved += 1
            land[yy, xx] = False; biome[yy, xx] = SEA; mask[yy, xx] = True
    return carved, mask


def _lake_bay(lake, towns, tid='i', x_from=950):
    """湖の東岸の街（I カナロア公国）: 壁の西側（壁の行すべて）のすぐ西まで、湖の水を広げる（水の都。壁と湖の間に、地面を残さない）。湖はもとからつながっているので、細い入り江にはならない。戻り値: (湖, 広げたマス数)"""
    site = next((s for s in towns if s['id'] == tid), None)
    if site is None: return lake, 0
    lake = lake.copy()
    y0, y1, x1 = site['y'] - 6, site['y'] + 5, site['x'] - 8   # 壁の行（TOWN_HH=6）と、壁の西端の列（TOWN_HW=8）
    before = int(lake.sum())
    lake[y0:y1 + 1, x_from:x1] = True
    return lake, int(lake.sum()) - before
