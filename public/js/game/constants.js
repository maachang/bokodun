// 描画の設定（game.js とタイルの描画の、両方が使う）。値は game.js から再公開（export）している
// 木の足元の影（暗い緑の丸い板）を置くか。雪原などで目立つため、いったん、すべてなくした（true で、小さな木だけ、影が戻る。2 倍・3 倍の木は、noShadow で、いつも、影なし）
export const TREE_SHADOWS = true;
// 木の影の濃さ（地面の種類ごと。environment.floorType。明るい地面は薄く、目立ちすぎないように。ない種類は 1）
export const TREE_SHADOW_OPACITY = { snow: 0.5, tundra: 0.7, desert: 0.7, redEarth: 0.8 };
