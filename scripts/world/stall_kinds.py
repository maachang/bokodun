"""地域ごとの屋台の見た目（objects.json の stall_*。2026-11-11。ユーザー指示「屋台の特徴で、風土とカルチャーを表現」）。
  調べたこと（出典は docs/map-spec.md の屋台の節）: 江戸=蕎麦・天ぷら・寿司・団子（のれん・提灯の簡素な屋台）／台湾の夜市=魯肉飯・牡蠣オムレツ・臭豆腐・かき氷など／
  ロシア=ピロシキ・ペリメニ・クワス（寒さに、脂と温かい物）／中東のスーク=スパイス・織物・ファラフェル・ボレカス・焼き肉（香辛料の山・絨毯・縞の日よけ）。
  形は、city の市場の屋台（market_stall_*。柱 4 本・日よけ・台）と同じ大きさ・当たり判定。部品（箱）の組み合わせで、地域の特徴を出す（画像の絵ではない）。
  使い方: `python3 stall_kinds.py` で objects.json の stall_* の行を、書き直す（何度でも同じ結果）。どの街にどれを置くかは town_stalls.py
"""
import json, os

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
OBJ = os.path.join(ROOT, 'public', 'data', 'objects.json')


def box(sx, sy, sz, x, y, z, c): return {'size': [sx, sy, sz], 'pos': [x, y, z], 'color': c}


def frame(post, roof, roof_y=2.65, w=3.9, d=2.8):
    p = [box(0.12, 2.6, 0.12, x, 1.3, z, post) for x in (-1.6, 1.6) for z in (-1.0, 1.0)]
    return p + [box(w, 0.1, d, 0, roof_y, 0, roof), box(3.0, 0.9, 0.7, 0, 0.45, 0.3, post), box(3.0, 0.08, 0.9, 0, 0.94, 0.3, '#8b5a2b')]


def stripes(cols, y=2.58, n=6):
    """日よけの縞。前に垂れる布（遠目でも見える）と、日よけの下の面（見上げた所）に、色を交互に付ける"""
    w = 3.9 / n
    xs = [-1.95 + w * (i + 0.5) for i in range(n)]
    return [box(w, 0.5, 0.07, x, 2.38, 1.43, cols[i % len(cols)]) for i, x in enumerate(xs)] + [box(w, 0.06, 2.8, x, y, 0, cols[i % len(cols)]) for i, x in enumerate(xs)]


def row(cols, y, z=0.3, size=(0.5, 0.3, 0.5)):
    xs = [-1.1 + i * 2.1 / max(1, len(cols) - 1) for i in range(len(cols))]
    return [box(size[0], size[1], size[2], x, y, z, c) for x, c in zip(xs, cols)]


def edo(noren, goods, lamp='#c8402a'):
    """江戸の屋台: 暗い木の枠・小さな屋根・のれん・提灯（簡素で、夜の明かりが映える）"""
    p = frame('#4a3a2a', '#3a2c20', roof_y=2.55, w=3.5, d=2.4)
    p += [box(0.9, 0.7, 0.04, x, 2.05, 1.25, noren[i % len(noren)]) for i, x in enumerate((-1.1, 0, 1.1))]
    p += [box(0.3, 0.42, 0.3, x, 2.1, 1.1, lamp) for x in (-1.7, 1.7)] + [box(0.34, 0.05, 0.34, x, 2.34, 1.1, '#2a1e16') for x in (-1.7, 1.7)]
    return p + goods


def port(cols, goods):
    """港の屋台: 青と白の縞の日よけ・氷と木箱・魚介（海の街の、朝獲れの市）"""
    return frame('#6b5a3a', '#e8e4d8', w=3.9) + stripes(cols) + [box(3.1, 0.1, 0.8, 0, 0.88, 0.32, '#d8e4ea')] + goods


def snow(goods):
    """雪国の屋台: 濃い茶の日よけに雪・湯気の立つ銅のサモワール（寒さに、温かい物と脂）"""
    cloth = [box(0.65, 0.5, 0.07, -1.95 + 0.65 * (i + 0.5), 2.38, 1.43, '#b8302a' if i % 2 == 0 else '#f2e8d0') for i in range(6)]   # 雪の中でも見える、赤と生成りの垂れ布
    return frame('#4a3020', '#5a3a28') + cloth + [box(4.0, 0.14, 2.9, 0, 2.76, 0, '#f4f8fa'), box(0.4, 0.55, 0.4, 1.2, 1.28, 0.3, '#b8742a'), box(0.2, 0.2, 0.2, 1.2, 1.7, 0.3, '#d89a3a'),
                                          box(0.12, 0.4, 0.12, 1.2, 2.0, 0.3, '#e8eef0')] + goods


