// 描画の設定（game.js とタイルの描画の、両方が使う）。値は game.js から再公開（export）している
// 木の足元の影（暗い緑の丸い板）を置くか。雪原などで目立つため、いったん、すべてなくした（true で、小さな木だけ、影が戻る。2 倍・3 倍の木は、noShadow で、いつも、影なし）
export const TREE_SHADOWS = true;
// 木の影の濃さ（地面の種類ごと。environment.floorType。明るい地面は薄く、目立ちすぎないように。ない種類は 1）
export const TREE_SHADOW_OPACITY = { snow: 0.5, tundra: 0.7, desert: 0.7, redEarth: 0.8 };

// テスト用: 走る速さ（Shift）の倍率。広い世界を、すばやく見て回るため。通常の速さに戻すときは 1 にする（歩く速さは、そのまま）
export const TEST_RUN_SPEED_SCALE = 5;

// 崖のよじ登り: 登れる高さ（段）・登るのにかかる時間（秒）・前を押し続けて始まるまでの時間（秒）
export const CLIMB_RISE = 2;
export const CLIMB_SEC = 2.0;
export const CLIMB_HOLD_SEC = 0.3;


// 隣のマップ（斜めの角を含む 8 方向）を、本物のマスで描く範囲（今のマップの端から何マスまでか）。地形は 48 マス・木や草や岩は 26 マス（霧の終わりは、約 21 マス）
// 方角（8 方向）: 向いている向き（player.angle。0 = 北（-z）・-π/2 = 東・π = 南・π/2 = 西）から、大体の方向の名前
export const COMPASS_NAMES = ['北', '北東', '東', '南東', '南', '南西', '西', '北西'];
export function compassDirection(angle) {
    const bearing = -angle;   // 北から時計回り
    const idx = Math.round(bearing / (Math.PI / 4));
    return COMPASS_NAMES[((idx % 8) + 8) % 8];
}

export const NEIGHBOR_TERRAIN_RANGE = 48;
export const NEIGHBOR_OBJECT_RANGE = 26;
export const NEIGHBOR_PLANT_RANGE = 10;   // 隣のマップの、草・花を描く範囲（端から。木・岩は NEIGHBOR_OBJECT_RANGE。遠くの小さな草は、見えにくいので、減らす）
export const CULL_CHUNK = 32;            // 木・草・花の板を、まとめて隠す区画の大きさ（ワールドの長さ。8 マス）

// 被弾リアクション（突進の命中時）の調整値
//   ヒットストップ: 命中した瞬間にゲームの時間を一瞬止める（秒）。重い武器・会心・撃破で長くなる
//   カメラの揺れ: 会心・撃破・重い武器の命中で、画面を短く揺らす（amp=揺れの大きさ、duration=秒）
// 斬撃エフェクトの強さ（SlashEffectSystem.spawn の power）: 会心・撃破で大きく・多くの火花になる
// 足音: 歩いた距離がこの値（ワールド単位）に達するたびに1回鳴らす
export const FOOTSTEP_STRIDE = 3.2;

export const EFFECT_POWER = { normal: 1.0, crit: 1.4, kill: 1.2 };
export const effectPower = (crit, killed) => (crit ? EFFECT_POWER.crit : EFFECT_POWER.normal) * (killed ? EFFECT_POWER.kill : 1);

export const HIT_FEEDBACK = {
    hitStop: { charge: 0.05, crit: 0.08, kill: 0.10, heavyBonus: 0.03, blast: 0.04 },
    shake: { amp: 0.08, duration: 0.15 }
};

export const SHOP_PAGE_SIZE = 6;   // 販売一覧の 1 画面あたりの件数
