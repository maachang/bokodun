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
from types import SimpleNamespace
import numpy as np
from collections import deque
from PIL import Image, ImageFilter, ImageDraw

from terrain_base import BRIDGE_WIDTH, CONIFER, DESERT, FOREST, GH, GRASS, GW, H, IMAGE, MAX_LEVEL, MESH, MINES, MINE_R, NAMES, NORTH_POLY, PEAKS_ROCK, PEAKS_SNOW, RIVERS, ROCK, ROOT, SEA, SNOW, TROPICAL, TROPICAL_POLY, W, _dil, _distance, _ero, _fill_holes, _largest, _lipschitz, _mesh_frac, _mode_filter, _scale, _shrink_lake, box_mean, fbm, gauss, noise, read_image   # noqa: F401（世界の地形の読み取りの基礎: 定数・画像の読み込み・ノイズ・距離・フィルタの道具）
from terrain_coast import _avoid_seams, _components, _expand_desert_north, _foothill_ponds, _harbor_inlet, _grass_ponds, _near_seam, _reshape_coast, _shape_coast, _tropical_coast   # noqa: F401（世界の地形: 海岸の形・南国の海岸・池・砂漠の拡張）
from terrain_mountain import MOUNTAIN_STEP, TRAIL_PEAKS, _astar4, _gorge_bridges, _mountains, _switchback, _zigzag   # noqa: F401（世界の地形: 山・山道・峡谷の橋）
from terrain_sites import FIXED_TOWNS, TOWN_CANDIDATES, TOWN_GATE_FRONT, TOWN_R_FLAT, _desert_oases, _town_sites   # noqa: F401（世界の地形: オアシスと街の敷地）


def _build_coast(g):
    """海岸・地形の境のゆがみと、陸地・地形の種類・湖の下ごしらえ。共有する変数は g（段階の間の入れ物）から受け取り、後の段階で使う変数は g へ書き戻す（元は build の一部）"""
    biome_i, lake_i, land_i, sx, sy = g.biome_i, g.lake_i, g.land_i, g.sx, g.sy
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
    towns, town_mask, town_mask_mtn = _town_sites(land, biome, pond, oasis, sx, sy)   # 街の敷地（候補地 A〜H）
    print('E の港の入り江:', _harbor_inlet(land, biome, towns), 'マス掘った')   # 港町 E の東に、海から入り江（街のすぐ横を、海に）
    oasis['flat'] = oasis['flat'] | town_mask          # 平地の街は、標高 0 に平らにする（山の上の街は、標高をそのまま）
    town_mask = town_mask | town_mask_mtn
    fring = fring | gring
    g.biome = biome
    g.ffrozen = ffrozen
    g.fring = fring
    g.lagoon = lagoon
    g.lake = lake
    g.land = land
    g.oasis = oasis
    g.pond = pond
    g.town_mask = town_mask
    g.towns = towns


def _build_rivers_draw(g):
    """川の線（ゆらぎ・浅瀬・橋）を、世界のマスへ描く。浅瀬（歩いて渡れる）を、間隔をあけて作る（元は _build_rivers の一部）"""
    biome, land, sx, sy = g.biome, g.land, g.sx, g.sy
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
    return river


def _build_rivers(g):
    """川（ゆらぎ・浅瀬・橋）と、湖との重なり。共有する変数は g（段階の間の入れ物）から受け取り、後の段階で使う変数は g へ書き戻す（元は build の一部）"""
    river = _build_rivers_draw(g)
    lake, land = g.lake, g.land
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
    g.river = river
    g.water_deep = water_deep


def _build_lakeEdge(g):
    """湖のふちと、川の浅瀬の整理。共有する変数は g（段階の間の入れ物）から受け取り、後の段階で使う変数は g へ書き戻す（元は build の一部）"""
    fring, lagoon, lake, pond, river, water_deep = g.fring, g.lagoon, g.lake, g.pond, g.river, g.water_deep
    # 湖のふちと川の浅瀬: 浅瀬
    lake_edge = lake & ~_ero(lake, 3)
    bridge = (river == 2) & ~lake
    water_shallow = lake_edge | fring
    water_deep &= ~water_shallow & ~bridge
    water_deep = water_deep | pond
    any_water = water_deep | water_shallow | bridge | lagoon
    g.any_water = any_water
    g.bridge = bridge
    g.water_deep = water_deep
    g.water_shallow = water_shallow


def _build_snowHeights(g):
    """高さ: 雪山（連峰）と裾野。共有する変数は g（段階の間の入れ物）から受け取り、後の段階で使う変数は g へ書き戻す（元は build の一部）"""
    biome, sx, sy = g.biome, g.sx, g.sy
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
    g.blur = blur
    g.e_snow = e_snow
    g.ix = ix
    g.iy = iy
    g.w_con = w_con
    g.w_for = w_for
    g.w_rock = w_rock
    g.w_snow = w_snow
    g.w_tr = w_tr
    g.xs = xs
    g.ys = ys


def _build_rockHeights(g):
    """高さ: 岩山と炭鉱のくぼ地。共有する変数は g（段階の間の入れ物）から受け取り、後の段階で使う変数は g へ書き戻す（元は build の一部）"""
    ix, iy, sx, sy = g.ix, g.iy, g.sx, g.sy
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
    g.e_con = e_con
    g.e_rock = e_rock
    g.plains = plains


def _build_lowlandHeights(g):
    """高さ: 草原の丘陵と、西の大森林。共有する変数は g（段階の間の入れ物）から受け取り、後の段階で使う変数は g へ書き戻す（元は build の一部）"""
    biome, blur, plains, xs, ys = g.biome, g.blur, g.plains, g.xs, g.ys
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
    g.e_for = e_for
    g.e_tr = e_tr
    g.plains = plains


