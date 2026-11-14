"""道沿いの村・町・宿場（街道に面した小さな集落）。定義は、ユーザーが 2026-11-13 に決めた 12 か所（番号順）。
  - 外のマップ: 街道のわきに、小さな外観（村・宿場は木の柵と家の屋根・町は国の壁と家の屋根）。道に面した側に、門 2 マス（中のマップへの入口）と、門前の石畳・名前の立て札
  - 中のマップ: 手本は、サンプルの村（public/data/maps/village.json 24×24）と町（town.json 28×24）。そのまま切り出す（宿場は、村の川を除いて右側を切り出す）。中の施設の中身（道具屋・宿・神殿・村長の家）は、サンプルと共通（$back で戻る）
  - 国ごとの違い: 外観の素材（town_look.py と同じ）・街の人の画像・雪国の環境
  - 位置は、世界のマス [行, 列] の道の中心線の近く（仮。道に面した、空いた平らな所を、機械的に探す）
"""
import json
import os
import numpy as np
import roadside_layout as RL
import roadside_water as RW
import town_stalls as TS
import roads
import terrain as T
from town_look import LOOK
from world_consts import LEGEND, MAPS, SOLID_CH, TOWN_NAME, TOWN_SIGN_CH

MESH_SIZE = 64   # 外のマップ 1 枚のマス数

# (番号, 区分, 国, 名前, 世界のマス [行, 列]。道の中心線上)
SITES = [
    ('01', '村', 'b', 'アルマダ村', (480, 829)), ('02', '町', 'a', 'ソレミア町', (369, 855)), ('03', '町', 'd', 'フレイズ町', (565, 579)),
    ('04', '村', 'b', 'サンドピット村', (585, 765)), ('05', '町', 'd', 'ディクタット町', (630, 643)), ('06', '村', 'f', 'コンドル村', (726, 924)),
    ('07', '村', 'e', 'ジャジル村', (775, 873)), ('08', '宿場', 'f', 'シルヴァノ宿場', (595, 961)), ('09', '村', 'd', 'ラクティ村', (679, 641)),
    ('10', '町', 'd', 'デノン町', (748, 562)), ('11', '町', 'e', 'ドゥマーニ町', (807, 598)), ('12', '村', 'b', 'カイタノ村', (545, 961)),
]
OUTER = {'村': (10, 8), '宿場': (10, 8), '町': (14, 10)}   # 外観の大きさ（道に沿う幅, 道から奥への深さ）
INNER_SIZE = {'村': (24, 24), '町': (28, 24), '宿場': (20, 20)}   # 中のマップの大きさ
GATE = {'村': ((11, 12), 23), '町': ((13, 14), 23), '宿場': ((7, 8), 19)}   # 中の門のマス（x の 2 つ, y）。南の壁の真ん中
GUARD = {'a': 'snow_gate_guard', 'b': 'guard_b', 'd': 'guard_spear', 'f': 'beast_soldier_kobold_gate'}   # 町の門の衛兵（書いていない国は guard_light）
MAYOR_DOOR_CH = 'm'
# 村・宿場の外の柵の中の家の並び: 場所 id → (左の列, 右の列)。two=小さな家 2 軒・long=細長い家 1 軒・front=手前だけ・back=奥だけ
HOUSE_PLAN = {'01': ('two', 'two'), '04': ('long', 'two'), '06': ('two', 'back'), '07': ('front', 'two'), '09': ('two', 'long'), '12': ('long', 'back'), '08': ('two', 'front')}
PLAZA = 2   # 道の端から門までの石畳の長さ

CREST_GATES = {'gate_marble', 'gate_adobe', 'gate_wood', 'gate_white', 'gate_rock', 'gate_snow', 'gate_village', 'gate_lake', 'gate_mage'}   # 国の紋章の盾つきの門


def plain_gate(name):
    """道沿いの村・町・宿場の門: 国の紋章の盾は付けない（盾は主要な国 A〜J の街だけ。K は屋根。ユーザー指示 2026-11-13）→ 盾なしの門（<名前>_plain）"""
    return name + '_plain' if name in CREST_GATES else name


