"""世界の地形: マカヒキ島（K: 江戸時代風の国）。本島（ボコスカ島）の南西の海に、3×3 メッシュ（行 12〜14・列 2〜4）いっぱいの島を足す。
島は、画像（island_map.png）にはない。本島の地形・山道（乱数を使う処理）がすべて終わった後に、陸・地形・水（湖・小さな河）・森・高さ・街の敷地を足す。
メッシュの端から 6 マス以上離す（島のマップが、隣へはみ出さない）。人が住むので、水は必須（ユーザー指示）: 湖 1 つ・小さな河 1 本（湖から南東の海へ）・森（南西）"""
import numpy as np
from PIL import Image, ImageDraw
from terrain_base import BRIDGE_WIDTH, FOREST, GRASS, H, MESH, W, _dil, _distance, _ero, _lipschitz, fbm

TOWN_R_FLAT = 17   # 街の敷地（terrain_sites.TOWN_R_FLAT と同じ。循環 import を避けて、ここに持つ）
ISLAND_MESH = (11, 1, 13, 3)   # 0 始まりの (行の始め, 列の始め, 行の終わり, 列の終わり)。行 12〜14・列 2〜4
ISLAND_CENTER = (800, 160)      # 島の中心 (y, x)
ISLAND_TOWNS = {'k': (794, 160), 'k1': (790, 215)}   # マカヒキ国の城下町 (y, x): 壁（半幅 8・半高さ 6）は、マップ w_12_02（行 768〜831・列 128〜191）に収まる。決め打ち。k1 はコマチ港町（東の海辺。壁はマップ w_12_03（行 768〜831・列 192〜255）に収まる。川から 20 マス以上）
LAKE = (750, 150, 11)           # 湖（y, x, 半径）: 北寄り。街から 40 マス以上・メッシュの境（x 128・y 768）から 7 マス以上
RIVER = [(758, 156), (770, 170), (784, 183), (798, 190), (812, 204), (822, 222), (826, 250)]   # 小さな河（湖 → 南東の海。(y, x)）。街の壁から 14 マス以上
RIVER_WIDTH = 3
FORST = (835, 125, 27)          # 森（y, x, 半径）: 南西。街の敷地から 26 マス以上


def _blob(ys, xs, cy, cx, r, seed):
    """ゆらいだ円（海岸・湖・森の形）"""
    return np.hypot(ys - cy, xs - cx) < r * (1.0 + (fbm(seed, (14, 6, 3)) - 0.5) * 0.7)


