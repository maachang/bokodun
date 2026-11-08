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
import town_d as TD
import town_h as TH
import town_e as TE
import town_b as TB
import town_c as TC
import castle_f as CF
import guild_g as GG
import temple_b as TPB
import roads
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
    'm': 'meadow_grass', 'e': 'fern', 'h': 'highland_grass', 'v': 'weed_flower', 'k': 'cattail_cluster', 'z': 'marsh_grass', 'u': 'marsh_weed', 'l': 'lavender_flower', 'i': 'arid_grass', 'o': 'highland_weed', 'w': 'roadside_flowers', 'p': 'path_flower', 'b': 'bush_flower',
    'T': 'forest_tree_a', 'V': 'forest_tree_b', 'W': 'great_tree_a', 'K': 'great_tree_b',      # 森: 217・218 の木（2 倍）・大森林: 3 倍。林の壁（F・C・N）は、使わない
    'J': 'conifer_forest_a', 'L': 'conifer_forest_b', 'j': 'great_conifer_a', 'n': 'great_conifer_b', 'x': 'conifer_tree_a', 'y': 'conifer_tree_b',   # 寒冷地の木（ID 262・263）: 森 2 倍・大森林 3 倍・単独 1 倍
    'a': 'tropical_forest_a', 'd': 'tropical_forest_b', 'f': 'tropical_palm_forest', 'r': 'swamp_tree_a', 's': 'marsh_flower', 'g': 'water_shallow_glow',   # 南国: ジャングルの木・ヤシの林（2 倍）・マングローブ・毒々しい花・青緑に光る浅瀬
    'c': 'cliff_rock_wall', 'Y': 'tropical_tree', 'E': 'mine_entrance', '3': 'mine_entrance_e', '4': 'mine_entrance_w', '5': 'mine_entrance_n', 't': 'mine_cart',   # 炭鉱の入口: E=南向き・3=東向き・4=西向き・5=北向き
    
    '6': 'city_wall', '7': 'district_gate', '8': 'brick_house', '9': 'plaza_stone',   # 街（候補地 A〜H）の外観: 壁・門・家・門の前の石畳
    'Q': 'water', 'q': 'water_shallow', 'O': 'sea', 'Z': 'plank_bridge', roads.ROAD_CH: 'paved_road', roads.BRIDGE_CH: 'stone_bridge', roads.SIGN_CH: 'road_sign', 'I': 'rope_bridge', '1': 'cave_torch', '2': 'riverside_tree',
}
SOLID_CH = set('FCNPDGAXUMRSBHcYE345tTVWKJLjnxyadfr2678')          # 通れない物体（端のマスには置かない）
# 地面の種類（floorLayer の文字 → environment.floorType と同じ名前）
FLOOR = {'g': 'grass', 's': 'snow', 'f': 'forest', 'd': 'desert', 'r': 'rock', 'w': 'whiteSand', 'u': 'tundra', 'i': 'ice', 'm': 'redEarth', 'a': 'ash'}
BIOME_FLOOR = {SNOW: 's', CONIFER: 'u', FOREST: 'f', GRASS: 'g', DESERT: 'd', ROCK: 'r', TROPICAL: 'g', SEA: 'g'}
BIOME_NAME = {SNOW: '北の雪山', CONIFER: '針葉樹の裾野', FOREST: '大森林', GRASS: '草原', DESERT: '砂地', ROCK: '岩山', TROPICAL: '南国', SEA: '海岸'}
# 環境（空・霧・光）: 既存の外マップから、地形ごとに借りる
TROPICAL_ENV = {'ambientLight': 0xffffff, 'directionalLight': 0xfff2c8, 'fogColor': 0xb8e8e0, 'fogNear': 30, 'fogFar': 105, 'visibility': 1.0, 'skyColor': 0x4fd0e8}   # 南国: 青緑がかった、明るい空と霧
DARK_FOREST_ENV = {'ambientLight': 0x56725e, 'directionalLight': 0x94a88a, 'fogColor': 0x1a2a20, 'fogNear': 9, 'fogFar': 44, 'visibility': 0.65, 'skyColor': 0x1a2a20}
ENV_FROM = {SNOW: 'field_snow', CONIFER: 'field_tundra', FOREST: 'field_swamp', GRASS: 'field_grass', DESERT: 'field_desert', ROCK: 'field_mountain', TROPICAL: 'field_tropical', SEA: 'field_coast'}


TOWN_HW, TOWN_HH = 8, 6    # 街の外観（壁）の半幅・半高さ（16×12 マス。「街」と分かる最小限の大きさ）。南の壁の真ん中に、門 2 マス