# 外のマップの文字（国ごとの素材）: 壁・門・家・石畳。ギリシャ文字（既存の文字と重ならない）
_COUNTRIES = ('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k')
_ELEMENTS = ('6', '7', '8', '9')
_DEFAULT = {'6': 'city_wall', '7': 'district_gate', '8': 'brick_house', '9': 'plaza_stone'}
FENCE_CH = chr(0x3b1)
PORTAL_CH = chr(0x3b2 + 45)   # 村の入口（見えない移動のマス gateway。青い枠の portal は外に出さない）
WOOD_HOUSE_CH = chr(0x3b2 + 44)   # 村の家（最初に作った村 village.json と同じ木の家）
CHAR = {(c, e): chr(0x3b2 + i * 4 + j) for i, c in enumerate(_COUNTRIES) for j, e in enumerate(_ELEMENTS)}
LEGEND_EXTRA = {FENCE_CH: 'wooden_fence', WOOD_HOUSE_CH: 'wooden_house', PORTAL_CH: 'village_entrance', **{ch: LOOK.get(c, {}).get(e, _DEFAULT[e]) for (c, e), ch in CHAR.items()}}
LEGEND_EXTRA = {ch: (plain_gate(n) if n.startswith('gate_') else n) for ch, n in LEGEND_EXTRA.items()}
SOLID_EXTRA = {FENCE_CH, WOOD_HOUSE_CH} | {ch for (c, e), ch in CHAR.items() if e != '9'}

LEGEND.update(LEGEND_EXTRA); SOLID_CH.update(SOLID_EXTRA)   # 外のマップの凡例・通れない物体に、足す

PLACED = []   # 置いた結果（place が書く）: dict(id, kind, country, name, at, gate=[(行,列)×2], facing=(dy,dx), box, plaza, sign, mesh, inner)


def _free_land(t, obj, ys, xs):
    """範囲（行 ys・列 xs）が、すべて陸で、水・道・橋・立て札・街の物体がないか"""
    water = t['deep'] | t['shallow'] | t['bridge'] | t['lagoon'] | t['mtn_bridge'] | (t['river'] > 0)
    for y in ys:
        for x in xs:
            if not t['land'][y, x] or water[y, x]: return False
            if chr(obj[y, x]) in ('6', '7', '8', '9', roads.ROAD_CH, roads.BRIDGE_CH, roads.SIGN_CH, TOWN_SIGN_CH) or chr(obj[y, x]) in LEGEND_EXTRA: return False
    return True


