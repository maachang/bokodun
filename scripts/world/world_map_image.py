"""世界全体を、1 枚の画像にする（広大なマップの、道の確認用）。
使い方: python3 scripts/world/world_map_image.py [1 マスのピクセル数（既定 3）] [出力.png]
読むもの: public/data/maps/w_行_列.json（生成済みの外のマップ）・objects.json・world_roads.json。書くもの: public/images/world_map.png（既定）
色: 地面の種類（高さで陰影）・木は暗く・水と海・石畳の道は明るく太く・石の橋はオレンジ・街の壁と家は赤茶。メッシュの境目の薄い線と「(行-列)」（ゲーム内のマップ名と同じ 1 始まり）・街の印と名前・道しるべ（点）"""
import os, sys, json
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MAPS = os.path.join(ROOT, 'public', 'data', 'maps')
MESH, GW, GH = 64, 20, 15
FLOOR = {'grass': (86, 130, 60), 'snow': (232, 238, 246), 'forest': (50, 84, 46), 'desert': (214, 190, 130), 'rock': (122, 112, 102), 'whiteSand': (240, 232, 200), 'tundra': (120, 128, 96), 'ice': (170, 215, 240), 'redEarth': (176, 96, 60), 'ash': (60, 56, 56), 'darkRock': (60, 62, 68)}
SEA_C, DEEP_C, SHALLOW_C = (20, 50, 130), (30, 70, 200), (110, 170, 230)
ROAD_C, BRIDGE_C, PLANK_C, TOWN_C = (250, 240, 200), (255, 150, 30), (140, 100, 60), (170, 70, 60)
TOWN_NAME = {'a': 'A キュラビッド帝国', 'b': 'B フランケル聖国', 'c': 'C ミレニアム自由都市', 'd': 'D グリーン王国', 'e': 'E ガリレオ連盟', 'f': 'F ライアン獣王国', 'g': 'G デイラミ精霊国', 'h': 'H ダマスカス自治領', 'i': 'I カナロア公国'}
FONTS = ['/home/maachang/.fonts/Fonts/YuGothL.ttc', '/home/maachang/.fonts/msjhl.ttc']


def font(size):
    for f in FONTS:
        if os.path.exists(f):
            try: return ImageFont.truetype(f, size)
            except Exception: pass
    return ImageFont.load_default()


def mesh_pixels(m, objs):
    """1 つのマップ（64×64 マス）の色（64×64×3）と、道・橋の印（64×64 の整数: 1 道・2 石橋）"""
    legend = {chr(int(k)): v for k, v in m['legend'].items()} if m.get('layoutFormat') == 'ids' else m['legend']
    rows = [''.join(chr(i) for i in r) for r in m['layout']] if m.get('layoutFormat') == 'ids' else m['layout']
    fl = m.get('floorLegend', {}); dflt = m['environment'].get('floorType', 'grass')
    heights = [[int(ch, 36) for ch in row] for row in m['heights']] if m.get('heights') else None
    img = np.zeros((MESH, MESH, 3), np.float32); mark = np.zeros((MESH, MESH), np.int8)
    for r in range(MESH):
        for c in range(MESH):
            ft = fl.get(m['floorLayer'][r][c], dflt) if m.get('floorLayer') else dflt
            col = np.array(FLOOR.get(ft, (86, 130, 60)), np.float32)
            if heights: col = col * (0.72 + 0.04 * min(7, heights[r][c]))
            name = legend.get(rows[r][c]) if rows[r][c] != '0' else None
            if name:
                typ = objs.get(name, {}).get('type')
                if name == 'sea': col = np.array(SEA_C, np.float32)
                elif name == 'water': col = np.array(DEEP_C, np.float32)
                elif name == 'water_shallow': col = np.array(SHALLOW_C, np.float32)
                elif name == 'paved_road' or name == 'paved_road_snow': col = np.array(ROAD_C, np.float32); mark[r, c] = 1
                elif name == 'stone_bridge': col = np.array(BRIDGE_C, np.float32); mark[r, c] = 2
                elif name in ('plank_bridge', 'rope_bridge'): col = np.array(PLANK_C, np.float32)
                elif name in ('city_wall', 'brick_house', 'district_gate', 'plaza_stone') or name.startswith('brick_house'): col = np.array(TOWN_C, np.float32)
                elif typ in ('tree', 'tree_wall'): col = col * 0.62
                elif typ in ('boulder',) or name in ('cliff_rock_wall',): col = col * 0.8
            img[r, c] = col
    return np.clip(img, 0, 255), mark


