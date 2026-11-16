// 通常プレイ画面の、見た目だけのダミーデータ（実データは、ゲームの組み立てが決まってから。js/playUi.js が使う）
// ---- ダミーデータ（実データは、ゲームの組み立てが決まってから） ----
export const WEAPONS = [['fists', '素手', '攻撃 1d3 / 重さ 0'], ['iron_sword', '鉄の剣', '攻撃 2d6+2 / 重さ 18'], ['iron_greatsword', '鉄の大剣', '攻撃 3d6+3 / 重さ 32'], ['dagger', '短剣', '攻撃 1d6+1 / 重さ 6'], ['short_bow', '短弓', '攻撃 1d8+2 / 重さ 10'], ['apprentice_staff', '見習いの杖', '魔法補正 +2 / 重さ 8']];
export const MAGICS = [['magic_bolt', 'マジックボルト', 'MP 5 / 威力 1d6+3 / 失敗 11%'], ['explosion', '爆発火球', 'MP 45 / 威力 4d6+5 / 失敗 28%'], ['fire', 'ファイア', 'MP 14 / 威力 2d6+3 / 失敗 19%'], ['heal', 'ヒール', 'MP 9 / 回復 / 失敗 8%'], ['spread', '拡散弾', 'MP 12 / 範囲 / 失敗 15%']];
export const stock = Array(9).fill(null);
stock[0] = { kind: 'weapon', id: 'iron_sword' }; stock[1] = { kind: 'weapon', id: 'dagger' };
stock[2] = { kind: 'weapon', id: 'fists' };   // 素手も、武器の 1 つ（素手の装備枠）
stock[3] = { kind: 'magic', id: 'magic_bolt' }; stock[4] = { kind: 'magic', id: 'fire' }; stock[5] = { kind: 'magic', id: 'explosion' };
export const MSG_SIZES = { s: ['小', '12px'], m: ['中', '13px'], l: ['大', '16px'] };   // メッセージ文字（会話・店のメニュー・立て札と住民のセリフの帯）の大きさ
export const prefs = { msg: 'm' };   // 設定（今は、画面を開いている間だけ有効。保存の仕組みは、あとで決める）
export const sel = { w: 0, m: 3 };   // 選択中の武器・魔法の枠
export const find = it => (it.kind === 'weapon' ? WEAPONS : MAGICS).find(x => x[0] === it.id);
export const MENU = [['stock', 'ストック'], ['status', 'ステータス'], ['equip', '装備'], ['item', '道具'], ['setting', '設定']];
export const keymap = { stock: 'k', status: 'c', equip: 'g', item: 'i', setting: 'o' };   // 既定のショートカット（設定で変えられる）
export const EVENT = { name: '城下町の薬草集め', at: '2026/11/15 14:32', place: 'グリーン王国　城下町の宿屋（依頼主：宿屋の主人）', progress: '薬草 3 / 5', detail: '宿屋の主人に頼まれた。城下町の北の草原で薬草を 5 つ集めて、宿屋の主人に届ける。報酬は 200G。' };
export const EQUIPS = [['兜', '鉄の兜', '防御 2d6+1 / 重さ 10', '頑丈な兜。重い装備（heavy）。'], ['鎧', '革の鎧', '防御 1d6+2 / 重さ 12', '軽い鎧。動きやすい。'], ['盾', '木の盾', '防御 1d6+1 / 重さ 6', '軽い盾。'], ['アクセサリ', null, '', '']];
export const ITEMS = [['薬草', '道具', 5, 'HP を少し回復する。'], ['毒消し', '道具', 2, '毒を治す。'], ['麻痺治し', '道具', 1, '麻痺を治す。'], ['復活の薬', '道具', 1, '戦闘不能から復活させる。'], ['革の鎧', '防具', 1, '軽い鎧。重さ 12。'], ['鉄の兜', '防具', 1, '頑丈な兜。重さ 10。'], ['木の盾', '防具', 1, '軽い盾。重さ 6。']];

