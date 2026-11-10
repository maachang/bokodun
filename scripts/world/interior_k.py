"""K（マカヒキ国）の建物の中（畳の部屋・木張りの廊下）。既存の中のマップを複製し、床だけ替える（家具・扉・出入口は、そのまま）。
  - 部屋（座敷・客室・ギルド・店の奥）は畳（tatami）。廊下・土間・台所・道場は木張り（wood_floor）
  - 床の替え方は、マップごとの規則（RULES: (x, y, 幅, 高さ) → 'tatami' か 'wood'）。家具（卓・椅子など）の下も床なので、床の文字だけ替える
"""
import json
import os

MAPS = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'data', 'maps')
T = '_'   # 畳の凡例の文字（元のマップで未使用）


def _near_exit(x, y, w, h): return y >= h - 3   # 出口（南の壁）のそば: 土間（木張り）


# (複製元, 新 ID, 名前, 戻り先, 出口 links の替え, 床の規則 f(x, y, w, h) → True なら畳)
INTERIORS = [
    ('shop', 'shop_k', '店（マカヒキ国）', 'town_k', {}, lambda x, y, w, h: y <= 2),                                    # 奥の座敷（帳場）だけ畳。手前は土間
    ('city_inn', 'city_inn_k', '旅籠・酒場（マカヒキ国）', 'town_k', {'city_inn_2f': 'city_inn_2f_k'}, lambda x, y, w, h: x <= 10 and 4 <= y <= 10),   # 広間は畳。台所・階段まわり・通路は木張り
    ('city_inn_2f', 'city_inn_2f_k', '旅籠の客室（マカヒキ国）', 'city_inn_k', {'city_inn': 'city_inn_k'}, lambda x, y, w, h: y != 5),   # 廊下（5 行目）は木張り。客室は畳
    ('guild_adv', 'guild_adv_k', '冒険者ギルド（マカヒキ国）', 'town_k', {'guild_adv_master': 'guild_adv_master_k'}, lambda x, y, w, h: y <= 6),
    ('guild_adv_master', 'guild_adv_master_k', '冒険者ギルド長の部屋（マカヒキ国）', 'guild_adv_k', {}, lambda x, y, w, h: True),
    ('guild_training', 'guild_training_k', '道場（マカヒキ国。職業訓練所）', 'town_k', {}, None),                        # 道場: 全面を木張り（床の種類だけ替える）
    ('temple_town', 'shrine_k', '神社の拝殿（マカヒキ国）', 'town_k', {'temple_town_2f': 'shrine_k_2f', 'temple_town_dining': 'shrine_k_dining'}, lambda x, y, w, h: False),   # 拝殿: 木張り（大理石をやめる）。絨毯の所は畳
    ('temple_town_dining', 'shrine_k_dining', '神社の食堂（マカヒキ国）', 'shrine_k', {}, None),   # 食堂・厨房: 全面を木張り
    ('temple_town_2f', 'shrine_k_2f', '神社の社務所（マカヒキ国）', 'shrine_k', {'temple_town': 'shrine_k'}, lambda x, y, w, h: y not in (5, 6)),   # 2 階: 部屋は畳・絨毯の廊下は木張り
]
NPC_SWAP = {'shrine_k': {'priest_man': 'kannushi_k', 'priest_woman': 'miko_k'}, 'shrine_k_dining': {'priest_man': 'kannushi_k', 'priest_woman': 'miko_k'}, 'shrine_k_2f': {'priest_man': 'kannushi_k', 'priest_woman': 'miko_k'}, 'city_inn_k': {'inn_cook': 'cook_k'}}
NO_RUG = {'rug': 'wood_floor', 'castle_rug': 'wood_floor', 'dais_rug_1': 'dais_stone_1', 'dais_rug_2': 'dais_stone_2', 'dais_rug_3': 'dais_stone_3',
          'dais_temple_rug_1': 'dais_marble_1', 'dais_temple_rug_2': 'dais_marble_2', 'dais_temple_rug_3': 'dais_marble_3',
          'chandelier_mansion_rug': 'chandelier_mansion', 'chandelier_castle_rug': 'chandelier_castle_wood', 'hanging_candles_rug': 'hanging_candles_wood', 'chandelier_temple_rug': 'chandelier_temple_wood'}   # K は赤い絨毯を使わない（床は木張り・壇は石か大理石）


def no_rug(m):
    m['legend'] = {k: NO_RUG.get(v, v) for k, v in m['legend'].items()}
    return m


# K の建物の中は、原則すべて木造。石・レンガ・大理石の部品を、木造の部品に替える（既存の部品に、無印の木の版があるものは、接尾辞 _stone・_marble を外すだけ）
WOOD_SWAP = {'brick_wall': 'wooden_wall', 'temple_wall': 'wooden_wall', 'temple_brick_wall': 'wooden_wall', 'brick_exit': 'building_exit', 'temple_exit': 'building_exit', 'temple_room_door': 'wooden_door',
             'wall_sconce': 'wall_sconce_wood', 'wall_sconce_marble': 'wall_sconce_wood', 'wall_window_stone': 'wall_window_wood', 'wall_window_curtain_marble': 'wall_window_wood',
             'stained_glass_plain': 'wall_window_wood', 'stained_glass_angel': 'wall_window_wood', 'stained_glass_priestess': 'wall_window_wood', 'stained_glass_prophet': 'wall_window_wood',
             'temple_pillar': 'edo_shrine_pillar', 'goddess_statue': 'edo_kamidana', 'dais_marble_1': 'dais_wood_1', 'dais_marble_2': 'dais_wood_2', 'dais_marble_3': 'dais_wood_3',
             'stairs_marble_up': 'stairs_wood_up', 'stairs_marble_down': 'stairs_wood_down', 'temple_carpet': 'wood_floor'}