def main():
    px = int(sys.argv[1]) if len(sys.argv) > 1 else 3
    out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, 'public', 'images', 'world_map.png')
    objs = json.load(open(os.path.join(ROOT, 'public', 'data', 'objects.json')))
    W, H = GW * MESH, GH * MESH
    full = np.zeros((H, W, 3), np.float32); full[:] = SEA_C; mark = np.zeros((H, W), np.int8)
    n = 0
    for j in range(GH):
        for i in range(GW):
            f = os.path.join(MAPS, f'w_{j:02d}_{i:02d}.json')
            if not os.path.exists(f): continue
            img, mk = mesh_pixels(json.load(open(f)), objs)
            full[j * MESH:(j + 1) * MESH, i * MESH:(i + 1) * MESH] = img; mark[j * MESH:(j + 1) * MESH, i * MESH:(i + 1) * MESH] = mk; n += 1
    big = np.repeat(np.repeat(full, px, axis=0), px, axis=1).astype(np.uint8)
    # 道・橋は、見やすいよう、1 マス分ふくらませる（細くなる 3 ピクセルでも見える）
    im = Image.fromarray(big); d = ImageDraw.Draw(im, 'RGBA')
    ys, xs = np.nonzero(mark)
    for y, x in zip(ys, xs):
        d.rectangle([x * px - 1, y * px - 1, (x + 1) * px, (y + 1) * px], fill=(ROAD_C if mark[y, x] == 1 else BRIDGE_C) + (255,))
    ft = font(max(10, px * 4))
    for j in range(GH + 1): d.line([0, j * MESH * px, W * px, j * MESH * px], fill=(255, 255, 255, 40))
    for i in range(GW + 1): d.line([i * MESH * px, 0, i * MESH * px, H * px], fill=(255, 255, 255, 40))
    for j in range(GH):
        for i in range(GW): d.text((i * MESH * px + 3, j * MESH * px + 2), f'({j + 1}-{i + 1})', fill=(255, 255, 255, 150), font=ft)
    rd = json.load(open(os.path.join(ROOT, 'public', 'data', 'world_roads.json')))
    big_ft = font(max(18, px * 8))
    for k, info in rd['towns'].items():
        gy, gx = info['gate']; cx, cy = gx * px, gy * px
        d.ellipse([cx - px * 5, cy - px * 5, cx + px * 5, cy + px * 5], outline=(255, 40, 40, 255), width=3)
        d.text((cx + px * 7, cy - px * 4), TOWN_NAME.get(k, k), fill=(255, 255, 255, 255), font=big_ft, stroke_width=2, stroke_fill=(0, 0, 0, 255))
        if info.get('partial'):
            ey, ex = info['end']; d.ellipse([ex * px - 6, ey * px - 6, ex * px + 6, ey * px + 6], fill=(255, 0, 255, 255))
    for s in rd.get('signs', []):
        sy, sx = s['pos']; d.ellipse([sx * px - 3, sy * px - 3, sx * px + 3, sy * px + 3], fill=(60, 255, 60, 255))
    os.makedirs(os.path.dirname(out), exist_ok=True)
    im.save(out, optimize=True)
    print(f'世界の地図: {out}（{im.size[0]}×{im.size[1]}・マップ {n} 枚・{os.path.getsize(out) // 1024}KB）')


if __name__ == '__main__':
    main()
