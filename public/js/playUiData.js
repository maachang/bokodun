// 通常プレイ画面の、見た目だけのダミーデータ（実データは、ゲームの組み立てが決まってから。js/playUi.js が使う）
// ---- ダミーデータ（実データは、ゲームの組み立てが決まってから） ----
export const MSG_SIZES = { s: ['小', '12px'], m: ['中', '16px'], l: ['大', '20px'] };   // メッセージ文字（会話・店のメニュー・立て札と住民のセリフの帯）の大きさ
export const prefs = { msg: 'm' };   // 設定（今は、画面を開いている間だけ有効。保存の仕組みは、あとで決める）
export const MENU = [['stock', 'ストック'], ['status', 'ステータス'], ['equip', '装備'], ['item', '道具'], ['setting', '設定'], ['account', 'アカウント'], ['help', 'ヘルプ']];
export const keymap = { stock: 'k', status: 'c', equip: 'g', item: 'i', setting: 'o', account: 'u', help: 'h' };   // 既定のショートカット（設定で変えられる）
export const EVENT = { name: '城下町の薬草集め', at: '2026/11/15 14:32', place: 'グリーン王国　城下町の宿屋（依頼主：宿屋の主人）', progress: '薬草 3 / 5', detail: '宿屋の主人に頼まれた。城下町の北の草原で薬草を 5 つ集めて、宿屋の主人に届ける。報酬は 200G。' };