WOOD_ENV = {'ceilingTexture': 'woodWall', 'ambientLight': 15259832, 'directionalLight': 13615264, 'fogColor': 4864552, 'fogNear': 22, 'fogFar': 70, 'skyColor': 4864552}   # 木造の中の明かり（宿屋と同じ）


def shrine_hall(m):
    """神社の拝殿（参考: 実際の神社の拝殿）: 格天井・白と赤の幔幕・御神燈・扁額・賽銭箱・太鼓。神棚の前に賽銭箱。座標は (x, y)"""
    rows = [list(r) for r in m['layout']]
    def put(x, y, c, was): assert rows[y][x] in was, (x, y, rows[y][x]); rows[y][x] = c
    for x, y in ((1, 0), (9, 0), (0, 2), (10, 2), (0, 8), (10, 8), (3, 9), (7, 9)): put(x, y, 'M', 'L')   # 燭台 → 幔幕
    put(5, 0, 'H', 'b')   # 奥の壁の中央: 扁額
    for x, y in ((5, 4), (5, 7)): put(x, y, 'N', 'K')   # ろうそくの輪 → 御神燈
    put(5, 3, 'S', 'F'); put(8, 8, 'T', 'F')   # 賽銭箱（神棚の手前）・太鼓（隅）
    m['layout'] = [''.join(r) for r in rows]
    m['legend'].update({'M': 'edo_manmaku', 'H': 'edo_hengaku', 'N': 'edo_goshintou', 'S': 'edo_saisenbako', 'T': 'edo_taiko'})
    m['legend'].pop('K', None)
    m['environment']['ceilingTexture'] = 'shrineCeiling'
    m['legend'] = {k: {'wood_floor': 'wood_floor_shrine', 'tatami': 'tatami_shrine'}.get(v, v) for k, v in m['legend'].items()}   # 床ごとの天井も、格天井に
    ks = [n for n in m['npcs'] if n['id'] == 'kannushi_k']
    m['npcs'] = [n for n in m['npcs'] if n['id'] != 'kannushi_k'] + ks[:1]   # 神主は 1 人（お祈りの店 shopId を持つ先頭の 1 人）
    ks[0]['x'], ks[0]['z'] = 5, 4   # 賽銭箱（5, 3）の前（南）
    return m


def woodify(m, objs):
    """凡例の石・レンガ・大理石の部品を木造に替える。環境（天井・明かり）も木造の中に"""
    def sw(v):
        if v in WOOD_SWAP: return WOOD_SWAP[v]
        for s in ('_stone', '_marble'):
            if v.endswith(s) and v[:-len(s)] in objs: return v[:-len(s)]
        return v
    m['legend'] = {k: sw(v) for k, v in m['legend'].items()}
    m['environment'].update(WOOD_ENV)
    return m


WOODIFY = ('guild_training_k', 'shrine_k', 'shrine_k_2f', 'shrine_k_dining')
FLOORS = ('wood_floor', 'shop_floor', 'brick_floor', 'marble_floor', 'temple_brick_floor')


def build():
    out = []
    objs = json.load(open(os.path.join(MAPS, '..', 'objects.json'), encoding='utf-8'))
    for src, new, name, back, link_map, tatami in INTERIORS:
        m = json.load(open(os.path.join(MAPS, src + '.json'), encoding='utf-8'))
        m['id'] = new; m['name'] = name; m['nextMap'] = back
        for l in m.get('links', {}).values(): l['nextMap'] = link_map.get(l['nextMap'], l['nextMap'])
        w, h = len(m['layout'][0]), len(m['layout'])
        assert T not in m['legend'], f'{src}: 畳の文字 {T} が使用中'
        floor_ch = [k for k, v in m['legend'].items() if v in FLOORS]
        assert floor_ch, f'{src}: 床の文字がない'
        rows = [list(r) for r in m['layout']]
        for y in range(h):
            for x in range(w):
                if rows[y][x] in floor_ch:
                    rows[y][x] = T if (tatami and tatami(x, y, w, h)) else floor_ch[0]
                elif rows[y][x] == 'c' and src == 'temple_town': rows[y][x] = T   # 神社の拝殿: 絨毯 → 畳
                elif rows[y][x] == 'u' and src == 'temple_town_2f': rows[y][x] = floor_ch[0]   # 社務所の廊下（絨毯）→ 木張り
        for ch in floor_ch: m['legend'][ch] = 'wood_floor'   # 大理石・レンガ・店の床も、木張りに
        m['legend'][T] = 'tatami'
        if src == 'temple_town_dining':
            for y in range(h):
                for x in range(w):
                    if rows[y][x] == 'u': rows[y][x] = floor_ch[0]
            m['legend'].pop('u', None)
        if src == 'temple_town': m['legend'].pop('c', None)
        if src == 'temple_town_2f': m['legend'].pop('u', None)
        m['environment'].pop('footstep', None)   # 足音の種類は付けない（ほかの木造の中と同じ）
        m['layout'] = [''.join(r) for r in rows]
        for n in m['npcs']: n['id'] = NPC_SWAP.get(new, {}).get(n['id'], n['id'])   # 江戸風の人（神主・巫女・料理人）に差し替え
        if new in WOODIFY: m = woodify(no_rug(m), objs)
        if new == 'shrine_k': m = shrine_hall(m)
        out.append(no_rug(m))
    return out
