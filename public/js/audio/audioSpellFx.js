// 自分に使う魔法（回復・補助・解錠・罠解除）と、地鳴りの効果音。SoundFX のメソッド（public/js/audio.js が、SoundFX へ組み込む）。
// 画像・音声ファイルなし。Web Audio のコードだけで鳴らす（草案。音の高さ・長さ・強さは仮）。
//   playSelfSpell(kind): kind は items.json の呪文の sound。heal / heal_big / refresh / refresh_big / cure / cure_poison / recover /
//                         enchant / protect / speedy / fly / unlock / trap。知らない kind は、従来の「ふわっ」（playHeal）
//   playRumble(sec): 地鳴り（メテオ・アースクエイクの揺れのあいだ、低く震える）

export const spellFxSounds = {
    // 音の部品: 単音（freq→endFreq へ滑る）
    _tone(t, dur, freq, { type = 'sine', gain = 0.15, end = null, attack = 0.005 } = {}) {
        const c = this.ctx, o = c.createOscillator(), g = c.createGain();
        o.type = type;
        o.frequency.setValueAtTime(freq, t);
        if (end) o.frequency.exponentialRampToValueAtTime(end, t + dur);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(gain, t + attack);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        o.connect(g); g.connect(c.destination);
        o.start(t); o.stop(t + dur + 0.02);
    },

    // 音の部品: ノイズ（フィルターの周波数が from→to へ動く）
    _noise(t, dur, { type = 'bandpass', from = 800, to = 800, gain = 0.2, q = 1 } = {}) {
        const c = this.ctx, n = Math.max(1, Math.floor(c.sampleRate * dur));
        const buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
        for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
        const s = c.createBufferSource(); s.buffer = buf;
        const f = c.createBiquadFilter(); f.type = type; f.Q.value = q;
        f.frequency.setValueAtTime(from, t);
        if (to !== from) f.frequency.exponentialRampToValueAtTime(to, t + dur);
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(gain, t + Math.min(0.04, dur / 4));
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        s.connect(f); f.connect(g); g.connect(c.destination);
        s.start(t);
    },

    playSelfSpell(kind = 'heal') {
        if (!this.ctx) return;
        const fn = { heal: this._sndHeal, heal_big: this._sndHealBig, refresh: this._sndRefresh, refresh_big: this._sndRefreshBig, cure: this._sndCure, cure_poison: this._sndCurePoison,
            recover: this._sndRecover, enchant: this._sndEnchant, protect: this._sndProtect, speedy: this._sndSpeedy, fly: this._sndFly, unlock: this._sndUnlock, trap: this._sndTrap }[kind];
        if (fn) fn.call(this, this.ctx.currentTime); else this.playHeal();
    },

    // ヒール（小）: 澄んだ 3 音（従来）／ハイヒール（大）: 5 音が長く、きらめく
    _sndHeal(t) { [523.25, 659.25, 783.99].forEach((f, i) => this._tone(t + i * 0.07, 0.3, f, { gain: 0.16 })); },
    _sndHealBig(t) {
        [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => this._tone(t + i * 0.08, 0.55, f, { gain: 0.15 }));
        this._tone(t, 0.9, 261.63, { type: 'triangle', gain: 0.12 });   // 下に、柔らかい低音
        [2093, 2637, 3136].forEach((f, i) => this._tone(t + 0.35 + i * 0.07, 0.25, f, { gain: 0.05 }));   // きらめき
    },
    // リフレッシュ: 空気が通る「すーっ」と、軽い高音の粒
    _sndRefresh(t) {
        this._noise(t, 0.5, { type: 'bandpass', from: 500, to: 2800, gain: 0.12, q: 2 });
        [1318.5, 1568, 2093].forEach((f, i) => this._tone(t + 0.12 + i * 0.07, 0.22, f, { gain: 0.09 }));
    },
    _sndRefreshBig(t) {
        this._noise(t, 0.8, { type: 'bandpass', from: 400, to: 3600, gain: 0.16, q: 2 });
        this._tone(t, 0.7, 330, { type: 'triangle', gain: 0.1, end: 880 });
        [1318.5, 1568, 2093, 2637].forEach((f, i) => this._tone(t + 0.2 + i * 0.08, 0.35, f, { gain: 0.09 }));
    },
    // キュアー: やさしい 2 音のチャイム
    _sndCure(t) { [880, 1318.5].forEach((f, i) => this._tone(t + i * 0.12, 0.4, f, { type: 'triangle', gain: 0.13 })); },
    // キュアーポイズン: 「しゅわー」と毒が抜ける音が下がり、そのあと澄んだ音
    _sndCurePoison(t) {
        this._noise(t, 0.45, { type: 'highpass', from: 4000, to: 900, gain: 0.12, q: 0.8 });
        this._tone(t, 0.4, 330, { type: 'sawtooth', gain: 0.05, end: 110 });
        [783.99, 1046.5].forEach((f, i) => this._tone(t + 0.4 + i * 0.1, 0.35, f, { gain: 0.12 }));
    },
    // リカバリー: 温かい和音がいっせいに鳴り、上へ抜ける
    _sndRecover(t) {
        [261.63, 329.63, 392, 523.25].forEach((f) => this._tone(t, 1.0, f, { type: 'triangle', gain: 0.1 }));
        this._tone(t + 0.1, 0.8, 520, { gain: 0.1, end: 1560 });
        [1046.5, 1318.5, 1568].forEach((f, i) => this._tone(t + 0.45 + i * 0.09, 0.4, f, { gain: 0.08 }));
    },
    // エンチャント: 武器に力がみなぎる「ジャキーン」。刃の擦れるノイズと、上がる鋭い音
    _sndEnchant(t) {
        this._noise(t, 0.35, { type: 'bandpass', from: 1200, to: 6000, gain: 0.2, q: 3 });
        this._tone(t, 0.3, 220, { type: 'sawtooth', gain: 0.12, end: 880 });
        this._tone(t + 0.22, 0.6, 1760, { type: 'square', gain: 0.07 });
        this._tone(t + 0.22, 0.6, 2349, { gain: 0.06 });
    },
    // プロテクション: 重い盾の「ガーン」。低い響きと金属の余韻
    _sndProtect(t) {
        this._tone(t, 0.9, 110, { type: 'sine', gain: 0.3, end: 80 });
        this._tone(t, 0.7, 220, { type: 'triangle', gain: 0.18 });
        this._noise(t, 0.12, { type: 'highpass', from: 3000, to: 3000, gain: 0.18 });
        [880, 1318.5, 1760].forEach((f, i) => this._tone(t + 0.02 + i * 0.01, 0.9, f, { gain: 0.05 }));
    },
    // スピーディー: 風を切る「ヒュン」と、速い上昇音「ピピピッ」
    _sndSpeedy(t) {
        this._noise(t, 0.4, { type: 'bandpass', from: 300, to: 3500, gain: 0.18, q: 1.5 });
        [659.25, 783.99, 987.77, 1318.5].forEach((f, i) => this._tone(t + 0.15 + i * 0.045, 0.12, f, { type: 'square', gain: 0.07 }));
    },
    // フライ: ふわっと浮く。ゆるやかに上がる音に、軽い風と、羽のような高音
    _sndFly(t) {
        this._tone(t, 1.0, 260, { type: 'sine', gain: 0.14, end: 780 });
        this._tone(t, 1.0, 392, { type: 'triangle', gain: 0.07, end: 1170 });
        this._noise(t, 0.9, { type: 'lowpass', from: 300, to: 1800, gain: 0.08, q: 0.5 });
        [1760, 2349, 2637].forEach((f, i) => this._tone(t + 0.5 + i * 0.12, 0.35, f, { gain: 0.05 }));
    },
    // アンロック: 「カチャッ」と鍵が回り、「ジャラッ」と鍵束
    _sndUnlock(t) {
        [0, 0.09].forEach((d) => { this._noise(t + d, 0.04, { type: 'highpass', from: 2500, to: 2500, gain: 0.25 }); this._tone(t + d, 0.05, 1800, { type: 'square', gain: 0.07 }); });
        [2800, 3400, 2500, 3100, 3700].forEach((f, i) => this._tone(t + 0.22 + i * 0.045, 0.18, f, { gain: 0.06 }));
    },
    // トラップ: 「ガシャン」と金属が外れ、「プシュー」と力が抜ける
    _sndTrap(t) {
        this._noise(t, 0.08, { type: 'highpass', from: 2000, to: 2000, gain: 0.3 });
        this._tone(t, 0.18, 160, { type: 'square', gain: 0.16, end: 70 });
        this._tone(t + 0.03, 0.4, 2200, { gain: 0.04 });
        this._noise(t + 0.15, 0.5, { type: 'lowpass', from: 2500, to: 200, gain: 0.14, q: 0.7 });
    },

    // 地鳴り: 低い音が、sec 秒のあいだ震えながら小さくなる（画面の揺れに合わせる）
    playRumble(sec = 1.8) {
        if (!this.ctx) return;
        const c = this.ctx, t = c.currentTime;
        const o = c.createOscillator(), g = c.createGain(), lfo = c.createOscillator(), lg = c.createGain();
        o.type = 'sawtooth'; o.frequency.setValueAtTime(48, t); o.frequency.exponentialRampToValueAtTime(28, t + sec);
        lfo.type = 'sine'; lfo.frequency.value = 11; lg.gain.value = 0.05;   // 震え
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.22, t + 0.1); g.gain.exponentialRampToValueAtTime(0.001, t + sec);
        lfo.connect(lg); lg.connect(g.gain);
        o.connect(g); g.connect(c.destination);
        o.start(t); lfo.start(t); o.stop(t + sec + 0.05); lfo.stop(t + sec + 0.05);
        this._noise(t, sec, { type: 'lowpass', from: 220, to: 60, gain: 0.3, q: 0.7 });
    }
};