def bazaar(cols, goods):
    """スーク（中東の市場）の屋台: 派手な縞の日よけ・後ろに垂れる絨毯・香辛料の山"""
    return frame('#5a3a22', '#b84a2a') + stripes(cols) + [box(3.0, 1.4, 0.05, 0, 1.45, -0.95, '#7a2a4a'), box(2.6, 0.2, 0.06, 0, 1.6, -0.9, '#d8a030'), box(2.6, 0.2, 0.06, 0, 1.2, -0.9, '#2a5a7a')] + goods


def mound(cols, y=1.2): return [box(0.5, 0.3, 0.5, x, y - 0.07, 0.3, c) for x, c in zip((-1.1, -0.4, 0.3, 1.0), cols)] + [box(0.3, 0.2, 0.3, x, y + 0.13, 0.3, c) for x, c in zip((-1.1, -0.4, 0.3, 1.0), cols)]


KINDS = {
    # 江戸（K・K1）: 蕎麦・天ぷら・寿司・団子
    'stall_edo_soba': (edo(['#1f3a6b', '#f2e8d0'], row(['#f4f0e4'] * 3, 1.06, size=(0.34, 0.16, 0.34)) + [box(0.7, 0.4, 0.5, 1.1, 1.14, 0.3, '#2a2a2a'), box(0.3, 0.1, 0.3, 1.1, 1.4, 0.3, '#e8eef0')]), '江戸の屋台（蕎麦。藍ののれんと提灯。湯気の立つ釜と、どんぶり）'),
    'stall_edo_tempura': (edo(['#b8302a', '#f2e8d0'], row(['#e0a82a', '#d8902a', '#e0a82a'], 1.06, size=(0.4, 0.12, 0.3)) + [box(0.5, 0.3, 0.5, 1.1, 1.1, 0.3, '#3a3a3a')]), '江戸の屋台（天ぷら。赤いのれん。串に刺した揚げたて）'),
    'stall_edo_sushi': (edo(['#f2e8d0', '#2a2a2a'], row(['#f4f0e4', '#e8584a', '#f4f0e4', '#e8a060'], 1.06, size=(0.34, 0.14, 0.2)), lamp='#e8d8a0'), '江戸の屋台（寿司。白いのれん。握りを並べた台）'),
    'stall_edo_dango': (edo(['#e8a0b0', '#f2e8d0'], row(['#e8a0b0', '#f2e8d0', '#8ab040'], 1.1, size=(0.12, 0.3, 0.12)) + [box(0.7, 0.12, 0.4, 1.1, 1.0, 0.3, '#a06a3a')], lamp='#e8786a'), '江戸の屋台（団子。桃色ののれん。三色の串）'),
    # 港（E・I）: 魚・焼き・貝・果物
    'stall_port_fish': (port(['#2a6a9a', '#f4f4f0'], row(['#b8c4cc', '#a8b4bc', '#c8d0d8'], 1.08, size=(0.5, 0.14, 0.3)) + [box(0.5, 0.25, 0.4, 1.1, 1.1, 0.3, '#d8e4ea')]), '港の屋台（魚。青と白の縞の日よけ。氷の上の魚）'),
    'stall_port_grill': (port(['#d8742a', '#f4f4f0'], row(['#5a3a28', '#b84a2a', '#5a3a28', '#b84a2a'], 1.08, size=(0.5, 0.12, 0.2)) + [box(0.6, 0.3, 0.5, 1.15, 1.1, 0.3, '#2a2a2a')]), '港の屋台（魚介の焼き物。橙と白の縞の日よけ。炭火）'),
    'stall_port_shell': (port(['#2a8a8a', '#f4f4f0'], row(['#e8dcc8', '#c8b8a0', '#e8dcc8', '#e8786a'], 1.08, size=(0.4, 0.14, 0.4))), '港の屋台（貝・牡蠣。青緑と白の縞の日よけ）'),
    'stall_port_fruit': (port(['#e0b030', '#f4f4f0'], row(['#e0b030', '#d8902a', '#d94a2a', '#8ab040'], 1.12)), '港の屋台（果物。黄と白の縞の日よけ）'),
    # 雪国（A）: ピロシキ・クワス・ブリヌイ・茶
    'stall_snow_pirozhki': (snow(row(['#c8884a', '#d89a58', '#c8884a'], 1.06, size=(0.42, 0.18, 0.28))), '雪国の屋台（ピロシキ。雪をのせた日よけ。湯気の立つサモワールと、焼きたて）'),
    'stall_snow_kvass': (snow([box(0.6, 0.6, 0.6, -0.9, 1.25, 0.3, '#7a5a30'), box(0.62, 0.06, 0.62, -0.9, 1.1, 0.3, '#3a2a18'), box(0.62, 0.06, 0.62, -0.9, 1.45, 0.3, '#3a2a18')]), '雪国の屋台（クワスの樽。パンの発酵飲料）'),
    'stall_snow_blini': (snow(row(['#e8c878', '#e8c878', '#f2e8d0'], 1.05, size=(0.5, 0.06, 0.5))), '雪国の屋台（ブリヌイ。薄焼きの重なり）'),
    'stall_snow_tea': (snow(row(['#b8742a', '#c88a3a', '#b8742a'], 1.08, size=(0.26, 0.28, 0.26))), '雪国の屋台（温かい茶・蜂蜜の飲み物。銅の器）'),
    # スーク（C・H）: 香辛料・絨毯・菓子・焼き肉
    'stall_bazaar_spice': (bazaar(['#7a2a8a', '#e0a82a', '#2a8a5a'], mound(['#b8322a', '#e0a82a', '#d8741a', '#6a8a3a'])), '市場（スーク）の屋台（香辛料。縞の日よけ。赤・黄・橙・緑の山）'),
    'stall_bazaar_carpet': (bazaar(['#2a5a9a', '#d8a030', '#b8322a'], [box(2.8, 0.06, 0.8, 0, 1.0, 0.3, '#a8322a'), box(2.4, 0.07, 0.6, 0, 1.05, 0.3, '#2a5a7a'), box(1.6, 0.08, 0.4, 0, 1.1, 0.3, '#d8a030')]), '市場（スーク）の屋台（絨毯・織物。重ねて並べる）'),
    'stall_bazaar_sweets': (bazaar(['#d84a8a', '#f4e8d0', '#2a8a8a'], row(['#e8a030', '#f4e8d0', '#d8742a', '#e8a030'], 1.06, size=(0.4, 0.14, 0.4))), '市場（スーク）の屋台（菓子・ナッツ・蜜の菓子）'),
    'stall_bazaar_kebab': (bazaar(['#b8322a', '#f4e8d0', '#b8322a'], [box(0.4, 0.8, 0.4, -0.8, 1.35, 0.3, '#8a4a2a'), box(0.1, 0.9, 0.1, -0.8, 1.35, 0.3, '#c8ccd4'), box(1.4, 0.3, 0.5, 0.7, 1.1, 0.3, '#2a2a2a'), box(1.2, 0.08, 0.3, 0.7, 1.28, 0.3, '#a8322a')]), '市場（スーク）の屋台（焼き肉。回る肉の塊と、炭火の串）'),
}


def lines():
    out = []
    for k, (parts, desc) in KINDS.items():
        e = {'type': 'furniture', 'parts': parts, 'collider': [3.2, 1.0], 'colliderOffset': [0, 0.3], 'blocksProjectiles': False, 'description': desc}
        out.append(f'  "{k}": ' + json.dumps(e, ensure_ascii=False, separators=(', ', ': ')))
    return out


def apply():
    src = open(OBJ, encoding='utf-8').read().rstrip().split('\n')
    src = [l for l in src if not l.startswith('  "stall_')]
    assert src[-1] == '}'
    body = src[:-1]
    if not body[-1].endswith(','): body[-1] += ','
    new = lines()
    open(OBJ, 'w', encoding='utf-8').write('\n'.join(body + [l + ',' for l in new[:-1]] + [new[-1], '}']) + '\n')
    json.load(open(OBJ, encoding='utf-8'))   # 書いたものが、JSON として読めること


if __name__ == '__main__': apply(); print(len(KINDS), 'stall kinds')
