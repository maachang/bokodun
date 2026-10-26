#!/usr/bin/env python3
"""
chromakey_magenta.py

AI生成画像（マゼンタ背景）専用のマルチステージ自動透過・デフリンジ・接地クロップツール

【多段階パイプライン（Multi-stage Pipeline）設計】
Stage 1: (0, 0) 起点の基準カラー動的サンプリング（四隅平均でベースマゼンタ値を取得）
Stage 2: キャラクター部位の厳密な判定と保護
         - 茶・革靴（R > G > B, G >= 20, B < G）：靴底の革素材を保護
         - 暗色・主線ディテール（R<75, G<65, B<65, かつマゼンタ系の色相でない）
Stage 3: 外周背景 + キャラクター内部の隙間（骸骨の肋骨内など）のマゼンタ透過（色空間距離判定）
Stage 4: 足元・地面に広がるマゼンタ系の床影（Floor Shadow / Puddle）の完全消去
         - Gが低くRとBが突出したマゼンタ影、および底面の黒ずんだ接地影プールを消去
Stage 5: 透過後のキャラクター輪郭境界（外縁2〜3px）に残るマゼンタ色にじみ（カラーフリンジ）の自動中立化（デフリンジ）
Stage 6: 接地のための底辺フラッシュ・自動クロップ（足裏を正確にY=0へ配置）
"""

import sys
import os
import argparse
import numpy as np
from PIL import Image, ImageFilter

