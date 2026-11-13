"""世界の、マスごとの物体と地面の生成（build_tiles と、地形ごとの段階 _tiles_*）。gen_world.py が呼ぶ"""
from types import SimpleNamespace
import os
import numpy as np
import roadside
import terrain as T
import roads
from terrain import W, H, GW, GH, MESH, SEA, SNOW, CONIFER, FOREST, GRASS, DESERT, ROCK, TROPICAL, MINES, MINE_R
from terrain_coast import LAKE_BAY_X_FROM
from world_consts import ROAD_LOOPS, LOOP_NEAR, COAST_ROADS, DIRECT_ROADS, GRASS_ROADS, BRIDGE_NEAR, LOOPS, ROAD_ROUGH, ROOT, ROAD_INFO, BIOME_FLOOR, PARTIAL_MARGIN, ROAD_PARTIAL, ROAD_SIGNS, ROAD_TOWNS, SOLID_CH, TOWN_HH, TOWN_HW, TOWN_NAME, TOWN_SIGN_CH, town_gate_tiles


def _tiles_snowFoothills(g):
    """北の雪山と、雪山の裾野（草地・ツンドラ・針葉樹林・凍った池）の物と地面。共有する変数は g（段階の間の入れ物）から受け取り、後の段階で使う変数は g へ書き戻す（元は build_tiles の一部）"""
    biome, d_water, elev, fl, free, land, obj, patch, put, t, u, u2, u3, xs_, ys_ = g.biome, g.d_water, g.elev, g.fl, g.free, g.land, g.obj, g.patch, g.put, g.t, g.u, g.u2, g.u3, g.xs_, g.ys_
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
    g.d_cold = d_cold
    g.lat = lat
    g.trans = trans


def _tiles_forest(g):
    """西の大森林。共有する変数は g（段階の間の入れ物）から受け取り、後の段階で使う変数は g へ書き戻す（元は build_tiles の一部）"""
    biome, fl, free, land, lat, obj, put, u, u2, u3 = g.biome, g.fl, g.free, g.land, g.lat, g.obj, g.put, g.u, g.u2, g.u3
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


def _tiles_grass(g):
    """草原。共有する変数は g（段階の間の入れ物）から受け取り、後の段階で使う変数は g へ書き戻す（元は build_tiles の一部）"""
    biome, d_water, elev, free, lat, obj, patch, patch2, put, u, u2, u3 = g.biome, g.d_water, g.elev, g.free, g.lat, g.obj, g.patch, g.patch2, g.put, g.u, g.u2, g.u3
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
    g.gr = gr


def _tiles_desert(g):
    """砂地・オアシス・砂漠の川の岸。共有する変数は g（段階の間の入れ物）から受け取り、後の段階で使う変数は g へ書き戻す（元は build_tiles の一部）"""
    biome, d_cold, d_water, elev, fl, floor, free, gr, land, lat, obj, patch, patch2, put, t, u, u2, u3, xs_, ys_ = g.biome, g.d_cold, g.d_water, g.elev, g.fl, g.floor, g.free, g.gr, g.land, g.lat, g.obj, g.patch, g.patch2, g.put, g.t, g.u, g.u2, g.u3, g.xs_, g.ys_
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
    g.d_rv = d_rv


def _tiles_tropical(g):
    """南国。共有する変数は g（段階の間の入れ物）から受け取り、後の段階で使う変数は g へ書き戻す（元は build_tiles の一部）"""
    biome, d_sea, d_water, elev, fl, floor, free, land, lat, obj, patch, patch2, put, u, u2, u3 = g.biome, g.d_sea, g.d_water, g.elev, g.fl, g.floor, g.free, g.land, g.lat, g.obj, g.patch, g.patch2, g.put, g.u, g.u2, g.u3
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
    g.jungle = jungle


def _tiles_rockMines(g):
    """東の山々と炭鉱。共有する変数は g（段階の間の入れ物）から受け取り、後の段階で使う変数は g へ書き戻す（元は build_tiles の一部）"""
    biome, elev, fl, free, land, obj, put, sx, sy, u2, u3, xs_, ys_ = g.biome, g.elev, g.fl, g.free, g.land, g.obj, g.put, g.sx, g.sy, g.u2, g.u3, g.xs_, g.ys_
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


