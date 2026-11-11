"""街の屋台（庶民の食事・買い物の露店）と、屋台の前の賑わい（2026-11-11。ユーザー指示「屋台を増やして、人が賑わっている風景に」）。
  屋台は、city の市場と同じ部品（market_stall_red/blue/green/yellow）。台の奥（北）に商人、台の前（南）に客を置く。
  位置は、街の中心に近い、歩ける広い所から機械的に選ぶ。通りを塞がない（歩ける所が、置く前と同じにつながる）・出入口・既存の NPC・段差の所は避ける。
  貴族・国の代表は置かない（売り子・客は、一般の住民・商人・子供）。置く街と数は COUNT（街ごと。変更は指示で）
"""
STALL_CH = ('1', '2', '3', '4')
COUNT = {'k': 8, 'k1': 6, 'e': 8, 'a': 6, 'i': 6}   # H は、街の人 5〜8 人の決め（小さな辺境の街）なので置かない。c は、すでに屋台がある（見た目だけ KIND で替える）
EDO = ('stall_edo_soba', 'stall_edo_tempura', 'stall_edo_sushi', 'stall_edo_dango')
PORT = ('stall_port_fish', 'stall_port_grill', 'stall_port_shell', 'stall_port_fruit')
SNOW = ('stall_snow_pirozhki', 'stall_snow_kvass', 'stall_snow_blini', 'stall_snow_tea')
BAZAAR = ('stall_bazaar_spice', 'stall_bazaar_carpet', 'stall_bazaar_sweets', 'stall_bazaar_kebab')
KIND = {'k': EDO, 'k1': EDO, 'e': PORT, 'i': PORT, 'a': SNOW, 'c': BAZAAR, 'h': BAZAAR}   # 街ごとの屋台の見た目（文字 1〜4 の順。stall_kinds.py）
VENDORS = {'k': ['merchant_man_k', 'merchant_woman_k', 'merchant_old_k'], 'k1': ['merchant_man_k', 'merchant_woman_k', 'merchant_old_k'],
           'e': ['merchant_man', 'traveler_merchant', 'merchant_woman'], 'a': ['snow_man', 'snow_woman', 'snow_old_woman'],
           'h': ['junior_merchant_man', 'town_man', 'town_middle_man'], 'i': ['merchant_woman', 'merchant_man', 'junior_merchant_woman']}
CUSTOMERS = {'k': ['machi_man_k', 'machi_woman_k', 'child_boy_k', 'child_girl_k'], 'k1': ['machi_man_k', 'machi_woman_k', 'child_boy_k', 'child_girl_k', 'fisherman_k'],
             'e': ['town_man', 'town_woman', 'town_girl', 'child_boy', 'town_middle_woman', 'town_old_woman'],
             'a': ['snow_boy', 'snow_girl', 'snow_man', 'snow_old_man', 'snow_woman'], 'h': ['town_man', 'town_woman', 'child_boy', 'town_middle_man'],
             'i': ['town_girl', 'town_man', 'child_girl', 'town_middle_woman', 'town_old_woman', 'town_woman']}
WALK = 'p='


def _reach(g, w, h, starts):
    seen = set(starts); q = list(starts)
    while q:
        x, y = q.pop()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and (nx, ny) not in seen and g[ny][nx] in WALK: seen.add((nx, ny)); q.append((nx, ny))
    return seen


def add(site_id, m, city_legend):
    """街のマップ m（layout・npcs・legend）に、屋台と売り子・客を足す。対象外の街は、何もしない"""
    if site_id == 'c':   # C は、屋台が最初からある。見た目だけ、スークの屋台に替える
        for ch, name in zip(STALL_CH, KIND['c']): m['legend'][ch] = name
        return
    n = COUNT.get(site_id, 0)
    if not n: return
    g = [list(r) for r in m['layout']]; h, w = len(g), len(g[0])
    used = {c for r in g for c in r} | set(m['legend'])
    assert not (used & set(STALL_CH)), f'{site_id}: 屋台の文字が、すでに使われている'
    blocked = {tuple(map(int, k.split(','))) for k in m['links']} | {(q['x'], q['z']) for q in m['npcs']}
    sp = m.get('spawn')
    if sp: blocked.add((int(sp['x']), int(sp['z'])))
    for bx, bz in list(blocked):   # 出入口・NPC のまわり 1 マスは避ける
        blocked |= {(bx + dx, bz + dz) for dx in range(-1, 2) for dz in range(-1, 2)}
    starts = [p for p in ((int(k.split(',')[0]), int(k.split(',')[1])) for k in m['links']) if 0 <= p[1] < h and g[p[1]][p[0]] in WALK]
    starts = starts or [next((x, y) for y in range(h) for x in range(w) if g[y][x] in WALK)]
    base = _reach(g, w, h, starts)
    cx, cz = w / 2, h / 2
    cand = sorted(((x, y) for y in range(2, h - 2) for x in range(2, w - 2) if g[y][x] in WALK), key=lambda p: (not (g[p[1]][p[0] - 1] not in WALK or g[p[1]][p[0] + 1] not in WALK), (p[0] - cx) ** 2 + 2 * (p[1] - cz) ** 2))   # 建物沿い（通りの端）を先に。通りの真ん中を塞がない
    hs = m.get('heights')
    lv = (lambda x, y: int(hs[y][x], 36)) if hs else (lambda x, y: 0)
    placed = []
    for x, y in cand:
        if len(placed) >= n: break
        col = [(x, y - 1), (x, y), (x, y + 1)]
        if any(c in blocked for c in col) or any(g[cy][cx2] not in WALK for cx2, cy in col): continue
        if any(abs(x - px) < 3 and abs(y - py) < 3 for px, py in placed): continue
        if any(abs(lv(*a) - lv(*b)) > 1 for a, b in zip(col, col[1:])): continue   # 段差が 2 以上の所は避ける
        old = g[y][x]; g[y][x] = STALL_CH[len(placed) % 4]
        if _reach(g, w, h, starts) != base - {(x, y)}: g[y][x] = old; continue
        base = base - {(x, y)}; placed.append((x, y))
    assert len(placed) == n, f'{site_id}: 屋台を {n} 軒置けない（{len(placed)} 軒）'
    for i, (x, y) in enumerate(placed):
        m['npcs'].append({'id': VENDORS[site_id][i % len(VENDORS[site_id])], 'x': x, 'z': y - 1})
        for j in range(1 + i % 2):   # 客は 1〜2 人（台の前。2 人目は、その隣）
            cxp = x + j
            if g[y + 1][cxp] in WALK and not any(q['x'] == cxp and q['z'] == y + 1 for q in m['npcs']):
                m['npcs'].append({'id': CUSTOMERS[site_id][(i * 2 + j) % len(CUSTOMERS[site_id])], 'x': cxp, 'z': y + 1})
    for ch, name in zip(STALL_CH, KIND[site_id]): m['legend'][ch] = name
    m['layout'] = [''.join(r) for r in g]
