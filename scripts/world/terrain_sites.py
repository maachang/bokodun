"""世界の地形: オアシスと街の敷地"""
import numpy as np
from PIL import Image, ImageDraw
from terrain_base import DESERT, FOREST, GRASS, H, RIVERS, TROPICAL, W, _distance, fbm, noise
from terrain_coast import _components, _near_seam


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
        if not picks: py, px = OASIS_TOWN_AT   # 最初（街を作る大きなオアシス）は、位置を決め打ち
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
TOWN_CANDIDATES = [('a', 375, 700), ('b', 515, 880), ('c', 470, 700), ('d', 640, 545), ('e', 790, 730), ('f', 590, 1060), ('g', 473, 358), ('h', 720, 360)]   # (名前, y, x)


OASIS_TOWN_AT = (412, 740)   # 街を作る大きなオアシスの中心（行, 列）。湖と、その南の街（C）が、1 枚のマップ（w_06_11: 行 384〜447）に収まり、街の壁が、マップの境から 8 マス以上離れる位置（ユーザー指示「C は湖の下あたり」）
OASIS_TOWNS = {'c': 4}   # 砂漠のオアシスの、すぐ南に置く街 → 壁の北端と、池・浅瀬の南端の間のマス数（ユーザー指示「C は、湖の下あたり」。壁は、水から 3 マス以上離す規則を守る）
OASIS_WALL_HH = 6                # 街の外壁の半分の高さ（world_consts の TOWN_HH と同じ値。循環 import を避けて、ここに持つ）


TOWN_R_FLAT = 17   # 街の敷地（平らにして、物を置かない）の半径


# 山の上に置く街（位置を決め打ち。雪の連峰の山頂の、平らな台地。標高は、そのまま。山道でしか行けない）: A キュラビッド帝国（ユーザー指定: ロシア風・山道でしか行けない北の帝国）
FIXED_TOWNS = {'a': (162, 842)}   # 街 → (y, x)。台地（高さ 35・約 28×30 マス）の中。山道が、台地の東の縁を通る


TOWN_GATE_FRONT = 9               # 街の中心から、門前の石畳の南の端までの行数（gen_world の TOWN_HH = 6 から: 壁の南端 +5・石畳 +4）


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
    sites = []; mask = np.zeros((H, W), bool); mask_mtn = np.zeros((H, W), bool)
    for tid, cy, cx in TOWN_CANDIDATES:
        if tid in OASIS_TOWNS and oasis.get('town') is not None:   # オアシスの南: 池・浅瀬の南端から、壁の北端まで OASIS_TOWNS[tid] マス。列は、オアシスの中心
            oy, ox = oasis['town']
            water = (oasis['pond'] | oasis['ring'])[:, ox - 8:ox + 9].any(axis=1)
            bottom = max(y for y in range(max(0, oy - 30), min(H, oy + 31)) if water[y])
            py, px = bottom + OASIS_TOWNS[tid] + OASIS_WALL_HH, ox
            sites.append(dict(id=tid, y=py, x=px))
            mask |= (np.hypot(X - px, Y - py) <= TOWN_R_FLAT) & land
            continue
        if tid in FIXED_TOWNS:   # 山の上の街: 決め打ち。標高は変えない（mask_mtn は、物を置かない範囲だけ）
            py, px = FIXED_TOWNS[tid]
            sites.append(dict(id=tid, y=py, x=px))
            mask_mtn |= (np.hypot(X - px, Y - py) <= TOWN_R_FLAT) & land
            continue
        b0 = biome[cy, cx] if biome[cy, cx] in (GRASS, TROPICAL, DESERT) or (tid == 'g' and biome[cy, cx] == FOREST) else GRASS     # C は砂漠（オアシスの池から 20 マス以上離す）
        ok = base & (_distance(biome != b0).astype(np.float32) >= 12)
        for o in sites: ok &= np.hypot(X - o['x'], Y - o['y']) > 70
        if not ok.any(): continue
        dd = np.where(ok, np.hypot(X - cx, Y - cy), 1e9)
        py, px = np.unravel_index(np.argmin(dd), dd.shape)
        py, px = int(py), int(px)
        sites.append(dict(id=tid, y=py, x=px))
        mask |= (np.hypot(X - px, Y - py) <= TOWN_R_FLAT) & land
    return sites, mask, mask_mtn
