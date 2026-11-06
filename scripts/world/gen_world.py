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
    'J': 'conifer_forest_a', 'L': 'conifer_forest_b', 'j': 'great_conifer_a', 'n': 'great_conifer_b', 'x': 'conifer_tree_a', 'y': 'conifer_tree_b',   # 寒冷地の木（ID 262・263）: 森 2 倍・大森林 3 倍・単独 1 倍
    'a': 'tropical_forest_a', 'd': 'tropical_forest_b', 'f': 'tropical_palm_forest', 'r': 'swamp_tree_a', 's': 'marsh_flower', 'g': 'water_shallow_glow',   # 南国: ジャングルの木・ヤシの林（2 倍）・マングローブ・毒々しい花・青緑に光る浅瀬
    'c': 'cliff_rock_wall', 'Y': 'tropical_tree', 'E': 'mine_entrance', 't': 'mine_cart',
    'Q': 'water', 'q': 'water_shallow', 'O': 'sea', 'Z': 'plank_bridge',
}
SOLID_CH = set('FCNPDGAXUMRSBHcYEtTVWKJLjnxyadfr')          # 通れない物体（端のマスには置かない）
# 地面の種類（floorLayer の文字 → environment.floorType と同じ名前）
FLOOR = {'g': 'grass', 's': 'snow', 'f': 'forest', 'd': 'desert', 'r': 'rock', 'w': 'whiteSand', 'u': 'tundra', 'i': 'ice', 'm': 'redEarth', 'a': 'ash'}
BIOME_FLOOR = {SNOW: 's', CONIFER: 'u', FOREST: 'f', GRASS: 'g', DESERT: 'd', ROCK: 'r', TROPICAL: 'g', SEA: 'g'}
BIOME_NAME = {SNOW: '北の雪山', CONIFER: '針葉樹の裾野', FOREST: '大森林', GRASS: '草原', DESERT: '砂地', ROCK: '岩山', TROPICAL: '南国', SEA: '海岸'}
# 環境（空・霧・光）: 既存の外マップから、地形ごとに借りる
TROPICAL_ENV = {'ambientLight': 0xffffff, 'directionalLight': 0xfff2c8, 'fogColor': 0xb8e8e0, 'fogNear': 30, 'fogFar': 105, 'visibility': 1.0, 'skyColor': 0x4fd0e8}   # 南国: 青緑がかった、明るい空と霧
DARK_FOREST_ENV = {'ambientLight': 0x56725e, 'directionalLight': 0x94a88a, 'fogColor': 0x1a2a20, 'fogNear': 9, 'fogFar': 44, 'visibility': 0.65, 'skyColor': 0x1a2a20}
ENV_FROM = {SNOW: 'field_snow', CONIFER: 'field_tundra', FOREST: 'field_swamp', GRASS: 'field_grass', DESERT: 'field_desert', ROCK: 'field_mountain', TROPICAL: 'field_tropical', SEA: 'field_coast'}


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
    free = land & ~(t['deep'] | t['shallow'] | t['bridge'] | t['lagoon'])
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
    # 木は、2 マスおきの格子の点にだけ置く（隣り合うマスに、木が並ばない。木の間は、必ず 1 マス以上あいて、通れる）
    lat = ((xs_.astype(int) % 2) == 0) & ((ys_.astype(int) % 2) == 0)
    forest_tree = lambda mask, k: (put(mask & lat & (k < 0.5), 'T'), put(mask & lat & (k >= 0.5), 'V'))
    conifer_forest = lambda mask, k: (put(mask & lat & (k < 0.5), 'J'), put(mask & lat & (k >= 0.5), 'L'))   # 寒冷地の森: 針葉樹（ID 262・263）を 2 倍
    conifer_single = lambda mask, k: (put(mask & (k < 0.5), 'x'), put(mask & (k >= 0.5), 'y'))            # 寒冷地の、単独の針葉樹（1 倍）
    # --- 雪山の裾野: 標高による帯（草地 → ツンドラ → 針葉樹林（森林限界）→ まばらな木と雪原 → 雪と岩肌）。境は、ノイズでぼかす ---
    foot = free & np.isin(biome, [SNOW, CONIFER])
    nj = (T.fbm(120, (24, 9, 3)) - 0.5) * 4
    ee = elev + nj
    snowp = T.fbm(121, (16, 6, 3)); tundrap = T.fbm(122, (18, 7, 3))
    meadow = foot & (ee < 3.5)
    tundra = foot & (ee >= 3.5) & (ee < 6.5)
    belt = foot & (ee >= 5.5) & (ee < 11.5)
    sparse = foot & (ee >= 11.5) & (ee < 17)
    # 地面: 草地は草、ツンドラは苔の土に雪の斑点、森林帯は雪の斑点が多い土、まばらな帯は雪に土の斑点
    fl(meadow, 'g'); fl(tundra | belt, 'u')
    fl(tundra & (snowp > 0.66), 's'); fl(belt & (snowp > 0.5), 's'); fl(sparse, 's'); fl(sparse & (tundrap > 0.72), 'u')
    # 草・花: 草地（高原の草・ラベンダー・草の花）、ツンドラ（高地の雑草・草）
    put(meadow & (u < 0.13), 'h'); put(meadow & (u3 > 0.95), 'l'); put(meadow & (u3 > 0.90) & (u3 <= 0.95), 'v'); put(meadow & (u2 < 0.05) & (u3 < 0.5), 'o')
    put(tundra & (u < 0.10), 'o'); put(tundra & (u2 < 0.06), 'h'); put(tundra & (u3 > 0.97), 'l')
    put(belt & (u3 < 0.05), 'o')
    # 木: 針葉樹林（森林限界）は、2 倍の針葉樹を、まとまりのある群れで。草地・ツンドラにも、群れのはしが入る。まばらな帯は、一本立ち
    conifer_forest(belt & (patch > 0.42) & (u2 < 0.75), u3)
    conifer_forest((meadow | tundra) & (patch > 0.62) & (u2 < 0.45), u3)
    conifer_single((belt | tundra) & (u < 0.06) & (obj == ord('0')), u3)
    conifer_single(sparse & (u < 0.025), u3)
    conifer_single(meadow & (u < 0.015), u3)
    # 枯れ木（砂漠の珍しい木）: 森林限界の上の方に、まばらに
    put((belt | sparse) & (ee >= 8.5) & (u3 < 0.025) & (obj == ord('0')), 'X')
    # 水辺（裾野の池・川）: 高地の草（毒々しい花は湿地・南国の花なので、北の裾野には置かない）
    put(foot & (d_water <= 3) & (u3 < 0.10) & (obj == ord('0')), 'h')
    # 凍った池（氷の地面）
    fl(t['frozen'] & land, 'i')
    # 裾野と草原の境をぼかす: 草原（草の地形）のうち、裾野から 28 マス以内は、ツンドラの地面・針葉樹・高地の草が、距離とともに、まばらになる（境が、1 本の線にならない）
    d_cold = T._distance(np.isin(biome, [SNOW, CONIFER]) & land)
    trans = free & (biome == GRASS) & (d_cold > 0) & (d_cold <= 28)
    tt = d_cold.astype(np.float32) / 28.0                                       # 境 0 → 28 マス先 1
    mixn = T.fbm(123, (20, 8, 3)) * 0.6 + 0.2
    mix = trans & (mixn > tt)                                                   # 境に近いほど、混ざる
    fl(mix, 'u'); fl(mix & (snowp > 0.8), 's')
    put(mix & (u < 0.10) & (obj == ord('0')), 'o'); put(mix & (u2 < 0.05) & (obj == ord('0')), 'h')
    conifer_forest(trans & (patch > 0.55) & (u2 < (1 - tt) * 0.5), u3)
    conifer_single(trans & (u < (1 - tt) * 0.05) & (obj == ord('0')), u3)
    put(sn & (elev >= 14) & cl & (u3 < 0.88), 'c')                              # 断崖の壁（ところどころ切れて、峠になる）
    fl(sn & (elev >= 16) & (ice_hi > 0.62), 'i')                               # 氷河
    fl(sn & (elev >= 8) & (elev < 14) & (ice_lo > 0.82), 'i')                  # 山の谷の、凍った所
    fl(sn & (elev >= 24) & (bare > 0.25), 'r')                                  # 高い所は、岩肌

    # --- 西の大森林: 巨木（217・218 の木を 3 倍）・真っ暗・起伏が激しい。岩山や崖にはしない（普通の、通れる起伏）。迷路的にするなら、木でなく起伏で ---
    fo = free & (biome == FOREST)
    put(fo & (u3 < 0.12), 'e')                                                    # 下草（シダ）。目印になる花・断崖・空き地は、置かない
    # 木は、2 マスおきの格子の点にだけ（隣り合うマスに並ばない。木の間は、必ず通れる）
    put(fo & lat & (u2 < 0.65) & (u < 0.5), 'W'); put(fo & lat & (u2 < 0.65) & (u >= 0.5), 'K')   # 巨木（3 倍）
    fl(fo, 'f')
    # 大森林と他の地形の境: 境に近いほど、巨木とシダを間引き、草に置き換える（草原の中に、巨木・シダが急に現れない）。境から 6 マス以内は全部、14 マス先で 0
    d_out_fo = T._distance(land & (biome != FOREST) & (biome != SEA))
    u7 = (u2 * 8.3 + u3 * 6.1) % 1.0
    thin_fo = fo & (d_out_fo <= 14) & (d_out_fo > 0) & (u7 < np.clip((14.0 - d_out_fo.astype(np.float32)) / 8.0, 0, 1))
    for ch in 'WKe': obj[thin_fo & (obj == ord(ch))] = ord('0')
    put(thin_fo & (obj == ord('0')) & (u < 0.15), 'm')

    # --- 草原 ---
    gr = free & (biome == GRASS)
    put(gr & (u < 0.12), 'm')
    put(gr & (u3 < 0.02), 'v'); put(gr & (u3 >= 0.02) & (u3 < 0.035), 'w'); put(gr & (u3 >= 0.035) & (u3 < 0.042), 'p'); put(gr & (u3 >= 0.042) & (u3 < 0.05), 'b')
    put(gr & (u2 < 0.01), 'l'); put(gr & (u3 > 0.985), 'G')

    # --- 砂地 ---
    de = free & (biome == DESERT)
    put(de & (u < 0.03), 'i')
    put(de & (u2 < 0.01), 'A'); put(de & (u2 > 0.992), 'X'); put(de & (u3 < 0.008), 'U')
    # 砂地と他の地形の境: 境に近いほど、サボテン・多肉植物・枯れ木・乾いた草を間引き、草に置き換える（草原・岩山の中に、砂漠の植物が急に現れない）
    d_out_de = T._distance(land & (biome != DESERT) & (biome != SEA))            # 砂地でない陸までの距離
    u5 = (u2 * 11.3 + u3 * 7.9) % 1.0
    thin_de = de & (d_out_de <= 14) & (d_out_de > 0) & (u5 < np.clip((14.0 - d_out_de.astype(np.float32)) / 8.0, 0, 1))   # 境から 6 マス以内は全部、14 マスで 0
    for ch in 'AXUi': obj[thin_de & (obj == ord(ch))] = ord('0')
    put(thin_de & (obj == ord('0')) & (u < 0.12), 'm')
    # 草原の植物（草・花・草原の木）は、寒い土地・砂地との境で、間引く（雪山・ツンドラ・砂漠の中に、草原の植物が混ざらない）。境から 6 マス以内は全部、14 マス先で 0
    d_dry = T._distance(land & (biome == DESERT))
    u6 = (u3 * 9.1 + u * 4.7) % 1.0
    GRASS_PLANTS = 'mlvwpbG'
    for dd_, repl in ((d_cold, 'o'), (d_dry, 'i')):
        th = gr & (dd_ <= 14) & (dd_ > 0) & (u6 < np.clip((14.0 - dd_.astype(np.float32)) / 8.0, 0, 1))
        for ch in GRASS_PLANTS: obj[th & (obj == ord(ch))] = ord('0')
        put(th & (obj == ord('0')) & (u2 < 0.15), repl)                        # 寒い土地は高地の雑草・砂地は乾いた草に置き換える

    # --- 南国（入り江・小島・砂州・池・ゆるい丘とジャングルの谷）---
    tr = free & (biome == TROPICAL)
    sandy = T.fbm(81, (22, 8, 3))
    fl(tr & (sandy > 0.62), 'w')
    clump = patch2                                                               # 花・茂みの群生（かたまり）
    put(tr & (u3 < 0.14 + 0.14 * (elev < 4)), 'e')                               # シダ（谷の底ほど、濃い）
    put(tr & (clump > 0.58) & (u < 0.30), 'b'); put(tr & (clump > 0.58) & (u >= 0.30) & (u < 0.42), 'w')
    put(tr & (clump < 0.38) & (u < 0.12), 'p'); put(tr & (clump > 0.45) & (clump <= 0.58) & (u < 0.05), 's')
    put(tr & (u2 > 0.965), 'Y'); put(tr & (u2 > 0.93) & (u2 <= 0.965), 'M')     # 単独の南国の木・ヤシ（1 倍）
    # ジャングルの森（2 倍・格子・1 本ずつ）: 南国の木・樹海の木・ヤシ。海に近い所は、ヤシの林
    jungle = tr & (patch2 > 0.52) & (d_sea > 8)
    put(jungle & lat & (u2 < 0.6) & (u3 < 0.38), 'a'); put(jungle & lat & (u2 < 0.6) & (u3 >= 0.38) & (u3 < 0.7), 'd'); put(jungle & lat & (u2 < 0.6) & (u3 >= 0.7), 'f')
    palm_grove = tr & (d_sea <= 14) & (d_sea > 5) & (patch > 0.5)
    put(palm_grove & lat & (u2 < 0.5), 'f')
    # マングローブ: 川・池のそば（湿地の木 1 倍）
    put(tr & (d_water <= 3) & (u < 0.35), 'r')
    # 南国と他の地形の境: 境に近いほど南国の木・ヤシ・花を間引き、草に置き換える（草原・岩山の中に、南国の植物が急に現れない）
    d_out = T._distance(land & (biome != TROPICAL) & (biome != SEA))             # 南国でない陸までの距離
    u4 = (u * 13.7 + u2 * 5.3) % 1.0
    fade = tr & (d_out <= 14) & (d_out > 0)
    thin = fade & (u4 < (1.0 - d_out.astype(np.float32) / 14.0) * 0.9)
    for ch in 'MYadfrsbwpe': obj[thin & (obj == ord(ch))] = ord('0')
    put(thin & (obj == ord('0')) & (u3 < 0.3), 'm')

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
    d_trop = T._distance(biome == TROPICAL)
    near_trop = np.clip(1.0 - d_trop.astype(np.float32) / 40.0, 0, 1)            # 南国に近いほど多い（40 マス先でゼロ）
    put(beach & (biome != TROPICAL) & (biome != SEA) & (u < 0.05 * near_trop), 'M')   # 南国でない浜: 南国に近い所だけ、ヤシ
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
    # 橋のたもと（橋から 2 マス以内）は、通れる物（木・柱）を置かない。木が橋の出入り口をふさがない
    near_bridge = T.box_mean(t['bridge'].astype(np.float32), 2) > 0
    for ch in SOLID_CH: obj[near_bridge & land & (obj == ord(ch))] = ord('0')
    put(t['bridge'], 'Z')                                                       # 川の橋
    sea = ~land
    trop_near = T.box_mean((biome == TROPICAL).astype(np.float32), 8) > 0.02
    put(sea, 'O'); put(sea & (d_land <= np.where(trop_near, 3, 1)), 'q')
    put(sea & trop_near & (d_land <= 3), 'g')                                   # 南国の浅瀬: 青緑に光る
    # 河口: 川の水から 3 マス以内の海は、岸の浅瀬にせず、深い水（川が途切れず海へ続く。河口を歩いて渡れない）
    d_riv = T._distance(t['river'] > 0)
    put(sea & (d_riv <= 3) & (d_land <= 3), 'Q')
    mouth_q = np.isin(obj, [ord('q'), ord('g')]) & (d_riv <= 5) & (t['dist_sea'] <= 5)   # 河口のそばの、岸・入り江の浅瀬も、深い水に
    put(mouth_q, 'Q')
    put(t['lagoon'], 'g')                                                       # 入り江・砂州・池のふち（歩ける浅瀬）
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
    # --- 境界線（隣のマップとの継ぎ目）の整合 ---
    #   境界を越えると、隣のマップの同じ位置に出る。そこが、木・崖・水の中だと、近くの空きへ押し出され、川の向こう岸へ渡ったり、
    #   壁に囲まれた空間の中に入って、出られなくなったりする。継ぎ目の両側のマス（向かい合うマス）の、歩ける・歩けないを、そろえる:
    #   片方が歩けて、もう片方が通れない物（木・崖・柱）なら、通れない物を取り除く。深い水・海なら、浅瀬（歩ける）にする。
    solid_codes = np.array([ord(c) for c in SOLID_CH], np.uint8)
    deep_codes = np.array([ord('Q'), ord('O')], np.uint8)
    def walk(a): return ~(np.isin(a, solid_codes) | np.isin(a, deep_codes))
    fixed = 0
    for axis, size, count in ((1, W, GW), (0, H, GH)):
        for k in range(1, count):
            sl = k * MESH
            if axis == 1: A = (slice(None), sl - 1); B = (slice(None), sl)
            else: A = (sl - 1, slice(None)); B = (sl, slice(None))
            a, b = obj[A].copy(), obj[B].copy()
            both_land = np.ones(len(a), bool)                 # すべての継ぎ目のマス（海岸・浅い海の継ぎ目も、そろえる）
            wa, wb = walk(a), walk(b)
            bad_b = both_land & wa & ~wb                      # A は歩ける・B は歩けない
            bad_a = both_land & wb & ~wa
            for (X_, Y_, bad) in ((B, b, bad_b), (A, a, bad_a)):
                cur = obj[X_]
                is_solid = np.isin(cur, solid_codes)
                cur = np.where(bad & is_solid, ord('0'), cur)
                cur = np.where(bad & ~is_solid, ord('q'), cur)   # 深い水・海は、浅瀬に
                obj[X_] = cur
                fixed += int(bad.sum())
    # 継ぎ目の整合のあと、浅瀬にした所は、水のマスなので、地面の種類は、そのまま（水の下の地面は、使われない）
    print('境界線の整合: 直したマス', fixed)
    return obj, floor, elev


def mesh_name(row, col, biome_counts, sea_frac, mine=False):
    k = max(biome_counts, key=biome_counts.get)
    base = BIOME_NAME[SEA] if sea_frac > 0.35 else BIOME_NAME[k]
    if mine: base = '炭鉱の山'
    return f'{base} ({row + 1}-{col + 1})'


def main():
    t = T.build()
    obj, floor, elev = build_tiles(t)
    land, biome = t['land'], t['biome']
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
            foot_frac = float((np.isin(bm, [SNOW, CONIFER]) & L & (el < 12)).sum()) / max(1, int(L.sum()))
            if dom in (SNOW, CONIFER) and foot_frac > 0.5:
                env = dict(envs[CONIFER]); env['floorType'] = FLOOR[base_ch]   # 裾野: ツンドラの環境
            if dom == TROPICAL:
                env.update(TROPICAL_ENV)
            if not sea_frac > 0.35 and dom == FOREST:
                env.update(DARK_FOREST_ENV)   # 大森林: だいぶ薄暗い（大湿原より、少し暗い。近くは見え、遠くは霧に沈む）
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
                    if not L[r, c] or chr(o[r, c]) in solid or chr(o[r, c]) in 'qgZ': continue
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