def _tiles_beach(g):
    """砂浜・水辺。共有する変数は g（段階の間の入れ物）から受け取り、後の段階で使う変数は g へ書き戻す（元は build_tiles の一部）"""
    biome, d_sea, fl, free, land, obj, put, u = g.biome, g.d_sea, g.fl, g.free, g.land, g.obj, g.put, g.u
    # 砂浜（海から 3 マス以内。南国は 5 マス）: 白い砂。南の浜には、ヤシ
    beach_w = np.where(biome == TROPICAL, 5, 3)
    beach = free & (d_sea <= beach_w)
    obj[beach & ~np.isin(obj, [ord('Y'), ord('M')])] = ord('0')
    fl(land & (d_sea <= beach_w), 'w')
    put(beach & (biome == TROPICAL) & (u < 0.08), 'M')
    d_trop = T._distance(biome == TROPICAL)
    near_trop = np.clip(1.0 - d_trop.astype(np.float32) / 40.0, 0, 1)            # 南国に近いほど多い（40 マス先でゼロ）
    put(beach & (biome != TROPICAL) & (biome != SEA) & (u < 0.05 * near_trop), 'M')   # 南国でない浜: 南国に近い所だけ、ヤシ


def _tiles_wetland(g):
    """湿地帯。共有する変数は g（段階の間の入れ物）から受け取り、後の段階で使う変数は g へ書き戻す（元は build_tiles の一部）"""
    biome, d_rv, d_sea, d_water, elev, free, jungle, land, obj, patch2, put, t, trans, u, u2, u3 = g.biome, g.d_rv, g.d_sea, g.d_water, g.elev, g.free, g.jungle, g.land, g.obj, g.patch2, g.put, g.t, g.trans, g.u, g.u2, g.u3
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


def _tiles_water(g):
    """川・湖・海・河口。共有する変数は g（段階の間の入れ物）から受け取り、後の段階で使う変数は g へ書き戻す（元は build_tiles の一部）"""
    biome, land, obj, put, t = g.biome, g.land, g.obj, g.put, g.t
    # 水: 川・湖（深い所 Q・浅瀬 q）、湖の中央と海（O）、海の岸の浅瀬（q）
    lake = t['lake']
    d_nonlake = T._distance(~lake)
    d_land = T._distance(land)
    put(t['deep'] & ~lake, 'Q')
    put(lake & t['deep'], 'Q'); put(lake & t['deep'] & (d_nonlake >= 3), 'O')
    put(t['shallow'], 'q')
    for site in t['towns']:   # I（湖の街）: 壁の西に広げた湖（湾。_lake_bay）は、すべて深い水（O）だけ。浅瀬・普通の水を残さない（港町 E・K1 と同じ。湖の岸から 3 マスは浅瀬になる規則が、壁や湾の縁を岸とみなしていた）
        if site['id'] != 'i': continue
        reg = np.zeros((H, W), bool); reg[site['y'] - TOWN_HH:site['y'] + TOWN_HH, LAKE_BAY_X_FROM:site['x'] - TOWN_HW] = True
        put(reg & lake, 'O')
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
    put(sea & t['harbor'], 'O')   # 港（E の湾）: 浅瀬なし。深い水だけ（座礁しない）
    mouth_q = np.isin(obj, [ord('q'), ord('g')]) & (d_riv <= 5) & (t['dist_sea'] <= 5)   # 河口のそばの、岸・入り江の浅瀬も、深い水に
    put(mouth_q, 'Q')
    put(t['lagoon'], 'g')                                                       # 入り江・砂州・池のふち（歩ける浅瀬）


def _tiles_mineEntrances(g):
    """炭鉱の入口とトロッコ。共有する変数は g（段階の間の入れ物）から受け取り、後の段階で使う変数は g へ書き戻す（元は build_tiles の一部）"""
    free, obj, sx, sy = g.free, g.obj, g.sx, g.sy
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


