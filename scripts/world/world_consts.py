"""世界の生成の定数: パス・凡例・地面の文字・環境・街の名前と大きさ・街道の街（gen_world.py と world_tiles.py が使う）"""
import os, sys, json, glob
import terrain as T
import roads
from terrain import W, H, SEA, SNOW, CONIFER, FOREST, GRASS, DESERT, ROCK, TROPICAL


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


# 街の中の大きさ（マス）: 候補地ごと。B は大国の都、H は辺境の小さな街（枠だけの街は town_layout・D と H は専用の build）
TOWN_SIZE = {'a': (40, 30), 'b': (48, 36), 'c': (40, 30), 'd': (40, 30), 'e': (40, 30), 'f': (40, 30), 'g': (40, 30), 'h': (36, 26)}


ROAD_INFO = {}   # 街ごとの、門前・道の終わり（街道の基準データ。world_roads.json に書く）
ROAD_SIGNS = {}   # 道しるべ: {(世界の行, 世界の列): 文章}（外のマップの signs に書く）


ROAD_TOWNS = ('d', 'h', 'e', 'b', 'f', 'c', 'a', 'g')   # 石畳の街道でつなぐ街（グリーン王国・ダマスカス自治領・ガリレオ連盟。ユーザー指定）。1 本の道路網: 最初の 2 つを結び、以降は、すでにある街道のどこからでも分かれる


ROAD_PARTIAL = {'a': '山道', 'b': '砂漠', 'f': '山道', 'c': '砂漠', 'g': '大森林'}   # 石畳が作れない国（行き先まで道が通らない街）→ 道の終わりの立て札に書く、この先の地形。砂漠は砂に埋もれる・A は山に入る前まで・G は大森林に入る前まで（ユーザー指定）
BRIDGE_NEAR = 12   # 石の橋から、このマス以内の、もとからある木の橋は、無効（二重の橋にしない）
PARTIAL_MARGIN = 140   # 作れる所までの道（partial）の探索範囲（行き先を囲む長方形の外へ広げるマス数）


START_TOWN = 'd'   # ゲーム開始の街（グリーン王国・平野の最初の街）。開始位置はその門の前（ユーザー指定）


TOWN_NAME = {'a': 'キュラビッド帝国', 'b': 'フランケル聖国', 'c': 'ミレニアム自由都市', 'd': 'グリーン王国', 'e': 'ガリレオ連盟', 'f': 'ライアン獣王国', 'g': 'デイラミ精霊国', 'h': 'ダマスカス自治領'}   # 国の名前（ユーザー指定）


TOWN_SIGN_CH = 'À'   # 街の名前の立て札の文字（外のマップごとに、凡例で town_sign_<街ID> に割り当てる）


TOWN_LEGEND_KEYS = ('W', 'p', '=', 'H', 'T', 'f', 'v', 'F', 'G')