def _build_desertHeights(g):
    """高さ: 砂漠の砂丘。共有する変数は g（段階の間の入れ物）から受け取り、後の段階で使う変数は g へ書き戻す（元は build の一部）"""
    biome, blur, e_con, e_for, e_rock, e_snow, e_tr, land, oasis, plains, w_con, w_for, w_rock, w_snow, w_tr, xs, ys = g.biome, g.blur, g.e_con, g.e_for, g.e_rock, g.e_snow, g.e_tr, g.land, g.oasis, g.plains, g.w_con, g.w_for, g.w_rock, g.w_snow, g.w_tr, g.xs, g.ys
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
    g.elev = elev


def _build_settleHeights(g):
    """高さ: 水辺・海岸へ向かって、1 マスに 1 段までに整える。共有する変数は g（段階の間の入れ物）から受け取り、後の段階で使う変数は g へ書き戻す（元は build の一部）"""
    any_water, biome, bridge, elev, land, oasis, sx, sy, water_deep = g.any_water, g.biome, g.bridge, g.elev, g.land, g.oasis, g.sx, g.sy, g.water_deep
    # 水辺・海岸に向かって、1 マスに 1 段までの傾きで下がる
    seeds = any_water | ~land | oasis['flat']
    dist = _distance(seeds)
    elev = np.minimum(elev, dist.astype(np.int32))
    elev = _lipschitz(elev)
    elev[any_water | ~land | oasis['flat']] = 0
    elev = _lipschitz(elev)
    elev, trail, arenas, mtn_bridge, bridge_under = _mountains(elev, land, biome, (water_deep & ~bridge) | oasis['flat'] | ~land, sx, sy)   # 連峰・山脈: 段丘と山道
    elev[any_water | ~land | oasis['flat']] = 0
    Y_, X_ = np.mgrid[0:H, 0:W]
    g.X_ = X_
    g.Y_ = Y_
    g.arenas = arenas
    g.bridge_under = bridge_under
    g.elev = elev
    g.mtn_bridge = mtn_bridge
    g.trail = trail


def _build_mountainTown(g):
    """山の上の街（A）: 門前から山道へのつなぎ。共有する変数は g（段階の間の入れ物）から受け取り、後の段階で使う変数は g へ書き戻す（元は build の一部）"""
    X_, Y_, elev, land, towns, trail = g.X_, g.Y_, g.elev, g.land, g.towns, g.trail
    # 山の上の街（A）: 門前の石畳から、近くの山道へ、山道をつなぐ（山道でしか行けない）。台地の上（街と同じ高さ）を通る
    for s_ in towns:
        if s_['id'] not in FIXED_TOWNS: continue
        gy, gx = s_['y'] + TOWN_GATE_FRONT, s_['x']
        ty_, tx_ = np.nonzero(trail & (np.hypot(Y_ - gy, X_ - gx) > 5))
        k = int(np.argmin(np.hypot(ty_ - gy, tx_ - gx))); goal = (int(ty_[k]), int(tx_[k]))
        y0_, y1_, x0_, x1_ = max(0, min(gy, goal[0]) - 20), min(H, max(gy, goal[0]) + 21), max(0, min(gx, goal[1]) - 20), min(W, max(gx, goal[1]) + 21)
        cost = np.full((H, W), 1e18)
        okc = land & (elev >= elev[s_['y'], s_['x']] - 1)
        cost[y0_:y1_, x0_:x1_] = np.where(okc[y0_:y1_, x0_:x1_], 1.0, 1e18)
        path = _astar4(cost, (gy, gx), goal, (y0_, y1_, x0_, x1_))
        assert path, f'山の上の街 {s_["id"]}: 山道へのつなぎがない'
        for y, x in path: trail[y, x] = True
        for y, x in path: trail[min(H - 1, y + 1), x] = trail[y, min(W - 1, x + 1)] = True   # 山道の幅 2 マス
        trail &= land
        print('山の上の街', s_['id'], 'の山道のつなぎ', len(path), 'マス')
    g.trail = trail


def build():
    land_i, biome_i, lake_i = read_image()
    sx, sy = W / land_i.shape[1], H / land_i.shape[0]
    g = SimpleNamespace(biome_i=biome_i, lake_i=lake_i, land_i=land_i, sx=sx, sy=sy)
    _build_coast(g)
    _build_rivers(g)
    _build_lakeEdge(g)
    _build_snowHeights(g)
    _build_rockHeights(g)
    _build_lowlandHeights(g)
    _build_desertHeights(g)
    _build_settleHeights(g)
    _build_mountainTown(g)
    any_water, arenas, biome, bridge, bridge_under, elev, ffrozen, lagoon, lake, land, mtn_bridge, oasis, river, town_mask, towns, trail, water_deep, water_shallow = g.any_water, g.arenas, g.biome, g.bridge, g.bridge_under, g.elev, g.ffrozen, g.lagoon, g.lake, g.land, g.mtn_bridge, g.oasis, g.river, g.town_mask, g.towns, g.trail, g.water_deep, g.water_shallow


    return dict(land=land, biome=biome, deep=water_deep, shallow=water_shallow, lagoon=lagoon, frozen=ffrozen, bridge=bridge, lake=lake, river=river, elev=elev, trail=trail, arenas=arenas, mtn_bridge=mtn_bridge, bridge_under=bridge_under, oasis=oasis, towns=towns, town_mask=town_mask, dist_sea=_distance(~land), dist_water=_distance(any_water))


if __name__ == '__main__':
    import sys
    t = build()
    out = sys.argv[1] if len(sys.argv) > 1 else '/tmp/world_terrain.npz'
    np.savez_compressed(out, **t)
    print('land tiles', int(t['land'].sum()), 'max elev', int(t['elev'].max()))
