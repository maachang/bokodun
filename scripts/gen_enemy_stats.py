#!/usr/bin/env python3
"""
敵のランク・系統・特殊能力から、enemies.json の stats（レベル・HP・攻撃の重さとダイス・経験値）を生成する。
仕様: docs/enemy-spec.md 6章。表: public/data/enemyRanks.json。

使い方:
  python3 scripts/gen_enemy_stats.py [割り当てJSON]
    割り当てJSON（{id: {rank, abilities, boss}}）を渡すと、rank / boss / abilities を enemies.json に取り込んでから生成する。
    省略時は、enemies.json にある rank / family / boss から stats だけを作り直す。
  family は、imageFile のフォルダ名（slime, insect, ...）から決める。
legacy の maxHp / attackPower / exp は触らない（game.js への反映は、あとで行う）。
"""
import json, os, sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
DATA = os.path.join(ROOT, 'public', 'data')
load = lambda f: json.load(open(os.path.join(DATA, f), encoding='utf-8'))

R = load('enemyRanks.json')
C = load('combat.json')
T = load('damageTable.json')['table']
ENEMIES_PATH = os.path.join(DATA, 'enemies.json')
enemies = load('enemies.json')

def tb(w, v):
    return T[max(1, min(50, int(w))) - 1][max(1, min(100, int(v))) - 1]

def dice(n, m, k):
    d = {k: 1}
    for _ in range(n):
        nd = {}
        for s, c in d.items():
            for f in range(1, m + 1):
                nd[s + f] = nd.get(s + f, 0) + c
        d = nd
    t = sum(d.values())
    return [(v, c / t) for v, c in d.items()]

def level_bonus(lv):
    lb = C['levelBonus']
    return lv * lb['maxBonus'] // lb['maxLevel']

def expected(w, k, lv):
    ad = R['attackDice']
    b = level_bonus(lv)
    return sum(p * tb(w, v + b) for v, p in dice(ad['n'], ad['m'], k))

def solve_attack(target, lv):
    """目標の出力に最も近い (重さ, k) を求める。誤差が同じなら、k が小さく、重さが小さいほうを選ぶ。"""
    best = None
    for w in range(1, 51):
        for k in range(0, R['attackDice']['maxK'] + 1):
            err = abs(expected(w, k, lv) - target)
            key = (round(err, 6), k, w)
            if best is None or key < best[0]:
                best = (key, w, k)
    return best[1], best[2]

def family_of(e):
    return e['imageFile'].split('/')[0]

assign = json.load(open(sys.argv[1], encoding='utf-8')) if len(sys.argv) > 1 else None

for eid, e in enemies.items():
    if assign is not None:
        a = assign[eid]
        abilities = list(a['abilities'])
        e.pop('weaponImmunity', None)
        if 'weaponImmunity' in abilities:
            # weaponImmunity は能力ではなく、専用の項目で持つ（仕様3章）。幽霊系は通常武器無効。
            abilities.remove('weaponImmunity')
            e['weaponImmunity'] = 'normal'
        e['family'] = family_of(e)
        e['rank'] = a['rank']
        e['boss'] = bool(a['boss'])
        e['abilities'] = abilities
    rk = R['ranks'][str(e['rank'])]
    fam = R['families'][e['family']]
    bh = R['bossHp']
    if e['boss']:
        mul = bh['top'] if eid in bh['topIds'] else (bh['mid'] if e['rank'] <= bh['midMaxRank'] else bh['normal'])
    else:
        mul = 1
    target = rk['attack'] * fam['attack']
    w, k = solve_attack(target, rk['level'])
    ad = R['attackDice']
    stats = {
        'level': rk['level'],
        'hp': round(rk['hp'] * fam['hp'] * mul),
        'attack': {'weight': w, 'dice': {'n': ad['n'], 'm': ad['m'], 'k': k}, 'expected': round(expected(w, k, rk['level']), 1)},
        'exp': rk['exp'],
    }
    if e['boss']:
        stats['hpMul'] = mul
    e['stats'] = stats

with open(ENEMIES_PATH, 'w', encoding='utf-8') as f:
    f.write(json.dumps(enemies, ensure_ascii=False, indent=2) + '\n')
print('updated', len(enemies), 'enemies')