def _tiles_towns(g):
    """街（候補地）の外観。共有する変数は g（段階の間の入れ物）から受け取り、後の段階で使う変数は g へ書き戻す（元は build_tiles の一部）"""
    obj, t, xs_, ys_ = g.obj, g.t, g.xs_, g.ys_
    # --- 街（候補地 A〜H）の外観: 平らな敷地に、壁で囲んだ街。南に門（扉＋衛兵）と石畳。中は別のマップ（town_*.json） ---
    for site in t['towns']:
        px, py = site['x'], site['y']
        zone = t['town_mask'] & (np.hypot(xs_ - px, ys_ - py) <= T.TOWN_R_FLAT)
        obj[zone & ~t['harbor'] & ~(t['deep'] | t['shallow'] | t['lagoon'] | t['bridge'])] = ord('0')                       # 敷地の物（木・草・花）を、すべて取り除く（E の港の湾の水は、消さない）
        x0, x1, y0, y1 = px - TOWN_HW, px + TOWN_HW - 1, py - TOWN_HH, py + TOWN_HH - 1
        obj[y0:y1 + 1, x0:x1 + 1] = ord('8')                      # 壁の中は、家々の屋根（入れない）
        obj[y0, x0:x1 + 1] = ord('6'); obj[y1, x0:x1 + 1] = ord('6'); obj[y0:y1 + 1, x0] = ord('6'); obj[y0:y1 + 1, x1] = ord('6')
        for gx, gy in town_gate_tiles(site): obj[gy, gx] = ord('7')
        obj[y1 + 1:y1 + 5, px - 3:px + 3] = ord('9')              # 門の前の石畳
        obj[y1 + 2, px + 2] = ord(TOWN_SIGN_CH)                   # 門の前の石畳の東の端（門の正面から見て、画面の端に入る位置）に、街の名前の立て札
        if site['id'] == 'k1': _k1_pier(obj, px, py)


def _k1_pier(obj, px, py):
    """コマチ港町（K1）の外の港: 壁の東の深い海（terrain_island の港）に、桟橋（木の橋）と係留した船。町の中の港と同じ海"""
    y1 = py + TOWN_HH - 1
    for x in range(px + 4, px + 4 + 14): obj[y1 + 3, x] = ord('Z')   # 桟橋: 門の前の石畳の東から、海へ
    for ch, dy, dx in (('þ', 1, 11), ('Þ', -4, 12), ('þ', -TOWN_HH * 2 + 3, 10)):   # 船（桟橋のそば・沖・北）
        assert obj[y1 + dy, px + dx] == ord('O'), f'K1 の外の船 ({px + dx},{y1 + dy}): 海ではない'
        obj[y1 + dy, px + dx] = ord(ch)


def _coast_roads(g, centers, set_c, gate_pt, pairs=COAST_ROADS, opt={'coast': True}, name='海岸線の道'):
    """海岸線に沿う道（COAST_ROADS の街の組）。海から近い所を通りやすくした探索。通れない所（岩山・火山の裾）は、山・坂を通る方式（rough）で、地形を道に沿って少し直す。すでにある街道と並走する区間は、街道に統合する"""
    elev, obj, t = g.elev, g.obj, g.t
    for a, b in pairs:
        path = roads.find_path(t, gate_pt(a), gate_pt(b), margin=100, **opt)
        rough = path is None
        if rough: path = roads.find_path(t, gate_pt(a), gate_pt(b), margin=100, rough=True, **opt)
        if not path: print(f'{name} {a}→{b}: 経路がない'); continue
        path, n_join = roads.merge_loop(t, path, set_c, LOOP_NEAR)
        if rough:
            water = T.box_mean((t['deep'] | t['shallow'] | t['lagoon'] | t['bridge'] | t['mtn_bridge'] | (t['river'] > 0) | ~t['land']).astype(np.float32), 2) > 0
            print(f'  {name} {a}→{b}: 山・坂を通る（地形を {roads.flatten(elev, path, water)} マス直した）')
        new_tiles = list(dict.fromkeys(c for c in path if c not in set_c))
        roads.paint(t, obj, elev, path, set('6789') | {TOWN_SIGN_CH, roads.SIGN_CH})
        centers.extend(new_tiles); set_c.update(new_tiles)
        ROAD_LOOPS.append({'between': [a, b], 'tiles': len(new_tiles), **opt})
        print(f'{name} {a}⇄{b}: {len(new_tiles)} マス（街道に統合 {n_join} か所）')


