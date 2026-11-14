"""道沿いの村・町の中の、川と広場を場所ごとに変える（サンプルの川と噴水は 1 種類。ユーザー指示 2026-11-14）。

川は、世界の地図で、その場所の近くに水（25 マス以内）があるかで決めた（測った結果を下の表に固定）:
  水が近い → 川あり。町は、水が来る向き（その場所の内側の座標に直した向き）で、縦向き（サンプルの西の川。反転で東）か、横向き（町の真ん中を東西に流れる川）
  水が遠い → 川なし。村は、池か、かわいた村。町は、川の跡を石畳にする
手本は village.json・town.json のまま使い、川・橋・起伏（高さ）はサンプルと同じ作り（水のマスは高さ 0・岸との差は 1 まで・橋は floor_tile）。
広場は、町の真ん中の噴水を、井戸・木・屋台の広場に替える。"""

# 町: 川（'v' サンプルの縦向き / 'h' 真ん中の横向き / 'none' 川なし）と広場（fountain / well / trees / stalls=屋台の広場）
TOWN_RIVER = {'02': 'v', '03': 'v', '05': 'none', '10': 'h', '11': 'v'}
TOWN_PLAZA = {'02': 'fountain', '03': 'well', '05': 'stalls', '10': 'trees', '11': 'stalls'}
STALL_SPOTS = [(11, 9), (11, 14), (16, 9), (16, 14)]   # 屋台の広場: 真ん中の大通りをはさんで、左右に 2 軒ずつ向かい合う（town_stalls.add が、国ごとの見た目と売り子・客で置く）
# 村: river（サンプルの南の川）/ pond（川なし・池）/ dry（川なし）
VILLAGE_WATER = {'01': 'pond', '04': 'dry', '06': 'river', '07': 'river', '09': 'river', '12': 'pond'}

V_DRY_PLANTS = [('T', 18, 18), ('y', 15, 17), ('x', 9, 20), ('y', 20, 19), ('x', 16, 20), ('T', 21, 20)]   # （文字, x, y）。池（x 2〜7）とは重ならない
T_RIVER_X = 9           # 町のサンプルの川の列
T_PLAZA = (13, 11)      # 町の噴水（x, y）
T_HRIVER_Y = 10         # 横向きの川の行
T_BRIDGES = (5, 6, 12, 13, 14, 15, 21, 22)   # 横向きの川の橋の列（12〜15 は、真ん中の大通り）


def _town_remove_river(lay, hts):
    """縦向きの川を消す: 水 → 広場の石畳・橋 → 道（行 6・7）か石畳。起伏は、岸と同じ高さ 1"""
    for y in range(1, len(lay) - 1):
        c = lay[y][T_RIVER_X]
        if c in 'wb': lay[y][T_RIVER_X] = '=' if (c == 'b' and y in (6, 7)) else 'p'
        hts[y][T_RIVER_X] = '1'


def town_water(lay, hts, legend, sid):
    """町の川と広場を変える（建物の入れ替えより前に呼ぶ）"""
    river, plaza = TOWN_RIVER[sid], TOWN_PLAZA[sid]
    if river in ('none', 'h'): _town_remove_river(lay, hts)
    if river == 'h':   # 真ん中を東西に流れる川。南北の岸は高さ 1（水は 0）。橋の列は、水の代わりに橋
        w = len(lay[0])
        for x in range(1, w - 1):
            for y in (T_HRIVER_Y - 1, T_HRIVER_Y + 1): hts[y][x] = '1'
            hts[T_HRIVER_Y][x] = '0'
            lay[T_HRIVER_Y][x] = 'b' if x in T_BRIDGES else 'w'
    x, y = T_PLAZA
    if plaza == 'well': lay[y][x] = 'Y'; legend['Y'] = 'well'
    elif plaza == 'trees': lay[y][x] = lay[y][x + 1] = 'T'; lay[y][x - 1] = 'f'; lay[y][x + 2] = 'v'
    elif plaza == 'stalls': lay[y][x] = '='   # 噴水を外し、道の石畳に（屋台は、roadside.py が組み立ての最後に town_stalls.add で置く）
    if plaza != 'fountain': hts[y][x] = hts[y][x + 1] = '1'


def village_water(lay, hts, sid):
    """村の南の川を、そのまま / 池に / なしにする"""
    kind = VILLAGE_WATER[sid]
    if kind == 'river': return
    for y in range(17, 21):   # 川の 4 行を、地面に（道の列 11・12 は土の道）。起伏は 1
        for x in range(1, len(lay[0]) - 1):
            lay[y][x] = 'D' if x in (11, 12) else '0'
            hts[y][x] = '1'
    for ch, x, y in V_DRY_PLANTS: lay[y][x] = ch   # 川の跡の、草・花・木（南の端の草むらと同じ種類）
    if kind == 'pond':   # 池: 浅瀬の輪（高さ 0）の中に、深い水
        for y in range(17, 21):
            for x in range(2, 8):
                inner = 18 <= y <= 19 and 3 <= x <= 6
                lay[y][x] = 'P' if inner else '~'; hts[y][x] = '0'