def town_gate_tiles(site):
    """街の門の 2 マス（世界のマス: (x, y)）。南の壁の真ん中"""
    return [(site['x'] - 1, site['y'] + TOWN_HH - 1), (site['x'], site['y'] + TOWN_HH - 1)]


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
    # （断崖の壁 'c' は置かない。山の崖は、高さの段差（段丘）で作る。石垣のように見えるため）
    fl(sn & (elev >= 16) & (ice_hi > 0.62), 'i')                               # 氷河
    fl(sn & (elev >= 8) & (elev < 14) & (ice_lo > 0.82), 'i')                  # 山の谷の、凍った所
    fl(sn & (elev >= 26) & (bare > 0.62), 'r')                                  # 高い所は、雪が深く、ところどころ岩肌（岩肌は、約 3 割）

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
    put(gr & (u2 < 0.01), 'l'); put(gr & (u3 > 0.995), 'G')                      # 一本立ちの木は、まれに
    # 草原の見どころ（43-54）: 林（木のかたまり。格子の点だけなので、木の間は通れる）・茂み（花の茂みのかたまり）・お花畑・丘の上の一本木・池のまわりの草
    grove = gr & (patch2 > 0.60) & (d_water > 3)
    put(grove & lat & (u < 0.55), 'G')
    put(grove & ~lat & (u2 < 0.10), 'b')
    thicket = gr & (patch > 0.68) & (patch2 <= 0.60)
    put(thicket & (u3 < 0.22), 'b'); put(thicket & (u3 >= 0.22) & (u3 < 0.30), 'm')
    meadow_f = gr & (patch < 0.26) & (patch2 < 0.5)                              # お花畑: 花が、まとまって咲く
    put(meadow_f & (u < 0.30), 'v'); put(meadow_f & (u >= 0.30) & (u < 0.42), 'w'); put(meadow_f & (u >= 0.42) & (u < 0.48), 'p')
    put(gr & (elev >= 9) & (u < 0.012) & lat, 'G')                               # 丘の上の一本木
    put(gr & (d_water <= 2) & (d_water > 0) & (u2 < 0.35) & (obj == ord('0')), 'm')  # 水辺は、草が濃い

    # --- 砂地 ---
    de = free & (biome == DESERT)
    put(de & (u < 0.03), 'i')
    put(de & (u2 < 0.01), 'A'); put(de & (u2 > 0.992), 'X'); put(de & (u3 < 0.008), 'U')
    # 砂地の作り込み（43-56）: 地面のまだら（赤土・白い砂）・乾いた川跡の筋・サボテンの群生・枯れ木の群れ・乾いた草の筋。一様な砂を、変化させる
    de_in = de & (T._distance(biome != DESERT) >= 10)                          # 砂地の奥（縁から 10 マス以上）だけ、地面を変える（縁は、砂のまま）
    dune_low = de_in & (elev <= 4)                                                  # 砂丘の谷（低い所）
    bed = de_in & (np.abs(T.fbm(130, (52, 18, 5)) - 0.5) < 0.026) & (d_water > 4)  # 乾いた川跡: 細く曲がった筋（赤土）。水はない
    red = de & dune_low & (T.fbm(131, (30, 10, 3)) > 0.68)                      # 谷の赤土のまだら
    white = de_in & (T.fbm(132, (40, 14, 4)) > 0.74) & ~red                         # 白い砂のまだら
    fl(white, 'w'); fl(red, 'm'); fl(bed, 'm')
    cactus_c = de & dune_low & (patch > 0.62) & ~bed & ~T._near_seam(ys_.astype(int), xs_.astype(int), 8)   # マップの境のそばは、置かない（隣が砂地でも、このマップに砂地の床が少ないことがある）
    put(cactus_c & (u < 0.10), 'A'); put(cactus_c & (u >= 0.10) & (u < 0.14), 'U')           # サボテンの群生（谷）
    near_bed = de & (T.box_mean(bed.astype(np.float32), 3) > 0.05) & ~bed
    put(near_bed & (u2 < 0.22), 'i'); put(near_bed & (u2 >= 0.22) & (u2 < 0.26) & lat, 'X')  # 川跡のふち: 乾いた草と枯れ木
    put(de & (patch2 > 0.72) & lat & (u3 < 0.06), 'X')                                       # 枯れ木の群れ（まばら）
    put(de & red & (u3 < 0.05), 'i')
    # 砂地と他の地形の境: 境に近いほど、サボテン・多肉植物・枯れ木・乾いた草を間引き、草に置き換える（草原・岩山の中に、砂漠の植物が急に現れない）
    d_out_de = T._distance(land & (biome != DESERT) & (biome != SEA))            # 砂地でない陸までの距離
    u5 = (u2 * 11.3 + u3 * 7.9) % 1.0
    thin_de = de & (d_out_de <= 14) & (d_out_de > 0) & (u5 < np.clip((14.0 - d_out_de.astype(np.float32)) / 8.0, 0, 1))   # 境から 6 マス以内は全部、14 マスで 0
    for ch in 'AXUi': obj[thin_de & (obj == ord(ch))] = ord('0')
    put(thin_de & (obj == ord('0')) & (u < 0.12), 'i')                         # 砂地には、乾いた草
    # オアシス: 草の地面・池のそばの白い砂。草・花・ヤシ・南国の木・ガマ。街の予定地（大きなオアシスの、半径 20 マス）は、物を置かない（草を少しだけ）
    oa = t['oasis']
    fl(oa['grass'] & land, 'g'); fl(oa['sand'] & land, 'w')
    for ch in 'AXUi': obj[oa['grass'] & (obj == ord(ch))] = ord('0')               # 砂漠の植物は、オアシスに置かない
    # 緑の帯（オアシスのまわり・砂漠の川の岸）: 参考画像（砂漠の川）のように、水のそばに、密な緑（低木・草・ヤシ・木・ガマ）。帯の外は、すぐ砂。木は 2 マスおきの格子にだけ置く（木の間は、必ず通れる）
    def lush(mask, d_w):
        m0 = mask & free & (obj == ord('0'))
        put(m0 & (u < 0.62), 'm'); put(m0 & (u3 < 0.22), 'e'); put(m0 & (u3 >= 0.22) & (u3 < 0.30), 'b'); put(m0 & (u3 >= 0.30) & (u3 < 0.34), 'w')
        g = m0 & lat
        put(g & (u2 < 0.34), 'M'); put(g & (u2 >= 0.34) & (u2 < 0.50), 'Y')              # ヤシ・南国の木（格子）
        put(g & (d_w > 3) & (u2 >= 0.50) & (u2 < 0.68), 'a'); put(g & (d_w > 3) & (u2 >= 0.68) & (u2 < 0.80), 'd')   # 少し離れた所は、ジャングルの木（2 倍）
        put(m0 & (d_w <= 2) & (u2 < 0.7), 'e')                                          # 水のすぐそば: シダ（密）。ガマは湿地帯のものなので、砂漠の水辺には置かない
    oag = oa['grass'] & free & (d_water <= 5) & (obj == ord('0'))                    # オアシスの緑は、池のふちから 5 マスまで（砂漠の川の岸と、同じくらいの狭さ）
    lush(oag, d_water)
    oag2 = oa['grass'] & free & (d_water > 5) & ~oa['clear'] & (obj == ord('0'))
    put(oag2 & (u < 0.12), 'm')                                                       # その外の草の地面は、草を少しだけ
    # 砂漠を通る川の岸: 川から 3〜9 マス（ゆらぎあり）は、緑の帯（草の地面）
    d_rv = T._distance(t['river'] > 0)
    rw = 2 + 4 * T.fbm(77, (16, 6, 3))
    rb = land & (biome == DESERT) & (d_rv <= rw) & (d_rv > 0)
    fl(rb & ~oa['clear'], 'g')
    rbo = rb & free & ~oa['clear']
    for ch in 'AXUi': obj[rbo & (obj == ord(ch))] = ord('0')
    lush(rbo & (obj == ord('0')), d_rv)
    oc = oa['clear'] & free & (d_water > 5)                                          # 街の予定地（池のふち 5 マスの緑は残す）
    for ch in 'MYadfrsbwpek' + 'AXUiGlvho': obj[oc & (obj == ord(ch))] = ord('0')      # 街の予定地: 物（木・花・草）を、置かない
    put(oc & (u < 0.04), 'm')
    # 草原の植物（草・花・草原の木）は、寒い土地・砂地との境で、間引く（雪山・ツンドラ・砂漠の中に、草原の植物が混ざらない）。境から 6 マス以内は全部、14 マス先で 0
    d_dry = T._distance(land & (biome == DESERT))
    u6 = (u3 * 9.1 + u * 4.7) % 1.0
    GRASS_PLANTS = 'mlvwpbG'
    snow_floor = np.isin(floor, [ord('s'), ord('i')])                           # 雪・氷の床の上には、草原の植物を置かない（草は雪の下）
    for ch in GRASS_PLANTS: obj[gr & snow_floor & (obj == ord(ch))] = ord('0')
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
    put(thin & (obj == ord('0')) & (u3 < 0.3) & (floor != ord('w')), 'm')       # 白い砂の上には、草を置かない

    # --- 東の山々と炭鉱 ---
    ro = free & (biome == ROCK)
    strata = np.sin(elev.astype(np.float32) * 0.8 + T.fbm(91, (30, 10, 4)) * 8) > 0.5
    fl(ro, 'r'); fl(ro & strata, 'm')                                          # 岩肌と、赤茶の地層の縞
    put(ro & (u2 < 0.05), 'h')
    cl2 = np.abs(T.fbm(81 + 5, (28, 10, 4)) - 0.5) < 0.02
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
    # 湿地帯（できる原理: ①水が逃げにくい地形＝低地・盆地・川の河口（デルタ）・もと湖の場所、水を通しにくい地層。②寒冷・多湿で、枯れた草が分解されず積もる（泥炭）＝雪解け水で湿る、雪山の裾野）
    #   ・低地: 周りより低い所（盆地）。南国のジャングルの低地・雪解け水で湿る裾野（雪山から 28 マス以内の草原）の低地
    #   ・河口（デルタ）: 海から 14 マス以内で、川から 10 マス以内（砂漠・岩山は除く）
    #   ・湖のまわりの低地（湖から 5 マス以内。砂漠・岩山は除く）
    #  まだら（かたまり）に。ガマ（水のそば）・湿地の草・湿地の雑草。ほかの所（高台・草原・森・砂漠）には、ガマを置かない
    elev_f = elev.astype(np.float32)
    low = (elev_f <= T.gauss(elev_f, 10) + 0.0) | (elev <= 2)                          # 周りより低い所
    d_lake = T._distance(t['lake'])
    not_dry = ~np.isin(biome, [DESERT, ROCK])
    delta = land & not_dry & (d_sea <= 14) & (d_rv <= 10)
    lakeside = land & not_dry & (d_lake <= 8) & low                                    # もと湖: 湖のまわりの低地
    floodplain = land & not_dry & low & (d_rv <= 8) & (d_sea <= 40)                    # 沖積平野: 川の下流（海に近い）の、低地（洪水で、細かい泥・粘土がたまる）
    basin = land & not_dry & (elev_f <= T.gauss(elev_f, 10) - 1.0) & (elev <= 6)       # 盆地・谷底: 周りより、はっきり低い所（水が集まる）
    wet_w = (((jungle | trans) & low) | delta | lakeside | floodplain) & (patch2 > 0.32) & free     # 水のそば（ガマもある）
    wet = wet_w | (basin & (patch2 > 0.32) & free)                                            # 盆地・谷底（湿地の草・雑草だけ）
    free_obj = np.isin(obj, [ord('0'), ord('m'), ord('e'), ord('v'), ord('w'), ord('p'), ord('b'), ord('h'), ord('o'), ord('l')])
    put(wet_w & free_obj & (d_water <= 4) & (u2 < 0.35), 'k')
    put(wet & free_obj & (d_water > 4) & (u3 < 0.15), 'z'); put(wet & free_obj & (u < 0.06), 'u')
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
                        pch = ch
                        if ch == 'E':   # 入口は、掘削跡の崖を背にして、外の開いた地面のほうへ向ける（向きが固定で、横から見ると板に見えたため）
                            fx, fz = x0 - cx, y0 - cz
                            pch = ('4' if fx < 0 else '3') if abs(fx) >= abs(fz) else ('5' if fz < 0 else 'E')
                        obj[yy, xx] = ord(pch); break
                else: continue
                break
    # --- 街（候補地 A〜H）の外観: 平らな敷地に、壁で囲んだ街。南に門（扉＋衛兵）と石畳。中は別のマップ（town_*.json） ---
    for site in t['towns']:
        px, py = site['x'], site['y']
        zone = t['town_mask'] & (np.hypot(xs_ - px, ys_ - py) <= T.TOWN_R_FLAT)
        obj[zone] = ord('0')                                      # 敷地の物（木・草・花）を、すべて取り除く
        x0, x1, y0, y1 = px - TOWN_HW, px + TOWN_HW - 1, py - TOWN_HH, py + TOWN_HH - 1
        obj[y0:y1 + 1, x0:x1 + 1] = ord('8')                      # 壁の中は、家々の屋根（入れない）
        obj[y0, x0:x1 + 1] = ord('6'); obj[y1, x0:x1 + 1] = ord('6'); obj[y0:y1 + 1, x0] = ord('6'); obj[y0:y1 + 1, x1] = ord('6')
        for gx, gy in town_gate_tiles(site): obj[gy, gx] = ord('7')
        obj[y1 + 1:y1 + 5, px - 3:px + 3] = ord('9')              # 門の前の石畳
        obj[y1 + 2, px + 3] = ord(TOWN_SIGN_CH)                   # 門の前の石畳の東隣に、街の名前の立て札
    # --- 街道: 街どうしを結ぶ、石畳の道（幅 3）と、川の石の橋。門前の石畳（南の端の中央）から、門前の石畳へ ---
    sites = {s_['id']: s_ for s_ in t['towns']}
    centers = []   # 街道の中心線（道路網）
    gate_pt = lambda k: (sites[k]['y'] + TOWN_HH + 3, sites[k]['x'])
    for k in range(1, len(ROAD_TOWNS)):
        goal = ROAD_TOWNS[k]
        start = gate_pt(ROAD_TOWNS[0]) if not centers else centers
        path = roads.find_path(t, start, gate_pt(goal), reuse=set(centers))
        if k == 1: centers = []   # 最初の 2 つは、1 本目（始点は、最初の街の門前）
        assert path, f'街道 {goal}: 経路がない'
        n_road, n_bridge = roads.paint(t, obj, elev, path, set('6789') | {TOWN_SIGN_CH})
        new_tiles = [c for c in path if c not in set(centers)]
        centers.extend(new_tiles)
        if k >= 2:   # 2 つ目以降は、既存の街道から分かれる: 分かれ道に、道しるべ（方角と行き先）
            pos, msg = roads.fork_sign(t, obj, set(centers), path[0], {gate_pt(s_): TOWN_NAME[s_] for s_ in ROAD_TOWNS[:k + 1]})
            ROAD_SIGNS[pos] = msg
            print('道しるべ', pos, msg)
        print(f'街道 {ROAD_TOWNS[0] if k == 1 else "網"}→{goal}: 中心線 {len(path)} マス（新しく {len(new_tiles)}）・石畳 {n_road}・石の橋 {n_bridge}')
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
    # 山道（人が切り開いた道）: 床は赤茶の土。道と、その両側 1 マスは、木・草・岩を置かない（山頂の広場も）
    trail = t['trail']
    tr1 = trail.copy()
    tr1[1:, :] |= trail[:-1, :]; tr1[:-1, :] |= trail[1:, :]; tr1[:, 1:] |= trail[:, :-1]; tr1[:, :-1] |= trail[:, 1:]
    ns2 = T._near_seam(ys_.astype(int), xs_.astype(int), 2)                    # 隣のマップとの境の近くには、置かない（継ぎ目の整合）
    # 山の高い所（森林限界より上の雪山・岩山）: 岩の代わりに、まばらな木（針葉樹・枯れ木）と、枯れかけた草
    hi = free & ~ns2 & (obj == ord('0')) & (((biome == SNOW) & (elev >= 17)) | ((biome == ROCK) & (elev >= 9)))
    lat2 = ((xs_.astype(int) % 2) == 1) & ((ys_.astype(int) % 2) == 1)
    put(hi & lat2 & (u2 < 0.08), 'x'); put(hi & lat2 & (u2 >= 0.08) & (u2 < 0.12), 'y'); put(hi & lat2 & (u2 >= 0.12) & (u2 < 0.16), '2')
    put(hi & (obj == ord('0')) & (u < 0.16), 'i')
    for ch in 'JLjnxyPDX2ihoulzmeblvwp': obj[tr1 & (obj == ord(ch))] = ord('0')
    # 休憩所: 山道（高さ 8 以上）の、24 マスおきに、松明を、道のわきに
    margin = tr1 & ~trail & ~ns2 & land & (obj == ord('0'))
    ty_, tx_ = np.nonzero(trail & (elev >= 8))
    rr = np.random.default_rng(55); kept = []
    for k in rr.permutation(len(ty_)):
        y, x = int(ty_[k]), int(tx_[k])
        if any((y - a) ** 2 + (x - b) ** 2 < 24 * 24 for a, b in kept): continue
        nb = [(y + dy, x + dx) for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)) if 0 <= y + dy < H and 0 <= x + dx < W and margin[y + dy, x + dx]]
        if len(nb) < 2: continue
        obj[nb[0]] = ord('1'); margin[nb[0]] = False
        kept.append((y, x))
    print('休憩所', len(kept))
    fl(trail & land, 'm')
    # 吊橋（山の峡谷）: 橋のまわり（峡谷の中）の物を除いて、橋の床を置く
    mb = t['mtn_bridge']
    gb = T.box_mean(mb.astype(np.float32), 2) > 0
    obj[gb & land] = ord('0')
    put(mb, 'I')
    return obj, floor, elev