def _tiles_roads(g):
    """街道（石畳の道・石の橋・道しるべ）。共有する変数は g（段階の間の入れ物）から受け取り、後の段階で使う変数は g へ書き戻す（元は build_tiles の一部）"""
    elev, obj, t = g.elev, g.obj, g.t
    # --- 街道: 街どうしを結ぶ、石畳の道（幅 3）と、川の石の橋。門前の石畳（南の端の中央）から、門前の石畳へ ---
    sites = {s_['id']: s_ for s_ in t['towns']}
    centers = []   # 街道の中心線（道路網）
    gate_pt = lambda k: (sites[k]['y'] + TOWN_HH + 3, sites[k]['x'])
    for k in range(1, len(ROAD_TOWNS)):
        goal = ROAD_TOWNS[k]
        start = gate_pt(ROAD_TOWNS[0]) if not centers else centers
        path = roads.find_path(t, start, gate_pt(goal), reuse=set(centers))
        rough = False
        if path is None and goal in ROAD_ROUGH:   # 山・岩山・坂を通ってでも作る（遠回りでもよい）。地形は、道に沿って少し直す
            path = roads.find_path(t, start, gate_pt(goal), margin=PARTIAL_MARGIN, reuse=set(centers), rough=True)
            rough = path is not None
            if rough: print(f'街道 {goal}: 山・坂を通る道（地形を {roads.flatten(elev, path, T.box_mean((t['deep'] | t['shallow'] | t['lagoon'] | t['bridge'] | t['mtn_bridge'] | (t['river'] > 0) | ~t['land']).astype(np.float32), 2) > 0)} マス直した）')
        partial = path is None and goal in ROAD_PARTIAL   # 砂漠・山・大森林の中は、石畳が作れない（砂に埋もれる・山道・樹海）。作れる所までの道と、道の終わりの立て札
        if partial: path = roads.find_path(t, start, gate_pt(goal), margin=PARTIAL_MARGIN, reuse=set(centers), partial=True)
        if k == 1: centers = []   # 最初の 2 つは、1 本目（始点は、最初の街の門前）
        assert path, f'街道 {goal}: 経路がない'
        n_road, n_bridge = roads.paint(t, obj, elev, path, set('6789') | {TOWN_SIGN_CH, roads.SIGN_CH})   # 先に置いた道しるべは、消さない
        new_tiles = [c for c in path if c not in set(centers)]
        centers.extend(new_tiles)
        if k >= 2:   # 2 つ目以降は、既存の街道から分かれる: 分かれ道に、道しるべ（方角と行き先）
            pos, msg = roads.fork_sign(t, obj, set(centers), path[0], {gate_pt(s_): TOWN_NAME[s_] for s_ in ROAD_TOWNS[:k + 1]})
            ROAD_SIGNS[pos] = msg
            print('道しるべ', pos, msg)
        if partial:
            pos, msg = roads.end_sign(t, obj, path[-1], gate_pt(goal), TOWN_NAME[goal], ROAD_PARTIAL[goal])
            ROAD_SIGNS[pos] = msg
            print('道の終わりの立て札', pos, msg)
        ROAD_INFO[goal] = {'gate': list(gate_pt(goal)), 'end': list(path[-1]), 'partial': bool(partial), 'rough': rough, **({'note': ROAD_PARTIAL[goal]} if partial else {})}
        print(f'街道 {ROAD_TOWNS[0] if k == 1 else "網"}→{goal}: 中心線 {len(path)} マス（新しく {len(new_tiles)}）・石畳 {n_road}・石の橋 {n_bridge}')
    ROAD_INFO[ROAD_TOWNS[0]] = {'gate': list(gate_pt(ROAD_TOWNS[0])), 'end': list(gate_pt(ROAD_TOWNS[0])), 'partial': False}
    # 循環する道（ユーザー指定「ちゃんと循環できる道＝一方通行じゃなく」）: 道路網の上の道のりが、直線距離よりずっと遠い街の組に、別の道（迂回・環状）を足す
    import collections, itertools
    def road_dist(a, b):
        src, dst = tuple(ROAD_INFO[a]['end']), tuple(ROAD_INFO[b]['end'])
        near = lambda p_: min(centers, key=lambda c: abs(c[0] - p_[0]) + abs(c[1] - p_[1]))
        s_, d_ = near(src), near(dst); dist = {s_: 0}; q = collections.deque([s_])
        while q:
            u = q.popleft()
            if u == d_: return dist[u]
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                v = (u[0] + dy, u[1] + dx)
                if v in set_c and v not in dist: dist[v] = dist[u] + 1; q.append(v)
        return None
    set_c = set(centers)
    full = [k for k in ROAD_TOWNS if not ROAD_INFO[k]['partial']]
    cands = []
    for a, b in itertools.combinations(full, 2):
        eu = np.hypot(gate_pt(a)[0] - gate_pt(b)[0], gate_pt(a)[1] - gate_pt(b)[1]); rd = road_dist(a, b)
        if rd: print(f'  道のり {a}→{b}: {rd} マス・直線 {eu:.0f} マス（比 {rd / eu:.1f}）')
        if rd and eu < 400 and rd / eu > 1.5: cands.append((rd / eu, a, b))
    n_loop = 0
    for ratio, a, b in sorted(cands, reverse=True):
        if n_loop >= LOOPS: break
        path = roads.find_path(t, gate_pt(a), gate_pt(b), margin=100, penal=set(centers))
        new_tiles = [c for c in path if c not in set_c] if path else []
        if len(new_tiles) < 20: continue
        # 並走しない: 街道のすぐわき（12 マス以内）を続けて進む区間が、10 マスを超えるなら、足さない（両端 20 マスは除く）
        # 並走する区間は、街道に統合する（ユーザー指示「2 本を 1 つにして、途中で分岐」）: 街道のすぐわき（LOOP_NEAR マス以内）を 10 マス超続く区間は、切り捨てて、両端を街道につなぐ
        path, n_join = roads.merge_loop(t, path, set_c, LOOP_NEAR)
        if n_join:
            new_tiles = list(dict.fromkeys(c for c in path if c not in set_c))
            if len(new_tiles) < 20: continue
            print(f'  循環の候補 {a}⇄{b}: 街道と並走する区間を、街道に統合（分岐 {n_join} か所）')
        roads.paint(t, obj, elev, path, set('6789') | {TOWN_SIGN_CH, roads.SIGN_CH})
        centers.extend(new_tiles); set_c.update(new_tiles); n_loop += 1
        ROAD_LOOPS.append({'between': [a, b], 'tiles': len(new_tiles)})
        print(f'循環する道 {a}⇄{b}: 迂回 {len(new_tiles)} マス（道のり/直線 = {ratio:.1f}）')
    _coast_roads(g, centers, set_c, gate_pt)
    _coast_roads(g, centers, set_c, gate_pt, GRASS_ROADS, {'grass': True}, '草原の道')
    _coast_roads(g, centers, set_c, gate_pt, DIRECT_ROADS, {}, '直結の道')
    n_merge = roads.merge_parallel(t, obj, elev, set('6789') | {TOWN_SIGN_CH, roads.SIGN_CH})   # 近くで並行して進む 2 本の道は、1 本に統合（ユーザー指示）
    print(f'並行する道を統合: {n_merge} マス')
    _island_roads(g)   # マカヒキ島の道（本島の道が、すべてできた後）
    print(f'道のわきの段差を直した: {roads.fix_steps(elev, obj, t)} マス')   # 道の地ならしで残った、高さの差 2 以上（崖でない所）
    # 石の橋のそば（BRIDGE_NEAR マス以内）の、もとからある木の橋（plank_bridge）は、無効（川に戻す）。石の橋と、二重の橋にならない
    near_stone = T.box_mean((obj == ord(roads.BRIDGE_CH)).astype(np.float32), BRIDGE_NEAR) > 0
    old = near_stone & (obj == ord('Z'))
    obj[old] = ord('Q')
    t['bridge'] = t['bridge'] & ~old
    print(f'石の橋のそばの木の橋を無効に: {int(old.sum())} マス')
    import json
    with open(os.path.join(ROOT, 'public', 'data', 'world_roads.json'), 'w', encoding='utf-8') as fp:   # 街道の基準データ（今後の町・村づくりが、この道を基準にする）
        json.dump({'note': '街道（石畳の道）の基準データ。座標は世界のマス（[行, 列]）。centers: 道の中心線（幅 3）。towns: 街ごとの門前（gate）と道の終わり（end。partial=true は、砂漠・山・大森林で、石畳が作れる所まで）。signs: 道しるべ・道の終わりの立て札',
                   'centers': [list(c) for c in sorted(centers)], 'towns': ROAD_INFO, 'loops': ROAD_LOOPS,
                   'signs': [{'pos': list(k), 'text': v} for k, v in sorted(ROAD_SIGNS.items())]}, fp, ensure_ascii=False)



