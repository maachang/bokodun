#!/usr/bin/env python3
"""
ボコスカ島の世界（20×15 メッシュ。1 メッシュ＝64×64 マス）のマップを、terrain.py の地形から書き出す。
  - 陸のあるメッシュだけ、public/data/maps/w_行_列.json（行・列は 2 桁）を作る。海だけのメッシュは作らない。
  - public/data/world.json の grid を、この世界に置き換える（start は、最初に入るマップ）。
  - 敵・村・町・ダンジョン・ギミックは、作らない（地形だけ）。
  - 毎回、同じ結果になる（乱数は固定の種）。
使い方: python3 scripts/world/gen_world.py
"""
import os, sys, json, glob
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import terrain as T
from terrain import W, H, GW, GH, MESH, SEA, SNOW, CONIFER, FOREST, GRASS, DESERT, ROCK, TROPICAL, MINES, MINE_R

ROOT = T.ROOT
MAPS = os.path.join(ROOT, 'public', 'data', 'maps')
HEIGHT_STEP = 0.5
CH36 = '0123456789abcdefghijklmnopqrstuvwxyz'

# 物体（objects.json の ID）の文字
LEGEND = {
    'F': 'broadleaf_wall', 'C': 'conifer_wall', 'N': 'tundra_wall', 'P': 'snow_pine', 'D': 'dark_tree', 'G': 'grass_tree',
    'A': 'cactus', 'X': 'dead_tree', 'U': 'succulent', 'M': 'palm',
    'R': 'mountain_rock_a', 'S': 'mountain_rock_b', 'B': 'mountain_rock_c', 'H': 'mountain_rock_d',
    'm': 'meadow_grass', 'e': 'fern', 'h': 'highland_grass', 'v': 'weed_flower', 'k': 'cattail_cluster', 'l': 'lavender_flower', 'i': 'arid_grass', 'o': 'highland_weed', 'w': 'roadside_flowers', 'p': 'path_flower', 'b': 'bush_flower',
    'T': 'forest_tree_a', 'V': 'forest_tree_b', 'W': 'great_tree_a', 'K': 'great_tree_b',      # 森: 217・218 の木（2 倍）・大森林: 3 倍。林の壁（F・C・N）は、使わない
    'c': 'cliff_rock_wall', 'Y': 'tropical_tree', 'E': 'mine_entrance', 't': 'mine_cart',
    'Q': 'water', 'q': 'water_shallow', 'O': 'sea', 'Z': 'plank_bridge',
}
SOLID_CH = set('FCNPDGAXUMRSBHcYEtTVWK')          # 通れない物体（端のマスには置かない）
# 地面の種類（floorLayer の文字 → environment.floorType と同じ名前）
FLOOR = {'g': 'grass', 's': 'snow', 'f': 'forest', 'd': 'desert', 'r': 'rock', 'w': 'whiteSand', 'u': 'tundra', 'i': 'ice', 'm': 'redEarth', 'a': 'ash'}
BIOME_FLOOR = {SNOW: 's', CONIFER: 'u', FOREST: 'f', GRASS: 'g', DESERT: 'd', ROCK: 'r', TROPICAL: 'g', SEA: 'g'}
BIOME_NAME = {SNOW: '北の雪山', CONIFER: '針葉樹の裾野', FOREST: '大森林', GRASS: '草原', DESERT: '砂地', ROCK: '岩山', TROPICAL: '南国', SEA: '海岸'}
# 環境（空・霧・光）: 既存の外マップから、地形ごとに借りる
DARK_FOREST_ENV = {'ambientLight': 0x2c4234, 'directionalLight': 0x586e58, 'fogColor': 0x07100b, 'fogNear': 5, 'fogFar': 28, 'visibility': 0.4, 'skyColor': 0x07100b}
ENV_FROM = {SNOW: 'field_snow', CONIFER: 'field_tundra', FOREST: 'field_swamp', GRASS: 'field_grass', DESERT: 'field_desert', ROCK: 'field_mountain', TROPICAL: 'field_tropical', SEA: 'field_coast'}


