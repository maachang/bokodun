// BGM（背景音楽）。SoundFX のメソッド（public/js/audio.js が、SoundFX へ組み込む）。音声ファイルなし。曲データ（public/data/bgm.json）を、
// Web Audio のコードで鳴らす（8 分音符ごとのステップ・シーケンサー。草案・仮）。曲の起伏（dynamics・小節ごとの音量）・動く低音・小節終わりのフィル・副旋律・撥弦の減衰・風・太鼓に対応。
//   setBgmTracks(def)   : bgm.json の中身を渡す（ゲームの起動時）
//   playBgm(name)       : その曲に切り替える（今の曲は、ゆっくり消えて、新しい曲がゆっくり入る）。同じ曲なら何もしない。ctx がまだなければ、あとで（音が使えるようになったとき）鳴らす
//   stopBgm()           : ゆっくり消す
//   setBgmVolume(v)     : 音量 0〜1（ブラウザに保存する）
//   setBgmEnabled(on)   : BGM を鳴らすか（設定のチェックボックス。ブラウザに保存する）。OFF の間も、場面の曲は覚えておき、ON に戻すと、いまの曲が鳴る

const NOTE_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const CHORD_IV = { '': [0, 4, 7], m: [0, 3, 7], 7: [0, 4, 7, 10], m7: [0, 3, 7, 10], dim: [0, 3, 6], sus4: [0, 5, 7] };
const LOOK_AHEAD = 0.3;   // 秒。このくらい先まで、音を予約しておく
const FADE_IN = 1.2, FADE_OUT = 1.0;

// 生楽器ふうの音色（草案・仮）。oscs: 重ねる波（mult: 周波数の倍率・detune: 音程のずれ[セント]・level: 大きさ）・lp: 低域フィルタの開き（音の高さの倍率。[始め, 終わり]）・swell: 開くまでの秒・attack: 最低限の立ち上がり・release: 余韻
export const TIMBRES = {
    strings: { oscs: [{ type: 'sawtooth', detune: -7 }, { type: 'sawtooth', detune: 7 }, { type: 'triangle', mult: 0.5, level: 0.7 }], lp: [2.2, 4.5], swell: 0.4, attack: 0.18, release: 0.3 },   // 弦: 2 本をずらして重ねる＋丸いフィルタ
    brass: { oscs: [{ type: 'sawtooth', detune: -4 }, { type: 'sawtooth', detune: 4 }], lp: [1.2, 5], swell: 0.08, attack: 0.05, release: 0.12, q: 1.1 },   // 金管（ホルン）: 音の頭は丸く、すぐ明るくなる
    flute: { oscs: [{ type: 'sine' }, { type: 'triangle', level: 0.22 }, { type: 'sine', mult: 2, level: 0.08 }], attack: 0.05, release: 0.12 },   // 笛: ほぼ正弦波＋かすかな倍音
    harp: { oscs: [{ type: 'triangle' }, { type: 'sine', mult: 2, level: 0.35 }, { type: 'sine', mult: 3, level: 0.12 }], release: 0.1 },   // ハープ・撥弦（decay と組み合わせる）
    cello: { oscs: [{ type: 'sawtooth' }, { type: 'sine', mult: 0.5, level: 0.8 }], lp: [3, 6], swell: 0.12, attack: 0.03, release: 0.12, q: 0.9 }   // 低弦・コントラバス
};

export function noteMidi(name) {   // 'E5' → 76、'G#5'・'Bb5' も可
    const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
    if (!m) return null;
    return (Number(m[3]) + 1) * 12 + NOTE_PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}
export const midiFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);

