"""道しるべ（road_sign）の絵を、立て札（signpost.png）から作る。板の英語の文字を消し、世の中に存在しない文字（創作の文字）を、同じ彫りの調子で彫る。矢印は、そのまま残す。
使い方: python3 scripts/images/make_road_sign.py（決定的。乱数は固定）"""
import os
import random
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
SRC = os.path.join(ROOT, 'public', 'images', 'objects', 'signpost.png')
DST = os.path.join(ROOT, 'public', 'images', 'objects', 'road_sign.png')

# 文字を消す範囲（矢印・釘は含めない）と、文字を彫る列（(x 左, x 右, y 上, y 下, 単語ごとの文字数)）
PLANKS = [
    ((86, 612, 150, 226), (96, 604, 160, 214), (3, 5)),
    ((184, 664, 352, 432), (192, 658, 364, 420), (5, 4)),
]


def erase_text(img):
    a = np.asarray(img.convert('RGBA')).astype(np.float32)
    rgb, alpha = a[..., :3], a[..., 3]
    lum = rgb @ np.array([0.299, 0.587, 0.114], np.float32)
    mask = np.zeros(lum.shape, bool)
    for (x0, x1, y0, y1), _, _ in PLANKS:
        med = np.median(lum[y0:y1, x0:x1][alpha[y0:y1, x0:x1] > 200])
        sub = lum[y0:y1, x0:x1] < med * 0.80
        mask[y0:y1, x0:x1] = sub
    # 縁取りも消す（広げる）
    for _ in range(3):
        m = mask.copy()
        m[1:, :] |= mask[:-1, :]; m[:-1, :] |= mask[1:, :]; m[:, 1:] |= mask[:, :-1]; m[:, :-1] |= mask[:, 1:]
        mask = m
    # 拡散で、まわりの板の色で埋める
    fill = rgb.copy()
    known = ~mask
    fill[mask] = 0
    for _ in range(400):
        acc = np.zeros_like(fill); cnt = np.zeros(lum.shape, np.float32)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            sh = np.roll(np.roll(fill, dy, 0), dx, 1); sk = np.roll(np.roll(known, dy, 0), dx, 1)
            acc += sh * sk[..., None]; cnt += sk
        upd = mask & (cnt > 0)
        fill[upd] = acc[upd] / cnt[upd][:, None]
        known = known | upd
    rng = np.random.default_rng(7)
    noise = rng.normal(0, 3.5, lum.shape).astype(np.float32)
    # 板の目: 横方向にのびる細かいゆらぎ
    grain = np.repeat(rng.normal(0, 4.0, (lum.shape[0], 1)).astype(np.float32), lum.shape[1], 1) * 0.6
    out = rgb.copy()
    out[mask] = np.clip(fill[mask] + (noise + grain)[mask][:, None], 0, 255)
    res = np.dstack([out, alpha]).astype(np.uint8)
    return Image.fromarray(res, 'RGBA')


def rune(draw, x, y, w, h, rng, color, width):
    """世の中にない文字: 縦の軸と、はね・かぎ・点を、決まりなく組み合わせた形"""
    pts = [(x + w * i / 2, y + h * j / 3) for j in range(4) for i in range(3)]
    stem = rng.choice([0, 1, 2]); ax = x + w * stem / 2
    draw.line([(ax, y), (ax, y + h)], fill=color, width=width, joint='curve')
    for _ in range(rng.choice([2, 3, 3, 4])):
        p, q = rng.sample(pts, 2)
        if abs(p[0] - q[0]) < 1 and abs(p[1] - q[1]) < 1: continue
        draw.line([p, q], fill=color, width=width)
    if rng.random() < 0.5:   # 点
        px, py = rng.choice(pts)
        draw.ellipse([px - width * 0.7, py - width * 0.7, px + width * 0.7, py + width * 0.7], fill=color)


def carve_runes(img):
    rng = random.Random(20261108)
    W, H = img.size
    dark = Image.new('RGBA', (W, H), (0, 0, 0, 0)); light = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    dd, dl = ImageDraw.Draw(dark), ImageDraw.Draw(light)
    for _, (x0, x1, y0, y1), words in PLANKS:
        n = sum(words); gap = 36; cw = (x1 - x0 - gap * (len(words) - 1)) / n
        h = y1 - y0 - 6; x = x0
        for wi, wn in enumerate(words):
            for _ in range(wn):
                gx, gy, gw = x + 5, y0 + 3, cw - 18
                rune(dd, gx, gy, gw, h, random.Random(rng.random()), (74, 51, 25, 255), 7)       # 彫りの影（濃い茶）
                rune(dl, gx + 2, gy + 3, gw, h, random.Random(rng.random() * 0 + 0.5), (0, 0, 0, 0), 7)   # 予約（未使用）
                x += cw
            x += gap
    # 影の下に、うすい明るい縁（彫りの立体感）
    hl = dark.filter(ImageFilter.MaxFilter(3))
    hl_arr = np.asarray(hl).copy(); hl_arr[..., :3] = (214, 178, 124)
    hl = Image.fromarray(hl_arr, 'RGBA')
    shifted = Image.new('RGBA', (W, H), (0, 0, 0, 0)); shifted.paste(hl, (2, 3))
    base = img.copy()
    base = Image.alpha_composite(base, Image.eval(shifted, lambda v: v))
    base = Image.alpha_composite(base, dark)
    return base


if __name__ == '__main__':
    src = Image.open(SRC).convert('RGBA')
    out = carve_runes(erase_text(src))
    out.save(DST)
    print('保存', DST, out.size)
