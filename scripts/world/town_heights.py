"""街の中の高さ（起伏）。**サンプルの街（city）の高さのデータを、そのまま土台にする**（ユーザーの厳命: 街・町・村は、サンプルを手本にする）。
  - サンプル（public/data/maps/city.json）の高さを、街の大きさに合わせて切り出す（扉・川・立て札のために 0 にしてあるマスは、1 にする）
  - 川・高台（王城区・神殿・館）だけを、この上に重ねる。高台のまわりは、歩ける隣どうしの段差が 1 以下になるよう、なだらかにつなぐ
"""
import json
import os

CH36 = '0123456789abcdefghijklmnopqrstuvwxyz'
SAMPLE = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'data', 'maps', 'city.json')


def sample_field(w, h, ox, oy):
    """サンプルの高さを、(ox, oy) ずらして w×h に切り出す。外周（壁）は 0・内側は 1 以上"""
    hs = json.load(open(SAMPLE, encoding='utf-8'))['heights']
    f = [[0] * w for _ in range(h)]
    for y in range(1, h - 1):
        for x in range(1, w - 1):
            f[y][x] = max(int(hs[(y + oy) % len(hs)][(x + ox) % len(hs[0])], 36), 1)
    return f


def relax(lv, walk, fixed, passes=300):
    """歩ける隣どうし（上下左右）の段差が 1 以下になるまで、fixed 以外の歩けるマスの高さを、隣に合わせて直す"""
    h, w = len(lv), len(lv[0])
    free = [(x, y) for y in range(h) for x in range(w) if walk[y][x] and (x, y) not in fixed]
    for _ in range(passes):
        changed = 0
        for x, y in free:
            nb = [lv[y + dy][x + dx] for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)) if 0 <= x + dx < w and 0 <= y + dy < h and walk[y + dy][x + dx]]
            if not nb: continue
            lo, hi = max(nb) - 1, min(nb) + 1
            v = min(max(lv[y][x], lo), hi) if lo <= hi else hi
            if v != lv[y][x]: lv[y][x] = v; changed += 1
        if not changed: break
    return lv


def edge_change_ratio(heights):
    """サンプルと比べる指標: 陸（高さ 0 でない）どうしの辺で、高さが変わる割合（heights: 文字列の行の配列）。川・港の水は除く"""
    h, w = len(heights), len(heights[0])
    tot = ch = 0
    for y in range(h):
        for x in range(w):
            for dx, dy in ((1, 0), (0, 1)):
                if x + dx < w and y + dy < h and heights[y][x] != '0' and heights[y + dy][x + dx] != '0':
                    tot += 1; ch += heights[y][x] != heights[y + dy][x + dx]
    return ch / tot
