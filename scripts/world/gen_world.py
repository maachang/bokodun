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
from terrain import W, H, GW, GH, MESH, SEA, SNOW, CONIFER, FOREST, GRASS, DESERT, ROCK

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
    'Q': 'water', 'q': 'water_shallow', 'O': 'sea',
}
SOLID_CH = set('FCNPDGAXUMRSBH')          # 通れない物体（端のマスには置かない）
# 地面の種類（floorLayer の文字 → environment.floorType と同じ名前）
FLOOR = {'g': 'grass', 's': 'snow', 'f': 'forest', 'd': 'desert', 'r': 'rock', 'w': 'whiteSand', 'u': 'tundra'}
BIOME_FLOOR = {SNOW: 's', CONIFER: 'u', FOREST: 'f', GRASS: 'g', DESERT: 'd', ROCK: 'r', SEA: 'g'}
BIOME_NAME = {SNOW: '北の雪山', CONIFER: '針葉樹の裾野', FOREST: '大森林', GRASS: '草原', DESERT: '砂地', ROCK: '岩山', SEA: '海岸'}
# 環境（空・霧・光）: 既存の外マップから、地形ごとに借りる
ENV_FROM = {SNOW: 'field_snow', CONIFER: 'field_tundra', FOREST: 'field_forest', GRASS: 'field_grass', DESERT: 'field_desert', ROCK: 'field_mountain', SEA: 'field_coast'}


def build_tiles(t):
    """世界全体の、マスごとの物体の文字・地面の文字（W×H の配列）"""
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
    free = land & (t['deep'] | t['shallow']) == False
    free = land & ~(t['deep'] | t['shallow'])
    # 植生
    # 傾き（隣との高さの差。急な斜面・尾根ほど大きい）。岩は、急な斜面と尾根に、小さな固まりで、少しだけ置く（平らな所には置かない）
    e = elev.astype(np.float32)
    gx = np.abs(np.diff(e, axis=1, prepend=e[:, :1])); gy = np.abs(np.diff(e, axis=0, prepend=e[:1, :]))
    steep = T.box_mean(gx + gy, 2)
    clump = patch2 > 0.55
    rock_ok = (steep > 0.9) & (elev >= 6) & clump
    sn = free & (biome == SNOW); high = elev >= 22
    put(sn & rock_ok & (u < 0.05), 'R'); put(sn & rock_ok & (u < 0.05) & (u2 < 0.4), 'S'); put(sn & rock_ok & (u < 0.05) & (u2 >= 0.4) & (u2 < 0.6), 'B')
    put(sn & ~high & (u < (0.04 + 0.06 * (elev < 10))), 'P')
    put(sn & ~high & (patch > 0.66) & (u2 < 0.5) & (elev < 14), 'N')
    co = free & (biome == CONIFER)
    put(co & (u < 0.06), 'P'); put(co & (patch > 0.52) & (u2 < 0.7), 'C')
    fo = free & (biome == FOREST)
    put(fo & (u3 < 0.14), 'e'); put(fo & (u < 0.04), 'D'); put(fo & (patch2 > 0.56) & (u2 < 0.8), 'F')
    gr = free & (biome == GRASS)
    put(gr & (u < 0.12), 'm')
    put(gr & (u3 < 0.02), 'v'); put(gr & (u3 >= 0.02) & (u3 < 0.035), 'w'); put(gr & (u3 >= 0.035) & (u3 < 0.042), 'p'); put(gr & (u3 >= 0.042) & (u3 < 0.05), 'b')
    put(gr & (u2 < 0.01), 'l'); put(gr & (u3 > 0.985), 'G')
    de = free & (biome == DESERT)
    put(de & (u < 0.03), 'i'); put(de & (u2 < 0.01), 'A'); put(de & (u2 > 0.992), 'X'); put(de & (u3 < 0.008), 'U')
    ro = free & (biome == ROCK)
    put(ro & (u2 < 0.05), 'h')
    ro_ok = ro & (steep > 0.7) & clump
    put(ro_ok & (u < 0.06), 'R'); put(ro_ok & (u < 0.06) & (u3 < 0.35), 'S'); put(ro_ok & (u < 0.06) & (u3 >= 0.35) & (u3 < 0.6), 'B'); put(ro_ok & (u < 0.06) & (u3 >= 0.6) & (u3 < 0.75), 'H')
    # 砂浜（海から 3 マス以内）: 南の浜には、ヤシ
    beach = free & (d_sea <= 3)
    obj[beach] = ord('0')
    ys = np.arange(H)[:, None] * np.ones((1, W))
    put(beach & (ys > 620) & (u < 0.03), 'M')
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
    sea = ~land
    put(sea, 'O'); put(sea & (d_land <= 1), 'q')
    floor = np.vectorize(lambda b: ord(BIOME_FLOOR[b]), otypes=[np.uint8])(biome) if False else np.zeros((H, W), np.uint8)
    lut = np.zeros(8, np.uint8)
    for b, ch in BIOME_FLOOR.items(): lut[b] = ord(ch)
    floor = lut[biome]
    floor[land & (d_sea <= 3)] = ord('w')
    return obj, floor


def mesh_name(row, col, biome_counts, sea_frac):
    k = max(biome_counts, key=biome_counts.get)
    base = BIOME_NAME[SEA] if sea_frac > 0.35 else BIOME_NAME[k]
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
            counts = {b: int(((bm == b) & L).sum()) for b in (SNOW, CONIFER, FOREST, GRASS, DESERT, ROCK)}
            dom = max(counts, key=counts.get)
            sea_frac = float((~L).mean())
            floor_counts = {}
            for ch in 'gsfdrwu': floor_counts[ch] = int(((fl == ord(ch)) & L).sum())
            base_ch = max(floor_counts, key=floor_counts.get)
            env = dict(envs[SEA if sea_frac > 0.35 else dom])
            env['floorType'] = FLOOR[base_ch]
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
                'id': mid, 'name': mesh_name(j, i, counts, sea_frac), 'type': 'open', 'tileSize': 4, 'wallHeight': 4,
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
