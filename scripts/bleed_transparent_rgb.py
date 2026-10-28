#!/usr/bin/env python3
"""
bleed_transparent_rgb.py

透過PNGの「完全透明（alpha=0）画素」の RGB を、最も近い不透明画素の色で埋めるツール。
背景除去後も透明部にマゼンタ等の背景色が RGB として残っていると、
遠景の縮小（ミップマップ・線形補間）で輪郭に混ざって色の縁が出るため、その防止用。
不透明・半透明の画素は一切変更しない（アルファ値も不変なので、見た目は変わらない）。

使い方: python3 scripts/bleed_transparent_rgb.py a.png b.png ...
"""
import sys
import numpy as np
from PIL import Image


def bleed(arr):
    """arr: (h, w, 4) uint8。alpha=0 画素の RGB を近傍の不透明画素色で埋めた配列を返す。"""
    out = arr.copy()
    filled = out[:, :, 3] > 0
    if not filled.any():
        return out
    while not filled.all():
        # 4近傍のうち、色が確定している画素から1画素ぶん外側へ広げる
        new = np.zeros_like(filled)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            sh = np.roll(filled, (dy, dx), axis=(0, 1))
            if dy == 1: sh[0, :] = False
            if dy == -1: sh[-1, :] = False
            if dx == 1: sh[:, 0] = False
            if dx == -1: sh[:, -1] = False
            src = np.roll(out, (dy, dx), axis=(0, 1))
            m = sh & ~filled & ~new
            out[m, :3] = src[m, :3]
            new |= m
        if not new.any():
            break
        filled |= new
    return out


def main():
    for path in sys.argv[1:]:
        im = Image.open(path).convert("RGBA")
        arr = np.array(im)
        res = bleed(arr)
        assert (res[:, :, 3] == arr[:, :, 3]).all()
        assert (res[arr[:, :, 3] > 0] == arr[arr[:, :, 3] > 0]).all()
        Image.fromarray(res).save(path, format="PNG")
        t = arr[:, :, 3] == 0
        print(f"{path}: 透明部 {int(t.sum())} 画素の色を埋めた")


if __name__ == "__main__":
    main()
