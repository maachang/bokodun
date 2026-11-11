"""B（フランケル聖国）の大教会の中（temple_b）。共通の大神殿（temple）を複製して、教皇（正体はデーモンロード）と枢機卿を置く（ユーザー指定: 教皇たちは大教会から出ない）。
  - 祭壇の司祭（神殿の売り場の店主）を、教皇に替える。売り場は、助祭（priest_man）に移す（神殿の品を売る）
  - 2 階への階段と地下への階段は、なくす（共通の 2 階・地下は、共通の大神殿に戻る作りのため）。ほかの部屋（厨房・懺悔室など）は、共通のまま
"""
import json
import os

TEMPLE = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'data', 'maps', 'temple.json')


def build():
    t = json.load(open(TEMPLE, encoding='utf-8'))
    t['id'] = 'temple_b'; t['name'] = '大教会（フランケル聖国）'; t['nextMap'] = 'town_b'
    rows = [list(r) for r in t['layout']]
    for x, y in ((1, 1), (19, 1)):
        assert rows[y][x] in 'US'
        rows[y][x] = 'F'
    t['layout'] = [''.join(r) for r in rows]
    t['links'].pop('1,1', None); t['links'].pop('19,1', None)   # 上りの階段・下り（地下）の階段
    for l in t['links'].values():
        if l['nextMap'] == 'temple_cloister': l['nextMap'] = 'temple_cloister_b'   # 回廊・宝物庫は、B 専用（守衛は B の衛兵。マップは直接書いた JSON）
    for n in t['npcs']:
        if n['id'] == 'priest_senior': n['id'] = 'pope'; n.pop('shopId', None)
        if n['id'] == 'priest_man': n['shopId'] = 'temple'
    t['npcs'].append({'id': 'cardinal', 'x': 13, 'z': 3})
    return t
