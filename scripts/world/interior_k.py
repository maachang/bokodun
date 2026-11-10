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
    ('temple_town', 'shrine_k', '神社の拝殿（マカヒキ国）', 'town_k', {'temple_town_2f': 'shrine_k_2f'}, lambda x, y, w, h: False),   # 拝殿: 木張り（大理石をやめる）。絨毯の所は畳
    ('temple_town_2f', 'shrine_k_2f', '神社の社務所（マカヒキ国）', 'shrine_k', {'temple_town': 'shrine_k'}, lambda x, y, w, h: y not in (5, 6)),   # 2 階: 部屋は畳・絨毯の廊下は木張り
]
NPC_SWAP = {'shrine_k': {'priest_man': 'kannushi_k', 'priest_woman': 'miko_k'}, 'shrine_k_2f': {'priest_man': 'kannushi_k', 'priest_woman': 'miko_k'}, 'city_inn_k': {'inn_cook': 'cook_k'}}
FLOORS = ('wood_floor', 'shop_floor', 'brick_floor', 'marble_floor')


def build():
    out = []
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
        if src == 'temple_town': m['legend'].pop('c', None)
        if src == 'temple_town_2f': m['legend'].pop('u', None)
        m['environment'].pop('footstep', None)   # 足音の種類は付けない（ほかの木造の中と同じ）
        m['layout'] = [''.join(r) for r in rows]
        for n in m['npcs']: n['id'] = NPC_SWAP.get(new, {}).get(n['id'], n['id'])   # 江戸風の人（神主・巫女・料理人）に差し替え
        out.append(m)
    return out