def _island_roads(g):
    """マカヒキ島の道（マカヒキ国の街の門前 → コマチ港町の門前）。島なので、本島の街道とはつながらない。街道の基準データ（world_roads.json）には入れない"""
    elev, obj, t = g.elev, g.obj, g.t
    sites = {s_['id']: s_ for s_ in t['towns']}
    gate = lambda k: (sites[k]['y'] + TOWN_HH + 3, sites[k]['x'])
    path = roads.find_path(t, gate('k'), gate('k1'), margin=40)
    assert path, '島の道（K → K1）: 経路がない'
    n_road, n_bridge = roads.paint(t, obj, elev, path, set('6789') | {TOWN_SIGN_CH, roads.SIGN_CH})
    print(f'島の道 K→K1: 中心線 {len(path)} マス・道 {n_road}・橋 {n_bridge}')


def _tiles_seams(g):
    """境界線（隣のマップとの継ぎ目）の整合。共有する変数は g（段階の間の入れ物）から受け取り、後の段階で使う変数は g へ書き戻す（元は build_tiles の一部）"""
    obj = g.obj
    # --- 境界線（隣のマップとの継ぎ目）の整合 ---
    #   境界を越えると、隣のマップの同じ位置に出る。そこが、木・崖・水の中だと、近くの空きへ押し出され、川の向こう岸へ渡ったり、
    #   壁に囲まれた空間の中に入って、出られなくなったりする。継ぎ目の両側のマス（向かい合うマス）の、歩ける・歩けないを、そろえる:
    #   片方が歩けて、もう片方が通れない物（木・崖・柱）なら、通れない物を取り除く。深い水・海なら、浅瀬（歩ける）にする。
    solid_codes = np.array([ord(c) for c in SOLID_CH], np.uint16)
    deep_codes = np.array([ord('Q'), ord('O')], np.uint16)
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


