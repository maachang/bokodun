// 環境音（その場の空気の音。風・波・鳥・水滴・炎・ざわめきなど）。SoundFX のメソッド（public/js/audio.js が、SoundFX へ組み込む）。音声ファイルなし。
// 曲データ（public/data/ambience.json）を、Web Audio のコードで鳴らす（草案・仮。音の種類・間隔・音量）。BGM の下に、小さく流す。
//   beds   : 流れ続ける音。ノイズをフィルタに通して作る（風・波・炎・ざわめき）。lfo で、ゆっくり大きさと高さを揺らす（風の息・波の寄せ引き）
//   events : ときどき鳴る音。every [最短, 最長] 秒の間隔で、ランダムに鳴る（鳥・かもめ・水滴・鐘・金床・杯・話し声など）
//   setAmbienceTracks(def)   : ambience.json の中身を渡す（ゲームの起動時）
//   playAmbience(name)       : その環境音に切り替える（今の音は、ゆっくり消えて、新しい音がゆっくり入る）。同じなら何もしない
//   stopAmbience()           : ゆっくり消す
//   setAmbVolume(v) / setAmbEnabled(on) : 音量 0〜1・鳴らすか（どちらも、ブラウザに保存する）

const FADE_IN = 1.8, FADE_OUT = 1.5, TICK_MS = 250, LOOK_AHEAD = 0.5;
const rnd = (a, b) => a + Math.random() * (b - a);

