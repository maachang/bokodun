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
IMAGE = os.path.join(ROOT, 'public', 'images', 'objects', 'island_map.png')
GW, GH = 20, 15            # メッシュの数
MESH = 64                  # 1 メッシュのマス数
W, H = GW * MESH, GH * MESH  # 世界のマス数（1280×960）

# 地形の種類（コード）
SEA, SNOW, CONIFER, FOREST, GRASS, DESERT, ROCK = range(7)
NAMES = ['sea', 'snow', 'conifer', 'forest', 'grass', 'desert', 'rock']

# 北の雪山の輪郭（画像の座標 x, y。画像を見て指定）
NORTH_POLY = [(190, 205), (215, 180), (235, 150), (262, 125), (287, 100), (320, 108), (340, 85), (375, 70), (406, 52), (430, 70), (461, 60), (480, 85), (501, 85), (520, 95), (541, 83), (556, 100), (574, 112), (604, 130), (624, 148), (654, 160), (672, 172), (676, 192), (668, 215), (650, 235), (630, 245), (560, 247), (480, 245), (400, 240), (330, 236), (260, 232), (200, 226), (160, 230), (150, 245)]
# 川（画像の座標。上流 → 下流）
RIVERS = [
    # 本流: 北の山から、砂地の脇を通り、南西の湾へ
    [(528, 215), (524, 240), (505, 268), (478, 293), (455, 308), (430, 322), (405, 328), (380, 335), (358, 352), (352, 372), (372, 388), (374, 410), (362, 428), (350, 452), (335, 470), (322, 484)],
    # 支流: 本流から別れ、西の森の南へ
    [(352, 372), (322, 372), (298, 372), (278, 390), (266, 408), (272, 426), (268, 442), (280, 462), (296, 482)],
]
# 山（x, y, 高さ（段）, 広がり（画像の px））
PEAKS_SNOW = [(287, 100, 22, 30), (340, 92, 20, 28), (406, 58, 27, 30), (461, 66, 27, 30), (501, 88, 22, 26), (541, 88, 27, 28), (574, 115, 18, 24), (604, 135, 16, 22), (320, 125, 16, 24), (250, 140, 14, 24), (440, 120, 18, 30), (520, 140, 16, 26)]
PEAKS_ROCK = [(628, 332, 17, 22), (572, 395, 12, 22), (505, 466, 14, 22), (440, 470, 12, 22), (612, 405, 12, 20), (660, 420, 8, 18), (470, 420, 8, 22)]
MAX_LEVEL = 35
FORD_EVERY = 120           # 川の浅瀬（歩いて渡れる所）の間隔（マス）
FORD_LEN = 7


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

    # 川（世界のマス）: 線に、ゆらぎをつけて描く。浅瀬（歩いて渡れる）を、間隔をあけて作る
    river = np.zeros((H, W), np.uint8)   # 0 なし・1 深い・2 浅瀬
    rng = np.random.default_rng(7)
    for ri, pts in enumerate(RIVERS):
        P = [(x * sx, y * sy) for x, y in pts]
        # 折れ線を細かく分けて、ゆらぎ（垂直方向）を足す
        seg = []
        for (x0, y0), (x1, y1) in zip(P[:-1], P[1:]):
            n = max(1, int(np.hypot(x1 - x0, y1 - y0) / 6))
            for i in range(n):
                seg.append((x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n))
        seg.append(P[-1])
        off = np.cumsum(rng.normal(0, 0.9, len(seg))); off = off - np.convolve(off, np.ones(25) / 25, mode='same')
        path = []
        for i, (x, y) in enumerate(seg):
            j = min(i + 1, len(seg) - 1); k = max(i - 1, 0)
            dx, dy = seg[j][0] - seg[k][0], seg[j][1] - seg[k][1]; L = np.hypot(dx, dy) or 1
            path.append((x - dy / L * off[i] * 3, y + dx / L * off[i] * 3))
        deep = Image.new('L', (W, H), 0); dd = ImageDraw.Draw(deep)
        ford = Image.new('L', (W, H), 0); fd = ImageDraw.Draw(ford)
        width = 4
        dd.line(path, fill=255, width=width)
        for x, y in path: dd.ellipse([x - width / 2, y - width / 2, x + width / 2, y + width / 2], fill=255)
        # 浅瀬: 川の長さに沿って、一定の間隔
        acc = 0.0; nextf = FORD_EVERY * 0.6
        for i in range(1, len(path)):
            acc += np.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1])
            if acc >= nextf:
                cx, cy = path[i]
                fd.ellipse([cx - FORD_LEN / 2 - 1, cy - FORD_LEN / 2 - 1, cx + FORD_LEN / 2 + 1, cy + FORD_LEN / 2 + 1], fill=255)
                nextf += FORD_EVERY
        deep = np.asarray(deep) > 0; ford = (np.asarray(ford) > 0) & deep
        river[deep] = np.maximum(river[deep], 1)
        river[ford] = 2
    river[~land] = 0
    # 湖と重なる川は、湖に任せる（深い水）
    river[lake] = 0

    water_deep = lake | (river == 1)
    # 湖のふちと川の浅瀬: 浅瀬
    lake_edge = lake & ~_ero(lake, 3)
    water_shallow = lake_edge | (river == 2)
    water_deep &= ~water_shallow
    any_water = water_deep | water_shallow

    # 高さ
    ys, xs = np.mgrid[0:H, 0:W].astype(np.float32)
    ix, iy = xs / sx, ys / sy
    def blur(m, r): return gauss(m, r)
    w_snow = blur(biome == SNOW, 22); w_con = blur(biome == CONIFER, 22); w_rock = blur(biome == ROCK, 22)
    # 雪山: 北ほど高い土台と、山
    e_snow = np.clip((250 - iy) / 200, 0, 1) * 9
    for px, py, ph, ps in PEAKS_SNOW:
        e_snow += ph * np.exp(-(((ix - px) ** 2 + (iy - py) ** 2) / (2 * ps ** 2)))
    ridge = 0.65 + 0.7 * fbm(31, (40, 14, 5))
    e_snow = e_snow * ridge
    e_rock = np.full((H, W), 3.0, np.float32)
    for px, py, ph, ps in PEAKS_ROCK:
        e_rock += ph * np.exp(-(((ix - px) ** 2 + (iy - py) ** 2) / (2 * ps ** 2)))
    e_rock = e_rock * (0.7 + 0.6 * fbm(37, (40, 14, 5)))
    e_con = 3 + 6 * fbm(41, (60, 20, 8))
    plains = 4.0 * fbm(43, (96, 32, 10))
    wsum = w_snow + w_con + w_rock
    mount = (w_snow * e_snow + w_con * e_con + w_rock * e_rock)
    elev = mount + plains * np.clip(1 - wsum, 0, 1)
    elev = np.where(land, elev, 0)
    elev = np.clip(elev, 0, MAX_LEVEL).round().astype(np.int32)
    # 水辺・海岸に向かって、1 マスに 1 段までの傾きで下がる
    seeds = any_water | ~land
    dist = _distance(seeds)
    elev = np.minimum(elev, dist.astype(np.int32))
    elev = _lipschitz(elev)
    elev[any_water | ~land] = 0
    elev = _lipschitz(elev)
    return dict(land=land, biome=biome, deep=water_deep, shallow=water_shallow, lake=lake, river=river, elev=elev, dist_sea=_distance(~land), dist_water=_distance(any_water))


if __name__ == '__main__':
    import sys
    t = build()
    out = sys.argv[1] if len(sys.argv) > 1 else '/tmp/world_terrain.npz'
    np.savez_compressed(out, **t)
    print('land tiles', int(t['land'].sum()), 'max elev', int(t['elev'].max()))
