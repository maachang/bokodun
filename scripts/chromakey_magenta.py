#!/usr/bin/env python3
"""
chromakey_magenta.py

AI生成画像（マゼンタ背景）専用の統合・標準マルチステージ自動透過・デフリンジ・自動クロップツール

【標準パイプライン設計（Standard Pipeline）】
Stage 1: 全外周ペリメーター（4辺）からの動的カラーサンプリング
         - 四隅だけでなく、外周全体から局所背景色を取得し、ライティンググラデーション（左右・上下の濃淡）に完全対応。
Stage 2: キャラクター部位の厳密な保護
         - 黒色・暗色ディテール（主線、黒皮、漆黒の体躯）の保護。
         - 中立・ハイライト部および固有色（緑、黄など）の保護。
Stage 3: 背景色距離 & 連結性による背景判定
         - 外周境界から背景色に近い連結領域のみフラッドフィル透過（紫・ピンク等の体色は巻き込まない）
         - 翅や脚・触角で囲まれた内部孤立空間は、背景色にほぼ一致する連結成分のみ透過
Stage 4: 接地影・マゼンタ床影の消去（画像高さ比例の足元領域かつ背景に連結する影のみ）
Stage 5: キャラクター外縁のデフリンジ（マゼンタ色にじみのみを自然なトーンへ中立化。本体の体色は維持）
Stage 6: 接地・画像サイズに合わせた自動バウンディングボックス・クロップ（透明余白の除去）
"""

import sys
import os
import argparse
import numpy as np
from PIL import Image, ImageFilter
from collections import deque

