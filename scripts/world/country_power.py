"""国力（街の規模・ランクの基準）を、街道の道のりから計算する（読むだけ。何も書かない）。
使い方: python3 scripts/world/country_power.py
計算: 国力 = 経済力 + 特別枠。経済力 = 近さ 50% + 港 25% + 鉱山 25%（各 0〜10 点）。
  近さ = 近い 3 国への道のりの平均が短いほど高い（対象の最短 = 10・最長 = 0）。港 = E は 10・ほかは E までの道のりが近いほど高い（0 マス = 10・700 マス以上 = 0）。鉱山 = A・F は 10。
  対象外: G・J（独自の国）・K（マカヒキ島。離れた島で侵略されず、独自の文化。街道網の外で、E との渡し船だけ。街の規模は、島の広さと文化から決める）。特別枠: B は宗教国家として +3。段階: 7 以上 S・4〜7 A・3〜4 B・3 未満 C（境目は、下の TIERS）
読む: public/data/world_roads.json"""
import json, os
from collections import deque

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TARGETS = ['a', 'b', 'c', 'd', 'e', 'f', 'h', 'i']
WEIGHT = (0.5, 0.25, 0.25)   # 近さ・港・鉱山
PORT, PORT_RANGE = 'e', 700
MINES = {'a', 'f'}
SPECIAL = {'b': 3.0}   # B フランケル聖国: 宗教国家として潤っている（交易・経済とは別）
TIERS = [(7.0, 'S'), (4.0, 'A'), (3.0, 'B'), (0.0, 'C')]


def main():
    d = json.load(open(os.path.join(ROOT, 'public', 'data', 'world_roads.json')))
    C = {tuple(c) for c in d['centers']}
    S = {}
    for k in TARGETS:
        p = tuple(d['towns'][k]['gate']); S[k] = p if p in C else min(C, key=lambda c: abs(c[0] - p[0]) + abs(c[1] - p[1]))
    def bfs(s):
        D = {s: 0}; q = deque([s])
        while q:
            y, x = q.popleft()
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                n = (y + dy, x + dx)
                if n in C and n not in D: D[n] = D[(y, x)] + 1; q.append(n)
        return D
    dist = {k: {o: bfs(S[k])[S[o]] for o in TARGETS if o != k} for k in TARGETS}
    near = {k: sum(sorted(dist[k].values())[:3]) / 3 for k in TARGETS}
    lo, hi = min(near.values()), max(near.values())
    rows = []
    for k in TARGETS:
        close = 10 * (hi - near[k]) / (hi - lo)
        port = 10.0 if k == PORT else 10 * max(0.0, 1 - dist[k][PORT] / PORT_RANGE)
        mine = 10.0 if k in MINES else 0.0
        eco = WEIGHT[0] * close + WEIGHT[1] * port + WEIGHT[2] * mine
        tot = eco + SPECIAL.get(k, 0.0)
        rows.append((tot, k, eco, close, port, mine))
    for tot, k, eco, close, port, mine in sorted(rows, reverse=True):
        tier = next(t for lim, t in TIERS if tot >= lim)
        print(f'{k}: 国力 {tot:.1f}（{tier}）= 経済力 {eco:.1f}（近さ {close:.1f}・港 {port:.1f}・鉱山 {mine:.0f}）+ 特別枠 {SPECIAL.get(k, 0.0)}')


if __name__ == '__main__':
    main()
