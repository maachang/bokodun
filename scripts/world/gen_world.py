#!/usr/bin/env python3
"""
ボコスカ島の世界（20×15 メッシュ。1 メッシュ＝64×64 マス）のマップを、terrain.py の地形から書き出す。
  - 陸のあるメッシュだけ、public/data/maps/w_行_列.json（行・列は 2 桁）を作る。海だけのメッシュは作らない。
  - public/data/world.json の grid を、この世界に置き換える（start は、最初に入るマップ）。
  - 敵・村・町・ダンジョン・ギミックは、作らない（地形だけ）。
  - 毎回、同じ結果になる（乱数は固定の種）。
使い方: python3 scripts/world/gen_world.py
"""
import os, sys, json, glob
from types import SimpleNamespace
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import terrain as T
import town_d as TD
import town_h as TH
import town_e as TE
import town_b as TB
import town_c as TC
import town_i as TI
import town_k as TK
import town_npc_extra as TNX
import town_g as TG
import town_a as TA
import town_f as TF
import castle_f as CF
import guild_g as GG
import temple_b as TPB
import roads
from terrain import W, H, GW, GH, MESH, SEA, SNOW, CONIFER, FOREST, GRASS, DESERT, ROCK, TROPICAL, MINES, MINE_R

from world_consts import BIOME_FLOOR, BIOME_NAME, CH36, DARK_FOREST_ENV, ENV_FROM, FLOOR, HEIGHT_STEP, LEGEND, MAPS, ROAD_SIGNS, ROAD_TOWNS, ROOT, SOLID_CH, START_TOWN, TOWN_HH, TOWN_HW, TOWN_LEGEND_KEYS, TOWN_NAME, TOWN_SIGN_CH, TOWN_SIZE, TROPICAL_ENV, town_gate_tiles   # noqa: F401（世界の生成の定数: パス・凡例・地面の文字・環境・街の名前と大きさ・街道の街（gen_world.py と world_tiles.py が使う））
from world_tiles import _tiles_beach, _tiles_desert, _tiles_forest, _tiles_grass, _tiles_mineEntrances, _tiles_roads, _tiles_rockMines, _tiles_seams, _tiles_snowFoothills, _tiles_towns, _tiles_trails, _tiles_tropical, _tiles_water, _tiles_wetland, build_tiles   # noqa: F401（世界の、マスごとの物体と地面の生成（build_tiles と、地形ごとの段階 _tiles_*）。gen_world.py が呼ぶ）


def mesh_name(row, col, biome_counts, sea_frac, mine=False):
    k = max(biome_counts, key=biome_counts.get)
    base = BIOME_NAME[SEA] if sea_frac > 0.35 else BIOME_NAME[k]
    if mine: base = '炭鉱の山'
    return f'{base} ({row + 1}-{col + 1})'


def write_ids_map(m, path):
    """世界のマップを書く。layout は物体 ID（文字コード）の数値の行の配列・legend のキーは ID の 10 進文字列（layoutFormat 'ids'。public/js/mapFormat.js が読む）"""
    rows = [','.join(str(ord(ch)) for ch in row) for row in m['layout']]
    m = dict(m)
    m['layoutFormat'] = 'ids'
    m['legend'] = {str(ord(k)): v for k, v in m['legend'].items()}
    m['layout'] = [f'@@ROW{i}@@' for i in range(len(rows))]
    text = json.dumps(m, ensure_ascii=False, indent=1)
    for i, r in enumerate(rows): text = text.replace(f'"@@ROW{i}@@"', f'[{r}]', 1)
    open(path, 'w', encoding='utf-8').write(text)


def town_outer_id(site):
    """街の外観がある、外のマップの ID"""
    return f"w_{site['y'] // MESH:02d}_{site['x'] // MESH:02d}"