class MagentaChromaKeyer:
    def __init__(self, tolerance=48.0, defringe_width=2, strict_tolerance=32.0, min_island_area=12, shadow_dist=60.0, grad_tolerance=8.0, grow_tolerance_scale=1.5, pool_min_area=600, edge_tolerance=30.0, row_tolerance=56.0):
        self.tolerance = tolerance
        self.defringe_width = defringe_width
        self.strict_tolerance = strict_tolerance
        self.min_island_area = min_island_area
        self.shadow_dist = shadow_dist
        self.grad_tolerance = grad_tolerance
        self.grow_tolerance_scale = grow_tolerance_scale
        self.pool_min_area = pool_min_area
        self.edge_tolerance = edge_tolerance
        self.row_tolerance = row_tolerance

    def process(self, src_path, dest_path=None, crop_bottom=True):
        if not os.path.exists(src_path):
            raise FileNotFoundError(f"Source file not found: {src_path}")
        
        if dest_path is None:
            dest_path = src_path

        img = Image.open(src_path).convert('RGB')
        arr = np.array(img, dtype=np.float32)
        h, w, _ = arr.shape

        r = arr[:, :, 0]
        g = arr[:, :, 1]
        b = arr[:, :, 2]

        lum = 0.299 * r + 0.587 * g + 0.114 * b
        # Excess magenta metric: min(R - G, B - G)
        M = np.minimum(r - g, b - g)

        # =========================================================================
        # Stage 1: 全外周ペリメーター（4辺）からの動的背景距離サンプリング
        # =========================================================================
        perimeter_samples = []
        for x in range(0, w, 4):
            perimeter_samples.append(arr[0, x])
            perimeter_samples.append(arr[h - 1, x])
        for y in range(0, h, 4):
            perimeter_samples.append(arr[y, 0])
            perimeter_samples.append(arr[y, w - 1])
        perimeter_samples = np.array(perimeter_samples)
        # キャラが画像端に接していても体色を背景色として拾わないよう、マゼンタ系サンプルのみ採用
        sample_M = np.minimum(perimeter_samples[:, 0] - perimeter_samples[:, 1], perimeter_samples[:, 2] - perimeter_samples[:, 1])
        perimeter_samples = perimeter_samples[sample_M > 25.0]
        if len(perimeter_samples) == 0:
            perimeter_samples = np.array([[255.0, 0.0, 255.0]], dtype=np.float32)

        # 近傍ペリメーター背景色への最小ユークリッド色距離
        min_dist_to_bg = np.full((h, w), 9999.0, dtype=np.float32)
        chunk_size = h // 4
        for band in range(4):
            y0 = band * chunk_size
            y1 = (band + 1) * chunk_size if band < 3 else h
            sub_arr = arr[y0:y1]
            dists = np.sqrt(np.sum((sub_arr[:, :, None, :] - perimeter_samples[None, None, :, :]) ** 2, axis=3))
            min_dist_to_bg[y0:y1] = np.min(dists, axis=2)

        # =========================================================================
        # Stage 2: キャラクター部位の厳密な判定と保護マスク
        # =========================================================================
        # 1. 中立色・ハイライトディテール（マゼンタ過剰がない）
        is_neutral = (M < 16.0)

        # 2. 漆黒・暗色ディテール（体色・主線・影：輝度が低くマゼンタ突出が過剰でない）
        is_char_dark = (lum < 48.0) & (M < 26.0)

        # 3. 固有色（緑・黄・自然な革色など、GがRやBに対して正常に含まれている）
        is_natural_hue = (g >= r - 8.0) | (g >= b - 8.0)

        is_char_core = is_neutral | is_char_dark | is_natural_hue

        # =========================================================================
        # Stage 3: 外周背景 + 内部孤立ループ（触角・羽・脚の間）のマゼンタ透過
        #   判定は「背景色との色距離」と「連結性」のみで行う（紫・ピンク等の体色を巻き込まない）
        # =========================================================================
        # 同じ行の左右端の色から期待される背景色（縦方向グラデーション・床の濃淡に追従）との距離
        #   画像下部の暗い影の色が、体の暗い影を背景と誤認するのを防ぐ（全周最近傍だけでは区別できない）
        edge_w = 3
        left_c = arr[:, :edge_w].mean(axis=1)
        right_c = arr[:, w - edge_w:].mean(axis=1)

        def _row_ref(col):
            col_M = np.minimum(col[:, 0] - col[:, 1], col[:, 2] - col[:, 1])
            valid = col_M > 25.0
            if not valid.any():
                return None
            rows = np.arange(h)
            ref = np.stack([np.interp(rows, rows[valid], col[valid, c]) for c in range(3)], axis=1)
            # 行方向の移動平均でキャラ接触・ノイズの影響を緩和
            k = 9
            pad = np.pad(ref, ((k // 2, k // 2), (0, 0)), mode='edge')
            return np.stack([np.convolve(pad[:, c], np.ones(k) / k, mode='valid') for c in range(3)], axis=1)

        l_ref = _row_ref(left_c)
        r_ref = _row_ref(right_c)
        if l_ref is not None and r_ref is not None:
            t = np.linspace(0.0, 1.0, w)[None, :, None]
            row_ref = l_ref[:, None, :] * (1.0 - t) + r_ref[:, None, :] * t
            dist_row = np.sqrt(np.sum((arr - row_ref) ** 2, axis=2))
        else:
            dist_row = np.zeros((h, w), dtype=np.float32)

        # 背景色らしさ: ペリメーター背景色に近く、同じ行の背景色にも近く、かつマゼンタ成分がある
        bg_like = (~is_char_core) & (M > 18.0) & (min_dist_to_bg <= self.tolerance) & (dist_row <= self.row_tolerance)
        # 内部孤立ループ用の厳密判定（背景色にほぼ一致するもののみ）
        bg_strict = (~is_char_core) & (M > 28.0) & (min_dist_to_bg <= self.strict_tolerance)

        # 色連続性による拡張の対象: マゼンタ寄りで、体色保護に該当せず、背景色から極端に離れていない
        grow_ok = (~is_char_core) & (M > 18.0) & (min_dist_to_bg <= self.tolerance * self.grow_tolerance_scale)

        is_bg = np.zeros((h, w), dtype=bool)
        q = deque()

        # 外周4辺の背景シード
        for x in range(w):
            for y in [0, h - 1]:
                if bg_like[y, x] and not is_bg[y, x]:
                    is_bg[y, x] = True
                    q.append((y, x))
        for y in range(h):
            for x in [0, w - 1]:
                if bg_like[y, x] and not is_bg[y, x]:
                    is_bg[y, x] = True
                    q.append((y, x))

        # 外周からのフラッドフィル（背景色に近い連結領域のみ）
        while q:
            cy, cx = q.popleft()
            for dy, dx in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                ny, nx = cy + dy, cx + dx
                if 0 <= ny < h and 0 <= nx < w and not is_bg[ny, nx]:
                    if bg_like[ny, nx] and np.linalg.norm(arr[ny, nx] - arr[cy, cx]) <= self.edge_tolerance:
                        # 背景色に近くても、隣接ピクセルとの色差が大きい（=輪郭）場合は越えない（体の暗い影を巻き込まない）
                        is_bg[ny, nx] = True
                        q.append((ny, nx))
                    elif grow_ok[ny, nx] and np.linalg.norm(arr[ny, nx] - arr[cy, cx]) <= self.grad_tolerance:
                        # 地面の模様・影など背景色から外れた部分は、隣接ピクセルとの色連続性（なだらかさ）で背景側へ拡張
                        is_bg[ny, nx] = True
                        q.append((ny, nx))

        # 輪郭で止まった縁（アンチエイリアス部）の背景色にじみを、既存の背景から2px以内かつ背景色に近いものに限り回収
        for _ in range(2):
            near_bg = np.array(Image.fromarray(is_bg.astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(3))) > 0
            is_bg = is_bg | (near_bg & bg_like)

        # 内部孤立ループ（外周から塞がれた脚や触角の間）の背景検出
        # 背景色にほぼ一致する連結成分のうち、一定面積以上のものだけを透過（点状の誤検出を避ける）
        visited = is_bg.copy()
        for sy, sx in zip(*np.where(bg_strict & ~visited)):
            if visited[sy, sx]:
                continue
            comp = [(sy, sx)]
            visited[sy, sx] = True
            qi = 0
            while qi < len(comp):
                cy, cx = comp[qi]
                qi += 1
                for dy, dx in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                    ny, nx = cy + dy, cx + dx
                    if 0 <= ny < h and 0 <= nx < w and not visited[ny, nx] and bg_strict[ny, nx]:
                        visited[ny, nx] = True
                        comp.append((ny, nx))
            if len(comp) >= self.min_island_area:
                for cy, cx in comp:
                    is_bg[cy, cx] = True

        # =========================================================================
        # Stage 4: 足元・地面に広がるマゼンタ系の床影・暗紫の接地プールの消去
        #   画像高さに比例した足元領域で、かつ既に透過済みの背景に連結している影のみ対象
        # =========================================================================
        floor_h = max(24, int(h * 0.12))
        near_floor = np.arange(h)[:, None] > (h - floor_h)
        is_floor_cand = near_floor & (min_dist_to_bg <= self.shadow_dist) & (
            (g < 35) & (r > g + 20) & (b > g * 0.8) & (r > 30)
        ) & ~is_bg
        qs = deque()
        for sy, sx in zip(*np.where(is_bg)):
            qs.append((sy, sx))
        while qs:
            cy, cx = qs.popleft()
            for dy, dx in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                ny, nx = cy + dy, cx + dx
                if 0 <= ny < h and 0 <= nx < w and is_floor_cand[ny, nx] and not is_bg[ny, nx]:
                    is_bg[ny, nx] = True
                    qs.append((ny, nx))

        # 体の下などに残る紫の落ち影（背景に接する大きな紫の塊）の消去
        #   細い赤の縁取り・模様は面積が小さいため対象外（面積しきい値で区別）
        pool_cand = (~is_bg) & (~is_char_core) & (M > 22.0) & (lum < 130.0) & (min_dist_to_bg <= self.tolerance * 2.5)
        pool_seen = np.zeros((h, w), dtype=bool)
        for sy, sx in zip(*np.where(pool_cand)):
            if pool_seen[sy, sx]:
                continue
            comp = [(sy, sx)]
            pool_seen[sy, sx] = True
            touch_bg = False
            qi = 0
            while qi < len(comp):
                cy, cx = comp[qi]
                qi += 1
                for dy, dx in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                    ny, nx = cy + dy, cx + dx
                    if 0 <= ny < h and 0 <= nx < w:
                        if is_bg[ny, nx]:
                            touch_bg = True
                        elif pool_cand[ny, nx] and not pool_seen[ny, nx]:
                            pool_seen[ny, nx] = True
                            comp.append((ny, nx))
            if touch_bg and len(comp) >= self.pool_min_area:
                for cy, cx in comp:
                    is_bg[cy, cx] = True

        # 暗色保護（is_char_core）に入り込む、極めて暗い赤紫の接地影の帯（足元領域・背景に接する横長の塊のみ）
        #   体の暗部は無彩色寄りでこの色味にならず、かつ縦に厚いため、横長の帯条件で区別する
        strip_cand = (np.arange(h)[:, None] > h * 0.6) & (~is_bg) & (g < 12.0) & (r - g > 20.0) & (b - g > 15.0) & (lum < 60.0)
        strip_seen = np.zeros((h, w), dtype=bool)
        for sy, sx in zip(*np.where(strip_cand)):
            if strip_seen[sy, sx]:
                continue
            comp = [(sy, sx)]
            strip_seen[sy, sx] = True
            touch_bg = False
            qi = 0
            while qi < len(comp):
                cy, cx = comp[qi]
                qi += 1
                for dy, dx in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                    ny, nx = cy + dy, cx + dx
                    if 0 <= ny < h and 0 <= nx < w:
                        if is_bg[ny, nx]:
                            touch_bg = True
                        elif strip_cand[ny, nx] and not strip_seen[ny, nx]:
                            strip_seen[ny, nx] = True
                            comp.append((ny, nx))
            ys_c = [c[0] for c in comp]
            xs_c = [c[1] for c in comp]
            bw = max(xs_c) - min(xs_c) + 1
            bh = max(ys_c) - min(ys_c) + 1
            if touch_bg and len(comp) >= 200 and bw >= 2.5 * bh:
                for cy, cx in comp:
                    is_bg[cy, cx] = True

        # =========================================================================
        # Stage 5: キャラクター輪郭境界（外縁1〜2px）のデフリンジ（マゼンタ滲み除去）
        # =========================================================================
        if self.defringe_width > 0:
            bg_mask_u8 = (is_bg.astype(np.uint8)) * 255
            bg_img = Image.fromarray(bg_mask_u8)
            dilated_bg = np.array(bg_img.filter(ImageFilter.MaxFilter(self.defringe_width * 2 + 1))) > 0
            edge_zone = dilated_bg & (~is_bg)

            # 輪郭境界にマゼンタ系滲みが残っているピクセルのみ中立化
            fringe_pixels = edge_zone & (M > 12.0)
            gray_val = (r + g + b) / 3.0
            arr[:, :, 0] = np.where(fringe_pixels, np.minimum(r, np.maximum(g * 1.05, 30.0)), r)
            arr[:, :, 2] = np.where(fringe_pixels, np.minimum(b, np.minimum(g * 0.85, gray_val * 0.8)), b)

        # =========================================================================
        # Stage 6: 接地・画像サイズに合わせた自動バウンディングボックス・クロップ
        # =========================================================================
        out_arr = np.zeros((h, w, 4), dtype=np.uint8)
        out_arr[:, :, :3] = np.clip(arr, 0, 255).astype(np.uint8)
        out_arr[:, :, 3] = np.where(is_bg, 0, 255).astype(np.uint8)

        if crop_bottom:
            alpha = out_arr[:, :, 3]
            rows = np.where(alpha > 10)[0]
            cols = np.where(alpha > 10)[1]

            if len(rows) > 0 and len(cols) > 0:
                top = rows.min()
                bottom = rows.max() + 1
                left = cols.min()
                right = cols.max() + 1
                result_img = Image.fromarray(out_arr).crop((left, top, right, bottom))
            else:
                result_img = Image.fromarray(out_arr)
        else:
            result_img = Image.fromarray(out_arr)

        os.makedirs(os.path.dirname(os.path.abspath(dest_path)), exist_ok=True)
        result_img.save(dest_path, format="PNG")
        print(f"Processed: {src_path} -> {dest_path}")
        print(f"  Cropped Size: {result_img.size} (aspect ratio: {result_img.size[0]/result_img.size[1]:.3f})")
        return result_img.size

def process_image(src_path, dest_path=None, tolerance=48.0, defringe_width=2, crop_bottom=True, min_island_area=12):
    keyer = MagentaChromaKeyer(tolerance=tolerance, defringe_width=defringe_width, min_island_area=min_island_area)
    return keyer.process(src_path, dest_path=dest_path, crop_bottom=crop_bottom)

def main():
    parser = argparse.ArgumentParser(description="Multi-stage AI Magenta Background Chroma-Key & Auto-crop Tool")
    parser.add_argument("input", help="Path to input image")
    parser.add_argument("-o", "--output", help="Path to output PNG (default: overwrite input)")
    parser.add_argument("-t", "--tolerance", type=float, default=48.0, help="Color distance tolerance (default: 48.0)")
    parser.add_argument("--defringe-width", type=int, default=2, help="Defringe width in pixels (default: 2)")
    parser.add_argument("--min-island-area", type=int, default=12, help="Min pixel area of enclosed background islands to make transparent (default: 12). Raise for glossy bodies whose pink highlights get punched out")
    parser.add_argument("--no-crop", action="store_true", help="Do not crop transparent bounding box")

    args = parser.parse_args()
    process_image(
        args.input,
        dest_path=args.output,
        tolerance=args.tolerance,
        defringe_width=args.defringe_width,
        crop_bottom=not args.no_crop,
        min_island_area=args.min_island_area
    )

if __name__ == "__main__":
    main()
