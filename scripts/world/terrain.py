"""
ボコスカ島の地図（public/images/objects/island_map.png）から、世界（20×15 メッシュ＝1280×960 マス）の地形を読み取る。
  - 画像（768×640）を、世界（1280×960 マス）に引き伸ばして重ねる。
  - 陸地の輪郭: 色の分類で南側を抜き出し、北の雪山の輪郭は、画像を見て指定した点（NORTH_POLY）で足す。
  - 地形の種類: 色から決める（雪山・針葉樹林・広葉樹の森・草原・砂地・岩山）。
  - 川は、画像を見て指定した線（RIVERS）。湖は、色から読み取る。
  - 高さ: 山の位置（PEAKS_*）と乱数から作り、水辺・海岸に向かって、1 マスに 1 段までの傾きに収める。
結果は、numpy の配列（W×H のマスごと）。毎回、同じ結果になる（乱数は、固定の種）。
"""
import os
import numpy as np
from collections import deque
from PIL import Image, ImageFilter, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
IMAGE = os.path.join(ROOT, 'scripts', 'world', 'island_map_src.png')   # 地形を読み取る元の画像（768×640。巻物と海の余白つき）。ギルドの壁の地図は、余白を切った public/images/objects/island_map.png
GW, GH = 20, 15            # メッシュの数
MESH = 64                  # 1 メッシュのマス数
W, H = GW * MESH, GH * MESH  # 世界のマス数（1280×960）

# 地形の種類（コード）
SEA, SNOW, CONIFER, FOREST, GRASS, DESERT, ROCK, TROPICAL = range(8)
NAMES = ['sea', 'snow', 'conifer', 'forest', 'grass', 'desert', 'rock', 'tropical']

# 南国（画像の南の一帯。川の枝分かれ（中洲）より南の草原。画像の座標）
TROPICAL_POLY = [(335, 470), (430, 495), (520, 515), (600, 525), (610, 560), (520, 580), (440, 576), (400, 548), (360, 512)]
# 炭鉱（画像の遺跡の位置。画像の座標）と、広がり（マス）
MINES = [(612, 405), (505, 470)]
MINE_R = 26

# 北の雪山の輪郭（画像の座標 x, y。画像を見て指定）
NORTH_POLY = [(190, 205), (215, 180), (235, 150), (262, 125), (287, 100), (320, 108), (340, 85), (375, 70), (406, 52), (430, 70), (461, 60), (480, 85), (501, 85), (520, 95), (541, 83), (556, 100), (574, 112), (604, 130), (624, 148), (654, 160), (672, 172), (676, 192), (668, 215), (650, 235), (630, 245), (560, 247), (480, 245), (400, 240), (330, 236), (260, 232), (200, 226), (160, 230), (150, 245)]
# 川（画像の座標。上流 → 下流）。dict: pts（点）, width（幅。マス）, ford（浅瀬の間隔。マス）, sea（True なら、最後の向きのまま、海まで延ばす）
RIVERS = [
    # 本流: 北の山から、砂地の脇を通り、南西の湾へ
    dict(pts=[(528, 215), (524, 240), (505, 268), (478, 293), (455, 308), (430, 322), (405, 328), (380, 335), (358, 352), (352, 372), (372, 388), (374, 410), (362, 428), (350, 452), (335, 470), (322, 484)], width=4, ford=120, sea=True),
    # 支流（大きな枝分かれ）: 本流から別れ、西の森の南へ
    dict(pts=[(352, 372), (322, 372), (298, 372), (278, 390), (266, 408), (272, 426), (268, 442), (280, 462), (296, 482)], width=4, ford=120, sea=True),
    # 本流の河口の、もう 1 本の流れ（三角州）: 東の海岸へ
    dict(pts=[(350, 452), (364, 470), (376, 490), (384, 506)], width=3, ford=70, sea=True),
    # 西の大森林の小川: 森の中から、西の海岸へ
    dict(pts=[(262, 262), (232, 288), (204, 322), (176, 350), (148, 376), (112, 392), (78, 398)], width=3, ford=90, sea=True),
    # --- 北の雪山の連峰から流れ出る川（山の麓から）---
    dict(pts=[(300, 205), (290, 235), (274, 256), (262, 262)], width=3, ford=70),                       # 西の麓 → 森の小川
    dict(pts=[(398, 222), (392, 250), (382, 288), (366, 326), (358, 352)], width=3, ford=80),           # 中央西の麓 → 本流（砂地の西）
    dict(pts=[(450, 232), (454, 258), (468, 282), (478, 293)], width=3, ford=70),                       # 中央の麓 → 本流
    dict(pts=[(580, 232), (574, 248), (570, 258)], width=3, ford=60),                                    # 東の麓 → 湖
    dict(pts=[(640, 214), (646, 240), (658, 266), (672, 290), (688, 316)], width=3, ford=80, sea=True),  # 北東の麓 → 東の海岸
    # --- 湖・本流のまわりの川 ---
    dict(pts=[(506, 304), (494, 300), (478, 293)], width=3, ford=50),                                    # 湖の出口 → 本流
    # --- 東の山々（岩山・炭鉱）から流れ出る川 ---
    dict(pts=[(562, 398), (524, 384), (484, 370), (440, 360), (398, 350), (372, 342)], width=3, ford=80),  # 南東の山 → 本流（草原を西へ）
    dict(pts=[(506, 466), (492, 500), (474, 530), (458, 556)], width=3, ford=80, sea=True),             # 南の山 → 南の海岸（南国へ）
    dict(pts=[(634, 336), (656, 350), (682, 358)], width=3, ford=60, sea=True),                          # 東の山 → 東の海岸
    # --- 大森林の、そのほかの小川 ---
    dict(pts=[(300, 330), (262, 346), (222, 372), (186, 420), (154, 456), (122, 474)], width=3, ford=90, sea=True),
    dict(pts=[(232, 430), (218, 470), (206, 506), (192, 540)], width=3, ford=80, sea=True),
]
# 山（x, y, 高さ（段）, 広がり（画像の px））
PEAKS_SNOW = [(287, 100, 22, 30), (340, 92, 20, 28), (406, 58, 27, 30), (461, 66, 27, 30), (501, 88, 22, 26), (541, 88, 27, 28), (574, 115, 18, 24), (604, 135, 16, 22), (320, 125, 16, 24), (250, 140, 14, 24), (440, 120, 18, 30), (520, 140, 16, 26)]
PEAKS_ROCK = [(628, 332, 17, 22), (572, 395, 12, 22), (505, 466, 14, 22), (440, 470, 12, 22), (612, 405, 12, 20), (660, 420, 8, 18), (470, 420, 8, 22)]
MAX_LEVEL = 35
BRIDGE_WIDTH = 2           # 橋の幅（マス）。橋は、川ごとの間隔（RIVERS の ford）で、川を横切る