class MagentaChromaKeyer:
    def __init__(self, tolerance=65.0, defringe_width=3, shadow_tolerance=1.6):
        self.tolerance = tolerance
        self.defringe_width = defringe_width
        self.shadow_tolerance = shadow_tolerance

    def process(self, src_path, dest_path=None, crop_bottom=True):
        if not os.path.exists(src_path):
            raise FileNotFoundError(f"Source file not found: {src_path}")
        
        if dest_path is None:
            dest_path = src_path

        img = Image.open(src_path).convert('RGB')
        arr = np.array(img, dtype=np.float32)
        h, w, _ = arr.shape

        # =========================================================================
        # Stage 1: (0, 0) 起点の背景カラー動的サンプリング
        # =========================================================================
        corners = np.array([
            arr[0, 0],
            arr[0, w - 1],
            arr[h - 1, 0],
            arr[h - 1, w - 1]
        ])
        bg_ref = corners.mean(axis=0)

        # 全ピクセルと背景基準色とのユークリッド色空間距離
        diff = np.sqrt(np.sum((arr - bg_ref) ** 2, axis=2))

        r = arr[:, :, 0]
        g = arr[:, :, 1]
        b = arr[:, :, 2]

        # =========================================================================
        # Stage 2: キャラクター部位の厳密な判定と保護マスク
        # =========================================================================
        # 1. 靴底の革素材（R > G > B, G >= 20, B < G）：ブーツ底面を保護
        is_leather_boot = (r > g) & (g > b) & (g >= 20) & (b < g * 0.95)

        # 2. マゼンタ色相（RとBがGに対して突出している）の検出
        is_magenta_hue = (r > g + 20) & (b > g * 0.8)

        # 3. 足元・床面に落ちる暗いマゼンタ接地影プール
        #    底面付近（下部35px以内）で、Gが極小（G<20）かつB寄りの暗紫影、または床面の微小な黒溜まり
        near_floor = np.arange(h)[:, None] > (h - 35)
        is_floor_contact_shadow = near_floor & (
            ((g < 22) & (b > g * 0.8)) |
            ((r < 25) & (g < 20) & (b < 25))
        )

        # 4. キャラクター本体の暗色・主線ディテール（マゼンタ影や床面影プールでないもの）
        is_char_dark = (r < 75) & (g < 65) & (b < 65) & (~is_magenta_hue) & (~is_floor_contact_shadow)

        # =========================================================================
        # Stage 3 & 4: マゼンタ背景 + 内部の隙間 + 足元の床影の完全消去
        # =========================================================================
        # (0, 0) のカラー色を基準とし、一定の色距離以内のピクセルを透過色とする
        is_bg_direct = (diff <= self.tolerance)

        # マゼンタ床影（Gが低くRとBが突出した暗紫色影）
        is_magenta_floor_shadow = (g < 35) & (r > g + 25) & (b > g * 0.8) & (r > 35)

        # 統合背景マスク（キャラクターのブーツや暗色ディテールは保護）
        is_bg = ((is_bg_direct | is_magenta_floor_shadow | is_floor_contact_shadow) & (~is_char_dark) & (~is_leather_boot))

        # =========================================================================
        # Stage 5: キャラクター輪郭境界（外縁2〜3px）に残るマゼンタ色にじみの除去（デフリンジ）
        # =========================================================================
        if self.defringe_width > 0:
            bg_mask_u8 = (is_bg.astype(np.uint8)) * 255
            bg_img = Image.fromarray(bg_mask_u8)
            dilated_bg = np.array(bg_img.filter(ImageFilter.MaxFilter(self.defringe_width * 2 + 1))) > 0
            edge_zone = dilated_bg & (~is_bg)

            # 輪郭境界にマゼンタ系（R > G + 15 かつ B > G * 0.75）の色にじみが残っているピクセル
            fringe_pixels = edge_zone & (r > g + 15) & (b > g * 0.75) & (~is_char_dark)

            # デコンタミネーション（色の浄化）:
            gray_val = (r + g + b) / 3.0
            arr[:, :, 0] = np.where(fringe_pixels, np.minimum(r, np.maximum(g * 1.05, 40.0)), r)
            arr[:, :, 2] = np.where(fringe_pixels, np.minimum(b, np.minimum(g * 0.8, gray_val * 0.75)), b)

            # 輪郭最外縁で背景マゼンタとほぼ一致する薄いカスがあれば完全透過
            weak_edge_mag = edge_zone & (diff <= (self.tolerance * 1.25)) & (r > g + 30) & (b > g + 15) & (~is_char_dark)
            is_bg = is_bg | weak_edge_mag

        # =========================================================================
        # Stage 6: 接地のための底辺フラッシュ・自動クロップ
        # =========================================================================
        out_arr = np.zeros((h, w, 4), dtype=np.uint8)
        out_arr[:, :, :3] = np.clip(arr, 0, 255).astype(np.uint8)
        out_arr[:, :, 3] = np.where(is_bg, 0, 255)

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
        print(f"  Bg Ref at (0,0): RGB({bg_ref[0]:.1f}, {bg_ref[1]:.1f}, {bg_ref[2]:.1f}), Output Size: {result_img.size}")
        return result_img.size

def process_image(src_path, dest_path=None, tolerance=65.0, defringe_width=3, crop_bottom=True):
    keyer = MagentaChromaKeyer(tolerance=tolerance, defringe_width=defringe_width)
    return keyer.process(src_path, dest_path=dest_path, crop_bottom=crop_bottom)

def main():
    parser = argparse.ArgumentParser(description="Multi-stage AI Magenta Background Chroma-Key & Defringe Tool")
    parser.add_argument("input", help="Path to input image")
    parser.add_argument("-o", "--output", help="Path to output PNG (default: overwrite input)")
    parser.add_argument("-t", "--tolerance", type=float, default=65.0, help="Color distance tolerance (default: 65.0)")
    parser.add_argument("--defringe-width", type=int, default=3, help="Defringe width in pixels (default: 3)")
    parser.add_argument("--no-crop", action="store_true", help="Do not crop transparent bounding box")

    args = parser.parse_args()
    process_image(
        args.input,
        dest_path=args.output,
        tolerance=args.tolerance,
        defringe_width=args.defringe_width,
        crop_bottom=not args.no_crop
    )

if __name__ == "__main__":
    main()