// 和音名（C・Am・Bb・E7・Cdim）→ 根音の高さ（C3 = 48 を基準）と、構成音（MIDI 番号）
export function chordNotes(name, octave = 3) {
    const m = /^([A-G])([#b]?)(m7|m|7|dim|sus4)?$/.exec(name);
    if (!m) return null;
    const root = (octave + 1) * 12 + NOTE_PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
    return { root, tones: CHORD_IV[m[3] ?? ''].map((i) => root + i) };
}

export const bgmSounds = {
    setBgmTracks(def) {
        this.bgmDef = def; this.bgmVolume ??= this._loadBgmVolume(def?.volume ?? 0.6);
        try { this.bgmEnabled ??= localStorage.getItem('bokodunBgmOn') !== '0'; } catch { this.bgmEnabled ??= true; }   // 既定は ON
    },

    setBgmEnabled(on) {
        this.bgmEnabled = !!on;
        try { localStorage.setItem('bokodunBgmOn', on ? '1' : '0'); } catch { /* 保存できなくても、切り替えは効く */ }
        if (!on) this._bgmFadeOut();
        else if (this._bgmWant) this.playBgm(this._bgmWant);
    },

    _loadBgmVolume(def) {
        try { const v = Number(localStorage.getItem('bokodunBgmVolume')); if (localStorage.getItem('bokodunBgmVolume') !== null && v >= 0 && v <= 1) return v; } catch { /* 保存できない環境は、既定の音量 */ }
        return def;
    },

    setBgmVolume(v) {
        this.bgmVolume = Math.max(0, Math.min(1, v));
        try { localStorage.setItem('bokodunBgmVolume', String(this.bgmVolume)); } catch { /* 保存できなくても、音量は変わる */ }
        const cur = this._bgm;
        if (cur && this.ctx) { cur.master.gain.cancelScheduledValues(this.ctx.currentTime); cur.master.gain.setTargetAtTime(this.bgmVolume, this.ctx.currentTime, 0.1); }
    },

    playBgm(name) {
        this._bgmWant = name;   // ctx がまだ（最初の操作の前）でも、あとで鳴らせるように覚えておく
        const def = this.bgmDef?.tracks?.[name];
        if (!this.ctx || !def || this.bgmEnabled === false) return;   // OFF の間は鳴らさない（曲は覚えておく）
        if (this._bgm?.name === name) return;
        this._bgmFadeOut();
        const c = this.ctx, master = c.createGain();
        master.gain.setValueAtTime(0.0001, c.currentTime);
        master.gain.linearRampToValueAtTime(Math.max(0.0001, this.bgmVolume ?? 0.6), c.currentTime + FADE_IN);
        master.connect(c.destination);
        const rev = this._bgmReverb();   // 残響（広い空間の響き）。曲が替わっても、前の曲の余韻は、自然に残る
        if (rev) master.connect(rev);
        const bus = c.createGain();   // 曲の起伏（dynamics）用。音量は、ここで小節ごとに変える
        bus.gain.setValueAtTime(def.dynamics?.[0] ?? 1, c.currentTime);
        bus.connect(master);
        const stepSec = 60 / def.bpm / 2;
        const st = { name, def, master, bus, step: 0, next: c.currentTime + 0.1, stepSec, melody: def.melody.trim().split(/\s+/), chords: def.chords.map((n) => chordNotes(n)), timer: null };
        st.timer = setInterval(() => this._bgmTick(st), 60);
        this._bgm = st;
        this._bgmTick(st);
    },

    // 残響（コンボルバー）: 減衰する雑音から作った、短いホールの響き。1 つを使い回す
    _bgmReverb() {
        const c = this.ctx;
        if (!c.createConvolver) return null;
        if (this._bgmRev?.ctx !== c) {
            const secs = 2.0, n = Math.floor(c.sampleRate * secs), buf = c.createBuffer(2, n, c.sampleRate);
            for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.6); }
            const conv = c.createConvolver(); conv.buffer = buf;
            const wet = c.createGain(); wet.gain.value = 0.32;
            conv.connect(wet); wet.connect(c.destination);
            this._bgmRev = { ctx: c, input: conv };
        }
        return this._bgmRev.input;
    },

    stopBgm() { this._bgmWant = null; this._bgmFadeOut(); },

    // 今の曲を、ゆっくり消す（スケジューラは止め、すでに予約した音は、フェードで聞こえなくなる）
    _bgmFadeOut() {
        const st = this._bgm;
        if (!st || !this.ctx) return;
        this._bgm = null;
        clearInterval(st.timer);
        const t = this.ctx.currentTime;
        st.master.gain.cancelScheduledValues(t);
        st.master.gain.setValueAtTime(Math.max(0.0001, st.master.gain.value), t);
        st.master.gain.linearRampToValueAtTime(0.0001, t + FADE_OUT);
        setTimeout(() => { try { st.master.disconnect(); } catch { /* すでに外れている */ } }, (FADE_OUT + 0.6) * 1000);
    },

    // 予約の進行: LOOK_AHEAD 秒先までのステップを、順に予約する
    _bgmTick(st) {
        if (this._bgm !== st || !this.ctx) return;
        const total = st.melody.length;
        let guard = 0;
        while (st.next < this.ctx.currentTime + LOOK_AHEAD && guard++ < 64) {
            this._bgmStep(st, st.step % total, st.next);
            st.step++; st.next += st.stepSec;
        }
    },

    _bgmStep(st, s, t) {
        const v = st.def.voices, bar = Math.floor(s / 8), pos = s % 8, chord = st.chords[bar], dur = st.stepSec;
        if (pos === 0 && st.def.dynamics) st.bus.gain.setTargetAtTime(st.def.dynamics[bar % st.def.dynamics.length] ?? 1, t, 0.25);   // 小節ごとの音量（盛り上がり・静まり）
        const hold = (list, i) => { let n = 1; while (list[(i + n) % list.length] === '-' && n < 16) n++; return n; };   // その音が続くステップ数
        // 旋律
        const tok = st.melody[s];
        if (v.lead && tok !== '-' && tok !== '.') {
            const m = noteMidi(tok);
            if (m != null) {
                const len = hold(st.melody, s) * dur;
                this._bgmTone(st, t, len * 0.98, midiFreq(m), v.lead);
                if (v.lead.harmony) this._bgmTone(st, t, len * 0.98, midiFreq(m + v.lead.harmony), { ...v.lead, gain: v.lead.gain * (v.lead.harmonyLevel ?? 0.6) });   // 平行の副旋律（半音の数。-4 なら長 3 度下）
                if (v.lead.echo) this._bgmTone(st, t + v.lead.echo.steps * dur, len * 0.98, midiFreq(m), { ...v.lead, gain: v.lead.gain * v.lead.echo.level });
            }
        }
        // 分散和音（pattern: 0〜3 が和音の何番目か。2 を超えたら、1 オクターブ上へ）
        if (v.arp) {
            const p = v.arp.pattern.split(' ')[pos];
            if (p !== '.' && p !== undefined) { const i = Number(p), tone = chord.tones[i % chord.tones.length] + 12 * ((v.arp.octave ?? 1) + Math.floor(i / chord.tones.length)); this._bgmTone(st, t, dur * (v.arp.len ?? 0.9), midiFreq(tone), { ...v.arp, attack: 0.005 }); }
        }
        // 和音を伸ばす（小節の頭）
        if (v.pad && pos === 0) for (const n of chord.tones) {
            this._bgmTone(st, t, dur * 8 * 0.98, midiFreq(n + 12 * (v.pad.octave ?? 0)), v.pad);
            if (v.pad.layer) this._bgmTone(st, t, dur * 8 * 0.98, midiFreq(n + 12 * ((v.pad.octave ?? 0) + 1)), { ...v.pad, type: v.pad.layer, gain: v.pad.gain * 0.6 });   // 厚み（オルガンや合唱のように）
        }
        // 風（砂漠・雪原など。ゆっくり揺れる雑音を、2 小節ごとに）
        if (v.wind && pos === 0 && bar % 2 === 0) this._bgmWind(st, t, dur * 16, v.wind);
        // 低音（R: 根音・5: 5 度上・3: 3 度上・8: 1 オクターブ上）
        if (v.bass) {
            const p = v.bass.pattern.split(' ')[pos];
            if (p === 'R' || p === '5' || p === '3' || p === '8') {
                const root = chord.root - 12;
                this._bgmTone(st, t, dur * (v.bass.len ?? 1), midiFreq(p === 'R' ? root : p === '5' ? root + 7 : p === '3' ? chord.tones[1] - 12 : root + 12), { ...v.bass, attack: 0.01 });
            }
        }
        // ドラム
        const d = v.drums;
        if (d) {
            if (d.kick?.[pos] === 'x') this._bgmKick(st, t, d.gain);
            if (d.snare?.[pos] === 'x') this._bgmNoise(st, t, 0.12, 'bandpass', 1800, d.gain * 1.2);
            if (d.hat?.[pos] === 'x') this._bgmNoise(st, t, 0.04, 'highpass', 7000, d.gain * 0.7);
            if (d.tom?.[pos] === 'x') this._bgmTom(st, t, d.gain);
            if (d.fill && bar % 4 === 3 && pos >= 5) {   // 4 小節ごとの終わりに、盛り上げの連打（fill: snare か tom）
                if (d.fill === 'tom') this._bgmTom(st, t, d.gain * 0.8); else this._bgmNoise(st, t, 0.09, 'bandpass', 1800, d.gain * (1 + (pos - 5) * 0.15));
            }
            if (d.clap?.[pos] === 'x') this._bgmNoise(st, t, 0.07, 'bandpass', 1100, d.gain * 1.1);
        }
    },

    // 1 つの音。type が TIMBRES にあれば、生楽器ふうの音（複数の波・フィルタ・立ち上がり）。なければ、単純な波形（sine・triangle・square・sawtooth）
    _bgmTone(st, t, dur, freq, { type = 'sine', gain = 0.1, attack = 0.01, vibrato = 0, decay = 0 } = {}) {
        const c = this.ctx, g = c.createGain(), tim = TIMBRES[type];
        const parts = (tim?.oscs ?? [{ type }]).map((p) => { const o = c.createOscillator(); o.type = p.type; o.frequency.setValueAtTime(freq * (p.mult ?? 1), t); if (p.detune) o.detune.value = p.detune; return { o, level: p.level ?? 1 }; });
        const a = Math.min(Math.max(attack, tim?.attack ?? 0), dur * 0.6), rel = tim?.release ?? 0.05;
        let into = g;
        if (tim?.lp) {   // 音色: 低域だけ通すフィルタ。音の立ち上がりで、少しずつ開く（金管・弦の「膨らみ」）
            const f = c.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = tim.q ?? 0.7;
            f.frequency.setValueAtTime(Math.min(freq * tim.lp[0], 9000), t); f.frequency.linearRampToValueAtTime(Math.min(freq * tim.lp[1], 9000), t + Math.max(a, 0.05) + (tim.swell ?? 0.1));
            f.connect(g); into = f;
        }
        for (const { o, level } of parts) {
            if (level !== 1) { const lv = c.createGain(); lv.gain.value = level; o.connect(lv); lv.connect(into); } else o.connect(into);
        }
        if (vibrato) {   // 音が伸びるあいだ、ゆらす（笛のような響き。生楽器は、音が出てから少し遅れて、ゆらぎが始まる）
            const lfo = c.createOscillator(), lg = c.createGain();
            lfo.frequency.value = vibrato;
            lg.gain.setValueAtTime(0.0001, t); lg.gain.linearRampToValueAtTime(freq * 0.006, t + (tim ? Math.min(0.25, dur * 0.5) : 0));
            lfo.connect(lg); for (const { o } of parts) lg.connect(o.frequency);
            lfo.start(t); lfo.stop(t + dur + 0.1 + rel);
        }
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(gain, t + a);
        let end;
        if (decay > 0) {   // 撥弦・鐘: 鳴らした直後から、指数で減衰する（音の長さは decay 秒まで）
            end = Math.max(dur, decay);
            g.gain.exponentialRampToValueAtTime(0.0001, t + a + decay);
        } else {
            end = dur;
            g.gain.setValueAtTime(gain, t + Math.max(a, dur - 0.06));
            g.gain.exponentialRampToValueAtTime(0.0001, t + dur + rel);
        }
        g.connect(st.bus);
        for (const { o } of parts) { o.start(t); o.stop(t + end + rel + 0.03); }
    },

    _bgmKick(st, t, gain) {
        const c = this.ctx, o = c.createOscillator(), g = c.createGain();
        o.type = 'sine'; o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.14);
        g.gain.setValueAtTime(gain * 2.2, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
        o.connect(g); g.connect(st.bus); o.start(t); o.stop(t + 0.2);
    },

    _bgmTom(st, t, gain) {   // 太鼓: キックより高く、長く響く
        const c = this.ctx, o = c.createOscillator(), g = c.createGain();
        o.type = 'sine'; o.frequency.setValueAtTime(190, t); o.frequency.exponentialRampToValueAtTime(70, t + 0.25);
        g.gain.setValueAtTime(gain * 2.4, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
        o.connect(g); g.connect(st.bus); o.start(t); o.stop(t + 0.34);
    },

    _bgmWind(st, t, dur, { freq = 500, gain = 0.05 } = {}) {   // 風: 雑音をフィルタに通し、音の高さと大きさを、ゆっくり揺らす
        const c = this.ctx;
        if (!this._bgmNoiseBuf) this._bgmNoise(st, t, 0.001, 'lowpass', 100, 0.0001);   // 雑音のバッファを作る（使い回す）
        const s = c.createBufferSource(); s.buffer = this._bgmNoiseBuf; s.loop = true;
        const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 0.8;
        f.frequency.setValueAtTime(freq * 0.7, t); f.frequency.linearRampToValueAtTime(freq * 1.3, t + dur * 0.5); f.frequency.linearRampToValueAtTime(freq * 0.7, t + dur);
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + dur * 0.5); g.gain.linearRampToValueAtTime(0.0001, t + dur);
        s.connect(f); f.connect(g); g.connect(st.bus); s.start(t); s.stop(t + dur + 0.05);
    },

    _bgmNoise(st, t, dur, type, freq, gain) {
        const c = this.ctx;
        if (!this._bgmNoiseBuf) { const n = Math.floor(c.sampleRate * 0.5), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; this._bgmNoiseBuf = b; }   // 使い回す
        const s = c.createBufferSource(); s.buffer = this._bgmNoiseBuf;
        const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq;
        const g = c.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        s.connect(f); f.connect(g); g.connect(st.bus); s.start(t); s.stop(t + dur + 0.02);
    }
};