def mesh_name(row, col, biome_counts, sea_frac, mine=False):
    k = max(biome_counts, key=biome_counts.get)
    base = BIOME_NAME[SEA] if sea_frac > 0.35 else BIOME_NAME[k]
    if mine: base = '炭鉱の山'
    return f'{base} ({row + 1}-{col + 1})'


# 街の中の大きさ（マス）: 候補地ごと。B は大国の都、H は辺境の小さな街（枠だけの街は town_layout・D と H は専用の build）
TOWN_SIZE = {'a': (40, 30), 'b': (48, 36), 'c': (40, 30), 'd': (40, 30), 'e': (40, 30), 'f': (40, 30), 'g': (40, 30), 'h': (36, 26)}
ROAD_SIGNS = {}   # 道しるべ: {(世界の行, 世界の列): 文章}（外のマップの signs に書く）
ROAD_TOWNS = ('d', 'h', 'e')   # 石畳の街道でつなぐ街（グリーン王国・ダマスカス自治領・ガリレオ連盟。ユーザー指定）。1 本の道路網: 最初の 2 つを結び、以降は、すでにある街道のどこからでも分かれる
START_TOWN = 'd'   # ゲーム開始の街（グリーン王国・平野の最初の街）。開始位置はその門の前（ユーザー指定）
TOWN_NAME = {'a': 'キュラビッド帝国', 'b': 'フランケル聖国', 'c': 'ミレニアム自由都市', 'd': 'グリーン王国', 'e': 'ガリレオ連盟', 'f': 'ライアン獣王国', 'g': 'デイラミ精霊国', 'h': 'ダマスカス自治領'}   # 国の名前（ユーザー指定）
TOWN_SIGN_CH = 'À'   # 街の名前の立て札の文字（外のマップごとに、凡例で town_sign_<街ID> に割り当てる）
TOWN_LEGEND_KEYS = ('W', 'p', '=', 'H', 'T', 'f', 'v', 'F', 'G')