def _geometry(rc, s, L, kind):
    """道の中心 rc から、向き s（site がある向き (dy, dx)）に作る外観の位置。戻り値: dict(box=(y0, y1, x0, x1), plaza=[(y, x)…], gate=[(y, x), (y, x)], sign=(y, x))
    L: 道に沿った横ずれ"""
    wd, dp = OUTER[kind]
    sy, sx = s
    py, px = (0, 1) if sy else (1, 0)   # 道に沿う向き（行の増減, 列の増減）
    c = (rc[0] + py * L, rc[1] + px * L)   # 横ずれした、道の中心
    def at(k, p): return (c[0] + sy * k + py * p, c[1] + sx * k + px * p)   # 道から k マス奥・横に p マス
    k0 = 1 + PLAZA + 1                     # 門の列（道の端 +1 から、石畳 PLAZA マスの先）
    cells = [at(k, p) for k in range(k0, k0 + dp) for p in range(-wd // 2, wd - wd // 2)]
    ys_, xs_ = [a for a, b in cells], [b for a, b in cells]
    gate = [at(k0, -1), at(k0, 0)]
    plaza = [at(k, p) for k in range(2, k0) for p in (-1, 0)]
    sign = at(k0 - 1, 2)
    return dict(box=(min(ys_), max(ys_), min(xs_), max(xs_)), plaza=plaza, gate=gate, sign=sign, center=c)


def _region_ok(t, obj, geo, placed):
    y0, y1, x0, x1 = geo['box']
    ys_, xs_ = range(y0 - 1, y1 + 2), range(x0 - 1, x1 + 2)
    pts = geo['plaza'] + [geo['sign']]
    ally = [y0 - 1, y1 + 1] + [p[0] for p in pts]; allx = [x0 - 1, x1 + 1] + [p[1] for p in pts]
    if len({y // MESH_SIZE for y in ally}) != 1 or len({x // MESH_SIZE for x in allx}) != 1: return False   # 1 枚の外のマップに収める
    if min(ally) % MESH_SIZE < 2 or max(ally) % MESH_SIZE > MESH_SIZE - 3 or min(allx) % MESH_SIZE < 2 or max(allx) % MESH_SIZE > MESH_SIZE - 3: return False
    if not _free_land(t, obj, ys_, xs_): return False
    for q in placed:
        qy0, qy1, qx0, qx1 = q['box']
        if not (y1 + 6 < qy0 or qy1 + 6 < y0 or x1 + 6 < qx0 or qx1 + 6 < x0): return False
    return True


def _village_houses(obj, geo, sid):
    """村の囲いの中に、木の家（幅 2 マス）を、間を空けて並べる。門から奥へ通る道（門の 2 マス幅）をはさんで、左右の列に（ユーザー提案 2026-11-14）。家の数・並びは場所ごと（HOUSE_PLAN）"""
    y0, y1, x0, x1 = geo['box']
    (ay, ax), (by, bx) = geo['gate']
    alongy = ay == by   # 門が行（横一列）に並ぶ＝奥行きは行方向
    if alongy:
        edge, inward = ay, (1 if ay == y0 else -1)
        depth, lo, width = y1 - y0 + 1, x0, x1 - x0 + 1
        lane = (min(ax, bx) - x0, max(ax, bx) - x0)
    else:
        edge, inward = ax, (1 if ax == x0 else -1)
        depth, lo, width = x1 - x0 + 1, y0, y1 - y0 + 1
        lane = (min(ay, by) - y0, max(ay, by) - y0)
    lefts = (lane[0] - 2, lane[1] + 1)   # 道の左右の家の、幅方向の始まり（2 マス幅）
    spans = {'two': [(1, 2), (4, 5)], 'long': [(1, 5)], 'front': [(1, 2)], 'back': [(4, 5)]}   # 奥行きの範囲（扉の側の壁から数える）。two=小さな家 2 軒・long=細長い家 1 軒・front=手前だけ・back=奥だけ
    for w0, opt in zip(lefts, HOUSE_PLAN.get(sid, ('two', 'two'))):   # 左右の列ごとに、家の並びを変える
        if w0 < 1 or w0 + 1 > width - 2: continue
        for a, b in spans[opt]:
            if b > depth - 2: continue
            for dd in range(a, b + 1):
                for ww in (w0, w0 + 1):
                    if alongy: obj[edge + inward * dd, lo + ww] = ord(WOOD_HOUSE_CH)
                    else: obj[lo + ww, edge + inward * dd] = ord(WOOD_HOUSE_CH)


def _paint(g, geo, kind, country, name, sid):
    """外観を obj に置き、高さを道に合わせる"""
    obj, elev = g.obj, g.elev
    y0, y1, x0, x1 = geo['box']
    ch = lambda e: CHAR[(country, e)]
    base = int(elev[geo['plaza'][0]])
    region = (slice(y0 - 1, y1 + 2), slice(x0 - 1, x1 + 2))
    obj[region] = ord('0')
    elev[region] = base
    for y, x in geo['plaza']: elev[y, x] = base; obj[y, x] = ord(ch('9'))
    village = kind in ('村', '宿場')   # 村・宿場は、最初に作った村と同じ（木の柵・木の家・門なしの入口。国の素材は使わない。ユーザー指示 2026-11-14）
    wall = ch('6') if kind == '町' else (FENCE_CH if village else ch('8'))   # 村・宿場の外周は、家（壁として数える。扉は壁にはさまれる）
    obj[y0:y1 + 1, x0:x1 + 1] = ord('0' if village else ch('8'))
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            if y in (y0, y1) or x in (x0, x1): obj[y, x] = ord(wall)
    if village: _village_houses(obj, geo, sid)
    for y, x in geo['gate']: obj[y, x] = ord(PORTAL_CH) if village else ord(ch('7')); elev[y, x] = base
    sy, sx = geo['sign']; obj[sy, sx] = ord(roads.SIGN_CH); elev[sy, sx] = base


def place(g):
    """世界の地形（g.t・g.obj・g.elev。街道ができた後）に、道沿いの外観を置く。PLACED に記録して、立て札の文章を ROAD_SIGNS へ"""
    from world_consts import ROAD_SIGNS
    t, obj = g.t, g.obj
    centers = np.array(json.load(open(os.path.join(MAPS, '..', 'world_roads.json'), encoding='utf-8'))['centers'])
    PLACED.clear()
    for sid, kind, country, name, (r0, c0) in SITES:
        order = np.argsort((centers[:, 0] - r0) ** 2 + (centers[:, 1] - c0) ** 2)[:80]
        done = None
        for idx in order:
            rc = (int(centers[idx][0]), int(centers[idx][1]))
            for s in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                for L in (0, 3, -3, 6, -6):
                    geo = _geometry(rc, s, L, kind)
                    if _region_ok(t, obj, geo, PLACED): done = (rc, s, geo); break
                if done: break
            if done: break
        assert done, f'道沿いの {sid} {name}: 置ける場所がない（{r0},{c0} の近く）'
        rc, s, geo = done
        _paint(g, geo, kind, country, name, sid)
        my, mx = geo['gate'][0][0] // MESH_SIZE, geo['gate'][0][1] // MESH_SIZE
        msg = f"【{kind}】{name}（{TOWN_NAME[country]}）"
        ROAD_SIGNS[geo['sign']] = msg
        PLACED.append(dict(id=sid, kind=kind, country=country, name=name, at=[r0, c0], road=list(rc), facing=[-s[0], -s[1]], gate=[list(p) for p in geo['gate']],
                           box=list(geo['box']), sign=list(geo['sign']), plaza=[list(p) for p in geo['plaza']], mesh=f'w_{my:02d}_{mx:02d}', inner=f'rs_{sid}'))
        print(f'道沿い {sid} {kind} {name}: 道 {rc}・向き {s}・{geo["box"]}')
    roads.fix_steps(g.elev, obj, t)
    with open(os.path.join(MAPS, '..', 'world_roadside.json'), 'w', encoding='utf-8') as fp:
        json.dump({'note': '道沿いの村・町・宿場（世界のマス [行, 列]）。gate: 中への門 2 マス・facing: 門が向く向き（行, 列）・road: 面した道の中心・mesh: 外のマップ・inner: 中のマップ', 'sites': PLACED}, fp, ensure_ascii=False, indent=1)


def outer_extras(j, i):
    """外のマップ (j, i) の、道沿いの門の links・門の衛兵の npcs・凡例の追加"""
    links, npcs, used = {}, [], set()
    for p in PLACED:
        if p['mesh'] != f'w_{j:02d}_{i:02d}': continue
        for k, (gy, gx) in enumerate(p['gate']):
            w, h = INNER_SIZE[p['kind']]
            gxs, gy_in = GATE[p['kind']]
            links[f'{gx - i * MESH_SIZE},{gy - j * MESH_SIZE}'] = {'nextMap': p['inner'], 'message': f"{p['name']}に入る", 'spawn': {'x': gxs[k], 'z': gy_in - 2, 'angle': 0}}
        if p['kind'] == '町':   # 町は、門の隣（門の外 1 マス・横に 2 マス）に衛兵 1 人
            fy, fx = p['facing']
            gy, gx = p['gate'][0]
            gy, gx = (gy + fy, gx - 2) if fx == 0 else (gy - 2, gx + fx)
            npcs.append({'id': GUARD.get(p['country'], 'guard_light'), 'x': gx - i * MESH_SIZE, 'z': gy - j * MESH_SIZE})
    return links, npcs


def _angle(f):
    """向き（行, 列）→ 角度（0 北・-π/2 東・π 南・π/2 西（ゲームの規則: 東を向くと -π/2））"""
    return {(-1, 0): 0, (0, 1): -1.570795, (1, 0): 3.14159, (0, -1): 1.570795}[tuple(f)]


INN_POST_TRAVELERS = (('traveler_man', 4, 12), ('traveler_merchant', 12, 13), ('traveler_man', 16, 12))   # 宿場の旅人（道の行き交い。宿場の特徴: 村長の家・村の人より、旅人と宿・酒場が中心）

# 国ごとの中の部屋（A 雪国は暖炉つきの店・宿。F 獣王国は獣人の道具屋・宿。書いていない国は、サンプルのまま）。town_a.py（_A_ROOM）・town_d.py（FACILITIES_F）と同じ
ROOMS = {'a': {'shop': 'shop_a', 'village_pub': 'city_inn_a', 'town_pub': 'city_inn_a'}, 'f': {'village_pub': 'city_inn_f', 'town_pub': 'city_inn_f'}}
SHOP_ID = {'f': {'item_shop': 'item_shop_f', 'weapon_shop': 'weapon_shop_f'}}   # 店の品（F は獣人の道具屋・武器屋）

NPC_SKIN = {
    'a': {'villager_man': 'snow_man', 'villager_woman': 'snow_woman', 'child_boy': 'snow_boy', 'child_girl': 'snow_girl', 'elder_man': 'snow_old_man', 'elder_woman': 'snow_old_woman', 'merchant_man': 'snow_man', 'merchant_woman': 'snow_woman',
          'town_man': 'snow_man', 'town_woman': 'snow_woman', 'town_boy': 'snow_boy', 'town_old_woman': 'snow_old_woman', 'town_old_man': 'snow_old_man', 'town_middle_man': 'snow_man', 'town_middle_woman': 'snow_woman', 'town_girl': 'snow_girl'},
    'b': {'villager_man': 'priest_man', 'villager_woman': 'priest_woman', 'merchant_man': 'traveler_man', 'merchant_woman': 'priest_woman', 'elder_man': 'priest_man',   # 聖国: 一般人が少なく、下っ端・中間の聖職者（助祭・修道女）と巡礼が多い（設定メモ project_country_b_concept。priest_senior は神殿の中だけ）
          'town_man': 'priest_man', 'town_woman': 'priest_woman', 'town_middle_man': 'priest_man', 'town_middle_woman': 'priest_woman', 'town_old_man': 'priest_man', 'town_old_woman': 'priest_woman'},
    'e': {'villager_man': 'traveler_merchant', 'town_man': 'merchant_man', 'town_woman': 'merchant_woman', 'town_middle_man': 'merchant_man', 'town_middle_woman': 'merchant_woman'},   # 連盟: 商人と旅の行商人が多い（town_e の街の人の構成に合わせる）
    'f': {'villager_man': 'dwarf_man', 'villager_woman': 'beast_f_b', 'child_boy': 'beast_c', 'child_girl': 'beast_d', 'elder_man': 'dwarf_man', 'elder_woman': 'dwarf_woman', 'merchant_man': 'beast_a', 'merchant_woman': 'beast_f_c',
          'town_man': 'dwarf_man', 'town_woman': 'dwarf_woman', 'town_boy': 'beast_c', 'town_old_woman': 'dwarf_woman', 'town_old_man': 'dwarf_man', 'town_middle_man': 'beast_a', 'town_middle_woman': 'beast_f_a', 'town_girl': 'beast_d'},
}


def _sample(name):
    return json.load(open(os.path.join(MAPS, name + '.json'), encoding='utf-8'))


def _crop_inn_post(v):
    """宿場: 村のサンプルから、川（行 17〜20）を除き、左の 4 列を切る（20×20）。村長の家の扉（11,8）（12,8）は壁にする"""
    rows = list(range(0, 17)) + list(range(21, 24))
    lay = [list(v['layout'][y][4:]) for y in rows]
    hts = [list(v['heights'][y][4:]) for y in rows]
    for r in lay: r[0] = '#'
    lay[0] = ['#'] * 20; lay[-1] = ['#'] * 20
    for dx in (7, 8): lay[8][dx] = 'H'   # 村長の家の扉
    # 行 0〜16 のうち、行 17（元の 21）の高さは、元の行 16 の続き（川がないので、段差 1 以下にそろえる）
    return [''.join(r) for r in lay], [''.join(r) for r in hts]


_OBJECTS = []


def _objects():
    """objects.json（歩けるかの判定に使う。1 回だけ読む）"""
    if not _OBJECTS: _OBJECTS.append(json.load(open(os.path.join(MAPS, '..', 'objects.json'), encoding='utf-8')))
    return _OBJECTS[0]


def build_inner(p, envs, snow_env):
    """道沿いの 1 か所の中のマップ（rs_番号）"""
    kind, country = p['kind'], p['country']
    sm = _sample('town' if kind == '町' else 'village')
    links, npcs = {}, []
    if kind == '宿場':
        layout, heights = _crop_inn_post(sm)
        for k, v in sm['links'].items():
            x, y = map(int, k.split(','))
            if (x, y) in ((11, 8), (12, 8)): continue
            nx, ny = x - 4, y if y < 17 else y - 4
            if nx < 1: continue
            v2 = json.loads(json.dumps(v))
            if 'back' in v2: v2['back']['x'] -= 4
            links[f'{nx},{ny}'] = v2
        for n in sm['npcs']:
            if n['x'] >= 5 and n['z'] < 17 and n['id'] != 'chief_attendant': npcs.append({'id': n['id'], 'x': n['x'] - 4, 'z': n['z']})
        spawn = {'x': 7, 'z': 17, 'angle': 0}
        for nid, x, z in INN_POST_TRAVELERS:
            assert layout[z][x] == 'D', f'宿場の旅人 ({x},{z}): 土の道ではない'
            npcs.append({'id': nid, 'x': x, 'z': z})
    else:
        layout = list(sm['layout']); heights = list(sm['heights'])
        for k, v in sm['links'].items(): links[k] = json.loads(json.dumps(v))
        npcs = [dict(n) for n in sm['npcs']]
        spawn = {'x': GATE[kind][0][0], 'z': 21, 'angle': 0}
    lay = [list(r) for r in layout]; hts = [list(r) for r in heights]
    extra_legend = {}   # 場所ごとの変更で足す凡例（井戸など）
    if kind != '宿場':   # 建物の並びを、場所ごとに変える（roadside_layout.py。手本のまま使い、建物の入れ替えと左右反転だけ）
        plan = (RL.VILLAGE_PLAN if kind == '村' else RL.TOWN_PLAN)[p['id']]
        if kind == '町': RW.town_water(lay, hts, extra_legend, p['id'])   # 川と広場を、場所ごとに変える（roadside_water.py）
        else: RW.village_water(lay, hts, p['id'])
        mayor = RL.arrange(lay, hts, links, npcs, kind, p['id'])
        if mayor:   # 町長の家: 貴族クラスの男爵が町長（村に村長がいるように。ユーザー指示 2026-11-14）。町長の家の区画の扉を付けて、男爵の屋敷（mansion_baron）へ
            mx, my = mayor[0] + 1, mayor[1] + 2
            assert lay[my][mx] == 'H' and lay[my + 1][mx] in 'p=', '町長の家の扉の場所'
            lay[my][mx] = MAYOR_DOOR_CH
            links[f'{mx},{my}'] = {'nextMap': 'mansion_baron', 'message': '町長（男爵）の屋敷に入る', 'back': {'x': mx, 'z': my + 1, 'angle': 3.14159}}
        if kind == '村' and p['id'] in RL.WEAPON_SHOP_VILLAGES: RL.add_weapon_shop(lay, hts, links)   # 村の武器屋（村によって、ある・ない）
        RL.nudge_npcs(lay, npcs)
        if plan[1]: RL.mirror(lay, hts, links, npcs, spawn)
    gx, gy = GATE[kind]
    w, h = len(lay[0]), len(lay)
    if kind == '町':   # 道を、門まで（portal の '2' を除き、石畳 '=' で南の壁へ）
        for y in range(21, 23):
            for x in range(12, 16): lay[y][x] = '='; hts[y][x] = hts[20][x]
        for x in gx: hts[gy][x] = hts[20][x]
    for row in lay:
        for x, c in enumerate(row):
            if c == '2': row[x] = 'x' if kind != '町' else 'p'
    if country == 'f':   # F は神殿を置かない（town_d.py と同じ方針。神殿の品は道具屋 item_shop_f が売る）: 神殿の扉を建物の壁にして、出入口を外す
        for k in [k for k, v in links.items() if v['nextMap'].startswith('temple')]:
            x, y = map(int, k.split(',')); lay[y][x] = 'J'; del links[k]
    for x in gx: lay[gy][x] = 'G'
    layout = [''.join(r) for r in lay]
    legend = dict(sm['legend']); legend.update(extra_legend)
    if kind == '町': legend[MAYOR_DOOR_CH] = 'mansion_door'
    if kind == '村' and p['id'] in RL.WEAPON_SHOP_VILLAGES: legend['R'] = 'weapon_shop_sign'
    legend['G'] = 'village_entrance' if kind in ('村', '宿場') else plain_gate(LOOK.get(country, {}).get('7', 'district_gate'))   # 村は門なしの入口（最初の村と同じ）
    look = LOOK.get(country, {})
    if kind == '宿場' and '8' in look and country != 'd':   # 家の見た目（村・宿場）
        for ch in ('H', 'b'):
            if ch in legend: legend[ch] = look['8'] if ch == 'H' else legend[ch]
    if kind == '町' and '6' in look: legend['W'] = look['6']
    for n in npcs: n['id'] = NPC_SKIN.get(country, {}).get(n['id'], n['id'])
    for v in links.values():   # 国ごとの中の部屋（店・宿）
        v['nextMap'] = ROOMS.get(country, {}).get(v['nextMap'], v['nextMap'])
        if v['nextMap'] in ('shop', 'shop_a') and country in SHOP_ID: v['params'] = dict(v['params'], shopId=SHOP_ID[country].get(v['params']['shopId'], v['params']['shopId']))
    for x in gx: links[f'{x},{gy}'] = {'nextMap': p['mesh'], 'message': f"{p['name']}の外へ"}
    m = {'id': p['inner'], 'name': f"{p['name']}", 'type': 'open', 'tileSize': 4, 'wallHeight': 4, 'spawn': spawn,
         'environment': dict(snow_env, floorType='snow', fogNear=24, fogFar=72) if country == 'a' else sm['environment'],
         'legend': legend, 'enemies': {}, 'layout': layout, 'npcs': npcs, 'links': links, 'heights': [''.join(r) for r in hts],
         'heightStep': sm.get('heightStep', 0.5), 'fallDamagePerLevel': sm.get('fallDamagePerLevel', 6)}
    if kind == '町': m['decorFloor'] = sm.get('decorFloor', 'cobblestone')
    _fix_exit_links(m, p, gx, gy)
    if kind != '宿場': RL.relax_heights(m, _objects())   # 歩ける隣のマスの高さの差を 1 以内に（落下ダメージを出さない）
    if kind == '町' and RW.TOWN_PLAZA[p['id']] == 'stalls':
        for ch in TS.STALL_CH:   # 使っていない凡例（サンプルの portal '2' など）は外す（屋台の文字と重ねない）
            if ch not in ''.join(m['layout']): legend.pop(ch, None)
        TS.add(country, m, legend, spots=RW.STALL_SPOTS)   # 屋台の広場（国ごとの屋台・売り子・客。town_stalls.py）
    return m


def _fix_exit_links(m, p, gx, gy):
    """中の門から外へ出る links の spawn（門の外の石畳・向きは門が向く向き）"""
    j, i = int(p['mesh'].split('_')[1]), int(p['mesh'].split('_')[2])
    fy, fx = p['facing']
    for k, x in enumerate(gx):
        py, px = _plaza_front(p, k)
        m['links'][f'{x},{gy}']['spawn'] = {'x': px - i * MESH_SIZE, 'z': py - j * MESH_SIZE, 'angle': _angle((fy, fx))}


def _plaza_front(p, k):
    """門の外すぐ（石畳の、門に近い側）のマス。k = 0, 1 は、門 2 マスの順"""
    gy, gx = p['gate'][k]
    fy, fx = p['facing']
    return (gy + fy, gx + fx)
