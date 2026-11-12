"""I（カナロア公国・カナロア大湖の東岸の水の都）の街の中。手本は E（ガリレオ連盟の港町。サンプル city・D・H の作りを引く）。
  E の街の中（運河・橋・遊歩道・施設 6 つ・議長の館）を、**左右を逆にして**使う（E の港は東・I の湖は西。壁の西のすぐ外が、湖）。
  変えた点: 港の水は、湖の水（見た目は同じ水・岸壁・桟橋・船は、湖の漁船として）。議長の館 → 公爵の館（mansion_duke_i。主は、公爵。公爵は屋敷の中だけ）・立て札は「公爵の館」。
  左右を逆にするのは、中身（高さ・段差 1 以下・歩ける所のつながり）が、E でテスト済みのため。扉・立て札・NPC・出入口の位置は、すべて同じ向きに直す
"""
import town_e as TE


def _mirror_row(r, w): return r[::-1]


def build(w, h, legend, city_legend, links, npcs):
    """I の街の中（layout・heights）を作り、legend・links・npcs に足す。(layout, heights) を返す"""
    assert (w, h) == (40, 30)
    gate_links = dict(links)   # 外から入る門（gen_world が先に置く。南の門 2 マスは左右対称）
    links.clear()
    e_links, e_npcs = {}, []
    layout, heights = TE.build(w, h, legend, city_legend, e_links, e_npcs)
    for k, v in e_links.items():
        x, z = map(int, k.split(','))
        if v.get('nextMap') in ('town_k', 'town_k1') or (v.get('params') or {}).get('shopId') == 'ferry_e': continue   # E の渡し場（K1 コマチ港町行き。今は売り場 shop の ferry_e）は、I にはない（港は、E だけ）
        v = dict(v)
        if 'back' in v: v['back'] = dict(v['back'], x=w - 1 - v['back']['x'])
        if v.get('nextMap') == 'mansion_chairman_e': v['nextMap'] = 'mansion_duke_i'; v['message'] = '女王の館に入る'
        links[f'{w - 1 - x},{z}'] = v
    for k, v in gate_links.items(): links[k] = v
    for n in e_npcs: npcs.append(dict(n, x=w - 1 - n['x']))
    rows = [list(r) for r in layout]   # E の渡し場（建物の扉と立て札）は、I にはない: 扉を壁に、立て札を石畳に戻す
    assert rows[7][27] == 'd' and rows[8][28] == 'z'
    rows[7][27] = 'S'; rows[8][28] = 'p'
    layout = [''.join(r) for r in rows]
    legend['x'] = 'duke_sign'   # 女王の館の立て札（物体名は duke_sign のまま）（E の議長の館の立て札を置き換え）
    return [_mirror_row(r, w) for r in layout], [_mirror_row(r, w) for r in heights]