def _tiles_trails(g):
    """山道・休憩所・吊橋。共有する変数は g（段階の間の入れ物）から受け取り、後の段階で使う変数は g へ書き戻す（元は build_tiles の一部）"""
    biome, elev, fl, free, land, obj, put, t, u, u2, xs_, ys_ = g.biome, g.elev, g.fl, g.free, g.land, g.obj, g.put, g.t, g.u, g.u2, g.xs_, g.ys_
    # 山道（人が切り開いた道）: 床は赤茶の土。道と、その両側 1 マスは、木・草・岩を置かない（山頂の広場も）
    trail = t['trail']
    tr1 = trail.copy()
    tr1[1:, :] |= trail[:-1, :]; tr1[:-1, :] |= trail[1:, :]; tr1[:, 1:] |= trail[:, :-1]; tr1[:, :-1] |= trail[:, 1:]
    ns2 = T._near_seam(ys_.astype(int), xs_.astype(int), 2)                    # 隣のマップとの境の近くには、置かない（継ぎ目の整合）
    # 山の高い所（森林限界より上の雪山・岩山）: 岩の代わりに、まばらな木（針葉樹・枯れ木）と、枯れかけた草
    road_zone = T.box_mean(np.isin(obj, [ord(roads.ROAD_CH), ord(roads.BRIDGE_CH)]).astype(np.float32), 2) > 0   # 街道のまわり（2 マス）には、木・岩を置かない（山を通る道のわき）
    hi = free & ~ns2 & ~road_zone & (obj == ord('0')) & (((biome == SNOW) & (elev >= 17)) | ((biome == ROCK) & (elev >= 9)))
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


def build_tiles(t):
    """世界全体の、マスごとの物体の文字・地面の文字（W×H の配列）。地形ごとの特徴は、ここで決める"""
    land, biome, elev = t['land'], t['biome'], t['elev']
    rng = np.random.default_rng(2026)
    u = rng.random((H, W)).astype(np.float32)
    u2 = rng.random((H, W)).astype(np.float32)
    u3 = rng.random((H, W)).astype(np.float32)
    patch = T.fbm(101, (40, 14, 6))
    patch2 = T.fbm(102, (26, 9, 4))
    obj = np.full((H, W), ord('0'), np.uint16)   # 物体の文字コード（2 バイト: 65535 まで。1 バイトの 255 の上限はなくす）
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
    lut = np.zeros(9, np.uint16)
    for b, ch in BIOME_FLOOR.items(): lut[b] = ord(ch)
    floor = lut[biome]
    def fl(mask, ch): floor[mask] = ord(ch)

    g = SimpleNamespace(biome=biome, d_sea=d_sea, d_water=d_water, elev=elev, fl=fl, floor=floor, free=free, land=land, obj=obj, patch=patch, patch2=patch2, put=put, sx=sx, sy=sy, t=t, u=u, u2=u2, u3=u3, xs_=xs_, ys_=ys_)
    _tiles_snowFoothills(g)
    _tiles_forest(g)
    _tiles_grass(g)
    _tiles_desert(g)
    _tiles_tropical(g)
    _tiles_rockMines(g)
    _tiles_beach(g)
    _tiles_wetland(g)
    _tiles_water(g)
    _tiles_mineEntrances(g)
    _tiles_towns(g)
    _tiles_roads(g)
    roadside.place(g)   # 道沿いの村・町・宿場の外観（街道ができた後。roadside.py）
    _tiles_seams(g)
    _tiles_trails(g)

    return obj, floor, elev
