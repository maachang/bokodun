"""世界の地形（terrain.py の結果）を、画像にして確認する。使い方: python3 scripts/world/preview.py <terrain.npz> <出力.png>"""
import sys, numpy as np
from PIL import Image, ImageDraw
sys.path.insert(0, __file__.rsplit('/', 1)[0])
from terrain import W, H, GW, GH, MESH, SEA, SNOW, CONIFER, FOREST, GRASS, DESERT, ROCK, TROPICAL
t = np.load(sys.argv[1])
pal = np.array([[40, 90, 170], [235, 240, 250], [60, 110, 90], [40, 100, 40], [150, 200, 80], [225, 200, 120], [130, 100, 70], [60, 190, 120]], np.float32)
img = pal[t['biome']]
elev = t['elev'].astype(np.float32)
shade = 0.65 + 0.35 * (elev / 35.0)[..., None]
img = img * shade
img[t['deep']] = [30, 70, 200]; img[t['shallow']] = [110, 170, 230]
img = img.clip(0, 255).astype(np.uint8)
im = Image.fromarray(img)
d = ImageDraw.Draw(im)
for i in range(GW + 1): d.line([(i * MESH, 0), (i * MESH, H)], fill=(255, 0, 0), width=1)
for j in range(GH + 1): d.line([(0, j * MESH), (W, j * MESH)], fill=(255, 0, 0), width=1)
im.save(sys.argv[2])
# メッシュごとの陸地の数
land = t['land']
n = 0
for j in range(GH):
    for i in range(GW):
        if land[j * MESH:(j + 1) * MESH, i * MESH:(i + 1) * MESH].any(): n += 1
print('陸のあるメッシュ', n)