def noise(seed, scale, shape=(H, W)):
    """なめらかな乱数（0〜1）。scale: 変化の大きさ（マス）"""
    rng = np.random.default_rng(seed)
    gh, gw = max(2, shape[0] // scale + 2), max(2, shape[1] // scale + 2)
    g = rng.random((gh, gw)).astype(np.float32)
    im = Image.fromarray(g).resize((gw * scale, gh * scale), Image.BICUBIC)
    return np.asarray(im)[:shape[0], :shape[1]].clip(0, 1)


def fbm(seed, scales=(64, 24, 8), weights=(0.55, 0.3, 0.15)):
    out = np.zeros((H, W), np.float32)
    for i, (s, w) in enumerate(zip(scales, weights)):
        out += noise(seed + i * 101, s) * w
    return out / sum(weights)


def _largest(m):
    h, w = m.shape
    seen = np.zeros_like(m, bool); best = None; bs = 0
    for y in range(h):
        for x in range(w):
            if m[y, x] and not seen[y, x]:
                q = deque([(y, x)]); seen[y, x] = True; cells = []
                while q:
                    a, b = q.popleft(); cells.append((a, b))
                    for da, db in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        p, r = a + da, b + db
                        if 0 <= p < h and 0 <= r < w and m[p, r] and not seen[p, r]:
                            seen[p, r] = True; q.append((p, r))
                if len(cells) > bs: bs = len(cells); best = cells
    out = np.zeros_like(m)
    for a, b in best: out[a, b] = True
    return out


def _fill_holes(m):
    h, w = m.shape
    bg = ~m; seen = np.zeros_like(m, bool); q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if bg[y, x] and not seen[y, x]: seen[y, x] = True; q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if bg[y, x] and not seen[y, x]: seen[y, x] = True; q.append((y, x))
    while q:
        a, b = q.popleft()
        for da, db in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            p, r = a + da, b + db
            if 0 <= p < h and 0 <= r < w and bg[p, r] and not seen[p, r]:
                seen[p, r] = True; q.append((p, r))
    return ~seen


def _dil(m, k): return np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(k))) > 0
def _ero(m, k): return np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(k))) > 0


def box_mean(m, r):
    """(2r+1)×(2r+1) の窓の平均（積算表）。端は、端の値でのばす"""
    m = m.astype(np.float32)
    p = np.pad(m, ((r + 1, r), (r + 1, r)), mode='edge')
    c = p.cumsum(0).cumsum(1)
    n = 2 * r + 1
    return (c[n:, n:] - c[:-n, n:] - c[n:, :-n] + c[:-n, :-n]) / (n * n)


def gauss(m, radius):
    """ガウスぼかしの近似（箱ぼかしの 3 回）"""
    r = max(1, int(radius * 0.8))
    for _ in range(3):
        m = box_mean(m, r)
    return m