def town_outer_extras(t, j, i):
    """外のマップ (j, i) にある街の、門の links・衛兵の npcs"""
    links, npcs = {}, []
    for site in t['towns']:
        if site['y'] // MESH != j or site['x'] // MESH != i: continue
        w, h = TOWN_SIZE[site['id']]
        for gx, gy in town_gate_tiles(site):
            links[f"{gx - i * MESH},{gy - j * MESH}"] = {'nextMap': f"town_{site['id']}", 'message': f"{TOWN_NAME[site['id']]}に入る", 'spawn': {'x': w // 2 - 1 + (gx - (site['x'] - 1)), 'z': h - 3, 'angle': 0}}
        gy = site['y'] + TOWN_HH   # 壁のすぐ外（門と同じ並び）
        pair = {'f': (('beast_soldier_kobold_gate', -2), ('beast_soldier_kobold', 1)), 'g': (('elf_soldier_golem', -2), ('elf_gate_guard_woman', 1)), 'c': (('desert_gate_guard', -2), ('desert_gate_guard', 1)), 'a': (('snow_gate_guard', -2), ('snow_gate_guard', 1)), 'k': (('samurai_gate_k', -2), ('samurai_k', 1))}.get(site['id'], (('guard_spear', -2), ('guard_light', 1)))   # F の兵士は、コボルト。G の兵士は、エルフの守備隊とウッドゴーレム
        for k, (nid, dx) in enumerate(pair):   # 門 2 マス（x-1, x）のすぐ両隣
            npcs.append({'id': nid, 'x': site['x'] + dx - i * MESH, 'z': gy - j * MESH})
    return links, npcs


def town_layout(w, h):
    """街の中（枠だけ）。外壁・南の門・大通り・広場と噴水・家の並び（入口なし）。歩ける所は、すべてつながる"""
    g = [['p'] * w for _ in range(h)]
    cx, cy = w // 2, h // 2
    block = np.zeros((h, w), bool)                                  # 家を置かない所（道・広場）
    for y in range(1, h - 1):
        for x in range(cx - 2, cx + 2): g[y][x] = '='; block[y][x] = True       # 大通り（南北）
    for y in range(cy - 1, cy + 2):
        for x in range(1, w - 1): g[y][x] = '='; block[y][x] = True             # 大通り（東西）
    for y in range(cy - 4, cy + 4):
        for x in range(cx - 6, cx + 6): g[y][x] = 'p'; block[y][x] = True       # 広場
    g[cy - 1][cx - 1] = g[cy - 1][cx] = g[cy][cx - 1] = g[cy][cx] = 'F'         # 噴水（2×2）
    for x in range(w): g[0][x] = 'W'; g[h - 1][x] = 'W'
    for y in range(h): g[y][0] = 'W'; g[y][w - 1] = 'W'
    g[h - 1][cx - 1] = g[h - 1][cx] = 'G'
    bx = 2
    while bx + 4 <= w - 2:
        by = 2
        while by + 3 <= h - 2:
            if not block[max(0, by - 1):by + 4, max(0, bx - 1):bx + 5].any():
                for y in range(by, by + 3):
                    for x in range(bx, bx + 4): g[y][x] = 'H'
            by += 4
        bx += 5
    for x, y in ((2, h - 3), (w - 3, h - 3), (2, cy + 3), (w - 3, cy + 3), (cx - 4, cy + 3), (cx + 3, cy + 3)):
        if g[y][x] == 'p': g[y][x] = 'T'
    for x in (cx - 5, cx + 4):
        for y in (cy - 3, cy + 2):
            if g[y][x] == 'p': g[y][x] = 'f'
    return [''.join(r) for r in g]


def gen_towns(t, city_legend, env, snow_env, desert_env):
    """街の中のマップ（town_a〜town_h）を書く"""
    for site in t['towns']:
        w, h = TOWN_SIZE[site['id']]
        layout = town_layout(w, h)
        oid = town_outer_id(site)
        links = {}
        for gx, gy in town_gate_tiles(site):
            links[f"{w // 2 - 1 + (gx - (site['x'] - 1))},{h - 1}"] = {'nextMap': oid, 'message': f"{TOWN_NAME[site['id']]}の外へ",
                'spawn': {'x': gx - (site['x'] // MESH) * MESH, 'z': gy + 2 - (site['y'] // MESH) * MESH, 'angle': 3.14159}}
        m = {'id': f"town_{site['id']}", 'name': TOWN_NAME[site['id']], 'type': 'open', 'tileSize': 4, 'wallHeight': 4,
             'spawn': {'x': w // 2, 'z': h - 3, 'angle': 0}, 'environment': env, 'decorFloor': 'cobblestone', 'enemies': {},
             'legend': {k: city_legend[k] for k in TOWN_LEGEND_KEYS}, 'layout': layout, 'npcs': [], 'links': links,
             'heights': ['0' * w for _ in range(h)], 'heightStep': 0.5}
        if site['id'] == 'a':   # A（雪国）: 城塞と環状の通り（town_a.build）。雪の見た目・雪の環境
            m['layout'], m['heights'] = TA.build(w, h, m['legend'], city_legend, m['links'], m['npcs'])
            m['environment'] = dict(snow_env, floorType='snow', fogNear=24, fogFar=72); m['decorFloor'] = 'snowCobble'   # 雪の環境（霧は、街が見えるよう薄め）
        elif site['id'] == 'g':   # G（大森林の中心のエルフの街）: D と同じ作り（town_d.build_g）。森の環境（霧は、街が見えるよう薄め）
            m['layout'], m['heights'] = TG.build(w, h, m['legend'], city_legend, m['links'], m['npcs'])
            m['environment'] = dict(DARK_FOREST_ENV, floorType='forest', fogNear=22, fogFar=66, ambientLight=0x6f8f76); m['decorFloor'] = 'forestGround'
        elif site['id'] == 'j':   # J（大森林の前の魔導国）: D と同じ作り（town_d.build_j）。森の環境（霧は、街が見えるよう薄め）
            m['layout'], m['heights'] = TD.build_j(w, h, m['legend'], city_legend, m['links'], m['npcs'])
            m['environment'] = dict(DARK_FOREST_ENV, floorType='forest', fogNear=22, fogFar=66, ambientLight=0x6f8f76); m['decorFloor'] = 'forestGround'
        elif site['id'] == 'k':   # K（マカヒキ島の江戸風の国）: D と同じ作り（town_k.build_k）。渡し場・江戸風の見た目
            m['layout'], m['heights'] = TK.build_k(w, h, m['legend'], city_legend, m['links'], m['npcs'])
        elif site['id'] == 'f':   # F（山の麓の獣人とドワーフの街）: 段々の斜面（town_f.build）
            m['layout'], m['heights'] = TF.build(w, h, m['legend'], city_legend, m['links'], m['npcs'])
        elif site['id'] in ('d', 'h', 'e', 'b', 'c', 'i'):   # D（最初の街）・H・E（大きな港）は、施設・街の人・高低・川（港）を置く（scripts/world/town_d.py・town_h.py・town_e.py）
            m['layout'], m['heights'] = {'d': TD, 'h': TH, 'e': TE, 'b': TB, 'c': TC, 'i': TI}[site['id']].build(w, h, m['legend'], city_legend, m['links'], m['npcs'])
        if site['id'] == 'c':   # C（砂漠の自由都市）: 砂漠の環境（霧は、街が見えるよう薄め）・砂の地面
            m['environment'] = dict(desert_env, floorType='desert', fogNear=24, fogFar=72); m['decorFloor'] = 'packedEarth'
        TNX.add(site['id'], m['npcs'])   # 国力のランクに合わせた、通りの人の追加（town_npc_extra.py）
        json.dump(m, open(os.path.join(MAPS, m['id'] + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    for gm in GG.build():   # G のギルド（ギルド長は長老の一族）
        json.dump(gm, open(os.path.join(MAPS, gm['id'] + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    for cm in CF.build_others() + [TPB.build(), CF.build_mansion_c(), CF.build_mansion_e(), CF.build_mansion_i()]:   # 国ごとの城（A 帝王・B 愚王・G 女王）と B の大教会（教皇）
        json.dump(cm, open(os.path.join(MAPS, cm['id'] + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    cf = CF.build()   # F の小さな王城（獣王・フェンリル像）
    json.dump(cf, open(os.path.join(MAPS, cf['id'] + '.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)


def main():
    t = T.build()
    obj, floor, elev = build_tiles(t)
    land, biome = t['land'], t['biome']
    envs = {}
    for b, f in ENV_FROM.items():
        envs[b] = json.load(open(os.path.join(MAPS, f + '.json'), encoding='utf-8'))['environment']
    # 古い生成結果を消す
    for f in glob.glob(os.path.join(MAPS, 'w_*.json')): os.remove(f)
    grid = [[None] * GW for _ in range(GH)]
    info = {}
    for j in range(GH):
        for i in range(GW):
            ys, xs = slice(j * MESH, (j + 1) * MESH), slice(i * MESH, (i + 1) * MESH)
            L = land[ys, xs]
            if not L.any(): continue
            o = obj[ys, xs].copy(); fl = floor[ys, xs]; el = elev[ys, xs]; bm = biome[ys, xs]
            # 端のマスも、そのまま（端を越えたとき、隣のマップの木・岩に重なったら、エンジン（pushPlayerOutOfWalls）が、近くの空きへ出す）
            counts = {b: int(((bm == b) & L).sum()) for b in (SNOW, CONIFER, FOREST, GRASS, DESERT, ROCK, TROPICAL)}
            dom = max(counts, key=counts.get)
            sea_frac = float((~L).mean())
            floor_counts = {}
            for ch in 'gsfdrwuima': floor_counts[ch] = int(((fl == ord(ch)) & L).sum())
            base_ch = max(floor_counts, key=floor_counts.get)
            env = dict(envs[SEA if sea_frac > 0.35 else dom])
            env['floorType'] = FLOOR[base_ch]
            foot_frac = float((np.isin(bm, [SNOW, CONIFER]) & L & (el < 12)).sum()) / max(1, int(L.sum()))
            if dom in (SNOW, CONIFER) and foot_frac > 0.5:
                env = dict(envs[CONIFER]); env['floorType'] = FLOOR[base_ch]   # 裾野: ツンドラの環境
            if dom == TROPICAL:
                env.update(TROPICAL_ENV)
            if not sea_frac > 0.35 and dom == FOREST:
                env.update(DARK_FOREST_ENV)   # 大森林: だいぶ薄暗い（大湿原より、少し暗い。近くは見え、遠くは霧に沈む）
            layout = [''.join(chr(v) for v in row) for row in o]   # 以降は 1 文字で扱い、書き出すときに物体 ID（文字コード）の数値の配列にする
            heights = [''.join(CH36[min(35, int(v))] for v in row) for row in el]
            floor_layer = [''.join(chr(v) for v in row) for row in fl]
            used = set(''.join(layout)) - {'0'}
            legend = {k: LEGEND[k] for k in sorted(used) if k != TOWN_SIGN_CH}
            for site in t['towns']:
                if TOWN_SIGN_CH in used and town_outer_id(site) == f'w_{j:02d}_{i:02d}': legend[TOWN_SIGN_CH] = f"town_sign_{site['id']}"
                if site['id'] == 'a' and town_outer_id(site) == f'w_{j:02d}_{i:02d}':   # A（雪国）の外観: 雪をかぶった屋根・雪の積もった門前の石畳
                    if '8' in legend: legend['8'] = 'brick_house_snow'
                    if '9' in legend: legend['9'] = 'plaza_stone_snow'
                if site['id'] == 'g' and town_outer_id(site) == f'w_{j:02d}_{i:02d}':   # G（森の街）の外観: 木の壁・木造の家・森の地面
                    if '6' in legend: legend['6'] = 'wooden_wall'
                    if '8' in legend: legend['8'] = 'wooden_house'
                    if '9' in legend: legend['9'] = 'plaza_forest'
                if site['id'] == 'b' and town_outer_id(site) == f'w_{j:02d}_{i:02d}':   # B（フランケル聖国）の外観: 白亜の壁・白い家（青い屋根）
                    if '6' in legend: legend['6'] = 'white_wall'
                    if '8' in legend: legend['8'] = 'white_house'
                if site['id'] == 'k' and town_outer_id(site) == f'w_{j:02d}_{i:02d}': legend.update({k: v for k, v in (('6', 'edo_wall'), ('8', 'edo_house')) if k in legend})   # K（マカヒキ国）の外観: 白い漆喰の壁・町家
                if site['id'] == 'c' and town_outer_id(site) == f'w_{j:02d}_{i:02d}':   # C（砂漠の自由都市）の外観: 中東風の家
                    if '6' in legend: legend['6'] = 'adobe_wall'   # 街の壁も土壁
                    if '8' in legend: legend['8'] = 'mideast_house'
                    if '9' in legend: legend['9'] = 'plaza_earth'   # 門前も土
            mid = f'w_{j:02d}_{i:02d}'
            # 出現位置: 中央に近い、歩ける陸のマス
            solid = set(SOLID_CH) | set('QO')
            cy, cx = MESH // 2, MESH // 2
            best = None
            for r in range(MESH):
                for c in range(MESH):
                    if not L[r, c] or chr(o[r, c]) in solid or chr(o[r, c]) in 'qgZ': continue
                    d = (r - cy) ** 2 + (c - cx) ** 2
                    if best is None or d < best[0]: best = (d, r, c)
            spawn = {'x': best[2], 'z': best[1], 'angle': 0} if best else {'x': 32, 'z': 32, 'angle': 0}
            # 最初の街（D・グリーン王国）がある外のマップは、出現位置を門の前（南へ 4 マス・北向き）にする
            for site in t['towns']:
                if site['id'] == START_TOWN and town_outer_id(site) == f'w_{j:02d}_{i:02d}':
                    spawn = {'x': site['x'] - 1 - i * MESH, 'z': site['y'] + TOWN_HH - 1 + 4 - j * MESH, 'angle': 0}
            m_under = t['bridge_under'].get((j, i))
            m = {
                'id': mid, 'name': mesh_name(j, i, counts, sea_frac, any(ch in ('E', '3', '4', '5', 't') for ch in set(''.join(layout)))), 'type': 'open', 'tileSize': 4, 'wallHeight': 4,
                'spawn': spawn, 'environment': env, 'legend': legend, 'enemies': {},
                'heightStep': HEIGHT_STEP, 'sideShade': 1.0, 'heights': heights,
                'floorLegend': {k: FLOOR[k] for k in sorted(set(''.join(floor_layer)))}, 'floorLayer': floor_layer,
                'layout': layout,
            }
            if m_under is not None: m['bridgeUnder'] = int(m_under)
            signs = {f'{x - i * MESH},{y - j * MESH}': msg for (y, x), msg in ROAD_SIGNS.items() if y // MESH == j and x // MESH == i}
            if signs: m['signs'] = signs   # 街道の道しるべ（マスごとの立て札の文章）
            tl, tn = town_outer_extras(t, j, i)
            if tl: m['links'] = tl; m['npcs'] = tn
            write_ids_map(m, os.path.join(MAPS, mid + '.json'))
            grid[j][i] = mid
            info[mid] = dict(row=j, col=i, dom=dom, sea=sea_frac, grass=counts[GRASS] / max(1, int(L.sum())), land=int(L.sum()))
    city = json.load(open(os.path.join(MAPS, 'city.json'), encoding='utf-8'))
    gen_towns(t, city['legend'], city['environment'], envs[SNOW], envs[DESERT])
    # 最初のマップ: 島の中心に近く、ほとんどが陸で、草原が多いメッシュ
    # ゲーム開始は、最初の街（START_TOWN）の門の前。その街の外のマップを start にする
    start = town_outer_id(next(site for site in t['towns'] if site['id'] == START_TOWN))
    json.dump({'mapSize': MESH, 'start': start, 'arenas': [[a, b, c] for a, b, c in t['arenas']], 'grid': grid}, open(os.path.join(ROOT, 'public', 'data', 'world.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    print('マップ数', len(info), 'start', start)
    import subprocess; subprocess.run([sys.executable, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'world_map_image.py')], check=True)   # 世界全体の 1 枚の地図（道の確認用）


if __name__ == '__main__':
    main()