def build_maze(fo):
    """大森林の天然の迷宮。3×3 マスを 1 区画（ユニット）として、奇数番目の区画が部屋（通路）、その間が壁か通路。
    迷路は、深追いの探索（DFS）で、全部の部屋が 1 本の道でつながる（行き止まりと遠回りがある）。少しだけ壁を抜いて、輪（ループ）を作る。
    森の外へは、ところどころ（25%）出入り口を開ける。戻り値: ユニットの種類（0 迷路でない・1 部屋・2 開いた通路・3 横の壁・4 縦の壁・5 柱）"""
    import random
    S = 3
    nu, nv = W // S, H // S
    kind = np.zeros((nv, nu), np.uint8)
    # 部屋にできるのは、3×3 マスが全部、森（水・断崖などのない所）の、奇数番目の区画
    f = fo[:nv * S, :nu * S].reshape(nv, S, nu, S).all(axis=(1, 3))
    active = np.zeros((nv, nu), bool)
    active[1::2, 1::2] = f[1::2, 1::2]
    # 隣り合う部屋（2 区画先）の間を、グラフにする
    rnd = random.Random(2026)
    nodes = [(v, u) for v, u in zip(*np.nonzero(active))]
    seen = set(); open_edges = set()
    order = nodes[:]; rnd.shuffle(order)
    for start in order:
        if start in seen: continue
        stack = [start]; seen.add(start)
        while stack:
            v, u = stack[-1]
            nbrs = [(v + dv, u + du, v + dv // 2, u + du // 2) for dv, du in ((2, 0), (-2, 0), (0, 2), (0, -2)) if 0 <= v + dv < nv and 0 <= u + du < nu and active[v + dv, u + du] and (v + dv, u + du) not in seen]
            if not nbrs: stack.pop(); continue
            nv_, nu_, ev, eu = nbrs[rnd.randrange(len(nbrs))]
            open_edges.add((ev, eu)); seen.add((nv_, nu_)); stack.append((nv_, nu_))
    # 輪（ループ）: 壁を少しだけ抜く
    for v, u in nodes:
        for dv, du in ((2, 0), (0, 2)):
            if 0 <= v + dv < nv and 0 <= u + du < nu and active[v + dv, u + du] and rnd.random() < 0.07:
                open_edges.add((v + dv // 2, u + du // 2))
    # 種類を決める
    for v, u in nodes: kind[v, u] = 1
    near = np.zeros((nv, nu), bool)
    for v, u in nodes:
        near[max(0, v - 1):v + 2, max(0, u - 1):u + 2] = True
    for v in range(nv):
        for u in range(nu):
            if not near[v, u] or kind[v, u] == 1: continue
            if v % 2 == 0 and u % 2 == 0: kind[v, u] = 5                        # 柱
            elif v % 2 == 1 and u % 2 == 0: kind[v, u] = 2 if (v, u) in open_edges else 4   # 左右の部屋の間: 縦の壁
            elif v % 2 == 0 and u % 2 == 1: kind[v, u] = 2 if (v, u) in open_edges else 3   # 上下の部屋の間: 横の壁
    # 森の外へ向かう、壁になる所（片側だけが部屋）: 25% を出入り口にする
    for v in range(nv):
        for u in range(nu):
            if kind[v, u] in (3, 4) and (v, u) not in open_edges:
                a = [(v + 1, u), (v - 1, u)] if kind[v, u] == 3 else [(v, u + 1), (v, u - 1)]
                ok = [active[x, y] for x, y in a if 0 <= x < nv and 0 <= y < nu]
                if ok.count(True) == 1 and rnd.random() < 0.25: kind[v, u] = 2
    return kind


def build_tiles(t):
    """世界全体の、マスごとの物体の文字・地面の文字（W×H の配列）。地形ごとの特徴は、ここで決める"""
    land, biome, elev = t['land'], t['biome'], t['elev']
    rng = np.random.default_rng(2026)
    u = rng.random((H, W)).astype(np.float32)
    u2 = rng.random((H, W)).astype(np.float32)
    u3 = rng.random((H, W)).astype(np.float32)
    patch = T.fbm(101, (40, 14, 6))
    patch2 = T.fbm(102, (26, 9, 4))
    obj = np.full((H, W), ord('0'), np.uint8)
    def put(mask, ch): obj[mask] = ord(ch)
    d_sea, d_water = t['dist_sea'], t['dist_water']
    free = land & ~(t['deep'] | t['shallow'] | t['bridge'])
    ys_, xs_ = np.mgrid[0:H, 0:W].astype(np.float32)
    sx, sy = W / 768.0, H / 640.0
    # 傾き（隣との高さの差。急な斜面ほど大きい）
    e = elev.astype(np.float32)
    gx = np.abs(np.diff(e, axis=1, prepend=e[:, :1])); gy = np.abs(np.diff(e, axis=0, prepend=e[:1, :]))
    steep = T.box_mean(gx + gy, 2)
    # 地面の種類（文字）: 地形の既定から、特徴ごとに上書きする
    lut = np.zeros(9, np.uint8)
    for b, ch in BIOME_FLOOR.items(): lut[b] = ord(ch)
    floor = lut[biome]
    def fl(mask, ch): floor[mask] = ord(ch)

    # --- 北の雪山（連峰）---
    sn = free & (biome == SNOW)
    cl = np.abs(T.fbm(61, (34, 12, 4)) - 0.5) < 0.034                       # 断崖の線（尾根・段）
    ice_hi = T.fbm(62, (30, 10, 4)); ice_lo = T.fbm(63, (22, 8, 3)); bare = T.fbm(64, (18, 6, 3))
    forest_tree = lambda mask, k: (put(mask & (k < 0.5), 'T'), put(mask & (k >= 0.5), 'V'))
    forest_tree(sn & (elev < 12) & (patch > 0.5) & (u2 < 0.32), u3)               # 裾野の木（2 倍の木を、1 本ずつ）
    put(sn & (elev < 12) & (u < 0.10) & (obj == ord('0')), 'P')
    put(sn & (elev >= 12) & (elev < 24) & (u < 0.025), 'P')
    put(sn & (elev >= 14) & cl & (u3 < 0.88), 'c')                              # 断崖の壁（ところどころ切れて、峠になる）
    fl(sn & (elev >= 16) & (ice_hi > 0.62), 'i')                               # 氷河
    fl(sn & (elev < 14) & (ice_lo > 0.74), 'i')                                # 凍った湖
    fl(sn & (elev >= 24) & (bare > 0.25), 'r')                                  # 高い所は、岩肌
    co = free & (biome == CONIFER)
    put(co & (u < 0.06), 'P'); forest_tree(co & (patch > 0.52) & (u2 < 0.34), u3)

    # --- 西の大森林: 天然の迷宮（217・218 の木を 3 倍。真っ暗。起伏が激しい。目印を減らし、同じような木が続く）---
    fo = free & (biome == FOREST)
    maze_kind = build_maze(fo)
    S = 3
    mk = np.zeros((H, W), np.uint8)
    mk[:maze_kind.shape[0] * S, :maze_kind.shape[1] * S] = np.kron(maze_kind, np.ones((S, S), np.uint8))
    lx = (xs_.astype(int) % S); ly = (ys_.astype(int) % S)
    hs = u2                                                                       # ばらつき（壁の、中心線以外のマスに木を置くか）
    wall_tree = (((mk == 3) & ((ly == 1) | (hs < 0.55))) |                        # 横の壁: 中心の行は、必ず木（すき間なし）
                 ((mk == 4) & ((lx == 1) | (hs < 0.55))) |                        # 縦の壁: 中心の列は、必ず木
                 ((mk == 5) & ((lx == 1) | (ly == 1) | (hs < 0.5))))              # 柱: 中心の十字は、必ず木
    in_maze = fo & (mk > 0)
    put(fo & (u3 < 0.10), 'e')                                                    # 下草（シダ）。目印になる花・断崖・空き地は、置かない
    put(in_maze & wall_tree & (u < 0.5), 'W'); put(in_maze & wall_tree & (u >= 0.5), 'K')   # 巨木（3 倍）
    # 迷路の外の森（迷路にならない端・川のそば）: 木は少なめ（通れる）
    out_maze = fo & (mk == 0)
    put(out_maze & (u2 < 0.12) & (u < 0.5), 'W'); put(out_maze & (u2 < 0.12) & (u >= 0.5), 'K')
    fl(fo, 'f')

    # --- 草原 ---
    gr = free & (biome == GRASS)
    put(gr & (u < 0.12), 'm')
    put(gr & (u3 < 0.02), 'v'); put(gr & (u3 >= 0.02) & (u3 < 0.035), 'w'); put(gr & (u3 >= 0.035) & (u3 < 0.042), 'p'); put(gr & (u3 >= 0.042) & (u3 < 0.05), 'b')
    put(gr & (u2 < 0.01), 'l'); put(gr & (u3 > 0.985), 'G')

    # --- 砂地 ---
    de = free & (biome == DESERT)
    put(de & (u < 0.03), 'i')
    put(de & (u2 < 0.01), 'A'); put(de & (u2 > 0.992), 'X'); put(de & (u3 < 0.008), 'U')

    # --- 南国 ---
    tr = free & (biome == TROPICAL)
    sandy = T.fbm(81, (22, 8, 3))
    fl(tr & (sandy > 0.62), 'w')
    put(tr & (u3 < 0.14), 'e'); put(tr & (u < 0.05), 'b'); put(tr & (u2 < 0.02), 'w'); put(tr & (u2 >= 0.02) & (u2 < 0.03), 'p')
    put(tr & (u2 > 0.965), 'Y'); put(tr & (u2 > 0.92) & (u2 <= 0.965), 'M')
    forest_tree(tr & (patch2 > 0.6) & (u3 > 0.55), u)                            # ジャングルの茂み（2 倍の木）

    # --- 東の山々と炭鉱 ---
    ro = free & (biome == ROCK)
    strata = np.sin(elev.astype(np.float32) * 0.8 + T.fbm(91, (30, 10, 4)) * 8) > 0.5
    fl(ro, 'r'); fl(ro & strata, 'm')                                          # 岩肌と、赤茶の地層の縞
    put(ro & (u2 < 0.05), 'h')
    cl2 = np.abs(T.fbm(81 + 5, (28, 10, 4)) - 0.5) < 0.02
    put(ro & (elev >= 6) & cl2 & (u3 < 0.75), 'c')                              # 山の断崖
    # 炭鉱: 掘削跡（くぼ地）のまわり。赤茶と黒い地面、ふちの断崖、入口とトロッコ
    dmine = np.full((H, W), 1e9, np.float32)
    for mx, my in MINES:
        dmine = np.minimum(dmine, np.hypot(xs_ - mx * sx, ys_ - my * sy))
    mine = land & (dmine < MINE_R)
    inner = land & (dmine < MINE_R * 0.42)
    zone = free & mine
    for ch in 'hceFDGPCNe': obj[zone & (obj == ord(ch))] = ord('0')
    fl(zone, 'm'); fl(free & inner, 'a'); fl(free & (dmine < MINE_R * 0.7) & (T.fbm(92, (9, 4, 2)) > 0.6), 'a')
    ang = np.arctan2(ys_ - np.array([m[1] for m in MINES])[np.argmin([np.hypot(xs_ - mx * sx, ys_ - my * sy) for mx, my in MINES], axis=0)] * sy, xs_ - np.array([m[0] for m in MINES])[np.argmin([np.hypot(xs_ - mx * sx, ys_ - my * sy) for mx, my in MINES], axis=0)] * sx)
    ring = zone & (dmine > MINE_R * 0.74) & (dmine < MINE_R * 0.82)
    gap = ((np.floor((ang + np.pi) / (np.pi / 8)).astype(int)) % 3 == 0)         # 入口（切れ目）
    put(ring & ~gap & (u3 < 0.85), 'c')

    # 砂浜（海から 3 マス以内。南国は 5 マス）: 白い砂。南の浜には、ヤシ
    beach_w = np.where(biome == TROPICAL, 5, 3)
    beach = free & (d_sea <= beach_w)
    obj[beach & ~np.isin(obj, [ord('Y'), ord('M')])] = ord('0')
    fl(land & (d_sea <= beach_w), 'w')
    put(beach & (biome == TROPICAL) & (u < 0.08), 'M')
    put(beach & (ys_ > 620) & (biome != TROPICAL) & (u < 0.03), 'M')
    # 水辺: ガマ
    bank = free & (d_water <= 2) & np.isin(biome, [GRASS, FOREST])
    put(bank & (u2 < 0.3) & np.isin(obj, [ord('0'), ord('m'), ord('e'), ord('v'), ord('w'), ord('p'), ord('b')]), 'k')
    # 水: 川・湖（深い所 Q・浅瀬 q）、湖の中央と海（O）、海の岸の浅瀬（q）
    lake = t['lake']
    d_nonlake = T._distance(~lake)
    d_land = T._distance(land)
    put(t['deep'] & ~lake, 'Q')
    put(lake & t['deep'], 'Q'); put(lake & t['deep'] & (d_nonlake >= 3), 'O')
    put(t['shallow'], 'q')
    put(t['bridge'], 'Z')                                                       # 川の橋
    sea = ~land
    trop_near = T.box_mean((biome == TROPICAL).astype(np.float32), 8) > 0.02
    put(sea, 'O'); put(sea & (d_land <= np.where(trop_near, 3, 1)), 'q')
    # 炭鉱の入口とトロッコ: 掘削跡のふち（北・西・東側）に、地形ごとに少数
    for k, (mx, my) in enumerate(MINES):
        cx, cz = mx * sx, my * sy
        for a_deg, ch in ((200 if k == 0 else 160, 'E'), (230 if k == 0 else 120, 't'), (170 if k == 0 else 200, 't')):
            a = np.radians(a_deg); rr = MINE_R * (0.62 if ch == 'E' else 0.5)
            x0, y0 = int(cx + np.cos(a) * rr), int(cz + np.sin(a) * rr)
            for dy in range(-3, 4):
                for dx in range(-3, 4):
                    yy, xx = y0 + dy, x0 + dx
                    if 0 <= yy < H and 0 <= xx < W and free[yy, xx] and obj[yy, xx] in (ord('0'),):
                        obj[yy, xx] = ord(ch); break
                else: continue
                break
    return obj, floor


def mesh_name(row, col, biome_counts, sea_frac, mine=False):
    k = max(biome_counts, key=biome_counts.get)
    base = BIOME_NAME[SEA] if sea_frac > 0.35 else BIOME_NAME[k]
    if mine: base = '炭鉱の山'
    return f'{base} ({row + 1}-{col + 1})'


def main():
    t = T.build()
    obj, floor = build_tiles(t)
    land, biome, elev = t['land'], t['biome'], t['elev']
    envs = {}
    for b, f in ENV_FROM.items():
        envs[b] = json.load(open(os.path.join(MAPS, f + '.json'), encoding='utf-8'))['environment']
    # 古い生成結果を消す
    for f in glob.glob(os.path.join(MAPS, 'w_*.json')): os.remove(f)
    grid = [[None] * GW for _ in range(GH)]
    info = {}
    for j in range(GH):
        for i in range(GW):
            ys, xs = slice(j * MESH, (j + 1) * MESH), slice(i * MESH, (i + 1) * MESH)
            L = land[ys, xs]
            if not L.any(): continue
            o = obj[ys, xs].copy(); fl = floor[ys, xs]; el = elev[ys, xs]; bm = biome[ys, xs]
            # 端のマスも、そのまま（端を越えたとき、隣のマップの木・岩に重なったら、エンジン（pushPlayerOutOfWalls）が、近くの空きへ出す）
            counts = {b: int(((bm == b) & L).sum()) for b in (SNOW, CONIFER, FOREST, GRASS, DESERT, ROCK, TROPICAL)}
            dom = max(counts, key=counts.get)
            sea_frac = float((~L).mean())
            floor_counts = {}
            for ch in 'gsfdrwuima': floor_counts[ch] = int(((fl == ord(ch)) & L).sum())
            base_ch = max(floor_counts, key=floor_counts.get)
            env = dict(envs[SEA if sea_frac > 0.35 else dom])
            env['floorType'] = FLOOR[base_ch]
            if not sea_frac > 0.35 and dom == FOREST:
                env.update(DARK_FOREST_ENV)   # 大森林: 真っ暗（数マス先は、巨木のシルエットだけ）
            layout = [''.join(chr(v) for v in row) for row in o]
            heights = [''.join(CH36[min(35, int(v))] for v in row) for row in el]
            floor_layer = [''.join(chr(v) for v in row) for row in fl]
            used = set(''.join(layout)) - {'0'}
            legend = {k: LEGEND[k] for k in sorted(used)}
            mid = f'w_{j:02d}_{i:02d}'
            # 出現位置: 中央に近い、歩ける陸のマス
            solid = set(SOLID_CH) | set('QO')
            cy, cx = MESH // 2, MESH // 2
            best = None
            for r in range(MESH):
                for c in range(MESH):
                    if not L[r, c] or chr(o[r, c]) in solid or chr(o[r, c]) in 'q': continue
                    d = (r - cy) ** 2 + (c - cx) ** 2
                    if best is None or d < best[0]: best = (d, r, c)
            spawn = {'x': best[2], 'z': best[1], 'angle': 0} if best else {'x': 32, 'z': 32, 'angle': 0}
            m = {
                'id': mid, 'name': mesh_name(j, i, counts, sea_frac, any(ch in ('E', 't') for ch in set(''.join(layout)))), 'type': 'open', 'tileSize': 4, 'wallHeight': 4,
                'spawn': spawn, 'environment': env, 'legend': legend, 'enemies': {},
                'heightStep': HEIGHT_STEP, 'sideShade': 1.0, 'heights': heights,
                'floorLegend': {k: FLOOR[k] for k in sorted(set(''.join(floor_layer)))}, 'floorLayer': floor_layer,
                'layout': layout,
            }
            json.dump(m, open(os.path.join(MAPS, mid + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
            grid[j][i] = mid
            info[mid] = dict(row=j, col=i, dom=dom, sea=sea_frac, grass=counts[GRASS] / max(1, int(L.sum())), land=int(L.sum()))
    # 最初のマップ: 島の中心に近く、ほとんどが陸で、草原が多いメッシュ
    cands = [(abs(v['row'] - 8) + abs(v['col'] - 11), k) for k, v in info.items() if v['sea'] < 0.05 and v['grass'] > 0.6]
    start = min(cands)[1]
    json.dump({'mapSize': MESH, 'start': start, 'grid': grid}, open(os.path.join(ROOT, 'public', 'data', 'world.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    print('マップ数', len(info), 'start', start)


if __name__ == '__main__':
    main()