def _mode_filter(cls, ncls, k):
    """k×k の窓で、いちばん多い種類にそろえる（ごま塩の除去）"""
    h, w = cls.shape
    best = np.zeros((h, w), np.float32) - 1; out = np.zeros((h, w), np.uint8)
    for c in range(ncls):
        m = (cls == c).astype(np.float32)
        s = box_mean(m, k // 2)
        better = s > best
        out[better] = c; best[better] = s[better]
    return out


def read_image():
    """画像から、陸地・地形の種類・湖を読み取る（画像の解像度 768×640）"""
    im = Image.open(IMAGE).convert('RGB')
    a = np.asarray(im).astype(np.float32) / 255
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mx = a.max(2); mn = a.min(2); v = mx; s = (mx - mn) / np.maximum(mx, 1e-6)
    d = np.maximum(mx - mn, 1e-6)
    hue = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
    ih, iw = v.shape
    paper = (v > 0.86) & (s < 0.2)
    water = (b > r + 0.04) & (hue > 130) & (hue < 260) & (s > 0.08) & ~paper
    # 森: 緑が強い（色相 80 以上）暗め、または、とても暗い緑。草: 黄緑（色相 40〜80）。砂: 黄で明るい
    forest = (((hue >= 80) & (hue <= 170) & (s > 0.2) & (v < 0.7)) | ((v < 0.34) & (hue >= 55) & (s > 0.2))) & ~water
    redd = r - g   # 赤みが強い（砂・岩）ほど大きい。草は、緑と赤が同じくらい
    xx = np.arange(iw)[None, :] * np.ones((ih, 1)); yy0 = np.arange(ih)[:, None] * np.ones((1, iw))
    se0 = (xx > 380) & (yy0 > 300)
    sand = (redd > 0.045) & (v > 0.72) & (s > 0.25) & ~forest
    rock = (((redd > 0.03) & (v <= 0.72) & (s > 0.15)) | (se0 & (s < 0.22) & (v < 0.62) & (v > 0.25))) & ~forest & ~sand
    grass = (hue > 40) & (hue < 130) & (s > 0.18) & ~forest & ~water & ~sand & ~rock
    snow = (s < 0.14) & (v > 0.55) & ~paper
    cls = np.zeros((ih, iw), np.uint8)   # 0 紙・1 水・2 森・3 草・4 砂・5 岩・6 雪
    for k, m in [(6, snow), (5, rock), (4, sand), (3, grass), (2, forest), (1, water)]:
        cls[m] = k
    # 陸地: 南側は色から、北は輪郭の点から
    land = np.isin(cls, [2, 3, 4, 5])
    land[:235, :] = False
    land = _ero(_dil(land, 5), 5)
    land[:, :74] = False; land[:, 735:] = False
    land = _largest(land)
    land = _fill_holes(land)
    poly = Image.new('L', (iw, ih), 0); ImageDraw.Draw(poly).polygon(NORTH_POLY, fill=255)
    north = np.asarray(poly) > 0
    land = _fill_holes(_ero(_dil(land | north, 7), 7))
    land = _largest(land)
    # 地形の種類（画像の解像度）
    biome = np.full((ih, iw), GRASS, np.uint8)
    yy = np.arange(ih)[:, None] * np.ones((1, iw))
    is_n = north & (yy < 246)
    biome[cls == 2] = FOREST; biome[cls == 3] = GRASS; biome[cls == 4] = DESERT; biome[cls == 5] = ROCK
    se = (np.arange(iw)[None, :] > 380) & (yy > 300)
    biome[(cls == 6) & se] = ROCK
    biome[(cls == 0) & land] = DESERT
    # 北: 雪山（既定）・針葉樹（暗い緑）・草（緑）
    biome[is_n] = SNOW
    biome[is_n & (cls == 2)] = CONIFER
    biome[is_n & (cls == 3)] = GRASS
    biome[is_n & (cls == 4)] = GRASS
    # 水・紙と判定された陸の点は、周りの多数派に
    unk = land & np.isin(cls, [0, 1]) & ~is_n & ~(((cls == 0)) & land)
    biome = _mode_filter(np.where(land, biome, GRASS).astype(np.uint8), 7, 15)
    tp = Image.new('L', (iw, ih), 0); ImageDraw.Draw(tp).polygon(TROPICAL_POLY, fill=255)
    biome[(np.asarray(tp) > 0) & (biome == GRASS)] = TROPICAL   # 南国
    biome[~land] = SEA
    # 湖: 陸の中の、大きな水のかたまり
    lake_px = water & land & (hue > 150) & (hue < 250) & (v > 0.55) & (s > 0.12)
    lake = np.zeros_like(lake_px)
    seen = np.zeros_like(lake_px)
    for y in range(ih):
        for x in range(iw):
            if lake_px[y, x] and not seen[y, x]:
                q = deque([(y, x)]); seen[y, x] = True; cells = []
                while q:
                    p, c = q.popleft(); cells.append((p, c))
                    for da, db in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        u, t = p + da, c + db
                        if 0 <= u < ih and 0 <= t < iw and lake_px[u, t] and not seen[u, t]:
                            seen[u, t] = True; q.append((u, t))
                if len(cells) > 3000:
                    for p, c in cells: lake[p, c] = True
    lake = _fill_holes(_ero(_dil(lake, 9), 9)) & land
    return land, biome, lake


def _scale(arr_img, kind='nearest', warp=None):
    """画像の解像度の配列を、世界のマス（W×H）へ引き伸ばす。warp: 座標のゆがみ（マス）"""
    ih, iw = arr_img.shape
    ys, xs = np.mgrid[0:H, 0:W].astype(np.float32)
    if warp is not None:
        xs = xs + warp[0]; ys = ys + warp[1]
    ix = np.clip((xs / W * iw).astype(int), 0, iw - 1)
    iy = np.clip((ys / H * ih).astype(int), 0, ih - 1)
    return arr_img[iy, ix]


def _distance(seed_mask, limit=None):
    """seed_mask（True の所）からの、マンハッタン距離（4 近傍）。2 回の走査（チャンファー）"""
    INF = 10 ** 6
    d = np.where(seed_mask, 0, INF).astype(np.int32)
    for _ in range(2):
        for y in range(1, H): d[y] = np.minimum(d[y], d[y - 1] + 1)
        for y in range(H - 2, -1, -1): d[y] = np.minimum(d[y], d[y + 1] + 1)
        xs = np.arange(W, dtype=np.int32)
        d = np.minimum.accumulate(d - xs[None, :], axis=1) + xs[None, :]
        rev = np.minimum.accumulate((d - (W - 1 - xs[None, :]))[:, ::-1], axis=1)[:, ::-1] + (W - 1 - xs[None, :])
        d = np.minimum(d, rev)
    return d


def _lipschitz(e):
    """隣り合うマスの高さの差を、1 以下にする（高いほうを下げる）"""
    e = e.astype(np.int32)
    for _ in range(3):
        for y in range(1, H): e[y] = np.minimum(e[y], e[y - 1] + 1)
        for y in range(H - 2, -1, -1): e[y] = np.minimum(e[y], e[y + 1] + 1)
        xs = np.arange(W, dtype=np.int32)
        e = np.minimum.accumulate(e - xs[None, :], axis=1) + xs[None, :]
        rev = np.minimum.accumulate((e - (W - 1 - xs[None, :]))[:, ::-1], axis=1)[:, ::-1] + (W - 1 - xs[None, :])
        e = np.minimum(e, rev)
    return e


def _mesh_frac(mask):
    """メッシュごとの、True の割合（GH×GW）"""
    return mask.astype(np.float32).reshape(GH, MESH, GW, MESH).mean(axis=(1, 3))


def _shrink_lake(lake, limit=0.55):
    """湖が大きく、1 枚のマップの大半が水になるときは、湖の中心に向かって縮める（どのメッシュも、湖の割合が limit 以下）"""
    if not lake.any(): return lake
    ys, xs = np.nonzero(lake); cy, cx = ys.mean(), xs.mean()
    Y, X = np.mgrid[0:H, 0:W].astype(np.float32)
    s = 1.0
    while s > 0.25:
        iy = np.round(cy + (Y - cy) / s).astype(int); ix = np.round(cx + (X - cx) / s).astype(int)
        ok = (iy >= 0) & (iy < H) & (ix >= 0) & (ix < W)
        m = np.zeros_like(lake); m[ok] = lake[iy[ok], ix[ok]]
        if _mesh_frac(m).max() <= limit: return m
        s -= 0.03
    return m


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


def _desert_oases(land, biome, sx=1.0, sy=1.0):
    """砂漠のオアシス（砂漠の真ん中あたりに、最大 2 か所。川から離す。いちばん大きな砂漠が、街を作る大きなオアシス、2 つ目は小さなオアシス）。
    戻り値: dict(pond=深い水, ring=浅いふち, grass=草の地面, sand=白い砂のふち, flat=平らにする所（高さ 0）, clear=物を置かない所（街の予定地）, town=街の予定地の中心, centers=[(y, x, 種別)])"""
    Y, X = np.mgrid[0:H, 0:W].astype(np.float32)
    out = dict(pond=np.zeros((H, W), bool), ring=np.zeros((H, W), bool), grass=np.zeros((H, W), bool), sand=np.zeros((H, W), bool),
               flat=np.zeros((H, W), bool), clear=np.zeros((H, W), bool), town=None, centers=[])
    des = land & (biome == DESERT)
    dd = _distance(~des).astype(np.float32)
    # 川（RIVERS の折れ線）までの距離: オアシスは、川から離す
    rim = Image.new('L', (W, H), 0); rd = ImageDraw.Draw(rim)
    for rv in RIVERS: rd.line([(x * sx, y * sy) for x, y in rv['pts']], fill=255, width=3)
    d_river = _distance(np.asarray(rim) > 0).astype(np.float32)
    ok = des & (dd >= 24) & (d_river >= 40) & ~_near_seam(Y.astype(int), X.astype(int), 22)    # 砂漠の奥・川から 40 マス以上・境界線から離す
    # 砂漠のまとまり（連結成分）ごとに、いちばん奥（縁から遠い）の所を 1 か所。大きなまとまりから、最大 2 か所
    comps = _components(des)
    picks = []
    for cid in sorted(range(1, comps.max() + 1), key=lambda c: -int((comps == c).sum())):
        m = ok & (comps == cid)
        if not m.any(): continue
        sc = np.where(m, dd, -1)
        py, px = np.unravel_index(np.argmax(sc), sc.shape)
        if all((py - a) ** 2 + (px - b) ** 2 > 90 ** 2 for a, b, _k in picks): picks.append((int(py), int(px), 'town' if not picks else 'small'))
        if len(picks) >= 2: break
    noise = (fbm(99, (14, 5, 2)) - 0.5) * 0.5
    for py, px, kind in picks:
        r_pond, r_grass, r_flat = (9.0, 17.0, 26.0) if kind == 'town' else (5.5, 12.0, 10.0)
        d = np.hypot(X - px, Y - py)
        e = d / r_pond + noise < 1.0                                    # 池（深い水）
        ring = (d / (r_pond + 2.0) + noise < 1.0) & ~e                  # 浅いふち
        out['pond'] |= e & land; out['ring'] |= ring & land
        out['sand'] |= (d / (r_pond + 4.0) + noise < 1.0) & ~e & ~ring & land      # 池のそばの白い砂
        out['grass'] |= (d / r_grass + noise * 0.6 < 1.0) & land        # 草の地面
        fr = fbm(98, (10, 4, 2))                                         # 緑のふち: 外側へ、まだらに薄くなる（10 マス）
        out['grass'] |= (d > r_grass) & (d <= r_grass + 5) & (fr > (d - r_grass) / 5.0) & land
        out['flat'] |= (d <= r_flat) & land
        if kind == 'town': out['clear'] |= (d <= r_flat) & land; out['town'] = (py, px)
        out['centers'].append((py, px, kind))
    return out


# 街の候補地（地図に重ねた図の A〜H）。画像のマス（1 マス = 世界の 1 マス）。実際の位置は、近くの「街に向く所」へ動かす
TOWN_CANDIDATES = [('a', 375, 700), ('b', 515, 880), ('c', 470, 700), ('d', 640, 545), ('e', 790, 730), ('f', 590, 1060), ('g', 545, 165), ('h', 720, 360)]   # (名前, y, x)
TOWN_R_FLAT = 17   # 街の敷地（平らにして、物を置かない）の半径


def _town_sites(land, biome, pond, oasis, sx=1.0, sy=1.0):
    """街の敷地（候補地ごとに 1 か所）。海・川・池・地形の境・マップの境から離れた、草原（C は砂漠のオアシス、E は南国）の平らにできる所のうち、候補にいちばん近い所。
    戻り値: list of dict(id, y, x)・mask（平らにして、物を置かない所）"""
    Y, X = np.mgrid[0:H, 0:W].astype(np.float32)
    rim = Image.new('L', (W, H), 0); rd = ImageDraw.Draw(rim)
    for rv in RIVERS: rd.line([(x * sx, y * sy) for x, y in rv['pts']], fill=255, width=3)
    d_river = _distance(np.asarray(rim) > 0).astype(np.float32)
    d_sea = _distance(~land).astype(np.float32)
    d_pond = _distance(pond).astype(np.float32)
    base = land & (d_sea >= 20) & (d_river >= 28) & (d_pond >= 20) & ~_near_seam(Y.astype(int), X.astype(int), 20)
    sites = []; mask = np.zeros((H, W), bool)
    for tid, cy, cx in TOWN_CANDIDATES:
        b0 = biome[cy, cx] if biome[cy, cx] in (GRASS, TROPICAL, DESERT) else GRASS     # C は砂漠（オアシスの池から 20 マス以上離す）
        ok = base & (_distance(biome != b0).astype(np.float32) >= 12)
        for o in sites: ok &= np.hypot(X - o['x'], Y - o['y']) > 70
        if not ok.any(): continue
        dd = np.where(ok, np.hypot(X - cx, Y - cy), 1e9)
        py, px = np.unravel_index(np.argmin(dd), dd.shape)
        py, px = int(py), int(px)
        sites.append(dict(id=tid, y=py, x=px))
        mask |= (np.hypot(X - px, Y - py) <= TOWN_R_FLAT) & land
    return sites, mask


def build():
    land_i, biome_i, lake_i = read_image()
    sx, sy = W / land_i.shape[1], H / land_i.shape[0]
    # 海岸・地形の境を、ぎざぎざにする（座標のゆがみ）
    wx = (fbm(11, (48, 16, 6)) - 0.5) * 14
    wy = (fbm(12, (48, 16, 6)) - 0.5) * 14
    land = _scale(land_i.astype(np.uint8), warp=(wx, wy)).astype(bool)
    biome = _scale(biome_i, warp=(wx * 1.5, wy * 1.5))
    biome = np.where(land, biome, SEA).astype(np.uint8)
    biome[(biome == SEA) & land] = GRASS
    lake = _scale(lake_i.astype(np.uint8), warp=(wx, wy)).astype(bool) & land
    lake = _shrink_lake(lake)
    land, lake, biome = _reshape_coast(land, lake, biome)
    land, lake, biome = _shape_coast(land, lake, biome)         # 入り江と岬
    land, biome, lagoon, pond = _tropical_coast(land, biome)   # 南国の入り江・小島・砂州・池
    biome = _expand_desert_north(land, biome)                  # 砂漠を、北へ広げる
    fpond, fring, ffrozen = _foothill_ponds(land, biome)        # 雪山の裾野の池
    pond = pond | fpond
    gpond, gring = _grass_ponds(land, biome)                     # 草原のため池
    pond = pond | gpond
    oasis = _desert_oases(land, biome, sx, sy)                           # 砂漠のオアシス
    pond = pond | oasis['pond']
    fring = fring | oasis['ring']
    towns, town_mask = _town_sites(land, biome, pond, oasis, sx, sy)   # 街の敷地（候補地 A〜H）
    oasis['flat'] = oasis['flat'] | town_mask
    fring = fring | gring

    # 川（世界のマス）: 線に、ゆらぎをつけて描く。浅瀬（歩いて渡れる）を、間隔をあけて作る
    river = np.zeros((H, W), np.uint8)   # 0 なし・1 深い・2 浅瀬
    d_sea0 = _distance(~land)
    mt_w = gauss(np.isin(biome, [SNOW, CONIFER, ROCK]).astype(np.float32), 10)   # 山（段丘の高さをもつ地形）の重み: 川は、山の中では蛇行させない（段丘の高さの規則を、乱さない）
    rng = np.random.default_rng(7)
    for ri, rv in enumerate(RIVERS):
        pts = rv['pts']; width = rv['width']; ford_every = rv['ford']
        P = [(x * sx, y * sy) for x, y in pts]
        # 海まで延ばす: 最後の向きのまま、陸の外（海）に出るまで
        if rv.get('sea'):
            (xa, ya), (xb, yb) = P[-2], P[-1]; L = np.hypot(xb - xa, yb - ya) or 1
            ux, uy = (xb - xa) / L, (yb - ya) / L
            cx, cy = xb, yb
            for _k in range(160):
                cx += ux * 3; cy += uy * 3
                ix_, iy_ = int(cx), int(cy)
                if not (0 <= ix_ < W and 0 <= iy_ < H) or not land[iy_, ix_]: break
            P.append((cx, cy))
        # 折れ線を細かく分けて、ゆらぎ（垂直方向）を足す
        seg = []
        for (x0, y0), (x1, y1) in zip(P[:-1], P[1:]):
            n = max(1, int(np.hypot(x1 - x0, y1 - y0) / 6))
            for i in range(n):
                seg.append((x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n))
        seg.append(P[-1])
        off = np.cumsum(rng.normal(0, 0.9, len(seg))); kw = min(25, len(off)); off = off - np.convolve(off, np.ones(kw) / kw, mode='same')
        path = []
        for i, (x, y) in enumerate(seg):
            j = min(i + 1, len(seg) - 1); k = max(i - 1, 0)
            dx, dy = seg[j][0] - seg[k][0], seg[j][1] - seg[k][1]; L = np.hypot(dx, dy) or 1
            path.append((x - dy / L * off[i] * 3, y + dx / L * off[i] * 3))
        # 蛇行（43-57）: 川の長さに沿った、ゆるやかな波（振れ幅 幅+2 マス、波長 約 70 マス。水源と河口に近いほど小さい）
        slen = np.concatenate([[0.0], np.cumsum([np.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]) for i in range(1, len(path))])])
        tot = float(slen[-1]) or 1.0
        ph = rng.uniform(0, 6.28)
        mean_ = [(path[i][0], path[i][1]) for i in range(len(path))]
        path2 = []
        for i, (x, y) in enumerate(mean_):
            j = min(i + 1, len(path) - 1); k = max(i - 1, 0)
            dx, dy = path[j][0] - path[k][0], path[j][1] - path[k][1]; L = np.hypot(dx, dy) or 1
            taper = min(1.0, slen[i] / 40.0, (tot - slen[i]) / 40.0)
            mw = 1.0 - min(1.0, float(mt_w[min(H - 1, max(0, int(y))), min(W - 1, max(0, int(x)))]) * 3.0)
            m = (width + 2) * 0.6 * np.sin(slen[i] / 70.0 * 6.283 + ph) * max(0.0, taper) * max(0.0, mw)
            path2.append((x - dy / L * m, y + dx / L * m))
        path = path2
        path = _avoid_seams(path, width / 2 + 3.5)   # 川は、境界線のそばを、渡らずに流れないよう、境界から離す
        deep = Image.new('L', (W, H), 0); dd = ImageDraw.Draw(deep)
        ford = Image.new('L', (W, H), 0); fd = ImageDraw.Draw(ford)
        # 川幅の変化（43-57）: 水源に近いほど細く（幅の 6 割）、河口ほど太く（幅の 1.1 倍）。ところどころに、広い淀み（+1 マス）。最小 2 マス
        wn = fbm(140 + ri, (60, 20, 6)); wmax = width
        for i in range(1, len(path)):
            f = slen[i] / tot
            w_i = max(2, int(round(width * (0.6 + 0.5 * f) + (1 if wn[min(H - 1, int(path[i][1])), min(W - 1, int(path[i][0]))] > 0.68 else 0))))
            if mt_w[min(H - 1, max(0, int(path[i][1]))), min(W - 1, max(0, int(path[i][0])))] > 0.02: w_i = width     # 山（段丘）のそばは、幅を変えない
            wmax = max(wmax, w_i)
            dd.line([path[i - 1], path[i]], fill=255, width=w_i)
            x, y = path[i]; dd.ellipse([x - w_i / 2, y - w_i / 2, x + w_i / 2, y + w_i / 2], fill=255)
        # 橋: 川の長さに沿って、一定の間隔。川の向きに垂直に、幅 2 マスで、川を横切る（川の水のマスだけが、橋になる）
        acc = 0.0; nextf = ford_every * 0.6
        for i in range(1, len(path) - 1):
            acc += np.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1])
            if acc >= nextf and d_sea0[min(H - 1, max(0, int(path[i][1]))), min(W - 1, max(0, int(path[i][0])))] < 14:
                nextf += ford_every * 0.3          # 河口（海から 14 マス以内）は、川が広く、岸がはっきりしない: 橋を、かけない（少し先でかける）
            elif acc >= nextf:
                cx, cy = path[i]
                tx, ty = path[i + 1][0] - path[i - 1][0], path[i + 1][1] - path[i - 1][1]; tl = np.hypot(tx, ty) or 1
                nx_, ny_ = -ty / tl, tx / tl
                half = wmax / 2 + 3
                fd.line([(cx - nx_ * half, cy - ny_ * half), (cx + nx_ * half, cy + ny_ * half)], fill=255, width=BRIDGE_WIDTH)
                nextf += ford_every
        deep = np.asarray(deep) > 0; ford = (np.asarray(ford) > 0) & deep
        # 橋が、斜めにしかつながらない所（川が斜めに流れる所で、2 マス幅の線が階段状になる）は、斜めの隙間を埋めて、4 近傍でつなぐ（斜めの隙間は、通れない）
        for _ in range(3):
            add = []
            for y, x in zip(*np.nonzero(ford)):
                for dy, dx in ((1, 1), (1, -1)):
                    yy, xx = y + dy, x + dx
                    if 0 <= yy < H and 0 <= xx < W and ford[yy, xx] and not ford[y, xx] and not ford[yy, x]:
                        for py, px in ((y, xx), (yy, x)):
                            if deep[py, px]: add.append((py, px)); break
            if not add: break
            for py, px in add: ford[py, px] = True
        river[deep] = np.maximum(river[deep], 1)
        river[ford] = 2
    river[~land] = 0
    # 湖と重なる川は、湖に任せる（深い水）
    river[lake] = 0
    # 海岸・湖で切れて、短くなった橋（橋のマスが 3 マス以下）は、橋にしない（両岸をつなげない橋を、作らない）
    lab_b = _components(river == 2)
    for k in range(1, int(lab_b.max()) + 1):
        comp = lab_b == k
        if comp.sum() <= 3: river[comp] = 1; continue
        # 両岸（通れる陸）に届かない橋（川幅が広い所・海岸）は、橋にしない
        nb = _dil(comp, 3) & ~comp & land & (river == 0) & ~lake
        pts_ = np.argwhere(nb)
        if len(pts_) < 2 or (np.abs(pts_[:, None, :] - pts_[None, :, :]).sum(axis=2).max() < 3): river[comp] = 1

    water_deep = lake | (river == 1)
    # 湖のふちと川の浅瀬: 浅瀬
    lake_edge = lake & ~_ero(lake, 3)
    bridge = (river == 2) & ~lake
    water_shallow = lake_edge | fring
    water_deep &= ~water_shallow & ~bridge
    water_deep = water_deep | pond
    any_water = water_deep | water_shallow | bridge | lagoon

    # 高さ
    ys, xs = np.mgrid[0:H, 0:W].astype(np.float32)
    ix, iy = xs / sx, ys / sy
    def blur(m, r): return gauss(m, r)
    w_tr = blur(biome == TROPICAL, 18)
    w_snow = blur(biome == SNOW, 22); w_con = blur(biome == CONIFER, 22); w_rock = blur(biome == ROCK, 22); w_for = blur(biome == FOREST, 16)
    # 雪山（連峰）: 山（ガウス）に、尾根の線（ridged noise）と谷を重ねて、尖った峰と尾根・谷・峠を作る
    e_snow = np.clip((250 - iy) / 200, 0, 1) * 7
    peaks = np.zeros((H, W), np.float32)
    for px, py, ph, ps in PEAKS_SNOW:
        peaks += ph * np.exp(-(((ix - px) ** 2 + (iy - py) ** 2) / (2 * ps ** 2)))
    # 裾野（雪山の南側の帯）: 氷河が運んだような、ゆるい丘（モレーン）と谷。山の高い所には、足さない
    foot_w = np.clip((iy - 170) / 50, 0, 1) * (1 - np.clip((iy - 255) / 20, 0, 1))
    moraine = (3 + 6 * fbm(51, (28, 10, 4)) + 3 * (1 - np.abs(2 * fbm(52, (36, 12, 4)) - 1)) ** 2) * foot_w
    ridge1 = 1 - np.abs(2 * fbm(31, (56, 20, 7)) - 1)      # 尾根（0〜1）: 1 に近いほど、尾根の筋
    ridge2 = 1 - np.abs(2 * fbm(33, (30, 11, 4)) - 1)
    valley = fbm(35, (72, 24, 8))
    e_snow = e_snow + moraine * (1 - np.clip(peaks / 14, 0, 1)) + peaks * (0.35 + 0.95 * ridge1 ** 1.6) + 7 * ridge2 ** 2 * np.clip(peaks / 12, 0, 1) - 6 * (valley > 0.62) * np.clip(peaks / 10, 0, 1)
    # 岩山（東・南東）: 段々の山。炭鉱のまわりは、掘削跡（くぼ地）
    e_rock = np.full((H, W), 3.0, np.float32)
    for px, py, ph, ps in PEAKS_ROCK:
        e_rock += ph * np.exp(-(((ix - px) ** 2 + (iy - py) ** 2) / (2 * ps ** 2)))
    e_rock = e_rock * (0.7 + 0.6 * fbm(37, (40, 14, 5)))
    e_rock = np.round(e_rock / 3.0) * 3.0 + 1.2 * fbm(38, (12, 5, 3))      # 3 段ごとの段々
    for mx, my in MINES:
        d = np.hypot(ix * sx - mx * sx, iy * sy - my * sy)
        pit = np.exp(-((d / (MINE_R * 0.55)) ** 2))
        e_rock = e_rock - pit * 14                                        # 中央をくぼませる
        e_rock = e_rock + 5 * np.exp(-(((d - MINE_R * 0.75) / 5) ** 2))   # ふちの盛り土
    e_rock = np.maximum(e_rock, 1)
    e_con = 3 + 6 * fbm(41, (60, 20, 8)) + 3 * (1 - np.abs(2 * fbm(53, (30, 10, 4)) - 1)) ** 2
    plains = 4.0 * fbm(43, (96, 32, 10))
    # 草原: ゆるやかな丘陵（周期の長い起伏）。大きな丘（見晴らしの丘）が点々と。傾きは、ゆるい（道をつけやすい）。低い所は、池・川のくぼ地になる
    w_gr = blur(biome == GRASS, 12)
    hills = 1.0 + 6.0 * fbm(70, (84, 30, 9)) ** 1.3 + 2.0 * (1 - np.abs(2 * fbm(71, (44, 16, 5)) - 1)) ** 2
    lookout = np.zeros((H, W), np.float32)
    rng_h = np.random.default_rng(95)
    for _ in range(9):
        py_, px_ = rng_h.integers(300, 760), rng_h.integers(300, 1100)
        lookout += rng_h.uniform(3.0, 5.0) * np.exp(-(((xs - px_) ** 2 + (ys - py_) ** 2) / (2 * rng_h.uniform(14, 22) ** 2)))
    plains = plains * (1 - w_gr) + (hills + lookout) * w_gr
    # 西の大森林: 起伏を激しく（短い周期の丘と、尾根・谷）。木が密なので、地形でも通りにくくなる
    ridgeF = (1 - np.abs(2 * fbm(46, (34, 12, 4)) - 1)) ** 2
    e_for = 3 + 13 * fbm(45, (28, 10, 4)) + 9 * ridgeF
    e_tr = 4 + 9 * fbm(47, (34, 12, 5)) + 3 * (1 - np.abs(2 * fbm(48, (40, 14, 5)) - 1)) ** 2   # 南国: ゆるい丘とジャングルの谷
    # 砂漠: 砂丘。風は北西から南東へ。尾根は風と直交（北東〜南西）に、平行に並ぶ。風上はゆるやか（約 3 マスで 1 段）・風下は急（1 マスで 1 段）の、のこぎり型。尾根は、ゆらぎで曲がり、ところどころ切れて、峠になる。砂漠の中心ほど高く、数か所に、星型の高い砂丘
    w_des = blur(biome == DESERT, 14)
    inner = np.clip(_distance(biome != DESERT).astype(np.float32) / 40.0, 0, 1)         # 砂漠の縁 0 → 中心 1
    sw = (xs + ys) / np.sqrt(2.0)                                                       # 風の向きの座標
    lam = 20.0                                                                          # 尾根の間隔（マス）
    phase = ((sw + 9 * (fbm(61, (40, 14, 5)) - 0.5) * 6) / lam) % 1.0                  # 尾根の曲がり（ゆらぎ）
    saw = np.where(phase < 0.72, phase / 0.72, (1 - phase) / 0.28)                      # 風上ゆるやか・風下急
    amp = (3.5 + 5.5 * fbm(62, (50, 18, 6))) * (0.45 + 0.55 * inner)                    # 尾根の高さ 4〜9 段（縁は低い）
    gap = np.clip((fbm(63, (22, 8, 3)) - 0.62) * 8, 0, 1)                               # 峠（尾根の切れ目）
    ripple = 0.8 * (1 - np.abs(2 * fbm(64, (10, 4, 2)) - 1))                            # 砂紋（細かい波）
    e_des = 2 + amp * saw * (1 - 0.85 * gap) + ripple
    d_oa = _distance(oasis['flat']).astype(np.float32)                                  # オアシス（平ら）までの距離: 近づくほど、砂丘が低くなる
    e_des = e_des * np.clip(d_oa / 30.0, 0, 1)
    dm = _distance(biome != DESERT)
    for _ in range(3):                                                                  # 星型の砂丘（砂漠の奥に、高い山）
        py_, px_ = np.unravel_index(np.argmax(dm), dm.shape)
        if dm[py_, px_] < 18: break
        e_des = e_des + 10 * np.exp(-(((xs - px_) ** 2 + (ys - py_) ** 2) / (2 * 14.0 ** 2)))
        dm[np.hypot(xs - px_, ys - py_) < 70] = 0
    wsum = w_snow + w_con + w_rock + w_for + w_tr + w_des
    mount = (w_snow * e_snow + w_con * e_con + w_rock * e_rock + w_for * e_for + w_tr * e_tr + w_des * e_des)
    elev = mount + plains * np.clip(1 - wsum, 0, 1)
    elev = np.where(land, elev, 0)
    elev = np.clip(elev, 0, MAX_LEVEL).round().astype(np.int32)
    # 水辺・海岸に向かって、1 マスに 1 段までの傾きで下がる
    seeds = any_water | ~land | oasis['flat']
    dist = _distance(seeds)
    elev = np.minimum(elev, dist.astype(np.int32))
    elev = _lipschitz(elev)
    elev[any_water | ~land | oasis['flat']] = 0
    elev = _lipschitz(elev)
    elev, trail, arenas, mtn_bridge, bridge_under = _mountains(elev, land, biome, (water_deep & ~bridge) | oasis['flat'] | ~land, sx, sy)   # 連峰・山脈: 段丘と山道
    elev[any_water | ~land | oasis['flat']] = 0
    return dict(land=land, biome=biome, deep=water_deep, shallow=water_shallow, lagoon=lagoon, frozen=ffrozen, bridge=bridge, lake=lake, river=river, elev=elev, trail=trail, arenas=arenas, mtn_bridge=mtn_bridge, bridge_under=bridge_under, oasis=oasis, towns=towns, town_mask=town_mask, dist_sea=_distance(~land), dist_water=_distance(any_water))


if __name__ == '__main__':
    import sys
    t = build()
    out = sys.argv[1] if len(sys.argv) > 1 else '/tmp/world_terrain.npz'
    np.savez_compressed(out, **t)
    print('land tiles', int(t['land'].sum()), 'max elev', int(t['elev'].max()))