def write_ids_map(m, path):
    """世界のマップを書く。layout は物体 ID（文字コード）の数値の行の配列・legend のキーは ID の 10 進文字列（layoutFormat 'ids'。public/js/mapFormat.js が読む）"""
    rows = [','.join(str(ord(ch)) for ch in row) for row in m['layout']]
    m = dict(m)
    m['layoutFormat'] = 'ids'
    m['legend'] = {str(ord(k)): v for k, v in m['legend'].items()}
    m['layout'] = [f'@@ROW{i}@@' for i in range(len(rows))]
    text = json.dumps(m, ensure_ascii=False, indent=1)
    for i, r in enumerate(rows): text = text.replace(f'"@@ROW{i}@@"', f'[{r}]', 1)
    open(path, 'w', encoding='utf-8').write(text)


def town_outer_id(site):
    """街の外観がある、外のマップの ID"""
    return f"w_{site['y'] // MESH:02d}_{site['x'] // MESH:02d}"


def town_outer_extras(t, j, i):
    """外のマップ (j, i) にある街の、門の links・衛兵の npcs"""
    links, npcs = {}, []
    for site in t['towns']:
        if site['y'] // MESH != j or site['x'] // MESH != i: continue
        w, h = TOWN_SIZE[site['id']]
        for gx, gy in town_gate_tiles(site):
            links[f"{gx - i * MESH},{gy - j * MESH}"] = {'nextMap': f"town_{site['id']}", 'message': f"{TOWN_NAME[site['id']]}に入る", 'spawn': {'x': w // 2 - 1 + (gx - (site['x'] - 1)), 'z': h - 3, 'angle': 0}}
        gy = site['y'] + TOWN_HH   # 壁のすぐ外（門と同じ並び）
        pair = {'f': (('beast_soldier_golem', -2), ('beast_soldier_kobold', 1)), 'g': (('elf_gate_guard_man', -2), ('elf_gate_guard_woman', 1))}.get(site['id'], (('guard_spear', -2), ('guard_light', 1)))   # F の兵士は、ウッドゴーレムとコボルト。G の兵士は、エルフの守備隊
        for k, (nid, dx) in enumerate(pair):   # 門 2 マス（x-1, x）のすぐ両隣
            npcs.append({'id': nid, 'x': site['x'] + dx - i * MESH, 'z': gy - j * MESH})
    return links, npcs


def town_layout(w, h):
    """街の中（枠だけ）。外壁・南の門・大通り・広場と噴水・家の並び（入口なし）。歩ける所は、すべてつながる"""
    g = [['p'] * w for _ in range(h)]
    cx, cy = w // 2, h // 2
    block = np.zeros((h, w), bool)                                  # 家を置かない所（道・広場）
    for y in range(1, h - 1):
        for x in range(cx - 2, cx + 2): g[y][x] = '='; block[y][x] = True       # 大通り（南北）
    for y in range(cy - 1, cy + 2):
        for x in range(1, w - 1): g[y][x] = '='; block[y][x] = True             # 大通り（東西）
    for y in range(cy - 4, cy + 4):
        for x in range(cx - 6, cx + 6): g[y][x] = 'p'; block[y][x] = True       # 広場
    g[cy - 1][cx - 1] = g[cy - 1][cx] = g[cy][cx - 1] = g[cy][cx] = 'F'         # 噴水（2×2）
    for x in range(w): g[0][x] = 'W'; g[h - 1][x] = 'W'
    for y in range(h): g[y][0] = 'W'; g[y][w - 1] = 'W'
    g[h - 1][cx - 1] = g[h - 1][cx] = 'G'
    bx = 2
    while bx + 4 <= w - 2:
        by = 2
        while by + 3 <= h - 2:
            if not block[max(0, by - 1):by + 4, max(0, bx - 1):bx + 5].any():
                for y in range(by, by + 3):
                    for x in range(bx, bx + 4): g[y][x] = 'H'
            by += 4
        bx += 5
    for x, y in ((2, h - 3), (w - 3, h - 3), (2, cy + 3), (w - 3, cy + 3), (cx - 4, cy + 3), (cx + 3, cy + 3)):
        if g[y][x] == 'p': g[y][x] = 'T'
    for x in (cx - 5, cx + 4):
        for y in (cy - 3, cy + 2):
            if g[y][x] == 'p': g[y][x] = 'f'
    return [''.join(r) for r in g]


def gen_towns(t, city_legend, env, snow_env, desert_env):
    """街の中のマップ（town_a〜town_h）を書く"""
    for site in t['towns']:
        w, h = TOWN_SIZE[site['id']]
        layout = town_layout(w, h)
        oid = town_outer_id(site)
        links = {}
        for gx, gy in town_gate_tiles(site):
            links[f"{w // 2 - 1 + (gx - (site['x'] - 1))},{h - 1}"] = {'nextMap': oid, 'message': f"{TOWN_NAME[site['id']]}の外へ",
                'spawn': {'x': gx - (site['x'] // MESH) * MESH, 'z': gy + 2 - (site['y'] // MESH) * MESH, 'angle': 3.14159}}
        m = {'id': f"town_{site['id']}", 'name': TOWN_NAME[site['id']], 'type': 'open', 'tileSize': 4, 'wallHeight': 4,
             'spawn': {'x': w // 2, 'z': h - 3, 'angle': 0}, 'environment': env, 'decorFloor': 'cobblestone', 'enemies': {},
             'legend': {k: city_legend[k] for k in TOWN_LEGEND_KEYS}, 'layout': layout, 'npcs': [], 'links': links,
             'heights': ['0' * w for _ in range(h)], 'heightStep': 0.5}
        if site['id'] == 'a':   # A（雪国）: D と同じ作り（town_d.build_a）で、雪の見た目・雪の環境
            m['layout'], m['heights'] = TD.build_a(w, h, m['legend'], city_legend, m['links'], m['npcs'])
            m['environment'] = dict(snow_env, floorType='snow', fogNear=24, fogFar=72); m['decorFloor'] = 'snowCobble'   # 雪の環境（霧は、街が見えるよう薄め）
        elif site['id'] == 'g':   # G（大森林の中心のエルフの街）: D と同じ作り（town_d.build_g）。森の環境（霧は、街が見えるよう薄め）
            m['layout'], m['heights'] = TD.build_g(w, h, m['legend'], city_legend, m['links'], m['npcs'])
            m['environment'] = dict(DARK_FOREST_ENV, floorType='forest', fogNear=22, fogFar=66, ambientLight=0x6f8f76); m['decorFloor'] = 'forestGround'
        elif site['id'] == 'f':   # F（山の麓の獣人とドワーフの街）: D と同じ作り（town_d.build_f）
            m['layout'], m['heights'] = TD.build_f(w, h, m['legend'], city_legend, m['links'], m['npcs'])
        elif site['id'] in ('d', 'h', 'e', 'b', 'c'):   # D（最初の街）・H・E（大きな港）は、施設・街の人・高低・川（港）を置く（scripts/world/town_d.py・town_h.py・town_e.py）
            m['layout'], m['heights'] = {'d': TD, 'h': TH, 'e': TE, 'b': TB, 'c': TC}[site['id']].build(w, h, m['legend'], city_legend, m['links'], m['npcs'])
        if site['id'] == 'c':   # C（砂漠の自由都市）: 砂漠の環境（霧は、街が見えるよう薄め）・砂の地面
            m['environment'] = dict(desert_env, floorType='desert', fogNear=24, fogFar=72); m['decorFloor'] = 'packedEarth'
        json.dump(m, open(os.path.join(MAPS, m['id'] + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    for gm in GG.build():   # G のギルド（ギルド長は長老の一族）
        json.dump(gm, open(os.path.join(MAPS, gm['id'] + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    for cm in CF.build_others() + [TPB.build()]:   # 国ごとの城（A 帝王・B 愚王・G 女王）と B の大教会（教皇）
        json.dump(cm, open(os.path.join(MAPS, cm['id'] + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    cf = CF.build()   # F の小さな王城（獣王・フェンリル像）
    json.dump(cf, open(os.path.join(MAPS, cf['id'] + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)


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
            layout = [''.join(chr(v) for v in row) for row in o]   # 以降は 1 文字で扱い、書き出すときに物体 ID（文字コード）の数値の配列にする
            heights = [''.join(CH36[min(35, int(v))] for v in row) for row in el]
            floor_layer = [''.join(chr(v) for v in row) for row in fl]
            used = set(''.join(layout)) - {'0'}
            legend = {k: LEGEND[k] for k in sorted(used) if k != TOWN_SIGN_CH}
            for site in t['towns']:
                if TOWN_SIGN_CH in used and town_outer_id(site) == f'w_{j:02d}_{i:02d}': legend[TOWN_SIGN_CH] = f"town_sign_{site['id']}"
                if site['id'] == 'a' and town_outer_id(site) == f'w_{j:02d}_{i:02d}':   # A（雪国）の外観: 雪をかぶった屋根・雪の積もった門前の石畳
                    if '8' in legend: legend['8'] = 'brick_house_snow'
                    if '9' in legend: legend['9'] = 'plaza_stone_snow'
                if site['id'] == 'g' and town_outer_id(site) == f'w_{j:02d}_{i:02d}':   # G（森の街）の外観: 木の壁・木造の家・森の地面
                    if '6' in legend: legend['6'] = 'wooden_wall'
                    if '8' in legend: legend['8'] = 'wooden_house'
                    if '9' in legend: legend['9'] = 'plaza_forest'
                if site['id'] == 'c' and town_outer_id(site) == f'w_{j:02d}_{i:02d}':   # C（砂漠の自由都市）の外観: 中東風の家
                    if '8' in legend: legend['8'] = 'mideast_house'
                    if '9' in legend: legend['9'] = 'plaza_earth'   # 門前も土
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
            # 最初の街（D・グリーン王国）がある外のマップは、出現位置を門の前（南へ 4 マス・北向き）にする
            for site in t['towns']:
                if site['id'] == START_TOWN and town_outer_id(site) == f'w_{j:02d}_{i:02d}':
                    spawn = {'x': site['x'] - 1 - i * MESH, 'z': site['y'] + TOWN_HH - 1 + 4 - j * MESH, 'angle': 0}
            m_under = t['bridge_under'].get((j, i))
            m = {
                'id': mid, 'name': mesh_name(j, i, counts, sea_frac, any(ch in ('E', '3', '4', '5', 't') for ch in set(''.join(layout)))), 'type': 'open', 'tileSize': 4, 'wallHeight': 4,
                'spawn': spawn, 'environment': env, 'legend': legend, 'enemies': {},
                'heightStep': HEIGHT_STEP, 'sideShade': 1.0, 'heights': heights,
                'floorLegend': {k: FLOOR[k] for k in sorted(set(''.join(floor_layer)))}, 'floorLayer': floor_layer,
                'layout': layout,
            }
            if m_under is not None: m['bridgeUnder'] = int(m_under)
            signs = {f'{x - i * MESH},{y - j * MESH}': msg for (y, x), msg in ROAD_SIGNS.items() if y // MESH == j and x // MESH == i}
            if signs: m['signs'] = signs   # 街道の道しるべ（マスごとの立て札の文章）
            tl, tn = town_outer_extras(t, j, i)
            if tl: m['links'] = tl; m['npcs'] = tn
            write_ids_map(m, os.path.join(MAPS, mid + '.json'))
            grid[j][i] = mid
            info[mid] = dict(row=j, col=i, dom=dom, sea=sea_frac, grass=counts[GRASS] / max(1, int(L.sum())), land=int(L.sum()))
    city = json.load(open(os.path.join(MAPS, 'city.json'), encoding='utf-8'))
    gen_towns(t, city['legend'], city['environment'], envs[SNOW], envs[DESERT])
    # 最初のマップ: 島の中心に近く、ほとんどが陸で、草原が多いメッシュ
    # ゲーム開始は、最初の街（START_TOWN）の門の前。その街の外のマップを start にする
    start = town_outer_id(next(site for site in t['towns'] if site['id'] == START_TOWN))
    json.dump({'mapSize': MESH, 'start': start, 'arenas': [[a, b, c] for a, b, c in t['arenas']], 'grid': grid}, open(os.path.join(ROOT, 'public', 'data', 'world.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    print('マップ数', len(info), 'start', start)


if __name__ == '__main__':
    main()
