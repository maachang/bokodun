"""世界の地形: マカヒキ島（K: 江戸時代風の国）。本島（ボコスカ島）の南西の海に、3×3 メッシュ（行 12〜14・列 2〜4）いっぱいの島を足す。
島は、画像（island_map.png）にはない。海岸のゆがみの後に、陸と地形（草原）だけを足す。メッシュの端から 6 マス以上離す（島のマップが、隣へはみ出さない）"""
import numpy as np
from terrain_base import GRASS, H, MESH, W, _distance, _lipschitz, fbm

TOWN_R_FLAT = 17   # 街の敷地（terrain_sites.TOWN_R_FLAT と同じ。循環 import を避けて、ここに持つ）

ISLAND_MESH = (11, 1, 13, 3)   # 0 始まりの (行の始め, 列の始め, 行の終わり, 列の終わり)。行 12〜14・列 2〜4
ISLAND_CENTER = (800, 160)      # 島の中心 (y, x)
ISLAND_TOWNS = {'k': (794, 160)}   # マカヒキ国の城下町 (y, x): 壁（半幅 8・半高さ 6）は、マップ w_12_02（行 768〜831・列 128〜191）に収まる。決め打ち


def add_island(land, biome, elev, towns, town_mask):
    """島の陸地（land）・地形（biome=草原）・高さ（elev）・城下町の敷地を足す。本島の地形（乱数を使う山道など）がすべて終わった後に呼ぶ（本島を変えない）。
    戻り値: (land, biome, elev, towns, town_mask)"""
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
    # 高さ: ゆるやかな丘（0〜5 段）。海岸に向かって 1 マス 1 段までで下がり、街の敷地（半径 17）は平ら（0）
    hills = np.round(1.0 + 5.0 * fbm(203, (60, 20, 6)) ** 1.3).astype(np.int32)
    hills = np.minimum(hills, _distance(~land).astype(np.int32))
    for tid, (py, px) in ISLAND_TOWNS.items(): hills[np.hypot(xs - px, ys - py) <= TOWN_R_FLAT] = 0
    hills = _lipschitz(np.where(isl, hills, 0))
    elev = np.where(isl, hills, elev).astype(elev.dtype)
    for tid, (py, px) in ISLAND_TOWNS.items():   # 街の敷地（平らにして、物を置かない所）
        towns = list(towns) + [dict(id=tid, y=py, x=px)]
        town_mask = town_mask | ((np.hypot(xs - px, ys - py) <= TOWN_R_FLAT) & land)
    return land, biome, elev, towns, town_mask
