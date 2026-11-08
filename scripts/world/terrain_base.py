"""世界の地形の読み取りの基礎: 定数・画像の読み込み・ノイズ・距離・フィルタの道具"""
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
