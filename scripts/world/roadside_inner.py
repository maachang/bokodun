#!/usr/bin/env python3
"""道沿いの村・町・宿場の中のマップ（rs_番号）だけを、public/data/world_roadside.json から書き直す（世界全体の生成（約 10 分）をせずに、中の直しを確かめる）。
使い方: python3 scripts/world/roadside_inner.py"""
import os, sys, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import roadside as RS
from world_consts import MAPS

snow_env = json.load(open(os.path.join(MAPS, 'field_snow.json'), encoding='utf-8'))['environment']
sites = json.load(open(os.path.join(MAPS, '..', 'world_roadside.json'), encoding='utf-8'))['sites']
for p in sites:
    m = RS.build_inner(p, {}, snow_env)
    json.dump(m, open(os.path.join(MAPS, m['id'] + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('書き直した:', len(sites))