export const ambienceSounds = {
    setAmbienceTracks(def) {
        this.ambDef = def;
        try { this.ambVolume ??= localStorage.getItem('bokodunAmbVolume') !== null ? Math.max(0, Math.min(1, Number(localStorage.getItem('bokodunAmbVolume')))) : (def?.volume ?? 0.5); } catch { this.ambVolume ??= def?.volume ?? 0.5; }
        try { this.ambEnabled ??= localStorage.getItem('bokodunAmbOn') !== '0'; } catch { this.ambEnabled ??= true; }   // 既定は ON
    },

    setAmbEnabled(on) {
        this.ambEnabled = !!on;
        try { localStorage.setItem('bokodunAmbOn', on ? '1' : '0'); } catch { /* 保存できなくても、切り替えは効く */ }
        if (!on) this._ambFadeOut();
        else if (this._ambWant) this.playAmbience(this._ambWant);
    },

    setAmbVolume(v) {
        this.ambVolume = Math.max(0, Math.min(1, v));
        try { localStorage.setItem('bokodunAmbVolume', String(this.ambVolume)); } catch { /* 保存できなくても、音量は変わる */ }
        const cur = this._amb;
        if (cur && this.ctx) { cur.master.gain.cancelScheduledValues(this.ctx.currentTime); cur.master.gain.setTargetAtTime(this.ambVolume * (cur.def.level ?? 1), this.ctx.currentTime, 0.1); }
    },

    playAmbience(name) {
        this._ambWant = name;   // ctx がまだ（最初の操作の前）でも、あとで鳴らせるように覚えておく
        const def = this.ambDef?.tracks?.[name];
        if (!this.ctx || !def || this.ambEnabled === false) return;
        if (this._amb?.name === name) return;
        this._ambFadeOut();
        const c = this.ctx, master = c.createGain();
        master.gain.setValueAtTime(0.0001, c.currentTime);
        master.gain.linearRampToValueAtTime(Math.max(0.0001, (this.ambVolume ?? 0.5) * (def.level ?? 1)), c.currentTime + FADE_IN);
        master.connect(c.destination);
        const st = { name, def, master, nodes: [], events: (def.events ?? []).map((e) => ({ e, next: c.currentTime + rnd(0.3, e.every?.[1] ?? 5) })), timer: null };
        for (const b of def.beds ?? []) this._ambBed(st, b);
        st.timer = setInterval(() => this._ambTick(st), TICK_MS);
        this._amb = st;
    },

    stopAmbience() { this._ambWant = null; this._ambFadeOut(); },

    _ambFadeOut() {
        const st = this._amb;
        if (!st || !this.ctx) return;
        this._amb = null;
        clearInterval(st.timer);
        const t = this.ctx.currentTime;
        st.master.gain.cancelScheduledValues(t);
        st.master.gain.setValueAtTime(Math.max(0.0001, st.master.gain.value), t);
        st.master.gain.linearRampToValueAtTime(0.0001, t + FADE_OUT);
        setTimeout(() => { for (const n of st.nodes) { try { n.stop(); } catch { /* すでに止まっている */ } } try { st.master.disconnect(); } catch { /* すでに外れている */ } }, (FADE_OUT + 0.5) * 1000);
    },

    _ambTick(st) {
        if (this._amb !== st || !this.ctx) return;
        const now = this.ctx.currentTime;
        for (const ev of st.events) {
            if (now + LOOK_AHEAD < ev.next) continue;
            this._ambEvent(st, ev.e.kind, ev.next < now ? now : ev.next, ev.e);
            ev.next = now + rnd(ev.e.every[0], ev.e.every[1]);
        }
    },

    _ambNoise() {
        const c = this.ctx;
        if (!this._ambNoiseBuf || this._ambNoiseBuf.ctx !== c) {
            const n = Math.floor(c.sampleRate * 2), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
            for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
            this._ambNoiseBuf = { ctx: c, buf: b };
        }
        return this._ambNoiseBuf.buf;
    },

    // 流れ続ける音: ノイズ → フィルタ → 大きさ。lfo で、ゆっくり揺らす（depth: 大きさの揺れ 0〜1・freqDepth: フィルタの高さの揺れ）
    _ambBed(st, b) {
        const c = this.ctx, src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
        src.buffer = this._ambNoise(); src.loop = true;
        f.type = b.filter ?? 'lowpass'; f.frequency.value = b.freq ?? 500; f.Q.value = b.q ?? 0.7;
        const depth = b.lfo?.depth ?? 0;
        g.gain.value = b.gain * (1 - depth * 0.5);
        src.connect(f); f.connect(g); g.connect(st.master);
        src.start(); st.nodes.push(src);
        if (b.lfo) {
            const lfo = c.createOscillator(); lfo.frequency.value = b.lfo.rate ?? 0.15;
            if (depth) { const lg = c.createGain(); lg.gain.value = b.gain * depth * 0.5; lfo.connect(lg); lg.connect(g.gain); }
            if (b.lfo.freqDepth) { const fg = c.createGain(); fg.gain.value = (b.freq ?? 500) * b.lfo.freqDepth; lfo.connect(fg); fg.connect(f.frequency); }
            lfo.start(); st.nodes.push(lfo);
        }
    },

    // 小さな部品: 正弦波などの 1 音（freq0 → freq1 へ滑る。長さ dur 秒。すぐ立ち上がり、指数で消える）
    _ambTone(st, t, { type = 'sine', f0, f1 = f0, dur = 0.1, gain = 0.05, lp = 0 }) {
        const c = this.ctx, o = c.createOscillator(), g = c.createGain();
        o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + Math.min(0.01, dur * 0.2)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        if (lp) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; o.connect(f); f.connect(g); } else o.connect(g);
        g.connect(st.master); o.start(t); o.stop(t + dur + 0.05);
    },

    // 小さな部品: ノイズの 1 つぶ（フィルタを通す。fs: 高さの動き [始め, 終わり]）
    _ambPuff(st, t, { filter = 'bandpass', freq = 1000, f1 = freq, q = 1, dur = 0.1, gain = 0.05, attack = 0.01 }) {
        const c = this.ctx, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
        s.buffer = this._ambNoise();
        f.type = filter; f.Q.value = q; f.frequency.setValueAtTime(freq, t); if (f1 !== freq) f.frequency.linearRampToValueAtTime(f1, t + dur);
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + Math.min(attack, dur * 0.5)); g.gain.linearRampToValueAtTime(0.0001, t + dur);
        s.connect(f); f.connect(g); g.connect(st.master); s.start(t, rnd(0, 1.5)); s.stop(t + dur + 0.05);
    },

    // ときどき鳴る音。kind ごとに、鳴らし方が違う（p.gain: 大きさ）
    _ambEvent(st, kind, t, p) {
        const g = p.gain ?? 0.05;
        switch (kind) {
            case 'chirp': {   // 小鳥: 短い高い音を、2〜4 つ、上へ滑らせる
                const n = 2 + Math.floor(Math.random() * 3), base = rnd(2200, 4400);
                for (let i = 0; i < n; i++) this._ambTone(st, t + i * rnd(0.09, 0.14), { f0: base * rnd(0.9, 1.1), f1: base * rnd(1.25, 1.6), dur: 0.07, gain: g });
                break;
            }
            case 'rustle': this._ambPuff(st, t, { filter: 'highpass', freq: 3000, dur: rnd(0.2, 0.5), gain: g * 0.6, attack: 0.08 }); break;   // 葉ずれ
            case 'gull': {    // かもめ: のこぎり波を、下へ滑らせる（2 声）
                for (let k = 0; k < 2; k++) this._ambTone(st, t + k * rnd(0.3, 0.45), { type: 'sawtooth', f0: rnd(950, 1200), f1: rnd(500, 650), dur: rnd(0.28, 0.4), gain: g, lp: 2600 });
                break;
            }
            case 'drip': {    // 水滴: 高い音が、急に下がる
                const f = rnd(900, 1700);
                this._ambTone(st, t, { f0: f, f1: f * 0.5, dur: 0.12, gain: g });
                this._ambTone(st, t + 0.05, { f0: f * 2, f1: f, dur: 0.09, gain: g * 0.3 });
                break;
            }
            case 'bell': {    // 遠い鐘: ずれた倍音を、長く響かせる
                const f = [262, 330, 392][Math.floor(Math.random() * 3)];
                for (const [m, lv, d] of [[1, 1, 4.0], [2.76, 0.45, 2.4], [5.4, 0.2, 1.2]]) this._ambTone(st, t, { f0: f * m, dur: d, gain: g * lv, lp: 3000 });
                break;
            }
            case 'crackle': {  // 炎のパチパチ
                const n = 2 + Math.floor(Math.random() * 4);
                for (let i = 0; i < n; i++) this._ambPuff(st, t + rnd(0, 0.5), { filter: 'highpass', freq: rnd(1200, 2800), dur: 0.025, gain: g * rnd(0.3, 1), attack: 0.002 });
                break;
            }
            case 'clink': {   // 杯・硬貨の触れ合う音
                const f = rnd(2600, 3400);
                this._ambTone(st, t, { f0: f, dur: 0.18, gain: g }); this._ambTone(st, t, { f0: f * 1.34, dur: 0.12, gain: g * 0.6 });
                break;
            }
            case 'hammer': {  // 金床を叩く: 鈍い打音と、金属の響き
                this._ambTone(st, t, { f0: 140, f1: 60, dur: 0.12, gain: g * 1.2 });
                for (const [m, lv, d] of [[1, 1, 0.6], [2.4, 0.5, 0.4], [4.1, 0.3, 0.25]]) this._ambTone(st, t + 0.005, { f0: 880 * m, dur: d, gain: g * 0.5 * lv });
                this._ambPuff(st, t, { filter: 'highpass', freq: 2000, dur: 0.03, gain: g * 0.6, attack: 0.002 });
                break;
            }
            case 'murmur': {  // 遠くの話し声: ノイズを、人の声の高さの帯域に通し、揺らす
                const d = rnd(0.5, 1.3), f = rnd(450, 1000);
                this._ambPuff(st, t, { filter: 'bandpass', freq: f, f1: f * rnd(0.8, 1.4), q: 2.2, dur: d, gain: g, attack: 0.18 });
                this._ambPuff(st, t + d * 0.3, { filter: 'bandpass', freq: f * 2.2, f1: f * 1.8, q: 3, dur: d * 0.6, gain: g * 0.5, attack: 0.12 });
                break;
            }
            case 'creak': this._ambTone(st, t, { type: 'sawtooth', f0: rnd(70, 95), f1: rnd(110, 150), dur: rnd(0.5, 0.9), gain: g, lp: 420 }); break;   // きしみ
            default: break;
        }
    }
};
