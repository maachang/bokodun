"""生成した 1 枚のマップ（w_行_列）を、上から見た図にする。使い方: python3 scripts/world/mesh_preview.py <出力.png> <マップID...>"""
import sys, json, os
from PIL import Image, ImageDraw
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FLOOR = {'grass': (86, 130, 60), 'snow': (232, 238, 246), 'forest': (50, 84, 46), 'desert': (214, 190, 130), 'rock': (122, 112, 102), 'whiteSand': (240, 232, 200), 'tundra': (120, 128, 96), 'ice': (170, 215, 240), 'redEarth': (176, 96, 60), 'ash': (60, 56, 56), 'darkRock': (60, 62, 68)}
OBJ = {'W': (10, 40, 15), 'K': (14, 52, 22), 'T': (40, 120, 50), 'V': (60, 130, 70), 'F': (20, 70, 20), 'C': (40, 90, 70), 'N': (70, 100, 80), 'P': (30, 80, 60), 'D': (20, 50, 30), 'G': (50, 110, 40), 'A': (60, 140, 60), 'X': (110, 80, 50), 'U': (80, 150, 80), 'M': (30, 160, 60), 'Y': (20, 140, 50),
       'c': (70, 70, 74), 'E': (250, 200, 60), 't': (250, 120, 40), 'Q': (30, 70, 200), 'q': (120, 180, 235), 'O': (20, 40, 130)}
ids = sys.argv[2:]
S = 8
out = Image.new('RGB', (64 * S * len(ids) + 4 * (len(ids) - 1), 64 * S), (0, 0, 0))
for n, mid in enumerate(ids):
    m = json.load(open(os.path.join(ROOT, 'public/data/maps', mid + '.json'), encoding='utf-8'))
    im = Image.new('RGB', (64 * S, 64 * S)); d = ImageDraw.Draw(im)
    for r in range(64):
        for c in range(64):
            f = FLOOR.get(m['floorLegend'][m['floorLayer'][r][c]], (90, 90, 90))
            h = int(m['heights'][r][c], 36)
            k = 0.7 + 0.3 * min(1, h / 20)
            col = tuple(int(v * k) for v in f)
            ch = m['layout'][r][c]
            if ch in OBJ: col = OBJ[ch]
            d.rectangle([c * S, r * S, c * S + S - 1, r * S + S - 1], fill=col)
    out.paste(im, (n * (64 * S + 4), 0))
out.save(sys.argv[1])
