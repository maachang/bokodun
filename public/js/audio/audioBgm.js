// BGM（背景音楽）。SoundFX のメソッド（public/js/audio.js が、SoundFX へ組み込む）。音声ファイルなし。曲データ（public/data/bgm.json）を、
// Web Audio のコードで鳴らす（8 分音符ごとのステップ・シーケンサー。草案・仮）。
//   setBgmTracks(def)   : bgm.json の中身を渡す（ゲームの起動時）
//   playBgm(name)       : その曲に切り替える（今の曲は、ゆっくり消えて、新しい曲がゆっくり入る）。同じ曲なら何もしない。ctx がまだなければ、あとで（音が使えるようになったとき）鳴らす
//   stopBgm()           : ゆっくり消す
//   setBgmVolume(v)     : 音量 0〜1（ブラウザに保存する）
//   setBgmEnabled(on)   : BGM を鳴らすか（設定のチェックボックス。ブラウザに保存する）。OFF の間も、場面の曲は覚えておき、ON に戻すと、いまの曲が鳴る

const NOTE_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const CHORD_IV = { '': [0, 4, 7], m: [0, 3, 7], 7: [0, 4, 7, 10], m7: [0, 3, 7, 10], dim: [0, 3, 6], sus4: [0, 5, 7] };
const LOOK_AHEAD = 0.3;   // 秒。このくらい先まで、音を予約しておく
const FADE_IN = 1.2, FADE_OUT = 1.0;

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
        const stepSec = 60 / def.bpm / 2;
        const st = { name, def, master, step: 0, next: c.currentTime + 0.1, stepSec, melody: def.melody.trim().split(/\s+/), chords: def.chords.map((n) => chordNotes(n)), timer: null };
        st.timer = setInterval(() => this._bgmTick(st), 60);
        this._bgm = st;
        this._bgmTick(st);
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
        const hold = (list, i) => { let n = 1; while (list[(i + n) % list.length] === '-' && n < 16) n++; return n; };   // その音が続くステップ数
        // 旋律
        const tok = st.melody[s];
        if (v.lead && tok !== '-' && tok !== '.') {
            const m = noteMidi(tok);
            if (m != null) {
                const len = hold(st.melody, s) * dur;
                this._bgmTone(st, t, len * 0.98, midiFreq(m), v.lead);
                if (v.lead.echo) this._bgmTone(st, t + v.lead.echo.steps * dur, len * 0.98, midiFreq(m), { ...v.lead, gain: v.lead.gain * v.lead.echo.level });
            }
        }
        // 分散和音（pattern: 0〜3 が和音の何番目か。2 を超えたら、1 オクターブ上へ）
        if (v.arp) {
            const p = v.arp.pattern.split(' ')[pos];
            if (p !== '.' && p !== undefined) { const i = Number(p), tone = chord.tones[i % chord.tones.length] + 12 * ((v.arp.octave ?? 1) + Math.floor(i / chord.tones.length)); this._bgmTone(st, t, dur * (v.arp.len ?? 0.9), midiFreq(tone), { ...v.arp, attack: 0.005 }); }
        }
        // 和音を伸ばす（小節の頭）
        if (v.pad && pos === 0) for (const n of chord.tones) this._bgmTone(st, t, dur * 8 * 0.98, midiFreq(n + 12 * (v.pad.octave ?? 0)), v.pad);
        // 低音
        if (v.bass) {
            const p = v.bass.pattern.split(' ')[pos];
            if (p === 'R' || p === '5') this._bgmTone(st, t, dur * (v.bass.len ?? 1), midiFreq(chordNotes(st.def.chords[bar]).root - 12 + (p === '5' ? 7 : 0)), { ...v.bass, attack: 0.01 });
        }
        // ドラム
        const d = v.drums;
        if (d) {
            if (d.kick?.[pos] === 'x') this._bgmKick(st, t, d.gain);
            if (d.snare?.[pos] === 'x') this._bgmNoise(st, t, 0.12, 'bandpass', 1800, d.gain * 1.2);
            if (d.hat?.[pos] === 'x') this._bgmNoise(st, t, 0.04, 'highpass', 7000, d.gain * 0.7);
        }
    },

    _bgmTone(st, t, dur, freq, { type = 'sine', gain = 0.1, attack = 0.01, vibrato = 0 } = {}) {
        const c = this.ctx, o = c.createOscillator(), g = c.createGain();
        o.type = type; o.frequency.setValueAtTime(freq, t);
        let lfo = null;
        if (vibrato) {   // 音が伸びるあいだ、ゆらす（笛のような響き）
            lfo = c.createOscillator(); const lg = c.createGain();
            lfo.frequency.value = vibrato; lg.gain.value = freq * 0.006;
            lfo.connect(lg); lg.connect(o.frequency); lfo.start(t); lfo.stop(t + dur + 0.1);
        }
        const a = Math.min(attack, dur * 0.5);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(gain, t + a);
        g.gain.setValueAtTime(gain, t + Math.max(a, dur - 0.06));
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
        o.connect(g); g.connect(st.master);
        o.start(t); o.stop(t + dur + 0.08);
    },

    _bgmKick(st, t, gain) {
        const c = this.ctx, o = c.createOscillator(), g = c.createGain();
        o.type = 'sine'; o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.14);
        g.gain.setValueAtTime(gain * 2.2, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
        o.connect(g); g.connect(st.master); o.start(t); o.stop(t + 0.2);
    },

    _bgmNoise(st, t, dur, type, freq, gain) {
        const c = this.ctx;
        if (!this._bgmNoiseBuf) { const n = Math.floor(c.sampleRate * 0.5), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; this._bgmNoiseBuf = b; }   // 使い回す
        const s = c.createBufferSource(); s.buffer = this._bgmNoiseBuf;
        const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq;
        const g = c.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        s.connect(f); f.connect(g); g.connect(st.master); s.start(t); s.stop(t + dur + 0.02);
    }
};