def _river(land, lake):
    """小さな河（深い水）と、歩いて渡れる所（浅瀬＝橋）の印。戻り値: (deep, ford)"""
    deep = Image.new('L', (W, H), 0); dd = ImageDraw.Draw(deep)
    ford = Image.new('L', (W, H), 0); fd = ImageDraw.Draw(ford)
    seg = []
    for (y0, x0), (y1, x1) in zip(RIVER[:-1], RIVER[1:]):
        n = max(1, int(np.hypot(y1 - y0, x1 - x0) / 5))
        seg += [(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n) for i in range(n)]
    seg.append((RIVER[-1][1], RIVER[-1][0]))
    path = []
    for i, (x, y) in enumerate(seg):   # ゆるい蛇行（振れ幅 2 マス）
        j, k = min(i + 1, len(seg) - 1), max(i - 1, 0)
        dx, dy = seg[j][0] - seg[k][0], seg[j][1] - seg[k][1]; L = np.hypot(dx, dy) or 1
        m = 2.0 * np.sin(i * 0.9) * min(1.0, i / 6, (len(seg) - i) / 6)
        path.append((x - dy / L * m, y + dx / L * m))
    (xa, ya), (xb, yb) = path[-2], path[-1]; L = np.hypot(xb - xa, yb - ya) or 1   # 海まで延ばす: 最後の向きのまま、陸の外に出るまで（河口が、海につながる）
    ux, uy = (xb - xa) / L, (yb - ya) / L
    for k in range(1, 80):
        px, py = xb + ux * 3 * k, yb + uy * 3 * k
        path.append((px, py))
        if not (0 <= int(py) < H and 0 <= int(px) < W) or not land[int(py), int(px)]: break
    for i in range(1, len(path)): dd.line([path[i - 1], path[i]], fill=255, width=RIVER_WIDTH)
    for i in (len(path) * 2 // 5, len(path) * 4 // 5):   # 浅瀬（橋）: 2 か所。川の向きに垂直に、幅 BRIDGE_WIDTH
        (xa, ya), (xb, yb) = path[i - 1], path[i + 1]; L = np.hypot(xb - xa, yb - ya) or 1
        nx, ny = -(yb - ya) / L, (xb - xa) / L; cx, cy = path[i]
        fd.line([(cx - nx * 5, cy - ny * 5), (cx + nx * 5, cy + ny * 5)], fill=255, width=BRIDGE_WIDTH)
    deep = (np.asarray(deep) > 0) & land & ~lake
    return deep, (np.asarray(ford) > 0) & deep


def add_island(g):
    """島の陸地（land）・地形（biome）・高さ（elev）・水（lake・river・deep・shallow・bridge）・城下町の敷地（towns・town_mask）を、g に足す"""
    land, biome, elev = g.land, g.biome, g.elev
    y0, x0, y1, x1 = ISLAND_MESH
    ys, xs = np.mgrid[0:H, 0:W].astype(np.float32)
    cy, cx = ISLAND_CENTER
    ay, ax = (y1 - y0 + 1) * MESH / 2 - 14, (x1 - x0 + 1) * MESH / 2 - 14   # 楕円の半径（端から 14 マス内側）
    d = np.hypot((ys - cy) / ay, (xs - cx) / ax)
    n = (fbm(201, (40, 14, 5)) - 0.5) * 0.42          # 海岸のゆらぎ（入り江・岬）
    isl = (d + n) < 0.92
    box = np.zeros((H, W), bool); box[y0 * MESH + 6:(y1 + 1) * MESH - 6, x0 * MESH + 6:(x1 + 1) * MESH - 6] = True
    isl &= box
    isl &= _distance(land).astype(np.float32) > 12     # 本島の陸（北東の端にある）から 12 マス以上離す（つながらず、海峡をあける）
    land = land | isl
    biome = np.where(isl, GRASS, biome).astype(np.uint8)
    # 森（南西）
    fy, fx, fr = FORST
    biome = np.where(_blob(ys, xs, fy, fx, fr, 211) & isl, FOREST, biome).astype(np.uint8)
    # 湖と小さな河
    ly, lx, lr = LAKE
    lake = _blob(ys, xs, ly, lx, lr, 212) & isl
    river_deep, ford = _river(land, lake)
    ford &= ~_dil(lake, 9)   # 湖のそばには、橋をかけない（橋の両岸が陸であること）
    shallow = lake & ~_ero(lake, 3)                    # 湖のふち: 浅瀬
    deep = (lake | river_deep) & ~shallow & ~ford
    river = np.where(river_deep, 1, 0).astype(np.uint8); river[ford] = 2
    water = lake | river_deep
    # 高さ: ゆるやかな丘（0〜5 段）。海岸・水辺に向かって 1 マス 1 段までで下がり、街の敷地（半径 17）は平ら（0）
    hills = np.round(1.0 + 5.0 * fbm(203, (60, 20, 6)) ** 1.3).astype(np.int32)
    hills = np.minimum(hills, _distance(~land | water).astype(np.int32))
    for tid, (py, px) in ISLAND_TOWNS.items(): hills[np.hypot(xs - px, ys - py) <= TOWN_R_FLAT] = 0
    hills = _lipschitz(np.where(isl & ~water, hills, 0))
    g.elev = np.where(isl, hills, elev).astype(elev.dtype)
    towns, town_mask = list(g.towns), g.town_mask
    for tid, (py, px) in ISLAND_TOWNS.items():   # 街の敷地（平らにして、物を置かない所）
        towns.append(dict(id=tid, y=py, x=px))
        town_mask = town_mask | ((np.hypot(xs - px, ys - py) <= TOWN_R_FLAT) & land)
    g.land, g.biome, g.towns, g.town_mask = land, biome, towns, town_mask
    g.lake = g.lake | lake
    g.river = np.where(isl, river, g.river).astype(g.river.dtype)
    g.water_deep = g.water_deep | deep
    g.water_shallow = g.water_shallow | shallow
    g.bridge = g.bridge | ford
    g.any_water = g.any_water | water
