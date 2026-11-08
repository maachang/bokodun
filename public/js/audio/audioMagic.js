// 魔法・飛び道具・爆発の効果音。SoundFX のメソッド（public/js/audio.js が、クラスの定義のあとで、SoundFX へ組み込む）。
// 元は public/js/audio.js の SoundFX。移しただけで、動きは同じ（ファイルが長すぎて、編集の誤りが増えるため分割した）


export const magicSounds = {
    // ---- 呪文ごとの効果音（items.json の呪文の sound: fire / ice / bolt）----
    playSpellShoot(kind = 'fire') {
        if (kind === 'ice') this.playIceShoot();
        else if (kind === 'bolt') this.playBoltShoot();
        else this.playShoot(true);
    },

    playSpellHit(kind = 'fire') {
        if (kind === 'ice') this.playIceHit();
        else if (kind === 'bolt') this.playBoltHit();
        else this.playExplosion();
    },

    // 氷の発射「キラッ」: 高い音が澄んで上ずる
    playIceShoot() {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(1600, now);
        osc.frequency.exponentialRampToValueAtTime(2800, now + 0.12);
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.14);
    },

    // 氷の命中「キン」: 硬く澄んだ 2 音の響き
    playIceHit() {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        for (const freq of [2400, 3600]) {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now);
            gain.gain.setValueAtTime(0.16, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now);
            osc.stop(now + 0.25);
        }
    },

    // 雷（光弾）の発射「ピッ」: 高く短い
    playBoltShoot() {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(2800, now);
        osc.frequency.exponentialRampToValueAtTime(1800, now + 0.07);
        gain.gain.setValueAtTime(0.14, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.07);
    },

    // 雷（光弾）の命中「バチッ」: 鋭い電撃と短いノイズ
    playBoltHit() {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const oscGain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(1800, now);
        osc.frequency.exponentialRampToValueAtTime(200, now + 0.1);
        oscGain.gain.setValueAtTime(0.18, now);
        oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.connect(oscGain);
        oscGain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.1);

        const bufferSize = Math.floor(this.ctx.sampleRate * 0.08);
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.setValueAtTime(2500, now);
        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(0.2, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        noise.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(this.ctx.destination);
        noise.start(now);
    },

    // 落下の笛「ぴゅーーーん」: 高い音から低い音へ滑り落ちる（爆発火球の予告の長さ duration に合わせて鳴らす）
    playStrikeWhistle(duration = 0.3) {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const len = Math.max(0.2, duration);

        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(2400, now);
        osc.frequency.exponentialRampToValueAtTime(600, now + len);

        // ごく小さなビブラートで、笛のような揺らぎを付ける
        const lfo = this.ctx.createOscillator();
        const lfoGain = this.ctx.createGain();
        lfo.frequency.setValueAtTime(30, now);
        lfoGain.gain.setValueAtTime(40, now);
        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.22, now + 0.03);
        gain.gain.setValueAtTime(0.22, now + len * 0.8);
        gain.gain.exponentialRampToValueAtTime(0.001, now + len);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        lfo.start(now);
        osc.start(now);
        lfo.stop(now + len);
        osc.stop(now + len);
    },

    // 重い爆発音「ばーーん」: 鋭い衝撃 + 低い地鳴りの下降音 + 長く尾を引くノイズ
    playBigExplosion() {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;

        // 衝撃（一瞬の鋭い音）
        const crack = this.ctx.createOscillator();
        const crackGain = this.ctx.createGain();
        crack.type = 'square';
        crack.frequency.setValueAtTime(320, now);
        crack.frequency.exponentialRampToValueAtTime(50, now + 0.06);
        crackGain.gain.setValueAtTime(0.3, now);
        crackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
        crack.connect(crackGain);
        crackGain.connect(this.ctx.destination);
        crack.start(now);
        crack.stop(now + 0.06);

        // 低い地鳴り
        const boom = this.ctx.createOscillator();
        const boomGain = this.ctx.createGain();
        boom.type = 'sine';
        boom.frequency.setValueAtTime(140, now);
        boom.frequency.exponentialRampToValueAtTime(30, now + 0.8);
        boomGain.gain.setValueAtTime(0.5, now);
        boomGain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
        boom.connect(boomGain);
        boomGain.connect(this.ctx.destination);
        boom.start(now);
        boom.stop(now + 0.8);

        // 尾を引く爆風のノイズ
        const bufferSize = Math.floor(this.ctx.sampleRate * 0.9);
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1800, now);
        filter.frequency.exponentialRampToValueAtTime(60, now + 0.9);
        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(0.45, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
        noise.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(this.ctx.destination);
        noise.start(now);
    },

    playShoot(isPlayer = false) {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        if (isPlayer) {
            // High energy retro fireball shoot
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(880, now);
            osc.frequency.exponentialRampToValueAtTime(220, now + 0.18);
            gain.gain.setValueAtTime(0.22, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        } else {
            // Eerie enemy magic projectile
            osc.type = 'sine';
            osc.frequency.setValueAtTime(500, now);
            osc.frequency.exponentialRampToValueAtTime(140, now + 0.22);
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        }

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.22);
    },

    playBowShoot() {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        // 1. Bowstring release twang: high triangle snap quickly descending
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(110, now + 0.12);
        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.12);

        // 2. High-speed arrow whoosh
        const bufferSize = this.ctx.sampleRate * 0.14;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
        }
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(1600, now);
        filter.frequency.exponentialRampToValueAtTime(600, now + 0.14);
        filter.Q.value = 3.0;

        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(0.2, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

        noise.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(this.ctx.destination);
        noise.start(now);
    },

    playArrowHit() {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        // Solid wooden thud / impact sound
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(260, now);
        osc.frequency.exponentialRampToValueAtTime(60, now + 0.09);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.09);
    },

    playExplosion() {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        // White noise burst for impact / blast
        const bufferSize = this.ctx.sampleRate * 0.2;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(800, now);
        filter.frequency.exponentialRampToValueAtTime(80, now + 0.2);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.35, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);
        noise.start(now);
    },
};
