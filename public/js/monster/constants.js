// 敵（Monster）の定数（索敵・隠密・被弾・死亡演出の時間配分）。Monster の本体と、行動の部品が、使う
// 隠密（索敵）仕様の定数
// ※ 索敵状態は「見える／見えない（描画）」の制御にのみ使う。移動・攻撃・射撃の AI は索敵状態に関係なく従来どおり距離で動く
export const SENSE_DEFAULT_RANGE = 10;   // 感知距離の既定値（enemies.json の senseRange 未指定時）
export const SENSE_DEFAULT_ANGLE = 70;   // 視野角（正面からの半角・度）の既定値（senseAngle 未指定時）
export const SENSE_NEAR_DIST = 2.0;      // この距離以内（かつ壁越しでない）なら視野角外でも即気づく
export const SENSE_DRAW_SCALE = 2.5;     // 未発見の敵を描画する距離（＝発見済みの維持範囲）= 感知距離 × この倍率 × 地形の視界係数
// 隠密性（stealth）: プレイヤーから見つけやすいかどうか。未発見の敵の描画距離に掛かる倍率
//   low=見つかりやすい / normal=標準 / high=見つかりにくい（発見済みでも遠くでは見えず、描画距離の手前で透明から徐々に見えてくる）
export const STEALTH_DRAW_MULT = { low: 1.4, normal: 1.0, high: 0.5 };
export const HIT_FLASH_TIME = 0.2;       // 被弾の色変化の長さ（秒）。最初の HIT_WHITE_TIME は白く光り、残りは赤みがかる
export const HIT_WHITE_TIME = 0.08;
export const APPEAR_FADE_TIME = 0.6;     // 敵が現れる／消えるときに、透明度が 0↔1 へ変化するのにかける時間（秒）。突然出てこず「フワッ」と現れる
export const STEALTH_FADE_BAND = 0.4;    // high の敵が透明から見えてくる範囲（描画距離の外側 40% 分）
export const LOST_TIME = 4.0;            // 追跡中に見失ってから未発見に戻るまでの時間（秒）

// 死亡演出の時間配分（秒）: 白フラッシュ → 横倒し → 半透明で消える
export const DEATH_FLASH_TIME = 0.1;
export const DEATH_FALL_END = 0.7;
export const DEATH_DURATION = 1.3;
