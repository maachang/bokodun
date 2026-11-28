// 話し声の効果音（街の人・店主などが話しているとき）。SoundFX のメソッド（public/js/audio.js が組み込む）。音声ファイルなし。
// 「ゼルダの伝説 リンクの冒険」の会話のように、文字が出るあいだ、1 文字ごとに、短い電子音（ピッ）を、一定の間隔で鳴らす。
// 音の高さは、文字ごとに少しずつ変わる（同じ音が続かない）。人ごとに基準の高さが違い（名前から決める）、誰が話しているかで声が違う。
// 句読点や空白の所では、少し間が空く。話し終わる（または別の人が話し始める）と、残りの音は止める。（草案・仮。間隔・音の高さ・音量）
//   playTalk(text, who)  : text の文字数ぶんの音を鳴らし始める（前の話し声は止める）。who は、名前（声の高さを決める）
//   stopTalk()           : 話し声を止める

const CHAR_SEC = 0.075;     // 1 文字の間隔（秒）
const PAUSE_SEC = 0.16;     // 句読点（、。！？…）で、追加で空ける間（秒）
const MAX_SEC = 4.0;        // 長いセリフでも、これ以上は鳴らさない
const BASES = [262, 294, 330, 349, 392, 440];   // 人ごとの基準の高さ（Hz）
const STEPS = [0, 2, 4, 7, 9, 12];              // 基準からの音の選び方（半音。ペンタトニック）

export const talkSounds = {
    // 名前から、基準の高さを決める（同じ人は、いつも同じ声）
    talkBaseFreq(who = '') {
        let h = 0;
        for (const ch of String(who)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
        return BASES[h % BASES.length];
    },

    playTalk(text, who = '') {
        this.stopTalk();
        if (!this.ctx || !text) return;
        const c = this.ctx, base = this.talkBaseFreq(who), blips = [];
        let t = c.currentTime + 0.03, last = -1;
        for (const ch of String(text)) {
            if (t - c.currentTime > MAX_SEC) break;
            if (/\s/.test(ch)) continue;
            if (/[、。！？!?…「」]/.test(ch)) { t += /[、。！？!?…]/.test(ch) ? PAUSE_SEC : 0; continue; }
            let k; do { k = Math.floor(Math.random() * STEPS.length); } while (k === last);   // 同じ音が続かない
            last = k;
            const o = c.createOscillator(), g = c.createGain();
            o.type = 'square'; o.frequency.setValueAtTime(base * Math.pow(2, STEPS[k] / 12), t);
            g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.045, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.055);
            o.connect(g); g.connect(c.destination);
            o.start(t); o.stop(t + 0.06);
            blips.push(o);
            t += CHAR_SEC;
        }
        this._talk = blips;
    },

    stopTalk() {
        for (const o of this._talk ?? []) { try { o.stop(); } catch { /* すでに止まっている・まだ始まっていない音 */ } }
        this._talk = null;
    }
};
